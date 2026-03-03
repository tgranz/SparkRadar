/*
Alert Layer
Manages alert display on the map

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import Dialog from "../ui/dialog.js";
import { buildAlertDefaults } from "../ui/settings.js";
import { waitForRadarLayer, normalizePolygonRing, pointInPolygon } from "./layer_utils.js";

class AlertLayer {
    constructor(mapInstance, alertService) {
        this.map = mapInstance;
        this.alertService = alertService;

        // Alert tracking
        this.alerts = [];
        this.alertCache = { main: new globalThis.Map(), dual: new globalThis.Map() };
        this.alertSyncPending = { main: false, dual: false };
        this.alertPopups = { main: null, dual: null };
        this.alertPopupLocations = { main: null, dual: null };
        this.alertPopupMoveHandlers = { main: null, dual: null };
        this.alertPopupClickHandlers = { main: null, dual: null };
        this.alertFlashIntervals = { main: new globalThis.Map(), dual: new globalThis.Map() };

        // Mobile device detection
        this.isMobileDevice = this.alertService.isMobileDevice;

        // Set up alert click handlers
        this.alertPopupClickHandlers.main = (e) => this._handleAlertClick('main', e);
        if (this.map?.map) {
            this.map.map.on('click', this.alertPopupClickHandlers.main);
        }
    }

    setAlerts(alerts) {
        this.alerts = alerts;
    }

    getAlerts() {
        return this.alerts;
    }

    _convertAlertToGeoJSON(alert) {
        const geometry = this._normalizeAlertGeometry(this._getAlertGeometry(alert));
        if (!geometry) return null;

        const vtec = alert?.vtec || {};
        return {
            type: 'Feature',
            properties: {
                name: this._getAlertName(alert),
                id: alert.id,
                sender: alert.sender || alert.nwsOffice,
                issued: alert.issued,
                expiry: alert.expiry,
                phenomena: alert.properties?.phenomena ?? vtec.phenomena,
                significance: alert.properties?.significance ?? vtec.significance,
                productType: alert.properties?.product_type ?? alert.productCode,
                productCode: alert.productCode
            },
            geometry
        };
    }

    _getAlertGeometry(alert) {
        const geometry = alert?.geometry;
        if (!geometry) return null;

        if (geometry.type && Array.isArray(geometry.coordinates)) {
            return geometry;
        }

        if (Array.isArray(geometry)) {
            if (geometry.length > 0 && Array.isArray(geometry[0]) &&
                geometry[0].length === 2 && typeof geometry[0][0] === 'number') {
                return { type: 'Polygon', coordinates: [geometry] };
            }

            if (geometry.length > 0 && Array.isArray(geometry[0]) && Array.isArray(geometry[0][0])) {
                return { type: 'Polygon', coordinates: geometry };
            }
        }

        return null;
    }

    _normalizeAlertGeometry(geometry) {
        if (!geometry) return null;

        if (geometry.type === 'Polygon') {
            return {
                type: 'Polygon',
                coordinates: geometry.coordinates.map((ring) => normalizePolygonRing(ring))
            };
        }

        if (geometry.type === 'MultiPolygon') {
            return {
                type: 'MultiPolygon',
                coordinates: geometry.coordinates.map((polygon) =>
                    polygon.map((ring) => normalizePolygonRing(ring))
                )
            };
        }

        return geometry;
    }

    _getAlertName(alert) {
        return alert?.name || alert?.productName || alert?.event || 'Unknown Alert';
    }

    _getAlertMessage(alert) {
        return (alert?.message || '').toLowerCase();
    }

    _getAlertColor(alert) {
        // Check for custom colors in settings first
        const alertName = this._getAlertName(alert);
        const alertSettings = this.alertService._getAlertSettings(alertName);
        if (alertSettings.color) {
            return { 
                fill: alertSettings.color, 
                outline: alertSettings.color, 
                name: alertName 
            };
        }

        // Fall back to default colors from ALERT_TYPE_DEFAULTS
        const defaultColor = buildAlertDefaults()[alertName];
        if (defaultColor && defaultColor.color) {
            return { 
                fill: defaultColor.color, 
                outline: defaultColor.color, 
                name: alertName 
            };
        }
        
        // Final fallback for unknown alert types
        return { fill: '#facc15', outline: '#facc15', name: alertName };
    }

    _getAlertKey(alert, index) {
        const rawKey = alert?.id ?? `${index}`;
        return String(rawKey).replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    _getAlertSignature(alert) {
        return JSON.stringify({
            id: alert.id,
            name: this._getAlertName(alert),
            issued: alert.issued,
            expiry: alert.expiry,
            properties: alert.properties,
            geometry: this._getAlertGeometry(alert)
        });
    }

    _getAlertsAtPoint(point) {
        const matches = [];
        for (const alert of this.alerts) {
            const geometry = this._getAlertGeometry(alert);
            if (!geometry) {
                continue;
            }
            if (geometry.type === 'Polygon') {
                if (pointInPolygon(point, geometry.coordinates)) {
                    matches.push(alert);
                }
                continue;
            }

            if (geometry.type === 'MultiPolygon') {
                for (const rings of geometry.coordinates) {
                    if (pointInPolygon(point, rings)) {
                        matches.push(alert);
                        break;
                    }
                }
            }
        }
        return matches;
    }

    _handleAlertClick(target, event) {
        const point = [event.lngLat.lng, event.lngLat.lat];
        console.log(`[AlertLayer] Clicked at point: [${point[0]}, ${point[1]}]`);
        const alertMatches = this._getAlertsAtPoint(point);
        console.log(`[AlertLayer] Found ${alertMatches.length} alerts at click point`);
        return { alertMatches, point };
    }

    _updateAlertPopupPosition(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        const popup = this.alertPopups[target];
        const lngLat = this.alertPopupLocations[target];
        if (!map || !popup || !lngLat) return;

        const point = map.project(lngLat);
        const el = popup.get();
        el.style.left = `${point.x}px`;
        el.style.top = `${point.y}px`;
    }

    buildAlertPopupSection(alerts) {
        if (!alerts || alerts.length === 0) return '';

        const items = alerts.map((alert, index) => {
            const issuedAt = alert.issued || alert.receivedAt;
            const alertIssued = new Date(issuedAt).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit'
            });

            const alertExpiry = (() => {
                const now = new Date();
                const expiryDate = new Date(alert.expiry || alert.expiresAt);
                const diffMs = expiryDate - now;
                const diffMins = Math.floor(diffMs / 60000);
                
                if (diffMins < 0) return 'expired';
                if (diffMins < 60) return `in ${diffMins}m`;
                
                const hours = Math.floor(diffMins / 60);
                const mins = diffMins % 60;
                return mins > 0 ? `in ${hours}h ${mins}m` : `in ${hours}h`;
            })();

            const colors = this._getAlertColor(alert);
            const title = this._getAlertName(alert);
            const issued = issuedAt ? `Issued: ${alertIssued}` : '';
            const expiry = alert.expiry || alert.expiresAt ? `Expires: ${alertExpiry}` : '';

            const alertMessage = this._getAlertMessage(alert);
            const is_pds = alert.properties?.isPds ?? alertMessage.includes('particularly dangerous situation');
            const is_confirmed = alertMessage.includes('tornado...observed');
            const is_destructive = alert.properties?.isDestructive ?? (alertMessage.includes('destructive') || alertMessage.includes('catastrophic'));
            const is_considerable = alert.properties?.isConsiderable ?? alertMessage.includes('considerable');
            const is_tor_possible = alertMessage.includes('tornado...possible');
            const is_waterspout_possible = alertMessage.includes('waterspout...possible');

            const hailMatch = alertMessage.match(/max hail size...(.*?)\n/i);
            const maxHailSize = hailMatch ? hailMatch[1].trim() : null;
            const windMatch = alertMessage.match(/max wind gust\.\.\.(.*?)(\r?\n|$)/i);
            const maxWindGust = windMatch ? windMatch[1].trim() : null;

            const meta = `
            ${expiry}
            ${is_tor_possible ? ' | <b>Tornado Possible</b>' : ''}
            ${is_waterspout_possible ? ' | <b>Waterspout Possible</b>' : ''}
            ${maxWindGust ? `<br>Wind: ${maxWindGust.toUpperCase()}` : ''}
            ${maxHailSize ? ` | Hail: ${maxHailSize.toUpperCase()}` : ''}
            `.trim();

            return `
                <div class="popup-item" data-type="alert" data-index="${index}" style="cursor: pointer;">
                    <span class="popup-dot" style="background: ${colors.fill}"></span>
                    <div>
                        <div class="popup-item-title">${is_pds ? 'PDS ' : ''}${is_confirmed ? 'Confirmed ' : ''}${is_destructive ? 'Destructive ' : ''}${is_considerable ? 'Considerable ' : ''}${title}</div>
                        ${meta ? `<div class=\"popup-meta\">${meta}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="popup-section">
                <div class="popup-title">Warnings (${alerts.length})</div>
                <div class="popup-list">${items}</div>
            </div>
        `;
    }

    showAlertPopup(target, lngLat, alerts, popupElement) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        this._clearAlertPopup(target);
        if (!alerts || alerts.length === 0) return;

        this.alertPopups[target] = popupElement;
        this.alertPopupLocations[target] = lngLat;
        this._updateAlertPopupPosition(target);

        // Prevent clicks on the popup container from reaching the map
        const el = popupElement.get();
        el.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Add click listeners to popup items
        const popupItems = el.querySelectorAll('.popup-item[data-type="alert"]');
        popupItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(item.dataset.index, 10);
                if (alerts[index]) {
                    this._showAlertDialog(alerts[index]);
                }
            });
        });

        if (!this.alertPopupMoveHandlers[target]) {
            const handler = () => this._updateAlertPopupPosition(target);
            this.alertPopupMoveHandlers[target] = handler;
            map.on('move', handler);
            map.on('resize', handler);
        }
    }

    _clearAlertPopup(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        const popup = this.alertPopups[target];
        if (popup) {
            popup.removeFromMap();
        }

        this.alertPopups[target] = null;
        this.alertPopupLocations[target] = null;

        const moveHandler = this.alertPopupMoveHandlers[target];
        if (moveHandler && map) {
            map.off('move', moveHandler);
            map.off('resize', moveHandler);
        }
        this.alertPopupMoveHandlers[target] = null;
    }

    _showAlertDialog(alert) {
        function expandHailSize(size) {
            const sizeMap = {
                '0.25 IN': 'Pea Size',
                '0.50 IN': 'Marble Size',
                '0.75 IN': 'Penny Size',
                '0.88 IN': 'Nickel Size',
                '1.00 IN': 'Quarter Size',
                '1.25 IN': 'Half Dollar Size',
                '1.50 IN': 'Ping Pong Ball Size',
                '1.75 IN': 'Golf Ball Size',
                '2.00 IN': 'Egg Size',
                '2.50 IN': 'Tennis Ball Size',
                '2.75 IN': 'Baseball Size',
                '4.00 IN': 'Softball Size',
                '4.50 IN': 'Grapefruit Size',
                '5.00 IN': 'CD Size'
            };
            return sizeMap[size.toUpperCase()] || size;
        }

        const colors = this._getAlertColor(alert);
        const title = this._getAlertName(alert);
        const alertMessage = this._getAlertMessage(alert);
        const is_pds = alert.properties?.isPds ?? alertMessage.includes('particularly dangerous situation');
        const is_confirmed = alertMessage.includes('tornado...observed');
        const is_destructive = alert.properties?.isDestructive ?? (alertMessage.includes('destructive') || alertMessage.includes('catastrophic'));
        const is_considerable = alert.properties?.isConsiderable ?? alertMessage.includes('considerable');
        const is_tor_possible = alertMessage.includes('tornado...possible');
        const is_waterspout_possible = alertMessage.includes('waterspout...possible');

        const hailMatch = alertMessage.match(/max hail size...(.*?)\n/i);
        const maxHailSize = hailMatch ? hailMatch[1].trim() : null;
        const windMatch = alertMessage.match(/max wind gust\.\.\.(.*?)(\r?\n|$)/i);
        const maxWindGust = windMatch ? windMatch[1].trim() : null;
        
        const formatDate = (dateStr) => {
            if (!dateStr) return 'N/A';
            const date = new Date(dateStr);
            return date.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        };

        const html = `
            <div style="max-width: 600px;">
                <div style="margin-bottom: 20px; padding: 15px; background: ${colors.fill}30; border-left: 4px solid ${colors.fill}; border-radius: 10px;">
                    <h3 style="margin: 0 0 10px 0; text-align: left; color: ${colors.fill};">${is_pds ? 'PDS ' : ''}${is_confirmed ? 'Confirmed ' : ''}${is_destructive ? 'Destructive ' : ''}${is_considerable ? 'Considerable ' : ''}${title}</h3>
                    <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px; font-size: 0.9em;">
                        <strong>Issued:</strong> <span>${formatDate(alert.issued || alert.receivedAt)}</span>
                        <strong>Expires:</strong> <span>${formatDate(alert.expiry || alert.expiresAt)}</span>
                        ${alert.sender || alert.nwsOffice ? `<strong>Sender:</strong> <span>${alert.sender || alert.nwsOffice}</span>` : ''}
                        ${is_tor_possible ? `<strong>Tornado:</strong> <span style="color: #ff2121;">Possible</span>` : ''}
                        ${is_waterspout_possible ? `<strong>Waterspout:</strong> <span style="color: #ff2121;">Possible</span>` : ''}
                        ${maxHailSize ? `<strong>Max Hail:</strong> <span>${maxHailSize.toUpperCase()} (${expandHailSize(maxHailSize)})</span>` : ''}
                        ${maxWindGust ? `<strong>Max Wind:</strong> <span>${maxWindGust.toUpperCase()}</span>` : ''}
                    </div>
                </div>
                ${alert.message ? `
                    <div style="margin-bottom: 15px;">
                        <p style="margin: 0; white-space: pre-wrap; line-height: 1.5; font-family: 'Consolas', mono, monospace; background: black; padding: 10px; border-radius: 10px; border: 1px solid var(--border-color); overflow-wrap: break-word; font-size: 0.9em;">${alert.message.replace('  ', '\n')}</p>
                    </div>
                ` : ''}
            </div>
        `;

        new Dialog(title, 'alert-triangle', html, {}, true);
    }

    _scheduleAlertSync(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) {
            console.warn(`[AlertLayer] _scheduleAlertSync: Map not available for target ${target}`);
            return;
        }

        const isStyleLoaded = map.isStyleLoaded && map.isStyleLoaded();
        console.log(`[AlertLayer] _scheduleAlertSync for ${target}: isStyleLoaded=${isStyleLoaded}, pending=${this.alertSyncPending[target]}`);
        
        if (isStyleLoaded) {
            waitForRadarLayer(map, target).then(() => {
                this._syncAlertsToMap(target);
            });
            return;
        }

        if (this.alertSyncPending[target]) return;
        this.alertSyncPending[target] = true;

        console.log(`[AlertLayer] Waiting for map ${target} to load before syncing alerts`);
        map.once('load', () => {
            this.alertSyncPending[target] = false;
            waitForRadarLayer(map, target).then(() => {
                this._syncAlertsToMap(target);
            });
        });
    }

    _removeAlertFromMap(target, key) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        const layerPrefix = target === 'main' ? `alert-${key}` : `alert-${key}-dual`;
        const sourceId = target === 'main' ? `alert-source-${key}` : `alert-source-${key}-dual`;
        const layerIds = [
            `${layerPrefix}-outline-outline`,
            `${layerPrefix}-outline`,
            `${layerPrefix}-fill`
        ];

        layerIds.forEach(layerId => {
            if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
            }
        });

        if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
        }
    }

    _syncAlertsToMap(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) {
            console.warn(`[AlertLayer] _syncAlertsToMap: Map not available for target ${target}`);
            return;
        }
        if (map.isStyleLoaded && !map.isStyleLoaded()) {
            console.warn(`[AlertLayer] _syncAlertsToMap: Style not loaded for target ${target}`);
            return;
        }

        console.log(`[AlertLayer] _syncAlertsToMap: Syncing ${this.alerts.length} alerts to ${target}`);

        // Use a single GeoJSON source for ALL alerts - much better performance
        const sourceId = target === 'main' ? 'alerts-combined' : 'alerts-combined-dual';
        const beforeLayerId = target === 'main' ? 'radar-webgl' : 'radar-webgl-dual';
        
        // Build a FeatureCollection with all enabled alerts
        const features = [];
        this.alerts.forEach((alert, index) => {
            const alertName = this._getAlertName(alert);
            const alertSettings = this.alertService._getAlertSettings(alertName);
            if (!alertSettings.enabled) {
                return;
            }

            const geojson = this._convertAlertToGeoJSON(alert);
            if (!geojson) {
                return;
            }
            const colors = this._getAlertColor(alert);
            
            // Add color information to properties for data-driven styling
            geojson.properties.fillColor = colors.fill;
            geojson.properties.outlineColor = colors.outline;
            geojson.properties.alertIndex = index;
            
            features.push(geojson);
        });

        console.log(`[AlertLayer] Using combined source approach: ${features.length} enabled alerts in 1 source, 3 layers total`);

        const featureCollection = {
            type: 'FeatureCollection',
            features: features
        };

        // Create or update the source
        if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
                type: 'geojson',
                data: featureCollection
            });
        } else {
            map.getSource(sourceId).setData(featureCollection);
        }

        // Create the three layers if they don't exist
        const fillLayerId = `${sourceId}-fill`;
        const outlineLayerId = `${sourceId}-outline`;
        const outlineOutlineLayerId = `${sourceId}-outline-outline`;

        if (!map.getLayer(outlineOutlineLayerId)) {
            map.addLayer({
                id: outlineOutlineLayerId,
                type: 'line',
                source: sourceId,
                paint: {
                    'line-color': '#000000',
                    'line-width': 6,
                    'line-opacity': 1
                }
            }, 'Pier road');
        }

        if (!map.getLayer(outlineLayerId)) {
            map.addLayer({
                id: outlineLayerId,
                type: 'line',
                source: sourceId,
                paint: {
                    'line-color': ['get', 'outlineColor'],
                    'line-width': 2,
                    'line-opacity': 1
                }
            }, 'Pier road');
        }

        if (!map.getLayer(fillLayerId)) {
            map.addLayer({
                id: fillLayerId,
                type: 'fill',
                source: sourceId,
                paint: {
                    'fill-color': ['get', 'fillColor'],
                    'fill-opacity': 0.4
                }
            }, beforeLayerId);
        }
    }

    displayAlerts() {
        this._scheduleAlertSync('main');
        if (this.map?.isSplit()) {
            this._scheduleAlertSync('dual');
        }
        
        console.log(`[AlertLayer] Displayed ${this.alerts.length} alerts`);
    }

    displayAlertsOnDualMap() {
        // Only called when dual map is already loaded
        if (!this.map?.dualMap) return;
        this._scheduleAlertSync('dual');
    }

    clearAlerts(target = 'main') {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) {
            return;
        }

        // Remove the combined alert layers and source
        const sourceId = target === 'main' ? 'alerts-combined' : 'alerts-combined-dual';
        const fillLayerId = `${sourceId}-fill`;
        const outlineLayerId = `${sourceId}-outline`;
        const outlineOutlineLayerId = `${sourceId}-outline-outline`;

        // Remove layers in reverse order
        if (map.getLayer(fillLayerId)) {
            map.removeLayer(fillLayerId);
        }
        if (map.getLayer(outlineLayerId)) {
            map.removeLayer(outlineLayerId);
        }
        if (map.getLayer(outlineOutlineLayerId)) {
            map.removeLayer(outlineOutlineLayerId);
        }

        // Remove source
        if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
        }

        this._clearAlertPopup(target);
    }
}

export default AlertLayer;
