import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	Command,
	PluginSettingTab,
	Setting,
	Plugin_2,
} from "obsidian";
import { MarkdownEmbeddedMap } from "MarkdownEmbeddedMap";
import IdentityManager from "@arcgis/core/identity/IdentityManager"
import ServerInfo from "@arcgis/core/identity/ServerInfo"
import { FeatureServiceConnection } from "FeatureServiceConnection";
import FeatureServiceSyncSetting from "FeatureServiceSyncSetting";
import SettingsTab from "Settings/SettingsTab";

export interface ArcGISInObsidianSettings {
	arcgisAPIKey: string;
	arcgisAuthToken: string;
	featureServiceSync: Array<FeatureServiceSyncSetting>
}

const DEFAULT_SETTINGS: ArcGISInObsidianSettings = {
	arcgisAPIKey: "",
	arcgisAuthToken: "",
	featureServiceSync: []
};

export default class ArcGISInObsidian extends Plugin {
	settings: ArcGISInObsidianSettings;
	connectionManager?: FeatureServiceConnection;

	async onload() {
		
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		this.registerMarkdownPostProcessor((element, context) => {
			const codeblocks = element.querySelectorAll("code");

			for (let index = 0; index < codeblocks.length; index++) {
				const codeblock = codeblocks.item(index);
				let language = codeblock.className;
				console.log(codeblock.className);
				if (!language.toLowerCase().contains("arcgis")) {
					continue;
				}
				const instructions = codeblock.innerText.trim().split("\n");
				console.log(instructions);

				context.addChild(
					new MarkdownEmbeddedMap(
						codeblock,
						instructions,
						this.settings
					)
				);
			}
		});

		this.connectionManager = new FeatureServiceConnection(this.settings, this.app);

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'nxc-arcgis-sync-featureservices',
			name: 'Sync notes with ArcGIS',
			callback: () => {
				this.connectionManager.syncAll();
			}
		});

		// This adds an editor command that can perform some operation on the current editor instance

		// This adds a complex command that can check whether the current state of the app allows execution of the command

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingsTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		//this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		//	console.log('click', evt);
		//});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		//this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
		if (!this.settings.featureServiceSync){
			this.settings.featureServiceSync = new Array<FeatureServiceSyncSetting>();
		}
		if (!this.settings.arcgisAuthToken){
			this.settings.arcgisAuthToken = "";
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

