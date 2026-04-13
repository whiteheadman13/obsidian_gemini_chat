import { describe, expect, it, vi } from 'vitest';
import { FolderAccessControl } from './folderAccessControl';
import { NoteQaService } from './noteQaService';
import type { MyPluginSettings } from './settings';

const createSettings = (overrides: Partial<MyPluginSettings> = {}): MyPluginSettings => ({
	geminiApiKey: 'test-key',
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
	qaFinalSourceLimit: 2,
	qaMaxCharsPerNote: 80,
	qaMaxTotalChars: 120,
	qaEnableVectorRerank: false,
	noteSplitCriteria: '',
	chatPromptTemplateFolder: '',
	...overrides,
});

const createMockApp = () => {
	const files = [
		{ path: 'Notes/alpha.md', basename: 'alpha', stat: { mtime: 100, size: 100 } },
		{ path: 'Notes/beta.md', basename: 'beta', stat: { mtime: 100, size: 100 } },
		{ path: 'Private/secret.md', basename: 'secret', stat: { mtime: 100, size: 100 } },
	] as any[];

	const fileContents: Record<string, string> = {
		'Notes/alpha.md': '# Alpha\n\nalpha alpha alpha についての詳細です。\n\nこのノートは alpha の背景と実務上の意味を説明します。',
		'Notes/beta.md': '# Beta\n\nbeta beta beta の補足です。',
		'Private/secret.md': '# Secret\n\nalpha の機密情報です。',
	};

	const app = {
		vault: {
			getMarkdownFiles: () => files,
			read: async (file: any) => fileContents[file.path] ?? '',
		},
		metadataCache: {
			getFileCache: () => null,
		},
	} as any;

	return { app, files };
};

describe('NoteQaService', () => {
	it('質問に関連するノートだけを予算内でコンテキスト化して回答を生成する', async () => {
		const { app } = createMockApp();
		const access = new FolderAccessControl(createSettings({
			agentAllowedFolders: ['Notes'],
		}));
		const chat = vi.fn(async () => 'alpha に関する回答です');
		const gemini = { chat } as any;

		const service = new NoteQaService(app, createSettings({
			qaFinalSourceLimit: 1,
			qaMaxCharsPerNote: 60,
			qaMaxTotalChars: 60,
		}), access, gemini, null);

		const result = await service.answerQuestion('alpha の要点は?', false);

		expect(result.answer).toBe('alpha に関する回答です');
		expect(result.sources).toHaveLength(1);
		expect(result.sources[0]?.path).toBe('Notes/alpha.md');
		expect(result.sources[0]?.excerpt.length).toBeLessThanOrEqual(60);
		expect(chat).toHaveBeenCalledTimes(1);
		const firstCall = chat.mock.calls[0] as Array<Array<{ role: string; content: string }> | undefined> | undefined;
		const prompt = firstCall?.[0]?.[0]?.content ?? '';
		expect(prompt).toContain('Notes/alpha.md');
		expect(prompt).not.toContain('Private/secret.md');
		expect(result.diagnostics.totalNotes).toBe(3);
		expect(result.diagnostics.inScopeNotes).toBe(2);
		expect(result.diagnostics.outOfScopeNotes).toBe(1);
		expect(result.diagnostics.outOfScopeFolders).toContain('Private');
	});

	it('候補が見つからない場合はGeminiを呼ばずに根拠不足を返す', async () => {
		const { app } = createMockApp();
		const access = new FolderAccessControl(createSettings({
			agentAllowedFolders: ['Notes'],
		}));
		const chat = vi.fn(async () => 'should not be called');
		const gemini = { chat } as any;

		const service = new NoteQaService(app, createSettings(), access, gemini, null);

		const result = await service.answerQuestion('gamma の要点は?', false);

		expect(result.answer).toContain('関連するノートが見つかりませんでした');
		expect(result.sources).toHaveLength(0);
		expect(chat).not.toHaveBeenCalled();
		expect(result.diagnostics.outOfScopeNotes).toBe(1);
	});
});