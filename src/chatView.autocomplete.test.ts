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
