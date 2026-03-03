import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer } from 'obsidian';
import { GeminiService } from './geminiService';
import { ChatHistoryService } from './chatHistoryService';
import type MyPlugin from './main';

export const CHAT_VIEW_TYPE = 'chat-view';

export class ChatView extends ItemView {
	private plugin: MyPlugin;
	private geminiService: GeminiService | null = null;
	private messageHistory: Array<{ role: string; content: string }> = [];
	private messagesContainer: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.initializeGeminiService();
	}

	private initializeGeminiService() {
		if (this.plugin.settings.geminiApiKey) {
			this.geminiService = new GeminiService(this.plugin.settings.geminiApiKey);
		}
	}

	getViewType() {
		return CHAT_VIEW_TYPE;
	}

	getDisplayText() {
		return 'Chat';
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		if (!container) return;
		container.empty();
		container.createEl('div', { cls: 'chat-container' });

		// Create chat messages container
		this.messagesContainer = container.createEl('div', {
			cls: 'chat-messages',
		});
		this.messagesContainer.id = 'chat-messages';

		// Create input area
		const inputContainer = container.createEl('div', {
			cls: 'chat-input-container',
		});

		const inputField = inputContainer.createEl('textarea', {
			cls: 'chat-input',
			attr: {
				placeholder: 'メッセージを入力... (Ctrl+Enterで送信)',
				rows: '3',
			},
		});

		const buttonRow = inputContainer.createEl('div', {
			cls: 'chat-button-row',
		});

		const sendButton = buttonRow.createEl('button', {
			cls: 'chat-send-button',
			text: '送信',
		});

		const includeFileButton = buttonRow.createEl('button', {
			cls: 'chat-include-file-button',
			text: '現在のファイルを含めて送信',
		});

		const saveButton = buttonRow.createEl('button', {
			cls: 'chat-save-button',
			text: '保存',
		});

		const clearButton = buttonRow.createEl('button', {
			cls: 'chat-clear-button',
			text: '履歴をクリア',
		});

		sendButton.addEventListener('click', () => {
			this.handleSendMessage(inputField.value);
			inputField.value = '';
		});

		includeFileButton.addEventListener('click', async () => {
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) {
				new Notice('アクティブなファイルがありません');
				return;
			}
			const fileContent = await this.app.vault.read(activeFile);
			const message = `${inputField.value}\n\n[現在のファイル: ${activeFile.name}]\n\`\`\`\n${fileContent}\n\`\`\``;
			this.handleSendMessage(message);
			inputField.value = '';
		});

		saveButton.addEventListener('click', () => {
			this.handleSaveHistory();
		});

		clearButton.addEventListener('click', () => {
			this.messageHistory = [];
			if (this.messagesContainer) {
				this.messagesContainer.empty();
			}
			new Notice('会話履歴をクリアしました');
		});

		// Allow Ctrl+Enter to send message
		inputField.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.ctrlKey && event.key === 'Enter') {
				this.handleSendMessage(inputField.value);
				inputField.value = '';
			}
		});
	}

	async onClose() {
		// Nothing to clean up
	}

	private isMarkdownTableLine(line: string): boolean {
		const trimmedLine = line.trim();
		return trimmedLine.startsWith('|') && trimmedLine.includes('|');
	}

	private isMarkdownTableSeparator(line: string): boolean {
		const trimmedLine = line.trim();
		if (!trimmedLine.startsWith('|')) {
			return false;
		}
		const cells = trimmedLine
			.split('|')
			.map((cell) => cell.trim())
			.filter((cell) => cell.length > 0);
		if (cells.length === 0) {
			return false;
		}
		return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
	}

	private normalizeMarkdownForRender(content: string): string {
		const sourceLines = content.replace(/\r\n/g, '\n').split('\n');
		const normalizedLines = sourceLines.map((line) => line.replace(/^[\u3000\t ]+(?=\|)/, '').replace(/[\t ]+$/g, ''));

		const outputLines: string[] = [];
		for (let index = 0; index < normalizedLines.length; index += 1) {
			const currentLine = normalizedLines[index] ?? '';
			const nextLine = normalizedLines[index + 1] ?? '';
			const isTableStart = this.isMarkdownTableLine(currentLine) && this.isMarkdownTableSeparator(nextLine);

			if (isTableStart) {
				if (outputLines.length > 0 && outputLines[outputLines.length - 1]?.trim() !== '') {
					outputLines.push('');
				}

				while (index < normalizedLines.length && this.isMarkdownTableLine(normalizedLines[index] ?? '')) {
					outputLines.push((normalizedLines[index] ?? '').trimStart());
					index += 1;
				}

				if (index < normalizedLines.length && (normalizedLines[index] ?? '').trim() !== '') {
					outputLines.push('');
				}

				index -= 1;
				continue;
			}

			outputLines.push(currentLine);
		}

		return outputLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
	}

	private async renderAssistantMessage(container: HTMLElement, content: string): Promise<void> {
		const messageContentEl = container.createEl('div', {
			cls: 'chat-message-content markdown-rendered',
		});
		const normalizedContent = this.normalizeMarkdownForRender(content);
		await MarkdownRenderer.render(this.app, normalizedContent, messageContentEl, '/', this);
	}

	private async handleSendMessage(message: string) {
		if (!message.trim()) return;

		// Check if API key is set
		if (!this.plugin.settings.geminiApiKey) {
			new Notice('Gemini API keyを設定してください');
			return;
		}

		// Add user message to chat
		if (this.messagesContainer) {
			const userMessageEl = this.messagesContainer.createEl('div', {
				cls: 'chat-message user-message',
			});
			const userMessageContentEl = userMessageEl.createEl('div', {
				cls: 'chat-message-content',
			});
			userMessageContentEl.setText(message);
		}

		// Add to message history
		this.messageHistory.push({ role: 'user', content: message });

		// Show loading indicator
		if (this.messagesContainer) {
			const loadingEl = this.messagesContainer.createEl('div', {
				cls: 'chat-message assistant-message loading',
				text: '応答中...',
			});

			try {
				// Initialize service with current API key
				this.geminiService = new GeminiService(this.plugin.settings.geminiApiKey);

				// Call Gemini API
				const response = await this.geminiService.chat(this.messageHistory);

				// Remove loading indicator
				loadingEl.remove();

				// Add assistant message to chat
				const assistantMessageEl = this.messagesContainer.createEl('div', {
					cls: 'chat-message assistant-message',
				});
				await this.renderAssistantMessage(assistantMessageEl, response);

				// AIの応答がファイル編集に関連する場合、アクションボタンを追加
				if (this.isFileEditResponse(response)) {
					const actionContainer = assistantMessageEl.createEl('div', {
						cls: 'chat-message-actions',
					});
					
					const applyButton = actionContainer.createEl('button', {
						cls: 'chat-apply-edit-button',
						text: 'この変更を適用',
					});
					
					applyButton.addEventListener('click', async () => {
						const activeFile = this.app.workspace.getActiveFile();
						if (!activeFile) {
							new Notice('アクティブなファイルがありません');
							return;
						}
						
						// 元のファイル内容を取得
						const oldContent = await this.app.vault.read(activeFile);
						
						// AIの応答からコードブロックを抽出
						const newContent = this.extractCodeFromResponse(response);
						if (!newContent) {
							new Notice('修正内容が見つかりませんでした');
							return;
						}
						
						// DiffViewを表示
						await this.plugin.fileEditService.showDiffView(activeFile, oldContent, newContent);
					});
				}

				// Add to message history
				this.messageHistory.push({ role: 'assistant', content: response });

				// Scroll to bottom
				this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
			} catch (error) {
				loadingEl.remove();
				const errorEl = this.messagesContainer.createEl('div', {
					cls: 'chat-message assistant-message error',
					text: `エラー: ${error instanceof Error ? error.message : 'Unknown error'}`,
				});
				new Notice(`エラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
		}
	}

	private async handleSaveHistory() {
		const chatHistoryService = new ChatHistoryService(this.app);
		await chatHistoryService.saveChatHistory(
			this.plugin.settings.chatHistoryFolder,
			this.messageHistory
		);
	}

	/**
	 * AIの応答がファイル編集に関連するかをチェック
	 */
	private isFileEditResponse(response: string): boolean {
		// コードブロックが含まれているか、または特定のキーワードがあるかをチェック
		return response.includes('```') || 
			   response.toLowerCase().includes('修正') ||
			   response.toLowerCase().includes('変更');
	}

	/**
	 * AIの応答からコードブロックを抽出
	 */
	private extractCodeFromResponse(response: string): string | null {
		// ```で囲まれたコードブロックを抽出
		const codeBlockMatch = response.match(/```(?:\w+)?\n([\s\S]*?)\n```/);
		if (codeBlockMatch && codeBlockMatch[1]) {
			return codeBlockMatch[1];
		}
		return null;
	}
}

