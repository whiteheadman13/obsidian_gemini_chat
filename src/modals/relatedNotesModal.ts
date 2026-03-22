import { App, SuggestModal } from 'obsidian';
import type { RelatedNoteCandidate } from '../relatedNotesService';

export class RelatedNotesModal extends SuggestModal<RelatedNoteCandidate> {
	private items: RelatedNoteCandidate[];

	constructor(app: App, items: RelatedNoteCandidate[]) {
		super(app);
		this.items = items;
		this.setPlaceholder('関連ノートを選択してください');
	}

	getSuggestions(query: string): RelatedNoteCandidate[] {
		if (!query.trim()) {
			return this.items;
		}

		const q = query.toLowerCase();
		return this.items.filter((item) => item.file.path.toLowerCase().includes(q));
	}

	renderSuggestion(item: RelatedNoteCandidate, el: HTMLElement): void {
		el.createDiv({ text: `${item.file.basename} (${item.score.toFixed(3)})` });
		if (item.reasons.length > 0) {
			el.createEl('small', { text: item.reasons.join(' / ') });
		}
	}

	onChooseSuggestion(item: RelatedNoteCandidate, _evt: MouseEvent | KeyboardEvent): void {
		void this.app.workspace.getLeaf('split').openFile(item.file);
	}
}
