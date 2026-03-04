import { App, Modal, Notice } from 'obsidian';

export interface AgentGoalResult {
    goal: string;
}

class AgentPromptModal extends Modal {
    private inputEl: HTMLInputElement | null = null;
    private onResolve: (res: AgentGoalResult | null) => void;
    private isResolved = false;

    constructor(app: App, onResolve: (res: AgentGoalResult | null) => void) {
        super(app);
        this.onResolve = onResolve;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.titleEl.setText('エージェントに指示（ゴール）を入力');

        // Add description
        const desc = contentEl.createDiv();
        desc.style.marginBottom = '16px';
        desc.style.fontSize = '0.9em';
        desc.style.color = 'var(--text-muted)';
        desc.innerHTML = `
            <p style="margin-bottom: 8px;"><strong>このエージェントができること：</strong></p>
            <ul style="margin: 0; padding-left: 20px;">
                <li>Vault内のノートを検索・要約</li>
                <li>タスクノートを作成</li>
                <li><strong>Gemini経由でWeb検索・最新情報取得</strong></li>
            </ul>
        `;

        this.inputEl = contentEl.createEl('input') as HTMLInputElement;
        this.inputEl.type = 'text';
        this.inputEl.placeholder = '例: 2026年2月の重要なAI関連ニュースを5つまとめて';
        this.inputEl.style.width = '100%';
        this.inputEl.style.marginBottom = '10px';

        const buttonRow = contentEl.createDiv();
        buttonRow.style.display = 'flex';
        buttonRow.style.justifyContent = 'flex-end';
        buttonRow.style.gap = '8px';

        const ok = buttonRow.createEl('button', { text: '実行', cls: 'mod-cta' });
        ok.addEventListener('click', () => this.submit());

        const cancel = buttonRow.createEl('button', { text: 'キャンセル' });
        cancel.addEventListener('click', () => {
            this.resolveOnce(null);
            this.close();
        });

        this.inputEl.focus();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        this.resolveOnce(null);
    }

    private submit() {
        const val = this.inputEl?.value.trim() ?? '';
        if (!val) {
            new Notice('ゴールを入力してください');
            return;
        }
        this.resolveOnce({ goal: val });
        this.close();
    }

    private resolveOnce(res: AgentGoalResult | null) {
        if (this.isResolved) return;
        this.isResolved = true;
        this.onResolve(res);
    }
}

export function promptForAgentGoal(app: App): Promise<AgentGoalResult | null> {
    return new Promise((resolve) => {
        const m = new AgentPromptModal(app, resolve);
        m.open();
    });
}
