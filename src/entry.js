// Polyfill Buffer for browser environment
import { Buffer } from 'buffer';
if (!globalThis.Buffer) globalThis.Buffer = Buffer;


import Map from "./js/app/map.js";
import Menu from "./js/ui/menu.js";
import Radar from "./js/main/radar.js";
import RadarStatus from "./js/app/radar_status.js";
import Dialog from './js/ui/dialog.js';
import AlertList from "./js/app/alert_list.js";
import Draw from "./js/app/draw.js";
import ArchiveBrowser from "./js/app/archive_browser.js";
import Inspector from "./js/ui/inspector.js";
import Measure from "./js/app/measure.js";
import Palettes from './js/main/palettes.js';
import Finder from './js/app/finder.js';
import { checkVersion, buildLatestChangeElement } from './js/app/changelog.js';
import AnimationController from './js/app/radar_animation.js';
import { openRadarFileUploadDialog } from './js/app/radar_file_upload.js';
import SpotterNetwork from './js/main/spotter_network.js';
import LocationServices from "./js/main/location_services.js";
import { createToolbar } from "./js/app/toolbars/toolbar.js";
import { hideLoadingAnimation, showLoadingAnimation } from "./js/ui/loader.js";
import { layerMenu } from "./js/app/layer_menu.js";
import Settings from './js/app/settings/settings.js';
import setupKeybinds from './js/main/shortcuts.js';
import {
  formatVcpDisplay,
  inferLevelFromProduct,
  isCrossSectionProductSupported,
  productToPaletteKey,
  getDhcTypeLabel,
  interpolateStopColor,
  getContrastTextColor,
  getPaletteMetadata,
  ensureColorbarTooltip,
  hideColorbarTooltip,
  updateColorbarForMap,
  getNowEpochMs,
  logRadarTimingIfComplete,
} from './js/utils/entryutils.js';

// Start instances
window.settingsInstance = new Settings();
const locationServices = new LocationServices({
  enabled: window.settingsInstance.getSetting('enableLocation', true) !== false,
});
const globalPalettes = new Palettes();

// Expose instances to global scope
window.locationServices = locationServices;
window.globalPalettes = globalPalettes;
window.appmode = window.appmode === 'satellite' ? 'satellite' : 'radar';

// See if there are URL parameters for station
const urlParams = new URLSearchParams(window.location.search);

// Helper functions for drawing and measuring
function startDraw() {
  if (Measure.instance) {
    Measure.instance.close();
  }
  new Draw();
}

function startMeasure() {
  if (Draw.instance) {
    Draw.instance.close();
  }

  if (Measure.instance) {
    Measure.instance.close();
    return;
  }

  new Measure(map);
}


const initialStation = urlParams.get('station') ? urlParams.get('station').toUpperCase() : 'KTLX';

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

// Track current VCP for refresh when settings change
var currentVcp = null;

const updateCrossSectionButtonState = (product) => {
  const supported = isCrossSectionProductSupported(product);
  if (typeof window.setToolEnabled === 'function') {
    window.setToolEnabled('cross-section-button', supported);
  } else {
    const button = document.getElementById('cross-section-button');
    if (!button) return;
    button.disabled = !supported;
    button.setAttribute('aria-disabled', String(!supported));
  }

  const button = document.getElementById('cross-section-button');
  if (!button) return;
  button.title = supported
    ? 'Cross-section view'
    : 'Cross-section unavailable for this product';
};

const updateAnimationButtonState = (product = null) => {
  const activeProduct = product || mainRadar?.product;
  const isL2Product = inferLevelFromProduct(activeProduct) === 'L2';
  const isCrossSectionEnabled = Boolean(map?.crossSection?.enabled);
  const shouldDisable = isL2Product || isCrossSectionEnabled;

  if (typeof window.setToolEnabled === 'function') {
    window.setToolEnabled('animation-button', !shouldDisable);
  } else {
    const button = document.getElementById('animation-button');
    if (button) {
      button.disabled = shouldDisable;
      button.setAttribute('aria-disabled', String(shouldDisable));
      button.style.color = shouldDisable ? 'gray' : '';
      button.style.pointerEvents = shouldDisable ? 'none' : '';
    }
  }

  const button = document.getElementById('animation-button');
  if (!button) return;
  if (isCrossSectionEnabled) {
    button.title = 'Animation unavailable in cross-section mode';
  } else if (isL2Product) {
    button.title = 'Animation unavailable for Level II products';
  } else {
    button.title = 'Animate past scans';
  }
};

const setToolbarButtonState = (buttonId, disabled, title) => {
  if (typeof window.setToolEnabled === 'function') {
    window.setToolEnabled(buttonId, !disabled);
  } else {
    const button = document.getElementById(buttonId);
    if (!button) return;
    button.disabled = disabled;
    button.setAttribute('aria-disabled', String(disabled));
    button.style.color = disabled ? 'gray' : '';
    button.style.pointerEvents = disabled ? 'none' : '';
  }

  const button = document.getElementById(buttonId);
  if (!button) return;
  button.title = title;
};

const resolveToolButton = (button) => {
  if (typeof button === 'string') {
    return document.getElementById(button);
  }

  if (button instanceof HTMLElement) {
    return button;
  }

  return null;
};

window.setToolEnabled = function(button, enabled) {
  const target = resolveToolButton(button);
  if (!target) return false;

  const disabled = !enabled;
  target.disabled = disabled;
  target.setAttribute('aria-disabled', String(disabled));
  target.style.color = disabled ? 'gray' : '';
  target.style.pointerEvents = disabled ? 'none' : '';
  return true;
};

window.enableTool = function(button) {
  return window.setToolEnabled(button, true);
};

window.disableTool = function(button) {
  return window.setToolEnabled(button, false);
};

// Local Level III files only expose one product and one tilt, so split and
// cross-section controls should stay disabled until live updates are restored.
const setLocalFileToolbarState = (lockSingleProductView) => {
  setToolbarButtonState(
    'dual-map-button',
    lockSingleProductView,
    lockSingleProductView ? 'Dual-radar view unavailable for local L3 files' : 'Dual-radar view'
  );

  if (lockSingleProductView) {
    setToolbarButtonState('cross-section-button', true, 'Cross-section unavailable for local L3 files');
    return;
  }

  setToolbarButtonState('cross-section-button', false, 'Cross-section view');
  updateCrossSectionButtonState(mainRadar.product);
};

// Expose productToPaletteKey to global scope for use in map.js
window.productToPaletteKey = productToPaletteKey;

const colorbarPaletteMetadata = {};

const initColorbarHoverTooltips = () => {
  const tooltip = ensureColorbarTooltip();
  const attachColorbarHandler = (colorbarId, getProduct) => {
    const colorbar = document.getElementById(colorbarId);
    if (!colorbar) return;

    colorbar.addEventListener('mousemove', (event) => {
      if (colorbar.classList.contains('hidden')) {
        hideColorbarTooltip();
        return;
      }

      const product = getProduct();
      const paletteKey = productToPaletteKey(product);
      const metadata = getPaletteMetadata(paletteKey, colorbarPaletteMetadata);

      if (!metadata) {
        hideColorbarTooltip();
        return;
      }

      const rect = colorbar.getBoundingClientRect();
      if (rect.width <= 0) {
        hideColorbarTooltip();
        return;
      }

      const relativeX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
      const ratio = rect.width === 0 ? 0 : relativeX / rect.width;
      const value = metadata.minValue + (metadata.maxValue - metadata.minValue) * ratio;
      const hoverColor = interpolateStopColor(metadata.stops, value);

      tooltip.textContent = paletteKey === 'DHC'
        ? getDhcTypeLabel(value)
        : value.toFixed(1);
      tooltip.style.left = `${event.clientX}px`;
      tooltip.style.top = `${rect.top - 8}px`;
      tooltip.style.background = `rgba(${hoverColor.r}, ${hoverColor.g}, ${hoverColor.b}, ${hoverColor.a})`;
      tooltip.style.color = getContrastTextColor(hoverColor);
      tooltip.classList.remove('hidden');
    });

    colorbar.addEventListener('mouseleave', hideColorbarTooltip);
  };

  attachColorbarHandler('colorbar-main', () => mainRadar.product);
  attachColorbarHandler('colorbar-split', () => splitRadar.product);

  document.addEventListener('scroll', hideColorbarTooltip, true);
  window.addEventListener('resize', hideColorbarTooltip);
};

// Function to set the current radar on the map
async function setRadar(station=null, product=null, mainOrSplit, options = {}) {
    if (!map) return;

    if (mainOrSplit === 'main') {
        if (!station) station = mainRadar.station;
        if (!product) product = mainRadar.product;
        const level = inferLevelFromProduct(product);
        mainRadar = { station, product, level, options };
      updateCrossSectionButtonState(product);
      updateAnimationButtonState(product);
        if (!isCrossSectionProductSupported(product) && map?.crossSection?.enabled) {
          map.disableCrossSection();
          updateAnimationButtonState(product);
        }
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

    // If in local-file mode and switching products, continue using uploaded data.
    if (localFileMode[mainOrSplit] && !options.fromUrl && !options.rawData) {
      options = {
        ...options,
        rawData: localFileMode[mainOrSplit].rawData,
        fileName: localFileMode[mainOrSplit].fileName
      };
    }

    // Immediately sync colorbar for picker-driven product changes on the corresponding map.
    updateColorbarForMap(mainOrSplit, product);

    // Keep picker UI synchronized for non-picker product changes (e.g. shortcuts).
    const activePicker = mainOrSplit === 'split' ? map.splitRadarPicker : map.radarPicker;
    if (activePicker && typeof activePicker.setCurrentProduct === 'function') {
      activePicker.setCurrentProduct(product);
    }
    
    try {
      const suppressLoading = options?.skipLoading === true;
      if (!suppressLoading) {
        showLoadingAnimation();
      }
      const renderTiming = {
        renderCalledAtMs: getNowEpochMs(),
        fileFetchedAtMs: null,
        parserFinishedAtMs: null,
        meshFinishedAtMs: null,
        visibleAtMs: null,
      };
      const picker = mainOrSplit === 'split' ? map.splitRadarPicker : map.radarPicker;
      const radarResult = await radar.getRadarLayer(station, product, {
        ...options,
        includeGeojson: false,
        onMetadata: ({ timeString, timeIso, tilt, vcp }) => {
          if (picker && typeof picker.setTimeAndTilt === 'function') {
            const isArchive = !!(options.fromUrl || options.rawData);
            picker.setTimeAndTilt(timeString, `${tilt.toFixed(1)}°`, timeIso, { ignoreAgeColoring: isArchive });
          }
          if (mainOrSplit === 'main') {
            // Keep the previous display when transient updates omit VCP.
            if (Number.isFinite(vcp)) {
              currentVcp = vcp; // Store current VCP for settings refresh
            }
            const vcpElement = document.getElementById('toolbar-vcp');
            if (vcpElement) {
              vcpElement.textContent = formatVcpDisplay(currentVcp);
            }

            const stationElement = document.getElementById('toolbar-station');
            if (stationElement) {
              stationElement.textContent = station || mainRadar.station || '';
            }
          }
        }
      });
      if (radarResult?.timing) {
        renderTiming.fileFetchedAtMs = radarResult.timing.fileFetchedAtMs;
        renderTiming.parserFinishedAtMs = radarResult.timing.parserFinishedAtMs;
        renderTiming.meshFinishedAtMs = radarResult.timing.meshFinishedAtMs;
      }

      const handleFirstVisibleFrame = () => {
        renderTiming.visibleAtMs = getNowEpochMs();
        logRadarTimingIfComplete(renderTiming, {
          station,
          product,
          target: mainOrSplit,
          source: radarResult?.timing?.source,
        });
      };

      if (radarResult?.meshData instanceof Float32Array) {
        map.addWebGlRadarMesh(radarResult.meshData, radarResult.bounds, mainOrSplit, product, {
          onFirstVisibleFrame: handleFirstVisibleFrame,
        });
        updateColorbarForMap(mainOrSplit, product);
        if (mainOrSplit === 'main') {
          map.inspectBounds = radarResult.bounds
            ? [[radarResult.bounds[0], radarResult.bounds[1]], [radarResult.bounds[2], radarResult.bounds[3]]]
            : null;
        }
      } else if (radarResult?.geojson) {
        map.addWebGlRadarLayer(radarResult.geojson, mainOrSplit, product, {
          onFirstVisibleFrame: handleFirstVisibleFrame,
        });
        updateColorbarForMap(mainOrSplit, product);
        if (mainOrSplit === 'main' && map.currentGeojson) {
          map.inspectBounds = map._computeBounds(map.currentGeojson);
        }
      }
      if (!suppressLoading) {
        hideLoadingAnimation();
      }
    } catch (error) {
        console.error(`Error updating radar layer for product ${product}:`, error);
        if (!options?.skipLoading) {
          hideLoadingAnimation();
        }
    }
}

// Expose setRadar globally for animation controller
window.setRadar = setRadar;

// Construct the map
// Detect mobile for performance optimizations
const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(navigator.userAgent) || 
  (('ontouchstart' in window) && window.innerWidth <= 768);

if (isMobile) {
    console.log('[SparkRadar] Mobile device detected - enabling performance optimizations');
}

// Map style (bad): https://tgranz.github.io/maps/bold.json
// (old): https://api.maptiler.com/maps/01991750-e542-745a-bb74-f8f5646a978c/style.json?key=UMONrX6MjViuKZoR882u
var startLat = urlParams.get('lat') || 35.4;
var startLng = urlParams.get('lon') || -97.1;
var startZoom = urlParams.get('zoom') || 5;

const map = new Map({
    container: "map",
    style: 'https://tgranz.github.io/maps/spark.json',
    center: [startLng, startLat],
    zoom: startZoom,
    minZoom: 2,
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

if (typeof window !== 'undefined') {
  window.mapInstance = map;
}

initColorbarHoverTooltips();

// Construct the alert list
const alertList = new AlertList(map.layers);

// Initialize inspector
const inspector = new Inspector(map);
var inspectorEnabled = false;

const toggleInspector = () => {
  if (window.appmode === 'satellite') {
    return;
  }
  inspectorEnabled = !inspectorEnabled;
  if (inspectorEnabled) {
    inspector.enable();
  } else {
    inspector.disable();
  }
};

const toggleCrossSectionView = () => {
  if (window.appmode === 'satellite') {
    return;
  }

  if (map.crossSection?.enabled) {
    map.disableCrossSection();
    updateAnimationButtonState(mainRadar.product);
    return;
  }

  if (map.isSplit()) {
    map.stopSplit();
    requestAnimationFrame(() => {
      map.enableCrossSection(mainRadar.station, mainRadar.product);
      updateAnimationButtonState(mainRadar.product);
    });
    return;
  }

  map.enableCrossSection(mainRadar.station, mainRadar.product);
  updateAnimationButtonState(mainRadar.product);
};

const toggleSplitMap = () => {
  if (window.appmode === 'satellite') {
    return;
  }

  if (map.crossSection?.enabled) {
    return;
  }

  if (map.isSplit()) {
    map.stopSplit();
    return;
  }

  map.splitMap('horizontal', { station: mainRadar.station, product: mainRadar.product });
};

// Add the radar to the map
const radar = new Radar();
map.setRadar(radar); // Set radar instance on map for split view

// Apply cache limits from settings and keep them in sync with settings changes.
try {
  const cacheMaxSlots = Number(window.settingsInstance?.getSetting('cacheMaxSlots'));
  const cacheMaxSizeGB = Number(window.settingsInstance?.getSetting('cacheMaxSizeGB'));
  radar.setCacheLimits({
    maxSlots: Number.isFinite(cacheMaxSlots) ? cacheMaxSlots : 6,
    maxSizeGB: Number.isFinite(cacheMaxSizeGB) ? cacheMaxSizeGB : 0.5,
  });
} catch {
  // Ignore settings sync issues and keep defaults.
}

document.addEventListener('settingsChanged', (event) => {
  const { key, value } = event?.detail || {};
  if (key === 'enableLocation') {
    locationServices.setEnabled(Boolean(value));
    if (!value && window.spotterNetworkInstance?.shareLocation) {
      window.spotterNetworkInstance.setLocationSharing(false);
    }
  }
  if (key === 'cacheMaxSlots' && Number.isFinite(Number(value))) {
    radar.setCacheSize(Number(value));
  }
  if (key === 'cacheMaxSizeGB' && Number.isFinite(Number(value))) {
    radar.setCacheMaxSizeGB(Number(value));
  }
  if (key === 'vcpDisplayFormat') {
    // Update VCP display when format changes
    const vcpElement = document.getElementById('toolbar-vcp');
    if (vcpElement && currentVcp !== null) {
      vcpElement.textContent = formatVcpDisplay(currentVcp);
    }
  }
});

// Make radar instance globally accessible for debugging
if (typeof window !== 'undefined') {
  window.radarInstance = radar;
  window.radarCache = radar.cache;
}

// Initialize the current station
map.currentMainStation = initialStation;

// Initialize layer menu toggles
layerMenu.init(map);
layerMenu.initOrderPanel(map);

// Initial map render
map.map.on('load', async () => {
    // Add radar stations
    map.updateRadarStations();

    // Start radar first so startup render is prioritized.
    const initialRadarLoad = setRadar(null, null, 'main');

    // Kick off critical overlays shortly after radar fetch starts.
    // This keeps overlays fast while reducing first-load radar contention.
    setTimeout(() => {
      Promise.allSettled([
        map.fetchAlerts(),
        map.fetchWatches(),
        map.fetchOutlooks(),
      ]).catch(() => {
        // Individual fetch errors are handled by each layer method.
      });
    }, 200);

    await initialRadarLoad;

    // Re-apply current layer order after initial load to ensure correct order
    setTimeout(() => {
      const currentOrder = map.layers?.getLayerOrder?.();
      if (Array.isArray(currentOrder) && currentOrder.length > 0) {
        map.layers.setLayerOrder([...currentOrder]);
      }
    }, 15 * 1000);

    // Subscribe to real-time alert updates via SSE
    map.subscribeToAlerts();
});

// Build the animation controller and expose it globally
const animationController = new AnimationController();
window.animationController = animationController;

// Initialize animation controller with radar and map instances
animationController.initialize(radar, map);

// Build the main toolbar
const toolbar = createToolbar(
  () => {
    if (window.appmode === 'satellite') {
      return;
    }
    if (map.crossSection?.enabled) {
      return;
    }

    if (!map.isSplit()) {
      const newProduct = inferLevelFromProduct(mainRadar.product) === 'L3' ? 'N0G' : 'REF';
      splitRadar = {
        station: mainRadar.station,
        product: newProduct,
        level: inferLevelFromProduct(newProduct),
        options: { gate_limit: -30 }
      };
      lastStationChangeTime.split = Date.now();
      lastCheckedRadar.split = null;
      map.splitMap('horizontal', { station: mainRadar.station, product: newProduct });
      return;
    }

    toggleSplitMap();
  },
  () => { menu.open();},
  () => {
    if (window.appmode === 'satellite') {
      return;
    }
    new RadarStatus(mainRadar.station);
  },
  () => { 
    if (!document.getElementById('open-layer-picker-button').classList.contains('selected')) {
      layerMenu.open();
    } else {
      document.getElementById('layer-menu').classList.add('layer-menu-hidden');
      const openLayerPickerButton = document.getElementById('open-layer-picker-button');
      if (openLayerPickerButton) { openLayerPickerButton.classList.remove('selected'); }
    }},
  () => { startDraw(); },
  () => { toggleCrossSectionView(); },
  () => { toggleInspector(); },
  () => { new Finder(map).open(); },
  () => {
    if (window.appmode === 'satellite') {
      return;
    }
    // Start radar animation
    animationController.start(
      mainRadar.station,
      mainRadar.product,
      mainRadar.level,
      'main'
    );
  },
  () => { startMeasure(); }
);

// Add the toolbar to the page
document.body.appendChild(toolbar);
updateCrossSectionButtonState(mainRadar.product);
updateAnimationButtonState(mainRadar.product);

// Function to load radar from archive URL and disable auto-updates
window.loadRadarFromArchive = async function(url, station) {
  autoUpdateEnabled = false;
  archiveMode.main = url;
  localFileMode.main = null;
  console.log('Auto-updates disabled. Loading archive file...');
  await setRadar(station, 'REF', 'main', { fromUrl: url, gate_limit: -30 });
  // Rebuild product picker to show only Level 2 products
  map.rebuildRadarPicker('main', true);
  map.radarPicker.setArchiveMode(true, () => window.enableAutoUpdates());
};

// Add the menu to the page
const menu = new Menu({
    onArchiveBrowser: () => { new ArchiveBrowser({ onClose: () => menu.close() }); },
  onRadarFileUpload: () => {
    openRadarFileUploadDialog({
      map,
      setRadar,
      getMainStation: () => mainRadar.station,
      setAutoUpdateEnabled: (enabled) => {
        autoUpdateEnabled = enabled;
      },
      setArchiveMode: (target, value) => {
        archiveMode[target] = value;
      },
      setLocalFileMode: (target, value) => {
        localFileMode[target] = value;
      },
      setLocalFileToolbarState,
      enableAutoUpdates: () => window.enableAutoUpdates(),
    });
  },
});

// Refresh handler to update radar data with debouncing and station change detection
let updateInProgress = false;
let lastStationChangeTime = { main: 0, split: 0 };
let lastCheckedRadar = { main: null, split: null }; // Track last checked radar state
let baselineCheckCount = { main: 0, split: 0 }; // Track how many checks we've seen stable
const STATION_CHANGE_DEBOUNCE = 5000; // 5 second debounce after station change
const BASELINE_CHECKS_REQUIRED = 2; // Require 2 stable checks before updating
var updateTimes = 10;
var updateIntervalId = null;
var autoUpdateEnabled = true;

// Track archive mode
var archiveMode = { main: null, split: null }; // Stores archive URL when in archive mode

// Track uploaded local files for each target (main/split)
var localFileMode = { main: null, split: null };

// Track manually-selected product per target to avoid chunk refreshes reading stale map state
var selectedProduct = { main: 'N0B', split: 'N0G' }; // Initialize to defaults matching mainRadar/splitRadar

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

  // Track user-selected product so chunk refreshes always use the right one
  if (product) {
    selectedProduct[mainOrSplit] = product;
  }

  return originalSetRadar(station, product, mainOrSplit, options);
};

const sn = new SpotterNetwork();
window.spotterNetworkInstance = sn; // Expose globally
sn.login();

// Trigger near-immediate redraws when new realtime Level-II chunks arrive.
const realtimeChunkRefreshState = {
  main: { timerId: null, inFlight: false, pendingChunkUrl: null, lastProcessedChunkUrl: null },
  split: { timerId: null, inFlight: false, pendingChunkUrl: null, lastProcessedChunkUrl: null },
};

// Debounce gate: skip chunk-driven refreshes if a manual product/station change just occurred.
// This prevents automatic chunk refreshes from overriding recent user selections with stale state.
const MANUAL_CHANGE_DEBOUNCE_MS = 2000;

const scheduleRealtimeChunkRefresh = (target, chunkUrl = null) => {
  const state = realtimeChunkRefreshState[target];
  if (!state || state.inFlight) return;

  // Skip refresh if user just manually changed product or station
  const timeSinceManualChange = Date.now() - lastStationChangeTime[target];
  if (timeSinceManualChange < MANUAL_CHANGE_DEBOUNCE_MS) {
    console.log(`[L2ChunkRender] Skipping chunk refresh (${target}) - recent manual change (${timeSinceManualChange}ms ago)`);
    return;
  }

  if (chunkUrl && state.lastProcessedChunkUrl === chunkUrl) {
    return;
  }

  state.pendingChunkUrl = chunkUrl || state.pendingChunkUrl;
  if (state.timerId) clearTimeout(state.timerId);

  state.timerId = setTimeout(async () => {
    state.timerId = null;
    if (state.inFlight) return;
    state.inFlight = true;

    try {
      const station = target === 'main' ? mainRadar.station : splitRadar.station;
      // Use our tracked product selection instead of reading map state,
      // since map.currentRadarProduct may be stale or not synced during product changes
      const product = selectedProduct[target] || 
        (target === 'main' ? mainRadar.product : splitRadar.product) ||
        (target === 'main' ? map.currentRadarProduct : map.currentRadarProductSplit);

      const isL2 = inferLevelFromProduct(product) === 'L2';
      const isArchive = !!archiveMode[target];
      const isLocal = !!localFileMode[target];
      if (!isL2 || isArchive || isLocal) {
        state.pendingChunkUrl = null;
        return;
      }

      await originalSetRadar(station, product, target, {
        gate_limit: -30,
        skipLoading: true,
      });

      state.lastProcessedChunkUrl = state.pendingChunkUrl;
      state.pendingChunkUrl = null;
    } catch (error) {
      console.error(`[L2ChunkRender] Realtime chunk refresh failed (${target}):`, error);
    } finally {
      state.inFlight = false;
    }
  }, 200);
};

window.addEventListener('sparkradar:l2-chunk-update', (event) => {
  const station = event?.detail?.station || null;
  const chunkUrl = event?.detail?.chunkUrl || null;
  if (!station) return;

  if (station === mainRadar.station) {
    scheduleRealtimeChunkRefresh('main', chunkUrl);
  }

  if (map.hasSplitMap && map.hasSplitMap() && station === splitRadar.station) {
    scheduleRealtimeChunkRefresh('split', chunkUrl);
  }
});

updateIntervalId = setInterval(async () => {
  if (!autoUpdateEnabled || updateInProgress) return;
  updateInProgress = true;
  updateTimes ++;
  try {
    console.log("Running routine update.");

    // Only check main map if station hasn't changed recently.
    // Realtime chunk-streamed L2 refreshes via chunk events instead of this 10s loop.
    if (Date.now() - lastStationChangeTime.main > STATION_CHANGE_DEBOUNCE) {
      const mainProduct = selectedProduct.main || map.currentRadarProduct || mainRadar.product;
      const isRealtimeChunkL2Main = inferLevelFromProduct(mainProduct) === 'L2' && !archiveMode.main && !localFileMode.main;

      if (!isRealtimeChunkL2Main) {
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
    }

    // Only check split map if it exists and station hasn't changed recently.
    // Realtime chunk-streamed L2 refreshes via chunk events instead of this 10s loop.
    if (map.hasSplitMap() && Date.now() - lastStationChangeTime.split > STATION_CHANGE_DEBOUNCE) {
      const splitProduct = selectedProduct.split || map.currentRadarProductSplit || splitRadar.product;
      const isRealtimeChunkL2Split = inferLevelFromProduct(splitProduct) === 'L2' && !archiveMode.split && !localFileMode.split;

      if (!isRealtimeChunkL2Split) {
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
    }

    // Update radar stations and outlooks every 12 cycles (2mins)
    if (updateTimes >= 12) {
      console.log("Running secondary updates...");
      map.updateRadarStations();
      map.fetchOutlooks();

      try {
        const layerSettings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
        if (layerSettings.mesoscaleDiscussionsEnabled === true) {
          map.fetchDiscussions();
        }
        if (layerSettings.lightningEnabled === true) {
          map.fetchLightning();
        }
        if (layerSettings.spotterNetworkPositionsEnabled === true) {
          map.fetchSpotterNetworkPositions();
        }
        if (layerSettings.metarStationsEnabled === true) {
          map.fetchMetarStations();
        }
        if (layerSettings.nwsTornadoReportsEnabled === true || layerSettings.nwsWindReportsEnabled === true || layerSettings.nwsHailReportsEnabled === true) {
          map.fetchNwsStormReports();
        }
      } catch (error) {
        console.error('Error loading layer settings for periodic updates:', error);
      }

      updateTimes = 0;
    }

    // Update alerts and watches
    console.log('[Debug] invoking periodic fetches: alerts, watches, storm-centers');
    map.fetchAlerts();
    map.fetchWatches();
    map.fetchStormCenters();

    console.log("UPDATETIMES:", updateTimes);

  } finally {
    updateInProgress = false;
  }
}, 10 * 1000); // Run updates every 10 seconds

// Set up keyboard shortcuts
setupKeybinds({
  toggleSplitMap,
  toggleCrossSectionView,
  toggleInspector,
  showRadarStatus: () => {
    if (window.appmode === 'satellite') {
      return;
    }
    new RadarStatus(mainRadar.station);
  },
  showMenu: () => menu.open(),
  showLayerMenu: () => {
    if (!document.getElementById('open-layer-picker-button').classList.contains('selected')) {
      layerMenu.open();
    } else {
      document.getElementById('layer-menu').classList.add('layer-menu-hidden');
      const openLayerPickerButton = document.getElementById('open-layer-picker-button');
      if (openLayerPickerButton) { openLayerPickerButton.classList.remove('selected'); }
    }
  },
  startDraw,
  startMeasure,
  showFinder: () => new Finder(map).open(),
  setRadar,
});

window.enableAutoUpdates = function() {
  autoUpdateEnabled = true;
  archiveMode.main = null;
  archiveMode.split = null;
  localFileMode.main = null;
  localFileMode.split = null;
  console.log('Auto-updates re-enabled.');
  // Rebuild product picker to show all products
  map.rebuildRadarPicker('main', false);
  if (map.hasSplitMap()) {
    map.rebuildRadarPicker('split', false);
  }
  setLocalFileToolbarState(false);
};

window.disableAutoUpdates = function() {
  autoUpdateEnabled = false;
  console.log('Auto-updates disabled.');
};

window.isAutoUpdateEnabled = function() {
  return autoUpdateEnabled;
};

// Show welcome dialog if first time
if (localStorage.getItem('firstUse') !== 'true') {
  const welcomeDialog = new Dialog('Welcome to SparkRadar', 'bolt', 
  `<h2 style="margin-bottom: 10px; text-align: left;">Welcome to SparkRadar!</h2>
  <p>SparkRadar brings all the tools and features necessary for you to track severe weather in one place, including:</p>
  <ul class="welcomeul" style="text-align: left; margin-left: 20px;">
    <li>Split screen view</li>
    <li>Highest resolution real-time radar products, as well as support to view archived L3 files, L2 files, and L2 chunks.</li>
    <li>Instant weather alerts, watches, and mesoscale discussions.</li>
    <li>Lightning and storm centers.</li>
    <li>Spotter Network integration as well as storm reports from the SPC and Spotter Network.</li>
    <li>The <b>best</b> and <b>simplest</b> interface of any radar application. Easy for beginners and beautiful for pros!</li>
    <li>And so much more!</li>
  </ul>

  <p style="margin-bottom: 10px;">SparkRadar will <b>NEVER</b> have subscriptions, paywalls, ads, or trackers.</p>
  <p>YOU make SparkRadar possible! If SparkRadar has helped you, help to spread the word about SparkRadar or consider helping to cover domain costs by <a href="https://www.buymeacoffee.com/tgranz" target="_blank">supporting my work</a>. Thank you!</p>

  <h3 style="margin-top: 20px; margin-bottom: 10px; text-align: left; width: 100%;">Changes in the latest update:</h3>
  ${buildLatestChangeElement()}
  `, {}, true);
  localStorage.setItem('firstUse', 'true');
}

// Check if the user is using the new version for the first time
checkVersion();