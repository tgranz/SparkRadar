// Popups
let popupLngLat = null;

// Occasionally, map.on('click') throws an error on page load, which makes no sense
try {
    map.on('click', (e) => {
        // If we are trying to measure something, do not open a popup
        if (measureBtn.classList.contains('toolbtn-active')) { return }


        popupLngLat = e.lngLat;
        const popup = document.getElementById('customPopup');
        const point = map.project(popupLngLat);

        // Close existing popup, if one is open
        if (!popup.classList.contains('hidden')) {
            popup.classList.add('hidden');
            return;
        }

        // Retrieve the clicked point
        const clickedPoint = turf.point([e.lngLat.lng, e.lngLat.lat]);
        const foundIds = [];

        // Loop through all polygon sources
        Object.keys(map.style.sourceCaches).forEach(sourceId => {
            const source = map.getSource(sourceId);
            if (!source || source.type !== 'geojson') return;

            const features = map.querySourceFeatures(sourceId, {
            sourceLayer: undefined,
            filter: ['==', '$type', 'Polygon']
            });

            features.forEach(feature => {
            if (turf.booleanPointInPolygon(clickedPoint, feature)) {
                foundIds.push(feature.id || feature.properties.id || sourceId);
            }
            });
        });

        let content;
        let alertsUnderClick = [];

        // Prepare content for the popup
        if (foundIds.length) {
            // Get alert details for each found ID
            alerts.forEach(alert => {
                if (foundIds.includes('alert_' + alert.id)) {

                    let detectables = [];
                    try { detectables.push('<strong>Tornado: ' + alert.properties.parameters.tornadoDetection[0] + '</strong>'); } catch {}
                    try { detectables.push('<strong>Hail: ' + alert.properties.parameters.maxHailSize[0] + 'in, ' + alert.properties.parameters.hailThreat[0] + '</strong>'); } catch {
                        // Fallback
                        try { detectables.push('<strong>Hail: ' + alert.properties.parameters.maxHailSize[0] + 'in. </strong>'); } catch {}
                    }
                    try { detectables.push('<strong>Wind: ' + alert.alert.properties.parameters.maxWindGust[0]) + ', ' + alert.properties.parameters.windThreat[0] + '</strong>';  } catch {
                        // Fallback
                        try { detectables.push('<strong>Wind: ' + alert.properties.parameters.maxWindGust[0] + '</strong>'); } catch {}
                    }
                    try { detectables.push('<strong>Flooding: ' + alert.properties.flashFloodDamage[0] + ', ' + alert.properties.parameters.flashFloodDetection[0] + '</strong>'); } catch {}

                    alertsUnderClick.push(`
                        <div class="alertpopupitem" onclick="viewAlertDetails('${alert.id}');">
                            <div style="margin-bottom: 5px; width: calc(100% - 10px); text-align: center; border-radius: 20px; padding: 5px; background-color: ${findAlertColor(alert.properties.event)}; color: ${readableTextColor(findAlertColor(alert.properties.event))};">
                                <strong style="font-size: medium; text-shadow: 1px 1px 3px ${readableTextColor(findAlertColor(alert.properties.event), true)};">${alert.properties.event}</strong>
                            </div>
                            <div style="display: flex; flex-direction: row; justify-content: space-between;">
                                <div style="display: flex; flex-direction: column;">
                                    <p style="font-size: small;">
                                        Expires in: <strong>${isoTimeUntil(alert.properties.expires)}</strong>
                                        ${detectables.length ? '<br>' + detectables.join('<br>') : ''}
                                    </p>
                                </div>
                                <div style="display: flex; flex-direction: column;">
                                    <!--<button onclick="viewAlertDetails('${alert.id}');" class="alertbutton"><i style="font-size: 24px;" class="ti ti-message"></i></button>
                                --></div>
                            </div>
                        </div>
                    `)
                }
            })
            content = `
                <div style="height: 100%; overflow-y: auto; scrollbar-width: none; display: flex; flex-direction: column;">
                    ${alertsUnderClick.reverse().join('<br style="height: 5px;">')}
                </div>
                `;
        } else {
            content = null;
        }

        // Show popup
        if (!content) return;

        popup.style.left = `${point.x}px`;
        popup.style.top = `${point.y}px`;
        popup.classList.remove('hidden');

        document.querySelector('.popup-body').innerHTML = content;
    });
} catch {}

// Keep popup geolocked on every frame, but skip if map was just clicked
let skipNextRender = false;

map.on('click', () => {
    skipNextRender = true;
});

map.on('render', () => {
    if (skipNextRender) {
        skipNextRender = false;
        return;
    }
    if (!popupLngLat) return;

    const popup = document.getElementById('customPopup');
    const point = map.project(popupLngLat);

    popup.style.left = `${point.x}px`;
    popup.style.top = `${point.y}px`;
});
