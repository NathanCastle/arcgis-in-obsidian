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

export default class MyPlugin extends Plugin {
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
		this.addSettingTab(new SampleSettingTab(this.app, this));

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

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "ArcGIS Online settings" });

		// API key
		new Setting(containerEl)
			.setName("ArcGIS Developers API Key")
			.setDesc("You can get a developer key at developers.arcgis.com")
			.addText((text) =>
				text
					.setPlaceholder("API Key")
					.setValue(this.plugin.settings.arcgisAPIKey)
					.onChange(async (value) => {
						this.plugin.settings.arcgisAPIKey = value;
						await this.plugin.saveSettings();
					})
			);
		containerEl.createEl("h3", {text: "ArcGIS Account Log In"});
		containerEl.createEl("p", {text: "You must sign in to an account to use feature service syncing"});
		let AuthStatusDisplay = containerEl.createEl('p', {text: "not signed in"});
		const signInButton = containerEl.createEl("button", {text: "sign in"});

		async function renderAuthStatus(){
			if (this.plugin.settings.arcgisAuthToken === ""){
				AuthStatusDisplay.innerHTML = "not signed in";
				return;
			}

			// otherwise, reset auth and try again
			IdentityManager.registerToken(
				{
					server: "https://www.arcgis.com/sharing/rest",
					token: this.plugin.settings.arcgisAuthToken
				});
				try {
					let credential = await IdentityManager.checkSignInStatus("https://www.arcgis.com/sharing/rest")
					console.dir(credential);
					AuthStatusDisplay.innerHTML = `${credential.userId} signed in. Expires ${credential.expires}`
				}
				catch(_){
					this.plugin.settings.arcgisAuthToken = "";
					AuthStatusDisplay.innerHTML = "not signed in";
				}
		}
		renderAuthStatus.bind(this)();

		signInButton.addEventListener('click', async () => {
			console.log("setting token validity")
			IdentityManager.tokenValidity = 43200;
			try {
				console.log("cehcking sign in status")
				const newCredential = await IdentityManager.getCredential("https://www.arcgis.com/sharing/rest")
				//const newCredential = await IdentityManager.checkSignInStatus("https://www.arcgis.com/sharing/rest")
				/*
				const sInfo = new ServerInfo({
					tokenServiceUrl: "",
					server: ""
				});
				IdentityManager.generateToken(sInfo, {
					username:"",
					password: ""
				});
				*/
				this.plugin.settings.arcgisAuthToken = newCredential.token;
				await this.plugin.saveSettings();
				renderAuthStatus.bind(this)()
			}
			catch(ex){
				console.log('error signing in')
				console.dir(ex);

			}
		});

		// Feature service settings
		containerEl.createEl("h2", {text: "Feature Service Synchronization"});
		containerEl.createEl("p", {text: "Connect to feature services and automatically create features."})
		var addButton = containerEl.createEl("button", {text: "Add a feature service connection"});
		const featureServiceSettingArea = containerEl.createDiv();

		function renderFeatureServiceSettingArea(){
			// remove existing content
			featureServiceSettingArea.innerHTML = "";
			// render settings
			for(var existingFeatureServiceSetting of this.plugin.settings.featureServiceSync){
				const fsSettingParent = featureServiceSettingArea.createDiv();
				new Setting(fsSettingParent).setName("Feature Service URL").setDesc("URL to the feature service. Must be editable. Should end in a number")
				.addText((text) => 
				text.setPlaceholder("URL").setValue(existingFeatureServiceSetting.featureServiceUrl).onChange(async (value) => {
					existingFeatureServiceSetting.featureServiceUrl = value;
					await this.plugin.saveSettings();
				}));
				new Setting(fsSettingParent).setName("Note include pattern").setDesc("Pattern that defines which notes should be included. Default is all notes")
				.addText((text) => 
				text.setPlaceholder("/locations/*.md").setValue(existingFeatureServiceSetting.noteIncludePattern).onChange(async (value) => {
					existingFeatureServiceSetting.noteIncludePattern = value;
					await this.plugin.saveSettings();
				}));
				new Setting(fsSettingParent).setName("title field").setDesc("Field in the feature service used to store the title. Defaults to TITLE")
				.addText((text) => 
				text.setPlaceholder("note_title").setValue(existingFeatureServiceSetting.titleField).onChange(async (value) => {
					existingFeatureServiceSetting.titleField = value;
					await this.plugin.saveSettings();
				}));
				const deleteButton = fsSettingParent.createEl("button", {text:"remove"});
				deleteButton.addEventListener('click', async (delEvt) => {
					this.plugin.settings.featureServiceSync.remove(existingFeatureServiceSetting);
					await this.plugin.saveSettings();
					renderFeatureServiceSettingArea.bind(this)();
				});
			}
		}
		addButton.addEventListener('click', async (evt) => {
			this.plugin.settings.featureServiceSync.push(new FeatureServiceSyncSetting());
			await this.plugin.saveSettings();
			renderFeatureServiceSettingArea.bind(this)();
		});

		renderFeatureServiceSettingArea.bind(this)();
		
		new Setting(containerEl).setName("")
	}
}
