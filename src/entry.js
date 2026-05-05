// Polyfill Buffer for browser environment
import { Buffer } from 'buffer';
if (!globalThis.Buffer) globalThis.Buffer = Buffer;


import Map from "./js/frontend/map.js";
import Menu from "./js/ui/menu.js";
import Radar from "./js/backend/radar.js";
import RadarStatus from "./js/frontend/radar_status.js";
import Dialog from './js/ui/dialog.js';
import Notification from './js/ui/notification.js';
import AlertList from "./js/frontend/alert_list.js";
import Draw from "./js/frontend/draw.js";
import ArchiveBrowser from "./js/frontend/archive_browser.js";
import Inspector from "./js/ui/inspector.js";
import Measure from "./js/frontend/measure.js";
import StormTrack from './js/frontend/storm_track.js';
import Palettes from './js/backend/palettes.js';
import Finder from './js/frontend/finder.js';
import { checkVersion, buildLatestChangeElement } from './js/frontend/changelog.js';
import AnimationController from './js/frontend/radar_animation.js';
import { openRadarFileUploadDialog } from './js/frontend/radar_file_upload.js';
import SpotterNetwork from './js/backend/spotter_network.js';
import LocationServices from "./js/backend/location_services.js";
import { initializeIntervalUpdates } from './js/backend/updater.js';
import { createToolbar } from "./js/frontend/toolbars/toolbar.js";
import { hideLoadingAnimation, showLoadingAnimation } from "./js/ui/loader.js";
import { layerMenu } from "./js/frontend/layer_menu.js";
import Settings from './js/frontend/settings/settings.js';
import setupKeybinds from './js/backend/shortcuts.js';
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
  buildRadarRenderOptions,
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

  if (StormTrack.instance) {
    StormTrack.instance.close();
  }

  if (Measure.instance) {
    Measure.instance.close();
    return;
  }

  new Measure(map);
}

function startStormTrack() {
  if (Draw.instance) {
    Draw.instance.close();
  }

  if (Measure.instance) {
    Measure.instance.close();
  }

  if (StormTrack.instance) {
    StormTrack.instance.close();
    return;
  }

  new StormTrack(map);
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
        fileName: localFileMode[mainOrSplit].fileName,
        localFileLevel: localFileMode[mainOrSplit].level,
        isUploadedArchive: localFileMode[mainOrSplit].isUploadedArchive === true,
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
      const renderOptions = buildRadarRenderOptions(product, options);
      const renderTiming = {
        renderCalledAtMs: getNowEpochMs(),
        fileFetchedAtMs: null,
        parserFinishedAtMs: null,
        meshFinishedAtMs: null,
        visibleAtMs: null,
      };
      const picker = mainOrSplit === 'split' ? map.splitRadarPicker : map.radarPicker;
      const radarResult = await radar.getRadarLayer(station, product, {
        ...renderOptions,
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
  if (key === 'enableVelocityDealias') {
    if (mainRadar?.product === 'VEL') {
      setRadar(null, null, 'main', { skipLoading: true });
    }
    if (map.isSplit() && splitRadar?.product === 'VEL') {
      setRadar(null, null, 'split', { skipLoading: true });
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

let hasSubscribedToAlertStream = false;
const ensureAlertStreamSubscription = () => {
  if (hasSubscribedToAlertStream) {
    return;
  }
  map.subscribeToAlerts();
  hasSubscribedToAlertStream = true;
};

// Start SSE subscription as soon as map/layers are constructed so it is not
// blocked by map style load or radar startup delays.
ensureAlertStreamSubscription();

// Initial map render
map.map.on('load', async () => {
  // Ensure subscription exists when the map finishes loading.
  ensureAlertStreamSubscription();

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

    // SSE subscription is started at the top of this load handler.
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
      intervalUpdates?.markManualChange('split');
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
  () => { startMeasure(); },
  () => { startStormTrack(); },
  () => map.toggleRadarStationsVisible()
);

// Add the toolbar to the page
document.body.appendChild(toolbar);
updateCrossSectionButtonState(mainRadar.product);
updateAnimationButtonState(mainRadar.product);

// Track archive mode
var archiveMode = { main: null, split: null }; // Stores archive URL when in archive mode

// Track uploaded local files for each target (main/split)
var localFileMode = { main: null, split: null };

let intervalUpdates = null;

// Function to load radar from archive URL and disable auto-updates
window.loadRadarFromArchive = async function(url, station) {
  intervalUpdates?.disableAutoUpdates();
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
        if (enabled) {
          intervalUpdates?.enableAutoUpdates();
        } else {
          intervalUpdates?.disableAutoUpdates();
        }
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

const sn = new SpotterNetwork();
window.spotterNetworkInstance = sn; // Expose globally
sn.login();

intervalUpdates = initializeIntervalUpdates({
  map,
  radar,
  inferLevelFromProduct,
  setRadar,
  getMainRadar: () => mainRadar,
  getSplitRadar: () => splitRadar,
  getArchiveMode: () => archiveMode,
  getLocalFileMode: () => localFileMode,
});
setRadar = intervalUpdates.setRadar;

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
  intervalUpdates?.enableAutoUpdates();
  console.log('Auto-updates re-enabled.');
  // Rebuild product picker to show all products
  map.rebuildRadarPicker('main', false);
  if (map.hasSplitMap()) {
    map.rebuildRadarPicker('split', false);
  }
  setLocalFileToolbarState(false);
};

window.disableAutoUpdates = function() {
  intervalUpdates?.disableAutoUpdates();
  console.log('Auto-updates disabled.');
};

window.isAutoUpdateEnabled = function() {
  return intervalUpdates?.isAutoUpdateEnabled() ?? false;
};

window.forceUpdate = function() {
  intervalUpdates?.forceUpdate();
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

// Read announcements
fetch('https://api.sparkradar.app/announcement')
  .then((response) => response.json())
  .then((data) => {
    /* Assuming data structure:
    {
      "message": "This is an announcement <b>with HTML</b> content.",
      "icon": "note",
      "stopShowing": "2026-05-01T00:00:00Z",
      "color": "#ffcc00",
      "showNotification": true
    }
    */

    if (data?.message && data?.stopShowing) {      
      if (new Date() < new Date(data.stopShowing)) {
        window.announcement = data;

        if (data?.showNotification) {
          new Notification(
            'Announcement',
            data.message,
            data.icon ? data.icon : 'bell-ringing',
            data.color ? data.color : '#27beff',
            10000
          );
        } else {
          console.log("Announcement exists but 'showNotification' is false");
        }
      } else {
        console.log('Announcement expired and will not be shown');
      }
    } else {
      console.log('No announcement data or missing fields in response');
    }
  })
  .catch(() => {
    // Ignore errors
  });