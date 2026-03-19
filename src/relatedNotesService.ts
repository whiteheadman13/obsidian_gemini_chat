import { App, CachedMetadata, TFile } from 'obsidian';
import { FolderAccessControl } from './folderAccessControl';

export interface RelatedNoteCandidate {
	file: TFile;
	score: number;
	reasons: string[];
}

export interface RelatedNotesScoringConfig {
	limit: number;
	titleWeight: number;
	textWeight: number;
	tagWeight: number;
	linkWeight: number;
	excludeFormatterSection: boolean;
	excludeFrontmatter: boolean;
	excludeLinked: boolean;
}

interface FileFeatures {
	file: TFile;
	titleTerms: Map<string, number>;
	bodyTerms: Map<string, number>;
	tags: Set<string>;
	outgoingLinks: Set<string>;
}

export class RelatedNotesService {
	private app: App;
	private accessControl: FolderAccessControl;
	private config: RelatedNotesScoringConfig;

	constructor(app: App, accessControl: FolderAccessControl, config?: Partial<RelatedNotesScoringConfig>) {
		this.app = app;
		this.accessControl = accessControl;
		this.config = this.normalizeConfig(config);
	}

	async findRelatedNotes(activeFile: TFile, limit = this.config.limit): Promise<RelatedNoteCandidate[]> {
		const files = this.accessControl
			.filterAllowedFiles(this.app.vault.getMarkdownFiles())
			.filter((f) => f.path !== activeFile.path);

		if (files.length === 0) return [];

		const base = await this.extractFeatures(activeFile);

		const docFeatures: FileFeatures[] = [];
		for (const file of files) {
			docFeatures.push(await this.extractFeatures(file));
		}

		const idf = this.computeIdf(docFeatures, base.bodyTerms);

		// Filter out already linked notes if configured
		const candidateFeatures = this.config.excludeLinked
			? docFeatures.filter((doc) => !this.hasLinkRelation(base, doc))
			: docFeatures;

		const scored = candidateFeatures.map((doc) => {
			const titleScore = this.overlapScore(base.titleTerms, doc.titleTerms);
			const textScore = this.tfidfCosine(base.bodyTerms, doc.bodyTerms, idf);
			const tagScore = this.setOverlapScore(base.tags, doc.tags);
			const linkScore = this.linkScore(base, doc);

			const score =
				(this.config.titleWeight * titleScore) +
				(this.config.textWeight * textScore) +
				(this.config.tagWeight * tagScore) +
				(this.config.linkWeight * linkScore);
			const reasons: string[] = [];

			const commonTags = this.commonItems(base.tags, doc.tags);
			if (commonTags.length > 0) reasons.push(`共通タグ: ${commonTags.slice(0, 3).join(', ')}`);

			const titleCommon = this.commonTerms(base.titleTerms, doc.titleTerms);
			if (titleCommon.length > 0) reasons.push(`タイトル近似: ${titleCommon.slice(0, 3).join(', ')}`);

			const keywordCommon = this.commonTerms(base.bodyTerms, doc.bodyTerms);
			if (keywordCommon.length > 0) reasons.push(`本文キーワード一致: ${keywordCommon.slice(0, 3).join(', ')}`);

			const linked = this.hasLinkRelation(base, doc);
			if (linked) reasons.push('内部リンク関係あり');

			return {
				file: doc.file,
				score,
				reasons,
			};
		});

		return scored
			.filter((x) => x.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, Math.max(1, Math.min(50, Math.floor(limit))));
	}

	private normalizeConfig(config?: Partial<RelatedNotesScoringConfig>): RelatedNotesScoringConfig {
		const rawLimit = config?.limit ?? 10;
		const limit = Math.max(1, Math.min(50, Math.floor(rawLimit)));

		const tTitle = Math.max(0, config?.titleWeight ?? 0.25);
		const tText = Math.max(0, config?.textWeight ?? 0.4);
		const tTag = Math.max(0, config?.tagWeight ?? 0.2);
		const tLink = Math.max(0, config?.linkWeight ?? 0.15);
		const sum = tTitle + tText + tTag + tLink;

		if (sum <= 0) {
			return {
				limit,
				titleWeight: 0.25,
				textWeight: 0.4,
				tagWeight: 0.2,
				linkWeight: 0.15,
				excludeFormatterSection: config?.excludeFormatterSection ?? true,
				excludeFrontmatter: config?.excludeFrontmatter ?? true,
				excludeLinked: config?.excludeLinked ?? true,
			};
		}

		return {
			limit,
			titleWeight: tTitle / sum,
			textWeight: tText / sum,
			tagWeight: tTag / sum,
			linkWeight: tLink / sum,
			excludeFormatterSection: config?.excludeFormatterSection ?? true,
			excludeFrontmatter: config?.excludeFrontmatter ?? true,
			excludeLinked: config?.excludeLinked ?? true,
		};
	}

	private async extractFeatures(file: TFile): Promise<FileFeatures> {
		const content = await this.app.vault.read(file);
		const cache = this.app.metadataCache.getFileCache(file);

		const title = file.basename;
		const titleTerms = this.countTerms(title);
		const bodyTerms = this.countTerms(content);
		const tags = this.extractTags(cache);
		const outgoingLinks = this.extractOutgoingLinks(file, cache);

		return {
			file,
			titleTerms,
			bodyTerms,
			tags,
			outgoingLinks,
		};
	}

	private extractTags(cache: CachedMetadata | null): Set<string> {
		const set = new Set<string>();
		if (!cache) return set;

		if (cache.tags) {
			for (const tag of cache.tags) {
				const normalized = tag.tag.toLowerCase();
				set.add(normalized);
			}
		}

		if (cache.frontmatter && typeof cache.frontmatter.tags !== 'undefined') {
			const fmTags = cache.frontmatter.tags;
			if (Array.isArray(fmTags)) {
				for (const t of fmTags) {
					if (typeof t === 'string') set.add(this.normalizeTag(t));
				}
			} else if (typeof fmTags === 'string') {
				set.add(this.normalizeTag(fmTags));
			}
		}

		return set;
	}

	private normalizeTag(tag: string): string {
		return tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`;
	}

	private extractOutgoingLinks(file: TFile, cache: CachedMetadata | null): Set<string> {
		const set = new Set<string>();

		const resolved = (this.app.metadataCache as unknown as { resolvedLinks?: Record<string, Record<string, number>> }).resolvedLinks;
		const current = resolved?.[file.path];
		if (current) {
			for (const path of Object.keys(current)) {
				set.add(path);
			}
		}

		if (set.size === 0 && cache?.links) {
			for (const l of cache.links) {
				const dest = this.app.metadataCache.getFirstLinkpathDest(l.link, file.path);
				if (dest) set.add(dest.path);
			}
		}

		return set;
	}

	private countTerms(text: string): Map<string, number> {
		const cleaned = this.stripMarkdown(text).toLowerCase();
		const terms = this.tokenize(cleaned);
		const map = new Map<string, number>();

		for (const t of terms) {
			map.set(t, (map.get(t) || 0) + 1);
		}

		return map;
	}

	private stripMarkdown(text: string): string {
		let normalized = text;
		if (this.config.excludeFrontmatter) {
			normalized = this.removeFrontmatter(normalized);
		}
		if (this.config.excludeFormatterSection) {
			normalized = this.removeFormatterSections(normalized);
		}

		return normalized
			.replace(/`{1,3}[\s\S]*?`{1,3}/g, ' ')
			.replace(/\[\[([^\]]+)\]\]/g, ' $1 ')
			.replace(/https?:\/\/\S+/g, ' ')
			.replace(/[#>*_~\-|]/g, ' ');
	}

	private removeFrontmatter(text: string): string {
		// 先頭の YAML frontmatter のみを除外
		return text.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, ' ');
	}

	private removeFormatterSections(text: string): string {
		let out = text;

		// formatter 指定の fenced code block を除外
		out = out.replace(/```\s*(formatter|format|template)[^\n]*\n[\s\S]*?```/gi, ' ');

		// <formatter>...</formatter> 形式を除外
		out = out.replace(/<formatter>[\s\S]*?<\/formatter>/gi, ' ');

		// 見出し「formatter / フォーマッタ」配下を次の同レベル以上見出しまで除外
		out = out.replace(/(^#{1,6}\s*.*(?:formatter|フォーマッタ).*$)[\s\S]*?(?=^#{1,6}\s|$)/gim, ' ');

		return out;
	}

	private tokenize(text: string): string[] {
		const result: string[] = [];

		const latin = text.match(/[a-z0-9][a-z0-9_-]{3,}/g) || [];
		result.push(...latin);

		const jaChunks = text.match(/[ぁ-んァ-ヶ一-龠々ー]{4,}/g) || [];
		for (const chunk of jaChunks) {
			for (let i = 0; i <= chunk.length - 4; i++) {
				result.push(chunk.slice(i, i + 4));
			}
		}

		return result.filter((t) => t.length >= 4);
	}

	private computeIdf(docs: FileFeatures[], queryTerms: Map<string, number>): Map<string, number> {
		const idf = new Map<string, number>();
		const n = docs.length;

		for (const term of queryTerms.keys()) {
			let df = 0;
			for (const doc of docs) {
				if (doc.bodyTerms.has(term)) df++;
			}
			idf.set(term, Math.log((n + 1) / (df + 1)) + 1);
		}

		return idf;
	}

	private tfidfCosine(
		a: Map<string, number>,
		b: Map<string, number>,
		idf: Map<string, number>
	): number {
		let dot = 0;
		let normA = 0;
		let normB = 0;

		for (const [term, tfA] of a) {
			const w = idf.get(term) || 1;
			const wa = tfA * w;
			normA += wa * wa;

			const tfB = b.get(term) || 0;
			if (tfB > 0) {
				const wb = tfB * w;
				dot += wa * wb;
			}
		}

		for (const [term, tfB] of b) {
			const w = idf.get(term) || 1;
			const wb = tfB * w;
			normB += wb * wb;
		}

		if (normA === 0 || normB === 0) return 0;
		return dot / (Math.sqrt(normA) * Math.sqrt(normB));
	}

	private overlapScore(a: Map<string, number>, b: Map<string, number>): number {
		const aKeys = new Set(a.keys());
		const bKeys = new Set(b.keys());
		return this.setOverlapScore(aKeys, bKeys);
	}

	private setOverlapScore(a: Set<string>, b: Set<string>): number {
		if (a.size === 0 || b.size === 0) return 0;
		const inter = this.commonItems(a, b).length;
		const union = new Set([...a, ...b]).size;
		return union === 0 ? 0 : inter / union;
	}

	private commonItems(a: Set<string>, b: Set<string>): string[] {
		const out: string[] = [];
		for (const item of a) {
			if (b.has(item)) out.push(item);
		}
		return out;
	}

	private commonTerms(a: Map<string, number>, b: Map<string, number>): string[] {
		const out: string[] = [];
		for (const term of a.keys()) {
			if (b.has(term)) out.push(term);
		}
		return out;
	}

	private hasLinkRelation(a: FileFeatures, b: FileFeatures): boolean {
		return a.outgoingLinks.has(b.file.path) || b.outgoingLinks.has(a.file.path);
	}

	private linkScore(a: FileFeatures, b: FileFeatures): number {
		let score = 0;

		if (a.outgoingLinks.has(b.file.path)) score += 0.5;
		if (b.outgoingLinks.has(a.file.path)) score += 0.5;

		const shared = this.commonItems(a.outgoingLinks, b.outgoingLinks).length;
		const denom = Math.max(a.outgoingLinks.size, b.outgoingLinks.size, 1);
		score += 0.5 * (shared / denom);

		return Math.min(score, 1);
	}
}
