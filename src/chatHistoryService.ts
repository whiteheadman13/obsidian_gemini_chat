import { App, Notice, TFolder, TFile } from 'obsidian';

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

			// Get the first user message as title
			const firstUserMessage = messageHistory.find(m => m.role === 'user')?.content || 'Chat';
			const sanitizedTitle = this.sanitizeFileName(firstUserMessage);

			// Create filename
			const fileName = `${sanitizedTitle}.md`;
			const filePath = `${folderPath}/${fileName}`.replace(/\/+/g, '/');

			// Format message history as markdown
			const content = this.formatChatHistory(messageHistory, new Date());

			// Create the file
			const file = await this.app.vault.create(filePath, content);

			new Notice('チャット履歴を保存しました');
			return file;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : '不明なエラー';
			new Notice(`チャット履歴の保存に失敗しました: ${errorMessage}`);
			console.error('Failed to save chat history:', error);
			return null;
		}
	}

	private sanitizeFileName(text: string): string {
		// Remove characters not allowed in Obsidian filenames
		// Disallowed: < > : " / \ | ? *
		let sanitized = text
			.replace(/[<>:"/\\|?*]/g, '')
			.trim();

		// Remove leading and trailing dots and spaces
		sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '');

		// Limit length to 200 characters (to prevent overly long filenames)
		if (sanitized.length > 200) {
			sanitized = sanitized.substring(0, 200);
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
