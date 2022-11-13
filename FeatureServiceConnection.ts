import esriConfig from "@arcgis/core/config";
import PortalItemResource from "@arcgis/core/portal/PortalItemResource";
import { ArcGISInObsidianSettings } from "./main";
import { readFile } from "fs";
import { MetadataCache, Vault, Workspace, App, TFile } from "obsidian";
import FeatureServiceSyncSetting from "FeatureServiceSyncSetting";
import {
	addressToLocations,
	locationToAddress,
} from "@arcgis/core/rest/locator";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import Graphic from "@arcgis/core/Graphic";
import { Point } from "@arcgis/core/geometry";

export class FeatureServiceConnection {
	settings: ArcGISInObsidianSettings;
	app: App;
	connections?: Map<string, FeatureLayer>;

	constructor(settings: ArcGISInObsidianSettings, app: App) {
		this.settings = settings;
		this.app = app;
		this.connections = new Map();
	}

	establishConnections() {
		for (var config of this.settings.featureServiceSync) {
			if (config.featureServiceUrl) {
				let featureLayer = new FeatureLayer({
					url: config.featureServiceUrl,
				});
				// TODO = warn if layer doesn't support editing
				this.connections.set(config.featureServiceUrl, featureLayer);
			}
		}
	}

	getFieldMapAsObj(
		config: FeatureServiceSyncSetting
	): { obsYaml: string; arcField: string }[] | undefined {
		if (!config.fieldMap || config.fieldMap === "") {
			return undefined;
		}

		let maps = config.fieldMap.split(",");

		return maps.map((val, idx, arr) => {
			let [obs, arcField] = val.split(":", 2);
			return { obsYaml: obs, arcField: arcField };
		});
	}

	async syncIndividualFile(
		config: FeatureServiceSyncSetting,
		file: TFile,
		location: Point
	) {
		// prep
		let featureLayer = this.connections.get(config.featureServiceUrl);
		let metadata = this.app.metadataCache.getFileCache(file);
		let obsidianUrl = `obsidian://open?vault=${file.vault.getName()}&file=${file.path.replace(
			/" "/g,
			"%20"
		)}`;
		let fieldstoSync = this.getFieldMapAsObj(config);

		var edits: __esri.FeatureLayerApplyEditsEdits = {
			addFeatures: [],
			updateFeatures: [],
		};
		// sync feature if indicated
		// TODO = refactor to share code between add and update
		if (metadata.frontmatter["OBJECTID"]) {
			let existingFeature = (
				await featureLayer.queryFeatures({
					outFields: ["*"],
					where: `OBJECTID = ${metadata.frontmatter["OBJECTID"]}`,
				})
			).features.first();
			if (existingFeature) {
				existingFeature.attributes[config.titleField ?? "TITLE"] =
					file.basename;
				existingFeature.attributes["OBSIDIAN_LINK"] = obsidianUrl;
				existingFeature.attributes["TEST_ATTRIBUE"] = "yolo";

				// apply field map values
				if (fieldstoSync) {
					fieldstoSync.map((fieldPair, idx) => {
						if (metadata.frontmatter[fieldPair.obsYaml]) {
							existingFeature.attributes[fieldPair.arcField] =
								metadata.frontmatter[fieldPair.obsYaml];
						}
					});
				}

				edits.updateFeatures.push(existingFeature);
				featureLayer.applyEdits(edits);
				return;
			}
		}
		let graphic = new Graphic();
		graphic.attributes = {
			TITLE: file.basename,
			OBSIDIAN_LINK: obsidianUrl,
			TEST_ATTRIBUTE: "yolo",
		};
		// apply field map values
		if (fieldstoSync) {
			fieldstoSync.map((fieldPair, idx) => {
				if (metadata.frontmatter[fieldPair.obsYaml]) {
					graphic.attributes[fieldPair.arcField] =
						metadata.frontmatter[fieldPair.obsYaml];
				}
			});
		}
		graphic.geometry = new Point({ x: location.x, y: location.y });
		console.log("Created local feature");
		console.dir(graphic);

		edits.addFeatures.push(graphic);
		console.log("Adding feature to edits list");
		console.dir(edits);
		let editsResults = await featureLayer.applyEdits(edits);
		console.log("Finished applying edits with following result");
		console.dir(editsResults);

		if (editsResults.addFeatureResults) {
			let addedFeature = editsResults.addFeatureResults.first();
			let objectId = addedFeature.objectId;
			let readedFile = await this.app.vault.read(file);
			let newFile = readedFile.replace(
				"---\ngeo:",
				`---\nOBJECTID: ${objectId}\ngeo:`
			);
			await this.app.vault.modify(file, newFile);
		}
	}

	async syncOne(config: FeatureServiceSyncSetting) {
		// scan vault for matching documents
		let allFiles = this.app.vault.getFiles();

		let regexTest = new RegExp(config.noteIncludePattern ?? "*");
		let matchingFiles = allFiles.filter((file, index) => {
			if (file.extension != "md") return false;

			return regexTest.test(file.basename);
		});

		// extract metadata from notes
		let geoFiles = (
			await Promise.all(
				matchingFiles.map(async (file, idx, arr) => {
					let metadata = this.app.metadataCache.getFileCache(file);
					if (!metadata.frontmatter) {
						return null;
					}
					let geotag = metadata.frontmatter["geo"];

					if (!geotag) {
						return null;
					}

					if (typeof geotag == "string") {
						// process single location
						let location = await addressToLocations(
							"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer",
							{
								address: { SingleLine: geotag },
							}
						);

						let point = location.first().location;

						return { file: file, location: point };
					}
					// Todo: support polypoints
				})
			)
		).filter((fileGeoPair, idx) => fileGeoPair != null);

		//console.dir(geoFiles);

		await Promise.all(
			geoFiles.map((fileGeoPair, idx, arr) => {
				this.syncIndividualFile(
					config,
					fileGeoPair.file,
					fileGeoPair.location
				);
			})
		);
	}

	syncAll() {
		// establish connection
		this.establishConnections();

		// read sync configurations
		for (var config of this.settings.featureServiceSync) {
			this.syncOne(config);
		}

		// sync each configuration
	}
}
