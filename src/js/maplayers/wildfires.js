import Popup from '../ui/popup.js';
import { hasUsableMapStyle, waitForMapStyleReady, waitForRadarLayer, getWeatherOutlineBeforeLayerId } from './layer_utils.js';

const EMPTY_FEATURE_COLLECTION = {
    type: 'FeatureCollection',
    features: []
};

const SYNC_PENDING_STALE_MS = 15000;
const WILDFIRE_SOURCE_URL = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/USA_Wildfires_v1/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson';
const WILDFIRE_CACHEFETCH_URL = `https://cachefetch.sparkradar.app/cache?format=json&maxAge=3000&url=${encodeURIComponent(WILDFIRE_SOURCE_URL)}`;
const WILDFIRE_FETCH_TIMEOUT_MS = 15000;
const WILDFIRE_FETCH_RETRIES = 3;
const WILDFIRE_FETCH_RETRY_DELAY_MS = 600;
const WILDFIRE_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const WILDFIRE_MIN_DAILY_ACRES = 3;
const WILDFIRE_IMAGE_ID = 'wildfire-position-marker';

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

function toFiniteNumber(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
}

function toTimestampMs(value) {
    const num = toFiniteNumber(value);
    if (!Number.isFinite(num)) return null;

    // ArcGIS fields can be epoch ms or epoch seconds depending on feed settings.
    return num > 1e12 ? num : num * 1000;
}

function formatDate(value, dateOnly=false) {
    const timestamp = toTimestampMs(value);
    if (!Number.isFinite(timestamp)) return 'Unknown';

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    if (dateOnly) return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    return date.toLocaleString();
}

function formatNumber(value, digits = 0, fallback = 'N/A') {
    if (!Number.isFinite(value)) return fallback;
    return value.toFixed(digits);
}

function createWildfireImageData(size = 64) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const center = size / 2;

    // Outline
    ctx.beginPath();
    ctx.arc(center, center, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();

    // Circle
    ctx.beginPath();
    ctx.arc(center, center, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#aa2121';
    ctx.fill();

    // Inner ember
    ctx.beginPath();
    ctx.arc(center, center + 2, 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(251, 146, 60, 0.95)';
    ctx.fill();

    // Flame tip
    ctx.beginPath();
    ctx.moveTo(center, center - 18);
    ctx.bezierCurveTo(center + 9, center - 6, center + 7, center + 8, center, center + 10);
    ctx.bezierCurveTo(center - 7, center + 8, center - 9, center - 6, center, center - 18);
    ctx.fillStyle = 'rgba(251, 146, 60, 0.95)';
    ctx.fill();

    return ctx.getImageData(0, 0, size, size);
}

class WildfiresLayer {
    constructor(mapInstance) {
        this.map = mapInstance;
        this.data = EMPTY_FEATURE_COLLECTION;
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
            if (typeof settings.wildfiresEnabled === 'boolean') {
                return settings.wildfiresEnabled;
            }
        } catch {}

        const checkbox = document.getElementById('toggle-wildfires-layer');
        return checkbox ? checkbox.checked : false;
    }

    _getMap(target) {
        return target === 'main' ? this.map?.map : this.map?.dualMap;
    }

    _getSourceId(target) {
        return target === 'main' ? 'wildfire-source' : 'wildfire-source-dual';
    }

    _getLayerId(target) {
        return target === 'main' ? 'wildfire-layer' : 'wildfire-layer-dual';
    }

    _normalizeFeature(feature) {
        const coords = feature?.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) {
            return null;
        }

        const properties = feature?.properties || {};
        const modifiedOnDateTime = toTimestampMs(
            properties.modifiedOnDateTime
            ?? properties.ModifiedOnDateTime
            ?? properties.MODIFIEDONDATE
            ?? properties.MODIFIED_DATE
        );

        const dailyAcres = toFiniteNumber(
            properties.DailyAcres
            ?? properties.DAILY_ACRES
            ?? properties.dailyAcres
        );

        if (!Number.isFinite(modifiedOnDateTime) || !Number.isFinite(dailyAcres)) {
            return null;
        }

        if ((Date.now() - modifiedOnDateTime) > WILDFIRE_MAX_AGE_MS) {
            return null;
        }

        if (dailyAcres < WILDFIRE_MIN_DAILY_ACRES) {
            return null;
        }

        return {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [coords[0], coords[1]]
            },
            properties: {
                IncidentName: String(properties.IncidentName || properties.INCIDENTNAME || 'Wildfire'),
                DailyAcres: dailyAcres,
                FireDiscoveryDateTime: properties.FireDiscoveryDateTime || properties.FIREDISCOVERYDATETIME,
                ModifiedOnDateTime: modifiedOnDateTime,
                POOCounty: String(properties.POOCounty || properties.POOCOUNTY || 'Unknown County'),
                POOState: String(properties.POOState || properties.POOSTATE || 'Unknown State'),
                FireCause: String(properties.FireCause || properties.FIRECAUSE || 'Unknown'),
                Injuries: toFiniteNumber(properties.Injuries ?? properties.INJURIES),
                Fatalities: toFiniteNumber(properties.Fatalities ?? properties.FATALITIES),
            }
        };
    }

    _buildPopupHtml(properties) {
        const incident = escapeHtml(properties?.IncidentName || 'Wildfire');
        const dailyAcres = formatNumber(toFiniteNumber(properties?.DailyAcres), 0, 'Unknown');
        const discovered = formatDate(properties?.FireDiscoveryDateTime, true);
        const modified = formatDate(properties?.ModifiedOnDateTime, true);
        const county = escapeHtml(properties?.POOCounty || 'Unknown County');
        const state = escapeHtml(properties?.POOState || 'Unknown State');
        const cause = escapeHtml(properties?.FireCause || 'Unknown');
        const injuries = toFiniteNumber(properties?.Injuries);
        const fatalities = toFiniteNumber(properties?.Fatalities);

        return `
            <div style="max-width: 320px; min-width: 220px;">
                <div style="margin-bottom: 8px;">
                    <h3 style="margin: 0; font-size: 1rem;">${incident} Wildfire</h3>
                </div>
                <p><b>Acres burned:</b> ${escapeHtml(dailyAcres)} per day</p>
                <p><b>Discovered:</b> ${escapeHtml(discovered)}</p>
                <p><b>Last Updated:</b> ${escapeHtml(modified)}</p>
                <p><b>Start Location:</b> ${county}, ${state}</p>
                ${cause == "Undetermined" ? '' : `<p><b>Cause:</b> ${cause}</p>`}
                ${Number.isFinite(injuries) && injuries > 0 ? `<p><b>Injuries:</b> ${escapeHtml(formatNumber(injuries, 0))}</p>` : ''}
                ${Number.isFinite(fatalities) && fatalities > 0 ? `<p><b>Fatalities:</b> ${escapeHtml(formatNumber(fatalities, 0))}</p>` : ''}
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

    async _ensureMarkerImage(map) {
        try {
            if (map.hasImage(WILDFIRE_IMAGE_ID)) return true;
            const imageData = createWildfireImageData(64);
            map.addImage(WILDFIRE_IMAGE_ID, imageData, { pixelRatio: 1 });
            return true;
        } catch (error) {
            console.error('[WildfiresLayer] Failed to create marker image:', error);
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

                if (this.map?.layers) {
                    this.map.layers.wildfireHovered = true;
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
                    this.map.layers.wildfireHovered = true;
                }
            };
        }

        if (!this.mouseLeaveHandlers[target]) {
            this.mouseLeaveHandlers[target] = () => {
                map.getCanvas().style.cursor = '';
                if (this.map?.layers) {
                    this.map.layers.wildfireHovered = false;
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
            this.clearWildfires(target);
            return;
        }

        const markerReady = await this._ensureMarkerImage(map);
        if (!markerReady) {
            this.clearWildfires(target);
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
                    'icon-image': WILDFIRE_IMAGE_ID,
                    'icon-size': 0.35,
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

    async fetchWildfires() {
        const urls = [WILDFIRE_SOURCE_URL, WILDFIRE_CACHEFETCH_URL];
        let lastError = null;

        for (let attempt = 1; attempt <= WILDFIRE_FETCH_RETRIES; attempt += 1) {
            for (const url of urls) {
                try {
                    const response = await fetch(url, {
                        headers: { Accept: 'application/geo+json, application/json;q=0.9, */*;q=0.8' },
                        signal: AbortSignal.timeout(WILDFIRE_FETCH_TIMEOUT_MS)
                    });

                    if (!response.ok) {
                        throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
                    }

                    const parsed = await response.json();
                    const sourceFeatures = Array.isArray(parsed?.features) ? parsed.features : [];
                    const normalizedFeatures = sourceFeatures
                        .map((feature) => this._normalizeFeature(feature))
                        .filter(Boolean);

                    this.data = {
                        type: 'FeatureCollection',
                        features: normalizedFeatures
                    };

                    return this.data;
                } catch (error) {
                    lastError = error;
                }
            }

            if (attempt < WILDFIRE_FETCH_RETRIES) {
                await wait(WILDFIRE_FETCH_RETRY_DELAY_MS * attempt);
            }
        }

        console.error('[WildfiresLayer] Error fetching wildfires:', lastError);
        return this.data;
    }

    getWildfires() {
        return this.data;
    }

    displayWildfiresOnMap(target = 'main') {
        if (!this._isEnabled() || !this.data?.features?.length) {
            this.clearWildfires(target);
            return;
        }

        this._scheduleSync(target);
    }

    clearWildfires(target = 'main') {
        const map = this._getMap(target);
        if (!map) return;

        const sourceId = this._getSourceId(target);
        if (map.getSource(sourceId)) {
            map.getSource(sourceId).setData(EMPTY_FEATURE_COLLECTION);
        }

        this._closePopup(target);
        if (this.map?.layers) {
            this.map.layers.wildfireHovered = false;
        }
    }
}

export default WildfiresLayer;
