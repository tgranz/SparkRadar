/*
Radar Stations Layer
Manages NEXRAD station marker display on the map

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

class RadarStationsLayer {
    constructor(mapInstance) {
        this.map = mapInstance;

        this.markers = { main: [], dual: [] };
        this.fetchInProgress = false;
    }

    _createMarkerElement(icao, isOperational) {
        const marker = document.createElement('div');
        marker.style.backgroundColor = isOperational ? 'var(--primary-color)' : '#ff2121';
        marker.textContent = icao;
        marker.classList.add('radar-station-marker');

        return marker;
    }

    _hideOverlapping(markerArray, mapRef) {
        if (!markerArray || markerArray.length === 0 || !mapRef || !mapRef.getCanvas) return;

        let canvas;
        try {
            canvas = mapRef.getCanvas();
            if (!canvas || !canvas.parentElement) return;
            if (!canvas.getContext) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
        } catch (e) {
            return;
        }

        const markerWidth = 50;
        const markerWidthSq = markerWidth * markerWidth;
        const visibilityMap = new globalThis.Map();
        const markerThreshold = 150;

        if (markerArray.length > markerThreshold) {
            markerArray.forEach(marker => {
                try {
                    const el = marker.getElement();
                    if (el) el.style.display = 'block';
                } catch (e) {
                    // Ignore errors
                }
            });
            return;
        }

        const projections = new globalThis.Map();
        markerArray.forEach((marker, index) => {
            try {
                const el = marker.getElement();
                if (el) el.style.display = 'block';
                if (typeof mapRef.project !== 'function') {
                    visibilityMap.set(index, false);
                    return;
                }
                projections.set(index, mapRef.project(marker.getLngLat()));
                visibilityMap.set(index, true);
            } catch (e) {
                visibilityMap.set(index, false);
            }
        });

        for (let i = 0; i < markerArray.length; i++) {
            if (!visibilityMap.get(i)) continue;
            const point1 = projections.get(i);
            if (!point1) continue;

            for (let j = i + 1; j < markerArray.length; j++) {
                if (!visibilityMap.get(j)) continue;
                const point2 = projections.get(j);
                if (!point2) continue;

                const dx = point1.x - point2.x;
                const dy = point1.y - point2.y;
                if (dx * dx + dy * dy < markerWidthSq) {
                    visibilityMap.set(j, false);
                }
            }
        }

        markerArray.forEach((marker, index) => {
            try {
                const el = marker.getElement();
                if (el) el.style.display = visibilityMap.get(index) ? 'block' : 'none';
            } catch (e) {
                // Ignore errors on invalid markers
            }
        });
    }

    _checkLatency(isoTimestamp) {
        if (!isoTimestamp) return false;
        const timestamp = Date.parse(isoTimestamp);
        if (isNaN(timestamp)) return false;

        const now = Date.now();
        const latencyMinutes = (now - timestamp) / 60000;
        return latencyMinutes < 15; // Consider good if data is less than 15 minutes old
    }

    update() {
        const mapInstance = this.map;
        const mainMap = mapInstance.map;
        const callbacks = mapInstance.callbacks;

        if (!mainMap || this.fetchInProgress) {
            return;
        }

        this.fetchInProgress = true;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        fetch(encodeURI('https://cachefetch.sparkradar.app/cache?maxAge=300&url=https://api.weather.gov/radar/stations'), { signal: controller.signal })
            .then(response => {
                clearTimeout(timeoutId);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                if (!data?.features || !Array.isArray(data.features)) {
                    throw new Error('Radar stations response missing features array');
                }

                // Clear existing markers
                this.markers.main.forEach(m => m.remove());
                this.markers.main.length = 0;

                if (mapInstance.hasSplitMap()) {
                    this.markers.dual.forEach(m => m.remove());
                    this.markers.dual.length = 0;
                }

                const features = data.features;
                window.radarStationFeatures = features;

                const isSplit = mapInstance.hasSplitMap();
                const dualMap = mapInstance.dualMap;

                // Filter to WSR-88D CONUS stations only
                const filteredFeatures = [];
                for (let i = 0; i < features.length; i++) {
                    const station = features[i];
                    const properties = station.properties;

                    // KXXX PXXX and RXXX stations work, TXXX HXXX AXXX RODN ROCO2 do not
                    if (!/^[KPR]?[A-Z]{3}$/.test(properties?.id)) {
                        continue;
                    }

                    const isOperational = station.properties?.rda?.properties?.status === 'Operate';
                    const isUp = isOperational ? this._checkLatency(station?.properties?.latency?.levelTwoLastReceivedTime) : false;

                    filteredFeatures.push({
                        type: 'Feature',
                        geometry: station.geometry,
                        properties: {
                            ...properties,
                            isOperational: isUp ? 1 : 0
                        }
                    });
                }

                // Add markers to main map
                filteredFeatures.forEach((feature) => {
                    const isOperational = feature.properties.isOperational === 1;
                    const icao = feature.properties.id;
                    const coords = feature.geometry.coordinates;
                    const el = this._createMarkerElement(icao, isOperational);
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (typeof callbacks.onSelectStation === 'function') {
                            callbacks.onSelectStation(icao);
                        }
                    });
                    const marker = new maplibregl.Marker({ element: el, overlap: false })
                        .setLngLat(coords)
                        .addTo(mainMap);
                    this.markers.main.push(marker);
                });

                // Add markers to dual map if split is active
                if (isSplit && dualMap) {
                    try {
                        if (dualMap.getCanvas()) {
                            filteredFeatures.forEach((feature) => {
                                const isOperational = feature.properties.isOperational === 1;
                                const icao = feature.properties.id;
                                const coords = feature.geometry.coordinates;
                                const el = this._createMarkerElement(icao, isOperational);
                                el.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    if (typeof callbacks.onSelectStationSplit === 'function') {
                                        callbacks.onSelectStationSplit(icao);
                                    }
                                });
                                const marker = new maplibregl.Marker({ element: el })
                                    .setLngLat(coords)
                                    .addTo(dualMap);
                                this.markers.dual.push(marker);
                            });
                        }
                    } catch (e) {
                        console.warn('[RadarStationsLayer] Could not add markers to split map:', e);
                    }
                }

                this._hideOverlapping(this.markers.main, mainMap);

                if (isSplit && dualMap) {
                    try {
                        if (dualMap.getCanvas()) {
                            this._hideOverlapping(this.markers.dual, dualMap);
                        }
                    } catch (e) {
                        // dualMap invalid, skip
                    }
                }
            })
            .catch(error => {
                clearTimeout(timeoutId);
                if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
                    console.warn('[RadarStationsLayer] Radar stations fetch timed out; keeping existing markers.');
                    return;
                }
                console.error('[RadarStationsLayer] Error fetching radar stations:', error);
            })
            .finally(() => {
                this.fetchInProgress = false;
            });
    }

    /**
     * Called when split view is being torn down.
     * Cleans up dual map handlers/timers/markers and restores the main map move handler.
     */
    onSplitStopped(dualMapRef) {
        const mainMap = this.map.map;

        // Remove dual move handler
        if (this.handlers?.dual) {
            if (dualMapRef) {
                try { dualMapRef.off('move', this.handlers.dual); } catch (e) {}
            }
            this.handlers.dual = null;
        }

        // Clear debounce timers
        clearTimeout(this.timers?.main);
        clearTimeout(this.timers?.dual);
        if (this.timers) {
            this.timers.main = null;
            this.timers.dual = null;
        }

        // Remove dual markers
        this.markers.dual.forEach(marker => marker.remove());
        this.markers.dual = [];

        // Restore main map move handler (now without dual context)
        if (this.handlers?.main) {
            mainMap.off('move', this.handlers.main);

            this.handlers.main = () => {
                this._hideOverlapping(this.markers.main, mainMap);
            };

            mainMap.on('move', this.handlers.main);
        }
        this._hideOverlapping(this.markers.main, mainMap);
    }
}

export default RadarStationsLayer;
