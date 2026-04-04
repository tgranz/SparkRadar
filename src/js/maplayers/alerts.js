/*
Alert Layer
Manages alert display on the map

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import Dialog from "../ui/dialog.js";
import Window from "../ui/window.js";
import { hasUsableMapStyle, waitForMapStyleReady, waitForRadarLayer, pointInPolygon, getWeatherFillBeforeLayerId, getWeatherOutlineBeforeLayerId } from "./layer_utils.js";
import { renderAlert } from "../main/alert_utils.js";

const EMPTY_FEATURE_COLLECTION = {
    type: 'FeatureCollection',
    features: []
};

const DEBUG_ALERT_SYNC = false;
const SYNC_PENDING_STALE_MS = 15000;

class AlertLayer {
    constructor(mapInstance, alertService) {
        this.map = mapInstance;
        this.alertService = alertService;

        // Alert tracking
        this.alerts = [];
        this.alertCache = { main: new globalThis.Map(), dual: new globalThis.Map() };
        this.alertSyncPending = { main: false, dual: false };
        this.alertSyncPendingSince = { main: 0, dual: 0 };
        this.alertPopups = { main: null, dual: null };
        this.alertPopupLocations = { main: null, dual: null };
        this.alertPopupMoveHandlers = { main: null, dual: null };
        this.alertPopupClickHandlers = { main: null, dual: null };
        this.alertFlashIntervals = { main: new globalThis.Map(), dual: new globalThis.Map() };

        // Mobile device detection
        this.isMobileDevice = this.alertService.isMobileDevice;

        // Flash animation for new alerts
        this.flashAnimationFrames = { main: null, dual: null };
        this.alertRefreshIntervals = { main: null, dual: null };
        this._injectFlashCSS();

        // Set up alert click handlers
        this.alertPopupClickHandlers.main = (e) => this._handleAlertClick('main', e);
        if (this.map?.map) {
            this.map.map.on('click', this.alertPopupClickHandlers.main);
        }
    }

    _getAlertDetailsSurface() {
        const setting = window.settingsInstance?.getSetting('alertDetailsAppearIn');
        return setting === 'windows' ? 'windows' : 'dialogs';
    }

    _getAlertDetailsSurfaceLabel() {
        return this._getAlertDetailsSurface() === 'windows' ? 'Window' : 'Dialog';
    }

    setAlerts(alerts) {
        this.alerts = alerts;
    }

    getAlerts() {
        return this.alerts;
    }

    _injectFlashCSS() {
        // Inject CSS keyframes for alert flash animation
        if (document.getElementById('alert-flash-animation')) return;
        
        const style = document.createElement('style');
        style.id = 'alert-flash-animation';
        style.textContent = `
            @keyframes alert-pulse {
                0% { opacity: 1; }
                50% { opacity: 0.3; }
                100% { opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    _isAlertNew(alert) {
        const issuedAt = alert.issued || alert.receivedAt;
        if (!issuedAt) return false;
        
        const now = Date.now();
        const issued = new Date(issuedAt).getTime();
        const ageMs = now - issued;
        
        // Consider alerts issued within the last 60 seconds as "new"
        return ageMs >= 0 && ageMs < 60000;
    }

    _refreshAlertNewStatus(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        const sourceId = target === 'main' ? 'alerts-combined' : 'alerts-combined-dual';
        const source = map.getSource(sourceId);
        if (!source) return;

        // Rebuild the feature collection with updated isNew status
        const features = [];
        let hasNewAlerts = false;
        
        this.alerts.forEach((alert, index) => {
            const alertSettings = renderAlert(alert);
            if (!alertSettings.enabled) {
                return;
            }

            const geojson = this._convertAlertToGeoJSON(alert);
            if (!geojson) {
                return;
            }
            
            const colors = this._getAlertColor(alert);
            const isNew = this._isAlertNew(alert);
            const priority = this._getAlertPriority(alert);
            
            geojson.properties.fillColor = colors.fill;
            geojson.properties.outlineColor = colors.outline;
            geojson.properties.alertIndex = index;
            geojson.properties.isNew = isNew ? 1 : 0;
            geojson.properties.priority = priority;
            
            if (isNew) hasNewAlerts = true;
            
            features.push(geojson);
        });

        // Update the source with the new data
        source.setData({
            type: 'FeatureCollection',
            features: features
        });

        // If no more new alerts, stop the animation
        if (!hasNewAlerts) {
            console.log(`[AlertLayer] No more new alerts on ${target}, stopping flash animation`);
            this._stopFlashAnimation(target);
        }
    }

    _convertAlertToGeoJSON(alert) {
        const geometry = this._getAlertGeometry(alert);
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

    _getAlertName(alert) {
        return renderAlert(alert)?.name || "Unknown Alert";
    }

    _getAlertMessage(alert) {
        return (alert?.message || '').toLowerCase();
    }

    _getAlertPriority(alert) {
        return Number(renderAlert(alert)?.priority) || 0;
    }

    _getAlertColor(alert) {
        // Check for custom colors in settings first
        const rendered = renderAlert(alert);
        if (rendered && rendered.color) {
            return { fill: rendered.color, outline: rendered.color, name: rendered.name };
        }
        
        // Fallback for unknown alert types
        return { fill: '#facc15', outline: '#facc15', name: this._getAlertName(alert) };
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

        matches.sort((a, b) => {
            const priorityDiff = this._getAlertPriority(b) - this._getAlertPriority(a);
            if (priorityDiff !== 0) return priorityDiff;

            const issuedA = Date.parse(a?.issued || a?.issuedAt) || 0;
            const issuedB = Date.parse(b?.issued || b?.issuedAt) || 0;
            return issuedB - issuedA;
        });

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

        const orderedAlerts = [...alerts].sort((a, b) => {
            const priorityDiff = this._getAlertPriority(b) - this._getAlertPriority(a);
            if (priorityDiff !== 0) return priorityDiff;

            const issuedA = Date.parse(a?.issued || a?.issuedAt) || 0;
            const issuedB = Date.parse(b?.issued || b?.issuedAt) || 0;
            return issuedB - issuedA;
        });

        const items = orderedAlerts.map((alert, index) => {
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

            const rendered = renderAlert(alert);

            const meta = `
            ${expiry}
            ${rendered.props.is_tor_possible ? ' | <b>Tornado Possible</b>' : (rendered.props.is_tor_observed ? ' | <b>Confirmed Tornado</b>' : (rendered.props.is_tor_radar_indicated ? ' | <b>Radar Indicated</b>' : ''))}
            ${rendered.props.is_waterspout_possible ? ' | <b>Waterspout Possible</b>' : ''}
            ${rendered.props.max_wind_gust && rendered.props.max_hail_size ? `<br>Wind: ${rendered.props.max_wind_gust.toUpperCase()} | Hail: ${rendered.props.max_hail_size.toUpperCase()}` : (rendered.props.max_hail_size ? `<br>Hail: ${rendered.props.max_hail_size.toUpperCase()}` : (rendered.props.max_wind_gust ? `<br>Wind: ${rendered.props.max_wind_gust.toUpperCase()}` : ''))}
            ${(rendered.props.is_emergency && rendered.name.includes("Tornado")) ? '<br><b>TORNADO EMERGENCY</b>' : rendered.props.is_pds ? '<br><b>PARTICULARLY DANGEROUS SITUATION</b>' : ''}
            `.trim();

            return `
                <div class="popup-item" data-type="alert" data-index="${index}" style="cursor: pointer;">
                    <span class="popup-dot" style="background: ${colors.fill}"></span>
                    <div>
                        <div class="popup-item-title">${rendered.name}</div>
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

        const rendered = renderAlert(alert);
        
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
            <div style="margin-bottom: 20px; padding: 15px; background: ${rendered.color}30; border-left: 4px solid ${rendered.color}; border-radius: 10px;">
                <h3 style="margin: 0 0 10px 0; text-align: left; color: ${rendered.color};">${rendered.name}</h3>
                <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px; font-size: 0.9em;">
                    <strong>Issued:</strong> <span>${formatDate(alert.issued || alert.receivedAt)}</span>
                    <strong>Expires:</strong> <span>${formatDate(alert.expiry || alert.expiresAt)}</span>
                    ${alert.sender || alert.nwsOffice ? `<strong>Sender:</strong> <span>${alert.sender || alert.nwsOffice}</span>` : ''}
                    ${rendered.props.is_tor_possible ? `<strong>Tornado:</strong> <span style="color: #ff2121;">Possible</span>` : (rendered.props.is_tor_observed ? `<strong>Tornado:</strong> <span style="color: #ff2121;">Observed</span>` : (rendered.props.is_tor_radar_indicated ? `<strong>Tornado:</strong> <span style="color: #ffcc00;">Radar Indicated</span>` : ''))}
                    ${rendered.props.is_waterspout_possible ? `<strong>Waterspout:</strong> <span style="color: #ff2121;">Possible</span>` : ''}
                    ${rendered.props.max_hail_size ? `<strong>Max Hail:</strong> <span>${rendered.props.max_hail_size.toUpperCase()} (${expandHailSize(rendered.props.max_hail_size)})</span>` : ''}
                    ${rendered.props.max_wind_gust ? `<strong>Max Wind:</strong> <span>${rendered.props.max_wind_gust.toUpperCase()}</span>` : ''}
                </div>
            </div>
            ${alert.message ? alert.message.split('#####\n\n').map((section, i, arr) => `
                ${arr.length === 1 ? `` : `${i === 0 ? '<p style="margin: 10px; font-size: 0.9em; text-align: center; font-weight: bold; color: gray;">Latest Bulletin</p>' : `<p style="margin: 10px; font-size: 0.9em; text-align: center; font-weight: bold; color: gray;">Update ${arr.length - i} of ${arr.length}</p>`}`}
                <div style="margin-bottom: 15px;">
                    <p style="margin: 0; white-space: pre-wrap; line-height: 1.5; font-family: 'Consolas', mono, monospace; background: black; padding: 10px; border-radius: 10px; border: 1px solid var(--border-color); overflow-wrap: break-word; font-size: 0.85em;">${section.replace('  ', '\n').replace(/<[^>]+>/g, '')}</p>
                </div>
            `).join('') : ''}
        `;

        if (this._getAlertDetailsSurface() === 'windows') {
            new Window({
                title: rendered.name,
                icon: 'alert-triangle',
                content: `<div style="color: white; padding: 20px; width: calc(100% - 40px);">${html}</div>`,
                width: 600,
                height: 700
            });
            return;
        }

        new Dialog(rendered.name, 'alert-triangle', `<div style="max-width: 600px;">${html}</div>`, {}, true);
    }

    zoomToAlert(alert) {
        if (!alert?.geometry) {
            console.warn('Alert has no geometry data');
            return;
        }

        let minLng = Infinity;
        let minLat = Infinity;
        let maxLng = -Infinity;
        let maxLat = -Infinity;

        const geometry = alert.geometry;
        const coordinates = geometry.type && Array.isArray(geometry.coordinates)
            ? geometry.coordinates
            : geometry;

        let rings = [];
        if (Array.isArray(coordinates) && coordinates.length > 0) {
            if (geometry.type === 'MultiPolygon') {
                rings = coordinates.flat();
            } else if (Array.isArray(coordinates[0]) && coordinates[0].length === 2 && typeof coordinates[0][0] === 'number') {
                rings = [coordinates];
            } else if (Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0])) {
                rings = coordinates;
            }
        }

        for (const ring of rings) {
            for (const coord of ring) {
                const lng = Number(coord[0]);
                const lat = Number(coord[1]);
                if (Number.isNaN(lng) || Number.isNaN(lat)) continue;
                minLng = Math.min(minLng, lng);
                minLat = Math.min(minLat, lat);
                maxLng = Math.max(maxLng, lng);
                maxLat = Math.max(maxLat, lat);
            }
        }

        if (!Number.isFinite(minLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLng) || !Number.isFinite(maxLat)) {
            console.warn('Could not calculate alert bounds');
            return;
        }

        const map = this.map?.map;
        if (!map) {
            console.warn('Map instance not available');
            return;
        }

        try {
            map.fitBounds(
                [[minLng, minLat], [maxLng, maxLat]],
                { padding: 50, maxZoom: 10, duration: 1000 }
            );
        } catch (error) {
            console.error('Error zooming to alert:', error);
        }
    }

    _scheduleAlertSync(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) {
            console.warn(`[AlertLayer] _scheduleAlertSync: Map not available for target ${target}`);
            return;
        }

        const isStyleLoaded = hasUsableMapStyle(map);
        console.log(`[AlertLayer] _scheduleAlertSync for ${target}: isStyleLoaded=${isStyleLoaded}, pending=${this.alertSyncPending[target]}`);
        
        if (isStyleLoaded) {
            this.alertSyncPending[target] = false;
            this.alertSyncPendingSince[target] = 0;
            waitForRadarLayer(map, target).then(() => {
                this._syncAlertsToMap(target);
            });
            return;
        }

        if (this.alertSyncPending[target]) {
            const pendingAge = Date.now() - (this.alertSyncPendingSince[target] || 0);
            if (pendingAge < SYNC_PENDING_STALE_MS) {
                return;
            }
            console.warn(`[AlertLayer] Resetting stale sync pending flag for ${target} (age=${pendingAge}ms)`);
            this.alertSyncPending[target] = false;
        }
        this.alertSyncPending[target] = true;
        this.alertSyncPendingSince[target] = Date.now();

        console.log(`[AlertLayer] Waiting for map ${target} style to be ready before syncing alerts`);
        waitForMapStyleReady(map).then(() => {
            this.alertSyncPending[target] = false;
            this.alertSyncPendingSince[target] = 0;
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
        if (!hasUsableMapStyle(map)) {
            console.warn(`[AlertLayer] _syncAlertsToMap: Style not ready for target ${target}; waiting and retrying.`);
            waitForMapStyleReady(map).then(() => {
                waitForRadarLayer(map, target).then(() => {
                    this._syncAlertsToMap(target);
                });
            });
            return;
        }

        console.log(`[AlertLayer] _syncAlertsToMap: Syncing ${this.alerts.length} alerts to ${target}`);

        if (DEBUG_ALERT_SYNC) {
            try {
                const layerIds = (map.getStyle()?.layers || []).map((layer) => layer.id);
                console.log(`[Debug][AlertSync] pre-sync ${target}`, {
                    sourcePresent: !!map.getSource(target === 'main' ? 'alerts-combined' : 'alerts-combined-dual'),
                    alertLayersPresent: layerIds.filter((id) => id.startsWith(target === 'main' ? 'alerts-combined' : 'alerts-combined-dual')),
                    top20Layers: layerIds.slice(-20)
                });
            } catch (error) {
                console.warn(`[Debug][AlertSync] pre-sync snapshot failed (${target}):`, error);
            }
        }

        // Use a single GeoJSON source for ALL alerts - much better performance
        const sourceId = target === 'main' ? 'alerts-combined' : 'alerts-combined-dual';
        const fillBeforeLayerId = getWeatherFillBeforeLayerId(map, target);
        const outlineBeforeLayerId = getWeatherOutlineBeforeLayerId(map, target);
        
        // Build a FeatureCollection with all enabled alerts
        const features = [];
        this.alerts.forEach((alert, index) => {
            const alertName = this._getAlertName(alert);
            const alertSettings = renderAlert(alert);
            if (!alertSettings.enabled) {
                return;
            }

            const geojson = this._convertAlertToGeoJSON(alert);
            if (!geojson) {
                return;
            }
            const colors = this._getAlertColor(alert);
            const priority = this._getAlertPriority(alert);
            
            // Add color information to properties for data-driven styling
            geojson.properties.fillColor = colors.fill;
            geojson.properties.outlineColor = colors.outline;
            geojson.properties.alertIndex = index;
            geojson.properties.isNew = this._isAlertNew(alert) ? 1 : 0;
            geojson.properties.priority = priority;
            
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
                layout: {
                    'line-sort-key': ['get', 'priority']
                },
                paint: {
                    'line-color': '#000000',
                    'line-width': 6,
                    'line-opacity': 1
                }
            }, outlineBeforeLayerId);
        }

        if (!map.getLayer(outlineLayerId)) {
            map.addLayer({
                id: outlineLayerId,
                type: 'line',
                source: sourceId,
                layout: {
                    'line-sort-key': ['get', 'priority']
                },
                paint: {
                    'line-color': ['get', 'outlineColor'],
                    'line-width': 2,
                    'line-opacity': 1
                }
            }, outlineBeforeLayerId);
        }

        if (!map.getLayer(fillLayerId)) {
            map.addLayer({
                id: fillLayerId,
                type: 'fill',
                source: sourceId,
                filter: ['!=', ['get', 'isNew'], 1],
                layout: {
                    'fill-sort-key': ['get', 'priority']
                },
                paint: {
                    'fill-color': ['get', 'fillColor'],
                    'fill-opacity': 0.4
                }
            }, fillBeforeLayerId);
        } else {
            map.setFilter(fillLayerId, ['!=', ['get', 'isNew'], 1]);
        }

        // Create separate layers for new (flashing) alerts
        const newFillLayerId = `${sourceId}-fill-new`;
        const newOutlineLayerId = `${sourceId}-outline-new`;
        const newOutlineOutlineLayerId = `${sourceId}-outline-outline-new`;

        if (!map.getLayer(newOutlineOutlineLayerId)) {
            map.addLayer({
                id: newOutlineOutlineLayerId,
                type: 'line',
                source: sourceId,
                filter: ['==', ['get', 'isNew'], 1],
                layout: {
                    'line-sort-key': ['get', 'priority']
                },
                paint: {
                    'line-color': '#000000',
                    'line-width': 6,
                    'line-opacity': 1
                }
            }, outlineBeforeLayerId);
        } else {
            map.setFilter(newOutlineOutlineLayerId, ['==', ['get', 'isNew'], 1]);
        }

        if (!map.getLayer(newOutlineLayerId)) {
            map.addLayer({
                id: newOutlineLayerId,
                type: 'line',
                source: sourceId,
                filter: ['==', ['get', 'isNew'], 1],
                layout: {
                    'line-sort-key': ['get', 'priority']
                },
                paint: {
                    'line-color': ['get', 'outlineColor'],
                    'line-width': 2,
                    'line-opacity': 1
                }
            }, outlineBeforeLayerId);
        } else {
            map.setFilter(newOutlineLayerId, ['==', ['get', 'isNew'], 1]);
        }

        if (!map.getLayer(newFillLayerId)) {
            map.addLayer({
                id: newFillLayerId,
                type: 'fill',
                source: sourceId,
                filter: ['==', ['get', 'isNew'], 1],
                layout: {
                    'fill-sort-key': ['get', 'priority']
                },
                paint: {
                    'fill-color': ['get', 'fillColor'],
                    'fill-opacity': 0.4
                }
            }, fillBeforeLayerId);
        } else {
            map.setFilter(newFillLayerId, ['==', ['get', 'isNew'], 1]);
        }

        // Start flash animation for new alerts
        this._startFlashAnimation(target);

        this.map?.layers?.applyLayerOrder(target);

        if (DEBUG_ALERT_SYNC) {
            try {
                const layerIds = (map.getStyle()?.layers || []).map((layer) => layer.id);
                const sourceId = target === 'main' ? 'alerts-combined' : 'alerts-combined-dual';
                console.log(`[Debug][AlertSync] post-sync ${target}`, {
                    sourcePresent: !!map.getSource(sourceId),
                    fillPresent: !!map.getLayer(`${sourceId}-fill`),
                    outlinePresent: !!map.getLayer(`${sourceId}-outline`),
                    outlineOutlinePresent: !!map.getLayer(`${sourceId}-outline-outline`),
                    newFillPresent: !!map.getLayer(`${sourceId}-fill-new`),
                    newOutlinePresent: !!map.getLayer(`${sourceId}-outline-new`),
                    newOutlineOutlinePresent: !!map.getLayer(`${sourceId}-outline-outline-new`),
                    alertLayersOrder: layerIds.filter((id) => id.startsWith(sourceId)),
                    top20Layers: layerIds.slice(-20)
                });
            } catch (error) {
                console.warn(`[Debug][AlertSync] post-sync snapshot failed (${target}):`, error);
            }
        }
    }

    _isAlertsLayerEnabled() {
        try {
            const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
            if (typeof settings.alertsEnabled === 'boolean') {
                return settings.alertsEnabled;
            }
        } catch {
        }

        const checkbox = document.getElementById('toggle-alerts-layer');
        return checkbox ? checkbox.checked : true;
    }

    displayAlertsOnMap(target = 'main') {
        if (!this._isAlertsLayerEnabled()) {
            this.clearAlerts(target);
            return;
        }

        this._scheduleAlertSync(target);
    }

    displayAlerts() {
        this.displayAlertsOnMap('main');
        if (this.map?.isSplit()) {
            this.displayAlertsOnMap('dual');
        }
        
        console.log(`[AlertLayer] Displayed ${this.alerts.length} alerts`);
    }

    displayAlertsOnDualMap() {
        // Only called when dual map is already loaded
        if (!this.map?.dualMap) return;
        this.displayAlertsOnMap('dual');
    }

    clearAlerts(target = 'main') {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) {
            return; 
        }

        // Stop flash animation
        this._stopFlashAnimation(target);

        // Remove the combined alert layers and source
        const sourceId = target === 'main' ? 'alerts-combined' : 'alerts-combined-dual';
        const fillLayerId = `${sourceId}-fill`;
        const outlineLayerId = `${sourceId}-outline`;
        const outlineOutlineLayerId = `${sourceId}-outline-outline`;
        const newFillLayerId = `${sourceId}-fill-new`;
        const newOutlineLayerId = `${sourceId}-outline-new`;
        const newOutlineOutlineLayerId = `${sourceId}-outline-outline-new`;

        if (map.getSource(sourceId)) {
            map.getSource(sourceId).setData(EMPTY_FEATURE_COLLECTION);
        }

        this._clearAlertPopup(target);
    }

    _startFlashAnimation(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        // Clear existing animation and interval
        this._stopFlashAnimation(target);

        const sourceId = target === 'main' ? 'alerts-combined' : 'alerts-combined-dual';
        const newFillLayerId = `${sourceId}-fill-new`;
        const newOutlineLayerId = `${sourceId}-outline-new`;

        if (!map.getLayer(newFillLayerId)) return;

        let startTime = Date.now();
        const duration = 1000; // 1 second pulse cycle

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const cycle = (elapsed % duration) / duration;
            
            // Pulse between normal and white using sine wave
            const phase = Math.sin(cycle * Math.PI * 2) * 0.5 + 0.5;
            
            // Interpolate between alert color and white
            const fillColorExpression = [
                'interpolate',
                ['linear'],
                ['literal', phase],
                0,
                ['get', 'fillColor'],
                1,
                '#ffffff'
            ];

            const outlineColorExpression = [
                'interpolate',
                ['linear'],
                ['literal', phase],
                0,
                ['get', 'outlineColor'],
                1,
                '#ffffff'
            ];

            try {
                if (map.getLayer(newFillLayerId)) {
                    map.setPaintProperty(newFillLayerId, 'fill-color', fillColorExpression);
                }
                if (map.getLayer(newOutlineLayerId)) {
                    map.setPaintProperty(newOutlineLayerId, 'line-color', outlineColorExpression);
                }
            } catch (e) {
                console.warn('[AlertLayer] Flash animation error:', e);
                this._stopFlashAnimation(target);
                return;
            }

            this.flashAnimationFrames[target] = requestAnimationFrame(animate);
        };

        animate();

        // Start periodic refresh to update which alerts are still "new"
        this.alertRefreshIntervals[target] = setInterval(() => {
            this._refreshAlertNewStatus(target);
        }, 10000); // Check every 10 seconds
    }

    _stopFlashAnimation(target) {
        if (this.flashAnimationFrames[target]) {
            cancelAnimationFrame(this.flashAnimationFrames[target]);
            this.flashAnimationFrames[target] = null;
        }
        
        if (this.alertRefreshIntervals[target]) {
            clearInterval(this.alertRefreshIntervals[target]);
            this.alertRefreshIntervals[target] = null;
        }
    }
}

export default AlertLayer;
