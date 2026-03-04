/*
Storm Centers Layer
Manages NEXRAD storm center display on the map

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import Dialog from "../ui/dialog.js";
import { waitForRadarLayer } from "./layer_utils.js";

class StormCentersLayer {
    constructor(mapInstance) {
        this.map = mapInstance;

        // Storm center tracking
        this.allStormCenters = [];  // Unfiltered centers from API
        this.stormCenters = [];     // Current filtered centers
        this.centerCache = { main: new globalThis.Map(), dual: new globalThis.Map() };
        this.centerSyncPending = { main: false, dual: false };

        // Icons registered on the map
        this.iconsRegistered = { main: new Set(), dual: new Set() };

        // Event handler storage for cleanup
        this.eventHandlers = { main: new globalThis.Map(), dual: new globalThis.Map() };

        // Type filter for display
        this.enabledTypes = { tvs: false, hail: false };

        // Listen for settings changes to update layer colors
        this.settingsChangeListener = (event) => {
            const { key, value } = event.detail;
            console.log(`[StormCentersLayer] Settings changed: ${key} = ${value}`);
            if (key === 'stormCenterColor') {
                console.log('[StormCentersLayer] Updating storm center colors...');
                this._updateCenterColorsOnMaps();
            }
        };
        document.addEventListener('settingsChanged', this.settingsChangeListener);

        // Listen for station changes to update storm centers
        this.stationChangeListener = (event) => {
            const { station, mainOrSplit } = event.detail;
            console.log(`[StormCentersLayer] Station changed to ${station} on ${mainOrSplit} map`);
            // Filter and sync centers for the changed map
            this.stormCenters = this._filterCentersForStation(this.allStormCenters, station);
            if (mainOrSplit === 'main') {
                this._scheduleCenterSync('main');
            } else if (mainOrSplit === 'split') {
                this._scheduleCenterSync('dual');
            }
        };
        document.addEventListener('stationChanged', this.stationChangeListener);
    }

    _filterCentersForStation(centers, station) {
        if (!station || !centers) return centers;
        
        // Add 'K' prefix if not present
        const stationCode = station.startsWith('K') ? station : `K${station}`;
        return centers.filter(center => {
            const radarProp = center?.properties?.nexrad;
            if (!radarProp) return false;
            // Handle both with and without K prefix
            const centerStation = radarProp.startsWith('K') ? radarProp : `K${radarProp}`;
            return centerStation === stationCode;
        });
    }

    setStormCenters(centers, currentStation = null) {
        // Always store the unfiltered centers
        this.allStormCenters = centers;
        
        // Filter centers to only show those matching the current station
        this.stormCenters = this._filterCentersForStation(centers, currentStation);
    }

    getStormCenters() {
        return this.stormCenters;
    }

    /**
     * Set which types of centers should be displayed
     */
    setEnabledTypes({ tvs = false, hail = false } = {}) {
        this.enabledTypes = { tvs, hail };
        // Re-sync centers to apply the new filter
        this._scheduleCenterSync('main');
        if (this.map?.isSplit && this.map.isSplit()) {
            this._scheduleCenterSync('dual');
        }
    }

    /**
     * Register triangle icons on the map
     */
    _registerIcons(map, target) {
        const icons = this.iconsRegistered[target];
        const tvsColor = '#ff2121'; // red
        const hailColor = '#00ffaf'; // green

        // Register TVS icon (red, upside-down triangle)
        this._createAndRegisterIcon(map, 'tvs-triangle', tvsColor, true);
        icons.add('tvs-triangle');

        // Register Hail icon (green, right-side-up triangle)
        this._createAndRegisterIcon(map, 'hail-triangle', hailColor, false);
        icons.add('hail-triangle');
    }

    /**
     * Create and register a triangle icon
     */
    _createAndRegisterIcon(map, iconName, color, inverted = false) {
        try {
            const size = 32;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

            const points = inverted
                // Upside-down triangle (pointing down)
                ? [[2, 2], [size - 2, 2], [size / 2, size - 2]]
                // Right-side-up triangle (pointing up)
                : [[size / 2, 2], [size - 2, size - 2], [2, size - 2]];

            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 5;
            
            ctx.beginPath();
            ctx.moveTo(points[0][0], points[0][1]);
            ctx.lineTo(points[1][0], points[1][1]);
            ctx.lineTo(points[2][0], points[2][1]);
            ctx.closePath();
            ctx.stroke();

            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(points[0][0], points[0][1]);
            ctx.lineTo(points[1][0], points[1][1]);
            ctx.lineTo(points[2][0], points[2][1]);
            ctx.closePath();
            ctx.stroke();

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            if (map.hasImage(iconName)) {
                map.removeImage(iconName);
            }
            map.addImage(iconName, imageData, { pixelRatio: 1 });
        } catch (e) {
            console.warn(`[StormCentersLayer] Could not register ${iconName}:`, e);
        }
    }

    /**
     * Determine if this is a TVS or hail center
     * Returns 'tvs', 'hail', or null if neither condition is met
     */
    _getCenterType(center) {
        const props = center?.properties || {};
        
        // Check for TVS property
        if (props.tvs === 'TVS') {
            return 'tvs';
        }
        
        // Check for hail (posh > 0)
        if (props.posh > 0) {
            return 'hail';
        }
        
        // No valid severe weather signature
        return null;
    }

    /**
     * Get the color for a center
     */
    _getCenterColor(center) {
        const type = this._getCenterType(center);
        if (type === 'tvs') {
            return '#ff2121'; // red
        }
        return '#00ffaf'; // green for hail
    }

    /**
     * Get a unique key for a center
     */
    _getCenterKey(center, index) {
        const props = center?.properties || {};
        const stormId = props.storm_id || `center-${index}`;
        const nexrad = props.nexrad || 'unknown';
        return `${nexrad}-${stormId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    /**
     * Get signature of a center for change detection
     */
    _getCenterSignature(center) {
        return JSON.stringify({
            id: center.id,
            properties: center.properties,
            geometry: center.geometry
        });
    }

    /**
     * Show dialog for a storm center
     */
    _showCenterDialog(center) {
        const props = center.properties || {};
        const type = this._getCenterType(center);
        const color = this._getCenterColor(center);
        const typeLabel = type === 'tvs' ? 'TVS Signature' : 'Hail Center';
        const nexrad = `K${props.nexrad || 'Unknown'}`
        const title = `${nexrad} - Storm ${props.storm_id}`;

        const formatValue = (value, round = 2) => {
            if (value === null || value === undefined) return 'N/A';
            if (typeof value === 'number') return value.toFixed(round);
            return value.toString();
        };

        const html = `
            <div style="max-width: 600px;">
                <div style="margin-bottom: 20px; padding: 15px; background: ${color}30; border-left: 4px solid ${color}; border-radius: 10px;">
                    <h3 style="margin: 0 0 10px 0; text-align: left; color: ${color};">${typeLabel}</h3>
                    <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px; font-size: 0.9em;">
                        <strong>Tracked by radar:</strong> <span>${nexrad}</span>
                        <strong>Cell ID:</strong> <span>${props.storm_id}</span>
                        <strong>From ${nexrad}:</strong> <span>${formatValue(props.range, 0)} nmi @ ${formatValue(props.azimuth, 0)}°</span>
                        <strong>Movement:</strong> <span>${formatValue(props.drct, 0)}° @ ${formatValue(props.sknt, 0)} kt</span>
                        <strong>Max dBZ:</strong> <span>${formatValue(props.max_dbz, 1)} dBZ at ${formatValue(props.max_dbz_height, 0)} km AGL</span>
                        <strong>Storm Top:</strong> <span>${formatValue(props.top, 1)} km AGL</span>
                        <strong>VIL:</strong> <span>${formatValue(props.vil, 1)} kg/m²</span>
                        <strong>PoSH:</strong> <span>${formatValue(props.posh, 0)}%</span>
                        <strong>PoH:</strong> <span>${formatValue(props.poh, 0)}%</span>
                        <strong>Max Hail Size:</strong> <span>${formatValue(props.max_size, 2)} in</span>
                        <strong>TVS:</strong> <span>${props.tvs !== "NONE" ? "TVS DETECTED" : 'NONE'}</span>
                    </div>
                </div>
            </div>
        `;

        new Dialog(title, typeLabel === 'TVS Signature' ? 'tornado' : 'cloud-storm', html, {}, true);
    }

    /**
     * Get centers at a point (using a buffer radius)
     */
    _getCentersAtPoint(point, radiusPixels = 15) {
        const matches = [];
        
        for (const center of this.allStormCenters) {
            const geometry = center?.geometry;
            if (!geometry || geometry.type !== 'Point') continue;

            const coords = geometry.coordinates;
            // Simple distance check (in degrees - not perfect but works for this)
            const distance = Math.sqrt(
                Math.pow(coords[0] - point[0], 2) + 
                Math.pow(coords[1] - point[1], 2)
            );
            
            // Convert rough pixel range to degrees (approximately 1 degree ≈ 111 km ≈ 72 miles)
            const radiusInDegrees = (radiusPixels * 20) / 111000; // rough conversion
            
            if (distance < radiusInDegrees) {
                matches.push(center);
            }
        }
        
        return matches;
    }

    /**
     * Schedule sync when map is ready
     */
    _scheduleCenterSync(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        if (map.isStyleLoaded && map.isStyleLoaded()) {
            waitForRadarLayer(map, target).then(() => {
                this._syncCentersToMap(target);
            });
            return;
        }

        if (this.centerSyncPending[target]) return;
        this.centerSyncPending[target] = true;

        map.once('load', () => {
            this.centerSyncPending[target] = false;
            waitForRadarLayer(map, target).then(() => {
                this._syncCentersToMap(target);
            });
        });
    }

    /**
     * Remove a center from the map
     */
    _removeCenterFromMap(target, key) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        const sourceId = target === 'main' ? `center-source-${key}` : `center-source-${key}-dual`;
        const layerId = target === 'main' ? `center-${key}` : `center-${key}-dual`;

        // Remove event handlers before removing the layer
        const handlers = target === 'main' ? this.eventHandlers.main : this.eventHandlers.dual;
        const layerHandlers = handlers.get(layerId);
        if (layerHandlers) {
            if (layerHandlers.click) {
                map.off('click', layerId, layerHandlers.click);
            }
            if (layerHandlers.mouseenter) {
                map.off('mouseenter', layerId, layerHandlers.mouseenter);
            }
            if (layerHandlers.mouseleave) {
                map.off('mouseleave', layerId, layerHandlers.mouseleave);
            }
            handlers.delete(layerId);
        }

        if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
        }

        if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
        }
    }

    /**
     * Sync centers to map
     */
    _syncCentersToMap(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        // Get the appropriate station for this map
        const station = target === 'main' ? this.map.currentMainStation : this.map.currentSplitStation;
        
        // Filter centers for the appropriate station
        const centersToDisplay = this._filterCentersForStation(this.allStormCenters, station);

        // Register icons first
        this._registerIcons(map, target);

        const cache = target === 'main' ? this.centerCache.main : this.centerCache.dual;
        const nextKeys = new Set();

        centersToDisplay.forEach((center, index) => {
            const key = this._getCenterKey(center, index);
            const signature = this._getCenterSignature(center);
            const type = this._getCenterType(center);
            
            // Skip centers without valid severe weather signature
            if (!type) return;
            
            // Skip centers whose type is not enabled
            if ((type === 'tvs' && !this.enabledTypes.tvs) || 
                (type === 'hail' && !this.enabledTypes.hail)) {
                return;
            }
            
            const color = this._getCenterColor(center);
            const iconName = type === 'tvs' ? 'tvs-triangle' : 'hail-triangle';

            nextKeys.add(key);

            const sourceId = target === 'main' ? `center-source-${key}` : `center-source-${key}-dual`;
            const layerId = target === 'main' ? `center-${key}` : `center-${key}-dual`;
            const cached = cache.get(key);

            // Create GeoJSON for this center
            const geojson = {
                type: 'Feature',
                geometry: center.geometry,
                properties: center.properties
            };

            // Add or update source
            if (!map.getSource(sourceId)) {
                map.addSource(sourceId, {
                    type: 'geojson',
                    data: geojson
                });
            } else if (!cached || cached.signature !== signature) {
                map.getSource(sourceId).setData(geojson);
            }

            // Add or update symbol layer
            if (!map.getLayer(layerId)) {
                map.addLayer({
                    id: layerId,
                    type: 'symbol',
                    source: sourceId,
                    layout: {
                        'icon-image': iconName,
                        'icon-size': 1,
                        'icon-allow-overlap': true
                    }
                });
                
                // Store handler references for cleanup
                const handlers = target === 'main' ? this.eventHandlers.main : this.eventHandlers.dual;
                const layerHandlers = {};
                
                // Add direct click handler for this marker
                layerHandlers.click = (e) => {
                    // Stop event propagation to prevent map click handler from firing
                    if (e.stopPropagation) {
                        e.stopPropagation();
                    }
                    e.originalEvent.stopPropagation();
                    e.originalEvent.preventDefault();
                    this._showCenterDialog(center);
                };
                map.on('click', layerId, layerHandlers.click);
                
                // Set hover flag when entering marker
                layerHandlers.mouseenter = () => {
                    map.getCanvas().style.cursor = 'pointer';
                    if (this.map?.layers) {
                        this.map.layers.stormCenterHovered = true;
                    }
                };
                map.on('mouseenter', layerId, layerHandlers.mouseenter);
                
                // Clear hover flag when leaving marker
                layerHandlers.mouseleave = () => {
                    map.getCanvas().style.cursor = '';
                    if (this.map?.layers) {
                        this.map.layers.stormCenterHovered = false;
                    }
                };
                map.on('mouseleave', layerId, layerHandlers.mouseleave);
                
                // Store handlers for later cleanup
                handlers.set(layerId, layerHandlers);
            } else if (!cached || cached.signature !== signature) {
                // Update icon if type changed
                map.setLayoutProperty(layerId, 'icon-image', iconName);
            }

            cache.set(key, { signature });
        });

        // Remove centers that no longer exist
        for (const key of cache.keys()) {
            if (!nextKeys.has(key)) {
                this._removeCenterFromMap(target, key);
                cache.delete(key);
            }
        }
    }

    /**
     * Display storm centers
     */
    displayStormCenters() {
        this._scheduleCenterSync('main');
        if (this.map?.isSplit()) {
            this._scheduleCenterSync('dual');
        }

        console.log(`[StormCentersLayer] Displayed ${this.stormCenters.length} storm centers`);
    }

    /**
     * Display storm centers on dual map
     */
    displayStormCentersOnDualMap() {
        if (!this.map?.dualMap) return;
        this._scheduleCenterSync('dual');
    }

    /**
     * Clear storm centers
     */
    clearStormCenters(target = 'main') {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) {
            if (target === 'main') {
                this.centerCache.main.clear();
                this.eventHandlers.main.clear();
                this.stormCenters = [];
            } else if (target === 'dual') {
                this.centerCache.dual.clear();
                this.eventHandlers.dual.clear();
            }
            return;
        }

        const cache = target === 'main' ? this.centerCache.main : this.centerCache.dual;
        for (const key of cache.keys()) {
            this._removeCenterFromMap(target, key);
        }
        cache.clear();
        
        if (target === 'main') {
            this.stormCenters = [];
        }
    }

    /**
     * Get current radar station from map
     */
    _getCurrentStation() {
        // Try to get the current station from the map object
        if (this.map?.currentMainStation) {
            return this.map.currentMainStation;
        }
        // Fallback: check localStorage or URL params
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('station')?.toUpperCase() || 'KTLX';
    }

    /**
     * Fetch storm centers from API
     */
    async fetchStormCenters() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.error('[StormCentersLayer] Storm centers fetch timeout');
                controller.abort();
            }, 10000);

            const response = await fetch(
                'https://mesonet.agron.iastate.edu/geojson/nexrad_attr.py',
                { signal: controller.signal }
            );
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (data && data.features && Array.isArray(data.features)) {
                // Store all centers
                this.allStormCenters = data.features;
                
                const currentStation = this._getCurrentStation();
                // Filter for current station
                this.stormCenters = this._filterCentersForStation(data.features, currentStation);
                this.displayStormCenters();
                console.log(`[StormCentersLayer] Fetched ${data.features.length} total storm centers, displaying ${this.stormCenters.length} for station ${currentStation}`);
            } else {
                console.warn('[StormCentersLayer] No storm centers in response');
                this.allStormCenters = [];
                this.stormCenters = [];
            }
        } catch (error) {
            console.error('[StormCentersLayer] Error fetching storm centers:', error);
            this.allStormCenters = [];
            this.stormCenters = [];
        }
    }
}

export default StormCentersLayer;
