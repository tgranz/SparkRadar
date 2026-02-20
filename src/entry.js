/*

> entry.js
This is the entry point of the application.
This module loads and manages all other modules of the app.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

// N0H, N1H, N2H... > Hydrometer Classification
// N0K, N1K, N2K... > Specific Differential Phase
// N0B, N1B, N2B... > Base Reflectivity (Same as L2 REF but lower resolution therefore much faster)
// N0G, N1G, N2U... > Base Velocity (Same as L2 VEL but lower resolution therefore much faster, tilt 1 and 2 end in G, 3 and 4 end in U)
// N0C, N1C, N2C... > Correlation Coefficient (Same as L2 CC but lower resolution therefore much faster)
// DTA > Storm Total Accumulation

// Polyfill Buffer for browser environment
import { Buffer } from 'buffer';
if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}

import "./style.css";
import Map from "./js/map.js";
import Menu from "./js/menu.js";
import Radar from "./js/radar.js";
import RadarStatus from "./js/radar_status.js";

// Components
import { createToolbar } from "./components/toolbar.js";
import { hideLoadingAnimation, showLoadingAnimation } from "./js/loader.js";

// See if there are URL parameters for station
const urlParams = new URLSearchParams(window.location.search);
const initialStation = urlParams.get('station') ? urlParams.get('station').toUpperCase() : 'KTLX';

// Function to store the current radars
var mainRadar = {
    station: initialStation,
    product: 'N0B', // Reflectivity
    level: 'L3',
    options: { gate_limit: -30 }
}

var splitRadar = {
    station: initialStation,
    product: 'N0G', // Velocity
    level: 'L3',
    options: { gate_limit: -30 }
}

const inferLevelFromProduct = (product) => {
  if (!product) return 'L3';
  const upper = product.toUpperCase();
  if (upper === 'REF' || upper === 'VEL' || upper === 'CC' || upper === 'KDP' || upper === 'SW' || upper === 'ZDR') {
    return 'L2';
  }
  return 'L3';
};

async function setRadar(station=null, product=null, mainOrSplit, options = {}) {
    if (!map) return;

    if (mainOrSplit === 'main') {
        if (!station) station = mainRadar.station;
        if (!product) product = mainRadar.product;
        const level = inferLevelFromProduct(product);
        mainRadar = { station, product, level, options };
    } else if (mainOrSplit === 'split') {
        if (!station) station = splitRadar.station;
        if (!product) product = splitRadar.product;
        const level = inferLevelFromProduct(product);
        splitRadar = { station, product, level, options };
    } else {
        console.error(`Invalid mainOrSplit value: ${mainOrSplit}`);
        return;
    }
    try {
      showLoadingAnimation();
      const picker = mainOrSplit === 'split' ? map.splitRadarPicker : map.radarPicker;
      const radarResult = await radar.getRadarLayer(station, product, {
        ...options,
        includeGeojson: false,
        onMetadata: ({ timeString, timeIso, tilt, vcp }) => {
          if (picker && typeof picker.setTimeAndTilt === 'function') {
            picker.setTimeAndTilt(timeString, `${tilt.toFixed(1)}°`, timeIso);
          }
          if (mainOrSplit === 'main') {
            const vcpElement = document.getElementById('toolbar-vcp');
            if (vcpElement) {
              if (Number.isFinite(vcp)) {
                if (vcp == 31 || vcp == 34 || vcp == 35) {
                  vcpElement.textContent = `VCP ${vcp}: Clean air mode`;
                } else if (vcp == 215) {
                  vcpElement.textContent = `VCP ${vcp}: General precip mode`;
                } else {
                  vcpElement.textContent = `VCP ${vcp}: Convective precip mode`;
                }
              } else {
                vcpElement.textContent = '';
              }
            }

            const stationElement = document.getElementById('toolbar-station');
            if (stationElement) {
              stationElement.textContent = station || mainRadar.station || '';
            }
          }
        }
      });
      if (radarResult?.meshData instanceof Float32Array) {
        map.addWebGlRadarMesh(radarResult.meshData, radarResult.bounds, mainOrSplit, product);
        if (mainOrSplit === 'main') {
          map.inspectBounds = radarResult.bounds
            ? [[radarResult.bounds[0], radarResult.bounds[1]], [radarResult.bounds[2], radarResult.bounds[3]]]
            : null;
        }
      } else if (radarResult?.geojson) {
        map.addWebGlRadarLayer(radarResult.geojson, mainOrSplit, product);
        if (mainOrSplit === 'main' && map.currentGeojson) {
          map.inspectBounds = map._computeBounds(map.currentGeojson);
        }
      }
      hideLoadingAnimation();
    } catch (error) {
        console.error(`Error updating radar layer for product ${product}:`, error);
        hideLoadingAnimation();
    }
}

// Setup the map
const map = new Map({
    container: "map",
    style: 'https://api.maptiler.com/maps/01991750-e542-745a-bb74-f8f5646a978c/style.json?key=UMONrX6MjViuKZoR882u',
    center: [-97.1, 35.4],
    zoom: 5,
    minZoom: 3,
    maxZoom: 18,
    projection: 'mercator',
    attributionControl: false,
}, {
  onChangeProduct: async (product) => setRadar(null, product, 'main'),
  onChangeProductSplit: async (product) => setRadar(null, product, 'split'),
  onSelectStation: async (station) => setRadar(station, null, 'main'),
  onSelectStationSplit: async (station) => setRadar(station, null, 'split'),
});

// Add the radar to the map
const radar = new Radar();
map.setRadar(radar); // Set radar instance on map for split view

map.map.on('load', async () => {
    // Add radar stations
    map.updateRadarStations();
    // Fetch and display alerts
    setTimeout(() => {
      map.fetchAlerts();
      map.fetchWatches();
    }, 5000);
    // Add radar
    await setRadar(null, null, 'main', { gate_limit: -30 });

    /*let lastInspectValue = undefined;
    let lastInspectAt = 0;
    map.map.on('mousemove', (e) => {
      if (!map.currentGeojson) return;
      const point = [e.lngLat.lng, e.lngLat.lat];
      const value = map._findValueAtPoint(map.currentGeojson, point);
      const now = Date.now();
      if (value === lastInspectValue && now - lastInspectAt < 250) return;
      lastInspectValue = value;
      lastInspectAt = now;
      if (value === null) {
        const bounds = map.inspectBounds;
        if (bounds) {
          const lng = e.lngLat.lng;
          const lat = e.lngLat.lat;
          const outside = lng < bounds[0][0] || lng > bounds[1][0] || lat < bounds[0][1] || lat > bounds[1][1];
          if (outside) {
            console.log('[Inspector] val: no data (outside bounds)');
            return;
          }
        }
        const swappedValue = map._findValueAtPoint(map.currentGeojson, [point[1], point[0]]);
        if (swappedValue !== null) {
          console.log(`[Inspector] val: ${swappedValue} (swapped lat/lng)`);
          return;
        }
        console.log('[Inspector] val: no data');
        return;
      }
      console.log(`[Inspector] val: ${value}`);
    });*/
});

// Add the main toolbar
const toolbar = createToolbar(
  () => { 
    if (map.isSplit()) {
      map.stopSplit();
    } else {
      // Update splitRadar state to match what we're opening
      const newProduct = inferLevelFromProduct(mainRadar.product) === 'L3' ? 'N0G' : 'VEL';
      splitRadar = { 
        station: mainRadar.station, 
        product: newProduct, 
        level: inferLevelFromProduct(newProduct), 
        options: { gate_limit: -30 } 
      };
      // Set debounce before opening split map to prevent immediate update checks
      lastStationChangeTime.split = Date.now();
      lastCheckedRadar.split = null;
      map.splitMap('horizontal', { station: mainRadar.station, product: newProduct });
    } 
  },
  () => { menu.open(); },
  () => {
    const statusDialog = new RadarStatus(mainRadar.station);
  }
);
document.body.appendChild(toolbar);

// Add the menu
const menu = new Menu();

// Refresh handler to update radar data
let updateInProgress = false;
let lastStationChangeTime = { main: 0, split: 0 };
let lastCheckedRadar = { main: null, split: null }; // Track last checked radar state
let baselineCheckCount = { main: 0, split: 0 }; // Track how many checks we've seen stable
const STATION_CHANGE_DEBOUNCE = 5000; // 5 second debounce after station change
const BASELINE_CHECKS_REQUIRED = 2; // Require 2 stable checks before updating
var updateTimes = 0;

// Track when stations change
const originalSetRadar = setRadar;
setRadar = async function(station, product, mainOrSplit, options) {
  if (station && (
    (mainOrSplit === 'main' && station !== mainRadar.station) ||
    (mainOrSplit === 'split' && station !== splitRadar.station)
  )) {
    lastStationChangeTime[mainOrSplit] = Date.now();
    lastCheckedRadar[mainOrSplit] = null; // Reset on station change
    baselineCheckCount[mainOrSplit] = 0; // Reset baseline count
  }
  return originalSetRadar(station, product, mainOrSplit, options);
};

setInterval(async () => {
  if (updateInProgress) return;
  updateInProgress = true;
  updateTimes ++;
  try {
    console.log("Running routine update.");

    // Only check main map if station hasn't changed recently
    if (Date.now() - lastStationChangeTime.main > STATION_CHANGE_DEBOUNCE) {
      const currentMainRadarKey = `${mainRadar.station}_${mainRadar.product}_${mainRadar.level}`;
      const lastMainRadarKey = lastCheckedRadar.main;
      
      if (lastMainRadarKey === currentMainRadarKey) {
        // Station is stable, increment baseline count
        baselineCheckCount.main++;
        
        // Only check for updates after we've baselined multiple times
        if (baselineCheckCount.main >= BASELINE_CHECKS_REQUIRED) {
          try {
            const updateAvailable = await radar.isUpdateAvailable(mainRadar.station, mainRadar.product);
            if (updateAvailable) {
              console.log(`[Main Map] Update available for ${currentMainRadarKey}`);
              await originalSetRadar(null, null, 'main', { gate_limit: -30 });
              baselineCheckCount.main = 0; // Reset after update
            }
          } catch (error) {
            console.error('Error checking main map update:', error);
          }
        }
      } else {
        // First check or station changed, just record it
        lastCheckedRadar.main = currentMainRadarKey;
        baselineCheckCount.main = 1;
      }
    }

    // Only check split map if it exists and station hasn't changed recently
    if (map.isSplit() && Date.now() - lastStationChangeTime.split > STATION_CHANGE_DEBOUNCE) {
      const currentSplitRadarKey = `${splitRadar.station}_${splitRadar.product}_${splitRadar.level}`;
      const lastSplitRadarKey = lastCheckedRadar.split;
      
      if (lastSplitRadarKey === currentSplitRadarKey) {
        // Station is stable, increment baseline count
        baselineCheckCount.split++;
        
        // Only check for updates after we've baselined multiple times
        if (baselineCheckCount.split >= BASELINE_CHECKS_REQUIRED) {
          try {
            const updateAvailable = await radar.isUpdateAvailable(splitRadar.station, splitRadar.product);
            if (updateAvailable) {
              console.log(`[Split Map] Update available for ${currentSplitRadarKey}`);
              await originalSetRadar(null, null, 'split', { gate_limit: -30 });
              baselineCheckCount.split = 0; // Reset after update
            }
          } catch (error) {
            console.error('Error checking split map update:', error);
          }
        }
      } else {
        // First check or station changed, just record it
        lastCheckedRadar.split = currentSplitRadarKey;
        baselineCheckCount.split = 1;
      }
    }

    // Update radar stations
    if (updateTimes == 6) {
      map.updateRadarStations();
      updateTimes = 0;
    }

    // Update alerts
    map.fetchAlerts();
    map.fetchWatches();

  } finally {
    updateInProgress = false;
  }
}, 15 * 1000); // Check for updates every 10 seconds



/* Inspector: TODO

let lastInspectValue = undefined;
    let lastInspectAt = 0;
    map.map.on('mousemove', (e) => {
      if (!map.currentGeojson) return;
      const point = [e.lngLat.lng, e.lngLat.lat];
      const value = map._findValueAtPoint(map.currentGeojson, point);
      const now = Date.now();
      if (value === lastInspectValue && now - lastInspectAt < 250) return;
      lastInspectValue = value;
      lastInspectAt = now;
      if (value === null) {
        const bounds = map.inspectBounds;
        if (bounds) {
          const lng = e.lngLat.lng;
          const lat = e.lngLat.lat;
          const outside = lng < bounds[0][0] || lng > bounds[1][0] || lat < bounds[0][1] || lat > bounds[1][1];
          if (outside) {
            console.log('[Inspector] val: no data (outside bounds)');
            return;
          }
        }
        const swappedValue = map._findValueAtPoint(map.currentGeojson, [point[1], point[0]]);
        if (swappedValue !== null) {
          console.log(`[Inspector] val: ${swappedValue} (swapped lat/lng)`);
          return;
        }
        console.log('[Inspector] val: no data');
        return;
      }
      console.log(`[Inspector] val: ${value}`);
    });

*/