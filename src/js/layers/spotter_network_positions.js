import Popup from '../ui/popup.js';
import { hasUsableMapStyle, waitForMapStyleReady, waitForRadarLayer, getWeatherOutlineBeforeLayerId } from './layer_utils.js';

const EMPTY_FEATURE_COLLECTION = {
    type: 'FeatureCollection',
    features: []
};

const SYNC_PENDING_STALE_MS = 15000;

const SPOTTER_NETWORK_FEED_URL = 'https://www.spotternetwork.org/feeds/stormlab.txt';
const SPOTTER_NETWORK_CACHEFETCH_URL = `https://cachefetch.sparkradar.app/cache?format=txt&maxAge=30&url=${encodeURIComponent(SPOTTER_NETWORK_FEED_URL)}`;
const SPOTTER_NETWORK_FETCH_TIMEOUT_MS = 15000;
const SPOTTER_NETWORK_FETCH_RETRIES = 3;
const SPOTTER_NETWORK_FETCH_RETRY_DELAY_MS = 600;
const SPOTTER_NETWORK_CACHE_KEY = 'spotterNetworkPositionsCache';
const SPOTTER_NETWORK_IMAGE_ID = 'spotter-network-position-marker';
const SPOTTER_NETWORK_MARKER_URL = new URL('../../../assets/spotterpositionmarker.png', import.meta.url).href;

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function extractQuotedValue(rawLine, label) {
    const regex = new RegExp(`^\\s*${label}:\\s*\"([\\s\\S]*)\"\\s*$`);
    const match = rawLine.match(regex);
    return match ? match[1] : null;
}

function decodeSampleText(value) {
    if (!value) return '';
    return value
        .replace(/\\r/g, '')
        .replace(/\\n/g, '\n')
        .replace(/\\\"/g, '"')
        .trim();
}

function parseObjectBlock(lines, startIndex) {
    const properties = {
        name: null,
        title: null,
        details: ''
    };
    let lat = null;
    let lon = null;
    let endIndex = startIndex;

    for (let i = startIndex + 1; i < lines.length; i += 1) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed === 'End:') {
            endIndex = i;
            break;
        }

        if (trimmed.startsWith('Lat/Lon:')) {
            const pair = trimmed.slice('Lat/Lon:'.length).trim();
            const [latToken, lonToken] = pair.split(',');
            lat = Number(latToken);
            lon = Number(lonToken);
            continue;
        }

        if (trimmed.startsWith('Text:')) {
            const textMatch = trimmed.match(/^Text:\s*"([\s\S]*?)"(?:,.*)?$/);
            if (textMatch) {
                properties.name = textMatch[1].trim();
            }
            continue;
        }

        if (trimmed.startsWith('Sample:')) {
            let sampleLine = trimmed;
            let sampleValue = extractQuotedValue(sampleLine, 'Sample');

            if (sampleValue === null) {
                for (let j = i + 1; j < lines.length; j += 1) {
                    sampleLine += `\n${lines[j]}`;
                    sampleValue = extractQuotedValue(sampleLine.trim(), 'Sample');
                    if (sampleValue !== null) {
                        i = j;
                        break;
                    }
                    if (lines[j].trim().startsWith('Name:')) {
                        properties.name = lines[j].trim().slice('Name:'.length).trim();
                    }
                    if (lines[j].trim() === 'End:') {
                        break;
                    }
                }
            }

            properties.details = decodeSampleText(sampleValue);
        }
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return { feature: null, endIndex };
    }

    return {
        endIndex,
        feature: {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [lon, lat]
            },
            properties
        }
    };
}

function parseFeedToGeoJson(text) {
    if (typeof text !== 'string' || text.trim().length === 0) {
        return EMPTY_FEATURE_COLLECTION;
    }

    const lines = text.split(/\r?\n/);
    const features = [];
    const seen = new Set();

    for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].trim() !== 'Object:') continue;

        const { feature, endIndex } = parseObjectBlock(lines, i);
        if (feature?.geometry?.coordinates) {
            const [lon, lat] = feature.geometry.coordinates;
            const name = (feature.properties?.name || '').toLowerCase();
            const dedupeKey = `${lat.toFixed(5)}|${lon.toFixed(5)}|${name}`;
            if (!seen.has(dedupeKey)) {
                seen.add(dedupeKey);
                features.push(feature);
            }
        }

        i = Math.max(i, endIndex);
    }

    return {
        type: 'FeatureCollection',
        features
    };
}

function loadCachedSpotterPositions() {
    try {
        const raw = localStorage.getItem(SPOTTER_NETWORK_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (!Number.isFinite(parsed.timestamp)) return null;
        if (!parsed.data || !Array.isArray(parsed.data.features)) return null;
        return parsed;
    } catch {
        return null;
    }
}

function saveCachedSpotterPositions(data) {
    if (!data || !Array.isArray(data.features)) return;
    try {
        localStorage.setItem(SPOTTER_NETWORK_CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data
        }));
    } catch {}
}

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

function parsePositionTimeFromDetails(details) {
    if (typeof details !== 'string' || details.length === 0) return null;

    const match = details.match(/(?:^|\n)Position Time:\s*([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2})\s+UTC(?:\n|$)/i);
    if (!match) return null;

    const monthToken = `${match[1][0].toUpperCase()}${match[1].slice(1, 3).toLowerCase()}`;
    const monthIndex = MONTH_INDEX[monthToken];
    const day = Number(match[2]);
    const hour = Number(match[3]);
    const minute = Number(match[4]);

    if (!Number.isFinite(monthIndex) || !Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(minute)) {
        return null;
    }

    const now = new Date();
    let year = now.getUTCFullYear();
    let timestamp = Date.UTC(year, monthIndex, day, hour, minute, 0);

    const fortyDaysMs = 40 * 24 * 60 * 60 * 1000;
    if (timestamp - now.getTime() > fortyDaysMs) {
        year -= 1;
        timestamp = Date.UTC(year, monthIndex, day, hour, minute, 0);
    }

    return new Date(timestamp);
}

function formatRelativeTime(dateValue) {
    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) return null;

    const diffMs = Date.now() - dateValue.getTime();
    const absMs = Math.abs(diffMs);
    const inPast = diffMs >= 0;

    if (absMs < 60 * 1000) return inPast ? 'just now' : 'in <1m';

    const minutes = Math.round(absMs / (60 * 1000));
    if (minutes < 60) return inPast ? `${minutes}m ago` : `in ${minutes}m`;

    const hours = Math.round(absMs / (60 * 60 * 1000));
    if (hours < 24) return inPast ? `${hours}h ago` : `in ${hours}h`;

    const days = Math.round(absMs / (24 * 60 * 60 * 1000));
    return inPast ? `${days}d ago` : `in ${days}d`;
}

class SpotterNetworkPositionsLayer {
    constructor(mapInstance) {
        this.map = mapInstance;
        this.positions = EMPTY_FEATURE_COLLECTION;
        this.syncPending = { main: false, dual: false };
        this.syncPendingSince = { main: 0, dual: 0 };
        this.popups = { main: null, dual: null };
        this.popupMoveHandlers = { main: null, dual: null };

        this.clickHandlers = { main: null, dual: null };
        this.mouseEnterHandlers = { main: null, dual: null };
        this.mouseLeaveHandlers = { main: null, dual: null };
    }

    _isEnabled() {
        try {
            const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
            if (typeof settings.spotterNetworkPositionsEnabled === 'boolean') {
                return settings.spotterNetworkPositionsEnabled;
            }
        } catch {}

        const checkbox = document.getElementById('toggle-spotter-network-positions-layer');
        return checkbox ? checkbox.checked : false;
    }

    _getSourceId(target) {
        return target === 'main' ? 'spotter-network-position-source' : 'spotter-network-position-source-dual';
    }

    _getLayerId(target) {
        return target === 'main' ? 'spotter-network-position-layer' : 'spotter-network-position-layer-dual';
    }

    _getMap(target) {
        return target === 'main' ? this.map?.map : this.map?.dualMap;
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

    async _ensureMarkerImage(map) {
        try {
            if (map.hasImage(SPOTTER_NETWORK_IMAGE_ID)) return true;
        } catch {
            return false;
        }

        try {
            const imageElement = await this._loadImageElement(SPOTTER_NETWORK_MARKER_URL);
            const imageData = this._imageDataFromImageElement(imageElement);
            if (!map.hasImage(SPOTTER_NETWORK_IMAGE_ID)) {
                map.addImage(SPOTTER_NETWORK_IMAGE_ID, imageData, { pixelRatio: 1 });
            }
            return true;
        } catch (error) {
            console.error('[SpotterNetworkPositionsLayer] Failed to load marker icon:', error);
            return false;
        }
    }

    _buildPopupHtml(properties) {
        const name = escapeHtml(properties?.name || 'Spotter');
        const details = String(properties?.details || '').trim();
        const positionTime = parsePositionTimeFromDetails(details);
        const relativePositionTime = formatRelativeTime(positionTime);
        const relativeTimeHtml = relativePositionTime
            ? `<p style="font-size: 1em; color: lightgray; text-align: center;">${escapeHtml(relativePositionTime)}</p>`
            : '';

        const detailsHtml = details
            ? `<pre style="margin: 8px 0 0 0; white-space: pre-wrap; font-family: inherit; font-size: 0.85rem; line-height: 1.35;">${escapeHtml(details)}</pre>`
            : '<p style="margin: 8px 0 0 0; font-size: 0.85rem; opacity: 0.85;">No additional details provided.</p>';

        return `
            <div style="max-width: 300px; min-width: 220px;">
                <div style="position: relative; padding-right: 4px;">
                    <h3 style="margin: 0 0 6px 0; font-size: 1rem;"> Spotter ${name}</h3>
                    ${relativeTimeHtml}
                </div>
                ${detailsHtml}
            </div>
        `;
    }

    _closePopup(target) {
        const map = this._getMap(target);
        const popup = this.popups[target];
        if (popup) {
            popup.removeFromMap();
            this.popups[target] = null;
        }

        const moveHandler = this.popupMoveHandlers[target];
        if (map && moveHandler) {
            map.off('move', moveHandler);
            map.off('resize', moveHandler);
            this.popupMoveHandlers[target] = null;
        }
    }

    _showPopup(target, coordinates, properties) {
        const map = this._getMap(target);
        if (!map) return;

        this._closePopup(target);

        const popup = new Popup(this._buildPopupHtml(properties));
        popup.addToMap(map);
        popup.setLngLat({ lng: coordinates[0], lat: coordinates[1] });

        const moveHandler = () => {
            if (this.popups[target] === popup) {
                popup.setLngLat({ lng: coordinates[0], lat: coordinates[1] });
            }
        };

        map.on('move', moveHandler);
        map.on('resize', moveHandler);

        this.popups[target] = popup;
        this.popupMoveHandlers[target] = moveHandler;
    }

    _ensureLayerHandlers(target) {
        const map = this._getMap(target);
        if (!map) return;

        const layerId = this._getLayerId(target);

        if (!this.clickHandlers[target]) {
            this.clickHandlers[target] = (event) => {
                if (event.stopPropagation) {
                    event.stopPropagation();
                }
                event.originalEvent?.stopPropagation?.();
                event.originalEvent?.preventDefault?.();

                if (this.map?.layers) {
                    this.map.layers.spotterNetworkPositionHovered = true;
                }

                const feature = event.features?.[0];
                const coordinates = feature?.geometry?.coordinates;
                if (!Array.isArray(coordinates) || coordinates.length < 2) return;

                this._showPopup(target, coordinates, feature.properties || {});
            };
        }

        if (!this.mouseEnterHandlers[target]) {
            this.mouseEnterHandlers[target] = () => {
                map.getCanvas().style.cursor = 'pointer';
                if (this.map?.layers) {
                    this.map.layers.spotterNetworkPositionHovered = true;
                }
            };
        }

        if (!this.mouseLeaveHandlers[target]) {
            this.mouseLeaveHandlers[target] = () => {
                map.getCanvas().style.cursor = '';
                if (this.map?.layers) {
                    this.map.layers.spotterNetworkPositionHovered = false;
                }
            };
        }

        map.off('click', layerId, this.clickHandlers[target]);
        map.off('mouseenter', layerId, this.mouseEnterHandlers[target]);
        map.off('mouseleave', layerId, this.mouseLeaveHandlers[target]);

        map.on('click', layerId, this.clickHandlers[target]);
        map.on('mouseenter', layerId, this.mouseEnterHandlers[target]);
        map.on('mouseleave', layerId, this.mouseLeaveHandlers[target]);
    }

    _scheduleSync(target) {
        const map = this._getMap(target);
        if (!map) return;

        if (hasUsableMapStyle(map)) {
            this.syncPending[target] = false;
            this.syncPendingSince[target] = 0;
            waitForRadarLayer(map, target).then(() => this._syncToMap(target));
            return;
        }

        if (this.syncPending[target]) {
            const pendingAge = Date.now() - (this.syncPendingSince[target] || 0);
            if (pendingAge < SYNC_PENDING_STALE_MS) {
                return;
            }
            this.syncPending[target] = false;
        }

        this.syncPending[target] = true;
        this.syncPendingSince[target] = Date.now();

        waitForMapStyleReady(map).then(() => {
            this.syncPending[target] = false;
            this.syncPendingSince[target] = 0;
            waitForRadarLayer(map, target).then(() => this._syncToMap(target));
        });
    }

    async _syncToMap(target) {
        const map = this._getMap(target);
        if (!map) return;

        const sourceId = this._getSourceId(target);
        const layerId = this._getLayerId(target);

        const featureCount = this.positions?.features?.length || 0;
        if (!this._isEnabled() || featureCount === 0) {
            this.clearSpotterNetworkPositions(target);
            return;
        }

        const markerReady = await this._ensureMarkerImage(map);
        if (!markerReady) {
            this.clearSpotterNetworkPositions(target);
            return;
        }

        if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
                type: 'geojson',
                data: this.positions
            });
        } else {
            map.getSource(sourceId).setData(this.positions);
        }

        const beforeLayerId = getWeatherOutlineBeforeLayerId(map, target);
        if (!map.getLayer(layerId)) {
            map.addLayer({
                id: layerId,
                type: 'symbol',
                source: sourceId,
                layout: {
                    'icon-image': SPOTTER_NETWORK_IMAGE_ID,
                    'icon-size': 0.2,
                    'icon-anchor': 'center',
                    'icon-allow-overlap': false,
                    'icon-ignore-placement': false,
                    'icon-padding': 2
                }
            }, beforeLayerId);
        }

        this._ensureLayerHandlers(target);
        this.map?.layers?.applyLayerOrder(target);
    }

    async fetchSpotterNetworkPositions() {
        const cached = loadCachedSpotterPositions();
        if (cached?.data) {
            this.positions = cached.data;
        }

        const urls = [SPOTTER_NETWORK_FEED_URL, SPOTTER_NETWORK_CACHEFETCH_URL];
        let lastError = null;

        for (let attempt = 1; attempt <= SPOTTER_NETWORK_FETCH_RETRIES; attempt += 1) {
            for (const url of urls) {
                try {
                    const response = await fetch(url, {
                        headers: { Accept: 'text/plain, text/html;q=0.9, */*;q=0.8' },
                        signal: AbortSignal.timeout(SPOTTER_NETWORK_FETCH_TIMEOUT_MS)
                    });

                    if (!response.ok) {
                        throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
                    }

                    const text = await response.text();
                    const parsed = parseFeedToGeoJson(text);
                    if (!parsed || !Array.isArray(parsed.features)) {
                        throw new Error('Failed to parse Spotter Network feed');
                    }

                    this.positions = parsed;
                    saveCachedSpotterPositions(parsed);
                    return parsed;
                } catch (error) {
                    lastError = error;
                }
            }

            if (attempt < SPOTTER_NETWORK_FETCH_RETRIES) {
                await wait(SPOTTER_NETWORK_FETCH_RETRY_DELAY_MS * attempt);
            }
        }

        console.error('[SpotterNetworkPositionsLayer] Error fetching Spotter Network positions:', lastError);
        return this.positions;
    }

    getSpotterNetworkPositions() {
        return this.positions;
    }

    displaySpotterNetworkPositionsOnMap(target = 'main') {
        if (!this._isEnabled() || !this.positions?.features?.length) {
            this.clearSpotterNetworkPositions(target);
            return;
        }

        this._scheduleSync(target);
    }

    displaySpotterNetworkPositions() {
        this.displaySpotterNetworkPositionsOnMap('main');
        if (this.map?.isSplit()) {
            this.displaySpotterNetworkPositionsOnMap('dual');
        }
    }

    clearSpotterNetworkPositions(target = 'main') {
        const map = this._getMap(target);
        if (!map) return;

        const sourceId = this._getSourceId(target);
        if (map.getSource(sourceId)) {
            map.getSource(sourceId).setData(EMPTY_FEATURE_COLLECTION);
        }

        this._closePopup(target);
    }
}

export default SpotterNetworkPositionsLayer;
