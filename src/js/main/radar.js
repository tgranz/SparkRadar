/*

> radar.js
This module handles the radar on a map.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import { checkLatestL2RadarFile, checkLatestL3RadarFile, loadLatestL2RadarFile, loadLatestL3RadarFile, loadRadarFileFromUrl } from '../../parse/fetch.js';
import { Level2Radar } from '../../parse/level2/src/index.js';
import nexradLevel3Data from '../../parse/level3/src/browser.js';
import RadarCache from './radar_cache.js';
import ChunkLoader from '../../parse/chunkloader.js';

// Helper function to yield to the browser between processing iterations
const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

const EARTH_RADIUS = 6371000;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// Set to true to use a flat-Earth approximation instead of the full spherical
// projection. The approximation is ~4× faster with a maximum positional error
// of roughly 5 km at 250 km range — imperceptible at radar gate resolution.
const USE_FLAT_EARTH = false;

class Radar {
    // Constructor function
    constructor() {
        this.latestRadarFiles = { L2: null, L3: {} };
        this.radarStation = 'KIWX'
        this.radarGeoJson = null;
        this.workerSupported = typeof Worker !== 'undefined';
        this.level2ChunkLoader = new ChunkLoader();
        this.level2ChunkStation = null;
        this.level2ChunkStreamStarted = false;
        this.level2ChunkDataCache = new Map();
        this.level2ChunkDataCacheBytes = 0;
        this.level2ChunkDataCacheMaxBytes = 200 * 1024 * 1024;
        this.latestL2RenderKeys = new Map();
        this.lastKnownVcpByStation = new Map();
        
        // Incremental chunk rendering state
        this.incrementalChunkState = {
            station: null,
            layer: null,
            volumeId: null,
            chunkMeshes: [], // Array of {meshData, bounds}
            renderedChunkNumbers: new Set(), // Track which chunks we've processed
            lastRenderTime: null,
            renderCallback: null, // Callback when new mesh is ready
            isEnabled: false, // Whether incremental rendering is active
        };

        let savedCacheSlots = 6;
        let savedCacheSizeGB = 0;
        try {
            const settings = JSON.parse(localStorage.getItem('settings') || '{}');
            if (Number.isFinite(settings.cacheMaxSlots) && settings.cacheMaxSlots > 0) {
                savedCacheSlots = settings.cacheMaxSlots;
            }
            if (Number.isFinite(settings.cacheMaxSizeGB) && settings.cacheMaxSizeGB >= 0) {
                savedCacheSizeGB = settings.cacheMaxSizeGB;
            }
        } catch {
            // Ignore malformed settings and keep defaults.
        }

        this.cache = new RadarCache(savedCacheSlots, savedCacheSizeGB);
    }

    _pruneL2ChunkCache() {
        if (this.level2ChunkDataCacheBytes <= this.level2ChunkDataCacheMaxBytes) {
            return;
        }

        const entries = Array.from(this.level2ChunkDataCache.entries())
            .sort((a, b) => (a[1]?.lastAccessMs || 0) - (b[1]?.lastAccessMs || 0));

        for (let i = 0; i < entries.length && this.level2ChunkDataCacheBytes > this.level2ChunkDataCacheMaxBytes; i++) {
            const [url, entry] = entries[i];
            this.level2ChunkDataCache.delete(url);
            this.level2ChunkDataCacheBytes = Math.max(0, this.level2ChunkDataCacheBytes - (entry?.size || 0));
            console.log(`[L2ChunkCache] Evicted chunk (${entry?.size || 0} bytes): ${url}`);
        }
    }

    _getCachedL2ChunkBuffer(url) {
        const entry = this.level2ChunkDataCache.get(url);
        if (!entry?.buffer) return null;

        entry.lastAccessMs = Date.now();
        return entry.buffer;
    }

    _setCachedL2ChunkBuffer(url, buffer) {
        if (!url || !buffer) return;

        const existing = this.level2ChunkDataCache.get(url);
        if (existing) {
            this.level2ChunkDataCacheBytes = Math.max(0, this.level2ChunkDataCacheBytes - (existing.size || 0));
        }

        const size = Number(buffer?.byteLength || buffer?.length || 0);
        this.level2ChunkDataCache.set(url, {
            buffer,
            size,
            lastAccessMs: Date.now(),
        });
        this.level2ChunkDataCacheBytes += size;
        this._pruneL2ChunkCache();
    }

    _getChunkTimeIsoFromUrl(chunkUrl) {
        if (!chunkUrl || typeof chunkUrl !== 'string') return null;
        const fileName = chunkUrl.split('/').pop() || '';
        const parts = fileName.split('-');
        if (parts.length < 3) return null;

        const yyyymmdd = parts[0];
        const hhmmss = parts[1];
        if (!/^\d{8}$/.test(yyyymmdd) || !/^\d{6}$/.test(hhmmss)) {
            return null;
        }

        const year = yyyymmdd.slice(0, 4);
        const month = yyyymmdd.slice(4, 6);
        const day = yyyymmdd.slice(6, 8);
        const hour = hhmmss.slice(0, 2);
        const minute = hhmmss.slice(2, 4);
        const second = hhmmss.slice(4, 6);
        return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
    }

    _extractChunkNumberAndVolumeId(chunkUrl) {
        // Extract chunk metadata from URL.
        // Supports both:
        // 1) .../<station>/<volumeId>/YYYYMMDD-HHMMSS-###-X
        // 2) .../YYYYMMDD-HHMMSS-<station>-T2_####_X
        if (!chunkUrl || typeof chunkUrl !== 'string') {
            return { chunkNum: null, volumeId: null, suffix: null };
        }

        const pathParts = chunkUrl.split('/').filter(Boolean);
        const fileName = pathParts[pathParts.length - 1] || '';
        const nameParts = fileName.split('-');

        // Prefer volume id from path: .../<station>/<volumeId>/<file>
        const maybeVolumeId = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : null;
        const volumeId = /^\d+$/.test(String(maybeVolumeId || '')) ? String(maybeVolumeId) : null;

        let chunkNum = null;
        let suffix = null;

        // New format: YYYYMMDD-HHMMSS-###-X
        if (nameParts.length >= 4 && /^\d+$/.test(nameParts[2])) {
            chunkNum = parseInt(nameParts[2], 10);
            suffix = (nameParts[3] || '').toUpperCase() || null;
        }

        // Legacy format fallback: ...-T2_####_X
        if (!Number.isFinite(chunkNum)) {
            const lastPart = nameParts[nameParts.length - 1] || '';
            const legacyMatch = lastPart.match(/T2_(\d+)_([A-Za-z])?/);
            if (legacyMatch) {
                chunkNum = parseInt(legacyMatch[1], 10);
                suffix = (legacyMatch[2] || '').toUpperCase() || suffix;
            }
        }

        if (!Number.isFinite(chunkNum)) {
            chunkNum = null;
        }

        return { chunkNum, volumeId, suffix };
    }

    async _renderChunkIncremental(chunkUrl, layer, station, renderCallback) {
        // Process a single chunk when it arrives via the stream
        const { chunkNum, volumeId } = this._extractChunkNumberAndVolumeId(chunkUrl);
        
        // Skip chunk 1 (header-only, no radials)
        if (chunkNum === 1) {
            console.log(`[L2ChunkRender] Skipping chunk 1 (header-only): ${chunkUrl}`);
            return;
        }
        
        // Verify chunk is in valid range (2-14)
        if (!chunkNum || chunkNum < 2 || chunkNum > 14) {
            console.log(`[L2ChunkRender] Ignoring chunk outside valid range (2-14): chunkNum=${chunkNum}`);
            return;
        }
        
        // If this is a new volume, reset state
        if (volumeId && volumeId !== this.incrementalChunkState.volumeId) {
            console.log(`[L2ChunkRender] New volume detected, resetting incremental state: ${volumeId}`);
            this.incrementalChunkState.volumeId = volumeId;
            this.incrementalChunkState.chunkMeshes = [];
            this.incrementalChunkState.renderedChunkNumbers.clear();
            this.incrementalChunkState.station = station;
            this.incrementalChunkState.layer = layer;
        }
        
        // Skip if we already processed this chunk
        if (this.incrementalChunkState.renderedChunkNumbers.has(chunkNum)) {
            console.log(`[L2ChunkRender] Already processed chunk ${chunkNum}, skipping`);
            return;
        }
        
        try {
            console.log(`[L2ChunkRender] Processing chunk ${chunkNum}: ${chunkUrl}`);
            
            // Get or download the chunk buffer
            let buffer = this._getCachedL2ChunkBuffer(chunkUrl);
            if (!buffer) {
                const response = await fetch(chunkUrl, { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(`Chunk download failed (${response.status})`);
                }
                buffer = Buffer.from(await response.arrayBuffer());
                this._setCachedL2ChunkBuffer(chunkUrl, buffer);
            }
            
            // Parse and render the chunk using worker
            const workerOptions = { station, chunkNumber: chunkNum, partialScan: true };
            const result = await this._processSingleChunkInWorker(buffer, layer, workerOptions);
            
            if (result?.meshData) {
                // Store the mesh
                this.incrementalChunkState.chunkMeshes.push({
                    chunkNum,
                    meshData: result.meshData,
                    bounds: result.bounds,
                    metadata: result.metadata,
                });
                
                this.incrementalChunkState.renderedChunkNumbers.add(chunkNum);
                this.incrementalChunkState.lastRenderTime = Date.now();
                
                console.log(`[L2ChunkRender] Chunk ${chunkNum} rendered (${this.incrementalChunkState.chunkMeshes.length} total meshes)`);
                
                // Call the render callback with accumulated mesh data
                if (typeof renderCallback === 'function') {
                    await renderCallback({
                        meshes: this.incrementalChunkState.chunkMeshes,
                        chunkNum,
                        volumeId,
                    });
                }
            }
        } catch (err) {
            console.error(`[L2ChunkRender] Error processing chunk ${chunkNum}:`, err.message);
        }
    }

    _processSingleChunkInWorker(buffer, layer, options = {}) {
        return new Promise((resolve, reject) => {
            if (!this.workerSupported) {
                reject(new Error('Web Workers not supported'));
                return;
            }

            const worker = new Worker(new URL('../workers/radar_worker.js', import.meta.url), { type: 'module' });
            const timeout = setTimeout(() => {
                worker.terminate();
                reject(new Error('Chunk worker timeout'));
            }, 60000);

            const cleanup = () => {
                clearTimeout(timeout);
                worker.terminate();
            };

            worker.onmessage = (event) => {
                const { type, geojson, meshData, bounds, metadata, timing, message } = event.data || {};
                if (type === 'result') {
                    cleanup();
                    resolve({ geojson, meshData, bounds, metadata, timing: timing || null });
                } else if (type === 'error') {
                    cleanup();
                    reject(new Error(message || 'Chunk worker error'));
                }
            };

            worker.onerror = (error) => {
                cleanup();
                reject(error);
            };

            worker.postMessage({
                type: 'process',
                arrayBuffer: buffer,
                layer,
                options
            }, [buffer]);
        });
    }

    _getL2ChunkLimitForLayer(layer) {
        const upper = typeof layer === 'string' ? layer.toUpperCase() : '';
        if (upper === 'REF' || upper === 'CC') {
            return 21;
        }
        return 28;
    }

    _getL2RenderState(layer) {
        const chunkLimit = this._getL2ChunkLimitForLayer(layer);
        const liveChunkUrls = this.level2ChunkLoader.getChunkURLs(false);
        const fullChunkUrls = this.level2ChunkLoader.getChunkURLs(true);
        const chunkUrls = Array.isArray(fullChunkUrls)
            ? fullChunkUrls.slice(0, chunkLimit)
            : [];
        const latestLiveChunkUrl = Array.isArray(liveChunkUrls) && liveChunkUrls.length > 0
            ? liveChunkUrls[liveChunkUrls.length - 1]
            : null;
        return {
            chunkLimit,
            chunkUrls,
            renderableCount: chunkUrls.length,
            latestLiveChunkUrl,
            latestRenderableChunkUrl: chunkUrls.length > 0 ? chunkUrls[chunkUrls.length - 1] : null,
            renderKey: chunkUrls.join('|'),
        };
    }

    _onL2ChunkReceived(chunkUrl) {
        console.log(`[L2ChunkRender] Received chunk update: ${chunkUrl}`);

        const stationFromUrl = typeof chunkUrl === 'string' ? (chunkUrl.split('/')[3] || null) : null;
        
        // If incremental rendering is enabled, process the chunk immediately
        if (this.incrementalChunkState.isEnabled && this.incrementalChunkState.layer) {
            this._renderChunkIncremental(
                chunkUrl,
                this.incrementalChunkState.layer,
                stationFromUrl || this.level2ChunkStation || null,
                this.incrementalChunkState.renderCallback
            );
        }
        
        const detail = {
            chunkUrl,
            station: stationFromUrl || this.level2ChunkStation || null,
            receivedAtMs: Date.now(),
        };
        window.dispatchEvent(new CustomEvent('sparkradar:l2-chunk-update', { detail }));
    }

    enableIncrementalChunkRendering(layer, renderCallback) {
        console.log(`[L2ChunkRender] Enabling incremental rendering for layer: ${layer}`);
        this.incrementalChunkState.layer = layer;
        this.incrementalChunkState.renderCallback = renderCallback;
        this.incrementalChunkState.isEnabled = true;
    }

    disableIncrementalChunkRendering() {
        console.log(`[L2ChunkRender] Disabling incremental rendering`);
        this.incrementalChunkState.isEnabled = false;
        this.incrementalChunkState.chunkMeshes = [];
        this.incrementalChunkState.renderedChunkNumbers.clear();
    }

    _ensureL2ChunkStream(station) {
        if (!station) {
            throw new Error('Missing station for Level-II chunk stream.');
        }

        if (this.level2ChunkStation !== station || !this.level2ChunkStreamStarted) {
            if (this.level2ChunkStreamStarted) {
                console.log(`[L2ChunkRender] Restarting chunk stream from ${this.level2ChunkStation} to ${station}`);
                this.level2ChunkLoader.stopStream();
            } else {
                console.log(`[L2ChunkRender] Starting chunk stream for station ${station}`);
            }

            this.level2ChunkLoader.startStream(station, 2000, (chunkUrl) => this._onL2ChunkReceived(chunkUrl));
            this.level2ChunkStation = station;
            this.level2ChunkStreamStarted = true;
        }
    }

    async _waitForCompleteChunkUrls(station, timeoutMs = 15000) {
        this._ensureL2ChunkStream(station);
        const startedAt = Date.now();

        await this.level2ChunkLoader.waitForReady(Math.min(timeoutMs, 6000));

        while ((Date.now() - startedAt) < timeoutMs) {
            const urls = this.level2ChunkLoader.getChunkURLs(true);
            if (Array.isArray(urls) && urls.length > 0) {
                const latest = this.level2ChunkLoader.getLatestChunkURL();
                console.log(`[L2ChunkRender] Chunk URL list ready (${urls.length} URLs). latest=${latest}`);
                return urls;
            }

            await new Promise(resolve => setTimeout(resolve, 250));
        }

        throw new Error(`Timed out waiting for chunk URLs for ${station}.`);
    }

    async _downloadChunkBuffers(chunkUrls) {
        const downloads = await Promise.all(
            chunkUrls.map(async (url, index) => {
                const cached = this._getCachedL2ChunkBuffer(url);
                if (cached) {
                    console.log(`[L2ChunkCache] HIT ${index + 1}/${chunkUrls.length}: ${url}`);
                    return cached;
                }

                console.log(`[L2ChunkCache] MISS ${index + 1}/${chunkUrls.length}: ${url}`);
                console.log(`[L2ChunkRender] Downloading chunk ${index + 1}/${chunkUrls.length}: ${url}`);
                const response = await fetch(url, { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(`Chunk download failed (${response.status}) for ${url}`);
                }
                const ab = await response.arrayBuffer();
                const buffer = Buffer.from(ab);
                this._setCachedL2ChunkBuffer(url, buffer);
                return buffer;
            })
        );
        console.log(`[L2ChunkCache] cacheSize=${this.level2ChunkDataCache.size} chunks, bytes=${this.level2ChunkDataCacheBytes}`);
        return downloads;
    }

    async _fetchChunkCombinedLevel2Data(station, layer, options = {}) {
        const supportedChunkLayers = new Set(['REF', 'VEL', 'CC', 'ZDR', 'KDP', 'SW']);
        if (!supportedChunkLayers.has(layer)) {
            throw new Error(`Chunk-streamed Level-II currently supports REF, VEL, CC, ZDR, KDP, and SW only. Requested: ${layer}`);
        }

        const MAX_CHUNKS = this._getL2ChunkLimitForLayer(layer);

        // Wait for stream state first so startup renders can use fallback complete chunks
        // while the new current volume is still at 0 chunks.
        const allChunkUrls = await this._waitForCompleteChunkUrls(station);
        const chunkUrls = allChunkUrls.slice(0, MAX_CHUNKS);

        console.log(`[L2ChunkRender] Preparing chunk-combined Level-II render for ${station}/${layer} (${chunkUrls.length} chunks)`);

        // For near-realtime rendering, prefer initial radial chunks (2-14),
        // and skip header/status chunk 1 (suffix S).
        let filteredChunkUrls = chunkUrls.filter(url => {
            const { chunkNum, suffix } = this._extractChunkNumberAndVolumeId(url);
            if (String(suffix || '').toUpperCase() === 'S') return false;
            return Number.isFinite(chunkNum) && chunkNum >= 2 && chunkNum <= 14;
        });

        // Cross-volume fill can front-load later chunk numbers (e.g. latest=019-I),
        // so fall back to "all non-header chunks" to avoid blank renders on VEL.
        if (filteredChunkUrls.length === 0) {
            filteredChunkUrls = chunkUrls.filter(url => {
                const { suffix } = this._extractChunkNumberAndVolumeId(url);
                return String(suffix || '').toUpperCase() !== 'S';
            });
        }

        if (filteredChunkUrls.length === 0) {
            return { skipped: true, reason: 'no-renderable-initial-chunks-yet' };
        }
        
        const latestChunkUrl = filteredChunkUrls[filteredChunkUrls.length - 1] || null;
        const renderKey = filteredChunkUrls.join('|');
        console.log(`[L2ChunkRender] Using ${filteredChunkUrls.length}/${allChunkUrls.length} chunk URLs (capped at ${MAX_CHUNKS}) from initial chunk window 2-14. latestChunkUrl=${latestChunkUrl}`);

        const buffers = await this._downloadChunkBuffers(filteredChunkUrls);

        // Offload CPU-intensive parsing + mesh building to a worker so the main thread stays responsive.
        const workerOptions = { ...options, station };
        console.log(`[L2ChunkRender] Sending ${buffers.length} chunks to worker for parsing and mesh building`);
        const workerResult = await this._processChunksInWorker(buffers, layer, workerOptions);

        // Prefer the timestamp derived from the latest chunk URL — it is more reliable than
        // the header-embedded time which can carry NEXRAD format quirks.
        const metadataTimeIso = this._getChunkTimeIsoFromUrl(latestChunkUrl);
        const metadata = {
            ...(workerResult.metadata || {}),
            timeIso: metadataTimeIso || workerResult.metadata?.timeIso || null,
            station,
            product: layer,
            sourceChunkUrl: latestChunkUrl,
            renderKey,
        };

        console.log(`[L2ChunkRender] Chunk scan processed. vcp=${metadata.vcp}, timeIso=${metadata.timeIso}`);
        return {
            meshData: workerResult.meshData,
            bounds: workerResult.bounds,
            geojson: workerResult.geojson,
            metadata,
        };
    }

    _inferLevelFromProduct(product) {
        if (!product) return 'L3';
        const upper = product.toUpperCase();
        if (upper === 'REF' || upper === 'VEL' || upper === 'CC' || upper === 'KDP' || upper === 'SW' || upper === 'ZDR') {
            return 'L2';
        }
        return 'L3';
    }

    _getLevel2MomentForLayer(layer) {
        if (!layer || typeof layer !== 'string') {
            return null;
        }

        const upper = layer.toUpperCase();
        if (upper === 'REF') return 'reflect';
        if (upper === 'VEL') return 'velocity';
        if (upper === 'CC') return 'rho';
        // Level-II parser exposes differential phase (phi); KDP is derived during rendering.
        if (upper === 'KDP') return 'phi';
        if (upper === 'SW') return 'spectrum';
        if (upper === 'ZDR') return 'zdr';
        return null;
    }

    _getLevel2Vcp(radar, header = null) {
        const patternNumber = Number(radar?.vcp?.record?.pattern_number);
        if (Number.isFinite(patternNumber)) {
            return patternNumber;
        }

        const headerVcp = Number(header?.vcp);
        if (Number.isFinite(headerVcp)) {
            return headerVcp;
        }

        return null;
    }

    _getLevel3Metadata(radar) {
        const productDescription = radar?.productDescription;
        if (!productDescription) return null;

        const dateValue = Number(productDescription.volumeScanDate ?? productDescription.productDate);
        const timeValue = Number(productDescription.volumeScanTime ?? productDescription.productTime);
        let timeIso = null;
        if (Number.isFinite(dateValue) && Number.isFinite(timeValue)) {
            // NEXRAD Level 3: dateValue = days since Dec 31, 1969 (day 0 = Jan 1, 1970);
            // timeValue = seconds since midnight UTC.
            const epochMs = (dateValue * 86400 + timeValue) * 1000;
            timeIso = new Date(epochMs).toISOString();
            console.log(`[Level3 Timestamp] date=${dateValue}, time=${timeValue}, epochMs=${epochMs}, iso=${timeIso}`);
        }

        const elevationAngle = Number.isFinite(productDescription.elevationAngle)
            ? productDescription.elevationAngle
            : null;

        const vcp = Number.isFinite(productDescription.vcp)
            ? productDescription.vcp
            : null;

        return { timeIso, elevationAngle, vcp };
    }

    _isLevel3Layer(layer) {
        if (!layer || typeof layer !== 'string') {
            return false;
        }
        return this._inferLevelFromProduct(layer) === 'L3';
    }

    _getLevel3TiltIndex(layer) {
        if (!layer || typeof layer !== 'string') return null;
        const match = layer.toUpperCase().match(/^N(\d)[A-Z]$/);
        if (!match) return null;
        return Number(match[1]);
    }

    _getCacheTiltKey(layer, options = {}, metadata = null) {
        if (this._isLevel3Layer(layer)) {
            const l3Tilt = this._getLevel3TiltIndex(layer);
            if (Number.isFinite(l3Tilt)) return l3Tilt;
            return 0;
        }

        if (Number.isFinite(options?.elevation)) {
            return options.elevation;
        }

        if (metadata && Number.isFinite(metadata.elevationAngle)) {
            return metadata.elevationAngle;
        }

        return 1;
    }

    // Assistant functions
    _createRadarProjector(radarLat, radarLon) {
        const lat1 = radarLat * DEG_TO_RAD;
        const lon1 = radarLon * DEG_TO_RAD;
        const sinLat1 = Math.sin(lat1);
        const cosLat1 = Math.cos(lat1);

        if (USE_FLAT_EARTH) {
            const latScale = RAD_TO_DEG / EARTH_RADIUS;
            const lonScale = RAD_TO_DEG / (EARTH_RADIUS * cosLat1);
            return (sinAz, cosAz, distanceMeters) => [
                radarLon + distanceMeters * sinAz * lonScale,
                radarLat + distanceMeters * cosAz * latScale
            ];
        }

        // Spherical (great-circle) projection.
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
    }

    _buildPolygon(project, sinAz1, cosAz1, sinAz2, cosAz2, r1, r2) {
        const p1 = project(sinAz1, cosAz1, r1);
        const p2 = project(sinAz2, cosAz2, r1);
        const p3 = project(sinAz2, cosAz2, r2);
        const p4 = project(sinAz1, cosAz1, r2);
        return [p1, p2, p3, p4];
    }

    _createMeshBuilder(includeGeojson) {
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
    }

    async _fetchRadarData(station, options = {}, rawDataOverride = null) {
        // Fetch the latest radar file for the station
        const radarFile = rawDataOverride ? { data: rawDataOverride } : await loadLatestL2RadarFile(station);
        const rawData = radarFile.data;

        const requestedMoment = this._getLevel2MomentForLayer(options?.layer);

        // Create a Level2Radar instance
        const radar = new Level2Radar(rawData, requestedMoment ? { includeMoments: [requestedMoment] } : undefined);

        // Set the desired elevation angle (in whole numbers starting at 1)
        const elevations = radar.listElevations();
        if (options.elevation && elevations.includes(options.elevation)) {
            radar.setElevation(options.elevation);
        } else {
            radar.setElevation(elevations[0] || 1);
        }

        // Load the header data (for elevation angle, vcp, etc.)
        const recordHeader = radar.getHeader(0);
        
        // Get file header for timestamp (modified_julian_date is more reliable)
        const fileHeader = radar.header;

        // Combine data for return
        const header = {
            ...recordHeader,
            modified_julian_date: fileHeader.modified_julian_date,
            milliseconds: fileHeader.milliseconds
        };

        // Find the radar location
        const radarLocation = [recordHeader.volume.latitude, recordHeader.volume.longitude];

        // Determine the radar extent
        const extent = recordHeader.radial_length;

        return { radar, radarLocation, extent, header };
    }

    async _fetchLevel3RadarData(station, product, rawDataOverride = null) {
        const radarFile = rawDataOverride ? { data: rawDataOverride } : await loadLatestL3RadarFile(station, product);
        const rawData = radarFile.data;
        const radar = nexradLevel3Data(rawData);

        const radarLat = radar.productDescription?.latitude;
        const radarLon = radar.productDescription?.longitude;
        if (radarLat == null || radarLon == null) {
            throw new Error('Missing radar location in Level 3 product description.');
        }

        return { radar, radarLocation: [radarLat, radarLon] };
    }

    _processRadarDataInWorker(arrayBuffer, layer, options = {}) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(new URL('../workers/radar_worker.js', import.meta.url), { type: 'module' });

            const cleanup = () => {
                worker.terminate();
            };

            worker.onmessage = (event) => {
                const { type, geojson, meshData, bounds, metadata, timing, message } = event.data || {};
                if (type === 'result') {
                    cleanup();
                    resolve({ geojson, meshData, bounds, metadata, timing: timing || null });
                } else if (type === 'error') {
                    cleanup();
                    reject(new Error(message || 'Radar worker failed'));
                }
            };

            worker.onerror = (error) => {
                cleanup();
                reject(error);
            };

            const workerOptions = Object.fromEntries(
                Object.entries(options || {}).filter(([, value]) => typeof value !== 'function')
            );

            worker.postMessage({ type: 'process', arrayBuffer, layer, options: workerOptions }, [arrayBuffer]);
        });
    }

    _processChunksInWorker(buffers, layer, options = {}) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(new URL('../workers/radar_worker.js', import.meta.url), { type: 'module' });

            const cleanup = () => worker.terminate();

            worker.onmessage = (event) => {
                const { type, geojson, meshData, bounds, metadata, timing, message } = event.data || {};
                if (type === 'result') {
                    cleanup();
                    resolve({ geojson, meshData, bounds, metadata, timing: timing || null });
                } else if (type === 'error') {
                    cleanup();
                    reject(new Error(message || 'Chunk radar worker failed'));
                }
            };

            worker.onerror = (error) => {
                cleanup();
                reject(error);
            };

            const workerOptions = Object.fromEntries(
                Object.entries(options || {}).filter(([, value]) => typeof value !== 'function')
            );

            // Send buffers without transfer so the LRU cache entries remain valid on the main thread.
            worker.postMessage({ type: 'process-chunks', buffers, layer, options: workerOptions });
        });
    }

    async _processRadarData(radar, radarLocation, extent, layer, options = {}) {
        // Get the appropriate data based on the layer type
        let radarData;
        try { 
            console.log(`[RADAR] Scan number: ${radar.getScans()} | Has gaps: ${radar.hasGaps} | Available elevations: ${radar.listElevations().join(', ')}`);
        } catch {}
        if (layer === 'REF') {
            radarData = radar.getHighresReflectivity();
        } else if (layer === 'VEL') {
            radarData = radar.getHighresVelocity();
            // If all objects in list are undefined, go up in elevation levels to find data
            // Not sure why this is a thing...
            if (Array.isArray(radarData) && radarData.every(item => item === undefined)) {
                let elevationLevels = radar.listElevations().sort((a, b) => a - b);
                let currentIndex = elevationLevels.indexOf(radar.elevation);
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
        } else if (layer === 'CC') {
            radarData = radar.getHighresCorrelationCoefficient();
        } else if (layer === 'KDP') {
            radarData = radar.getHighresDiffPhase();
        } else if (layer === 'SW') {
            radarData = radar.getHighresSpectrum();
        } else if (layer === 'ZDR') {
            radarData = radar.getHighresDiffReflectivity();
        } else {
            throw new Error(`Unknown radar layer: ${layer}`);
        }

        // Validate radarData structure
        if (!Array.isArray(radarData) || radarData.length === 0) {
            throw new Error(`No radar data available for layer: ${layer}`);
        }

        // Loop over each radial
        const numberOfRadarIterations = radarData.length;
        const gateLimit = Number.isFinite(options.gate_limit) ? options.gate_limit : null;
        const project = this._createRadarProjector(radarLocation[0], radarLocation[1]);
        const includeGeojson = options.includeGeojson === true;
        const builder = this._createMeshBuilder(includeGeojson);
        const scanIsPartial = Boolean(radar?.hasGaps || radar?.isTruncated || options?.partialScan === true);
        const headers = radar.getHeader();
        const MAX_AZIMUTH_DELTA_DEG = 3;

        const forwardDelta = (fromAz, toAz) => {
            if (!Number.isFinite(fromAz) || !Number.isFinite(toAz)) return 1;
            let delta = toAz - fromAz;
            while (delta <= 0) delta += 360;
            return delta;
        };

        const clampDelta = (delta, fallbackDelta = null) => {
            if (Number.isFinite(delta) && delta > 0 && delta <= MAX_AZIMUTH_DELTA_DEG) {
                return delta;
            }
            if (Number.isFinite(fallbackDelta) && fallbackDelta > 0 && fallbackDelta <= MAX_AZIMUTH_DELTA_DEG) {
                return fallbackDelta;
            }
            return 1;
        };

        const getAzimuthPair = (index) => {
            const current = headers?.[index];
            if (!current || !Number.isFinite(current.azimuth)) {
                return null;
            }

            const az1 = current.azimuth;
            const prev = index > 0 ? headers[index - 1] : null;
            const next = index + 1 < numberOfRadarIterations ? headers[index + 1] : null;
            const prevDelta = prev && Number.isFinite(prev.azimuth)
                ? forwardDelta(prev.azimuth, az1)
                : null;

            let delta;
            if (next && Number.isFinite(next.azimuth)) {
                const nextDelta = forwardDelta(az1, next.azimuth);
                // For interior radials, use the true next-edge delta so adjacent wedges touch.
                delta = clampDelta(nextDelta, prevDelta);
            } else {
                if (!scanIsPartial && headers?.[0] && Number.isFinite(headers[0].azimuth)) {
                    delta = clampDelta(forwardDelta(az1, headers[0].azimuth), prevDelta);
                } else {
                    delta = clampDelta(prevDelta);
                }
            }

            const az2 = az1 + clampDelta(delta, prevDelta);
            return { az1, az2 };
        };

        const normalizePhiDelta = (delta) => {
            if (!Number.isFinite(delta)) return null;
            if (delta > 180) return delta - 360;
            if (delta < -180) return delta + 360;
            return delta;
        };

        const computeKdpFromPhi = (momentData, gateIndex, gateSizeKm) => {
            if (!Array.isArray(momentData) || !Number.isFinite(gateSizeKm) || gateSizeKm <= 0) {
                return null;
            }

            // Use a wider adaptive baseline for dPhi/dr to reduce gate-to-gate noise.
            let leftIndex = null;
            let rightIndex = null;
            for (let step = 1; step <= 3; step++) {
                const li = gateIndex - step;
                const ri = gateIndex + step;
                if (leftIndex == null && li >= 0 && Number.isFinite(momentData[li])) {
                    leftIndex = li;
                }
                if (rightIndex == null && ri < momentData.length && Number.isFinite(momentData[ri])) {
                    rightIndex = ri;
                }
                if (leftIndex != null && rightIndex != null) break;
            }

            let kdp = null;
            if (leftIndex != null && rightIndex != null && rightIndex > leftIndex) {
                const dPhi = normalizePhiDelta(momentData[rightIndex] - momentData[leftIndex]);
                if (Number.isFinite(dPhi)) {
                    const dR = (rightIndex - leftIndex) * gateSizeKm;
                    // KDP = 0.5 * dPhi/dr
                    kdp = 0.5 * (dPhi / dR);
                }
            }

            // One-sided fallback.
            if (!Number.isFinite(kdp)) {
                const curr = momentData[gateIndex];
                if (Number.isFinite(curr) && rightIndex != null && rightIndex > gateIndex) {
                    const dPhi = normalizePhiDelta(momentData[rightIndex] - curr);
                    if (Number.isFinite(dPhi)) {
                        const dR = (rightIndex - gateIndex) * gateSizeKm;
                        kdp = 0.5 * (dPhi / dR);
                    }
                } else if (Number.isFinite(curr) && leftIndex != null && gateIndex > leftIndex) {
                    const dPhi = normalizePhiDelta(curr - momentData[leftIndex]);
                    if (Number.isFinite(dPhi)) {
                        const dR = (gateIndex - leftIndex) * gateSizeKm;
                        kdp = 0.5 * (dPhi / dR);
                    }
                }
            }

            if (!Number.isFinite(kdp)) return null;

            // Match display expectations for this product family: suppress negative artifacts.
            if (kdp < 0) kdp = 0;
            if (kdp > 20) kdp = 20;
            return kdp;
        };
        
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

            // Derive stable azimuth edges to prevent oversized polygons in partial chunk scans.
            const azPair = getAzimuthPair(index);
            if (!azPair) {
                continue;
            }
            const { az1, az2 } = azPair;
            const az1Rad = az1 * DEG_TO_RAD;
            const az2Rad = az2 * DEG_TO_RAD;
            const sinAz1 = Math.sin(az1Rad);
            const cosAz1 = Math.cos(az1Rad);
            const sinAz2 = Math.sin(az2Rad);
            const cosAz2 = Math.cos(az2Rad);

            const firstGate = radial.first_gate;
            const gateSize = radial.gate_size;
            
            // Loop over each gate in the radial
            for (let gateIndex = 0; gateIndex < radial.gate_count - 1; gateIndex++) {
                const rawValue = radial.moment_data[gateIndex];
                
                // Skip null values
                if (rawValue === null) {
                    continue;
                }
                
                const r1 = (firstGate + gateIndex * gateSize) * 1000;
                const r2 = (firstGate + (gateIndex + 1) * gateSize) * 1000;

                let value = rawValue;
                if (layer === 'KDP') {
                    if (value === 'rf') {
                        // Keep range-folded sentinel for existing renderer behavior.
                    } else {
                        value = computeKdpFromPhi(radial.moment_data, gateIndex, gateSize);
                    }
                }

                if (value == null) {
                    continue;
                }

                if (layer === 'REF' && gateLimit !== null && value !== 'rf' && value < gateLimit) {
                    continue;
                }

                if (layer === 'VEL' && value !== 'rf' && Number.isFinite(value)) {
                    // Convert m/s to knots to match palette units
                    value *= 1.94384;
                }

                const coords = this._buildPolygon(project, sinAz1, cosAz1, sinAz2, cosAz2, r1, r2);
                builder.pushQuad(coords, value);
            }
        }

        return builder.finalize();
    }

    async _processLevel3RadarData(radar, radarLocation, layer, options = {}) {
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
        const project = this._createRadarProjector(radarLocation[0], radarLocation[1]);
        const includeGeojson = options.includeGeojson === true;
        const builder = this._createMeshBuilder(includeGeojson);

        for (let index = 0; index < numberOfRadarIterations; index++) {
            const radial = radials[index];
            if (!radial || typeof radial !== 'object') {
                continue;
            }

            if (index % 100 === 0) {
                console.log(`(${(index / numberOfRadarIterations * 100).toFixed(2)}%) Processing radial ${index + 1} of ${numberOfRadarIterations}`);
            }

            if (index % 50 === 0) {
                await yieldToMain();
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
                if (gateLimit && value < gateLimit) {
                    continue;
                }

                const r1 = (firstBin + (binIndex * rangeScaleKm)) * 250;
                const r2 = (firstBin + ((binIndex + 1) * rangeScaleKm)) * 250;

                const coords = this._buildPolygon(project, sinAz1, cosAz1, sinAz2, cosAz2, r1, r2);
                builder.pushQuad(coords, value);
            }
        }

        return builder.finalize();
    }

    async isUpdateAvailable(radarStation, product = null) {
        const level = this._inferLevelFromProduct(product);
        if (level === 'L2') {
            this._ensureL2ChunkStream(radarStation);
            const normalizedProduct = typeof product === 'string' ? product.toUpperCase() : 'REF';
            const renderState = this._getL2RenderState(normalizedProduct);
            if (renderState.renderableCount < renderState.chunkLimit) {
                console.log(`[Update Check][L2 chunks] Not enough renderable chunks yet (${renderState.renderableCount}/${renderState.chunkLimit}) for ${normalizedProduct}`);
                return false;
            }
            const trackerKey = `${radarStation}:${normalizedProduct}`;
            const storedRenderKey = this.latestL2RenderKeys.get(trackerKey) || null;
            const latestRenderKey = renderState.renderKey || null;
            console.log(`[Update Check][L2 chunks] product=${normalizedProduct}, renderable=${renderState.renderableCount}/${renderState.chunkLimit}, changed=${latestRenderKey !== storedRenderKey}`);
            if (!latestRenderKey || latestRenderKey === storedRenderKey) {
                return false;
            }
            return true;
        } else {
            const latest = await checkLatestL3RadarFile(radarStation, product);
            const stored = this.latestRadarFiles.L3?.[product] ?? null;
            console.log(`[Update Check] Latest: ${latest}, Stored: ${stored}, Equal: ${latest === stored}`);
            if (latest === stored) {
                return false;
            }
            return true;
        }
    }

    async getRadarLayer(radarStation, layer, options = {}) {
        const isLevel3 = this._isLevel3Layer(layer);
        const hasRawData = options?.rawData != null;
        const nowEpochMs = () => performance.timeOrigin + performance.now();
        const timing = {
            fileFetchedAtMs: null,
            parserFinishedAtMs: null,
            meshFinishedAtMs: null,
            source: hasRawData ? 'local-file' : 'network'
        };

        try {
            let latestFileName = null;
            let l2RenderState = null;
            if (!options.fromUrl && !hasRawData) {
                if (isLevel3) {
                    latestFileName = await checkLatestL3RadarFile(radarStation, layer);
                } else {
                    this._ensureL2ChunkStream(radarStation);
                    l2RenderState = this._getL2RenderState(layer);
                    // Use the newest live chunk for timestamp/cache identity so picker time
                    // advances as soon as new volume chunks start arriving.
                    latestFileName = l2RenderState.latestLiveChunkUrl || l2RenderState.latestRenderableChunkUrl;
                }
                console.log(`[getRadarLayer] Latest file available: ${latestFileName}`);

                const latestTimeIso = isLevel3
                    ? this._parseFilenameToIso(latestFileName)
                    : this._getChunkTimeIsoFromUrl(latestFileName);
                const cacheTilt = this._getCacheTiltKey(layer, options) || 0;
                const cached = latestTimeIso
                    ? this.cache.get(radarStation, layer, cacheTilt, latestTimeIso)
                    : null;

                if (cached) {
                    console.log(`[getRadarLayer] Using cached data for ${radarStation}/${layer}/${cacheTilt}/${latestTimeIso}`);
                    const cachedNow = nowEpochMs();
                    timing.fileFetchedAtMs = cachedNow;
                    timing.parserFinishedAtMs = cachedNow;
                    timing.meshFinishedAtMs = cachedNow;
                    timing.source = 'cache';

                    if (isLevel3) {
                        this.latestRadarFiles.L3[layer] = latestFileName;
                    } else {
                        this.latestRadarFiles.L2 = latestFileName;
                        const normalizedLayer = typeof layer === 'string' ? layer.toUpperCase() : 'REF';
                        const trackerKey = `${radarStation}:${normalizedLayer}`;
                        if (l2RenderState?.renderKey) {
                            this.latestL2RenderKeys.set(trackerKey, l2RenderState.renderKey);
                        }
                    }

                    if (cached.metadata && typeof options.onMetadata === 'function') {
                        const fallbackVcp = this.lastKnownVcpByStation.get(radarStation) ?? null;
                        const effectiveVcp = Number.isFinite(cached.metadata.vcp)
                            ? cached.metadata.vcp
                            : fallbackVcp;
                        if (Number.isFinite(effectiveVcp)) {
                            this.lastKnownVcpByStation.set(radarStation, effectiveVcp);
                        }
                        const date = new Date(cached.metadata.timeIso || latestTimeIso);
                        console.log(`[RadarCached] timeIso=${cached.metadata.timeIso || latestTimeIso}, date object=${date.toString()}`);
                        const timeString = date.toLocaleTimeString('en-US', {
                            hour12: true,
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                        });
                        console.log(`[RadarCached] timeString=${timeString}`);
                        options.onMetadata({
                            timeString,
                            timeIso: cached.metadata.timeIso,
                            tilt: cached.metadata.elevationAngle ?? 0,
                            vcp: effectiveVcp
                        });
                    }

                    this.radarGeoJson = null;
                    document.title = `SparkRadar | ${radarStation}`;
                    return {
                        geojson: null,
                        meshData: cached.meshData,
                        bounds: cached.bounds,
                        metadata: cached.metadata,
                        timing
                    };
                }
            }

            let radarFile = null;
            let rawData = null;
            if (hasRawData) {
                radarFile = {
                    data: options.rawData,
                    fileName: options.fileName || 'local-upload'
                };
            } else if (options.fromUrl) {
                console.log(`[getRadarLayer] Loading from URL: ${options.fromUrl}`);
                radarFile = await loadRadarFileFromUrl(options.fromUrl);
            } else if (isLevel3) {
                if (isLevel3) {
                    this.latestRadarFiles.L3[layer] = latestFileName;
                } else {
                    this.latestRadarFiles.L2 = latestFileName;
                }

                radarFile = isLevel3
                    ? await loadLatestL3RadarFile(radarStation, layer)
                    : await loadLatestL2RadarFile(radarStation);
            } else {
                this.latestRadarFiles.L2 = latestFileName;
                console.log('[L2ChunkRender] Using chunk stream path for realtime Level-II data (no archive file fetch)');
            }

            if (radarFile) {
                console.log(`[getRadarLayer] Loaded file: ${radarFile.fileName}`);
                rawData = radarFile.data;
                timing.fileFetchedAtMs = nowEpochMs();
            }

            const includeGeojson = options.includeGeojson === true;
            let geojson = null;
            let meshData = null;
            let bounds = null;
            let metadata = null;

            if (this.workerSupported && rawData) {
                const workerOptions = { ...options, includeGeojson };
                delete workerOptions.onMetadata;
                const arrayBuffer = rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength);
                const result = await this._processRadarDataInWorker(arrayBuffer, layer, { ...workerOptions, station: radarStation });
                geojson = result.geojson;
                meshData = result.meshData || null;
                bounds = result.bounds || null;
                metadata = result.metadata || null;
                if (result.timing) {
                    timing.parserFinishedAtMs = Number.isFinite(result.timing.parserEndMs) ? result.timing.parserEndMs : null;
                    timing.meshFinishedAtMs = Number.isFinite(result.timing.meshEndMs) ? result.timing.meshEndMs : null;
                }
            } else if (isLevel3) {
                const { radar, radarLocation } = await this._fetchLevel3RadarData(radarStation, layer, rawData);
                timing.parserFinishedAtMs = nowEpochMs();
                const processed = await this._processLevel3RadarData(radar, radarLocation, layer, { ...options, includeGeojson });
                timing.meshFinishedAtMs = nowEpochMs();
                geojson = processed.geojson;
                meshData = processed.meshData;
                bounds = processed.bounds;
                const level3Meta = this._getLevel3Metadata(radar);
                metadata = {
                    station: radarStation,
                    product: layer,
                    ...(level3Meta ?? {})
                };
            } else if (!options.fromUrl && !hasRawData) {
                const chunkResult = await this._fetchChunkCombinedLevel2Data(radarStation, layer, { ...options, includeGeojson });
                if (chunkResult?.skipped) {
                    console.log(`[L2ChunkRender] Skipping render: ${chunkResult.reason}`);
                    return null;
                }
                timing.parserFinishedAtMs = nowEpochMs();
                timing.meshFinishedAtMs = nowEpochMs();
                geojson = chunkResult.geojson;
                meshData = chunkResult.meshData;
                bounds = chunkResult.bounds;
                metadata = chunkResult.metadata;

                if (metadata?.sourceChunkUrl) {
                    this.latestRadarFiles.L2 = metadata.sourceChunkUrl;
                }
                const normalizedLayer = typeof layer === 'string' ? layer.toUpperCase() : 'REF';
                const trackerKey = `${radarStation}:${normalizedLayer}`;
                if (metadata?.renderKey) {
                    this.latestL2RenderKeys.set(trackerKey, metadata.renderKey);
                }
            } else {
                const { radar, radarLocation, extent, header } = await this._fetchRadarData(radarStation, { ...options, layer }, rawData);
                timing.parserFinishedAtMs = nowEpochMs();
                const processed = await this._processRadarData(radar, radarLocation, extent, layer, { ...options, includeGeojson });
                timing.meshFinishedAtMs = nowEpochMs();
                geojson = processed.geojson;
                meshData = processed.meshData;
                bounds = processed.bounds;
                // NEXRAD Level 2 file header uses modified_julian_date (days since Dec 31, 1969)
                // Add 1 hour offset to correct for NEXRAD timestamp quirk
                const epochMs = (header.modified_julian_date * 86400 * 1000) + header.milliseconds + 3600000;
                console.log(`[Level2 Timestamp] modified_julian_date=${header.modified_julian_date}, milliseconds=${header.milliseconds}, epochMs=${epochMs}, iso=${new Date(epochMs).toISOString()}`);
                metadata = {
                    timeIso: new Date(epochMs).toISOString(),
                    elevationAngle: header.elevation_angle,
                    vcp: this._getLevel2Vcp(radar, header),
                    station: radarStation,
                    product: layer
                };
            }

            // Prefer the timestamp derived from the latest filename for cache keys and metadata.
            // Header-based timestamps can be incorrect due to NEXRAD format quirks.
            const latestTimeIsoForCache = latestFileName
                ? (isLevel3 ? this._parseFilenameToIso(latestFileName) : this._getChunkTimeIsoFromUrl(latestFileName))
                : null;
            const cacheTimeIso = latestTimeIsoForCache || metadata?.timeIso || null;
            
            // Override metadata timestamp with filename-based timestamp if available
            if (latestTimeIsoForCache && metadata) {
                metadata.timeIso = latestTimeIsoForCache;
            }

            // Preserve last known VCP for this station when partial/chunk metadata omits it.
            if (metadata) {
                const fallbackVcp = this.lastKnownVcpByStation.get(radarStation) ?? null;
                const effectiveVcp = Number.isFinite(metadata.vcp) ? metadata.vcp : fallbackVcp;
                metadata.vcp = Number.isFinite(effectiveVcp) ? effectiveVcp : null;
                if (Number.isFinite(metadata.vcp)) {
                    this.lastKnownVcpByStation.set(radarStation, metadata.vcp);
                }
            }

            if (metadata?.timeIso && typeof options.onMetadata === 'function') {
                const date = new Date(metadata.timeIso);
                console.log(`[RadarMetadata] timeIso=${metadata.timeIso}, date object=${date.toString()}`);
                const timeString = date.toLocaleTimeString('en-US', {
                    hour12: true,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                console.log(`[RadarMetadata] timeString=${timeString}`);
                options.onMetadata({
                    timeString,
                    timeIso: metadata.timeIso,
                    tilt: metadata.elevationAngle ?? 0,
                    vcp: metadata.vcp ?? null
                });
            }

            if (meshData && cacheTimeIso) {
                const cacheTilt = this._getCacheTiltKey(layer, options, metadata) ?? 0;
                this.cache.set(
                    radarStation,
                    layer,
                    cacheTilt,
                    cacheTimeIso,
                    meshData,
                    bounds,
                    metadata
                );
            }

            if (!isLevel3 && !['REF', 'VEL', 'CC', 'KDP', 'SW', 'ZDR'].includes(layer)) {
                console.warn(`Unknown radar layer: ${layer}. Ignoring.`);
                return null;
            }

            this.radarGeoJson = geojson;
            if (!options.fromUrl && !hasRawData) {
                if (isLevel3) {
                    this.latestRadarFiles.L3[layer] = await checkLatestL3RadarFile(radarStation, layer);
                } else {
                    if (metadata?.sourceChunkUrl) {
                        this.latestRadarFiles.L2 = metadata.sourceChunkUrl;
                    }
                }
            }

            console.log('Done processing radar layer.');
            document.title = `SparkRadar | ${radarStation}`;
            return { geojson, meshData, bounds, metadata, timing };
        } catch (error) {
            console.error(`Error adding radar layer: ${error.message}`);
            return null;
        }
    }

    /**
     * Get radar cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return this.cache.getStats();
    }

    /**
     * Clear the radar cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Update the maximum number of cache slots
     * @param {number} maxSlots - New maximum number of slots
     */
    setCacheSize(maxSlots) {
        this.cache.setMaxSlots(maxSlots);
    }

    /**
     * Update maximum cache size in GB
     * @param {number} maxSizeGB - Max cache size in GB (0 = unlimited)
     */
    setCacheMaxSizeGB(maxSizeGB) {
        this.cache.setMaxSizeGB(maxSizeGB);
    }

    /**
     * Update both slot and size limits in one call
     * @param {Object} limits - Cache limits
     */
    setCacheLimits(limits = {}) {
        if (Number.isFinite(limits.maxSlots) && limits.maxSlots > 0) {
            this.cache.setMaxSlots(limits.maxSlots);
        }
        if (Number.isFinite(limits.maxSizeGB) && limits.maxSizeGB >= 0) {
            this.cache.setMaxSizeGB(limits.maxSizeGB);
        }
    }

    /**
     * Remove cache entries for a specific station or product
     * @param {Object} criteria - Matching criteria {station, product, tilt}
     */
    removeCacheEntries(criteria) {
        this.cache.removeMatching(criteria);
    }

    /**
     * Parse a radar filename into an ISO timestamp
     * Filename format: STATION_PRODUCT_YYYY_MM_DD_HH_MM_SS
     * @param {string} filename - Radar filename
     * @returns {string|null} ISO timestamp or null if parsing fails
     */
    _parseFilenameToIso(filename) {
        if (!filename || typeof filename !== 'string') return null;
        
        // Extract timestamp parts from filename
        // Format: STATION_PRODUCT_YYYY_MM_DD_HH_MM_SS
        const parts = filename.split('_');
        if (parts.length < 8) return null;
        
        // Get the date/time parts (skip station and product)
        const year = parts[parts.length - 6];
        const month = parts[parts.length - 5];
        const day = parts[parts.length - 4];
        const hour = parts[parts.length - 3];
        const minute = parts[parts.length - 2];
        const second = parts[parts.length - 1];
        
        // Validate parts are numbers
        if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day) ||
            !/^\d{2}$/.test(hour) || !/^\d{2}$/.test(minute) || !/^\d{2}$/.test(second)) {
            return null;
        }
        
        // Construct ISO timestamp
        try {
            const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
            // Validate by parsing
            const date = new Date(isoString);
            if (isNaN(date.getTime())) return null;
            return isoString;
        } catch {
            return null;
        }
    }
}

// Export the radar class
export default Radar;