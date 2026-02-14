/*

> entry.js
This is the entry point of the application.
This module loads and manages all other modules of the app.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

// Polyfill Buffer for browser environment
import { Buffer } from 'buffer';
if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}

import "./style.css";
import Map from "./js/map.js";
import Menu from "./js/menu.js";
import Radar from "./js/radar.js";

// Components
import { createToolbar } from "./components/toolbar.js";
import { hideLoadingAnimation } from "./js/loader.js";

// Setup the map
const map = new Map({
    container: "map",
    style: 'https://api.maptiler.com/maps/01991750-e542-745a-bb74-f8f5646a978c/style.json?key=UMONrX6MjViuKZoR882u',
    center: [-74.5, 40],
    zoom: 9,
    minZoom: 4,
    maxZoom: 18,
    projection: 'mercator',
    attributionControl: false,
});

// Add the radar to the map
const radar = new Radar(map);
map.setRadar(radar); // Set radar instance on map for split view

map.map.on('load', async () => {
    const radarGeoJson = await radar.getRadarLayer('KGRK', 'REF');
    map.addWebGlRadarLayer(radarGeoJson);
    hideLoadingAnimation(); // Ensure loading animation is hidden after radar data is loaded
});

// Add the main toolbar
const toolbar = createToolbar(
  () => { map.splitMap('horizontal', { station: 'KGRK' }); },
  () => { menu.open(); }
);
document.body.appendChild(toolbar);

// Add the menu
const menu = new Menu();