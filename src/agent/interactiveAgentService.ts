import { App, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { GeminiService } from '../geminiService';
import type MyPlugin from '../main';
import type { AgentLogView, FeedbackPromptResult } from '../agentLogView';
import { AgentSessionNote } from './agentSessionNote';
import { promptAgentConfirmation } from '../modals/agentConfirmModal';
import { promptForStepExecution } from '../modals/stepExecuteModal';
import { FolderAccessControl } from '../folderAccessControl';
import { AgentTemplateService, AgentTemplate } from './agentTemplateService';
import { AgentTools } from './agentTools';

export class InteractiveAgentService {
    private app: App;
    private plugin: MyPlugin;
    private gemini?: GeminiService;
    private logView?: AgentLogView;
    private sessionNote: AgentSessionNote;
    private interactive: boolean;
    private accessControl: FolderAccessControl;
    private templatePath?: string;
    private loadedTemplate?: AgentTemplate;
    private templateService: AgentTemplateService;
    private templateReferenceNoteContents: Record<string, string> = {};
    private agentTools: AgentTools;

    constructor(app: App, plugin: MyPlugin, goal: string, gemini?: GeminiService, interactive: boolean = true, templatePath?: string) {
        this.app = app;
        this.plugin = plugin;
        this.gemini = gemini;
        this.sessionNote = new AgentSessionNote(app, goal);
        this.interactive = interactive;
        this.accessControl = new FolderAccessControl(plugin.settings);
        this.templatePath = templatePath;
        this.templateService = new AgentTemplateService(app);
        this.agentTools = new AgentTools(
            app,
            gemini || null,
            this.accessControl,
            (title, body) => this.createTask(title, body)
        );
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
        const modeLabel = this.interactive ? '対話型' : '自動';
        this.log('info', `Starting ${modeLabel} agent with goal: ${goal}`);
        new Notice(`${modeLabel}エージェント起動: ${goal}`);

        try {
            // Step 0: Load template if specified
            if (this.templatePath) {
                this.log('info', `Loading template: ${this.templatePath}`);
                try {
                    this.loadedTemplate = await this.templateService.loadTemplate(this.templatePath);

                    const referencedNoteNames = Array.from(
                        new Set([
                            ...this.loadedTemplate.notesList,
                            ...this.loadedTemplate.referenceNotes,
                        ])
                    );
                    this.templateReferenceNoteContents = await this.templateService.loadReferenceNoteContents(referencedNoteNames);

                    this.log('success', `Template loaded successfully (reference notes: ${Object.keys(this.templateReferenceNoteContents).length})`);
                } catch (e) {
                    this.log('warn', `Failed to load template: ${e}`);
                    new Notice(`テンプレート読み込み失敗: ${e}`);
                }
            }

            this.sessionNote.setTemplateReference(this.loadedTemplate?.templatePath);

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
            this.sessionNote.setStatus(this.interactive ? 'waiting' : 'executing');
            await this.sessionNote.update();
            this.log('success', `Plan generated with ${plan.length} steps`);

            // Step 3: Confirm plan with user (only in interactive mode)
            if (this.interactive) {
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
            }
            
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
                const executionOption = stepExecutionOptions.get(stepNum);
                this.sessionNote.setCurrentStep(stepNum);
                this.sessionNote.setStepReferencedInstructions(
                    stepNum,
                    this.buildStepReferencedInstructions(step, executionOption)
                );
                this.sessionNote.updateStepStatus(stepNum, 'running');
                await this.sessionNote.update();

                this.log('info', `Step ${stepNum}/${finalPlan.length}: ${step}`);
                new Notice(`ステップ ${stepNum}: ${step}`);

                // Execute step
                const stepResult = await this.executeStep(step, goal, stepNum, executionOption);
                this.sessionNote.updateStepStatus(stepNum, 'running', stepResult.result, stepResult.inputRequired, stepResult.references);
                await this.sessionNote.update();

                this.log('info', `Step ${stepNum} execution completed`);

                // Ask user to confirm the step completed correctly (only in interactive mode)
                let stepApproved = !this.interactive; // Auto-approve in non-interactive mode
                let stepRerunRequested = false;
                let stepDeepenRequested = false;
                let userFeedback: string | null = null;
                
                if (this.interactive) {
                    this.log('info', 'Awaiting user approval...');
                    
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

                        userFeedback = stepConfirm?.feedback || null;
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

                if (!stepApproved) {
                    // Step was not approved (only happens in interactive mode)
                    this.log('warn', `Step ${stepNum} was not approved`);
                    new Notice('ステップが承認されませんでした。実行を中断します。');
                    this.sessionNote.setStatus('waiting');
                    await this.sessionNote.update();
                    return;
                }

                // Step was approved, mark it as completed
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

    private buildStepReferencedInstructions(
        step: string,
        options?: { stepInstruction?: string; deepDive?: boolean }
    ): string[] {
        const instructions: string[] = [];

        instructions.push(`現在のステップ: ${step}`);

        if (this.loadedTemplate) {
            if (this.loadedTemplate.approach.trim()) {
                instructions.push(`課題整理の進め方（抜粋）: ${this.toExcerpt(this.loadedTemplate.approach, 180)}`);
            }
            if (this.loadedTemplate.definition.trim()) {
                instructions.push(`課題の定義（抜粋）: ${this.toExcerpt(this.loadedTemplate.definition, 180)}`);
            }
            if (this.loadedTemplate.recordingMethod.trim()) {
                instructions.push(`課題の記載方法（抜粋）: ${this.toExcerpt(this.loadedTemplate.recordingMethod, 180)}`);
            }

            const noteContents = Object.values(this.templateReferenceNoteContents)
                .map((content) => this.toExcerpt(content, 240))
                .filter((content) => content.length > 0)
                .slice(0, 3);

            if (noteContents.length > 0) {
                noteContents.forEach((content, idx) => {
                    instructions.push(`参考ノート内容${idx + 1}: ${content}`);
                });
            } else {
                instructions.push('参考ノート内容: なし（参照ノート未設定または未取得）');
            }
        } else {
            instructions.push('テンプレート項目: なし（テンプレート未使用）');
        }

        if (options?.deepDive) {
            instructions.push('実行モード: 再深掘り（ユーザー回答ベース）');
        }

        if (options?.stepInstruction?.trim()) {
            const preview = options.stepInstruction.trim();
            const truncated = preview.length > 120 ? `${preview.substring(0, 120)}...` : preview;
            instructions.push(`ユーザー追加指示: ${truncated}`);
        }

        return instructions;
    }

    private toExcerpt(text: string, maxLength: number): string {
        const normalized = text
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (normalized.length <= maxLength) {
            return normalized;
        }

        return `${normalized.slice(0, maxLength)}...`;
    }

    private async generatePlan(goal: string): Promise<string[]> {
        this.log('info', `Planning with Gemini: ${!!this.gemini}`);
        if (this.gemini) {
            try {
                // Prepare template context if available
                let templateContext = '';
                if (this.loadedTemplate) {
                    templateContext = '\n\n【テンプレート情報】\n' + 
                        this.templateService.formatAsSystemPrompt(this.loadedTemplate);
                }

                const prompt = `あなたはエージェントです。与えられたゴールを達成するための実行可能な手順を出してください。

【できること】
- Obsidian Vault内のノート検索・要約・タスク作成
- Geminiを使った情報取得・分析（Google検索を含む）

各ステップは1行で、番号や記号なしで記述してください。3〜6個のステップを出してください。${templateContext}

ゴール: ${goal}`;
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
        
        // Ask user to confirm step execution and choose web search option
        const stepExecution = await promptForStepExecution(this.app, stepNum, step);
        if (!stepExecution || stepExecution.action === 'cancel') {
            this.log('warn', 'User cancelled step execution');
            new Notice('ステップの実行がキャンセルされました');
            throw new Error('Step execution cancelled by user');
        }

        const needsWebSearch = stepExecution.useWebSearch;
        this.log('info', `User selected: ${needsWebSearch ? 'Web Search mode' : 'Vault Tools mode'}`);
        
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
            if (!this.gemini) {
                this.log('warn', `Skipping step (no Gemini): ${step}`);
                new Notice(`スキップ: ${step}`);
                return { result: `Skipped (no Gemini service available)` };
            }

            // Prepare template context if available
            let templateContext = '';
            if (this.loadedTemplate) {
                templateContext = '\n\n【テンプレート情報】\n' + 
                    this.templateService.formatAsSystemPrompt(this.loadedTemplate);
            }

            if (needsWebSearch) {
                this.log('info', 'Using Google Search (web search mode)');
                const prompt = `【最終ゴール】
${goal}${completedStepsContext}

【現在のステップ】
${step}${currentStepInstruction}${executionModeInstruction}${templateContext}

上記のステップを実行してください。Web検索を使って最新情報を調べ、結果を日本語で報告してください。`;

                const geminiResult = await this.gemini.chatWithMetadata([{ role: 'user', content: prompt }]);
                const res = geminiResult.text;
                const references = geminiResult.references;
                this.log('info', `Web search result: ${res.substring(0, 100)}...`);
                this.log('info', `References found: ${references.length} URLs`);
                
                // Extract input requirements from result
                const inputRequired = await this.extractInputRequirements(res, step);
                
                new Notice(`Web検索完了（${references.length}件の参照）`);
                return { result: res, inputRequired: inputRequired || undefined, references };
            } else {
                this.log('info', 'Using Function Calling (Vault tools mode)');
                
                const toolDeclarations = this.agentTools.getToolDeclarations();
                
                const systemPrompt = `あなたは Obsidian Vault 内でタスクを実行するエージェントです。

以下のツールを使ってステップを実行してください：
- search_notes: ノートをキーワード検索
- read_note: 特定のノートの内容を読む
- summarize_note: ノートを要約
- create_note: 新しいノートを作成

ステップの目的に応じて、適切なツールを呼び出してください。
結果を得たら、ユーザーに分かりやすく日本語で報告してください。`;

                const userPrompt = `【最終ゴール】
${goal}${completedStepsContext}

【現在のステップ】
${step}${currentStepInstruction}${executionModeInstruction}${templateContext}

上記のステップを実行してください。必要に応じてツールを使い、結果を日本語で報告してください。`;

                const result = await this.gemini.chatWithTools(
                    [
                        { role: 'user', content: systemPrompt },
                        { role: 'model', content: '了解しました。ツールを使ってステップを実行します。' },
                        { role: 'user', content: userPrompt }
                    ],
                    toolDeclarations,
                    async (name, args) => {
                        this.log('info', `Tool called: ${name} with args: ${JSON.stringify(args)}`);
                        const toolResult = await this.agentTools.executeTool(name, args);
                        this.log('info', `Tool result: ${JSON.stringify(toolResult).substring(0, 200)}...`);
                        return toolResult;
                    }
                );

                this.log('info', `Step execution result: ${result.text.substring(0, 100)}...`);
                this.log('info', `Tools called: ${result.toolCalls.length}`);
                this.log('info', `References found: ${result.references.length} URLs`);
                
                // Extract input requirements from result
                const inputRequired = await this.extractInputRequirements(result.text, step);
                
                new Notice(`ステップ実行完了（${result.toolCalls.length}個のツールを使用）`);
                return { 
                    result: result.text, 
                    inputRequired: inputRequired || undefined, 
                    references: result.references 
                };
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
        
        // Filter by access control
        const accessibleFiles = this.accessControl.filterAllowedFiles(files);
        this.log('info', `Accessible files after access control: ${accessibleFiles.length}`);
        
        const out: TFile[] = [];
        const q = query.toLowerCase();
        for (const f of accessibleFiles) {
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
        // Prefer placing tasks in the session folder when available
        const sessionFolder = this.sessionNote.getSessionFolderPath?.();
        const path = sessionFolder
            ? `${sessionFolder}/${safeTitle}.md`
            : `Agent Tasks/${safeTitle}.md`;
        this.log('info', `Task path: ${path}`);        
        // Check if the target path is accessible
        if (!this.accessControl.isPathAccessAllowed(path)) {
            this.log('warn', `Access denied for creating task at: ${path}`);
            throw new Error(`アクセスが許可されていないフォルダです: Agent Tasks`);
        }
                try {
            if (sessionFolder) {
                await this.ensureFolder(sessionFolder);
            } else {
                await this.ensureFolder('Agent Tasks');
            }
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

    // Resume from an existing session note (optionally from a specified step)
    async resumeFromNote(sessionNote: AgentSessionNote, startStep?: number, forceRestart: boolean = false): Promise<void> {
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

            // Determine starting step - either the provided startStep or first non-completed step
            let computedStart = 1;
            for (let i = 0; i < sessionData.executionLog.length; i++) {
                const logEntry = sessionData.executionLog[i];
                this.log('info', `Step ${i + 1} status: ${logEntry ? logEntry.status : 'unknown'}`);

                if (!logEntry || logEntry.status === 'pending' || logEntry.status === 'running') {
                    computedStart = i + 1;
                    break;
                }

                if (logEntry.status === 'completed') {
                    if (i === sessionData.executionLog.length - 1) {
                        computedStart = i + 2; // past last
                    }
                    continue;
                }

                if (logEntry.status === 'error') {
                    computedStart = i + 1;
                    break;
                }
            }

            // If a startStep was provided and valid, prefer it
            let start = computedStart;
            if (typeof startStep === 'number' && Number.isInteger(startStep) && startStep >= 1 && startStep <= sessionData.plan.length) {
                start = startStep;
                this.log('info', `Overriding start step to user-specified: ${start}`);
            }

            // If forceRestart is requested, reset statuses/results for steps from start onward
            if (forceRestart) {
                this.log('info', `Force restart requested: resetting steps ${start}..${sessionData.plan.length} to pending`);
                for (let si = start - 1; si < sessionData.executionLog.length; si++) {
                    const entry = sessionData.executionLog[si];
                    if (entry) {
                        entry.status = 'pending';
                        entry.result = undefined;
                        entry.userFeedback = undefined;
                        entry.inputRequired = undefined;
                        entry.references = undefined;
                        entry.referencedInstructions = [];
                    }
                }
                await this.sessionNote.update();
            }

            // If all steps completed
            if (start > finalPlan.length) {
                this.log('success', 'All steps already completed');
                new Notice('全ステップが既に完了しています');
                this.sessionNote.setStatus('completed');
                await this.sessionNote.update();
                return;
            }

            this.log('info', `Starting from step ${start}/${finalPlan.length}`);
            new Notice(`ステップ ${start}/${finalPlan.length} から再開します`);

            // Set status to executing
            this.sessionNote.setStatus('executing');
            await this.sessionNote.update();

            // Execute remaining steps
            const stepExecutionOptions = new Map<number, { stepInstruction?: string; deepDive?: boolean }>();
            for (let i = start - 1; i < finalPlan.length; i++) {
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
