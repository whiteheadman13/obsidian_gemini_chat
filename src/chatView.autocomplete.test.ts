import { describe, expect, it } from 'vitest';
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
