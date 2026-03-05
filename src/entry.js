/*

> entry.js
This is the entry point of the application.
This module loads and manages all other modules of the app.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

// L3 Product code mapping cheat sheet:
// N0H, N1H, N2H... > Hydrometer Classification
// N0K, N1K, N2K... > Specific Differential Phase
// N0B, N1B, N2B... > Base Reflectivity (Same as L2 REF but much faster)
// N0G, N1G, N2G... > Base Velocity (Same as L2 VEL but much faster)
// N0C, N1C, N2C... > Correlation Coefficient (Same as L2 CC but lower resolution and much faster)
// DTA > Storm Total Accumulation

// Polyfill Buffer for browser environment
import { Buffer } from 'buffer';
if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}

// Import modules
import "./style.css";
import Map from "./js/ui/map.js";
import Menu from "./js/ui/menu.js";
import Radar from "./js/radar.js";
import RadarStatus from "./js/ui/radar_status.js";
import Dialog from './js/ui/dialog.js';
import AlertList from "./js/ui/alert_list.js";
import Draw from "./js/ui/draw.js";
import ArchiveBrowser from "./js/ui/archive_browser.js";
import Inspector from "./js/ui/inspector.js";
import Palettes from './js/palettes.js';
import Finder from './js/ui/finder.js';

// Import components
import { createToolbar } from "./components/toolbar.js";
import { hideLoadingAnimation, showLoadingAnimation } from "./js/ui/loader.js";
import { layerMenu } from "./components/layer_menu.js";

// Set custom colors

import Settings from './js/ui/settings.js';
window.settingsInstance = new Settings(); // Expose globally for color customization

// Create a global Palettes instance to preserve custom palettes across calls
const globalPalettes = new Palettes();
window.globalPalettes = globalPalettes;

// See if there are URL parameters for station
const urlParams = new URLSearchParams(window.location.search);
const initialStation = urlParams.get('station') ? urlParams.get('station').toUpperCase() : 'KTLX';

// Function to draw on the map
function startDraw() {
  new Draw();
}

// Function to store and set the current radars
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

// Function to infer radar level from product code, also sets the VCP
const inferLevelFromProduct = (product) => {
  if (!product) return 'L3';
  const upper = product.toUpperCase();
  if (upper === 'REF' || upper === 'VEL' || upper === 'CC' || upper === 'KDP' || upper === 'SW' || upper === 'ZDR') {
    return 'L2';
  }
  return 'L3';
};

// Function to map L3 product codes to palette keys
const productToPaletteKey = (product) => {
  if (!product) return 'REF';
  const upper = product.toUpperCase();
  
  // If it's already a palette key, return it
  if (upper === 'REF' || upper === 'VEL' || upper === 'CC' || upper === 'KDP' || upper === 'SW' || upper === 'ZDR' || upper === 'DHC') {
    return upper;
  }
  
  // Map L3 product codes to palette keys
  const productMap = {
    'N0B': 'REF', 'N1B': 'REF', 'N2B': 'REF', 'N3B': 'REF', // Base Reflectivity
    'N0G': 'VEL', 'N1G': 'VEL', 'N2G': 'VEL', 'N3G': 'VEL', // Base Velocity
    'N0C': 'CC', 'N1C': 'CC', 'N2C': 'CC', 'N3C': 'CC',     // Correlation Coefficient
    'N0K': 'KDP', 'N1K': 'KDP', 'N2K': 'KDP', 'N3K': 'KDP', // Specific Differential Phase
    'N0H': 'DHC', 'N1H': 'DHC', 'N2H': 'DHC', 'N3H': 'DHC', // Hydrometer Classification
    'N0W': 'SW', 'N1W': 'SW', 'N2W': 'SW', 'N3W': 'SW',     // Spectrum Width
    'N0Z': 'ZDR', 'N1Z': 'ZDR', 'N2Z': 'ZDR', 'N3Z': 'ZDR', // Differential Reflectivity
  };
  
  return productMap[upper] || 'REF'; // Default to REF if not found
};

// Expose to global scope for use in map.js
window.productToPaletteKey = productToPaletteKey;

const updateColorbarForMap = (mainOrSplit, product) => {
  const colorbarId = mainOrSplit === 'split' ? 'colorbar-split' : 'colorbar-main';
  const colorbar = document.getElementById(colorbarId);
  if (!colorbar || !window.globalPalettes) return;

  const paletteKey = productToPaletteKey(product);
  const gradientCSS = window.globalPalettes.generateGradientCSS(paletteKey) || window.globalPalettes.generateGradientCSS('REF');
  if (!gradientCSS) return;

  colorbar.classList.remove('hidden');
  colorbar.style.backgroundImage = 'none';
  colorbar.style.background = gradientCSS;
};

// Function to set the current radar on the map
async function setRadar(station=null, product=null, mainOrSplit, options = {}) {
    if (!map) return;

    if (mainOrSplit === 'main') {
        if (!station) station = mainRadar.station;
        if (!product) product = mainRadar.product;
        const level = inferLevelFromProduct(product);
        mainRadar = { station, product, level, options };
        // Track the current main station
        map.currentMainStation = station;
        // Dispatch event for station change
        document.dispatchEvent(new CustomEvent('stationChanged', {
            detail: { station, mainOrSplit: 'main' }
        }));
    } else if (mainOrSplit === 'split') {
        if (!station) station = splitRadar.station;
        if (!product) product = splitRadar.product;
        const level = inferLevelFromProduct(product);
        splitRadar = { station, product, level, options };
        // Track the current split station
        map.currentSplitStation = station;
        // Dispatch event for station change
        document.dispatchEvent(new CustomEvent('stationChanged', {
            detail: { station, mainOrSplit: 'split' }
        }));
    } else {
        console.error(`Invalid mainOrSplit value: ${mainOrSplit}`);
        return;
    }
    
    // If in archive mode and switching products, use the archive URL
    if (archiveMode[mainOrSplit] && !options.fromUrl) {
        options = { ...options, fromUrl: archiveMode[mainOrSplit] };
    }

    // Immediately sync colorbar for picker-driven product changes on the corresponding map.
    updateColorbarForMap(mainOrSplit, product);
    
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
        updateColorbarForMap(mainOrSplit, product);
        if (mainOrSplit === 'main') {
          map.inspectBounds = radarResult.bounds
            ? [[radarResult.bounds[0], radarResult.bounds[1]], [radarResult.bounds[2], radarResult.bounds[3]]]
            : null;
        }
      } else if (radarResult?.geojson) {
        map.addWebGlRadarLayer(radarResult.geojson, mainOrSplit, product);
        updateColorbarForMap(mainOrSplit, product);
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

// Construct the map
// Detect mobile for performance optimizations
const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(navigator.userAgent) || 
  (('ontouchstart' in window) && window.innerWidth <= 768);

if (isMobile) {
    console.log('[SparkRadar] Mobile device detected - enabling performance optimizations');
}

const map = new Map({
    container: "map",
    style: 'https://api.maptiler.com/maps/01991750-e542-745a-bb74-f8f5646a978c/style.json?key=UMONrX6MjViuKZoR882u',
    center: [-97.1, 35.4],
    zoom: 5,
    minZoom: 3,
    maxZoom: 17,
    projection: 'mercator',
    attributionControl: false,
    // Mobile performance optimizations
    fadeDuration: isMobile ? 0 : 300,
    refreshExpiredTiles: !isMobile,
    maxTileCacheSize: isMobile ? 50 : null,
    preserveDrawingBuffer: false,
    antialias: !isMobile,
}, {
  // Callbacks
  onChangeProduct: async (product) => setRadar(null, product, 'main'),
  onChangeProductSplit: async (product) => setRadar(null, product, 'split'),
  onSelectStation: async (station) => {
    await setRadar(station, null, 'main');
    if (map.hasSplitMap()) {
      await setRadar(station, null, 'split');
    }
  },
  onSelectStationSplit: async (station) => {
    await setRadar(station, null, 'split');
    if (map.hasSplitMap()) {
      await setRadar(station, null, 'main');
    }
  },
});

// Construct the alert list
const alertList = new AlertList(map.layers);

// Keybinds
// TODO: custom keybinds
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; // Ignore if typing in input or textarea

  if (e.key === 'm') {
    if (map.isSplit()) {
      map.stopSplit();
    } else {
      map.splitMap('horizontal', { station: mainRadar.station, product: mainRadar.product });
    }
  } else if (e.key === 's') {
    const statusDialog = new RadarStatus(mainRadar.station);
  } else if (e.key === 'h') {
    menu.open();
  } else if (e.key === 'l') {
    layerMenu.open();
  } else if (e.key === 'd') {
    startDraw();
  } else if (e.key === 'f') {
    new Finder().open();
  } else if (e.key === '1') {
    setRadar(null, 'N0B', 'main') // Reflectivity
  } else if (e.key === '2') {
    setRadar(null, 'N0G', 'main') // Velocity
  } else if (e.key === '3') {
    setRadar(null, 'N0C', 'main') // Correlation Coefficient
  } else if (e.key === '4') {
    setRadar(null, 'N0H', 'main') // Hydrometer Classification
  } else if (e.key === '5') {
    setRadar(null, 'N0K', 'main') // Specific Differential Phase
  }
});

// Add the radar to the map
const radar = new Radar();
map.setRadar(radar); // Set radar instance on map for split view

// Initialize the current station
map.currentMainStation = initialStation;

// Initialize layer menu toggles
layerMenu.init(map);

// Initialize inspector
const inspector = new Inspector(map);
var inspectorEnabled = false;

// Initial map render
map.map.on('load', async () => {
    // Add radar stations
    map.updateRadarStations();

    // Add radar
    await setRadar(null, null, 'main');

    // Subscribe to real-time alert updates via SSE
    map.subscribeToAlerts();
});

// Build the main toolbar
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
  () => { new RadarStatus(mainRadar.station); },
  () => { layerMenu.open(); },
  () => { startDraw(); },
  () => { 
    if (map.isSplit()) {
      map.stopSplit();
    } else {
      map.splitGl();
    }
  },
  () => {
    // Toggle inspector
    inspectorEnabled = !inspectorEnabled;
    if (inspectorEnabled) {
      inspector.enable();
    } else {
      inspector.disable();
    }
  },
  () => { new Finder().open(); }
);

// Add the toolbar to the page
document.body.appendChild(toolbar);

// Function to load radar from archive URL and disable auto-updates
window.loadRadarFromArchive = async function(url, station) {
  autoUpdateEnabled = false;
  archiveMode.main = url;
  console.log('Auto-updates disabled. Loading archive file...');
  await setRadar(station, 'REF', 'main', { fromUrl: url, gate_limit: -30 });
  // Rebuild product picker to show only Level 2 products
  map.rebuildRadarPicker('main', true);
};

// Function to re-enable auto-updates
window.enableAutoUpdates = function() {
  autoUpdateEnabled = true;
  archiveMode.main = null;
  archiveMode.split = null;
  console.log('Auto-updates re-enabled.');
  // Rebuild product picker to show all products
  map.rebuildRadarPicker('main', false);
  if (map.hasSplitMap()) {
    map.rebuildRadarPicker('split', false);
  }
};

// Add the menu to the page
const menu = new Menu({
    onArchiveBrowser: () => { new ArchiveBrowser({ onClose: () => menu.close() }); },
});

// Refresh handler to update radar data with debouncing and station change detection
let updateInProgress = false;
let lastStationChangeTime = { main: 0, split: 0 };
let lastCheckedRadar = { main: null, split: null }; // Track last checked radar state
let baselineCheckCount = { main: 0, split: 0 }; // Track how many checks we've seen stable
const STATION_CHANGE_DEBOUNCE = 5000; // 5 second debounce after station change
const BASELINE_CHECKS_REQUIRED = 2; // Require 2 stable checks before updating
var updateTimes = 12;
var updateIntervalId = null;
var autoUpdateEnabled = true;

// Track archive mode
var archiveMode = { main: null, split: null }; // Stores archive URL when in archive mode

// Track when stations or products change
// tbh i dont know why this is here
const originalSetRadar = setRadar;
setRadar = async function(station, product, mainOrSplit, options) {
  const stationChanged = station && (
    (mainOrSplit === 'main' && station !== mainRadar.station) ||
    (mainOrSplit === 'split' && station !== splitRadar.station)
  );
  
  const productChanged = product && (
    (mainOrSplit === 'main' && product !== mainRadar.product) ||
    (mainOrSplit === 'split' && product !== splitRadar.product)
  );
  
  if (stationChanged || productChanged) {
    lastStationChangeTime[mainOrSplit] = Date.now();
    lastCheckedRadar[mainOrSplit] = null; // Reset on station/product change
    baselineCheckCount[mainOrSplit] = 0; // Reset baseline count
  }
  return originalSetRadar(station, product, mainOrSplit, options);
};

updateIntervalId = setInterval(async () => {
  if (!autoUpdateEnabled || updateInProgress) return;
  updateInProgress = true;
  updateTimes ++;
  try {
    console.log("Running routine update.");

    // Only check main map if station hasn't changed recently
    if (Date.now() - lastStationChangeTime.main > STATION_CHANGE_DEBOUNCE) {
      const mainProduct = map.currentRadarProduct || mainRadar.product;
      const currentMainRadarKey = `${mainRadar.station}_${mainProduct}_${inferLevelFromProduct(mainProduct)}`;
      const lastMainRadarKey = lastCheckedRadar.main;
      
      if (lastMainRadarKey === currentMainRadarKey) {
        // Station is stable, increment baseline count
        baselineCheckCount.main++;
        
        // Only check for updates after we've baselined multiple times
        if (baselineCheckCount.main >= BASELINE_CHECKS_REQUIRED) {
          try {
            const updateAvailable = await radar.isUpdateAvailable(mainRadar.station, mainProduct);
            if (updateAvailable) {
              console.log(`[Main Map] Update available for ${currentMainRadarKey}`);
              await originalSetRadar(null, mainProduct, 'main', { gate_limit: -30 });
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
    if (map.hasSplitMap() && Date.now() - lastStationChangeTime.split > STATION_CHANGE_DEBOUNCE) {
      const splitProduct = map.currentRadarProductSplit || splitRadar.product;
      const currentSplitRadarKey = `${splitRadar.station}_${splitProduct}_${inferLevelFromProduct(splitProduct)}`;
      const lastSplitRadarKey = lastCheckedRadar.split;
      
      if (lastSplitRadarKey === currentSplitRadarKey) {
        // Station is stable, increment baseline count
        baselineCheckCount.split++;
        
        // Only check for updates after we've baselined multiple times
        if (baselineCheckCount.split >= BASELINE_CHECKS_REQUIRED) {
          try {
            const updateAvailable = await radar.isUpdateAvailable(splitRadar.station, splitProduct);
            if (updateAvailable) {
              console.log(`[Split Map] Update available for ${currentSplitRadarKey}`);
              await originalSetRadar(null, splitProduct, 'split', { gate_limit: -30 });
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

    // Update radar stations and outlooks every 12 cycles (2mins)
    if (updateTimes >= 12) {
      console.log("Running secondary updates...");
      map.updateRadarStations();
      map.fetchOutlooks();
      map.fetchDiscussions();
      updateTimes = 0;
    }

    // Update alerts and watches
    map.fetchAlerts();
    map.fetchWatches();
    map.fetchStormCenters();

    console.log("UPDATETIMES:", updateTimes);

  } finally {
    updateInProgress = false;
  }
}, 10 * 1000); // Run updates every 10 seconds

// Post a notice to users opening the console
setTimeout(() => {
  console.log("%cDO NOT PASTE ANYTHING HERE!", "font-size: 32px; font-weight: bold; color: red;");
  console.log("%cIf you don't know what you are doing you can easily wipe all of your settings or cause the page to fail to load.", "font-size: 16px;");

  setInterval(() => {
    console.log("%cDO NOT PASTE ANYTHING HERE!", "font-size: 32px; font-weight: bold; color: red;");
    console.log("%cIf you don't know what you are doing you can easily wipe all of your settings or cause the page to fail to load.", "font-size: 16px;");
  }, 15 * 1000);
}, 5000);

// Show welcome dialog if first time
if (localStorage.getItem('firstUse') !== 'true') {
  const welcomeDialog = new Dialog('Welcome to SparkRadar.app', 'bolt', 
  `<h2 style="margin-bottom: 10px; text-align: left;">Welcome to the new SparkRadar!</h2>
  <p style="margin-bottom: 10px;">Looking for the old version? It has become <a href="https://lite.sparkradar.app" target="_blank">SparkRadar Lite</a>.</p>
  <p style="margin-bottom: 10px; font-weight: bold;">Please note that the new SparkRadar is still in active development. THIS IS NOT THE FINAL PRODUCT!!! You may report any bugs or feature requests on the <a href="https://github.com/tgranz/sparkradar" target="_blank">GitHub</a>.</p>
  <p>The new SparkRadar brings more features than ever, including:</p>
  <ul class="welcomeul" style="text-align: left; margin-left: 20px;">
    <li>Split screen view</li>
    <li>Highest resolution Level-II and Level-III radar products.</li>
    <li>Instant weather alerts and weather watches.</li>
    <li>More radar products including Correlation Coefficient, Spectrum Width, and more.</li>
  </ul>
  <p style="margin-bottom: 10px;">As always, SparkRadar is completely free with no subscriptions, ads, or intrusive trackers.</p>
  <p>YOU make SparkRadar possible! If SparkRadar has helped you, consider covering domain costs by <a href="https://www.buymeacoffee.com/tgranz" target="_blank">supporting my work</a>. Thank you!</p>
  `);
  localStorage.setItem('firstUse', 'true');
}
