import * as Diff from 'diff';

export interface DiffHunk {
	id: string;
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	lines: string[];
	header: string;
	sectionTitle?: string;
}

export interface ParsedDiff {
	hunks: DiffHunk[];
	oldText: string;
	newText: string;
}

export class DiffService {
	/**
	 * 2つのテキストの差分を計算し、Hunk（変更の塊）のリストを返す
	 */
	static computeDiff(oldText: string, newText: string): ParsedDiff {
		const patch = Diff.createPatch('file', oldText, newText, '', '');
		const parsedHunks = this.parsePatch(patch);
		const hunks = this.splitHunksByMarkdownHeadings(parsedHunks, oldText, newText);
		
		return {
			hunks,
			oldText,
			newText
		};
	}

	/**
	 * Unified Diff形式のパッチを解析し、Hunkのリストに変換
	 */
	private static parsePatch(patch: string): DiffHunk[] {
		const lines = patch.split('\n');
		const hunks: DiffHunk[] = [];
		let currentHunk: DiffHunk | null = null;
		let hunkIndex = 0;

		for (const line of lines) {
			// Hunkヘッダーの検出（例: @@ -1,3 +1,4 @@）
			const hunkHeaderMatch = line.match(/^@@\s+-(\d+),?(\d*)\s+\+(\d+),?(\d*)\s+@@/);
			if (hunkHeaderMatch) {
				if (currentHunk) {
					hunks.push(currentHunk);
				}

				const oldStart = parseInt(hunkHeaderMatch[1] || '1');
				const oldLines = hunkHeaderMatch[2] ? parseInt(hunkHeaderMatch[2]) : 1;
				const newStart = parseInt(hunkHeaderMatch[3] || '1');
				const newLines = hunkHeaderMatch[4] ? parseInt(hunkHeaderMatch[4]) : 1;

				currentHunk = {
					id: `hunk-${hunkIndex++}`,
					oldStart,
					oldLines,
					newStart,
					newLines,
					lines: [],
					header: line
				};
			} else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
				// 差分行を追加
				currentHunk.lines.push(line);
			}
		}

		if (currentHunk) {
			hunks.push(currentHunk);
		}

		return hunks;
	}

	private static splitHunksByMarkdownHeadings(
		hunks: DiffHunk[],
		oldText: string,
		newText: string
	): DiffHunk[] {
		const oldLines = oldText.split('\n');
		const newLines = newText.split('\n');
		const splitHunks: DiffHunk[] = [];
		let hunkIndex = 0;

		for (const hunk of hunks) {
			const parts = this.splitSingleHunkByMarkdownHeadings(hunk, oldLines, newLines);
			for (const part of parts) {
				splitHunks.push({
					...part,
					id: `hunk-${hunkIndex++}`,
				});
			}
		}

		return splitHunks;
	}

	private static splitSingleHunkByMarkdownHeadings(
		hunk: DiffHunk,
		oldLines: string[],
		newLines: string[]
	): DiffHunk[] {
		if (!hunk.lines.some((line) => this.isHeadingBoundaryLine(line))) {
			return [{
				...hunk,
				sectionTitle: this.findNearestSectionTitle(oldLines, hunk.oldStart)
					?? this.findNearestSectionTitle(newLines, hunk.newStart),
			}];
		}

		const parts: DiffHunk[] = [];
		let currentLines: string[] = [];
		let currentOldStart = hunk.oldStart;
		let currentNewStart = hunk.newStart;
		let oldCursor = hunk.oldStart;
		let newCursor = hunk.newStart;
		let currentSectionTitle = this.findNearestSectionTitle(oldLines, hunk.oldStart)
			?? this.findNearestSectionTitle(newLines, hunk.newStart);

		const finalizePart = () => {
			if (!currentLines.some((line) => this.isChangedLine(line))) {
				return;
			}

			parts.push({
				id: hunk.id,
				oldStart: currentOldStart,
				oldLines: currentLines.filter((line) => !line.startsWith('+')).length,
				newStart: currentNewStart,
				newLines: currentLines.filter((line) => !line.startsWith('-')).length,
				lines: [...currentLines],
				header: hunk.header,
				sectionTitle: currentSectionTitle,
			});
		};

		hunk.lines.forEach((line, index) => {
			if (
				currentLines.length > 0
				&& this.isHeadingBoundaryLine(line)
				&& currentLines.some((entry) => this.isChangedLine(entry))
				&& hunk.lines.slice(index).some((entry) => this.isChangedLine(entry))
			) {
				finalizePart();
				currentLines = [];
				currentOldStart = oldCursor;
				currentNewStart = newCursor;
				currentSectionTitle = this.extractSectionTitle(line) ?? currentSectionTitle;
			}

			if (currentLines.length === 0) {
				currentSectionTitle = this.extractSectionTitle(line) ?? currentSectionTitle;
			}

			currentLines.push(line);
			oldCursor += this.getOldLineDelta(line);
			newCursor += this.getNewLineDelta(line);
		});

		finalizePart();

		return parts.length > 0
			? parts
			: [{
				...hunk,
				sectionTitle: currentSectionTitle,
			}];
	}

	private static isChangedLine(line: string): boolean {
		return line.startsWith('+') || line.startsWith('-');
	}

	private static isHeadingBoundaryLine(line: string): boolean {
		return this.extractSectionTitle(line) !== undefined;
	}

	private static extractSectionTitle(line: string): string | undefined {
		const content = line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')
			? line.substring(1)
			: line;
		const match = content.match(/^(#{1,2})\s*(.+)$/);
		const title = match?.[2];
		return typeof title === 'string' ? title.trim() : undefined;
	}

	private static findNearestSectionTitle(lines: string[], lineNumber: number): string | undefined {
		for (let index = Math.min(lineNumber - 1, lines.length - 1); index >= 0; index--) {
			const title = this.extractSectionTitle(lines[index] ?? '');
			if (title) {
				return title;
			}
		}

		return undefined;
	}

	private static getOldLineDelta(line: string): number {
		return line.startsWith('+') ? 0 : 1;
	}

	private static getNewLineDelta(line: string): number {
		return line.startsWith('-') ? 0 : 1;
	}

	/**
	 * 選択されたHunkのみを元のテキストに適用する
	 */
	static applySelectedHunks(oldText: string, newText: string, selectedHunkIds: Set<string>): string {
		const diff = this.computeDiff(oldText, newText);
		
		// 全てのHunkが選択されている場合は、新しいテキストをそのまま返す
		if (selectedHunkIds.size === diff.hunks.length && 
			diff.hunks.every(h => selectedHunkIds.has(h.id))) {
			return newText;
		}

		// 行単位で処理
		const oldLines = oldText.split('\n');
		const resultLines: string[] = [];
		
		let oldLineIndex = 0;

		for (const hunk of diff.hunks) {
			// Hunkの前の未変更部分をコピー
			while (oldLineIndex < hunk.oldStart - 1) {
				const line = oldLines[oldLineIndex];
				if (line !== undefined) {
					resultLines.push(line);
				}
				oldLineIndex++;
			}

			if (selectedHunkIds.has(hunk.id)) {
				// 選択されたHunk: 新しいバージョンを適用
				const hunkNewLines = this.extractNewLinesFromHunk(hunk);
				resultLines.push(...hunkNewLines);
				oldLineIndex += hunk.oldLines;
			} else {
				// 選択されていないHunk: 元のバージョンを保持
				for (let i = 0; i < hunk.oldLines; i++) {
					if (oldLineIndex < oldLines.length) {
						const line = oldLines[oldLineIndex];
						if (line !== undefined) {
							resultLines.push(line);
						}
						oldLineIndex++;
					}
				}
			}
		}

		// 残りの行をコピー
		while (oldLineIndex < oldLines.length) {
			const line = oldLines[oldLineIndex];
			if (line !== undefined) {
				resultLines.push(line);
			}
			oldLineIndex++;
		}

		return resultLines.join('\n');
	}

	/**
	 * Hunkから新しい行のみを抽出
	 */
	private static extractNewLinesFromHunk(hunk: DiffHunk): string[] {
		const lines: string[] = [];
		for (const line of hunk.lines) {
			if (line.startsWith('+')) {
				// '+' を除去して追加
				lines.push(line.substring(1));
			} else if (line.startsWith(' ')) {
				// 変更されていない行
				lines.push(line.substring(1));
			}
			// '-' で始まる行（削除行）は無視
		}
		return lines;
	}

	/**
	 * 差分を視覚的に表現するための構造化データを生成
	 */
	static generateDiffLines(oldText: string, newText: string): Array<{
		type: 'add' | 'remove' | 'context';
		content: string;
		lineNumber?: number;
	}> {
		const changes = Diff.diffLines(oldText, newText);
		const result: Array<{type: 'add' | 'remove' | 'context'; content: string; lineNumber?: number}> = [];
		
		let lineNumber = 1;
		for (const change of changes) {
			const lines = change.value.split('\n').filter(l => l !== '' || change.value.endsWith('\n'));
			
			if (change.added) {
				for (const line of lines) {
					result.push({type: 'add', content: line});
				}
			} else if (change.removed) {
				for (const line of lines) {
					result.push({type: 'remove', content: line, lineNumber: lineNumber++});
				}
			} else {
				for (const line of lines) {
					result.push({type: 'context', content: line, lineNumber: lineNumber++});
				}
			}
		}

		return result;
	}
}
