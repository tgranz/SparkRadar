/*

Module to fetch the latest radar binary for the given station from the
official Unidata AWS S3 bucket.

Most of this file was written by ChatGPT.

*/

import { Buffer } from 'buffer';

// Constants
const BUCKET_URL = "https://unidata-nexrad-level2-chunks.s3.amazonaws.com";
const LEVEL3_BUCKET_URL = "https://unidata-nexrad-level3.s3.amazonaws.com";
const FETCH_TIMEOUT_MS = 8000;
const LIST_CACHE_TTL_MS = 30000;
const LATEST_CACHE_TTL_MS = 30000;
let STATION = "";

const listKeysCache = new Map();
const latestUrlCache = new Map();

async function fetchUrl(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return response.text();
}

async function downloadFile(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, { cache: 'no-cache', signal: controller.signal });
    clearTimeout(timeoutId);
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
    const cacheKey = `${bucketUrl}|${prefix}`;
    const cached = listKeysCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < LIST_CACHE_TTL_MS) {
        return cached.keys;
    }

    let continuationToken = null;
    const keys = [];
    do {
        const tokenPart = continuationToken ? `&continuation-token=${encodeURIComponent(continuationToken)}` : '';
        const url = `${bucketUrl}/?list-type=2&prefix=${encodeURIComponent(prefix)}${tokenPart}`;
        const xml = await fetchUrl(url);
        keys.push(...parseKeysFromXml(xml));
        continuationToken = parseNextContinuationToken(xml);
    } while (continuationToken);

    listKeysCache.set(cacheKey, { keys, ts: Date.now() });
    return keys;
}
        
async function getLatestFileUrl(level, product = null) {
    const cacheKey = `${STATION}|${level}|${product ?? ''}`;
    const cached = latestUrlCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < LATEST_CACHE_TTL_MS) {
        return cached.url;
    }

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
                const latestUrl = `${BUCKET_URL}/${latestKey}`;
                latestUrlCache.set(cacheKey, { url: latestUrl, ts: Date.now() });
                return latestUrl;
            }
        }
        throw new Error(`No radar files found in last 5 days.`);
    } else if (level == 3) {
        // Level 3 bucket has flat file structure: SSS_PPP_YYYY_MM_DD_HH_MM_SS
        // SSS = station without leading region prefix, PPP = product code
        // Filter with ?list-type=2&prefix=SSS_PPP_YYYY_MM
        // Remove leading region prefix (K for US, P for Alaska/Hawaii, etc.)
        const stationCode = STATION.substring(1);
        
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

            const datedPrefixes = prefixes.map((prefix) => `${prefix}_${yyyy}_${mm}_${dd}`);
            const keyLists = await Promise.all(
                datedPrefixes.map((datedPrefix) => listKeysForPrefix(datedPrefix, LEVEL3_BUCKET_URL))
            );

            for (const keys of keyLists) {
                if (keys.length > 0) {
                    keys.sort();
                    const latestKey = keys[keys.length - 1];
                    const latestUrl = `${LEVEL3_BUCKET_URL}/${latestKey}`;
                    latestUrlCache.set(cacheKey, { url: latestUrl, ts: Date.now() });
                    return latestUrl;
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

async function queryL2Archive(bucketPrefix) {
    const keys = await listKeysForPrefix(bucketPrefix);
    const level2 = keys.filter((k) => k.endsWith('_V06'));
    if (level2.length === 0) {
        throw new Error(`No radar files found with prefix ${bucketPrefix}`);
    }
    level2.sort();
    return level2.map((key) => {
        const filename = key.split('/').slice(-1)[0];
        const parts = filename.split('_');
        // parts[0] = STATIONYYYYMMDD, parts[1] = HHMMSS, parts[2] = V06
        const stationAndDate = parts[0];
        const timeStr = parts[1];
        
        // Extract date (last 8 characters of first part)
        const dateStr = stationAndDate.slice(-8); // YYYYMMDD
        const yyyy = dateStr.slice(0, 4);
        const mm = dateStr.slice(4, 6);
        const dd = dateStr.slice(6, 8);
        
        // Extract time
        const hh = timeStr.slice(0, 2);
        const min = timeStr.slice(2, 4);
        const ss = timeStr.slice(4, 6);
        
        // Construct ISO timestamp
        const dateTime = `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}Z`;
        
        return {
            dateTime,
            url: `${BUCKET_URL}/${key}`
        };
    });
}

async function loadRadarFileFromUrl(url) {
    const fileName = url.split('/').pop();
    console.log(`Fetching radar file from URL: ${fileName}`);
    const arrayBuffer = await downloadFile(url);
    return {
        data: Buffer.from(arrayBuffer),
        fileName: fileName,
        url: url
    };
}

// Get list of past radar scans for animation
async function getPastScans(station, level, product = null, count = 10) {
    STATION = station;
    
    if (level === 2) {
        // Level 2: Search by date prefix
        const now = new Date();
        const allKeys = [];
        
        for (let i = 0; i < 2; i++) {
            const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            date.setUTCDate(date.getUTCDate() - i);
            const prefix = getDatePrefix(date);
            try {
                const keys = await listKeysForPrefix(prefix);
                const level2 = keys.filter((k) => k.endsWith('_V06'));
                allKeys.push(...level2);
            } catch (error) {
                console.warn(`Failed to fetch keys for ${prefix}:`, error);
            }
        }
        
        if (allKeys.length === 0) {
            return [];
        }
        
        allKeys.sort();
        const recent = allKeys.slice(-count);
        
        return recent.map(key => {
            const fileName = key.split('/').pop();
            const parts = fileName.split('_');
            const stationAndDate = parts[0];
            const timeStr = parts[1];
            
            const dateStr = stationAndDate.slice(-8);
            const yyyy = dateStr.slice(0, 4);
            const mm = dateStr.slice(4, 6);
            const dd = dateStr.slice(6, 8);
            const hh = timeStr.slice(0, 2);
            const min = timeStr.slice(2, 4);
            const ss = timeStr.slice(4, 6);
            
            return {
                url: `${BUCKET_URL}/${key}`,
                fileName,
                timestamp: `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}Z`
            };
        });
    } else if (level === 3) {
        // Level 3: Flat structure
        const stationCode = station.startsWith('K') ? station.substring(1) : station;
        const normalizedProduct = normalizeLevel3Product(product);
        
        const now = new Date();
        const allKeys = [];
        
        for (let i = 0; i < 2; i++) {
            const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            date.setUTCDate(date.getUTCDate() - i);
            const yyyy = date.getUTCFullYear();
            const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(date.getUTCDate()).padStart(2, '0');
            
            const prefix = `${stationCode}_${normalizedProduct}_${yyyy}_${mm}_${dd}`;
            try {
                const keys = await listKeysForPrefix(prefix, LEVEL3_BUCKET_URL);
                allKeys.push(...keys);
            } catch (error) {
                console.warn(`Failed to fetch keys for ${prefix}:`, error);
            }
        }
        
        if (allKeys.length === 0) {
            return [];
        }
        
        allKeys.sort();
        const recent = allKeys.slice(-count);
        
        return recent.map(key => {
            const fileName = key;
            const parts = fileName.split('_');
            // Format: SSS_PPP_YYYY_MM_DD_HH_MM_SS
            const yyyy = parts[2];
            const mm = parts[3];
            const dd = parts[4];
            const hh = parts[5];
            const min = parts[6];
            const ss = parts[7];
            
            return {
                url: `${LEVEL3_BUCKET_URL}/${key}`,
                fileName,
                timestamp: `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}Z`
            };
        });
    }
    
    return [];
}

export { 
    checkLatestL2RadarFile,
    checkLatestL3RadarFile,
    loadLatestL2RadarFile,
    loadLatestL3RadarFile,
    queryL2Archive,
    listKeysForPrefix,
    loadRadarFileFromUrl,
    getPastScans,
    BUCKET_URL
};