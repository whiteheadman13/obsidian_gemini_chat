import { describe, expect, it } from 'vitest';
import { FolderAccessControl } from './folderAccessControl';
import type { MyPluginSettings } from './settings';

function createSettings(overrides: Partial<MyPluginSettings> = {}): MyPluginSettings {
	return {
		geminiApiKey: '',
		chatHistoryFolder: 'Chat History',
		agentAllowedFolders: [],
		agentBlockedFolders: [],
		agentTemplateFolder: '',
		agentTemplateFile: '',
		...overrides,
	};
}

describe('FolderAccessControl', () => {
	it('許可・禁止リストが空なら全パス許可', () => {
		const access = new FolderAccessControl(createSettings());
		expect(access.isPathAccessAllowed('Projects/notes.md')).toBe(true);
		expect(access.isPathAccessAllowed('Daily/2026-03-04.md')).toBe(true);
	});

	it('禁止リストが最優先で拒否する', () => {
		const access = new FolderAccessControl(createSettings({
			agentAllowedFolders: ['Projects'],
			agentBlockedFolders: ['Projects/Private'],
		}));

		expect(access.isPathAccessAllowed('Projects/public.md')).toBe(true);
		expect(access.isPathAccessAllowed('Projects/Private/secret.md')).toBe(false);
	});

	it('許可リストがある場合は対象配下のみ許可', () => {
		const access = new FolderAccessControl(createSettings({
			agentAllowedFolders: ['Work', 'Notes/AI'],
		}));

		expect(access.isPathAccessAllowed('Work/task.md')).toBe(true);
		expect(access.isPathAccessAllowed('Notes/AI/prompts.md')).toBe(true);
		expect(access.isPathAccessAllowed('Personal/diary.md')).toBe(false);
	});

	it('先頭/末尾スラッシュの揺れを吸収する', () => {
		const access = new FolderAccessControl(createSettings({
			agentAllowedFolders: ['/Projects/'],
		}));

		expect(access.isPathAccessAllowed('/Projects/sub/file.md')).toBe(true);
		expect(access.isPathAccessAllowed('Projects/sub/file.md/')).toBe(true);
	});

	it('同名プレフィックス誤判定をしない (Work と Workspace)', () => {
		const access = new FolderAccessControl(createSettings({
			agentAllowedFolders: ['Work'],
		}));

		expect(access.isPathAccessAllowed('Work/todo.md')).toBe(true);
		expect(access.isPathAccessAllowed('Workspace/readme.md')).toBe(false);
	});

	it('isFileAccessAllowed は file.path で判定する', () => {
		const access = new FolderAccessControl(createSettings({
			agentAllowedFolders: ['Docs'],
			agentBlockedFolders: ['Docs/Secret'],
		}));

		const allowedFile = { path: 'Docs/guide.md' } as any;
		const blockedFile = { path: 'Docs/Secret/plan.md' } as any;

		expect(access.isFileAccessAllowed(allowedFile)).toBe(true);
		expect(access.isFileAccessAllowed(blockedFile)).toBe(false);
	});

	it('filterAllowedFiles は許可されたファイルだけを返す', () => {
		const access = new FolderAccessControl(createSettings({
			agentAllowedFolders: ['A', 'B'],
			agentBlockedFolders: ['B/Private'],
		}));

		const files = [
			{ path: 'A/one.md' },
			{ path: 'B/two.md' },
			{ path: 'B/Private/secret.md' },
			{ path: 'C/three.md' },
		] as any;

		const result = access.filterAllowedFiles(files);
		expect(result.map((f: { path: string }) => f.path)).toEqual([
			'A/one.md',
			'B/two.md',
		]);
	});
});
