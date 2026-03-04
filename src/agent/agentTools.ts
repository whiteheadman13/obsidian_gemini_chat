import { App, TFile } from 'obsidian';
import { GeminiFunctionDeclaration } from '../geminiService';
import { GeminiService } from '../geminiService';
import { FolderAccessControl } from '../folderAccessControl';

/**
 * Tool definitions for agent execution.
 * These tools can be called by LLM to perform actions in the vault.
 */
export class AgentTools {
	constructor(
		private app: App,
		private gemini: GeminiService | null,
		private accessControl: FolderAccessControl,
		private createTaskFn: (title: string, body: string) => Promise<string>
	) {}

	/**
	 * Get all tool declarations for Gemini Function Calling
	 */
	getToolDeclarations(): GeminiFunctionDeclaration[] {
		return [
			{
				name: 'search_notes',
				description: 'Search for notes in the vault by keyword. Returns a list of matching file paths.',
				parameters: {
					type: 'object',
					properties: {
						query: {
							type: 'string',
							description: 'The search query keyword to find relevant notes'
						}
					},
					required: ['query']
				}
			},
			{
				name: 'read_note',
				description: 'Read the full content of a specific note file by its path.',
				parameters: {
					type: 'object',
					properties: {
						path: {
							type: 'string',
							description: 'The file path of the note to read (e.g., "folder/note.md")'
						}
					},
					required: ['path']
				}
			},
			{
				name: 'summarize_note',
				description: 'Summarize the content of a specific note file. Returns a concise summary.',
				parameters: {
					type: 'object',
					properties: {
						path: {
							type: 'string',
							description: 'The file path of the note to summarize'
						}
					},
					required: ['path']
				}
			},
			{
				name: 'create_note',
				description: 'Create a new note in the vault with specified title and content.',
				parameters: {
					type: 'object',
					properties: {
						title: {
							type: 'string',
							description: 'The title of the new note'
						},
						content: {
							type: 'string',
							description: 'The markdown content of the new note'
						}
					},
					required: ['title', 'content']
				}
			}
		];
	}

	/**
	 * Execute a tool by name with given arguments
	 */
	async executeTool(name: string, args: Record<string, any>): Promise<any> {
		switch (name) {
			case 'search_notes':
				return await this.searchNotes(args.query);
			case 'read_note':
				return await this.readNote(args.path);
			case 'summarize_note':
				return await this.summarizeNote(args.path);
			case 'create_note':
				return await this.createNote(args.title, args.content);
			default:
				throw new Error(`Unknown tool: ${name}`);
		}
	}

	/**
	 * Search for notes matching the query
	 */
	private async searchNotes(query: string): Promise<{ files: string[]; count: number }> {
		const files = this.app.vault.getMarkdownFiles();
		const accessibleFiles = this.accessControl.filterAllowedFiles(files);
		
		const matches: string[] = [];
		const q = query.toLowerCase();
		
		for (const file of accessibleFiles) {
			try {
				const content = await this.app.vault.read(file);
				if (file.path.toLowerCase().includes(q) || content.toLowerCase().includes(q)) {
					matches.push(file.path);
					if (matches.length >= 10) break; // Limit to 10 results
				}
			} catch (e) {
				// Skip files that can't be read
			}
		}
		
		return { files: matches, count: matches.length };
	}

	/**
	 * Read the content of a note
	 */
	private async readNote(path: string): Promise<{ content: string; path: string }> {
		const file = this.app.vault.getAbstractFileByPath(path);
		
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found: ${path}`);
		}
		
		if (!this.accessControl.isFileAccessAllowed(file)) {
			throw new Error(`Access denied to file: ${path}`);
		}
		
		const content = await this.app.vault.read(file);
		
		// Truncate very long files to avoid token overflow
		const maxLength = 10000;
		const truncatedContent = content.length > maxLength 
			? content.substring(0, maxLength) + '\n\n...(content truncated)'
			: content;
		
		return { content: truncatedContent, path: file.path };
	}

	/**
	 * Summarize a note using Gemini
	 */
	private async summarizeNote(path: string): Promise<{ summary: string; path: string }> {
		const file = this.app.vault.getAbstractFileByPath(path);
		
		if (!file || !(file instanceof TFile)) {
			throw new Error(`File not found: ${path}`);
		}
		
		if (!this.accessControl.isFileAccessAllowed(file)) {
			throw new Error(`Access denied to file: ${path}`);
		}
		
		const content = await this.app.vault.read(file);
		
		if (!this.gemini) {
			throw new Error('Gemini service not available');
		}
		
		const prompt = `以下のノートを200字程度で日本語で要約してください。\n\n${content}`;
		const summary = await this.gemini.chat([{ role: 'user', content: prompt }]);
		
		return { summary, path: file.path };
	}

	/**
	 * Create a new note
	 */
	private async createNote(title: string, content: string): Promise<{ path: string; success: boolean }> {
		try {
			const path = await this.createTaskFn(title, content);
			return { path, success: true };
		} catch (error) {
			throw new Error(`Failed to create note: ${(error as Error).message}`);
		}
	}
}
