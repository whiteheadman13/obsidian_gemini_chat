import { App, TFile, TFolder, Notice } from 'obsidian';
import { FolderAccessControl } from './folderAccessControl';
import { FileExtractionService } from './fileExtractionService';

/**
 * @参照の解析結果
 */
export interface ParsedAtReference {
	type: 'outNoteFormat' | 'instruction' | 'reference' | 'outFolder' | 'file';
	filePath: string;
	isValid: boolean;
	error?: string;
	file?: TFile;
	content?: string;
	fileType?: string;   // PDF, PPTX, DOCX 等
	imageData?: string;  // base64 encoded (画像ファイルのみ)
	mimeType?: string;   // MIME タイプ (画像ファイルのみ)
}

/**
 * @参照機能を管理するサービス
 */
export class ChatReferenceService {
	private app: App;
	private folderAccessControl: FolderAccessControl | null = null;

	constructor(app: App, folderAccessControl?: FolderAccessControl) {
		this.app = app;
		this.folderAccessControl = folderAccessControl || null;
	}

	/**
	 * テキストから @参照 をパース
	 * 例: "@outNoteFormat:課題整理テンプレート.md @instruction:組織方針.md @file:presentation.pptx"
	 */
	parseAtReferences(text: string): {
		references: ParsedAtReference[];
		cleanedText: string;
	} {
		// @参照の正規表現: @(outNoteFormat|instruction|reference|outFolder|file):filepath
		const atRefPattern = /@(outNoteFormat|instruction|reference|outFolder|file):([^\s]+)/g;
		const references: ParsedAtReference[] = [];
		let match;

		while ((match = atRefPattern.exec(text)) !== null) {
			references.push({
				type: match[1] as 'outNoteFormat' | 'instruction' | 'reference' | 'outFolder' | 'file',
				filePath: match[2] || '',
				isValid: false, // 後で検証
			});
		}

		// クリーンアップ: @参照を本文から削除
		const cleanedText = text.replace(/@(outNoteFormat|instruction|reference|outFolder|file):[^\s]+/g, '').trim();

		return { references, cleanedText };
	}

	/**
	 * パースされた参照を検証＆読み込み
	 */
	async resolveReferences(
		references: ParsedAtReference[]
	): Promise<ParsedAtReference[]> {
		const resolved: ParsedAtReference[] = [];

		for (const ref of references) {
			try {
				// @outFolder の場合はフォルダを検索
				if (ref.type === 'outFolder') {
					const folder = this.app.vault.getAbstractFileByPath(ref.filePath);

					if (!folder || !(folder instanceof TFolder)) {
						resolved.push({
							...ref,
							isValid: false,
							error: `フォルダが見つかりません: ${ref.filePath}`,
						});
						continue;
					}

					resolved.push({
						...ref,
						isValid: true,
						file: undefined, // フォルダなので file プロパティは不使用
						content: ref.filePath, // pathをcontentに格納
					});
					continue;
				}

				// @file の場合はファイルを抽出
				if (ref.type === 'file') {
					const file = this.app.vault.getAbstractFileByPath(ref.filePath);

					if (!file || !(file instanceof TFile)) {
						resolved.push({
							...ref,
							isValid: false,
							error: `ファイルが見つかりません: ${ref.filePath}`,
						});
						continue;
					}

					// ファイル形式のチェック
					if (!FileExtractionService.isSupportedFileType(ref.filePath)) {
						resolved.push({
							...ref,
							isValid: false,
							error: `未対応のファイル形式です: ${ref.filePath}`,
							fileType: FileExtractionService.getFileType(ref.filePath),
						});
						continue;
					}

					// 権限チェック
					if (this.folderAccessControl && !this.folderAccessControl.isFileAccessAllowed(file)) {
						resolved.push({
							...ref,
							isValid: false,
							error: `アクセス権限がありません: ${ref.filePath}`,
						});
						continue;
					}

					// ファイルサイズチェック（PDF/PPTX は大きくなりやすい。10MB まで許可）
					const stat = await this.app.vault.adapter.stat(file.path);
					if (stat && stat.size > 10 * 1024 * 1024) {
						resolved.push({
							...ref,
							isValid: false,
							error: `ファイルが大きすぎます（${(stat.size / 1024 / 1024).toFixed(1)}MB）。最大10MB までです。`,
						});
						continue;
					}

					// バイナリデータを読み込み
					const arrayBuffer = await this.readBinaryFile(file);

					// テキスト抽出
					const extractionService = new FileExtractionService();
					const extractionResult = await extractionService.extractText(arrayBuffer, file.name);

					if (!extractionResult.success) {
						resolved.push({
							...ref,
							isValid: false,
							error: extractionResult.error,
							fileType: extractionResult.fileType,
						});
						continue;
					}

					resolved.push({
						...ref,
						isValid: true,
						file,
						content: extractionResult.content,
						fileType: extractionResult.fileType,
						imageData: extractionResult.imageData,
						mimeType: extractionResult.mimeType,
					});
					continue;
				}

				// その他（outNoteFormat, instruction, reference）はファイルを検索
				const file = this.app.vault.getAbstractFileByPath(ref.filePath);

				if (!file || !(file instanceof TFile)) {
					resolved.push({
						...ref,
						isValid: false,
						error: `ファイルが見つかりません: ${ref.filePath}`,
					});
					continue;
				}

				// 権限チェック（folderAccessControlが設定されている場合）
				if (this.folderAccessControl && !this.folderAccessControl.isFileAccessAllowed(file)) {
					resolved.push({
						...ref,
						isValid: false,
						error: `アクセス権限がありません: ${ref.filePath}`,
					});
					continue;
				}

				// ファイルサイズチェック（100KB以上は警告）
				const stat = await this.app.vault.adapter.stat(file.path);
				if (stat && stat.size > 100 * 1024) {
					console.warn(`Large file reference: ${ref.filePath} (${stat.size} bytes)`);
				}

				// ファイル内容を読み込み
				const content = await this.app.vault.read(file);

				resolved.push({
					...ref,
					isValid: true,
					file,
					content,
				});
			} catch (error) {
				resolved.push({
					...ref,
					isValid: false,
					error: `エラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
		}

		return resolved;
	}

	/**
	 * バイナリファイルを読み込み
	 */
	private async readBinaryFile(file: TFile): Promise<ArrayBuffer> {
		return await this.app.vault.readBinary(file);
	}

	/**
	 * 無効な参照をチェック＆ユーザーに通知
	 */
	validateReferences(references: ParsedAtReference[]): boolean {
		const invalidRefs = references.filter(ref => !ref.isValid);

		if (invalidRefs.length === 0) {
			return true;
		}

		const errorMessages = invalidRefs.map(ref => `• ${ref.filePath}: ${ref.error}`).join('\n');
		new Notice(
			`以下の参照ファイルに問題があります:\n${errorMessages}`,
			5000
		);

		return false;
	}

	/**
	 * @参照をプロンプトに組み込む
	 */
	buildPromptWithReferences(
		userMessage: string,
		references: ParsedAtReference[]
	): string {
		const validRefs = references.filter(ref => ref.isValid);

		if (validRefs.length === 0) {
			return userMessage;
		}

		let prompt = userMessage;

		// 出力ノートフォーマットを最初に追加
		const formatRefs = validRefs.filter(ref => ref.type === 'outNoteFormat');
		if (formatRefs.length > 0) {
			prompt += '\n\n【出力ノートフォーマット】';
			formatRefs.forEach((ref, index) => {
				prompt += `\n\n[フォーマット ${index + 1}: ${ref.file?.basename || ref.filePath}]\n\`\`\`\n${ref.content}\n\`\`\``;
			});
		}

		// 指示事項を次に追加
		const instructionRefs = validRefs.filter(ref => ref.type === 'instruction');
		if (instructionRefs.length > 0) {
			prompt += '\n\n【指示事項・ルール】';
			instructionRefs.forEach((ref, index) => {
				prompt += `\n\n[指示事項 ${index + 1}: ${ref.file?.basename || ref.filePath}]\n\`\`\`\n${ref.content}\n\`\`\``;
			});
		}

		// 参考資料を次に追加
		const refRefs = validRefs.filter(ref => ref.type === 'reference');
		if (refRefs.length > 0) {
			prompt += '\n\n【参考資料】';
			refRefs.forEach((ref, index) => {
				prompt += `\n\n[参考資料 ${index + 1}: ${ref.file?.basename || ref.filePath}]\n\`\`\`\n${ref.content}\n\`\`\``;
			});
		}

		// 添付ファイル（PDF/PPTX/DOCX/TXT）を追加（画像は除く）
		const fileRefs = validRefs.filter(ref => ref.type === 'file' && !ref.imageData);
		if (fileRefs.length > 0) {
			prompt += '\n\n【添付ファイル】';
			fileRefs.forEach((ref, index) => {
				const label = ref.file?.basename || ref.filePath;
				const typeLabel = ref.fileType ? ref.fileType.toUpperCase() : 'FILE';
				prompt += `\n\n[添付ファイル ${index + 1}: ${label} (${typeLabel})]\n\`\`\`\n${ref.content}\n\`\`\``;
			});
		}

		// 添付画像（実データは inlineData として別途送信するためファイル名のみ記載）
		const imageRefs = validRefs.filter(ref => ref.type === 'file' && ref.imageData);
		if (imageRefs.length > 0) {
			prompt += '\n\n【添付画像】';
			imageRefs.forEach((ref, index) => {
				const label = ref.file?.basename || ref.filePath;
				prompt += `\n[添付画像 ${index + 1}: ${label}]`;
			});
		}

		return prompt;
	}

	/**
	 * @参照から出力先フォルダを取得
	 */
	getTargetFolder(references: ParsedAtReference[]): string | null {
		const targetRef = references.find(ref => ref.type === 'outFolder' && ref.filePath);
		return targetRef ? targetRef.filePath : null;
	}

	/**
	 * AIの応答をファイルとして保存
	 * @param folderPath 保存先フォルダのパス
	 * @param fileName ファイル名（拡張子なし）
	 * @param content ファイルの内容
	 */
	async saveResponseToFile(folderPath: string, fileName: string, content: string): Promise<TFile | null> {
		try {
			// フォルダが存在するか確認
			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!folder || !(folder instanceof TFolder)) {
				new Notice(`フォルダが見つかりません: ${folderPath}`);
				return null;
			}

			// ファイル名をサニタイズ
			const cleanFileName = this.sanitizeFileName(fileName);
			const filePath = `${folderPath}/${cleanFileName}.md`;

			// 既に同名ファイルが存在する場合は、タイムスタンプを付加
			let finalPath = filePath;
			let fileExists = this.app.vault.getAbstractFileByPath(finalPath);
			let counter = 1;
			while (fileExists instanceof TFile) {
				const timestamp = new Date().getTime();
				const baseName = cleanFileName.replace(/[\s-._]*$/, '');
				finalPath = `${folderPath}/${baseName}_${timestamp}_${counter}.md`;
				fileExists = this.app.vault.getAbstractFileByPath(finalPath);
				counter++;
			}

			// ファイルを作成
			const newFile = await this.app.vault.create(finalPath, content);
			new Notice(`ノートを保存しました: ${newFile.basename}`);
			return newFile;
		} catch (error) {
			console.error('ファイル保存エラー:', error);
			new Notice(`ファイル保存に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
			return null;
		}
	}

	/**
	 * ファイル名をサニタイズ（不正な文字を削除）
	 */
	private sanitizeFileName(fileName: string): string {
		// Obsidianで使用できない文字を削除: \ / : * ? " < > |
		return fileName
			.replace(/[\\/:"*?<>|]/g, '')
			.replace(/^\s+|\s+$/g, '') // 前後の空白を削除
			.substring(0, 200); // 長すぎない名前に制限
	}
}
