import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { MarkdownEmbeddedMap } from 'MarkdownEmbeddedMap';

export interface ArcGISInObsidianSettings{
	arcgisAPIKey: string;
}

const DEFAULT_SETTINGS: ArcGISInObsidianSettings = {
	arcgisAPIKey: ""
}

export default class MyPlugin extends Plugin {
	settings: ArcGISInObsidianSettings;

	async onload() {
		await this.loadSettings();
		
		// This creates an icon in the left ribbon.
		this.registerMarkdownPostProcessor((element, context) => {
			const codeblocks = element.querySelectorAll("code");
			
			for (let index = 0; index < codeblocks.length; index++) {
				const codeblock = codeblocks.item(index);
				let language = codeblock.className;
				console.log(codeblock.className);
				if (!language.toLowerCase().contains("arcgis")){
					continue;
				}
				const instructions = codeblock.innerText.trim().split('\n');
				console.log(instructions);
				
				context.addChild(new MarkdownEmbeddedMap(codeblock, instructions, this.settings));
			}
		});
		
		// This adds a simple command that can be triggered anywhere

		// This adds an editor command that can perform some operation on the current editor instance

		// This adds a complex command that can check whether the current state of the app allows execution of the command

		
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
		
		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		//this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		//	console.log('click', evt);
		//});
		
		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		//this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}
	
	onunload() {
		
	}
	
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
	
	async saveSettings() {
		await this.saveData(this.settings);
	}
}



class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;
	
	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}
	
	display(): void {
		const {containerEl} = this;
		
		containerEl.empty();
		
		containerEl.createEl('h2', {text: 'ArcGIS Online settings'});
		
		new Setting(containerEl)
		.setName('ArcGIS Developers API Key')
		.setDesc('You can get a developer key at developers.arcgis.com')
		.addText(text => text
			.setPlaceholder('API Key')
			.setValue(this.plugin.settings.arcgisAPIKey)
			.onChange(async (value) => {
				this.plugin.settings.arcgisAPIKey = value;
				await this.plugin.saveSettings();
			}));
		}
	}
	