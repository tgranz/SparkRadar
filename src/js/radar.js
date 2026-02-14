/*

> radar.js
This module handles the radar on a map.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import '../css/menu.css';
import { checkLatestL2RadarFile, checkLatestL3RadarFile, loadLatestL2RadarFile, loadLatestL3RadarFile } from '../parse/fetch.js';
import { Level2Radar } from '../parse/level2/src/index.js';
//import Level3Radar from '../parse/level3/src/index.js';

// Helper function to yield to the browser between processing iterations
const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

class Radar {
    // Constructor function
    constructor(map) {
        this.map = map;
        this.latestRadarFiles = { L2: null, L3: {}, };
        this.radarStation = 'KIWX'
        this.radarGeoJson = null;
    }

    // Assistant functions
    _destinationPoint(lat, lon, azimuthDeg, distanceMeters) {
        const R = 6371000;
        const az = azimuthDeg * Math.PI / 180;
        const dR = distanceMeters / R;
        const lat1 = lat * Math.PI / 180;
        const lon1 = lon * Math.PI / 180;
        const lat2 = Math.asin( Math.sin(lat1) * Math.cos(dR) + Math.cos(lat1) * Math.sin(dR) * Math.cos(az) );
        const lon2 = lon1 + Math.atan2( Math.sin(az) * Math.sin(dR) * Math.cos(lat1), Math.cos(dR) - Math.sin(lat1) * Math.sin(lat2) );
        return { lat: lat2 * 180 / Math.PI, lon: lon2 * 180 / Math.PI };
    }

    _convertPointToPixel(radarLat, radarLon, az1, az2, r1, r2) {
        const p1 = this._destinationPoint(radarLat, radarLon, az1, r1);
        const p2 = this._destinationPoint(radarLat, radarLon, az2, r1);
        const p3 = this._destinationPoint(radarLat, radarLon, az2, r2);
        const p4 = this._destinationPoint(radarLat, radarLon, az1, r2);

        return [
            [p1.lon.toFixed(4), p1.lat.toFixed(4)],
            [p2.lon.toFixed(4), p2.lat.toFixed(4)],
            [p3.lon.toFixed(4), p3.lat.toFixed(4)],
            [p4.lon.toFixed(4), p4.lat.toFixed(4)],
            [p1.lon.toFixed(4), p1.lat.toFixed(4)]
        ];
    }

    async _fetchRadarData(station, options = {}) {
        // Fetch the latest radar file for the station
        const radarFile = await loadLatestL2RadarFile(station);
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
                let currentIndex = elevationLevels.indexOf(radar.currentElevation);
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
            
            // Loop over each gate in the radial
            for (let gateIndex = 0; gateIndex < radial.gate_count - 1; gateIndex++) {
                const dbz = radial.moment_data[gateIndex];
                
                // Skip null values
                if (dbz === null) {
                    continue;
                }
                
                const first_gate = radial.first_gate;
                const gate_size = radial.gate_size;
                const r1 = (first_gate + gateIndex * gate_size) * 1000;
                const r2 = (first_gate + (gateIndex + 1) * gate_size) * 1000;

                const coords = this._convertPointToPixel(radarLocation[0], radarLocation[1], az1, az2, r1, r2);
                
                // Create GeoJSON feature
                features.push({
                    type: 'Feature',
                    properties: {
                        val: dbz
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

    async getRadarLayer(radarStation, layer, options = {}) {
        // L2 files contain both reflectivity and velocity, so we can use the same file for both layers.
        // L3 files are separate by product, so we need to check for each one.

        try {
            const { radar, radarLocation, extent, header } = await this._fetchRadarData(radarStation, options);

            // Validate layer type
            if (!['REF', 'VEL'].includes(layer)) {
                console.warn(`Unknown radar layer: ${layer}. Ignoring.`);
                return null;
            }

            // Process the radar data and generate GeoJSON
            const geojson = await this._processRadarData(radar, radarLocation, extent, layer, options);

            // Store the GeoJSON and update the latest file tracking
            this.radarGeoJson = geojson;
            this.latestRadarFiles.L2 = await checkLatestL2RadarFile(radarStation);

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