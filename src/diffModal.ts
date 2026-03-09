import { App, Modal, TFile } from 'obsidian';
import { DiffService, DiffHunk } from './diffService';

export class DiffModal extends Modal {
	private oldText: string;
	private newText: string;
	private file: TFile;
	private selectedHunks: Set<string>;
	private hunks: DiffHunk[];
	private onApply: (text: string) => void;

	constructor(
		app: App,
		file: TFile,
		oldText: string,
		newText: string,
		onApply: (text: string) => void
	) {
		super(app);
		this.file = file;
		this.oldText = oldText;
		this.newText = newText;
		this.onApply = onApply;
		this.selectedHunks = new Set();
		
		// 差分を計算
		const diff = DiffService.computeDiff(oldText, newText);
		this.hunks = diff.hunks;
		
		// デフォルトで全てのHunkを選択
		this.hunks.forEach(hunk => this.selectedHunks.add(hunk.id));
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('diff-modal');

		// タイトル
		contentEl.createEl('h2', { text: `変更の確認: ${this.file.name}` });

		// 説明
		contentEl.createEl('p', { 
			text: '適用したい変更を選択してください。チェックを外した変更は破棄されます。',
			cls: 'diff-description'
		});

		// 差分表示エリア
		const diffContainer = contentEl.createDiv({ cls: 'diff-container' });
		
		if (this.hunks.length === 0) {
			diffContainer.createEl('p', { 
				text: '変更はありません',
				cls: 'diff-no-changes'
			});
		} else {
			this.renderHunks(diffContainer);
		}

		// ボタンエリア
		const buttonContainer = contentEl.createDiv({ cls: 'diff-button-container' });

		// 全選択/全解除トグル
		const toggleAllBtn = buttonContainer.createEl('button', { text: '全選択/解除' });
		toggleAllBtn.addEventListener('click', () => {
			if (this.selectedHunks.size === this.hunks.length) {
				this.selectedHunks.clear();
			} else {
				this.hunks.forEach(hunk => this.selectedHunks.add(hunk.id));
			}
			this.refresh();
		});

		// 適用ボタン
		const applyBtn = buttonContainer.createEl('button', { 
			text: '適用',
			cls: 'mod-cta'
		});
		applyBtn.addEventListener('click', () => {
			this.applyChanges();
		});

		// キャンセルボタン
		const cancelBtn = buttonContainer.createEl('button', { text: 'キャンセル' });
		cancelBtn.addEventListener('click', () => {
			this.close();
		});
	}

	private renderHunks(container: HTMLElement) {
		container.empty();

		this.hunks.forEach((hunk, index) => {
			const hunkEl = container.createDiv({ cls: 'diff-hunk' });

			// Hunkヘッダー（チェックボックス付き）
			const headerEl = hunkEl.createDiv({ cls: 'diff-hunk-header' });
			
			const checkbox = headerEl.createEl('input', { type: 'checkbox' });
			checkbox.checked = this.selectedHunks.has(hunk.id);
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) {
					this.selectedHunks.add(hunk.id);
				} else {
					this.selectedHunks.delete(hunk.id);
				}
			});

			headerEl.createSpan({ 
				text: hunk.sectionTitle ? `変更箇所 ${index + 1}: ${hunk.sectionTitle}` : `変更箇所 ${index + 1}`,
				cls: 'diff-hunk-title'
			});

			headerEl.createSpan({ 
				text: ` (行 ${hunk.oldStart}-${hunk.oldStart + hunk.oldLines - 1})`,
				cls: 'diff-hunk-location'
			});

			// 差分内容
			const contentEl = hunkEl.createDiv({ cls: 'diff-hunk-content' });
			
			hunk.lines.forEach(line => {
				const lineEl = contentEl.createDiv({ cls: 'diff-line' });
				
				if (line.startsWith('+')) {
					lineEl.addClass('diff-line-add');
					lineEl.createSpan({ text: '+', cls: 'diff-line-marker' });
					lineEl.createSpan({ text: line.substring(1), cls: 'diff-line-text' });
				} else if (line.startsWith('-')) {
					lineEl.addClass('diff-line-remove');
					lineEl.createSpan({ text: '-', cls: 'diff-line-marker' });
					lineEl.createSpan({ text: line.substring(1), cls: 'diff-line-text' });
				} else {
					lineEl.addClass('diff-line-context');
					lineEl.createSpan({ text: ' ', cls: 'diff-line-marker' });
					lineEl.createSpan({ text: line.substring(1), cls: 'diff-line-text' });
				}
			});
		});
	}

	private applyChanges() {
		if (this.selectedHunks.size === 0) {
			// 何も選択されていない場合は元のテキストをそのまま返す
			this.onApply(this.oldText);
		} else {
			// 選択されたHunkを適用
			const result = DiffService.applySelectedHunks(
				this.oldText,
				this.newText,
				this.selectedHunks
			);
			this.onApply(result);
		}
		this.close();
	}

	private refresh() {
		const { contentEl } = this;
		const diffContainer = contentEl.querySelector('.diff-container') as HTMLElement;
		if (diffContainer) {
			this.renderHunks(diffContainer);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
