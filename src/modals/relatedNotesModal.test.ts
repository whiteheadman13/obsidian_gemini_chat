import { describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { RelatedNotesModal } from './relatedNotesModal';

describe('RelatedNotesModal.onChooseSuggestion', () => {
	it('選択したノートを別ペインで開く', () => {
		const openFile = vi.fn();
		const getLeaf = vi.fn(() => ({ openFile }));
		const app = {
			workspace: {
				getLeaf,
			},
		} as any;

		const modal = new RelatedNotesModal(app, []);
		const file = new TFile();
		file.path = 'notes/example.md';
		file.basename = 'example';
		file.name = 'example.md';

		modal.onChooseSuggestion(
			{
				file,
				score: 0.684,
				reasons: ['ベクトル類似度: 0.684'],
			},
			{} as MouseEvent
		);

		expect(getLeaf).toHaveBeenCalledWith('split');
		expect(openFile).toHaveBeenCalledWith(file);
	});
});