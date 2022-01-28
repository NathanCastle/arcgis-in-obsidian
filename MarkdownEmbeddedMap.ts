import { MarkdownRenderChild, parseFrontMatterStringArray } from "obsidian";
import esriConfig from '@arcgis/core/config';
import ArcGISMap from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import PortalItemResource from "@arcgis/core/portal/PortalItemResource";
import WebMap from "@arcgis/core/WebMap";
import PortalItem from "@arcgis/core/portal/PortalItem";
import { ArcGISInObsidianSettings } from './main';
import { readFile } from "fs";

export class MarkdownEmbeddedMap extends MarkdownRenderChild {
  minHeight: Number;
  is3D: boolean;
  basemapStyle?: string;
  settings: ArcGISInObsidianSettings;
  view?: MapView;
  mapId?: string;

  constructor(containerEl: HTMLElement, instructions: string[], settings: ArcGISInObsidianSettings) {
    super(containerEl);

    this.settings = settings;

    // set defaults
    this.minHeight = 300;

    for (let instr of instructions) {
      let [key, value] = instr.split(':', 2)
      switch (key) {
        case "basemap":
          this.basemapStyle = value.trim();
          break;
        case 'min-height':
          this.minHeight = Number.parseInt(value.trim());
          break;
        case 'id':
          this.mapId = value.trim();
      }
    }
  }

  onload() {
    let outer = this.containerEl.createEl("div", { cls: "outerMapContainer" });
    outer.setAttr("style", `height: ${this.minHeight}px;`);
    let reference = this.containerEl.createEl("div", { cls: "viewDiv" });
    outer.appendChild(reference);
    esriConfig.apiKey = this.settings.arcgisAPIKey;
    //esriConfig.assetsPath = "plugins/arcgis-in-obsidian/node_modules/@arcgis/core/assets";
/// This is all an attempt to fix the issue with app:// urls not working with fetch. That is caused by above line, which is supposedly necessary to get this working on node.

    // Work around request not wanting to do images by default
    esriConfig.request.interceptors.push({
  // set the `urls` property to the URL of the FeatureLayer so that this
  // interceptor only applies to requests made to the FeatureLayer URL
  urls: ["app://", "https://"],
  // use the BeforeInterceptorCallback to check if the query of the
  // FeatureLayer has a maxAllowableOffset property set.
  // if so, then set the maxAllowableOffset to 0
  before: function(params) {
    if (params.requestOptions.responseType === "image"){
      params.requestOptions["magictag"] = "image"
      params.requestOptions.responseType = "array-buffer"
    }
  },
  // use the AfterInterceptorCallback to check if `ssl` is set to 'true'
  // on the response to the request, if it's set to 'false', change
  // the value to 'true' before returning the response
  after: function(response) {
    if (response.requestOptions.responseType === "array-buffer" && "magictag" in response.requestOptions){
      response.requestOptions.responseType = "image"
      var img = new Image()
      img.setAttribute("src", response.url)
      img.setAttribute("crossorigin", "anonymous")
      //console.log(response)
      img.decode()
      response.data = img
    }
  }
});


    var map: ArcGISMap

    if (this.mapId) {
      let item = new PortalItem({
        id: this.mapId
      });
      map = new WebMap({portalItem: item})
    }
    else if (this.basemapStyle) {
      map = new ArcGISMap({basemap: this.basemapStyle})
    }
    else {
      map = new ArcGISMap({basemap: 'streets-navigation-vector'})
    }


    this.view = new MapView({
      map: map,
      center: [-118.805, 34.027],
      zoom: 13, // scale: 72223.819286
      container: reference,
      constraints: {
        snapToZoom: false
      }
    });
    this.containerEl.replaceWith(outer);
  }
}