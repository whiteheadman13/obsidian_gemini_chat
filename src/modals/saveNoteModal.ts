import { Modal, App, Setting } from 'obsidian';

export interface SaveNoteModalResult {
	title: string;
	save: boolean;
}

/**
 * AIの応答をファイルとして保存する際のタイトル入力モーダル
 */
export class SaveNoteModal extends Modal {
	title: string;
	folderPath: string;
	onSubmit: (result: SaveNoteModalResult) => void;

	constructor(app: App, suggestedTitle: string, folderPath: string, onSubmit: (result: SaveNoteModalResult) => void) {
		super(app);
		this.title = suggestedTitle;
		this.folderPath = folderPath;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl('h2', { text: 'ノートを新規保存' });

		const infoEl = contentEl.createEl('div', {
			cls: 'save-note-info',
		});
		infoEl.createEl('p', {
			text: `保存先: ${this.folderPath}`,
		});

		const titleLabel = contentEl.createEl('label', {
			text: 'ファイル名（拡張子なし）',
		});
		titleLabel.style.display = 'block';
		titleLabel.style.marginTop = '16px';
		titleLabel.style.marginBottom = '8px';
		titleLabel.style.fontWeight = 'bold';

		const titleInput = contentEl.createEl('input', {
			type: 'text',
			value: this.title,
			attr: {
				placeholder: 'ファイル名を入力...',
			},
		});
		titleInput.style.width = '100%';
		titleInput.style.padding = '8px';
		titleInput.style.marginBottom = '16px';
		titleInput.style.border = '1px solid var(--background-modifier-border)';
		titleInput.style.borderRadius = '4px';
		titleInput.focus();

		const buttonContainer = contentEl.createEl('div', {
			cls: 'save-note-buttons',
		});

		const saveButton = buttonContainer.createEl('button', {
			text: '保存',
		});
		saveButton.style.marginRight = '8px';
		saveButton.style.padding = '8px 16px';
		saveButton.style.backgroundColor = 'var(--interactive-accent)';
		saveButton.style.color = 'var(--text-on-accent)';
		saveButton.style.border = 'none';
		saveButton.style.borderRadius = '4px';
		saveButton.style.cursor = 'pointer';

		const cancelButton = buttonContainer.createEl('button', {
			text: 'キャンセル',
		});
		cancelButton.style.padding = '8px 16px';
		cancelButton.style.backgroundColor = 'var(--background-secondary)';
		cancelButton.style.color = 'var(--text-normal)';
		cancelButton.style.border = '1px solid var(--background-modifier-border)';
		cancelButton.style.borderRadius = '4px';
		cancelButton.style.cursor = 'pointer';

		saveButton.addEventListener('click', () => {
			const trimmedTitle = titleInput.value.trim();
			if (!trimmedTitle) {
				alert('ファイル名を入力してください');
				return;
			}
			this.onSubmit({ title: trimmedTitle, save: true });
			this.close();
		});

		cancelButton.addEventListener('click', () => {
			this.onSubmit({ title: '', save: false });
			this.close();
		});

		// Enterキーで保存
		titleInput.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.key === 'Enter') {
				saveButton.click();
			}
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
