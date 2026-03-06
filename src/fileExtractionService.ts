// legacy build + worker.entry をバンドルに含めることで、外部 worker URL が不要になる
// eslint-disable-next-line @typescript-eslint/no-require-imports
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
// worker entry を import すると window.pdfjsWorker がセットされ、インライン実行モードになる
import 'pdfjs-dist/legacy/build/pdf.worker.entry';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { parseStringPromise } from 'xml2js';

/**
 * ファイル抽出結果
 */
export interface ExtractionResult {
	success: boolean;
	content: string;
	fileType: string;
	error?: string;
}

/**
 * ファイル形式別テキスト抽出サービス
 */
export class FileExtractionService {
	// pdfjs-dist 3.x: workerSrc を設定しない場合、自動的にフェイクワーカーを使用
	// Obsidian (Electron) 環境では外部 URL が使えないため、この方式を採用

	/**
	 * ファイルをバイナリで読んで、形式に応じてテキストを抽出
	 */
	async extractText(
		arrayBuffer: ArrayBuffer,
		filename: string
	): Promise<ExtractionResult> {
		const ext = this.getFileExtension(filename).toLowerCase();

		try {
			switch (ext) {
				case 'pdf':
					return await this.extractFromPDF(arrayBuffer);
				case 'pptx':
					return await this.extractFromPPTX(arrayBuffer);
				case 'docx':
					return await this.extractFromDOCX(arrayBuffer);
				case 'txt':
					return this.extractFromTXT(arrayBuffer);
				default:
					return {
						success: false,
						content: '',
						fileType: ext,
						error: `未対応のファイル形式です: .${ext}`,
					};
			}
		} catch (error) {
			return {
				success: false,
				content: '',
				fileType: ext,
				error: `抽出エラー: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * PDF テキスト抽出
	 */
	private async extractFromPDF(arrayBuffer: ArrayBuffer): Promise<ExtractionResult> {
		try {
			const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
			let content = '';

			for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
				const page = await pdf.getPage(pageNum);
				const textContent = await page.getTextContent();
				const pageText = textContent.items
					.map((item: any) => item.str)
					.join('');

				content += `【ページ${pageNum}】\n${pageText}\n\n`;
			}

			return {
				success: true,
				content,
				fileType: 'pdf',
			};
		} catch (error) {
			throw error;
		}
	}

	/**
	 * PPTX テキスト抽出
	 */
	private async extractFromPPTX(arrayBuffer: ArrayBuffer): Promise<ExtractionResult> {
		try {
			const zip = new JSZip();
			await zip.loadAsync(arrayBuffer);

			const slideFiles = Object.keys(zip.files).filter(
				(name) => name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
			);

			// スライドナンバーでソート (slide1.xml, slide2.xml, ...)
			slideFiles.sort((a, b) => {
				const numA = parseInt(a.match(/\d+/)![0]);
				const numB = parseInt(b.match(/\d+/)![0]);
				return numA - numB;
			});

			let content = '';

			for (const slideFile of slideFiles) {
				const slideNum = slideFile.match(/\d+/)![0];
				const xmlData = await zip.file(slideFile)!.async('string');
				const slideText = await this.extractTextFromSlideXML(xmlData);

				content += `【スライド${slideNum}】\n${slideText}\n\n`;
			}

			return {
				success: true,
				content,
				fileType: 'pptx',
			};
		} catch (error) {
			throw error;
		}
	}

	/**
	 * PPTX のスライド XML からテキスト抽出
	 */
	private async extractTextFromSlideXML(xmlString: string): Promise<string> {
		try {
			const result = await parseStringPromise(xmlString);

			const textElements: string[] = [];

			// XML を再帰的に走査してすべてのテキストを抽出
			const walk = (obj: any) => {
				if (typeof obj === 'string') {
					const trimmed = obj.trim();
					if (trimmed) {
						textElements.push(trimmed);
					}
				} else if (Array.isArray(obj)) {
					obj.forEach(walk);
				} else if (typeof obj === 'object' && obj !== null) {
					Object.values(obj).forEach(walk);
				}
			};

			walk(result);
			return textElements.join('\n');
		} catch (error) {
			// XML パースに失敗した場合
			return 'テキスト抽出失敗';
		}
	}

	/**
	 * DOCX テキスト抽出
	 */
	private async extractFromDOCX(arrayBuffer: ArrayBuffer): Promise<ExtractionResult> {
		try {
			const result = await mammoth.extractRawText({ arrayBuffer });

			return {
				success: true,
				content: result.value,
				fileType: 'docx',
			};
		} catch (error) {
			throw error;
		}
	}

	/**
	 * テキストファイル抽出
	 */
	private extractFromTXT(arrayBuffer: ArrayBuffer): ExtractionResult {
		try {
			const decoder = new TextDecoder('utf-8');
			const content = decoder.decode(arrayBuffer);

			return {
				success: true,
				content,
				fileType: 'txt',
			};
		} catch (error) {
			throw error;
		}
	}

	/**
	 * ファイル名から拡張子を取得
	 */
	private getFileExtension(filename: string): string {
		const match = filename.match(/\.([^.]+)$/);
		return match && match[1] ? match[1] : '';
	}

	/**
	 * ファイル形式がサポートされているかチェック
	 */
	static isSupportedFileType(filename: string): boolean {
		const ext = filename.split('.').pop()?.toLowerCase();
		return ['pdf', 'pptx', 'docx', 'txt'].includes(ext || '');
	}

	/**
	 * ファイルタイプを判定
	 */
	static getFileType(filename: string): string {
		const ext = filename.split('.').pop()?.toLowerCase();
		return ext || 'unknown';
	}
}
