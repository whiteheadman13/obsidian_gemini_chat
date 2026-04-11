export class TFile {
	path = '';
	basename = '';
	extension = '';
	name = '';
}

export class TFolder {
	path = '';
}

export class Notice {
	constructor(_message: string, _timeout?: number) {}
}

export class Modal {
	app: any;
	contentEl = { empty() {} };
	titleEl = { setText(_text: string) {} };

	constructor(app: any) {
		this.app = app;
	}

	open() {}
	close() {}
}

export class ItemView {
	containerEl = { children: [null, { empty() {}, createEl() { return { createEl() { return {}; }, empty() {}, style: {}, children: [] }; } }] } as any;
	app: any;

	constructor(_leaf: any) {
		this.app = {
			vault: {
				getMarkdownFiles() { return []; },
				getAllLoadedFiles() { return []; },
			},
		};
	}
}

export class WorkspaceLeaf {}

export const MarkdownRenderer = {
	async render(_app: any, _content: string, _el: any, _path: string, _component: any) {
		return;
	},
};

export function setIcon(_el: HTMLElement, _icon: string) {}

export class SuggestModal<T> extends Modal {
	placeholder = '';

	setPlaceholder(placeholder: string) {
		this.placeholder = placeholder;
	}
}

export class App {}
