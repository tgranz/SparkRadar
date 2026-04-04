/*

> surface_analysis.js
This module handles WPC coded surface frontal positions on the map.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import { hasUsableMapStyle, waitForMapStyleReady, waitForRadarLayer, getWeatherOutlineBeforeLayerId } from './layer_utils.js';

const EMPTY_FEATURE_COLLECTION = {
    type: 'FeatureCollection',
    features: []
};

const SYNC_PENDING_STALE_MS = 15000;

const SURFACE_ANALYSIS_PRODUCT_URL = 'https://forecast.weather.gov/product.php?site=CRH&product=COD&issuedby=SUS';
//const SURFACE_ANALYSIS_CACHE_URL = `https://cachefetch.sparkradar.app/cache?maxAge=300&url=${encodeURIComponent(SURFACE_ANALYSIS_PRODUCT_URL)}`;
const SURFACE_ANALYSIS_CACHE_URL = SURFACE_ANALYSIS_PRODUCT_URL;
const SURFACE_ANALYSIS_FETCH_TIMEOUT_MS = 5000;
const SURFACE_ANALYSIS_FETCH_RETRIES = 3;
const SURFACE_ANALYSIS_RETRY_DELAY_MS = 600;
const SURFACE_ANALYSIS_CACHE_KEY = 'surfaceAnalysisCache';
const SURFACE_ANALYSIS_CACHE_TTL_MS = 15 * 60 * 1000;

const FRONT_TYPES = new Set(['STNRY', 'TROF', 'COLD', 'WARM', 'OCFNT']);
const SECTION_MARKERS = new Set(['HIGHS', 'LOWS', ...FRONT_TYPES, 'VALID', '$$']);

const FRONT_LAYER_STYLES = [
    {
        code: 'COLD',
        suffix: 'cold',
        color: '#3b82f6',
        width: 3.5,
        symbols: [{ suffix: 'cold-symbol', icon: 'surface-analysis-cold-symbol', spacing: 32, anchor: 'bottom' }]
    },
    {
        code: 'WARM',
        suffix: 'warm',
        color: '#ef4444',
        width: 3.5,
        symbols: [{ suffix: 'warm-symbol', icon: 'surface-analysis-warm-symbol', spacing: 32, anchor: 'bottom' }]
    },
    {
        code: 'STNRY',
        suffix: 'stationary',
        color: "#000",
        width: 3.5,
        symbols: [
            {
                suffix: 'stationary-warm-symbol',
                icon: 'surface-analysis-stationary-warm-symbol',
                spacing: 56,
                anchor: 'top',
                parity: 'even'
            },
            {
                suffix: 'stationary-cold-symbol',
                icon: 'surface-analysis-cold-symbol',
                spacing: 56,
                anchor: 'bottom',
                parity: 'odd'
            }
        ]
    },
    {
        code: 'OCFNT',
        suffix: 'occluded',
        color: '#8b5cf6',
        width: 3.5,
        dasharray: [1.5, 1.5],
        symbols: [
            {
                suffix: 'occluded-semicircle-symbol',
                icon: 'surface-analysis-occluded-semicircle-symbol',
                spacing: 56,
                anchor: 'bottom',
                parity: 'even'
            },
            {
                suffix: 'occluded-triangle-symbol',
                icon: 'surface-analysis-occluded-triangle-symbol',
                spacing: 56,
                anchor: 'bottom',
                parity: 'odd'
            }
        ]
    },
    { code: 'TROF', suffix: 'trough', color: '#a16207', width: 2.5, dasharray: [3, 2], symbols: [] }
];

function createFrontSymbolCanvas(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    draw(ctx, width, height);
    return ctx.getImageData(0, 0, width, height);
}

function drawTriangle(ctx, x, baseY, size, color) {
    ctx.beginPath();
    ctx.moveTo(x - size, baseY);
    ctx.lineTo(x + size, baseY);
    ctx.lineTo(x, baseY - size * 1.35);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

function drawSemicircle(ctx, x, baseY, radius, color, side = 'top') {
    ctx.beginPath();
    if (side === 'bottom') {
        ctx.arc(x, baseY, radius, 0, Math.PI, false);
    } else {
        ctx.arc(x, baseY, radius, Math.PI, 0, false);
    }
    ctx.lineTo(x - radius, baseY);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

function createFrontSymbolImage(iconName) {
    switch (iconName) {
        case 'surface-analysis-cold-symbol':
            return createFrontSymbolCanvas(26, 22, (ctx) => {
                drawTriangle(ctx, 13, 21, 6, FRONT_LAYER_STYLES.find((style) => style.code === 'COLD')?.color);
            });
        case 'surface-analysis-warm-symbol':
            return createFrontSymbolCanvas(26, 22, (ctx) => {
                drawSemicircle(ctx, 13, 21, 6, FRONT_LAYER_STYLES.find((style) => style.code === 'WARM')?.color, 'top');
            });
        case 'surface-analysis-stationary-warm-symbol':
            return createFrontSymbolCanvas(26, 22, (ctx) => {
                drawSemicircle(ctx, 13, 1, 6, FRONT_LAYER_STYLES.find((style) => style.code === 'WARM')?.color, 'bottom');
            });
        case 'surface-analysis-occluded-semicircle-symbol':
            return createFrontSymbolCanvas(26, 22, (ctx) => {
                drawSemicircle(ctx, 13, 21, 6, FRONT_LAYER_STYLES.find((style) => style.code === 'OCFNT')?.color, 'top');
            });
        case 'surface-analysis-occluded-triangle-symbol':
            return createFrontSymbolCanvas(26, 22, (ctx) => {
                drawTriangle(ctx, 13, 21, 6, FRONT_LAYER_STYLES.find((style) => style.code === 'OCFNT')?.color);
            });
        default:
            return null;
    }
}

function isPressureToken(token) {
    return /^\d{3,4}$/.test(token);
}

function isCoordinateToken(token) {
    return /^\d{7}$/.test(token);
}

function decodeCoordinateToken(token) {
    if (!isCoordinateToken(token)) return null;

    const latTenths = Number(token.slice(0, 3));
    const lonTenths = Number(token.slice(3));
    if (!Number.isFinite(latTenths) || !Number.isFinite(lonTenths)) return null;

    return [-(lonTenths / 10), latTenths / 10];
}

function dedupeConsecutiveCoordinates(coordinates) {
    const deduped = [];
    for (const coordinate of coordinates) {
        const previous = deduped[deduped.length - 1];
        if (previous && previous[0] === coordinate[0] && previous[1] === coordinate[1]) {
            continue;
        }
        deduped.push(coordinate);
    }
    return deduped;
}

function buildStationaryFrontSegments(coordinates, validTime) {
    const segments = [];

    for (let index = 0; index < coordinates.length - 1; index += 1) {
        const start = coordinates[index];
        const end = coordinates[index + 1];
        if (!start || !end) {
            continue;
        }

        segments.push({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [start, end]
            },
            properties: {
                analysisType: 'STNRY',
                validTime,
                segmentParity: index % 2 === 0 ? 'even' : 'odd'
            }
        });
    }

    return segments;
}

function buildOccludedFrontSegments(coordinates, validTime) {
    const segments = [];

    for (let index = 0; index < coordinates.length - 1; index += 1) {
        const start = coordinates[index];
        const end = coordinates[index + 1];
        if (!start || !end) {
            continue;
        }

        segments.push({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [start, end]
            },
            properties: {
                analysisType: 'OCFNT',
                validTime,
                segmentParity: index % 2 === 0 ? 'even' : 'odd'
            }
        });
    }

    return segments;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidParsedSurfaceAnalysis(data) {
    return !!(
        data &&
        data.lines &&
        Array.isArray(data.lines.features) &&
        data.centers &&
        Array.isArray(data.centers.features)
    );
}

function loadSurfaceAnalysisCache() {
    try {
        const raw = localStorage.getItem(SURFACE_ANALYSIS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (!Number.isFinite(parsed.timestamp)) return null;
        if (!isValidParsedSurfaceAnalysis(parsed.data)) return null;
        return parsed;
    } catch {
        return null;
    }
}

function saveSurfaceAnalysisCache(data) {
    if (!isValidParsedSurfaceAnalysis(data)) return;
    try {
        localStorage.setItem(SURFACE_ANALYSIS_CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data
        }));
    } catch {}
}

function extractSurfaceAnalysisText(doc) {
    if (typeof doc !== 'string' || doc.length === 0) return null;

    const trimmedDoc = doc.trim();
    if (!trimmedDoc.includes('<') && /(HIGHS|LOWS|COLD|WARM|STNRY|OCFNT|TROF)/.test(trimmedDoc)) {
        return trimmedDoc;
    }

    try {
        const parser = new DOMParser();
        const parsedDoc = parser.parseFromString(trimmedDoc, 'text/html');
        const pre = parsedDoc.querySelector('pre');
        if (pre?.textContent) {
            return pre.textContent.trim();
        }
    } catch (error) {
        console.warn('[SurfaceAnalysisLayer] Failed DOM parsing for surface analysis page:', error);
    }

    const preMatch = trimmedDoc.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (preMatch?.[1]?.trim()) {
        return preMatch[1].trim();
    }

    return /(HIGHS|LOWS|COLD|WARM|STNRY|OCFNT|TROF)/.test(trimmedDoc) ? trimmedDoc : null;
}

function parseSurfaceAnalysisText(text) {
    if (typeof text !== 'string' || text.trim().length === 0) {
        return null;
    }

    const tokens = text.replace(/\r/g, ' ').split(/\s+/).filter(Boolean);
    const lineFeatures = [];
    const centerFeatures = [];
    const metadata = { validTime: null };
    let section = null;

    for (let index = 0; index < tokens.length;) {
        const token = tokens[index];
        if (token === '$$') {
            break;
        }

        if (token === 'VALID') {
            metadata.validTime = tokens[index + 1] || null;
            section = null;
            index += 2;
            continue;
        }

        if (SECTION_MARKERS.has(token)) {
            section = token;
            index += 1;
            continue;
        }

        if (section === 'HIGHS' || section === 'LOWS') {
            const pressure = tokens[index];
            const coordinateToken = tokens[index + 1];
            if (isPressureToken(pressure) && isCoordinateToken(coordinateToken)) {
                const coordinates = decodeCoordinateToken(coordinateToken);
                if (coordinates) {
                    centerFeatures.push({
                        type: 'Feature',
                        geometry: {
                            type: 'Point',
                            coordinates
                        },
                        properties: {
                            centerType: section === 'HIGHS' ? 'HIGH' : 'LOW',
                            label: section === 'HIGHS' ? 'H' : 'L',
                            pressure,
                            validTime: metadata.validTime
                        }
                    });
                }
                index += 2;
                continue;
            }

            index += 1;
            continue;
        }

        if (FRONT_TYPES.has(section)) {
            if (!isCoordinateToken(token)) {
                index += 1;
                continue;
            }

            const coordinates = [];
            while (index < tokens.length && isCoordinateToken(tokens[index])) {
                const decoded = decodeCoordinateToken(tokens[index]);
                if (decoded) {
                    coordinates.push(decoded);
                }
                index += 1;
            }

            const dedupedCoordinates = dedupeConsecutiveCoordinates(coordinates);
            if (dedupedCoordinates.length >= 2) {
                if (section === 'STNRY') {
                    lineFeatures.push(...buildStationaryFrontSegments(dedupedCoordinates, metadata.validTime));
                } else if (section === 'OCFNT') {
                    lineFeatures.push(...buildOccludedFrontSegments(dedupedCoordinates, metadata.validTime));
                } else {
                    lineFeatures.push({
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: dedupedCoordinates
                        },
                        properties: {
                            analysisType: section,
                            validTime: metadata.validTime
                        }
                    });
                }
            }
            continue;
        }

        index += 1;
    }

    return {
        metadata,
        lines: {
            type: 'FeatureCollection',
            features: lineFeatures
        },
        centers: {
            type: 'FeatureCollection',
            features: centerFeatures
        },
        rawText: text
    };
}

class SurfaceAnalysisLayer {
    constructor(mapInstance) {
        this.map = mapInstance;
        this.surfaceAnalysisData = null;
        this.syncPending = { main: false, dual: false };
        this.syncPendingSince = { main: 0, dual: 0 };
        this.symbolsRegistered = { main: false, dual: false };
    }

    setSurfaceAnalysisData(data) {
        this.surfaceAnalysisData = data;
    }

    getSurfaceAnalysisData() {
        return this.surfaceAnalysisData;
    }

    async fetchSurfaceAnalysis() {
        const cachedEntry = loadSurfaceAnalysisCache();
        if (cachedEntry?.data) {
            this.surfaceAnalysisData = cachedEntry.data;
            const ageMs = Date.now() - cachedEntry.timestamp;
            if (ageMs <= SURFACE_ANALYSIS_CACHE_TTL_MS) {
                return cachedEntry.data;
            }
        }

        let lastError = null;

        for (let attempt = 1; attempt <= SURFACE_ANALYSIS_FETCH_RETRIES; attempt += 1) {
            try {
                const response = await fetch(SURFACE_ANALYSIS_CACHE_URL, {
                    headers: { Accept: 'text/html' },
                    signal: AbortSignal.timeout(SURFACE_ANALYSIS_FETCH_TIMEOUT_MS)
                });

                if (!response.ok) {
                    throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
                }

                const doc = await response.text();
                const text = extractSurfaceAnalysisText(doc);
                if (!text) {
                    throw new Error('No surface analysis text found in product response.');
                }

                const parsed = parseSurfaceAnalysisText(text);
                if (!parsed) {
                    throw new Error('Failed to parse surface analysis text.');
                }

                this.surfaceAnalysisData = parsed;
                saveSurfaceAnalysisCache(parsed);
                return parsed;
            } catch (error) {
                lastError = error;
                if (attempt < SURFACE_ANALYSIS_FETCH_RETRIES) {
                    await wait(SURFACE_ANALYSIS_RETRY_DELAY_MS * attempt);
                }
            }
        }

        console.error('[SurfaceAnalysisLayer] Error fetching surface analysis:', lastError);
        if (cachedEntry?.data) {
            return cachedEntry.data;
        }
        return this.surfaceAnalysisData;
    }

    _isSurfaceAnalysisEnabled() {
        try {
            const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
            if (typeof settings.surfaceAnalysisEnabled === 'boolean') {
                return settings.surfaceAnalysisEnabled;
            }
        } catch {
        }

        const checkbox = document.getElementById('toggle-surface-analysis-layer');
        return checkbox ? checkbox.checked : false;
    }

    _getSourceIds(target) {
        return {
            lineSourceId: target === 'main' ? 'surface-analysis-lines-source' : 'surface-analysis-lines-source-dual',
            centerSourceId: target === 'main' ? 'surface-analysis-centers-source' : 'surface-analysis-centers-source-dual'
        };
    }

    _getLayerIds(target) {
        const suffix = target === 'main' ? '' : '-dual';
        return {
            frontLayerIds: FRONT_LAYER_STYLES.map((style) => `surface-analysis-${style.suffix}${suffix}`),
            frontSymbolLayerIds: FRONT_LAYER_STYLES.flatMap((style) =>
                (style.symbols || []).map((symbol) => `surface-analysis-${symbol.suffix}${suffix}`)
            ),
            centerLetterLayerId: `surface-analysis-center-letter${suffix}`,
            centerPressureLayerId: `surface-analysis-center-pressure${suffix}`
        };
    }

    _registerFrontSymbols(map, target) {
        if (this.symbolsRegistered[target]) return;

        for (const style of FRONT_LAYER_STYLES) {
            for (const symbol of style.symbols || []) {
                if (map.hasImage(symbol.icon)) {
                    continue;
                }

                const image = createFrontSymbolImage(symbol.icon);
                if (image) {
                    map.addImage(symbol.icon, image, { pixelRatio: 1 });
                }
            }
        }

        this.symbolsRegistered[target] = true;
    }

    _scheduleSurfaceAnalysisSync(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        if (hasUsableMapStyle(map)) {
            this.syncPending[target] = false;
            this.syncPendingSince[target] = 0;
            waitForRadarLayer(map, target).then(() => {
                this._syncSurfaceAnalysisToMap(target);
            });
            return;
        }

        if (this.syncPending[target]) {
            const pendingAge = Date.now() - (this.syncPendingSince[target] || 0);
            if (pendingAge < SYNC_PENDING_STALE_MS) {
                return;
            }
            console.warn(`[SurfaceAnalysisLayer] Resetting stale sync pending flag for ${target} (age=${pendingAge}ms)`);
            this.syncPending[target] = false;
        }
        this.syncPending[target] = true;
        this.syncPendingSince[target] = Date.now();

        waitForMapStyleReady(map).then(() => {
            this.syncPending[target] = false;
            this.syncPendingSince[target] = 0;
            waitForRadarLayer(map, target).then(() => {
                this._syncSurfaceAnalysisToMap(target);
            });
        });
    }

    _syncSurfaceAnalysisToMap(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        const lineFeatures = this.surfaceAnalysisData?.lines?.features || [];
        const centerFeatures = this.surfaceAnalysisData?.centers?.features || [];
        if (lineFeatures.length === 0 && centerFeatures.length === 0) {
            this.clearSurfaceAnalysis(target);
            return;
        }

        const { lineSourceId, centerSourceId } = this._getSourceIds(target);
        const { frontLayerIds, frontSymbolLayerIds, centerLetterLayerId, centerPressureLayerId } = this._getLayerIds(target);
        const beforeLayerId = getWeatherOutlineBeforeLayerId(map, target);

        this._registerFrontSymbols(map, target);

        if (!map.getSource(lineSourceId)) {
            map.addSource(lineSourceId, {
                type: 'geojson',
                data: this.surfaceAnalysisData.lines
            });
        } else {
            map.getSource(lineSourceId).setData(this.surfaceAnalysisData.lines);
        }

        if (!map.getSource(centerSourceId)) {
            map.addSource(centerSourceId, {
                type: 'geojson',
                data: this.surfaceAnalysisData.centers
            });
        } else {
            map.getSource(centerSourceId).setData(this.surfaceAnalysisData.centers);
        }

        FRONT_LAYER_STYLES.forEach((style, index) => {
            const layerId = frontLayerIds[index];
            if (!map.getLayer(layerId)) {
                map.addLayer({
                    id: layerId,
                    type: 'line',
                    source: lineSourceId,
                    filter: ['==', ['get', 'analysisType'], style.code],
                    layout: {
                        'line-cap': 'round',
                        'line-join': 'round'
                    },
                    paint: {
                        'line-color': style.code === 'STNRY'
                            ? [
                                'match',
                                ['get', 'segmentParity'],
                                'even', '#ef4444',
                                'odd', '#3b82f6',
                                style.color
                            ]
                            : style.color,
                        'line-width': style.width,
                        'line-opacity': 0.95,
                        ...(style.dasharray ? { 'line-dasharray': style.dasharray } : {})
                    }
                }, beforeLayerId);
            }

            for (const symbol of style.symbols || []) {
                const symbolLayerId = target === 'main'
                    ? `surface-analysis-${symbol.suffix}`
                    : `surface-analysis-${symbol.suffix}-dual`;

                if (!map.getLayer(symbolLayerId)) {
                    map.addLayer({
                        id: symbolLayerId,
                        type: 'symbol',
                        source: lineSourceId,
                        filter: symbol.parity
                            ? [
                                'all',
                                ['==', ['get', 'analysisType'], style.code],
                                ['==', ['get', 'segmentParity'], symbol.parity]
                            ]
                            : ['==', ['get', 'analysisType'], style.code],
                        layout: {
                            'symbol-placement': 'line',
                            'symbol-spacing': symbol.spacing,
                            'icon-image': symbol.icon,
                            'icon-anchor': symbol.anchor || 'center',
                            'icon-size': 1,
                            'icon-allow-overlap': true,
                            'icon-ignore-placement': true,
                            'icon-rotation-alignment': 'map'
                        }
                    }, beforeLayerId);
                }
            }
        });

        if (!map.getLayer(centerLetterLayerId)) {
            map.addLayer({
                id: centerLetterLayerId,
                type: 'symbol',
                source: centerSourceId,
                layout: {
                    'text-field': ['get', 'label'],
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-size': 24,
                    'text-allow-overlap': true,
                    'text-ignore-placement': true
                },
                paint: {
                    'text-color': [
                        'match',
                        ['get', 'centerType'],
                        'HIGH', '#1d4ed8',
                        'LOW', '#dc2626',
                        '#ffffff'
                    ],
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 1.5,
                    'text-halo-blur': 0.4
                }
            }, beforeLayerId);
        }

        if (!map.getLayer(centerPressureLayerId)) {
            map.addLayer({
                id: centerPressureLayerId,
                type: 'symbol',
                source: centerSourceId,
                layout: {
                    'text-field': ['get', 'pressure'],
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-size': 12,
                    'text-offset': [0, 2],
                    'text-allow-overlap': true,
                    'text-ignore-placement': true
                },
                paint: {
                    'text-color': '#f8fafc',
                    'text-halo-color': '#111827',
                    'text-halo-width': 1.2,
                    'text-halo-blur': 0.3
                }
            }, beforeLayerId);
        }

        this.map?.layers?.applyLayerOrder(target);
    }

    displaySurfaceAnalysisOnMap(target = 'main') {
        if (!this._isSurfaceAnalysisEnabled() || !this.surfaceAnalysisData) {
            this.clearSurfaceAnalysis(target);
            return;
        }

        this._scheduleSurfaceAnalysisSync(target);
    }

    displaySurfaceAnalysis() {
        this.displaySurfaceAnalysisOnMap('main');
        if (this.map?.isSplit()) {
            this.displaySurfaceAnalysisOnMap('dual');
        }
    }

    clearSurfaceAnalysis(target = 'main') {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        const { lineSourceId, centerSourceId } = this._getSourceIds(target);
        const lineSource = map.getSource(lineSourceId);
        const centerSource = map.getSource(centerSourceId);

        if (lineSource) {
            lineSource.setData(EMPTY_FEATURE_COLLECTION);
        }
        if (centerSource) {
            centerSource.setData(EMPTY_FEATURE_COLLECTION);
        }
    }

    displaySurfaceAnalysisOnDualMap() {
        if (!this.map?.dualMap) return;
        this.displaySurfaceAnalysisOnMap('dual');
    }
}

export default SurfaceAnalysisLayer;