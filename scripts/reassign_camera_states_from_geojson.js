#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const CAMERA_FILE = path.resolve('src/data/traffic_cameras.json');
const STATES_GEOJSON_URL = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/refs/heads/master/data/geojson/us-states.json';

function toFiniteNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function isPointOnSegment(point, a, b, epsilon = 1e-9) {
    const [px, py] = point;
    const [ax, ay] = a;
    const [bx, by] = b;

    // Guard against zero-length segments (duplicate closing vertices in rings).
    // For these, only treat as on-segment when point is effectively the same coordinate.
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= epsilon * epsilon) {
        const ddx = px - ax;
        const ddy = py - ay;
        return (ddx * ddx + ddy * ddy) <= epsilon * epsilon;
    }

    const cross = (py - ay) * dx - (px - ax) * dy;
    if (Math.abs(cross) > epsilon) {
        return false;
    }

    const dot = (px - ax) * dx + (py - ay) * dy;
    if (dot < -epsilon) {
        return false;
    }

    if (dot - lenSq > epsilon) {
        return false;
    }

    return true;
}

function isPointInRing(point, ring) {
    if (!Array.isArray(ring) || ring.length < 3) {
        return false;
    }

    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];

        if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) {
            continue;
        }

        if (isPointOnSegment(point, a, b)) {
            return true;
        }

        const xi = a[0];
        const yi = a[1];
        const xj = b[0];
        const yj = b[1];

        const intersects = ((yi > y) !== (yj > y))
            && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);

        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
}

function isPointInPolygon(point, polygonRings) {
    if (!Array.isArray(polygonRings) || polygonRings.length === 0) {
        return false;
    }

    // GeoJSON polygon ring order: [outer, hole1, hole2, ...]
    if (!isPointInRing(point, polygonRings[0])) {
        return false;
    }

    for (let i = 1; i < polygonRings.length; i++) {
        if (isPointInRing(point, polygonRings[i])) {
            return false;
        }
    }

    return true;
}

function isPointInGeometry(point, geometry) {
    if (!geometry || typeof geometry !== 'object') {
        return false;
    }

    if (geometry.type === 'Polygon') {
        return isPointInPolygon(point, geometry.coordinates);
    }

    if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
        for (const polygon of geometry.coordinates) {
            if (isPointInPolygon(point, polygon)) {
                return true;
            }
        }
    }

    return false;
}

function findContainingState(point, stateFeatures) {
    for (const feature of stateFeatures) {
        if (isPointInGeometry(point, feature.geometry)) {
            return String(feature.properties?.name || '').trim() || null;
        }
    }
    return null;
}

async function fetchStatesGeoJson() {
    const response = await fetch(STATES_GEOJSON_URL, {
        method: 'GET',
        headers: {
            Accept: 'application/geo+json,application/json,text/plain;q=0.9,*/*;q=0.8'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch state GeoJSON (${response.status} ${response.statusText})`);
    }

    const geoJson = await response.json();
    if (!geoJson || !Array.isArray(geoJson.features)) {
        throw new Error('Invalid state GeoJSON payload: missing features array');
    }

    return geoJson.features.filter((feature) => {
        return feature?.geometry && typeof feature.geometry === 'object';
    });
}

async function loadCamerasByState() {
    const raw = await fs.readFile(CAMERA_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('traffic_cameras.json must be an object keyed by state name');
    }

    return parsed;
}

async function main() {
    const [stateFeatures, camerasByState] = await Promise.all([
        fetchStatesGeoJson(),
        loadCamerasByState()
    ]);

    const originalStateOrder = Object.keys(camerasByState);
    const reassigned = {};
    originalStateOrder.forEach((state) => {
        reassigned[state] = [];
    });

    let total = 0;
    let matched = 0;
    let moved = 0;
    let unresolved = 0;
    const assignedCounts = {};

    for (const [sourceState, cameras] of Object.entries(camerasByState)) {
        if (!Array.isArray(cameras)) {
            continue;
        }

        for (const camera of cameras) {
            total += 1;

            const lat = toFiniteNumber(camera?.lat);
            const lon = toFiniteNumber(camera?.lon);
            const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);

            let targetState = sourceState;
            if (hasCoords) {
                const inferredState = findContainingState([lon, lat], stateFeatures);
                if (inferredState) {
                    matched += 1;
                    targetState = inferredState;
                } else {
                    unresolved += 1;
                }
            } else {
                unresolved += 1;
            }

            if (!Object.prototype.hasOwnProperty.call(reassigned, targetState)) {
                reassigned[targetState] = [];
            }

            if (targetState !== sourceState) {
                moved += 1;
            }

            assignedCounts[targetState] = (assignedCounts[targetState] || 0) + 1;
            reassigned[targetState].push(camera);
        }
    }

    const assignedStateCount = Object.keys(assignedCounts).length;
    if (total > 500 && matched > 0 && assignedStateCount <= 1) {
        throw new Error('Safety stop: reassignment collapsed into a single state; output was not written.');
    }

    await fs.writeFile(CAMERA_FILE, `${JSON.stringify(reassigned, null, 2)}\n`, 'utf8');

    console.log('Camera state reassignment complete.');
    console.log(`Total cameras: ${total.toLocaleString()}`);
    console.log(`Matched to state polygons: ${matched.toLocaleString()}`);
    console.log(`Moved to different state buckets: ${moved.toLocaleString()}`);
    console.log(`Unresolved (kept original state): ${unresolved.toLocaleString()}`);
    console.log(`Updated file: ${CAMERA_FILE}`);
}

main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
});
