/*

> map.js
This module handles the MapLibre mapping and manages everything on the map.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import earcut from 'earcut';
import { createSplitToolbar } from "../components/split_toolbar.js";
import Palettes from "./palettes.js";
import { showLoadingAnimation, hideLoadingAnimation } from "./loader.js";
import RadarPicker from "./radar_picker.js";
import Popup from "./popup.js";
import Dialog from "./dialog.js";

class Map {
    // Constructor function
    constructor(params, callbacks = {}) {
        this.params = params;
        this.callbacks = callbacks;
        this.map = new maplibregl.Map(params);
        this.isSyncing = false;
        this.tilt = 0;

        // WebGL radar layer tracking
        this.currentRadarLayer = null;
        this.currentGeojson = null;
        this.currentMesh = null;
        this.currentMeshBounds = null;
        this.currentRadarProduct = null;
        this.radar = null; // Store reference to radar instance
        this.palettes = new Palettes(); // Store palettes instance
        this.radarPicker = new RadarPicker('N0B', ['10px', '10px', null, null], (product) => {
            if (typeof this.callbacks.onChangeProduct === 'function') {
                this.callbacks.onChangeProduct(product.replace('_', this.tilt));
            }
        });
        // Color table for radar values (default to REF)
        this.currentPalette = 'REF';
        this.colorTable = this.palettes.getPalette('REF');

        // Parse color table to stops
        this.colorStops = [];
        for (let i = 0; i < this.colorTable.length; i += 2) {
            this.colorStops.push({
                value: Number(this.colorTable[i]),
                color: this._parseRgb(this.colorTable[i + 1])
            });
        }
        // Sort stops to ensure consistent ordering
        this.colorStops.sort((a, b) => a.value - b.value);

        // Need to force apply projection because I don't freaking know.
        this.applyProjection(this.map, params.projection);
        // Store move listeners so we can clean them up later
        this.moveListeners = { main: null, dual: null };
        // Store radar station markers for cleanup
        this.radarMarkers = { main: [], dual: [] };
        // Store radar station overlap handlers for cleanup
        this.radarStationHandlers = { main: null, dual: null };

        // Alert tracking
        this.alerts = [];
        this.alertCache = { main: new globalThis.Map(), dual: new globalThis.Map() };
        this.alertSyncPending = { main: false, dual: false };
        this.watches = [];
        this.watchCache = { main: new globalThis.Map(), dual: new globalThis.Map() };
        this.watchSyncPending = { main: false, dual: false };
        this.alertPopups = { main: null, dual: null };
        this.alertPopupLocations = { main: null, dual: null };
        this.alertPopupMoveHandlers = { main: null, dual: null };
        this.alertPopupClickHandlers = { main: null, dual: null };
        this.alertPopupClickHandlers.main = (e) => this._handleAlertClick('main', e);
        this.map.on('click', this.alertPopupClickHandlers.main);
        this.alertFlashIntervals = { main: new globalThis.Map(), dual: new globalThis.Map() };

        // Reflectivity gate filter (for filtering out weak reflectivity values)
        // Initialize from localStorage if available, otherwise use default
        try {
            const settings = JSON.parse(localStorage.getItem('settings') || '{}');
            this.reflectivityGateFilter = settings.reflectivityGateFilter ?? -10;
            this.enableSplitCursorMarker = settings.enableSplitCursorMarker ?? true;
        } catch {
            this.reflectivityGateFilter = -10;
            this.enableSplitCursorMarker = true;
        }

        // Listen for palette updates from settings
        document.addEventListener('paletteUpdated', (e) => {
            const { paletteName } = e.detail;
            console.log(`[Map] paletteUpdated event: ${paletteName}, currentPalette: ${this.currentPalette}`);
            // If the updated palette matches the current palette, reload it
            if (paletteName && this.currentPalette && paletteName === this.currentPalette) {
                console.log('[Map] Reloading current palette...');
                this._reloadCurrentPalette();
            } else {
                console.log('[Map] Palette updated but not currently active, will apply on next switch');
            }
        });

        // Listen for settings changes
        document.addEventListener('settingsChanged', (e) => {
            const { key, value } = e.detail;
            if (key === 'reflectivityGateFilter') {
                this.reflectivityGateFilter = value;
                // Re-render the radar with new filter
                if (this.currentGeojson) {
                    this.addWebGlRadarLayer(this.currentGeojson, 'main', this.currentRadarProduct);
                } else if (this.currentMesh) {
                    this.addWebGlRadarMesh(this.currentMesh, this.currentMeshBounds, 'main', this.currentRadarProduct);
                }
            }
            if (key === 'enableSplitCursorMarker') {
                this.enableSplitCursorMarker = value;
            }
        });
    }

    // Function to apply projection to a map instance
    applyProjection(map, projection) {
        if (!projection) return;

        const projectionName = typeof projection === 'string'
            ? projection
            : projection.name;

        if (!projectionName || !map.setProjection) return;

        map.on('style.load', () => {
            map.setProjection({ name: projectionName });
        });
    }

    // Function to open dual map view
    splitMap(layout = 'vertical', options = {}) {
        showLoadingAnimation();
        const mainContainer = this.map.getContainer();
        const parent = mainContainer.parentElement;

        // Clean up old listeners if split was already open
        if (this.moveListeners.main) {
            this.map.off('move', this.moveListeners.main);
        }
        if (this.moveListeners.dual) {
            if (this.dualMap) {
                this.dualMap.off('move', this.moveListeners.dual);
            }
        }

        if (!parent) return;

        parent.classList.add('split');
        this.currentLayout = layout;
        this.setSplitLayout(layout);

        const dualContainer = document.createElement('div');
        dualContainer.id = 'map-dual';
        parent.appendChild(dualContainer);

        // Create a new map instance for the second view using the same parameters
        this.dualMap = new maplibregl.Map({
            ...this.params,
            container: dualContainer,
        });

        // Again, force apply projection to the second map
        this.applyProjection(this.dualMap, this.params.projection);

        // Show the split map toolbar
        const splitToolbar = createSplitToolbar(() => this.setSplitLayout(), () => this.stopSplit());
        parent.appendChild(splitToolbar);

        this.dualMap.on('load', async () => {
            // Sync the second map's view with the main map's view
            this.dualMap.setCenter(this.map.getCenter());
            this.dualMap.setZoom(this.map.getZoom());
            
            // Load velocity on dual map if radar instance is available
            if (this.radar && options.station) {
                const product = options.product || 'N0G';
                const radarResult = await this.radar.getRadarLayer(options.station, product, {
                    ...options,
                    includeGeojson: false,
                    onMetadata: ({ timeString, timeIso, tilt }) => {
                        if (this.splitRadarPicker && typeof this.splitRadarPicker.setTimeAndTilt === 'function') {
                            this.splitRadarPicker.setTimeAndTilt(timeString, `${tilt.toFixed(1)}°`, timeIso);
                        }
                    }
                });
                if (radarResult?.meshData instanceof Float32Array) {
                    this.addWebGlRadarMesh(radarResult.meshData, radarResult.bounds, 'split', product);
                } else if (radarResult?.geojson) {
                    this.addWebGlRadarLayer(radarResult.geojson, 'split', product);
                }
            }

            // Display alerts on dual map if they exist
            if (this.alerts.length > 0) {
                this.displayAlertsOnDualMap();
            }

            // Display watches on dual map if they exist
            if (this.watches.length > 0) {
                this.displayWatchesOnDualMap();
            }

            hideLoadingAnimation();
        });

        // Move main map > also move second map
        this.moveListeners.main = () => {
            if (this.isSyncing) {
                return;
            }
            this.isSyncing = true;
            this.dualMap.setCenter(this.map.getCenter());
            this.dualMap.setZoom(this.map.getZoom());
            this.isSyncing = false;
        };
        this.map.on('move', this.moveListeners.main);

        // Move second map > also move main map
        this.moveListeners.dual = () => {
            if (this.isSyncing) {
                return;
            }
            this.isSyncing = true;
            this.map.setCenter(this.dualMap.getCenter());
            this.map.setZoom(this.dualMap.getZoom());
            this.isSyncing = false;
        };
        this.dualMap.on('move', this.moveListeners.dual);

        if (this.alertPopupClickHandlers.dual) {
            this.dualMap.off('click', this.alertPopupClickHandlers.dual);
        }
        this.alertPopupClickHandlers.dual = (e) => this._handleAlertClick('dual', e);
        this.dualMap.on('click', this.alertPopupClickHandlers.dual);

        // Initialize cursor marker storage
        this.cursorMarkers = { mainMapCursorMarker: null, splitMapCursorMarker: null };
        this.cursorHandlers = null;

        // Only set up cursor markers if enabled in settings
        if (this.enableSplitCursorMarker) {
            // Create cursor marker element
            const createCursorMarker = () => {
                const el = document.createElement('div');
                el.style.width = '12px';
                el.style.height = '12px';
                el.style.backgroundColor = '#27beff';
                el.style.boxShadow = '0 0 4px 2px #27beff88';
                el.style.borderRadius = '50%';
                el.style.border = '2px solid black';
                return el;
            };

            // Handle main map cursor movement
            const mainMapMouseMoveHandler = (e) => {
                const lngLat = e.lngLat;
                
                // Update or create split map marker
                if (!this.cursorMarkers.splitMapCursorMarker) {
                    this.cursorMarkers.splitMapCursorMarker = new maplibregl.Marker({ element: createCursorMarker() })
                        .setLngLat(lngLat)
                        .addTo(this.dualMap);
                } else {
                    this.cursorMarkers.splitMapCursorMarker.setLngLat(lngLat);
                    this.cursorMarkers.splitMapCursorMarker.getElement().style.display = 'block';
                }
                
                // Hide main map marker
                if (this.cursorMarkers.mainMapCursorMarker) {
                    this.cursorMarkers.mainMapCursorMarker.getElement().style.display = 'none';
                }
            };

            // Handle split map cursor movement
            const splitMapMouseMoveHandler = (e) => {
                const lngLat = e.lngLat;
                
                // Update or create main map marker
                if (!this.cursorMarkers.mainMapCursorMarker) {
                    this.cursorMarkers.mainMapCursorMarker = new maplibregl.Marker({ element: createCursorMarker() })
                        .setLngLat(lngLat)
                        .addTo(this.map);
                } else {
                    this.cursorMarkers.mainMapCursorMarker.setLngLat(lngLat);
                    this.cursorMarkers.mainMapCursorMarker.getElement().style.display = 'block';
                }
                
                // Hide split map marker
                if (this.cursorMarkers.splitMapCursorMarker) {
                    this.cursorMarkers.splitMapCursorMarker.getElement().style.display = 'none';
                }
            };

            // Handle main map mouse leave
            const mainMapMouseLeaveHandler = () => {
                if (this.cursorMarkers.splitMapCursorMarker) {
                    this.cursorMarkers.splitMapCursorMarker.getElement().style.display = 'none';
                }
            };

            // Handle split map mouse leave
            const splitMapMouseLeaveHandler = () => {
                if (this.cursorMarkers.mainMapCursorMarker) {
                    this.cursorMarkers.mainMapCursorMarker.getElement().style.display = 'none';
                }
            };

            // Add mousemove and mouseleave handlers
            this.map.on('mousemove', mainMapMouseMoveHandler);
            this.map.on('mouseleave', mainMapMouseLeaveHandler);
            this.dualMap.on('mousemove', splitMapMouseMoveHandler);
            this.dualMap.on('mouseleave', splitMapMouseLeaveHandler);

            // Store handlers for cleanup
            this.cursorHandlers = { mainMapMouseMoveHandler, splitMapMouseMoveHandler, mainMapMouseLeaveHandler, splitMapMouseLeaveHandler };
        }

        // Add radar stations to the split map
        this.updateRadarStations();
    }

    setSplitLayout(layout = null) {
        const nextLayout = this.currentLayout === 'vertical' ? 'horizontal' : 'vertical';

        if (!layout) layout = nextLayout;
        
        const parent = this.map.getContainer().parentElement;
        if (!parent) return;

        if (layout == 'vertical') {
            try { this.radarPicker.destroy(); } catch {}
            try { this.splitRadarPicker.destroy(); } catch {}
            this.splitRadarPicker = new RadarPicker('N0G', ['10px', '10px', null, null], (product) => {
                if (typeof this.callbacks.onChangeProduct === 'function') {
                    this.callbacks.onChangeProductSplit(product.replace('_', this.tilt));
                }
            });
            this.radarPicker = new RadarPicker('N0B', ['10px', 'calc(50% + 10px)', null, null], (product) => {
                if (typeof this.callbacks.onChangeProduct === 'function') {
                    this.callbacks.onChangeProduct(product.replace('_', this.tilt));
                }
            });
        } else {
            try { this.radarPicker.destroy(); } catch {}
            try { this.splitRadarPicker.destroy(); } catch {}
            this.splitRadarPicker = new RadarPicker('N0G', ['calc(50% + 10px)', '10px', null, null], (product) => {
                if (typeof this.callbacks.onChangeProduct === 'function') {
                    this.callbacks.onChangeProductSplit(product.replace('_', this.tilt));
                }
            });
            this.radarPicker = new RadarPicker('N0B', ['10px', '10px', null, null], (product) => {
                if (typeof this.callbacks.onChangeProduct === 'function') {
                    this.callbacks.onChangeProduct(product.replace('_', this.tilt));
                }
            });
        }

        parent.style.setProperty('grid-template-columns', layout === 'vertical' ? '1fr 1fr' : '1fr');
        parent.style.setProperty('grid-template-rows', layout === 'horizontal' ? '1fr 1fr' : '1fr');

        this.currentLayout = layout;
    }

    isSplit() {
        return !!this.dualMap;
    }

    stopSplit() {
        const mainContainer = this.map.getContainer();
        const parent = mainContainer.parentElement;
        if (!parent) return;

        // Clean up move listeners
        if (this.moveListeners.main) {
            this.map.off('move', this.moveListeners.main);
            this.moveListeners.main = null;
        }
        if (this.moveListeners.dual && this.dualMap) {
            this.dualMap.off('move', this.moveListeners.dual);
            this.moveListeners.dual = null;
        }

        if (this.alertPopupClickHandlers.dual && this.dualMap) {
            this.dualMap.off('click', this.alertPopupClickHandlers.dual);
        }
        this.alertPopupClickHandlers.dual = null;
        this._clearAlertPopup('dual');

        // Clean up cursor handlers
        if (this.cursorHandlers && this.dualMap) {
            if (this.cursorHandlers.mainMapMouseMoveHandler) {
                this.map.off('mousemove', this.cursorHandlers.mainMapMouseMoveHandler);
            }
            if (this.cursorHandlers.splitMapMouseMoveHandler) {
                this.dualMap.off('mousemove', this.cursorHandlers.splitMapMouseMoveHandler);
            }
            if (this.cursorHandlers.mainMapMouseLeaveHandler) {
                this.map.off('mouseleave', this.cursorHandlers.mainMapMouseLeaveHandler);
            }
            if (this.cursorHandlers.splitMapMouseLeaveHandler) {
                this.dualMap.off('mouseleave', this.cursorHandlers.splitMapMouseLeaveHandler);
            }
        }

        // Clean up cursor markers
        if (this.cursorMarkers) {
            if (this.cursorMarkers.mainMapCursorMarker) {
                this.cursorMarkers.mainMapCursorMarker.remove();
            }
            if (this.cursorMarkers.splitMapCursorMarker) {
                this.cursorMarkers.splitMapCursorMarker.remove();
            }
            this.cursorMarkers = null;
        }
        this.cursorHandlers = null;

        parent.classList.remove('split');
        parent.style.removeProperty('grid-template-columns');
        parent.style.removeProperty('grid-template-rows');

        if (this.dualMap) {
            this.dualMap.remove();
            this.dualMap = null;
        }

        // Clean up radar station layers and handlers from split/dual map
        if (this.radarStationHandlers?.dual) {
            if (this.dualMap) {
                this.dualMap.off('move', this.radarStationHandlers.dual);
            }
            this.radarStationHandlers.dual = null;
        }

        // Reset main map handler so it gets re-added on next station update
        if (this.radarStationHandlers?.main) {
            this.map.off('move', this.radarStationHandlers.main);
            this.radarStationHandlers.main = null;
        }

        // Clean up radar markers from split/dual map
        this.radarMarkers.dual.forEach(marker => marker.remove());
        this.radarMarkers.dual = [];

        // Clean up alerts from split/dual map
        this.clearAlerts('dual');
        this.clearWatches('dual');

        // Destroy the split map's radar picker if it exists and rebuild the main radar picker to reset its position
        try { this.splitRadarPicker.destroy(); } catch {}
        try { this.radarPicker.destroy(); } catch {}
        this.splitRadarPicker = null;
        this.radarPicker = new RadarPicker('N0B', ['10px', '10px', null, null], (product) => {
                if (typeof this.callbacks.onChangeProduct === 'function') {
                    this.callbacks.onChangeProduct(product.replace('_', this.tilt));
                }
            });

        const dualContainer = document.getElementById('map-dual');
        if (dualContainer) {
            parent.removeChild(dualContainer);
        }

        const splitToolbar = document.getElementById('split-toolbar');
        if (splitToolbar) {
            parent.removeChild(splitToolbar);
        }
    }

    // Method to set radar instance
    setRadar(radar) {
        this.radar = radar;
    }

    // Method to map product codes to palette names
    _getPaletteForProduct(product) {
        if (!product) return 'REF'; // Default to reflectivity
        
        const lastChar = product.charAt(product.length - 1);
        
        switch (lastChar) {
            case 'G': // N0G, N1G, N2G, N3G = Base Velocity
            case 'U': // N0U, N1U, N2U, N3U = Storm Relative Velocity
                return 'VEL';
            case 'B':
                return 'REF';
            case 'C':
                return 'CC';
            case 'K':
                return 'KDP';
            case 'H':
                return 'DHC';
            case 'W':
                return 'SW';
            case 'X':
                return 'ZDR';
            default:
                return product.toUpperCase();
        }
    }

    // Method to update color palette
    _updatePalette(layer, force = false) {
        if (this.currentPalette === layer && !force) {
            console.log(`[Map] Palette ${layer} already loaded, skipping`);
            return; // Skip if already set
        }

        console.log(`[Map] Updating palette to: ${layer}`);
        // Refresh palettes from localStorage so uploads are picked up
        this.palettes = new Palettes();
        this.currentPalette = layer;
        this.colorTable = this.palettes.getPalette(layer);
        this.colorStops = [];
        
        // Pre-parse all RGB values to avoid repeated regex matching
        for (let i = 0; i < this.colorTable.length; i += 2) {
            this.colorStops.push({
                value: Number(this.colorTable[i]),
                color: this._parseRgb(this.colorTable[i + 1])
            });
        }
        
        // Sort stops by value to ensure correct interpolation
        this.colorStops.sort((a, b) => a.value - b.value);
        
        // Debug: log palette color stops for velocity
        if (layer === 'VEL') {
            console.log('[Map] VEL Palette Color Stops (first 10):', this.colorStops.slice(0, 10).map(s => ({
                value: s.value,
                color: `rgb(${Math.round(s.color[0]*255)}, ${Math.round(s.color[1]*255)}, ${Math.round(s.color[2]*255)})`
            })));
        }
    }

    // Method to reload the current palette when it's updated in settings
    _reloadCurrentPalette() {
        console.log(`[Map] Force reloading palette: ${this.currentPalette}`);
        // Reload the palettes instance to get fresh data from localStorage
        this.palettes = new Palettes();
        
        // Update the palette with fresh data
        this.colorTable = this.palettes.getPalette(this.currentPalette);
        this.colorStops = [];
        
        // Pre-parse all RGB values
        for (let i = 0; i < this.colorTable.length; i += 2) {
            this.colorStops.push({
                value: Number(this.colorTable[i]),
                color: this._parseRgb(this.colorTable[i + 1])
            });
        }
        
        // Sort stops by value to ensure correct interpolation
        this.colorStops.sort((a, b) => a.value - b.value);
        
        console.log(`[Map] Reloaded ${this.colorStops.length} color stops`);
        
        // Re-render the current radar layer with new colors
        if (this.currentGeojson) {
            console.log('[Map] Re-rendering radar layer with new colors');
            this.addWebGlRadarLayer(this.currentGeojson, 'main', this.currentRadarProduct);
        } else if (this.currentMesh) {
            console.log('[Map] Re-rendering radar mesh with new colors');
            this.addWebGlRadarMesh(this.currentMesh, this.currentMeshBounds, 'main', this.currentRadarProduct);
        } else {
            console.log('[Map] No current radar data to re-render');
        }
    }

    // WebGL Radar Layer Methods

    _parseRgb(color) {
        const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (!match) {
            return [1, 1, 1];
        }
        return [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255];
    }

    _lerp(a, b, t) {
        return a + (b - a) * t;
    }

    _lerpColor(a, b, t) {
        return [
            this._lerp(a[0], b[0], t),
            this._lerp(a[1], b[1], t),
            this._lerp(a[2], b[2], t)
        ];
    }

    _colorForValue(value) {
        // Special handling for range-folded gates
        if (value === 'rf') {
            return [0.5, 0.0, 0.5]; // Purple for range folding
        }
        
        const stops = this.colorStops;
        if (!stops || stops.length === 0) {
            return [1, 1, 1]; // White fallback for invalid palette
        }
        
        // Clamp to first stop if value is below minimum
        if (value <= stops[0].value) {
            return stops[0].color;
        }
        
        // Clamp to last stop if value is above maximum
        if (value >= stops[stops.length - 1].value) {
            return stops[stops.length - 1].color;
        }
        
        // Linear search is faster for small arrays (typical: 16-32 stops)
        for (let i = 0; i < stops.length - 1; i++) {
            const leftStop = stops[i];
            const rightStop = stops[i + 1];
            
            // Check if value falls between these two stops
            if (value >= leftStop.value && value <= rightStop.value) {
                const span = rightStop.value - leftStop.value;
                const t = span > 0 ? (value - leftStop.value) / span : 0;
                return this._lerpColor(leftStop.color, rightStop.color, t);
            }
        }
        
        // Shouldn't reach here, but return last stop as fallback
        return stops[stops.length - 1].color;
    }

    _flattenPolygon(rings) {
        const vertices = [];
        const holeIndices = [];

        for (let ringIdx = 0; ringIdx < rings.length; ringIdx++) {
            const ring = rings[ringIdx];
            if (ringIdx > 0) {
                holeIndices.push(vertices.length >> 1);
            }
            
            for (let i = 0; i < ring.length; i++) {
                const coord = ring[i];
                const mercator = maplibregl.MercatorCoordinate.fromLngLat({ lng: coord[0], lat: coord[1] });
                vertices.push(mercator.x, mercator.y);
            }
        }

        return { vertices, holeIndices };
    }

    _buildVertexData(geojson) {
        const data = [];
        const features = geojson.features || [];
        const alpha = this.currentPalette === 'VEL' ? 1.0 : 0.85;
        
        // Debug: log first few values for velocity palette
        let debugCount = 0;

        for (const feature of features) {
            const rawValue = feature.properties?.val;
            const value = rawValue === 'rf' ? 'rf' : Number(rawValue ?? 0);
            
            // Apply reflectivity gate filter (only for REF palette)
            if (this.currentPalette === 'REF' && value !== 'rf' && value < this.reflectivityGateFilter) {
                continue; // Skip this feature
            }
            
            const color = this._colorForValue(value);
            
            // Debug logging for velocity
            if (this.currentPalette === 'VEL' && debugCount < 10 && value !== 'rf') {
                console.log(`Value: ${value}, Color: rgb(${Math.round(color[0]*255)}, ${Math.round(color[1]*255)}, ${Math.round(color[2]*255)})`);
                debugCount++;
            }
            const geometry = feature.geometry;
            if (!geometry) continue;

            const polygons = geometry.type === 'Polygon'
                ? [geometry.coordinates]
                : geometry.type === 'MultiPolygon'
                    ? geometry.coordinates
                    : [];

            for (const rings of polygons) {
                const { vertices, holeIndices } = this._flattenPolygon(rings);
                if (vertices.length < 6) continue;
                const indices = earcut(vertices, holeIndices, 2);

                for (const index of indices) {
                    const x = vertices[index * 2];
                    const y = vertices[index * 2 + 1];
                    data.push(x, y, color[0], color[1], color[2], alpha);
                }
            }
        }

        return new Float32Array(data);
    }

    _buildVertexDataFromMesh(meshData) {
        const data = [];
        const alpha = this.currentPalette === 'VEL' ? 1.0 : 0.85;

        for (let i = 0; i < meshData.length; i += 9) {
            const lon1 = meshData[i];
            const lat1 = meshData[i + 1];
            const lon2 = meshData[i + 2];
            const lat2 = meshData[i + 3];
            const lon3 = meshData[i + 4];
            const lat3 = meshData[i + 5];
            const lon4 = meshData[i + 6];
            const lat4 = meshData[i + 7];
            const rawValue = meshData[i + 8];
            const value = Number.isNaN(rawValue) ? 'rf' : rawValue;

            if (this.currentPalette === 'REF' && value !== 'rf' && value < this.reflectivityGateFilter) {
                continue;
            }

            const color = this._colorForValue(value);
            const p1 = maplibregl.MercatorCoordinate.fromLngLat({ lng: lon1, lat: lat1 });
            const p2 = maplibregl.MercatorCoordinate.fromLngLat({ lng: lon2, lat: lat2 });
            const p3 = maplibregl.MercatorCoordinate.fromLngLat({ lng: lon3, lat: lat3 });
            const p4 = maplibregl.MercatorCoordinate.fromLngLat({ lng: lon4, lat: lat4 });

            data.push(
                p1.x, p1.y, color[0], color[1], color[2], alpha,
                p2.x, p2.y, color[0], color[1], color[2], alpha,
                p3.x, p3.y, color[0], color[1], color[2], alpha,
                p1.x, p1.y, color[0], color[1], color[2], alpha,
                p3.x, p3.y, color[0], color[1], color[2], alpha,
                p4.x, p4.y, color[0], color[1], color[2], alpha
            );
        }

        return new Float32Array(data);
    }

    _computeBounds(geojson) {
        let minLng = Infinity;
        let minLat = Infinity;
        let maxLng = -Infinity;
        let maxLat = -Infinity;

        const features = geojson.features || [];
        for (const feature of features) {
            const geometry = feature.geometry;
            if (!geometry) continue;
            const polygons = geometry.type === 'Polygon'
                ? [geometry.coordinates]
                : geometry.type === 'MultiPolygon'
                    ? geometry.coordinates
                    : [];

            for (const rings of polygons) {
                for (const ring of rings) {
                    for (const coord of ring) {
                        const lng = Number(coord[0]);
                        const lat = Number(coord[1]);
                        if (Number.isNaN(lng) || Number.isNaN(lat)) continue;
                        minLng = Math.min(minLng, lng);
                        minLat = Math.min(minLat, lat);
                        maxLng = Math.max(maxLng, lng);
                        maxLat = Math.max(maxLat, lat);
                    }
                }
            }
        }

        if (!Number.isFinite(minLng)) {
            return null;
        }
        return [[minLng, minLat], [maxLng, maxLat]];
    }

    _computeFeatureBBox(feature) {
        let minLng = Infinity;
        let minLat = Infinity;
        let maxLng = -Infinity;
        let maxLat = -Infinity;
        const geometry = feature.geometry;
        if (!geometry) return null;
        const polygons = geometry.type === 'Polygon'
            ? [geometry.coordinates]
            : geometry.type === 'MultiPolygon'
                ? geometry.coordinates
                : [];

        for (const rings of polygons) {
            for (const ring of rings) {
                for (const coord of ring) {
                    const lng = Number(coord[0]);
                    const lat = Number(coord[1]);
                    if (Number.isNaN(lng) || Number.isNaN(lat)) continue;
                    minLng = Math.min(minLng, lng);
                    minLat = Math.min(minLat, lat);
                    maxLng = Math.max(maxLng, lng);
                    maxLat = Math.max(maxLat, lat);
                }
            }
        }

        if (!Number.isFinite(minLng)) return null;
        return [minLng, minLat, maxLng, maxLat];
    }

    _pointInRing(point, ring) {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = Number(ring[i][0]);
            const yi = Number(ring[i][1]);
            const xj = Number(ring[j][0]);
            const yj = Number(ring[j][1]);
            if (Number.isNaN(xi) || Number.isNaN(yi) || Number.isNaN(xj) || Number.isNaN(yj)) {
                continue;
            }
            const intersect = ((yi > point[1]) !== (yj > point[1]))
                && (point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi + 0.0) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    _pointInPolygon(point, rings) {
        if (!rings || rings.length === 0) return false;
        if (!this._pointInRing(point, rings[0])) return false;
        for (let i = 1; i < rings.length; i += 1) {
            if (this._pointInRing(point, rings[i])) return false;
        }
        return true;
    }

    _findValueAtPoint(geojson, point) {
        const features = geojson?.features || [];
        for (const feature of features) {
            const bbox = feature.__bbox;
            if (bbox) {
                if (point[0] < bbox[0] || point[0] > bbox[2] || point[1] < bbox[1] || point[1] > bbox[3]) {
                    continue;
                }
            }
            const geometry = feature.geometry;
            if (!geometry) continue;
            const polygons = geometry.type === 'Polygon'
                ? [geometry.coordinates]
                : geometry.type === 'MultiPolygon'
                    ? geometry.coordinates
                    : [];
            for (const rings of polygons) {
                if (this._pointInPolygon(point, rings)) {
                    const rawValue = feature.properties?.val;
                    if (rawValue === 'rf') return 'rf';
                    const value = Number(rawValue);
                    return Number.isFinite(value) ? value : null;
                }
            }
        }
        return null;
    }

    _renderWebGlRadarLayer(vertexData, map, layerId, isMainLayer) {
        const vertexCount = vertexData.length / 6;

        if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
        }

        const highlightLayer = {
            id: layerId,
            type: 'custom',
            renderingMode: '2d',
            program: null,
            uMatrix: null,
            vertexCount: 0,

            onAdd: (map, gl) => {
                const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;

                const vertexSource = isWebGL2
                    ? `#version 300 es

                    precision highp float;

                    uniform mat4 u_matrix;
                    in vec2 a_pos;
                    in vec4 a_color;
                    out vec4 v_color;
                    void main() {
                        v_color = a_color;
                        gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
                    }`
                    : `precision highp float;

                    uniform mat4 u_matrix;
                    attribute vec2 a_pos;
                    attribute vec4 a_color;
                    varying vec4 v_color;
                    void main() {
                        v_color = a_color;
                        gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
                    }`;

                const fragmentSource = isWebGL2
                    ? `#version 300 es

                    precision highp float;

                    in vec4 v_color;
                    out highp vec4 fragColor;
                    void main() {
                        fragColor = v_color;
                    }`
                    : `precision highp float;

                    varying vec4 v_color;
                    void main() {
                        gl_FragColor = v_color;
                    }`;

                const createShader = (gl, type, source) => {
                    const shader = gl.createShader(type);
                    gl.shaderSource(shader, source);
                    gl.compileShader(shader);
                    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                        console.error(gl.getShaderInfoLog(shader));
                        return null;
                    }
                    return shader;
                };

                const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
                const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

                const program = gl.createProgram();
                gl.attachShader(program, vertexShader);
                gl.attachShader(program, fragmentShader);
                gl.linkProgram(program);
                if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                    console.error(gl.getProgramInfoLog(program));
                    return;
                }
                gl.useProgram(program);

                const buffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);

                const aPos = gl.getAttribLocation(program, 'a_pos');
                const aColor = gl.getAttribLocation(program, 'a_color');
                gl.enableVertexAttribArray(aPos);
                gl.enableVertexAttribArray(aColor);

                gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 6 * 4, 0);
                gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, 6 * 4, 2 * 4);

                const uMatrix = gl.getUniformLocation(program, 'u_matrix');

                highlightLayer.program = program;
                highlightLayer.uMatrix = uMatrix;
                highlightLayer.vertexCount = vertexCount;
            },

            render: (gl, args) => {
                if (!highlightLayer.program || !highlightLayer.uMatrix || !highlightLayer.vertexCount) return;
                const rawMatrix = args?.defaultProjectionData?.mainMatrix ?? args;
                if (!rawMatrix) return;
                const matrix = rawMatrix instanceof Float32Array
                    ? rawMatrix
                    : new Float32Array(rawMatrix);
                gl.useProgram(highlightLayer.program);
                gl.uniformMatrix4fv(highlightLayer.uMatrix, false, matrix);
                gl.drawArrays(gl.TRIANGLES, 0, highlightLayer.vertexCount);
            }
        };

        map.addLayer(highlightLayer, 'Pier');
        if (isMainLayer) {
            this.currentRadarLayer = highlightLayer;
        }
    }

    addWebGlRadarLayer(radarGeoJson, targetMap = null, product = null) {
        let map = this.map;
        let layerId = 'radar-webgl';
        let isMainLayer = true;

        if (targetMap) {
            if (targetMap === 'main') {
                map = this.map;
                layerId = 'radar-webgl';
            } else if (targetMap === 'dual' || targetMap === 'split') {
                map = this.dualMap;
                layerId = 'radar-webgl-dual';
                isMainLayer = false;
            } else {
                map = targetMap;
                layerId = 'radar-webgl-dual';
                isMainLayer = false;
            }
        }

        if (!map) {
            console.warn('Target map is not available yet.');
            return;
        }

        if (!radarGeoJson || !radarGeoJson.features) {
            console.error('Invalid GeoJSON data provided to addWebGlRadarLayer');
            return;
        }

        if (product) {
            const paletteForProduct = this._getPaletteForProduct(product);
            this._updatePalette(paletteForProduct);
        }

        const features = radarGeoJson.features;
        for (let i = 0; i < features.length; i++) {
            features[i].__bbox = this._computeFeatureBBox(features[i]);
        }

        if (isMainLayer) {
            this.currentGeojson = radarGeoJson;
            this.currentMesh = null;
            this.currentMeshBounds = null;
        }
        this.currentRadarProduct = product;

        const vertexData = this._buildVertexData(radarGeoJson);
        this._renderWebGlRadarLayer(vertexData, map, layerId, isMainLayer);
    }

    addWebGlRadarMesh(meshData, bounds, targetMap = null, product = null) {
        let map = this.map;
        let layerId = 'radar-webgl';
        let isMainLayer = true;

        if (targetMap) {
            if (targetMap === 'main') {
                map = this.map;
                layerId = 'radar-webgl';
            } else if (targetMap === 'dual' || targetMap === 'split') {
                map = this.dualMap;
                layerId = 'radar-webgl-dual';
                isMainLayer = false;
            } else {
                map = targetMap;
                layerId = 'radar-webgl-dual';
                isMainLayer = false;
            }
        }

        if (!map) {
            console.warn('Target map is not available yet.');
            return;
        }

        if (!meshData || !(meshData instanceof Float32Array)) {
            console.error('Invalid mesh data provided to addWebGlRadarMesh');
            return;
        }

        if (product) {
            const paletteForProduct = this._getPaletteForProduct(product);
            this._updatePalette(paletteForProduct);
        }

        if (isMainLayer) {
            this.currentMesh = meshData;
            this.currentMeshBounds = bounds || null;
            this.currentGeojson = null;
        }
        this.currentRadarProduct = product;

        const vertexData = this._buildVertexDataFromMesh(meshData);
        this._renderWebGlRadarLayer(vertexData, map, layerId, isMainLayer);
    }

    _createStationMarkerElement(icao, isOperational) {
        const el = document.createElement('div');
        const styles = el.style;
        styles.backgroundColor = isOperational ? '#27beff' : '#ff2121';
        styles.border = '2px solid #1f2937';
        styles.borderRadius = '10px';
        styles.display = 'flex';
        styles.alignItems = 'center';
        styles.justifyContent = 'center';
        styles.color = 'black';
        styles.fontWeight = 'bold';
        styles.fontSize = '1em';
        styles.padding = '1px 8px';
        styles.cursor = 'pointer';
        styles.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        el.textContent = icao;
        return el;
    }

    updateRadarStations() {
        // Fetch the radar stations and their statuses from the NWS API
        fetch('https://api.weather.gov/radar/stations', { signal: AbortSignal.timeout(5000) })
            .then(response => response.json())
            .then(data => {
                const markers = this.radarMarkers;
                markers.main.forEach(m => m.remove());
                markers.main.length = 0;
                
                if (this.isSplit()) {
                    markers.dual.forEach(m => m.remove());
                    markers.dual.length = 0;
                }

                const features = data.features;
                const isSplit = this.isSplit();
                const callbacks = this.callbacks;
                const mainMap = this.map;
                const dualMap = this.dualMap;
                
                const filteredFeatures = [];
                
                for (let i = 0; i < features.length; i++) {
                    const station = features[i];
                    const properties = station.properties;
                    
                    // Filter TDWR stations
                    if (properties.stationType !== 'WSR-88D') continue;
                    // Filter non-CONUS stations
                    if (!properties.id.startsWith('K')) continue;

                    const isOperational = station.properties?.rda?.properties?.status === 'Operate';
                    filteredFeatures.push({
                        type: 'Feature',
                        geometry: station.geometry,
                        properties: {
                            ...properties,
                            isOperational: isOperational ? 1 : 0
                        }
                    });
                }

                // Add markers to main map
                filteredFeatures.forEach((feature) => {
                    const isOperational = feature.properties.isOperational === 1;
                    const icao = feature.properties.id;
                    const coords = feature.geometry.coordinates;
                    
                    const markerElement = this._createStationMarkerElement(icao, isOperational);
                    markerElement.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (typeof callbacks.onSelectStation === 'function') {
                            callbacks.onSelectStation(icao);
                        }
                    });
                    const marker = new maplibregl.Marker({ element: markerElement })
                        .setLngLat(coords)
                        .addTo(mainMap);
                    markers.main.push(marker);
                });

                // Add to split map if active
                if (isSplit) {
                    filteredFeatures.forEach((feature) => {
                        const isOperational = feature.properties.isOperational === 1;
                        const icao = feature.properties.id;
                        const coords = feature.geometry.coordinates;
                        
                        const markerElement = this._createStationMarkerElement(icao, isOperational);
                        markerElement.addEventListener('click', (e) => {
                            e.stopPropagation();
                            if (typeof callbacks.onSelectStationSplit === 'function') {
                                callbacks.onSelectStationSplit(icao);
                            }
                        });
                        const marker = new maplibregl.Marker({ element: markerElement })
                            .setLngLat(coords)
                            .addTo(dualMap);
                        markers.dual.push(marker);
                    });
                }

                // Hide overlapping markers
                const hideOverlappingMarkers = (markerArray, map) => {
                    if (!markerArray || markerArray.length === 0) return;
                    
                    // Reset visibility
                    markerArray.forEach(marker => {
                        marker.getElement().style.display = 'block';
                    });
                    
                    const markerWidth = 50;
                    const markerHeight = 25;
                    
                    for (let i = 0; i < markerArray.length; i++) {
                        const marker1 = markerArray[i];
                        if (marker1.getElement().style.display === 'none') continue;
                        
                        const point1 = map.project(marker1.getLngLat());
                        
                        for (let j = i + 1; j < markerArray.length; j++) {
                            const marker2 = markerArray[j];
                            const point2 = map.project(marker2.getLngLat());
                            
                            const dx = point1.x - point2.x;
                            const dy = point1.y - point2.y;
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            
                            if (distance < markerWidth) {
                                marker2.getElement().style.display = 'none';
                            }
                        }
                    }
                };

                hideOverlappingMarkers(markers.main, mainMap);
                
                if (isSplit) {
                    hideOverlappingMarkers(markers.dual, dualMap);
                }

                // Re-check overlaps on map move
                const updateOverlapHandler = () => {
                    hideOverlappingMarkers(markers.main, mainMap);
                    if (isSplit) {
                        hideOverlappingMarkers(markers.dual, dualMap);
                    }
                };

                // Store handlers for cleanup
                if (!this.radarStationHandlers) {
                    this.radarStationHandlers = { main: null, dual: null };
                }
                
                if (this.radarStationHandlers.main) {
                    mainMap.off('move', this.radarStationHandlers.main);
                }
                this.radarStationHandlers.main = updateOverlapHandler;
                mainMap.on('move', this.radarStationHandlers.main);

                if (isSplit) {
                    if (this.radarStationHandlers.dual) {
                        dualMap.off('move', this.radarStationHandlers.dual);
                    }
                    this.radarStationHandlers.dual = updateOverlapHandler;
                    dualMap.on('move', this.radarStationHandlers.dual);
                }
            })
            .catch(error => {
                console.error('Error fetching radar stations:', error);
            });
    }

    // Alert methods
    async fetchAlerts() {
        try {
            const response = await fetch('https://api.sparkradar.app/alerts', { signal: AbortSignal.timeout(5000) });
            const data = await response.json();
            
            if (data.status === 'OK' && data.alerts) {
                this.alerts = data.alerts;
                this.displayAlerts();
            }
        } catch (error) {
            console.error('Error fetching alerts:', error);
        }
    }

    async fetchWatches() {
        try {
            const timestamp = this._formatWatchTimestamp(new Date());
            const response = await fetch(`https://mesonet.agron.iastate.edu/json/spcwatch.py?ts=${timestamp}`, {
                signal: AbortSignal.timeout(5000)
            });
            const data = await response.json();

            if (data?.features) {
                this.watches = data.features;
                this.displayWatches();
            }
        } catch (error) {
            console.error('Error fetching watches:', error);
        }
    }

    _formatWatchTimestamp(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hour = String(date.getUTCHours()).padStart(2, '0');
        const minute = String(date.getUTCMinutes()).padStart(2, '0');
        return `${year}${month}${day}${hour}${minute}`;
    }

    _convertAlertToGeoJSON(alert) {
        // Convert alert coordinates to GeoJSON Polygon
        const coordinates = alert.coordinates.map(coord => [coord[1], coord[0]]); // Convert [lat,lon] to [lon,lat]
        
        // Close the polygon by adding the first coordinate at the end
        if (coordinates.length > 0 && coordinates[0] !== coordinates[coordinates.length - 1]) {
            coordinates.push(coordinates[0]);
        }
        
        return {
            type: 'Feature',
            properties: {
                name: alert.name,
                id: alert.id,
                sender: alert.sender,
                issued: alert.issued,
                expiry: alert.expiry,
                phenomena: alert.properties?.phenomena,
                significance: alert.properties?.significance,
                productType: alert.properties?.product_type,
            },
            geometry: {
                type: 'Polygon',
                coordinates: [coordinates]
            }
        };
    }

    _getAlertColor(alert) {
        const phenomena = alert.properties?.phenomena;
        const significance = alert.properties?.significance;
        const message = alert.message?.toLowerCase() ?? '';
        
        // Color mapping based on phenomena and significance
        if (phenomena === 'SV' && significance === 'W') {
            return { fill: '#ff9900', outline: '#ff9900', name: 'Severe Thunderstorm Warning' };
        } else if (phenomena === 'TO' && significance === 'W') {
            if (message.includes('particularly dangerous situation')) {
                return { fill: '#ff00ee', outline: '#ff00ee', name: 'PDS Tornado Warning' };
            } else {
                return { fill: '#ff2121', outline: '#ff2121', name: 'Tornado Warning' };
            }
        } else if (phenomena === 'FF' && significance === 'W') {
            return { fill: '#38bdf8', outline: '#38bdf8', name: 'Flash Flood Warning' };
        } else {
            return { fill: '#facc15', outline: '#facc15', name: alert.name };
        }
    }

    _getAlertKey(alert, index) {
        const rawKey = alert?.id ?? `${index}`;
        return String(rawKey).replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    _getAlertSignature(alert) {
        return JSON.stringify({
            id: alert.id,
            name: alert.name,
            issued: alert.issued,
            expiry: alert.expiry,
            properties: alert.properties,
            coordinates: alert.coordinates
        });
    }

    _convertWatchToGeoJSON(watch) {
        if (!watch || watch.type !== 'Feature') return null;
        return watch;
    }

    _getWatchColor(watch) {
        const watchType = watch?.properties?.type;
        const isPds = !!watch?.properties?.is_pds;

        if (watchType === 'TOR') {
            return { fill: isPds ? '#7f0000' : '#ff2121', outline: '#ffb3b3', name: 'Tornado Watch' };
        }
        if (watchType === 'SVR') {
            return { fill: isPds ? '#b45309' : '#f59e0b', outline: '#fde68a', name: 'Severe Thunderstorm Watch' };
        }
        return { fill: '#38bdf8', outline: '#bae6fd', name: 'Watch' };
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

    _getAlertsAtPoint(point) {
        const matches = [];
        for (const alert of this.alerts) {
            if (!alert?.coordinates?.length) continue;
            const ring = alert.coordinates.map(coord => [coord[1], coord[0]]);
            if (!ring.length) continue;
            const first = ring[0];
            const last = ring[ring.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) {
                ring.push([first[0], first[1]]);
            }
            if (this._pointInPolygon(point, [ring])) {
                matches.push(alert);
            }
        }
        return matches;
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
                if (this._pointInPolygon(point, rings)) {
                    matches.push(watch);
                    break;
                }
            }
        }
        return matches;
    }

    _handleAlertClick(target, event) {
        // If a popup is currently open, close it rather than opening another
        if (this.alertPopups[target]) {
            this._clearAlertPopup(target);
            return;
        }
        
        const point = [event.lngLat.lng, event.lngLat.lat];
        const alertMatches = this._getAlertsAtPoint(point);
        const watchMatches = this._getWatchesAtPoint(point);
        this._showAlertPopup(target, event.lngLat, alertMatches, watchMatches);
    }

    _updateAlertPopupPosition(target) {
        const map = target === 'main' ? this.map : this.dualMap;
        const popup = this.alertPopups[target];
        const lngLat = this.alertPopupLocations[target];
        if (!map || !popup || !lngLat) return;

        const point = map.project(lngLat);
        const el = popup.get();
        el.style.left = `${point.x}px`;
        el.style.top = `${point.y}px`;
    }

    _showAlertPopup(target, lngLat, alerts, watches) {
        const map = target === 'main' ? this.map : this.dualMap;
        if (!map) return;

        this._clearAlertPopup(target);
        const hasAlerts = alerts && alerts.length > 0;
        const hasWatches = watches && watches.length > 0;
        if (!hasAlerts && !hasWatches) return;

        const sections = [];

        if (hasAlerts) {
            const items = alerts.map((alert, index) => {

                const alertIssued = new Date(alert.issued).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit'
                });

                const alertExpiry = (() => {
                    const now = new Date();
                    const expiryDate = new Date(alert.expiry);
                    const diffMs = expiryDate - now;
                    const diffMins = Math.floor(diffMs / 60000);
                    
                    if (diffMins < 0) return 'expired';
                    if (diffMins < 60) return `in ${diffMins}m`;
                    
                    const hours = Math.floor(diffMins / 60);
                    const mins = diffMins % 60;
                    return mins > 0 ? `in ${hours}h ${mins}m` : `in ${hours}h`;
                })();

                const colors = this._getAlertColor(alert);
                const title = alert.name || 'Alert';
                const issued = alert.issued ? `Issued: ${alertIssued}` : '';
                const expiry = alert.expiry ? `Expires: ${alertExpiry}` : '';

                const is_pds = alert.message.toLowerCase().includes('particularly dangerous situation');
                const is_confirmed = alert.message.toLowerCase().includes('tornado...observed');
                const is_destructive = alert.message.toLowerCase().includes('destructive') || alert.message.toLowerCase().includes('catastrophic');
                const is_considerable = alert.message.toLowerCase().includes('considerable');
                const is_tor_possible = alert.message.toLowerCase().includes('tornado...possible');

                const meta = `${expiry}${is_tor_possible ? ' | Tornado Possible' : ''}`;

                return `
                    <div class="popup-item" data-type="alert" data-index="${index}" style="cursor: pointer;">
                        <span class="popup-dot" style="background: ${colors.fill}"></span>
                        <div>
                            <div class="popup-item-title">${is_pds ? 'PDS ' : ''}${is_confirmed ? 'Confirmed ' : ''}${is_destructive ? 'Destructive ' : ''}${is_considerable ? 'Considerable ' : ''}${title}</div>
                            ${meta ? `<div class=\"popup-meta\">${meta}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            sections.push(`
                <div class="popup-section">
                    <div class="popup-title">Warnings (${alerts.length})</div>
                    <div class="popup-list">${items}</div>
                </div>
            `);
        }

        if (hasWatches) {
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

            sections.push(`
                <div class="popup-section">
                    <div class="popup-title">Watches (${watches.length})</div>
                    <div class="popup-list">${items}</div>
                </div>
            `);
        }

        const html = sections.join('');

        const popup = new Popup(html);
        popup.addToMap(map);

        const el = popup.get();
        el.style.position = 'absolute';
        el.style.transform = 'translate(-50%, -100%)';
        el.style.pointerEvents = 'auto';
        el.style.zIndex = '2000';

        this.alertPopups[target] = popup;
        this.alertPopupLocations[target] = lngLat;
        this._updateAlertPopupPosition(target);

        // Add click listeners to popup items
        const popupItems = el.querySelectorAll('.popup-item');
        popupItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const type = item.dataset.type;
                const index = parseInt(item.dataset.index, 10);
                if (type === 'alert' && alerts[index]) {
                    this._showAlertDialog(alerts[index]);
                } else if (type === 'watch' && watches[index]) {
                    this._showWatchDialog(watches[index]);
                }
            });
        });

        if (!this.alertPopupMoveHandlers[target]) {
            const handler = () => this._updateAlertPopupPosition(target);
            this.alertPopupMoveHandlers[target] = handler;
            map.on('move', handler);
            map.on('resize', handler);
        }
    }

    _clearAlertPopup(target) {
        const map = target === 'main' ? this.map : this.dualMap;
        const popup = this.alertPopups[target];
        if (popup) {
            popup.removeFromMap();
        }

        this.alertPopups[target] = null;
        this.alertPopupLocations[target] = null;

        const moveHandler = this.alertPopupMoveHandlers[target];
        if (moveHandler && map) {
            map.off('move', moveHandler);
            map.off('resize', moveHandler);
        }
        this.alertPopupMoveHandlers[target] = null;
    }

    _showAlertDialog(alert) {
        const colors = this._getAlertColor(alert);
        const title = alert.name || 'Alert';
        const is_pds = alert.message.toLowerCase().includes('particularly dangerous situation');
        const is_confirmed = alert.message.toLowerCase().includes('tornado...observed');
        const is_destructive = alert.message.toLowerCase().includes('destructive') || alert.message.toLowerCase().includes('catastrophic');
        const is_considerable = alert.message.toLowerCase().includes('considerable');
        const is_tor_possible = alert.message.toLowerCase().includes('tornado...possible');
        
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
                    <h3 style="margin: 0 0 10px 0; text-align: left; color: ${colors.fill};">${is_pds ? 'PDS ' : ''}${is_confirmed ? 'Confirmed ' : ''}${is_destructive ? 'Destructive ' : ''}${is_considerable ? 'Considerable ' : ''}${title}</h3>
                    <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px; font-size: 0.9em;">
                        <strong>Issued:</strong> <span>${formatDate(alert.issued)}</span>
                        <strong>Expires:</strong> <span>${formatDate(alert.expiry)}</span>
                        ${alert.sender ? `<strong>Sender:</strong> <span>${alert.sender}</span>` : ''}
                        ${is_tor_possible ? `<strong>Tornado:</strong> <span style="color: #ff2121;">Possible</span>` : ''}
                    </div>
                </div>
                ${alert.message ? `
                    <div style="margin-bottom: 15px;">
                        <h4 style="margin: 0 0 8px 0; text-align: left;">Description</h4>
                        <p style="margin: 0; white-space: pre-wrap; line-height: 1.5;">${alert.message.replace('  ', '\n')}</p>
                    </div>
                ` : ''}
            </div>
        `;

        new Dialog(title, 'alert-triangle', html);
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

        new Dialog(title, 'eye', html);
    }

    _scheduleAlertSync(target) {
        const map = target === 'main' ? this.map : this.dualMap;
        if (!map) return;

        if (map.isStyleLoaded && map.isStyleLoaded()) {
            this._syncAlertsToMap(target);
            return;
        }

        if (this.alertSyncPending[target]) return;
        this.alertSyncPending[target] = true;

        map.once('load', () => {
            this.alertSyncPending[target] = false;
            this._syncAlertsToMap(target);
        });
    }

    _scheduleWatchSync(target) {
        const map = target === 'main' ? this.map : this.dualMap;
        if (!map) return;

        if (map.isStyleLoaded && map.isStyleLoaded()) {
            this._syncWatchesToMap(target);
            return;
        }

        if (this.watchSyncPending[target]) return;
        this.watchSyncPending[target] = true;

        map.once('load', () => {
            this.watchSyncPending[target] = false;
            this._syncWatchesToMap(target);
        });
    }

    _removeAlertFromMap(target, key) {
        const map = target === 'main' ? this.map : this.dualMap;
        if (!map) return;

        const layerPrefix = target === 'main' ? `alert-${key}` : `alert-${key}-dual`;
        const sourceId = target === 'main' ? `alert-source-${key}` : `alert-source-${key}-dual`;
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

    _removeWatchFromMap(target, key) {
        const map = target === 'main' ? this.map : this.dualMap;
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

    _syncAlertsToMap(target) {
        const map = target === 'main' ? this.map : this.dualMap;
        if (!map) return;
        if (map.isStyleLoaded && !map.isStyleLoaded()) return;

        const cache = target === 'main' ? this.alertCache.main : this.alertCache.dual;
        const nextKeys = new Set();
        const beforeLayerId = target === 'main' ? 'radar-webgl' : 'radar-webgl-dual';

        this.alerts.forEach((alert, index) => {
            const key = this._getAlertKey(alert, index);
            const signature = this._getAlertSignature(alert);
            const geojson = this._convertAlertToGeoJSON(alert);
            const colors = this._getAlertColor(alert);
            const colorSignature = `${colors.fill}|${colors.outline}`;

            nextKeys.add(key);

            const sourceId = target === 'main' ? `alert-source-${key}` : `alert-source-${key}-dual`;
            const layerPrefix = target === 'main' ? `alert-${key}` : `alert-${key}-dual`;
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
                        'fill-opacity': 0.4
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
                }, 'Pier road');
            }

            if (!map.getLayer(`${layerPrefix}-outline-outline`)) {
                map.addLayer({
                    id: `${layerPrefix}-outline-outline`,
                    type: 'line',
                    source: sourceId,
                    paint: {
                        'line-color': '#000000',
                        'line-width': 6,
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

            // Check if alert was issued in the past minute and add flashing animation
            const now = new Date();
            const issued = new Date(alert.issued);
            const timeSinceIssued = now - issued;
            const oneMinute = 60 * 1000;
            const flashIntervals = target === 'main' ? this.alertFlashIntervals.main : this.alertFlashIntervals.dual;
            
            if (timeSinceIssued < oneMinute && timeSinceIssued >= 0) {
                // Start flashing if not already flashing
                if (!flashIntervals.has(key)) {
                    let isWhite = false;
                    const interval = setInterval(() => {
                        if (map.getLayer(`${layerPrefix}-outline`)) {
                            isWhite = !isWhite;
                            map.setPaintProperty(`${layerPrefix}-outline`, 'line-color', isWhite ? '#ffffff' : colors.outline);
                        } else {
                            // Layer removed, clear interval
                            clearInterval(interval);
                            flashIntervals.delete(key);
                        }
                    }, 500); // Flash every 500ms
                    flashIntervals.set(key, interval);
                    
                    // Stop flashing after 1 minute
                    setTimeout(() => {
                        clearInterval(interval);
                        flashIntervals.delete(key);
                        if (map.getLayer(`${layerPrefix}-outline`)) {
                            map.setPaintProperty(`${layerPrefix}-outline`, 'line-color', colors.outline);
                        }
                    }, oneMinute - timeSinceIssued);
                }
            } else {
                // Make sure outline is not flashing
                if (flashIntervals.has(key)) {
                    clearInterval(flashIntervals.get(key));
                    flashIntervals.delete(key);
                    if (map.getLayer(`${layerPrefix}-outline`)) {
                        map.setPaintProperty(`${layerPrefix}-outline`, 'line-color', colors.outline);
                    }
                }
            }

            cache.set(key, { signature, colorSignature });
        });

        for (const key of cache.keys()) {
            if (!nextKeys.has(key)) {
                // Clear flash interval if exists
                const flashIntervals = target === 'main' ? this.alertFlashIntervals.main : this.alertFlashIntervals.dual;
                if (flashIntervals.has(key)) {
                    clearInterval(flashIntervals.get(key));
                    flashIntervals.delete(key);
                }
                this._removeAlertFromMap(target, key);
                cache.delete(key);
            }
        }
    }

    _syncWatchesToMap(target) {
        const map = target === 'main' ? this.map : this.dualMap;
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

    displayAlerts() {
        this._scheduleAlertSync('main');
        if (this.isSplit()) {
            this._scheduleAlertSync('dual');
        }
        
        console.log(`[Map] Displayed ${this.alerts.length} alerts`);
    }

    displayWatches() {
        this._scheduleWatchSync('main');
        if (this.isSplit()) {
            this._scheduleWatchSync('dual');
        }

        console.log(`[Map] Displayed ${this.watches.length} watches`);
    }

    clearAlerts(target = 'main') {
        const map = target === 'main' ? this.map : this.dualMap;
        if (!map) {
            if (target === 'main') {
                this.alertCache.main.clear();
            } else if (target === 'dual') {
                this.alertCache.dual.clear();
            }
            return;
        }

        const cache = target === 'main' ? this.alertCache.main : this.alertCache.dual;
        const flashIntervals = target === 'main' ? this.alertFlashIntervals.main : this.alertFlashIntervals.dual;
        
        // Clear all flash intervals
        for (const interval of flashIntervals.values()) {
            clearInterval(interval);
        }
        flashIntervals.clear();
        
        for (const key of cache.keys()) {
            this._removeAlertFromMap(target, key);
        }
        cache.clear();
        this._clearAlertPopup(target);
    }

    clearWatches(target = 'main') {
        const map = target === 'main' ? this.map : this.dualMap;
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
        this._clearAlertPopup(target);
    }

    displayAlertsOnDualMap() {
        // Only called when dual map is already loaded
        if (!this.dualMap) return;
        this._scheduleAlertSync('dual');
    }

    displayWatchesOnDualMap() {
        // Only called when dual map is already loaded
        if (!this.dualMap) return;
        this._scheduleWatchSync('dual');
    }
}

// Export the map class
export default Map;