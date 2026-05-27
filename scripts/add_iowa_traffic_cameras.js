#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const CAMERA_FILE = path.resolve('src/data/traffic_cameras.json');
const IOWA_STATE_KEY = 'Iowa';
const IOWA_GEOJSON_URL = 'https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/Traffic_Cameras_View/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson';

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

function inferFacing(featureProps) {
    const text = `${pickFirstText(featureProps?.Desc_)} ${pickFirstText(featureProps?.ImageName)}`.toUpperCase();
    if (!text) {
        return '';
    }

    const checks = [
        { regex: /\bNORTHEAST\b|\bNE\b/, value: 'NE' },
        { regex: /\bNORTHWEST\b|\bNW\b/, value: 'NW' },
        { regex: /\bSOUTHEAST\b|\bSE\b/, value: 'SE' },
        { regex: /\bSOUTHWEST\b|\bSW\b/, value: 'SW' },
        { regex: /\bNORTHBOUND\b|\bNORTH\b|\bNB\b/, value: 'N' },
        { regex: /\bSOUTHBOUND\b|\bSOUTH\b|\bSB\b/, value: 'S' },
        { regex: /\bEASTBOUND\b|\bEAST\b|\bEB\b/, value: 'E' },
        { regex: /\bWESTBOUND\b|\bWEST\b|\bWB\b/, value: 'W' }
    ];

    for (const check of checks) {
        if (check.regex.test(text)) {
            return check.value;
        }
    }

    return '';
}

function getLatLon(feature) {
    const lonFromGeom = toFiniteNumber(feature?.geometry?.coordinates?.[0]);
    const latFromGeom = toFiniteNumber(feature?.geometry?.coordinates?.[1]);

    if (Number.isFinite(latFromGeom) && Number.isFinite(lonFromGeom)) {
        return { lat: latFromGeom, lon: lonFromGeom };
    }

    const latFromProps = toFiniteNumber(feature?.properties?.latitude ?? feature?.properties?.lat);
    const lonFromProps = toFiniteNumber(feature?.properties?.longitude ?? feature?.properties?.long);

    if (Number.isFinite(latFromProps) && Number.isFinite(lonFromProps)) {
        return { lat: latFromProps, lon: lonFromProps };
    }

    return null;
}

function buildStream(featureProps) {
    const staticUrl = pickFirstText(featureProps?.ImageURL);
    const videoUrl = pickFirstText(featureProps?.VideoURL_HD, featureProps?.VideoURL_HB, featureProps?.VideoURL);

    let encoding = 'JPEG';
    let format = 'IMAGE_STREAM';

    if (!staticUrl && videoUrl) {
        const lowerVideoUrl = videoUrl.toLowerCase();
        if (lowerVideoUrl.includes('.m3u8')) {
            encoding = 'HLS';
            format = 'M3U8';
        } else if (lowerVideoUrl.includes('.mp4')) {
            encoding = 'H264';
            format = 'MP4';
        }
    }

    return {
        static: staticUrl,
        video: videoUrl,
        encoding,
        format
    };
}

function buildCameraFromFeature(feature) {
    const latLon = getLatLon(feature);
    if (!latLon) {
        return null;
    }

    const props = feature?.properties || {};
    const name = pickFirstText(props.Desc_, props.ImageName, props.COMMON_ID, props.Route, `Iowa camera ${feature?.id ?? ''}`);

    if (!name) {
        return null;
    }

    return {
        lat: latLon.lat,
        lon: latLon.lon,
        name,
        facing: inferFacing(props),
        stream: buildStream(props)
    };
}

function cameraKey(camera) {
    return [
        Number(camera.lat).toFixed(6),
        Number(camera.lon).toFixed(6),
        String(camera.name || '').trim().toLowerCase()
    ].join('|');
}

function mergeCamera(existing, incoming) {
    let updated = false;

    if (!existing.facing && incoming.facing) {
        existing.facing = incoming.facing;
        updated = true;
    }

    if (!existing.stream || typeof existing.stream !== 'object') {
        existing.stream = {
            static: '',
            video: '',
            encoding: incoming.stream?.encoding || 'JPEG',
            format: incoming.stream?.format || 'IMAGE_STREAM'
        };
        updated = true;
    }

    const existingStatic = pickFirstText(existing.stream.static);
    const existingVideo = pickFirstText(existing.stream.video);

    if (!existingStatic && incoming.stream.static) {
        existing.stream.static = incoming.stream.static;
        updated = true;
    }

    if (!existingVideo && incoming.stream.video) {
        existing.stream.video = incoming.stream.video;
        updated = true;
    }

    if (!pickFirstText(existing.stream.encoding) && incoming.stream.encoding) {
        existing.stream.encoding = incoming.stream.encoding;
        updated = true;
    }

    if (!pickFirstText(existing.stream.format) && incoming.stream.format) {
        existing.stream.format = incoming.stream.format;
        updated = true;
    }

    return updated;
}

async function loadCameraJson() {
    const raw = await fs.readFile(CAMERA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('traffic_cameras.json must be an object keyed by state name.');
    }
    return parsed;
}

async function fetchIowaGeoJson() {
    const response = await fetch(IOWA_GEOJSON_URL, {
        method: 'GET',
        headers: {
            Accept: 'application/geo+json,application/json,text/plain;q=0.9,*/*;q=0.8'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Iowa camera GeoJSON (${response.status} ${response.statusText})`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.features)) {
        throw new Error('Invalid Iowa camera GeoJSON: expected a features array.');
    }

    return data.features;
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const [cameraJson, features] = await Promise.all([
        loadCameraJson(),
        fetchIowaGeoJson()
    ]);

    if (!Array.isArray(cameraJson[IOWA_STATE_KEY])) {
        cameraJson[IOWA_STATE_KEY] = [];
    }

    const iowaCameras = cameraJson[IOWA_STATE_KEY];
    const existingByKey = new Map();
    iowaCameras.forEach((camera) => {
        existingByKey.set(cameraKey(camera), camera);
    });

    let invalidFeatures = 0;
    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const feature of features) {
        const mapped = buildCameraFromFeature(feature);
        if (!mapped) {
            invalidFeatures += 1;
            continue;
        }

        const key = cameraKey(mapped);
        const existing = existingByKey.get(key);
        if (!existing) {
            iowaCameras.push(mapped);
            existingByKey.set(key, mapped);
            added += 1;
            continue;
        }

        if (mergeCamera(existing, mapped)) {
            updated += 1;
        } else {
            skipped += 1;
        }
    }

    if (!dryRun) {
        await fs.writeFile(CAMERA_FILE, `${JSON.stringify(cameraJson, null, 2)}\n`, 'utf8');
    }

    console.log(`Iowa import ${dryRun ? '(dry run) ' : ''}complete.`);
    console.log(`Fetched features: ${features.length.toLocaleString()}`);
    console.log(`Added cameras: ${added.toLocaleString()}`);
    console.log(`Updated existing cameras: ${updated.toLocaleString()}`);
    console.log(`Skipped unchanged cameras: ${skipped.toLocaleString()}`);
    console.log(`Invalid/unusable features: ${invalidFeatures.toLocaleString()}`);
    if (!dryRun) {
        console.log(`Updated file: ${CAMERA_FILE}`);
    }
}

main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
});
