import * as Diff from 'diff';

export interface DiffHunk {
	id: string;
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	lines: string[];
	header: string;
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
		const hunks = this.parsePatch(patch, oldText, newText);
		
		return {
			hunks,
			oldText,
			newText
		};
	}

	/**
	 * Unified Diff形式のパッチを解析し、Hunkのリストに変換
	 */
	private static parsePatch(patch: string, oldText: string, newText: string): DiffHunk[] {
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
		const newLines = newText.split('\n');
		const resultLines: string[] = [];
		
		let oldLineIndex = 0;
		let newLineIndex = 0;

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
