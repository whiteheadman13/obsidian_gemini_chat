import { App, Modal, Notice } from 'obsidian';

export interface NoteQaPromptResult {
	question: string;
	useGoogleSearch: boolean;
}

class NoteQaPromptModal extends Modal {
	private textareaEl: HTMLTextAreaElement | null = null;
	private checkboxEl: HTMLInputElement | null = null;
	private isResolved = false;

	constructor(
		app: App,
		private onResolve: (result: NoteQaPromptResult | null) => void,
		private initialQuestion = ''
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		this.titleEl.setText('ノート根拠Q&A');

		const desc = contentEl.createEl('p', {
			text: 'Vault内ノートを絞り込んで参照し、質問に回答します。全ノートは投入しません。',
		});
		desc.style.color = 'var(--text-muted)';
		desc.style.marginBottom = '12px';

		this.textareaEl = contentEl.createEl('textarea');
		this.textareaEl.placeholder = '例: MCP関連のメモを根拠に、導入時の注意点を3つ教えて';
		this.textareaEl.value = this.initialQuestion;
		this.textareaEl.rows = 6;
		this.textareaEl.style.width = '100%';
		this.textareaEl.style.marginBottom = '12px';

		const optionLabel = contentEl.createEl('label');
		optionLabel.style.display = 'flex';
		optionLabel.style.gap = '8px';
		optionLabel.style.alignItems = 'center';
		optionLabel.style.marginBottom = '16px';

		this.checkboxEl = optionLabel.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
		optionLabel.createSpan({ text: '必要時のみGoogle検索を併用する' });

		const buttonRow = contentEl.createDiv();
		buttonRow.style.display = 'flex';
		buttonRow.style.justifyContent = 'flex-end';
		buttonRow.style.gap = '8px';

		const submitButton = buttonRow.createEl('button', { text: '実行', cls: 'mod-cta' });
		submitButton.addEventListener('click', () => this.submit());

		const cancelButton = buttonRow.createEl('button', { text: 'キャンセル' });
		cancelButton.addEventListener('click', () => {
			this.resolveOnce(null);
			this.close();
		});

		this.textareaEl.focus();
	}

	onClose() {
		this.contentEl.empty();
		this.resolveOnce(null);
	}

	private submit() {
		const question = this.textareaEl?.value.trim() ?? '';
		if (!question) {
			new Notice('質問を入力してください');
			return;
		}

		this.resolveOnce({
			question,
			useGoogleSearch: this.checkboxEl?.checked ?? false,
		});
		this.close();
	}

	private resolveOnce(result: NoteQaPromptResult | null) {
		if (this.isResolved) {
			return;
		}
		this.isResolved = true;
		this.onResolve(result);
	}
}

export function promptForNoteQa(app: App, initialQuestion = ''): Promise<NoteQaPromptResult | null> {
	return new Promise((resolve) => {
		const modal = new NoteQaPromptModal(app, resolve, initialQuestion);
		modal.open();
	});
}