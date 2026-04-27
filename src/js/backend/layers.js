/*

> layers.js
This module manages alerts, watches, and outlooks display on the map.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import Popup from "../ui/popup.js";
import AlertService from "./alerts.js";
import AlertLayer from "../maplayers/alerts.js";
import WatchLayer from "../maplayers/watches.js";
import MesoscaleDiscussionLayer from "../maplayers/mesoscale_discussions.js";
import OutlookLayer from "../maplayers/outlooks.js";
import StormCentersLayer from "../maplayers/storm_centers.js";
import SurfaceAnalysisLayer from "../maplayers/surface_analysis.js";
import LightningLayer from "../maplayers/lightning.js";
import SpotterNetworkPositionsLayer from "../maplayers/spotter_network_positions.js";
import SpotterNetworkReportsLayer from "../maplayers/spotter_network_reports.js";
import MetarStationsLayer from "../maplayers/metar_stations.js";
import NWSStormReportsLayer from "../maplayers/nws_storm_reports.js";
import WildfiresLayer from "../maplayers/wildfires.js";
import TrafficCamerasLayer from "../maplayers/traffic_cameras.js";
import { applyLayerOrder, DEFAULT_LAYER_ORDER } from "../maplayers/layer_utils.js";

class Layers {
    constructor(mapInstance) {
        this.map = mapInstance;
        this.openPopup = null;  // Track currently open popup
        this.stormCenterHovered = false;  // Flag set when hovering over storm center marker
        this.spotterNetworkPositionHovered = false;  // Flag set when hovering over Spotter position marker
        this.spotterNetworkReportHovered = false; // Flag set when hovering over Spotter report marker
        this.metarStationHovered = false; // Flag set when hovering over METAR station marker
        this.nwsStormReportHovered = false; // Flag set when hovering over NWS storm report marker
        this.wildfireHovered = false; // Flag set when hovering over wildfire marker
        this.trafficCameraHovered = false; // Flag set when hovering over traffic camera marker

        // Initialize AlertService
        this.alertService = new AlertService();
        
        // Initialize layer classes
        this.alertLayer = new AlertLayer(mapInstance, this.alertService);
        this.watchLayer = new WatchLayer(mapInstance);
        this.mdLayer = new MesoscaleDiscussionLayer(mapInstance);
        this.outlookLayer = new OutlookLayer(mapInstance);
        this.stormCentersLayer = new StormCentersLayer(mapInstance);
        this.surfaceAnalysisLayer = new SurfaceAnalysisLayer(mapInstance);
        this.lightningLayer = new LightningLayer(mapInstance);
        this.spotterNetworkPositionsLayer = new SpotterNetworkPositionsLayer(mapInstance);
        this.spotterNetworkReportsLayer = new SpotterNetworkReportsLayer(mapInstance);
        this.metarStationsLayer = new MetarStationsLayer(mapInstance);
        this.nwsStormReportsLayer = new NWSStormReportsLayer(mapInstance);
        this.wildfiresLayer = new WildfiresLayer(mapInstance);
        this.trafficCamerasLayer = new TrafficCamerasLayer(mapInstance);

        // Layer ordering — load from localStorage or use default
        try {
            const saved = JSON.parse(localStorage.getItem('layerOrder') || 'null');
            const normalizedOrder = Array.isArray(saved)
                ? saved.filter((key) => DEFAULT_LAYER_ORDER.includes(key))
                : [];
            for (const key of DEFAULT_LAYER_ORDER) {
                if (!normalizedOrder.includes(key)) {
                    normalizedOrder.push(key);
                }
            }
            this.layerOrder = normalizedOrder;
        } catch {
            this.layerOrder = [...DEFAULT_LAYER_ORDER];
        }

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
            }, this.map.map.getLayer('road_area_pier') ? 'road_area_pier' : (this.map.map.getLayer('road_pier') ? 'road_pier' : undefined));
        });

        // Now load all layers
        this.displayAlerts();
        this.displayWatches();
        
        // Check localStorage for other layers that user may have previously enabled
        try {
            const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
            
            if (settings.mesoscaleDiscussionsEnabled) {
                this.fetchMesoscaleDiscussions();
            }
            
            if (settings.outlookEnabled) {
                this.fetchOutlooks();
            }
            
            if (settings.stormCentersEnabled) {
                this.fetchStormCenters();
            }

            if (settings.surfaceAnalysisEnabled) {
                this.fetchSurfaceAnalysis();
            }

            if (settings.lightningEnabled) {
                this.fetchLightning();
            }

            if (settings.spotterNetworkPositionsEnabled) {
                this.fetchSpotterNetworkPositions();
            }

            if (settings.spotterNetworkReportsEnabled) {
                this.fetchSpotterNetworkReports();
            }

            if (settings.metarStationsEnabled) {
                this.fetchMetarStations();
            }

            if (settings.wildfiresEnabled) {
                this.fetchWildfires();
            }

            if (settings.trafficCamerasEnabled) {
                this.fetchTrafficCameras();
            }

            if (settings.nwsTornadoReportsEnabled || settings.nwsWindReportsEnabled || settings.nwsHailReportsEnabled) {
                this.nwsStormReportsLayer.setEnabledTypes({
                    tornado: settings.nwsTornadoReportsEnabled === true,
                    wind: settings.nwsWindReportsEnabled === true,
                    hail: settings.nwsHailReportsEnabled === true
                });
                this.fetchNwsStormReports();
            }
        } catch (error) {
            console.error('Error loading initial layer settings:', error);
        }
        
        if (this.isMobileDevice) {
            console.log('[Layers] Mobile device detected - performance optimizations enabled (flashing disabled)');
        }

        // Set up AlertService callbacks
        this.alertService.onAlertsUpdated = (alerts) => {
            this.alertLayer.setAlerts(alerts);
            this._setLayerCache('alerts', alerts);
            this.displayAlerts();
            document.dispatchEvent(new CustomEvent('alertsUpdated', {
                detail: { count: alerts.length, alerts }
            }));
        };
        
        this.alertService.onWatchesUpdated = (watches) => {
            this.watchLayer.setWatches(watches);
            this._setLayerCache('watches', watches);
            this.displayWatches();
        };
        
        this.alertService.onNewAlert = (alertData) => {
            // Additional handling for new alerts can be added here if needed
        };

        this.alertService.onAlertNotificationViewMap = (alertData) => {
            this.alertLayer.zoomToAlert(alertData);
            this._selectNearestStationForAlert(alertData);
        };

        this.alertService.onAlertNotificationViewProduct = (alertData) => {
            this.alertLayer._showAlertDialog(alertData);
        };

        // Set up unified click handler for all layer types
        this._setupClickHandlers();
    }

    _selectNearestStationForAlert(alert) {
        if (!alert?.geometry) return;

        const geometry = alert.geometry;
        const coordinates = geometry.type && Array.isArray(geometry.coordinates)
            ? geometry.coordinates
            : geometry;

        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
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

        if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return;

        const centerLng = (minLng + maxLng) / 2;
        const centerLat = (minLat + maxLat) / 2;

        const stations = window.radarStationFeatures || [];
        let nearestId = null;
        let nearestDist = Infinity;

        for (const station of stations) {
            const id = station?.properties?.id;
            const coords = station?.geometry?.coordinates;
            if (!id || !Array.isArray(coords) || coords.length < 2) continue;
            if (!/^[KPR]?[A-Z]{3}$/.test(id)) continue;

            const toRad = (v) => v * (Math.PI / 180);
            const dLat = toRad(Number(coords[1]) - centerLat);
            const dLon = toRad(Number(coords[0]) - centerLng);
            const a = Math.sin(dLat / 2) ** 2
                + Math.sin(dLon / 2) ** 2 * Math.cos(toRad(centerLat)) * Math.cos(toRad(Number(coords[1])));
            const dist = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

            if (dist < nearestDist) {
                nearestDist = dist;
                nearestId = id;
            }
        }

        if (nearestId && typeof this.map?.callbacks?.onSelectStation === 'function') {
            this.map.callbacks.onSelectStation(nearestId);
        }
    }

    _getWindowLayerCache() {
        if (!window.cache) {
            window.cache = {};
        }
        if (!window.cache.layers) {
            window.cache.layers = {};
        }
        return window.cache.layers;
    }

    _setLayerCache(layerName, payload) {
        const layerCache = this._getWindowLayerCache();
        layerCache[layerName] = payload;
    }

    _getPopupLayerSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
            return {
                alertsEnabled: settings.alertsEnabled !== false,
                watchesEnabled: settings.watchesEnabled !== false,
                mesoscaleDiscussionsEnabled: settings.mesoscaleDiscussionsEnabled === true
            };
        } catch {
            return {
                alertsEnabled: true,
                watchesEnabled: true,
                mesoscaleDiscussionsEnabled: false
            };
        }
    }

    _setupClickHandlers() {
        const handleClick = (target) => (e) => {
            // Ignore clicks on UI elements
            if (e.originalEvent.target !== this.map?.map?.getCanvas()) return;
            
            // If hovering over storm center/spotter marker, don't open unified popup
            if (this.stormCenterHovered || this.spotterNetworkPositionHovered || this.spotterNetworkReportHovered || this.metarStationHovered || this.nwsStormReportHovered || this.wildfireHovered || this.trafficCameraHovered) {
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
            
            // If hovering over storm center/spotter marker, don't open unified popup
            if (this.stormCenterHovered || this.spotterNetworkPositionHovered || this.spotterNetworkReportHovered || this.metarStationHovered || this.nwsStormReportHovered || this.wildfireHovered || this.trafficCameraHovered) {
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

        const layerSettings = this._getPopupLayerSettings();
        const filteredAlertMatches = layerSettings.alertsEnabled ? (alertMatches || []) : [];
        const filteredWatchMatches = layerSettings.watchesEnabled ? (watchMatches || []) : [];
        const filteredMdMatches = layerSettings.mesoscaleDiscussionsEnabled ? (mdMatches || []) : [];

        // Check if we have any matches
        const hasAlerts = filteredAlertMatches.length > 0;
        const hasWatches = filteredWatchMatches.length > 0;
        const hasMDs = filteredMdMatches.length > 0;
        
        if (!hasAlerts && !hasWatches && !hasMDs) return;
        
        // Close any open popup before showing a new one
        this._closePopup();

        // Build sections for the popup
        const sections = [];

        if (hasAlerts) {
            sections.push(this.alertLayer.buildAlertPopupSection(filteredAlertMatches));
        }

        if (hasMDs) {
            sections.push(this.mdLayer.buildMDPopupSection(filteredMdMatches));
        }

        if (hasWatches) {
            sections.push(this.watchLayer.buildWatchPopupSection(filteredWatchMatches));
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
                if (filteredAlertMatches[index]) {
                    this.alertLayer._showAlertDialog(filteredAlertMatches[index]);
                }
            });
        });

        const watchItems = el.querySelectorAll('.popup-item[data-type="watch"]');
        watchItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const index = parseInt(item.dataset.index, 10);
                if (filteredWatchMatches[index]) {
                    this.watchLayer._showWatchDialog(filteredWatchMatches[index]);
                }
            });
        });

        const mdItems = el.querySelectorAll('.popup-item[data-type="md"]');
        mdItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const index = parseInt(item.dataset.index, 10);
                if (filteredMdMatches[index]) {
                    this.mdLayer._showMDDialog(filteredMdMatches[index]);
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
     * Get Spotter Network positions
     */
    get spotterNetworkPositions() {
        return this.spotterNetworkPositionsLayer.getSpotterNetworkPositions();
    }

    get spotterNetworkReports() {
        return this.spotterNetworkReportsLayer.getSpotterNetworkReports();
    }

    get metarStations() {
        return this.metarStationsLayer.getMetarStations();
    }

    get nwsStormReports() {
        return this.nwsStormReportsLayer.getNwsStormReports();
    }

    get wildfires() {
        return this.wildfiresLayer.getWildfires();
    }

    get trafficCameras() {
        return this.trafficCamerasLayer.getTrafficCameras();
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
        const alerts = await this.alertService.fetchAlerts(retryCount);
        if (Array.isArray(alerts)) {
            this._setLayerCache('alerts', alerts);
            this.displayAlerts();
        }
        return alerts;
    }

    /**
     * Fetches watches from the Iowa Mesonet API
     */
    async fetchWatches() {
        const watches = await this.alertService.fetchWatches();
        if (Array.isArray(watches)) {
            this.watchLayer.setWatches(watches);
            this._setLayerCache('watches', watches);
            this.displayWatches();
            return watches;
        }
        this._setLayerCache('watches', []);
        this.displayWatches();
        return watches;
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
            if (data && Array.isArray(data.features) && data.features.length > 0 && data.features[0].properties?.name !== 'NoArea') {
                this.mdLayer.setMesoscaleDiscussions(data.features);
                this._setLayerCache('mesoscaleDiscussions', data.features);
                this.displayMesoscaleDiscussions();
                console.log(`[Layers] Fetched ${data.features.length} mesoscale discussions`);
                return data.features;
            } else {
                console.warn('[Layers] No mesoscale discussions in response');
                this.mdLayer.setMesoscaleDiscussions([]);
                this._setLayerCache('mesoscaleDiscussions', []);
                this.displayMesoscaleDiscussions();
                return [];
            }
        } catch (error) {
            console.warn('[Layers] Error fetching mesoscale discussions:', error);
            this.mdLayer.setMesoscaleDiscussions([]);
            this._setLayerCache('mesoscaleDiscussions', []);
            this.displayMesoscaleDiscussions();
            return [];
        }
    }

    async fetchOutlooks() {
        try {
            const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
            const selections = [];
            const productsByDay = settings.outlookProducts || {};

            for (const day of [1, 2, 3]) {
                const dayProducts = productsByDay[day] || productsByDay[String(day)] || {};
                for (const type of ['cat', 'torn', 'wind', 'hail']) {
                    if (dayProducts[type] === true) {
                        selections.push({ day, type });
                    }
                }
            }

            if (selections.length === 0) {
                this._setLayerCache('outlook', null);
                this.outlookLayer.setOutlookData(null, null, 'cat');
                this.displayOutlook();
                return null;
            }

            const outlookData = await this.outlookLayer.fetchOutlookSelections(selections);
            if (outlookData?.features?.length) {
                this._setLayerCache('outlook', outlookData);
                this.displayOutlook();
            } else {
                this._setLayerCache('outlook', null);
                this.displayOutlook();
            }
            return outlookData;
        } catch (error) {
            console.error('[Layers] Error fetching outlooks:', error);
            this._setLayerCache('outlook', null);
            this.displayOutlook();
            return null;
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
        this.displayAlertsOnMap('main');
        if (this.map?.isSplit()) {
            this.displayAlertsOnMap('dual');
        }
    }

    displayWatches() {
        this.displayWatchesOnMap('main');
        if (this.map?.isSplit()) {
            this.displayWatchesOnMap('dual');
        }
    }

    displayMesoscaleDiscussions() {
        this.displayMesoscaleDiscussionsOnMap('main');
        if (this.map?.isSplit()) {
            this.displayMesoscaleDiscussionsOnMap('dual');
        }
    }

    displayOutlook() {
        this.displayOutlookOnMap('main');
        if (this.map?.isSplit()) {
            this.displayOutlookOnMap('dual');
        }
    }

    displayStormCenters() {
        this.displayStormCentersOnMap('main');
        if (this.map?.isSplit()) {
            this.displayStormCentersOnMap('dual');
        }
    }

    displaySurfaceAnalysis() {
        this.displaySurfaceAnalysisOnMap('main');
        if (this.map?.isSplit()) {
            this.displaySurfaceAnalysisOnMap('dual');
        }
    }

    displayLightning() {
        this.displayLightningOnMap('main');
        if (this.map?.isSplit()) {
            this.displayLightningOnMap('dual');
        }
    }

    displaySpotterNetworkPositions() {
        this.displaySpotterNetworkPositionsOnMap('main');
        if (this.map?.isSplit()) {
            this.displaySpotterNetworkPositionsOnMap('dual');
        }
    }

    displaySpotterNetworkReports() {
        this.displaySpotterNetworkReportsOnMap('main');
        if (this.map?.isSplit()) {
            this.displaySpotterNetworkReportsOnMap('dual');
        }
    }

    displayMetarStations() {
        this.displayMetarStationsOnMap('main');
        if (this.map?.isSplit()) {
            this.displayMetarStationsOnMap('dual');
        }
    }

    displayNwsStormReports() {
        this.displayNwsStormReportsOnMap('main');
        if (this.map?.isSplit()) {
            this.displayNwsStormReportsOnMap('dual');
        }
    }

    displayWildfires() {
        this.displayWildfiresOnMap('main');
        if (this.map?.isSplit()) {
            this.displayWildfiresOnMap('dual');
        }
    }

    displayTrafficCameras() {
        this.displayTrafficCamerasOnMap('main');
        if (this.map?.isSplit()) {
            this.displayTrafficCamerasOnMap('dual');
        }
    }

    displayAlertsOnMap(target = 'main') {
        this.alertLayer.displayAlertsOnMap(target);
    }

    displayWatchesOnMap(target = 'main') {
        this.watchLayer.displayWatchesOnMap(target);
    }

    displayMesoscaleDiscussionsOnMap(target = 'main') {
        this.mdLayer.displayMesoscaleDiscussionsOnMap(target);
    }

    displayOutlookOnMap(target = 'main') {
        this.outlookLayer.displayOutlookOnMap(target);
    }

    displayStormCentersOnMap(target = 'main') {
        this.stormCentersLayer.displayStormCentersOnMap(target);
    }

    displaySurfaceAnalysisOnMap(target = 'main') {
        this.surfaceAnalysisLayer.displaySurfaceAnalysisOnMap(target);
    }

    displayLightningOnMap(target = 'main') {
        this.lightningLayer.displayLightningOnMap(target);
    }

    displaySpotterNetworkPositionsOnMap(target = 'main') {
        this.spotterNetworkPositionsLayer.displaySpotterNetworkPositionsOnMap(target);
    }

    displaySpotterNetworkReportsOnMap(target = 'main') {
        this.spotterNetworkReportsLayer.displaySpotterNetworkReportsOnMap(target);
    }

    displayMetarStationsOnMap(target = 'main') {
        this.metarStationsLayer.displayMetarStationsOnMap(target);
    }

    displayNwsStormReportsOnMap(target = 'main') {
        this.nwsStormReportsLayer.displayNwsStormReportsOnMap(target);
    }

    displayWildfiresOnMap(target = 'main') {
        this.wildfiresLayer.displayWildfiresOnMap(target);
    }

    displayTrafficCamerasOnMap(target = 'main') {
        this.trafficCamerasLayer.displayTrafficCamerasOnMap(target);
    }

    // Display on dual map methods
    displayAlertsOnDualMap() {
        this.displayAlertsOnMap('dual');
    }

    displayWatchesOnDualMap() {
        this.displayWatchesOnMap('dual');
    }

    displayMesoscaleDiscussionsOnDualMap() {
        this.displayMesoscaleDiscussionsOnMap('dual');
    }

    displayOutlookOnDualMap() {
        this.displayOutlookOnMap('dual');
    }

    displayStormCentersOnDualMap() {
        this.displayStormCentersOnMap('dual');
    }

    displaySurfaceAnalysisOnDualMap() {
        this.displaySurfaceAnalysisOnMap('dual');
    }

    displayLightningOnDualMap() {
        this.displayLightningOnMap('dual');
    }

    displaySpotterNetworkPositionsOnDualMap() {
        this.displaySpotterNetworkPositionsOnMap('dual');
    }

    displaySpotterNetworkReportsOnDualMap() {
        this.displaySpotterNetworkReportsOnMap('dual');
    }

    displayMetarStationsOnDualMap() {
        this.displayMetarStationsOnMap('dual');
    }

    displayNwsStormReportsOnDualMap() {
        this.displayNwsStormReportsOnMap('dual');
    }

    displayWildfiresOnDualMap() {
        this.displayWildfiresOnMap('dual');
    }

    displayTrafficCamerasOnDualMap() {
        this.displayTrafficCamerasOnMap('dual');
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

    clearSurfaceAnalysis(target = 'main') {
        this.surfaceAnalysisLayer.clearSurfaceAnalysis(target);
    }

    clearLightning(target = 'main') {
        this.lightningLayer.clearLightning(target);
    }

    clearSpotterNetworkPositions(target = 'main') {
        this.spotterNetworkPositionsLayer.clearSpotterNetworkPositions(target);
    }

    clearSpotterNetworkReports(target = 'main') {
        this.spotterNetworkReportsLayer.clearSpotterNetworkReports(target);
    }

    clearMetarStations(target = 'main') {
        this.metarStationsLayer.clearMetarStations(target);
    }

    clearNwsStormReports(target = 'main') {
        this.nwsStormReportsLayer.clearNwsStormReports(target);
    }

    clearWildfires(target = 'main') {
        this.wildfiresLayer.clearWildfires(target);
    }

    clearTrafficCameras(target = 'main') {
        this.trafficCamerasLayer.clearTrafficCameras(target);
    }

    // Outlook methods - delegate to OutlookLayer
    async fetchOutlook(day, type = 'cat') {
        const outlookData = await this.outlookLayer.fetchOutlook(day, type);
        if (outlookData?.features) {
            this._setLayerCache('outlook', outlookData);
            this.displayOutlook();
        } else {
            this._setLayerCache('outlook', null);
            this.displayOutlook();
        }
        return outlookData;
    }

    // Storm Centers methods - delegate to StormCentersLayer
    async fetchStormCenters() {
        const result = await this.stormCentersLayer.fetchStormCenters();
        this._setLayerCache('stormCenters', this.stormCentersLayer.getStormCenters());
        this.displayStormCenters();
        return result;
    }

    async fetchSurfaceAnalysis() {
        const result = await this.surfaceAnalysisLayer.fetchSurfaceAnalysis();
        this._setLayerCache('surfaceAnalysis', result);
        this.displaySurfaceAnalysis();
        return result;
    }

    async fetchLightning() {
        const result = await this.lightningLayer.fetchLightning();
        this._setLayerCache('lightning', result);
        this.displayLightning();
        return result;
    }

    async fetchSpotterNetworkPositions() {
        const result = await this.spotterNetworkPositionsLayer.fetchSpotterNetworkPositions();
        this._setLayerCache('spotterNetworkPositions', result);
        this.displaySpotterNetworkPositions();
        return result;
    }

    async fetchSpotterNetworkReports() {
        const result = await this.spotterNetworkReportsLayer.fetchSpotterNetworkReports();
        this._setLayerCache('spotterNetworkReports', result);
        this.displaySpotterNetworkReports();
        return result;
    }

    async fetchMetarStations() {
        const result = await this.metarStationsLayer.fetchMetarStations();
        this._setLayerCache('metarStations', result);
        this.displayMetarStations();
        return result;
    }

    async fetchNwsStormReports() {
        const result = await this.nwsStormReportsLayer.fetchNwsStormReports();
        this._setLayerCache('nwsStormReports', result);
        this.displayNwsStormReports();
        return result;
    }

    async fetchWildfires() {
        const result = await this.wildfiresLayer.fetchWildfires();
        this._setLayerCache('wildfires', result);
        this.displayWildfires();
        return result;
    }

    async fetchTrafficCameras() {
        const result = await this.trafficCamerasLayer.fetchTrafficCameras();
        this._setLayerCache('trafficCameras', result);
        this.displayTrafficCameras();
        return result;
    }

    // Layer ordering
    applyLayerOrder(target = 'main') {
        const map = target === 'main' ? this.map?.map : this.map?.dualMap;
        if (!map) return;
        applyLayerOrder(map, this.layerOrder, target);
    }

    setLayerOrder(order) {
        const normalizedOrder = Array.isArray(order)
            ? order.filter((key) => DEFAULT_LAYER_ORDER.includes(key))
            : [];
        for (const key of DEFAULT_LAYER_ORDER) {
            if (!normalizedOrder.includes(key)) {
                normalizedOrder.push(key);
            }
        }
        this.layerOrder = normalizedOrder;
        try { localStorage.setItem('layerOrder', JSON.stringify(this.layerOrder)); } catch {}
        this.applyLayerOrder('main');
        if (this.map?.isSplit()) this.applyLayerOrder('dual');
    }

    getLayerOrder() {
        return this.layerOrder;
    }
}

export default Layers;
