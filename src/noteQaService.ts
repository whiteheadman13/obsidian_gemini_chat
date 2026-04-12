import { App, TFile } from 'obsidian';
import { FolderAccessControl } from './folderAccessControl';
import { GeminiService } from './geminiService';
import type { MyPluginSettings } from './settings';
import { VectorIndexService, type VectorSearchResult } from './vectorIndexService';

export interface NoteQaSource {
	path: string;
	excerpt: string;
	score: number;
	reasons: string[];
}

export interface NoteQaResult {
	question: string;
	answer: string;
	sources: NoteQaSource[];
	usedGoogleSearch: boolean;
	diagnostics: NoteQaDiagnostics;
}

export interface NoteQaDiagnostics {
	totalNotes: number;
	inScopeNotes: number;
	outOfScopeNotes: number;
	outOfScopeFolders: string[];
	accessControlSummary: string;
	vectorRerankEnabled: boolean;
	vectorTargetFolders: string[];
}

interface QaCandidate {
	file: TFile;
	score: number;
	reasons: string[];
}

export class NoteQaService {
	constructor(
		private app: App,
		private settings: MyPluginSettings,
		private accessControl: FolderAccessControl,
		private gemini: GeminiService | null,
		private vectorService: VectorIndexService | null
	) {}

	async answerQuestion(question: string, useGoogleSearch: boolean): Promise<NoteQaResult> {
		const normalizedQuestion = question.trim();
		const diagnostics = this.collectScopeDiagnostics();
		if (!normalizedQuestion) {
			return {
				question: normalizedQuestion,
				answer: '質問が入力されていません。',
				sources: [],
				usedGoogleSearch: useGoogleSearch,
				diagnostics,
			};
		}

		const candidates = await this.findCandidates(normalizedQuestion);
		const sources = await this.buildSources(candidates, normalizedQuestion);

		if (sources.length === 0) {
			return {
				question: normalizedQuestion,
				answer: '関連するノートが見つかりませんでした。質問を具体化するか、対象フォルダやベクトルインデックス設定を見直してください。',
				sources: [],
				usedGoogleSearch: useGoogleSearch,
				diagnostics,
			};
		}

		if (!this.gemini) {
			throw new Error('ノートQ&AにはGemini APIキーが必要です');
		}

		const prompt = this.buildPrompt(normalizedQuestion, sources);
		const answer = await this.gemini.chat([{ role: 'user', content: prompt }], undefined, useGoogleSearch);

		return {
			question: normalizedQuestion,
			answer,
			sources,
			usedGoogleSearch: useGoogleSearch,
			diagnostics,
		};
	}

	private collectScopeDiagnostics(): NoteQaDiagnostics {
		const allFiles = this.app.vault.getMarkdownFiles();
		const inScopeFiles = this.accessControl.filterAllowedFiles(allFiles);
		const inScopePathSet = new Set(inScopeFiles.map((file) => file.path));
		const outOfScopeFiles = allFiles.filter((file) => !inScopePathSet.has(file.path));
		const outOfScopeFolders = Array.from(new Set(
			outOfScopeFiles.map((file) => this.getFolderPath(file.path))
		)).sort((a, b) => a.localeCompare(b, 'ja'));

		return {
			totalNotes: allFiles.length,
			inScopeNotes: inScopeFiles.length,
			outOfScopeNotes: outOfScopeFiles.length,
			outOfScopeFolders,
			accessControlSummary: this.accessControl.getAccessControlInfo(),
			vectorRerankEnabled: this.settings.qaEnableVectorRerank && !!this.vectorService,
			vectorTargetFolders: [...this.settings.relatedNotesVectorFolders],
		};
	}

	private async findCandidates(question: string): Promise<QaCandidate[]> {
		const lexical = await this.findLexicalCandidates(question, this.settings.qaInitialLexicalLimit);
		const canUseVector = this.settings.qaEnableVectorRerank && !!this.vectorService;
		if (!canUseVector) {
			return lexical.slice(0, this.settings.qaFinalSourceLimit);
		}

		const vectorRows = await this.vectorService!.findSimilarByText(question, this.settings.qaInitialLexicalLimit);
		return this.mergeCandidates(lexical, vectorRows).slice(0, this.settings.qaFinalSourceLimit);
	}

	private async findLexicalCandidates(question: string, limit: number): Promise<QaCandidate[]> {
		const files = this.accessControl.filterAllowedFiles(this.app.vault.getMarkdownFiles());
		const questionTerms = this.tokenize(question.toLowerCase());
		if (files.length === 0 || questionTerms.length === 0) {
			return [];
		}

		const candidates: QaCandidate[] = [];
		for (const file of files) {
			const content = await this.app.vault.read(file);
			const bodyTerms = new Set(this.tokenize(this.stripMarkdown(content).toLowerCase()));
			const titleTerms = new Set(this.tokenize(file.basename.toLowerCase()));
			const titleScore = this.overlapScore(questionTerms, titleTerms);
			const bodyScore = this.overlapScore(questionTerms, bodyTerms);
			const score = (0.35 * titleScore) + (0.65 * bodyScore);
			if (score <= 0) {
				continue;
			}

			const matchedTerms = questionTerms.filter((term) => titleTerms.has(term) || bodyTerms.has(term));
			candidates.push({
				file,
				score,
				reasons: matchedTerms.length > 0
					? [`一致語: ${Array.from(new Set(matchedTerms)).slice(0, 4).join(', ')}`]
					: ['本文一致'],
			});
		}

		return candidates
			.sort((a, b) => b.score - a.score)
			.slice(0, Math.max(1, Math.min(100, Math.floor(limit))));
	}

	private mergeCandidates(lexical: QaCandidate[], vectorRows: VectorSearchResult[]): QaCandidate[] {
		const weighted = new Map<string, QaCandidate>();
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

		for (const row of vectorRows) {
			const current = weighted.get(row.file.path);
			const vectorScore = row.score * normalizedVectorWeight;
			if (current) {
				current.score += vectorScore;
				current.reasons = [...current.reasons, `ベクトル類似度: ${row.score.toFixed(3)}`];
			} else {
				weighted.set(row.file.path, {
					file: row.file,
					score: vectorScore,
					reasons: [`ベクトル類似度: ${row.score.toFixed(3)}`],
				});
			}
		}

		return Array.from(weighted.values())
			.filter((candidate) => candidate.score > 0)
			.sort((a, b) => b.score - a.score);
	}

	private async buildSources(candidates: QaCandidate[], question: string): Promise<NoteQaSource[]> {
		const questionTerms = this.tokenize(question.toLowerCase());
		const sources: NoteQaSource[] = [];
		let totalChars = 0;

		for (const candidate of candidates) {
			if (sources.length >= this.settings.qaFinalSourceLimit || totalChars >= this.settings.qaMaxTotalChars) {
				break;
			}

			const content = await this.app.vault.read(candidate.file);
			const remaining = this.settings.qaMaxTotalChars - totalChars;
			const maxChars = Math.max(0, Math.min(this.settings.qaMaxCharsPerNote, remaining));
			if (maxChars <= 0) {
				break;
			}

			const excerpt = this.extractRelevantExcerpt(content, questionTerms, maxChars);
			if (!excerpt) {
				continue;
			}

			sources.push({
				path: candidate.file.path,
				excerpt,
				score: candidate.score,
				reasons: candidate.reasons,
			});
			totalChars += excerpt.length;
		}

		return sources;
	}

	private extractRelevantExcerpt(content: string, questionTerms: string[], maxChars: number): string {
		const cleaned = this.stripMarkdown(content)
			.replace(/[\r\t]+/g, ' ')
			.replace(/\n{3,}/g, '\n\n')
			.trim();
		if (!cleaned) {
			return '';
		}

		const sections = cleaned
			.split(/\n\s*\n/)
			.map((section, index) => ({
				index,
				text: section.replace(/\s+/g, ' ').trim(),
			}))
			.filter((section) => section.text.length > 0)
			.map((section) => ({
				...section,
				score: this.scoreExcerpt(section.text.toLowerCase(), questionTerms),
			}));

		if (sections.length === 0) {
			return cleaned.slice(0, maxChars).trim();
		}

		const selected = sections
			.sort((a, b) => b.score - a.score || a.index - b.index)
			.slice(0, Math.min(3, sections.length))
			.sort((a, b) => a.index - b.index);

		const excerpt = selected
			.map((section) => section.text)
			.join('\n\n')
			.slice(0, maxChars)
			.trim();

		return excerpt || cleaned.slice(0, maxChars).trim();
	}

	private scoreExcerpt(text: string, questionTerms: string[]): number {
		let score = 0;
		for (const term of questionTerms) {
			if (text.includes(term)) {
				score += 1;
			}
		}
		return score;
	}

	private buildPrompt(question: string, sources: NoteQaSource[]): string {
		const sourceSections = sources
			.map((source, index) => [
				`[資料${index + 1}] ${source.path}`,
				`一致理由: ${source.reasons.join(' / ') || '関連度上位'}`,
				source.excerpt,
			].join('\n'))
			.join('\n\n');

		return `あなたはObsidianのノートを根拠に質問へ答えるアシスタントです。必ず与えられたノート抜粋を優先して回答してください。ノートに十分な根拠がない場合は、その旨を明示してください。\n\n出力形式:\n## 回答\n- 質問への結論を簡潔に述べる\n- 根拠がノート内で不足する場合は不足点を述べる\n\n## 根拠ノート\n- 使ったノートを箇条書きで列挙する\n\n## 不確実性\n- 解釈の幅や追加で確認すべき点を書く\n\n質問:\n${question}\n\nノート抜粋:\n${sourceSections}`;
	}

	private overlapScore(questionTerms: string[], candidateTerms: Set<string>): number {
		if (questionTerms.length === 0 || candidateTerms.size === 0) {
			return 0;
		}

		let matched = 0;
		for (const term of questionTerms) {
			if (candidateTerms.has(term)) {
				matched += 1;
			}
		}
		return matched / questionTerms.length;
	}

	private stripMarkdown(text: string): string {
		return text
			.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, ' ')
			.replace(/```[\s\S]*?```/g, ' ')
			.replace(/\[\[([^\]]+)\]\]/g, ' $1 ')
			.replace(/https?:\/\/\S+/g, ' ')
			.replace(/[>#*_~|`-]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	private tokenize(text: string): string[] {
		const normalized = text.toLowerCase();
		const result: string[] = [];
		const latin = normalized.match(/[a-z0-9][a-z0-9_-]{2,}/g) || [];
		result.push(...latin);
		const japanese = normalized.match(/[ぁ-んァ-ヶ一-龠々ー]{2,}/g) || [];
		for (const chunk of japanese) {
			if (chunk.length <= 4) {
				result.push(chunk);
				continue;
			}
			for (let index = 0; index <= chunk.length - 4; index += 1) {
				result.push(chunk.slice(index, index + 4));
			}
		}

		return Array.from(new Set(result.filter((term) => term.length >= 2)));
	}

	private getFolderPath(filePath: string): string {
		const idx = filePath.lastIndexOf('/');
		if (idx <= 0) {
			return '(root)';
		}
		return filePath.slice(0, idx);
	}
}