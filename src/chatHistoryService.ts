import { App, Notice, TFile } from 'obsidian';

export class ChatHistoryService {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	async saveChatHistory(
		folderPath: string,
		messageHistory: Array<{ role: string; content: string }>
	): Promise<TFile | null> {
		if (!folderPath.trim()) {
			new Notice('チャット保存先フォルダが設定されていません');
			return null;
		}

		if (messageHistory.length === 0) {
			new Notice('保存するメッセージがありません');
			return null;
		}

		try {
			// Get or create the folder
			let folder = this.app.vault.getFolderByPath(folderPath);
			if (!folder) {
				folder = await this.app.vault.createFolder(folderPath);
			}

			// Use a short, safe title derived from the first user message.
			const sanitizedTitle = this.createFileTitleFromHistory(messageHistory);

			// Create filename (with deduplication)
			const basePath = `${folderPath}/${sanitizedTitle}`.replace(/\/+/g, '/');
			let finalPath = `${basePath}.md`;
			let counter = 1;
			while (this.app.vault.getAbstractFileByPath(finalPath)) {
				finalPath = `${basePath}_${counter}.md`;
				counter++;
			}

			// Format message history as markdown
			const content = this.formatChatHistory(messageHistory, new Date());

			// Create the file
			const file = await this.app.vault.create(finalPath, content);

			new Notice('チャット履歴を保存しました');
			return file;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : '不明なエラー';
			new Notice(`チャット履歴の保存に失敗しました: ${errorMessage}`);
			console.error('Failed to save chat history:', error);
			return null;
		}
	}

	private createFileTitleFromHistory(
		messageHistory: Array<{ role: string; content: string }>
	): string {
		const firstUserMessage = messageHistory.find(m => m.role === 'user')?.content || 'Chat';
		const firstNonEmptyLine = firstUserMessage
			.split(/\r?\n/)
			.map(line => line.trim())
			.find(line => line.length > 0) || 'Chat';

		return this.sanitizeFileName(firstNonEmptyLine);
	}

	private sanitizeFileName(text: string): string {
		// Remove control chars and characters disallowed in Windows/Obsidian filenames.
		// Disallowed: control chars, < > : " / \ | ? *
		let sanitized = text
			.replace(/[\u0000-\u001F\u007F]/g, '')
			.replace(/[<>:"/\\|?*]/g, '')
			.replace(/\s+/g, ' ')
			.trim();

		// Remove leading and trailing dots and spaces
		sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '');

		// Avoid Windows reserved filenames.
		if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(sanitized)) {
			sanitized = `_${sanitized}`;
		}

		// Keep filenames short to avoid full-path length limits on Windows.
		if (sanitized.length > 80) {
			sanitized = sanitized.substring(0, 80).trim();
		}

		// If the result is empty, use a default
		if (!sanitized) {
			sanitized = 'Chat';
		}

		return sanitized;
	}

	private formatChatHistory(
		messageHistory: Array<{ role: string; content: string }>,
		savedAt: Date
	): string {
		// Get the first user message as title
		const firstUserMessage = messageHistory.find(m => m.role === 'user')?.content || 'チャット';
		const truncatedTitle = firstUserMessage.length > 100 
			? firstUserMessage.substring(0, 100) + '...' 
			: firstUserMessage;

		let content = `# ${truncatedTitle}\n\n`;
		content += `**保存日時**: ${savedAt.toLocaleString('ja-JP')}\n\n`;
		content += `---\n\n`;

		for (const message of messageHistory) {
			const role = message.role === 'user' ? 'ユーザー' : 'AI';
			content += `## ${role}\n\n`;
			content += `${message.content}\n\n`;
		}

		return content;
	}
}
