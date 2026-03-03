import { App, Notice, TFile } from 'obsidian';
import { AgentSessionNote } from './agentSessionNote';
import InteractiveAgentService from './interactiveAgentService';
import type MyPlugin from '../main';
import { GeminiService } from '../geminiService';
import type { AgentLogView } from '../agentLogView';

export class SessionResumeService {
    private app: App;
    private plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    async resumeFromCurrentNote(logView?: AgentLogView): Promise<void> {
        // Get current active file
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('セッションノートを開いてください');
            return;
        }

        // Check if it's a session note
        const content = await this.app.vault.read(activeFile);
        if (!this.isSessionNote(content)) {
            new Notice('これはエージェントセッションノートではありません');
            return;
        }

        // Parse frontmatter to get goal and status
        const frontmatter = this.parseFrontmatter(content);
        if (!frontmatter.goal) {
            new Notice('セッションノートが不正です（ゴールが見つかりません）');
            return;
        }

        // Create session note instance and restore state
        const sessionNote = new AgentSessionNote(this.app, frontmatter.goal);
        sessionNote.setFile(activeFile);
        await sessionNote.readFromNote();

        const sessionData = sessionNote.getData();

        // Create interactive agent
        const gemini = this.plugin.settings.geminiApiKey 
            ? new GeminiService(this.plugin.settings.geminiApiKey) 
            : undefined;
        
        const agent = new InteractiveAgentService(
            this.app, 
            this.plugin, 
            sessionData.goal, 
            gemini
        );

        if (logView) {
            agent.setLogView(logView);
        }

        // Resume from current state
        await agent.resumeFromNote(sessionNote);
    }

    private isSessionNote(content: string): boolean {
        return content.includes('agent-session: true');
    }

    private parseFrontmatter(content: string): Record<string, string> {
        const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (!match || !match[1]) return {};

        const frontmatter: Record<string, string> = {};
        const lines = match[1].split('\n');
        
        for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const key = line.substring(0, colonIndex).trim();
                let value = line.substring(colonIndex + 1).trim();
                // Remove quotes
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);
                }
                frontmatter[key] = value;
            }
        }

        return frontmatter;
    }
}
