/*
Watch Layer
Manages watch display on the map

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import Dialog from "../ui/dialog.js";
import Window from "../ui/window.js";
import { hasUsableMapStyle, waitForMapStyleReady, pointInPolygon, getWeatherFillBeforeLayerId, getWeatherOutlineBeforeLayerId } from "./layer_utils.js";

const EMPTY_FEATURE_COLLECTION = {
    type: 'FeatureCollection',
    features: []
};

const SYNC_PENDING_STALE_MS = 15000;

class WatchLayer {
    constructor(mapInstance) {
        this.map = mapInstance;

        // Watch tracking
        this.watches = [];
        this.watchCache = { main: new globalThis.Map(), dual: new globalThis.Map() };
        this.watchSyncPending = { main: false, dual: false };
        this.watchSyncPendingSince = { main: 0, dual: 0 };

        // Listen for settings changes to update layer colors
        this.settingsChangeListener = (event) => {
            const { key, value } = event.detail;
            console.log(`[WatchLayer] Settings changed: ${key} = ${value}`);
            if (key === 'alert_tornado_watch' || key === 'alert_severe_thunderstorm_watch') {
                console.log('[WatchLayer] Updating watch colors...');
                this._updateWatchColorsOnMaps();
            }
        };
        document.addEventListener('settingsChanged', this.settingsChangeListener);
    }

    _getAlertDetailsSurface() {
        const setting = window.settingsInstance?.getSetting('alertDetailsAppearIn');
        return setting === 'windows' ? 'windows' : 'dialogs';
    }

    _getAlertDetailsSurfaceLabel() {
        return this._getAlertDetailsSurface() === 'windows' ? 'Window' : 'Dialog';
    }

    setWatches(watches) {
        this.watches = watches;
    }

    getWatches() {
        return this.watches;
    }

    /**
     * Updates watch layer colors on both maps when watch color settings change
     */
    _updateWatchColorsOnMaps() {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;

        console.log(`[WatchLayer] _updateWatchColorsOnMaps called`);
        console.log(`[WatchLayer] mainMap exists: ${!!mainMap}, dualMap exists: ${!!dualMap}`);

        if (mainMap) {
            console.log(`[WatchLayer] Updating main map watch colors, cache size: ${this.watchCache.main.size}`);
            this._updateWatchColorsOnMap('main');
        }
        if (dualMap) {
            console.log(`[WatchLayer] Updating dual map watch colors, cache size: ${this.watchCache.dual.size}`);
            this._updateWatchColorsOnMap('dual');
        }
    }

    /**
     * Updates watch layer colors on a specific map
     */
    _updateWatchColorsOnMap(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        const cache = target === 'main' ? this.watchCache.main : this.watchCache.dual;
        console.log(`[WatchLayer] _updateWatchColorsOnMap for ${target}: cache has ${cache.size} entries`);

        for (let i = 0; i < this.watches.length; i++) {
            const watch = this.watches[i];
            const key = this._getWatchKey(watch, i);
            const colors = this._getWatchColor(watch);
            if (!colors) continue;

            const layerPrefix = target === 'main' ? `watch-${key}` : `watch-${key}-dual`;
            const fillLayerId = `${layerPrefix}-fill`;
            const outlineLayerId = `${layerPrefix}-outline`;
            const colorSignature = `${colors.fill}|${colors.outline}`;

            console.log(`[WatchLayer] Checking layers: ${fillLayerId}, ${outlineLayerId}`);
            if (map.getLayer(fillLayerId)) {
                console.log(`[WatchLayer] Found fill layer, updating color to ${colors.fill}`);
                try {
                    map.setPaintProperty(fillLayerId, 'fill-color', colors.fill);
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
                console.log(`[WatchLayer] Found outline layer, updating color to ${colors.outline}`);
                try {
                    map.setPaintProperty(outlineLayerId, 'line-color', colors.outline);
                    console.log(`[WatchLayer] Successfully set paint property for ${outlineLayerId}`);
                    const currentColor = map.getPaintProperty(outlineLayerId, 'line-color');
                    console.log(`[WatchLayer] Current line color: ${JSON.stringify(currentColor)}`);
                } catch (error) {
                    console.error(`[WatchLayer] Error setting line color for ${outlineLayerId}:`, error);
                }
            } else {
                console.log(`[WatchLayer] Outline layer not found: ${outlineLayerId}`);
            }

            // Update cache with new color signature
            const cached = cache.get(key);
            if (cached) {
                cached.colorSignature = colorSignature;
            }
        }
    }

    _convertWatchToGeoJSON(watch) {
        if (!watch) return null;

        if (watch.type === 'Feature' && watch.geometry) {
            return watch;
        }

        if (watch.geometry) {
            return {
                type: 'Feature',
                properties: watch.properties || {},
                geometry: watch.geometry,
                ...(watch.id !== undefined ? { id: watch.id } : {})
            };
        }

        return null;
    }

    _getWatchColor(watch) {
        // Use custom colors from alert settings if available
        const settings = window.settingsInstance;
        const watchType = watch?.properties?.type;
        const isPds = !!watch?.properties?.is_pds;

        if (watchType === 'TOR') {
            const torColor = settings?.getSetting('alert_tornado_watch')?.color || '#ff2121';
            return { fill: '#00000000', outline: torColor, name: 'Tornado Watch' };
        }
        if (watchType === 'SVR') {
            const svrColor = settings?.getSetting('alert_severe_thunderstorm_watch')?.color || '#ff9900';
            return { fill: '#00000000', outline: svrColor, name: 'Severe Thunderstorm Watch' };
        }
        return null;
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
            const pds = props.is_pds || false;
            const title = `${label}${number}`;
            const issued = props.issue ? `Issued: ${alertIssued}` : '';
            const expiry = props.expire ? `Expires ${alertExpiry}` : '';
            const meta = expiry;

            return `
                <div class="popup-item" data-type="watch" data-index="${index}" style="cursor: pointer;">
                    <span class="popup-dot" style="background: ${colors.outline}"></span>
                    <div>
                        <div class="popup-item-title">${pds ? '<b style="color:#ff00ff;">PDS</b> ' : ''}${title}</div>
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
        const pds = props.is_pds || false;
        const title = `${label}${number}`;
        const watchNumber = Number.isFinite(props.number) ? String(props.number).padStart(4, '0') : null;
        
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

        const buildWatchHtml = (preText = '') => `
            <div style="margin-bottom: 20px; padding: 15px; background: ${colors.outline}30; border-left: 4px solid ${colors.outline}; border-radius: 10px;">
                <h3 style="margin: 0 0 10px 0; text-align: left; color: ${colors.outline};">${props.is_pds ? '<b style="color:#ff00ff;">PDS</b> ' : ''}${title}</h3>
                <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px; font-size: 0.9em;">
                    <strong>Issued:</strong> <span>${formatDate(props.issue)}</span>
                    <strong>Expires:</strong> <span>${formatDate(props.expire)}</span>
                </div>
            </div>

            ${watchNumber ? `<img src="https://www.spc.noaa.gov/products/watch/ww${watchNumber}_radar.gif?t=${Date.now()}" alt="SPC graphic unavailable at this time." style="width: 100%; border-radius: 10px; margin: 0; height: auto;">` : ''}

            ${preText ? `<div style="margin-top: 15px; margin-bottom: 15px;">
                <p style="margin: 0; white-space: pre-wrap; line-height: 1.5; font-family: 'Consolas', mono, monospace; background: black; padding: 10px; border-radius: 10px; border: 1px solid var(--border-color); overflow-wrap: break-word; pointer-events: none; font-size: 0.85em;">${preText}</p>
            </div>` : ''}
        `;

        const showWatchDetails = (preText = '') => {
            const html = buildWatchHtml(preText);
            if (this._getAlertDetailsSurface() === 'windows') {
                new Window({
                    title,
                    icon: 'eye',
                    content: `<div style="color: white; padding: 20px; width: calc(100% - 40px);">${html}</div>`,
                    width: 600,
                    height: 700
                });
                return;
            }

            new Dialog(title, 'eye', `<div style="max-width: 600px;">${html}</div>`, {}, true);
        };

        if (!watchNumber) {
            showWatchDetails();
            return;
        }

        const spcUrl = `https://www.spc.noaa.gov/products/watch/ww${watchNumber}.html`;
        fetch(spcUrl)
            .then((resp) => resp.text())
            .then((htmlText) => {
                const preMatch = htmlText.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
                const preTextRaw = preMatch?.[1] || '';
                const preText = preTextRaw
                    .replace(/\r?\n/g, '<br>')
                    .replace(/\s{2,}/g, ' ');
                showWatchDetails(preText);
            })
            .catch(() => {
                showWatchDetails();
            });
    }

    _scheduleWatchSync(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        if (hasUsableMapStyle(map)) {
            this.watchSyncPending[target] = false;
            this.watchSyncPendingSince[target] = 0;
            this._syncWatchesToMap(target);
            return;
        }

        if (this.watchSyncPending[target]) {
            const pendingAge = Date.now() - (this.watchSyncPendingSince[target] || 0);
            if (pendingAge < SYNC_PENDING_STALE_MS) {
                return;
            }
            console.warn(`[WatchLayer] Resetting stale sync pending flag for ${target} (age=${pendingAge}ms)`);
            this.watchSyncPending[target] = false;
        }
        this.watchSyncPending[target] = true;
        this.watchSyncPendingSince[target] = Date.now();

        waitForMapStyleReady(map).then(() => {
            this.watchSyncPending[target] = false;
            this.watchSyncPendingSince[target] = 0;
            this._syncWatchesToMap(target);
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
        if (!hasUsableMapStyle(map)) {
            this._scheduleWatchSync(target);
            return;
        }

        const cache = target === 'main' ? this.watchCache.main : this.watchCache.dual;
        const nextKeys = new Set();
        const fillBeforeLayerId = getWeatherFillBeforeLayerId(map, target);
        const outlineBeforeLayerId = getWeatherOutlineBeforeLayerId(map, target);

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
            const outlineLayerId = `${layerPrefix}-outline`;
            const outlineOutlineLayerId = `${layerPrefix}-outline-outline`;
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
                }, fillBeforeLayerId);
            }

            if (!map.getLayer(outlineLayerId)) {
                map.addLayer({
                    id: outlineLayerId,
                    type: 'line',
                    source: sourceId,
                    paint: {
                        'line-color': colors.outline,
                        'line-width': 2,
                        'line-opacity': 1
                    }
                }, outlineBeforeLayerId);
            }

            if (!map.getLayer(outlineOutlineLayerId)) {
                map.addLayer({
                    id: outlineOutlineLayerId,
                    type: 'line',
                    source: sourceId,
                    paint: {
                        'line-color': '#000000',
                        'line-width': 6,
                        'line-opacity': 1
                    }
                }, outlineLayerId);
            } else if (map.getLayer(outlineLayerId)) {
                // Keep black casing below the colored outline
                map.moveLayer(outlineOutlineLayerId, outlineLayerId);
            }

            if (!cached || cached.colorSignature !== colorSignature) {
                if (map.getLayer(`${layerPrefix}-fill`)) {
                    map.setPaintProperty(`${layerPrefix}-fill`, 'fill-color', colors.fill);
                }
                if (map.getLayer(outlineLayerId)) {
                    map.setPaintProperty(outlineLayerId, 'line-color', colors.outline);
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

        this.map?.layers?.applyLayerOrder(target);
    }

    _areWatchesEnabled() {
        try {
            const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
            if (typeof settings.watchesEnabled === 'boolean') {
                return settings.watchesEnabled;
            }
        } catch {
        }

        const checkbox = document.getElementById('toggle-watches-layer');
        return checkbox ? checkbox.checked : true;
    }

    displayWatchesOnMap(target = 'main') {
        if (!this._areWatchesEnabled()) {
            this.clearWatches(target);
            return;
        }

        this._scheduleWatchSync(target);
    }

    displayWatches() {
        this.displayWatchesOnMap('main');
        if (this.map?.isSplit()) {
            this.displayWatchesOnMap('dual');
        }

        console.log(`[WatchLayer] Displayed ${this.watches.length} watches`);
    }

    displayWatchesOnDualMap() {
        // Only called when dual map is already loaded
        if (!this.map?.dualMap) return;
        this.displayWatchesOnMap('dual');
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
            const sourceId = target === 'main' ? `watch-source-${key}` : `watch-source-${key}-dual`;
            const source = map.getSource(sourceId);
            if (source) {
                source.setData(EMPTY_FEATURE_COLLECTION);
            }
        }
        cache.clear();
    }
}

export default WatchLayer;
