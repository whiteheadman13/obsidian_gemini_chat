import { App, Notice, TFile, Vault } from 'obsidian';
import { GeminiService } from '../geminiService';
import type MyPlugin from '../main';
import type { AgentLogView } from '../agentLogView';

export class AgentService {
    private app: App;
    private plugin: MyPlugin;
    private gemini?: GeminiService;
    private logView?: AgentLogView;

    constructor(app: App, plugin: MyPlugin, gemini?: GeminiService) {
        this.app = app;
        this.plugin = plugin;
        this.gemini = gemini;
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

    async run(goal: string) {
        this.log('info', `Starting with goal: ${goal}`);
        new Notice(`エージェント起動: ${goal}`);

        try {
            const plan = await this.plan(goal);
            this.log('success', `Plan generated with ${plan.length} steps`);
            new Notice(`計画: ${plan.length} ステップ`);

            for (let i = 0; i < plan.length; i++) {
                const step = plan[i];
                if (!step) continue;
                this.log('info', `Step ${i + 1}/${plan.length}: ${step}`);
                new Notice(`ステップ ${i + 1}/${plan.length}: ${step}`);
                await this.executeStep(step, goal);
                this.log('success', `Step ${i + 1} completed`);
            }

            this.log('success', 'All steps completed ✓');
            new Notice('エージェント: 完了しました ✓');
        } catch (e) {
            this.log('error', `Error during execution: ${e}`);
            new Notice(`エージェントエラー: ${e}`);
        }
    }

    private async plan(goal: string): Promise<string[]> {
        this.log('info', `Planning with Gemini: ${!!this.gemini}`);
        if (this.gemini) {
            try {
                const prompt = `あなたはエージェントです。与えられたゴールを達成するための短い実行可能な手順を箇条書き(1行ずつ)で3〜6個出してください。ゴール: ${goal}`;
                this.log('info', 'Sending plan request to Gemini');
                const txt = await this.gemini.chat([{ role: 'user', content: prompt }]);
                this.log('info', `Gemini response: ${txt.substring(0, 100)}...`);
                const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(l => l);
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

    private async executeStep(step: string, goal: string) {
        this.log('info', `Executing step: ${step}`);
        try {
            if (/search/i.test(step)) {
                this.log('info', 'Action: search');
                const hits = await this.searchNotes(goal);
                this.log('success', `Search results: ${hits.length} files`);
                new Notice(`検索結果: ${hits.length} 件`);
            } else if (/summariz/i.test(step) || /summary/i.test(step)) {
                this.log('info', 'Action: summarize');
                const hits = await this.searchNotes(goal);
                const first = hits[0];
                if (first) {
                    this.log('info', `Summarizing: ${first.path}`);
                    const s = await this.summarizeFile(first);
                    this.log('success', `Summary: ${s.substring(0, 100)}...`);
                    new Notice(`要約: ${s.substring(0, 120)}...`);
                } else {
                    this.log('warn', 'No files to summarize');
                    new Notice('要約対象のファイルがありません');
                }
            } else if (/create|task|todo/i.test(step)) {
                this.log('info', 'Action: create task');
                const hits = await this.searchNotes(goal);
                const first = hits[0];
                const based = first ? `Based on ${first.path}\n` : '';
                const body = `# Agent-generated TODOs for: ${goal}\n\n${based}- ${goal}`;
                await this.createTask(`Agent task - ${new Date().toISOString()}`, body);
                this.log('success', 'Task created');
                new Notice('ToDo を作成しました ✓');
            } else {
                this.log('info', 'Action: generic/ask');
                // If model available, ask it how to perform this step
                if (this.gemini) {
                    this.log('info', `Asking Gemini how to execute: ${step}`);
                    const res = await this.gemini.chat([{ role: 'user', content: `次の手順を実行する方法を教えてください: ${step}` }]);
                    this.log('info', `Gemini advice: ${res.substring(0, 100)}...`);
                    new Notice(`アドバイス: ${res.substring(0, 100)}...`);
                } else {
                    this.log('warn', `Skipping step (no Gemini): ${step}`);
                    new Notice(`スキップ: ${step}`);
                }
            }
        } catch (e) {
            this.log('error', `executeStep error: ${e}`);
            new Notice(`ステップエラー: ${e}`);
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
                console.warn('summarize failed', e);
            }
        }
        return content.slice(0, 400).replace(/\n+/g, ' ');
    }

    private async createTask(title: string, body: string) {
        this.log('info', `Creating task: ${title}`);
        const safeTitle = title.replace(/[:\\\/*?"<>|]/g, '-')
            .replace(/\s+/g, '_')
            .slice(0, 100);
        const path = `Agent Tasks/${safeTitle}.md`;
        this.log('info', `Task path: ${path}`);
        try {
            await this.ensureFolder('Agent Tasks');
            await this.app.vault.create(path, `# ${title}\n\n${body}`);
            this.log('success', `Task file created at: ${path}`);
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
