# Method index (current snapshot)

- Generated from TypeScript AST on 2026-03-19.
- Scope: src/**/*.ts
- Maintenance rule: append a one-line responsibility description to method entries when touching that method.
- Investigation rule: check this file first to narrow source files before deep code reading.

## src/agent/adkAgent.ts

- function: createAgent(app: App, plugin: MyPlugin, goal: string, apiKey?: string, interactive: boolean = true, templatePath?: string) => Creates and returns a new resource.

## src/agent/agentService.ts

- method: AgentService.setLogView(view: AgentLogView) => Updates log view.
- method: AgentService.log(level: 'info' | 'warn' | 'error' | 'success', message: string) => Handles log logic for this module.
- method: AgentService.run() => Runs the primary workflow for this service.
- method: AgentService.openNote(file: TFile) => Opens the target view or file in the workspace.
- method: AgentService.plan(goal: string): Promise<string[]> => Creates an execution plan from the requested goal.
- method: AgentService.executeStep(step: string, goal: string, stepNum: number): Promise<string> => Executes the specified step and returns the outcome.
- method: AgentService.getVaultContext(query: string): Promise<string> => Returns vault context.
- method: AgentService.searchNotes(query: string): Promise<TFile[]> => Searches available notes and returns matches.
- method: AgentService.summarizeFile(file: TFile): Promise<string> => Handles summarize file logic for this module.
- method: AgentService.createTask(title: string, body: string): Promise<TFile> => Creates and returns a new resource.
- method: AgentService.ensureFolder(folder: string) => Ensures required resources exist before continuing.

## src/agent/agentSessionNote.ts

- method: AgentSessionNote.create(): Promise<TFile> => Creates and returns a new resource.
- method: AgentSessionNote.update(): Promise<void> => Updates internal state and persists related changes when needed.
- method: AgentSessionNote.readFromNote(): Promise<void> => Reads source data and returns parsed content.
- method: AgentSessionNote.getFile(): TFile | null => Returns file.
- method: AgentSessionNote.setFile(file: TFile): void => Updates file.
- method: AgentSessionNote.getData(): AgentSessionData => Returns data.
- method: AgentSessionNote.getSessionFolderPath(): string | undefined => Returns session folder path.
- method: AgentSessionNote.setStatus(status: AgentSessionData['status']): void => Updates status.
- method: AgentSessionNote.setTemplateReference(templatePath?: string): void => Updates template reference.
- method: AgentSessionNote.setPlan(plan: string[]): void => Updates plan.
- method: AgentSessionNote.setStepReferencedInstructions(step: number, instructions: string[]): void => Updates step referenced instructions.
- method: AgentSessionNote.updateStepStatus(step: number, status: 'running' | 'completed' | 'error', result?: string, inputRequired?: string, references?: string[]): void => Updates internal state for the current workflow.
- method: AgentSessionNote.setCurrentStep(step: number): void => Updates current step.
- method: AgentSessionNote.generateNoteContent(): string => Generates a computed result from the given inputs.
- method: AgentSessionNote.parseFrontmatter(content: string): void => Parses input text and converts it into structured data.
- method: AgentSessionNote.parseNoteContent(content: string): void => Parses input text and converts it into structured data.
- method: AgentSessionNote.ensureFolder(folder: string): Promise<void> => Ensures required resources exist before continuing.

## src/agent/agentTemplateService.ts

- method: AgentTemplateService.loadTemplate(templatePath: string): Promise<AgentTemplate> => Loads data from storage and prepares it for use.
- method: AgentTemplateService.getAvailableMarkdownFiles(): TFile[] => Returns available markdown files.
- method: AgentTemplateService.parseTemplate(content: string, templatePath: string): AgentTemplate => Parses input text and converts it into structured data.
- method: AgentTemplateService.extractSections(content: string): { [key: string]: string } => Extracts the required subset of data from the input.
- method: AgentTemplateService.parseListSection(content: string): string[] => Parses input text and converts it into structured data.
- method: AgentTemplateService.formatAsSystemPrompt(template: AgentTemplate): string => Formats values into display-ready text.
- method: AgentTemplateService.loadReferenceNoteContents(notesList: string[]): Promise<{ [key: string]: string }> => Loads data from storage and prepares it for use.

## src/agent/agentTools.ts

- method: AgentTools.getToolDeclarations(): GeminiFunctionDeclaration[] => Returns tool declarations.
- method: AgentTools.executeTool(name: string, args: Record<string, any>): Promise<any> => Executes the specified step and returns the outcome.
- method: AgentTools.searchNotes(query: string): Promise<{ files: string[]; count: number }> => Searches available notes and returns matches.
- method: AgentTools.readNote(path: string): Promise<{ content: string; path: string }> => Reads source data and returns parsed content.
- method: AgentTools.summarizeNote(path: string): Promise<{ summary: string; path: string }> => Handles summarize note logic for this module.
- method: AgentTools.createNote(title: string, content: string): Promise<{ path: string; success: boolean }> => Creates and returns a new resource.

## src/agent/interactiveAgentService.ts

- method: InteractiveAgentService.setLogView(view: AgentLogView) => Updates log view.
- method: InteractiveAgentService.log(level: 'info' | 'warn' | 'error' | 'success', message: string) => Handles log logic for this module.
- method: InteractiveAgentService.run(): Promise<void> => Runs the primary workflow for this service.
- method: InteractiveAgentService.buildStepReferencedInstructions(step: string, options?: { stepInstruction?: string; deepDive?: boolean }): string[] => Builds derived data needed for downstream processing.
- method: InteractiveAgentService.toExcerpt(text: string, maxLength: number): string => Converts input into an alternate representation.
- method: InteractiveAgentService.generatePlan(goal: string): Promise<string[]> => Generates a computed result from the given inputs.
- method: InteractiveAgentService.executeStep(step: string, goal: string, stepNum: number, options?: { stepInstruction?: string; deepDive?: boolean }): Promise<{ result: string; inputRequired?: string; references?: string[] }> => Executes the specified step and returns the outcome.
- method: InteractiveAgentService.searchNotes(query: string): Promise<TFile[]> => Searches available notes and returns matches.
- method: InteractiveAgentService.summarizeFile(file: TFile): Promise<string> => Handles summarize file logic for this module.
- method: InteractiveAgentService.createTask(title: string, body: string): Promise<string> => Creates and returns a new resource.
- method: InteractiveAgentService.ensureFolder(folder: string): Promise<void> => Ensures required resources exist before continuing.
- method: InteractiveAgentService.openNote(file: TFile): Promise<void> => Opens the target view or file in the workspace.
- method: InteractiveAgentService.extractInputRequirements(advice: string, step: string): Promise<string | null> => Extracts the required subset of data from input.
- method: InteractiveAgentService.resumeFromNote(sessionNote: AgentSessionNote, startStep?: number, forceRestart: boolean = false): Promise<void> => Handles resume from note logic for this module.

## src/agent/sessionResumeService.ts

- method: SessionResumeService.resumeFromCurrentNote(logView?: AgentLogView): Promise<void> => Handles resume from current note logic for this module.
- method: SessionResumeService.isSessionNote(content: string): boolean => Checks whether is session note.
- method: SessionResumeService.parseFrontmatter(content: string): Record<string, string> => Parses input text and converts it into structured data.

## src/agentLogView.ts

- method: AgentLogView.getViewType(): string => Returns view type.
- method: AgentLogView.getDisplayText(): string => Returns display text.
- method: AgentLogView.getIcon(): string => Returns icon.
- method: AgentLogView.onOpen() => Initializes the view/modal when it is opened.
- method: AgentLogView.onClose() => Cleans up state when the view/modal is closed.
- method: AgentLogView.addLog(level: LogEntry['level'], message: string) => Handles add log logic for this module.
- method: AgentLogView.clearLogs() => Handles clear logs logic for this module.
- method: AgentLogView.renderLogs() => Renders UI content for the current state.
- method: AgentLogView.renderLogEntry(entry: LogEntry) => Renders UI content for the current state.
- method: AgentLogView.formatTime(date: Date): string => Formats values into display-ready text.
- method: AgentLogView.showFeedbackPrompt(message: string): Promise<FeedbackPromptResult> => Displays a UI prompt or interactive element.
- method: AgentLogView.closeFeedbackPrompt() => Closes the active view or modal and cleans up state.

## src/chatHistoryService.ts

- method: ChatHistoryService.saveChatHistory(folderPath: string, messageHistory: Array<{ role: string; content: string }>): Promise<TFile | null> => Saves the current data to storage.
- method: ChatHistoryService.createFileTitleFromHistory(messageHistory: Array<{ role: string; content: string }>): string => Creates and returns a new resource.
- method: ChatHistoryService.sanitizeFileName(text: string): string => Handles sanitize file name logic for this module.
- method: ChatHistoryService.formatChatHistory(messageHistory: Array<{ role: string; content: string }>, savedAt: Date): string => Formats values into display-ready text.

## src/chatReferenceModal.ts

- method: ReferenceFileModal.onOpen() => Initializes the view/modal when it is opened.
- method: ReferenceFileModal.onClose() => Cleans up state when the view/modal is closed.
- method: ReferenceFileModal.renderList(container: HTMLElement) => Renders UI content for the current state.
- method: ReferenceFileModal.buildTree(files: TFile[]) => Builds derived data needed for downstream processing.
- method: ReferenceFileModal.renderTree(container: HTMLElement, node: any, indent: number) => Renders UI content for the current state.
- method: ReferenceFileModal.collectFilesInNode(node: any): TFile[] => Handles collect files in node logic for this module.
- method: ReferenceFileModal.getVisibleFiles(): TFile[] => Returns visible files.
- method: ReferenceFileModal.applyFilter() => Applies selected changes to produce updated content.
- method: ReferenceFileModal.submit() => Validates input and submits the current request.
- method: ReferenceFileModal.resolveOnce(result: ReferenceFileSelection | null) => Resolves pending state exactly once and returns the result.
- function: promptForReferenceFiles(app: App, initialPaths?: Set<string>): Promise<ReferenceFileSelection | null> => Handles prompt for reference files logic for this module.

## src/chatReferenceService.test.ts

- function: normalizeWhitespace(text: string): string => Normalizes input into a consistent format.

## src/chatReferenceService.ts

- method: ChatReferenceService.parseAtReferences(text: string): { => Parses input text and converts it into structured data.
		references: ParsedAtReference[];
		cleanedText: string;
	}
- method: ChatReferenceService.resolveReferences(references: ParsedAtReference[]): Promise<ParsedAtReference[]> => Resolves pending state and returns the finalized result.
- method: ChatReferenceService.readBinaryFile(file: TFile): Promise<ArrayBuffer> => Reads source data and returns parsed content.
- method: ChatReferenceService.validateReferences(references: ParsedAtReference[]): boolean => Handles validate references logic for this module.
- method: ChatReferenceService.buildPromptWithReferences(userMessage: string, references: ParsedAtReference[]): string => Builds derived data needed for downstream processing.
- method: ChatReferenceService.getTargetFolder(references: ParsedAtReference[]): string | null => Returns target folder.
- method: ChatReferenceService.saveResponseToFile(folderPath: string, fileName: string, content: string): Promise<TFile | null> => Saves the current data to storage.
- method: ChatReferenceService.sanitizeFileName(fileName: string): string => Handles sanitize file name logic for this module.

## src/chatView.ts

- method: ChatView.initializeGeminiService() => Handles initialize gemini service logic for this module.
- method: ChatView.getViewType() => Returns view type.
- method: ChatView.getDisplayText() => Returns display text.
- method: ChatView.onOpen() => Initializes the view/modal when it is opened.
- method: ChatView.onClose() => Cleans up state when the view/modal is closed.
- method: ChatView.isMarkdownTableLine(line: string): boolean => Checks whether is markdown table line.
- method: ChatView.isMarkdownTableSeparator(line: string): boolean => Checks whether is markdown table separator.
- method: ChatView.normalizeMarkdownForRender(content: string): string => Normalizes input into a consistent format.
- method: ChatView.renderAssistantMessage(container: HTMLElement, content: string): Promise<void> => Renders UI content for the current state.
- method: ChatView.renderUserMessage(container: HTMLElement, message: string, references: ParsedAtReference[] = []): void => Renders UI content for the current state.
- method: ChatView.handleSendMessage(message: string, references: ParsedAtReference[] = [], useGoogleSearch: boolean = false) => Handles a user-triggered action flow end-to-end.
- method: ChatView.handleSaveHistory() => Handles a user-triggered action flow end-to-end.
- method: ChatView.isFileEditResponse(response: string): boolean => Checks whether is file edit response.
- method: ChatView.extractCodeFromResponse(response: string): string | null => Extracts the required subset of data from input.
- method: ChatView.updateAutocomplete() => Parses the current @token and renders type/file/folder autocomplete candidates.
- method: ChatView.findAtTokenAtCursor(text: string, cursorPos: number): string | null => Returns the active @token at cursor, including partial type input like @r.
- method: ChatView.filterFilesForPattern(pattern: string): TFile[] => Filters candidates and returns the matching subset.
- method: ChatView.filterFoldersForPattern(pattern: string): string[] => Filters candidates and returns the matching subset.
- method: ChatView.renderTypeSelection(partialInput: string = '') => Renders UI content for the current state.
- method: ChatView.renderAutocompleteList(type: 'outNoteFormat' | 'instruction' | 'reference' | 'outFolder' | 'file', pattern: string, files: TFile[], currentToken: string) => Renders UI content for the current state.
- method: ChatView.insertAutocompleteSelection(type: 'outNoteFormat' | 'instruction' | 'reference' | 'outFolder' | 'file', filePath: string) => Handles insert autocomplete selection logic for this module.
- method: ChatView.insertTypeSelection(type: string) => Handles insert type selection logic for this module.
- method: ChatView.renderFolderAutocompleteList(folders: string[]) => Renders UI content for the current state.
- method: ChatView.generateTitleSuggestionPrompt(response: string): string => Generates a computed result from the given inputs.
- method: ChatView.insertFolderSelection(folderPath: string) => Handles insert folder selection logic for this module.
- method: ChatView.openAttachmentSelector() => Opens the target view or file in the workspace.
- method: ChatView.insertAttachmentReference(filePath: string) => Handles insert attachment reference logic for this module.
- method: ChatView.setupDragAndDrop(container: HTMLElement) => Updates up drag and drop.
- method: ChatView.saveAttachmentFile(file: File): Promise<string> => Saves the current data to storage.
- method: AttachmentFileModal.getSuggestions(query: string): TFile[] => Returns suggestions.
- method: AttachmentFileModal.renderSuggestion(file: TFile, el: HTMLElement) => Renders UI content for the current state.
- method: AttachmentFileModal.onChooseSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent) => Handles on choose suggestion logic for this module.

## src/diffModal.ts

- method: DiffModal.onOpen() => Initializes the view/modal when it is opened.
- method: DiffModal.renderHunks(container: HTMLElement) => Renders UI content for the current state.
- method: DiffModal.applyChanges() => Applies selected changes to produce updated content.
- method: DiffModal.refresh() => Handles refresh logic for this module.
- method: DiffModal.onClose() => Cleans up state when the view/modal is closed.

## src/diffService.test.ts

- (no function or method declarations found)

## src/diffService.ts

- method: DiffService.computeDiff(oldText: string, newText: string): ParsedDiff => Computes and returns a derived value.
- method: DiffService.parsePatch(patch: string): DiffHunk[] => Parses input text and converts it into structured data.
- method: DiffService.splitHunksByMarkdownHeadings(hunks: DiffHunk[], oldText: string, newText: string): DiffHunk[] => Handles split hunks by markdown headings logic for this module.
- method: DiffService.splitSingleHunkByMarkdownHeadings(hunk: DiffHunk, oldLines: string[], newLines: string[]): DiffHunk[] => Handles split single hunk by markdown headings logic for this module.
- method: DiffService.isChangedLine(line: string): boolean => Checks whether is changed line.
- method: DiffService.isHeadingBoundaryLine(line: string): boolean => Checks whether is heading boundary line.
- method: DiffService.extractSectionTitle(line: string): string | undefined => Extracts the required subset of data from input.
- method: DiffService.findNearestSectionTitle(lines: string[], lineNumber: number): string | undefined => Finds and returns matching items from available sources.
- method: DiffService.getOldLineDelta(line: string): number => Returns old line delta.
- method: DiffService.getNewLineDelta(line: string): number => Returns new line delta.
- method: DiffService.applySelectedHunks(oldText: string, newText: string, selectedHunkIds: Set<string>): string => Applies selected changes to produce updated content.
- method: DiffService.extractNewLinesFromHunk(hunk: DiffHunk): string[] => Extracts the required subset of data from the input.
- method: DiffService.generateDiffLines(oldText: string, newText: string): Array<{ => Generates a computed result from the given inputs.
		type: 'add' | 'remove' | 'context';
		content: string;
		lineNumber?: number;
	}>
- function: finalizePart() => Handles finalize part logic for this module.

## src/diffView.ts

- method: DiffView.setDiffData(file: TFile, oldText: string, newText: string, metadata: { searchEnabled?: boolean; searchReferences?: string[] } | undefined, onApply: (text: string) => void)
- method: DiffView.getViewType(): string => Returns view type.
- method: DiffView.getDisplayText(): string => Returns display text.
- method: DiffView.getIcon(): string => Returns icon.
- method: DiffView.onOpen() => Initializes the view/modal when it is opened.
- method: DiffView.renderControlPanel() => Renders UI content for the current state.
- method: DiffView.renderRightPane() => Renders UI content for the current state.
- method: DiffView.isLineAddedInNew(lineNumber: number): boolean => Checks whether is line added in new.
- method: DiffView.isLineInSelectedHunk(lineNumber: number, isOld: boolean): boolean => Checks whether is line in selected hunk.
- method: DiffView.scrollToHunk(index: number) => Handles scroll to hunk logic for this module.
- method: DiffView.applyChanges() => Applies selected changes to produce updated content.
- method: DiffView.refresh() => Handles refresh logic for this module.
- method: DiffView.close() => Closes the active view or modal and cleans up state.
- method: DiffView.onClose() => Cleans up state when the view/modal is closed.

## src/editRequestModal.ts

- method: EditRequestModal.onOpen() => Initializes the view/modal when it is opened.
- method: EditRequestModal.onClose() => Cleans up state when the view/modal is closed.
- method: EditRequestModal.renderReferenceList(container: HTMLElement) => Renders UI content for the current state.
- method: EditRequestModal.submit() => Validates input and submits the current request.
- method: EditRequestModal.resolveOnce(result: EditRequest | null) => Resolves pending state exactly once and returns the result.
- function: promptForEditRequest(app: App, targetFile: TFile): Promise<EditRequest | null> => Handles prompt for edit request logic for this module.

## src/fileEditService.ts

- method: FileEditService.getActiveFile(): TFile | null => Returns active file.
- method: FileEditService.editFileWithAI(instruction: string, referenceFiles: TFile[] = [], useGoogleSearch: boolean = false): Promise<void> => Handles edit file with ai logic for this module.
- method: FileEditService.requestModification(content: string, instruction: string, referenceNotes: Array<{ path: string; content: string }>, useGoogleSearch: boolean): Promise<{ modifiedContent: string; searchReferences: string[] }> => Handles request modification logic for this module.
- method: FileEditService.loadReferenceContents(referenceFiles: TFile[], targetPath: string): Promise<Array<{ path: string; content: string }>> => Loads data from storage and prepares it for use.
- method: FileEditService.buildReferenceSection(referenceNotes: Array<{ path: string; content: string }>): string => Builds derived data needed for downstream processing.
- method: FileEditService.showDiffView(file: TFile, oldContent: string, newContent: string, metadata?: { searchEnabled?: boolean; searchReferences?: string[] }): Promise<void> => Displays a UI prompt or interactive element.
- method: FileEditService.createTempFile(originalFile: TFile, content: string): Promise<TFile | null> => Creates and returns a new resource.
- method: FileEditService.deleteTempFile(file: TFile): Promise<void> => Handles delete temp file logic for this module.

## src/fileExtractionService.ts

- method: FileExtractionService.extractText(arrayBuffer: ArrayBuffer, filename: string): Promise<ExtractionResult> => Extracts the required subset of data from the input.
- method: FileExtractionService.extractFromPDF(arrayBuffer: ArrayBuffer): Promise<ExtractionResult> => Extracts the required subset of data from the input.
- method: FileExtractionService.extractFromPPTX(arrayBuffer: ArrayBuffer): Promise<ExtractionResult> => Extracts the required subset of data from the input.
- method: FileExtractionService.extractTextFromSlideXML(xmlString: string): Promise<string> => Extracts the required subset of data from the input.
- method: FileExtractionService.extractFromDOCX(arrayBuffer: ArrayBuffer): Promise<ExtractionResult> => Extracts the required subset of data from the input.
- method: FileExtractionService.extractFromTXT(arrayBuffer: ArrayBuffer): ExtractionResult => Extracts the required subset of data from the input.
- method: FileExtractionService.extractFromImage(arrayBuffer: ArrayBuffer, ext: string): ExtractionResult => Extracts the required subset of data from the input.
- method: FileExtractionService.getFileExtension(filename: string): string => Returns file extension.
- method: FileExtractionService.isSupportedFileType(filename: string): boolean => Checks whether is supported file type.
- method: FileExtractionService.isImageType(filename: string): boolean => Checks whether is image type.
- method: FileExtractionService.getFileType(filename: string): string => Returns file type.
- function: walk(obj: any) => Handles walk logic for this module.

## src/folderAccessControl.test.ts

- function: createSettings(overrides: Partial<MyPluginSettings> = {}): MyPluginSettings => Builds test settings with default related-note and access-control values.

## src/folderAccessControl.ts

- method: FolderAccessControl.isFileAccessAllowed(file: TFile): boolean => Checks whether is file access allowed.
- method: FolderAccessControl.isPathAccessAllowed(path: string): boolean => Checks whether is path access allowed.
- method: FolderAccessControl.normalizePath(path: string): string => Normalizes input into a consistent format.
- method: FolderAccessControl.isPathInFolderList(path: string, folderList: string[]): boolean => Checks whether is path in folder list.
- method: FolderAccessControl.filterAllowedFiles(files: TFile[]): TFile[] => Filters candidates and returns the matching subset.
- method: FolderAccessControl.getAccessControlInfo(): string => Returns access control info.

## src/geminiService.ts

- method: GeminiService.chat(messages: Array<{ role: string; content: string }>, inlineImages?: Array<{ mimeType: string; data: string }>, useGoogleSearch?: boolean): Promise<string> => Sends chat inputs to Gemini and returns the response.
- method: GeminiService.chatWithMetadata(messages: Array<{ role: string; content: string }>, inlineImages?: Array<{ mimeType: string; data: string }>, useGoogleSearch?: boolean): Promise<{ text: string; references: string[] }> => Sends chat inputs to Gemini and returns the response.
- method: GeminiService.chatWithTools(messages: Array<{ role: string; content: string }>, functionDeclarations: GeminiFunctionDeclaration[], toolExecutor: ToolExecutor, maxIterations: number = 5): Promise<{ text: string; references: string[]; toolCalls: Array<{ name: string; args: any; result: any }> }> => Sends chat inputs to Gemini and returns the response.
- method: GeminiService.embedText(text: string, embeddingModel: string = 'gemini-embedding-001'): Promise<number[]> => Requests embedding vectors with fallback to a supported model on 404 errors.
- method: GeminiService.embedTexts(texts: string[], embeddingModel: string = 'gemini-embedding-001'): Promise<number[][]> => Generates embeddings for multiple texts sequentially using embedText fallback behavior.
- method: GeminiService.generateTitle(prompt: string): Promise<string> => Generates a computed result from the given inputs.

## src/main.ts

- method: MyPlugin.onload() => Registers commands including lexical/vector/hybrid related-note workflows.
- method: MyPlugin.onunload() => Handles onunload logic for this module.
- method: MyPlugin.activateView() => Handles activate view logic for this module.
- method: MyPlugin.activateAgentLogView(): Promise<AgentLogView | null> => Handles activate agent log view logic for this module.
- method: MyPlugin.loadSettings() => Loads settings and migrates legacy single vector folder into multi-folder config.
- method: MyPlugin.saveSettings() => Saves the current data to storage.
- method: MyPlugin.createVectorIndexService(accessControl: FolderAccessControl): VectorIndexService | null => Creates a vector index service using embedding settings and multiple target folders.
- method: MyPlugin.convertVectorResults(rows: VectorSearchResult[]): RelatedNoteCandidate[] => Converts vector similarity rows into modal-ready related note candidates.
- method: MyPlugin.mergeHybridResults(lexical: RelatedNoteCandidate[], vectorRows: VectorSearchResult[]): RelatedNoteCandidate[] => Merges lexical and vector scores using normalized hybrid weights.

## src/modals/agentConfirmModal.ts

- method: AgentConfirmModal.onOpen() => Initializes the view/modal when it is opened.
- method: AgentConfirmModal.onClose() => Cleans up state when the view/modal is closed.
- method: AgentConfirmModal.resolveOnce(result: ConfirmResult | null) => Resolves pending state exactly once and returns the result.
- function: promptAgentConfirmation(app: App, message: string, showFeedbackInput = false): Promise<ConfirmResult | null> => Handles prompt agent confirmation logic for this module.

## src/modals/agentPromptModal.ts

- method: AgentPromptModal.onOpen() => Initializes the view/modal when it is opened.
- method: AgentPromptModal.populateTemplates() => Handles populate templates logic for this module.
- method: AgentPromptModal.getTemplateCandidates(templateFolder?: string): TFile[] => Returns template candidates.
- method: AgentPromptModal.onClose() => Cleans up state when the view/modal is closed.
- method: AgentPromptModal.submit() => Validates input and submits the current request.
- method: AgentPromptModal.resolveOnce(res: AgentGoalResult | null) => Resolves pending state exactly once and returns the result.
- function: promptForAgentGoal(app: App, options?: AgentPromptOptions): Promise<AgentGoalResult | null> => Handles prompt for agent goal logic for this module.

## src/modals/noteSplitModal.ts

- function: promptNoteSplit(app: App, file: TFile, apiKey: string, model: string, defaultCriteria: string): Promise<void> => Handles prompt note split logic for this module.
- function: promptNoteSplitSelection(app: App, file: TFile, selectedText: string, apiKey: string, model: string, defaultCriteria: string): Promise<void> => Handles prompt note split selection logic for this module.
- method: NoteSplitModal.onOpen() => Initializes the view/modal when it is opened.
- method: NoteSplitModal.onClose() => Cleans up state when the view/modal is closed.
- method: NoteSplitModal.render() => Renders UI content for the current state.
- method: NoteSplitModal.renderInputPhase() => Renders UI content for the current state.
- method: NoteSplitModal.renderLoadingPhase() => Renders UI content for the current state.
- method: NoteSplitModal.renderPreviewPhase() => Renders UI content for the current state.
- method: NoteSplitModal.renderCreatingPhase() => Renders UI content for the current state.
- method: NoteSplitModal.startAnalysis() => Handles start analysis logic for this module.
- method: NoteSplitModal.createSelectedNotes() => Creates and returns a new resource.
- method: NoteSplitModal.getAllFoldersInVault(): string[] => Returns all folders in vault.
- method: NoteSplitModal.showFolderDropdown(inputElement: HTMLInputElement, folders: string[]) => Displays a UI prompt or interactive element.
- method: NoteSplitModal.populateFolderDatalist(datalist: HTMLElement, folders: string[]) => Handles populate folder datalist logic for this module.

## src/modals/relatedNotesModal.ts

- method: RelatedNotesModal.getSuggestions(query: string): RelatedNoteCandidate[] => Returns suggestions.
- method: RelatedNotesModal.renderSuggestion(item: RelatedNoteCandidate, el: HTMLElement): void => Renders UI content for the current state.
- method: RelatedNotesModal.onChooseSuggestion(item: RelatedNoteCandidate, _evt: MouseEvent | KeyboardEvent): void => Opens the selected related note in an adjacent pane.

## src/modals/resumeModeModal.ts

- function: promptForResumeMode(app: App): Promise<ResumeModeResult> => Handles prompt for resume mode logic for this module.
- method: ResumeModeModal.onOpen() => Initializes the view/modal when it is opened.
- method: ResumeModeModal.onClose() => Cleans up state when the view/modal is closed.
- method: ResumeModeModal.resolveOnce(v: ResumeModeResult) => Resolves pending state and returns the finalized result.

## src/modals/resumeStepModal.ts

- function: promptForResumeStep(app: App, plan: string[]): Promise<ResumeStepResult> => Handles prompt for resume step logic for this module.
- method: ResumeStepModal.onOpen() => Initializes the view/modal when it is opened.
- method: ResumeStepModal.onClose() => Cleans up state when the view/modal is closed.
- method: ResumeStepModal.submit() => Validates input and submits the current request.
- method: ResumeStepModal.resolveOnce(v: ResumeStepResult) => Resolves pending state and returns the finalized result.

## src/modals/saveNoteModal.ts

- method: SaveNoteModal.onOpen() => Initializes the view/modal when it is opened.
- method: SaveNoteModal.onClose() => Cleans up state when the view/modal is closed.

## src/modals/stepExecuteModal.ts

- function: promptForStepExecution(app: App, stepNumber: number, stepText: string): Promise<StepExecuteResult | null> => Handles prompt for step execution logic for this module.
- method: StepExecuteModal.onOpen() => Initializes the view/modal when it is opened.
- method: StepExecuteModal.onClose() => Cleans up state when the view/modal is closed.
- method: StepExecuteModal.resolveOnce(v: StepExecuteResult | null) => Resolves pending state exactly once and returns the result.

## src/noteSplitService.ts

- method: NoteSplitService.analyzeSplit(file: TFile, criteria: string): Promise<NotePart[]> => Handles analyze split logic for this module.
- method: NoteSplitService.analyzeSplitFromText(content: string, sourceName: string, criteria: string): Promise<NotePart[]> => Handles analyze split from text logic for this module.
- method: NoteSplitService.parseResponse(response: string): NotePart[] => Parses input text and converts it into structured data.
- method: NoteSplitService.createNotes(requests: NoteCreateRequest[], sourceName: string): Promise<NoteSplitResult> => Creates and returns a new resource.

## src/relatedNotesService.ts

- method: RelatedNotesService.findRelatedNotes(activeFile: TFile, limit = this.config.limit): Promise<RelatedNoteCandidate[]> => Finds and returns matching items from available sources.
- method: RelatedNotesService.normalizeConfig(config?: Partial<RelatedNotesScoringConfig>): RelatedNotesScoringConfig => Normalizes input into a consistent format.
- method: RelatedNotesService.extractFeatures(file: TFile): Promise<FileFeatures> => Extracts the required subset of data from the input.
- method: RelatedNotesService.extractTags(cache: CachedMetadata | null): Set<string> => Extracts the required subset of data from input.
- method: RelatedNotesService.normalizeTag(tag: string): string => Normalizes input into a consistent format.
- method: RelatedNotesService.extractOutgoingLinks(file: TFile, cache: CachedMetadata | null): Set<string> => Extracts the required subset of data from input.
- method: RelatedNotesService.countTerms(text: string): Map<string, number> => Counts occurrences and returns the aggregate result.
- method: RelatedNotesService.stripMarkdown(text: string): string => Strips markup and returns plain text content.
- method: RelatedNotesService.removeFrontmatter(text: string): string => Removes targeted sections from the input content.
- method: RelatedNotesService.removeFormatterSections(text: string): string => Removes targeted sections from the input content.
- method: RelatedNotesService.tokenize(text: string): string[] => Tokenizes text into normalized terms.
- method: RelatedNotesService.computeIdf(docs: FileFeatures[], queryTerms: Map<string, number>): Map<string, number> => Computes and returns a derived value.
- method: RelatedNotesService.tfidfCosine(a: Map<string, number>, b: Map<string, number>, idf: Map<string, number>): number => Handles tfidf cosine logic for this module.
- method: RelatedNotesService.overlapScore(a: Map<string, number>, b: Map<string, number>): number => Handles overlap score logic for this module.
- method: RelatedNotesService.setOverlapScore(a: Set<string>, b: Set<string>): number => Updates overlap score.
- method: RelatedNotesService.commonItems(a: Set<string>, b: Set<string>): string[] => Handles common items logic for this module.
- method: RelatedNotesService.commonTerms(a: Map<string, number>, b: Map<string, number>): string[] => Handles common terms logic for this module.
- method: RelatedNotesService.hasLinkRelation(a: FileFeatures, b: FileFeatures): boolean => Checks whether has link relation.
- method: RelatedNotesService.linkScore(a: FileFeatures, b: FileFeatures): number => Handles link score logic for this module.

## src/settings.ts

- method: SampleSettingTab.display(): void => Renders plugin settings including related-note lexical/vector/hybrid options.
- method: SampleSettingTab.displayFolderList(containerEl: HTMLElement, folders: string[], onChange: (folders: string[]) => void, label: string) | Handles display folder list logic for this module.
- method: SampleSettingTab.updateFolderSuggestions(inputElement: HTMLInputElement, container: HTMLElement) => Updates internal state and persists related changes when needed.
- method: SampleSettingTab.getAllFoldersInVault(): string[] => Returns all folders in vault.
- method: SampleSettingTab.getTemplateCandidateFiles(templateFolder: string): TFile[] => Returns template candidate files.
- method: SampleSettingTab.showFileDropdown(inputElement: HTMLInputElement, files: TFile[]) => Displays a UI prompt or interactive element.
- method: SampleSettingTab.showFolderDropdown(inputElement: HTMLInputElement, folders: string[]) => Displays a UI prompt or interactive element.
- function: updateList() => Updates internal state and persists related changes when needed.

## src/vectorIndexService.ts

- method: VectorIndexService.buildOrUpdateIndex(): Promise<VectorIndexBuildResult> => Builds or updates vector index entries using fingerprint-based incremental processing.
- method: VectorIndexService.findSimilarNotes(activeFile: TFile, limit: number): Promise<VectorSearchResult[]> => Computes local cosine similarity against indexed vectors and returns top matches.
- method: VectorIndexService.getScopedFiles(): TFile[] => Returns markdown files in scope after multi-folder and access-control filtering.
- method: VectorIndexService.isInTargetFolders(path: string): boolean => Checks whether a path belongs to any configured target folder scope.
- method: VectorIndexService.buildFingerprint(file: TFile): string => Creates a deterministic fingerprint from file metadata and embedding model.
- method: VectorIndexService.buildEmbeddingText(file: TFile): Promise<string> => Generates cleaned embedding input text from markdown content.
- method: VectorIndexService.cosineSimilarity(a: number[], b: number[]): number => Calculates cosine similarity between two vectors.
- method: VectorIndexService.getIndexKey(): string => Builds a storage key per embedding model and target folder.
- method: VectorIndexService.normalizeFolders(folders: string[]): string[] => Normalizes, deduplicates, and sorts folder path boundaries for matching and keys.
- method: VectorIndexService.getIndexFilePath(): string => Returns plugin-local JSON path for persisting vector indexes.
- method: VectorIndexService.loadStore(): Promise<VectorIndexStore> => Loads and validates persisted vector index store.
- method: VectorIndexService.saveStore(store: VectorIndexStore): Promise<void> => Persists vector index store JSON to plugin-local storage.

## src/test/mocks/obsidian.ts

- (no function or method declarations found)

