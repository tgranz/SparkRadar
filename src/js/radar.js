/*

> radar.js
This module handles the radar on a map.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import { checkLatestL2RadarFile, checkLatestL3RadarFile, loadLatestL2RadarFile, loadLatestL3RadarFile, loadRadarFileFromUrl } from '../parse/fetch.js';
import { Level2Radar } from '../parse/level2/src/index.js';
import nexradLevel3Data from '../parse/level3/src/browser.js';
import RadarCache from './radar_cache.js';

// Helper function to yield to the browser between processing iterations
const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

const EARTH_RADIUS = 6371000;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// Set to true to use a flat-Earth approximation instead of the full spherical
// projection. The approximation is ~4× faster with a maximum positional error
// of roughly 5 km at 250 km range — imperceptible at radar gate resolution.
const USE_FLAT_EARTH = false;

class Radar {
    // Constructor function
    constructor() {
        this.latestRadarFiles = { L2: null, L3: {} };
        this.radarStation = 'KIWX'
        this.radarGeoJson = null;
        this.workerSupported = typeof Worker !== 'undefined';

        let savedCacheSlots = 6;
        let savedCacheSizeGB = 0;
        try {
            const settings = JSON.parse(localStorage.getItem('settings') || '{}');
            if (Number.isFinite(settings.cacheMaxSlots) && settings.cacheMaxSlots > 0) {
                savedCacheSlots = settings.cacheMaxSlots;
            }
            if (Number.isFinite(settings.cacheMaxSizeGB) && settings.cacheMaxSizeGB >= 0) {
                savedCacheSizeGB = settings.cacheMaxSizeGB;
            }
        } catch {
            // Ignore malformed settings and keep defaults.
        }

        this.cache = new RadarCache(savedCacheSlots, savedCacheSizeGB);
    }

    _inferLevelFromProduct(product) {
        if (!product) return 'L3';
        const upper = product.toUpperCase();
        if (upper === 'REF' || upper === 'VEL' || upper === 'CC' || upper === 'KDP' || upper === 'SW' || upper === 'ZDR') {
            return 'L2';
        }
        return 'L3';
    }

    _getLevel3Metadata(radar) {
        const productDescription = radar?.productDescription;
        if (!productDescription) return null;

        const dateValue = Number(productDescription.volumeScanDate ?? productDescription.productDate);
        const timeValue = Number(productDescription.volumeScanTime ?? productDescription.productTime);
        let timeIso = null;
        if (Number.isFinite(dateValue) && Number.isFinite(timeValue)) {
            // NEXRAD uses "days since Dec 31, 1969" where day 1 = Jan 1, 1970
            // Add 1 hour offset to correct for NEXRAD timestamp quirk
            const epochMs = ((dateValue - 1) * 86400 + timeValue) * 1000 + 3600000;
            timeIso = new Date(epochMs).toISOString();
            console.log(`[Level3 Timestamp] date=${dateValue}, time=${timeValue}, epochMs=${epochMs}, iso=${timeIso}`);
        }

        const elevationAngle = Number.isFinite(productDescription.elevationAngle)
            ? productDescription.elevationAngle
            : null;

        const vcp = Number.isFinite(productDescription.vcp)
            ? productDescription.vcp
            : null;

        return { timeIso, elevationAngle, vcp };
    }

    _isLevel3Layer(layer) {
        if (!layer || typeof layer !== 'string') {
            return false;
        }
        return this._inferLevelFromProduct(layer) === 'L3';
    }

    _getLevel3TiltIndex(layer) {
        if (!layer || typeof layer !== 'string') return null;
        const match = layer.toUpperCase().match(/^N(\d)[A-Z]$/);
        if (!match) return null;
        return Number(match[1]);
    }

    _getCacheTiltKey(layer, options = {}, metadata = null) {
        if (this._isLevel3Layer(layer)) {
            const l3Tilt = this._getLevel3TiltIndex(layer);
            if (Number.isFinite(l3Tilt)) return l3Tilt;
            return 0;
        }

        if (Number.isFinite(options?.elevation)) {
            return options.elevation;
        }

        if (metadata && Number.isFinite(metadata.elevationAngle)) {
            return metadata.elevationAngle;
        }

        return 1;
    }

    // Assistant functions
    _createRadarProjector(radarLat, radarLon) {
        const lat1 = radarLat * DEG_TO_RAD;
        const lon1 = radarLon * DEG_TO_RAD;
        const sinLat1 = Math.sin(lat1);
        const cosLat1 = Math.cos(lat1);

        if (USE_FLAT_EARTH) {
            const latScale = RAD_TO_DEG / EARTH_RADIUS;
            const lonScale = RAD_TO_DEG / (EARTH_RADIUS * cosLat1);
            return (sinAz, cosAz, distanceMeters) => [
                radarLon + distanceMeters * sinAz * lonScale,
                radarLat + distanceMeters * cosAz * latScale
            ];
        }

        // Spherical (great-circle) projection.
        // sin/cos of angular distance depend only on range, not azimuth.
        // Cache them so each unique distance is computed once across all radials.
        const rangeCache = new Map();
        return (sinAz, cosAz, distanceMeters) => {
            let entry = rangeCache.get(distanceMeters);
            if (entry === undefined) {
                const dR = distanceMeters / EARTH_RADIUS;
                entry = { s: Math.sin(dR), c: Math.cos(dR) };
                rangeCache.set(distanceMeters, entry);
            }
            const lat2 = Math.asin(sinLat1 * entry.c + cosLat1 * entry.s * cosAz);
            const lon2 = lon1 + Math.atan2(
                sinAz * entry.s * cosLat1,
                entry.c - sinLat1 * Math.sin(lat2)
            );
            return [lon2 * RAD_TO_DEG, lat2 * RAD_TO_DEG];
        };
    }

    _buildPolygon(project, sinAz1, cosAz1, sinAz2, cosAz2, r1, r2) {
        const p1 = project(sinAz1, cosAz1, r1);
        const p2 = project(sinAz2, cosAz2, r1);
        const p3 = project(sinAz2, cosAz2, r2);
        const p4 = project(sinAz1, cosAz1, r2);
        return [p1, p2, p3, p4];
    }

    _createMeshBuilder(includeGeojson) {
        const mesh = [];
        const features = includeGeojson ? [] : null;
        let minLng = Infinity;
        let minLat = Infinity;
        let maxLng = -Infinity;
        let maxLat = -Infinity;

        const updateBounds = (point) => {
            const lng = point[0];
            const lat = point[1];
            minLng = Math.min(minLng, lng);
            minLat = Math.min(minLat, lat);
            maxLng = Math.max(maxLng, lng);
            maxLat = Math.max(maxLat, lat);
        };

        const pushQuad = (quad, value) => {
            for (let i = 0; i < 4; i++) {
                updateBounds(quad[i]);
            }

            const encodedValue = value === 'rf' ? NaN : value;
            mesh.push(
                quad[0][0], quad[0][1],
                quad[1][0], quad[1][1],
                quad[2][0], quad[2][1],
                quad[3][0], quad[3][1],
                encodedValue
            );

            if (features) {
                const closed = [quad[0], quad[1], quad[2], quad[3], quad[0]];
                features.push({
                    type: 'Feature',
                    properties: { val: value === 'rf' ? 'rf' : value },
                    geometry: {
                        type: 'Polygon',
                        coordinates: [closed]
                    }
                });
            }
        };

        const finalize = () => {
            const meshData = new Float32Array(mesh);
            const bounds = Number.isFinite(minLng) ? [minLng, minLat, maxLng, maxLat] : null;
            const geojson = features ? { type: 'FeatureCollection', features } : null;
            return { meshData, bounds, geojson };
        };

        return { pushQuad, finalize };
    }

    async _fetchRadarData(station, options = {}, rawDataOverride = null) {
        // Fetch the latest radar file for the station
        const radarFile = rawDataOverride ? { data: rawDataOverride } : await loadLatestL2RadarFile(station);
        const rawData = radarFile.data;

        // Create a Level2Radar instance
        const radar = new Level2Radar(rawData);

        // Set the desired elevation angle (in whole numbers starting at 1)
        const elevations = radar.listElevations();
        if (options.elevation && elevations.includes(options.elevation)) {
            radar.setElevation(options.elevation);
        } else {
            radar.setElevation(elevations[0] || 1);
        }

        // Load the header data (for elevation angle, vcp, etc.)
        const recordHeader = radar.getHeader(0);
        
        // Get file header for timestamp (modified_julian_date is more reliable)
        const fileHeader = radar.header;

        // Combine data for return
        const header = {
            ...recordHeader,
            modified_julian_date: fileHeader.modified_julian_date,
            milliseconds: fileHeader.milliseconds
        };

        // Find the radar location
        const radarLocation = [recordHeader.volume.latitude, recordHeader.volume.longitude];

        // Determine the radar extent
        const extent = recordHeader.radial_length;

        return { radar, radarLocation, extent, header };
    }

    async _fetchLevel3RadarData(station, product, rawDataOverride = null) {
        const radarFile = rawDataOverride ? { data: rawDataOverride } : await loadLatestL3RadarFile(station, product);
        const rawData = radarFile.data;
        const radar = nexradLevel3Data(rawData);

        const radarLat = radar.productDescription?.latitude;
        const radarLon = radar.productDescription?.longitude;
        if (radarLat == null || radarLon == null) {
            throw new Error('Missing radar location in Level 3 product description.');
        }

        return { radar, radarLocation: [radarLat, radarLon] };
    }

    _processRadarDataInWorker(arrayBuffer, layer, options = {}) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(new URL('./workers/radar_worker.js', import.meta.url), { type: 'module' });

            const cleanup = () => {
                worker.terminate();
            };

            worker.onmessage = (event) => {
                const { type, geojson, meshData, bounds, metadata, message } = event.data || {};
                if (type === 'result') {
                    cleanup();
                    resolve({ geojson, meshData, bounds, metadata });
                } else if (type === 'error') {
                    cleanup();
                    reject(new Error(message || 'Radar worker failed'));
                }
            };

            worker.onerror = (error) => {
                cleanup();
                reject(error);
            };

            worker.postMessage({ type: 'process', arrayBuffer, layer, options }, [arrayBuffer]);
        });
    }

    async _processRadarData(radar, radarLocation, extent, layer, options = {}) {
        // Get the appropriate data based on the layer type
        let radarData;
        if (layer === 'REF') {
            radarData = radar.getHighresReflectivity();
        } else if (layer === 'VEL') {
            radarData = radar.getHighresVelocity();
            // If all objects in list are undefined, go up in elevation levels to find data
            // Not sure why this is a thing...
            if (Array.isArray(radarData) && radarData.every(item => item === undefined)) {
                let elevationLevels = radar.listElevations().sort((a, b) => a - b);
                let currentIndex = elevationLevels.indexOf(radar.elevation);
                while (currentIndex + 1 < elevationLevels.length) {
                    currentIndex += 1;
                    radar.setElevation(elevationLevels[currentIndex]);
                    radarData = radar.getHighresVelocity();
                    if (Array.isArray(radarData) && !radarData.every(item => item === undefined)) {
                        console.log(`Velocity data not found at requested elevation. Using elevation level ${elevationLevels[currentIndex]} instead.`);
                        break;
                    }
                }
            }
        } else if (layer === 'CC') {
            radarData = radar.getHighresCorrelationCoefficient();
        } else if (layer === 'KDP') {
            radarData = radar.getHighresDiffPhase();
        } else if (layer === 'SW') {
            radarData = radar.getHighresSpectrum();
        } else if (layer === 'ZDR') {
            radarData = radar.getHighresDiffReflectivity();
        } else {
            throw new Error(`Unknown radar layer: ${layer}`);
        }

        // Validate radarData structure
        if (!Array.isArray(radarData) || radarData.length === 0) {
            throw new Error(`No radar data available for layer: ${layer}`);
        }

        // Loop over each radial
        const numberOfRadarIterations = radarData.length;
        const gateLimit = Number.isFinite(options.gate_limit) ? options.gate_limit : null;
        const project = this._createRadarProjector(radarLocation[0], radarLocation[1]);
        const includeGeojson = options.includeGeojson === true;
        const builder = this._createMeshBuilder(includeGeojson);
        
        for (let index = 0; index < numberOfRadarIterations; index++) {
            const radial = radarData[index];
            
            // Skip if radial is undefined or missing required properties
            if (!radial || typeof radial !== 'object' || !radial.moment_data || typeof radial.gate_count !== 'number') {
                console.warn(`Skipping invalid radial at index ${index}`);
                continue;
            }
            
            // Report progress every 100 iterations
            if (index % 100 === 0) {
                console.log(`(${(index / numberOfRadarIterations * 100).toFixed(2)}%) Processing radial ${index + 1} of ${numberOfRadarIterations}`);
            }

            // Yield to the browser to prevent blocking the DOM
            if (index % 50 === 0) {
                await yieldToMain();
            }

            // Get the header for this radial and the next to access azimuth
            const radialHeader = radar.getHeader(index);
            const nextHeader = radar.getHeader((index + 1) % numberOfRadarIterations);
            
            // Extract azimuths
            const az1 = radialHeader.azimuth;
            const az2 = nextHeader.azimuth;
            const az1Rad = az1 * DEG_TO_RAD;
            const az2Rad = az2 * DEG_TO_RAD;
            const sinAz1 = Math.sin(az1Rad);
            const cosAz1 = Math.cos(az1Rad);
            const sinAz2 = Math.sin(az2Rad);
            const cosAz2 = Math.cos(az2Rad);

            const firstGate = radial.first_gate;
            const gateSize = radial.gate_size;
            
            // Loop over each gate in the radial
            for (let gateIndex = 0; gateIndex < radial.gate_count - 1; gateIndex++) {
                const dbz = radial.moment_data[gateIndex];
                
                // Skip null values
                if (dbz === null) {
                    continue;
                }
                if (layer === 'REF' && gateLimit !== null && dbz !== 'rf' && dbz < gateLimit) {
                    continue;
                }
                
                const r1 = (firstGate + gateIndex * gateSize) * 1000;
                const r2 = (firstGate + (gateIndex + 1) * gateSize) * 1000;

                let value = dbz;
                if (layer === 'VEL' && value !== 'rf' && Number.isFinite(value)) {
                    // Convert m/s to knots to match palette units
                    value *= 1.94384;
                }

                const coords = this._buildPolygon(project, sinAz1, cosAz1, sinAz2, cosAz2, r1, r2);
                builder.pushQuad(coords, value);
            }
        }

        return builder.finalize();
    }

    async _processLevel3RadarData(radar, radarLocation, layer, options = {}) {
        const radialPackets = Array.isArray(radar.radialPackets) ? radar.radialPackets : [];
        const packet = radialPackets.find((entry) => entry && Array.isArray(entry.radials));
        if (!packet) {
            throw new Error('No radial packet data found in Level 3 product.');
        }

        const rangeScaleKm = packet.rangeScale ?? 1;
        const firstBin = packet.firstBin ?? 0;
        const numberBins = packet.numberBins ?? 0;
        const radials = packet.radials || [];
        const gateLimit = Number.isFinite(options.gate_limit) ? options.gate_limit : 0;

        const numberOfRadarIterations = radials.length;
        const project = this._createRadarProjector(radarLocation[0], radarLocation[1]);
        const includeGeojson = options.includeGeojson === true;
        const builder = this._createMeshBuilder(includeGeojson);

        for (let index = 0; index < numberOfRadarIterations; index++) {
            const radial = radials[index];
            if (!radial || typeof radial !== 'object') {
                continue;
            }

            if (index % 100 === 0) {
                console.log(`(${(index / numberOfRadarIterations * 100).toFixed(2)}%) Processing radial ${index + 1} of ${numberOfRadarIterations}`);
            }

            if (index % 50 === 0) {
                await yieldToMain();
            }

            const az1 = radial.startAngle;
            const az2 = radial.startAngle + radial.angleDelta;
            const az1Rad = az1 * DEG_TO_RAD;
            const az2Rad = az2 * DEG_TO_RAD;
            const sinAz1 = Math.sin(az1Rad);
            const cosAz1 = Math.cos(az1Rad);
            const sinAz2 = Math.sin(az2Rad);
            const cosAz2 = Math.cos(az2Rad);
            const bins = radial.bins || [];

            for (let binIndex = 0; binIndex < Math.min(bins.length, numberBins); binIndex++) {
                const value = bins[binIndex];
                if (value == null) {
                    continue;
                }
                if (gateLimit && value < gateLimit) {
                    continue;
                }

                const r1 = (firstBin + (binIndex * rangeScaleKm)) * 250;
                const r2 = (firstBin + ((binIndex + 1) * rangeScaleKm)) * 250;

                const coords = this._buildPolygon(project, sinAz1, cosAz1, sinAz2, cosAz2, r1, r2);
                builder.pushQuad(coords, value);
            }
        }

        return builder.finalize();
    }

    async isUpdateAvailable(radarStation, product = null) {
        const level = this._inferLevelFromProduct(product);
        if (level === 'L2') {
            const latest = await checkLatestL2RadarFile(radarStation);
            const stored = this.latestRadarFiles.L2;
            console.log(`[Update Check] Latest: ${latest}, Stored: ${stored}, Equal: ${latest === stored}`);
            if (latest === stored) {
                return false;
            }
            return true;
        } else {
            const latest = await checkLatestL3RadarFile(radarStation, product);
            const stored = this.latestRadarFiles.L3?.[product] ?? null;
            console.log(`[Update Check] Latest: ${latest}, Stored: ${stored}, Equal: ${latest === stored}`);
            if (latest === stored) {
                return false;
            }
            return true;
        }
    }

    async getRadarLayer(radarStation, layer, options = {}) {
        const isLevel3 = this._isLevel3Layer(layer);

        try {
            let latestFileName = null;
            if (!options.fromUrl) {
                latestFileName = isLevel3
                    ? await checkLatestL3RadarFile(radarStation, layer)
                    : await checkLatestL2RadarFile(radarStation);
                console.log(`[getRadarLayer] Latest file available: ${latestFileName}`);

                const latestTimeIso = this._parseFilenameToIso(latestFileName);
                const cacheTilt = this._getCacheTiltKey(layer, options);
                const cached = latestTimeIso
                    ? this.cache.get(radarStation, layer, cacheTilt, latestTimeIso)
                    : null;

                if (cached) {
                    console.log(`[getRadarLayer] Using cached data for ${radarStation}/${layer}/${cacheTilt}/${latestTimeIso}`);

                    if (isLevel3) {
                        this.latestRadarFiles.L3[layer] = latestFileName;
                    } else {
                        this.latestRadarFiles.L2 = latestFileName;
                    }

                    if (cached.metadata && typeof options.onMetadata === 'function') {
                        const date = new Date(cached.metadata.timeIso || latestTimeIso);
                        console.log(`[RadarCached] timeIso=${cached.metadata.timeIso || latestTimeIso}, date object=${date.toString()}`);
                        const timeString = date.toLocaleTimeString('en-US', {
                            hour12: true,
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                        });
                        console.log(`[RadarCached] timeString=${timeString}`);
                        options.onMetadata({
                            timeString,
                            timeIso: cached.metadata.timeIso,
                            tilt: cached.metadata.elevationAngle,
                            vcp: cached.metadata.vcp ?? null
                        });
                    }

                    this.radarGeoJson = null;
                    document.title = `SparkRadar | ${radarStation}`;
                    return {
                        geojson: null,
                        meshData: cached.meshData,
                        bounds: cached.bounds,
                        metadata: cached.metadata
                    };
                }
            }

            let radarFile;
            if (options.fromUrl) {
                console.log(`[getRadarLayer] Loading from URL: ${options.fromUrl}`);
                radarFile = await loadRadarFileFromUrl(options.fromUrl);
            } else {
                if (isLevel3) {
                    this.latestRadarFiles.L3[layer] = latestFileName;
                } else {
                    this.latestRadarFiles.L2 = latestFileName;
                }

                radarFile = isLevel3
                    ? await loadLatestL3RadarFile(radarStation, layer)
                    : await loadLatestL2RadarFile(radarStation);
            }

            console.log(`[getRadarLayer] Loaded file: ${radarFile.fileName}`);
            const rawData = radarFile.data;

            const includeGeojson = options.includeGeojson === true;
            let geojson = null;
            let meshData = null;
            let bounds = null;
            let metadata = null;

            if (this.workerSupported) {
                const workerOptions = { ...options, includeGeojson };
                delete workerOptions.onMetadata;
                const arrayBuffer = rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength);
                const result = await this._processRadarDataInWorker(arrayBuffer, layer, { ...workerOptions, station: radarStation });
                geojson = result.geojson;
                meshData = result.meshData || null;
                bounds = result.bounds || null;
                metadata = result.metadata || null;
            } else if (isLevel3) {
                const { radar, radarLocation } = await this._fetchLevel3RadarData(radarStation, layer, rawData);
                const processed = await this._processLevel3RadarData(radar, radarLocation, layer, { ...options, includeGeojson });
                geojson = processed.geojson;
                meshData = processed.meshData;
                bounds = processed.bounds;
                const level3Meta = this._getLevel3Metadata(radar);
                metadata = {
                    station: radarStation,
                    product: layer,
                    ...(level3Meta ?? {})
                };
            } else {
                const { radar, radarLocation, extent, header } = await this._fetchRadarData(radarStation, options, rawData);
                const processed = await this._processRadarData(radar, radarLocation, extent, layer, { ...options, includeGeojson });
                geojson = processed.geojson;
                meshData = processed.meshData;
                bounds = processed.bounds;
                // NEXRAD Level 2 file header uses modified_julian_date (days since Dec 31, 1969)
                // Add 1 hour offset to correct for NEXRAD timestamp quirk
                const epochMs = (header.modified_julian_date * 86400 * 1000) + header.milliseconds + 3600000;
                console.log(`[Level2 Timestamp] modified_julian_date=${header.modified_julian_date}, milliseconds=${header.milliseconds}, epochMs=${epochMs}, iso=${new Date(epochMs).toISOString()}`);
                metadata = {
                    timeIso: new Date(epochMs).toISOString(),
                    elevationAngle: header.elevation_angle,
                    vcp: Number.isFinite(header.vcp) ? header.vcp : null,
                    station: radarStation,
                    product: layer
                };
            }

            // Prefer the timestamp derived from the latest filename for cache keys and metadata.
            // Header-based timestamps can be incorrect due to NEXRAD format quirks.
            const latestTimeIsoForCache = latestFileName ? this._parseFilenameToIso(latestFileName) : null;
            const cacheTimeIso = latestTimeIsoForCache || metadata?.timeIso || null;
            
            // Override metadata timestamp with filename-based timestamp if available
            if (latestTimeIsoForCache && metadata) {
                metadata.timeIso = latestTimeIsoForCache;
            }

            if (metadata?.timeIso && typeof options.onMetadata === 'function') {
                const date = new Date(metadata.timeIso);
                console.log(`[RadarMetadata] timeIso=${metadata.timeIso}, date object=${date.toString()}`);
                const timeString = date.toLocaleTimeString('en-US', {
                    hour12: true,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                console.log(`[RadarMetadata] timeString=${timeString}`);
                options.onMetadata({
                    timeString,
                    timeIso: metadata.timeIso,
                    tilt: metadata.elevationAngle,
                    vcp: metadata.vcp ?? null
                });
            }

            if (meshData && cacheTimeIso) {
                const cacheTilt = this._getCacheTiltKey(layer, options, metadata);
                this.cache.set(
                    radarStation,
                    layer,
                    cacheTilt,
                    cacheTimeIso,
                    meshData,
                    bounds,
                    metadata
                );
            }

            if (!isLevel3 && !['REF', 'VEL', 'CC', 'KDP', 'SW', 'ZDR'].includes(layer)) {
                console.warn(`Unknown radar layer: ${layer}. Ignoring.`);
                return null;
            }

            this.radarGeoJson = geojson;
            if (isLevel3) {
                this.latestRadarFiles.L3[layer] = await checkLatestL3RadarFile(radarStation, layer);
            } else {
                this.latestRadarFiles.L2 = await checkLatestL2RadarFile(radarStation);
            }

            console.log('Done processing radar layer.');
            document.title = `SparkRadar | ${radarStation}`;
            return { geojson, meshData, bounds, metadata };
        } catch (error) {
            console.error(`Error adding radar layer: ${error.message}`);
            return null;
        }
    }

    /**
     * Get radar cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return this.cache.getStats();
    }

    /**
     * Clear the radar cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Update the maximum number of cache slots
     * @param {number} maxSlots - New maximum number of slots
     */
    setCacheSize(maxSlots) {
        this.cache.setMaxSlots(maxSlots);
    }

    /**
     * Update maximum cache size in GB
     * @param {number} maxSizeGB - Max cache size in GB (0 = unlimited)
     */
    setCacheMaxSizeGB(maxSizeGB) {
        this.cache.setMaxSizeGB(maxSizeGB);
    }

    /**
     * Update both slot and size limits in one call
     * @param {Object} limits - Cache limits
     */
    setCacheLimits(limits = {}) {
        if (Number.isFinite(limits.maxSlots) && limits.maxSlots > 0) {
            this.cache.setMaxSlots(limits.maxSlots);
        }
        if (Number.isFinite(limits.maxSizeGB) && limits.maxSizeGB >= 0) {
            this.cache.setMaxSizeGB(limits.maxSizeGB);
        }
    }

    /**
     * Remove cache entries for a specific station or product
     * @param {Object} criteria - Matching criteria {station, product, tilt}
     */
    removeCacheEntries(criteria) {
        this.cache.removeMatching(criteria);
    }

    /**
     * Parse a radar filename into an ISO timestamp
     * Filename format: STATION_PRODUCT_YYYY_MM_DD_HH_MM_SS
     * @param {string} filename - Radar filename
     * @returns {string|null} ISO timestamp or null if parsing fails
     */
    _parseFilenameToIso(filename) {
        if (!filename || typeof filename !== 'string') return null;
        
        // Extract timestamp parts from filename
        // Format: STATION_PRODUCT_YYYY_MM_DD_HH_MM_SS
        const parts = filename.split('_');
        if (parts.length < 8) return null;
        
        // Get the date/time parts (skip station and product)
        const year = parts[parts.length - 6];
        const month = parts[parts.length - 5];
        const day = parts[parts.length - 4];
        const hour = parts[parts.length - 3];
        const minute = parts[parts.length - 2];
        const second = parts[parts.length - 1];
        
        // Validate parts are numbers
        if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day) ||
            !/^\d{2}$/.test(hour) || !/^\d{2}$/.test(minute) || !/^\d{2}$/.test(second)) {
            return null;
        }
        
        // Construct ISO timestamp
        try {
            const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
            // Validate by parsing
            const date = new Date(isoString);
            if (isNaN(date.getTime())) return null;
            return isoString;
        } catch {
            return null;
        }
    }
}

// Export the radar class
export default Radar;