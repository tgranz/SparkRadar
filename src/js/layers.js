/*

> layers.js
This module manages alerts, watches, and outlooks display on the map.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import Popup from "./ui/popup.js";
import Dialog from "./ui/dialog.js";
import AlertService from "./alerts.js";
import { buildAlertDefaults } from "./ui/settings.js";

class Layers {
    constructor(mapInstance) {
        this.map = mapInstance;

        // Initialize AlertService
        this.alertService = new AlertService();
        
        // Set up AlertService callbacks
        this.alertService.onAlertsUpdated = (alerts) => {
            this.alerts = alerts;
            this.displayAlerts();
            document.dispatchEvent(new CustomEvent('alertsUpdated', {
                detail: { count: alerts.length, alerts }
            }));
        };
        
        this.alertService.onWatchesUpdated = (watches) => {
            this.watches = watches;
            this.displayWatches();
        };
        
        this.alertService.onNewAlert = (alertData) => {
            // Additional handling for new alerts can be added here if needed
        };

        // Alert tracking
        this.alerts = [];
        this.alertCache = { main: new globalThis.Map(), dual: new globalThis.Map() };
        this.alertSyncPending = { main: false, dual: false };
        this.watches = [];
        this.watchCache = { main: new globalThis.Map(), dual: new globalThis.Map() };
        this.watchSyncPending = { main: false, dual: false };
        this.alertPopups = { main: null, dual: null };
        this.alertPopupLocations = { main: null, dual: null };
        this.alertPopupMoveHandlers = { main: null, dual: null };
        this.alertPopupClickHandlers = { main: null, dual: null };
        this.alertFlashIntervals = { main: new globalThis.Map(), dual: new globalThis.Map() };

        // Outlook tracking
        this.currentOutlookDay = null; // 1, 2, 3, or null
        this.outlookData = null;
        this.outlookSyncPending = { main: false, dual: false };

        // Mobile device detection
        this.isMobileDevice = this.alertService.isMobileDevice;
        
        if (this.isMobileDevice) {
            console.log('[Layers] Mobile device detected - performance optimizations enabled (flashing disabled)');
        }

        // Set up alert click handlers
        this.alertPopupClickHandlers.main = (e) => this._handleAlertClick('main', e);
        if (this.map?.map) {
            this.map.map.on('click', this.alertPopupClickHandlers.main);
        }
    }

    /**
     * Get connection status from AlertService
     */
    get connectionStatus() {
        return this.alertService.connectionStatus;
    }

    /**
     * Get SSE connected status from AlertService
     */
    get sseConnected() {
        return this.alertService.sseConnected;
    }

    /**
     * Get last successful fetch time from AlertService
     */
    get lastSuccessfulFetch() {
        return this.alertService.lastSuccessfulFetch;
    }

    // Alert methods
    /**
     * Subscribes to real-time alert updates via Server-Sent Events
     */
    subscribeToAlerts() {
        this.alertService.subscribeToAlerts();
    }

    /**
     * Starts polling for alerts (used on mobile or as fallback)
     */
    _startAlertPolling() {
        this.alertService._startAlertPolling(this.map);
    }

    /**
     * Closes the SSE connection and stops polling
     */
    closeAlertSubscription() {
        this.alertService.closeAlertSubscription();
    }

    /**
     * Fetches alerts from the API
     */
    async fetchAlerts(retryCount = 0) {
        return await this.alertService.fetchAlerts(retryCount);
    }

    /**
     * Fetches watches from the Iowa Mesonet API
     */
    async fetchWatches() {
        const watches = await this.alertService.fetchWatches();
        if (watches) {
            this.watches = watches;
            this.displayWatches();
        }
    }

    /**
     * Formats a date for the watch API timestamp parameter
     */
    _formatWatchTimestamp(date) {
        return this.alertService._formatWatchTimestamp(date);
    }

    _normalizePolygonRing(ring) {
        if (!ring || ring.length < 3) return ring;
        
        const epsilon = 0.0001;
        
        // First, find which point should be the start/end (the one that appears at both ends for closing)
        const lastPoint = ring[ring.length - 1];
        let properStartIndex = 0;
        
        // Check if the first point matches the last (properly closed polygon)
        const firstMatchesLast = Math.abs(ring[0][0] - lastPoint[0]) < epsilon && 
                                 Math.abs(ring[0][1] - lastPoint[1]) < epsilon;
        
        if (!firstMatchesLast) {
            // The polygon isn't properly closed with first=last, so we need to find the real start
            // Look for a point that appears twice (once in the middle, once at the end)
            for (let i = 1; i < ring.length - 1; i++) {
                if (Math.abs(ring[i][0] - lastPoint[0]) < epsilon && 
                    Math.abs(ring[i][1] - lastPoint[1]) < epsilon) {
                    properStartIndex = i;
                    console.log(`[Layers] Found proper start point at index ${i}: [${ring[i][0]}, ${ring[i][1]}]`);
                    break;
                }
            }
        }
        
        // Rebuild the ring starting from the proper start point
        const normalized = [];
        const seen = new Map();
        
        // Start from the proper start point and wrap around
        for (let offset = 0; offset < ring.length; offset++) {
            const i = (properStartIndex + offset) % ring.length;
            
            // Skip the last point for now - we'll add the closing point manually
            if (offset === ring.length - 1) break;
            
            const point = ring[i];
            const key = `${point[0].toFixed(4)},${point[1].toFixed(4)}`;
            
            // Skip if we've already added this point
            if (seen.has(key)) {
                console.log(`[Layers] Skipping duplicate point: [${point[0]}, ${point[1]}]`);
                continue;
            }
            
            seen.set(key, true);
            normalized.push([point[0], point[1]]);
        }
        
        // Close the polygon by adding the first point at the end
        if (normalized.length >= 3) {
            normalized.push([normalized[0][0], normalized[0][1]]);
        }
        
        // Need at least 4 points for a valid closed polygon
        if (normalized.length < 4) {
            console.warn('[Layers] Polygon ring has too few points after normalization:', normalized.length);
            return ring;
        }
        
        console.log(`[Layers] Normalized polygon: ${ring.length} points → ${normalized.length} points`);
        return normalized;
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
                coordinates: geometry.coordinates.map((ring) => this._normalizePolygonRing(ring))
            };
        }

        if (geometry.type === 'MultiPolygon') {
            return {
                type: 'MultiPolygon',
                coordinates: geometry.coordinates.map((polygon) =>
                    polygon.map((ring) => this._normalizePolygonRing(ring))
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

    _convertWatchToGeoJSON(watch) {
        if (!watch || watch.type !== 'Feature') return null;
        return watch;
    }

    _getWatchColor(watch) {
        const watchType = watch?.properties?.type;
        const isPds = !!watch?.properties?.is_pds;

        if (watchType === 'TOR') {
            return { fill: isPds ? '#7f0000' : '#ff2121', outline: '#ffb3b3', name: 'Tornado Watch' };
        }
        if (watchType === 'SVR') {
            return { fill: isPds ? '#b45309' : '#f59e0b', outline: '#fde68a', name: 'Severe Thunderstorm Watch' };
        }
        return { fill: '#38bdf8', outline: '#bae6fd', name: 'Watch' };
    }

    _getWatchKey(watch, index) {
        const rawKey = watch?.id ?? watch?.properties?.number ?? `${index}`;
        return String(rawKey).replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    _getWatchSignature(watch) {
        return JSON.stringify({
            id: watch.id,
            properties: watch.properties,
            geometry: watch.geometry
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
                if (this._pointInPolygon(point, geometry.coordinates)) {
                    matches.push(alert);
                }
                continue;
            }

            if (geometry.type === 'MultiPolygon') {
                for (const rings of geometry.coordinates) {
                    if (this._pointInPolygon(point, rings)) {
                        matches.push(alert);
                        break;
                    }
                }
            }
        }
        return matches;
    }

    _getWatchesAtPoint(point) {
        const matches = [];
        for (const watch of this.watches) {
            const geometry = watch?.geometry;
            if (!geometry) continue;
            const polygons = geometry.type === 'Polygon'
                ? [geometry.coordinates]
                : geometry.type === 'MultiPolygon'
                    ? geometry.coordinates
                    : [];

            for (const rings of polygons) {
                if (this._pointInPolygon(point, rings)) {
                    matches.push(watch);
                    break;
                }
            }
        }
        return matches;
    }

    _pointInRing(point, ring) {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1];
            const xj = ring[j][0], yj = ring[j][1];
            const intersect = ((yi > point[1]) !== (yj > point[1]))
                && (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    _pointInPolygon(point, rings) {
        if (!rings || rings.length === 0) {
            console.log(`[Layers] Invalid rings for point-in-polygon check`);
            return false;
        }
        console.log(`[Layers] Checking point [${point[0]}, ${point[1]}] against polygon with ${rings.length} rings`);
        if (!this._pointInRing(point, rings[0])) {
            console.log(`[Layers] Point is outside outer ring`);
            return false;
        }
        console.log(`[Layers] Point is inside outer ring`);
        for (let i = 1; i < rings.length; i += 1) {
            if (this._pointInRing(point, rings[i])) {
                console.log(`[Layers] Point is inside hole ring ${i}, excluding`);
                return false;
            }
        }
        return true;
    }

    _handleAlertClick(target, event) {
        // If a popup is currently open, close it rather than opening another
        if (this.alertPopups[target]) {
            this._clearAlertPopup(target);
            return;
        }
        
        const point = [event.lngLat.lng, event.lngLat.lat];
        console.log(`[Layers] Clicked at point: [${point[0]}, ${point[1]}]`);
        const alertMatches = this._getAlertsAtPoint(point);
        const watchMatches = this._getWatchesAtPoint(point);
        console.log(`[Layers] Found ${alertMatches.length} alerts and ${watchMatches.length} watches at click point`);
        this._showAlertPopup(target, event.lngLat, alertMatches, watchMatches);
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

    _showAlertPopup(target, lngLat, alerts, watches) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        this._clearAlertPopup(target);
        const hasAlerts = alerts && alerts.length > 0;
        const hasWatches = watches && watches.length > 0;
        if (!hasAlerts && !hasWatches) return;

        const sections = [];

        if (hasAlerts) {
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

                const meta = `
                ${expiry}
                ${is_tor_possible ? ' | Tornado Possible' : ''}
                ${alert?.alertInfo?.MAX_HAIL_SIZE ? `<br>Hail: ${alert?.alertInfo?.MAX_HAIL_SIZE}` : ''}
                ${alert?.alertInfo?.MAX_WIND_GUST ? `<br>Wind: ${alert?.alertInfo?.MAX_WIND_GUST}` : ''}`;

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

            sections.push(`
                <div class="popup-section">
                    <div class="popup-title">Warnings (${alerts.length})</div>
                    <div class="popup-list">${items}</div>
                </div>
            `);
        }

        if (hasWatches) {
            const items = watches.map((watch, index) => {

                const alertIssued = new Date(watch?.properties?.issue).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                const alertExpiry = (() => {
                    const now = new Date();
                    const expiryDate = new Date(watch?.properties?.expire);
                    const diffMs = expiryDate - now;
                    const diffMins = Math.floor(diffMs / 60000);
                    
                    if (diffMins < 0) return 'expired';
                    if (diffMins < 60) return `in ${diffMins}m`;
                    
                    const hours = Math.floor(diffMins / 60);
                    const mins = diffMins % 60;
                    return mins > 0 ? `in ${hours}h ${mins}m` : `in ${hours}h`;
                })();

                const colors = this._getWatchColor(watch);
                const props = watch.properties || {};
                const label = colors.name;
                const number = Number.isFinite(props.number) ? ` #${props.number}` : '';
                const pds = props.is_pds ? ' (PDS)' : '';
                const title = `${label}${number}${pds}`;
                const issued = props.issue ? `Issued: ${alertIssued}` : '';
                const expiry = props.expire ? `Expires ${alertExpiry}` : '';
                const meta = expiry;

                return `
                    <div class="popup-item" data-type="watch" data-index="${index}" style="cursor: pointer;">
                        <span class="popup-dot" style="background: ${colors.fill}"></span>
                        <div>
                            <div class="popup-item-title">${title}</div>
                            ${meta ? `<div class=\"popup-meta\">${meta}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            sections.push(`
                <div class="popup-section">
                    <div class="popup-title">Watches (${watches.length})</div>
                    <div class="popup-list">${items}</div>
                </div>
            `);
        }

        const html = sections.join('');

        const popup = new Popup(html);
        popup.addToMap(map);

        const el = popup.get();
        el.style.position = 'absolute';
        el.style.transform = 'translate(-50%, -100%)';
        el.style.pointerEvents = 'auto';
        el.style.zIndex = '2000';

        this.alertPopups[target] = popup;
        this.alertPopupLocations[target] = lngLat;
        this._updateAlertPopupPosition(target);

        // Add click listeners to popup items
        const popupItems = el.querySelectorAll('.popup-item');
        popupItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const type = item.dataset.type;
                const index = parseInt(item.dataset.index, 10);
                if (type === 'alert' && alerts[index]) {
                    this._showAlertDialog(alerts[index]);
                } else if (type === 'watch' && watches[index]) {
                    this._showWatchDialog(watches[index]);
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
        const colors = this._getAlertColor(alert);
        const title = this._getAlertName(alert);
        const alertMessage = this._getAlertMessage(alert);
        const is_pds = alert.properties?.isPds ?? alertMessage.includes('particularly dangerous situation');
        const is_confirmed = alertMessage.includes('tornado...observed');
        const is_destructive = alert.properties?.isDestructive ?? (alertMessage.includes('destructive') || alertMessage.includes('catastrophic'));
        const is_considerable = alert.properties?.isConsiderable ?? alertMessage.includes('considerable');
        const is_tor_possible = alertMessage.includes('tornado...possible');
        
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
                        ${alert?.alertInfo?.MAX_HAIL_SIZE ? `<strong>Hail:</strong> <span>${alert?.alertInfo?.MAX_HAIL_SIZE}${alert?.alertInfo?.HAIL_THREAT ? ', ' + alert?.alertInfo?.HAIL_THREAT : ''}</span>` : ''}
                        ${alert?.alertInfo?.MAX_WIND_GUST ? `<strong>Wind:</strong> <span>${alert?.alertInfo?.MAX_WIND_GUST}${alert?.alertInfo?.WIND_THREAT ? ', ' + alert?.alertInfo?.WIND_THREAT : ''}</span>` : ''}
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

    _showWatchDialog(watch) {
        const colors = this._getWatchColor(watch);
        const props = watch.properties || {};
        const label = colors.name;
        const number = Number.isFinite(props.number) ? ` #${props.number}` : '';
        const pds = props.is_pds ? ' (PDS)' : '';
        const title = `${label}${number}${pds}`;
        
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
                    <h3 style="margin: 0 0 10px 0; text-align: left; color: ${colors.fill};">${props.is_pds ? 'PDS ' : ''}${title}</h3>
                    <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px; font-size: 0.9em;">
                        <strong>Issued:</strong> <span>${formatDate(props.issue)}</span>
                        <strong>Expires:</strong> <span>${formatDate(props.expire)}</span>
                    </div>
                </div>
            </div>
        `;

        new Dialog(title, 'eye', html, {}, true);
    }

    _scheduleAlertSync(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) {
            console.warn(`[Layers] _scheduleAlertSync: Map not available for target ${target}`);
            return;
        }

        const isStyleLoaded = map.isStyleLoaded && map.isStyleLoaded();
        console.log(`[Layers] _scheduleAlertSync for ${target}: isStyleLoaded=${isStyleLoaded}, pending=${this.alertSyncPending[target]}`);
        
        if (isStyleLoaded) {
            this._syncAlertsToMap(target);
            return;
        }

        if (this.alertSyncPending[target]) return;
        this.alertSyncPending[target] = true;

        console.log(`[Layers] Waiting for map ${target} to load before syncing alerts`);
        map.once('load', () => {
            this.alertSyncPending[target] = false;
            this._syncAlertsToMap(target);
        });
    }

    _scheduleWatchSync(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        if (map.isStyleLoaded && map.isStyleLoaded()) {
            this._syncWatchesToMap(target);
            return;
        }

        if (this.watchSyncPending[target]) return;
        this.watchSyncPending[target] = true;

        map.once('load', () => {
            this.watchSyncPending[target] = false;
            this._syncWatchesToMap(target);
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

    _removeWatchFromMap(target, key) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        const layerPrefix = target === 'main' ? `watch-${key}` : `watch-${key}-dual`;
        const sourceId = target === 'main' ? `watch-source-${key}` : `watch-source-${key}-dual`;
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
            console.warn(`[Layers] _syncAlertsToMap: Map not available for target ${target}`);
            return;
        }
        if (map.isStyleLoaded && !map.isStyleLoaded()) {
            console.warn(`[Layers] _syncAlertsToMap: Style not loaded for target ${target}`);
            return;
        }

        console.log(`[Layers] _syncAlertsToMap: Syncing ${this.alerts.length} alerts to ${target}`);

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

        console.log(`[Layers] Using combined source approach: ${features.length} enabled alerts in 1 source, 3 layers total`);

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

    _syncWatchesToMap(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;
        if (map.isStyleLoaded && !map.isStyleLoaded()) return;

        const cache = target === 'main' ? this.watchCache.main : this.watchCache.dual;
        const nextKeys = new Set();
        const beforeLayerId = target === 'main' ? 'radar-webgl' : 'radar-webgl-dual';

        this.watches.forEach((watch, index) => {
            const key = this._getWatchKey(watch, index);
            const signature = this._getWatchSignature(watch);
            const geojson = this._convertWatchToGeoJSON(watch);
            if (!geojson) return;
            const colors = this._getWatchColor(watch);
            const colorSignature = `${colors.fill}|${colors.outline}`;

            nextKeys.add(key);

            const sourceId = target === 'main' ? `watch-source-${key}` : `watch-source-${key}-dual`;
            const layerPrefix = target === 'main' ? `watch-${key}` : `watch-${key}-dual`;
            const cached = cache.get(key);

            if (!map.getSource(sourceId)) {
                map.addSource(sourceId, {
                    type: 'geojson',
                    data: geojson
                });
            } else if (!cached || cached.signature !== signature) {
                map.getSource(sourceId).setData(geojson);
            }

            if (!map.getLayer(`${layerPrefix}-fill`)) {
                map.addLayer({
                    id: `${layerPrefix}-fill`,
                    type: 'fill',
                    source: sourceId,
                    paint: {
                        'fill-color': colors.fill,
                        'fill-opacity': 0.25
                    }
                }, beforeLayerId);
            }

            if (!map.getLayer(`${layerPrefix}-outline`)) {
                map.addLayer({
                    id: `${layerPrefix}-outline`,
                    type: 'line',
                    source: sourceId,
                    paint: {
                        'line-color': colors.outline,
                        'line-width': 2,
                        'line-opacity': 1
                    }
                });
            }

            if (!map.getLayer(`${layerPrefix}-outline-outline`)) {
                map.addLayer({
                    id: `${layerPrefix}-outline-outline`,
                    type: 'line',
                    source: sourceId,
                    paint: {
                        'line-color': '#000000',
                        'line-width': 4,
                        'line-opacity': 1
                    }
                }, `${layerPrefix}-outline`);
            }

            if (!cached || cached.colorSignature !== colorSignature) {
                if (map.getLayer(`${layerPrefix}-fill`)) {
                    map.setPaintProperty(`${layerPrefix}-fill`, 'fill-color', colors.fill);
                }
                if (map.getLayer(`${layerPrefix}-outline`)) {
                    map.setPaintProperty(`${layerPrefix}-outline`, 'line-color', colors.outline);
                }
            }

            cache.set(key, { signature, colorSignature });
        });

        for (const key of cache.keys()) {
            if (!nextKeys.has(key)) {
                this._removeWatchFromMap(target, key);
                cache.delete(key);
            }
        }
    }

    displayAlerts() {
        this._scheduleAlertSync('main');
        if (this.map?.isSplit()) {
            this._scheduleAlertSync('dual');
        }
        
        console.log(`[Layers] Displayed ${this.alerts.length} alerts`);
    }

    displayWatches() {
        this._scheduleWatchSync('main');
        if (this.map?.isSplit()) {
            this._scheduleWatchSync('dual');
        }

        console.log(`[Layers] Displayed ${this.watches.length} watches`);
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

    clearWatches(target = 'main') {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) {
            if (target === 'main') {
                this.watchCache.main.clear();
            } else if (target === 'dual') {
                this.watchCache.dual.clear();
            }
            return;
        }

        const cache = target === 'main' ? this.watchCache.main : this.watchCache.dual;
        for (const key of cache.keys()) {
            this._removeWatchFromMap(target, key);
        }
        cache.clear();
        this._clearAlertPopup(target);
    }

    displayAlertsOnDualMap() {
        // Only called when dual map is already loaded
        if (!this.map?.dualMap) return;
        this._scheduleAlertSync('dual');
    }

    displayWatchesOnDualMap() {
        // Only called when dual map is already loaded
        if (!this.map?.dualMap) return;
        this._scheduleWatchSync('dual');
    }

    // Outlook methods
    async fetchOutlook(day) {
        if (![1, 2, 3].includes(day)) {
            console.error('[Layers] Invalid outlook day:', day);
            return;
        }

        try {
            const url = `https://www.spc.noaa.gov/products/outlook/day${day}otlk_cat.nolyr.geojson`;
            const response = await fetch(url, {
                headers: { 'Accept': 'Application/geo+json' },
                signal: AbortSignal.timeout(5000)
            });
            
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data?.features) {
                this.currentOutlookDay = day;
                this.outlookData = data;
                this.displayOutlook();
            }
        } catch (error) {
            console.error('[Layers] Error fetching outlook:', error);
        }
    }

    _scheduleOutlookSync(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        if (map.isStyleLoaded && map.isStyleLoaded()) {
            this._syncOutlookToMap(target);
            return;
        }

        if (this.outlookSyncPending[target]) return;
        this.outlookSyncPending[target] = true;

        map.once('load', () => {
            this.outlookSyncPending[target] = false;
            this._syncOutlookToMap(target);
        });
    }

    _syncOutlookToMap(target) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;
        if (map.isStyleLoaded && !map.isStyleLoaded()) return;
        if (!this.outlookData || !this.outlookData.features) return;

        const sourceId = target === 'main' ? 'outlook-source' : 'outlook-source-dual';
        const layerId = target === 'main' ? 'outlook-layer' : 'outlook-layer-dual';
        const fillLayerId = `${layerId}-fill`;
        const beforeLayerId = target === 'main' ? 'radar-webgl' : 'radar-webgl-dual';

        // Remove existing layers/sources
        if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
        }
        if (map.getLayer(fillLayerId)) {
            map.removeLayer(fillLayerId);
        }
        if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
        }

        // Add the GeoJSON source
        map.addSource(sourceId, {
            type: 'geojson',
            data: this.outlookData
        });

        // Add fill layer for outlook areas
        map.addLayer({
            id: fillLayerId,
            type: 'fill',
            source: sourceId,
            paint: {
                'fill-color': ['get', 'fill'],
                'fill-opacity': 0.3
            }
        }, beforeLayerId);

        // Add line layer for outlook boundaries
        map.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            paint: {
                'line-color': ['get', 'stroke'],
                'line-width': 2,
                'line-opacity': 1
            }
        }, beforeLayerId);
    }

    displayOutlook() {
        this._scheduleOutlookSync('main');
        if (this.map?.isSplit()) {
            this._scheduleOutlookSync('dual');
        }
        
        console.log(`[Layers] Displayed Day ${this.currentOutlookDay} outlook with ${this.outlookData?.features?.length || 0} features`);
    }

    clearOutlook(target = 'main') {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        const sourceId = target === 'main' ? 'outlook-source' : 'outlook-source-dual';
        const layerId = target === 'main' ? 'outlook-layer' : 'outlook-layer-dual';
        const fillLayerId = `${layerId}-fill`;

        if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
        }
        if (map.getLayer(fillLayerId)) {
            map.removeLayer(fillLayerId);
        }
        if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
        }
    }

    displayOutlookOnDualMap() {
        // Only called when dual map is already loaded
        if (!this.map?.dualMap) return;
        if (!this.outlookData) return;
        this._scheduleOutlookSync('dual');
    }
}

export default Layers;
