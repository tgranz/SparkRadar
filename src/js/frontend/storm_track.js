import Window from '../ui/window.js';

const EARTH_RADIUS_MILES = 3958.7613;
const ARC_SEGMENTS = 28;
const MIN_TRACK_MILES = 1;
const DEFAULT_STORM_SPEED_MPH = 35;
const MIN_CAP_RADIUS_MILES = 5;

const toRadians = (degrees) => degrees * (Math.PI / 180);
const toDegrees = (radians) => radians * (180 / Math.PI);

function normalizeLngLat(lngLat) {
    if (!lngLat) return null;
    const lng = Number(lngLat.lng);
    const lat = Number(lngLat.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return null;
    }

    return { lng, lat };
}

function haversineMiles(start, end) {
    const a = normalizeLngLat(start);
    const b = normalizeLngLat(end);
    if (!a || !b) return 0;

    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);
    const deltaLat = toRadians(b.lat - a.lat);
    const deltaLng = toRadians(b.lng - a.lng);

    const h = Math.sin(deltaLat / 2) ** 2
        + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return EARTH_RADIUS_MILES * c;
}

function bearingDegrees(start, end) {
    const a = normalizeLngLat(start);
    const b = normalizeLngLat(end);
    if (!a || !b) return 0;

    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);
    const deltaLng = toRadians(b.lng - a.lng);

    const y = Math.sin(deltaLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2)
        - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

    return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function destinationPoint(start, bearingDeg, distanceMiles) {
    const origin = normalizeLngLat(start);
    if (!origin) return null;

    const angularDistance = distanceMiles / EARTH_RADIUS_MILES;
    const bearing = toRadians(bearingDeg);
    const lat1 = toRadians(origin.lat);
    const lng1 = toRadians(origin.lng);

    const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(angularDistance)
        + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
    );

    const lng2 = lng1 + Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
        Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

    return {
        lng: ((toDegrees(lng2) + 540) % 360) - 180,
        lat: toDegrees(lat2),
    };
}

function toPointArray(lngLat) {
    return [lngLat.lng, lngLat.lat];
}

function pointInRing(point, ring) {
    if (!Array.isArray(ring) || ring.length < 3) return false;

    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];

        const intersects = ((yi > y) !== (yj > y))
            && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);

        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
}

function formatEtaFromHours(hours) {
    if (!Number.isFinite(hours) || hours < 0) return '--';

    const arrival = new Date(Date.now() + (hours * 60 * 60 * 1000));
    const now = new Date();
    const sameDay = arrival.toDateString() === now.toDateString();

    const timeLabel = arrival.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
    });

    if (sameDay) {
        return `Today ${timeLabel}`;
    }

    const dateLabel = arrival.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
    });

    return `${dateLabel} ${timeLabel}`;
}

function formatHours(hours) {
    if (!Number.isFinite(hours) || hours < 0) return '--';
    const totalMinutes = Math.max(0, Math.round(hours * 60));
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${hh}h ${mm}m`;
}

export default class StormTrack {
    static instance = null;
    static _citiesPromise = null;
    static _cities = null;

    constructor(mapInstance) {
        if (StormTrack.instance) {
            return StormTrack.instance;
        }

        StormTrack.instance = this;
        this.mapInstance = mapInstance;
        this.lockedMaps = [];
        this.activePointerId = null;
        this.isDrawing = false;
        this.drawMapKey = null;
        this.track = null;
        this.window = null;
        this.cities = [];

        this.trackCanvas = document.createElement('canvas');
        this.trackCanvas.id = 'storm-track-canvas';
        this.trackCanvas.style.position = 'fixed';
        this.trackCanvas.style.inset = '0';
        this.trackCanvas.style.width = '100%';
        this.trackCanvas.style.height = '100%';
        this.trackCanvas.style.pointerEvents = 'none';
        this.trackCanvas.style.zIndex = '1005';
        document.body.appendChild(this.trackCanvas);
        this.trackCtx = this.trackCanvas.getContext('2d');

        this.overlay = document.createElement('div');
        this.overlay.id = 'storm-track-overlay';
        this.overlay.className = 'storm-track-overlay';
        this.overlay.innerHTML = '<div class="storm-track-hint">Storm Track: click and drag to draw</div>';
        document.body.appendChild(this.overlay);

        this.pointerDownHandler = (e) => this.onPointerDown(e);
        this.pointerMoveHandler = (e) => this.onPointerMove(e);
        this.pointerUpHandler = (e) => this.onPointerUp(e);
        this.keydownHandler = (e) => {
            if (e.key === 'Escape') {
                this.close();
            }
        };
        this.resizeHandler = () => {
            this.resizeCanvas();
            this.redrawOverlay();
        };
        this.mainStyleDataHandler = () => this.renderTrack();
        this.dualStyleDataHandler = () => this.renderTrack();

        this.overlay.addEventListener('pointerdown', this.pointerDownHandler);
        window.addEventListener('pointermove', this.pointerMoveHandler);
        window.addEventListener('pointerup', this.pointerUpHandler);
        window.addEventListener('pointercancel', this.pointerUpHandler);
        window.addEventListener('resize', this.resizeHandler);
        document.addEventListener('keydown', this.keydownHandler);

        this.mapInstance?.map?.on?.('styledata', this.mainStyleDataHandler);
        this.mapInstance?.dualMap?.on?.('styledata', this.dualStyleDataHandler);

        this.lockMaps();
        this.resizeCanvas();
        this.updateButtonState(true);
        this.renderTrack();

        this.loadCities().then(() => {
            if (this.statusText) {
                this.statusText.textContent = 'Click and drag on the map to draw a storm track.';
            }
        }).catch(() => {
            if (this.statusText) {
                this.statusText.textContent = 'Cities database failed to load.';
            }
        });
    }

    updateButtonState(active) {
        const button = document.getElementById('storm-track-button');
        if (!button) return;
        button.classList.toggle('selected', active);
    }

    getMapRef(mapKey) {
        return mapKey === 'dual' ? this.mapInstance?.dualMap : this.mapInstance?.map;
    }

    getMapAtClientPoint(clientX, clientY) {
        const candidates = [
            { key: 'dual', map: this.mapInstance?.dualMap },
            { key: 'main', map: this.mapInstance?.map },
        ];

        for (const candidate of candidates) {
            const mapRef = candidate.map;
            if (!mapRef?.getCanvas) continue;
            const rect = mapRef.getCanvas().getBoundingClientRect();
            if (
                clientX >= rect.left && clientX <= rect.right
                && clientY >= rect.top && clientY <= rect.bottom
            ) {
                return candidate;
            }
        }

        return null;
    }

    clientPointToLngLat(mapRef, clientX, clientY) {
        const rect = mapRef.getCanvas().getBoundingClientRect();
        return mapRef.unproject([clientX - rect.left, clientY - rect.top]);
    }

    projectToViewport(mapRef, lngLat) {
        if (!mapRef?.project || !mapRef?.getCanvas) return null;

        const point = mapRef.project([lngLat.lng, lngLat.lat]);
        const rect = mapRef.getCanvas().getBoundingClientRect();
        return {
            x: rect.left + point.x,
            y: rect.top + point.y,
        };
    }

    resizeCanvas() {
        if (!this.trackCanvas || !this.trackCtx) return;

        const rect = this.trackCanvas.getBoundingClientRect();
        const displayWidth = Math.max(1, Math.floor(rect.width));
        const displayHeight = Math.max(1, Math.floor(rect.height));
        const dpr = window.devicePixelRatio || 1;

        this.trackCanvas.width = Math.floor(displayWidth * dpr);
        this.trackCanvas.height = Math.floor(displayHeight * dpr);
        this.trackCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    redrawOverlay() {
        if (!this.trackCtx || !this.trackCanvas) return;

        const rect = this.trackCanvas.getBoundingClientRect();
        this.trackCtx.clearRect(0, 0, rect.width, rect.height);

        if (!this.track?.ring || this.track.ring.length < 3) {
            return;
        }

        const maps = [this.mapInstance?.map, this.mapInstance?.dualMap].filter(Boolean);
        for (const mapRef of maps) {
            const projected = this.track.ring
                .map((coord) => this.projectToViewport(mapRef, { lng: Number(coord[0]), lat: Number(coord[1]) }))
                .filter(Boolean);

            if (projected.length < 3) continue;

            this.trackCtx.beginPath();
            this.trackCtx.moveTo(projected[0].x, projected[0].y);
            for (let i = 1; i < projected.length; i += 1) {
                this.trackCtx.lineTo(projected[i].x, projected[i].y);
            }
            this.trackCtx.closePath();

            this.trackCtx.fillStyle = 'rgba(255, 122, 24, 0.26)';
            this.trackCtx.fill();

            this.trackCtx.strokeStyle = 'rgba(0, 0, 0, 0.86)';
            this.trackCtx.lineWidth = 4;
            this.trackCtx.stroke();

            this.trackCtx.strokeStyle = 'rgba(255, 200, 120, 1)';
            this.trackCtx.lineWidth = 2;
            this.trackCtx.stroke();
        }
    }

    lockMaps() {
        const disableInteractions = (mapRef) => {
            if (!mapRef) return;
            this.lockedMaps.push(mapRef);
            mapRef.dragPan?.disable?.();
            mapRef.scrollZoom?.disable?.();
            mapRef.boxZoom?.disable?.();
            mapRef.doubleClickZoom?.disable?.();
            mapRef.touchZoomRotate?.disable?.();
            mapRef.dragRotate?.disable?.();
            mapRef.keyboard?.disable?.();
            const canvas = mapRef.getCanvas?.();
            if (canvas) canvas.style.cursor = 'crosshair';
        };

        disableInteractions(this.mapInstance?.map);
        disableInteractions(this.mapInstance?.dualMap);
    }

    unlockMaps() {
        for (const mapRef of this.lockedMaps) {
            mapRef.dragPan?.enable?.();
            mapRef.scrollZoom?.enable?.();
            mapRef.boxZoom?.enable?.();
            mapRef.doubleClickZoom?.enable?.();
            mapRef.touchZoomRotate?.enable?.();
            mapRef.dragRotate?.enable?.();
            mapRef.keyboard?.enable?.();
            const canvas = mapRef.getCanvas?.();
            if (canvas) canvas.style.cursor = '';
        }

        this.lockedMaps = [];
    }

    getEmptyFeatureCollection() {
        return {
            type: 'FeatureCollection',
            features: [],
        };
    }

    ensureTrackLayers(mapRef, suffix) {
        if (!mapRef?.isStyleLoaded?.()) return;

        const sourceId = `storm-track-source-${suffix}`;
        const fillLayerId = `storm-track-fill-${suffix}`;
        const outlineLayerId = `storm-track-outline-${suffix}`;

        if (!mapRef.getSource(sourceId)) {
            mapRef.addSource(sourceId, {
                type: 'geojson',
                data: this.getEmptyFeatureCollection(),
            });
        }

        if (!mapRef.getLayer(fillLayerId)) {
            mapRef.addLayer({
                id: fillLayerId,
                type: 'fill',
                source: sourceId,
                paint: {
                    'fill-color': '#ff7a18',
                    'fill-opacity': 0.25,
                },
            });
        }

        if (!mapRef.getLayer(outlineLayerId)) {
            mapRef.addLayer({
                id: outlineLayerId,
                type: 'line',
                source: sourceId,
                paint: {
                    'line-color': '#ffb347',
                    'line-opacity': 0.95,
                    'line-width': 2,
                },
            });
        }

        // Keep the storm track above all other layers while the tool is active.
        mapRef.moveLayer(fillLayerId);
        mapRef.moveLayer(outlineLayerId);
    }

    removeTrackLayers(mapRef, suffix) {
        if (!mapRef) return;

        const sourceId = `storm-track-source-${suffix}`;
        const fillLayerId = `storm-track-fill-${suffix}`;
        const outlineLayerId = `storm-track-outline-${suffix}`;

        if (mapRef.getLayer(outlineLayerId)) {
            mapRef.removeLayer(outlineLayerId);
        }

        if (mapRef.getLayer(fillLayerId)) {
            mapRef.removeLayer(fillLayerId);
        }

        if (mapRef.getSource(sourceId)) {
            mapRef.removeSource(sourceId);
        }
    }

    setTrackGeojson(mapRef, suffix, geojson) {
        if (!mapRef?.isStyleLoaded?.()) return;
        this.ensureTrackLayers(mapRef, suffix);
        const sourceId = `storm-track-source-${suffix}`;
        const source = mapRef.getSource(sourceId);
        source?.setData?.(geojson);
    }

    renderTrack() {
        const geojson = this.track
            ? {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        geometry: {
                            type: 'Polygon',
                            coordinates: [this.track.ring],
                        },
                        properties: {
                            kind: 'storm-track',
                        },
                    },
                ],
            }
            : this.getEmptyFeatureCollection();

        this.setTrackGeojson(this.mapInstance?.map, 'main', geojson);
        this.setTrackGeojson(this.mapInstance?.dualMap, 'dual', geojson);
        this.redrawOverlay();
    }

    buildTrack(startLngLat, endLngLat) {
        const start = normalizeLngLat(startLngLat);
        const end = normalizeLngLat(endLngLat);
        if (!start || !end) return null;

        const distanceMiles = haversineMiles(start, end);
        const heading = bearingDegrees(start, end);
        const capRadiusMiles = Math.max(MIN_CAP_RADIUS_MILES, distanceMiles * 0.22);

        const leftEdge = destinationPoint(end, heading - 90, capRadiusMiles);
        const rightEdge = destinationPoint(end, heading + 90, capRadiusMiles);
        if (!leftEdge || !rightEdge) return null;

        const ring = [toPointArray(start), toPointArray(leftEdge)];

        for (let i = 1; i < ARC_SEGMENTS; i += 1) {
            const ratio = i / ARC_SEGMENTS;
            const arcBearing = (heading - 90) + (180 * ratio);
            const arcPoint = destinationPoint(end, arcBearing, capRadiusMiles);
            if (arcPoint) {
                ring.push(toPointArray(arcPoint));
            }
        }

        ring.push(toPointArray(rightEdge));
        ring.push(toPointArray(start));

        return {
            start,
            end,
            heading,
            distanceMiles,
            capRadiusMiles,
            ring,
        };
    }

    onPointerDown(event) {
        if (event.button !== 0 && event.pointerType !== 'touch') return;

        const targetMap = this.getMapAtClientPoint(event.clientX, event.clientY);
        if (!targetMap?.map) return;

        event.preventDefault();
        event.stopPropagation();

        this.activePointerId = event.pointerId;
        this.overlay.setPointerCapture?.(event.pointerId);
        this.isDrawing = true;
        this.drawMapKey = targetMap.key;

        const startLngLat = this.clientPointToLngLat(targetMap.map, event.clientX, event.clientY);
        this.track = this.buildTrack(startLngLat, startLngLat);
        this.renderTrack();

        this.ensureWindow();
        if (this.statusText) {
            this.statusText.textContent = 'Drag to set storm direction and spread.';
        }
    }

    onPointerMove(event) {
        if (!this.isDrawing || this.activePointerId !== event.pointerId) return;

        const mapRef = this.getMapRef(this.drawMapKey);
        if (!mapRef) return;

        event.preventDefault();

        const startLngLat = this.track?.start;
        const endLngLat = this.clientPointToLngLat(mapRef, event.clientX, event.clientY);
        this.track = this.buildTrack(startLngLat, endLngLat);
        this.renderTrack();
    }

    onPointerUp(event) {
        if (!this.isDrawing || this.activePointerId !== event.pointerId) return;

        event.preventDefault();

        this.isDrawing = false;
        this.activePointerId = null;
        this.overlay.releasePointerCapture?.(event.pointerId);

        if (!this.track || this.track.distanceMiles < MIN_TRACK_MILES) {
            this.track = null;
            this.renderTrack();
            this.ensureWindow();
            if (this.statusText) {
                this.statusText.textContent = 'Track is too short. Click and drag farther to draw.';
            }
            this.renderResults();
            return;
        }

        this.ensureWindow();
        this.renderResults();
    }

    ensureWindow() {
        if (this.window) return;

        const html = `
            <div class="storm-track-window">
                <div class="storm-track-controls">
                    <label for="storm-track-speed-input">Storm speed (mph)</label>
                    <input id="storm-track-speed-input" type="number" min="1" step="1" value="${DEFAULT_STORM_SPEED_MPH}" />
                    <button id="storm-track-new-button" type="button">+ New</button>
                </div>
                <p id="storm-track-status" class="storm-track-status">Loading cities database...</p>
                <div id="storm-track-summary" class="storm-track-summary">No storm track yet.</div>
                <div class="storm-track-results-wrapper">
                    <table class="storm-track-results-table">
                        <thead>
                            <tr>
                                <th>City</th>
                                <th>Distance</th>
                                <th>ETA</th>
                                <th>Arrival</th>
                            </tr>
                        </thead>
                        <tbody id="storm-track-results-body"></tbody>
                    </table>
                </div>
            </div>
        `;

        this.window = new Window({
            title: 'Storm Track',
            icon: 'wind',
            width: 560,
            height: 520,
            html,
            onClose: () => {
                this.window = null;
                this.close({ skipWindowDestroy: true });
            },
        });

        this.speedInput = this.window.content.querySelector('#storm-track-speed-input');
        this.newButton = this.window.content.querySelector('#storm-track-new-button');
        this.statusText = this.window.content.querySelector('#storm-track-status');
        this.summaryText = this.window.content.querySelector('#storm-track-summary');
        this.resultsBody = this.window.content.querySelector('#storm-track-results-body');

        this.speedInput?.addEventListener('input', () => this.renderResults());
        this.newButton?.addEventListener('click', () => this.startNew());

        this.renderResults();
    }

    getStormSpeedMph() {
        const speed = Number(this.speedInput?.value);
        return Number.isFinite(speed) && speed > 0 ? speed : DEFAULT_STORM_SPEED_MPH;
    }

    async loadCities() {
        if (Array.isArray(StormTrack._cities)) {
            this.cities = StormTrack._cities;
            return this.cities;
        }

        if (!StormTrack._citiesPromise) {
            const citiesUrl = new URL('../../data/cities_database.geojson', import.meta.url);
            StormTrack._citiesPromise = fetch(citiesUrl)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`Failed to load cities database (${response.status})`);
                    }
                    return response.json();
                })
                .then((geojson) => {
                    const features = Array.isArray(geojson?.features) ? geojson.features : [];
                    const cities = [];

                    for (const feature of features) {
                        const props = feature?.properties || {};
                        const point = feature?.geometry?.type === 'Point'
                            ? feature.geometry.coordinates
                            : null;

                        const lon = Number(props.lon ?? point?.[0]);
                        const lat = Number(props.lat ?? point?.[1]);
                        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                            continue;
                        }

                        const name = String(props.name || '').trim();
                        const state = String(props.state || '').trim().toUpperCase();
                        if (!name) {
                            continue;
                        }

                        cities.push({
                            name,
                            state,
                            lat,
                            lon,
                        });
                    }

                    StormTrack._cities = cities;
                    return cities;
                });
        }

        this.cities = await StormTrack._citiesPromise;
        return this.cities;
    }

    getCitiesInTrack() {
        if (!this.track || !Array.isArray(this.cities) || this.cities.length === 0) {
            return [];
        }

        const speed = this.getStormSpeedMph();
        const ring = this.track.ring;
        const start = this.track.start;
        const matches = [];

        for (const city of this.cities) {
            if (!pointInRing([city.lon, city.lat], ring)) {
                continue;
            }

            const distanceMiles = haversineMiles(start, { lng: city.lon, lat: city.lat });
            const etaHours = distanceMiles / speed;

            matches.push({
                ...city,
                distanceMiles,
                etaHours,
            });
        }

        matches.sort((a, b) => a.etaHours - b.etaHours);
        return matches;
    }

    renderResults() {
        if (!this.summaryText || !this.resultsBody || !this.statusText) return;

        if (!this.track) {
            this.summaryText.textContent = 'No storm track drawn. Click and drag on the map.';
            this.resultsBody.innerHTML = '';
            if (Array.isArray(this.cities) && this.cities.length > 0) {
                this.statusText.textContent = 'Click and drag on the map to draw a storm track.';
            }
            return;
        }

        if (!Array.isArray(this.cities) || this.cities.length === 0) {
            this.summaryText.textContent = 'Cities database is unavailable.';
            this.resultsBody.innerHTML = '';
            this.statusText.textContent = 'Unable to load city points from cities_database.geojson.';
            return;
        }

        const speed = this.getStormSpeedMph();
        const matches = this.getCitiesInTrack();
        const trackDistance = this.track.distanceMiles;

        this.summaryText.textContent = `Track length ${trackDistance.toFixed(1)} mi at ${speed.toFixed(0)} mph`;
        this.statusText.textContent = `${matches.length.toLocaleString()} city point${matches.length === 1 ? '' : 's'} inside storm track.`;

        if (matches.length === 0) {
            this.resultsBody.innerHTML = '<tr><td colspan="4" class="storm-track-empty">No city points fall inside this storm track.</td></tr>';
            return;
        }

        const maxRows = 250;
        const rows = matches.slice(0, maxRows).map((city) => {
            const label = `${city.name}, ${city.state}`;
            return `
                <tr>
                    <td>${label}</td>
                    <td>${city.distanceMiles.toFixed(1)} mi</td>
                    <td>${formatHours(city.etaHours)}</td>
                    <td>${formatEtaFromHours(city.etaHours)}</td>
                </tr>
            `;
        });

        this.resultsBody.innerHTML = rows.join('');
    }

    startNew() {
        this.track = null;
        this.renderTrack();
        this.renderResults();
        if (this.statusText) {
            this.statusText.textContent = 'Draw a new storm track by clicking and dragging on the map.';
        }
    }

    close(options = {}) {
        const { skipWindowDestroy = false } = options;

        this.isDrawing = false;
        this.activePointerId = null;

        this.overlay?.removeEventListener('pointerdown', this.pointerDownHandler);
        window.removeEventListener('pointermove', this.pointerMoveHandler);
        window.removeEventListener('pointerup', this.pointerUpHandler);
        window.removeEventListener('pointercancel', this.pointerUpHandler);
        window.removeEventListener('resize', this.resizeHandler);
        document.removeEventListener('keydown', this.keydownHandler);
        this.mapInstance?.map?.off?.('styledata', this.mainStyleDataHandler);
        this.mapInstance?.dualMap?.off?.('styledata', this.dualStyleDataHandler);

        this.unlockMaps();

        this.removeTrackLayers(this.mapInstance?.map, 'main');
        this.removeTrackLayers(this.mapInstance?.dualMap, 'dual');

        if (this.overlay?.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }

        if (this.trackCanvas?.parentNode) {
            this.trackCanvas.parentNode.removeChild(this.trackCanvas);
        }

        if (!skipWindowDestroy && this.window) {
            const activeWindow = this.window;
            this.window = null;
            activeWindow.destroy();
        }

        this.updateButtonState(false);
        StormTrack.instance = null;
    }
}
