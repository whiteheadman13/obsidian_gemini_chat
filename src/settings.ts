import {App, PluginSettingTab, Setting, TFile} from "obsidian";
import MyPlugin from "./main";

export interface MyPluginSettings {
	geminiApiKey: string;
	geminiModel: string;
	qaModel: string;
	chatHistoryFolder: string;
	relatedNotesMode: 'lexical' | 'vector' | 'hybrid';
	relatedNotesLimit: number;
	relatedNotesTitleWeight: number;
	relatedNotesTextWeight: number;
	relatedNotesTagWeight: number;
	relatedNotesLinkWeight: number;
	relatedNotesVectorFolders: string[];
	relatedNotesEmbeddingModel: string;
	relatedNotesHybridLexicalWeight: number;
	relatedNotesHybridVectorWeight: number;
	relatedNotesVectorTopK: number;
	relatedNotesExcludeFormatterSection: boolean;
	relatedNotesExcludeFrontmatter: boolean;
	relatedNotesExcludeLinked: boolean;
	agentAllowedFolders: string[];
	agentBlockedFolders: string[];
	agentTemplateFolder: string;
	agentTemplateFile: string;
	qaInitialLexicalLimit: number;
	qaFinalSourceLimit: number;
	qaMaxCharsPerNote: number;
	qaMaxTotalChars: number;
	qaEnableVectorRerank: boolean;
	noteSplitCriteria: string;
	chatPromptTemplateFolder: string;
}

export const DEFAULT_NOTE_SPLIT_CRITERIA = `以下の知識タイプごとに分割してください（該当するものだけ）:
- 概念 (Concept): 定義・用語の説明
- 議論/主張 (Argument): 論理的推論・主張
- 反論 (Counter-argument): 主張への反証
- モデル (Model): 構造・関係性の説明
- 仮説/理論 (Hypothesis/Theory): 検証可能な記述や理論
- 経験的観察 (Empirical observation): データ・事実・測定結果`;

export const DEFAULT_SETTINGS: MyPluginSettings = {
	geminiApiKey: '',
	geminiModel: 'gemini-3.1-flash-lite-preview',
	qaModel: 'gemini-3.1-flash-lite-preview',
	chatHistoryFolder: 'Chat History',
	relatedNotesMode: 'lexical',
	relatedNotesLimit: 10,
	relatedNotesTitleWeight: 0.25,
	relatedNotesTextWeight: 0.4,
	relatedNotesTagWeight: 0.2,
	relatedNotesLinkWeight: 0.15,
	relatedNotesVectorFolders: [],
	relatedNotesEmbeddingModel: 'gemini-embedding-001',
	relatedNotesHybridLexicalWeight: 0.4,
	relatedNotesHybridVectorWeight: 0.6,
	relatedNotesVectorTopK: 20,
	relatedNotesExcludeFormatterSection: true,
	relatedNotesExcludeFrontmatter: true,
	relatedNotesExcludeLinked: true,
	agentAllowedFolders: [],
	agentBlockedFolders: [],
	agentTemplateFolder: '',
	agentTemplateFile: '',
	qaInitialLexicalLimit: 30,
	qaFinalSourceLimit: 6,
	qaMaxCharsPerNote: 800,
	qaMaxTotalChars: 5000,
	qaEnableVectorRerank: true,
	noteSplitCriteria: DEFAULT_NOTE_SPLIT_CRITERIA,
	chatPromptTemplateFolder: '',
}

export class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Gemini API Key')
			.setDesc('Google Gemini APIのキーを入力してください')
			.addText(text => text
				.setPlaceholder('AIzaSy...')
				.setValue(this.plugin.settings.geminiApiKey)
				.onChange(async (value) => {
					this.plugin.settings.geminiApiKey = value;
					await this.plugin.saveSettings();
				})
				.inputEl.setAttribute('type', 'password'));

		new Setting(containerEl)
			.setName('Gemini Model')
			.setDesc('使用するGeminiモデルを選択してください')
			.addDropdown(dropdown => dropdown
				.addOption('gemini-3.1-flash-lite-preview', 'Gemini 3.1 Flash Lite Preview')
				.addOption('gemini-3-flash-preview', 'Gemini 3 Flash Preview')
				.addOption('gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview')
				.setValue(this.plugin.settings.geminiModel)
				.onChange(async (value) => {
					this.plugin.settings.geminiModel = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('チャット履歴保存先フォルダ')
			.setDesc('チャット履歴を保存するフォルダパスを指定してください')
			.addText(text => text
				.setPlaceholder('Chat History')
				.setValue(this.plugin.settings.chatHistoryFolder)
				.onChange(async (value) => {
					this.plugin.settings.chatHistoryFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('チャットテンプレートフォルダ')
			.setDesc('チャット欄で "/" 入力時に表示するプロンプトテンプレートの格納フォルダ。空欄の場合はVault全体が対象です。')
			.addText(text => {
				text
					.setPlaceholder('例: Prompts')
					.setValue(this.plugin.settings.chatPromptTemplateFolder)
					.onChange(async (value) => {
						this.plugin.settings.chatPromptTemplateFolder = value.trim();
						await this.plugin.saveSettings();
					});

				text.inputEl.addEventListener('focus', () => {
					this.showFolderDropdown(text.inputEl, this.getAllFoldersInVault());
				});

				text.inputEl.addEventListener('input', () => {
					this.showFolderDropdown(text.inputEl, this.getAllFoldersInVault());
				});
			});

		containerEl.createEl('h2', { text: 'ノートQ&A' });

		new Setting(containerEl)
			.setName('Q&Aモデル')
			.setDesc('ノート根拠Q&Aで使用するGeminiモデルを選択してください')
			.addDropdown((dropdown) => dropdown
				.addOption('gemini-3.1-flash-lite-preview', 'Gemini 3.1 Flash Lite Preview')
				.addOption('gemini-3-flash-preview', 'Gemini 3 Flash Preview')
				.addOption('gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview')
				.setValue(this.plugin.settings.qaModel)
				.onChange(async (value) => {
					this.plugin.settings.qaModel = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Q&A 一次候補件数')
			.setDesc('質問文との語彙一致で広めに拾う候補数（1〜100）')
			.addText((text) => text
				.setPlaceholder('30')
				.setValue(String(this.plugin.settings.qaInitialLexicalLimit))
				.onChange(async (value) => {
					const parsed = Number(value);
					if (!Number.isFinite(parsed)) return;
					this.plugin.settings.qaInitialLexicalLimit = Math.max(1, Math.min(100, Math.round(parsed)));
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Q&A 最終参照ノート数')
			.setDesc('最終的に回答根拠として投入するノート数（1〜20）')
			.addText((text) => text
				.setPlaceholder('6')
				.setValue(String(this.plugin.settings.qaFinalSourceLimit))
				.onChange(async (value) => {
					const parsed = Number(value);
					if (!Number.isFinite(parsed)) return;
					this.plugin.settings.qaFinalSourceLimit = Math.max(1, Math.min(20, Math.round(parsed)));
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Q&A ノートごとの最大文字数')
			.setDesc('各ノートから回答に渡す抜粋の最大文字数（100〜4000）')
			.addText((text) => text
				.setPlaceholder('800')
				.setValue(String(this.plugin.settings.qaMaxCharsPerNote))
				.onChange(async (value) => {
					const parsed = Number(value);
					if (!Number.isFinite(parsed)) return;
					this.plugin.settings.qaMaxCharsPerNote = Math.max(100, Math.min(4000, Math.round(parsed)));
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Q&A 全体コンテキスト上限')
			.setDesc('全ノート抜粋の合計文字数上限（500〜20000）')
			.addText((text) => text
				.setPlaceholder('5000')
				.setValue(String(this.plugin.settings.qaMaxTotalChars))
				.onChange(async (value) => {
					const parsed = Number(value);
					if (!Number.isFinite(parsed)) return;
					this.plugin.settings.qaMaxTotalChars = Math.max(500, Math.min(20000, Math.round(parsed)));
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Q&A でベクトル再ランクを使う')
			.setDesc('有効時は一次候補を埋め込みで再ランクして精度を上げます。APIキーとインデックスが必要です')
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.qaEnableVectorRerank)
				.onChange(async (value) => {
					this.plugin.settings.qaEnableVectorRerank = value;
					await this.plugin.saveSettings();
				}));

		// Related note suggestion settings
		containerEl.createEl('h2', { text: '関連ノート提案' });

		new Setting(containerEl)
			.setName('提案方式')
			.setDesc('語彙ベース、ベクトルベース、ハイブリッドのいずれかを選択します')
			.addDropdown((dropdown) => dropdown
				.addOption('lexical', '語彙ベース（既存）')
				.addOption('vector', 'ベクトルベース')
				.addOption('hybrid', 'ハイブリッド')
				.setValue(this.plugin.settings.relatedNotesMode)
				.onChange(async (value: 'lexical' | 'vector' | 'hybrid') => {
					this.plugin.settings.relatedNotesMode = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('提案件数')
			.setDesc('「現在ノートの関連ノートを提案」で表示する件数（1〜50）')
			.addText((text) => text
				.setPlaceholder('10')
				.setValue(String(this.plugin.settings.relatedNotesLimit))
				.onChange(async (value) => {
					const parsed = Number(value);
					if (!Number.isFinite(parsed)) return;
					this.plugin.settings.relatedNotesLimit = Math.max(1, Math.min(50, Math.round(parsed)));
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('タイトル類似の重み')
			.setDesc('0以上の数値。スコア計算時に正規化されます')
			.addText((text) => text
				.setPlaceholder('0.25')
				.setValue(String(this.plugin.settings.relatedNotesTitleWeight))
				.onChange(async (value) => {
					const parsed = Number(value);
					if (!Number.isFinite(parsed) || parsed < 0) return;
					this.plugin.settings.relatedNotesTitleWeight = parsed;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('本文キーワード類似の重み')
			.setDesc('0以上の数値。スコア計算時に正規化されます')
			.addText((text) => text
				.setPlaceholder('0.4')
				.setValue(String(this.plugin.settings.relatedNotesTextWeight))
				.onChange(async (value) => {
					const parsed = Number(value);
					if (!Number.isFinite(parsed) || parsed < 0) return;
					this.plugin.settings.relatedNotesTextWeight = parsed;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('共通タグの重み')
			.setDesc('0以上の数値。スコア計算時に正規化されます')
			.addText((text) => text
				.setPlaceholder('0.2')
				.setValue(String(this.plugin.settings.relatedNotesTagWeight))
				.onChange(async (value) => {
					const parsed = Number(value);
					if (!Number.isFinite(parsed) || parsed < 0) return;
					this.plugin.settings.relatedNotesTagWeight = parsed;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('内部リンク関係の重み')
			.setDesc('0以上の数値。スコア計算時に正規化されます')
			.addText((text) => text
				.setPlaceholder('0.15')
				.setValue(String(this.plugin.settings.relatedNotesLinkWeight))
				.onChange(async (value) => {
					const parsed = Number(value);
					if (!Number.isFinite(parsed) || parsed < 0) return;
					this.plugin.settings.relatedNotesLinkWeight = parsed;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('formatter部分を除外')
			.setDesc('本文キーワード類似の計算時に、formatter/フォーマッタ見出し配下や formatter コードブロックを除外します')
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.relatedNotesExcludeFormatterSection)
				.onChange(async (value) => {
					this.plugin.settings.relatedNotesExcludeFormatterSection = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('フロントマターを除外')
			.setDesc('本文キーワード類似の計算時に、先頭の YAML フロントマター (--- ... ---) を除外します')
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.relatedNotesExcludeFrontmatter)
				.onChange(async (value) => {
					this.plugin.settings.relatedNotesExcludeFrontmatter = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('既にリンクしているノートを除外')
			.setDesc('内部リンクで既につながっているノートを候補から除外し、予想外のつながりを発見しやすくします')
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.relatedNotesExcludeLinked)
				.onChange(async (value) => {
					this.plugin.settings.relatedNotesExcludeLinked = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('ベクトル対象フォルダ')
			.setDesc('ベクトルインデックス対象のフォルダ。空の場合はVault全体を対象にします')
			.setHeading();

		this.displayFolderList(
			containerEl,
			this.plugin.settings.relatedNotesVectorFolders,
			(folders) => {
				this.plugin.settings.relatedNotesVectorFolders = folders;
				this.plugin.saveSettings();
			},
			'ベクトル対象フォルダ'
		);

		new Setting(containerEl)
			.setName('Embeddingモデル')
			.setDesc('ベクトル化に利用するGemini Embeddingモデル名を指定します')
			.addText((text) => text
				.setPlaceholder('gemini-embedding-001')
				.setValue(this.plugin.settings.relatedNotesEmbeddingModel)
				.onChange(async (value) => {
					this.plugin.settings.relatedNotesEmbeddingModel = value.trim() || 'gemini-embedding-001';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('ベクトル候補数')
			.setDesc('ベクトル類似度で返す候補上限（1〜200）')
			.addText((text) => text
				.setPlaceholder('20')
				.setValue(String(this.plugin.settings.relatedNotesVectorTopK))
				.onChange(async (value) => {
					const parsed = Number(value);
					if (!Number.isFinite(parsed)) return;
					this.plugin.settings.relatedNotesVectorTopK = Math.max(1, Math.min(200, Math.round(parsed)));
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('ハイブリッド:語彙スコア重み')
			.setDesc('0以上の数値。ハイブリッド時に使用します（内部で正規化）')
			.addText((text) => text
				.setPlaceholder('0.4')
				.setValue(String(this.plugin.settings.relatedNotesHybridLexicalWeight))
				.onChange(async (value) => {
					const parsed = Number(value);
					if (!Number.isFinite(parsed) || parsed < 0) return;
					this.plugin.settings.relatedNotesHybridLexicalWeight = parsed;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('ハイブリッド:ベクトル重み')
			.setDesc('0以上の数値。ハイブリッド時に使用します（内部で正規化）')
			.addText((text) => text
				.setPlaceholder('0.6')
				.setValue(String(this.plugin.settings.relatedNotesHybridVectorWeight))
				.onChange(async (value) => {
					const parsed = Number(value);
					if (!Number.isFinite(parsed) || parsed < 0) return;
					this.plugin.settings.relatedNotesHybridVectorWeight = parsed;
					await this.plugin.saveSettings();
				}));

		// Note split settings
		containerEl.createEl('h2', { text: 'ノート分割' });

		new Setting(containerEl)
			.setName('ノート分割の基準')
			.setDesc('「AIでノートを分割」コマンド実行時のデフォルト分割基準を設定します')
			.addTextArea(text => {
				text
					.setPlaceholder('分割基準を入力...')
					.setValue(this.plugin.settings.noteSplitCriteria)
					.onChange(async (value) => {
						this.plugin.settings.noteSplitCriteria = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 10;
				text.inputEl.style.width = '100%';
				text.inputEl.style.fontFamily = 'var(--font-monospace)';
				text.inputEl.style.fontSize = '13px';
			});

		// Agent template settings
		containerEl.createEl('h2', {text: 'エージェントテンプレート'});

		new Setting(containerEl)
			.setName('テンプレート格納フォルダ')
			.setDesc('AIAgent起動時のテンプレート選択候補を、このフォルダ配下に限定します。空欄の場合はVault全体が対象です。')
			.addText(text => {
				text
					.setPlaceholder('例: Templates')
					.setValue(this.plugin.settings.agentTemplateFolder)
					.onChange(async (value) => {
						this.plugin.settings.agentTemplateFolder = value.trim();
						await this.plugin.saveSettings();
					});

				text.inputEl.addEventListener('focus', () => {
					this.showFolderDropdown(text.inputEl, this.getAllFoldersInVault());
				});

				text.inputEl.addEventListener('input', () => {
					this.showFolderDropdown(text.inputEl, this.getAllFoldersInVault());
				});
			});

		new Setting(containerEl)
			.setName('テンプレートファイル')
			.setDesc('既定のテンプレートファイルです。エージェント起動時に個別指定しない場合、このファイルを使用します。')
			.addText(text => {
				text
					.setPlaceholder('例: Templates/課題整理テンプレート.md')
					.setValue(this.plugin.settings.agentTemplateFile)
					.onChange(async (value) => {
						this.plugin.settings.agentTemplateFile = value;
						await this.plugin.saveSettings();
					});
				
				text.inputEl.addEventListener('focus', () => {
					this.showFileDropdown(text.inputEl, this.getTemplateCandidateFiles(this.plugin.settings.agentTemplateFolder));
				});

				text.inputEl.addEventListener('input', () => {
					this.showFileDropdown(text.inputEl, this.getTemplateCandidateFiles(this.plugin.settings.agentTemplateFolder));
				});
			});

		// Agent folder access control
		containerEl.createEl('h2', {text: 'エージェントフォルダアクセス制御'});

		// Allowed folders section
		new Setting(containerEl)
			.setName('アクセス許可フォルダ')
			.setDesc('エージェントがアクセス可能なフォルダを指定します。空の場合、すべてのフォルダにアクセス可能です（ブロックリスト除く）')
			.setHeading();

		this.displayFolderList(
			containerEl, 
			this.plugin.settings.agentAllowedFolders,
			(folders) => {
				this.plugin.settings.agentAllowedFolders = folders;
				this.plugin.saveSettings();
			},
			'許可フォルダ'
		);

		// Blocked folders section
		new Setting(containerEl)
			.setName('アクセス禁止フォルダ')
			.setDesc('エージェントがアクセスできないフォルダを指定します。このリストは許可リストよりも優先されます')
			.setHeading();

		this.displayFolderList(
			containerEl, 
			this.plugin.settings.agentBlockedFolders,
			(folders) => {
				this.plugin.settings.agentBlockedFolders = folders;
				this.plugin.saveSettings();
			},
			'禁止フォルダ'
		);
	}

	private displayFolderList(
		containerEl: HTMLElement, 
		folders: string[],
		onChange: (folders: string[]) => void,
		label: string
	) {
		const listContainer = containerEl.createDiv('folder-list-container');

		const updateList = () => {
			listContainer.empty();
			
			folders.forEach((folder, index) => {
				new Setting(listContainer)
					.setName(folder)
					.addButton(button => button
						.setButtonText('削除')
						.setWarning()
						.onClick(async () => {
							folders.splice(index, 1);
							onChange(folders);
							updateList();
						})
					);
			});

			// Add folder input with suggestions
			const inputSetting = new Setting(listContainer);
			let inputElement: HTMLInputElement | null = null;
			const suggestionsContainer = listContainer.createDiv('folder-suggestions');
			suggestionsContainer.style.cssText = `
				max-height: 200px;
				overflow-y: auto;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				margin-top: 8px;
				display: none;
			`;
			
			inputSetting
				.addText(text => {
					text.setPlaceholder('フォルダパス (例: Projects/Private)')
						.inputEl.id = `add-folder-input-${label}`;
					inputElement = text.inputEl;
					
					// Add input event for filtering suggestions
					inputElement.addEventListener('input', () => {
						if (inputElement) {
							this.updateFolderSuggestions(inputElement, suggestionsContainer);
						}
					});
					
					// Show suggestions on focus
					inputElement.addEventListener('focus', () => {
						if (inputElement) {
							this.updateFolderSuggestions(inputElement, suggestionsContainer);
							suggestionsContainer.style.display = 'block';
						}
					});

					// Hide suggestions on blur (with delay to allow clicking)
					inputElement.addEventListener('blur', () => {
						setTimeout(() => {
							suggestionsContainer.style.display = 'none';
						}, 200);
					});
					
					return text;
				})
				.addButton(button => button
					.setButtonText('追加')
					.setCta()
					.onClick(async () => {
						const input = listContainer.querySelector(`#add-folder-input-${label}`) as HTMLInputElement;
						if (input && input.value) {
							const newFolder = input.value.trim();
							if (newFolder && !folders.includes(newFolder)) {
								folders.push(newFolder);
								onChange(folders);
								input.value = '';
								updateList();
							}
						}
					})
				);
		};

		updateList();
	}

	private updateFolderSuggestions(inputElement: HTMLInputElement, container: HTMLElement) {
		container.empty();
		container.style.display = 'block';
		
		// Get all folders in the vault
		const allFolders = this.getAllFoldersInVault();
		const inputValue = inputElement.value.toLowerCase();
		
		// Filter folders based on input
		const filteredFolders = allFolders.filter(folder => 
			folder.toLowerCase().includes(inputValue)
		);

		if (filteredFolders.length === 0) {
			const emptyMsg = container.createDiv();
			emptyMsg.textContent = 'フォルダが見つかりません';
			emptyMsg.style.cssText = 'padding: 8px; color: var(--text-muted); text-align: center;';
			return;
		}

		// Display suggestions (limit to 10)
		filteredFolders.slice(0, 10).forEach(folder => {
			const suggestionItem = container.createDiv('folder-suggestion-item');
			suggestionItem.textContent = folder;
			suggestionItem.style.cssText = `
				padding: 6px 12px;
				cursor: pointer;
				border-bottom: 1px solid var(--background-modifier-border);
			`;
			
			suggestionItem.addEventListener('mouseenter', () => {
				suggestionItem.style.backgroundColor = 'var(--background-modifier-hover)';
			});
			
			suggestionItem.addEventListener('mouseleave', () => {
				suggestionItem.style.backgroundColor = '';
			});
			
			suggestionItem.addEventListener('click', () => {
				inputElement.value = folder;
				container.style.display = 'none';
				inputElement.focus();
			});
		});

		if (filteredFolders.length > 10) {
			const moreMsg = container.createDiv();
			moreMsg.textContent = `他 ${filteredFolders.length - 10} 件...`;
			moreMsg.style.cssText = 'padding: 8px; color: var(--text-muted); text-align: center; font-size: 0.9em;';
		}
	}

	private getAllFoldersInVault(): string[] {
		const folders: string[] = [];
		const allFiles = this.app.vault.getAllLoadedFiles();
		
		allFiles.forEach(file => {
			if (file.hasOwnProperty('children')) {
				// It's a folder
				folders.push(file.path);
			}
		});
		
		// Sort alphabetically
		return folders.sort((a, b) => a.localeCompare(b, 'ja'));
	}

	private getTemplateCandidateFiles(templateFolder: string): TFile[] {
		const markdownFiles = this.app.vault.getMarkdownFiles();
		const normalizedFolder = templateFolder.trim().replace(/^\/+/, '').replace(/\/+$/, '');

		const scopedFiles = normalizedFolder
			? markdownFiles.filter((file) => file.path.startsWith(`${normalizedFolder}/`))
			: markdownFiles;

		const prioritized = scopedFiles.filter((file) =>
			/template|テンプレート/i.test(file.path)
		);
		const others = scopedFiles.filter((file) =>
			!/template|テンプレート/i.test(file.path)
		);

		return [...prioritized, ...others].sort((a, b) => a.path.localeCompare(b.path, 'ja'));
	}

	private showFileDropdown(inputElement: HTMLInputElement, files: TFile[]) {
		const parent = inputElement.parentElement as HTMLElement | null;
		if (parent && parent.style.position !== 'relative') {
			parent.style.position = 'relative';
		}

		// Create a dropdown container if it doesn't exist
		let dropdown = inputElement.parentElement?.querySelector('.file-dropdown') as HTMLElement | null;
		if (!dropdown) {
			dropdown = document.createElement('div') as HTMLElement;
			dropdown.className = 'file-dropdown';
			dropdown.style.cssText = `
				position: absolute;
				top: 100%;
				left: 0;
				right: 0;
				max-height: 300px;
				overflow-y: auto;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-secondary);
				z-index: 1000;
				margin-top: 4px;
				display: none;
			`;
			inputElement.parentElement?.appendChild(dropdown);

			dropdown.addEventListener('mousedown', (e) => {
				e.preventDefault();
			});
		}

		dropdown.innerHTML = '';
		
		const filterValue = inputElement.value.toLowerCase();
		const filteredFiles = files.filter(f => f.path.toLowerCase().includes(filterValue));

		if (filteredFiles.length === 0) {
			const emptyMsg = dropdown.createDiv();
			emptyMsg.textContent = 'ファイルが見つかりません';
			emptyMsg.style.cssText = 'padding: 8px; color: var(--text-muted); text-align: center;';
			dropdown.style.display = 'block';
			return;
		}

		filteredFiles.slice(0, 20).forEach(file => {
			const item = dropdown!.createDiv();
			item.textContent = file.path;
			item.style.cssText = `
				padding: 8px 12px;
				cursor: pointer;
				border-bottom: 1px solid var(--background-modifier-border);
				font-size: 0.9em;
			`;

			item.addEventListener('mouseenter', () => {
				item.style.backgroundColor = 'var(--background-modifier-hover)';
			});

			item.addEventListener('mouseleave', () => {
				item.style.backgroundColor = '';
			});

			item.addEventListener('click', () => {
				inputElement.value = file.path;
				dropdown!.style.display = 'none';
				this.plugin.settings.agentTemplateFile = file.path;
				this.plugin.saveSettings();
			});
		});

		if (filteredFiles.length > 20) {
			const moreMsg = dropdown.createDiv();
			moreMsg.textContent = `他 ${filteredFiles.length - 20} 件...`;
			moreMsg.style.cssText = 'padding: 8px; color: var(--text-muted); text-align: center; font-size: 0.9em;';
		}

		dropdown.style.display = 'block';

		if (!inputElement.dataset.templateDropdownBound) {
			inputElement.dataset.templateDropdownBound = '1';
			inputElement.addEventListener('blur', () => {
				setTimeout(() => {
					dropdown!.style.display = 'none';
				}, 200);
			});
		}
	}

	private showFolderDropdown(inputElement: HTMLInputElement, folders: string[]) {
		const parent = inputElement.parentElement as HTMLElement | null;
		if (parent && parent.style.position !== 'relative') {
			parent.style.position = 'relative';
		}

		let dropdown = inputElement.parentElement?.querySelector('.folder-dropdown') as HTMLElement | null;
		if (!dropdown) {
			dropdown = document.createElement('div') as HTMLElement;
			dropdown.className = 'folder-dropdown';
			dropdown.style.cssText = `
				position: absolute;
				top: 100%;
				left: 0;
				right: 0;
				max-height: 260px;
				overflow-y: auto;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-secondary);
				z-index: 1000;
				margin-top: 4px;
				display: none;
			`;
			inputElement.parentElement?.appendChild(dropdown);

			dropdown.addEventListener('mousedown', (e) => {
				e.preventDefault();
			});
		}

		dropdown.innerHTML = '';
		const filterValue = inputElement.value.toLowerCase();
		const filteredFolders = folders.filter((folder) => folder.toLowerCase().includes(filterValue));

		if (filteredFolders.length === 0) {
			const emptyMsg = dropdown.createDiv();
			emptyMsg.textContent = 'フォルダが見つかりません';
			emptyMsg.style.cssText = 'padding: 8px; color: var(--text-muted); text-align: center;';
			dropdown.style.display = 'block';
			return;
		}

		filteredFolders.slice(0, 20).forEach((folder) => {
			const item = dropdown!.createDiv();
			item.textContent = folder;
			item.style.cssText = `
				padding: 8px 12px;
				cursor: pointer;
				border-bottom: 1px solid var(--background-modifier-border);
				font-size: 0.9em;
			`;

			item.addEventListener('mouseenter', () => {
				item.style.backgroundColor = 'var(--background-modifier-hover)';
			});

			item.addEventListener('mouseleave', () => {
				item.style.backgroundColor = '';
			});

			item.addEventListener('click', async () => {
				inputElement.value = folder;
				dropdown!.style.display = 'none';
				inputElement.dispatchEvent(new Event('input'));
				inputElement.focus();
			});
		});

		if (filteredFolders.length > 20) {
			const moreMsg = dropdown.createDiv();
			moreMsg.textContent = `他 ${filteredFolders.length - 20} 件...`;
			moreMsg.style.cssText = 'padding: 8px; color: var(--text-muted); text-align: center; font-size: 0.9em;';
		}

		dropdown.style.display = 'block';

		if (!inputElement.dataset.templateFolderDropdownBound) {
			inputElement.dataset.templateFolderDropdownBound = '1';
			inputElement.addEventListener('blur', () => {
				setTimeout(() => {
					dropdown!.style.display = 'none';
				}, 200);
			});
		}
	}
}
