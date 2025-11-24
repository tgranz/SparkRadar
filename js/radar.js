// Loads the radar stations
function loadRadarStations(onlyremove=false) {
    if (onlyremove) {
        if (map.getSource('radar-stations')) {
            if (map.getLayer('radar-stations')) map.removeLayer('radar-stations');
            map.removeSource('radar-stations');
        }
        return;
    }

    fetch('https://api.weather.gov/radar/stations')
        .then(response => {
            if (!response.ok) { throw new Error('NWS Radar Stations API request failed with code ' + response.status); }
            return response.json();
        })
        .then(data => {
            if (!data || !data.features) return;

            // Remove previous radar station layers/sources if they exist
            if (map.getSource('radar-stations')) {
                if (map.getLayer('radar-stations')) map.removeLayer('radar-stations');
                map.removeSource('radar-stations');
            }

            // Prepare GeoJSON for stations
            const stationsGeoJSON = {
                type: 'FeatureCollection',
                features: data.features.map(station => {
                    const coords = station.geometry?.coordinates;
                    const status = station.properties.rda?.properties.status;
                    var opcolor, unopcolor, type;
                    try { type = station.properties.stationType } catch {};

                    if (type === "TDWR") { return {}; } // Temporary; until I implement later

                    if (type === "TDWR") {
                        opcolor = "#00af00";
                        unopcolor = "#af1616ff";
                    } else {
                        opcolor = "#27beff";
                        unopcolor = "#ff2121";
                    }

                    return {
                        type: 'Feature',
                        geometry: {
                            type: 'Point',
                            coordinates: coords
                        },
                        properties: {
                            id: station.id,
                            status: status,
                            color: status === "Operate" ? opcolor : unopcolor,
                        }
                    };
                }).filter(f => f.geometry && f.geometry.coordinates)
            };

            // Add source and layer for stations
            map.addSource('radar-stations', {
                type: 'geojson',
                data: stationsGeoJSON
            });

            map.addLayer({
                id: 'radar-stations',
                type: 'circle',
                source: 'radar-stations',
                paint: {
                    'circle-radius': 8,
                    'circle-color': ['get', 'color'],
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#111'
                }
            });

            // Optional: Add click handler to show station info
            map.on('click', 'radar-stations', (e) => {
                const feature = e.features[0];
                const props = feature.properties;
                const coords = feature.geometry.coordinates;

                // Project the station coordinates to screen position
                const point = map.project(coords);

                // Get the popup element
                const popup = document.getElementById('customPopup');

                // Set popup position
                popup.style.left = `${point.x}px`;
                popup.style.top = `${point.y}px`;
                popup.classList.remove('hidden');

                // Fill popup content with station info
                document.querySelector('.popup-body').innerHTML = `
                    <div>
                        <strong>Radar Station:</strong> ${props.id}<br>
                        <strong>Status:</strong> ${props.status}<br>
                        <strong>Location:</strong> ${coords[1].toFixed(3)}, ${coords[0].toFixed(3)}
                    </div>
                `;
            });
        })
        .catch(error => {
            console.error('Error fetching radar stations:', error);
        });
}


// Fetch available radar frame times from the WMS GetCapabilities endpoint
function getRadarFrameTimes(radarStation) {
    let url = null;

    if (radarStation.toLowerCase() === "canmos") {
        url = `https://geo.weather.gc.ca/geomet/?lang=en&service=WMS&version=1.3.0&layers=RADAR_1KM_RRAI&request=GetCapabilities&cache_bust=${Date.now()}`;
    } else {
        url = `https://opengeo.ncep.noaa.gov/geoserver/${radarStation.toLowerCase()}/ows?service=wms&version=1.3.0&request=GetCapabilities&cache_bust=${Date.now()}`;
    }

    return fetch(url)
        .then(response => {
            if (!response.ok) throw new Error('Network error: ' + response.statusText);
            return response.text();
        })
        .then(text => {
            const xmlDoc = new DOMParser().parseFromString(text, "text/xml");
            const capabilityLayer = xmlDoc.querySelector("WMS_Capabilities > Capability > Layer");
            if (!capabilityLayer) return [];

            const now = new Date(); // Current UTC time for filtering
            return Array.from(capabilityLayer.querySelectorAll("Layer")).map(layer => {
                let timesRaw = layer.querySelector("Dimension")?.textContent || "";
                let times = [];
                const layerName = layer.querySelector("Name")?.textContent || null;

                console.debug(`Raw time dimension for ${layerName}:`, timesRaw); // Debug raw time data

                if (radarStation.toLowerCase() === "canmos" && timesRaw.includes("/")) {
                    if (layerName === "RADAR_1KM_RRAI") {
                        // Expand interval string into timestamps
                        const [start, end, step] = timesRaw.split("/");
                        if (start && end && step) {
                            let stepMs = 0;
                            const match = step.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                            if (match) {
                                const hours = parseInt(match[1] || "0", 10);
                                const minutes = parseInt(match[2] || "0", 10);
                                const seconds = parseInt(match[3] || "0", 10);
                                stepMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
                            }
                            let current = new Date(start);
                            const endDate = new Date(end);
                            // Only include timestamps <= current time
                            while (current <= endDate && current <= now) {
                                // Format timestamp to match server (no milliseconds)
                                const formattedTime = current.toISOString().replace(/\.\d{3}Z$/, "Z");
                                times.push(formattedTime);
                                current = new Date(current.getTime() + stepMs);
                            }
                            console.debug(`Parsed timestamps for ${layerName}:`, times); // Debug parsed times
                        }
                    } else {
                        times = []; // Empty for non-RADAR_1KM_RRAI layers
                    }
                } else {
                    // For layers with comma-separated timestamps, remove milliseconds
                    times = timesRaw
                        .split(",")
                        .filter(t => t && new Date(t) <= now)
                        .map(t => t.trim().replace(/\.\d{3}Z$/, "Z")); // Normalize format
                    console.debug(`Parsed timestamps for ${layerName}:`, times); // Debug parsed times
                }

                // Sort times from oldest to latest
                times.sort((a, b) => new Date(a) - new Date(b));

                return {
                    name: layerName,
                    description: layer.querySelector("Abstract")?.textContent || null,
                    times
                };
            });
        })
        .catch(error => {
            console.error('getRadarFrameTimes:', error);
            return [];
        });
}


// Adds the radar layer to the map
var prevLatestframe = null;
var radarMode = "mos";
var radarStation = "CONUS";
var radaranimator = null;
var firstopen = true;
// Double-buffer for raster animation to avoid blanking when frames load
var _bufferIndex = 0; // 0 or 1
var _bufferSources = ['datalayer_a_src', 'datalayer_b_src'];
var _bufferLayers  = ['datalayer_a', 'datalayer_b'];
var _activeBuffer = -1; // index of currently visible buffer
// Track loading state to avoid duplicate loads for same buffer
var _bufferLoading = [false, false];

function safeRemoveLayerAndSource(layerId, sourceId) {
    return new Promise((resolve) => {
        const layerExists = !!map.getLayer(layerId);
        const sourceExists = !!map.getSource(sourceId);
        if (!layerExists && !sourceExists) return resolve();
        if (layerExists) map.removeLayer(layerId);
        const tryRemoveSource = () => {
            if (!map.getSource(sourceId)) return resolve();

            const stillUsed = map
                .getStyle()
                .layers.some((l) => l.source === sourceId);

            if (stillUsed) {
                map.once('styledata', tryRemoveSource);
            } else {
                map.removeSource(sourceId);
                resolve();
            }
        };

        tryRemoveSource();
        map.once('styledata', tryRemoveSource);
    });
}



function loadRadar(station = radarStation, isAnim = false, force = false) {

    var frameidx = parseInt(animationSlider.value);

    station = station.toUpperCase();
    radarStation = station;

    getRadarFrameTimes(station)
        .then(stationFrames => {
            document.title = "Spark Radar | " + station;

            if (station === "CANMOS") {
                document.getElementById("radarTitle").innerText = "CANADIAN MOSAIC";
                radarMode = "canmos";
            } else if (radarMode === "mos"){
                document.getElementById("radarTitle").innerText = "CONUS MOSAIC";
            } else {
                document.getElementById("radarTitle").innerText = station;
            }

            if (!stationFrames || stationFrames.length === 0) {
                console.error("No radar frames available for station:", station);
                return;
            }

            const now = new Date();

            let latestframe;
            let times;
            if (station === "CANMOS") {
                if (stationFrames[2]?.times?.length > 0) {
                    document.getElementById("animationSlider").max = stationFrames[2]?.times?.length - 1 || 1;
                    document.getElementById("animationSlider").min = document.getElementById("animationSlider").max - 12;
                    times = stationFrames[2].times;
                    latestframe = times[frameidx];
                } else {
                    console.error("No times available for CANMOS RADAR_1KM_RRAI layer");
                    return;
                }
            } else {
                if (stationFrames[0]?.times?.length > 0) {
                    times = stationFrames[0].times;
                    document.getElementById("animationSlider").max = stationFrames[0]?.times?.length - 1 || 1;
                    document.getElementById("animationSlider").min = document.getElementById("animationSlider").max - 12;
                    if (times.length === 0) {
                        console.error("No valid timestamps for station:", station);
                        return;
                    }
                    latestframe = times[frameidx];
                } else {
                    console.error("No times available for station:", station);
                    return;
                }
            }

            if (firstopen) {
                document.getElementById("animationSlider").value = document.getElementById("animationSlider").max;
                firstopen = false;
                loadRadar();
                return;
            }

            if (!force) {
                if (latestframe === prevLatestframe) {
                    console.log("Radar time unchanged, skipping update.");
                    return;
                }
            }

            console.log("Updating radar to latest frame:", latestframe);
            prevLatestframe = latestframe;

            // Prepare tiles URL(s) for the new frame
            let tilesUrl = null;
            if (station === "CANMOS") {
                tilesUrl = `https://geo.weather.gc.ca/geomet?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX={bbox-epsg-3857}&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&LAYERS=RADAR_1KM_RRAI&FORMAT=image/png&TIME=${latestframe}`;
            } else {
                tilesUrl = `https://opengeo.ncep.noaa.gov/geoserver/${station.toLowerCase()}/${station.toLowerCase()}_bref_qcd/ows?service=WMS&request=GetMap&layers=${station.toLowerCase()}_bref_qcd&format=image/png&transparent=true&version=1.4.1&time=${latestframe}&width=256&height=256&srs=EPSG:3857&bbox={bbox-epsg-3857}`;
            }

            document.getElementById("animationtime").innerText = new Date(latestframe).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });

            // Double buffer: load into the inactive buffer first so existing frame stays visible
            const newBuffer = _bufferIndex;
            const newSourceId = _bufferSources[newBuffer];
            const newLayerId = _bufferLayers[newBuffer];

            // Clean up if an old source/layer with the same id exists (leftover)
            if (map.getLayer(newLayerId)) map.removeLayer(newLayerId);
            if (map.getSource(newSourceId)) map.removeSource(newSourceId);

            // Add source for the new frame (opacity 0 initially)
            map.addSource(newSourceId, {
                type: "raster",
                tiles: [tilesUrl],
                tileSize: radaranimator ? 1024 : 256
            });

            map.addLayer({
                id: newLayerId,
                type: "raster",
                source: newSourceId,
                paint: {
                    "raster-opacity": 0,
                }
            }, 'Pier');

            // Wait until the new source is loaded (tiles requested and parsed) before swapping
            const onSourceData = (e) => {
                if (e.sourceId !== newSourceId) return;
                // isSourceLoaded indicates the source's tileset is ready
                if (!e.isSourceLoaded) return;

                // Swap opacities: fade in new layer, hide old layer
                try {
                    // Show new layer
                    map.setPaintProperty(newLayerId, 'raster-opacity', 1);

                    // Hide previous active layer (if any)
                    if (_activeBuffer !== -1) {
                        const oldLayerId = _bufferLayers[_activeBuffer];
                        // Keep old layer visible a moment longer then remove
                        map.setPaintProperty(oldLayerId, 'raster-opacity', 0);
                        // Remove old layer and source after short delay to ensure DOM updated
                        setTimeout(() => {
                            try {
                                const oldSourceId = _bufferSources[_activeBuffer];
                                if (map.getLayer(oldLayerId)) map.removeLayer(oldLayerId);
                                if (map.getSource(oldSourceId)) map.removeSource(oldSourceId);
                            } catch (err) { console.warn('Failed cleanup old buffer', err); }
                        }, 300);
                    }

                    // Mark this buffer as active and toggle buffer index for next load
                    _activeBuffer = newBuffer;
                    _bufferIndex = 1 - _bufferIndex;
                } finally {
                    // Unbind the listener for this source load
                    map.off('sourcedata', onSourceData);
                }
            };

            map.on('sourcedata', onSourceData);
        })
        .catch(error => {
            console.error("Error loading radar:", error);
        });
}

// Animation controls
animationSlider.oninput = function() {
    loadRadar(radarStation);
}

animationplaypause.onclick = function() {
    if (radaranimator) {
        document.getElementById("animationplaypause").innerHTML = `<i class="ti ti-player-play-filled"></i>`;
        clearInterval(radaranimator);
        radaranimator = null;
        setTimeout( () => loadRadar(radarStation, null, true) , 200); // Load at the end to revert to higher quality tiles
    } else {
        document.getElementById("animationplaypause").innerHTML = `<i class="ti ti-player-pause-filled"></i>`;
        radaranimator = setInterval(() => {
            let currentValue = parseInt(animationSlider.value);
            if (currentValue < parseInt(animationSlider.max)) {
                animationSlider.value = currentValue + 1;
                loadRadar(radarStation);
            } else {
                animationSlider.value = animationSlider.min;
                loadRadar(radarStation);
            }
        }, 1000);
    }
}