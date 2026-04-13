import { describe, expect, it, vi } from 'vitest';
import { ChatView } from './chatView';

describe('ChatView.findAtTokenAtCursor', () => {
	it('@r のような type 部分入力をトークンとして認識する', () => {
		const text = '@r';
		const token = (ChatView.prototype as any).findAtTokenAtCursor(text, text.length);
		expect(token).toBe('@r');
	});

	it('@reference:foo のような完全トークンを認識する', () => {
		const text = '@reference:foo/bar';
		const token = (ChatView.prototype as any).findAtTokenAtCursor(text, text.length);
		expect(token).toBe('@reference:foo/bar');
	});

	it('メールアドレス文字列はトークンとして認識しない', () => {
		const text = 'test@example.com';
		const token = (ChatView.prototype as any).findAtTokenAtCursor(text, text.length);
		expect(token).toBeNull();
	});
});

describe('ChatView.findSlashTokenAtCursor', () => {
	const find = (text: string, cursorPos?: number) =>
		(ChatView.prototype as any).findSlashTokenAtCursor(text, cursorPos ?? text.length);

	it('先頭の / をトークンとして認識する', () => {
		expect(find('/')).toBe('/');
	});

	it('先頭の /te で部分入力を認識する', () => {
		expect(find('/te')).toBe('/te');
	});

	it('先頭空白後の /te を認識する', () => {
		expect(find('  /te')).toBe('/te');
	});

	it('先頭以外の / は認識しない', () => {
		expect(find('hello /te')).toBeNull();
	});

	it('空文字列は null を返す', () => {
		expect(find('')).toBeNull();
	});

	it('@参照の後の / は認識しない', () => {
		expect(find('@reference:foo /te')).toBeNull();
	});
});

describe('ChatView.filterTemplateFiles', () => {
	const filter = (pattern: string, files: Array<{ path: string; basename: string }>) =>
		(ChatView.prototype as any).filterTemplateFiles.call(
			{ plugin: { settings: { chatPromptTemplateFolder: '' } }, app: { vault: { getMarkdownFiles: () => files } } },
			pattern
		);

	it('パターンが空の場合はすべて返す（最大10件）', () => {
		const files = Array.from({ length: 15 }, (_, i) => ({
			path: `templates/t${i}.md`,
			basename: `t${i}`,
		}));
		expect(filter('', files)).toHaveLength(10);
	});

	it('パターンでファイル名を絞り込む', () => {
		const files = [
			{ path: 'templates/課題整理.md', basename: '課題整理' },
			{ path: 'templates/読書メモ.md', basename: '読書メモ' },
			{ path: 'templates/weekly.md', basename: 'weekly' },
		];
		const result = filter('課題', files);
		expect(result).toHaveLength(1);
		expect(result[0].basename).toBe('課題整理');
	});

	it('パスでも絞り込める', () => {
		const files = [
			{ path: 'project/abc.md', basename: 'abc' },
			{ path: 'templates/def.md', basename: 'def' },
		];
		const result = filter('project', files);
		expect(result).toHaveLength(1);
		expect(result[0].basename).toBe('abc');
	});
});

describe('ChatView.focusInputField', () => {
	it('入力欄が存在する場合はフォーカスしてキャレットを末尾へ移動する', () => {
		const focus = vi.fn();
		const setSelectionRange = vi.fn();
		const context = {
			inputField: {
				isConnected: true,
				value: 'abc',
				focus,
				setSelectionRange,
			},
		};

		(ChatView.prototype as any).focusInputField.call(context, 0);

		expect(focus).toHaveBeenCalledTimes(1);
		expect(setSelectionRange).toHaveBeenCalledWith(3, 3);
	});
});
