import { App, TFile, normalizePath } from 'obsidian';
import { GeminiService } from './geminiService';

export interface NotePart {
	title: string;
	content: string;
}

export interface NoteSplitResult {
	created: TFile[];
	skipped: string[];
}

export interface NoteCreateRequest {
	part: NotePart;
	folderPath: string;
}

export class NoteSplitService {
	private geminiService: GeminiService;

	constructor(
		private app: App,
		apiKey: string,
		model: string
	) {
		this.geminiService = new GeminiService(apiKey, model);
	}

	/**
	 * AIを使ってノートの分割案を生成する（ファイルは作成しない）
	 */
	async analyzeSplit(file: TFile, criteria: string): Promise<NotePart[]> {
		const content = await this.app.vault.read(file);
		return this.analyzeSplitFromText(content, file.basename, criteria);
	}

	/**
	 * テキストを直接渡して分割案を生成する（選択範囲向け）
	 */
	async analyzeSplitFromText(content: string, sourceName: string, criteria: string): Promise<NotePart[]> {
		const prompt = `以下のノートを、指定された基準に従って複数のノートに分割してください。

ファイル名: ${sourceName}

分割基準:
${criteria}

ノートの内容:
\`\`\`
${content}
\`\`\`

出力形式:
分割後の各ノートをJSON配列で出力してください。以下の形式を厳守してください:
[
  {
    "title": "ノートのタイトル",
    "content": "ノートの全文（マークダウン）"
  }
]

注意:
- JSONのみを出力してください。コードブロック（\`\`\`json）は不要です。
- titleはファイル名として使える文字列にしてください（/ \\ : * ? " < > | は使用不可）。
- 各ノートは独立して理解できるよう、必要なコンテキストを含めてください。
- 分割できる内容がない場合は、元のノートを1つの要素として返してください。`;

		const response = await this.geminiService.chat([
			{ role: 'user', content: prompt }
		]);

		return this.parseResponse(response);
	}

	private parseResponse(response: string): NotePart[] {
		let text = response.trim();

		// コードブロックが含まれていれば除去
		if (text.startsWith('```')) {
			const lines = text.split('\n');
			lines.shift();
			if (lines[lines.length - 1]?.trim() === '```') {
				lines.pop();
			}
			text = lines.join('\n');
		}

		const parsed = JSON.parse(text);
		if (!Array.isArray(parsed)) {
			throw new Error('AIの応答が配列形式ではありませんでした');
		}

		for (const item of parsed) {
			if (typeof item.title !== 'string' || typeof item.content !== 'string') {
				throw new Error('AIの応答に title または content が含まれていません');
			}
		}

		return parsed as NotePart[];
	}

	/**
	 * 分割案ごとに保存先フォルダを指定してファイルを作成する
	 */
	async createNotes(requests: NoteCreateRequest[], sourceName: string): Promise<NoteSplitResult> {
		const created: TFile[] = [];
		const skipped: string[] = [];
		const preparedFolders = new Set<string>();

		for (const request of requests) {
			const normalizedFolderPath = request.folderPath.trim();
			if (!normalizedFolderPath || preparedFolders.has(normalizedFolderPath)) {
				continue;
			}

			if (!this.app.vault.getAbstractFileByPath(normalizedFolderPath)) {
				await this.app.vault.createFolder(normalizedFolderPath);
			}

			preparedFolders.add(normalizedFolderPath);
		}

		for (const request of requests) {
			const part = request.part;
			const folderPath = request.folderPath.trim();
			const safeName = part.title.replace(/[/\\:*?"<>|]/g, '-').trim();
			const filePath = folderPath
				? normalizePath(`${folderPath}/${safeName}.md`)
				: normalizePath(`${safeName}.md`);

			const existing = this.app.vault.getAbstractFileByPath(filePath);
			if (existing) {
				skipped.push(safeName);
				continue;
			}

			const contentWithBacklink = `${part.content.trimEnd()}

ノートの分割元：[[${sourceName}]]`;
			const file = await this.app.vault.create(filePath, contentWithBacklink);
			created.push(file);
		}

		return { created, skipped };
	}
}
