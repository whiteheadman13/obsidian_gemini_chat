import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
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
			userMessageEl.createEl('p', { text: message });
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
				assistantMessageEl.createEl('p', { text: response });

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
}

