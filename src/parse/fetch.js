/*

Module to fetch the latest radar binary for the given station from the
official Unidata AWS S3 bucket.

Most of this file was written by ChatGPT.

*/

import { Buffer } from 'buffer';

// Constants
const BUCKET_URL = "https://unidata-nexrad-level2.s3.amazonaws.com";
let STATION = "";

async function fetchUrl(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return response.text();
}

async function downloadFile(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
    }
    return response.arrayBuffer();
}

function getDatePrefix(date) {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd}/${STATION}/`;
}
    
function parseKeysFromXml(xml) {
    const keyRegex = /<Key>([^<]+)<\/Key>/g;
    const keys = [];
    let match;
    while ((match = keyRegex.exec(xml)) !== null) {
        keys.push(match[1]);
    }
    return keys;
}

function parseIsTruncated(xml) {
    return /<IsTruncated>true<\/IsTruncated>/.test(xml);
}

function parseNextContinuationToken(xml) {
    const match = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
    return match ? match[1] : null;
}

function normalizeLevel3Product(product) {
    if (!product) return product;
    const upper = product.toUpperCase();
    // REF translates to N0R
    if (upper === 'REF') return 'N0Z';
    return upper;
}

async function listKeysForPrefix(prefix, bucketUrl = BUCKET_URL) {
    let continuationToken = null;
    const keys = [];
    do {
        const tokenPart = continuationToken ? `&continuation-token=${encodeURIComponent(continuationToken)}` : '';
        const url = `${bucketUrl}/?list-type=2&prefix=${encodeURIComponent(prefix)}${tokenPart}`;
        const xml = await fetchUrl(url);
        keys.push(...parseKeysFromXml(xml));
        continuationToken = parseNextContinuationToken(xml);
    } while (continuationToken);
    return keys;
}
        
async function getLatestFileUrl(level, product = null) {
    if (level == 2) {
        const now = new Date();
        for (let i = 0; i < 5; i++) {
            const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            date.setUTCDate(date.getUTCDate() - i);
            const prefix = getDatePrefix(date);
            const keys = await listKeysForPrefix(prefix);
            const level2 = keys.filter((k) => k.endsWith('_V06'));
            if (level2.length > 0) {
                level2.sort();
                const latestKey = level2[level2.length - 1];
                return `${BUCKET_URL}/${latestKey}`;
            }
        }
        throw new Error(`No radar files found in last 5 days.`);
    } else if (level == 3) {
        // Level 3 bucket has flat file structure: SSS_PPP_YYYY_MM_DD_HH_MM_SS
        // SSS = station without leading K, PPP = product code
        // Filter with ?list-type=2&prefix=SSS_PPP_YYYY_MM
        const level3BucketUrl = "https://unidata-nexrad-level3.s3.amazonaws.com";
        
        // Remove leading K from station for Level 3 naming
        const stationCode = STATION.startsWith('K') ? STATION.substring(1) : STATION;
        
        // Build prefix to match station and product: "SSS_PPP_"
        const normalizedProduct = normalizeLevel3Product(product);
        const prefixes = normalizedProduct
            ? [`${stationCode}_${normalizedProduct}`]
            : [`${stationCode}`];

        const now = new Date();
        for (let i = 0; i < 30; i += 1) {
            const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            date.setUTCDate(date.getUTCDate() - i);
            const yyyy = date.getUTCFullYear();
            const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(date.getUTCDate()).padStart(2, '0');

            for (const prefix of prefixes) {
                const datedPrefix = `${prefix}_${yyyy}_${mm}_${dd}`;
                const keys = await listKeysForPrefix(datedPrefix, level3BucketUrl);
                if (keys.length > 0) {
                    keys.sort();
                    const latestKey = keys[keys.length - 1];
                    return `${level3BucketUrl}/${latestKey}`;
                }
            }
        }

        throw new Error(`No Level 3 radar files found for ${STATION}${product ? '/' + product : ''} in the last 30 days.`);
    } else {
        throw new Error(`Invalid level: ${level}`);
    }
}

async function loadLatestL2RadarFile(station) {
    STATION = station;
    const latestUrl = await getLatestFileUrl(2);
    const fileName = latestUrl.split('/').pop();
    console.log(`Fetching latest radar file: ${fileName}`);
    const arrayBuffer = await downloadFile(latestUrl);
    return {
        data: Buffer.from(arrayBuffer),
        fileName: fileName,
        url: latestUrl
    };
}

async function loadLatestL3RadarFile(station, product = null) {
    STATION = station;
    const latestUrl = await getLatestFileUrl(3, product);
    const fileName = latestUrl.split('/').pop();
    console.log(`Fetching latest Level 3 radar file: ${fileName}`);
    const arrayBuffer = await downloadFile(latestUrl);
    return {
        data: Buffer.from(arrayBuffer),
        fileName: fileName,
        url: latestUrl
    };
}

async function checkLatestL2RadarFile(station) {
    STATION = station;
    try {
        const latestUrl = await getLatestFileUrl(2);
        return latestUrl.split('/').pop();
    } catch (error) {
        return false;
    }
}

async function checkLatestL3RadarFile(station, product = null) {
    STATION = station;
    product = normalizeLevel3Product(product);
    try {
        const latestUrl = await getLatestFileUrl(3, product);
        return latestUrl.split('/').pop();
    } catch (error) {
        return false;
    }
}

export { checkLatestL2RadarFile, checkLatestL3RadarFile, loadLatestL2RadarFile, loadLatestL3RadarFile };