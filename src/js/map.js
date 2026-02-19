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

        // Reflectivity gate filter (for filtering out weak reflectivity values)
        // Initialize from localStorage if available, otherwise use default
        try {
            const settings = JSON.parse(localStorage.getItem('settings') || '{}');
            this.reflectivityGateFilter = settings.reflectivityGateFilter ?? -10;
        } catch {
            this.reflectivityGateFilter = -10;
        }

        // Listen for palette updates from settings
        document.addEventListener('paletteUpdated', (e) => {
            const { paletteName } = e.detail;
            // If the updated palette matches the current palette, reload it
            if (paletteName && this.currentPalette && paletteName === this.currentPalette) {
                this._reloadCurrentPalette();
            }
        });

        // Listen for settings changes
        document.addEventListener('settingsChanged', (e) => {
            const { key, value } = e.detail;
            if (key === 'reflectivityGateFilter') {
                this.reflectivityGateFilter = value;
                // Re-render the radar with new filter
                if (this.currentGeojson) {
                    this.addWebGlRadarLayer(this.currentGeojson, 'main');
                }
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
                const radarGeoJson = await this.radar.getRadarLayer(options.station, product, {
                    ...options,
                    onMetadata: ({ timeString, timeIso, tilt }) => {
                        if (this.splitRadarPicker && typeof this.splitRadarPicker.setTimeAndTilt === 'function') {
                            this.splitRadarPicker.setTimeAndTilt(timeString, `${tilt.toFixed(1)}°`, timeIso);
                        }
                    }
                });
                this.addWebGlRadarLayer(radarGeoJson, 'split', product);
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

        // Move cursor on main map > also move cursor on second map
        let mainMapCursorMarker = null;
        let splitMapCursorMarker = null;
        let mainMapMouseMoveHandler = null;
        let splitMapMouseMoveHandler = null;
        let mainMapMouseLeaveHandler = null;
        let splitMapMouseLeaveHandler = null;

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
        mainMapMouseMoveHandler = (e) => {
            const lngLat = e.lngLat;
            
            // Update or create split map marker
            if (!splitMapCursorMarker) {
                splitMapCursorMarker = new maplibregl.Marker({ element: createCursorMarker() })
                    .setLngLat(lngLat)
                    .addTo(this.dualMap);
            } else {
                splitMapCursorMarker.setLngLat(lngLat);
                splitMapCursorMarker.getElement().style.display = 'block';
            }
            
            // Hide main map marker
            if (mainMapCursorMarker) {
                mainMapCursorMarker.getElement().style.display = 'none';
            }
        };

        // Handle split map cursor movement
        splitMapMouseMoveHandler = (e) => {
            const lngLat = e.lngLat;
            
            // Update or create main map marker
            if (!mainMapCursorMarker) {
                mainMapCursorMarker = new maplibregl.Marker({ element: createCursorMarker() })
                    .setLngLat(lngLat)
                    .addTo(this.map);
            } else {
                mainMapCursorMarker.setLngLat(lngLat);
                mainMapCursorMarker.getElement().style.display = 'block';
            }
            
            // Hide split map marker
            if (splitMapCursorMarker) {
                splitMapCursorMarker.getElement().style.display = 'none';
            }
        };

        // Handle main map mouse leave
        mainMapMouseLeaveHandler = () => {
            if (splitMapCursorMarker) {
                splitMapCursorMarker.getElement().style.display = 'none';
            }
        };

        // Handle split map mouse leave
        splitMapMouseLeaveHandler = () => {
            if (mainMapCursorMarker) {
                mainMapCursorMarker.getElement().style.display = 'none';
            }
        };

        // Add mousemove and mouseleave handlers
        this.map.on('mousemove', mainMapMouseMoveHandler);
        this.map.on('mouseleave', mainMapMouseLeaveHandler);
        this.dualMap.on('mousemove', splitMapMouseMoveHandler);
        this.dualMap.on('mouseleave', splitMapMouseLeaveHandler);

        // Store handlers and markers for cleanup
        this.cursorMarkers = { mainMapCursorMarker, splitMapCursorMarker };
        this.cursorHandlers = { mainMapMouseMoveHandler, splitMapMouseMoveHandler, mainMapMouseLeaveHandler, splitMapMouseLeaveHandler };

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

        // Clean up radar markers from split/dual map
        this.radarMarkers.dual.forEach(marker => marker.remove());
        this.radarMarkers.dual = [];

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
            case 'G':
            case 'U': // N2U, N3U, etc. end in U and are velocity
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
    _updatePalette(layer) {
        if (this.currentPalette === layer) return; // Skip if already set

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
    }

    // Method to reload the current palette when it's updated in settings
    _reloadCurrentPalette() {
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
        
        // Re-render the current radar layer with new colors
        if (this.currentGeojson) {
            this.addWebGlRadarLayer(this.currentGeojson, 'main');
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

        for (const feature of features) {
            const rawValue = feature.properties?.val;
            const value = rawValue === 'rf' ? 'rf' : Number(rawValue ?? 0);
            
            // Apply reflectivity gate filter (only for REF palette)
            if (this.currentPalette === 'REF' && value !== 'rf' && value < this.reflectivityGateFilter) {
                continue; // Skip this feature
            }
            
            const color = this._colorForValue(value);
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

    addWebGlRadarLayer(radarGeoJson, targetMap = null, product = null) {
        // Accept a map instance or string identifiers for convenience.
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
        
        // Automatically select palette based on product type
        if (product) {
            const paletteForProduct = this._getPaletteForProduct(product);
            this._updatePalette(paletteForProduct);
        }

        // Compute bounding boxes for all features in one pass (avoid double iteration)
        const features = radarGeoJson.features;
        for (let i = 0; i < features.length; i++) {
            features[i].__bbox = this._computeFeatureBBox(features[i]);
        }
        
        if (isMainLayer) {
            this.currentGeojson = radarGeoJson;
        }

        // Prepare the vertex data
        const vertexData = this._buildVertexData(radarGeoJson);
        const vertexCount = vertexData.length / 6;

        // Remove old radar layer if it exists
        if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
        }
        
        if (isMainLayer) {
            this.currentRadarLayer = null;
        }

        // Create a custom style layer to implement the WebGL content
        const highlightLayer = {
            id: layerId,
            type: 'custom',
            renderingMode: '2d',

            // Method called when the layer is added to the map
            onAdd: (map, gl) => {
                const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;

                // Vertex shader: tells where points are to be drawn
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

                // Fragment shader: tells what color the drawn points should be
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

                // Create and compile the shaders to GPU
                const vertexShader = gl.createShader(gl.VERTEX_SHADER);
                gl.shaderSource(vertexShader, vertexSource);
                gl.compileShader(vertexShader);
                if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
                    console.error('Vertex shader error:', gl.getShaderInfoLog(vertexShader));
                }
                const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
                gl.shaderSource(fragmentShader, fragmentSource);
                gl.compileShader(fragmentShader);
                if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
                    console.error('Fragment shader error:', gl.getShaderInfoLog(fragmentShader));
                }

                // Attach the shaders and link the program
                highlightLayer.program = gl.createProgram();
                gl.attachShader(highlightLayer.program, vertexShader);
                gl.attachShader(highlightLayer.program, fragmentShader);
                gl.linkProgram(highlightLayer.program);
                if (!gl.getProgramParameter(highlightLayer.program, gl.LINK_STATUS)) {
                    console.error('Program link error:', gl.getProgramInfoLog(highlightLayer.program));
                }

                // Cache attribute locations for the packed vertex buffer.
                highlightLayer.aPos = gl.getAttribLocation(highlightLayer.program, 'a_pos');
                highlightLayer.aColor = gl.getAttribLocation(highlightLayer.program, 'a_color');

                // Upload interleaved vertex data: [x, y, r, g, b, a] per vertex.
                highlightLayer.buffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, highlightLayer.buffer);
                gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);
                highlightLayer.vertexCount = vertexCount;
            },

            // Method called to render the layer
            render: (gl, args) => {
                if (!highlightLayer.vertexCount) return;
                gl.useProgram(highlightLayer.program);
                gl.uniformMatrix4fv(
                    gl.getUniformLocation(highlightLayer.program, 'u_matrix'),
                    false,
                    args.defaultProjectionData.mainMatrix
                );
                gl.bindBuffer(gl.ARRAY_BUFFER, highlightLayer.buffer);
                // Stride = 6 floats * 4 bytes; pos starts at 0, color at offset 8 bytes.
                gl.enableVertexAttribArray(highlightLayer.aPos);
                gl.vertexAttribPointer(highlightLayer.aPos, 2, gl.FLOAT, false, 24, 0);
                gl.enableVertexAttribArray(highlightLayer.aColor);
                gl.vertexAttribPointer(highlightLayer.aColor, 4, gl.FLOAT, false, 24, 8);
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                gl.drawArrays(gl.TRIANGLES, 0, highlightLayer.vertexCount);
            }
        };

        // Remove old radar layer if it exists
        if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
        }

        // Add the WebGL content layer to the map
        map.addLayer(highlightLayer, 'Pier');
        
        if (isMainLayer) {
            this.currentRadarLayer = highlightLayer;
        }

        console.log('WebGL radar layer added successfully');
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
                // Batch remove existing markers from both maps
                const markers = this.radarMarkers;
                markers.main.forEach(m => m.remove());
                markers.main.length = 0; // Clear array in place (faster than reassign)
                
                if (this.isSplit()) {
                    markers.dual.forEach(m => m.remove());
                    markers.dual.length = 0;
                }

                const features = data.features;
                const isSplit = this.isSplit();
                const callbacks = this.callbacks;
                const mainMap = this.map;
                const dualMap = this.dualMap;
                
                for (let i = 0; i < features.length; i++) {
                    const station = features[i];
                    const properties = station.properties;
                    
                    // Filter TDWR stations
                    if (properties.stationType !== 'WSR-88D') continue;
                    // Filter non-CONUS stations
                    if (!properties.id.startsWith('K')) continue;

                    const coords = station.geometry.coordinates;
                    const icao = properties.id;
                    const isOperational = station.properties?.rda?.properties?.status === 'Operate';
                    const popupText = `${properties.name} (${icao}) - Status: ${properties.status}`;

                    // Add to main map
                    const mainMarkerElement = this._createStationMarkerElement(icao, isOperational);
                    mainMarkerElement.addEventListener('click', () => {
                        if (typeof callbacks.onSelectStation === 'function') {
                            callbacks.onSelectStation(icao);
                        }
                    });
                    const mainMarker = new maplibregl.Marker({ element: mainMarkerElement })
                        .setLngLat(coords)
                        .addTo(mainMap);
                    markers.main.push(mainMarker);

                    // Add to split map if active
                    if (isSplit) {
                        const dualMarkerElement = this._createStationMarkerElement(icao, isOperational);
                        dualMarkerElement.addEventListener('click', () => {
                            if (typeof callbacks.onSelectStationSplit === 'function') {
                                callbacks.onSelectStationSplit(icao);
                            }
                        });
                        const dualMarkerPopup = new maplibregl.Popup({ offset: 25 }).setText(popupText);
                        const dualMarker = new maplibregl.Marker({ element: dualMarkerElement })
                            .setLngLat(coords)
                            .addTo(dualMap);
                        markers.dual.push(dualMarker);
                    }
                }
            })
            .catch(error => {
                console.error('Error fetching radar stations:', error);
            });
    }
}

// Export the map class
export default Map;