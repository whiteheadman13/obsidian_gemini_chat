import {App, PluginSettingTab, Setting} from "obsidian";
import MyPlugin from "./main";

export interface MyPluginSettings {
	geminiApiKey: string;
	chatHistoryFolder: string;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	geminiApiKey: '',
	chatHistoryFolder: 'Chat History'
}

export class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Gemini API Key')
			.setDesc('Google Gemini APIのキーを入力してください')
			.addText(text => text
				.setPlaceholder('AIzaSy...')
				.setValue(this.plugin.settings.geminiApiKey)
				.onChange(async (value) => {
					this.plugin.settings.geminiApiKey = value;
					await this.plugin.saveSettings();
				})
				.inputEl.setAttribute('type', 'password'));

		new Setting(containerEl)
			.setName('チャット履歴保存先フォルダ')
			.setDesc('チャット履歴を保存するフォルダパスを指定してください')
			.addText(text => text
				.setPlaceholder('Chat History')
				.setValue(this.plugin.settings.chatHistoryFolder)
				.onChange(async (value) => {
					this.plugin.settings.chatHistoryFolder = value;
					await this.plugin.saveSettings();
				}));
	}
}
