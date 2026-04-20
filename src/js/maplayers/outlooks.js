/*
Outlook Layer
Manages SPC outlook display on the map

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import { hasUsableMapStyle, waitForMapStyleReady, getWeatherFillBeforeLayerId, getWeatherOutlineBeforeLayerId } from "./layer_utils.js";

const EMPTY_FEATURE_COLLECTION = {
    type: 'FeatureCollection',
    features: []
};

const OUTLOOK_TYPES = ['cat', 'torn', 'wind', 'hail'];
const OUTLOOK_CIG_HATCH_IMAGE_ID = 'outlook-cig-hatch';

const SYNC_PENDING_STALE_MS = 15000;

function createCigHatchImage(size = 8) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(230, 230, 230, 0.85)';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(-1, size - 1);
    ctx.lineTo(size - 1, -1);
    ctx.moveTo(3, size + 1);
    ctx.lineTo(size + 1, 3);
    ctx.stroke();

    return ctx.getImageData(0, 0, size, size);
}

function hasCigLabel(feature) {
    const label = feature?.properties?.LABEL;
    return typeof label === 'string' && label.toUpperCase().includes('CIG');
}

class OutlookLayer {
    constructor(mapInstance) {
        this.map = mapInstance;

        // Outlook tracking
        this.currentOutlookDay = null; // 1, 2, 3, or null
        this.currentOutlookType = 'cat';
        this.outlookData = null;
        this.outlookSyncPending = { main: false, dual: false };
        this.outlookSyncPendingSince = { main: 0, dual: 0 };
        this._pendingRequestKey = null;
    }

    setOutlookData(day, data, type = 'cat') {
        this.currentOutlookDay = day;
        this.currentOutlookType = type;
        this.outlookData = data;
    }

    getOutlookData() {
        return this.outlookData;
    }

    getCurrentOutlookDay() {
        return this.currentOutlookDay;
    }

    _normalizeOutlookType(type) {
        const normalized = String(type || 'cat').toLowerCase();
        return OUTLOOK_TYPES.includes(normalized) ? normalized : 'cat';
    }

    _buildOutlookFetchUrl(day, type) {
        return encodeURI(`https://cachefetch.sparkradar.app/cache?maxAge=1800&url=https://www.spc.noaa.gov/products/outlook/day${day}otlk_${type}.nolyr.geojson`);
    }

    async _fetchSingleOutlook(day, type) {
        const url = this._buildOutlookFetchUrl(day, type);
        const response = await fetch(url, {
            headers: { 'Accept': 'Application/geo+json' },
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.statusText}`);
        }

        const data = await response.json();
        if (!Array.isArray(data?.features)) {
            return null;
        }

        return data;
    }

    async fetchOutlook(day, type = 'cat') {
        if (![1, 2, 3].includes(day)) {
            console.error('[OutlookLayer] Invalid outlook day:', day);
            return null;
        }
        const normalizedType = this._normalizeOutlookType(type);
        return this.fetchOutlookSelections([{ day, type: normalizedType }]);
    }

    async fetchOutlookSelections(selections = []) {
        const validSelections = (Array.isArray(selections) ? selections : [])
            .map((item) => ({
                day: Number(item?.day),
                type: this._normalizeOutlookType(item?.type),
            }))
            .filter((item) => [1, 2, 3].includes(item.day));

        const deduped = [];
        const seen = new Set();
        for (const item of validSelections) {
            const key = `${item.day}:${item.type}`;
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(item);
        }

        if (deduped.length === 0) {
            this.currentOutlookDay = null;
            this.currentOutlookType = 'cat';
            this.outlookData = null;
            return null;
        }

        const requestKey = deduped.map((item) => `${item.day}:${item.type}`).join('|');
        this._pendingRequestKey = requestKey;

        try {
            const results = await Promise.all(
                deduped.map(async (item) => {
                    try {
                        return await this._fetchSingleOutlook(item.day, item.type);
                    } catch (error) {
                        console.error(`[OutlookLayer] Error fetching outlook day ${item.day} ${item.type}:`, error);
                        return null;
                    }
                })
            );

            if (this._pendingRequestKey !== requestKey) {
                return null;
            }

            const mergedFeatures = [];
            for (const data of results) {
                if (Array.isArray(data?.features)) {
                    mergedFeatures.push(...data.features.map((feature) => ({
                        ...feature,
                        properties: {
                            ...(feature?.properties || {}),
                            isCigHatched: hasCigLabel(feature)
                        }
                    })));
                }
            }

            if (mergedFeatures.length === 0) {
                this.currentOutlookDay = null;
                this.currentOutlookType = 'cat';
                this.outlookData = null;
                return null;
            }

            this.currentOutlookDay = deduped[0].day;
            this.currentOutlookType = deduped[0].type;
            this.outlookData = {
                type: 'FeatureCollection',
                features: mergedFeatures,
            };

            return this.outlookData;
        } catch (error) {
            console.error('[OutlookLayer] Error fetching outlook selections:', error);
            return null;
        }
    }

    _scheduleOutlookSync(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        if (hasUsableMapStyle(map)) {
            this.outlookSyncPending[target] = false;
            this.outlookSyncPendingSince[target] = 0;
            this._syncOutlookToMap(target);
            return;
        }

        if (this.outlookSyncPending[target]) {
            const pendingAge = Date.now() - (this.outlookSyncPendingSince[target] || 0);
            if (pendingAge < SYNC_PENDING_STALE_MS) {
                return;
            }
            console.warn(`[OutlookLayer] Resetting stale sync pending flag for ${target} (age=${pendingAge}ms)`);
            this.outlookSyncPending[target] = false;
        }
        this.outlookSyncPending[target] = true;
        this.outlookSyncPendingSince[target] = Date.now();

        waitForMapStyleReady(map).then(() => {
            this.outlookSyncPending[target] = false;
            this.outlookSyncPendingSince[target] = 0;
            this._syncOutlookToMap(target);
        });
    }

    _syncOutlookToMap(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;
        if (!this.outlookData || !this.outlookData.features) return;

        const sourceId = target === 'main' ? 'outlook-source' : 'outlook-source-dual';
        const layerId = target === 'main' ? 'outlook-layer' : 'outlook-layer-dual';
        const fillLayerId = `${layerId}-fill`;
        const cigFillLayerId = `${layerId}-cig-fill`;
        const fillBeforeId = getWeatherFillBeforeLayerId(map, target);
        const outlineBeforeId = getWeatherOutlineBeforeLayerId(map, target);

        this._ensureCigHatchPattern(map);

        // Remove existing layers/sources
        if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
        }
        if (map.getLayer(cigFillLayerId)) {
            map.removeLayer(cigFillLayerId);
        }
        if (map.getLayer(fillLayerId)) {
            map.removeLayer(fillLayerId);
        }
        if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
        }

        // Add the GeoJSON source
        map.addSource(sourceId, {
            type: 'geojson',
            data: this.outlookData
        });

        // Add fill layer for outlook areas
        map.addLayer({
            id: fillLayerId,
            type: 'fill',
            source: sourceId,
            filter: ['!=', ['get', 'isCigHatched'], true],
            paint: {
                'fill-color': ['get', 'fill'],
                'fill-opacity': 0.3
            }
        }, fillBeforeId);

        map.addLayer({
            id: cigFillLayerId,
            type: 'fill',
            source: sourceId,
            filter: ['==', ['get', 'isCigHatched'], true],
            paint: {
                'fill-pattern': OUTLOOK_CIG_HATCH_IMAGE_ID,
                'fill-opacity': 0.3
            }
        }, fillBeforeId);

        // Add line layer for outlook boundaries
        map.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            paint: {
                'line-color': ['get', 'stroke'],
                'line-width': 2,
                'line-opacity': 1
            }
        }, outlineBeforeId);
    }

    _ensureCigHatchPattern(map) {
        if (!map || map.hasImage(OUTLOOK_CIG_HATCH_IMAGE_ID)) {
            return;
        }

        const image = createCigHatchImage();
        if (!image) {
            return;
        }

        map.addImage(OUTLOOK_CIG_HATCH_IMAGE_ID, image, { pixelRatio: 1 });
    }

    _getEnabledOutlookDay() {
        try {
            const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
            if ([1, 2, 3].includes(settings.outlookDay)) {
                return settings.outlookDay;
            }
            if (settings.outlookDay === null) {
                return null;
            }
        } catch {}

        const day1Checkbox = document.getElementById('toggle-day-1-outlook-layer');
        const day2Checkbox = document.getElementById('toggle-day-2-outlook-layer');
        const day3Checkbox = document.getElementById('toggle-day-3-outlook-layer');

        if (day1Checkbox || day2Checkbox || day3Checkbox) {
            if (day1Checkbox?.checked) return 1;
            if (day2Checkbox?.checked) return 2;
            if (day3Checkbox?.checked) return 3;
            return null;
        }

        return null;
    }

    displayOutlookOnMap(target = 'main') {
        if (!this.outlookData?.features?.length) {
            this.clearOutlook(target);
            return;
        }

        this._scheduleOutlookSync(target);
    }

    displayOutlook() {
        this.displayOutlookOnMap('main');
        if (this.map?.isSplit()) {
            this.displayOutlookOnMap('dual');
        }
        
        console.log(`[OutlookLayer] Displayed Day ${this.currentOutlookDay} outlook with ${this.outlookData?.features?.length || 0} features`);
    }

    clearOutlook(target = 'main') {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        const sourceId = target === 'main' ? 'outlook-source' : 'outlook-source-dual';
        const layerId = target === 'main' ? 'outlook-layer' : 'outlook-layer-dual';
        const fillLayerId = `${layerId}-fill`;

        if (map.getSource(sourceId)) {
            map.getSource(sourceId).setData(EMPTY_FEATURE_COLLECTION);
        }
    }

    displayOutlookOnDualMap() {
        // Only called when dual map is already loaded
        if (!this.map?.dualMap) return;
        this.displayOutlookOnMap('dual');
    }
}

export default OutlookLayer;
