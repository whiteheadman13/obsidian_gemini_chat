import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import { DiffService, DiffHunk } from './diffService';

export const DIFF_VIEW_TYPE = 'diff-view';

export class DiffView extends ItemView {
	private file: TFile | null = null;
	private oldText: string = '';
	private newText: string = '';
	private searchEnabled: boolean = false;
	private searchReferences: string[] = [];
	private selectedHunks: Set<string>;
	private hunks: DiffHunk[] = [];
	private onApply: ((text: string) => void) | null = null;
	private leftPane: HTMLElement | null = null;
	private rightPane: HTMLElement | null = null;
	private controlPanel: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.selectedHunks = new Set();
	}

	/**
	 * 差分データをセットして表示を初期化
	 */
	setDiffData(
		file: TFile,
		oldText: string,
		newText: string,
		metadata: { searchEnabled?: boolean; searchReferences?: string[] } | undefined,
		onApply: (text: string) => void
	) {
		this.file = file;
		this.oldText = oldText;
		this.newText = newText;
		this.searchEnabled = metadata?.searchEnabled ?? false;
		this.searchReferences = metadata?.searchReferences ?? [];
		this.onApply = onApply;
		
		// 差分を計算
		const diff = DiffService.computeDiff(oldText, newText);
		this.hunks = diff.hunks;
		
		// デフォルトで全てのHunkを選択
		this.selectedHunks.clear();
		this.hunks.forEach(hunk => this.selectedHunks.add(hunk.id));

		// ビューが既に開かれている場合は再描画
		if (this.containerEl.children[1]) {
			this.onOpen();
		}
	}

	getViewType(): string {
		return DIFF_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file ? `差分: ${this.file.name}` : '差分表示';
	}

	getIcon(): string {
		return 'diff';
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		if (!container) return;
		
		container.empty();
		container.addClass('diff-view-container');

		// データがまだセットされていない場合
		if (!this.file) {
			container.createEl('div', { 
				text: '差分データを読み込み中...',
				cls: 'diff-loading'
			});
			return;
		}

		// ヘッダー
		const header = container.createEl('div', { cls: 'diff-view-header' });
		header.createEl('h3', { text: `変更の確認: ${this.file.name}` });
		header.createEl('p', { 
			text: '左が元のファイル、右が修正後です。適用したい変更を選択してください。',
			cls: 'diff-view-description'
		});

		if (this.searchEnabled) {
			const refsContainer = container.createEl('div', { cls: 'diff-search-references' });
			refsContainer.createEl('div', {
				text: 'Google検索の参照元',
				cls: 'diff-search-references-title',
			});

			if (this.searchReferences.length > 0) {
				const refsList = refsContainer.createEl('ul', { cls: 'diff-search-references-list' });
				this.searchReferences.slice(0, 5).forEach((url) => {
					const item = refsList.createEl('li');
					item.createEl('a', {
						text: url,
						href: url,
						cls: 'external-link',
					});
				});
			} else {
				refsContainer.createEl('div', {
					text: 'Google検索は有効でしたが、この編集では参照元メタデータが返されませんでした。',
					cls: 'diff-search-references-empty',
				});
			}
		}

		// コントロールパネル
		this.controlPanel = container.createEl('div', { cls: 'diff-control-panel' });
		this.renderControlPanel();

		// Split view container
		const splitContainer = container.createEl('div', { cls: 'diff-split-container' });

		// 左ペイン（元のファイル）
		const leftContainer = splitContainer.createEl('div', { cls: 'diff-pane diff-pane-left' });
		leftContainer.createEl('div', { cls: 'diff-pane-title', text: '元のファイル' });
		this.leftPane = leftContainer.createEl('div', { cls: 'diff-pane-content' });
		this.renderLeftPane();

		// 右ペイン（修正後）
		const rightContainer = splitContainer.createEl('div', { cls: 'diff-pane diff-pane-right' });
		rightContainer.createEl('div', { cls: 'diff-pane-title', text: '修正後' });
		this.rightPane = rightContainer.createEl('div', { cls: 'diff-pane-content' });
		this.renderRightPane();

		// ボタンエリア
		const buttonContainer = container.createEl('div', { cls: 'diff-button-container' });

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

	private renderControlPanel() {
		if (!this.controlPanel) return;
		this.controlPanel.empty();

		if (this.hunks.length === 0) {
			this.controlPanel.createEl('p', { 
				text: '変更はありません',
				cls: 'diff-no-changes'
			});
			return;
		}

		const hunksContainer = this.controlPanel.createEl('div', { cls: 'diff-hunks-list' });
		hunksContainer.createEl('div', { text: '変更箇所:', cls: 'diff-hunks-title' });

		this.hunks.forEach((hunk, index) => {
			const hunkItem = hunksContainer.createEl('div', { cls: 'diff-hunk-item' });
			
			const checkbox = hunkItem.createEl('input', { type: 'checkbox' });
			checkbox.checked = this.selectedHunks.has(hunk.id);
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) {
					this.selectedHunks.add(hunk.id);
				} else {
					this.selectedHunks.delete(hunk.id);
				}
				this.refresh();
			});

			const label = hunkItem.createEl('label');
			label.createSpan({ 
				text: `変更 ${index + 1}`,
				cls: 'diff-hunk-label'
			});
			label.createSpan({ 
				text: ` (行 ${hunk.oldStart}-${hunk.oldStart + hunk.oldLines - 1})`,
				cls: 'diff-hunk-location'
			});

			// クリックでその箇所にスクロール
			label.addEventListener('click', () => {
				this.scrollToHunk(index);
			});
		});
	}

	private renderLeftPane() {
		if (!this.leftPane) return;
		this.leftPane.empty();

		const lines = this.oldText.split('\n');
		let lineNumber = 1;

		lines.forEach((line, index) => {
			const lineEl = this.leftPane!.createEl('div', { cls: 'diff-line-container' });
			
			// 行番号
			const lineNumEl = lineEl.createEl('span', { 
				cls: 'diff-line-number',
				text: String(lineNumber)
			});

			// この行が変更される（削除される）かチェック
			const isModified = this.isLineModifiedInOld(lineNumber);
			const isSelected = this.isLineInSelectedHunk(lineNumber, true);
			
			// 行内容
			const lineContentEl = lineEl.createEl('span', { 
				cls: 'diff-line-content',
				text: line || ' '
			});

			if (isModified) {
				if (isSelected) {
					lineEl.addClass('diff-line-removed-selected');
				} else {
					lineEl.addClass('diff-line-removed-unselected');
				}
			}

			lineNumber++;
		});
	}

	private renderRightPane() {
		if (!this.rightPane) return;
		this.rightPane.empty();

		const lines = this.newText.split('\n');
		let lineNumber = 1;

		lines.forEach((line, index) => {
			const lineEl = this.rightPane!.createEl('div', { cls: 'diff-line-container' });
			
			// 行番号
			const lineNumEl = lineEl.createEl('span', { 
				cls: 'diff-line-number',
				text: String(lineNumber)
			});

			// この行が追加されたかチェック
			const isAdded = this.isLineAddedInNew(lineNumber);
			const isSelected = this.isLineInSelectedHunk(lineNumber, false);
			
			// 行内容
			const lineContentEl = lineEl.createEl('span', { 
				cls: 'diff-line-content',
				text: line || ' '
			});

			if (isAdded) {
				if (isSelected) {
					lineEl.addClass('diff-line-added-selected');
				} else {
					lineEl.addClass('diff-line-added-unselected');
				}
			}

			lineNumber++;
		});
	}

	private isLineModifiedInOld(lineNumber: number): boolean {
		for (const hunk of this.hunks) {
			const start = hunk.oldStart;
			const end = start + hunk.oldLines;
			if (lineNumber >= start && lineNumber < end) {
				// この行が削除または変更されているかチェック
				return hunk.lines.some(line => line.startsWith('-'));
			}
		}
		return false;
	}

	private isLineAddedInNew(lineNumber: number): boolean {
		for (const hunk of this.hunks) {
			const start = hunk.newStart;
			const end = start + hunk.newLines;
			if (lineNumber >= start && lineNumber < end) {
				// この行が追加されているかチェック
				return hunk.lines.some(line => line.startsWith('+'));
			}
		}
		return false;
	}

	private isLineInSelectedHunk(lineNumber: number, isOld: boolean): boolean {
		for (const hunk of this.hunks) {
			if (!this.selectedHunks.has(hunk.id)) continue;
			
			const start = isOld ? hunk.oldStart : hunk.newStart;
			const lines = isOld ? hunk.oldLines : hunk.newLines;
			const end = start + lines;
			
			if (lineNumber >= start && lineNumber < end) {
				return true;
			}
		}
		return false;
	}

	private scrollToHunk(index: number) {
		// 実装: 特定のHunkにスクロール
		// 簡易実装のため、現時点ではスキップ
	}

	private applyChanges() {
		if (!this.onApply) {
			new Notice('エラー: コールバック関数が設定されていません');
			return;
		}

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
		this.renderControlPanel();
		this.renderLeftPane();
		this.renderRightPane();
	}

	private async close() {
		// ビューを閉じる
		this.app.workspace.detachLeavesOfType(DIFF_VIEW_TYPE);
	}

	async onClose() {
		// クリーンアップ
	}
}
