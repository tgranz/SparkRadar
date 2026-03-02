/*
Watch Layer
Manages watch display on the map

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import Dialog from "../ui/dialog.js";
import { waitForRadarLayer, pointInPolygon } from "./layer_utils.js";

class WatchLayer {
    constructor(mapInstance) {
        this.map = mapInstance;

        // Watch tracking
        this.watches = [];
        this.watchCache = { main: new globalThis.Map(), dual: new globalThis.Map() };
        this.watchSyncPending = { main: false, dual: false };

        // Listen for settings changes to update layer colors
        this.settingsChangeListener = (event) => {
            const { key, value } = event.detail;
            console.log(`[WatchLayer] Settings changed: ${key} = ${value}`);
            if (key === 'watchColor') {
                console.log('[WatchLayer] Updating watch colors...');
                this._updateWatchColorsOnMaps();
            }
        };
        document.addEventListener('settingsChanged', this.settingsChangeListener);
    }

    setWatches(watches) {
        this.watches = watches;
    }

    getWatches() {
        return this.watches;
    }

    /**
     * Updates watch layer colors on both maps when the watchColor setting changes
     */
    _updateWatchColorsOnMaps() {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const settings = window.settingsInstance;
        const customColor = settings?.getSetting('watchColor') || '#38bdf8';

        console.log(`[WatchLayer] _updateWatchColorsOnMaps called with color: ${customColor}`);
        console.log(`[WatchLayer] mainMap exists: ${!!mainMap}, dualMap exists: ${!!dualMap}`);

        if (mainMap) {
            console.log(`[WatchLayer] Updating main map watch colors, cache size: ${this.watchCache.main.size}`);
            this._updateWatchColorsOnMap('main', customColor);
        }
        if (dualMap) {
            console.log(`[WatchLayer] Updating dual map watch colors, cache size: ${this.watchCache.dual.size}`);
            this._updateWatchColorsOnMap('dual', customColor);
        }
    }

    /**
     * Updates watch layer colors on a specific map
     */
    _updateWatchColorsOnMap(target, customColor) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        const cache = target === 'main' ? this.watchCache.main : this.watchCache.dual;
        console.log(`[WatchLayer] _updateWatchColorsOnMap for ${target}: cache has ${cache.size} entries`);

        for (const key of cache.keys()) {
            const layerPrefix = target === 'main' ? `watch-${key}` : `watch-${key}-dual`;
            const fillLayerId = `${layerPrefix}-fill`;
            const outlineLayerId = `${layerPrefix}-outline`;

            console.log(`[WatchLayer] Checking layers: ${fillLayerId}, ${outlineLayerId}`);
            if (map.getLayer(fillLayerId)) {
                console.log(`[WatchLayer] Found fill layer, updating color to ${customColor}`);
                try {
                    map.setPaintProperty(fillLayerId, 'fill-color', customColor);
                    console.log(`[WatchLayer] Successfully set paint property for ${fillLayerId}`);
                    const currentColor = map.getPaintProperty(fillLayerId, 'fill-color');
                    console.log(`[WatchLayer] Current fill color: ${JSON.stringify(currentColor)}`);
                } catch (error) {
                    console.error(`[WatchLayer] Error setting fill color for ${fillLayerId}:`, error);
                }
            } else {
                console.log(`[WatchLayer] Fill layer not found: ${fillLayerId}`);
            }
            if (map.getLayer(outlineLayerId)) {
                console.log(`[WatchLayer] Found outline layer, updating color to ${customColor}`);
                try {
                    map.setPaintProperty(outlineLayerId, 'line-color', customColor);
                    console.log(`[WatchLayer] Successfully set paint property for ${outlineLayerId}`);
                    const currentColor = map.getPaintProperty(outlineLayerId, 'line-color');
                    console.log(`[WatchLayer] Current line color: ${JSON.stringify(currentColor)}`);
                } catch (error) {
                    console.error(`[WatchLayer] Error setting line color for ${outlineLayerId}:`, error);
                }
            } else {
                console.log(`[WatchLayer] Outline layer not found: ${outlineLayerId}`);
            }
        }
    }

    _convertWatchToGeoJSON(watch) {
        if (!watch || watch.type !== 'Feature') return null;
        return watch;
    }

    _getWatchColor(watch) {
        // Use custom color from settings if available
        const settings = window.settingsInstance;
        const customColor = settings?.getSetting('watchColor') || '#38bdf8';
        const watchType = watch?.properties?.type;
        const isPds = !!watch?.properties?.is_pds;

        if (watchType === 'TOR') {
            return { fill: isPds ? customColor : customColor, outline: '#ffb3b3', name: 'Tornado Watch' };
        }
        if (watchType === 'SVR') {
            return { fill: isPds ? customColor : customColor, outline: '#fde68a', name: 'Severe Thunderstorm Watch' };
        }
        return { fill: customColor, outline: '#bae6fd', name: 'Watch' };
    }

    _getWatchKey(watch, index) {
        const rawKey = watch?.id ?? watch?.properties?.number ?? `${index}`;
        return String(rawKey).replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    _getWatchSignature(watch) {
        return JSON.stringify({
            id: watch.id,
            properties: watch.properties,
            geometry: watch.geometry
        });
    }

    _getWatchesAtPoint(point) {
        const matches = [];
        for (const watch of this.watches) {
            const geometry = watch?.geometry;
            if (!geometry) continue;
            const polygons = geometry.type === 'Polygon'
                ? [geometry.coordinates]
                : geometry.type === 'MultiPolygon'
                    ? geometry.coordinates
                    : [];

            for (const rings of polygons) {
                if (pointInPolygon(point, rings)) {
                    matches.push(watch);
                    break;
                }
            }
        }
        return matches;
    }

    buildWatchPopupSection(watches) {
        if (!watches || watches.length === 0) return '';

        const items = watches.map((watch, index) => {
            const alertIssued = new Date(watch?.properties?.issue).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const alertExpiry = (() => {
                const now = new Date();
                const expiryDate = new Date(watch?.properties?.expire);
                const diffMs = expiryDate - now;
                const diffMins = Math.floor(diffMs / 60000);
                
                if (diffMins < 0) return 'expired';
                if (diffMins < 60) return `in ${diffMins}m`;
                
                const hours = Math.floor(diffMins / 60);
                const mins = diffMins % 60;
                return mins > 0 ? `in ${hours}h ${mins}m` : `in ${hours}h`;
            })();

            const colors = this._getWatchColor(watch);
            const props = watch.properties || {};
            const label = colors.name;
            const number = Number.isFinite(props.number) ? ` #${props.number}` : '';
            const pds = props.is_pds ? ' (PDS)' : '';
            const title = `${label}${number}${pds}`;
            const issued = props.issue ? `Issued: ${alertIssued}` : '';
            const expiry = props.expire ? `Expires ${alertExpiry}` : '';
            const meta = expiry;

            return `
                <div class="popup-item" data-type="watch" data-index="${index}" style="cursor: pointer;">
                    <span class="popup-dot" style="background: ${colors.fill}"></span>
                    <div>
                        <div class="popup-item-title">${title}</div>
                        ${meta ? `<div class=\"popup-meta\">${meta}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="popup-section">
                <div class="popup-title">Watches (${watches.length})</div>
                <div class="popup-list">${items}</div>
            </div>
        `;
    }

    _showWatchDialog(watch) {
        const colors = this._getWatchColor(watch);
        const props = watch.properties || {};
        const label = colors.name;
        const number = Number.isFinite(props.number) ? ` #${props.number}` : '';
        const pds = props.is_pds ? ' (PDS)' : '';
        const title = `${label}${number}${pds}`;
        
        const formatDate = (dateStr) => {
            if (!dateStr) return 'N/A';
            const date = new Date(dateStr);
            return date.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        };

        const html = `
            <div style="max-width: 600px;">
                <div style="margin-bottom: 20px; padding: 15px; background: ${colors.fill}30; border-left: 4px solid ${colors.fill}; border-radius: 10px;">
                    <h3 style="margin: 0 0 10px 0; text-align: left; color: ${colors.fill};">${props.is_pds ? 'PDS ' : ''}${title}</h3>
                    <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px; font-size: 0.9em;">
                        <strong>Issued:</strong> <span>${formatDate(props.issue)}</span>
                        <strong>Expires:</strong> <span>${formatDate(props.expire)}</span>
                    </div>
                </div>
            </div>
        `;

        new Dialog(title, 'eye', html, {}, true);
    }

    _scheduleWatchSync(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        if (map.isStyleLoaded && map.isStyleLoaded()) {
            waitForRadarLayer(map, target).then(() => {
                this._syncWatchesToMap(target);
            });
            return;
        }

        if (this.watchSyncPending[target]) return;
        this.watchSyncPending[target] = true;

        map.once('load', () => {
            this.watchSyncPending[target] = false;
            waitForRadarLayer(map, target).then(() => {
                this._syncWatchesToMap(target);
            });
        });
    }

    _removeWatchFromMap(target, key) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        const layerPrefix = target === 'main' ? `watch-${key}` : `watch-${key}-dual`;
        const sourceId = target === 'main' ? `watch-source-${key}` : `watch-source-${key}-dual`;
        const layerIds = [
            `${layerPrefix}-outline-outline`,
            `${layerPrefix}-outline`,
            `${layerPrefix}-fill`
        ];

        layerIds.forEach(layerId => {
            if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
            }
        });

        if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
        }
    }

    _syncWatchesToMap(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;
        if (map.isStyleLoaded && !map.isStyleLoaded()) return;

        const cache = target === 'main' ? this.watchCache.main : this.watchCache.dual;
        const nextKeys = new Set();
        const beforeLayerId = target === 'main' ? 'radar-webgl' : 'radar-webgl-dual';

        this.watches.forEach((watch, index) => {
            const key = this._getWatchKey(watch, index);
            const signature = this._getWatchSignature(watch);
            const geojson = this._convertWatchToGeoJSON(watch);
            if (!geojson) return;
            const colors = this._getWatchColor(watch);
            const colorSignature = `${colors.fill}|${colors.outline}`;

            nextKeys.add(key);

            const sourceId = target === 'main' ? `watch-source-${key}` : `watch-source-${key}-dual`;
            const layerPrefix = target === 'main' ? `watch-${key}` : `watch-${key}-dual`;
            const cached = cache.get(key);

            if (!map.getSource(sourceId)) {
                map.addSource(sourceId, {
                    type: 'geojson',
                    data: geojson
                });
            } else if (!cached || cached.signature !== signature) {
                map.getSource(sourceId).setData(geojson);
            }

            if (!map.getLayer(`${layerPrefix}-fill`)) {
                map.addLayer({
                    id: `${layerPrefix}-fill`,
                    type: 'fill',
                    source: sourceId,
                    paint: {
                        'fill-color': colors.fill,
                        'fill-opacity': 0.25
                    }
                }, beforeLayerId);
            }

            if (!map.getLayer(`${layerPrefix}-outline`)) {
                map.addLayer({
                    id: `${layerPrefix}-outline`,
                    type: 'line',
                    source: sourceId,
                    paint: {
                        'line-color': colors.outline,
                        'line-width': 2,
                        'line-opacity': 1
                    }
                });
            }

            if (!map.getLayer(`${layerPrefix}-outline-outline`)) {
                map.addLayer({
                    id: `${layerPrefix}-outline-outline`,
                    type: 'line',
                    source: sourceId,
                    paint: {
                        'line-color': '#000000',
                        'line-width': 4,
                        'line-opacity': 1
                    }
                }, `${layerPrefix}-outline`);
            }

            if (!cached || cached.colorSignature !== colorSignature) {
                if (map.getLayer(`${layerPrefix}-fill`)) {
                    map.setPaintProperty(`${layerPrefix}-fill`, 'fill-color', colors.fill);
                }
                if (map.getLayer(`${layerPrefix}-outline`)) {
                    map.setPaintProperty(`${layerPrefix}-outline`, 'line-color', colors.outline);
                }
            }

            cache.set(key, { signature, colorSignature });
        });

        for (const key of cache.keys()) {
            if (!nextKeys.has(key)) {
                this._removeWatchFromMap(target, key);
                cache.delete(key);
            }
        }
    }

    displayWatches() {
        this._scheduleWatchSync('main');
        if (this.map?.isSplit()) {
            this._scheduleWatchSync('dual');
        }

        console.log(`[WatchLayer] Displayed ${this.watches.length} watches`);
    }

    displayWatchesOnDualMap() {
        // Only called when dual map is already loaded
        if (!this.map?.dualMap) return;
        this._scheduleWatchSync('dual');
    }

    clearWatches(target = 'main') {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) {
            if (target === 'main') {
                this.watchCache.main.clear();
            } else if (target === 'dual') {
                this.watchCache.dual.clear();
            }
            return;
        }

        const cache = target === 'main' ? this.watchCache.main : this.watchCache.dual;
        for (const key of cache.keys()) {
            this._removeWatchFromMap(target, key);
        }
        cache.clear();
    }
}

export default WatchLayer;
