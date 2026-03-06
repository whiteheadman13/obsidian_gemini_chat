import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer, TFile, TFolder, setIcon, SuggestModal } from 'obsidian';
import { GeminiService } from './geminiService';
import { ChatHistoryService } from './chatHistoryService';
import { ChatReferenceService, type ParsedAtReference } from './chatReferenceService';
import { SaveNoteModal } from './modals/saveNoteModal';
import type MyPlugin from './main';

export const CHAT_VIEW_TYPE = 'chat-view';

export class ChatView extends ItemView {
	private plugin: MyPlugin;
	private geminiService: GeminiService | null = null;
	private chatReferenceService: ChatReferenceService;
	private messageHistory: Array<{ role: string; content: string }> = [];
	private messagesContainer: HTMLElement | null = null;
	private inputField: HTMLTextAreaElement | null = null;
	private autocompleteContainer: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.chatReferenceService = new ChatReferenceService(this.app);
		this.initializeGeminiService();
	}

	private initializeGeminiService() {
		if (this.plugin.settings.geminiApiKey) {
			this.geminiService = new GeminiService(this.plugin.settings.geminiApiKey, this.plugin.settings.geminiModel);
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
				placeholder: 'メッセージを入力... (@outNoteFormat: @instruction: @reference: @outFolder: @file: で参照可能、Ctrl+Enterで送信)',
				rows: '3',
			},
		});

		// Create autocomplete container
		this.autocompleteContainer = inputContainer.createEl('div', {
			cls: 'chat-autocomplete-container',
		});
		this.autocompleteContainer.style.display = 'none';

		const buttonRow = inputContainer.createEl('div', {
			cls: 'chat-button-row',
		});

	const sendButton = buttonRow.createEl('button', {
		cls: 'chat-send-button',
		text: '送信',
	});

		const attachButton = buttonRow.createEl('button', {
			cls: 'chat-attach-button',
			attr: {
				'title': 'ファイルを添付',
				'aria-label': 'ファイルを添付',
			},
		});
		setIcon(attachButton, 'paperclip');

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

		attachButton.addEventListener('click', async () => {
			await this.openAttachmentSelector();
		});

		// ドラッグ&ドロップイベントを追加
		this.setupDragAndDrop(inputContainer);

		sendButton.addEventListener('click', async () => {
			if (!this.inputField) return;
			const inputText = this.inputField.value;
			if (!inputText.trim()) return;

			// @参照をパース
			const { references, cleanedText } = this.chatReferenceService.parseAtReferences(inputText);

			// @参照がある場合は検証＆読み込み
			let finalMessage = cleanedText;
			let resolvedReferences: ParsedAtReference[] = [];
			if (references.length > 0) {
				resolvedReferences = await this.chatReferenceService.resolveReferences(references);

				// 無効な参照があるかチェック
				if (!this.chatReferenceService.validateReferences(resolvedReferences)) {
					// エラーがあれば送信をキャンセル（ユーザーに通知済み）
					return;
				}

				// プロンプトを@参照を含めて再構築
				finalMessage = this.chatReferenceService.buildPromptWithReferences(cleanedText, resolvedReferences);
			}

			this.handleSendMessage(finalMessage, resolvedReferences);
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
			await this.plugin.fileEditService.editFileWithAI(instruction, []);
			this.inputField.value = '';
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

		// Ctrl+Enter で送信（参考ファイルも含む）
		if (this.inputField) {
			this.inputField.addEventListener('keydown', (event: KeyboardEvent) => {
				if (event.ctrlKey && event.key === 'Enter') {
					sendButton.click();
					return;
				}

				// Tabキーで候補選択に移動
				if (event.key === 'Tab' && this.autocompleteContainer && this.autocompleteContainer.style.display === 'block') {
					event.preventDefault();
					const firstItem = this.autocompleteContainer.querySelector('.chat-autocomplete-item') as HTMLElement;
					if (firstItem) {
						firstItem.focus();
					}
					return;
				}

				// Escでオートコンプリートを閉じる
				if (event.key === 'Escape' && this.autocompleteContainer) {
					this.autocompleteContainer.style.display = 'none';
				}
			});

			// オートコンプリート入力イベント
			this.inputField.addEventListener('input', () => {
				this.updateAutocomplete();
			});

			// クリップボードからの画像貼り付け
			this.inputField.addEventListener('paste', async (event: ClipboardEvent) => {
				if (!event.clipboardData) return;
				const items = Array.from(event.clipboardData.items);
				const imageItems = items.filter(item => item.type.startsWith('image/'));
				if (imageItems.length === 0) return;

				event.preventDefault();
				for (const item of imageItems) {
					const blob = item.getAsFile();
					if (!blob) continue;
					// 拡張子を MIME タイプから決定
					const ext = item.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
					const filename = `clipboard_${Date.now()}.${ext}`;
					const file = new File([blob], filename, { type: item.type });
					try {
						const savedPath = await this.saveAttachmentFile(file);
						new Notice(`クリップボード画像を保存しました: ${filename}`, 3000);
						this.insertAttachmentReference(savedPath);
					} catch (error) {
						new Notice(`貼り付けエラー: ${error instanceof Error ? error.message : String(error)}`, 5000);
					}
				}
			});
		}
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

	private renderUserMessage(container: HTMLElement, message: string, references: ParsedAtReference[] = []): void {
		// セクションマーカーを検出
		const sectionMarkers = ['【参考資料】', '【添付ファイル】', '【指示事項・ルール】', '【出力ノートフォーマット】'];
		const markerIndexes = sectionMarkers.map(m => message.indexOf(m)).filter(idx => idx !== -1);
		const hasReferences = markerIndexes.length > 0 || message.includes('[参考資料');
		if (!hasReferences) {
			// 通常のメッセージ
			container.setText(message);
			return;
		}

		// 最初のセクションより前をテキスト部分とする
		const firstMarkerIdx = markerIndexes.length > 0
			? Math.min(...markerIndexes)
			: message.indexOf('[参考資料');
		const textPart = message.substring(0, firstMarkerIdx).trim();
		const referencesPart = message.substring(firstMarkerIdx);

		// ユーザーのテキスト部分
		if (textPart) {
			const textEl = container.createEl('div', {
				cls: 'chat-message-text',
				text: textPart
			});
			textEl.style.marginBottom = '8px';
		}

		// 添付ファイルをリンクチップとして表示
		const fileRefs = references.filter(ref => ref.type === 'file' && ref.isValid);
		if (fileRefs.length > 0) {
			const fileLinksEl = container.createEl('div', { cls: 'chat-file-attachments' });
			fileRefs.forEach(ref => {
				const chip = fileLinksEl.createEl('span', { cls: 'chat-file-chip' });
				chip.createSpan({ text: '📎 ', cls: 'chat-file-icon' });
				const nameEl = chip.createEl('a', {
					text: ref.file?.basename || ref.filePath,
					cls: 'chat-file-link',
				});
				nameEl.setAttribute('href', '#');
				if (ref.fileType) {
					chip.createSpan({ text: ` (${ref.fileType.toUpperCase()})`, cls: 'chat-file-type' });
				}
				nameEl.addEventListener('click', (e) => {
					e.preventDefault();
					if (ref.file) {
						this.app.workspace.openLinkText(ref.file.path, '', false);
					}
				});
			});
		}

		// 参考資料を表示
		const referencesLines = referencesPart.split('\n');
		let i = 0;
		while (i < referencesLines.length) {
			const line = referencesLines[i] ?? '';
			if (line.match(/^\[添付ファイル.*?:.*?\]$/)) {
				// リンクは上で表示済みのためコンテンツブロックをスキップ
				i++;
				let inBlock = false;
				while (i < referencesLines.length) {
					const l = referencesLines[i] ?? '';
					if (l.trim() === '```') {
						if (!inBlock) { inBlock = true; i++; continue; }
						else { i++; break; }
					}
					i++;
				}
			} else if (line.match(/^\[参考資料.*?:.*?\]$/)) {
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

	private async handleSendMessage(message: string, references: ParsedAtReference[] = []) {
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
			this.renderUserMessage(userMessageContentEl, message, references);
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
				this.geminiService = new GeminiService(this.plugin.settings.geminiApiKey, this.plugin.settings.geminiModel);

				// 画像添付がある場合は inlineData として渡す
				const inlineImages = references
					.filter(ref => ref.type === 'file' && ref.isValid && ref.imageData && ref.mimeType)
					.map(ref => ({ mimeType: ref.mimeType!, data: ref.imageData! }));

				// Call Gemini API
				const response = await this.geminiService.chat(
					this.messageHistory,
					inlineImages.length > 0 ? inlineImages : undefined
				);

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

				// @outFolder: が指定されている場合は、モーダルでノート保存を提案
				const targetFolder = this.chatReferenceService.getTargetFolder(references);
				if (targetFolder) {
					// AIからタイトルを提案させるプロンプトを生成
					const suggestedTitlePrompt = this.generateTitleSuggestionPrompt(response);
					
					try {
						// Geminiに短いタイトルを提案させる
						this.geminiService = new GeminiService(this.plugin.settings.geminiApiKey, this.plugin.settings.geminiModel);
						const titleResponse = await this.geminiService.generateTitle(suggestedTitlePrompt);
						
						// ユーザーに確認を求めるモーダルを表示
						const modal = new SaveNoteModal(this.app, titleResponse, targetFolder, async (result) => {
							if (result.save) {
								// ファイルを保存
								const file = await this.chatReferenceService.saveResponseToFile(
									targetFolder,
									result.title,
									response
								);
								if (file) {
									// 保存成功時は、保存ボタンの横にリンクを追加
									const saveConfirmEl = assistantMessageEl.createEl('div', {
										cls: 'chat-file-saved-info',
									});
									const fileLink = saveConfirmEl.createEl('a', {
										text: `📄 保存されました: ${file.basename}`,
										attr: {
											href: '#',
										},
									});
									fileLink.addEventListener('click', (e) => {
										e.preventDefault();
										this.app.workspace.getLeaf(false).openFile(file);
									});
								}
							}
						});
						modal.open();
					} catch (titleError) {
						console.error('タイトル生成エラー:', titleError);
						// タイトル生成に失敗した場合は、ユーザーに直接入力させる
						const modal = new SaveNoteModal(this.app, '新しいノート', targetFolder, async (result) => {
							if (result.save) {
								const file = await this.chatReferenceService.saveResponseToFile(
									targetFolder,
									result.title,
									response
								);
								if (file) {
									// 保存成功時は、保存ボタンの横にリンクを追加
									const saveConfirmEl = assistantMessageEl.createEl('div', {
										cls: 'chat-file-saved-info',
									});
									const fileLink = saveConfirmEl.createEl('a', {
										text: `📄 保存されました: ${file.basename}`,
										attr: {
											href: '#',
										},
									});
									fileLink.addEventListener('click', (e) => {
										e.preventDefault();
										this.app.workspace.getLeaf(false).openFile(file);
									});
								}
							}
						});
						modal.open();
					}
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

	/**
	 * オートコンプリート候補を更新
	 */
	private updateAutocomplete() {
		if (!this.inputField || !this.autocompleteContainer) return;

		const text = this.inputField.value;
		const cursorPos = this.inputField.selectionStart;

		// カーソル位置での@トークンを検索
		const atToken = this.findAtTokenAtCursor(text, cursorPos);
		if (!atToken) {
			this.autocompleteContainer.style.display = 'none';
			return;
		}

		// @だけ、または @o のような部分入力の場合はタイプ選択を表示
		if (atToken === '@' || /^@[a-zA-Z]*$/.test(atToken)) {
			const partialInput = atToken.substring(1); // @ を除いた部分
			this.renderTypeSelection(partialInput);
			return;
		}

		// 入力パターンを解析（@outNoteFormat: / @instruction: / @reference: / @outFolder: / @file:）
		const match = atToken.match(/^@(outNoteFormat|instruction|reference|outFolder|attachment):(.*)$/);
		if (!match) {
			this.autocompleteContainer.style.display = 'none';
			return;
		}

		const [, type, pattern] = match;
		
		// @outFolder: の場合はフォルダ一覧、それ以外はファイル一覧
		if (type === 'outFolder') {
			const folders = this.filterFoldersForPattern(pattern || '');
			if (folders.length === 0) {
				this.autocompleteContainer.style.display = 'none';
				return;
			}
			this.renderFolderAutocompleteList(folders);
		} else {
			const files = this.filterFilesForPattern(pattern || '');
			if (files.length === 0) {
				this.autocompleteContainer.style.display = 'none';
				return;
			}
			// 補完リストを表示
			this.renderAutocompleteList(type as 'outNoteFormat' | 'instruction' | 'reference' | 'outFolder', pattern || '', files, atToken);
		}
	}

	/**
	 * カーソル位置での@トークンを検索
	 * 例: "@outNoteFormat:notes/課" (大文字は省略可) を返す
	 */
	private findAtTokenAtCursor(text: string, cursorPos: number): string | null {
		// カーソル前の文字列を取得
		const beforeCursor = text.substring(0, cursorPos);

		// 最後の@を探す
		const lastAtIndex = beforeCursor.lastIndexOf('@');
		if (lastAtIndex === -1) return null;

		// @から現在のカーソル位置までのトークンを取得
		const token = beforeCursor.substring(lastAtIndex);

		// @だけ、または @(outNoteFormat|instruction|reference|outFolder|file):で始まるかチェック
		if (token === '@' || /^@(outNoteFormat|instruction|reference|outFolder|file):?(?:[^\s]*)?$/.test(token)) {
			return token;
		}

		return null;
	}

	/**
	 * パターンに基づいてVault内のファイルをフィルタリング
	 */
	private filterFilesForPattern(pattern: string): TFile[] {
		const allFiles = this.app.vault
			.getMarkdownFiles()
			.filter(file => {
				// パターンが空の場合はすべて表示
				if (!pattern) return true;
				
				const lowerPattern = pattern.toLowerCase();
				// ファイル名またはパス全体で検索
				return file.basename.toLowerCase().includes(lowerPattern) ||
					   file.path.toLowerCase().includes(lowerPattern);
			})
			.slice(0, 10); // 最大10件

		return allFiles;
	}

	/**
	 * パターンに基づいてVault内のフォルダをフィルタリング
	 */
	private filterFoldersForPattern(pattern: string): string[] {
		const allFolders = this.app.vault
			.getAllLoadedFiles()
			.filter(file => file instanceof TFolder) // フォルダのみ
			.map(folder => folder.path)
			.filter(path => {
				// ルートフォルダを除外
				if (!path) return false;
				
				// パターンが空の場合はすべて表示
				if (!pattern) return true;
				
				const lowerPattern = pattern.toLowerCase();
				// パス全体で検索
				return path.toLowerCase().includes(lowerPattern);
			})
			.slice(0, 10); // 最大10件

		return allFolders;
	}

	/**
	 * タイプ選択（@のみ入力時）を表示
	 */
	private renderTypeSelection(partialInput: string = '') {
		if (!this.autocompleteContainer || !this.inputField) return;

		this.autocompleteContainer.empty();

		const listEl = this.autocompleteContainer.createEl('ul', {
			cls: 'chat-autocomplete-list',
		});

		const types = [
			{ value: 'outNoteFormat', label: 'outNoteFormat: 出力ノートフォーマット', description: '出力するノートのフォーマット・テンプレート' },
			{ value: 'instruction', label: 'instruction: 指示事項・ルール', description: '遵守すべき制約条件・ガイドライン' },
			{ value: 'reference', label: 'reference: 参考資料', description: '背景情報・過去の事例・参考データ' },
			{ value: 'outFolder', label: 'outFolder: 出力先フォルダ', description: '結果の保存先を指定' },
			{ value: 'file', label: 'file: 添付ファイル', description: 'PDF、PowerPoint、Word、テキストファイル' },
		];

		// partialInputでフィルタリング
		const filteredTypes = types.filter(type => {
			if (!partialInput) return true;
			return type.value.toLowerCase().startsWith(partialInput.toLowerCase());
		});

		if (filteredTypes.length === 0) {
			this.autocompleteContainer.style.display = 'none';
			return;
		}

		filteredTypes.forEach((type, index) => {
			const itemEl = listEl.createEl('li', {
				cls: 'chat-autocomplete-item',
				attr: {
					'data-index': index.toString(),
					'tabindex': '0',
				},
			});

			const labelEl = itemEl.createEl('div', {
				cls: 'chat-autocomplete-type-label',
				text: type.label,
			});

			const descEl = itemEl.createEl('div', {
				cls: 'chat-autocomplete-type-desc',
				text: type.description,
			});

			itemEl.addEventListener('click', () => {
				this.insertTypeSelection(type.value);
			});

			itemEl.addEventListener('mouseenter', () => {
				itemEl.addClass('hover');
			});

			itemEl.addEventListener('mouseleave', () => {
				itemEl.removeClass('hover');
			});

			// Enterキーで選択
			itemEl.addEventListener('keydown', (event: KeyboardEvent) => {
				if (event.key === 'Enter') {
					this.insertTypeSelection(type.value);
					event.preventDefault();
				} else if (event.key === 'ArrowDown') {
					// 次の候補に移動
					const nextItem = itemEl.nextElementSibling as HTMLElement;
					if (nextItem) {
						nextItem.focus();
					}
					event.preventDefault();
				} else if (event.key === 'ArrowUp') {
					// 前の候補に移動
					const prevItem = itemEl.previousElementSibling as HTMLElement;
					if (prevItem) {
						prevItem.focus();
					}
					event.preventDefault();
				}
			});
		});

		// リストを表示
		this.autocompleteContainer.style.display = 'block';
	}

	/**
	 * 補完リストを描画＆表示
	 */
	/**
	 * 補完リストを描画＆表示
	 */
	private renderAutocompleteList(
		type: 'outNoteFormat' | 'instruction' | 'reference' | 'outFolder' | 'file',
		pattern: string,
		files: TFile[],
		currentToken: string
	) {
		if (!this.autocompleteContainer || !this.inputField) return;

		this.autocompleteContainer.empty();

		// file 型の場合は対応するファイル形式だけをフィルタリング
		let filteredFiles = files;
		if (type === 'file') {
			const supportedExtensions = ['pdf', 'pptx', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp'];
			filteredFiles = files.filter(file => {
				const ext = file.extension.toLowerCase();
				return supportedExtensions.includes(ext);
			});
		}

		const listEl = this.autocompleteContainer.createEl('ul', {
			cls: 'chat-autocomplete-list',
		});

		filteredFiles.forEach((file, index) => {
			const itemEl = listEl.createEl('li', {
				cls: 'chat-autocomplete-item',
				attr: {
					'data-index': index.toString(),
					'tabindex': '0',
				},
			});

			// ファイル名を太字で、パスを薄く表示
			const nameEl = itemEl.createEl('span', {
				cls: 'chat-autocomplete-filename',
				text: file.basename,
			});

			// フォルダパスがある場合は表示
			const folderPath = file.path.substring(0, file.path.lastIndexOf('/'));
			if (folderPath) {
				itemEl.createEl('span', {
					cls: 'chat-autocomplete-filepath',
					text: ` (${folderPath})`,
				});
			}

			itemEl.addEventListener('click', () => {
				this.insertAutocompleteSelection(type, file.path);
				this.autocompleteContainer!.style.display = 'none';
			});

			itemEl.addEventListener('mouseenter', () => {
				itemEl.addClass('hover');
			});

			itemEl.addEventListener('mouseleave', () => {
				itemEl.removeClass('hover');
			});

			// Enterキーで選択
			itemEl.addEventListener('keydown', (event: KeyboardEvent) => {
				if (event.key === 'Enter') {
					this.insertAutocompleteSelection(type, file.path);
					this.autocompleteContainer!.style.display = 'none';
					event.preventDefault();
				} else if (event.key === 'ArrowDown') {
					// 次の候補に移動
					const nextItem = itemEl.nextElementSibling as HTMLElement;
					if (nextItem) {
						nextItem.focus();
					}
					event.preventDefault();
				} else if (event.key === 'ArrowUp') {
					// 前の候補に移動
					const prevItem = itemEl.previousElementSibling as HTMLElement;
					if (prevItem) {
						prevItem.focus();
					}
					event.preventDefault();
				}
			});
		});

		// リストを表示
		this.autocompleteContainer.style.display = 'block';
	}

	/**
	 * オートコンプリート選択をテキストに挿入
	 */
	private insertAutocompleteSelection(type: 'outNoteFormat' | 'instruction' | 'reference' | 'outFolder' | 'file', filePath: string) {
		if (!this.inputField) return;

		const text = this.inputField.value;
		const cursorPos = this.inputField.selectionStart;

		// 最後の@を探す
		const beforeCursor = text.substring(0, cursorPos);
		const lastAtIndex = beforeCursor.lastIndexOf('@');

		if (lastAtIndex === -1) return;

		// @から現在位置までを置換
		const beforeAt = text.substring(0, lastAtIndex);
		const afterCursor = text.substring(cursorPos);

		// 新しいテキストを構築
		const completion = `@${type}:${filePath}`;
		const newText = beforeAt + completion + ' ' + afterCursor;

		// テキストフィールドを更新
		this.inputField.value = newText;

		// カーソル位置を更新（挿入後）
		const newCursorPos = beforeAt.length + completion.length + 1;
		this.inputField.selectionStart = newCursorPos;
		this.inputField.selectionEnd = newCursorPos;

		// フォーカスを戻す
		this.inputField.focus();
	}

	/**
	 * タイプ選択をテキストに挿入
	 */
	private insertTypeSelection(type: string) {
		if (!this.inputField || !this.autocompleteContainer) return;

		const text = this.inputField.value;
		const cursorPos = this.inputField.selectionStart;

		// 最後の@を探す
		const beforeCursor = text.substring(0, cursorPos);
		const lastAtIndex = beforeCursor.lastIndexOf('@');

		if (lastAtIndex === -1) return;

		// @から現在位置までを置換
		const beforeAt = text.substring(0, lastAtIndex);
		const afterCursor = text.substring(cursorPos);

		// 新しいテキストを構築（@type: まで挿入）
		const completion = `@${type}:`;
		const newText = beforeAt + completion + afterCursor;

		// テキストフィールドを更新
		this.inputField.value = newText;

		// カーソル位置を更新（: の後ろ）
		const newCursorPos = beforeAt.length + completion.length;
		this.inputField.selectionStart = newCursorPos;
		this.inputField.selectionEnd = newCursorPos;

		// 補完メニューを閉じる
		this.autocompleteContainer.style.display = 'none';

		// フォーカスを戻す & 再度補完トリガー
		this.inputField.focus();
		
		// inputイベントを発火させてファイル候補を表示
		setTimeout(() => {
			this.updateAutocomplete();
		}, 10);
	}

	/**
	 * フォルダ補完リストを描画＆表示
	 */
	private renderFolderAutocompleteList(folders: string[]) {
		if (!this.autocompleteContainer || !this.inputField) return;

		this.autocompleteContainer.empty();

		const listEl = this.autocompleteContainer.createEl('ul', {
			cls: 'chat-autocomplete-list',
		});

		folders.forEach((folderPath, index) => {
			const itemEl = listEl.createEl('li', {
				cls: 'chat-autocomplete-item',
				text: folderPath,
				attr: {
					'data-index': index.toString(),
					'tabindex': '0',
				},
			});

			itemEl.addEventListener('click', () => {
				this.insertFolderSelection(folderPath);
				this.autocompleteContainer!.style.display = 'none';
			});

			itemEl.addEventListener('mouseenter', () => {
				itemEl.addClass('hover');
			});

			itemEl.addEventListener('mouseleave', () => {
				itemEl.removeClass('hover');
			});

			// Enterキーで選択
			itemEl.addEventListener('keydown', (event: KeyboardEvent) => {
				if (event.key === 'Enter') {
					this.insertFolderSelection(folderPath);
					this.autocompleteContainer!.style.display = 'none';
					event.preventDefault();
				} else if (event.key === 'ArrowDown') {
					const nextItem = itemEl.nextElementSibling as HTMLElement;
					if (nextItem) {
						nextItem.focus();
					}
					event.preventDefault();
				} else if (event.key === 'ArrowUp') {
					const prevItem = itemEl.previousElementSibling as HTMLElement;
					if (prevItem) {
						prevItem.focus();
					}
					event.preventDefault();
				}
			});
		});

		// リストを表示
		this.autocompleteContainer.style.display = 'block';
	}

	/**
	 * フォルダ選択をテキストに挿入
	 */
	/**
	 * AIにタイトル提案用プロンプトを生成
	 */
	private generateTitleSuggestionPrompt(response: string): string {
		// 最初の200文字を使用
		const preview = response.substring(0, 200).trim();
		return `以下の内容に対して、短いタイトル（5～15文字程度）を1つだけ提案してください。タイトルのみを返してください。改行や説明は不要です。\n\n${preview}...`;
	}

	private insertFolderSelection(folderPath: string) {
		if (!this.inputField) return;

		const text = this.inputField.value;
		const cursorPos = this.inputField.selectionStart;

		// 最後の@を探す
		const beforeCursor = text.substring(0, cursorPos);
		const lastAtIndex = beforeCursor.lastIndexOf('@');

		if (lastAtIndex === -1) return;

		// @から現在位置までを置換
		const beforeAt = text.substring(0, lastAtIndex);
		const afterCursor = text.substring(cursorPos);

		// 新しいテキストを構築
		const completion = `@outFolder:${folderPath}`;
		const newText = beforeAt + completion + ' ' + afterCursor;

		// テキストフィールドを更新
		this.inputField.value = newText;

		// カーソル位置を更新（挿入後）
		const newCursorPos = beforeAt.length + completion.length + 1;
		this.inputField.selectionStart = newCursorPos;
		this.inputField.selectionEnd = newCursorPos;

		// フォーカスを戻す
		this.inputField.focus();
	}

	/**
	 * 添付ファイル選択モーダルを開く
	 */
	private async openAttachmentSelector() {
		// Vault からすべてのファイルを取得
		const allFiles = this.app.vault.getFiles();

		// 対応するファイル形式だけをフィルタリング
		const supportedExtensions = ['pdf', 'pptx', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp'];
		const attachmentFiles = allFiles.filter(file => {
			const ext = file.extension.toLowerCase();
			return supportedExtensions.includes(ext);
		});

		if (attachmentFiles.length === 0) {
			new Notice('対応するファイル（PDF、PowerPoint、Word、テキスト、画像）が見つかりません');
			return;
		}

		// ファイル選択モーダルを開く
		const modal = new AttachmentFileModal(this.app, attachmentFiles, (filePath: string) => {
			this.insertAttachmentReference(filePath);
		});
		modal.open();
	}

	/**
	 * 添付ファイル参照をテキストに挿入
	 */
	private insertAttachmentReference(filePath: string) {
		if (!this.inputField) return;

		const text = this.inputField.value;
		const cursorPos = this.inputField.selectionStart;

		// カーソル位置に挿入
		const beforeCursor = text.substring(0, cursorPos);
		const afterCursor = text.substring(cursorPos);

		const attachmentRef = `@file:${filePath} `;
		const newText = beforeCursor + attachmentRef + afterCursor;

		// テキストフィールドを更新
		this.inputField.value = newText;

		// カーソル位置を更新
		const newCursorPos = beforeCursor.length + attachmentRef.length;
		this.inputField.selectionStart = newCursorPos;
		this.inputField.selectionEnd = newCursorPos;

		// フォーカスを戻す
		this.inputField.focus();
	}

	/**
	 * ドラッグ&ドロップをセットアップ
	 */
	private setupDragAndDrop(container: HTMLElement) {
		container.addEventListener('dragover', (event: DragEvent) => {
			event.preventDefault();
			event.dataTransfer!.dropEffect = 'copy';
			container.classList.add('drag-over');
		});

		container.addEventListener('dragleave', (event: DragEvent) => {
			// イベントが実際に要素から離れた場合のみ
			if (event.target === container) {
				container.classList.remove('drag-over');
			}
		});

		container.addEventListener('drop', async (event: DragEvent) => {
			event.preventDefault();
			container.classList.remove('drag-over');

			const files = event.dataTransfer?.files;
			if (!files || files.length === 0) {
				new Notice('ファイルをドロップしてください');
				return;
			}

			// サポート形式のファイルだけを処理
			const supportedExtensions = ['pdf', 'pptx', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp'];
			const supportedFiles: File[] = [];
			const unsupportedFiles: string[] = [];

			for (let i = 0; i < files.length; i++) {
				const file = files.item(i);
				if (!file) continue;

				const ext = file.name.split('.').pop()?.toLowerCase();

				if (ext && supportedExtensions.includes(ext)) {
					supportedFiles.push(file);
				} else {
					unsupportedFiles.push(file.name);
				}
			}

			if (unsupportedFiles.length > 0) {
				new Notice(
					`以下のファイル形式はサポートされていません: ${unsupportedFiles.join(', ')}\n(対応: PDF, PowerPoint, Word, テキスト, 画像)`,
					5000
				);
			}

			if (supportedFiles.length === 0) {
				return;
			}

			// ファイルを保存して参照を挿入
			for (const file of supportedFiles) {
				try {
					console.log(`Processing file: ${file.name}`);
					const savedPath = await this.saveAttachmentFile(file);
					console.log(`Inserting reference: @file:${savedPath}`);
					new Notice(`添付ファイルを保存しました: ${file.name}`, 3000);
					this.insertAttachmentReference(savedPath);
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : String(error);
					new Notice(`ファイル保存エラー: ${file.name}\n${errorMsg}`, 5000);
					console.error(`Error processing ${file.name}:`, error);
				}
			}
		});
	}

	/**
	 * ファイルを Vault に保存
	 */
	private async saveAttachmentFile(file: File): Promise<string> {
		// attachments/tmp フォルダを使用（一括削除しやすいように）
		const attachmentsFolderPath = 'attachments/tmp';

		// フォルダが存在しなければ作成
		if (!this.app.vault.getAbstractFileByPath('attachments')) {
			await this.app.vault.createFolder('attachments');
		}
		if (!this.app.vault.getAbstractFileByPath(attachmentsFolderPath)) {
			await this.app.vault.createFolder(attachmentsFolderPath);
		}

		// ファイル名の重複を回避（タイムスタンプを付与）
		const timestamp = Date.now();
		const filePath = `${attachmentsFolderPath}/${timestamp}_${file.name}`;

		// ファイルをバイナリで保存
		const arrayBuffer = await file.arrayBuffer();
		await this.app.vault.createBinary(filePath, arrayBuffer);

		console.log(`File saved: ${filePath}`);
		return filePath;
	}
}

/**
 * 添付ファイル選択用モーダル
 */
class AttachmentFileModal extends SuggestModal<TFile> {
	private files: TFile[];
	private onSelectCallback: (filePath: string) => void;

	constructor(app: any, files: TFile[], onSelect: (filePath: string) => void) {
		super(app);
		this.files = files;
		this.onSelectCallback = onSelect;
		this.setPlaceholder('添付するファイルを検索...');
		this.setInstructions([
			{ command: '↑↓', purpose: '移動' },
			{ command: 'Enter', purpose: '選択' },
			{ command: 'Esc', purpose: 'キャンセル' },
		]);
	}

	getSuggestions(query: string): TFile[] {
		if (!query) {
			return this.files;
		}

		const lowerQuery = query.toLowerCase();
		return this.files.filter(file =>
			file.name.toLowerCase().includes(lowerQuery) ||
			file.path.toLowerCase().includes(lowerQuery)
		);
	}

	renderSuggestion(file: TFile, el: HTMLElement) {
		el.createEl('div', { cls: 'suggestion-item' });
		const primaryEl = el.createEl('div', { cls: 'suggestion-content' });
		primaryEl.createEl('span', { text: file.basename, cls: 'suggestion-title' });

		// ファイルパスが長い場合は省略表示
		const folderPath = file.path.substring(0, file.path.lastIndexOf('/'));
		if (folderPath) {
			primaryEl.createEl('span', {
				text: ` (${folderPath})`,
				cls: 'suggestion-aux',
			});
		}
	}

	onChooseSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent) {
		this.onSelectCallback(file.path);
	}
}
