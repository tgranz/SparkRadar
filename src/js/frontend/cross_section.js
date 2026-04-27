/*
> cross_section.js
Handles cross-section visualization.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import { createSplitToolbar } from './toolbars/split_toolbar.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Tilt codes per base product — must stay in sync with radar_picker.js productEntries.
const TILT_CODES = {
    'N_B': ['0', 'A', '1', '2', 'B', '3'],
    'N_G': ['0', 'A', '1'],
    'N_C': ['0', 'A', '1', '2', 'B', '3'],
    'N_X': ['0', 'A', '1', '2', 'B', '3'],
    'N_K': ['0', 'A', '1', '2', 'B', '3'],
    'N_H': ['0', 'A', '1', '2', 'B', '3'],
    'N_S': ['0', '1', '2', '3'],
};

// Approximate VCP elevation angle (degrees) for each tilt code.
const TILT_ELEVATION_DEG = {
    '0': 0.5, 'A': 0.9, '1': 1.3, '2': 1.8, 'B': 2.4, '3': 3.1,
};

export default class CrossSection {
    constructor(map, callbacks = {}) {
        this.map = map;
        this.callbacks = callbacks;
        this.enabled = false;
        this.splitType = 'cross-section';

        this.splitPane = null;
        this.graphHost = null;
        this.splitPaneResizeObserver = null;

        this.currentProduct = null;
        this.currentStation = null;
        this.tiltData = {};
        this.tiltBounds = {};
        this.tiltCodes = [];

        this.lineCanvasMarker = null;
        this.lineMarkerResizeHandler = null;

        this.gateValues = [];

        // Worker for off-thread gate sampling
        this.worker = null;
        this._pendingRequestId = 0;

        this._radarPickerHiddenForCrossSection = false;
        this._dualMapButtonTitleBeforeDisable = null;
    }

    async enable(station, product) {
        if (this.enabled) return;

        window.disableAutoUpdates();

        this.enabled = true;
        this.currentStation = station;
        this.currentProduct = product;

        this._hideRadarPicker();
        this._setDualMapButtonDisabled(true);

        this._setupUI();
        this._createWorker();
        await this._loadAllTilts(station, product);
        this._sendTiltsToWorker();

        this._setupLineMarker();
        this._renderCrossSection(); // shows loading message immediately
        this._collectGatesAlongLine(); // posts to worker; result triggers re-render

        // Hide VCP display
        const vcpElement = document.getElementById('toolbar-station-info-mobile');
        if (vcpElement) vcpElement.style.display = 'none';
    }

    disable() {
        if (!this.enabled) return;

        this.enabled = false;

        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }

        this._cleanupUI();

        this.tiltData = {};
        this.tiltBounds = {};
        this.tiltCodes = [];
        this.gateValues = [];

        // Show VCP display
        const vcpElement = document.getElementById('toolbar-station-info-mobile');
        if (vcpElement) vcpElement.style.display = 'flex';

        this._restoreRadarPicker();
        this._setDualMapButtonDisabled(false);

        window.enableAutoUpdates();
    }

    _setDualMapButtonDisabled(disabled) {
        const dualMapButton = document.getElementById('dual-map-button');
        if (!dualMapButton) return;

        if (disabled) {
            if (this._dualMapButtonTitleBeforeDisable == null) {
                this._dualMapButtonTitleBeforeDisable = dualMapButton.title || 'Dual-radar view';
            }
            if (typeof window.setToolEnabled === 'function') {
                window.setToolEnabled(dualMapButton, false);
            } else {
                dualMapButton.disabled = true;
                dualMapButton.setAttribute('aria-disabled', 'true');
                dualMapButton.style.color = 'gray';
                dualMapButton.style.pointerEvents = 'none';
            }
            dualMapButton.title = 'Dual-radar view unavailable in cross-section mode';
            return;
        }

        if (typeof window.setToolEnabled === 'function') {
            window.setToolEnabled(dualMapButton, true);
        } else {
            dualMapButton.disabled = false;
            dualMapButton.setAttribute('aria-disabled', 'false');
            dualMapButton.style.color = 'white';
            dualMapButton.style.pointerEvents = 'auto';
        }
        dualMapButton.title = this._dualMapButtonTitleBeforeDisable || 'Dual-radar view';
        this._dualMapButtonTitleBeforeDisable = null;
    }

    _hideRadarPicker() {
        const picker = this.map?.radarPicker;
        if (!picker || typeof picker.destroy !== 'function') return;

        picker.destroy();
        this._radarPickerHiddenForCrossSection = true;
    }

    _restoreRadarPicker() {
        if (!this._radarPickerHiddenForCrossSection) return;

        if (typeof this.map?.rebuildRadarPicker === 'function') {
            const level2Only = Boolean(this.map?.radarPicker?.level2Only);
            this.map.rebuildRadarPicker('main', level2Only);
        }

        this._radarPickerHiddenForCrossSection = false;
    }

    _setupUI() {
        const mainContainer = this.map.map.getContainer();
        const parent = mainContainer.parentElement;
        if (!parent) return;

        parent.classList.add('split');
        this.splitType = 'cross-section';

        const pane = document.createElement('div');
        pane.id = 'cross-section-pane';
        pane.style.width = '100%';
        pane.style.height = '100%';
        pane.style.display = 'flex';
        pane.style.flexDirection = 'column';
        pane.style.overflow = 'hidden';
        pane.style.background = 'var(--bg-color, #111)';

        const graphHost = document.createElement('div');
        graphHost.id = 'cross-section-graph';
        graphHost.style.flex = '1';
        graphHost.style.minHeight = '0';
        graphHost.style.padding = '8px';
        graphHost.style.display = 'flex';
        graphHost.style.alignItems = 'center';
        graphHost.style.justifyContent = 'center';

        pane.appendChild(graphHost);
        parent.appendChild(pane);

        this.splitPane = pane;
        this.graphHost = graphHost;

        if (typeof ResizeObserver !== 'undefined') {
            this.splitPaneResizeObserver?.disconnect();
            this.splitPaneResizeObserver = new ResizeObserver(() => this._renderCrossSection());
            this.splitPaneResizeObserver.observe(pane);
        }

        const splitToolbar = createSplitToolbar(
            () => this._toggleLayout(),
            () => this.map.disableCrossSection()
        );
        parent.appendChild(splitToolbar);

        parent.style.setProperty('grid-template-columns', '1fr 1fr');
        parent.style.setProperty('grid-template-rows', '1fr');

        this._renderCrossSection();
    }

    _cleanupUI() {
        const mainContainer = this.map.map.getContainer();
        const parent = mainContainer.parentElement;
        if (!parent) return;

        parent.classList.remove('split');
        parent.style.removeProperty('grid-template-columns');
        parent.style.removeProperty('grid-template-rows');

        if (this.splitPane && this.splitPane.parentElement) {
            this.splitPane.parentElement.removeChild(this.splitPane);
        }

        if (this.lineCanvasMarker) {
            this.lineCanvasMarker.remove();
            this.lineCanvasMarker = null;
        }

        if (this.lineMarkerResizeHandler) {
            window.removeEventListener('resize', this.lineMarkerResizeHandler);
            this.lineMarkerResizeHandler = null;
        }

        this.splitPaneResizeObserver?.disconnect();
        this.splitPaneResizeObserver = null;

        this.graphHost = null;
        this.splitPane = null;
    }

    _normalizeProductBase(product) {
        for (const [baseCode, tilts] of Object.entries(TILT_CODES)) {
            for (const tilt of tilts) {
                if (this.map._buildTiltedProduct(baseCode, tilt) === product) {
                    return baseCode;
                }
            }
        }
        return null;
    }

    async _loadAllTilts(station, product) {
        const radar = this.map.radar;
        if (!radar) return;

        const baseCode = this._normalizeProductBase(product);
        if (!baseCode) {
            const empty = document.createElement('div');
            empty.textContent = 'Cross section unavailable (product does not support tilts)';
            empty.style.color = '#ff2121';
            empty.id = 'cross-section-unavailable';
            this.graphHost.appendChild(empty);
            return;
        }

        const tilts = TILT_CODES[baseCode];
        this.tiltCodes = tilts;

        for (let i = 0; i < tilts.length; i++) {
            const tiltCode = tilts[i];
            const tiltedProduct = this.map._buildTiltedProduct(baseCode, tiltCode);
            try {
                const radarResult = await radar.getRadarLayer(station, tiltedProduct, {
                    includeGeojson: false,
                });

                if (radarResult?.meshData instanceof Float32Array) {
                    this.tiltData[i] = radarResult.meshData;
                    this.tiltBounds[i] = radarResult.bounds;
                }
            } catch (error) {
                console.warn(`[CrossSection] Failed to load tilt ${tiltCode} (${tiltedProduct}):`, error);
            }
        }
    }

    _setupLineMarker() {
        const mapElement = this.map.map.getContainer();

        const lineCanvas = document.createElement('canvas');
        lineCanvas.id = 'cross-section-line-marker';
        lineCanvas.style.position = 'absolute';
        lineCanvas.style.top = '0';
        lineCanvas.style.left = '0';
        lineCanvas.style.pointerEvents = 'none';
        lineCanvas.style.zIndex = '100';

        mapElement.style.position = 'relative';
        mapElement.appendChild(lineCanvas);
        this.lineCanvasMarker = lineCanvas;

        this.lineMarkerResizeHandler = () => {
            lineCanvas.width = mapElement.clientWidth;
            lineCanvas.height = mapElement.clientHeight;
            this._drawCenterLine();
        };

        this.lineMarkerResizeHandler();
        window.addEventListener('resize', this.lineMarkerResizeHandler);
    }

    _drawCenterLine() {
        if (!this.lineCanvasMarker) return;

        const ctx = this.lineCanvasMarker.getContext('2d');
        if (!ctx) return;

        const width = this.lineCanvasMarker.width;
        const height = this.lineCanvasMarker.height;

        ctx.clearRect(0, 0, width, height);

        const centerX = width / 2;
        const centerY = height / 2;
        const halfLength = width * 0.25;

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(centerX - halfLength, centerY);
        ctx.lineTo(centerX + halfLength, centerY);
        ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(centerX - halfLength, centerY);
        ctx.lineTo(centerX + halfLength, centerY);
        ctx.stroke();
    }

    _collectGatesAlongLine() {
        if (!this.worker) return;

        const mapInstance = this.map.map;
        const container = mapInstance.getContainer();
        if (!container) return;

        // Use CSS pixel dimensions so sampling uses the same coordinate space
        // as the visible center line overlay and Mapbox's unproject input.
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (!width || !height) return;

        const centerX = width / 2;
        const centerY = height / 2;
        const halfLength = width * 0.25;

        const startX = centerX - halfLength;
        const endX = centerX + halfLength;
        const startLngLat = mapInstance.unproject([startX, centerY]);
        const endLngLat = mapInstance.unproject([endX, centerY]);
        const sampleCount = this._estimateSampleCount(startLngLat, endLngLat);

        // Build the sample point list on the main thread (requires Mapbox unproject)
        const samples = [];
        for (let i = 0; i < sampleCount; i++) {
            const t = sampleCount <= 1 ? 0 : i / (sampleCount - 1);
            const x = startX + (endX - startX) * t;
            const lngLat = mapInstance.unproject([x, centerY]);
            samples.push({ lat: lngLat.lat, lng: lngLat.lng });
        }

        // Dispatch heavy mesh lookups to the worker.  A request ID lets us
        // discard results from superseded (stale) requests.
        const requestId = ++this._pendingRequestId;
        this.worker.postMessage({ type: 'collectGates', id: requestId, samples });
    }

    _createWorker() {
        if (this.worker) {
            this.worker.terminate();
        }
        this._pendingRequestId = 0;
        this.worker = new Worker(
            new URL('../workers/cross_section_worker.js', import.meta.url),
            { type: 'module' }
        );
        this.worker.onmessage = (event) => {
            const { type, id, gateValues } = event.data || {};
            if (type === 'gatesResult') {
                if (id !== this._pendingRequestId) return; // discard stale result
                this.gateValues = gateValues;
                this._renderCrossSection();
            }
        };
        this.worker.onerror = (err) => {
            console.error('[CrossSection] Worker error:', err);
        };
    }

    _sendTiltsToWorker() {
        if (!this.worker) return;
        const count = this.tiltCodes.length;
        this.worker.postMessage({
            type: 'loadTilts',
            tiltMeshes: Array.from({ length: count }, (_, i) => this.tiltData[i] ?? null),
            tiltBounds: Array.from({ length: count }, (_, i) => this.tiltBounds[i] ?? null),
        });
    }

    _estimateSampleCount(startLngLat, endLngLat) {
        const sampleLimit = 128;
        const lineSpan = Math.hypot(
            endLngLat.lng - startLngLat.lng,
            endLngLat.lat - startLngLat.lat
        );

        if (!Number.isFinite(lineSpan) || lineSpan <= 0) {
            return 64;
        }

        const meshData = this._getReferenceMeshData();
        const avgGateSpan = this._estimateAverageGateSpan(meshData);

        if (!Number.isFinite(avgGateSpan) || avgGateSpan <= 0) {
            return Math.max(24, Math.min(sampleLimit, Math.round(lineSpan * 320)));
        }

        const estimatedCrossedGates = lineSpan / avgGateSpan;
        const raw = Math.round(estimatedCrossedGates * 1.4);
        this._sampleLimitExceeded = raw > sampleLimit;
        return Math.max(24, Math.min(sampleLimit, raw));
    }

    _getReferenceMeshData() {
        const count = this.tiltCodes.length || 4;
        for (let tilt = 0; tilt < count; tilt++) {
            const meshData = this.tiltData[tilt];
            if (meshData instanceof Float32Array && meshData.length >= 9) {
                return meshData;
            }
        }
        return null;
    }

    _estimateAverageGateSpan(meshData) {
        if (!(meshData instanceof Float32Array) || meshData.length < 9) {
            return null;
        }

        const quadCount = Math.floor(meshData.length / 9);
        if (quadCount === 0) return null;

        const sampleQuads = Math.min(quadCount, 700);
        const stride = Math.max(1, Math.floor(quadCount / sampleQuads));

        let totalSpan = 0;
        let count = 0;

        for (let quadIndex = 0; quadIndex < quadCount && count < sampleQuads; quadIndex += stride) {
            const i = quadIndex * 9;
            const lon1 = meshData[i];
            const lat1 = meshData[i + 1];
            const lon2 = meshData[i + 2];
            const lat2 = meshData[i + 3];
            const lon4 = meshData[i + 6];
            const lat4 = meshData[i + 7];

            const edgeA = Math.hypot(lon2 - lon1, lat2 - lat1);
            const edgeB = Math.hypot(lon4 - lon1, lat4 - lat1);
            const span = (edgeA + edgeB) / 2;

            if (Number.isFinite(span) && span > 0) {
                totalSpan += span;
                count++;
            }
        }

        if (count === 0) return null;
        return totalSpan / count;
    }

    _renderCrossSection() {
        if (!this.graphHost) return;

        if (!document.getElementById('cross-section-tooltip')) {
            const tooltip = document.createElement('div');
            tooltip.id = 'cross-section-tooltip';
            tooltip.style.display = 'none';
            document.body.appendChild(tooltip);
        }

        this.graphHost.innerHTML = '';

        const width = Math.max(280, this.graphHost.clientWidth - 4);
        const height = Math.max(180, this.graphHost.clientHeight - 4);

        const validValues = [];
        for (const sample of this.gateValues) {
            for (const tiltValue of sample.tilts || []) {
                if (Number.isFinite(tiltValue)) {
                    validValues.push(tiltValue);
                }
            }
        }

        if (this.gateValues.length === 0 || validValues.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'No radar data to sample here.';
            empty.style.color = '#ddd';
            empty.style.opacity = '0.7';
            empty.style.padding = '12px';
            empty.style.fontSize = '13px';
            empty.id = 'cross-section-unavailable';
            this.graphHost.appendChild(empty);
            return;
        }

        let minValue = Math.min(...validValues);
        let maxValue = Math.max(...validValues);
        if (minValue === maxValue) {
            minValue -= 1;
            maxValue += 1;
        }

        const margin = { top: 14, right: 12, bottom: 24, left: 36 };
        const plotWidth = Math.max(1, width - margin.left - margin.right);
        const plotHeight = Math.max(1, height - margin.top - margin.bottom);

        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('width', '80%');
        svg.setAttribute('height', '60%');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.style.background = 'var(--bg-color, #111)';

        for (let i = 0; i <= 4; i++) {
            const gy = margin.top + (i / 4) * plotHeight;
            const grid = document.createElementNS(SVG_NS, 'line');
            grid.setAttribute('x1', String(margin.left));
            grid.setAttribute('x2', String(width - margin.right));
            grid.setAttribute('y1', String(gy));
            grid.setAttribute('y2', String(gy));
            grid.setAttribute('stroke', 'rgba(255, 255, 255, 0.3)');
            grid.setAttribute('stroke-width', '1');
            svg.appendChild(grid);
        }

        const axisX = document.createElementNS(SVG_NS, 'line');
        axisX.setAttribute('x1', String(margin.left));
        axisX.setAttribute('x2', String(width - margin.right));
        axisX.setAttribute('y1', String(height - margin.bottom));
        axisX.setAttribute('y2', String(height - margin.bottom));
        axisX.setAttribute('stroke', 'rgba(255,255,255,0.5)');
        axisX.setAttribute('stroke-width', '2');
        svg.appendChild(axisX);

        const axisY = document.createElementNS(SVG_NS, 'line');
        axisY.setAttribute('x1', String(margin.left));
        axisY.setAttribute('x2', String(margin.left));
        axisY.setAttribute('y1', String(margin.top));
        axisY.setAttribute('y2', String(height - margin.bottom));
        axisY.setAttribute('stroke', 'rgba(255,255,255,0.5)');
        axisY.setAttribute('stroke-width', '2');
        svg.appendChild(axisY);

        const rowCount = this.tiltCodes.length || 4;
        const colCount = Math.max(1, this.gateValues.length);
        const cellWidth = plotWidth / colCount;
        const paletteStops = this._getPaletteStopsForCurrentProduct();
        const radarSite = this._getRadarSiteCoordinates();

        const heightCenters = [];
        let maxHeightKm = 0;

        for (let sampleIdx = 0; sampleIdx < this.gateValues.length; sampleIdx++) {
            const sample = this.gateValues[sampleIdx];
            const rowHeights = [];

            for (let tilt = 0; tilt < rowCount; tilt++) {
                const hKm = this._estimateGateHeightKm(sample, tilt, radarSite);
                rowHeights.push(hKm);
                if (Number.isFinite(hKm)) {
                    maxHeightKm = Math.max(maxHeightKm, hKm);
                }
            }

            heightCenters.push(rowHeights);
        }

        const trueMaxHeightKm = maxHeightKm;
        maxHeightKm = Math.max(1, maxHeightKm * 1.1);

        const addYLabel = (text, yPx) => {
            const el = document.createElementNS(SVG_NS, 'text');
            el.setAttribute('x', '0');
            el.setAttribute('y', String(yPx));
            el.setAttribute('fill', 'rgba(255,255,255,0.85)');
            el.setAttribute('font-size', '12');
            el.textContent = `+${text}`;
            svg.appendChild(el);
        };
        addYLabel(trueMaxHeightKm.toFixed(1) + ' km', margin.top + 10);
        addYLabel('0 km', height - margin.bottom - 4);

        const heightToY = (heightKm) => {
            const normalized = Math.max(0, Math.min(1, heightKm / maxHeightKm));
            return margin.top + (1 - normalized) * plotHeight;
        };

        const getBoundsForSampleTilt = (sampleIdx, tilt) => {
            const centers = heightCenters[sampleIdx] || [];
            const center = centers[tilt];

            if (!Number.isFinite(center)) {
                return null;
            }

            const lowerCenter = tilt > 0 ? centers[tilt - 1] : 0;
            const upperCenter = tilt < rowCount - 1 ? centers[tilt + 1] : null;

            const bottomKm = tilt === 0
                ? 0
                : Number.isFinite(lowerCenter)
                    ? (center + lowerCenter) / 2
                    : center * 0.75;

            const topKm = tilt === rowCount - 1
                ? Number.isFinite(upperCenter)
                    ? Math.max((center + upperCenter) / 2, center + 0.05)
                    : center + Math.max(0.05, center - bottomKm)
                : Number.isFinite(upperCenter)
                    ? (center + upperCenter) / 2
                    : center + Math.max(0.05, center - bottomKm);

            const safeTop = Math.max(topKm, bottomKm + 0.01);
            return {
                topY: heightToY(safeTop),
                bottomY: heightToY(bottomKm)
            };
        };

        for (let sampleIdx = 0; sampleIdx < this.gateValues.length; sampleIdx++) {
            const xLeft = margin.left + sampleIdx * cellWidth;
            const xRight = sampleIdx < this.gateValues.length - 1
                ? margin.left + (sampleIdx + 1) * cellWidth
                : xLeft + cellWidth;
            const nextSampleIdx = Math.min(sampleIdx + 1, this.gateValues.length - 1);

            for (let tilt = 0; tilt < rowCount; tilt++) {
                const value = this.gateValues[sampleIdx]?.tilts?.[tilt];
                if (!Number.isFinite(value)) continue;

                const leftBounds = getBoundsForSampleTilt(sampleIdx, tilt);
                const rightBounds = getBoundsForSampleTilt(nextSampleIdx, tilt);
                if (!leftBounds || !rightBounds) continue;

                const p1 = `${xLeft},${leftBounds.topY}`;
                const p2 = `${xRight},${rightBounds.topY}`;
                const p3 = `${xRight},${rightBounds.bottomY}`;
                const p4 = `${xLeft},${leftBounds.bottomY}`;

                const block = document.createElementNS(SVG_NS, 'polygon');
                block.setAttribute('points', `${p1} ${p2} ${p3} ${p4}`);
                block.setAttribute('fill', this._colorForValue(value, paletteStops));
                block.addEventListener('mouseover', (e) => {
                    block.setAttribute('stroke', 'rgba(255,255,255,0.8)');
                    block.setAttribute('stroke-width', '1');
                    const tooltip = document.getElementById('cross-section-tooltip');
                    if (tooltip) {
                        tooltip.style.display = 'block';
                        tooltip.innerHTML = `Tilt: ${this._getTiltElevationAngle(tilt)}&deg;<br>Value: ${value.toFixed(1)}`;
                        tooltip.style.left = `${e.pageX}px`;
                        tooltip.style.top = `${e.pageY}px`;
                    }
                });
                block.addEventListener('mouseout', (e) => {
                    block.setAttribute('stroke-width', '0');
                    const tooltip = document.getElementById('cross-section-tooltip');
                    if (tooltip) {
                        tooltip.style.display = 'none';
                    }
                });
                svg.appendChild(block);
            }
        }

        if (this._sampleLimitExceeded) {
            const warn = document.createElement('div');
            warn.textContent = 'Sample limit exceeded. Zoom in for higher resolution.';
            warn.classList.add('cross-section-warning');
            this.graphHost.style.position = 'relative';
            this.graphHost.appendChild(warn);
        }

        this.graphHost.appendChild(svg);
    }

    _getTiltElevationAngle(tiltIndex) {
        const code = this.tiltCodes[tiltIndex];
        return (code != null ? TILT_ELEVATION_DEG[code] : null) ?? 0.5;
    }

    _getRadarSiteCoordinates() {
        const station = String(this.currentStation || this.map?.currentMainStation || '').toUpperCase();
        const features = globalThis.window?.radarStationFeatures;
        if (!station || !Array.isArray(features)) {
            return null;
        }

        const normalized = station.length === 3 ? `K${station}` : station;

        for (let i = 0; i < features.length; i++) {
            const feature = features[i];
            const id = String(feature?.properties?.id || '').toUpperCase();
            const coords = feature?.geometry?.coordinates;
            if (!Array.isArray(coords) || coords.length < 2) continue;

            if (id === normalized || id === station) {
                return { lng: Number(coords[0]), lat: Number(coords[1]) };
            }
        }

        return null;
    }

    _haversineDistanceKm(lat1, lng1, lat2, lng2) {
        const toRad = (deg) => deg * (Math.PI / 180);
        const earthRadiusKm = 6371;

        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return earthRadiusKm * c;
    }

    _estimateGateHeightKm(sample, tilt, radarSite) {
        if (!sample || !Number.isFinite(sample.lat) || !Number.isFinite(sample.lng)) {
            return null;
        }

        const elevationDeg = this._getTiltElevationAngle(tilt);
        const elevationRad = elevationDeg * (Math.PI / 180);

        if (!radarSite || !Number.isFinite(radarSite.lat) || !Number.isFinite(radarSite.lng)) {
            const fallbackRangeKm = 50;
            return fallbackRangeKm * Math.tan(elevationRad);
        }

        const rangeKm = this._haversineDistanceKm(radarSite.lat, radarSite.lng, sample.lat, sample.lng);
        return rangeKm * Math.tan(elevationRad);
    }

    _parsePaletteColor(colorText) {
        if (typeof colorText !== 'string') return null;

        let match = colorText.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/i);
        if (match) {
            const alphaRaw = Number(match[4]);
            const alpha = alphaRaw > 1 ? alphaRaw / 255 : alphaRaw;
            return {
                r: Number(match[1]),
                g: Number(match[2]),
                b: Number(match[3]),
                a: Math.max(0, Math.min(1, alpha)),
            };
        }

        match = colorText.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
        if (match) {
            return {
                r: Number(match[1]),
                g: Number(match[2]),
                b: Number(match[3]),
                a: 1,
            };
        }

        return null;
    }

    _getPaletteStopsForCurrentProduct() {
        const paletteName = this.map?._getPaletteForProduct?.(this.currentProduct || 'N0B') || 'REF';
        const table = this.map?.palettes?.getPalette?.(paletteName) || [];
        const stops = [];

        for (let i = 0; i < table.length; i += 2) {
            const value = Number(table[i]);
            const color = this._parsePaletteColor(table[i + 1]);
            if (!Number.isFinite(value) || !color) continue;
            stops.push({ value, color });
        }

        stops.sort((a, b) => a.value - b.value);
        return stops;
    }

    _interpolateColor(left, right, t) {
        const lerp = (a, b) => a + (b - a) * t;
        return {
            r: lerp(left.r, right.r),
            g: lerp(left.g, right.g),
            b: lerp(left.b, right.b),
            a: lerp(left.a, right.a),
        };
    }

    _colorForValue(value, stops) {
        if (!Array.isArray(stops) || stops.length === 0 || !Number.isFinite(value)) {
            return 'rgba(160,160,160,0.9)';
        }

        if (value <= stops[0].value) {
            const c = stops[0].color;
            return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${c.a})`;
        }

        const last = stops[stops.length - 1];
        if (value >= last.value) {
            const c = last.color;
            return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${c.a})`;
        }

        for (let i = 0; i < stops.length - 1; i++) {
            const left = stops[i];
            const right = stops[i + 1];
            if (value >= left.value && value <= right.value) {
                const span = right.value - left.value;
                const t = span === 0 ? 0 : (value - left.value) / span;
                const c = this._interpolateColor(left.color, right.color, t);
                return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${c.a})`;
            }
        }

        const c = last.color;
        return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${c.a})`;
    }

    _toggleLayout() {
        const mainContainer = this.map.map.getContainer();
        const parent = mainContainer.parentElement;
        if (!parent) return;

        const isHorizontal = parent.style.gridTemplateColumns === '1fr 1fr';

        if (isHorizontal) {
            parent.style.setProperty('grid-template-columns', '1fr');
            parent.style.setProperty('grid-template-rows', '1fr 1fr');
        } else {
            parent.style.setProperty('grid-template-columns', '1fr 1fr');
            parent.style.setProperty('grid-template-rows', '1fr');
        }

        // Re-render after the browser has applied the new layout so the
        // center line and graph reflect the updated map container dimensions.
        // lineMarkerResizeHandler resizes the canvas to the new map element
        // dimensions before drawing, so the line lands at the correct position.
        requestAnimationFrame(() => {
            if (this.lineMarkerResizeHandler) this.lineMarkerResizeHandler();
            this._collectGatesAlongLine();
            this._renderCrossSection();
        });
    }

    update() {
        // _renderCrossSection is driven by the worker's gatesResult callback.
        // Just dispatch a new sampling request; the current graph stays visible
        // until the result arrives, avoiding flicker.
        this._collectGatesAlongLine();
    }
}
