import { describe, expect, it } from 'vitest';
import { DiffService } from './diffService';

describe('DiffService', () => {
	it('# と ## の見出しで変更を分割する', () => {
		const oldText = [
			'# 概要',
			'旧い概要です。',
			'',
			'## 詳細',
			'旧い詳細です。',
		].join('\n');

		const newText = [
			'# 概要',
			'新しい概要です。',
			'',
			'## 詳細',
			'新しい詳細です。',
		].join('\n');

		const diff = DiffService.computeDiff(oldText, newText);

		expect(diff.hunks).toHaveLength(2);
		expect(diff.hunks.map((hunk) => hunk.sectionTitle)).toEqual(['概要', '詳細']);
	});

	it('選択した見出しの変更だけ適用できる', () => {
		const oldText = [
			'# 概要',
			'旧い概要です。',
			'',
			'## 詳細',
			'旧い詳細です。',
		].join('\n');

		const newText = [
			'# 概要',
			'新しい概要です。',
			'',
			'## 詳細',
			'新しい詳細です。',
		].join('\n');

		const diff = DiffService.computeDiff(oldText, newText);
		const selected = new Set([diff.hunks[1]?.id ?? '']);

		const result = DiffService.applySelectedHunks(oldText, newText, selected);

		expect(result).toBe([
			'# 概要',
			'旧い概要です。',
			'',
			'## 詳細',
			'新しい詳細です。',
		].join('\n'));
	});

	it('スペースなし見出しでも # と ## で分割する', () => {
		const oldText = [
			'#概要',
			'旧い概要です。',
			'',
			'##詳細',
			'旧い詳細です。',
		].join('\n');

		const newText = [
			'#概要',
			'新しい概要です。',
			'',
			'##詳細',
			'新しい詳細です。',
		].join('\n');

		const diff = DiffService.computeDiff(oldText, newText);

		expect(diff.hunks).toHaveLength(2);
		expect(diff.hunks.map((hunk) => hunk.sectionTitle)).toEqual(['概要', '詳細']);
	});
});