import {Plugin, WorkspaceLeaf} from 'obsidian';
import {DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab} from "./settings";
import {ChatView, CHAT_VIEW_TYPE} from "./chatView";

// Remember to rename these classes and interfaces!

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// Register the chat view
		this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));

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
