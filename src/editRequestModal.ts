import { App, Modal, Notice, TFile } from 'obsidian';

export interface EditRequest {
	instruction: string;
	referenceFiles: TFile[];
	useGoogleSearch: boolean;
}

class EditRequestModal extends Modal {
	private targetFile: TFile;
	private allFiles: TFile[];
	private selectedPaths: Set<string> = new Set();
	private instructionInput: HTMLTextAreaElement | null = null;
	private googleSearchCheckbox: HTMLInputElement | null = null;
	private onResolve: (result: EditRequest | null) => void;
	private isResolved = false;

	constructor(app: App, targetFile: TFile, onResolve: (result: EditRequest | null) => void) {
		super(app);
		this.targetFile = targetFile;
		this.onResolve = onResolve;
		this.allFiles = this.app.vault
			.getMarkdownFiles()
			.filter((file) => file.path !== targetFile.path)
			.sort((a, b) => a.path.localeCompare(b.path, 'ja'));
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		this.titleEl.setText('AI編集の指示と参考ノート');

		contentEl.createEl('p', {
			text: `編集対象: ${this.targetFile.path}`,
		});

		contentEl.createEl('p', {
			text: '編集指示を入力し、必要なら参考ノートを複数選択してください（参考ノート自体は編集されません）。',
		});

		this.instructionInput = contentEl.createEl('textarea', {
			attr: {
				placeholder: '例: 見出し構造を保ったまま、説明を簡潔に書き直してください',
				rows: '5',
			},
		});
		this.instructionInput.style.width = '100%';
		this.instructionInput.style.marginBottom = '12px';

		const searchOptionRow = contentEl.createDiv();
		searchOptionRow.style.display = 'flex';
		searchOptionRow.style.alignItems = 'center';
		searchOptionRow.style.gap = '8px';
		searchOptionRow.style.marginBottom = '12px';

		const searchLabel = searchOptionRow.createEl('label', {
			text: 'Google検索を使用',
		});
		searchLabel.style.display = 'flex';
		searchLabel.style.alignItems = 'center';
		searchLabel.style.gap = '8px';
		searchLabel.style.cursor = 'pointer';
		searchLabel.setAttribute('title', 'Gemini API組み込みのGoogle Search Groundingを使用します');

		this.googleSearchCheckbox = searchLabel.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
		searchLabel.prepend(this.googleSearchCheckbox);

		const controls = contentEl.createDiv();
		controls.style.display = 'flex';
		controls.style.gap = '8px';
		controls.style.marginBottom = '8px';

		const selectAllBtn = controls.createEl('button', { text: '全選択' });
		selectAllBtn.addEventListener('click', () => {
			this.allFiles.forEach((file) => this.selectedPaths.add(file.path));
			this.renderReferenceList(referenceList);
		});

		const clearBtn = controls.createEl('button', { text: '全解除' });
		clearBtn.addEventListener('click', () => {
			this.selectedPaths.clear();
			this.renderReferenceList(referenceList);
		});

		const referenceList = contentEl.createDiv();
		referenceList.style.maxHeight = '280px';
		referenceList.style.overflowY = 'auto';
		referenceList.style.border = '1px solid var(--background-modifier-border)';
		referenceList.style.borderRadius = '6px';
		referenceList.style.padding = '6px';
		this.renderReferenceList(referenceList);

		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = 'flex';
		buttonContainer.style.justifyContent = 'flex-end';
		buttonContainer.style.gap = '8px';
		buttonContainer.style.marginTop = '12px';

		const submitButton = buttonContainer.createEl('button', {
			text: '実行',
			cls: 'mod-cta',
		});
		submitButton.addEventListener('click', () => {
			this.submit();
		});

		const cancelButton = buttonContainer.createEl('button', { text: 'キャンセル' });
		cancelButton.addEventListener('click', () => {
			this.resolveOnce(null);
			this.close();
		});

		this.instructionInput.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		this.resolveOnce(null);
	}

	private renderReferenceList(container: HTMLElement) {
		container.empty();

		if (this.allFiles.length === 0) {
			container.createEl('p', { text: '選択可能なノートがありません。' });
			return;
		}

		this.allFiles.forEach((file) => {
			const row = container.createDiv();
			row.style.display = 'flex';
			row.style.alignItems = 'center';
			row.style.gap = '8px';
			row.style.padding = '6px';

			const checkbox = row.createEl('input', { type: 'checkbox' });
			checkbox.checked = this.selectedPaths.has(file.path);
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) {
					this.selectedPaths.add(file.path);
				} else {
					this.selectedPaths.delete(file.path);
				}
			});

			const label = row.createEl('label', { text: file.path });
			label.style.flex = '1';
			label.style.cursor = 'pointer';
			label.addEventListener('click', () => {
				checkbox.checked = !checkbox.checked;
				checkbox.dispatchEvent(new Event('change'));
			});
		});
	}

	private submit() {
		const instruction = this.instructionInput?.value.trim() ?? '';
		if (!instruction) {
			new Notice('編集指示を入力してください');
			return;
		}

		const selectedFiles = this.allFiles.filter((file) => this.selectedPaths.has(file.path));
		this.resolveOnce({
			instruction,
			referenceFiles: selectedFiles,
			useGoogleSearch: this.googleSearchCheckbox?.checked ?? false,
		});
		this.close();
	}

	private resolveOnce(result: EditRequest | null) {
		if (this.isResolved) {
			return;
		}
		this.isResolved = true;
		this.onResolve(result);
	}
}

export function promptForEditRequest(app: App, targetFile: TFile): Promise<EditRequest | null> {
	return new Promise((resolve) => {
		const modal = new EditRequestModal(app, targetFile, resolve);
		modal.open();
	});
}
