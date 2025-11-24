var alertIds = [];
var alerts = [];

// Function to determine alert color based on event type
function findAlertColor(eventType) {
    var color = "#FFFFFF";
    if (eventType == "Severe Thunderstorm Warning") { color = "#f1a500ff"; }
    else if (eventType == "Tornado Warning") { color = "#e90000ff"; }
    else if (eventType == "Flash Flood Warning") { color = "#00ff00ff"; }
    else if (eventType == "Special Weather Statement") { color = "#eeff00ff"; }
    else if (eventType == "Flood Warning") { color = "#1E90FF"; }
    else if (eventType == "Marine Weather Statement") { color = "#690083ff"; }
    else if (eventType == "Special Marine Warning") { color = "#8b3300ff"; }
    else if (eventType == "Air Quality Alert") { color = "#768b00ff"; }
    else if (eventType == "Flood Advisory") { color = "#00538bff"; }
    else if (eventType == "Dust Advisory") { color = "#706e00ff"; }
    else if (eventType == "Dust Storm Warning") { color = "#776b00ff"; }
    else if (eventType == "Tropical Storm Watch") { color = "#3f0072ff"; }
    else if (eventType == "Flood Watch") { color = "#ffffffff"; }

    return color;
}

// Fetches and displays active weather alerts from the NWS API
function loadAlerts() {
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
                "Flash Flood Warning": 6,
                "Marine Weather Statement": 7,
                "Special Weather Statement": 8,
                "Severe Thunderstorm Warning": 9,
                "Tornado Warning": 10
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
                // Remove layers
                [
                    `alert_${oldId}`,
                    `alert_${oldId}_outline`,
                    `alert_${oldId}_outlineborder`
                ].forEach(layerId => {
                    if (map.getLayer(layerId)) map.removeLayer(layerId);
                });
                // Remove source
                if (map.getSource(`alert_${oldId}`)) map.removeSource(`alert_${oldId}`);
            }
        });

        // Prepare to add new alerts
        const newAlerts = [];
        const newIds = [];

        data.features.forEach(alert => {
            // Ensure the alert has geometry
            if (alert.geometry == null) { return; }

            // Only add if not already present
            if (alertIds.includes(alert.id)) { return; }

            // Store the alert ID and data
            newIds.push(alert.id);
            newAlerts.push(alert);

            // Find the color for each alert
            color = findAlertColor(alert.properties.event);

            // Add the alert polygon and outlines to the map
            // Swap lon/lat pairs at any nesting level (handles Polygon / MultiPolygon / rings)
            function swapCoords(coord) {
                if (!Array.isArray(coord)) return coord;
                if (typeof coord[0] === 'number' && typeof coord[1] === 'number') {
                    return [coord[1], coord[0]].concat(coord.slice(2));
                }
                return coord.map(swapCoords);
            }

            var coordinates = swapCoords(alert.geometry.coordinates);

            map.addSource(`alert_${alert.id}`, {
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
                    'line-color': color,
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

        });

        // Update global arrays
        alertIds = alertIds.filter(id => newAlertIds.includes(id)).concat(newIds);
        alerts = alerts.filter(a => newAlertIds.includes(a.id)).concat(newAlerts);

        data.features.forEach(alert => {
            // DEBUGGING
            console.debug(alert)

            // Ensure the alert has geometry
            // If it doesn't, its a large alert such as a watch, these are handled elsewhere
            if (alert.geometry == null) { return; }

            // Verify there are no duplicate alerts
            if (alertIds.includes(alert.id)) { return; }

            // Store the alert ID and data
            alertIds.push(alert.id);
            alerts.push(alert);

            // Find the color for each alert
            color = findAlertColor(alert.properties.event);

            // Add the alert polygon and outlines to the map
            var coordinates = alert.geometry.coordinates;

            map.addSource(`alert_${alert.id}`, {
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
                    'line-color': color,
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

        });
    });
}


function loadSparkAlerts() {
  var testSparkAlertFetch = {};
    fetch('https://api.sparkradar.app/alerts?t=' + Date.now())
    .then(response => {
        if (!response.ok) { 
          sendNotification("Spark Alerts API Error", "Failed to fetch LiveAlerts data. Status code: " + response.status, "alert-circle-rounded", "#ff2121");
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

            // Find the color for each alert
            color = findAlertColor(alert.matchedName);

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
