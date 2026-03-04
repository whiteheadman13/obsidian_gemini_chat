import { App, Notice, TFile, Vault, WorkspaceLeaf } from 'obsidian';
import { GeminiService } from '../geminiService';
import type MyPlugin from '../main';
import type { AgentLogView } from '../agentLogView';
import { AgentSessionNote } from './agentSessionNote';
import { FolderAccessControl } from '../folderAccessControl';

export class AgentService {
    private app: App;
    private plugin: MyPlugin;
    private gemini?: GeminiService;
    private logView?: AgentLogView;
    private goal: string;
    private sessionNote: AgentSessionNote;
    private accessControl: FolderAccessControl;

    constructor(app: App, plugin: MyPlugin, goal: string, gemini?: GeminiService) {
        this.app = app;
        this.plugin = plugin;
        this.goal = goal;
        this.gemini = gemini;
        this.sessionNote = new AgentSessionNote(app, goal);
        this.accessControl = new FolderAccessControl(plugin.settings);
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
                
                const result = await this.executeStep(step, this.goal);
                
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

    private async executeStep(step: string, goal: string): Promise<string> {
        this.log('info', `Executing step: ${step}`);
        let result = '';
        try {
            // Normalize step text for pattern matching
            const normalizedStep = step.toLowerCase();
            
            // Pattern 1: Search actions
            if (/検索|search|探|find/i.test(step)) {
                this.log('info', 'Action: search');
                const hits = await this.searchNotes(goal);
                this.log('success', `Search results: ${hits.length} files`);
                new Notice(`検索結果: ${hits.length} 件`);
                result = `検索完了: ${hits.length}件のファイルを発見\n` + hits.map(f => `- [[${f.basename}]]`).join('\n');
            }
            // Pattern 2: Summarize actions 
            else if (/要約|まとめ|summariz|summary|整理|レビュー/i.test(step)) {
                this.log('info', 'Action: summarize');
                const hits = await this.searchNotes(goal);
                const first = hits[0];
                if (first) {
                    this.log('info', `Summarizing: ${first.path}`);
                    const s = await this.summarizeFile(first);
                    this.log('success', `Summary: ${s.substring(0, 100)}...`);
                    new Notice(`要約: ${s.substring(0, 120)}...`);
                    result = `要約対象: [[${first.basename}]]\n\n${s}`;
                } else {
                    this.log('warn', 'No files to summarize');
                    new Notice('要約対象のファイルがありません');
                    result = '要約対象のファイルがありません';
                }
            }
            // Pattern 3: Create task/todo/list actions
            else if (/作成|create|task|todo|タスク|リスト|list|書|生成/i.test(step)) {
                this.log('info', 'Action: create task');
                const hits = await this.searchNotes(goal);
                const first = hits[0];
                const based = first ? `参考: [[${first.basename}]]\n\n` : '';
                const body = `# ${goal}\n\n${based}## タスク\n- [ ] ${goal}に関する調査\n- [ ] 次のアクションを決定`;
                const taskFile = await this.createTask(`Agent task - ${new Date().toISOString()}`, body);
                this.log('success', 'Task created');
                new Notice('タスクを作成しました ✓');
                result = `タスク作成完了: [[${taskFile.basename}]]`;
            }
            // Pattern 4: If Gemini is available, ask it to help execute the step
            else if (this.gemini) {
                this.log('info', 'Action: Ask Gemini for guidance');
                const vaultContext = await this.getVaultContext(goal);
                const prompt = `【タスク】${step}

【ゴール】${goal}

【Vault内の関連情報】
${vaultContext}

上記のタスクを、Vault内の既存情報を使って実行してください。具体的な結果や提案を200字以内で簡潔に出力してください。`;
                
                const res = await this.gemini.chat([{ role: 'user', content: prompt }]);
                this.log('info', `Gemini execution result: ${res.substring(0, 100)}...`);
                new Notice(`実行完了: ${res.substring(0, 80)}...`);
                result = res;
            }
            // Pattern 5: No Gemini, just skip
            else {
                this.log('warn', `Cannot execute step (no Gemini): ${step}`);
                new Notice(`スキップ: ${step}`);
                result = 'スキップ（Gemini APIキーが設定されていません）';
            }
        } catch (e) {
            this.log('error', `executeStep error: ${e}`);
            new Notice(`ステップエラー: ${e}`);
            result = `エラー: ${e}`;
        }
        return result;
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
        const path = `Agent Tasks/${safeTitle}.md`;
        this.log('info', `Task path: ${path}`);
        
        // Check if the target path is accessible
        if (!this.accessControl.isPathAccessAllowed(path)) {
            this.log('warn', `Access denied for creating task at: ${path}`);
            throw new Error(`アクセスが許可されていないフォルダです: Agent Tasks`);
        }
        
        try {
            await this.ensureFolder('Agent Tasks');
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
