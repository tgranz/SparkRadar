var alertIds = [];
var alerts = [];
// Track flashing interval IDs so we can clear them when alerts are removed
var alertIntervals = {};

// Load the FIPS county geometry data at the start of the script
var fipsCountyGeometry = null;

const defaultAlerts = {
    "Air Quality Alert":
        { enabled: true, color: "#768b00", border: "#768b00", flash: null },
    "Avalanche Warning":
        { enabled: true, color: "#ff00ff", border: "#ff00ff", flash: null },
    "Dust Advisory":
        { enabled: true, color: "#706e00", border: "#706e00", flash: null },
    "Dust Storm Warning":
        { enabled: true, color: "#776b00", border: "#776b00", flash: null },
    "Flash Flood Emergency":
        { enabled: true, color: "#00ff00", border: "#00ff00", flash: "#00b600" },
    "Flash Flood Warning":
        { enabled: true, color: "#00ff00", border: "#00ff00", flash: null },
    "Flood Advisory":
        { enabled: true, color: "#00538b", border: "#00538b", flash: null },
    "Flood Warning":
        { enabled: true, color: "#1E90FF", border: "#1E90FF", flash: null },
    "Flood Watch":
        { enabled: true, color: "#60fd82", border: "#60fd82", flash: null },
    "Marine Weather Statement":
        { enabled: true, color: "#690083", border: "#690083", flash: null },
    "PDS Tornado Warning":
        { enabled: true, color: "#e900dd", border: "#e900dd", flash: "#e90000" },
    "Severe Thunderstorm Warning":
        { enabled: true, color: "#f1a500", border: "#f1a500", flash: null },
    "Snow Squall Warning":
        { enabled: true, color: "#0096aa", border: "#0096aa", flash: null },
    "Special Marine Warning":
        { enabled: true, color: "#8b3300", border: "#8b3300", flash: null },
    "Special Weather Statement":
        { enabled: true, color: "#eeff00", border: "#eeff00", flash: null },
    "Tornado Emergency":
        { enabled: true, color: "#9f00e9", border: "#9f00e9", flash: "#e900dd" },
    "Tornado Warning":
        { enabled: true, color: "#e90000", border: "#e90000", flash: null },
    "Tropical Storm Watch":
        { enabled: true, color: "#3f0072", border: "#3f0072", flash: null },
};

fetch('https://raw.githubusercontent.com/tgranz/SparkRadar/main/data/fips_county_geometry.json')
    .then(response => {
        if (!response.ok) throw new Error('Failed to fetch FIPS GeoJSON: ' + response.status);
        return response.json();
    })
    .then(json => {
        fipsCountyGeometry = json;
        console.log('FIPS GeoJSON loaded.');
    })
    .catch(err => {
        console.error('Error loading FIPS GeoJSON:', err);
    });


// Function to validate if an alert is enabled in settings
function validateAlert(alert) {
    var alertsdb = localStorage.getItem('sparkradar_alerts');

    if (alertsdb) {
        alertsdb = JSON.parse(alertsdb);
    } else {
        return true; // All alerts enabled by default
    }

    if (alertsdb[alert]) {
        return alertsdb[alert].enabled;
    } else {
        return true;
    }
}

// Function to get specific alert property
function findAlertProperty(eventType, property) {
    var alerts = localStorage.getItem('sparkradar_alerts');

    if (alerts) {
        alerts = JSON.parse(alerts);
    } else {
        alerts = defaultAlerts
    }

    var propValue = null; // Default for unknown alerts
    if (alerts[eventType]) {
        propValue = alerts[eventType][property];
    }

    return propValue;
}

// Function to determine alert color based on event type
function findAlertColor(eventType) {
    var alerts = localStorage.getItem('sparkradar_alerts');

    if (alerts) {
        alerts = JSON.parse(alerts);
    } else {
        alerts = defaultAlerts
    }

    var color = "#ffffff"; // Default for unknown alerts
    if (alerts[eventType]) {
        color = alerts[eventType].color;
    }

    return color;
}


// Fetches and displays active weather alerts from the NWS API
function loadAlerts(force = false) {
    fetch('https://api.weather.gov/alerts/active', {headers: {'Accept': 'Application/geo+json'} })
    .then(response => {
        if (!response.ok) { throw new Error('NWS Alerts API request failed with code ' + response.status); }
        return response.json();
    }) .then(data => {
        console.log('NWS alert data fetched successfully.');

        // Sort alerts by priority
        data.features.sort((a, b) => {
            const priority = {
                "Dust Advisory": 0,
                "Dust Storm Warning": 1,
                "Air Quality Alert": 2,
                "Flood Advisory": 3,
                "Flood Warning": 4,
                "Tropical Storm Watch": 5,
                "Snow Squall Warning": 6,
                "Flash Flood Warning": 7,
                "Marine Weather Statement": 8,
                "Special Weather Statement": 9,
                "Severe Thunderstorm Warning": 10,
                "Tornado Warning": 11
            };
            const aPriority = priority[a.properties.event] ?? 99;
            const bPriority = priority[b.properties.event] ?? 99;
            return aPriority - bPriority;
        });


        // Get new alert IDs from API
        const newAlertIds = data.features.filter(f => f.geometry != null).map(f => f.id);

        // Remove expired alerts (layers and sources)
        alertIds.forEach(oldId => {
            if (!newAlertIds.includes(oldId)) {
                // Clear any flashing interval for this alert
                const layerKey = `alert_${oldId}`;
                if (alertIntervals[layerKey]) {
                    clearInterval(alertIntervals[layerKey]);
                    delete alertIntervals[layerKey];
                }

                // Remove layers
                [
                    layerKey,
                    `alert_${oldId}_outline`,
                    `alert_${oldId}_outlineborder`
                ].forEach(layerId => {
                    if (map.getLayer(layerId)) map.removeLayer(layerId);
                });
                // Remove source
                if (map.getSource(layerKey)) map.removeSource(layerKey);
            }
        });

        // If force reload, remove all existing alerts regardless
        if (force) {
            alertIds.forEach(oldId => {
                // Clear any flashing interval for this alert
                const layerKey = `alert_${oldId}`;
                if (alertIntervals[layerKey]) {
                    clearInterval(alertIntervals[layerKey]);
                    delete alertIntervals[layerKey];
                }

                // Remove layers
                [
                    layerKey,
                    `alert_${oldId}_outline`,
                    `alert_${oldId}_outlineborder`
                ].forEach(layerId => {
                    if (map.getLayer(layerId)) map.removeLayer(layerId);
                });

                // Remove source
                if (map.getSource(layerKey)) map.removeSource(layerKey);
            });
            alertIds = [];
            alerts = [];
        }

        // Prepare to add new alerts
        var newAlerts = [];
        var newIds = [];

        for (var alert of data.features) {
            // Only add if not already present
            if (alertIds.includes(alert.id)) { continue; }

            // Only add if alert is enabled
            if (!validateAlert(alert.properties.event)) { continue; }
            
            // Store the alert ID and data
            newIds.push(alert.id);
            newAlerts.push(alert);

            // Find the color for each alert (use local variables to avoid leaking into global scope)
            let color = findAlertColor(alert.properties.event);
            let borderColor = findAlertProperty(alert.properties.event, 'border');
            let flashColor = findAlertProperty(alert.properties.event, 'flash');

            // If the alert has no geometry, follow FIPS codes:
            if (alert.geometry == null) {
                // THIS CODE DOES NOT WORK, SEE https://github.com/tgranz/SparkRadar/issues/4
                continue;

                /*
                // Add the alert polygon and outlines to the map
                // Swap lon/lat pairs at any nesting level (handles Polygon / MultiPolygon / rings)
                function swapCoords(coord) {
                    if (!Array.isArray(coord)) return coord;
                    if (typeof coord[0] === 'number' && typeof coord[1] === 'number') {
                        return [coord[1], coord[0]].concat(coord.slice(2));
                    }
                    return coord.map(swapCoords);
                }

                var fipsCoords = null;

                for (var i of alert.properties.geocode.SAME) {
                    var fips = i.substring(1); // Removes leading character to convert SAME to FIPS

                    var thisFips = fipsCountyGeometry[fips];
                    if (thisFips) {
                        console.log('Found FIPS geometry for code:', fips);
                        console.debug(thisFips);
                        fipsCoords = thisFips.geometry;
                        break;
                    } else {
                        console.warn('FIPS code not found in GeoJSON:', fips);
                        continue;
                    }
                };

                if (!fipsCoords) {
                    // Nothing to draw for this alert
                    console.warn('No FIPS coordinates found for alert', alert.id);
                    continue;
                }

                var coordinates = fipsCoords;
                console.log(coordinates);

                // Often, there are more than one polygon in the FIPS geometry
                // Need to draw each one separately
                // No need to swap coords, already in correct order
                for (var c = 0; c < coordinates.length; c++) {

                    var alertid = alert.id + '_part' + c;
                    var coordsPart = coordinates[c];
                    console.log("Original coords", coordinates)
                    console.log('Coords part:', coordsPart);
                    coordinates = [coordsPart];

                    map.addSource(`alert_${alertid}`, {
                        'type': 'geojson',
                        'data': {
                            'type': 'Feature',
                            'geometry': {
                                'type': 'Polygon',
                                'coordinates': coordinates
                            }
                        }
                    });

                    map.addLayer({
                        'id': `alert_${alertid}`,
                        'type': 'fill',
                        'source': `alert_${alertid}`,
                        'layout': {},
                        'paint': {
                            'fill-color': color,
                            'fill-opacity': 0.5
                        }
                    }, 'Ferry line');

                    map.addLayer({
                        id: `alert_${alertid}_outline`,
                        type: 'line',
                        source: `alert_${alertid}`,
                        paint: {
                            'line-color': color,
                            'line-width': 2
                        }
                    }, 'Pier road');

                    map.addLayer({
                        id: `alert_${alertid}_outlineborder`,
                        type: 'line',
                        source: `alert_${alertid}`,
                        paint: {
                            'line-color': '#000',
                            'line-width': 6
                        }
                    }, `alert_${alertid}_outline`);

                    console.log('Added alert with FIPS geometry:', alertid);
                }
                    */

            } else {

                // Add the alert polygon and outlines to the map
                // Swap lon/lat pairs at any nesting level (handles Polygon / MultiPolygon / rings)
                function swapCoords(coord) {
                    if (!Array.isArray(coord)) return coord;
                    if (typeof coord[0] === 'number' && typeof coord[1] === 'number') {
                        return [coord[1], coord[0]].concat(coord.slice(2));
                    }
                    return coord.map(swapCoords);
                }

                var coordinates = alert.geometry.coordinates;

                map.addSource(`alert_${alert.id}`, {
                    'type': 'geojson',
                    'data': {
                        'type': 'Feature',
                        'id': `alert_${alert.id}`,
                        'geometry': {
                            'type': 'Polygon',
                            'coordinates': coordinates
                        }
                    }
                });

                map.addLayer({
                    'id': `alert_${alert.id}`,
                    'type': 'fill',
                    'source': `alert_${alert.id}`,
                    'layout': {},
                    'paint': {
                        'fill-color': color,
                        'fill-opacity': 0.5
                    }
                }, 'Ferry line');

                map.addLayer({
                    id: `alert_${alert.id}_outline`,
                    type: 'line',
                    source: `alert_${alert.id}`,
                    paint: {
                        'line-color': borderColor,
                        'line-width': 2
                    }
                }, 'Pier road');

                map.addLayer({
                    id: `alert_${alert.id}_outlineborder`,
                    type: 'line',
                    source: `alert_${alert.id}`,
                    paint: {
                        'line-color': '#000',
                        'line-width': 6
                    }
                }, `alert_${alert.id}_outline`);

                // If flashing is enabled, set up a flashing effect
                if (flashColor !== null && flashColor !== undefined && flashColor !== '#000000') {
                    let isFlashing = true;
                    const layerId = `alert_${alert.id}`;
                    const flashCol = flashColor;
                    const baseCol = color;

                    // Check if the layer exists before setting the paint property
                    if (map.getLayer(layerId)) {
                        // If an interval already exists for this layer, clear it first
                        if (alertIntervals[layerId]) {
                            clearInterval(alertIntervals[layerId]);
                            delete alertIntervals[layerId];
                        }
                        const intervalId = setInterval(() => {
                            // Use the captured colors so changes to globals don't affect ongoing intervals
                            try {
                                map.setPaintProperty(layerId, 'fill-color', isFlashing ? flashCol : baseCol);
                            } catch (e) {
                                console.warn(`Failed to set paint property for ${layerId}:`, e.message);
                            }
                            isFlashing = !isFlashing;
                        }, 1000);
                        alertIntervals[layerId] = intervalId;
                    } else {
                        console.warn(`Layer ${layerId} does not exist.`);
                    }
                }

            }

        };

        // Update global arrays
        alertIds = alertIds.filter(id => newAlertIds.includes(id)).concat(newIds);
        alerts = alerts.filter(a => newAlertIds.includes(a.id)).concat(newAlerts);

        data.features.forEach(alert => {
            // DEBUGGING
            console.debug(alert)

            // Check that the alert is enabled
            if (!validateAlert(alert.properties.event)) { return; }

            // Ensure the alert has coordinates
            if (alert.geometry == null) { return; }

            // Verify there are no duplicate alerts
            if (alertIds.includes(alert.id)) { return; }

            // Store the alert ID and data
            alertIds.push(alert.id);
            alerts.push(alert);

            // Find the color for each alert (use local variables to avoid leaking into global scope)
            let color = findAlertColor(alert.properties.event);
            let borderColor = findAlertProperty(alert.properties.event, 'border');
            let flashColor = findAlertProperty(alert.properties.event, 'flash');

            // Add the alert polygon and outlines to the map
            var coordinates = alert.geometry.coordinates;

            map.addSource(`alert_${alert.id}`, {
                'type': 'geojson',
                'data': {
                    'type': 'Feature',
                    'id': `alert_${alert.id}`,
                    'geometry': {
                        'type': 'Polygon',
                        'coordinates': coordinates
                    }
                }
            });

            map.addLayer({
                'id': `alert_${alert.id}`,
                'type': 'fill',
                'source': `alert_${alert.id}`,
                'layout': {},
                'paint': {
                    'fill-color': color,
                    'fill-opacity': 0.5
                }
            }, 'Ferry line');

            map.addLayer({
                id: `alert_${alert.id}_outline`,
                type: 'line',
                source: `alert_${alert.id}`,
                paint: {
                    'line-color': borderColor,
                    'line-width': 2
                }
            }, 'Pier road');

            map.addLayer({
                id: `alert_${alert.id}_outlineborder`,
                type: 'line',
                source: `alert_${alert.id}`,
                paint: {
                    'line-color': '#000',
                    'line-width': 6
                }
            }, `alert_${alert.id}_outline`);

            // If flashing is enabled, set up a flashing effect
            if (flashColor !== null && flashColor !== undefined && flashColor !== '#000000') {
                let isFlashing = true;
                const layerId = `alert_${alert.id}`;
                const flashCol = flashColor;
                const baseCol = color;

                // Check if the layer exists before setting the paint property
                if (map.getLayer(layerId)) {
                    // If an interval already exists for this layer, clear it first
                    if (alertIntervals[layerId]) {
                        clearInterval(alertIntervals[layerId]);
                        delete alertIntervals[layerId];
                    }
                    const intervalId = setInterval(() => {
                        // Use the captured colors so changes to globals don't affect ongoing intervals
                        try {
                            map.setPaintProperty(layerId, 'fill-color', isFlashing ? flashCol : baseCol);
                        } catch (e) {
                            console.warn(`Failed to set paint property for ${layerId}:`, e.message);
                        }
                        isFlashing = !isFlashing;
                    }, 1000);
                    alertIntervals[layerId] = intervalId;
                } else {
                    console.warn(`Layer ${layerId} does not exist.`);
                }
            }

        });
    });
}


function loadSparkAlerts() {
  var testSparkAlertFetch = {};
    fetch('https://api.sparkradar.app/alerts?t=' + Date.now())
    .then(response => {
        if (!response.ok) { 
          sendNotification("Spark Alerts API Error", "Failed to fetch sparkalerts data. Status code: " + response.status, "alert-circle-rounded", "#ff2121");
          throw new Error('Spark Alerts API request failed with code ' + response.status); 
        }
        return response.json();
    }) .then(data => {
        console.log('Spark alert data fetched successfully.');

        data.alerts.forEach(alert => {
            // Ensure the alert has coordinates
            if (alert.coordinates == null) { return; }

            // Verify there are no duplicate alerts, for safety
            if (alertIds.includes(alert.matchedToken + alert.issueTime)) { return; }

            // Store the alert ID and data
            alertIds.push(alert.matchedToken + alert.issueTime);
            alerts.push(alert);

            // Find the color for each alert (local variable)
            let color = findAlertColor(alert.matchedName);

            // Add the alert polygon and outlines to the map
            // Swap lat/lon to lon/lat for GeoJSON format, then wrap in array for Polygon
          // Swap coordinates and close the ring (repeat first coordinate at end)
          var swappedCoords = alert.coordinates.map(coord => [coord[1], coord[0]]);
          swappedCoords.push(swappedCoords[0]);  // Close the polygon ring
          var coordinates = [swappedCoords];

            map.addSource(`alert_${alert.matchedToken + alert.issueTime}`, {
                'type': 'geojson',
                'data': {
                    'type': 'Feature',
                    'id': `alert_${alert.matchedToken + alert.issueTime}`,
                    'geometry': {
                        'type': 'Polygon',
                        'coordinates': coordinates
                    }
                }
            });

            map.addLayer({
                'id': `alert_${alert.matchedToken + alert.issueTime}`,
                'type': 'fill',
                'source': `alert_${alert.matchedToken + alert.issueTime}`,
                'layout': {},
                'paint': {
                    'fill-color': color,
                    'fill-opacity': 0.5
                }
            }, 'Ferry line');

            map.addLayer({
                id: `alert_${alert.matchedToken + alert.issueTime}_outline`,
                type: 'line',
                source: `alert_${alert.matchedToken + alert.issueTime}`,
                paint: {
                    'line-color': color,
                    'line-width': 2
                }
            }, 'Pier road');

            map.addLayer({
                id: `alert_${alert.matchedToken + alert.issueTime}_outlineborder`,
                type: 'line',
                source: `alert_${alert.matchedToken + alert.issueTime}`,
                paint: {
                    'line-color': '#000',
                    'line-width': 6
                }
            }, `alert_${alert.matchedToken + alert.issueTime}_outline`);

        });
    });
}
