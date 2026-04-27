#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const CAMERA_FILE = path.resolve('src/data/traffic_cameras.json');
const REPORT_FILE = path.resolve('check_cameras.json');
const REQUEST_DELAY_MS = 100;
const REQUEST_TIMEOUT_MS = 10000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPercent(current, total) {
    if (!total) return 100;
    return (current / total) * 100;
}

function isValidStaticUrl(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
}

async function validateImageUrl(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                Accept: 'image/*,*/*;q=0.8'
            }
        });

        if (!response.ok) {
            return { ok: false, reason: `HTTP ${response.status}` };
        }

        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.startsWith('image/')) {
            return {
                ok: false,
                reason: contentType ? `Invalid content-type: ${contentType}` : 'Missing content-type'
            };
        }

        return { ok: true, reason: '' };
    } catch (error) {
        if (error?.name === 'AbortError') {
            return { ok: false, reason: 'Request timeout' };
        }
        return { ok: false, reason: error?.message || 'Request error' };
    } finally {
        clearTimeout(timeoutId);
    }
}

async function main() {
    const raw = await fs.readFile(CAMERA_FILE, 'utf8');
    const data = JSON.parse(raw);

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('traffic_cameras.json must be an object keyed by state names.');
    }

    const checks = [];
    for (const [state, cameras] of Object.entries(data)) {
        if (!Array.isArray(cameras)) continue;

        cameras.forEach((camera, index) => {
            const staticUrl = camera?.stream?.static;
            if (isValidStaticUrl(staticUrl)) {
                checks.push({ state, index, url: staticUrl, name: camera?.name || 'Unnamed camera' });
            }
        });
    }

    const totalChecks = checks.length;
    console.log(`Found ${totalChecks.toLocaleString()} cameras with static URLs to validate.`);

    let passed = 0;
    let failed = 0;
    let checked = 0;
    const failingByState = new Map();
    const failureDetails = [];

    for (const item of checks) {
        const result = await validateImageUrl(item.url);
        checked += 1;

        if (result.ok) {
            passed += 1;
        } else {
            failed += 1;
            if (!failingByState.has(item.state)) {
                failingByState.set(item.state, new Set());
            }
            failingByState.get(item.state).add(item.index);
            failureDetails.push({
                state: item.state,
                index: item.index,
                name: item.name,
                static: item.url,
                reason: result.reason
            });
        }

        const percent = toPercent(checked, totalChecks).toFixed(2);
        process.stdout.write(`\rProgress: ${percent}% (${checked}/${totalChecks})`);

        await sleep(REQUEST_DELAY_MS);
    }

    if (totalChecks > 0) {
        process.stdout.write('\n');
    }

    let removed = 0;
    for (const [state, failingIndexes] of failingByState.entries()) {
        const cameras = data[state];
        if (!Array.isArray(cameras) || failingIndexes.size === 0) continue;

        const filtered = cameras.filter((_, idx) => !failingIndexes.has(idx));
        removed += cameras.length - filtered.length;
        data[state] = filtered;
    }

    // Remove all video streams globally for now.
    let strippedVideoStreams = 0;
    for (const cameras of Object.values(data)) {
        if (!Array.isArray(cameras)) continue;
        for (const camera of cameras) {
            if (!camera || typeof camera !== 'object') continue;
            if (!camera.stream || typeof camera.stream !== 'object') continue;
            const videoUrl = String(camera.stream.video || '').trim();
            if (videoUrl) {
                strippedVideoStreams += 1;
                camera.stream.video = '';
            }
        }
    }

    await fs.writeFile(CAMERA_FILE, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

    const report = {
        generatedAt: new Date().toISOString(),
        requestDelayMs: REQUEST_DELAY_MS,
        timeoutMs: REQUEST_TIMEOUT_MS,
        totals: {
            checked: totalChecks,
            passed,
            failed,
            removed,
            strippedVideoStreams
        },
        failures: failureDetails
    };

    await fs.writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    console.log(`Validation complete. Passed: ${passed}, Failed: ${failed}, Removed: ${removed}, Video streams stripped: ${strippedVideoStreams}.`);
    console.log(`Updated camera file: ${CAMERA_FILE}`);
    console.log(`Report file: ${REPORT_FILE}`);
}

main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
});
