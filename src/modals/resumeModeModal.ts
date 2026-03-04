import { App, Modal } from 'obsidian';

export interface ResumeModeResult {
    mode: 'interactive' | 'auto' | null;
}

export function promptForResumeMode(app: App): Promise<ResumeModeResult> {
    return new Promise((resolve) => {
        const modal = new ResumeModeModal(app, resolve);
        modal.open();
    });
}

class ResumeModeModal extends Modal {
    private onResolve: (res: ResumeModeResult) => void;
    private isResolved = false;

    constructor(app: App, onResolve: (res: ResumeModeResult) => void) {
        super(app);
        this.onResolve = onResolve;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText('エージェント再開モード選択');

        const desc = contentEl.createDiv();
        desc.style.marginBottom = '20px';
        desc.style.lineHeight = '1.6';
        desc.innerHTML = `
            <p style="margin-bottom: 12px;">エージェントの実行モードを選択してください：</p>
            <ul style="margin-left: 20px;">
                <li style="margin-bottom: 8px;"><b>対話型</b>：各ステップで詳細な確認とフィードバックが可能</li>
                <li><b>自動実行</b>：各ステップで簡易確認のみ（Web検索の有無を選択）</li>
            </ul>
        `;

        const btnContainer = contentEl.createDiv();
        btnContainer.style.display = 'flex';
        btnContainer.style.gap = '12px';
        btnContainer.style.justifyContent = 'center';

        const interactiveBtn = btnContainer.createEl('button', {
            text: '対話型',
            cls: 'mod-cta',
        });
        interactiveBtn.style.padding = '8px 24px';
        interactiveBtn.addEventListener('click', () => {
            this.resolveOnce({ mode: 'interactive' });
        });

        const autoBtn = btnContainer.createEl('button', {
            text: '自動実行',
        });
        autoBtn.style.padding = '8px 24px';
        autoBtn.addEventListener('click', () => {
            this.resolveOnce({ mode: 'auto' });
        });

        const cancelBtn = btnContainer.createEl('button', {
            text: 'キャンセル',
        });
        cancelBtn.style.padding = '8px 24px';
        cancelBtn.addEventListener('click', () => {
            this.resolveOnce({ mode: null });
        });
    }

    onClose() {
        this.resolveOnce({ mode: null });
    }

    private resolveOnce(v: ResumeModeResult) {
        if (this.isResolved) return;
        this.isResolved = true;
        this.onResolve(v);
        this.close();
    }
}
