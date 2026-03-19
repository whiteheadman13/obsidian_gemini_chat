import { App, Modal, Notice, TFile, TFolder } from 'obsidian';
import { NoteCreateRequest, NoteSplitService, NotePart } from '../noteSplitService';

type Phase = 'input' | 'loading' | 'preview' | 'creating';

export function promptNoteSplit(
	app: App,
	file: TFile,
	apiKey: string,
	model: string,
	defaultCriteria: string
): Promise<void> {
	return new Promise((resolve) => {
		new NoteSplitModal(app, file, undefined, apiKey, model, defaultCriteria, resolve).open();
	});
}

export function promptNoteSplitSelection(
	app: App,
	file: TFile,
	selectedText: string,
	apiKey: string,
	model: string,
	defaultCriteria: string
): Promise<void> {
	return new Promise((resolve) => {
		new NoteSplitModal(app, file, selectedText, apiKey, model, defaultCriteria, resolve).open();
	});
}

class NoteSplitModal extends Modal {
	private phase: Phase = 'input';
	private criteriaTextarea: HTMLTextAreaElement | null = null;
	private outputFolderInput: HTMLInputElement | null = null;
	private defaultOutputFolder = '';
	private partFolderInputs: Map<number, HTMLInputElement> = new Map();
	private parts: NotePart[] = [];
	private checkedParts: Set<number> = new Set();
	private service: NoteSplitService;
	private onDone: () => void;

	constructor(
		app: App,
		private file: TFile,
		private selectedText: string | undefined,
		apiKey: string,
		model: string,
		private defaultCriteria: string,
		onDone: () => void
	) {
		super(app);
		this.service = new NoteSplitService(app, apiKey, model);
		this.onDone = onDone;
	}

	onOpen() {
		this.render();
	}

	onClose() {
		this.contentEl.empty();
		this.onDone();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();

		switch (this.phase) {
			case 'input':
				this.renderInputPhase();
				break;
			case 'loading':
				this.renderLoadingPhase();
				break;
			case 'preview':
				this.renderPreviewPhase();
				break;
			case 'creating':
				this.renderCreatingPhase();
				break;
		}
	}

	// ─── Phase 1: 分割基準の入力 ──────────────────────────────
	private renderInputPhase() {
		const { contentEl } = this;
		this.titleEl.setText(this.selectedText !== undefined ? '選択範囲を分割' : 'ノートを分割');

		if (this.selectedText !== undefined) {
			contentEl.createEl('p', {
				text: `対象: ${this.file.path}（選択範囲 ${this.selectedText.length} 文字）`,
				cls: 'note-split-source',
			});
		} else {
			contentEl.createEl('p', {
				text: `対象: ${this.file.path}`,
				cls: 'note-split-source',
			});
		}

		contentEl.createEl('p', { text: '分割の基準や方針を入力してください:' });

		this.criteriaTextarea = contentEl.createEl('textarea', {
			attr: { rows: '10', placeholder: '分割基準を入力...' },
		});
		this.criteriaTextarea.style.width = '100%';
		this.criteriaTextarea.style.fontFamily = 'var(--font-monospace)';
		this.criteriaTextarea.style.fontSize = '13px';
		this.criteriaTextarea.style.marginBottom = '12px';
		this.criteriaTextarea.value = this.defaultCriteria;

		contentEl.createEl('p', { text: 'デフォルト保存先フォルダ（プレビューで分割案ごとに変更可能）:' });

		const outputFolderInputWrap = contentEl.createDiv();
		outputFolderInputWrap.style.position = 'relative';

		this.outputFolderInput = outputFolderInputWrap.createEl('input', {
			type: 'text',
			attr: { placeholder: '例: 分割後/ノート' },
		});
		this.outputFolderInput.style.width = '100%';
		outputFolderInputWrap.style.marginBottom = '16px';

		const folderListId = `note-split-folder-list-${Date.now()}`;
		this.outputFolderInput.setAttribute('list', folderListId);
		const folderDatalist = outputFolderInputWrap.createEl('datalist', {
			attr: { id: folderListId },
		});
		this.populateFolderDatalist(folderDatalist, this.getAllFoldersInVault());

		this.outputFolderInput.addEventListener('focus', () => {
			if (this.outputFolderInput) {
				this.showFolderDropdown(this.outputFolderInput, this.getAllFoldersInVault());
			}
		});

		this.outputFolderInput.addEventListener('input', () => {
			if (this.outputFolderInput) {
				this.defaultOutputFolder = this.outputFolderInput.value.trim();
				this.showFolderDropdown(this.outputFolderInput, this.getAllFoldersInVault());
			}
		});

		// Default: same folder as source file
		const defaultFolder = this.file.parent ? this.file.parent.path : '';
		this.outputFolderInput.value = this.defaultOutputFolder || defaultFolder;
		this.defaultOutputFolder = this.outputFolderInput.value.trim();

		const btnRow = contentEl.createDiv({ cls: 'note-split-btn-row' });
		btnRow.style.display = 'flex';
		btnRow.style.justifyContent = 'flex-end';
		btnRow.style.gap = '8px';

		const cancelBtn = btnRow.createEl('button', { text: 'キャンセル' });
		cancelBtn.addEventListener('click', () => this.close());

		const analyzeBtn = btnRow.createEl('button', {
			text: 'AIで分析',
			cls: 'mod-cta',
		});
		analyzeBtn.addEventListener('click', () => this.startAnalysis());

		this.criteriaTextarea.focus();
	}

	// ─── Phase 2: Loading ────────────────────────────────────
	private renderLoadingPhase() {
		const { contentEl } = this;
		this.titleEl.setText('分析中...');

		const wrapper = contentEl.createDiv();
		wrapper.style.textAlign = 'center';
		wrapper.style.padding = '40px 0';
		wrapper.createEl('p', { text: 'AIがノートを分析しています。しばらくお待ちください...' });
	}

	// ─── Phase 3: プレビュー ──────────────────────────────────
	private renderPreviewPhase() {
		const { contentEl } = this;
		this.titleEl.setText(`分割プレビュー（${this.parts.length} 件）`);

		contentEl.createEl('p', {
			text: '作成するノートを選択して「作成」を押してください。',
		});

		const list = contentEl.createDiv({ cls: 'note-split-preview-list' });
		list.style.maxHeight = '380px';
		list.style.overflowY = 'auto';
		list.style.border = '1px solid var(--background-modifier-border)';
		list.style.borderRadius = '6px';
		list.style.padding = '6px';
		list.style.marginBottom = '12px';

		this.checkedParts.clear();
		this.partFolderInputs.clear();
		const folderCandidates = this.getAllFoldersInVault();
		const defaultFolder = this.defaultOutputFolder || (this.file.parent ? this.file.parent.path : '');
		this.parts.forEach((part, idx) => {
			this.checkedParts.add(idx);
			const row = list.createDiv({ cls: 'note-split-preview-item' });
			row.style.padding = '8px';
			row.style.borderBottom = '1px solid var(--background-modifier-border)';

			const header = row.createDiv();
			header.style.display = 'flex';
			header.style.alignItems = 'center';
			header.style.gap = '8px';
			header.style.marginBottom = '4px';

			const checkbox = header.createEl('input', { type: 'checkbox' });
			checkbox.checked = true;
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) {
					this.checkedParts.add(idx);
				} else {
					this.checkedParts.delete(idx);
				}
				createBtn.disabled = this.checkedParts.size === 0;
			});

			header.createEl('strong', { text: part.title });

			const folderInputWrap = row.createDiv();
			folderInputWrap.style.position = 'relative';
			folderInputWrap.style.marginBottom = '6px';

			folderInputWrap.createEl('small', {
				text: '保存先フォルダ（空欄=Vault直下）',
				cls: 'note-split-folder-label',
			});

			const folderInput = folderInputWrap.createEl('input', {
				type: 'text',
				attr: { placeholder: '例: 分割後/ノート' },
			});
			folderInput.style.width = '100%';
			folderInput.value = defaultFolder;

			const folderListId = `note-split-folder-list-preview-${Date.now()}-${idx}`;
			folderInput.setAttribute('list', folderListId);
			const folderDatalist = folderInputWrap.createEl('datalist', {
				attr: { id: folderListId },
			});
			this.populateFolderDatalist(folderDatalist, folderCandidates);

			folderInput.addEventListener('focus', () => {
				this.showFolderDropdown(folderInput, folderCandidates);
			});

			folderInput.addEventListener('input', () => {
				this.showFolderDropdown(folderInput, folderCandidates);
			});

			this.partFolderInputs.set(idx, folderInput);

			const preview = row.createEl('pre');
			preview.style.fontSize = '11px';
			preview.style.maxHeight = '80px';
			preview.style.overflowY = 'auto';
			preview.style.margin = '0';
			preview.style.color = 'var(--text-muted)';
			preview.style.whiteSpace = 'pre-wrap';
			preview.textContent = part.content.slice(0, 300) + (part.content.length > 300 ? '…' : '');
		});

		const btnRow = contentEl.createDiv({ cls: 'note-split-btn-row' });
		btnRow.style.display = 'flex';
		btnRow.style.justifyContent = 'flex-end';
		btnRow.style.gap = '8px';

		const backBtn = btnRow.createEl('button', { text: '戻る' });
		backBtn.addEventListener('click', () => {
			this.phase = 'input';
			this.render();
		});

		const createBtn = btnRow.createEl('button', {
			text: '作成',
			cls: 'mod-cta',
		});
		createBtn.addEventListener('click', () => this.createSelectedNotes());
	}

	// ─── Phase 4: Creating ───────────────────────────────────
	private renderCreatingPhase() {
		const { contentEl } = this;
		this.titleEl.setText('作成中...');

		const wrapper = contentEl.createDiv();
		wrapper.style.textAlign = 'center';
		wrapper.style.padding = '40px 0';
		wrapper.createEl('p', { text: 'ノートを作成しています...' });
	}

	// ─── Actions ─────────────────────────────────────────────
	private async startAnalysis() {
		const criteria = this.criteriaTextarea?.value.trim();
		if (!criteria) {
			new Notice('分割基準を入力してください');
			return;
		}

		this.phase = 'loading';
		this.render();

		try {
			this.parts = this.selectedText !== undefined
				? await this.service.analyzeSplitFromText(this.selectedText, this.file.basename, criteria)
				: await this.service.analyzeSplit(this.file, criteria);
			if (this.parts.length === 0) {
				new Notice('分割できる内容が見つかりませんでした');
				this.phase = 'input';
				this.render();
				return;
			}
			this.phase = 'preview';
			this.render();
		} catch (err) {
			console.error('Note split analysis error:', err);
			new Notice(`分析エラー: ${err instanceof Error ? err.message : String(err)}`);
			this.phase = 'input';
			this.render();
		}
	}

	private async createSelectedNotes() {
		const selectedParts = this.parts.filter((_, idx) => this.checkedParts.has(idx));

		if (selectedParts.length === 0) {
			new Notice('作成するノートが選択されていません');
			return;
		}

		this.phase = 'creating';
		this.render();

		try {
			const requests: NoteCreateRequest[] = [];
			this.parts.forEach((part, idx) => {
				if (!this.checkedParts.has(idx)) {
					return;
				}

				const folderPath = this.partFolderInputs.get(idx)?.value.trim() ?? '';
				requests.push({ part, folderPath });
			});

			const result = await this.service.createNotes(requests, this.file.basename);

			if (result.skipped.length > 0) {
				new Notice(`${result.created.length} 件作成、${result.skipped.length} 件スキップ（既存ファイル）`);
			} else {
				new Notice(`${result.created.length} 件のノートを作成しました`);
			}

			// 最初に作成されたノートを開く
			const firstCreated = result.created[0];
			if (firstCreated) {
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.openFile(firstCreated);
			}
		} catch (err) {
			console.error('Note split create error:', err);
			new Notice(`作成エラー: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			this.close();
		}
	}

	private getAllFoldersInVault(): string[] {
		return this.app.vault
			.getAllLoadedFiles()
			.filter((entry): entry is TFolder => entry instanceof TFolder)
			.map((folder) => folder.path)
			.sort((a, b) => a.localeCompare(b, 'ja'));
	}

	private showFolderDropdown(inputElement: HTMLInputElement, folders: string[]) {
		const parent = inputElement.parentElement as HTMLElement | null;
		if (parent && parent.style.position !== 'relative') {
			parent.style.position = 'relative';
		}

		let dropdown = inputElement.parentElement?.querySelector('.folder-dropdown') as HTMLElement | null;
		if (!dropdown) {
			dropdown = document.createElement('div') as HTMLElement;
			dropdown.className = 'folder-dropdown';
			dropdown.style.cssText = `
				position: absolute;
				top: 100%;
				left: 0;
				right: 0;
				max-height: 260px;
				overflow-y: auto;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-secondary);
				z-index: 1000;
				margin-top: 4px;
				display: none;
			`;
			inputElement.parentElement?.appendChild(dropdown);
		}

		dropdown.innerHTML = '';
		const filterValue = inputElement.value.toLowerCase();
		const filteredFolders = folders.filter((folder) => folder.toLowerCase().includes(filterValue));

		if (filteredFolders.length === 0) {
			const emptyMsg = dropdown.createDiv();
			emptyMsg.textContent = 'フォルダが見つかりません';
			emptyMsg.style.cssText = 'padding: 8px; color: var(--text-muted); text-align: center;';
			dropdown.style.display = 'block';
			return;
		}

		filteredFolders.slice(0, 20).forEach((folder) => {
			const item = dropdown!.createDiv();
			item.textContent = folder;
			item.style.cssText = `
				padding: 8px 12px;
				cursor: pointer;
				border-bottom: 1px solid var(--background-modifier-border);
				font-size: 0.9em;
			`;

			item.addEventListener('mouseenter', () => {
				item.style.backgroundColor = 'var(--background-modifier-hover)';
			});

			item.addEventListener('mouseleave', () => {
				item.style.backgroundColor = '';
			});

			item.addEventListener('click', () => {
				inputElement.value = folder;
				dropdown!.style.display = 'none';
				inputElement.focus();
			});
		});

		if (filteredFolders.length > 20) {
			const moreMsg = dropdown.createDiv();
			moreMsg.textContent = `他 ${filteredFolders.length - 20} 件...`;
			moreMsg.style.cssText = 'padding: 8px; color: var(--text-muted); text-align: center; font-size: 0.9em;';
		}

		dropdown.style.display = 'block';

		if (!inputElement.dataset.noteSplitFolderDropdownBound) {
			inputElement.dataset.noteSplitFolderDropdownBound = '1';
			inputElement.addEventListener('blur', () => {
				setTimeout(() => {
					dropdown!.style.display = 'none';
				}, 200);
			});
		}
	}

	private populateFolderDatalist(datalist: HTMLElement, folders: string[]) {
		datalist.empty();
		folders.slice(0, 200).forEach((folder) => {
			datalist.createEl('option', { attr: { value: folder } });
		});
	}
}
