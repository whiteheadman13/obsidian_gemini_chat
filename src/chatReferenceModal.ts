import { App, Modal, TFile } from 'obsidian';

export interface ReferenceFileSelection {
	referenceFiles: TFile[];
}

class ReferenceFileModal extends Modal {
	private allFiles: TFile[];
	private selectedPaths: Set<string>;
	private onResolve: (result: ReferenceFileSelection | null) => void;
	private isResolved = false;

	constructor(
		app: App,
		initialPaths: Set<string>,
		onResolve: (result: ReferenceFileSelection | null) => void
	) {
		super(app);
		this.selectedPaths = new Set(initialPaths);
		this.onResolve = onResolve;
		this.allFiles = this.app.vault
			.getMarkdownFiles()
			.sort((a, b) => a.path.localeCompare(b.path, 'ja'));
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		this.titleEl.setText('参考ファイルを選択');

		const controls = contentEl.createDiv();
		controls.style.display = 'flex';
		controls.style.gap = '8px';
		controls.style.marginBottom = '8px';

		const selectAllBtn = controls.createEl('button', { text: '全選択' });
		selectAllBtn.addEventListener('click', () => {
			this.allFiles.forEach((file) => this.selectedPaths.add(file.path));
			this.renderList(referenceList);
		});

		const clearBtn = controls.createEl('button', { text: '全解除' });
		clearBtn.addEventListener('click', () => {
			this.selectedPaths.clear();
			this.renderList(referenceList);
		});

		const referenceList = contentEl.createDiv();
		referenceList.style.maxHeight = '320px';
		referenceList.style.overflowY = 'auto';
		referenceList.style.border = '1px solid var(--background-modifier-border)';
		referenceList.style.borderRadius = '6px';
		referenceList.style.padding = '6px';
		this.renderList(referenceList);

		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = 'flex';
		buttonContainer.style.justifyContent = 'flex-end';
		buttonContainer.style.gap = '8px';
		buttonContainer.style.marginTop = '12px';

		const okButton = buttonContainer.createEl('button', {
			text: '決定',
			cls: 'mod-cta',
		});
		okButton.addEventListener('click', () => this.submit());

		const cancelButton = buttonContainer.createEl('button', { text: 'キャンセル' });
		cancelButton.addEventListener('click', () => {
			this.resolveOnce(null);
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
		this.resolveOnce(null);
	}

	private renderList(container: HTMLElement) {
		container.empty();

		if (this.allFiles.length === 0) {
			container.createEl('p', { text: '参考にできるノートがありません。' });
			return;
		}

		this.allFiles.forEach((file) => {
			const row = container.createDiv();
			row.style.display = 'flex';
			row.style.alignItems = 'center';
			row.style.gap = '8px';
			row.style.padding = '4px 6px';

			const checkbox = row.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
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
		const selectedFiles = this.allFiles.filter((f) => this.selectedPaths.has(f.path));
		this.resolveOnce({ referenceFiles: selectedFiles });
		this.close();
	}

	private resolveOnce(result: ReferenceFileSelection | null) {
		if (this.isResolved) return;
		this.isResolved = true;
		this.onResolve(result);
	}
}

export function promptForReferenceFiles(
	app: App,
	initialPaths?: Set<string>
): Promise<ReferenceFileSelection | null> {
	return new Promise((resolve) => {
		const modal = new ReferenceFileModal(app, initialPaths ?? new Set(), resolve);
		modal.open();
	});
}
