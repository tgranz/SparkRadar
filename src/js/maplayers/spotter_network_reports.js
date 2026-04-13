import Popup from '../ui/popup.js';
import { hasUsableMapStyle, waitForMapStyleReady, waitForRadarLayer, getWeatherOutlineBeforeLayerId } from './layer_utils.js';

const EMPTY_FEATURE_COLLECTION = {
    type: 'FeatureCollection',
    features: []
};

const SYNC_PENDING_STALE_MS = 15000;
const SPOTTER_NETWORK_REPORTS_URL = 'https://www.spotternetwork.org/feeds/rss-reports.xml';
const SPOTTER_NETWORK_REPORTS_CACHEFETCH_URL = `https://cachefetch.sparkradar.app/cache?format=txt&maxAge=60&url=${encodeURIComponent(SPOTTER_NETWORK_REPORTS_URL)}`;
const SPOTTER_NETWORK_REPORTS_FETCH_TIMEOUT_MS = 15000;
const SPOTTER_NETWORK_REPORTS_FETCH_RETRIES = 2;
const SPOTTER_NETWORK_REPORTS_RETRY_DELAY_MS = 500;
const SPOTTER_NETWORK_REPORTS_CACHE_KEY = 'spotterNetworkReportsCache';
const MARKER_OUTLINE_COLOR = '#aaaaaa';

const REPORT_TYPES = {
    tornado: {
        iconId: 'spotter-network-report-tornado-icon',
        color: '#ff2121',
        title: 'SN Tornado Report'
    },
    wind: {
        iconId: 'spotter-network-report-wind-icon',
        color: '#2a7fff',
        title: 'SN Wind Report'
    },
    hail: {
        iconId: 'spotter-network-report-hail-icon',
        color: '#00af00',
        title: 'SN Hail Report'
    },
    other: {
        iconId: 'spotter-network-report-other-icon',
        color: '#f2c94c',
        title: 'SN Report'
    }
};

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
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function createMarkerImageData(fillColor, outlineColor = MARKER_OUTLINE_COLOR, size = 18) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const center = size / 2;
    const radius = Math.floor(size / 2) - 2;

    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = outlineColor;
    ctx.stroke();

    return ctx.getImageData(0, 0, size, size);
}

function loadCachedSpotterNetworkReports() {
    try {
        const raw = localStorage.getItem(SPOTTER_NETWORK_REPORTS_CACHE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (!parsed.data || !Array.isArray(parsed.data.features)) return null;
        return parsed.data;
    } catch {
        return null;
    }
}

function saveCachedSpotterNetworkReports(data) {
    if (!data || !Array.isArray(data.features)) return;

    try {
        localStorage.setItem(SPOTTER_NETWORK_REPORTS_CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data
        }));
    } catch {}
}

function getFirstChildText(element, localName) {
    if (!element) return '';

    const child = Array.from(element.children || []).find((entry) => entry.localName === localName || entry.tagName === localName || entry.tagName === `geo:${localName}`);
    return child?.textContent?.trim() || '';
}

function inferReportType(title) {
    const normalizedTitle = String(title || '').toLowerCase();

    if (/tornado|funnel/.test(normalizedTitle)) return 'tornado';
    if (/hail/.test(normalizedTitle)) return 'hail';
    if (/wind|damage|tree/.test(normalizedTitle)) return 'wind';
    return 'other';
}

function inferReportTitle(title) {
    const normalizedTitle = String(title || '').toLowerCase();

    if (/tornado/.test(normalizedTitle)) return 'SN Tornado Report';
    if (/funnel/.test(normalizedTitle)) return 'SN Funnel Cloud Report';
    if (/hail/.test(normalizedTitle)) return 'SN Hail Report';
    if (/wind/.test(normalizedTitle)) return 'SN Wind Report';
    if(/damage/.test(normalizedTitle)) return 'SN Damage Report';
    return 'SN Report';
}

function parseReportDescription(description) {
    const raw = String(description || '').trim().replace(/^"|"$/g, '');
    const match = raw.match(/^\(Reported By\)\s*(.*?)\s*\(Time\)\s*(.*?)\s*\(Notes\)\s*(.*)$/i);

    if (!match) {
        return {
            reporter: null,
            time: null,
            notes: raw || null
        };
    }

    return {
        reporter: match[1]?.trim() || null,
        time: match[2]?.trim() || null,
        notes: match[3]?.trim() || null
    };
}

function parseReportLocation(title) {
    const rawTitle = String(title || '').trim();
    const nearMatch = rawTitle.match(/\s+near\s+(.+)$/i);
    return nearMatch ? nearMatch[1].trim() : null;
}

function parseReportMagnitude(title, reportType) {
    const rawTitle = String(title || '').trim();

    if (reportType === 'hail') {
        const match = rawTitle.match(/Hail Size:\s*(.*?)\s+near\s/i);
        return match ? match[1].trim() : null;
    }

    if (reportType === 'wind') {
        const match = rawTitle.match(/Wind(?: Gust)?\s*:?\s*(.*?)\s+near\s/i);
        return match ? match[1].trim() : null;
    }

    return null;
}

function parseSpotterNetworkReportsXml(text) {
    if (typeof text !== 'string' || text.trim().length === 0) {
        return EMPTY_FEATURE_COLLECTION;
    }

    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length > 0) {
        throw new Error('Failed to parse Spotter Network reports XML');
    }

    const items = Array.from(xml.getElementsByTagName('item'));
    const features = [];
    const seen = new Set();

    for (const item of items) {
        const title = getFirstChildText(item, 'title');
        const description = getFirstChildText(item, 'description');
        const lat = toFiniteNumber(getFirstChildText(item, 'lat'));
        const lon = toFiniteNumber(getFirstChildText(item, 'long'));

        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !title) {
            continue;
        }

        const reportType = inferReportType(title);
        const parsedDescription = parseReportDescription(description);
        const location = parseReportLocation(title);
        const magnitude = parseReportMagnitude(title, reportType);
        const dedupeKey = `${reportType}|${lat.toFixed(4)}|${lon.toFixed(4)}|${title}|${parsedDescription.time || ''}`;
        if (seen.has(dedupeKey)) {
            continue;
        }
        seen.add(dedupeKey);

        features.push({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [lon, lat]
            },
            properties: {
                reportType,
                title,
                reportTitle: REPORT_TYPES[reportType]?.title || REPORT_TYPES.other.title,
                location,
                magnitude,
                reporter: parsedDescription.reporter,
                time: parsedDescription.time,
                notes: parsedDescription.notes,
                rawDescription: description
            }
        });
    }

    return {
        type: 'FeatureCollection',
        features
    };
}

class SpotterNetworkReportsLayer {
    constructor(mapInstance) {
        this.map = mapInstance;
        this.reports = EMPTY_FEATURE_COLLECTION;
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
            if (typeof settings.spotterNetworkReportsEnabled === 'boolean') {
                return settings.spotterNetworkReportsEnabled;
            }
        } catch {}

        const checkbox = document.getElementById('toggle-spotter-network-reports-layer');
        return checkbox ? checkbox.checked : false;
    }

    _getMap(target) {
        return target === 'main' ? this.map?.map : this.map?.dualMap;
    }

    _getSourceId(target) {
        return target === 'main' ? 'spotter-network-report-source' : 'spotter-network-report-source-dual';
    }

    _getLayerId(target) {
        return target === 'main' ? 'spotter-network-report-layer' : 'spotter-network-report-layer-dual';
    }

    async _fetchReportText() {
        let lastError = null;

        for (let attempt = 1; attempt <= SPOTTER_NETWORK_REPORTS_FETCH_RETRIES; attempt += 1) {
            for (const url of [SPOTTER_NETWORK_REPORTS_CACHEFETCH_URL, SPOTTER_NETWORK_REPORTS_URL]) {
                try {
                    const response = await fetch(url, {
                        headers: { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, text/plain;q=0.8, */*;q=0.7' },
                        signal: AbortSignal.timeout(SPOTTER_NETWORK_REPORTS_FETCH_TIMEOUT_MS)
                    });

                    if (!response.ok) {
                        throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
                    }

                    return await response.text();
                } catch (error) {
                    lastError = error;
                }
            }

            if (attempt < SPOTTER_NETWORK_REPORTS_FETCH_RETRIES) {
                await wait(SPOTTER_NETWORK_REPORTS_RETRY_DELAY_MS * attempt);
            }
        }

        throw lastError || new Error('Failed to fetch Spotter Network reports');
    }

    async fetchSpotterNetworkReports() {
        const cached = loadCachedSpotterNetworkReports();
        if (cached) {
            this.reports = cached;
        }

        try {
            const text = await this._fetchReportText();
            const parsed = parseSpotterNetworkReportsXml(text);
            this.reports = parsed;
            saveCachedSpotterNetworkReports(parsed);
            return parsed;
        } catch (error) {
            console.error('[SpotterNetworkReportsLayer] Error fetching reports:', error);
            return this.reports;
        }
    }

    getSpotterNetworkReports() {
        return this.reports;
    }

    _buildPopupHtml(properties) {
        const reportTitle = inferReportTitle(properties?.title || properties?.reportTitle || 'SN Report');
        const location = properties?.location ? `<p style="margin: 0; font-size: 0.9rem;"><strong>Location:</strong> ${escapeHtml(properties.location)}</p>` : '';
        const time = properties?.time ? `<p style="margin: 0; font-size: 0.9rem;"><strong>Time:</strong> ${escapeHtml(new Date(properties.time).toLocaleString())}</p>` : '';
        const reporter = properties?.reporter ? `<p style="margin: 0; font-size: 0.9rem;"><strong>Reported By:</strong> ${escapeHtml(properties.reporter)}</p>` : '';
        const magnitude = properties?.magnitude ? `<p style="margin: 0; font-size: 0.9rem;"><strong>Magnitude:</strong> ${escapeHtml(properties.magnitude)}</p>` : '';
        const notes = properties?.notes && properties.notes !== 'None'
            ? `<p style="margin: 10px 0 0 0; font-size: 0.85rem; background: rgba(0, 0, 0, 0.3); padding: 10px; font-family: monospace, Consolas; border: 1px solid var(--border-color); border-radius: 10px;">${escapeHtml(properties.notes)}</p>`
            : '';

        return `
            <div style="max-width: 320px; min-width: 220px;">
                <div style="padding-right: 4px;">
                    <h3 style="margin: 0 0 6px 0; font-size: 1rem;">${reportTitle}</h3>
                    ${magnitude}
                    ${location}
                    ${time}
                    ${reporter}
                </div>
                ${notes}
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

    async _ensureMarkerImages(map) {
        try {
            for (const config of Object.values(REPORT_TYPES)) {
                if (map.hasImage(config.iconId)) continue;

                const imageData = createMarkerImageData(config.color);
                if (!imageData) {
                    return false;
                }

                map.addImage(config.iconId, imageData, { pixelRatio: 1 });
            }

            return true;
        } catch (error) {
            console.error('[SpotterNetworkReportsLayer] Failed to create marker images:', error);
            return false;
        }
    }

    _ensureLayerHandlers(target) {
        const map = this._getMap(target);
        if (!map) return;

        const layerId = this._getLayerId(target);

        if (!this.clickHandlers[target]) {
            this.clickHandlers[target] = (event) => {
                event.stopPropagation?.();
                event.originalEvent?.stopPropagation?.();
                event.originalEvent?.preventDefault?.();

                const feature = event.features?.[0];
                const coordinates = feature?.geometry?.coordinates;
                if (!Array.isArray(coordinates) || coordinates.length < 2) return;

                if (this.map?.layers) {
                    this.map.layers.spotterNetworkReportHovered = true;
                }

                this._showPopup(target, coordinates, feature.properties || {});
            };
        }

        if (!this.mouseEnterHandlers[target]) {
            this.mouseEnterHandlers[target] = () => {
                map.getCanvas().style.cursor = 'pointer';
                if (this.map?.layers) {
                    this.map.layers.spotterNetworkReportHovered = true;
                }
            };
        }

        if (!this.mouseLeaveHandlers[target]) {
            this.mouseLeaveHandlers[target] = () => {
                map.getCanvas().style.cursor = '';
                if (this.map?.layers) {
                    this.map.layers.spotterNetworkReportHovered = false;
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

        if (!this._isEnabled() || !this.reports?.features?.length) {
            this.clearSpotterNetworkReports(target);
            return;
        }

        const markerReady = await this._ensureMarkerImages(map);
        if (!markerReady) {
            this.clearSpotterNetworkReports(target);
            return;
        }

        if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
                type: 'geojson',
                data: this.reports
            });
        } else {
            map.getSource(sourceId).setData(this.reports);
        }

        const beforeLayerId = getWeatherOutlineBeforeLayerId(map, target);
        if (!map.getLayer(layerId)) {
            map.addLayer({
                id: layerId,
                type: 'symbol',
                source: sourceId,
                layout: {
                    'icon-image': ['match', ['get', 'reportType'], 'tornado', REPORT_TYPES.tornado.iconId, 'wind', REPORT_TYPES.wind.iconId, 'hail', REPORT_TYPES.hail.iconId, REPORT_TYPES.other.iconId],
                    'icon-size': 0.7,
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

    displaySpotterNetworkReportsOnMap(target = 'main') {
        if (!this._isEnabled() || !this.reports?.features?.length) {
            this.clearSpotterNetworkReports(target);
            return;
        }

        this._scheduleSync(target);
    }

    displaySpotterNetworkReports() {
        this.displaySpotterNetworkReportsOnMap('main');
        if (this.map?.isSplit()) {
            this.displaySpotterNetworkReportsOnMap('dual');
        }
    }

    clearSpotterNetworkReports(target = 'main') {
        const map = this._getMap(target);
        if (!map) return;

        const sourceId = this._getSourceId(target);
        if (map.getSource(sourceId)) {
            map.getSource(sourceId).setData(EMPTY_FEATURE_COLLECTION);
        }

        map.getCanvas().style.cursor = '';
        if (this.map?.layers) {
            this.map.layers.spotterNetworkReportHovered = false;
        }
        this._closePopup(target);
    }
}

export default SpotterNetworkReportsLayer;