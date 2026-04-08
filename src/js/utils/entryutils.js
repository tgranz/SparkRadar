// Function to refactor VCP for display
export function formatVcpDisplay(vcp) {
  if (!Number.isFinite(vcp)) return '';
  
  const format = window.settingsInstance?.getSetting('vcpDisplayFormat') || 'descriptive';
  
  if (format === 'concise') return `VCP ${vcp}`;

  let description = 'Convective precip mode'; // Default
  if (vcp === 31 || vcp === 34 || vcp === 35) {
    description = 'Clean air mode';
  } else if (vcp === 215) {
    description = 'General precip mode';
  } else if (vcp === 112) {
    description = 'Tropical mode';
  }
  
  return `VCP ${vcp}: ${description}`;
}


// Infer L2 or L3 based on the product code
export const inferLevelFromProduct = (product) => {
  if (!product) return 'L3';
  const upper = product.toUpperCase();
  if (upper === 'REF' || upper === 'VEL' || upper === 'CC' || upper === 'KDP' || upper === 'SW' || upper === 'ZDR') {
    return 'L2';
  }
  return 'L3';
};


// Identify if a product supports cross section
export const isCrossSectionProductSupported = (product) => {
  if (!product) return false;

  const upper = String(product).toUpperCase();
  if (inferLevelFromProduct(upper) === 'L2') return false;

  if (upper === 'DAA' || upper === 'DTA') return false;
  if (/^N[0-3]S$/.test(upper)) return false;

  return /^N[0-3][A-Z]$/.test(upper);
};


// Map a product code to a palette type
export const productMap = {
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
    'HHC': 'DHC',                                           // Hybrid Hydrometeor Classification
  };


// Map product code to palette key (considering both L2 direct codes and L3 product codes)
export const productToPaletteKey = (product) => {
  if (!product) return 'REF';
  const upper = product.toUpperCase();
  
  // If it's already a palette key, return it
  if (upper === 'REF' || upper === 'VEL' || upper === 'SRV' || upper === 'CC' || upper === 'KDP' || upper === 'SW' || upper === 'ZDR' || upper === 'DHC' || upper === 'DAA' || upper === 'DTA') {
    return upper;
  }
  
  return productMap[upper] || 'REF';
};


// DHC (Hydrometer Classification) type labels
export const DHC_TYPE_LABELS = {
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


// Get the DHC label for a given value
export const getDhcTypeLabel = (value) => {
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


// Clamp a value between min and max
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);


// Parse CSS color string (rgba or rgb) to color object
export const parsePaletteColor = (colorText) => {
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


// Interpolate between color stops
export const interpolateStopColor = (stops, value) => {
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


// Get contrast text color (black or white) for a given color
export const getContrastTextColor = ({ r, g, b }) => {
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? '#111' : '#fff';
};


// Build palette metadata (min/max values, color stops)
export const getPaletteMetadata = (paletteKey, colorbarPaletteMetadata = {}) => {
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


// Colorbar tooltip DOM management
export const ensureColorbarTooltip = () => {
  let tooltip = document.getElementById('colorbar-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'colorbar-tooltip';
    tooltip.className = 'colorbar-tooltip hidden';
    document.body.appendChild(tooltip);
  }
  return tooltip;
};


export const hideColorbarTooltip = () => {
  const tooltip = document.getElementById('colorbar-tooltip');
  if (tooltip) {
    tooltip.classList.add('hidden');
  }
};


// Update colorbar gradient for a given map and product
export const updateColorbarForMap = (mainOrSplit, product) => {
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


// Timing utilities for performance logging
export const getNowEpochMs = () => performance.timeOrigin + performance.now();

export const isFiniteMs = (value) => Number.isFinite(value);

export const formatMs = (value) => `${value.toFixed(2)} ms`;

export const logRadarTimingIfComplete = (timing, context = {}) => {
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