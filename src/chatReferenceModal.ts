import { App, Modal, TFile } from 'obsidian';

export interface ReferenceFileSelection {
	referenceFiles: TFile[];
}

class ReferenceFileModal extends Modal {
	private allFiles: TFile[];
	private filteredFiles: TFile[];
	private filterText = '';
	private listContainer?: HTMLElement;
	private filterTimer?: number;
	private expandedFolders: Set<string>;
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
		this.filteredFiles = this.allFiles.slice();
		this.expandedFolders = new Set();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		this.titleEl.setText('参考ファイルを選択');

		const controls = contentEl.createDiv();
		controls.style.display = 'flex';
		controls.style.gap = '8px';
		controls.style.marginBottom = '8px';

		const searchInput = controls.createEl('input') as HTMLInputElement;
		searchInput.type = 'search';
		searchInput.placeholder = 'ファイル名で検索...';
		searchInput.style.flex = '1';
		searchInput.addEventListener('input', (e) => {
			this.filterText = (e.target as HTMLInputElement).value;
			if (this.filterTimer) clearTimeout(this.filterTimer);
			this.filterTimer = window.setTimeout(() => this.applyFilter(), 200);
		});

		const selectAllBtn = controls.createEl('button', { text: '全選択' });
		selectAllBtn.addEventListener('click', () => {
			this.getVisibleFiles().forEach((file) => this.selectedPaths.add(file.path));
			this.renderList(referenceList);
		});

		const clearBtn = controls.createEl('button', { text: '全解除' });
		clearBtn.addEventListener('click', () => {
			this.getVisibleFiles().forEach((file) => this.selectedPaths.delete(file.path));
			this.renderList(referenceList);
		});

		const referenceList = contentEl.createDiv();
		referenceList.style.maxHeight = '320px';
		referenceList.style.overflowY = 'auto';
		referenceList.style.border = '1px solid var(--background-modifier-border)';
		referenceList.style.borderRadius = '6px';
		referenceList.style.padding = '6px';
		this.listContainer = referenceList;
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

		const files = this.getVisibleFiles();

		if (files.length === 0) {
			container.createEl('p', { text: '参考にできるノートがありません。' });
			return;
		}

		const tree = this.buildTree(files);
		this.renderTree(container, tree, 0);
	}

	private buildTree(files: TFile[]) {
		type TreeNode = {
			name: string;
			path: string; // full folder path for nodes, empty for root
			children: Map<string, any>;
			files: TFile[];
		};

		const root: TreeNode = { name: '', path: '', children: new Map(), files: [] };

		files.forEach((f) => {
			const parts = f.path.split('/');
			let node = root;
			for (let i = 0; i < parts.length - 1; i++) {
				const part = parts[i]!;
				const subPath = node.path ? `${node.path}/${part}` : part;
				if (!node.children.has(part)) {
					node.children.set(part, { name: part, path: subPath, children: new Map(), files: [] });
				}
				const next = node.children.get(part)!;
				node = next;
			}
			node.files.push(f);
		});

		return root;
	}

	private renderTree(container: HTMLElement, node: any, indent: number) {
		// Render folders
		const keys = (Array.from(node.children.keys()) as string[]).sort((a, b) => a.localeCompare(b, 'ja'));
		keys.forEach((folderName) => {
			const child = node.children.get(folderName)!;
			const row = container.createDiv();
			row.style.display = 'flex';
			row.style.alignItems = 'center';
			row.style.gap = '8px';
			row.style.padding = '4px 6px';

			const folderCheckbox = row.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
			const descendantFiles = this.collectFilesInNode(child);
			const allSelected = descendantFiles.every((f) => this.selectedPaths.has(f.path));
			const noneSelected = descendantFiles.every((f) => !this.selectedPaths.has(f.path));
			folderCheckbox.checked = allSelected && descendantFiles.length > 0;
			folderCheckbox.indeterminate = !allSelected && !noneSelected && descendantFiles.length > 0;
			folderCheckbox.addEventListener('change', () => {
				if (folderCheckbox.checked) {
					descendantFiles.forEach((f) => this.selectedPaths.add(f.path));
				} else {
					descendantFiles.forEach((f) => this.selectedPaths.delete(f.path));
				}
				if (this.listContainer) this.renderList(this.listContainer);
			});

			const toggle = row.createEl('button', { text: this.expandedFolders.has(child.path) ? '▾' : '▸' });
			toggle.style.border = 'none';
			toggle.style.background = 'transparent';
			toggle.style.cursor = 'pointer';
			toggle.addEventListener('click', () => {
				if (this.expandedFolders.has(child.path)) this.expandedFolders.delete(child.path);
				else this.expandedFolders.add(child.path);
				if (this.listContainer) this.renderList(this.listContainer);
			});

			const label = row.createDiv();
			label.setText(folderName);
			label.style.flex = '1';
			label.style.cursor = 'pointer';
			label.style.marginLeft = `${indent * 12}px`;
			label.addEventListener('click', () => {
				if (this.expandedFolders.has(child.path)) this.expandedFolders.delete(child.path);
				else this.expandedFolders.add(child.path);
				if (this.listContainer) this.renderList(this.listContainer);
			});

			if (this.expandedFolders.has(child.path)) {
				this.renderTree(container, child, indent + 1);
			}
		});

		// Render files in this node
		const files = node.files.slice().sort((a: TFile, b: TFile) => a.path.localeCompare(b.path, 'ja'));
		files.forEach((file: TFile) => {
			const row = container.createDiv();
			row.style.display = 'flex';
			row.style.alignItems = 'center';
			row.style.gap = '8px';
			row.style.padding = '4px 6px';

			const checkbox = row.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
			checkbox.checked = this.selectedPaths.has(file.path);
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) this.selectedPaths.add(file.path);
				else this.selectedPaths.delete(file.path);
			});

			const name = file.path.split('/').pop() || file.path;
			const label = row.createEl('label', { text: name });
			label.style.flex = '1';
			label.style.cursor = 'pointer';
			label.style.marginLeft = `${indent * 12}px`;
			label.addEventListener('click', () => {
				checkbox.checked = !checkbox.checked;
				checkbox.dispatchEvent(new Event('change'));
			});
		});
	}

	private collectFilesInNode(node: any): TFile[] {
		let out: TFile[] = [];
		if (node.files && node.files.length) out = out.concat(node.files);
		if (node.children) {
			for (const k of Array.from(node.children.keys()) as string[]) {
				const child = node.children.get(k);
				if (child) out = out.concat(this.collectFilesInNode(child));
			}
		}
		return out;
	}

	private getVisibleFiles(): TFile[] {
		if (!this.filterText) return this.allFiles;
		return this.filteredFiles;
	}

	private applyFilter() {
		if (!this.filterText) {
			this.filteredFiles = this.allFiles.slice();
		} else {
			const q = this.filterText.toLowerCase();
			this.filteredFiles = this.allFiles.filter((f) => f.path.toLowerCase().includes(q));
		}
		if (this.listContainer) this.renderList(this.listContainer);
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
