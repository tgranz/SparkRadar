
// Adds the radar layer to the map
var prevLatestframe = null;
var radarMode = "mos";
var radarStation = "CONUS";
var radarProduct = "SR_BREF";
var stationTitle = '';
var radaranimator = null;
var firstopen = true;
var frameidx = 0;
var prevRadarProduct = null;
var prevStation = null;
var latestFrameTime = "";
var _tileLoadSeq = 0; // sequence for tile loads to ignore stale completions
// Double-buffer for raster animation to avoid blanking when frames load
var _bufferIndex = 0; // 0 or 1
var _bufferSources = ['datalayer_a_src', 'datalayer_b_src'];
var _bufferLayers = ['datalayer_a', 'datalayer_b'];
var _activeBuffer = -1; // index of currently visible buffer
// Track loading state to avoid duplicate loads for same buffer
var _bufferLoading = [false, false];
// Sequence counter to identify the most recent radar load request
var _radarLoadSeq = 0;

// Loads the radar stations
function loadRadarStations(onlyremove=false) {
    if (onlyremove) {
        if (map.getSource('radar-stations')) {
            try{ if (map.getLayer('radar-stations')) map.removeLayer('radar-stations'); } catch {}
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
                try { if (map.getLayer('radar-stations')) map.removeLayer('radar-stations'); } catch {}
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

                map.flyTo({ center: coords });

                radarMode = "station";
                radarProduct = "SR_BREF";
                // Refresh the product list
                openProductChooser(false)
                // Load radar for clicked station
                setTimeout(() => {
                    document.getElementById("animationSlider").value = document.getElementById("animationSlider").max;
                }, 1000);
                loadRadar(props.id.slice(-4), false, true);
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


var firstUse = true;

function loadRadar(station = radarStation, isAnim = false, force = false) {
    const requestSeq = ++_radarLoadSeq;
    station = station.toUpperCase();

    // === NEW: If station actually changed, reset double buffer state ===
    if (station != radarStation) {
        // Clean both buffers completely
        _bufferSources.forEach((srcId, i) => {
            const lyrId = _bufferLayers[i];
            if (map.getLayer(lyrId)) map.removeLayer(lyrId);
            if (map.getSource(srcId)) map.removeSource(srcId);
        });
        _activeBuffer = -1;
        _bufferIndex = 0;
    }

    // Now update the global station variable
    radarStation = station;

    getRadarFrameTimes(station)
        .then(stationFrames => {
            // If another request started after this one, abort work
            if (requestSeq !== _radarLoadSeq) {
                return;
            }

            document.title = "Spark Radar | " + station;

            if (station === "CANMOS") {
                stationTitle = "CANADIAN MOSAIC";
                radarMode = "canmos";
            } else if (radarMode === "mos") {
                stationTitle = "CONUS MOSAIC";
            } else {
                stationTitle = station;
            }

            document.getElementById("radarTitle").innerHTML = `${stationTitle} · ${latestFrameTime}`;


            if (!stationFrames || stationFrames.length === 0) {
                console.error("No radar frames available for station:", station);
                document.getElementById("liveIndicator").style.background = "#ff2121";
                return;
            }

            var times, latestframe;
            if (station === "CANMOS") {
                const layerData = stationFrames.find(l => l.name === "RADAR_1KM_RRAI") || stationFrames[2];
                times = layerData?.times || [];
            } else {
                times = stationFrames[0]?.times || [];
            }

            if (times.length === 0) {
                console.error("No valid timestamps for station:", station);
                return;
            }

            // Set slider bounds
            const maxIdx = times.length - 1;
            const minIdx = Math.max(0, maxIdx - 12);
            document.getElementById("animationSlider").max = maxIdx;
            document.getElementById("animationSlider").min = minIdx;

            if (firstUse) {
                document.getElementById("animationSlider").value = maxIdx;
                firstUse = false;
            }

            frameidx = parseInt(document.getElementById("animationSlider").value);

            if (firstopen && document.getElementById("animationSlider").value == maxIdx) firstopen = false;

            latestframe = times[frameidx];

            console.debug("Times:", times)

            if (!force && station === prevStation && radarProduct === prevRadarProduct && latestframe === prevLatestframe) {
                console.log("Radar time unchanged, skipping update.");
                return;
            }

            console.log("Updating radar to frame:", latestframe);
            prevLatestframe = latestframe;
            prevRadarProduct = radarProduct;
            prevStation = station;

            // Build WMS URL
            var tilesUrl;
            if (station.toLowerCase() == "canmos") {
                tilesUrl = `https://geo.weather.gc.ca/geomet?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX={bbox-epsg-3857}&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&LAYERS=RADAR_1KM_RRAI&FORMAT=image/png&TIME=${latestframe}`;
            } else if (station.toLowerCase() == "conus") {
                tilesUrl = `https://opengeo.ncep.noaa.gov/geoserver/${station.toLowerCase()}/${station.toLowerCase()}_bref_qcd/ows?service=WMS&request=GetMap&layers=${station.toLowerCase()}_bref_qcd&format=image/png&transparent=true&version=1.4.1&time=${latestframe}&width=256&height=256&srs=EPSG:3857&bbox={bbox-epsg-3857}`;
            } else {
                var layerstr = `${station.toLowerCase()}_${radarProduct.toLowerCase()}`;
                tilesUrl = `https://opengeo.ncep.noaa.gov/geoserver/${station.toLowerCase()}/ows?service=WMS&request=GetMap&format=image/png&transparent=true&layers=${layerstr}&transparent=true&version=1.4.1&time=${latestframe}&width=256&height=256&srs=EPSG:3857&bbox={bbox-epsg-3857}`;
            }

            document.getElementById("animationtime").innerText = new Date(latestframe).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });

            // Double buffering
            const newBuffer = _bufferIndex;
            const newSourceId = _bufferSources[newBuffer];
            const newLayerId = _bufferLayers[newBuffer];
            // Track tile load order so stale completions can be ignored
            const tileSeq = ++_tileLoadSeq;

            // Clean up any existing layer/source with same ID
            try { if (map.getLayer(newLayerId)) map.removeLayer(newLayerId); } catch {}
            try { if (map.getSource(newSourceId)) map.removeSource(newSourceId); } catch {}

            // Add new source and layer
            map.addSource(newSourceId, {
                type: "raster",
                tiles: [tilesUrl],
                tileSize: radaranimator ? 1024 : 256 // higher res when paused
            });

            map.addLayer({
                id: newLayerId,
                type: "raster",
                source: newSourceId,
                paint: { "raster-opacity": 0 }
            }, 'Pier');

            // Wait for new tiles to load before fading in
            const onSourceData = (e) => {
                if (e.sourceId !== newSourceId || !e.isSourceLoaded) return;
                // If this handler is stale (older request or tiles), clean up its own resources and exit
                if (requestSeq !== _radarLoadSeq || tileSeq !== _tileLoadSeq) {
                    map.off('sourcedata', onSourceData);
                    safeRemoveLayerAndSource(newLayerId, newSourceId).catch(() => {});
                    return;
                }

                map.off('sourcedata', onSourceData);

                // Fade in the new frame (guard in case the layer was removed concurrently)
                try {
                    if (map.getLayer(newLayerId)) {
                        map.setPaintProperty(newLayerId, 'raster-opacity', 1);
                    }
                } catch (err) {
                    console.debug('Could not set paint property for new layer (it may have been removed):', newLayerId);
                }

                latestFrameTime = new Date(latestframe).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
                document.getElementById("radarTitle").innerHTML = `${stationTitle} · ${latestFrameTime}`;
                
                switch (radarProduct) {
                    case "SR_BREF":
                        document.getElementById("radarProductTitle").innerHTML = "Base Reflectivity";
                        break;
                    case "SR_BVEL":
                        document.getElementById("radarProductTitle").innerHTML = "Base Velocity";
                        break;
                    case "BOHA":
                        document.getElementById("radarProductTitle").innerHTML = "1-hr Accumulated Precipitation";
                        break;
                    case "BDSA":
                        document.getElementById("radarProductTitle").innerHTML = "Storm Total Accumulation";
                        break;
                    case "BDHC":
                        document.getElementById("radarProductTitle").innerHTML = "Precipitation Classification";
                        break;
                    default:
                        document.getElementById("radarProductTitle").innerHTML = radarProduct;
                }

                // Check if live indicator should be shown
                // Should be live if viewing latest frame
                const maxSliderIdx = parseInt(document.getElementById("animationSlider").max);
                if (frameidx >= maxSliderIdx) {
                    document.getElementById("liveIndicator").style.background = "#00af00";
                } else {
                    document.getElementById("liveIndicator").style.background = "#ffcc00";
                }

                // === SAFELY CLEAN UP OLD BUFFER ONLY IF IT EXISTS ===
                if (_activeBuffer !== -1) {
                    const oldLayerId = _bufferLayers[_activeBuffer];
                    const oldSourceId = _bufferSources[_activeBuffer];

                    // Only try to fade out if the layer still exists; protect against races
                    try {
                        if (map.getLayer(oldLayerId)) {
                            try {
                                map.setPaintProperty(oldLayerId, 'raster-opacity', 0);
                            } catch (err) {
                                console.debug('Failed to set paint property on old layer (likely removed):', oldLayerId);
                            }
                        }
                    } catch (err) {
                        console.debug('Error while checking old layer existence:', oldLayerId, err.message);
                    }

                    // Always clean up source + layer safely (even if layer already gone)
                    safeRemoveLayerAndSource(oldLayerId, oldSourceId).catch(err => {
                        console.warn("Cleanup warning (safe to ignore):", err.message);
                    });
                }

                // Activate new buffer
                _activeBuffer = newBuffer;
                _bufferIndex = 1 - _bufferIndex;
            };

            map.on('sourcedata', onSourceData);

            // Optional timeout fallback in case sourcedata never fires
            setTimeout(() => {
                // Ignore if another request/tile load superseded this one
                if (requestSeq !== _radarLoadSeq || tileSeq !== _tileLoadSeq) {
                    map.off('sourcedata', onSourceData);
                    return;
                }
                // Ensure the layer still exists before querying/setting paint properties
                try {
                    if (map.getLayer(newLayerId) && map.getPaintProperty(newLayerId, 'raster-opacity') === 0) {
                        map.setPaintProperty(newLayerId, 'raster-opacity', 1);
                    }
                } catch (err) {
                    // If the layer was removed meanwhile, ignore the error
                    console.debug('Radar timeout fallback: layer missing or unavailable', newLayerId);
                }
                map.off('sourcedata', onSourceData);
            }, 8000);

        })
        .catch(error => {
            console.error("Error loading radar:", error);
        });
}

// Animation controls
animationSlider.oninput = function() {
    loadRadar(radarStation);
}

animationplaypause.onclick = function () {
    if (radaranimator) {
        clearInterval(radaranimator);
        radaranimator = null;
        document.getElementById("animationplaypause").innerHTML = `<i class="ti ti-player-play-filled"></i>`;

        // Force reload current frame in high resolution
        setTimeout(() => loadRadar(radarStation, false, true), 100);
    } else {
        document.getElementById("animationplaypause").innerHTML = `<i class="ti ti-player-pause-filled"></i>`;
        radaranimator = setInterval(() => {
            let val = parseInt(animationSlider.value);
            if (val >= parseInt(animationSlider.max)) {
                animationSlider.value = animationSlider.min;
            } else {
                animationSlider.value = val + 1;
            }
            loadRadar(radarStation);
        }, 800); // Slightly faster/smoother than 1000ms
    }
};