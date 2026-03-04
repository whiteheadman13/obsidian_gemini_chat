import { App, Modal } from 'obsidian';

export interface StepExecuteResult {
    action: 'continue' | 'cancel';
    useWebSearch: boolean;
}

export function promptForStepExecution(app: App, stepNumber: number, stepText: string): Promise<StepExecuteResult | null> {
    return new Promise((resolve) => {
        const modal = new StepExecuteModal(app, stepNumber, stepText, resolve);
        modal.open();
    });
}

class StepExecuteModal extends Modal {
    private stepNumber: number;
    private stepText: string;
    private onResolve: (res: StepExecuteResult | null) => void;
    private isResolved = false;
    private useWebSearchCheckbox: HTMLInputElement | null = null;

    constructor(
        app: App,
        stepNumber: number,
        stepText: string,
        onResolve: (res: StepExecuteResult | null) => void
    ) {
        super(app);
        this.stepNumber = stepNumber;
        this.stepText = stepText;
        this.onResolve = onResolve;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText(`ステップ ${this.stepNumber} の実行`);

        // Step description
        const stepDesc = contentEl.createDiv();
        stepDesc.style.marginBottom = '20px';
        stepDesc.style.padding = '12px';
        stepDesc.style.backgroundColor = 'var(--background-secondary)';
        stepDesc.style.borderRadius = '4px';
        stepDesc.style.lineHeight = '1.6';
        
        const stepLabel = stepDesc.createEl('div', {
            text: `ステップ ${this.stepNumber}:`,
        });
        stepLabel.style.fontWeight = 'bold';
        stepLabel.style.marginBottom = '8px';
        stepLabel.style.color = 'var(--text-accent)';

        const stepContent = stepDesc.createEl('div', {
            text: this.stepText,
        });
        stepContent.style.fontSize = '14px';

        // Web search option
        const optionsContainer = contentEl.createDiv();
        optionsContainer.style.marginBottom = '20px';
        optionsContainer.style.padding = '12px';
        optionsContainer.style.border = '1px solid var(--background-modifier-border)';
        optionsContainer.style.borderRadius = '4px';

        const optionLabel = optionsContainer.createEl('div', {
            text: '実行オプション',
        });
        optionLabel.style.fontWeight = 'bold';
        optionLabel.style.marginBottom = '12px';

        const checkboxContainer = optionsContainer.createDiv();
        checkboxContainer.style.display = 'flex';
        checkboxContainer.style.alignItems = 'center';
        checkboxContainer.style.gap = '8px';

        this.useWebSearchCheckbox = checkboxContainer.createEl('input') as HTMLInputElement;
        this.useWebSearchCheckbox.type = 'checkbox';
        this.useWebSearchCheckbox.id = 'use-web-search';
        this.useWebSearchCheckbox.checked = false; // デフォルトはVault Tools mode

        const label = checkboxContainer.createEl('label');
        label.htmlFor = 'use-web-search';
        label.textContent = 'Web検索を使用する（Gemini Searchを有効化）';
        label.style.cursor = 'pointer';

        const hint = optionsContainer.createDiv();
        hint.style.marginTop = '8px';
        hint.style.fontSize = '12px';
        hint.style.color = 'var(--text-muted)';
        hint.innerHTML = `
            <p style="margin: 0;">※ チェックなし：Vault内のノート操作（検索、作成、要約など）</p>
            <p style="margin: 4px 0 0;">※ チェックあり：Web検索で最新情報を取得</p>
        `;

        // Button container
        const btnContainer = contentEl.createDiv();
        btnContainer.style.display = 'flex';
        btnContainer.style.justifyContent = 'flex-end';
        btnContainer.style.gap = '8px';

        const continueBtn = btnContainer.createEl('button', {
            text: '実行',
            cls: 'mod-cta',
        });
        continueBtn.addEventListener('click', () => {
            this.resolveOnce({
                action: 'continue',
                useWebSearch: this.useWebSearchCheckbox?.checked || false,
            });
        });

        const cancelBtn = btnContainer.createEl('button', {
            text: 'キャンセル',
        });
        cancelBtn.addEventListener('click', () => {
            this.resolveOnce(null);
        });
    }

    onClose() {
        if (!this.isResolved) {
            this.resolveOnce(null);
        }
    }

    private resolveOnce(v: StepExecuteResult | null) {
        if (this.isResolved) return;
        this.isResolved = true;
        this.onResolve(v);
        this.close();
    }
}
