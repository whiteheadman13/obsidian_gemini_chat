import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer, TFile } from 'obsidian';
import { GeminiService } from './geminiService';
import { ChatHistoryService } from './chatHistoryService';
import { promptForReferenceFiles } from './chatReferenceModal';
import type MyPlugin from './main';

export const CHAT_VIEW_TYPE = 'chat-view';

export class ChatView extends ItemView {
	private plugin: MyPlugin;
	private geminiService: GeminiService | null = null;
	private messageHistory: Array<{ role: string; content: string }> = [];
	private messagesContainer: HTMLElement | null = null;
	private inputField: HTMLTextAreaElement | null = null;
	private referenceFiles: TFile[] = [];
	private refFilesButton: HTMLButtonElement | null = null;

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

		this.inputField = inputContainer.createEl('textarea', {
			cls: 'chat-input',
			attr: {
				placeholder: 'メッセージを入力... (Ctrl+Enterで送信)',
				rows: '3',
			},
		});

		const buttonRow = inputContainer.createEl('div', {
			cls: 'chat-button-row',
		});

		// 参考ファイルボタン（選択済み件数を表示）
		this.refFilesButton = buttonRow.createEl('button', {
			cls: 'chat-ref-files-button',
			text: '参考ファイル',
		}) as HTMLButtonElement;

		const sendButton = buttonRow.createEl('button', {
			cls: 'chat-send-button',
			text: '送信',
		});

		const editNoteButton = buttonRow.createEl('button', {
			cls: 'chat-edit-note-button',
			text: 'AIでノート編集',
		});

		const saveButton = buttonRow.createEl('button', {
			cls: 'chat-save-button',
			text: '保存',
		});

		const clearButton = buttonRow.createEl('button', {
			cls: 'chat-clear-button',
			text: '履歴をクリア',
		});

		this.refFilesButton.addEventListener('click', async () => {
			const currentPaths = new Set(this.referenceFiles.map((f) => f.path));
			const result = await promptForReferenceFiles(this.app, currentPaths);
			if (result !== null) {
				this.referenceFiles = result.referenceFiles;
				this.updateRefFilesButton();
			}
		});

		sendButton.addEventListener('click', async () => {
			if (!this.inputField) return;
			const message = this.inputField.value;
			if (!message.trim()) return;
			if (this.referenceFiles.length > 0) {
				const referenceContents = await Promise.all(
					this.referenceFiles.map(async (file) => ({
						path: file.path,
						content: await this.app.vault.read(file),
					}))
				);
				this.handleSendMessage(this.buildMessageWithReferences(message, referenceContents));
			} else {
				this.handleSendMessage(message);
			}
			this.inputField.value = '';
		});

		editNoteButton.addEventListener('click', async () => {
			if (!this.inputField) return;
			const instruction = this.inputField.value.trim();
			if (!instruction) {
				new Notice('編集の指示をチャット欄に入力してください');
				return;
			}
			if (!this.app.workspace.getActiveFile()) {
				new Notice('編集対象のファイルを開いてください');
				return;
			}
			await this.plugin.fileEditService.editFileWithAI(instruction, this.referenceFiles);
			this.inputField.value = '';
		});

		saveButton.addEventListener('click', () => {
			this.handleSaveHistory();
		});

		clearButton.addEventListener('click', () => {
			this.messageHistory = [];
			this.referenceFiles = [];
			this.updateRefFilesButton();
			if (this.messagesContainer) {
				this.messagesContainer.empty();
			}
			new Notice('会話履歴をクリアしました');
		});

		// Ctrl+Enter で送信（参考ファイルも含む）
		if (this.inputField) {
			this.inputField.addEventListener('keydown', (event: KeyboardEvent) => {
				if (event.ctrlKey && event.key === 'Enter') {
					sendButton.click();
				}
			});
		}
	}

	async onClose() {
		// Nothing to clean up
	}

	private updateRefFilesButton() {
		if (!this.refFilesButton) return;
		const count = this.referenceFiles.length;
		this.refFilesButton.textContent = count > 0 ? `参考ファイル (${count})` : '参考ファイル';
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

	private renderUserMessage(container: HTMLElement, message: string): void {
		// 参考資料を含むメッセージかチェック
		const hasReferences = message.includes('[参考資料');
		if (!hasReferences) {
			// 通常のメッセージ
			container.setText(message);
			return;
		}

		// 最初の[参考資料...]までをテキスト部分とする
		const referenceIndex = message.indexOf('[参考資料');
		const textPart = message.substring(0, referenceIndex).trim();
		const referencesPart = message.substring(referenceIndex);

		// ユーザーのテキスト部分
		if (textPart) {
			const textEl = container.createEl('div', {
				cls: 'chat-message-text',
				text: textPart
			});
			textEl.style.marginBottom = '8px';
		}

		// 参考資料を表示
		const referencesLines = referencesPart.split('\n');
		let i = 0;
		while (i < referencesLines.length) {
			const line = referencesLines[i] ?? '';
			if (line.match(/^\[参考資料.*?:.*?\]$/)) {
				const detailsEl = container.createEl('details', {
					cls: 'chat-file-details'
				});

				const summaryEl = detailsEl.createEl('summary', {
					cls: 'chat-file-summary'
				});
				summaryEl.createSpan({
					text: '📚 ',
					cls: 'chat-file-icon'
				});
				summaryEl.createSpan({
					text: line.replace(/^\[|\]$/g, ''),
					cls: 'chat-file-name'
				});

				i++;
				let contentLines: string[] = [];
				let inCodeBlock = false;
				while (i < referencesLines.length) {
					const currentLine = referencesLines[i] ?? '';
					if (currentLine.includes('```')) {
						inCodeBlock = !inCodeBlock;
						if (inCodeBlock) {
							i++;
							continue;
						} else {
							i++;
							break;
						}
					}
					if (inCodeBlock) {
						contentLines.push(currentLine);
					}
					i++;
				}

				if (contentLines.length > 0) {
					const contentEl = detailsEl.createEl('pre', {
						cls: 'chat-file-content'
					});
					contentEl.createEl('code', {
						text: contentLines.join('\n')
					});
					summaryEl.createSpan({
						text: ` (${contentLines.length} 行)`,
						cls: 'chat-file-lines'
					});
				}
			} else {
				i++;
			}
		}
	}

	private buildMessageWithReferences(
		userMessage: string,
		referenceContents: Array<{ path: string; content: string }>
	): string {
		if (referenceContents.length === 0) {
			return userMessage;
		}

		let message = userMessage;
		referenceContents.forEach((ref, index) => {
			message += `\n\n[参考資料 ${index + 1}: ${ref.path}]\n\`\`\`\n${ref.content}\n\`\`\``;
		});
		return message;
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
			this.renderUserMessage(userMessageContentEl, message);
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

