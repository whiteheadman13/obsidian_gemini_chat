import { App, Modal, Notice } from 'obsidian';

export interface ResumeStepResult {
    step: number | null;
    forceRestart: boolean;
}

export function promptForResumeStep(app: App, plan: string[]): Promise<ResumeStepResult> {
    return new Promise((resolve) => {
        const modal = new ResumeStepModal(app, plan, resolve);
        modal.open();
    });
}

class ResumeStepModal extends Modal {
    private plan: string[];
    private onResolve: (res: ResumeStepResult) => void;
    private isResolved = false;
    private selectEl: HTMLSelectElement | null = null;

    private forceCheckbox: HTMLInputElement | null = null;

    constructor(app: App, plan: string[], onResolve: (res: ResumeStepResult) => void) {
        super(app);
        this.plan = plan;
        this.onResolve = onResolve;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText('Resume Agent: 再開するステップを選択');

        const desc = contentEl.createDiv();
        desc.style.marginBottom = '8px';
        desc.textContent = '再実行したいステップを選択してください。';

        this.selectEl = contentEl.createEl('select') as HTMLSelectElement;
        this.selectEl.style.width = '100%';
        this.selectEl.style.marginBottom = '12px';

        const placeholder = this.selectEl.createEl('option');
        placeholder.value = '';
        placeholder.textContent = 'ステップを選択してください';

        this.plan.forEach((p, idx) => {
            const opt = this.selectEl!.createEl('option');
            opt.value = String(idx + 1);
            opt.textContent = `${idx + 1}: ${p}`;
        });

        // Add force restart checkbox
        const forceRow = contentEl.createDiv();
        forceRow.style.margin = '8px 0';
        const checkbox = forceRow.createEl('input') as HTMLInputElement;
        checkbox.type = 'checkbox';
        checkbox.id = 'resume-force-restart';
        this.forceCheckbox = checkbox;
        const label = forceRow.createEl('label');
        label.htmlFor = 'resume-force-restart';
        label.textContent = '完了済みでも強制再実行（選択ステップ以降を pending にリセット）';

        const btnRow = contentEl.createDiv();
        btnRow.style.display = 'flex';
        btnRow.style.justifyContent = 'flex-end';
        btnRow.style.gap = '8px';

        const ok = btnRow.createEl('button', { text: '再開', cls: 'mod-cta' });
        ok.addEventListener('click', () => this.submit());

        const cancel = btnRow.createEl('button', { text: 'キャンセル' });
        cancel.addEventListener('click', () => this.resolveOnce({ step: null, forceRestart: false }));
    }

    onClose() {
        this.resolveOnce({ step: null, forceRestart: false });
    }

    private submit() {
        if (!this.selectEl) return this.resolveOnce({ step: null, forceRestart: false });
        const val = this.selectEl.value;
        if (!val) {
            new Notice('ステップを選択してください');
            return;
        }
        const n = parseInt(val, 10);
        if (isNaN(n)) return this.resolveOnce({ step: null, forceRestart: false });
        const force = this.forceCheckbox?.checked || false;
        this.resolveOnce({ step: n, forceRestart: force });
    }

    private resolveOnce(v: ResumeStepResult) {
        if (this.isResolved) return;
        this.isResolved = true;
        this.onResolve(v);
        this.close();
    }
}
