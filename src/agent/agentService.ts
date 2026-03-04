import { App, Notice, TFile, Vault, WorkspaceLeaf } from 'obsidian';
import { GeminiService } from '../geminiService';
import type MyPlugin from '../main';
import type { AgentLogView } from '../agentLogView';
import { AgentSessionNote } from './agentSessionNote';
import { promptForStepExecution } from '../modals/stepExecuteModal';
import { FolderAccessControl } from '../folderAccessControl';
import { AgentTools } from './agentTools';

export class AgentService {
    private app: App;
    private plugin: MyPlugin;
    private gemini?: GeminiService;
    private logView?: AgentLogView;
    private goal: string;
    private sessionNote: AgentSessionNote;
    private accessControl: FolderAccessControl;
    private agentTools: AgentTools;

    constructor(app: App, plugin: MyPlugin, goal: string, gemini?: GeminiService) {
        this.app = app;
        this.plugin = plugin;
        this.goal = goal;
        this.gemini = gemini;
        this.sessionNote = new AgentSessionNote(app, goal);
        this.accessControl = new FolderAccessControl(plugin.settings);
        this.agentTools = new AgentTools(
            app,
            gemini || null,
            this.accessControl,
            async (title, body) => {
                const file = await this.createTask(title, body);
                return file.path;
            }
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

    async run() {
        this.log('info', `Starting with goal: ${this.goal}`);
        new Notice(`エージェント起動: ${this.goal}`);

        try {
            // Step 1: Create session note
            this.log('info', 'Creating session note...');
            const noteFile = await this.sessionNote.create();
            this.log('success', `Session note created: ${noteFile.path}`);

            // Open the note in a new leaf
            await this.openNote(noteFile);

            // Step 2: Generate plan
            this.log('info', 'Generating plan...');
            const plan = await this.plan(this.goal);
            this.sessionNote.setPlan(plan);
            this.sessionNote.setStatus('executing');
            await this.sessionNote.update();
            this.log('success', `Plan generated with ${plan.length} steps`);
            new Notice(`計画: ${plan.length} ステップ`);

            // Step 3: Execute plan step by step
            for (let i = 0; i < plan.length; i++) {
                const step = plan[i];
                if (!step) continue;

                const stepNum = i + 1;
                this.sessionNote.setCurrentStep(stepNum);
                this.sessionNote.updateStepStatus(stepNum, 'running');
                await this.sessionNote.update();

                this.log('info', `Step ${stepNum}/${plan.length}: ${step}`);
                new Notice(`ステップ ${stepNum}/${plan.length}: ${step}`);
                
                const result = await this.executeStep(step, this.goal, stepNum);
                
                this.sessionNote.updateStepStatus(stepNum, 'completed', result);
                await this.sessionNote.update();
                this.log('success', `Step ${stepNum} completed`);
            }

            // Step 4: Mark session completed
            this.sessionNote.setStatus('completed');
            await this.sessionNote.update();
            this.log('success', 'All steps completed ✓');
            new Notice('エージェント: 完了しました ✓');
        } catch (e) {
            this.log('error', `Error during execution: ${e}`);
            this.sessionNote.setStatus('error');
            await this.sessionNote.update();
            new Notice(`エージェントエラー: ${e}`);
        }
    }

    private async openNote(file: TFile) {
        const { workspace } = this.app;
        const leaf = workspace.getLeaf('tab');
        await leaf.openFile(file);
    }

    private async plan(goal: string): Promise<string[]> {
        this.log('info', `Planning with Gemini: ${!!this.gemini}`);
        if (this.gemini) {
            try {
                const prompt = `あなたはObsidian Vaultの自動化エージェントです。以下のゴールを達成するための、Vault内で実行可能な具体的アクションを3〜6個、箇条書き（1行ずつ、各行は動詞で始める）で出してください。

【できること】
- Vault内のノートを検索 (例: "プロジェクトAを検索")
- ノートを要約 (例: "検索結果の上位ノートを要約")
- タスクノートを作成 (例: "ToDOリストを作成")

【できないこと】
- Web検索、外部サイトへのアクセス
- 新しい情報の取得（Vaultに存在しない情報）

ゴール: ${goal}

注意: もしゴールがVault外の情報（最新ニュース、Web検索など）を必要とする場合は、「Vault内の既存ノートから関連情報を検索・整理する」という方向で計画してください。`;
                this.log('info', 'Sending plan request to Gemini');
                const txt = await this.gemini.chat([{ role: 'user', content: prompt }]);
                this.log('info', `Gemini response: ${txt.substring(0, 100)}...`);
                
                // Clean up the response - extract action items
                const lines = txt.split(/\r?\n/)
                    .map(l => l.trim())
                    .filter(l => l)
                    .map(l => l.replace(/^[\d\*\-\+\.]+\s*/, '').trim()) // Remove bullets/numbers
                    .filter(l => l && l.length > 5); // Filter out empty or too short lines
                
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
            `"${goal}"に関連するノートを検索`,
            `検索結果の上位ノートを要約`,
            `要約に基づいてToDoリストを作成`,
        ];
    }

    private async executeStep(step: string, goal: string, stepNum: number): Promise<string> {
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
        
        try {
            if (!this.gemini) {
                this.log('warn', `Skipping step (no Gemini): ${step}`);
                new Notice(`スキップ: ${step}`);
                return 'スキップ（Gemini APIキーが設定されていません）';
            }

            if (needsWebSearch) {
                this.log('info', 'Using Google Search (web search mode)');
                const prompt = `【最終ゴール】
${goal}

【現在のステップ】
${step}

上記のステップを実行してください。Web検索を使って最新情報を調べ、結果を日本語で報告してください。`;

                const res = await this.gemini.chat([{ role: 'user', content: prompt }]);
                this.log('info', `Web search result: ${res.substring(0, 100)}...`);
                
                new Notice(`Web検索完了`);
                return res;
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
${goal}

【現在のステップ】
${step}

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
                
                new Notice(`ステップ実行完了（${result.toolCalls.length}個のツールを使用）`);
                return result.text;
            }
        } catch (e) {
            this.log('error', `executeStep error: ${e}`);
            new Notice(`ステップエラー: ${e}`);
            return `エラー: ${e}`;
        }
    }

    private async getVaultContext(query: string): Promise<string> {
        try {
            const hits = await this.searchNotes(query);
            if (hits.length === 0) {
                return 'Vault内に関連ノートが見つかりませんでした。';
            }
            
            const contextParts: string[] = [];
            for (let i = 0; i < Math.min(3, hits.length); i++) {
                const file = hits[i];
                if (file) {
                    const content = await this.app.vault.read(file);
                    const preview = content.slice(0, 300).replace(/\n+/g, ' ');
                    contextParts.push(`【${file.basename}】${preview}...`);
                }
            }
            return contextParts.join('\n\n');
        } catch (e) {
            return 'コンテキスト取得エラー';
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
                console.warn('summarize failed', e);
            }
        }
        return content.slice(0, 400).replace(/\n+/g, ' ');
    }

    private async createTask(title: string, body: string): Promise<TFile> {
        this.log('info', `Creating task: ${title}`);
        const safeTitle = title.replace(/[:\\\/*?"<>|]/g, '-')
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
            const file = await this.app.vault.create(path, `# ${title}\n\n${body}`);
            this.log('success', `Task file created at: ${path}`);
            return file;
        } catch (e) {
            this.log('error', `createTask failed: ${e}`);
            throw e;
        }
    }

    private async ensureFolder(folder: string) {
        const vault = this.app.vault as Vault;
        try {
            // vault.create will create nested paths as needed
            // create a temporary file then remove it if necessary
            const testPath = `${folder}/.keep`;
            const exists = this.app.vault.getAbstractFileByPath(testPath);
            if (!exists) {
                await vault.create(testPath, '');
            }
        } catch (e) {
            // ignore
        }
    }
}

export default AgentService;
