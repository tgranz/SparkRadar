/*

> alerts.js
This module handles alert data fetching, SSE subscriptions, and notifications.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import Notification from "./ui/notification.js";
import { buildAlertDefaults } from "./ui/settings.js";

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

        // Callbacks
        this.onAlertsUpdated = null; // Callback when alerts are fetched: (alerts) => void
        this.onWatchesUpdated = null; // Callback when watches are fetched: (watches) => void
        this.onNewAlert = null; // Callback when a new alert is received via SSE: (alertData) => void
        
        if (this.isMobileDevice) {
            console.log('[AlertService] Mobile device detected - performance optimizations enabled');
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
        console.log(`[AlertService] Mobile detection: isMobile=${isMobile}, userAgent match=${mobileRegex.test(userAgent)}, touch=${isTouchDevice}, smallScreen=${isSmallScreen}`);
        
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
        this.eventSource = new EventSource(`${API_BASE_URL}/alerts/subscribe`);

        this.eventSource.onopen = () => {
            console.log('[AlertService] Connected to alert stream');
            this.sseReconnectAttempts = 0;
            this.sseConnected = true;
            this._updateConnectionStatus();
        };

        this.eventSource.onmessage = async (e) => {
            try {
                const data = JSON.parse(e.data);

                // Handle initial connection status
                if (data.status === 'connected') {
                    console.log('[AlertService] Alert subscription established');
                    this.sseConnected = true;
                    this._updateConnectionStatus();
                    // Fetch all existing alerts on first connection
                    await this.fetchAlerts();
                    return;
                }

                // Handle new alert notifications
                if (data.id && data.name) {
                    console.log('[AlertService] New alert received:', data.name);
                    this.sseConnected = true;
                    this._updateConnectionStatus();
                    
                    // Show notification for the new alert
                    this._showAlertNotification(data);
                    
                    // Notify via callback if set
                    if (this.onNewAlert) {
                        this.onNewAlert(data);
                    }
                    
                    // Wait a moment then fetch updated alerts
                    setTimeout(async () => {
                        await this.fetchAlerts();
                    }, 500);
                }
            } catch (error) {
                console.error('[AlertService] Error processing SSE message:', error);
            }
        };

        this.eventSource.onerror = (e) => {
            console.error('[AlertService] SSE connection error:', e);
            this.sseConnected = false;
            this._updateConnectionStatus("OFFLINE");
            this.eventSource.close();
            this.eventSource = null;

            // Attempt reconnection with exponential backoff
            if (this.sseReconnectAttempts < this.sseMaxReconnectAttempts) {
                this.sseReconnectAttempts++;
                const delay = this.sseReconnectDelay * Math.pow(1.5, this.sseReconnectAttempts - 1);
                console.log(`[AlertService] Reconnecting in ${Math.round(delay)}ms (attempt ${this.sseReconnectAttempts}/${this.sseMaxReconnectAttempts})`);
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
            console.log('[AlertService] Performing first alert fetch for polling');
            
            // Add a small delay on mobile to ensure network is ready
            const delay = this._isMobileDevice() ? 2000 : 500;
            
            setTimeout(() => {
                this.fetchAlerts();
                
                // Set up periodic polling
                this.alertPollingInterval = setInterval(() => {
                    this.fetchAlerts();
                }, this.alertPollingRate);
                
                console.log(`[AlertService] Alert polling started (${this.alertPollingRate / 1000}s interval)`);
            }, delay);
        };

        // Check if map is ready (only if map is provided)
        if (map && map.map) {
            const mapboxMap = map.map;
            // If map is idle, fetch immediately, otherwise wait for idle
            if (mapboxMap.isStyleLoaded && mapboxMap.isStyleLoaded() && !mapboxMap.isMoving()) {
                performFirstFetch();
            } else {
                console.log('[AlertService] Waiting for map idle before first alert fetch');
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
            console.log('[AlertService] Alert subscription closed');
        }

        // Stop polling
        if (this.alertPollingInterval) {
            clearInterval(this.alertPollingInterval);
            this.alertPollingInterval = null;
            console.log('[AlertService] Alert polling stopped');
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
            console.log('[AlertService] Fetch already in progress, skipping...');
            return null;
        }
        
        this.fetchInProgress = true;
        
        try {
            console.log('[AlertService] Fetching alerts from API... (attempt ' + (retryCount + 1) + ')');
            
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
            
            console.log('[AlertService] Response status:', response.status, response.statusText);
            
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
            
            console.log('[AlertService] fetchAlerts response:', { status: data.status, alertCount: data.alerts?.length || 0 });
            
            if (data.status === 'OK' && data.alerts) {
                this.fetchRetryCount = 0; // Reset retry count on success
                this.lastSuccessfulFetch = new Date();
                // Update status to ISSUES (polling is working but SSE might not be)
                if (!this.sseConnected) {
                    this._updateConnectionStatus();
                }

                // Notify via callback if set
                if (this.onAlertsUpdated) {
                    this.onAlertsUpdated(data.alerts);
                }

                return data.alerts;
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
                console.log(`[AlertService] Retrying fetch in ${delay}ms...`);
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
     * ONLINE: SSE connected
     * ISSUES: SSE disconnected but polling is working
     * OFFLINE: Both SSE and polling failing
     */
    _updateConnectionStatus(manualStatus = null) {
        let newStatus = 'OFFLINE';

        if (manualStatus) {
            newStatus = manualStatus;
            this.connectionStatus = newStatus;
            console.log(`[AlertService] Connection status updated: ${newStatus}`);
            // Emit event for UI updates
            document.dispatchEvent(new CustomEvent('alertConnectionStatusChanged', {
                detail: { status: newStatus }
            }));
            return;
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
            console.log(`[AlertService] Connection status updated: ${newStatus}`);
            // Emit event for UI updates
            document.dispatchEvent(new CustomEvent('alertConnectionStatusChanged', {
                detail: { status: newStatus }
            }));
        }
    }

    /**
     * Shows a notification for a new alert
     * @param {Object} alertData - Alert data from SSE or API
     */
    _showAlertNotification(alertData) {
        // Check if notifications are enabled for this alert type
        const alertSettings = this._getAlertSettings(alertData.name);
        if (!alertSettings.notify) {
            console.log(`[AlertService] Notifications disabled for ${alertData.name}`);
            return;
        }

        // Use custom colors from settings if available
        let alertColor = alertSettings.color;
        
        // If no custom colors, try to get from defaults
        if (!alertColor) {
            const defaultColor = buildAlertDefaults()[alertData.name];
            if (defaultColor && defaultColor.color) {
                alertColor = defaultColor.color;
            } else {
                alertColor = '#facc15'; // Fallback yellow
            }
        }

        // Determine icon based on alert type
        let icon = 'alert-triangle';
        let title = 'New Alert';
        
        const name = alertData.name?.toLowerCase() || '';
        
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

    /**
     * Gets alert settings from localStorage
     * @param {string} alertName - Name of the alert type
     * @returns {Object} Alert settings (enabled, notify, color)
     */
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
            console.error('[AlertService] Error getting alert settings:', error);
            return { enabled: true, notify: true, color: null };
        }
    }
}

export default AlertService;
