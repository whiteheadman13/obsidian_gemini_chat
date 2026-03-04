import type { TFile } from 'obsidian';
import type { MyPluginSettings } from './settings';

/**
 * エージェントのフォルダアクセス制御を管理するクラス
 */
export class FolderAccessControl {
	private allowedFolders: string[];
	private blockedFolders: string[];

	constructor(settings: MyPluginSettings) {
		this.allowedFolders = settings.agentAllowedFolders || [];
		this.blockedFolders = settings.agentBlockedFolders || [];
	}

	/**
	 * ファイルへのアクセスが許可されているかをチェック
	 * @param file チェック対象のファイル
	 * @returns アクセスが許可されている場合はtrue
	 */
	isFileAccessAllowed(file: TFile): boolean {
		return this.isPathAccessAllowed(file.path);
	}

	/**
	 * パスへのアクセスが許可されているかをチェック
	 * @param path チェック対象のパス
	 * @returns アクセスが許可されている場合はtrue
	 */
	isPathAccessAllowed(path: string): boolean {
		// 正規化: 先頭・末尾のスラッシュを削除
		const normalizedPath = this.normalizePath(path);

		// ブロックリストをチェック（優先度が高い）
		if (this.isPathInFolderList(normalizedPath, this.blockedFolders)) {
			return false;
		}

		// 許可リストが空の場合、すべて許可
		if (this.allowedFolders.length === 0) {
			return true;
		}

		// 許可リストをチェック
		return this.isPathInFolderList(normalizedPath, this.allowedFolders);
	}

	/**
	 * パスを正規化（先頭・末尾のスラッシュを削除）
	 */
	private normalizePath(path: string): string {
		return path.replace(/^\/+|\/+$/g, '');
	}

	/**
	 * パスが指定されたフォルダリストのいずれかに含まれるかをチェック
	 * @param path チェック対象のパス
	 * @param folderList フォルダリスト
	 * @returns リストに含まれる場合はtrue
	 */
	private isPathInFolderList(path: string, folderList: string[]): boolean {
		for (const folder of folderList) {
			const normalizedFolder = this.normalizePath(folder);
			
			// 完全一致
			if (path === normalizedFolder) {
				return true;
			}

			// サブフォルダのチェック（パスが "folder/" または "folder/..." で始まる）
			if (path.startsWith(normalizedFolder + '/')) {
				return true;
			}
		}

		return false;
	}

	/**
	 * ファイルリストから、アクセスが許可されているファイルのみをフィルタリング
	 * @param files ファイルリスト
	 * @returns アクセスが許可されているファイルのみのリスト
	 */
	filterAllowedFiles(files: TFile[]): TFile[] {
		return files.filter(file => this.isFileAccessAllowed(file));
	}

	/**
	 * アクセス制御の設定情報を取得
	 */
	getAccessControlInfo(): string {
		const lines: string[] = [];
		
		if (this.blockedFolders.length > 0) {
			lines.push('【アクセス禁止フォルダ】');
			this.blockedFolders.forEach(folder => {
				lines.push(`  - ${folder}`);
			});
		}

		if (this.allowedFolders.length > 0) {
			lines.push('【アクセス許可フォルダ】');
			this.allowedFolders.forEach(folder => {
				lines.push(`  - ${folder}`);
			});
		} else if (this.blockedFolders.length === 0) {
			lines.push('【アクセス制御】すべてのフォルダへのアクセスが許可されています');
		} else {
			lines.push('【アクセス制御】禁止フォルダ以外のすべてのフォルダへのアクセスが許可されています');
		}

		return lines.join('\n');
	}
}
