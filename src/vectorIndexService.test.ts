import { describe, expect, it } from 'vitest';
import { FolderAccessControl } from './folderAccessControl';
import type { MyPluginSettings } from './settings';
import { VectorIndexService } from './vectorIndexService';

const createSettings = (overrides: Partial<MyPluginSettings> = {}): MyPluginSettings => ({
	geminiApiKey: '',
	geminiModel: 'gemini-3.1-flash-lite-preview',
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
	noteSplitCriteria: '',
	...overrides,
});

const createMockApp = () => {
	const fileA = {
		path: 'Projects/A.md',
		basename: 'A',
		stat: { mtime: 100, size: 10 },
	} as any;
	const fileB = {
		path: 'Projects/B.md',
		basename: 'B',
		stat: { mtime: 100, size: 10 },
	} as any;

	const files = [fileA, fileB];
	const fileContents: Record<string, string> = {
		[fileA.path]: 'alpha topic',
		[fileB.path]: 'beta topic',
	};

	const folders = new Set<string>();
	const storage = new Map<string, string>();
	const adapter = {
		exists: async (path: string) => storage.has(path) || folders.has(path),
		read: async (path: string) => {
			const text = storage.get(path);
			if (typeof text !== 'string') throw new Error(`missing file: ${path}`);
			return text;
		},
		write: async (path: string, content: string) => {
			storage.set(path, content);
		},
		mkdir: async (path: string) => {
			folders.add(path);
		},
	};

	const app = {
		vault: {
			configDir: '.obsidian',
			adapter,
			getMarkdownFiles: () => files,
			read: async (file: any) => fileContents[file.path] ?? '',
		},
	} as any;

	return { app, files, fileContents };
};

describe('VectorIndexService', () => {
	it('2回目の更新では未変更ファイルをスキップする', async () => {
		const { app } = createMockApp();
		const access = new FolderAccessControl(createSettings());
		const geminiService = {
			embedText: async (text: string) => [text.includes('A') ? 1 : 0, text.includes('B') ? 1 : 0],
		} as any;

		const service = new VectorIndexService(app, access, geminiService, 'obsidian-gemini', 'gemini-embedding-001', ['Projects']);
		const first = await service.buildOrUpdateIndex();
		expect(first.indexed).toBe(2);
		expect(first.updated).toBe(0);
		expect(first.skipped).toBe(0);

		const second = await service.buildOrUpdateIndex();
		expect(second.indexed).toBe(0);
		expect(second.updated).toBe(0);
		expect(second.skipped).toBe(2);
	});

	it('mtime変更時は該当ファイルだけ更新する', async () => {
		const { app, files } = createMockApp();
		const access = new FolderAccessControl(createSettings());
		const geminiService = {
			embedText: async (text: string) => [text.includes('A') ? 1 : 0, text.includes('B') ? 1 : 0],
		} as any;

		const service = new VectorIndexService(app, access, geminiService, 'obsidian-gemini', 'gemini-embedding-001', ['Projects']);
		await service.buildOrUpdateIndex();

		files[1].stat.mtime = 200;
		const updated = await service.buildOrUpdateIndex();
		expect(updated.indexed).toBe(0);
		expect(updated.updated).toBe(1);
		expect(updated.skipped).toBe(1);
	});
});
