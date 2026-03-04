import { App, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { GeminiService } from '../geminiService';
import type MyPlugin from '../main';
import type { AgentLogView, FeedbackPromptResult } from '../agentLogView';
import { AgentSessionNote } from './agentSessionNote';
import { promptAgentConfirmation } from '../modals/agentConfirmModal';

export class InteractiveAgentService {
    private app: App;
    private plugin: MyPlugin;
    private gemini?: GeminiService;
    private logView?: AgentLogView;
    private sessionNote: AgentSessionNote;

    constructor(app: App, plugin: MyPlugin, goal: string, gemini?: GeminiService) {
        this.app = app;
        this.plugin = plugin;
        this.gemini = gemini;
        this.sessionNote = new AgentSessionNote(app, goal);
    }

    setLogView(view: AgentLogView) {
        this.logView = view;
    }

    private log(level: 'info' | 'warn' | 'error' | 'success', message: string) {
        console.log(`[Agent] ${message}`);
        if (this.logView) {
            this.logView.addLog(level, message);
        }
    }

    async run(): Promise<void> {
        const goal = this.sessionNote.getData().goal;
        this.log('info', `Starting interactive agent with goal: ${goal}`);
        new Notice(`対話型エージェント起動: ${goal}`);

        try {
            // Step 1: Create session note
            this.log('info', 'Creating session note...');
            const noteFile = await this.sessionNote.create();
            this.log('success', `Session note created: ${noteFile.path}`);

            // Open the note in a new leaf
            await this.openNote(noteFile);

            // Step 2: Generate plan
            this.log('info', 'Generating plan...');
            const plan = await this.generatePlan(goal);
            this.sessionNote.setPlan(plan);
            this.sessionNote.setStatus('waiting');
            await this.sessionNote.update();
            this.log('success', `Plan generated with ${plan.length} steps`);

            // Step 3: Confirm plan with user
            const planConfirm = await promptAgentConfirmation(
                this.app,
                `計画を生成しました（${plan.length}ステップ）。\n\nセッションノートで計画を確認・編集できます。\n続行しますか？`,
                false
            );

            if (!planConfirm || planConfirm.action === 'cancel') {
                this.log('warn', 'User cancelled');
                new Notice('キャンセルされました');
                return;
            }

            if (planConfirm.action === 'edit') {
                this.log('info', 'User requested to edit note');
                new Notice('ノートを編集してください。完了したら「Resume Agent」コマンドでセッションノートから再開してください。');
                return;
            }

            // Read potentially edited plan from note
            await this.sessionNote.readFromNote();
            const finalPlan = this.sessionNote.getData().plan;
            this.log('info', `Using plan with ${finalPlan.length} steps`);

            // Step 4: Execute plan step by step
            this.sessionNote.setStatus('executing');
            await this.sessionNote.update();

            const stepExecutionOptions = new Map<number, { stepInstruction?: string; deepDive?: boolean }>();

            for (let i = 0; i < finalPlan.length; i++) {
                const step = finalPlan[i];
                if (!step) continue;

                const stepNum = i + 1;
                this.sessionNote.setCurrentStep(stepNum);
                this.sessionNote.updateStepStatus(stepNum, 'running');
                await this.sessionNote.update();

                this.log('info', `Step ${stepNum}/${finalPlan.length}: ${step}`);
                new Notice(`ステップ ${stepNum}: ${step}`);

                // Execute step
                const executionOption = stepExecutionOptions.get(stepNum);
                const stepResult = await this.executeStep(step, goal, stepNum, executionOption);
                this.sessionNote.updateStepStatus(stepNum, 'running', stepResult.result, stepResult.inputRequired, stepResult.references);
                await this.sessionNote.update();

                this.log('info', `Step ${stepNum} execution completed, awaiting user approval`);

                // Ask user to confirm the step completed correctly
                let stepApproved = false;
                let stepRerunRequested = false;
                let stepDeepenRequested = false;
                let userFeedback: string | null = null;
                
                if (this.logView) {
                    const promptMessage = `ステップ ${stepNum} が実行されました。\n\n1) 次のタスクに進む（承認）\n2) タスク再実行（未承認）\n3) 再深掘り（ノート回答ベース）\n\n必要に応じて「📝 Your Answer」欄または下の入力欄に記入してください。`;
                    
                    const decision: FeedbackPromptResult = await this.logView.showFeedbackPrompt(promptMessage);
                    stepApproved = decision.action === 'continue';
                    stepRerunRequested = decision.action === 'rerun';
                    stepDeepenRequested = decision.action === 'deepen';
                    
                    // Re-read note to get the latest user input AFTER user clicks continue
                    this.log('info', 'Re-reading note to capture user edits...');
                    await this.sessionNote.readFromNote();
                    const latestEntry = this.sessionNote.getData().executionLog[stepNum - 1];
                    
                    // Check both note content and log view input
                    const noteAnswer = latestEntry?.userFeedback || null;
                    const logViewAnswer = decision.feedback && decision.feedback.trim() ? decision.feedback : null;
                    
                    // Prefer note answer if it exists, otherwise use log view answer
                    userFeedback = noteAnswer || logViewAnswer;
                    
                    this.log('info', `Note answer: ${noteAnswer ? noteAnswer.substring(0, 50) + '...' : 'none'}`);
                    this.log('info', `Log view answer: ${logViewAnswer ? logViewAnswer.substring(0, 50) + '...' : 'none'}`);
                    this.log('info', `Final feedback: ${userFeedback ? userFeedback.substring(0, 50) + '...' : 'none'}`);
                } else {
                    // Fallback to modal if no log view
                    const stepConfirm = await promptAgentConfirmation(
                        this.app,
                        `ステップ ${stepNum} が実行されました。\n\n結果をセッションノートで確認してください。\nこのステップは正しく完了していますか？`,
                        true
                    );

                    if (stepConfirm && (stepConfirm.action === 'continue' || stepConfirm.action === 'skip')) {
                        stepApproved = true;
                    } else if (!stepConfirm || stepConfirm.action === 'cancel') {
                        this.log('warn', 'User rejected step completion');
                        new Notice('ステップが承認されませんでした。実行を中断します。');
                        this.sessionNote.setStatus('waiting');
                        await this.sessionNote.update();
                        return;
                    } else if (stepConfirm.action === 'edit') {
                        this.log('info', 'User requested to edit note');
                        new Notice('ノートを編集してください。完了したら「Resume Agent」コマンドでセッションノートから再開してください。');
                        this.sessionNote.setStatus('waiting');
                        await this.sessionNote.update();
                        return;
                    }
                }

                if (stepRerunRequested || stepDeepenRequested) {
                    const instruction = userFeedback || undefined;
                    stepExecutionOptions.set(stepNum, {
                        stepInstruction: instruction,
                        deepDive: stepDeepenRequested,
                    });

                    const logEntry = this.sessionNote.getData().executionLog[stepNum - 1];
                    if (logEntry && instruction) {
                        logEntry.userFeedback = instruction;
                        await this.sessionNote.update();
                    }

                    this.log('info', stepDeepenRequested
                        ? `Step ${stepNum} deep-dive requested, re-running with user context`
                        : `Step ${stepNum} rerun requested, re-running with user context`);
                    new Notice(stepDeepenRequested
                        ? `ステップ ${stepNum} を再深掘りします`
                        : `ステップ ${stepNum} を再実行します`);
                    i--;
                    continue;
                }

                // If step was approved, mark it as completed
                if (stepApproved) {
                    stepExecutionOptions.delete(stepNum);
                    // Ensure userFeedback is saved to the log entry BEFORE updating status
                    const logEntry = this.sessionNote.getData().executionLog[stepNum - 1];
                    if (logEntry) {
                        if (userFeedback && userFeedback.trim()) {
                            logEntry.userFeedback = userFeedback;
                            this.log('info', `Saved user feedback to logEntry: ${userFeedback.substring(0, 50)}...`);
                        } else if (logEntry.userFeedback) {
                            this.log('info', `logEntry already has feedback: ${logEntry.userFeedback.substring(0, 50)}...`);
                        } else {
                            this.log('info', 'No user feedback to save');
                        }
                    }
                    
                    // Now update status - this should preserve the userFeedback we just set
                    this.sessionNote.updateStepStatus(stepNum, 'completed', stepResult.result, stepResult.inputRequired, stepResult.references);
                    
                    // Verify feedback is still there before saving
                    const verifyEntry = this.sessionNote.getData().executionLog[stepNum - 1];
                    this.log('info', `Before update: userFeedback = ${verifyEntry?.userFeedback ? verifyEntry.userFeedback.substring(0, 50) + '...' : 'empty'}`);
                    
                    await this.sessionNote.update();
                    
                    if (userFeedback && userFeedback.trim()) {
                        new Notice('✅ 回答を保存しました。セッションノートで確認できます。');
                    }
                    
                    this.log('success', `Step ${stepNum} approved and marked as completed`);
                } else {
                    // Step was not approved
                    this.log('warn', `Step ${stepNum} was not approved`);
                    new Notice('ステップが承認されませんでした。実行を中断します。');
                    this.sessionNote.setStatus('waiting');
                    await this.sessionNote.update();
                    return;
                }
            }

            // All steps completed
            this.sessionNote.setStatus('completed');
            await this.sessionNote.update();
            this.log('success', 'All steps completed ✓');
            new Notice('エージェント: 全てのステップが完了しました ✓');

        } catch (e) {
            this.log('error', `Error: ${e}`);
            this.sessionNote.setStatus('error');
            await this.sessionNote.update();
            new Notice(`エージェントエラー: ${e}`);
        }
    }

    private async generatePlan(goal: string): Promise<string[]> {
        this.log('info', `Planning with Gemini: ${!!this.gemini}`);
        if (this.gemini) {
            try {
                const prompt = `あなたはエージェントです。与えられたゴールを達成するための短い実行可能な手順を出してください。各ステップは1行で、番号や記号なしで記述してください。3〜6個のステップを出してください。ゴール: ${goal}`;
                this.log('info', 'Sending plan request to Gemini');
                const txt = await this.gemini.chat([{ role: 'user', content: prompt }]);
                this.log('info', `Gemini response: ${txt.substring(0, 100)}...`);
                // Parse lines and remove any leading numbers, symbols, or markdown formatting
                const lines = txt.split(/\r?\n/)
                    .map(l => l.trim())
                    .map(l => l.replace(/^[\d+\.\-\*]+\s*/g, '')) // Remove leading numbers, dots, dashes, asterisks
                    .map(l => l.replace(/^\*\*/g, '').replace(/\*\*$/g, '')) // Remove bold markdown
                    .filter(l => l && l.length > 3); // Filter empty lines and very short lines
                if (lines.length) {
                    this.log('success', `Using Gemini plan with ${lines.length} steps`);
                    return lines.slice(0, 6);
                }
            } catch (e) {
                this.log('warn', `Gemini plan failed: ${e}`);
                new Notice('Gemini計画生成失敗、フォールバックを使用します');
            }
        }

        // Fallback: naive plan
        this.log('info', 'Using fallback plan');
        return [
            `Search notes for "${goal}"`,
            `Summarize top results`,
            `Create a short todo list based on summary`,
        ];
    }

    private async executeStep(
        step: string,
        goal: string,
        stepNum: number,
        options?: { stepInstruction?: string; deepDive?: boolean }
    ): Promise<{ result: string; inputRequired?: string; references?: string[] }> {
        this.log('info', `Executing step: ${step}`);
        
        // Get context from all completed steps
        let completedStepsContext = '';
        if (stepNum > 1) {
            const executionLog = this.sessionNote.getData().executionLog;
            for (let i = 0; i < stepNum - 1; i++) {
                const logEntry = executionLog[i];
                if (logEntry && logEntry.status === 'completed') {
                    completedStepsContext += `\n\n【Step ${i + 1}: ${logEntry.step}】`;
                    if (logEntry.result) {
                        // Truncate very long results to avoid token overflow
                        const resultPreview = logEntry.result.length > 3000 
                            ? logEntry.result.substring(0, 3000) + '\n...(以下省略)'
                            : logEntry.result;
                        completedStepsContext += `\nGeminiの質問/回答:\n${resultPreview}`;
                    }
                    if (logEntry.userFeedback) {
                        // Truncate very long user feedback
                        const feedbackPreview = logEntry.userFeedback.length > 2000
                            ? logEntry.userFeedback.substring(0, 2000) + '\n...(以下省略)'
                            : logEntry.userFeedback;
                        completedStepsContext += `\n\nユーザーの回答:\n${feedbackPreview}`;
                    }
                }
            }
        }
        
        const currentStepInstruction = options?.stepInstruction?.trim()
            ? `\n\n【現在ステップへのユーザー指示/回答】\n${options.stepInstruction}\n`
            : '';
        const executionModeInstruction = options?.deepDive
            ? `\n\n【実行モード】\n通常回答ではなく、ユーザー回答を基に比較軸・判断材料・不足情報をさらに深掘りしてください。具体化と次アクションを増やしてください。\n`
            : '';

        try {
            if (/search/i.test(step)) {
                this.log('info', 'Action: search');
                const hits = await this.searchNotes(goal);
                this.log('success', `Search results: ${hits.length} files`);
                const result = `Found ${hits.length} files:\n${hits.map(f => `- ${f.path}`).join('\n')}`;
                new Notice(`検索結果: ${hits.length} 件`);
                return { result };
            } else if (/summariz/i.test(step) || /summary/i.test(step)) {
                this.log('info', 'Action: summarize');
                const hits = await this.searchNotes(goal);
                const first = hits[0];
                if (first) {
                    this.log('info', `Summarizing: ${first.path}`);
                    const summary = await this.summarizeFile(first);
                    this.log('success', `Summary: ${summary.substring(0, 100)}...`);
                    new Notice(`要約完了`);
                    return { result: `Summary of ${first.path}:\n\n${summary}` };
                } else {
                    this.log('warn', 'No files to summarize');
                    new Notice('要約対象のファイルがありません');
                    return { result: 'No files found to summarize' };
                }
            } else if (/create|task|todo/i.test(step)) {
                this.log('info', 'Action: create task');
                const hits = await this.searchNotes(goal);
                const first = hits[0];
                const based = first ? `Based on ${first.path}\n` : '';
                const body = `# Agent-generated TODOs for: ${goal}\n\n${based}- ${goal}`;
                const taskPath = await this.createTask(`Agent task - ${new Date().toISOString()}`, body);
                this.log('success', 'Task created');
                new Notice('ToDo を作成しました ✓');
                return { result: `Task created at: ${taskPath}` };
            } else {
                this.log('info', 'Action: generic/ask');
                if (this.gemini) {
                    this.log('info', `Asking Gemini how to execute: ${step}`);
                    const prompt = `【最終ゴール】\n${goal}${completedStepsContext}\n\n【現在のステップ】\n${step}${currentStepInstruction}${executionModeInstruction}\n\n上記の最終ゴールを達成するため、これまでのステップで得られた情報を十分に活用して、現在のステップを実行する方法を具体的に教えてください。既に収集済みの情報については再度質問しないでください。`;
                    const geminiResult = await this.gemini.chatWithMetadata([{ role: 'user', content: prompt }]);
                    const res = geminiResult.text;
                    const references = geminiResult.references;
                    this.log('info', `Gemini advice: ${res.substring(0, 100)}...`);
                    this.log('info', `References found: ${references.length} URLs`);
                    
                    // Extract input requirements from advice
                    const inputRequired = await this.extractInputRequirements(res, step);
                    
                    new Notice(`アドバイスを取得しました`);
                    return { result: `Gemini advice:\n\n${res}`, inputRequired: inputRequired || undefined, references };
                } else {
                    this.log('warn', `Skipping step (no Gemini): ${step}`);
                    new Notice(`スキップ: ${step}`);
                    return { result: `Skipped (no implementation)` };
                }
            }
        } catch (e) {
            this.log('error', `executeStep error: ${e}`);
            new Notice(`ステップエラー: ${e}`);
            return { result: `Error: ${e}` };
        }
    }

    private async searchNotes(query: string): Promise<TFile[]> {
        this.log('info', `Searching notes for: ${query}`);
        const files = this.app.vault.getMarkdownFiles();
        this.log('info', `Total markdown files: ${files.length}`);
        const out: TFile[] = [];
        const q = query.toLowerCase();
        for (const f of files) {
            try {
                const text = (await this.app.vault.read(f)).toLowerCase();
                if (f.path.toLowerCase().includes(q) || text.includes(q)) {
                    this.log('info', `Match found: ${f.path}`);
                    out.push(f);
                    if (out.length >= 5) break;
                }
            } catch (e) {
                this.log('warn', `Error reading file: ${f.path}`);
            }
        }
        this.log('info', `Search complete, found: ${out.length}`);
        return out;
    }

    private async summarizeFile(file: TFile): Promise<string> {
        const content = await this.app.vault.read(file);
        if (this.gemini) {
            try {
                const prompt = `以下のノートを200字程度で日本語で要約してください。\n\n${content}`;
                const res = await this.gemini.chat([{ role: 'user', content: prompt }]);
                return res;
            } catch (e) {
                this.log('warn', `summarize failed: ${e}`);
            }
        }
        return content.slice(0, 400).replace(/\n+/g, ' ');
    }

    private async createTask(title: string, body: string): Promise<string> {
        this.log('info', `Creating task: ${title}`);
        const safeTitle = title.replace(/[:\\/*?"<>|]/g, '-')
            .replace(/\s+/g, '_')
            .slice(0, 100);
        const path = `Agent Tasks/${safeTitle}.md`;
        this.log('info', `Task path: ${path}`);
        try {
            await this.ensureFolder('Agent Tasks');
            await this.app.vault.create(path, `# ${title}\n\n${body}`);
            this.log('success', `Task file created at: ${path}`);
            return path;
        } catch (e) {
            this.log('error', `createTask failed: ${e}`);
            throw e;
        }
    }

    private async ensureFolder(folder: string): Promise<void> {
        try {
            const abstractFile = this.app.vault.getAbstractFileByPath(folder);
            if (!abstractFile) {
                await this.app.vault.createFolder(folder);
            }
        } catch (e) {
            // Folder might already exist
        }
    }

    private async openNote(file: TFile): Promise<void> {
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.openFile(file);
    }

    private async extractInputRequirements(advice: string, step: string): Promise<string | null> {
        if (!this.gemini) return null;

        try {
            this.log('info', 'Extracting input requirements from advice');
            const prompt = `以下はあるタスクステップの実行アドバイスです。このアドバイスの中で、ユーザーが具体的に決定・入力すべき情報がある場合、それを箇条書きで3～5項目に整理してください。もし特に入力が必要ない場合は「入力不要」と答えてください。

現在のステップ：${step}

アドバイス内容：
${advice.substring(0, 1000)}

回答フォーマット：
【このステップで必要な情報】
1. 情報名: 説明とフォーマット例
2. 情報名: 説明とフォーマット例
...

または

入力不要`;

            const res = await this.gemini.chat([{ role: 'user', content: prompt }]);
            
            if (res && res.trim() && !res.includes('入力不要')) {
                this.log('info', 'Input requirements extracted');
                return `**【このステップで必要な情報】**\n\n${res}`;
            }
        } catch (e) {
            this.log('warn', `Failed to extract input requirements: ${e}`);
        }

        return null;
    }

    // Resume from an existing session note
    async resumeFromNote(sessionNote: AgentSessionNote): Promise<void> {
        this.sessionNote = sessionNote;
        const sessionData = this.sessionNote.getData();
        const goal = sessionData.goal;

        this.log('info', `Resuming session for goal: ${goal}`);
        this.log('info', `Current status: ${sessionData.status}, step: ${sessionData.currentStep}`);
        new Notice(`セッション再開: ${goal}`);

        try {
            // Ensure we have a plan
            if (sessionData.plan.length === 0) {
                this.log('warn', 'No plan found, generating new plan');
                const plan = await this.generatePlan(goal);
                this.sessionNote.setPlan(plan);
                await this.sessionNote.update();
            }

            const finalPlan = sessionData.plan;
            this.log('info', `Plan has ${finalPlan.length} steps`);

            // Determine starting step - find the first non-completed step
            let startStep = 1;
            
            for (let i = 0; i < sessionData.executionLog.length; i++) {
                const logEntry = sessionData.executionLog[i];
                this.log('info', `Step ${i + 1} status: ${logEntry ? logEntry.status : 'unknown'}`);
                
                if (!logEntry || logEntry.status === 'pending' || logEntry.status === 'running') {
                    startStep = i + 1;
                    break;
                }
                
                if (logEntry.status === 'completed') {
                    // This step is done, check next
                    if (i === sessionData.executionLog.length - 1) {
                        // This was the last step
                        startStep = i + 2; // Will be > finalPlan.length
                    }
                    continue;
                }
                
                if (logEntry.status === 'error') {
                    // Restart from error step
                    startStep = i + 1;
                    break;
                }
            }

            // If all steps completed
            if (startStep > finalPlan.length) {
                this.log('success', 'All steps already completed');
                new Notice('全ステップが既に完了しています');
                this.sessionNote.setStatus('completed');
                await this.sessionNote.update();
                return;
            }

            this.log('info', `Starting from step ${startStep}/${finalPlan.length}`);
            new Notice(`ステップ ${startStep}/${finalPlan.length} から再開します`);

            // Set status to executing
            this.sessionNote.setStatus('executing');
            await this.sessionNote.update();

            // Execute remaining steps
            const stepExecutionOptions = new Map<number, { stepInstruction?: string; deepDive?: boolean }>();
            for (let i = startStep - 1; i < finalPlan.length; i++) {
                const step = finalPlan[i];
                if (!step) continue;

                const stepNum = i + 1;
                this.sessionNote.setCurrentStep(stepNum);
                this.sessionNote.updateStepStatus(stepNum, 'running');
                await this.sessionNote.update();

                this.log('info', `Step ${stepNum}/${finalPlan.length}: ${step}`);
                new Notice(`ステップ ${stepNum}: ${step}`);

                // Execute step
                const executionOption = stepExecutionOptions.get(stepNum);
                const stepResult = await this.executeStep(step, goal, stepNum, executionOption);
                // Update with result but NOT completed status yet - wait for user confirmation
                this.sessionNote.updateStepStatus(stepNum, 'running', stepResult.result, stepResult.inputRequired, stepResult.references);
                await this.sessionNote.update();

                this.log('success', `Step ${stepNum} execution completed, awaiting user confirmation`);

                // Ask user for confirmation for every step (including the last step)
                let stepApproved = false;
                let stepRerunRequested = false;
                let stepDeepenRequested = false;
                let userFeedback: string | null = null;

                if (this.logView) {
                    const promptMessage = `ステップ ${stepNum} が実行されました。\n\n1) 次のタスクに進む（承認）\n2) タスク再実行（未承認）\n3) 再深掘り（ノート回答ベース）\n\n必要に応じて「📝 Your Answer」欄または下の入力欄に記入してください。`;
                    const decision: FeedbackPromptResult = await this.logView.showFeedbackPrompt(promptMessage);
                    stepApproved = decision.action === 'continue';
                    stepRerunRequested = decision.action === 'rerun';
                    stepDeepenRequested = decision.action === 'deepen';

                    // Re-read note to get the latest user input AFTER user clicks continue
                    this.log('info', 'Re-reading note to capture user edits...');
                    await this.sessionNote.readFromNote();
                    const latestEntry = this.sessionNote.getData().executionLog[stepNum - 1];

                    // Check both note content and log view input
                    const noteAnswer = latestEntry?.userFeedback || null;
                    const logViewAnswer = decision.feedback && decision.feedback.trim() ? decision.feedback : null;

                    // Prefer note answer if it exists, otherwise use log view answer
                    userFeedback = noteAnswer || logViewAnswer;

                    this.log('info', `Note answer: ${noteAnswer ? noteAnswer.substring(0, 50) + '...' : 'none'}`);
                    this.log('info', `Log view answer: ${logViewAnswer ? logViewAnswer.substring(0, 50) + '...' : 'none'}`);
                    this.log('info', `Final feedback: ${userFeedback ? userFeedback.substring(0, 50) + '...' : 'none'}`);
                } else {
                    // Fallback to modal if no log view
                    const stepConfirm = await promptAgentConfirmation(
                        this.app,
                        `ステップ ${stepNum} が実行されました。\n\n結果をセッションノートで確認してください。\nこのステップは正しく完了していますか？`,
                        true
                    );

                    if (stepConfirm && (stepConfirm.action === 'continue' || stepConfirm.action === 'skip')) {
                        stepApproved = true;
                        if (stepConfirm.action === 'skip') {
                            this.log('warn', `Step ${stepNum} skipped by user`);
                            new Notice('このステップをスキップします');
                        }
                    } else if (!stepConfirm || stepConfirm.action === 'cancel') {
                        this.log('warn', 'User cancelled');
                        new Notice('中断しました。「Resume Agent」コマンドで再開できます。');
                        this.sessionNote.setStatus('waiting');
                        await this.sessionNote.update();
                        return;
                    } else if (stepConfirm.action === 'edit') {
                        this.log('info', 'User requested to edit note');
                        new Notice('ノートを編集してください。完了したら「Resume Agent」コマンドで再開してください。');
                        this.sessionNote.setStatus('waiting');
                        await this.sessionNote.update();
                        return;
                    }

                    userFeedback = stepConfirm?.feedback || null;
                }

                if (stepRerunRequested || stepDeepenRequested) {
                    const instruction = userFeedback || undefined;
                    stepExecutionOptions.set(stepNum, {
                        stepInstruction: instruction,
                        deepDive: stepDeepenRequested,
                    });

                    const logEntry = this.sessionNote.getData().executionLog[stepNum - 1];
                    if (logEntry && instruction) {
                        logEntry.userFeedback = instruction;
                        await this.sessionNote.update();
                    }

                    this.log('info', stepDeepenRequested
                        ? `Step ${stepNum} deep-dive requested, re-running with user context`
                        : `Step ${stepNum} rerun requested, re-running with user context`);
                    new Notice(stepDeepenRequested
                        ? `ステップ ${stepNum} を再深掘りします`
                        : `ステップ ${stepNum} を再実行します`);
                    i--;
                    continue;
                }

                if (!stepApproved) {
                    this.log('warn', `Step ${stepNum} was not approved`);
                    new Notice('ステップが承認されませんでした。実行を中断します。');
                    this.sessionNote.setStatus('waiting');
                    await this.sessionNote.update();
                    return;
                }

                stepExecutionOptions.delete(stepNum);

                // Ensure userFeedback is saved to the log entry BEFORE updating status
                const logEntry = this.sessionNote.getData().executionLog[stepNum - 1];
                if (logEntry) {
                    if (userFeedback && userFeedback.trim()) {
                        logEntry.userFeedback = userFeedback;
                        this.log('info', `Saved user feedback to logEntry: ${userFeedback.substring(0, 50)}...`);
                    } else if (logEntry.userFeedback) {
                        this.log('info', `logEntry already has feedback: ${logEntry.userFeedback.substring(0, 50)}...`);
                    } else {
                        this.log('info', 'No user feedback to save');
                    }
                }

                // Mark this step as completed now that we have user confirmation
                this.sessionNote.updateStepStatus(stepNum, 'completed', stepResult.result, stepResult.inputRequired);

                // Verify feedback is still there before saving
                const verifyEntry = this.sessionNote.getData().executionLog[stepNum - 1];
                this.log('info', `Before update: userFeedback = ${verifyEntry?.userFeedback ? verifyEntry.userFeedback.substring(0, 50) + '...' : 'empty'}`);

                await this.sessionNote.update();

                if (userFeedback && userFeedback.trim()) {
                    new Notice('✅ 回答を保存しました。セッションノートで確認できます。');
                }
            }

            // Mark session completed only if all steps are actually completed
            const allCompleted = this.sessionNote
                .getData()
                .executionLog
                .every(entry => entry.status === 'completed');

            if (allCompleted) {
                this.sessionNote.setStatus('completed');
                await this.sessionNote.update();
                this.log('success', 'All steps completed ✓');
                new Notice('エージェント: 全てのステップが完了しました ✓');
            } else {
                this.sessionNote.setStatus('waiting');
                await this.sessionNote.update();
                this.log('warn', 'Session paused: some steps are not completed yet');
                new Notice('未完了のステップがあります。Resume Agent で再開してください。');
            }

        } catch (e) {
            this.log('error', `Error: ${e}`);
            this.sessionNote.setStatus('error');
            await this.sessionNote.update();
            new Notice(`エージェントエラー: ${e}`);
        }
    }
}

export default InteractiveAgentService;
