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
import { FolderAccessControl } from './folderAccessControl';
import { GeminiService } from './geminiService';
import { promptForNoteQa } from './modals/noteQaPromptModal';
import { NoteQaService, type NoteQaResult } from './noteQaService';
import { RelatedNotesService, type RelatedNoteCandidate } from './relatedNotesService';
import { RelatedNotesModal } from './modals/relatedNotesModal';
import { VectorIndexService, type VectorSearchResult } from './vectorIndexService';

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

		// Add command to suggest related notes for the current note
		this.addCommand({
			id: 'answer-question-with-notes',
			name: 'ノートを根拠に質問へ回答',
			callback: async () => {
				const prompt = await promptForNoteQa(this.app);
				if (!prompt) {
					return;
				}

				if (!this.settings.geminiApiKey) {
					new Notice('ノートQ&AにはGemini APIキーが必要です');
					return;
				}

				const accessControl = new FolderAccessControl(this.settings);
				const gemini = new GeminiService(this.settings.geminiApiKey, this.settings.qaModel);
				const vectorService = this.settings.qaEnableVectorRerank
					? this.createVectorIndexService(accessControl)
					: null;
				const qaService = new NoteQaService(this.app, this.settings, accessControl, gemini, vectorService);

				new Notice('ノートQ&Aを実行しています...');
				const result = await qaService.answerQuestion(prompt.question, prompt.useGoogleSearch);
				const file = await this.createQuestionAnswerNote(result);
				const leaf = this.app.workspace.getLeaf('tab');
				await leaf.openFile(file);
				new Notice(`Q&A結果を保存しました: ${file.path}（対象外 ${result.diagnostics.outOfScopeNotes}件）`);
			}
		});

		this.addCommand({
			id: 'find-related-notes',
			name: '現在ノートの関連ノートを提案',
			callback: async () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					new Notice('まずノートを開いてください');
					return;
				}

				const accessControl = new FolderAccessControl(this.settings);
				const relatedNotesService = new RelatedNotesService(this.app, accessControl, {
					limit: this.settings.relatedNotesLimit,
					titleWeight: this.settings.relatedNotesTitleWeight,
					textWeight: this.settings.relatedNotesTextWeight,
					tagWeight: this.settings.relatedNotesTagWeight,
					linkWeight: this.settings.relatedNotesLinkWeight,
					excludeFormatterSection: this.settings.relatedNotesExcludeFormatterSection,
					excludeFrontmatter: this.settings.relatedNotesExcludeFrontmatter,
					excludeLinked: this.settings.relatedNotesExcludeLinked,
				});

				let related: RelatedNoteCandidate[] = [];
				const mode = this.settings.relatedNotesMode;

				if (mode === 'lexical') {
					related = await relatedNotesService.findRelatedNotes(activeFile);
				} else {
					const vectorService = this.createVectorIndexService(accessControl);
					if (!vectorService) {
						if (mode === 'vector') {
							new Notice('ベクトル提案にはGemini APIキーが必要です');
							return;
						}
						related = await relatedNotesService.findRelatedNotes(activeFile);
					} else if (mode === 'vector') {
						const vectorRows = await vectorService.findSimilarNotes(activeFile, this.settings.relatedNotesVectorTopK);
						related = this.convertVectorResults(vectorRows);
					} else {
						const lexical = await relatedNotesService.findRelatedNotes(activeFile, this.settings.relatedNotesVectorTopK);
						const vectorRows = await vectorService.findSimilarNotes(activeFile, this.settings.relatedNotesVectorTopK);
						related = this.mergeHybridResults(lexical, vectorRows);
					}
				}

				if (related.length === 0) {
					new Notice('関連ノートは見つかりませんでした');
					return;
				}

				new RelatedNotesModal(this.app, related).open();
			}
		});

		// Add command to build/update related-note vector index incrementally
		this.addCommand({
			id: 'update-related-notes-vector-index',
			name: '関連ノートのベクトルインデックスを更新',
			callback: async () => {
				const accessControl = new FolderAccessControl(this.settings);
				const vectorService = this.createVectorIndexService(accessControl);
				if (!vectorService) {
					new Notice('ベクトルインデックス更新にはGemini APIキーが必要です');
					return;
				}

				new Notice('ベクトルインデックスを更新しています...');
				const result = await vectorService.buildOrUpdateIndex();
				new Notice(
					`ベクトル更新完了: 新規 ${result.indexed} / 更新 ${result.updated} / 削除 ${result.removed} / スキップ ${result.skipped}`
				);
			},
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
		const loaded = await this.loadData() as Partial<MyPluginSettings> & { relatedNotesVectorFolder?: string };
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);

		if (!Array.isArray(this.settings.relatedNotesVectorFolders)) {
			this.settings.relatedNotesVectorFolders = [];
		}

		const legacyFolder = typeof loaded.relatedNotesVectorFolder === 'string'
			? loaded.relatedNotesVectorFolder.trim()
			: '';
		if (legacyFolder && !this.settings.relatedNotesVectorFolders.includes(legacyFolder)) {
			this.settings.relatedNotesVectorFolders.push(legacyFolder);
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async createQuestionAnswerNote(result: NoteQaResult) {
		const folderPath = `${this.settings.chatHistoryFolder}/Note QA`;
		await this.ensureFolder(folderPath);
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
		const safeTitle = this.sanitizeQaFileName(result.question);
		const path = `${folderPath}/${timestamp}_${safeTitle}.md`;
		return await this.app.vault.create(path, this.buildQuestionAnswerNoteContent(result));
	}

	private buildQuestionAnswerNoteContent(result: NoteQaResult): string {
		const sources = result.sources.length > 0
			? result.sources.map((source) => [
				`### ${source.path}`,
				`- スコア: ${source.score.toFixed(3)}`,
				`- 理由: ${source.reasons.join(' / ') || '関連度上位'}`,
				'',
				source.excerpt,
			].join('\n')).join('\n\n')
			: '根拠ノートなし';

		const excludedFolders = result.diagnostics.outOfScopeFolders.length > 0
			? result.diagnostics.outOfScopeFolders.map((folder) => `- ${folder}`).join('\n')
			: '- なし';

		const vectorTargetFolders = result.diagnostics.vectorTargetFolders.length > 0
			? result.diagnostics.vectorTargetFolders.join(', ')
			: '(全体対象)';

		return [
			`# ノートQ&A: ${result.question}`,
			'',
			`- 実行日時: ${new Date().toLocaleString('ja-JP')}`,
			`- Google検索併用: ${result.usedGoogleSearch ? 'あり' : 'なし'}`,
			`- 全ノート数: ${result.diagnostics.totalNotes}`,
			`- 調査対象ノート数: ${result.diagnostics.inScopeNotes}`,
			`- 調査対象外ノート数: ${result.diagnostics.outOfScopeNotes}`,
			'',
			'## 回答',
			result.answer,
			'',
			'## 根拠ノート',
			sources,
			'',
			'## 調査対象外の範囲',
			'### 対象外フォルダ',
			excludedFolders,
			'',
			'### 適用されたアクセス制御',
			result.diagnostics.accessControlSummary,
			'',
			'### ベクトル再ランク設定',
			`- 有効: ${result.diagnostics.vectorRerankEnabled ? 'はい' : 'いいえ'}`,
			`- ベクトル対象フォルダ: ${vectorTargetFolders}`,
		].join('\n');
	}

	private sanitizeQaFileName(question: string): string {
		const sanitized = question
			.replace(/[\\/:*?"<>|]/g, '-')
			.replace(/[\r\n\t]+/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();

		return (sanitized || 'note-qa').slice(0, 60);
	}

	private async ensureFolder(folderPath: string): Promise<void> {
		const parts = folderPath.split('/').filter((part) => part.length > 0);
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				await this.app.vault.createFolder(current);
			}
		}
	}

	private createVectorIndexService(accessControl: FolderAccessControl): VectorIndexService | null {
		if (!this.settings.geminiApiKey) {
			return null;
		}

		const geminiService = new GeminiService(this.settings.geminiApiKey, this.settings.geminiModel);
		return new VectorIndexService(
			this.app,
			accessControl,
			geminiService,
			this.manifest.id,
			this.settings.relatedNotesEmbeddingModel,
			this.settings.relatedNotesVectorFolders
		);
	}

	private convertVectorResults(rows: VectorSearchResult[]): RelatedNoteCandidate[] {
		return rows.map((row) => ({
			file: row.file,
			score: row.score,
			reasons: [`ベクトル類似度: ${row.score.toFixed(3)}`],
		}));
	}

	private mergeHybridResults(lexical: RelatedNoteCandidate[], vectorRows: VectorSearchResult[]): RelatedNoteCandidate[] {
		const weighted = new Map<string, RelatedNoteCandidate>();
		const lexicalWeight = Math.max(0, this.settings.relatedNotesHybridLexicalWeight);
		const vectorWeight = Math.max(0, this.settings.relatedNotesHybridVectorWeight);
		const sum = lexicalWeight + vectorWeight;
		const normalizedLexicalWeight = sum > 0 ? lexicalWeight / sum : 0.4;
		const normalizedVectorWeight = sum > 0 ? vectorWeight / sum : 0.6;

		for (const candidate of lexical) {
			weighted.set(candidate.file.path, {
				file: candidate.file,
				score: candidate.score * normalizedLexicalWeight,
				reasons: [...candidate.reasons],
			});
		}

		for (const vector of vectorRows) {
			const current = weighted.get(vector.file.path);
			const vectorScore = vector.score * normalizedVectorWeight;
			if (current) {
				current.score += vectorScore;
				current.reasons = [...current.reasons, `ベクトル類似度: ${vector.score.toFixed(3)}`];
			} else {
				weighted.set(vector.file.path, {
					file: vector.file,
					score: vectorScore,
					reasons: [`ベクトル類似度: ${vector.score.toFixed(3)}`],
				});
			}
		}

		return Array.from(weighted.values())
			.filter((candidate) => candidate.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, Math.max(1, Math.min(50, this.settings.relatedNotesLimit)));
	}
}
