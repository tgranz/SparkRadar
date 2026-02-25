/*

> layers.js
This module manages alerts, watches, and outlooks display on the map.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import Popup from "./ui/popup.js";
import Dialog from "./ui/dialog.js";
import Notification from "./ui/notification.js";
import { buildAlertDefaults } from "./ui/settings.js";

class Layers {
    constructor(mapInstance) {
        this.map = mapInstance;

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

        // SSE tracking
        this.eventSource = null;
        this.sseReconnectAttempts = 0;
        this.sseMaxReconnectAttempts = 5;
        this.sseReconnectDelay = 3000; // 3 seconds

        // Polling tracking
        this.alertPollingInterval = null;
        this.alertPollingRate = 15000; // 15 seconds
        this.fetchRetryCount = 0;
        this.maxFetchRetries = 3;
        this.fetchInProgress = false;
        this.isMobileDevice = this._isMobileDevice();
        
        // Connection status tracking
        this.connectionStatus = 'OFFLINE'; // 'ONLINE', 'ISSUES', or 'OFFLINE'
        this.sseConnected = false;
        this.lastSuccessfulFetch = null;
        
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
     * Detects if the device is mobile
     */
    _isMobileDevice() {
        // Check for mobile user agent
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i;
        
        // Also check for touch-only devices with smaller screens
        const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const isSmallScreen = window.innerWidth <= 768;
        
        const isMobile = mobileRegex.test(userAgent) || (isTouchDevice && isSmallScreen);
        console.log(`[Layers] Mobile detection: isMobile=${isMobile}, userAgent match=${mobileRegex.test(userAgent)}, touch=${isTouchDevice}, smallScreen=${isSmallScreen}`);
        
        return isMobile;
    }

    // Alert methods
    /**
     * Subscribes to real-time alert updates via Server-Sent Events
     */
    subscribeToAlerts() {
        const API_BASE_URL = 'https://api.sparkradar.app';

        // Close any existing connection
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        // Create EventSource for real-time updates
        this.eventSource = new EventSource(`${API_BASE_URL}/alerts/subscribe`);

        this.eventSource.onopen = () => {
            console.log('[Layers] Connected to alert stream');
            this.sseReconnectAttempts = 0;
            this.sseConnected = true;
            this._updateConnectionStatus();
        };

        this.eventSource.onmessage = async (e) => {
            try {
                const data = JSON.parse(e.data);

                // Handle initial connection status
                if (data.status === 'connected') {
                    console.log('[Layers] Alert subscription established');
                    this.sseConnected = true;
                    this._updateConnectionStatus();
                    // Fetch all existing alerts on first connection
                    await this.fetchAlerts();
                    return;
                }

                // Handle new alert notifications
                if (data.id && data.name) {
                    console.log('[Layers] New alert received:', data.name);
                    this.sseConnected = true;
                    this._updateConnectionStatus();
                    
                    // Show notification for the new alert
                    this._showAlertNotification(data);
                    
                    // Wait a moment then fetch updated alerts
                    setTimeout(async () => {
                        await this.fetchAlerts();
                    }, 500);
                }
            } catch (error) {
                console.error('[Layers] Error processing SSE message:', error);
            }
        };

        this.eventSource.onerror = (e) => {
            console.error('[Layers] SSE connection error:', e);
            this.sseConnected = false;
            this._updateConnectionStatus("OFFLINE");
            this.eventSource.close();
            this.eventSource = null;

            // Attempt reconnection with exponential backoff
            if (this.sseReconnectAttempts < this.sseMaxReconnectAttempts) {
                this.sseReconnectAttempts++;
                const delay = this.sseReconnectDelay * Math.pow(1.5, this.sseReconnectAttempts - 1);
                console.log(`[Layers] Reconnecting in ${Math.round(delay)}ms (attempt ${this.sseReconnectAttempts}/${this.sseMaxReconnectAttempts})`);
                setTimeout(() => this.subscribeToAlerts(), delay);
            } else {
                console.error('[Layers] Max SSE reconnection attempts reached. Falling back to polling.');
                // Fall back to periodic polling
                this._startAlertPolling();
            }
        };
    }

    /**
     * Starts polling for alerts (used on mobile or as fallback)
     */
    _startAlertPolling() {
        // Clear any existing polling
        if (this.alertPollingInterval) {
            clearInterval(this.alertPollingInterval);
            this.alertPollingInterval = null;
        }

        // Wait for map to be fully ready before first fetch
        const performFirstFetch = () => {
            console.log('[Layers] Performing first alert fetch for polling');
            
            // Add a small delay on mobile to ensure network is ready
            const delay = this._isMobileDevice() ? 2000 : 500;
            
            setTimeout(() => {
                this.fetchAlerts();
                
                // Set up periodic polling
                this.alertPollingInterval = setInterval(() => {
                    this.fetchAlerts();
                }, this.alertPollingRate);
                
                console.log(`[Layers] Alert polling started (${this.alertPollingRate / 1000}s interval)`);
            }, delay);
        };

        // Check if map is ready
        const map = this.map?.map;
        if (!map) {
            console.warn('[Layers] Map not available for polling, retrying...');
            setTimeout(() => this._startAlertPolling(), 1000);
            return;
        }

        // If map is idle, fetch immediately, otherwise wait for idle
        if (map.isStyleLoaded && map.isStyleLoaded() && !map.isMoving()) {
            performFirstFetch();
        } else {
            console.log('[Layers] Waiting for map idle before first alert fetch');
            map.once('idle', performFirstFetch);
        }
    }

    /**
     * Closes the SSE connection and stops polling
     */
    closeAlertSubscription() {
        // Close SSE connection
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
            console.log('[Layers] Alert subscription closed');
        }

        // Stop polling
        if (this.alertPollingInterval) {
            clearInterval(this.alertPollingInterval);
            this.alertPollingInterval = null;
            console.log('[Layers] Alert polling stopped');
        }
    }

    async fetchAlerts(retryCount = 0) {
        // Prevent concurrent fetches
        if (this.fetchInProgress) {
            console.log('[Layers] Fetch already in progress, skipping...');
            return;
        }
        
        this.fetchInProgress = true;
        
        try {
            console.log('[Layers] Fetching alerts from API... (attempt ' + (retryCount + 1) + ')');
            
            // Use a longer timeout on mobile devices
            const timeout = this._isMobileDevice() ? 10000 : 5000;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            const response = await fetch('https://api.sparkradar.app/alerts', { 
                signal: controller.signal,
                mode: 'cors',
                cache: 'no-cache'
            });
            
            clearTimeout(timeoutId);
            
            console.log('[Layers] Response status:', response.status, response.statusText);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            } else if (response.status === 502) {
                // CORS error indicates offline server
                // Update to offline
                this.sseConnected = false;
                this._updateConnectionStatus("OFFLINE");
                throw new Error('Bad Gateway: Possible CORS error or server offline');
            }
            
            const data = await response.json();
            
            console.log('[Layers] fetchAlerts response:', { status: data.status, alertCount: data.alerts?.length || 0 });
            
            if (data.status === 'OK' && data.alerts) {
                this.alerts = data.alerts;
                this.displayAlerts();
                this.fetchRetryCount = 0; // Reset retry count on success
                this.lastSuccessfulFetch = new Date();
                // Update status to ISSUES (polling is working but SSE might not be)
                if (!this.sseConnected) {
                    this._updateConnectionStatus();
                }
            } else {
                console.warn('[Layers] fetchAlerts: Invalid response or no alerts', data);
            }
        } catch (error) {
            console.error('[Layers] Error fetching alerts:', {
                name: error.name,
                message: error.message,
                stack: error.stack,
                toString: error.toString()
            });
            
            // Update to offline
            this._updateConnectionStatus();
            
            // Retry logic for mobile network issues
            if (retryCount < this.maxFetchRetries && 
                (error.name === 'TypeError' || error.name === 'AbortError')) {
                const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
                console.log(`[Layers] Retrying fetch in ${delay}ms...`);
                this.fetchInProgress = false; // Release lock before retry
                setTimeout(() => this.fetchAlerts(retryCount + 1), delay);
                return; // Don't release lock at the end
            }
        } finally {
            this.fetchInProgress = false;
        }
    }

    async fetchWatches() {
        try {
            const timestamp = this._formatWatchTimestamp(new Date());
            const response = await fetch(`https://mesonet.agron.iastate.edu/json/spcwatch.py?ts=${timestamp}`, {
                signal: AbortSignal.timeout(5000)
            });
            const data = await response.json();

            if (data?.features) {
                this.watches = data.features;
                this.displayWatches();
            }
        } catch (error) {
            console.error('Error fetching watches:', error);
        }
    }

    _formatWatchTimestamp(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hour = String(date.getUTCHours()).padStart(2, '0');
        const minute = String(date.getUTCMinutes()).padStart(2, '0');
        return `${year}${month}${day}${hour}${minute}`;
    }

    /**
     * Updates connection status based on SSE and polling state
     * ONLINE: SSE connected
     * ISSUES: SSE disconnected but polling is working
     * OFFLINE: Both SSE and polling failing
     */
    _updateConnectionStatus(manualStatus = null) {
        let newStatus = 'OFFLINE';

        if (manualStatus) {
            newStatus = manualStatus;
            this.connectionStatus = newStatus;
            console.log(`[Layers] Connection status updated: ${newStatus}`);
            // Emit event for UI updates
            document.dispatchEvent(new CustomEvent('alertConnectionStatusChanged', {
                detail: { status: newStatus }
            }));
        }

        if (this.sseConnected) {
            newStatus = 'ONLINE';
        } else if (this.lastSuccessfulFetch) {
            // Check if last successful fetch was recent (within 2x polling interval)
            const now = new Date();
            const timeSinceLastFetch = now - this.lastSuccessfulFetch;
            if (timeSinceLastFetch < this.alertPollingRate * 2) {
                newStatus = 'ISSUES';
            }
        }

        if (newStatus !== this.connectionStatus) {
            this.connectionStatus = newStatus;
            console.log(`[Layers] Connection status updated: ${newStatus}`);
            // Emit event for UI updates
            document.dispatchEvent(new CustomEvent('alertConnectionStatusChanged', {
                detail: { status: newStatus }
            }));
        }
    }

    _convertAlertToGeoJSON(alert) {
        // Geometry is already in GeoJSON format from the API
        // Format: [[[lon, lat], ...]] - 3D array with polygons and rings
        const coordinates = alert.geometry && alert.geometry.length > 0 ? alert.geometry[0] : [[]];
        
        return {
            type: 'Feature',
            properties: {
                name: alert.name,
                id: alert.id,
                sender: alert.sender,
                issued: alert.issued,
                expiry: alert.expiry,
                phenomena: alert.properties?.phenomena,
                significance: alert.properties?.significance,
                productType: alert.properties?.product_type,
            },
            geometry: {
                type: 'Polygon',
                coordinates: coordinates
            }
        };
    }

    _getAlertColor(alert) {
        // Check for custom colors in settings first
        const alertSettings = this._getAlertSettings(alert.name);
        if (alertSettings.color) {
            return { 
                fill: alertSettings.color, 
                outline: alertSettings.color, 
                name: alert.name 
            };
        }

        // Fall back to default colors from ALERT_TYPE_DEFAULTS
        const defaultColor = buildAlertDefaults()[alert.name];
        if (defaultColor && defaultColor.color) {
            return { 
                fill: defaultColor.color, 
                outline: defaultColor.color, 
                name: alert.name 
            };
        }
        
        // Final fallback for unknown alert types
        return { fill: '#facc15', outline: '#facc15', name: alert.name };
    }

    _getAlertKey(alert, index) {
        const rawKey = alert?.id ?? `${index}`;
        return String(rawKey).replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    _getAlertSignature(alert) {
        return JSON.stringify({
            id: alert.id,
            name: alert.name,
            issued: alert.issued,
            expiry: alert.expiry,
            properties: alert.properties,
            geometry: alert.geometry
        });
    }

    _getAlertSettings(alertName) {
        try {
            // Convert alert name to settings key format
            // e.g., "Severe Thunderstorm Warning" -> "alert_severe_thunderstorm_warning"
            const settingKey = `alert_${alertName.replace(/\s+/g, '_').toLowerCase()}`;
            
            // Try to get from localStorage settings
            const storedSettings = localStorage.getItem('settings');
            if (storedSettings) {
                const parsed = JSON.parse(storedSettings);
                if (parsed[settingKey]) {
                    const value = parsed[settingKey];
                    if (value && typeof value === 'object') {
                        if (!value.color && (value.fillColor || value.borderColor)) {
                            value.color = value.fillColor || value.borderColor;
                        }
                        return value;
                    }
                    return parsed[settingKey];
                }
            }
            
            // Return defaults if not found
            return {
                enabled: true,
                notify: true,
                color: null
            };
        } catch (error) {
            console.error('[Layers] Error getting alert settings:', error);
            return { enabled: true, notify: true, color: null };
        }
    }

    _showAlertNotification(alertData) {
        // Check if notifications are enabled for this alert type
        const alertSettings = this._getAlertSettings(alertData.name);
        if (!alertSettings.notify) {
            console.log(`[Layers] Notifications disabled for ${alertData.name}`);
            return;
        }

        // Use custom colors from settings if available, otherwise use defaults from _getAlertColor
        let alertColor = alertSettings.color;
        
        // If no custom colors, try to get from _getAlertColor (which uses phenomena/significance)
        if (!alertColor) {
            const mockAlert = {
                name: alertData.name,
                message: alertData.message || '',
                properties: alertData.properties || {}
            };
            const defaultColors = this._getAlertColor(mockAlert);
            alertColor = alertSettings.color || defaultColors.fill;
        }

        // Determine icon based on alert type
        let icon = 'alert-triangle';
        let title = 'New Alert';
        
        const name = alertData.name?.toLowerCase() || '';
        const message = alertData.message?.toLowerCase() || '';
        
        // Tornado alerts
        if (name.includes('tornado')) {
            icon = 'tornado';
            title = 'Tornado Warning';
        }
        // Severe thunderstorm alerts
        else if (name.includes('severe thunderstorm')) {
            icon = 'bolt';
            title = 'Severe Thunderstorm Warning';
        }
        // Flash flood alerts
        else if (name.includes('flash flood')) {
            icon = 'droplet';
            title = 'Flash Flood Warning';
        }
        // Flood alerts
        else if (name.includes('flood')) {
            icon = 'droplet';
            title = 'Flood Warning';
        }
        // Winter alerts
        else if (name.includes('winter') || name.includes('blizzard') || name.includes('snow')) {
            icon = 'snowflake';
            title = 'Winter Weather';
        }
        // Wind alerts
        else if (name.includes('wind')) {
            icon = 'wind';
            title = 'Wind Advisory';
        }
        // Tsunami/Marine
        else if (name.includes('tsunami') || name.includes('marine') || name.includes('lakeshore')) {
            icon = 'wave';
            title = 'Marine Alert';
        }
        // Coastal/Storm Surge
        else if (name.includes('coastal') || name.includes('storm surge')) {
            icon = 'waves';
            title = 'Coastal Alert';
        }
        // Hurricane/Tropical
        else if (name.includes('hurricane') || name.includes('tropical') || name.includes('typhoon')) {
            icon = 'cloud-storm';
            title = 'Tropical Alert';
        }
        
        // Don't send notifications for unknown alerts
        if (alertData.name == "Unknown Alert") return;

        new Notification(
            title,
            `A ${alertData.name} has been issued or updated.`,
            icon,
            alertColor,
            8000 // Show for 8 seconds
        );

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
            if (!alert?.geometry?.length) continue;
            // Geometry format: [[[lon, lat], ...]] - already in correct order
            const polygons = alert.geometry;
            
            for (const rings of polygons) {
                if (this._pointInPolygon(point, rings)) {
                    matches.push(alert);
                    break;
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
        if (!rings || rings.length === 0) return false;
        if (!this._pointInRing(point, rings[0])) return false;
        for (let i = 1; i < rings.length; i += 1) {
            if (this._pointInRing(point, rings[i])) return false;
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
        const alertMatches = this._getAlertsAtPoint(point);
        const watchMatches = this._getWatchesAtPoint(point);
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

                const alertIssued = new Date(alert.issued).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit'
                });

                const alertExpiry = (() => {
                    const now = new Date();
                    const expiryDate = new Date(alert.expiry);
                    const diffMs = expiryDate - now;
                    const diffMins = Math.floor(diffMs / 60000);
                    
                    if (diffMins < 0) return 'expired';
                    if (diffMins < 60) return `in ${diffMins}m`;
                    
                    const hours = Math.floor(diffMins / 60);
                    const mins = diffMins % 60;
                    return mins > 0 ? `in ${hours}h ${mins}m` : `in ${hours}h`;
                })();

                const colors = this._getAlertColor(alert);
                const title = alert.name || 'Alert';
                const issued = alert.issued ? `Issued: ${alertIssued}` : '';
                const expiry = alert.expiry ? `Expires: ${alertExpiry}` : '';

                const is_pds = alert.message.toLowerCase().includes('particularly dangerous situation');
                const is_confirmed = alert.message.toLowerCase().includes('tornado...observed');
                const is_destructive = alert.message.toLowerCase().includes('destructive') || alert.message.toLowerCase().includes('catastrophic');
                const is_considerable = alert.message.toLowerCase().includes('considerable');
                const is_tor_possible = alert.message.toLowerCase().includes('tornado...possible');

                const meta = `${expiry}${is_tor_possible ? ' | Tornado Possible' : ''}`;

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
        const title = alert.name || 'Alert';
        const is_pds = alert.message.toLowerCase().includes('particularly dangerous situation');
        const is_confirmed = alert.message.toLowerCase().includes('tornado...observed');
        const is_destructive = alert.message.toLowerCase().includes('destructive') || alert.message.toLowerCase().includes('catastrophic');
        const is_considerable = alert.message.toLowerCase().includes('considerable');
        const is_tor_possible = alert.message.toLowerCase().includes('tornado...possible');
        
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
                        <strong>Issued:</strong> <span>${formatDate(alert.issued)}</span>
                        <strong>Expires:</strong> <span>${formatDate(alert.expiry)}</span>
                        ${alert.sender ? `<strong>Sender:</strong> <span>${alert.sender}</span>` : ''}
                        ${is_tor_possible ? `<strong>Tornado:</strong> <span style="color: #ff2121;">Possible</span>` : ''}
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
            const alertSettings = this._getAlertSettings(alert.name);
            if (!alertSettings.enabled) {
                return;
            }

            const geojson = this._convertAlertToGeoJSON(alert);
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
