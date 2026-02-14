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

class Map {
    // Constructor function
    constructor(params) {
        this.params = params;
        this.map = new maplibregl.Map(params);
        this.isSyncing = false;

        // WebGL radar layer tracking
        this.currentRadarLayer = null;
        this.currentGeojson = null;
        this.radar = null; // Store reference to radar instance
        this.palettes = new Palettes(); // Store palettes instance

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

        // Need to force apply projection because I don't freaking know.
        this.applyProjection(this.map, params.projection);
        // Store move listeners so we can clean them up later
        this.moveListeners = { main: null, dual: null };
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
            if (this.radar && options.loadVelocity !== false) {
                await this.loadRadarOnDualMap('VEL', options.station || 'KGRK');
                hideLoadingAnimation();
            }
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
    }

    setSplitLayout(layout = null) {
        const nextLayout = this.currentLayout === 'vertical' ? 'horizontal' : 'vertical';

        if (!layout) layout = nextLayout;
        
        const parent = this.map.getContainer().parentElement;
        if (!parent) return;

        parent.style.setProperty('grid-template-columns', layout === 'vertical' ? '1fr 1fr' : '1fr');
        parent.style.setProperty('grid-template-rows', layout === 'horizontal' ? '1fr 1fr' : '1fr');

        this.currentLayout = layout;
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

        parent.classList.remove('split');
        parent.style.removeProperty('grid-template-columns');
        parent.style.removeProperty('grid-template-rows');

        if (this.dualMap) {
            this.dualMap.remove();
            this.dualMap = null;
        }

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

    // Method to update color palette
    _updatePalette(layer) {
        this.currentPalette = layer;
        this.colorTable = this.palettes.getPalette(layer);
        this.colorStops = [];
        for (let i = 0; i < this.colorTable.length; i += 2) {
            this.colorStops.push({
                value: Number(this.colorTable[i]),
                color: this._parseRgb(this.colorTable[i + 1])
            });
        }
    }

    // Method to load radar on dual map
    async loadRadarOnDualMap(layer = 'VEL', station = 'KGRK') {
        showLoadingAnimation();
        if (!this.dualMap || !this.radar) {
            console.warn('Dual map or radar not available');
            return;
        }

        try {
            // Temporarily update color palette for the dual map layer
            const originalPalette = this.currentPalette;
            this._updatePalette(layer);

            // Get the radar data
            const radarGeoJson = await this.radar.getRadarLayer(station, layer);
            if (radarGeoJson) {
                this.addWebGlRadarLayer(radarGeoJson, this.dualMap);
                hideLoadingAnimation();
            }

            // Restore original palette for main map
            this._updatePalette(originalPalette);
        } catch (error) {
            console.error('Error loading radar on dual map:', error);
            hideLoadingAnimation();
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
        if (value <= this.colorStops[0].value) {
            return this.colorStops[0].color;
        }
        for (let i = 0; i < this.colorStops.length - 1; i += 1) {
            const left = this.colorStops[i];
            const right = this.colorStops[i + 1];
            if (value <= right.value) {
                const span = right.value - left.value;
                const t = span > 0 ? (value - left.value) / span : 0;
                return this._lerpColor(left.color, right.color, t);
            }
        }
        return this.colorStops[this.colorStops.length - 1].color;
    }

    _flattenPolygon(rings) {
        const vertices = [];
        const holeIndices = [];
        let vertexCount = 0;

        rings.forEach((ring, index) => {
            if (index > 0) {
                holeIndices.push(vertexCount);
            }
            ring.forEach((coord) => {
                const lng = Number(coord[0]);
                const lat = Number(coord[1]);
                const mercator = maplibregl.MercatorCoordinate.fromLngLat({ lng, lat });
                vertices.push(mercator.x, mercator.y);
                vertexCount += 1;
            });
        });

        return { vertices, holeIndices };
    }

    _buildVertexData(geojson) {
        const data = [];
        const features = geojson.features || [];
        const alpha = 0.85;

        for (const feature of features) {
            const value = Number(feature.properties?.val ?? 0);
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
                    const value = Number(feature.properties?.val);
                    return Number.isFinite(value) ? value : null;
                }
            }
        }
        return null;
    }

    addWebGlRadarLayer(radarGeoJson, targetMap = null) {
        // Use provided map or default to main map
        const map = targetMap || this.map;
        const layerId = targetMap ? 'radar-webgl-dual' : 'radar-webgl';
        
        if (!radarGeoJson || !radarGeoJson.features) {
            console.error('Invalid GeoJSON data provided to addWebGlRadarLayer');
            return;
        }

        // Compute bounding boxes for all features
        for (const feature of radarGeoJson.features) {
            feature.__bbox = this._computeFeatureBBox(feature);
        }
        
        if (!targetMap) {
            this.currentGeojson = radarGeoJson;
        }

        // Prepare the vertex data
        const vertexData = this._buildVertexData(radarGeoJson);
        const vertexCount = vertexData.length / 6;
        const geoBounds = this._computeBounds(radarGeoJson);

        // Remove old radar layer if it exists
        if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
        }
        
        if (!targetMap) {
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

        // Add the WebGL content layer to the map
        map.addLayer(highlightLayer);
        
        if (!targetMap) {
            this.currentRadarLayer = highlightLayer;
        }

        if (geoBounds && !targetMap) {
            map.fitBounds(geoBounds, { padding: 40, maxZoom: 10 });
        }

        console.log('WebGL radar layer added successfully');
    }
}

// Export the map class
export default Map;