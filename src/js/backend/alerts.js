/*

> alerts.js
This module handles alert data fetching, SSE subscriptions, and notifications.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import Notification from "../ui/notification.js";
import { renderAlert } from "./alert_utils.js";

/**
 * AlertService manages alert data fetching via SSE and polling
 */
class AlertService {
    constructor() {
        // SSE tracking
        this.eventSource = null;
        this.sseReconnectAttempts = 0;
        this.sseMaxReconnectAttempts = 5;
        this.sseReconnectDelay = 3000; // 3 seconds
        // Do not log SSE connection in development, only use for analytics in production
        this.shouldLogSseConnection = (String(window.location).includes('localhost') || String(window.location).includes('192.168.')) ? false : true;

        // Polling tracking
        this.alertPollingInterval = null;
        this.alertPollingRate = 15000; // 15 seconds
        this.fetchRetryCount = 0;
        this.maxFetchRetries = 3;
        this.fetchInProgress = false;
        this.isMobileDevice = this._isMobileDevice();
        
        // Connection status tracking
        this.connectionStatus = 'OFFLINE'; // 'CONNECTED', 'ISSUES', or 'OFFLINE'
        this.sseConnected = false;
        this.lastSuccessfulFetch = null;

        // Callbacks
        this.onAlertsUpdated = null; // Callback when alerts are fetched: (alerts) => void
        this.onWatchesUpdated = null; // Callback when watches are fetched: (watches) => void
        this.onNewAlert = null; // Callback when a new alert is received via SSE: (alertData) => void
        this.onAlertNotificationViewMap = null;
        this.onAlertNotificationViewProduct = null;
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
        
        return isMobile;
    }

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
        const streamUrl = new URL(`${API_BASE_URL}/subscribe`);
        const includeSseLogParam = this.shouldLogSseConnection;
        if (includeSseLogParam) {
            console.log('[AlertService] Enabled logging for analytics in production.');
            streamUrl.searchParams.set('log', 'true');
        } else {
            console.log('[AlertService] Disabled logging for analytics in development.');
        }
        this.eventSource = new EventSource(streamUrl.toString());

        this.eventSource.onopen = () => {
            console.log('[AlertService] Connected to SparkAlerts SSE stream.');
            if (includeSseLogParam) {
                this.shouldLogSseConnection = false;
            }
            this.sseReconnectAttempts = 0;
            this.sseConnected = true;
            this._updateConnectionStatus();
            this.fetchAlerts();
        };

        this.eventSource.addEventListener('NEW', async (e) => {
            try {
                const data = this._normalizeAlert(JSON.parse(e.data));
                this.sseConnected = true;
                this._updateConnectionStatus();

                this._showAlertNotification(data, true);

                if (this.onNewAlert) {
                    this.onNewAlert(data);
                }

                setTimeout(async () => {
                    await this.fetchAlerts();
                }, 250);
            } catch (error) {
                console.error('[AlertService] Error processing NEW event:', error);
            }
        });

        this.eventSource.addEventListener('UPDATE', async (e) => {
            try {
                if (!e?.data) {
                    return;
                }

                const data = this._normalizeAlert(JSON.parse(e.data));
                this.sseConnected = true;
                this._updateConnectionStatus();

                this._showAlertNotification(data, false);

                setTimeout(async () => {
                    await this.fetchAlerts();
                }, 250);
            } catch (error) {
                console.error('[AlertService] Error processing UPDATE event:', error);
            }
        });

        // Backward compatibility for servers that send default messages
        this.eventSource.onmessage = async (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data?.status === 'connected') {
                    this.sseConnected = true;
                    this._updateConnectionStatus();
                    await this.fetchAlerts();
                    return;
                }

                if (data?.id) {
                    const normalized = this._normalizeAlert(data);
                    this.sseConnected = true;
                    this._updateConnectionStatus();
                    this._showAlertNotification(normalized);
                    if (this.onNewAlert) {
                        this.onNewAlert(normalized);
                    }
                    setTimeout(async () => {
                        await this.fetchAlerts();
                    }, 500);
                }
            } catch (error) {
                console.error('[AlertService] Error processing SSE message:', error);
            }
        };

        this.eventSource.onerror = (e) => {
            this.sseConnected = false;
            
            // SSE frequently hiccups, do not set as disconnected until multiple failed attempts
            if (this.sseReconnectAttempts === 0) {
                this._updateConnectionStatus("CONNECTED"); // Keep as connected during transient issues
            }
            this.eventSource.close();
            this.eventSource = null;

            // Attempt reconnection with exponential backoff
            if (this.sseReconnectAttempts < this.sseMaxReconnectAttempts) {
                this.sseReconnectAttempts++;
                const delay = this.sseReconnectDelay * Math.pow(1.5, this.sseReconnectAttempts - 1);
                console.log(`[AlertService] Reconnecting in ${Math.round(delay)}ms (attempt ${this.sseReconnectAttempts}/${this.sseMaxReconnectAttempts}).`);
                setTimeout(() => this.subscribeToAlerts(), delay);
            } else {
                console.error('[AlertService] Max SSE reconnection attempts reached. Falling back to polling.');
                // Fall back to periodic polling
                this._startAlertPolling();
            }
        };
    }

    /**
     * Starts polling for alerts (used on mobile or as fallback)
     * @param {Object} map - The map instance (optional, for checking map ready state)
     */
    _startAlertPolling(map = null) {
        // Clear any existing polling
        if (this.alertPollingInterval) {
            clearInterval(this.alertPollingInterval);
            this.alertPollingInterval = null;
        }

        // Wait for map to be fully ready before first fetch (if map is provided)
        const performFirstFetch = () => {
            
            // Add a small delay on mobile to ensure network is ready
            const delay = this._isMobileDevice() ? 2000 : 500;
            
            setTimeout(() => {
                this.fetchAlerts();
                
                // Set up periodic polling
                this.alertPollingInterval = setInterval(() => {
                    this.fetchAlerts();
                }, this.alertPollingRate);
                
            }, delay);
        };

        // Check if map is ready (only if map is provided)
        if (map && map.map) {
            const mapboxMap = map.map;
            // If map is idle, fetch immediately, otherwise wait for idle
            if (mapboxMap.isStyleLoaded && mapboxMap.isStyleLoaded() && !mapboxMap.isMoving()) {
                performFirstFetch();
            } else {
                mapboxMap.once('idle', performFirstFetch);
            }
        } else {
            // No map provided, start immediately
            performFirstFetch();
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
        }

        // Stop polling
        if (this.alertPollingInterval) {
            clearInterval(this.alertPollingInterval);
            this.alertPollingInterval = null;
        }
    }

    /**
     * Fetches alerts from the API
     * @param {number} retryCount - Current retry attempt
     * @returns {Promise<Array>} Array of alerts or null if fetch fails
     */
    async fetchAlerts(retryCount = 0) {
        // Prevent concurrent fetches
        if (this.fetchInProgress) {
            return null;
        }
        
        this.fetchInProgress = true;
        
        try {
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
            
            const alertsPayload = Array.isArray(data) ? data : data.alerts;

            if (Array.isArray(alertsPayload)) {
                this.fetchRetryCount = 0; // Reset retry count on success
                this.lastSuccessfulFetch = new Date();
                // Update status to ISSUES (polling is working but SSE might not be)
                if (!this.sseConnected) {
                    this._updateConnectionStatus();
                }

                const normalizedAlerts = alertsPayload.map((alert) => this._normalizeAlert(alert));

                // Notify via callback if set
                if (this.onAlertsUpdated) {
                    this.onAlertsUpdated(normalizedAlerts);
                }

                return normalizedAlerts;
            } else {
                console.warn('[AlertService] fetchAlerts: Invalid response or no alerts', data);
                return null;
            }
        } catch (error) {
            console.error('[AlertService] Error fetching alerts:', {
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
                this.fetchInProgress = false; // Release lock before retry
                setTimeout(() => this.fetchAlerts(retryCount + 1), delay);
                return null; // Don't release lock at the end
            }
            return null;
        } finally {
            this.fetchInProgress = false;
        }
    }

    /**
     * Fetches watches from the Iowa Mesonet API
     * @returns {Promise<Array>} Array of watch features or null if fetch fails
     */
    async fetchWatches() {
        try {
            const timestamp = this._formatWatchTimestamp(new Date());
            const response = await fetch(`https://mesonet.agron.iastate.edu/json/spcwatch.py?ts=${timestamp}`, {
                signal: AbortSignal.timeout(5000)
            });
            const data = await response.json();

            if (data?.features) {
                // Notify via callback if set
                if (this.onWatchesUpdated) {
                    this.onWatchesUpdated(data.features);
                }
                return data.features;
            }
            return null;
        } catch (error) {
            console.error('[AlertService] Error fetching watches:', error);
            return null;
        }
    }

    /**
     * Formats a date for the watch API timestamp parameter
     */
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
     * CONNECTED: SSE connected
     * ISSUES: SSE disconnected but polling is working
     * OFFLINE: Both SSE and polling failing
     */
    _updateConnectionStatus(manualStatus = null) {
        let newStatus = 'OFFLINE';

        if (manualStatus) {
            newStatus = manualStatus;
            this.connectionStatus = newStatus;
            // Emit event for UI updates
            document.dispatchEvent(new CustomEvent('alertConnectionStatusChanged', {
                detail: { status: newStatus }
            }));
            return;
        }

        if (this.sseConnected) {
            newStatus = 'CONNECTED';
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
            // Emit event for UI updates
            document.dispatchEvent(new CustomEvent('alertConnectionStatusChanged', {
                detail: { status: newStatus }
            }));
        }
    }

    /**
     * Shows a notification for a new alert
     * @param {Object} alertData - Alert data from SSE or API
     * @param {boolean} isNew - Indicates if the alert is new or just an update
     */
    _showAlertNotification(alertData, isNew = true) {
        const rendered = renderAlert(alertData);
        
        // Don't send notifications for unknown alerts
        if (rendered.name === 'Unknown Alert') return;

        // Don't send notifications if user has disabled them for this alert type
        if (!rendered.notif.enabled) return;

        const hasValidGeometry = !!(alertData?.geometry && (
            (Array.isArray(alertData.geometry) && alertData.geometry.length > 0) ||
            (alertData.geometry.type && Array.isArray(alertData.geometry.coordinates) && alertData.geometry.coordinates.length > 0)
        ));

        let meta = '';
        var metaObj = [];
        if (rendered.props.is_tor_possible) {
            metaObj.push('<b style="color: #ff2121;">Tornado: Possible</b>');
        } else if (rendered.props.is_tor_observed) {
            metaObj.push('<b style="color: #ff2121;">Tornado: Observed</b>');
        } else if (rendered.props.is_tor_radar_indicated) {
            metaObj.push('<b style="color: #ff2121;">Tornado: Radar Indicated</b>');
        }
        if (rendered.props.is_waterspout_possible) {
            metaObj.push('<b style="color: #ff2121;">Waterspout: Possible</b>');
        }
        if (rendered.props.max_hail_size) {
            metaObj.push(`Max Hail: ${rendered.props.max_hail_size.toUpperCase()}`);
        }
        if (rendered.props.max_wind_gust) {
            metaObj.push(`Max Wind Gust: ${rendered.props.max_wind_gust.toUpperCase()}`);
        }

        meta = metaObj.join('<br>');

        const actions = [];
        if (hasValidGeometry) {
            actions.push({
                label: 'View on Map',
                onClick: () => this.onAlertNotificationViewMap?.(alertData)
            });
        }
        actions.push({
            label: 'View Product',
            onClick: () => this.onAlertNotificationViewProduct?.(alertData)
        });

        if (isNew) {
            new Notification(
                "New Alert",
                `A new ${rendered.name} has been issued.${meta ? `<br><br>${meta}` : ''}`,
                rendered.notif.icon,
                rendered.color,
                8000,
                actions,
                rendered.notif.soundFile
            );
        } else {
            const action = alertData.vtec?.actionCode || null;

            if (action !== 'NEW' || action !== 'CAN' || action !== 'EXP' || action !== 'ROU ') {
                let actionStr = '';
                switch (action) {
                    case 'CON':
                    case 'EXA':
                        actionStr = 'updated';
                        break;
                    case 'EXT':
                        actionStr = 'extended';
                        break;
                    case 'UPG':
                        actionStr = 'upgraded';
                        break;
                    case 'COR':
                        actionStr = 'corrected';
                        break;
                    default:
                        actionStr = 'updated';
                }

                new Notification(
                    "Alert Update",
                    `A ${rendered.name} has been ${actionStr}.${meta ? `<br><br>${meta}` : ''}`,
                    rendered.notif.icon,
                    rendered.color,
                    8000,
                    actions,
                    rendered.notif.soundFile
                );
            }
        }
    }

    _getAlertName(alertData) {
        return renderAlert(alertData)?.name || alertData?.productName || alertData?.properties?.product_type || "Unknown Alert";
    }

    _normalizeAlert(alertData) {
        if (!alertData || typeof alertData !== 'object') {
            return alertData;
        }

        const name = this._getAlertName(alertData);
        const issued = alertData.receivedAt || alertData.issued || null;
        const expiry = alertData.expiresAt || alertData.expiry || null;
        const sender = alertData.nwsOffice || alertData.sender || null;
        const properties = {
            ...(alertData.properties || {}),
            phenomena: alertData.properties?.phenomena ?? alertData.vtec?.phenomena,
            significance: alertData.properties?.significance ?? alertData.vtec?.significance,
            product_type: alertData.properties?.product_type ?? alertData.productCode
        };

        return {
            ...alertData,
            name,
            issued,
            expiry,
            sender,
            properties
        };
    }
}

export default AlertService;

// Test alert notification
/*
new AlertService()._showAlertNotification({
    productName: "Tornado Warning",
    message: "TORNADO...OBSERVED\nMAX HAIL SIZE...1.75 INCHES\nMAX WIND GUSTS...80 MPH",
    geometry: {
        type: "Polygon",
        coordinates: [[[ -97.0, 35.0 ], [ -97.5, 35.0 ], [ -97.5, 35.5 ], [ -97.0, 35.5 ], [ -97.0, 35.0 ]]]
    },
});
*/