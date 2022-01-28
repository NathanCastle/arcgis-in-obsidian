import MapView from '@arcgis/core/views/MapView';
import ArcGISMap from '@arcgis/core/Map'
import esriConfig from "@arcgis/core/config"
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import * as React from "react";
import * as ReactDOM from "react-dom";
import {MyMapView}  from "./MyMapView";
import { runInThisContext } from 'vm';
import { MarkdownEmbeddedMap } from 'MarkdownEmbeddedMap';
import {contextBridge} from 'electron'

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
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');
		
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
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}
					
					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});
		
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

class SampleModal extends Modal {
	
	constructor(app: App) {
		super(app);
	}
	appendedScript: HTMLScriptElement;
	
	onOpen() {
		const {contentEl} = this;
		var reference = this.contentEl.createEl("div", { cls: "viewDiv"});
		
		const map = new ArcGISMap({
			basemap: "arcgis-topographic" // Basemap layer
		});
		
		const view = new MapView({
			map: map,
			center: [-118.805, 34.027],
			zoom: 13, // scale: 72223.819286
			container: reference,
			constraints: {
				snapToZoom: false
			}
		});
	}
	
	onClose() {
		//ReactDOM.unmountComponentAtNode(this.contentEl.children[0]);
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
	