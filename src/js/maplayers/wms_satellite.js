/*

> wms_satellite.js
Handles WMS raster satellite imagery layers on the map.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import { waitForMapStyleReady, hasUsableMapStyle } from './layer_utils.js';

const GOES_WEST_IR_WMS = 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_west.cgi?';

// MapLibre needs the WMS URL formatted as a tile URL with bbox template
function buildWmsTileUrl(wmsBaseUrl, layers) {
    const params = new URLSearchParams({
        SERVICE: 'WMS',
        VERSION: '1.1.1',
        REQUEST: 'GetMap',
        FORMAT: 'image/png',
        TRANSPARENT: 'true',
        LAYERS: layers,
        WIDTH: '256',
        HEIGHT: '256',
        SRS: 'EPSG:3857',
        STYLES: '',
    });
    return `${wmsBaseUrl}${params.toString()}&BBOX={bbox-epsg-3857}`;
}

const SOURCE_ID = 'wms-satellite';
const LAYER_ID = 'wms-satellite-layer';

export default class WmsSatelliteLayer {
    /**
     * @param {maplibregl.Map} map
     * @param {object} [options]
     * @param {string} [options.wmsUrl]       - WMS base URL
     * @param {string} [options.layers]       - WMS layer name(s)
     * @param {string} [options.beforeLayerId] - Insert before this map layer id
     */
    constructor(map, options = {}) {
        this._map = map;
        this._wmsUrl = options.wmsUrl || GOES_WEST_IR_WMS;
        this._layers = options.layers || 'conus_ch15';
        this._beforeLayerId = options.beforeLayerId || null;
        this._added = false;
        this._showPending = false;
    }

    /** Add the WMS source and layer to the map. No-op if already added. */
    async show() {
        if (this._showPending) return;
        this._showPending = true;

        try {
            if (!hasUsableMapStyle(this._map)) {
                await waitForMapStyleReady(this._map);
            }

            this._applyToMap();
        } finally {
            this._showPending = false;
        }
    }

    _applyToMap() {
        try {
            if (this._map.getLayer(LAYER_ID)) {
                this._map.setLayoutProperty(LAYER_ID, 'visibility', 'visible');
                return;
            }

            const tileUrl = buildWmsTileUrl(this._wmsUrl, this._layers);

            if (!this._map.getSource(SOURCE_ID)) {
                this._map.addSource(SOURCE_ID, {
                    type: 'raster',
                    tiles: [`${tileUrl}?cachebust=${Date.now()}`],
                    tileSize: 256,
                });
            }

            this.refreshInterval = setInterval(() => {
                if (this._map.getSource(SOURCE_ID)) {
                    this._map.getSource(SOURCE_ID).setTiles([`${tileUrl}?cachebust=${Date.now()}`]);
                    console.log('[WmsSatelliteLayer] Refreshed WMS tiles');
                }
            }, 60 * 1000); // Refresh every minute

            const beforeLayer = this._beforeLayerId && this._map.getLayer(this._beforeLayerId)
                ? this._beforeLayerId
                : this._findBeforeLayer();

            this._map.addLayer({
                id: LAYER_ID,
                type: 'raster',
                source: SOURCE_ID,
                paint: {
                    'raster-opacity': 0.85,
                },
            }, beforeLayer);

            this._added = true;
        } catch (err) {
            console.error('[WmsSatelliteLayer] Failed to apply layer:', err);
            this._added = false;
        }
    }

    /** Hide the WMS layer without removing it, so it can be quickly re-shown. */
    hide() {
        if (this._map.getLayer(LAYER_ID)) {
            this._map.setLayoutProperty(LAYER_ID, 'visibility', 'none');
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }
        }
    }

    /** Fully remove the layer and source from the map. */
    remove() {
        if (this._map.getLayer(LAYER_ID)) {
            this._map.removeLayer(LAYER_ID);
        }
        if (this._map.getSource(SOURCE_ID)) {
            this._map.removeSource(SOURCE_ID);
        }
        this._added = false;

        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    isVisible() {
        if (!this._map.getLayer(LAYER_ID)) return false;
        return this._map.getLayoutProperty(LAYER_ID, 'visibility') !== 'none';
    }

    /** Find the best layer to insert below (just above the basemap roads). */
    _findBeforeLayer() {
        const candidates = ['road_area_pier', 'road_pier'];
        for (const id of candidates) {
            if (this._map.getLayer(id)) return id;
        }
        return undefined;
    }
}
