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

export class SuggestModal<T> extends Modal {
	placeholder = '';

	setPlaceholder(placeholder: string) {
		this.placeholder = placeholder;
	}
}

export class App {}
