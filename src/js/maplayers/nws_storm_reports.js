import Popup from '../ui/popup.js';
import { hasUsableMapStyle, waitForMapStyleReady, waitForRadarLayer, getWeatherOutlineBeforeLayerId } from './layer_utils.js';

const EMPTY_FEATURE_COLLECTION = {
    type: 'FeatureCollection',
    features: []
};

const SYNC_PENDING_STALE_MS = 15000;
const REPORT_FETCH_TIMEOUT_MS = 15000;
const REPORT_FETCH_RETRIES = 2;
const REPORT_FETCH_RETRY_DELAY_MS = 500;
const SPC_REPORT_DATE_TOKEN = 'today';

const REPORT_TYPES = {
    tornado: {
        url: `https://www.spc.noaa.gov/climo/reports/${SPC_REPORT_DATE_TOKEN}_torn.csv`,
        iconId: 'nws-storm-report-tornado-icon',
        color: '#ff2121',
        title: 'NWS Tornado Report'
    },
    wind: {
        url: `https://www.spc.noaa.gov/climo/reports/${SPC_REPORT_DATE_TOKEN}_wind.csv`,
        iconId: 'nws-storm-report-wind-icon',
        color: '#2a7fff',
        title: 'NWS Wind Report'
    },
    hail: {
        url: `https://www.spc.noaa.gov/climo/reports/${SPC_REPORT_DATE_TOKEN}_hail.csv`,
        iconId: 'nws-storm-report-hail-icon',
        color: '#00af00',
        title: 'NWS Hail Report'
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

function splitCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
            continue;
        }

        current += char;
    }

    values.push(current);
    return values;
}

function formatReportTime(timeValue) {
    const raw = String(timeValue || '').trim();
    if (!/^\d{3,4}$/.test(raw)) return raw || 'N/A';

    const padded = raw.padStart(4, '0');
    const reportDate = parseReportDateToken(SPC_REPORT_DATE_TOKEN);
    if (!reportDate) {
        return `${padded.slice(0, 2)}:${padded.slice(2)} UTC`;
    }

    const utcDate = new Date(Date.UTC(
        reportDate.year,
        reportDate.month,
        reportDate.day,
        Number(padded.slice(0, 2)),
        Number(padded.slice(2)),
        0,
        0
    ));

    try {
        return new Intl.DateTimeFormat(undefined, {
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
        }).format(utcDate);
    } catch {
        return utcDate.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit'
        });
    }
}

function parseReportDateToken(dateToken) {
    const raw = String(dateToken || '').trim().toLowerCase();
    if (!raw) return null;

    if (raw === 'today') {
        const now = new Date();
        return {
            year: now.getUTCFullYear(),
            month: now.getUTCMonth(),
            day: now.getUTCDate()
        };
    }

    const match = raw.match(/^(\d{2})(\d{2})(\d{2})$/);
    if (!match) return null;

    const [, yearPart, monthPart, dayPart] = match;
    const year = 2000 + Number(yearPart);
    const month = Number(monthPart) - 1;
    const day = Number(dayPart);

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
    }

    return { year, month, day };
}

function formatMagnitude(reportType, rawValue) {
    if (reportType === 'hail') {
        const value = toFiniteNumber(rawValue);
        if (!Number.isFinite(value)) return null;
        return `${(value / 100).toFixed(2)} in`;
    }

    if (reportType === 'wind') {
        const value = toFiniteNumber(rawValue);
        if (!Number.isFinite(value)) return null;
        return `${Math.round(value)} mph`;
    }

    return null;
}

function createMarkerImageData(fillColor, size = 18) {
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
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    return ctx.getImageData(0, 0, size, size);
}

function parseStormReportCsv(text, reportType) {
    if (typeof text !== 'string' || text.trim().length === 0) {
        return [];
    }

    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length <= 1) {
        return [];
    }

    const features = [];
    const seen = new Set();

    for (let i = 1; i < lines.length; i += 1) {
        const columns = splitCsvLine(lines[i]);
        if (columns.length < 7) {
            continue;
        }

        const lat = toFiniteNumber(columns[5]);
        const lon = toFiniteNumber(columns[6]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            continue;
        }

        const magnitude = columns[1] ? String(columns[1]).trim() : '';
        const location = columns[2] ? String(columns[2]).trim() : '';
        const county = columns[3] ? String(columns[3]).trim() : '';
        const state = columns[4] ? String(columns[4]).trim() : '';
        const comments = columns.slice(7).join(',').trim();
        const dedupeKey = `${reportType}|${lat.toFixed(4)}|${lon.toFixed(4)}|${columns[0]}|${location}`;
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
                time: String(columns[0] || '').trim(),
                magnitude,
                magnitudeDisplay: formatMagnitude(reportType, magnitude),
                location,
                county,
                state,
                comments,
                reportTitle: REPORT_TYPES[reportType]?.title || 'Storm Report'
            }
        });
    }

    return features;
}

class NWSStormReportsLayer {
    constructor(mapInstance) {
        this.map = mapInstance;
        this.reports = EMPTY_FEATURE_COLLECTION;
        this.enabledTypes = { tornado: false, wind: false, hail: false };
        this.hasExplicitEnabledTypes = false;
        this.syncPending = { main: false, dual: false };
        this.syncPendingSince = { main: 0, dual: 0 };
        this.popups = { main: null, dual: null };
        this.popupMoveHandlers = { main: null, dual: null };
        this.clickHandlers = { main: null, dual: null };
        this.mouseEnterHandlers = { main: null, dual: null };
        this.mouseLeaveHandlers = { main: null, dual: null };
    }

    _getMap(target) {
        return target === 'main' ? this.map?.map : this.map?.dualMap;
    }

    _getSourceId(target) {
        return target === 'main' ? 'nws-storm-report-source' : 'nws-storm-report-source-dual';
    }

    _getLayerId(target) {
        return target === 'main' ? 'nws-storm-report-layer' : 'nws-storm-report-layer-dual';
    }

    _normalizeEnabledTypes(enabledTypes = {}) {
        return {
            tornado: enabledTypes.tornado === true,
            wind: enabledTypes.wind === true,
            hail: enabledTypes.hail === true
        };
    }

    _loadEnabledTypesFromSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
            return this._normalizeEnabledTypes({
                tornado: settings.nwsTornadoReportsEnabled === true,
                wind: settings.nwsWindReportsEnabled === true,
                hail: settings.nwsHailReportsEnabled === true
            });
        } catch {
            return this._normalizeEnabledTypes();
        }
    }

    _getEnabledTypes() {
        if (this.hasExplicitEnabledTypes) {
            return this._normalizeEnabledTypes(this.enabledTypes);
        }
        return this._loadEnabledTypesFromSettings();
    }

    _hasEnabledTypes() {
        const enabledTypes = this._getEnabledTypes();
        return enabledTypes.tornado || enabledTypes.wind || enabledTypes.hail;
    }

    setEnabledTypes(enabledTypes) {
        this.enabledTypes = this._normalizeEnabledTypes(enabledTypes);
        this.hasExplicitEnabledTypes = true;
        this.displayNwsStormReports();
    }

    getNwsStormReports() {
        return this.reports;
    }

    async _fetchReportText(url) {
        const cachefetchUrl = `https://cachefetch.sparkradar.app/cache?format=txt&maxAge=180&url=${encodeURIComponent(url)}`;
        let lastError = null;

        for (let attempt = 1; attempt <= REPORT_FETCH_RETRIES; attempt += 1) {
            for (const candidateUrl of [cachefetchUrl, url]) {
                try {
                    const response = await fetch(candidateUrl, {
                        headers: { Accept: 'text/plain, text/csv;q=0.9, */*;q=0.8' },
                        signal: AbortSignal.timeout(REPORT_FETCH_TIMEOUT_MS)
                    });

                    if (!response.ok) {
                        throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
                    }

                    return await response.text();
                } catch (error) {
                    lastError = error;
                }
            }

            if (attempt < REPORT_FETCH_RETRIES) {
                await wait(REPORT_FETCH_RETRY_DELAY_MS * attempt);
            }
        }

        throw lastError || new Error('Failed to fetch storm reports');
    }

    async fetchNwsStormReports() {
        try {
            const reportEntries = Object.entries(REPORT_TYPES);
            const featureSets = await Promise.all(reportEntries.map(async ([reportType, config]) => {
                const text = await this._fetchReportText(config.url);
                return parseStormReportCsv(text, reportType);
            }));

            this.reports = {
                type: 'FeatureCollection',
                features: featureSets.flat()
            };

            return this.reports;
        } catch (error) {
            console.error('[NWSStormReportsLayer] Error fetching storm reports:', error);
            return this.reports;
        }
    }

    _buildPopupHtml(properties) {
        const title = escapeHtml(properties?.reportTitle || 'Storm Report');
        const location = escapeHtml(properties?.location || 'Unknown Location');
        const county = escapeHtml(properties?.county || 'Unknown County');
        const state = escapeHtml(properties?.state || '');
        const comments = escapeHtml(properties?.comments || 'No comments provided.');
        const time = escapeHtml(formatReportTime(properties?.time));
        const magnitudeDisplay = properties?.magnitudeDisplay
            ? `<p style="margin: 0; font-size: 0.9rem;"><strong>Magnitude:</strong> ${escapeHtml(properties.magnitudeDisplay)}</p>`
            : '';

        return `
            <div style="max-width: 320px; min-width: 220px;">
                <div style="padding-right: 4px;">
                    <h3 style="margin: 0 0 6px 0; font-size: 1rem;">${title}</h3>
                    <p style="margin: 0; font-size: 0.9rem;"><strong>Location:</strong> ${location} (${county}${state ? `, ${state}` : ''})</p>
                    <p style="margin: 0; font-size: 0.9rem;"><strong>Time:</strong> ${time}</p>
                    ${magnitudeDisplay}
                </div>
                <p style="margin: 10px 0 0 0; font-size: 0.85rem; background: rgba(0, 0, 0, 0.3); padding: 10px; font-family: monospace, Consolas; border: 1px solid var(--border-color); border-radius: 10px;">${comments}</p>
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
            console.error('[NWSStormReportsLayer] Failed to create marker images:', error);
            return false;
        }
    }

    _getLayerFilter() {
        const enabledTypes = this._getEnabledTypes();
        const allowedTypes = Object.entries(enabledTypes)
            .filter(([, enabled]) => enabled)
            .map(([reportType]) => reportType);

        if (allowedTypes.length === 0) {
            return ['==', ['get', 'reportType'], '__none__'];
        }

        return ['in', ['get', 'reportType'], ['literal', allowedTypes]];
    }

    _applyLayerFilter(target) {
        const map = this._getMap(target);
        const layerId = this._getLayerId(target);
        if (!map || !map.getLayer(layerId)) return;
        map.setFilter(layerId, this._getLayerFilter());
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
                    this.map.layers.nwsStormReportHovered = true;
                }

                this._showPopup(target, coordinates, feature.properties || {});
            };
        }

        if (!this.mouseEnterHandlers[target]) {
            this.mouseEnterHandlers[target] = () => {
                map.getCanvas().style.cursor = 'pointer';
                if (this.map?.layers) {
                    this.map.layers.nwsStormReportHovered = true;
                }
            };
        }

        if (!this.mouseLeaveHandlers[target]) {
            this.mouseLeaveHandlers[target] = () => {
                map.getCanvas().style.cursor = '';
                if (this.map?.layers) {
                    this.map.layers.nwsStormReportHovered = false;
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

        if (!this._hasEnabledTypes() || !this.reports?.features?.length) {
            this.clearNwsStormReports(target);
            return;
        }

        const markerReady = await this._ensureMarkerImages(map);
        if (!markerReady) {
            this.clearNwsStormReports(target);
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
                filter: this._getLayerFilter(),
                layout: {
                    'icon-image': ['match', ['get', 'reportType'], 'tornado', REPORT_TYPES.tornado.iconId, 'wind', REPORT_TYPES.wind.iconId, 'hail', REPORT_TYPES.hail.iconId, REPORT_TYPES.wind.iconId],
                    'icon-size': 0.7,
                    'icon-anchor': 'center',
                    'icon-allow-overlap': false,
                    'icon-ignore-placement': false,
                    'icon-padding': 3
                }
            }, beforeLayerId);
        } else {
            this._applyLayerFilter(target);
        }

        this._ensureLayerHandlers(target);
        this.map?.layers?.applyLayerOrder(target);
    }

    displayNwsStormReportsOnMap(target = 'main') {
        if (!this._hasEnabledTypes() || !this.reports?.features?.length) {
            this.clearNwsStormReports(target);
            return;
        }

        this._scheduleSync(target);
    }

    displayNwsStormReports() {
        this.displayNwsStormReportsOnMap('main');
        if (this.map?.isSplit()) {
            this.displayNwsStormReportsOnMap('dual');
        }
    }

    clearNwsStormReports(target = 'main') {
        const map = this._getMap(target);
        if (!map) return;

        const sourceId = this._getSourceId(target);
        if (map.getSource(sourceId)) {
            map.getSource(sourceId).setData(EMPTY_FEATURE_COLLECTION);
        }

        map.getCanvas().style.cursor = '';
        if (this.map?.layers) {
            this.map.layers.nwsStormReportHovered = false;
        }
        this._closePopup(target);
    }
}

export default NWSStormReportsLayer;