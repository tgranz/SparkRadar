/*

> radar.js
This module handles the radar on a map.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import { checkLatestL2RadarFile, checkLatestL3RadarFile, loadLatestL2RadarFile, loadLatestL3RadarFile } from '../parse/fetch.js';
import { Level2Radar } from '../parse/level2/src/index.js';
import nexradLevel3Data from '../parse/level3/src/browser.js';

// Helper function to yield to the browser between processing iterations
const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

const EARTH_RADIUS = 6371000;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

class Radar {
    // Constructor function
    constructor() {
        this.latestRadarFiles = { L2: null, L3: {} };
        this.radarStation = 'KIWX'
        this.radarGeoJson = null;
        this.workerSupported = typeof Worker !== 'undefined';
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
            const epochMs = (dateValue * 86400 + timeValue) * 1000;
            timeIso = new Date(epochMs).toISOString();
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

    // Assistant functions
    _createRadarProjector(radarLat, radarLon) {
        const lat1 = radarLat * DEG_TO_RAD;
        const lon1 = radarLon * DEG_TO_RAD;
        const sinLat1 = Math.sin(lat1);
        const cosLat1 = Math.cos(lat1);

        return (sinAz, cosAz, distanceMeters) => {
            const dR = distanceMeters / EARTH_RADIUS;
            const sinDR = Math.sin(dR);
            const cosDR = Math.cos(dR);
            const lat2 = Math.asin(sinLat1 * cosDR + cosLat1 * sinDR * cosAz);
            const lon2 = lon1 + Math.atan2(
                sinAz * sinDR * cosLat1,
                cosDR - sinLat1 * Math.sin(lat2)
            );
            return [lon2 * RAD_TO_DEG, lat2 * RAD_TO_DEG];
        };
    }

    _buildPolygon(project, sinAz1, cosAz1, sinAz2, cosAz2, r1, r2) {
        const p1 = project(sinAz1, cosAz1, r1);
        const p2 = project(sinAz2, cosAz2, r1);
        const p3 = project(sinAz2, cosAz2, r2);
        const p4 = project(sinAz1, cosAz1, r2);
        return [p1, p2, p3, p4, p1];
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

        // Load the header data
        const header = radar.getHeader(0);

        // Find the radar location
        const radarLocation = [header.volume.latitude, header.volume.longitude];

        // Determine the radar extent
        const extent = header.radial_length;

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
                const { type, geojson, metadata, message } = event.data || {};
                if (type === 'result') {
                    cleanup();
                    resolve({ geojson, metadata });
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
        const features = [];
        const gateLimit = Number.isFinite(options.gate_limit) ? options.gate_limit : null;
        const project = this._createRadarProjector(radarLocation[0], radarLocation[1]);
        
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

                const coords = this._buildPolygon(project, sinAz1, cosAz1, sinAz2, cosAz2, r1, r2);
                
                // Create GeoJSON feature
                features.push({
                    type: 'Feature',
                    properties: {
                        val: dbz === 'rf' ? 'rf' : dbz
                    },
                    geometry: {
                        type: 'Polygon',
                        coordinates: [coords]
                    }
                });
            }
        }

        // Create GeoJSON FeatureCollection
        const geojson = {
            type: 'FeatureCollection',
            features: features
        };

        console.log("GeoJSON data processed.");
        return geojson;
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

        const features = [];
        const numberOfRadarIterations = radials.length;
        const project = this._createRadarProjector(radarLocation[0], radarLocation[1]);

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
                features.push({
                    type: 'Feature',
                    properties: { val: value },
                    geometry: {
                        type: 'Polygon',
                        coordinates: [coords]
                    }
                });
            }
        }

        return {
            type: 'FeatureCollection',
            features
        };
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
            const latestBefore = isLevel3
                ? await checkLatestL3RadarFile(radarStation, layer)
                : await checkLatestL2RadarFile(radarStation);
            console.log(`[getRadarLayer] About to fetch layer ${layer}, latest file: ${latestBefore}`);
            if (isLevel3) {
                this.latestRadarFiles.L3[layer] = latestBefore;
            } else {
                this.latestRadarFiles.L2 = latestBefore;
            }

            const radarFile = isLevel3
                ? await loadLatestL3RadarFile(radarStation, layer)
                : await loadLatestL2RadarFile(radarStation);
            console.log(`[getRadarLayer] Loaded file: ${radarFile.fileName}`);
            const rawData = radarFile.data;

            let geojson = null;
            let metadata = null;

            if (this.workerSupported) {
                const workerOptions = { ...options };
                delete workerOptions.onMetadata;
                const arrayBuffer = rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength);
                const result = await this._processRadarDataInWorker(arrayBuffer, layer, { ...workerOptions, station: radarStation });
                geojson = result.geojson;
                metadata = result.metadata;
            } else {
                if (isLevel3) {
                    const { radar, radarLocation } = await this._fetchLevel3RadarData(radarStation, layer, rawData);
                    geojson = await this._processLevel3RadarData(radar, radarLocation, layer, options);
                    const level3Meta = this._getLevel3Metadata(radar);
                    metadata = {
                        station: radarStation,
                        product: layer,
                        ...(level3Meta ?? {})
                    };
                } else {
                    const { radar, radarLocation, extent, header } = await this._fetchRadarData(radarStation, options, rawData);
                    geojson = await this._processRadarData(radar, radarLocation, extent, layer, options);
                    metadata = {
                        timeIso: new Date((header.julian_date * 86400 * 1000) + header.mseconds).toISOString(),
                        elevationAngle: header.elevation_angle,
                        vcp: Number.isFinite(header.vcp) ? header.vcp : null
                    };
                }
            }

            if (metadata?.timeIso && Number.isFinite(metadata.elevationAngle)) {
                const date = new Date(metadata.timeIso);
                const timeString = date.toLocaleTimeString('en-US', {
                    hour12: true,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                if (typeof options.onMetadata === 'function') {
                    options.onMetadata({
                        timeString,
                        timeIso: metadata.timeIso,
                        tilt: metadata.elevationAngle,
                        vcp: metadata.vcp ?? null
                    });
                }
            }

            if (!isLevel3 && !['REF', 'VEL', 'CC', 'KDP', 'SW', 'ZDR'].includes(layer)) {
                console.warn(`Unknown radar layer: ${layer}. Ignoring.`);
                return null;
            }

            // Process the radar data and generate GeoJSON
            // Store the GeoJSON and update the latest file tracking
            this.radarGeoJson = geojson;
            if (isLevel3) {
                this.latestRadarFiles.L3[layer] = await checkLatestL3RadarFile(radarStation, layer);
            } else {
                this.latestRadarFiles.L2 = await checkLatestL2RadarFile(radarStation);
            }

            console.log("Done processing radar layer.");
            document.title = `SparkRadar | ${radarStation}`;
            return geojson;
        } catch (error) {
            console.error(`Error adding radar layer: ${error.message}`);
            return null;
        }
    }
}

// Export the radar class
export default Radar;