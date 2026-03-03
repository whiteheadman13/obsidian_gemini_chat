import {Plugin, WorkspaceLeaf} from 'obsidian';
import {DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab} from "./settings";
import {ChatView, CHAT_VIEW_TYPE} from "./chatView";
import {FileEditService} from "./fileEditService";
import {DiffView, DIFF_VIEW_TYPE} from "./diffView";

// Remember to rename these classes and interfaces!

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	fileEditService: FileEditService;

	async onload() {
		await this.loadSettings();

		// Initialize file edit service
		this.fileEditService = new FileEditService(this.app, this.settings.geminiApiKey, this);

		// Register the chat view
		this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));

		// Register the diff view - note: データは後でセットされる
		this.registerView(DIFF_VIEW_TYPE, (leaf) => {
			const view = new DiffView(leaf);
			return view;
		});

		// Add ribbon icon
		this.addRibbonIcon('messages-square', 'Open Chat', () => {
			this.activateView();
		});

		// Add command to open chat
		this.addCommand({
			id: 'open-chat',
			name: 'Open Chat',
			callback: () => {
				this.activateView();
			}
		});

		// Add command to edit file with AI
		this.addCommand({
			id: 'edit-file-with-ai',
			name: 'AIでファイルを編集',
			editorCallback: async (editor, view) => {
				const file = view.file;
				if (!file) {
					return;
				}

				// ユーザーに指示を入力してもらう
				const instruction = await this.promptForInstruction();
				if (!instruction) {
					return;
				}

				// FileEditServiceを使って編集
				await this.fileEditService.editFileWithAI(instruction);
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

	}

	onunload() {
	}

	async promptForInstruction(): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new (require('obsidian').Modal)(this.app);
			modal.titleEl.setText('AIに指示を入力');
			
			const contentEl = modal.contentEl;
			contentEl.createEl('p', { text: 'ファイルをどのように編集しますか？' });
			
			const textarea = contentEl.createEl('textarea', {
				attr: {
					placeholder: '例: すべての見出しを大文字にする',
					rows: '4'
				}
			});
			textarea.style.width = '100%';
			textarea.style.marginBottom = '10px';
			
			const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
			buttonContainer.style.display = 'flex';
			buttonContainer.style.justifyContent = 'flex-end';
			buttonContainer.style.gap = '8px';
			
			const submitButton = buttonContainer.createEl('button', { 
				text: '実行',
				cls: 'mod-cta'
			});
			submitButton.addEventListener('click', () => {
				const value = textarea.value.trim();
				if (value) {
					resolve(value);
					modal.close();
				}
			});
			
			const cancelButton = buttonContainer.createEl('button', { text: 'キャンセル' });
			cancelButton.addEventListener('click', () => {
				resolve(null);
				modal.close();
			});
			
			modal.open();
			textarea.focus();
		});
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;

		// Check if the view already exists
		const leaves = workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (leaves.length > 0) {
			leaf = leaves[0] || null;
		} else {
			// Create a new leaf in the right sidebar
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({
					type: CHAT_VIEW_TYPE,
					active: true,
				});
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MyPluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
