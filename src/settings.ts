import {App, PluginSettingTab, Setting} from "obsidian";
import MyPlugin from "./main";

export interface MyPluginSettings {
	geminiApiKey: string;
	chatHistoryFolder: string;
	agentAllowedFolders: string[];
	agentBlockedFolders: string[];
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	geminiApiKey: '',
	chatHistoryFolder: 'Chat History',
	agentAllowedFolders: [],
	agentBlockedFolders: []
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
			.setName('チャット履歴保存先フォルダ')
			.setDesc('チャット履歴を保存するフォルダパスを指定してください')
			.addText(text => text
				.setPlaceholder('Chat History')
				.setValue(this.plugin.settings.chatHistoryFolder)
				.onChange(async (value) => {
					this.plugin.settings.chatHistoryFolder = value;
					await this.plugin.saveSettings();
				}));

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
}
