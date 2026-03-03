import { App, Modal, Notice } from 'obsidian';

export type ConfirmAction = 'continue' | 'edit' | 'skip' | 'cancel';

export interface ConfirmResult {
    action: ConfirmAction;
    feedback?: string;
}

export class AgentConfirmModal extends Modal {
    private message: string;
    private showFeedbackInput: boolean;
    private feedbackInput?: HTMLTextAreaElement;
    private onResolve: (result: ConfirmResult | null) => void;
    private isResolved = false;

    constructor(
        app: App,
        message: string,
        showFeedbackInput: boolean,
        onResolve: (result: ConfirmResult | null) => void
    ) {
        super(app);
        this.message = message;
        this.showFeedbackInput = showFeedbackInput;
        this.onResolve = onResolve;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.titleEl.setText('Agent Confirmation');

        // Message
        const messageDiv = contentEl.createDiv();
        messageDiv.style.marginBottom = '16px';
        messageDiv.style.fontSize = '14px';
        messageDiv.setText(this.message);

        // Feedback input (optional)
        if (this.showFeedbackInput) {
            const label = contentEl.createEl('label', { text: '追加の指示やフィードバック（任意）:' });
            label.style.display = 'block';
            label.style.marginBottom = '8px';
            label.style.fontWeight = 'bold';

            this.feedbackInput = contentEl.createEl('textarea');
            this.feedbackInput.placeholder = '例: より詳細に調査してください、特定のファイルを優先してください、など';
            this.feedbackInput.style.width = '100%';
            this.feedbackInput.style.minHeight = '80px';
            this.feedbackInput.style.marginBottom = '16px';
        }

        // Button container
        const buttonContainer = contentEl.createDiv();
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.flexWrap = 'wrap';

        // Continue button
        const continueBtn = buttonContainer.createEl('button', {
            text: '続行',
            cls: 'mod-cta',
        });
        continueBtn.addEventListener('click', () => {
            this.resolveOnce({
                action: 'continue',
                feedback: this.feedbackInput?.value.trim() || undefined,
            });
            this.close();
        });

        // Edit note button
        const editBtn = buttonContainer.createEl('button', {
            text: 'ノートを編集',
        });
        editBtn.addEventListener('click', () => {
            this.resolveOnce({ action: 'edit' });
            this.close();
        });

        // Skip button
        const skipBtn = buttonContainer.createEl('button', {
            text: 'スキップ',
        });
        skipBtn.addEventListener('click', () => {
            this.resolveOnce({ action: 'skip' });
            this.close();
        });

        // Cancel button
        const cancelBtn = buttonContainer.createEl('button', {
            text: 'キャンセル',
        });
        cancelBtn.addEventListener('click', () => {
            this.resolveOnce({ action: 'cancel' });
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        this.resolveOnce(null);
    }

    private resolveOnce(result: ConfirmResult | null) {
        if (this.isResolved) return;
        this.isResolved = true;
        this.onResolve(result);
    }
}

export function promptAgentConfirmation(
    app: App,
    message: string,
    showFeedbackInput = false
): Promise<ConfirmResult | null> {
    return new Promise((resolve) => {
        const modal = new AgentConfirmModal(app, message, showFeedbackInput, resolve);
        modal.open();
    });
}
