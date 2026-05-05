#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const OUTPUT_FILE = path.join(REPO_ROOT, 'src', 'data', 'cities_database.geojson');
const REQUEST_DELAY_MS = 1000;
const SOURCE_BASE_URL =
  'https://raw.githubusercontent.com/generalpiston/geojson-us-city-boundaries/refs/heads/master/states';

const STATE_CODES = [
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga',
  'hi', 'id', 'il', 'in', 'ia', 'ks', 'ky', 'la', 'me', 'md',
  'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj',
  'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc',
  'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy',
  'dc'
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toFourDecimals(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }
  return Number(num.toFixed(4));
}

function normalizeFeature(feature, stateCode) {
  const properties = feature?.properties ?? {};
  const lat = toFourDecimals(properties.INTPTLAT);
  const lon = toFourDecimals(properties.INTPTLON);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return {
    type: 'Feature',
    properties: {
      state: stateCode.toUpperCase(),
      statefp: String(properties.STATEFP || ''),
      placefp: String(properties.PLACEFP || ''),
      geoid: String(properties.GEOID || ''),
      name: String(properties.NAME || ''),
      namelsad: String(properties.NAMELSAD || ''),
      lat,
      lon
    },
    geometry: {
      type: 'Point',
      coordinates: [lon, lat]
    }
  };
}

async function fetchStateCities(stateCode) {
  const url = `${SOURCE_BASE_URL}/${stateCode}.json`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/geo+json,application/json,text/plain;q=0.9,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${stateCode.toUpperCase()} (${response.status} ${response.statusText})`);
  }

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.features)) {
    throw new Error(`Invalid GeoJSON payload for ${stateCode.toUpperCase()}: missing features array`);
  }

  return payload.features;
}

async function main() {
  const allFeatures = [];
  let totalInputFeatures = 0;
  let skippedInvalidPoints = 0;

  for (let i = 0; i < STATE_CODES.length; i += 1) {
    const stateCode = STATE_CODES[i];
    const progress = `${i + 1}/${STATE_CODES.length}`;

    console.log(`[${progress}] Fetching ${stateCode.toUpperCase()}...`);
    const sourceFeatures = await fetchStateCities(stateCode);
    totalInputFeatures += sourceFeatures.length;

    let addedForState = 0;
    for (const sourceFeature of sourceFeatures) {
      const pointFeature = normalizeFeature(sourceFeature, stateCode);
      if (!pointFeature) {
        skippedInvalidPoints += 1;
        continue;
      }

      addedForState += 1;
      allFeatures.push(pointFeature);
    }

    console.log(`[${progress}] ${stateCode.toUpperCase()}: ${addedForState}/${sourceFeatures.length} cities added`);

    if (i < STATE_CODES.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  const output = {
    type: 'FeatureCollection',
    generatedAt: new Date().toISOString(),
    source: SOURCE_BASE_URL,
    states: STATE_CODES.map((code) => code.toUpperCase()),
    featureCount: allFeatures.length,
    features: allFeatures
  };

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log('Cities database build complete.');
  console.log(`Input features: ${totalInputFeatures.toLocaleString()}`);
  console.log(`Output point features: ${allFeatures.length.toLocaleString()}`);
  console.log(`Skipped invalid INTPTLAT/INTPTLON records: ${skippedInvalidPoints.toLocaleString()}`);
  console.log(`Wrote: ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
