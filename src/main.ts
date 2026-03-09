import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import {DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab} from "./settings";
import {ChatView, CHAT_VIEW_TYPE} from "./chatView";
import {FileEditService} from "./fileEditService";
import {DiffView, DIFF_VIEW_TYPE} from "./diffView";
import { promptForEditRequest } from './editRequestModal';
import { promptForAgentGoal } from './modals/agentPromptModal';
import { promptNoteSplit, promptNoteSplitSelection } from './modals/noteSplitModal';
import { createAgent } from './agent/adkAgent';
import { AgentLogView, AGENT_LOG_VIEW_TYPE } from './agentLogView';
import { SessionResumeService } from './agent/sessionResumeService';

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

		// Register the agent log view
		this.registerView(AGENT_LOG_VIEW_TYPE, (leaf) => new AgentLogView(leaf));

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
				await this.fileEditService.editFileWithAI(
					request.instruction,
					request.referenceFiles,
					request.useGoogleSearch
				);
			}
		});

		// Add command to split a note into multiple notes with AI
		this.addCommand({
			id: 'split-note-with-ai',
			name: 'AIでノートを分割',
			editorCallback: async (_editor, view) => {
				const file = view.file;
				if (!file) return;

				await promptNoteSplit(
					this.app,
					file,
					this.settings.geminiApiKey,
					this.settings.geminiModel,
					this.settings.noteSplitCriteria
				);
			}
		});

		// Add command to split selected text into multiple notes with AI
		this.addCommand({
			id: 'split-selection-with-ai',
			name: 'AIで選択範囲を分割',
			editorCallback: async (editor, view) => {
				const file = view.file;
				if (!file) return;

				const selectedText = editor.getSelection();
				if (!selectedText.trim()) {
					new Notice('テキストを選択してからコマンドを実行してください');
					return;
				}

				await promptNoteSplitSelection(
					this.app,
					file,
					selectedText,
					this.settings.geminiApiKey,
					this.settings.geminiModel,
					this.settings.noteSplitCriteria
				);
			}
		});

		// Add command to start the simple autonomous agent
		this.addCommand({
			id: 'start-agent',
			name: 'Start Agent（対話なし）',
			callback: async () => {
				const res = await promptForAgentGoal(this.app, {
					templateFolder: this.settings.agentTemplateFolder,
					defaultTemplatePath: this.settings.agentTemplateFile,
				});
				if (!res) return;

				// Open agent log view
				const logView = await this.activateAgentLogView();

				// Use selected template or fallback to settings
				const templatePath = res.templatePath || this.settings.agentTemplateFile;

				// Create non-interactive agent (interactive = false)
				const agent = createAgent(this.app, this, res.goal, this.settings.geminiApiKey, false, templatePath);
				if (logView) {
					agent.setLogView(logView);
				}

				// Run agent
				await agent.run();
			}
		});

		// Add command to start the interactive agent
		this.addCommand({
			id: 'start-interactive-agent',
			name: 'Start Interactive Agent (対話型)',
			callback: async () => {
				const res = await promptForAgentGoal(this.app, {
					templateFolder: this.settings.agentTemplateFolder,
					defaultTemplatePath: this.settings.agentTemplateFile,
				});
				if (!res) return;

				// Open agent log view
				const logView = await this.activateAgentLogView();

				// Use selected template or fallback to settings
				const templatePath = res.templatePath || this.settings.agentTemplateFile;

				// Create interactive agent (interactive = true by default)
				const agent = createAgent(this.app, this, res.goal, this.settings.geminiApiKey, true, templatePath);
				
				if (logView) {
					agent.setLogView(logView);
				}

				// Run interactive agent
				await agent.run();
			}
		});

		// Add command to resume agent from current session note
		this.addCommand({
			id: 'resume-agent',
			name: 'Resume Agent (セッション再開)',
			callback: async () => {
				// Open agent log view
				const logView = await this.activateAgentLogView();

				// Create resume service
				const resumeService = new SessionResumeService(this.app, this);
				
				// Resume from current note
				await resumeService.resumeFromCurrentNote(logView || undefined);
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

	async activateAgentLogView(): Promise<AgentLogView | null> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;

		// Check if the view already exists
		const leaves = workspace.getLeavesOfType(AGENT_LOG_VIEW_TYPE);
		if (leaves.length > 0) {
			leaf = leaves[0] || null;
		} else {
			// Create a new leaf in the right sidebar
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({
					type: AGENT_LOG_VIEW_TYPE,
					active: true,
				});
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
			return leaf.view as AgentLogView;
		}

		return null;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MyPluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
