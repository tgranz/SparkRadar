import Dialog from '../ui/dialog.js';
import { hasUsableMapStyle, waitForMapStyleReady, waitForRadarLayer, getWeatherOutlineBeforeLayerId } from './layer_utils.js';

const EMPTY_FEATURE_COLLECTION = {
    type: 'FeatureCollection',
    features: []
};

const SYNC_PENDING_STALE_MS = 15000;
const METAR_FETCH_TIMEOUT_MS = 15000;
const METAR_OBS_MAX_AGE_MS = 60 * 60 * 1000;
const METAR_IMAGE_ID = 'metar-temp-dot';
const METAR_SOURCE_URL = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/NOAA_METAR_current_wind_speed_direction_v1/FeatureServer/0/query?where=1=1&outFields=*&f=geojson';
const METAR_CACHEFETCH_URL = `https://cachefetch.sparkradar.app/cache?maxAge=300&url=${encodeURIComponent(METAR_SOURCE_URL)}`;

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

function formatNumber(value, digits = 0, fallback = 'N/A') {
    if (!Number.isFinite(value)) return fallback;
    return value.toFixed(digits);
}

function getObsTimestampMs(properties) {
    const raw = properties?.OBS_DATETIME ?? properties?.DATETIME;
    const ts = Number(raw);
    return Number.isFinite(ts) ? ts : null;
}

function parseHexColor(hex) {
    const clean = String(hex || '').replace('#', '');
    if (clean.length !== 6) return [255, 255, 255];
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
        return [255, 255, 255];
    }
    return [r, g, b];
}

function getTempColorHex(tempF) {
    if (!Number.isFinite(tempF)) return '#9ca3af';
    if (tempF <= 0) return '#1d4ed8';
    if (tempF <= 20) return '#2563eb';
    if (tempF <= 32) return '#3b82f6';
    if (tempF <= 45) return '#06b6d4';
    if (tempF <= 60) return '#22c55e';
    if (tempF <= 75) return '#eab308';
    if (tempF <= 90) return '#f97316';
    return '#ef4444';
}

function getTempTextColorHex(tempF) {
    const [r, g, b] = parseHexColor(getTempColorHex(tempF));
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 150 ? '#111111' : '#ffffff';
}

function createMarkerImageData(size = 42) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const center = size / 2;
    const radius = Math.floor(size / 2) - 2;

    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    return ctx.getImageData(0, 0, size, size);
}

class MetarStationsLayer {
    constructor(mapInstance) {
        this.map = mapInstance;
        this.data = EMPTY_FEATURE_COLLECTION;
        this.syncPending = { main: false, dual: false };
        this.syncPendingSince = { main: 0, dual: 0 };

        this.clickHandlers = { main: null, dual: null };
        this.mouseEnterHandlers = { main: null, dual: null };
        this.mouseLeaveHandlers = { main: null, dual: null };
    }

    _isEnabled() {
        try {
            const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
            if (typeof settings.metarStationsEnabled === 'boolean') {
                return settings.metarStationsEnabled;
            }
        } catch {}

        const checkbox = document.getElementById('toggle-metars-layer');
        return checkbox ? checkbox.checked : false;
    }

    _getMap(target) {
        return target === 'main' ? this.map?.map : this.map?.dualMap;
    }

    _getSourceId(target) {
        return target === 'main' ? 'metar-station-source' : 'metar-station-source-dual';
    }

    _getLayerId(target) {
        return target === 'main' ? 'metar-station-layer' : 'metar-station-layer-dual';
    }

    _isRecentObservation(properties) {
        const obsTs = getObsTimestampMs(properties);
        if (!Number.isFinite(obsTs)) return false;

        const ageMs = Date.now() - obsTs;
        return ageMs >= 0 && ageMs <= METAR_OBS_MAX_AGE_MS;
    }

    _normalizeFeature(feature) {
        const coords = feature?.geometry?.coordinates;
        const properties = feature?.properties || {};
        if (!Array.isArray(coords) || coords.length < 2) return null;

        const tempF = toFiniteNumber(properties.TEMP);
        if (!Number.isFinite(tempF)) return null;
        if (!this._isRecentObservation(properties)) return null;

        const windDirection = toFiniteNumber(properties.WIND_DIRECT);
        const windSpeed = toFiniteNumber(properties.WIND_SPEED);
        const windGust = toFiniteNumber(properties.WIND_GUST);
        const dewPoint = toFiniteNumber(properties.DEW_POINT);
        const humidity = toFiniteNumber(properties.R_HUMIDITY);
        const pressure = toFiniteNumber(properties.PRESSURE);
        const obsTs = getObsTimestampMs(properties);

        return {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [coords[0], coords[1]]
            },
            properties: {
                ICAO: String(properties.ICAO || ''),
                STATION_NAME: String(properties.STATION_NAME || ''),
                COUNTRY: String(properties.COUNTRY || ''),
                TEMP: tempF,
                DEW_POINT: dewPoint,
                R_HUMIDITY: humidity,
                WIND_DIRECT: windDirection,
                WIND_SPEED: windSpeed,
                WIND_GUST: windGust,
                PRESSURE: pressure,
                WEATHER: String(properties.WEATHER || ''),
                FLT_CATEGORY: String(properties.FLT_CATEGORY || ''),
                OBS_DATETIME: obsTs,
                tempLabel: `${Math.round(tempF)}°`,
                tempColor: getTempColorHex(tempF),
                tempTextColor: getTempTextColorHex(tempF)
            }
        };
    }

    _buildDialogHtml(properties) {
        const station = escapeHtml(properties?.STATION_NAME || properties?.ICAO || 'Unknown Station');
        const icao = escapeHtml(properties?.ICAO || 'N/A');
        const country = escapeHtml(properties?.COUNTRY || '');
        const weather = escapeHtml(properties?.WEATHER || 'No weather details');
        const flightCategory = escapeHtml(properties?.FLT_CATEGORY || 'N/A');

        const obsDate = Number.isFinite(properties?.OBS_DATETIME)
            ? new Date(Number(properties.OBS_DATETIME)).toLocaleString()
            : 'N/A';

        const temp = formatNumber(toFiniteNumber(properties?.TEMP), 1);
        const dew = formatNumber(toFiniteNumber(properties?.DEW_POINT), 1);
        const humidity = formatNumber(toFiniteNumber(properties?.R_HUMIDITY), 0);
        const windDir = formatNumber(toFiniteNumber(properties?.WIND_DIRECT), 0);
        const windSpeed = formatNumber(toFiniteNumber(properties?.WIND_SPEED), 0);
        const windGust = formatNumber(toFiniteNumber(properties?.WIND_GUST), 0);
        const pressure = formatNumber(toFiniteNumber(properties?.PRESSURE), 1);
        const windSpeedUnit = 'kt';

        setTimeout(() => {
            const windDirEl = document.getElementById('wind-direct');
            if (windDirEl && Number.isFinite(toFiniteNumber(properties?.WIND_DIRECT))) {
                windDirEl.style.transform = `rotate(${toFiniteNumber(properties.WIND_DIRECT)}deg)`;
                windDirEl.title = `${windDir}°`;
            }
        }, 200);

        let windDirStartRot = 0;
        try { windDirStartRot = properties?.WIND_DIRECT < 180 ? 180 : 0; } catch {}

        return `
            <div style="max-width: 620px;">
                <div style="margin-bottom: 20px; padding: 15px; background: ${escapeHtml(getTempColorHex(toFiniteNumber(properties?.TEMP)))}33; border-left: 4px solid ${escapeHtml(getTempColorHex(toFiniteNumber(properties?.TEMP)))}; border-radius: 10px;">
                    <h3 style="margin: 0 0 10px 0; text-align: left;">Metar at ${station}</h3>
                    <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px; font-size: 0.9em;">
                        <strong>Location:</strong><span>${country || 'N/A'}</span>
                        <strong>Last update:</strong><span>${escapeHtml(obsDate)}</span>
                        <strong>Condition:</strong><span>${weather}</span>
                    </div>
                </div>
                <div class="metar-widgets">
                    <div class="metar-widget" style="background: ${escapeHtml(getTempColorHex(toFiniteNumber(properties?.TEMP)))}11; position: relative; display: flex; justify-content: center; align-items: center;">
                        <span style="color: lightgray; font-size: 0.9em;">Wind speed</span>    
                        <span style="color: ${escapeHtml(getTempColorHex(toFiniteNumber(properties?.TEMP)))}; font-size: 1.5em; font-weight: bolder;">${windSpeed} ${windSpeedUnit}</span>
                        ${windGust != 0 ? `<span style="color: lightgray; margin-top: 10px; font-size: 0.9em;">Gusting to</span><span style="color: ${escapeHtml(getTempColorHex(toFiniteNumber(properties?.TEMP)))}; font-size: 1.5em; font-weight: bolder;">${windGust} ${windSpeedUnit}</span>` : ''}
                    </div>
                    <div class="metar-widget" style="background: ${escapeHtml(getTempColorHex(toFiniteNumber(properties?.TEMP)))}11; position: relative; border-radius: 500px; display: flex; justify-content: center; align-items: center;">
                        <i class="ti ti-navigation" id="wind-direct" style="transform: rotate(${windDirStartRot}deg); color: ${escapeHtml(getTempColorHex(toFiniteNumber(properties?.TEMP)))}; font-size: 3em;"></i>
                    </div>
                    <div class="metar-widget" style="background: ${escapeHtml(getTempColorHex(toFiniteNumber(properties?.TEMP)))}11; position: relative; display: flex; justify-content: center; align-items: center;">
                        <span style="color: lightgray; font-size: 0.9em;">Temperature</span>
                        <span style="color: ${escapeHtml(getTempColorHex(toFiniteNumber(properties?.TEMP)))}; font-size: 1.5em; font-weight: bolder;">${temp} °F</span>
                    </div>
                    <div class="metar-widget" style="background: ${escapeHtml(getTempColorHex(toFiniteNumber(properties?.DEW_POINT)))}11; position: relative; display: flex; justify-content: center; align-items: center;">
                        <span style="color: lightgray; font-size: 0.9em;">Dew point</span>
                        <span style="color: ${escapeHtml(getTempColorHex(toFiniteNumber(properties?.DEW_POINT)))}; font-size: 1.5em; font-weight: bolder;">${dew} °F</span>
                    </div>
                    <div class="metar-widget" style="background: ${escapeHtml(getTempColorHex(toFiniteNumber(properties?.R_HUMIDITY)))}11; position: relative; display: flex; justify-content: center; align-items: center;">
                        <span style="color: lightgray; font-size: 0.9em;">Humidity</span>
                        <span style="color: ${escapeHtml(getTempColorHex(toFiniteNumber(properties?.R_HUMIDITY)))}; font-size: 1.5em; font-weight: bolder;">${humidity} %</span>
                    </div>
                    <div class="metar-widget" style="background: ${escapeHtml(getTempColorHex(toFiniteNumber(properties?.TEMP)))}11; position: relative; display: flex; justify-content: center; align-items: center;">
                        <span style="color: lightgray; font-size: 0.9em;">Pressure</span>
                        <span style="color: ${escapeHtml(getTempColorHex(toFiniteNumber(properties?.TEMP)))}; font-size: 1.5em; font-weight: bolder;">${pressure} mb</span>
                    </div>
            </div>
        `;
    }

    _showStationDialog(feature) {
        const properties = feature?.properties || {};
        const titleCode = escapeHtml(properties.ICAO || 'METAR');
        const html = this._buildDialogHtml(properties);
        new Dialog(`${titleCode}`, 'temperature', html, {}, true);
    }

    async _ensureMarkerImage(map) {
        try {
            if (map.hasImage(METAR_IMAGE_ID)) return true;
            const imageData = createMarkerImageData(42);
            map.addImage(METAR_IMAGE_ID, imageData, { pixelRatio: 1, sdf: true });
            return true;
        } catch (error) {
            console.error('[MetarStationsLayer] Failed to create marker image:', error);
            return false;
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
                this._showStationDialog(feature);
            };
        }

        if (!this.mouseEnterHandlers[target]) {
            this.mouseEnterHandlers[target] = () => {
                map.getCanvas().style.cursor = 'pointer';
                if (this.map?.layers) {
                    this.map.layers.metarStationHovered = true;
                }
            };
        }

        if (!this.mouseLeaveHandlers[target]) {
            this.mouseLeaveHandlers[target] = () => {
                map.getCanvas().style.cursor = '';
                if (this.map?.layers) {
                    this.map.layers.metarStationHovered = false;
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

        const featureCount = this.data?.features?.length || 0;
        if (!this._isEnabled() || featureCount === 0) {
            this.clearMetarStations(target);
            return;
        }

        const markerReady = await this._ensureMarkerImage(map);
        if (!markerReady) {
            this.clearMetarStations(target);
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
                    'icon-image': METAR_IMAGE_ID,
                    'icon-size': 0.8,
                    'icon-anchor': 'center',
                    'icon-allow-overlap': false,
                    'icon-ignore-placement': false,
                    'icon-padding': 3,
                    'text-field': ['get', 'tempLabel'],
                    'text-size': 11,
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-anchor': 'center',
                    'text-offset': [0, 0],
                    'text-allow-overlap': false,
                    'text-ignore-placement': false
                },
                paint: {
                    'icon-color': ['get', 'tempColor'],
                    'icon-opacity': 0.95,
                    'text-color': ['get', 'tempTextColor']
                }
            }, beforeLayerId);
        }

        this._ensureLayerHandlers(target);
        this.map?.layers?.applyLayerOrder(target);
    }

    async fetchMetarStations() {
        try {
            const response = await fetch(METAR_CACHEFETCH_URL, {
                headers: { Accept: 'application/geo+json, application/json;q=0.9, */*;q=0.8' },
                signal: AbortSignal.timeout(METAR_FETCH_TIMEOUT_MS)
            });

            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
            }

            const payload = await response.json();
            const rawFeatures = Array.isArray(payload?.features) ? payload.features : [];
            const features = rawFeatures
                .map((feature) => this._normalizeFeature(feature))
                .filter(Boolean);

            this.data = {
                type: 'FeatureCollection',
                features
            };

            return this.data;
        } catch (error) {
            console.error('[MetarStationsLayer] Error fetching METAR stations:', error);
            return this.data;
        }
    }

    getMetarStations() {
        return this.data;
    }

    displayMetarStationsOnMap(target = 'main') {
        if (!this._isEnabled() || !this.data?.features?.length) {
            this.clearMetarStations(target);
            return;
        }

        this._scheduleSync(target);
    }

    displayMetarStations() {
        this.displayMetarStationsOnMap('main');
        if (this.map?.isSplit()) {
            this.displayMetarStationsOnMap('dual');
        }
    }

    clearMetarStations(target = 'main') {
        const map = this._getMap(target);
        if (!map) return;

        const sourceId = this._getSourceId(target);
        if (map.getSource(sourceId)) {
            map.getSource(sourceId).setData(EMPTY_FEATURE_COLLECTION);
        }

        map.getCanvas().style.cursor = '';
        if (this.map?.layers) {
            this.map.layers.metarStationHovered = false;
        }
    }
}

export default MetarStationsLayer;
