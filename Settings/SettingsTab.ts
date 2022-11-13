import {
	App,
	PluginSettingTab,
	Setting,
} from "obsidian";
import IdentityManager from "@arcgis/core/identity/IdentityManager"
import FeatureServiceSyncSetting from "FeatureServiceSyncSetting";
import ArcGISInObsidian from "main";

class SettingsTab extends PluginSettingTab {
	plugin: ArcGISInObsidian;

	constructor(app: App, plugin: ArcGISInObsidian) {
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

            let parsedCred = JSON.parse(this.plugin.settings.arcgisAuthToken) as __esri.Credential;

			// otherwise, reset auth and try again
			IdentityManager.registerToken(
				{
					server: "https://www.arcgis.com/sharing/rest",
					token: parsedCred.token
				});
				try {
                    //let credential = await IdentityManager.getCredential("https://www.arcgis.com/sharing/rest", {token: this.plugin.settings.arcgisAuthToken})
					let credential = await IdentityManager.checkSignInStatus("https://www.arcgis.com/sharing/rest")
					console.dir(credential);
					AuthStatusDisplay.innerHTML = `${parsedCred.userId} signed in. Expires ${new Date(parsedCred.expires).toLocaleString()}`
				}
				catch(_){
                    console.dir(_);
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
				const newCredential = await IdentityManager.getCredential("https://www.arcgis.com/sharing/rest", )
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
				this.plugin.settings.arcgisAuthToken = JSON.stringify(newCredential);
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
                // URL
				new Setting(fsSettingParent).setName("Feature Service URL").setDesc("URL to the feature service. Must be editable. Should end in a number")
				.addText((text) => 
				text.setPlaceholder("URL").setValue(existingFeatureServiceSetting.featureServiceUrl).onChange(async (value) => {
					existingFeatureServiceSetting.featureServiceUrl = value;
					await this.plugin.saveSettings();
				}));
                // Include pattern
				new Setting(fsSettingParent).setName("Note include pattern").setDesc("Pattern that defines which notes should be included. Default is all notes")
				.addText((text) => 
				text.setPlaceholder("/locations/*.md").setValue(existingFeatureServiceSetting.noteIncludePattern).onChange(async (value) => {
					existingFeatureServiceSetting.noteIncludePattern = value;
					await this.plugin.saveSettings();
				}));
                // Title field
				new Setting(fsSettingParent).setName("Title Field").setDesc("Field in the feature service used to store the title. Defaults to TITLE")
				.addText((text) => 
				text.setPlaceholder("note_title").setValue(existingFeatureServiceSetting.titleField).onChange(async (value) => {
					existingFeatureServiceSetting.titleField = value;
					await this.plugin.saveSettings();
				}));
                // additional field mappings
                new Setting(fsSettingParent).setName("Additional YAML-field mappings").setDesc("Maps properties in YAML frontmatter to fields in the feature service. Fields not already existing in feature service will be ignored. Use the format `yamlField1:arcField1,yamlField2:arcField2`")
				.addText((text) => 
				text.setPlaceholder("category:OBS_CAT").setValue(existingFeatureServiceSetting.fieldMap).onChange(async (value) => {
                    existingFeatureServiceSetting.fieldMap = value;
					await this.plugin.saveSettings();
				}));
                // Delete button
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

export default SettingsTab;