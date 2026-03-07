import { App, Modal, Notice, TFile } from 'obsidian';
import { NoteSplitService, NotePart } from '../noteSplitService';

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

		contentEl.createEl('p', { text: '保存先フォルダ（空欄=元のノートと同じフォルダ）:' });

		this.outputFolderInput = contentEl.createEl('input', {
			type: 'text',
			attr: { placeholder: '例: 分割後/ノート' },
		});
		this.outputFolderInput.style.width = '100%';
		this.outputFolderInput.style.marginBottom = '16px';

		// Default: same folder as source file
		const defaultFolder = this.file.parent ? this.file.parent.path : '';
		this.outputFolderInput.value = defaultFolder;

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
		const folderPath = this.outputFolderInput?.value.trim() ?? '';
		const selectedParts = this.parts.filter((_, idx) => this.checkedParts.has(idx));

		if (selectedParts.length === 0) {
			new Notice('作成するノートが選択されていません');
			return;
		}

		this.phase = 'creating';
		this.render();

		try {
			const result = await this.service.createNotes(selectedParts, folderPath, this.file.basename);

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
}
