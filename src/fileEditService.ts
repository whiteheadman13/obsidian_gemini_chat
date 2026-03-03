import { App, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { GeminiService } from './geminiService';
import { DiffView, DIFF_VIEW_TYPE } from './diffView';
import type MyPlugin from './main';

export class FileEditService {
	private app: App;
	private geminiService: GeminiService;
	private plugin: MyPlugin;

	constructor(app: App, apiKey: string, plugin: MyPlugin) {
		this.app = app;
		this.geminiService = new GeminiService(apiKey);
		this.plugin = plugin;
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
		return activeFile;
	}

	/**
	 * AIを使ってファイルを編集
	 */
	async editFileWithAI(instruction: string): Promise<void> {
		const file = this.getActiveFile();
		if (!file) return;

		try {
			// ファイルの内容を読み取る
			const content = await this.app.vault.read(file);

			// AIに修正案を依頼
			new Notice('AIが修正案を生成中...');
			const modifiedContent = await this.requestModification(content, instruction);

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
	private async requestModification(content: string, instruction: string): Promise<string> {
		const prompt = `以下のマークダウンファイルを指示に従って修正してください。

指示: ${instruction}

元のファイル内容:
\`\`\`
${content}
\`\`\`

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

	/**
	 * 差分ビューを表示
	 */
	async showDiffView(file: TFile, oldContent: string, newContent: string): Promise<void> {
		// 既存の差分ビューを閉じる
		this.app.workspace.detachLeavesOfType(DIFF_VIEW_TYPE);

		// 新しいペインで差分ビューを開く
		const leaf = this.app.workspace.getLeaf('tab');
		
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
