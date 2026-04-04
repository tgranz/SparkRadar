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
import Measure from "./js/ui/measure.js";
import Palettes from './js/palettes.js';
import Finder from './js/ui/finder.js';
import AnimationController from './js/ui/radar_animation.js';
import SpotterNetwork from './js/spotter_network.js';

// Import location services
import LocationServices from "./js/location_services.js";

// Import components
import { createToolbar } from "./components/toolbar.js";
import { hideLoadingAnimation, showLoadingAnimation } from "./js/ui/loader.js";
import { layerMenu } from "./components/layer_menu.js";

// Set custom colors
import Settings from './js/ui/settings.js';
window.settingsInstance = new Settings(); // Expose globally for color customization

const locationServices = new LocationServices({
  enabled: window.settingsInstance?.getSetting('enableLocation') !== false,
});
window.locationServices = locationServices;

// Create a global Palettes instance to preserve custom palettes across calls
const globalPalettes = new Palettes();
window.globalPalettes = globalPalettes;

// See if there are URL parameters for station
const urlParams = new URLSearchParams(window.location.search);
const initialStation = urlParams.get('station') ? urlParams.get('station').toUpperCase() : 'KTLX';

// Helper function to format VCP display
function formatVcpDisplay(vcp) {
  if (!Number.isFinite(vcp)) return '';
  
  const format = window.settingsInstance?.getSetting('vcpDisplayFormat') || 'descriptive';
  
  if (format === 'concise') {
    return `VCP ${vcp}`;
  }
  
  // Descriptive format
  let description = 'Convective precip mode'; // Default
  if (vcp === 31 || vcp === 34 || vcp === 35) {
    description = 'Clean air mode';
  } else if (vcp === 215) {
    description = 'General precip mode';
  }
  
  return `VCP ${vcp}: ${description}`;
}

// Function to draw on the map
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

function inferStationFromUploadedFileName(fileName, fallbackStation = 'KTLX') {
  if (!fileName || typeof fileName !== 'string') return fallbackStation;

  const upper = fileName.toUpperCase();
  const direct = upper.match(/\bK[A-Z0-9]{3}\b/);
  if (direct) return direct[0];

  // Common Level 2 format: KXXXYYYYMMDD_HHMMSS_V06
  const level2Prefix = upper.match(/^([A-Z0-9]{4})\d{8}_\d{6}/);
  if (level2Prefix) return level2Prefix[1];

  // Common Level 3/archive style tokenization.
  const token = upper.split(/[^A-Z0-9]+/).find((part) => /^[A-Z0-9]{3,4}$/.test(part));
  if (token) return token.length === 3 ? `K${token}` : token;

  return fallbackStation;
}

function openRadarFileUploadDialog() {
  const html = `
    <div style="display:flex;flex-direction:column;gap:12px;">
      <select id="radar-file-level" style="padding:8px;border-radius:8px;">
        <option value="L2" selected>Level II archive or chunk file</option>
        <option value="L3">Level III file</option>
      </select>
      <input id="radar-file-input" type="file" style="padding:6px 0;" />
      <div id="radar-file-dropzone" style="border:2px dashed rgba(255,255,255,0.45);border-radius:10px;padding:18px;text-align:center;background:rgba(255,255,255,0.04);">
        Drag and drop a radar file here
      </div>
      <div id="radar-file-selected" style="font-size:0.9em;opacity:0.85;min-height:1.2em;">No file selected</div>
      <button id="radar-file-render" style="padding:10px;border-radius:10px;border:none;font-weight:700;cursor:pointer;">Render File</button>
    </div>
  `;

  const dialog = new Dialog('Radar File Upload', 'upload', html);
  const levelSelect = document.getElementById('radar-file-level');
  const fileInput = document.getElementById('radar-file-input');
  const dropzone = document.getElementById('radar-file-dropzone');
  const selectedText = document.getElementById('radar-file-selected');
  const renderButton = document.getElementById('radar-file-render');

  let selectedFile = null;

  const setSelectedFile = (file) => {
    selectedFile = file || null;
    selectedText.textContent = selectedFile ? `Selected: ${selectedFile.name}` : 'No file selected';
  };

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    setSelectedFile(file);
  });

  dropzone?.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.style.borderColor = 'rgba(255,255,255,0.85)';
    dropzone.style.background = 'rgba(255,255,255,0.1)';
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'rgba(255,255,255,0.45)';
    dropzone.style.background = 'rgba(255,255,255,0.04)';
  });

  dropzone?.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.style.borderColor = 'rgba(255,255,255,0.45)';
    dropzone.style.background = 'rgba(255,255,255,0.04)';
    const file = event.dataTransfer?.files && event.dataTransfer.files[0] ? event.dataTransfer.files[0] : null;
    setSelectedFile(file);
  });

  renderButton?.addEventListener('click', async () => {
    if (!selectedFile) {
      alert('Please select or drop a radar file first.');
      return;
    }

    try {
      showLoadingAnimation();
      renderButton.disabled = true;
      renderButton.textContent = 'Rendering...';

      const arrayBuffer = await selectedFile.arrayBuffer();
      const rawData = Buffer.from(arrayBuffer);
      const selectedLevel = levelSelect?.value === 'L3' ? 'L3' : 'L2';
      const product = selectedLevel === 'L3' ? 'N0B' : 'REF';
      const station = inferStationFromUploadedFileName(selectedFile.name, mainRadar.station);

      // Close split/cross-section FIRST.
      // stopSplit() creates a fresh RadarPicker internally.
      // disableCrossSection() calls rebuildRadarPicker() and window.enableAutoUpdates().
      // Both must happen before we set archive state so they don't stomp over it.
      if (map.crossSection?.enabled) {
        map.disableCrossSection();
      }
      if (map.isSplit()) {
        map.stopSplit();
      }

      // Set archive state (overrides enableAutoUpdates() that disableCrossSection may have called).
      autoUpdateEnabled = false;
      archiveMode.main = null;
      localFileMode.main = {
        rawData,
        fileName: selectedFile.name,
        level: selectedLevel
      };

      // Build the final picker and fully configure it BEFORE calling setRadar,
      // so the onMetadata callback inside setRadar operates on the correct picker instance.
      map.rebuildRadarPicker('main', selectedLevel === 'L2');
      map.radarPicker.setArchiveMode(true, () => window.enableAutoUpdates(), 'Viewing local file');

      if (selectedLevel === 'L3') {
        // L3 files contain only one product at one tilt — lock the picker
        // and disable split / cross-section controls.
        map.radarPicker.setPickerLocked(true);

        const splitBtn = document.getElementById('dual-map-button');
        if (splitBtn) {
          splitBtn.disabled = true;
          splitBtn.setAttribute('aria-disabled', 'true');
          splitBtn.style.color = 'gray';
          splitBtn.style.pointerEvents = 'none';
          splitBtn.title = 'Dual-radar view unavailable for local L3 files';
        }
        const xsBtn = document.getElementById('cross-section-button');
        if (xsBtn) {
          xsBtn.disabled = true;
          xsBtn.setAttribute('aria-disabled', 'true');
          xsBtn.style.color = 'gray';
          xsBtn.style.pointerEvents = 'none';
          xsBtn.title = 'Cross-section unavailable for local L3 files';
        }
      }

      await setRadar(station, product, 'main', {
        rawData,
        fileName: selectedFile.name,
        gate_limit: -30
      });

      dialog.close();
    } catch (error) {
      console.error('Failed to render uploaded radar file:', error);
      alert(`Unable to render file: ${error?.message || 'Unknown error'}`);
    } finally {
      hideLoadingAnimation();
      renderButton.disabled = false;
      renderButton.textContent = 'Render File';
    }
  });
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

// Track current VCP for refresh when settings change
var currentVcp = null;

// Function to infer radar level from product code, also sets the VCP
const inferLevelFromProduct = (product) => {
  if (!product) return 'L3';
  const upper = product.toUpperCase();
  if (upper === 'REF' || upper === 'VEL' || upper === 'CC' || upper === 'KDP' || upper === 'SW' || upper === 'ZDR') {
    return 'L2';
  }
  return 'L3';
};

const isCrossSectionProductSupported = (product) => {
  if (!product) return false;

  const upper = String(product).toUpperCase();
  if (inferLevelFromProduct(upper) === 'L2') return false;

  if (upper === 'DAA' || upper === 'DTA') return false;
  if (/^N[0-3]S$/.test(upper)) return false;

  return /^N[0-3][A-Z]$/.test(upper);
};

const updateCrossSectionButtonState = (product) => {
  const button = document.getElementById('cross-section-button');
  if (!button) return;

  const supported = isCrossSectionProductSupported(product);
  button.disabled = !supported;
  button.setAttribute('aria-disabled', String(!supported));
  button.title = supported
    ? 'Cross-section view'
    : 'Cross-section unavailable for this product';
};

// Function to map L3 product codes to palette keys
const productToPaletteKey = (product) => {
  if (!product) return 'REF';
  const upper = product.toUpperCase();
  
  // If it's already a palette key, return it
  if (upper === 'REF' || upper === 'VEL' || upper === 'SRV' || upper === 'CC' || upper === 'KDP' || upper === 'SW' || upper === 'ZDR' || upper === 'DHC' || upper === 'DAA' || upper === 'DTA') {
    return upper;
  }
  
  // Map L3 product codes to palette keys
  const productMap = {
    'N0B': 'REF', 'N1B': 'REF', 'N2B': 'REF', 'N3B': 'REF', // Base Reflectivity
    'N0G': 'VEL', 'N1G': 'VEL', 'N2G': 'VEL', 'N3G': 'VEL', // Base Velocity
    'N0U': 'SRV', 'N1U': 'SRV', 'N2U': 'SRV', 'N3U': 'SRV', // Storm Relative Velocity
    'N0S': 'SRV', 'N1S': 'SRV', 'N2S': 'SRV', 'N3S': 'SRV', // Storm Relative Velocity
    'N0C': 'CC', 'N1C': 'CC', 'N2C': 'CC', 'N3C': 'CC',     // Correlation Coefficient
    'N0K': 'KDP', 'N1K': 'KDP', 'N2K': 'KDP', 'N3K': 'KDP', // Specific Differential Phase
    'N0H': 'DHC', 'N1H': 'DHC', 'N2H': 'DHC', 'N3H': 'DHC', // Hydrometer Classification
    'N0W': 'SW', 'N1W': 'SW', 'N2W': 'SW', 'N3W': 'SW',     // Spectrum Width
    'N0Z': 'ZDR', 'N1Z': 'ZDR', 'N2Z': 'ZDR', 'N3Z': 'ZDR', // Differential Reflectivity
    'DAA': 'DAA', 'DTA': 'DTA',                             // Precipitation Accumulation
  };
  
  return productMap[upper] || 'REF'; // Default to REF if not found
};

// Expose to global scope for use in map.js
window.productToPaletteKey = productToPaletteKey;

const colorbarPaletteMetadata = {};

const DHC_TYPE_LABELS = {
  10: 'Biological',
  20: 'Clutter',
  30: 'Ice crystals',
  40: 'Dry snow',
  50: 'Wet snow',
  60: 'Rain',
  70: 'Heavy rain',
  80: 'Big drops',
  90: 'Graupel',
  100: 'Hail + rain',
  110: 'Large hail',
  120: 'Giant hail',
  130: 'RF',
  140: 'Unknown',
};

const getDhcTypeLabel = (value) => {
  const classes = Object.keys(DHC_TYPE_LABELS).map(Number).sort((a, b) => a - b);
  let selectedClass = classes[0];

  for (let i = 0; i < classes.length; i++) {
    if (value >= classes[i]) {
      selectedClass = classes[i];
    } else {
      break;
    }
  }

  return DHC_TYPE_LABELS[selectedClass] || 'Unknown';
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const parsePaletteColor = (colorText) => {
  if (typeof colorText !== 'string') return null;

  let match = colorText.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/i);
  if (match) {
    const alphaRaw = Number(match[4]);
    const alpha = alphaRaw > 1 ? alphaRaw / 255 : alphaRaw;
    return {
      r: clamp(Number(match[1]), 0, 255),
      g: clamp(Number(match[2]), 0, 255),
      b: clamp(Number(match[3]), 0, 255),
      a: clamp(alpha, 0, 1),
    };
  }

  match = colorText.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
  if (match) {
    return {
      r: clamp(Number(match[1]), 0, 255),
      g: clamp(Number(match[2]), 0, 255),
      b: clamp(Number(match[3]), 0, 255),
      a: 1,
    };
  }

  return null;
};

const interpolateStopColor = (stops, value) => {
  if (!Array.isArray(stops) || stops.length === 0) {
    return { r: 0, g: 0, b: 0, a: 0.85 };
  }

  if (value <= stops[0].value) {
    return stops[0].color;
  }

  const lastStop = stops[stops.length - 1];
  if (value >= lastStop.value) {
    return lastStop.color;
  }

  for (let i = 0; i < stops.length - 1; i++) {
    const left = stops[i];
    const right = stops[i + 1];
    if (value >= left.value && value <= right.value) {
      const span = right.value - left.value;
      const t = span === 0 ? 0 : (value - left.value) / span;
      return {
        r: Math.round(left.color.r + (right.color.r - left.color.r) * t),
        g: Math.round(left.color.g + (right.color.g - left.color.g) * t),
        b: Math.round(left.color.b + (right.color.b - left.color.b) * t),
        a: left.color.a + (right.color.a - left.color.a) * t,
      };
    }
  }

  return lastStop.color;
};

const getContrastTextColor = ({ r, g, b }) => {
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? '#111' : '#fff';
};

const getPaletteMetadata = (paletteKey) => {
  const cacheKey = String(paletteKey || 'REF').toUpperCase();
  if (colorbarPaletteMetadata[cacheKey]) {
    return colorbarPaletteMetadata[cacheKey];
  }

  const colorTable = window.globalPalettes?.getPalette?.(cacheKey) || [];
  const stops = [];

  for (let i = 0; i < colorTable.length; i += 2) {
    const value = Number(colorTable[i]);
    const color = parsePaletteColor(colorTable[i + 1]);
    if (Number.isFinite(value) && value < 900 && color) {
      stops.push({ value, color });
    }
  }

  if (stops.length === 0) {
    return null;
  }

  stops.sort((a, b) => a.value - b.value);

  const minValue = stops[0].value;
  const maxValue = stops[stops.length - 1].value;

  let minStep = Infinity;
  for (let i = 1; i < stops.length; i++) {
    const delta = stops[i].value - stops[i - 1].value;
    if (delta > 0 && delta < minStep) {
      minStep = delta;
    }
  }

  let decimals = 0;
  if (Number.isFinite(minStep) && minStep > 0) {
    decimals = Math.min(3, Math.max(0, Math.ceil(-Math.log10(minStep))));
  } else if (Math.abs(maxValue - minValue) < 10) {
    decimals = 1;
  }

  const metadata = { minValue, maxValue, decimals, stops };
  colorbarPaletteMetadata[cacheKey] = metadata;
  return metadata;
};

const ensureColorbarTooltip = () => {
  let tooltip = document.getElementById('colorbar-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'colorbar-tooltip';
    tooltip.className = 'colorbar-tooltip hidden';
    document.body.appendChild(tooltip);
  }
  return tooltip;
};

const hideColorbarTooltip = () => {
  const tooltip = document.getElementById('colorbar-tooltip');
  if (tooltip) {
    tooltip.classList.add('hidden');
  }
};

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
      const metadata = getPaletteMetadata(paletteKey);

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

const getNowEpochMs = () => performance.timeOrigin + performance.now();

const isFiniteMs = (value) => Number.isFinite(value);

const formatMs = (value) => `${value.toFixed(2)} ms`;

const logRadarTimingIfComplete = (timing, context = {}) => {
  const { renderCalledAtMs, fileFetchedAtMs, parserFinishedAtMs, meshFinishedAtMs, visibleAtMs } = timing || {};
  if (!isFiniteMs(renderCalledAtMs) || !isFiniteMs(fileFetchedAtMs) || !isFiniteMs(parserFinishedAtMs) || !isFiniteMs(meshFinishedAtMs) || !isFiniteMs(visibleAtMs)) {
    return;
  }

  const renderToFetch = fileFetchedAtMs - renderCalledAtMs;
  const fetchToParse = parserFinishedAtMs - fileFetchedAtMs;
  const parseToMesh = meshFinishedAtMs - parserFinishedAtMs;
  const meshToVisible = visibleAtMs - meshFinishedAtMs;
  const totalRenderToVisible = visibleAtMs - renderCalledAtMs;
  const sourceLabel = context.source === 'cache' ? 'cache' : 'network';
  const targetLabel = context.target || 'main';
  const stationLabel = context.station || 'unknown';
  const productLabel = context.product || 'unknown';

  const titleStyle = 'background:#111827;color:#86efac;padding:2px 8px;border-radius:3px;font-weight:700;';
  const rowLabelStyle = 'color:#93c5fd;font-weight:700;';
  const rowValueStyle = 'color:#f8fafc;font-weight:600;';
  const totalStyle = 'color:#facc15;font-weight:800;';

  console.groupCollapsed(
    `%c[Radar Timing] ${stationLabel} ${productLabel} (${targetLabel}, ${sourceLabel})`,
    titleStyle
  );
  console.log('%cRender call → File fetched:%c %s', rowLabelStyle, rowValueStyle, formatMs(renderToFetch));
  console.log('%cFile fetched → Parser finished:%c %s', rowLabelStyle, rowValueStyle, formatMs(fetchToParse));
  console.log('%cParser finished → Mesh computed:%c %s', rowLabelStyle, rowValueStyle, formatMs(parseToMesh));
  console.log('%cMesh computed → Visible on map:%c %s', rowLabelStyle, rowValueStyle, formatMs(meshToVisible));
  console.log('%cTotal (Render call → Visible):%c %s', totalStyle, totalStyle, formatMs(totalRenderToVisible));
  console.groupEnd();
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
        if (!isCrossSectionProductSupported(product) && map?.crossSection?.enabled) {
          map.disableCrossSection();
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

initColorbarHoverTooltips();

// Construct the alert list
const alertList = new AlertList(map.layers);

// Initialize inspector
const inspector = new Inspector(map);
var inspectorEnabled = false;

const toggleSplitMap = () => {
  if (map.crossSection?.enabled) {
    return;
  }

  if (map.isSplit()) {
    map.stopSplit();
    return;
  }

  map.splitMap('horizontal', { station: mainRadar.station, product: mainRadar.product });
};

// Keybinds
window.addEventListener('keydown', (e) => {
  const target = e.target;
  const tagName = target?.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable) return;

  const pressedKey = String(e.key || '').toLowerCase();
  const getShortcut = (key, fallback) => {
    const value = window.settingsInstance?.getSetting(key);
    if (typeof value !== 'string') return fallback;
    return value.trim().slice(0, 1).toLowerCase();
  };

  if (pressedKey && pressedKey === getShortcut('shortcutToggleSplitView', 'm')) {
    toggleSplitMap();
  } else if (pressedKey && pressedKey === getShortcut('shortcutToggleCrossSection', 'x')) {
    if (map.crossSection?.enabled) {
      map.disableCrossSection();
    } else {
      if (map.isSplit()) {
        map.stopSplit();
        requestAnimationFrame(() => {
          map.enableCrossSection(mainRadar.station, mainRadar.product);
        });
      } else {
        map.enableCrossSection(mainRadar.station, mainRadar.product);
      }
    }
  } else if (pressedKey && pressedKey === getShortcut('shortcutShowRadarStatus', 's')) {
    const statusDialog = new RadarStatus(mainRadar.station);
  } else if (pressedKey && pressedKey === getShortcut('shortcutShowMenu', 'h')) {
    menu.open();
  } else if (pressedKey && pressedKey === getShortcut('shortcutShowLayerMenu', 'l')) {
    layerMenu.open();
  } else if (pressedKey && pressedKey === getShortcut('shortcutDraw', 'd')) {
    startDraw();
  } else if (pressedKey && pressedKey === getShortcut('shortcutFinder', 'f')) {
    new Finder(map).open();
  } else if (pressedKey && pressedKey === getShortcut('shortcutInspector', 'i')) {
    // Toggle inspector
    inspectorEnabled = !inspectorEnabled;
    if (inspectorEnabled) {
      inspector.enable();
    } else {
      inspector.disable();
    }
  } else if (pressedKey && pressedKey === getShortcut('shortcutMeasure', 'n')) {
    startMeasure();
  } else if (pressedKey && pressedKey === getShortcut('shortcutProductReflectivity', '1')) {
    setRadar(null, 'N0B', 'main') // Reflectivity
  } else if (pressedKey && pressedKey === getShortcut('shortcutProductVelocity', '2')) {
    setRadar(null, 'N0G', 'main') // Velocity
  } else if (pressedKey && pressedKey === getShortcut('shortcutProductCorrelationCoefficient', '3')) {
    setRadar(null, 'N0C', 'main') // Correlation Coefficient
  } else if (pressedKey && pressedKey === getShortcut('shortcutProductHydrometeorClassification', '4')) {
    setRadar(null, 'N0H', 'main') // Hydrometer Classification
  } else if (pressedKey && pressedKey === getShortcut('shortcutProductSpecificDifferentialPhase', '5')) {
    setRadar(null, 'N0K', 'main') // Specific Differential Phase
  }
});

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

    // Add radar
    await setRadar(null, null, 'main');

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
  () => { new RadarStatus(mainRadar.station); },
  () => { 
    if (!document.getElementById('open-layer-picker-button').classList.contains('selected')) {
      layerMenu.open();
    } else {
      document.getElementById('layer-menu').classList.add('layer-menu-hidden');
      const openLayerPickerButton = document.getElementById('open-layer-picker-button');
      if (openLayerPickerButton) { openLayerPickerButton.classList.remove('selected'); }
    }},
  () => { startDraw(); },
  () => { 
    if (map.crossSection?.enabled) {
      map.disableCrossSection();
    } else {
      if (map.isSplit()) {
        map.stopSplit();
        requestAnimationFrame(() => {
          map.enableCrossSection(mainRadar.station, mainRadar.product);
        });
      } else {
        map.enableCrossSection(mainRadar.station, mainRadar.product);
      }
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
  () => { new Finder(map).open(); },
  () => {
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
  onRadarFileUpload: () => { openRadarFileUploadDialog(); },
});

// Refresh handler to update radar data with debouncing and station change detection
let updateInProgress = false;
let lastStationChangeTime = { main: 0, split: 0 };
let lastCheckedRadar = { main: null, split: null }; // Track last checked radar state
let baselineCheckCount = { main: 0, split: 0 }; // Track how many checks we've seen stable
const STATION_CHANGE_DEBOUNCE = 5000; // 5 second debounce after station change
const BASELINE_CHECKS_REQUIRED = 2; // Require 2 stable checks before updating
var updateTimes = 0;
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
      map.fetchDiscussions();

      try {
        const layerSettings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
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
  // Restore toolbar buttons that may have been visually disabled for an L3 local file.
  const splitBtn = document.getElementById('dual-map-button');
  if (splitBtn) {
    splitBtn.disabled = false;
    splitBtn.setAttribute('aria-disabled', 'false');
    splitBtn.style.color = '';
    splitBtn.style.pointerEvents = '';
    splitBtn.title = 'Dual-radar view';
  }
  const xsBtn = document.getElementById('cross-section-button');
  if (xsBtn) {
    xsBtn.disabled = false;
    xsBtn.setAttribute('aria-disabled', 'false');
    xsBtn.style.color = '';
    xsBtn.style.pointerEvents = '';
  }
  updateCrossSectionButtonState(mainRadar.product);
};

window.disableAutoUpdates = function() {
  autoUpdateEnabled = false;
  console.log('Auto-updates disabled.');
};

window.isAutoUpdateEnabled = function() {
  return autoUpdateEnabled;
};

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