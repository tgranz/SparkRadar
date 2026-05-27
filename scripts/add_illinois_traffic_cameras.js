#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const CAMERA_FILE = path.resolve('src/data/traffic_cameras.json');
const ILLINOIS_STATE_KEY = 'Illinois';
const ILLINOIS_GEOJSON_BASE_URL = 'https://services2.arcgis.com/aIrBD8yn1TDTEXoz/arcgis/rest/services/TrafficCamerasTM_Public/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson';
const INITIAL_RESULT_RECORD_COUNT = 1000;
const MAX_RESULT_RECORD_COUNT = 50000;
const MAX_PAGE_REQUESTS = 200;

function toFiniteNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function pickFirstText(...values) {
    for (const value of values) {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed) {
                return trimmed;
            }
        }
    }
    return '';
}

function normalizeDirection(value) {
    const text = pickFirstText(value).toUpperCase();
    if (!text) {
        return '';
    }

    if (text === 'N' || text === 'NORTH') return 'N';
    if (text === 'S' || text === 'SOUTH') return 'S';
    if (text === 'E' || text === 'EAST') return 'E';
    if (text === 'W' || text === 'WEST') return 'W';
    if (text === 'NE' || text === 'NORTHEAST') return 'NE';
    if (text === 'NW' || text === 'NORTHWEST') return 'NW';
    if (text === 'SE' || text === 'SOUTHEAST') return 'SE';
    if (text === 'SW' || text === 'SOUTHWEST') return 'SW';

    return text;
}

function getLatLon(feature) {
    const lonFromGeom = toFiniteNumber(feature?.geometry?.coordinates?.[0]);
    const latFromGeom = toFiniteNumber(feature?.geometry?.coordinates?.[1]);

    if (Number.isFinite(latFromGeom) && Number.isFinite(lonFromGeom)) {
        return { lat: latFromGeom, lon: lonFromGeom };
    }

    const latFromProps = toFiniteNumber(feature?.properties?.y);
    const lonFromProps = toFiniteNumber(feature?.properties?.x);

    if (Number.isFinite(latFromProps) && Number.isFinite(lonFromProps)) {
        return { lat: latFromProps, lon: lonFromProps };
    }

    return null;
}

function buildCameraFromFeature(feature) {
    const latLon = getLatLon(feature);
    if (!latLon) {
        return null;
    }

    const props = feature?.properties || {};
    const name = pickFirstText(props.CameraLocation, `Illinois camera ${feature?.id ?? ''}`);
    if (!name) {
        return null;
    }

    const staticUrl = pickFirstText(props.SnapShot);
    const videoUrl = '';

    return {
        lat: latLon.lat,
        lon: latLon.lon,
        name,
        facing: normalizeDirection(props.CameraDirection),
        stream: {
            static: staticUrl,
            video: videoUrl,
            encoding: 'JPEG',
            format: 'IMAGE_STREAM'
        }
    };
}

function cameraKey(camera) {
    return [
        Number(camera.lat).toFixed(6),
        Number(camera.lon).toFixed(6),
        String(camera.name || '').trim().toLowerCase(),
        String(camera.facing || '').trim().toUpperCase()
    ].join('|');
}

async function loadCameraJson() {
    const raw = await fs.readFile(CAMERA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('traffic_cameras.json must be an object keyed by state name.');
    }
    return parsed;
}

async function fetchIllinoisGeoJson() {
    async function fetchPage(resultRecordCount, resultOffset = 0) {
        const url = `${ILLINOIS_GEOJSON_BASE_URL}&resultRecordCount=${resultRecordCount}&resultOffset=${resultOffset}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/geo+json,application/json,text/plain;q=0.9,*/*;q=0.8'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Illinois camera GeoJSON (${response.status} ${response.statusText})`);
        }

        const data = await response.json();
        if (!data || !Array.isArray(data.features)) {
            throw new Error('Invalid Illinois camera GeoJSON: expected a features array.');
        }

        return data;
    }

    let resultRecordCount = INITIAL_RESULT_RECORD_COUNT;
    let attempt = 0;
    let lastData = null;

    while (resultRecordCount <= MAX_RESULT_RECORD_COUNT) {
        attempt += 1;
        const data = await fetchPage(resultRecordCount, 0);
        lastData = data;

        const exceededTransferLimit = Boolean(data?.properties?.exceededTransferLimit);
        console.log(`Illinois fetch attempt ${attempt}: resultRecordCount=${resultRecordCount.toLocaleString()}, features=${data.features.length.toLocaleString()}, exceededTransferLimit=${exceededTransferLimit}`);

        if (!exceededTransferLimit) {
            return data.features;
        }

        resultRecordCount *= 2;
    }

    const fallbackPageSize = INITIAL_RESULT_RECORD_COUNT;
    console.log(`Transfer limit remained exceeded after resultRecordCount escalation. Falling back to resultOffset pagination (pageSize=${fallbackPageSize.toLocaleString()}).`);

    const allFeatures = [];
    const seenIds = new Set();

    for (let pageIndex = 0; pageIndex < MAX_PAGE_REQUESTS; pageIndex += 1) {
        const resultOffset = pageIndex * fallbackPageSize;
        const data = await fetchPage(fallbackPageSize, resultOffset);
        const exceededTransferLimit = Boolean(data?.properties?.exceededTransferLimit);
        const pageFeatures = data.features;

        let addedFromPage = 0;
        for (const feature of pageFeatures) {
            const id = feature?.id;
            const key = id == null
                ? JSON.stringify([feature?.geometry?.coordinates, feature?.properties?.CameraLocation, feature?.properties?.CameraDirection])
                : String(id);

            if (seenIds.has(key)) {
                continue;
            }

            seenIds.add(key);
            allFeatures.push(feature);
            addedFromPage += 1;
        }

        console.log(`Illinois paged fetch ${pageIndex + 1}: offset=${resultOffset.toLocaleString()}, features=${pageFeatures.length.toLocaleString()}, added=${addedFromPage.toLocaleString()}, exceededTransferLimit=${exceededTransferLimit}`);

        if (!exceededTransferLimit || pageFeatures.length < fallbackPageSize || pageFeatures.length === 0) {
            break;
        }
    }

    if (allFeatures.length > 0) {
        return allFeatures;
    }

    if (lastData && Array.isArray(lastData.features)) {
        return lastData.features;
    }

    throw new Error('Unable to fetch Illinois cameras after transfer-limit pagination attempts.');
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const [cameraJson, features] = await Promise.all([
        loadCameraJson(),
        fetchIllinoisGeoJson()
    ]);

    const existingIllinois = Array.isArray(cameraJson[ILLINOIS_STATE_KEY]) ? cameraJson[ILLINOIS_STATE_KEY] : [];
    const mappedCameras = [];
    const seen = new Set();

    let invalidFeatures = 0;
    let duplicateFeatures = 0;

    for (const feature of features) {
        const mapped = buildCameraFromFeature(feature);
        if (!mapped) {
            invalidFeatures += 1;
            continue;
        }

        const key = cameraKey(mapped);
        if (seen.has(key)) {
            duplicateFeatures += 1;
            continue;
        }

        seen.add(key);
        mappedCameras.push(mapped);
    }

    cameraJson[ILLINOIS_STATE_KEY] = mappedCameras;

    if (!dryRun) {
        await fs.writeFile(CAMERA_FILE, `${JSON.stringify(cameraJson, null, 2)}\n`, 'utf8');
    }

    console.log(`Illinois import ${dryRun ? '(dry run) ' : ''}complete.`);
    console.log(`Fetched features: ${features.length.toLocaleString()}`);
    console.log(`Previous Illinois cameras removed: ${existingIllinois.length.toLocaleString()}`);
    console.log(`New Illinois cameras written: ${mappedCameras.length.toLocaleString()}`);
    console.log(`Duplicate features skipped: ${duplicateFeatures.toLocaleString()}`);
    console.log(`Invalid/unusable features: ${invalidFeatures.toLocaleString()}`);
    if (!dryRun) {
        console.log(`Updated file: ${CAMERA_FILE}`);
    }
}

main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
});
