import { describe, expect, it } from 'vitest';
import { ChatReferenceService } from './chatReferenceService';

function normalizeWhitespace(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

describe('ChatReferenceService.parseAtReferences', () => {
	it('@reference を参考資料1,2... に置換する', () => {
		const service = new ChatReferenceService({} as any);
		const input =
			'@reference:notes/permanent/a.md と @reference:notes/permanent/b.md\n上記のノートの関係性を検討してみて。';

		const { references, cleanedText } = service.parseAtReferences(input);

		expect(cleanedText).toBe('参考資料1 と 参考資料2\n上記のノートの関係性を検討してみて。');
		expect(references).toHaveLength(2);
		expect(references.map((ref) => ref.type)).toEqual(['reference', 'reference']);
		expect(references.map((ref) => ref.filePath)).toEqual([
			'notes/permanent/a.md',
			'notes/permanent/b.md',
		]);
	});

	it('@file は basename に置換し、@reference の番号付けは継続する', () => {
		const service = new ChatReferenceService({} as any);
		const input =
			'@reference:notes/ref-1.md と @file:assets/docs/report.pdf と @reference:notes/ref-2.md';

		const { references, cleanedText } = service.parseAtReferences(input);

		expect(cleanedText).toBe('参考資料1 と report.pdf と 参考資料2');
		expect(references.map((ref) => ref.type)).toEqual(['reference', 'file', 'reference']);
	});

	it('@outNoteFormat / @instruction / @outFolder は本文から除去する', () => {
		const service = new ChatReferenceService({} as any);
		const input =
			'お願い @outNoteFormat:template.md @instruction:rule.md @outFolder:notes/out @reference:notes/ref.md';

		const { references, cleanedText } = service.parseAtReferences(input);

		expect(normalizeWhitespace(cleanedText)).toBe('お願い 参考資料1');
		expect(references.map((ref) => ref.type)).toEqual([
			'outNoteFormat',
			'instruction',
			'outFolder',
			'reference',
		]);
	});
});
