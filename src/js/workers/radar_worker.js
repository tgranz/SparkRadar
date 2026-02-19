import { Buffer } from 'buffer';
import { Level2Radar } from '../../parse/level2/src/index.js';
import nexradLevel3Data from '../../parse/level3/src/browser.js';

const EARTH_RADIUS = 6371000;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const createRadarProjector = (radarLat, radarLon) => {
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
};

const buildPolygon = (project, sinAz1, cosAz1, sinAz2, cosAz2, r1, r2) => {
    const p1 = project(sinAz1, cosAz1, r1);
    const p2 = project(sinAz2, cosAz2, r1);
    const p3 = project(sinAz2, cosAz2, r2);
    const p4 = project(sinAz1, cosAz1, r2);
    return [p1, p2, p3, p4, p1];
};

const processRadarData = (radar, radarLocation, extent, layer, options = {}) => {
    let radarData;
    if (layer === 'REF') {
        radarData = radar.getHighresReflectivity();
    } else if (layer === 'VEL') {
        radarData = radar.getHighresVelocity();
        if (Array.isArray(radarData) && radarData.every(item => item === undefined)) {
            const elevationLevels = radar.listElevations().sort((a, b) => a - b);
            let currentIndex = elevationLevels.indexOf(radar.elevation);
            while (currentIndex + 1 < elevationLevels.length) {
                currentIndex += 1;
                radar.setElevation(elevationLevels[currentIndex]);
                radarData = radar.getHighresVelocity();
                if (Array.isArray(radarData) && !radarData.every(item => item === undefined)) {
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
    } else if (layer == 'ZDR') {
        radarData = radar.getHighResDiffReflectivity();
    } else {
        throw new Error(`Unknown radar layer: ${layer}`);
    }

    if (!Array.isArray(radarData) || radarData.length === 0) {
        throw new Error(`No radar data available for layer: ${layer}`);
    }

    const numberOfRadarIterations = radarData.length;
    const features = [];
    const gateLimit = Number.isFinite(options.gate_limit) ? options.gate_limit : null;
    const project = createRadarProjector(radarLocation[0], radarLocation[1]);

    for (let index = 0; index < numberOfRadarIterations; index++) {
        const radial = radarData[index];
        if (!radial || typeof radial !== 'object' || !radial.moment_data || typeof radial.gate_count !== 'number') {
            continue;
        }

        const radialHeader = radar.getHeader(index);
        const nextHeader = radar.getHeader((index + 1) % numberOfRadarIterations);

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

        for (let gateIndex = 0; gateIndex < radial.gate_count - 1; gateIndex++) {
            const dbz = radial.moment_data[gateIndex];
            if (dbz === null) {
                continue;
            }
            if (layer === 'REF' && gateLimit !== null && dbz !== 'rf' && dbz < gateLimit) {
                continue;
            }

            const r1 = (firstGate + gateIndex * gateSize) * 1000;
            const r2 = (firstGate + (gateIndex + 1) * gateSize) * 1000;

            const coords = buildPolygon(project, sinAz1, cosAz1, sinAz2, cosAz2, r1, r2);

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

    return {
        type: 'FeatureCollection',
        features
    };
};

const processLevel3Data = (radar, radarLocation, options = {}) => {
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
    const project = createRadarProjector(radarLocation[0], radarLocation[1]);

    for (let index = 0; index < numberOfRadarIterations; index++) {
        const radial = radials[index];
        if (!radial || typeof radial !== 'object') {
            continue;
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
            if (value !== 'rf' && gateLimit && value < gateLimit) {
                continue;
            }

            const r1 = (firstBin + (binIndex * rangeScaleKm)) * 250;
            const r2 = (firstBin + ((binIndex + 1) * rangeScaleKm)) * 250;

            const coords = buildPolygon(project, sinAz1, cosAz1, sinAz2, cosAz2, r1, r2);

            features.push({
                type: 'Feature',
                properties: { val: value === 'rf' ? 'rf' : value },
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
};

const getLevel3Metadata = (radar) => {
    const productDescription = radar?.productDescription;
    if (!productDescription) return { timeIso: null, elevationAngle: null, vcp: null };

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
};

self.onmessage = (event) => {
    const { type, arrayBuffer, layer, options } = event.data || {};
    if (type !== 'process' || !arrayBuffer) {
        return;
    }

    try {
        const upperLayer = typeof layer === 'string' ? layer.toUpperCase() : '';
        const isLevel2Product = upperLayer === 'REF' || upperLayer === 'VEL' || upperLayer === 'CC' || upperLayer === 'KDP' || upperLayer === 'SW';
        const isLevel3 = !isLevel2Product;
        const buffer = Buffer.from(arrayBuffer);

        if (isLevel3) {
            const radar = nexradLevel3Data(buffer);
            const radarLat = radar.productDescription?.latitude;
            const radarLon = radar.productDescription?.longitude;
            if (radarLat == null || radarLon == null) {
                throw new Error('Missing radar location in Level 3 product description.');
            }
            const radarLocation = [radarLat, radarLon];
            const geojson = processLevel3Data(radar, radarLocation, options);
            const { timeIso, elevationAngle, vcp } = getLevel3Metadata(radar);
            const metadata = {
                station: options?.station || null,
                product: layer,
                timeIso,
                elevationAngle,
                vcp
            };

            self.postMessage({ type: 'result', geojson, metadata });
        } else {
            const radar = new Level2Radar(buffer);

            const elevations = radar.listElevations();
            if (options?.elevation && elevations.includes(options.elevation)) {
                radar.setElevation(options.elevation);
            } else {
                radar.setElevation(elevations[0] || 1);
            }

            const header = radar.getHeader(0);
            const radarLocation = [header.volume.latitude, header.volume.longitude];
            const extent = header.radial_length;

            const geojson = processRadarData(radar, radarLocation, extent, layer, options);
            const metadata = {
                timeIso: new Date((header.julian_date * 86400 * 1000) + header.mseconds).toISOString(),
                elevationAngle: header.elevation_angle,
                station: options?.station || null,
                vcp: Number.isFinite(header.vcp) ? header.vcp : null
            };

            self.postMessage({ type: 'result', geojson, metadata });
        }
    } catch (error) {
        self.postMessage({ type: 'error', message: error?.message || String(error) });
    }
};
