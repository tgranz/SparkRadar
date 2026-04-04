import { hasUsableMapStyle, waitForMapStyleReady, waitForRadarLayer, getWeatherOutlineBeforeLayerId } from './layer_utils.js';

const EMPTY_FEATURE_COLLECTION = {
    type: 'FeatureCollection',
    features: []
};

const SYNC_PENDING_STALE_MS = 15000;

const LIGHTNING_SOURCE_URL = 'https://saratoga-weather.org/USA-blitzortung/placefile.txt';
const LIGHTNING_CACHEFETCH_URL = `https://cachefetch.sparkradar.app/cache?format=txt&maxAge=60&url=${encodeURIComponent(LIGHTNING_SOURCE_URL)}`;
const LIGHTNING_FETCH_TIMEOUT_MS = 15000;
const LIGHTNING_FETCH_RETRIES = 3;
const LIGHTNING_FETCH_RETRY_DELAY_MS = 500;
const DEFAULT_REFRESH_SECONDS = 300;
const DEFAULT_STRIKE_MAX_AGE_SECONDS = 600; // 10 min
const DEFAULT_LIGHTNING_MARKER_MODE = 'dot'; // 'dot' | 'image'
const LIGHTNING_MARKER_IMAGE_URL = '/lightningmarker.webp';
const LIGHTNING_MARKER_IMAGE_ALT_URL = '/images/lightningmarker.webp';
const LIGHTNING_MARKER_IMAGE_FALLBACK_URL = new URL('../../../assets/lightningmarker.png', import.meta.url).href;
const LIGHTNING_MARKER_IMAGE_ID = 'lightning-marker-image';

const MONTH_INDEX = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11
};

const TZ_OFFSETS_MINUTES = {
    UTC: 0,
    GMT: 0,
    EDT: -4 * 60,
    EST: -5 * 60,
    CDT: -5 * 60,
    CST: -6 * 60,
    MDT: -6 * 60,
    MST: -7 * 60,
    PDT: -7 * 60,
    PST: -8 * 60
};

function normalizeMonthToken(token) {
    if (typeof token !== 'string' || token.length < 3) return null;
    const short = token.slice(0, 3).toLowerCase();
    return `${short[0].toUpperCase()}${short.slice(1)}`;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function toUtcFromLocalParts(year, monthIndex, day, hour, minute, second, tzAbbr) {
    const tzOffsetMinutes = TZ_OFFSETS_MINUTES[tzAbbr];
    if (!Number.isFinite(tzOffsetMinutes)) return null;
    return Date.UTC(year, monthIndex, day, hour, minute, second) - (tzOffsetMinutes * 60 * 1000);
}

function getDatePartsInTimezone(timestampMs, tzAbbr) {
    const tzOffsetMinutes = TZ_OFFSETS_MINUTES[tzAbbr];
    if (!Number.isFinite(tzOffsetMinutes)) return null;

    const localTimestamp = timestampMs + (tzOffsetMinutes * 60 * 1000);
    const localDate = new Date(localTimestamp);
    return {
        year: localDate.getUTCFullYear(),
        monthIndex: localDate.getUTCMonth(),
        day: localDate.getUTCDate(),
        tzAbbr
    };
}

function parseUpdatedTimestamp(line) {
    const match = line.match(/^Updated:\s*\w{3},\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*([A-Z]{2,5})\s*$/);
    if (!match) return null;

    const day = Number(match[1]);
    const monthToken = normalizeMonthToken(match[2]);
    const monthIndex = monthToken ? MONTH_INDEX[monthToken] : undefined;
    const year = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const tzAbbr = match[7].toUpperCase();

    if (!Number.isFinite(day) || !Number.isFinite(monthIndex) || !Number.isFinite(year) || !Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) {
        return null;
    }

    const timestamp = toUtcFromLocalParts(year, monthIndex, day, hour, minute, second, tzAbbr);
    if (!Number.isFinite(timestamp)) return null;

    return { year, monthIndex, day, tzAbbr, timestamp };
}

function parseStrikeTimestamp(label, updatedContext) {
    if (!label) return null;

    const match = label.match(/@\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)\s*([A-Z]{2,5})?\s*$/i);
    if (!match) return null;

    const hour12 = Number(match[1]);
    const minute = Number(match[2]);
    const second = Number(match[3] || 0);
    const meridiem = match[4].toLowerCase();
    const tzAbbr = (match[5] || updatedContext?.tzAbbr || '').toUpperCase();

    if (!Number.isFinite(hour12) || !Number.isFinite(minute) || !Number.isFinite(second) || hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59 || second < 0 || second > 59) {
        return null;
    }

    let hour24 = hour12 % 12;
    if (meridiem === 'pm') hour24 += 12;

    const baseDate = updatedContext || getDatePartsInTimezone(Date.now(), tzAbbr);
    if (!baseDate) return null;

    let strikeTimestamp = toUtcFromLocalParts(
        baseDate.year,
        baseDate.monthIndex,
        baseDate.day,
        hour24,
        minute,
        second,
        tzAbbr
    );
    if (!Number.isFinite(strikeTimestamp)) return null;

    if (updatedContext?.timestamp) {
        if (strikeTimestamp - updatedContext.timestamp > 6 * 60 * 60 * 1000) {
            strikeTimestamp -= 24 * 60 * 60 * 1000;
        }
    } else {
        const delta = strikeTimestamp - Date.now();
        if (delta > 6 * 60 * 60 * 1000) {
            strikeTimestamp -= 24 * 60 * 60 * 1000;
        } else if (delta < -18 * 60 * 60 * 1000) {
            strikeTimestamp += 24 * 60 * 60 * 1000;
        }
    }

    return strikeTimestamp;
}

function parsePlacefile(text) {
    if (typeof text !== 'string' || text.trim().length === 0) return null;

    const lines = text.split(/\r?\n/);
    const iconFiles = new Map();
    const features = [];
    const seen = new Set();
    let refreshSeconds = DEFAULT_REFRESH_SECONDS;
    let updatedContext = null;

    for (const lineRaw of lines) {
        const line = lineRaw.trim();
        if (!line) continue;

        const isCommentLine = line.startsWith(';');
        const normalizedLine = isCommentLine ? line.slice(1).trim() : line;

        if (normalizedLine.startsWith('Updated:')) {
            const parsedUpdated = parseUpdatedTimestamp(normalizedLine);
            if (parsedUpdated) {
                updatedContext = parsedUpdated;
            }
            continue;
        }

        if (isCommentLine) continue;

        if (line.startsWith('RefreshSeconds:')) {
            const value = Number(line.split(':')[1]?.trim());
            if (Number.isFinite(value) && value > 0) {
                refreshSeconds = value;
            }
            continue;
        }

        if (line.startsWith('IconFile:')) {
            const payload = line.slice('IconFile:'.length).trim();
            const parts = payload.split(',');
            if (parts.length >= 6) {
                const id = Number(parts[0].trim());
                const width = Number(parts[1].trim());
                const height = Number(parts[2].trim());
                const anchorX = Number(parts[3].trim());
                const anchorY = Number(parts[4].trim());
                const url = parts.slice(5).join(',').trim();

                if (Number.isFinite(id) && Number.isFinite(width) && Number.isFinite(height) && url) {
                    iconFiles.set(id, {
                        id,
                        width,
                        height,
                        anchorX: Number.isFinite(anchorX) ? anchorX : Math.round(width / 2),
                        anchorY: Number.isFinite(anchorY) ? anchorY : Math.round(height / 2),
                        url
                    });
                }
            }
            continue;
        }

        if (!line.startsWith('Icon:')) continue;

        const payload = line.slice('Icon:'.length).trim();
        const parts = payload.split(',');
        if (parts.length < 6) continue;

        const lat = Number(parts[0].trim());
        const lon = Number(parts[1].trim());
        const iconFileId = Number(parts[3].trim());
        const iconIndex = Number(parts[4].trim());
        const label = parts.slice(5).join(',').trim();
        const strikeTimeMs = parseStrikeTimestamp(label, updatedContext) ?? updatedContext?.timestamp ?? Date.now();

        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(iconFileId) || !Number.isFinite(iconIndex)) {
            continue;
        }

        if (!Number.isFinite(strikeTimeMs)) {
            continue;
        }

        const key = `${lat.toFixed(5)}|${lon.toFixed(5)}|${iconFileId}|${iconIndex}|${label}`;
        if (seen.has(key)) continue;
        seen.add(key);

        features.push({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [lon, lat]
            },
            properties: {
                label,
                iconFileId,
                iconIndex,
                strikeTimeMs
            }
        });
    }

    return {
        refreshSeconds,
        iconFiles: Object.fromEntries(iconFiles),
        strikes: {
            type: 'FeatureCollection',
            features
        }
    };
}

class LightningLayer {
    constructor(mapInstance) {
        this.map = mapInstance;
        this.data = null;
        this.syncPending = { main: false, dual: false };
        this.syncPendingSince = { main: 0, dual: 0 };

        // Listen for lightning settings changes
        this.settingsChangeListener = (event) => {
            const { key, value } = event.detail;
            if (key === 'lightningMarkerMode') {
                console.log(`[LightningLayer] Settings changed: ${key} = ${value}`);
                this._scheduleLightningSync('main');
                if (this.map?.isSplit()) {
                    this._scheduleLightningSync('dual');
                }
            }
        };
        document.addEventListener('settingsChanged', this.settingsChangeListener);
    }

    destroy() {
        document.removeEventListener('settingsChanged', this.settingsChangeListener);
    }

    _isLightningEnabled() {
        try {
            const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
            if (typeof settings.lightningEnabled === 'boolean') {
                return settings.lightningEnabled;
            }
        } catch {
        }

        const checkbox = document.getElementById('toggle-lightning-layer');
        return checkbox ? checkbox.checked : false;
    }

    _getLightningMarkerMode() {
        try {
            const settings = JSON.parse(localStorage.getItem('settings') || '{}');
            if (typeof settings.lightningMarkerMode === 'string') {
                return settings.lightningMarkerMode;
            }
        } catch {
        }
        return DEFAULT_LIGHTNING_MARKER_MODE;
    }

    _getSourceId(target) {
        return target === 'main' ? 'lightning-source' : 'lightning-source-dual';
    }

    _getLayerId(target) {
        return target === 'main' ? 'lightning-layer' : 'lightning-layer-dual';
    }

    _usesImageMarker() {
        return this._getLightningMarkerMode() === 'image';
    }

    _loadImageElement(url) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.decoding = 'async';
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error(`Failed to load marker image from ${url}`));
            image.src = url;
        });
    }

    _imageDataFromImageElement(imageElement) {
        const width = imageElement.naturalWidth || imageElement.width;
        const height = imageElement.naturalHeight || imageElement.height;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            throw new Error('Decoded marker image has invalid dimensions');
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageElement, 0, 0, width, height);
        return ctx.getImageData(0, 0, width, height);
    }

    async _ensureLightningMarkerImage(map) {
        if (!this._usesImageMarker()) return Promise.resolve(false);

        try {
            if (map.hasImage(LIGHTNING_MARKER_IMAGE_ID)) {
                return true;
            }
        } catch {
            return false;
        }

        const candidateUrls = [LIGHTNING_MARKER_IMAGE_URL, LIGHTNING_MARKER_IMAGE_ALT_URL, LIGHTNING_MARKER_IMAGE_FALLBACK_URL]
            .filter(Boolean)
            .filter((url, index, all) => all.indexOf(url) === index);

        for (const url of candidateUrls) {
            try {
                const imageElement = await this._loadImageElement(url);
                const imageData = this._imageDataFromImageElement(imageElement);
                if (!map.hasImage(LIGHTNING_MARKER_IMAGE_ID)) {
                    map.addImage(LIGHTNING_MARKER_IMAGE_ID, imageData, { pixelRatio: 1 });
                }
                return true;
            } catch (loadError) {
                console.warn(`[LightningLayer] Marker image load/decode failed for ${url}:`, loadError);
            }
        }

        return false;
    }

    async fetchLightning() {
        const now = Date.now();

        let lastError = null;
        for (let attempt = 1; attempt <= LIGHTNING_FETCH_RETRIES; attempt += 1) {
            try {
                const response = await fetch(LIGHTNING_CACHEFETCH_URL, {
                    headers: { Accept: 'text/plain, text/html;q=0.9, */*;q=0.8' },
                    signal: AbortSignal.timeout(LIGHTNING_FETCH_TIMEOUT_MS)
                });

                if (!response.ok) {
                    throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
                }

                const text = await response.text();
                const parsed = parsePlacefile(text);
                if (!parsed) {
                    throw new Error('Failed to parse lightning placefile text.');
                }

                this.data = parsed;
                return parsed;
            } catch (error) {
                lastError = error;
                if (attempt < LIGHTNING_FETCH_RETRIES) {
                    await wait(LIGHTNING_FETCH_RETRY_DELAY_MS * attempt);
                }
            }
        }

        console.error('[LightningLayer] Error fetching lightning data:', lastError);
        return this.data;
    }

    _scheduleLightningSync(target) {
        const map = target === 'main' ? this.map?.map : this.map?.dualMap;
        if (!map) return;

        if (hasUsableMapStyle(map)) {
            this.syncPending[target] = false;
            this.syncPendingSince[target] = 0;
            waitForRadarLayer(map, target).then(() => this._syncLightningToMap(target));
            return;
        }

        if (this.syncPending[target]) {
            const pendingAge = Date.now() - (this.syncPendingSince[target] || 0);
            if (pendingAge < SYNC_PENDING_STALE_MS) {
                return;
            }
            console.warn(`[LightningLayer] Resetting stale sync pending flag for ${target} (age=${pendingAge}ms)`);
            this.syncPending[target] = false;
        }
        this.syncPending[target] = true;
        this.syncPendingSince[target] = Date.now();

        waitForMapStyleReady(map).then(() => {
            this.syncPending[target] = false;
            this.syncPendingSince[target] = 0;
            waitForRadarLayer(map, target).then(() => this._syncLightningToMap(target));
        });
    }

    async _syncLightningToMap(target) {
        const map = target === 'main' ? this.map?.map : this.map?.dualMap;
        if (!map) return;

        const sourceId = this._getSourceId(target);
        const layerId = this._getLayerId(target);

        const now = Date.now();
        const maxAgeMs = DEFAULT_STRIKE_MAX_AGE_SECONDS * 1000;
        const features = (this.data?.strikes?.features || []).filter((feature) => {
            const strikeTimeMs = Number(feature?.properties?.strikeTimeMs);
            if (!Number.isFinite(strikeTimeMs)) return false;
            const ageMs = now - strikeTimeMs;
            return ageMs >= 0 && ageMs <= maxAgeMs;
        });
        if (!this._isLightningEnabled() || features.length === 0) {
            this.clearLightning(target);
            return;
        }

        const mapData = { type: 'FeatureCollection', features };
        const beforeLayerId = getWeatherOutlineBeforeLayerId(map, target);
        const canUseImageMarker = await this._ensureLightningMarkerImage(map);
        const markerStyle = canUseImageMarker ? 'image' : 'dot';

        if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
                type: 'geojson',
                data: mapData
            });
        } else {
            map.getSource(sourceId).setData(mapData);
        }

        const existingLayer = map.getLayer(layerId);
        if (existingLayer) {
            const existingIconImage = map.getLayoutProperty(layerId, 'icon-image');
            const existingTextField = map.getLayoutProperty(layerId, 'text-field');
            const isImageLayer = typeof existingIconImage === 'string' && existingIconImage === LIGHTNING_MARKER_IMAGE_ID;
            const isDotLayer = typeof existingTextField === 'string' && existingTextField.length > 0;

            if ((markerStyle === 'image' && !isImageLayer) || (markerStyle === 'dot' && !isDotLayer)) {
                map.removeLayer(layerId);
            }
        }

        if (!map.getLayer(layerId)) {
            if (markerStyle === 'image') {
                map.addLayer({
                    id: layerId,
                    type: 'symbol',
                    source: sourceId,
                    layout: {
                        'icon-image': LIGHTNING_MARKER_IMAGE_ID,
                        'icon-size': 1,
                        'icon-allow-overlap': false,
                        'icon-ignore-placement': false,
                        'icon-padding': 2
                    }
                }, beforeLayerId);
            } else {
                map.addLayer({
                    id: layerId,
                    type: 'symbol',
                    source: sourceId,
                    layout: {
                        'text-field': '•',
                        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                        'text-size': 16,
                        'text-allow-overlap': false,
                        'text-ignore-placement': false,
                        'text-padding': 2
                    },
                    paint: {
                        'text-color': '#facc15',
                        'text-halo-color': '#111827',
                        'text-halo-width': 1.3
                    }
                }, beforeLayerId);
            }
        }

        this.map?.layers?.applyLayerOrder(target);
    }

    displayLightningOnMap(target = 'main') {
        if (!this._isLightningEnabled() || !this.data?.strikes) {
            this.clearLightning(target);
            return;
        }

        this._scheduleLightningSync(target);
    }

    displayLightning() {
        this.displayLightningOnMap('main');
        if (this.map?.isSplit()) {
            this.displayLightningOnMap('dual');
        }
    }

    clearLightning(target = 'main') {
        const map = target === 'main' ? this.map?.map : this.map?.dualMap;
        if (!map) return;

        const sourceId = this._getSourceId(target);

        if (map.getSource(sourceId)) {
            map.getSource(sourceId).setData(EMPTY_FEATURE_COLLECTION);
        }
    }
}

export default LightningLayer;
