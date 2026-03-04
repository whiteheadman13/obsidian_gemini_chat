import { App, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { GeminiService } from './geminiService';
import { DiffView, DIFF_VIEW_TYPE } from './diffView';
import type MyPlugin from './main';
import { FolderAccessControl } from './folderAccessControl';

export class FileEditService {
	private app: App;
	private geminiService: GeminiService;
	private plugin: MyPlugin;
	private accessControl: FolderAccessControl;

	constructor(app: App, apiKey: string, plugin: MyPlugin) {
		this.app = app;
		this.geminiService = new GeminiService(apiKey, plugin.settings.geminiModel);
		this.plugin = plugin;
		this.accessControl = new FolderAccessControl(plugin.settings);
	}

	/**
	 * 現在アクティブなファイルを取得
	 */
	getActiveFile(): TFile | null {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('アクティブなファイルがありません');
			return null;
		}
		
		// Check access control
		if (!this.accessControl.isFileAccessAllowed(activeFile)) {
			new Notice('このファイルへのアクセスは許可されていません');
			return null;
		}
		
		return activeFile;
	}

	/**
	 * AIを使ってファイルを編集
	 */
	async editFileWithAI(instruction: string, referenceFiles: TFile[] = []): Promise<void> {
		const file = this.getActiveFile();
		if (!file) return;

		try {
			// ファイルの内容を読み取る
			const content = await this.app.vault.read(file);
			const referenceContents = await this.loadReferenceContents(referenceFiles, file.path);

			// AIに修正案を依頼
			new Notice('AIが修正案を生成中...');
			const modifiedContent = await this.requestModification(content, instruction, referenceContents);

			// 差分をチェック
			if (content === modifiedContent) {
				new Notice('変更はありませんでした');
				return;
			}

			// 差分ビューを表示
			await this.showDiffView(file, content, modifiedContent);

		} catch (error) {
			console.error('File edit error:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			new Notice(`エラーが発生しました: ${errorMessage}`);
		}
	}

	/**
	 * AIに修正を依頼
	 */
	private async requestModification(
		content: string,
		instruction: string,
		referenceNotes: Array<{ path: string; content: string }>
	): Promise<string> {
		const referenceSection = this.buildReferenceSection(referenceNotes);

		const prompt = `以下のマークダウンファイルを指示に従って修正してください。

注意:
- 編集対象は「主要ノート」のみです。
- 参考資料は文脈理解のための情報です。参考資料自体の内容は出力しないでください。

指示: ${instruction}

主要ノート（編集対象）:
\`\`\`
${content}
\`\`\`

${referenceSection}

修正後のファイル全文を出力してください。説明は不要です。コードブロックも不要です。ファイルの内容だけを出力してください。`;

		const response = await this.geminiService.chat([
			{ role: 'user', content: prompt }
		]);

		// コードブロックがある場合は除去
		let cleanedResponse = response.trim();
		
		// ```markdown や ``` で囲まれている場合は除去
		if (cleanedResponse.startsWith('```')) {
			const lines = cleanedResponse.split('\n');
			// 最初の行（```markdown など）を除去
			lines.shift();
			// 最後の行（```）を除去
			const lastLine = lines[lines.length - 1];
			if (lastLine && lastLine.trim() === '```') {
				lines.pop();
			}
			cleanedResponse = lines.join('\n');
		}

		return cleanedResponse;
	}

	private async loadReferenceContents(
		referenceFiles: TFile[],
		targetPath: string
	): Promise<Array<{ path: string; content: string }>> {
		const uniqueFiles = referenceFiles.filter((file, index, arr) => {
			if (file.path === targetPath) {
				return false;
			}
			return arr.findIndex((candidate) => candidate.path === file.path) === index;
		});

		// Filter by access control
		const accessibleFiles = this.accessControl.filterAllowedFiles(uniqueFiles);

		const loaded = await Promise.all(
			accessibleFiles.map(async (file) => ({
				path: file.path,
				content: await this.app.vault.read(file),
			}))
		);

		return loaded;
	}

	private buildReferenceSection(referenceNotes: Array<{ path: string; content: string }>): string {
		if (referenceNotes.length === 0) {
			return '参考資料: なし';
		}

		const maxTotalCharacters = 50000;
		let usedCharacters = 0;
		const sections: string[] = ['参考資料（複数）:'];

		referenceNotes.forEach((note, index) => {
			if (usedCharacters >= maxTotalCharacters) {
				return;
			}

			const remaining = maxTotalCharacters - usedCharacters;
			const trimmedContent = note.content.length > remaining
				? `${note.content.slice(0, Math.max(0, remaining - 20))}\n...`
				: note.content;

			usedCharacters += trimmedContent.length;
			sections.push(
				`[参考資料 ${index + 1}: ${note.path}]\n\`\`\`\n${trimmedContent}\n\`\`\``
			);
		});

		if (usedCharacters >= maxTotalCharacters) {
			sections.push('※ 参考資料が長いため末尾を一部省略しています。');
		}

		return sections.join('\n\n');
	}

	/**
	 * 差分ビューを表示
	 */
	async showDiffView(file: TFile, oldContent: string, newContent: string): Promise<void> {
		// 既存の差分ビューを閉じる
		this.app.workspace.detachLeavesOfType(DIFF_VIEW_TYPE);

		// 新しいペインで差分ビューを開く - より安全な方法で取得
		let leaf: WorkspaceLeaf | null = null;
		
		try {
			// 右側に分割して新しいleafを作成
			leaf = this.app.workspace.getLeaf('split', 'vertical');
			
			// leafがまだnullの場合は、新しいleafを強制作成
			if (!leaf) {
				leaf = this.app.workspace.getLeaf(true);
			}
			
			if (!leaf) {
				throw new Error('Failed to create workspace leaf');
			}
		} catch (error) {
			console.error('Failed to get leaf:', error);
			new Notice('ワークスペースの準備に失敗しました');
			return;
		}
		
		await leaf.setViewState({
			type: DIFF_VIEW_TYPE,
			active: true,
		});

		// ビューを取得してデータをセット
		const view = leaf.view as DiffView;
		if (view) {
			view.setDiffData(
				file,
				oldContent,
				newContent,
				async (finalContent: string) => {
					try {
						await this.app.vault.modify(file, finalContent);
						new Notice('ファイルを更新しました');
					} catch (error) {
						console.error('File write error:', error);
						const errorMessage = error instanceof Error ? error.message : 'Unknown error';
						new Notice(`ファイルの保存に失敗しました: ${errorMessage}`);
					}
				}
			);
		}

		// ビューを表示
		this.app.workspace.revealLeaf(leaf);
	}

	/**
	 * 一時ファイルを作成（将来の機能拡張用）
	 */
	async createTempFile(originalFile: TFile, content: string): Promise<TFile | null> {
		const tempFileName = `.tmp_${originalFile.basename}_${Date.now()}.md`;
		const tempPath = originalFile.parent 
			? `${originalFile.parent.path}/${tempFileName}`
			: tempFileName;

		try {
			const tempFile = await this.app.vault.create(tempPath, content);
			return tempFile;
		} catch (error) {
			console.error('Failed to create temp file:', error);
			new Notice('一時ファイルの作成に失敗しました');
			return null;
		}
	}

	/**
	 * 一時ファイルを削除
	 */
	async deleteTempFile(file: TFile): Promise<void> {
		try {
			await this.app.vault.delete(file);
		} catch (error) {
			console.error('Failed to delete temp file:', error);
		}
	}
}
