/*

> layers.js
This module manages alerts, watches, and outlooks display on the map.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import Popup from "./ui/popup.js";
import AlertService from "./alerts.js";
import AlertLayer from "./layers/alerts.js";
import WatchLayer from "./layers/watches.js";
import MesoscaleDiscussionLayer from "./layers/mesoscale_discussions.js";
import OutlookLayer from "./layers/outlooks.js";
import StormCentersLayer from "./layers/storm_centers.js";

class Layers {
    constructor(mapInstance) {
        this.map = mapInstance;
        this.openPopup = null;  // Track currently open popup
        this.stormCenterHovered = false;  // Flag set when hovering over storm center marker

        // Initialize AlertService
        this.alertService = new AlertService();
        
        // Initialize layer classes
        this.alertLayer = new AlertLayer(mapInstance, this.alertService);
        this.watchLayer = new WatchLayer(mapInstance);
        this.mdLayer = new MesoscaleDiscussionLayer(mapInstance);
        this.outlookLayer = new OutlookLayer(mapInstance);
        this.stormCentersLayer = new StormCentersLayer(mapInstance);

        // Mobile device detection
        this.isMobileDevice = this.alertService.isMobileDevice;

        // Create empty webgl layer as a placeholder
        this.map.map.on('load', () => {
            // Add an empty GeoJSON source
            this.map.map.addSource('empty-source', {
                'type': 'geojson',
                'data': {
                    'type': 'FeatureCollection',
                    'features': [] // Empty features array
                }
            });

            // Add a layer (e.g., a circle layer) using that source
            this.map.map.addLayer({
                'id': 'radar-webgl',
                'type': 'circle',
                'source': 'empty-source'
            }, 'Pier');
        });

        // Now load all layers
        this.displayAlerts();
        this.displayWatches();
        this.displayMesoscaleDiscussions();
        this.displayOutlook();
        this.displayStormCenters();
        
        if (this.isMobileDevice) {
            console.log('[Layers] Mobile device detected - performance optimizations enabled (flashing disabled)');
        }

        // Set up AlertService callbacks
        this.alertService.onAlertsUpdated = (alerts) => {
            this.alertLayer.setAlerts(alerts);
            this.displayAlerts();
            document.dispatchEvent(new CustomEvent('alertsUpdated', {
                detail: { count: alerts.length, alerts }
            }));
        };
        
        this.alertService.onWatchesUpdated = (watches) => {
            this.watchLayer.setWatches(watches);
            this.displayWatches();
        };
        
        this.alertService.onNewAlert = (alertData) => {
            // Additional handling for new alerts can be added here if needed
        };

        // Set up unified click handler for all layer types
        this._setupClickHandlers();
    }

    _setupClickHandlers() {
        const handleClick = (target) => (e) => {
            // Ignore clicks on UI elements
            if (e.originalEvent.target !== this.map?.map?.getCanvas()) return;
            
            // If hovering over storm center, don't open popup
            if (this.stormCenterHovered) {
                return;
            }
            
            // If a popup is already open, close it and don't open a new one
            if (this.openPopup) {
                this._closePopup();
                return;
            }
            
            const lngLat = e.lngLat;
            const point2d = [lngLat.lng, lngLat.lat];
            
            // Get matches from all layer types
            const alertResult = this.alertLayer._handleAlertClick(target, e);
            const alertMatches = alertResult.alertMatches;
            const watchMatches = this.watchLayer._getWatchesAtPoint(point2d);
            const mdMatches = this.mdLayer._getMesoscaleDiscussionsAtPoint(point2d);
            
            // Close popup if no matches found
            if (!alertMatches || alertMatches.length === 0) {
                if (!watchMatches || watchMatches.length === 0) {
                    if (!mdMatches || mdMatches.length === 0) {
                        this._closePopup();
                        return;
                    }
                }
            }
            
            // Show unified popup if any matches found (storm centers handled separately)
            this._showUnifiedPopup(target, lngLat, alertMatches, watchMatches, mdMatches);
        };

        if (this.map?.map) {
            this.map.map.on('click', handleClick('main'));
        }
    }

    /**
     * Set up click handlers for the dual map
     * Called by map.js when dual map is initialized
     */
    setupDualMapClickHandlers() {
        const handleClick = (target) => (e) => {
            // Ignore clicks on UI elements
            if (e.originalEvent.target !== this.map?.dualMap?.getCanvas()) return;
            
            // If hovering over storm center, don't open popup
            if (this.stormCenterHovered) {
                return;
            }
            
            // If a popup is already open, close it and don't open a new one
            if (this.openPopup) {
                this._closePopup();
                return;
            }
            
            const lngLat = e.lngLat;
            const point2d = [lngLat.lng, lngLat.lat];
            
            // Get matches from all layer types
            const alertResult = this.alertLayer._handleAlertClick(target, e);
            const alertMatches = alertResult.alertMatches;
            const watchMatches = this.watchLayer._getWatchesAtPoint(point2d);
            const mdMatches = this.mdLayer._getMesoscaleDiscussionsAtPoint(point2d);
            
            // Close popup if no matches found
            if (!alertMatches || alertMatches.length === 0) {
                if (!watchMatches || watchMatches.length === 0) {
                    if (!mdMatches || mdMatches.length === 0) {
                        this._closePopup();
                        return;
                    }
                }
            }
            
            // Show unified popup if any matches found (storm centers handled separately)
            this._showUnifiedPopup(target, lngLat, alertMatches, watchMatches, mdMatches);
        };

        if (this.map?.dualMap) {
            // Remove old handler if exists
            if (this.alertLayer.alertPopupClickHandlers.dual) {
                this.map.dualMap.off('click', this.alertLayer.alertPopupClickHandlers.dual);
            }
            // Set up new handler
            this.alertLayer.alertPopupClickHandlers.dual = handleClick('dual');
            this.map.dualMap.on('click', this.alertLayer.alertPopupClickHandlers.dual);
        }
    }

    /**
     * Get alertPopupClickHandlers for backwards compatibility
     */
    get alertPopupClickHandlers() {
        return this.alertLayer.alertPopupClickHandlers;
    }

    _showUnifiedPopup(target, lngLat, alertMatches, watchMatches, mdMatches) {
        const mainMap = this.map?.map;
        const dualMap = this.map?.dualMap;
        const map = target === 'main' ? mainMap : dualMap;
        if (!map) return;

        // Check if we have any matches
        const hasAlerts = alertMatches && alertMatches.length > 0;
        const hasWatches = watchMatches && watchMatches.length > 0;
        const hasMDs = mdMatches && mdMatches.length > 0;
        
        if (!hasAlerts && !hasWatches && !hasMDs) return;
        
        // Close any open popup before showing a new one
        this._closePopup();

        // Build sections for the popup
        const sections = [];

        if (hasAlerts) {
            sections.push(this.alertLayer.buildAlertPopupSection(alertMatches));
        }

        if (hasMDs) {
            sections.push(this.mdLayer.buildMDPopupSection(mdMatches));
        }

        if (hasWatches) {
            sections.push(this.watchLayer.buildWatchPopupSection(watchMatches));
        }

        const html = sections.join('');
        const popup = new Popup(html);
        this.openPopup = popup;  // Track the open popup
        
        const el = popup.get();
        el.style.position = 'absolute';
        el.style.transform = 'translate(-50%, -100%)';
        el.style.pointerEvents = 'auto';
        el.style.zIndex = '2000';
        
        // Prevent clicks anywhere in the popup from reaching the map
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
        });
        
        popup.addToMap(map);
        popup.setLngLat(lngLat);

        // Set up click listeners for different item types
        const alertItems = el.querySelectorAll('.popup-item[data-type="alert"]');
        alertItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const index = parseInt(item.dataset.index, 10);
                if (alertMatches[index]) {
                    this.alertLayer._showAlertDialog(alertMatches[index]);
                }
            });
        });

        const watchItems = el.querySelectorAll('.popup-item[data-type="watch"]');
        watchItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const index = parseInt(item.dataset.index, 10);
                if (watchMatches[index]) {
                    this.watchLayer._showWatchDialog(watchMatches[index]);
                }
            });
        });

        const mdItems = el.querySelectorAll('.popup-item[data-type="md"]');
        mdItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const index = parseInt(item.dataset.index, 10);
                if (mdMatches[index]) {
                    this.mdLayer._showMDDialog(mdMatches[index]);
                }
            });
        });

        // Position popup at the click location
        popup.setLngLat(lngLat);

        // Add handlers to update popup position when map moves or resizes
        const updatePopupPosition = () => {
            if (this.openPopup === popup) {
                popup.setLngLat(lngLat);
            }
        };
        
        map.on('move', updatePopupPosition);
        map.on('resize', updatePopupPosition);
        
        // Store handlers for cleanup
        this.popupMoveHandler = updatePopupPosition;
        this.popupMoveMap = map;
    }

    /**
     * Close any open popup
     */
    _closePopup() {
        if (this.openPopup) {
            this.openPopup.removeFromMap();
            this.openPopup = null;
        }
        
        // Clean up move/resize handlers
        if (this.popupMoveHandler && this.popupMoveMap) {
            this.popupMoveMap.off('move', this.popupMoveHandler);
            this.popupMoveMap.off('resize', this.popupMoveHandler);
        }
        this.popupMoveHandler = null;
        this.popupMoveMap = null;
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

    /**
     * Get alerts array
     */
    get alerts() {
        return this.alertLayer.getAlerts();
    }

    /**
     * Get watches array
     */
    get watches() {
        return this.watchLayer.getWatches();
    }

    /**
     * Get mesoscale discussions array
     */
    get mesoscaleDiscussions() {
        return this.mdLayer.getMesoscaleDiscussions();
    }

    /**
     * Get storm centers array
     */
    get stormCenters() {
        return this.stormCentersLayer.getStormCenters();
    }

    /**
     * Get current outlook day
     */
    get currentOutlookDay() {
        return this.outlookLayer.getCurrentOutlookDay();
    }

    /**
     * Get outlook data
     */
    get outlookData() {
        return this.outlookLayer.getOutlookData();
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
     * Handle alert click - delegates to AlertLayer
     * For backwards compatibility with map.js
     */
    _handleAlertClick(target, event) {
        const point = [event.lngLat.lng, event.lngLat.lat];
        const alertResult = this.alertLayer._handleAlertClick(target, event);
        const alertMatches = alertResult.alertMatches;
        const watchMatches = this.watchLayer._getWatchesAtPoint(point);
        const mdMatches = this.mdLayer._getMesoscaleDiscussionsAtPoint(point);
        this._showUnifiedPopup(target, event.lngLat, alertMatches, watchMatches, mdMatches);
        return alertResult;
    }

    /**
     * Clear alert popup - delegates to AlertLayer
     * For backwards compatibility with map.js
     */
    _clearAlertPopup(target) {
        return this.alertLayer._clearAlertPopup(target);
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
            this.watchLayer.setWatches(watches);
            this.displayWatches();
        }
    }

    /**
     * Fetches mesoscale discussions from the SPC API
     */
    async fetchMesoscaleDiscussions() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.error('[Layers] Mesoscale discussion fetch timeout');
                controller.abort();
            }, 10000);

            const response = await fetch(
                'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/spc_mesoscale_discussion/MapServer/0/query?where=1%3D1&outFields=*&f=geojson',
                { signal: controller.signal }
            );
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (data && data.features && Array.isArray(data.features) && data.features[0].properties.name != 'NoArea') {
                this.mdLayer.setMesoscaleDiscussions(data.features);
                this.displayMesoscaleDiscussions();
                console.log(`[Layers] Fetched ${data.features.length} mesoscale discussions`);
            } else {
                console.warn('[Layers] No mesoscale discussions in response');
                this.mdLayer.setMesoscaleDiscussions([]);
            }
        } catch (error) {
            console.error('[Layers] Error fetching mesoscale discussions:', error);
            this.mdLayer.setMesoscaleDiscussions([]);
        }
    }

    async fetchOutlooks() {
        try {
            const outlookData = await this.outlookLayer.fetchOutlook(this.currentOutlookDay);
            if (outlookData) {
                this.outlookLayer.setOutlookData(outlookData);
                this.displayOutlook();
            }
        } catch (error) {
            console.error('[Layers] Error fetching outlooks:', error);
        }
    }

    /**
     * Formats a date for the watch API timestamp parameter
     */
    _formatWatchTimestamp(date) {
        return this.alertService._formatWatchTimestamp(date);
    }

    // Display methods - delegate to layer classes
    displayAlerts() {
        this.alertLayer.displayAlerts();
    }

    displayWatches() {
        this.watchLayer.displayWatches();
    }

    displayMesoscaleDiscussions() {
        this.mdLayer.displayMesoscaleDiscussions();
    }

    displayOutlook() {
        this.outlookLayer.displayOutlook();
    }

    displayStormCenters() {
        this.stormCentersLayer.displayStormCenters();
    }

    // Display on dual map methods
    displayAlertsOnDualMap() {
        this.alertLayer.displayAlertsOnDualMap();
    }

    displayWatchesOnDualMap() {
        this.watchLayer.displayWatchesOnDualMap();
    }

    displayMesoscaleDiscussionsOnDualMap() {
        this.mdLayer.displayMesoscaleDiscussionsOnDualMap();
    }

    displayOutlookOnDualMap() {
        this.outlookLayer.displayOutlookOnDualMap();
    }

    displayStormCentersOnDualMap() {
        this.stormCentersLayer.displayStormCentersOnDualMap();
    }

    // Clear methods - delegate to layer classes
    clearAlerts(target = 'main') {
        this.alertLayer.clearAlerts(target);
    }

    clearWatches(target = 'main') {
        this.watchLayer.clearWatches(target);
    }

    clearMesoscaleDiscussions(target = 'main') {
        this.mdLayer.clearMesoscaleDiscussions(target);
    }

    clearOutlook(target = 'main') {
        this.outlookLayer.clearOutlook(target);
    }

    clearStormCenters(target = 'main') {
        this.stormCentersLayer.clearStormCenters(target);
    }

    // Outlook methods - delegate to OutlookLayer
    async fetchOutlook(day) {
        return await this.outlookLayer.fetchOutlook(day);
    }

    // Storm Centers methods - delegate to StormCentersLayer
    async fetchStormCenters() {
        return await this.stormCentersLayer.fetchStormCenters();
    }
}

export default Layers;
