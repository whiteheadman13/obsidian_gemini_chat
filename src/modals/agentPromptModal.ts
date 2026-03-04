import { App, Modal, Notice, TFile } from 'obsidian';

export interface AgentGoalResult {
    goal: string;
    templatePath?: string;
}

export interface AgentPromptOptions {
    templateFolder?: string;
    defaultTemplatePath?: string;
}

class AgentPromptModal extends Modal {
    private inputEl: HTMLInputElement | null = null;
    private selectEl: HTMLSelectElement | null = null;
    private onResolve: (res: AgentGoalResult | null) => void;
    private isResolved = false;
    private options?: AgentPromptOptions;

    constructor(app: App, onResolve: (res: AgentGoalResult | null) => void, options?: AgentPromptOptions) {
        super(app);
        this.onResolve = onResolve;
        this.options = options;
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

        // Template selector
        const templateSection = contentEl.createDiv();
        templateSection.style.marginBottom = '16px';
        
        const templateLabel = templateSection.createEl('label');
        templateLabel.style.display = 'block';
        templateLabel.style.marginBottom = '6px';
        templateLabel.style.fontSize = '0.95em';
        templateLabel.style.fontWeight = '500';
        templateLabel.textContent = 'テンプレート選択';

        this.selectEl = templateSection.createEl('select');
        this.selectEl.style.width = '100%';
        this.selectEl.style.padding = '8px';
        this.selectEl.style.marginBottom = '8px';
        this.selectEl.style.borderRadius = '4px';
        this.selectEl.style.border = '1px solid var(--background-modifier-border)';
        this.selectEl.style.backgroundColor = 'var(--background-secondary)';
        this.selectEl.style.color = 'var(--text-normal)';

        // Add empty option
        const emptyOption = this.selectEl.createEl('option');
        emptyOption.value = '';
        emptyOption.textContent = 'テンプレート未選択';

        // Populate with available templates
        this.populateTemplates();

        const inputLabel = contentEl.createEl('label');
        inputLabel.style.display = 'block';
        inputLabel.style.marginBottom = '6px';
        inputLabel.style.fontSize = '0.95em';
        inputLabel.style.fontWeight = '500';
        inputLabel.textContent = 'ゴール入力';

        this.inputEl = contentEl.createEl('input') as HTMLInputElement;
        this.inputEl.type = 'text';
        this.inputEl.placeholder = '例: 2026年2月の重要なAI関連ニュースを5つまとめて';
        this.inputEl.style.width = '100%';
        this.inputEl.style.marginBottom = '10px';
        this.inputEl.style.padding = '8px';
        this.inputEl.style.borderRadius = '4px';
        this.inputEl.style.border = '1px solid var(--background-modifier-border)';
        this.inputEl.style.backgroundColor = 'var(--background-secondary)';

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

    private populateTemplates() {
        if (!this.selectEl) return;

        const markdownFiles = this.getTemplateCandidates(this.options?.templateFolder)
            .sort((a, b) => a.path.localeCompare(b.path, 'ja'));

        markdownFiles.forEach((file) => {
            const option = this.selectEl!.createEl('option');
            option.value = file.path;
            option.textContent = file.path;
        });

        if (this.options?.defaultTemplatePath) {
            const defaultPath = this.options.defaultTemplatePath;
            const exists = markdownFiles.some((file) => file.path === defaultPath);
            if (exists) {
                this.selectEl.value = defaultPath;
            }
        }
    }

    private getTemplateCandidates(templateFolder?: string): TFile[] {
        const all = this.app.vault.getMarkdownFiles();
        const normalizedFolder = (templateFolder ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
        if (!normalizedFolder) {
            return all;
        }

        return all.filter((file) => file.path.startsWith(`${normalizedFolder}/`));
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
        const templatePath = this.selectEl?.value || undefined;
        this.resolveOnce({ goal: val, templatePath });
        this.close();
    }

    private resolveOnce(res: AgentGoalResult | null) {
        if (this.isResolved) return;
        this.isResolved = true;
        this.onResolve(res);
    }
}

export function promptForAgentGoal(app: App, options?: AgentPromptOptions): Promise<AgentGoalResult | null> {
    return new Promise((resolve) => {
        const m = new AgentPromptModal(app, resolve, options);
        m.open();
    });
}
