/*
Outlook Layer
Manages SPC outlook display on the map

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import { waitForRadarLayer } from "./layer_utils.js";

class OutlookLayer {
    constructor(mapInstance) {
        this.map = mapInstance;

        // Outlook tracking
        this.currentOutlookDay = null; // 1, 2, 3, or null
        this.outlookData = null;
        this.outlookSyncPending = { main: false, dual: false };
    }

    setOutlookData(day, data) {
        this.currentOutlookDay = day;
        this.outlookData = data;
    }

    getOutlookData() {
        return this.outlookData;
    }

    getCurrentOutlookDay() {
        return this.currentOutlookDay;
    }

    async fetchOutlook(day) {
        if (![1, 2, 3].includes(day)) {
            console.error('[OutlookLayer] Invalid outlook day:', day);
            return;
        }

        try {
            const url = `https://www.spc.noaa.gov/products/outlook/day${day}otlk_cat.nolyr.geojson`;
            const response = await fetch(url, {
                headers: { 'Accept': 'Application/geo+json' },
                signal: AbortSignal.timeout(5000)
            });
            
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data?.features) {
                this.currentOutlookDay = day;
                this.outlookData = data;
                this.displayOutlook();
            }
        } catch (error) {
            console.error('[OutlookLayer] Error fetching outlook:', error);
        }
    }

    _scheduleOutlookSync(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        if (map.isStyleLoaded && map.isStyleLoaded()) {
            waitForRadarLayer(map, target).then(() => {
                this._syncOutlookToMap(target);
            });
            return;
        }

        if (this.outlookSyncPending[target]) return;
        this.outlookSyncPending[target] = true;

        map.once('load', () => {
            this.outlookSyncPending[target] = false;
            waitForRadarLayer(map, target).then(() => {
                this._syncOutlookToMap(target);
            });
        });
    }

    _syncOutlookToMap(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;
        if (map.isStyleLoaded && !map.isStyleLoaded()) return;
        if (!this.outlookData || !this.outlookData.features) return;

        const sourceId = target === 'main' ? 'outlook-source' : 'outlook-source-dual';
        const layerId = target === 'main' ? 'outlook-layer' : 'outlook-layer-dual';
        const fillLayerId = `${layerId}-fill`;
        const beforeLayerId = target === 'main' ? 'radar-webgl' : 'radar-webgl-dual';

        // Remove existing layers/sources
        if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
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
            paint: {
                'fill-color': ['get', 'fill'],
                'fill-opacity': 0.3
            }
        }, beforeLayerId);

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
        }, beforeLayerId);
    }

    displayOutlook() {
        this._scheduleOutlookSync('main');
        if (this.map?.isSplit()) {
            this._scheduleOutlookSync('dual');
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

        if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
        }
        if (map.getLayer(fillLayerId)) {
            map.removeLayer(fillLayerId);
        }
        if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
        }
    }

    displayOutlookOnDualMap() {
        // Only called when dual map is already loaded
        if (!this.map?.dualMap) return;
        if (!this.outlookData) return;
        this._scheduleOutlookSync('dual');
    }
}

export default OutlookLayer;
