// Location handlers
let locationMarker = null;
let watchId = null;
let isLocationOn = false;
let nowlat = null;
let nowlon = null;

function startUpdatingLocation() {
    isLocationOn = document.getElementById("geolocate").classList.contains('toolbtn-active');
    if (navigator.geolocation) {
        if (watchId === null) {
            watchId = navigator.geolocation.watchPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    nowlat = lat;
                    nowlon = lon;

                    // Create GeoJSON for the marker
                    const geojson = {
                        type: 'FeatureCollection',
                        features: [{
                            type: 'Feature',
                            geometry: {
                                type: 'Point',
                                coordinates: [lon, lat]
                            }
                        }]
                    };

                    // Add or update the marker source/layer
                    if (map.getSource('location-marker')) {
                        map.getSource('location-marker').setData(geojson);
                    } else {
                        map.addSource('location-marker', {
                            type: 'geojson',
                            data: geojson
                        });
                        map.addLayer({
                            id: 'location-marker',
                            type: 'circle',
                            source: 'location-marker',
                            paint: {
                                'circle-radius': 10,
                                'circle-color': '#2a7fff',
                                'circle-stroke-width': 2,
                                'circle-stroke-color': '#fff'
                            }
                        });
                    }

                    if (isLocationOn) {
                        map.flyTo({center: [lon, lat], zoom: 10});
                    }
                },
                (error) => {
                    if (!map.getSource('location-marker')) {
                        switch(error.code) {
                            case error.PERMISSION_DENIED:
                                console.warn("User denied the request for Geolocation.");
                                break;
                            case error.POSITION_UNAVAILABLE:
                                sendNotification("Unable to geolocate", "Your position is unavailable. Either your device does not support GPS, GPS is off, or GPS signal is too weak.", "location-cancel", "#ffcc00");
                                console.warn("Location information is unavailable.");
                                break;
                            case error.TIMEOUT:
                                sendNotification("Unable to geolocate", "Took too long to receive a location, perhaps GPS is too weak.", "location-cancel", "#ffcc00");
                                console.warn("The request to get user location timed out.");
                                break;
                            case error.UNKNOWN_ERROR:
                                sendNotification("Unable to geolocate", "An error occurred while trying to find your location.", "location-cancel", "#ffcc00");
                                console.warn("An unknown error occurred while trying to fetch user's location.");
                                break;
                        }
                        document.getElementById("geolocate").classList.remove('toolbtn-active');
                        clearCurrentLocationMarker();
                        isLocationOn = false;
                    }
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 0,
                    timeout: 10000
                }
            );
        }
    } else {
        alert("Your browser doesn't support location. Try a different browser to use this feature.");
        document.getElementById("geolocate").classList.remove('toolbtn-active');
        isLocationOn = false;
    }
}

function clearCurrentLocationMarker() {
    if (map.getLayer('location-marker')) map.removeLayer('location-marker');
    if (map.getSource('location-marker')) map.removeSource('location-marker');
    locationMarker = null;
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
}

function toggleLocation() {
    isLocationOn = document.getElementById("geolocate").classList.contains('toolbtn-active');

    if (!isLocationOn) {
        startUpdatingLocation();
        document.getElementById("geolocate").classList.add('toolbtn-active');
    } else {
        clearCurrentLocationMarker();
        document.getElementById("geolocate").classList.remove('toolbtn-active');
    }
}


// Refresh handlers
// The 3-second cooldown prevents spamming requests
let refreshCooldown = false;
function refresh() {
    if (refreshCooldown) return;
    
    if (livealertsEnabled) setTimeout(() => loadSparkAlerts(), 1000); // Temporary impleementation
    loadAlerts();
    loadRadar();
    console.log('Data refresh called.');

    refreshCooldown = true;
    setTimeout(() => { refreshCooldown = false; }, 3000);
}

// Refresh every 10 seconds
map.on('load', () => { refresh(); setInterval(refresh, 10000); });

// Event listener for refresh button
document.getElementById("refreshBtn").addEventListener('click', () => {
    refresh();
});


// Measure
const measureBtn = document.getElementById('measureBtn');
var measuring = false;
var measureCircle = null;
var measureCenter = null;
var measureRadius = null;

function milesFromMeters(meters) {
    return (meters / 1609.344).toFixed(2);
}

const onClick = (e) => {
    if (!measureCenter) {
        measureCenter = [e.lngLat.lng, e.lngLat.lat];

        // Add marker dot at start location
        map.addSource('measure-dot', {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: measureCenter
                }
            }
        });
        map.addLayer({
            id: 'measure-dot',
            type: 'circle',
            source: 'measure-dot',
            paint: {
                'circle-radius': 7,
                'circle-color': '#2a7fff',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#fff'
            }
        });
    } else {
        // Second click: finish measuring
        measuring = false;
        map.getCanvas().style.cursor = '';
        map.off('mousemove', onMove);
        map.off('click', onClick);

        // Show radius label
        const label = document.createElement('div');
        label.className = 'measure-label';
        label.style.position = 'absolute';
        label.style.left = `${map.project(e.lngLat).x + 10}px`;
        label.style.top = `${map.project(e.lngLat).y}px`;
        label.style.background = 'rgba(0,0,0,0.7)';
        label.style.color = '#fff';
        label.style.padding = '4px 8px';
        label.style.borderRadius = '6px';
        label.style.pointerEvents = 'none';
        label.innerText = `${milesFromMeters(measureRadius)} mi`;
        label.id = 'measure-radius-label';
        document.body.appendChild(label);
    }
};

const onMove = (e) => {
    if (!measureCenter) return;
    const from = turf.point(measureCenter);
    const to = turf.point([e.lngLat.lng, e.lngLat.lat]);
    measureRadius = turf.distance(from, to, { units: 'miles' }) * 1609.344; // meters

    measureCircle = turf.circle(measureCenter, milesFromMeters(measureRadius), {
        steps: 128,
        units: 'miles'
    });

    // Draw circle
    if (map.getSource('measure-circle')) {
        map.getSource('measure-circle').setData(measureCircle);
    } else {
        map.addSource('measure-circle', {
            type: 'geojson',
            data: measureCircle
        });
        map.addLayer({
            id: 'measure-circle-fill',
            type: 'fill',
            source: 'measure-circle',
            paint: {
                'fill-color': '#2a7fff',
                'fill-opacity': 0.2
            }
        });
        map.addLayer({
            id: 'measure-circle',
            type: 'line',
            source: 'measure-circle',
            paint: {
                'line-color': '#2a7fff',
                'line-width': 3
            }
        });
    }

    // Draw dotted line from dot to cursor
    const lineGeo = {
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates: [measureCenter, [e.lngLat.lng, e.lngLat.lat]]
        }
    };
    if (map.getSource('measure-line')) {
        map.getSource('measure-line').setData(lineGeo);
    } else {
        map.addSource('measure-line', {
            type: 'geojson',
            data: lineGeo
        });
        map.addLayer({
            id: 'measure-line',
            type: 'line',
            source: 'measure-line',
            paint: {
                'line-color': '#000',
                'line-width': 2,
                'line-dasharray': [2, 2]
            }
        });
    }
};

measureBtn.addEventListener('click', () => {
    if (measureBtn.classList.contains('toolbtn-active')) {
        measureBtn.classList.remove("toolbtn-active");
        measuring = false;
        map.getCanvas().style.cursor = '';
        map.off('mousemove', onMove);
        map.off('click', onClick);
        if (map.getLayer('measure-circle')) map.removeLayer('measure-circle');
        if (map.getLayer('measure-circle-fill')) map.removeLayer('measure-circle-fill');
        if (map.getSource('measure-circle')) map.removeSource('measure-circle');
        if (map.getLayer('measure-dot')) map.removeLayer('measure-dot');
        if (map.getSource('measure-dot')) map.removeSource('measure-dot');
        if (map.getLayer('measure-line')) map.removeLayer('measure-line');
        if (map.getSource('measure-line')) map.removeSource('measure-line');
        const lbl = document.getElementById('measure-radius-label');
        if (lbl) lbl.remove();
        measureCenter = null;
        measureRadius = null;
        measureCircle = null;
        measureBtn.classList.remove('toolbtn-active');
        return;
    }

    measureBtn.classList.add('toolbtn-active');

    if (!measuring) {
        measuring = true;
        map.getCanvas().style.cursor = 'crosshair';

        map.on('mousemove', onMove);
        map.on('click', onClick);
    }
});