import { Buffer } from 'buffer';
import { Level2Radar } from '../../parse/level2/src/index.js';
import nexradLevel3Data from '../../parse/level3/src/browser.js';

const LEVEL3_PARSE_MODE = 'fast';

const EARTH_RADIUS = 6371000;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const getLevel2MomentForLayer = (layer) => {
    const upperLayer = typeof layer === 'string' ? layer.toUpperCase() : '';
    switch (upperLayer) {
    case 'REF':
        return 'reflect';
    case 'VEL':
        return 'velocity';
    case 'CC':
        return 'rho';
    case 'KDP':
        return 'phi';
    case 'SW':
        return 'spectrum';
    case 'ZDR':
        return 'zdr';
    default:
        return null;
    }
};

const createRadarProjector = (radarLat, radarLon) => {
    const lat1 = radarLat * DEG_TO_RAD;
    const lon1 = radarLon * DEG_TO_RAD;
    const sinLat1 = Math.sin(lat1);
    const cosLat1 = Math.cos(lat1);
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
};

const buildPolygon = (project, sinAz1, cosAz1, sinAz2, cosAz2, r1, r2) => {
    const p1 = project(sinAz1, cosAz1, r1);
    const p2 = project(sinAz2, cosAz2, r1);
    const p3 = project(sinAz2, cosAz2, r2);
    const p4 = project(sinAz1, cosAz1, r2);
    return [p1, p2, p3, p4];
};

const createMeshBuilder = (includeGeojson) => {
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
    const gateLimit = Number.isFinite(options.gate_limit) ? options.gate_limit : null;
    const project = createRadarProjector(radarLocation[0], radarLocation[1]);
    const includeGeojson = options.includeGeojson === true;
    const builder = createMeshBuilder(includeGeojson);

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

            let value = dbz;
            if (layer === 'VEL' && value !== 'rf' && Number.isFinite(value)) {
                // Convert m/s to knots to match palette units
                value *= 1.94384;
            }

            const coords = buildPolygon(project, sinAz1, cosAz1, sinAz2, cosAz2, r1, r2);
            builder.pushQuad(coords, value);
        }
    }

    return builder.finalize();
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

    const numberOfRadarIterations = radials.length;
    const project = createRadarProjector(radarLocation[0], radarLocation[1]);
    const includeGeojson = options.includeGeojson === true;
    const builder = createMeshBuilder(includeGeojson);

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
            var value = bins[binIndex];
            if (value == null) {
                continue;
            }

            // Few Products are weird. Perhaps the parser is incorrect? Apply quirk fixes:
            let scaleFactor = 250;
            //console.log("Product code:", radar.productDescription.code);

            if (radar.productDescription.code === 56) {
                // SRV
                scaleFactor = 1000;
                if (value === 15) value = 'rf';
                else if (value == 14) value = 64;
                else if (value == 13) value = 50;
                else if (value == 12) value = 36;
                else if (value == 11) value = 26;
                else if (value == 10) value = 20;
                else if (value == 9) value = 10;
                else if (value == 8) value = 0;
                else if (value == 7) value = -1;
                else if (value == 6) value = -10;
                else if (value == 5) value = -20;
                else if (value == 4) value = -26;
                else if (value == 3) value = -36;
                else if (value == 2) value = -50;
                else if (value == 1) value = -64;
                else if (value == 0) value = null;
            } else if (radar.productDescription.code === 170 || radar.productDescription.code === 172) {
                // DAA & DTA
                scaleFactor = 1000;
                if (value == 'rf') value = 0;
            }

            if (value == null) {
                continue;
            }
            if (value !== 'rf' && gateLimit && value < gateLimit) {
                continue;
            }

            const r1 = (firstBin + (binIndex * rangeScaleKm)) * scaleFactor;
            const r2 = (firstBin + ((binIndex + 1) * rangeScaleKm)) * scaleFactor;

            const coords = buildPolygon(project, sinAz1, cosAz1, sinAz2, cosAz2, r1, r2);
            builder.pushQuad(coords, value);
        }
    }

    return builder.finalize();
};

const getLevel3Metadata = (radar) => {
    const productDescription = radar?.productDescription;
    if (!productDescription) return { timeIso: null, elevationAngle: null, vcp: null };

    const dateValue = Number(productDescription.volumeScanDate ?? productDescription.productDate);
    const timeValue = Number(productDescription.volumeScanTime ?? productDescription.productTime);
    let timeIso = null;
    if (Number.isFinite(dateValue) && Number.isFinite(timeValue)) {
        const epochMs = (dateValue * 86400 + timeValue) * 1000 - 3600000;
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
        const toEpochMs = (monotonicMs) => performance.timeOrigin + monotonicMs;
        const parserStartMs = toEpochMs(performance.now());
        let parserEndMs = null;
        let meshEndMs = null;
        const upperLayer = typeof layer === 'string' ? layer.toUpperCase() : '';
        const isLevel2Product = upperLayer === 'REF' || upperLayer === 'VEL' || upperLayer === 'CC' || upperLayer === 'KDP' || upperLayer === 'SW';
        const isLevel3 = !isLevel2Product;
        const buffer = Buffer.from(arrayBuffer);

        if (isLevel3) {
            const requestedParseMode = typeof options?.level3ParseMode === 'string'
                ? options.level3ParseMode.toLowerCase()
                : null;
            const level3ParseMode = requestedParseMode === 'full' ? 'full' : LEVEL3_PARSE_MODE;
            const radar = nexradLevel3Data(
                buffer,
                level3ParseMode === 'fast'
                    ? {
                        logger: false,
                        parseGraphic: false,
                        parseTabular: false,
                        parseFormatted: false,
                        includeRawBinData: false,
                        includePacketMetadata: false,
                        parseFirstRadialPacketOnly: true,
                        minimalOutput: true
                    }
                    : {
                        logger: false
                    }
            );
            parserEndMs = toEpochMs(performance.now());
            const radarLat = radar.productDescription?.latitude;
            const radarLon = radar.productDescription?.longitude;
            if (radarLat == null || radarLon == null) {
                throw new Error('Missing radar location in Level 3 product description.');
            }
            const radarLocation = [radarLat, radarLon];
            const { meshData, bounds, geojson } = processLevel3Data(radar, radarLocation, options);
            meshEndMs = toEpochMs(performance.now());
            const { timeIso, elevationAngle, vcp } = getLevel3Metadata(radar);
            const metadata = {
                station: options?.station || null,
                product: layer,
                timeIso,
                elevationAngle,
                vcp
            };

            self.postMessage({
                type: 'result',
                geojson,
                meshData,
                bounds,
                metadata,
                timing: {
                    parserStartMs,
                    parserEndMs,
                    meshEndMs
                }
            }, [meshData.buffer]);
        } else {
            const requestedMoment = getLevel2MomentForLayer(layer);
            const radar = new Level2Radar(buffer, {
                logger: false,
                includeMoments: requestedMoment ? [requestedMoment] : undefined
            });
            parserEndMs = toEpochMs(performance.now());

            const elevations = radar.listElevations();
            if (options?.elevation && elevations.includes(options.elevation)) {
                radar.setElevation(options.elevation);
            } else {
                radar.setElevation(elevations[0] || 1);
            }

            const header = radar.getHeader(0);
            const radarLocation = [header.volume.latitude, header.volume.longitude];
            const extent = header.radial_length;

            const { meshData, bounds, geojson } = processRadarData(radar, radarLocation, extent, layer, options);
            meshEndMs = toEpochMs(performance.now());
            const metadata = {
                timeIso: new Date((header.julian_date * 86400 * 1000) + header.mseconds - 3600000).toISOString(),
                elevationAngle: header.elevation_angle,
                station: options?.station || null,
                vcp: Number.isFinite(header.vcp) ? header.vcp : null
            };

            self.postMessage({
                type: 'result',
                geojson,
                meshData,
                bounds,
                metadata,
                timing: {
                    parserStartMs,
                    parserEndMs,
                    meshEndMs
                }
            }, [meshData.buffer]);
        }
    } catch (error) {
        self.postMessage({ type: 'error', message: error?.message || String(error) });
    }
};
