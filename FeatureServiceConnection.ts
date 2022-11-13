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
import { parseYaml, stringifyYaml } from "obsidian";

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

	async syncIndividaulFileForConfig(
		config: FeatureServiceSyncSetting,
		file: TFile,
		location: Point
	) {
		// prep
		let featureLayer = this.connections.get(config.featureServiceUrl);
		let metadata = this.app.metadataCache.getFileCache(file);
		let obsidianUrl = `obsidian://open?vault=${file.vault.getName()}&file=${encodeURIComponent(file.path)}`;
		let fieldstoSync = this.getFieldMapAsObj(config);

		var edits: __esri.FeatureLayerApplyEditsEdits = {
			addFeatures: [],
			updateFeatures: [],
		};

        var featureGraphic: Graphic
		// sync feature if indicated
		// TODO = refactor to share code between add and update
		if (metadata.frontmatter["OBJECTID"]) {
			featureGraphic = (
				await featureLayer.queryFeatures({
					outFields: ["*"],
					where: `OBJECTID = ${metadata.frontmatter["OBJECTID"]}`,
				})
			).features.first();
		}

        if (featureGraphic){
            edits.updateFeatures.push(featureGraphic);
        }
        else {
            featureGraphic = new Graphic();
            featureGraphic.attributes = {}
            edits.addFeatures.push(featureGraphic);
        }


        featureGraphic.attributes[config.titleField ?? "TITLE"] = file.basename;
        featureGraphic.attributes["OBSIDIAN_LINK"] = obsidianUrl;

        // apply field map values
		if (fieldstoSync) {
			fieldstoSync.map((fieldPair, idx) => {
				if (metadata.frontmatter[fieldPair.obsYaml]) {
					featureGraphic.attributes[fieldPair.arcField] =
						metadata.frontmatter[fieldPair.obsYaml];
				}
			});
		}
		featureGraphic.geometry = new Point({ x: location.x, y: location.y });

        // Apply edits
		let editsResults = await featureLayer.applyEdits(edits);

		if (editsResults.addFeatureResults) {
			let addedFeature = editsResults.addFeatureResults.first();
		}
        let objectId = featureGraphic.getObjectId() ?? editsResults.addFeatureResults.first().objectId;
        await this.rewriteFileYAML(file, featureGraphic.geometry as Point,featureGraphic, objectId.toString());
	}

    async rewriteFileYAML(file:TFile, newLocation?:Point, feature?:Graphic, objectId?:string){
        // Read existing content
        let originalContents = await this.app.vault.read(file);

        // parse existing frontmatter
        if (!originalContents.startsWith("---")){
            return;
        }

        // splice out frontmatter
        let [_, yamlFrontmatter, restOfFile] = originalContents.split("---", 3)
        let frontMatter = parseYaml(yamlFrontmatter);

        // update frontmatter
        if (feature){
            frontMatter['OBJECTID'] = objectId;
        }
        if (newLocation){
            frontMatter['geoXYCached'] = `x:${newLocation.x},y:${newLocation.y}`
        }

        // rewrite file with new frontmatter
        let newFileContents = `---\n${stringifyYaml(frontMatter).trimEnd()}\n---\n${restOfFile.trimStart()}`
        await this.app.vault.modify(file, newFileContents)
    }

	async syncOneConfiguration(config: FeatureServiceSyncSetting) {
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

                    let cachedValue = metadata.frontmatter['geoXYCached'];
                    if (cachedValue){
                        let [xpart,ypart] = cachedValue.split(',', 2)
                        let newX = xpart.trim().split(':', 2)[1]
                        let newY = ypart.trim().split(':', 2)[1]
                        let cachedPoint = new Point();
                        cachedPoint.x = parseFloat(newX);
                        cachedPoint.y = parseFloat(newY);

                        return {file:file, location: cachedPoint}
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
				this.syncIndividaulFileForConfig(
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
			this.syncOneConfiguration(config);
		}

		// sync each configuration
	}
}
