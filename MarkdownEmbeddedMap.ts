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
  center: [number, number] = [-118.805, 34.027];
  zoom: number = 13;
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
          break;
        case 'zoom':
          this.zoom = Number.parseInt(value.trim())
          break;
        case 'center':
          try {
            let stripped = value.trim().replace('[', '').replace(']', '').split(',');
            let x = Number.parseFloat(stripped[0])
            let y = Number.parseFloat(stripped[1])
            console.log(`x:${x}, y:${y}`)
            this.center = [Number.parseFloat(stripped[0]), Number.parseFloat(stripped[1])]
          }
          catch{
            console.log("ArcGIS - Error parsing center coordinates")
          }
          break;
      }
    }
  }

  onload() {
    console.log('loading mapview')
    let outerRoot = this.containerEl.createDiv();
    let shadowRoot = outerRoot.attachShadow({mode: 'open'});
    let outer = shadowRoot.createEl('div', {});
    shadowRoot.appendChild(outer)
    outer.setAttr("style", `height: ${this.minHeight}px;`);
    let reference = this.containerEl.createEl("div", { cls: "viewDiv" });
    outer.appendChild(reference);
    esriConfig.apiKey = this.settings.arcgisAPIKey;
    //esriConfig.assetsPath = "plugins/arcgis-in-obsidian/node_modules/@arcgis/core/assets";
/// This is all an attempt to fix the issue with app:// urls not working with fetch. That is caused by above line, which is supposedly necessary to get this working on node.



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
      center: this.center,
      zoom: this.zoom, // scale: 72223.819286
      container: reference,
      constraints: {
        snapToZoom: false
      }
    });
    this.containerEl.replaceWith(shadowRoot);
  }
}