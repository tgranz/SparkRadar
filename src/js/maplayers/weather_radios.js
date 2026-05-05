import AppWindow from '../ui/window.js';
import { hasUsableMapStyle, waitForMapStyleReady, waitForRadarLayer, getWeatherOutlineBeforeLayerId } from './layer_utils.js';
import radioIconUrl from '../../../assets/radio.png';

const WEATHER_RADIO_STREAMS_URL = 'https://icestats.weatherradio.org/';
const WEATHER_RADIO_TRANSMITTERS_URL = 'https://transmitters.weatherradio.org/';
const WEATHER_RADIO_FETCH_TIMEOUT_MS = 20000;
const WEATHER_RADIO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const SYNC_PENDING_STALE_MS = 15000;
const WEATHER_RADIO_ICON_ID = 'weather-radio-icon';

const EMPTY_FEATURE_COLLECTION = {
    type: 'FeatureCollection',
    features: []
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toFiniteNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function normalizeCallsign(value) {
    return String(value || '').trim().toUpperCase();
}

function normalizeStatus(value) {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'NORMAL' || normalized === 'DEGRADED' || normalized === 'OUT OF SERVICE') {
        return normalized;
    }
    return 'UNKNOWN';
}

function statusColor(status) {
    switch (normalizeStatus(status)) {
        case 'NORMAL':
            return '#22c55e';
        case 'DEGRADED':
            return '#f59e0b';
        case 'OUT OF SERVICE':
            return '#ef4444';
        default:
            return '#9ca3af';
    }
}

function callsignPatternMatches(value) {
    return /^[A-Z]{3}\d{2,3}$/.test(value) || /^[KW][A-Z0-9]{2,6}$/.test(value);
}

function extractCallsignFromStream(stream) {
    const listenurl = String(stream?.listenurl || '').trim();
    if (listenurl) {
        const parts = listenurl.split('/').filter(Boolean);
        const last = normalizeCallsign(parts[parts.length - 1]);
        if (callsignPatternMatches(last)) {
            return last;
        }
    }

    const serverName = String(stream?.server_name || '').toUpperCase();
    const directMatch = serverName.match(/\b([A-Z]{3}\d{2,3})\b/);
    if (directMatch?.[1]) {
        return normalizeCallsign(directMatch[1]);
    }

    const genericMatch = serverName.match(/\b([KW][A-Z0-9]{2,6})\b/);
    if (genericMatch?.[1]) {
        return normalizeCallsign(genericMatch[1]);
    }

    return '';
}

async function loadImageData(url, size = 24) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load icon: ${url}`));
        img.src = url;
    });

    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(image, 0, 0, size, size);

    return ctx.getImageData(0, 0, size, size);
}

class WeatherRadiosLayer {
    constructor(mapInstance) {
        this.map = mapInstance;
        this.data = EMPTY_FEATURE_COLLECTION;
        this.syncPending = { main: false, dual: false };
        this.syncPendingSince = { main: 0, dual: 0 };

        this.clickHandlers = { main: null, dual: null };
        this.mouseEnterHandlers = { main: null, dual: null };
        this.mouseLeaveHandlers = { main: null, dual: null };

        this.refreshTimer = setInterval(() => {
            if (!this._isEnabled()) return;
            this.fetchWeatherRadios();
        }, WEATHER_RADIO_REFRESH_INTERVAL_MS);
    }

    _isEnabled() {
        try {
            const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
            if (typeof settings.weatherRadiosEnabled === 'boolean') {
                return settings.weatherRadiosEnabled;
            }
        } catch {}

        const checkbox = document.getElementById('toggle-weather-radios-layer');
        return checkbox ? checkbox.checked : false;
    }

    _getMap(target) {
        return target === 'main' ? this.map?.map : this.map?.dualMap;
    }

    _getSourceId(target) {
        return target === 'main' ? 'weather-radio-source' : 'weather-radio-source-dual';
    }

    _getLayerId(target) {
        return target === 'main' ? 'weather-radio-layer' : 'weather-radio-layer-dual';
    }

    async _fetchJson(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), WEATHER_RADIO_FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    Accept: 'application/json, text/plain;q=0.9, */*;q=0.8'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }
            return await response.json();
        } finally {
            clearTimeout(timeoutId);
        }
    }

    _buildStreamMap(streamList) {
        const streamByCallsign = new Map();
        for (const stream of streamList) {
            const callsign = extractCallsignFromStream(stream);
            if (!callsign) continue;
            streamByCallsign.set(callsign, {
                listenurl: String(stream?.listenurl || '').trim(),
                serverName: String(stream?.server_name || '').trim(),
                description: String(stream?.server_description || '').trim(),
                listeners: Number(stream?.listeners) || 0,
                listenerPeak: Number(stream?.listener_peak) || 0,
            });
        }
        return streamByCallsign;
    }

    _normalizeFeature(callsign, transmitter, streamByCallsign) {
        const lat = toFiniteNumber(transmitter?.LAT);
        const lon = toFiniteNumber(transmitter?.LON);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

        const normalizedCallsign = normalizeCallsign(callsign || transmitter?.CALLSIGN || '');
        if (!normalizedCallsign) return null;

        const status = normalizeStatus(transmitter?.STATUS);
        const stream = streamByCallsign.get(normalizedCallsign);
        const streamUrl = String(stream?.listenurl || '').trim();
        if (!streamUrl) return null;

        return {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [lon, lat]
            },
            properties: {
                callsign: normalizedCallsign,
                status,
                state: String(transmitter?.STATE || transmitter?.SITESTATE || '').trim(),
                county: Array.isArray(transmitter?.COUNTY) ? transmitter.COUNTY.join(', ') : String(transmitter?.COUNTY || '').trim(),
                siteName: String(transmitter?.SITENAME || '').trim(),
                siteLocation: String(transmitter?.SITELOC || '').trim(),
                frequency: String(transmitter?.FREQ || '').trim(),
                power: String(transmitter?.PWR || '').trim(),
                wfo: String(transmitter?.WFO || '').trim(),
                remarks: String(transmitter?.REMARKS || '').trim(),
                streamUrl,
                streamName: String(stream?.serverName || '').trim(),
                streamDescription: String(stream?.description || '').trim(),
                listeners: Number(stream?.listeners) || 0,
                listenerPeak: Number(stream?.listenerPeak) || 0,
                markerColor: statusColor(status)
            }
        };
    }

    _buildWindowHtml(properties) {
        const callsign = escapeHtml(properties?.callsign || 'Unknown');
        const siteName = escapeHtml(properties?.siteName || 'Unknown Site');
        const siteLocation = escapeHtml(properties?.siteLocation || 'Unknown');
        const state = escapeHtml(properties?.state || 'Unknown');
        const county = escapeHtml(properties?.county || 'Unknown');
        const status = escapeHtml(properties?.status || 'UNKNOWN');
        const statusHex = escapeHtml(statusColor(properties?.status));
        const frequency = escapeHtml(properties?.frequency || 'N/A');
        const power = escapeHtml(properties?.power || 'N/A');
        const wfo = escapeHtml(properties?.wfo || 'N/A');
        const remarks = escapeHtml(properties?.remarks || 'N/A');
        const streamUrl = String(properties?.streamUrl || '').trim();
        const streamName = escapeHtml(properties?.streamName || 'Weather Radio Stream');
        const streamDescription = escapeHtml(properties?.streamDescription || '');
        const listeners = Number.isFinite(Number(properties?.listeners)) ? Number(properties.listeners) : 0;

        return `
            <div style="display: flex; flex-direction: column; gap: 12px; padding: 10px; max-width: calc(100% - 20px);">

                <div style="display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; font-size: 0.9em; color: #d1d5db;">
                    <strong>Location</strong><span>${siteLocation}, ${state}</span>
                    <strong>Frequency</strong><span>${frequency} MHz</span>
                </div>

                <div style="display: flex; flex-direction: row; justify-content: space-between; gap: 10px; padding: 10px; border: 1px solid rgba(255,255,255,0.14); border-radius: 10px; background: rgba(255,255,255,0.04);">
                    <div style="display: flex; flex-direction: column; gap: 3px;">
                        <div style="display: inline-flex; align-items: center; gap: 8px; font-size: 0.9em; color: #e5e7eb;">
                            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 999px; background: ${statusHex};"></span>
                            <div style="font-weight: 600; color: #ffffff;">${streamName}</div>
                        </div>
                        <div style="font-size: 0.85em; color: #d1d5db;">${streamDescription || 'Live NOAA Weather Radio stream'}</div>
                    </div>
                    <audio data-weather-radio-audio="1" preload="none" style="display: none;" src="${escapeHtml(streamUrl)}"></audio>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button data-weather-radio-toggle="1" style="padding: 6px 10px; border-radius: 8px; background: rgba(34,197,94,0.2); color: #fff;">
                            <i class="ti ti-play"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    _showStationWindow(feature) {
        const properties = feature?.properties || {};
        const title = `${properties?.callsign || 'Unknown'} Weather Radio`;
        const html = this._buildWindowHtml(properties);
        const stationCallsign = String(properties?.callsign || 'Weather Radio').trim() || 'Weather Radio';
        const stationName = String(properties?.streamName || 'NOAA Weather Radio').trim() || 'NOAA Weather Radio';

        const stationWindow = new AppWindow({
            title,
            icon: 'radio',
            width: 500,
            height: 200,
            html
        });

        const content = stationWindow?.content;
        const audio = content?.querySelector('[data-weather-radio-audio="1"]');
        const toggleButton = content?.querySelector('[data-weather-radio-toggle="1"]');

        const setMediaSessionMetadata = () => {
            if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
            if (typeof MediaMetadata !== 'function') return;

            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: stationCallsign,
                    artist: stationName,
                    album: 'NOAA Weather Radio'
                });
            } catch {}
        };

        const setMediaSessionPlaybackState = (state) => {
            if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
            try {
                navigator.mediaSession.playbackState = state;
            } catch {}
        };

        const syncToggleButton = () => {
            if (!audio || !toggleButton) return;
            const isPlaying = !audio.paused && !audio.ended;
            toggleButton.innerHTML = isPlaying
                ? '<i class="ti ti-player-stop"></i>'
                : '<i class="ti ti-player-play"></i>';
            toggleButton.style.background = isPlaying
            ? 'rgba(239,68,68,0.2)'
            : 'rgba(34,197,94,0.2)';
        };

        if (audio && toggleButton) {
            toggleButton.addEventListener('click', () => {
                if (audio.paused || audio.ended) {
                    setMediaSessionMetadata();
                    audio.play().catch(() => {});
                    return;
                }

                audio.pause();
                try {
                    audio.currentTime = 0;
                } catch {
                    audio.load();
                }
            });

            audio.addEventListener('play', syncToggleButton);
            audio.addEventListener('pause', syncToggleButton);
            audio.addEventListener('ended', syncToggleButton);

            audio.addEventListener('play', () => {
                setMediaSessionMetadata();
                setMediaSessionPlaybackState('playing');
            });
            audio.addEventListener('pause', () => {
                setMediaSessionPlaybackState('paused');
            });
            audio.addEventListener('ended', () => {
                setMediaSessionPlaybackState('none');
            });

            syncToggleButton();
        }
    }

    _ensureLayerHandlers(target) {
        const map = this._getMap(target);
        if (!map) return;

        const layerId = this._getLayerId(target);

        if (!this.clickHandlers[target]) {
            this.clickHandlers[target] = (event) => {
                if (event.stopPropagation) event.stopPropagation();
                event.originalEvent?.stopPropagation?.();
                event.originalEvent?.preventDefault?.();

                const feature = event.features?.[0];
                if (!feature) return;
                this._showStationWindow(feature);
            };
        }

        if (!this.mouseEnterHandlers[target]) {
            this.mouseEnterHandlers[target] = () => {
                map.getCanvas().style.cursor = 'pointer';
                if (this.map?.layers) {
                    this.map.layers.weatherRadioHovered = true;
                }
            };
        }

        if (!this.mouseLeaveHandlers[target]) {
            this.mouseLeaveHandlers[target] = () => {
                map.getCanvas().style.cursor = '';
                if (this.map?.layers) {
                    this.map.layers.weatherRadioHovered = false;
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

    async _ensureMarkerImages(map) {
        try {
            if (map.hasImage(WEATHER_RADIO_ICON_ID)) return true;

            const imageData = await loadImageData(radioIconUrl, 24);
            if (!imageData) return false;

            map.addImage(WEATHER_RADIO_ICON_ID, imageData, { pixelRatio: 1 });
            return true;
        } catch (error) {
            console.error('[WeatherRadiosLayer] Failed to load marker icon:', error);
            return false;
        }
    }

    async _syncToMap(target) {
        const map = this._getMap(target);
        if (!map) return;

        const sourceId = this._getSourceId(target);
        const layerId = this._getLayerId(target);

        const featureCount = this.data?.features?.length || 0;
        if (!this._isEnabled() || featureCount === 0) {
            this.clearWeatherRadios(target);
            return;
        }

        const markerReady = await this._ensureMarkerImages(map);
        if (!markerReady) {
            this.clearWeatherRadios(target);
            return;
        }

        if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
                type: 'geojson',
                data: this.data
            });
        } else {
            map.getSource(sourceId).setData(this.data);
        }

        const beforeLayerId = getWeatherOutlineBeforeLayerId(map, target);
        if (!map.getLayer(layerId)) {
            map.addLayer({
                id: layerId,
                type: 'symbol',
                source: sourceId,
                layout: {
                    'icon-image': WEATHER_RADIO_ICON_ID,
                    'icon-size': 1,
                    'icon-anchor': 'center',
                    'icon-allow-overlap': false,
                    'icon-ignore-placement': false,
                    'icon-padding': 3
                }
            }, beforeLayerId);
        }

        this._ensureLayerHandlers(target);
        this.map?.layers?.applyLayerOrder(target);
    }

    async fetchWeatherRadios() {
        try {
            const [streamsPayload, transmittersPayload] = await Promise.all([
                this._fetchJson(WEATHER_RADIO_STREAMS_URL),
                this._fetchJson(WEATHER_RADIO_TRANSMITTERS_URL)
            ]);

            const streamList = Array.isArray(streamsPayload?.icestats?.source)
                ? streamsPayload.icestats.source
                : [];
            const streamByCallsign = this._buildStreamMap(streamList);

            const transmitterMap = transmittersPayload?.transmitters && typeof transmittersPayload.transmitters === 'object'
                ? transmittersPayload.transmitters
                : {};

            const features = Object.entries(transmitterMap)
                .map(([callsign, transmitter]) => this._normalizeFeature(callsign, transmitter, streamByCallsign))
                .filter(Boolean);

            this.data = {
                type: 'FeatureCollection',
                features
            };

            return this.data;
        } catch (error) {
            console.error('[WeatherRadiosLayer] Error fetching weather radio data:', error);
            return this.data;
        }
    }

    getWeatherRadios() {
        return this.data;
    }

    displayWeatherRadiosOnMap(target = 'main') {
        if (!this._isEnabled() || !this.data?.features?.length) {
            this.clearWeatherRadios(target);
            return;
        }

        this._scheduleSync(target);
    }

    displayWeatherRadios() {
        this.displayWeatherRadiosOnMap('main');
        if (this.map?.isSplit()) {
            this.displayWeatherRadiosOnMap('dual');
        }
    }

    clearWeatherRadios(target = 'main') {
        const map = this._getMap(target);
        if (!map) return;

        const sourceId = this._getSourceId(target);
        if (map.getSource(sourceId)) {
            map.getSource(sourceId).setData(EMPTY_FEATURE_COLLECTION);
        }

        map.getCanvas().style.cursor = '';
        if (this.map?.layers) {
            this.map.layers.weatherRadioHovered = false;
        }
    }
}

export default WeatherRadiosLayer;
