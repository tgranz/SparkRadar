/*
Mesoscale Discussion Layer
Manages mesoscale discussion display on the map

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import Dialog from "../ui/dialog.js";
import { waitForRadarLayer, pointInPolygon } from "./layer_utils.js";

class MesoscaleDiscussionLayer {
    constructor(mapInstance) {
        this.map = mapInstance;

        // Mesoscale discussion tracking
        this.mesoscaleDiscussions = [];
        this.mdCache = { main: new globalThis.Map(), dual: new globalThis.Map() };
        this.mdSyncPending = { main: false, dual: false };

        // Listen for settings changes to update layer colors
        this.settingsChangeListener = (event) => {
            const { key, value } = event.detail;
            console.log(`[MesoscaleDiscussionLayer] Settings changed: ${key} = ${value}`);
            if (key === 'alert_mesoscale_discussion') {
                console.log('[MesoscaleDiscussionLayer] Updating MD colors...');
                this._updateMDColorsOnMaps();
            }
        };
        document.addEventListener('settingsChanged', this.settingsChangeListener);
    }

    setMesoscaleDiscussions(mds) {
        this.mesoscaleDiscussions = mds;
    }

    getMesoscaleDiscussions() {
        return this.mesoscaleDiscussions;
    }

    /**
     * Updates MD layer colors on both maps when the mesoscale discussion color setting changes
     */
    _updateMDColorsOnMaps() {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const settings = window.settingsInstance;
        const mdColor = settings?.getSetting('alert_mesoscale_discussion')?.color || '#fbbf24';

        console.log(`[MesoscaleDiscussionLayer] _updateMDColorsOnMaps called with color: ${mdColor}`);
        console.log(`[MesoscaleDiscussionLayer] mainMap exists: ${!!mainMap}, dualMap exists: ${!!dualMap}`);

        if (mainMap) {
            console.log(`[MesoscaleDiscussionLayer] Updating main map MD colors, cache size: ${this.mdCache.main.size}`);
            this._updateMDColorsOnMap('main', mdColor);
        }
        if (dualMap) {
            console.log(`[MesoscaleDiscussionLayer] Updating dual map MD colors, cache size: ${this.mdCache.dual.size}`);
            this._updateMDColorsOnMap('dual', mdColor);
        }
    }

    /**
     * Updates MD layer colors on a specific map
     */
    _updateMDColorsOnMap(target, mdColor) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        const cache = target === 'main' ? this.mdCache.main : this.mdCache.dual;
        console.log(`[MesoscaleDiscussionLayer] _updateMDColorsOnMap for ${target}: cache has ${cache.size} entries`);
        
        for (const key of cache.keys()) {
            const layerPrefix = target === 'main' ? `md-${key}` : `md-${key}-dual`;
            const outlineLayerId = `${layerPrefix}-outline`;
            const outlineOutlineLayerId = `${layerPrefix}-outline-outline`;

            console.log(`[MesoscaleDiscussionLayer] Checking layer: ${outlineLayerId}`);
            if (map.getLayer(outlineLayerId)) {
                console.log(`[MesoscaleDiscussionLayer] Found layer, updating color to ${mdColor}`);
                try {
                    map.setPaintProperty(outlineLayerId, 'line-color', mdColor);
                    console.log(`[MesoscaleDiscussionLayer] Successfully set paint property for ${outlineLayerId}`);
                    
                    // Also verify the property was set
                    const currentColor = map.getPaintProperty(outlineLayerId, 'line-color');
                    console.log(`[MesoscaleDiscussionLayer] Current paint property value: ${JSON.stringify(currentColor)}`);
                } catch (error) {
                    console.error(`[MesoscaleDiscussionLayer] Error setting paint property for ${outlineLayerId}:`, error);
                }
            } else {
                console.log(`[MesoscaleDiscussionLayer] Layer not found: ${outlineLayerId}`);
            }
        }
    }

    _getMesoscaleDiscussionsAtPoint(point) {
        const matches = [];
        for (const md of this.mesoscaleDiscussions) {
            const geometry = md?.geometry;
            if (!geometry) continue;
            const polygons = geometry.type === 'Polygon'
                ? [geometry.coordinates]
                : geometry.type === 'MultiPolygon'
                    ? geometry.coordinates
                    : [];

            for (const rings of polygons) {
                if (pointInPolygon(point, rings)) {
                    matches.push(md);
                    break;
                }
            }
        }
        return matches;
    }

    buildMDPopupSection(mesoscaleDiscussions) {
        if (!mesoscaleDiscussions || mesoscaleDiscussions.length === 0) return '';

        const settings = window.settingsInstance;
        const mdColor = settings?.getSetting('alert_mesoscale_discussion')?.color || '#fbbf24';

        const items = mesoscaleDiscussions.map((md, index) => {
            const props = md.properties || {};
            const num = props?.name?.replace('MD ', '') || 'Unknown';

            return `
                <div class="popup-item" data-type="md" data-index="${index}" style="cursor: pointer;">
                    <div class="popup-dot" style="background-color: ${mdColor};"></div>
                    <div>
                        <div class="popup-item-title">Mesoscale Discussion</div>
                        <div class="popup-meta">Number ${num}</div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="popup-section">
                <div class="popup-title">Mesoscale Discussions (${mesoscaleDiscussions.length})</div>
                <div class="popup-list">${items}</div>
            </div>
        `;
    }

    _showMDDialog(md) {
        const props = md.properties || {};
        const num = props?.name?.replace('MD ', '') || 'Unknown';
        const validTime = props.validtime || props.VALIDTIME || '';
        const title = `Mesoscale Discussion ${num}`;
        const settings = window.settingsInstance;
        const color = settings?.getSetting('alert_mesoscale_discussion')?.color || '#fbbf24';

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

        // Try to fetch SPC <pre> text for this MD
        const mdNum = String(num).padStart(4, '0');
        const spcUrl = `https://www.spc.noaa.gov/products/md/md${mdNum}.html`;
        fetch(spcUrl)
            .then(resp => resp.text())
            .then(htmlText => {
                const preMatch = htmlText.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
                let preText = '';
                if (preMatch && preMatch[1]) {
                    preText = preMatch[1]
                        .replace(/\r?\n/g, '<br>')
                        .replace(/\s{2,}/g, ' ');
                }
                const html = `
                    <div style="max-width: 600px;">
                        <div style="margin-bottom: 20px; padding: 15px; background: ${color}30; border-left: 4px solid ${color}; border-radius: 10px;">
                            <h3 style="margin: 0; text-align: left; color: ${color};">${title}</h3>
                            <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px; font-size: 0.9em;">
                                ${validTime ? `<strong>Valid Time:</strong> <span>${formatDate(validTime)}</span>` : ''}
                            </div>
                        </div>
                        ${preText ? `<div style="margin-bottom: 15px;">
                            <p style="margin: 0; white-space: pre-wrap; line-height: 1.5; font-family: 'Consolas', mono, monospace; background: black; padding: 10px; border-radius: 10px; border: 1px solid var(--border-color); overflow-wrap: break-word; font-size: 0.9em;">${preText}</p>
                            </div>` : ''}
                    </div>
                `;
                new Dialog(title, 'alert-triangle', html, {}, true);
            })
            .catch(() => {
                // fallback to basic dialog
                const html = `
                    <div style="max-width: 600px;">
                        <div style="margin-bottom: 20px; padding: 15px; background: ${color}30; border-left: 4px solid ${color}; border-radius: 10px;">
                            <h3 style="margin: 0 0 10px 0; text-align: left; color: ${color};">${title}</h3>
                            <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px; font-size: 0.9em;">
                                ${validTime ? `<strong>Valid Time:</strong> <span>${formatDate(validTime)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
                new Dialog(title, 'alert-triangle', html, {}, true);
            });
    }

    _scheduleMDSync(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        if (map.isStyleLoaded && map.isStyleLoaded()) {
            waitForRadarLayer(map, target).then(() => {
                this._syncMDsToMap(target);
            });
            return;
        }

        if (this.mdSyncPending[target]) return;
        this.mdSyncPending[target] = true;

        map.once('load', () => {
            this.mdSyncPending[target] = false;
            waitForRadarLayer(map, target).then(() => {
                this._syncMDsToMap(target);
            });
        });
    }

    _syncMDsToMap(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;


        const cache = target === 'main' ? this.mdCache.main : this.mdCache.dual;
        const nextKeys = new Set();
        const beforeLayerId = target === 'main' ? 'radar-webgl' : 'radar-webgl-dual';
        const insertBeforeId = map.getLayer(beforeLayerId) ? beforeLayerId : undefined;

        const settings = window.settingsInstance;
        const mdColor = settings?.getSetting('alert_mesoscale_discussion')?.color || '#fbbf24';
        this.mesoscaleDiscussions.forEach((md, index) => {
            const key = `md-${index}`;
            const signature = JSON.stringify(md);

            nextKeys.add(key);

            const sourceId = target === 'main' ? `md-source-${key}` : `md-source-${key}-dual`;
            const layerPrefix = target === 'main' ? `md-${key}` : `md-${key}-dual`;
            const cached = cache.get(key);

            if (!map.getSource(sourceId)) {
                map.addSource(sourceId, {
                    type: 'geojson',
                    data: md
                });
            } else if (!cached || cached.signature !== signature) {
                map.getSource(sourceId).setData(md);
            }

            // No fill for MDs, only outlines
            if (!map.getLayer(`${layerPrefix}-outline`)) {
                map.addLayer({
                    id: `${layerPrefix}-outline`,
                    type: 'line',
                    source: sourceId,
                    paint: {
                        'line-color': mdColor,
                        'line-width': 3,
                        'line-opacity': 1
                    }
                }, insertBeforeId);
            }

            if (!map.getLayer(`${layerPrefix}-outline-outline`)) {
                map.addLayer({
                    id: `${layerPrefix}-outline-outline`,
                    type: 'line',
                    source: sourceId,
                    paint: {
                        'line-color': '#ffffff',
                        'line-width': 5,
                        'line-opacity': 1
                    }
                }, `${layerPrefix}-outline`);
            }

            cache.set(key, { signature });
        });

        for (const key of cache.keys()) {
            if (!nextKeys.has(key)) {
                this._removeMDFromMap(target, key);
                cache.delete(key);
            }
        }
    }

    _removeMDFromMap(target, key) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        const layerPrefix = target === 'main' ? `md-${key}` : `md-${key}-dual`;
        const sourceId = target === 'main' ? `md-source-${key}` : `md-source-${key}-dual`;
        const layerIds = [
            `${layerPrefix}-outline-outline`,
            `${layerPrefix}-outline`
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

    displayMesoscaleDiscussions() {
        this._scheduleMDSync('main');
        if (this.map?.isSplit()) {
            this._scheduleMDSync('dual');
        }

        console.log(`[MesoscaleDiscussionLayer] Displayed ${this.mesoscaleDiscussions.length} mesoscale discussions`);
    }

    clearMesoscaleDiscussions(target = 'main') {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        const cache = target === 'main' ? this.mdCache.main : this.mdCache.dual;
        for (const key of cache.keys()) {
            this._removeMDFromMap(target, key);
        }
        cache.clear();
    }

    displayMesoscaleDiscussionsOnDualMap() {
        // Only called when dual map is already loaded
        if (!this.map?.dualMap) return;
        this._scheduleMDSync('dual');
    }
}

export default MesoscaleDiscussionLayer;
