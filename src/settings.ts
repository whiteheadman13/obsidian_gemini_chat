import {App, PluginSettingTab, Setting} from "obsidian";
import MyPlugin from "./main";

export interface MyPluginSettings {
	geminiApiKey: string;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	geminiApiKey: ''
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
	}
}
