import { App, TFile } from 'obsidian';
import { FolderAccessControl } from './folderAccessControl';
import { GeminiService } from './geminiService';

interface VectorIndexEntry {
	path: string;
	fingerprint: string;
	vector: number[];
	updatedAt: number;
}

interface VectorIndexData {
	model: string;
	folders: string[];
	entries: Record<string, VectorIndexEntry>;
}

interface VectorIndexStore {
	version: 1;
	indexes: Record<string, VectorIndexData>;
}

export interface VectorIndexBuildResult {
	totalInScope: number;
	indexed: number;
	updated: number;
	removed: number;
	skipped: number;
}

export interface VectorSearchResult {
	file: TFile;
	score: number;
}

export class VectorIndexService {
	private app: App;
	private accessControl: FolderAccessControl;
	private geminiService: GeminiService;
	private embeddingModel: string;
	private targetFolders: string[];
	private pluginId: string;

	constructor(
		app: App,
		accessControl: FolderAccessControl,
		geminiService: GeminiService,
		pluginId: string,
		embeddingModel: string,
		targetFolders: string[]
	) {
		this.app = app;
		this.accessControl = accessControl;
		this.geminiService = geminiService;
		this.pluginId = pluginId;
		this.embeddingModel = embeddingModel || 'text-embedding-004';
		this.targetFolders = this.normalizeFolders(targetFolders);
	}

	async buildOrUpdateIndex(): Promise<VectorIndexBuildResult> {
		const store = await this.loadStore();
		const key = this.getIndexKey();
		const current = store.indexes[key] ?? {
			model: this.embeddingModel,
			folders: this.targetFolders,
			entries: {},
		};

		const files = this.getScopedFiles();
		const inScopePaths = new Set(files.map((f) => f.path));
		let indexed = 0;
		let updated = 0;
		let skipped = 0;

		for (const file of files) {
			const fingerprint = this.buildFingerprint(file);
			const previous = current.entries[file.path];
			if (previous && previous.fingerprint === fingerprint) {
				skipped += 1;
				continue;
			}

			const embeddingText = await this.buildEmbeddingText(file);
			const vector = await this.geminiService.embedText(embeddingText, this.embeddingModel);
			current.entries[file.path] = {
				path: file.path,
				fingerprint,
				vector,
				updatedAt: Date.now(),
			};

			if (previous) {
				updated += 1;
			} else {
				indexed += 1;
			}
		}

		let removed = 0;
		for (const path of Object.keys(current.entries)) {
			if (!inScopePaths.has(path)) {
				delete current.entries[path];
				removed += 1;
			}
		}

		store.indexes[key] = current;
		await this.saveStore(store);

		return {
			totalInScope: files.length,
			indexed,
			updated,
			removed,
			skipped,
		};
	}

	async findSimilarNotes(activeFile: TFile, limit: number): Promise<VectorSearchResult[]> {
		const store = await this.loadStore();
		const key = this.getIndexKey();
		const current = store.indexes[key];
		if (!current) {
			return [];
		}

		const embeddingText = await this.buildEmbeddingText(activeFile);
		const activeVector = await this.geminiService.embedText(embeddingText, this.embeddingModel);
		return this.searchByVector(activeVector, limit, activeFile.path, current);
	}

	async findSimilarByText(queryText: string, limit: number): Promise<VectorSearchResult[]> {
		const store = await this.loadStore();
		const key = this.getIndexKey();
		const current = store.indexes[key];
		if (!current) {
			return [];
		}

		const queryVector = await this.geminiService.embedText(queryText.trim(), this.embeddingModel);
		return this.searchByVector(queryVector, limit, undefined, current);
	}

	private searchByVector(
		queryVector: number[],
		limit: number,
		excludePath: string | undefined,
		current: VectorIndexData
	): VectorSearchResult[] {
		const filesByPath = new Map(this.app.vault.getMarkdownFiles().map((f) => [f.path, f]));

		const rows: VectorSearchResult[] = [];
		for (const entry of Object.values(current.entries)) {
			if (excludePath && entry.path === excludePath) {
				continue;
			}

			const file = filesByPath.get(entry.path);
			if (!file) {
				continue;
			}
			if (!this.accessControl.isFileAccessAllowed(file) || !this.isInTargetFolders(file.path)) {
				continue;
			}

			const score = this.cosineSimilarity(queryVector, entry.vector);
			if (score > 0) {
				rows.push({ file, score });
			}
		}

		return rows
			.sort((a, b) => b.score - a.score)
			.slice(0, Math.max(1, Math.min(200, Math.floor(limit))));
	}

	private getScopedFiles(): TFile[] {
		return this.accessControl
			.filterAllowedFiles(this.app.vault.getMarkdownFiles())
			.filter((f) => this.isInTargetFolders(f.path));
	}

	private isInTargetFolders(path: string): boolean {
		if (this.targetFolders.length === 0) {
			return true;
		}
		return this.targetFolders.some((folder) => path === folder || path.startsWith(`${folder}/`));
	}

	private buildFingerprint(file: TFile): string {
		const mtime = file.stat?.mtime ?? 0;
		const size = file.stat?.size ?? 0;
		return `${file.path}::${mtime}::${size}::${this.embeddingModel}`;
	}

	private async buildEmbeddingText(file: TFile): Promise<string> {
		const content = await this.app.vault.read(file);
		const cleaned = content
			.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, ' ')
			.replace(/```[\s\S]*?```/g, ' ')
			.replace(/\[\[([^\]]+)\]\]/g, ' $1 ')
			.replace(/https?:\/\/\S+/g, ' ')
			.replace(/[\r\n\t]+/g, ' ')
			.trim();

		const maxLength = 8000;
		const excerpt = cleaned.slice(0, maxLength);
		return `${file.basename}\n\n${excerpt}`;
	}

	private cosineSimilarity(a: number[], b: number[]): number {
		if (a.length === 0 || b.length === 0 || a.length !== b.length) {
			return 0;
		}

		let dot = 0;
		let normA = 0;
		let normB = 0;
		for (let i = 0; i < a.length; i++) {
			const av = a[i] ?? 0;
			const bv = b[i] ?? 0;
			dot += av * bv;
			normA += av * av;
			normB += bv * bv;
		}

		if (normA === 0 || normB === 0) {
			return 0;
		}

		return dot / (Math.sqrt(normA) * Math.sqrt(normB));
	}

	private getIndexKey(): string {
		const folderKey = this.targetFolders.length > 0 ? this.targetFolders.join('|') : '/';
		return `${this.embeddingModel}::${folderKey}`;
	}

	private normalizeFolders(folders: string[]): string[] {
		if (!Array.isArray(folders)) {
			return [];
		}

		const normalized = folders
			.map((folder) => folder.trim().replace(/^\/+/, '').replace(/\/+$/, ''))
			.filter((folder) => folder.length > 0);

		return Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b, 'ja'));
	}

	private getIndexFilePath(): string {
		const configDir = (this.app.vault as unknown as { configDir?: string }).configDir ?? '.obsidian';
		return `${configDir}/plugins/${this.pluginId}/related-notes-vector-index.json`;
	}

	private async loadStore(): Promise<VectorIndexStore> {
		const path = this.getIndexFilePath();
		const adapter = this.app.vault.adapter;

		if (!(await adapter.exists(path))) {
			return { version: 1, indexes: {} };
		}

		try {
			const raw = await adapter.read(path);
			const parsed = JSON.parse(raw) as Partial<VectorIndexStore>;
			if (parsed.version !== 1 || !parsed.indexes || typeof parsed.indexes !== 'object') {
				return { version: 1, indexes: {} };
			}

			for (const index of Object.values(parsed.indexes)) {
				const withLegacy = index as VectorIndexData & { folder?: string };
				if (!Array.isArray(withLegacy.folders)) {
					const legacyFolder = typeof withLegacy.folder === 'string' ? withLegacy.folder : '';
					withLegacy.folders = this.normalizeFolders(legacyFolder ? [legacyFolder] : []);
				}
			}

			return { version: 1, indexes: parsed.indexes };
		} catch {
			return { version: 1, indexes: {} };
		}
	}

	private async saveStore(store: VectorIndexStore): Promise<void> {
		const path = this.getIndexFilePath();
		const adapter = this.app.vault.adapter;
		const folder = path.split('/').slice(0, -1).join('/');

		if (!(await adapter.exists(folder))) {
			await adapter.mkdir(folder);
		}

		await adapter.write(path, JSON.stringify(store));
	}
}
