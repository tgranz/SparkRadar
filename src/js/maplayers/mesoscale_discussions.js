/*
Mesoscale Discussion Layer
Manages mesoscale discussion display on the map

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import Dialog from "../ui/dialog.js";
import Window from "../ui/window.js";
import { hasUsableMapStyle, waitForMapStyleReady, waitForRadarLayer, pointInPolygon, getWeatherOutlineBeforeLayerId } from "./layer_utils.js";

const EMPTY_FEATURE_COLLECTION = {
    type: 'FeatureCollection',
    features: []
};

const SYNC_PENDING_STALE_MS = 15000;

class MesoscaleDiscussionLayer {
    constructor(mapInstance) {
        this.map = mapInstance;

        // Mesoscale discussion tracking
        this.mesoscaleDiscussions = [];
        this.mdCache = { main: new globalThis.Map(), dual: new globalThis.Map() };
        this.mdSyncPending = { main: false, dual: false };
        this.mdSyncPendingSince = { main: 0, dual: 0 };

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

    _getAlertDetailsSurface() {
        const setting = window.settingsInstance?.getSetting('alertDetailsAppearIn');
        return setting === 'windows' ? 'windows' : 'dialogs';
    }

    _getAlertDetailsSurfaceLabel() {
        return this._getAlertDetailsSurface() === 'windows' ? 'Window' : 'Dialog';
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
                let preTextRaw = '';
                if (preMatch && preMatch[1]) {
                    preTextRaw = preMatch[1];
                    preText = preTextRaw
                        .replace(/\r?\n/g, '<br>')
                        .replace(/\s{2,}/g, ' ');
                }

                const watchProb = preTextRaw.match(/Probability of Watch Issuance\.+(\d+)/i)?.[1] ?? null;
                const extractPeakMetric = (metricLabel, unit) => {
                    const regex = new RegExp(
                        `most probable peak ${metricLabel}\\.+(?:up to\\s*)?(\\d+(?:\\.\\d+)?)(?:\\s*-\\s*(\\d+(?:\\.\\d+)?))?\\s*${unit}`,
                        'i'
                    );
                    const match = preTextRaw.match(regex);
                    if (!match) return null;

                    const start = match[1];
                    const end = match[2] ?? null;
                    const display = end ? `${start}-${end}` : start;
                    // Use the upper bound when present so color mapping reflects worst-case potential.
                    const numeric = parseFloat(end ?? start);
                    return {
                        display,
                        numeric: Number.isFinite(numeric) ? numeric : null
                    };
                };

                const peakWind = extractPeakMetric('wind gust', 'mph');
                const peakHail = extractPeakMetric('hail size', 'in');
                const peakTornado = extractPeakMetric('tornado intensity', 'mph');

                const severityColorScale = ['#ffffd5', '#ffed9a', '#ffbf64', '#ff8d2e', '#ec4412', '#d80000', '#ff2eff'];

                const windColor = peakWind?.numeric != null ? severityColorScale[Math.min(Math.max(0, Math.floor((peakWind.numeric - 60) / 5)), severityColorScale.length - 1)] : null;
                const hailColor = peakHail?.numeric != null ? severityColorScale[Math.min(Math.max(0, Math.floor((peakHail.numeric - 1.0) / 0.5)), severityColorScale.length - 1)] : null;
                const tornadoColor = peakTornado?.numeric != null ? severityColorScale[Math.min(Math.max(0, Math.floor((peakTornado.numeric - 90) / 15)), severityColorScale.length - 1)] : null;
                const watchProbColor = watchProb ? severityColorScale[Math.min(Math.round(parseFloat(watchProb) / 100 * 6), severityColorScale.length - 1)] : null;

                const html = `
                    <img src="https://www.spc.noaa.gov/products/md/mcd${String(num).padStart(4, '0')}.png?t=${Date.now()}" alt="SPC graphic" style="width: 100%; border-radius: 10px; margin: 0; height: auto;">

                    ${watchProb || peakHail || peakWind || peakTornado ? 
                        `<div class="product-highlight-strip">
                            ${watchProb ? `<div style="background: ${watchProbColor}55" class="product-highlight"><strong>Watch Probability:</strong> ${watchProb}%</div>` : ''}
                            ${peakTornado ? `<div style="background: ${tornadoColor}55" class="product-highlight"><strong>Peak Tornado Intensity:</strong> ${peakTornado.display} MPH</div>` : ''}
                            ${peakWind ? `<div style="background: ${windColor}55" class="product-highlight"><strong>Peak Wind Gust:</strong> ${peakWind.display} MPH</div>` : ''}
                            ${peakHail ? `<div style="background: ${hailColor}55" class="product-highlight"><strong>Peak Hail Size:</strong> ${peakHail.display} IN</div>` : ''}
                        </div>`
                        : ''
                    }

                    ${preText ? `<div style="margin-bottom: 15px;">
                        <p style="margin: 0; white-space: pre-wrap; line-height: 1.5; font-family: 'Consolas', mono, monospace; background: black; padding: 10px; border-radius: 10px; border: 1px solid var(--border-color); overflow-wrap: break-word; pointer-events: none; font-size: 0.85em;">${preText}</p>
                        </div>` : ''}
                `;
                if (this._getAlertDetailsSurface() === 'windows') {
                    new Window({
                        title,
                        icon: 'alert-triangle',
                        content: `<div style="color: white; padding: 20px; width: calc(100% - 40px);">${html}</div>`,
                width: 600,
                height: 700
                    });
                    return;
                }

                new Dialog(title, 'alert-triangle', `<div style="max-width: 600px;">${html}</div>`, {}, true);
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
                if (this._getAlertDetailsSurface() === 'windows') {
                    new Window({
                        title,
                        icon: 'alert-triangle',
                        html,
                        width: 760,
                        height: 620
                    });
                    return;
                }

                new Dialog(title, 'alert-triangle', html, {}, true);
            });
    }

    _scheduleMDSync(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        if (hasUsableMapStyle(map)) {
            this.mdSyncPending[target] = false;
            this.mdSyncPendingSince[target] = 0;
            waitForRadarLayer(map, target).then(() => {
                this._syncMDsToMap(target);
            });
            return;
        }

        if (this.mdSyncPending[target]) {
            const pendingAge = Date.now() - (this.mdSyncPendingSince[target] || 0);
            if (pendingAge < SYNC_PENDING_STALE_MS) {
                return;
            }
            console.warn(`[MesoscaleDiscussionLayer] Resetting stale sync pending flag for ${target} (age=${pendingAge}ms)`);
            this.mdSyncPending[target] = false;
        }
        this.mdSyncPending[target] = true;
        this.mdSyncPendingSince[target] = Date.now();

        waitForMapStyleReady(map).then(() => {
            this.mdSyncPending[target] = false;
            this.mdSyncPendingSince[target] = 0;
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
        const insertBeforeId = getWeatherOutlineBeforeLayerId(map, target);

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

    _areMesoscaleDiscussionsEnabled() {
        try {
            const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
            if (typeof settings.mesoscaleDiscussionsEnabled === 'boolean') {
                return settings.mesoscaleDiscussionsEnabled;
            }
        } catch {
        }

        const checkbox = document.getElementById('toggle-mesoscale-discussions-layer');
        return checkbox ? checkbox.checked : false;
    }

    displayMesoscaleDiscussionsOnMap(target = 'main') {
        if (!this._areMesoscaleDiscussionsEnabled()) {
            this.clearMesoscaleDiscussions(target);
            return;
        }

        this._scheduleMDSync(target);
    }

    displayMesoscaleDiscussions() {
        this.displayMesoscaleDiscussionsOnMap('main');
        if (this.map?.isSplit()) {
            this.displayMesoscaleDiscussionsOnMap('dual');
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
            const sourceId = target === 'main' ? `md-source-${key}` : `md-source-${key}-dual`;
            const source = map.getSource(sourceId);
            if (source) {
                source.setData(EMPTY_FEATURE_COLLECTION);
            }
        }
        cache.clear();
    }

    displayMesoscaleDiscussionsOnDualMap() {
        // Only called when dual map is already loaded
        if (!this.map?.dualMap) return;
        this.displayMesoscaleDiscussionsOnMap('dual');
    }
}

export default MesoscaleDiscussionLayer;
