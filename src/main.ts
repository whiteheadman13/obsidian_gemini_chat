import { Plugin, WorkspaceLeaf } from 'obsidian';
import {DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab} from "./settings";
import {ChatView, CHAT_VIEW_TYPE} from "./chatView";
import {FileEditService} from "./fileEditService";
import {DiffView, DIFF_VIEW_TYPE} from "./diffView";
import { promptForEditRequest } from './editRequestModal';

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

				// ユーザーに指示と参考ノートを入力してもらう
				const request = await promptForEditRequest(this.app, file);
				if (!request) {
					return;
				}

				// FileEditServiceを使って編集
				await this.fileEditService.editFileWithAI(request.instruction, request.referenceFiles);
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

	}

	onunload() {
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
