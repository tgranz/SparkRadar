/*

ChunkLoader

This file streams in L2 radar data chunking from the AWS bucket.
Because they made it as difficult as possible to interact with the data.

*/

export default class ChunkLoader {
    constructor() {
        this.station = null;
        this.interval = null;
        this.intervalObject = null;
        this.onNewChunk = null;
        this.chunkIndex = 0;
        this.isStreaming = false;
        this.latestVolumeId = null;
        this.latestKey = null;
        this.previousChunkURLs = [];
        this.chunkURLs = [];
        this.pollInFlight = false;
        this.startupReadyPromise = null;
        this.startupReadyResolver = null;
    }

    startStream(station, interval=2000, onNewChunk=() => {}) {
        // Station assumes leading letter and 3 numbers, e.g. KTLX
        this.stopStream();

        this.station = String(station || '').trim().toUpperCase();
        this.interval = interval;
        this.onNewChunk = typeof onNewChunk === 'function' ? onNewChunk : () => {};
        this.chunkIndex = 0;
        this.isStreaming = true;
        this.latestVolumeId = null;
        this.latestKey = null;
        this.previousChunkURLs = [];
        this.chunkURLs = [];
        this.pollInFlight = false;
        this.startupReadyPromise = new Promise(resolve => {
            this.startupReadyResolver = resolve;
        });
        this.intervalObject = setInterval(() => this._interpolate(), this.interval);

        fetch(`https://chunks.sparkradar.app/latest?station=${this.station}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`[ChunkLoader] Latest volume request failed with status ${response.status}`);
                }
                return response.json();
            })
            .then(async data => {
                if (data?.[this.station]?.latest_volume_id != null) {
                    this.latestVolumeId = data[this.station].latest_volume_id;
                    this.latestKey = data[this.station].key;
                }

                // Returned latestVolumeId is always a complete scan, load it into previousChunkURLs so it's available for interpolation immediately
                // data.chunk_id is the number of chunks in the complete scan
                const chunkCount = Number(data?.chunk_id ?? data?.[this.station]?.chunk_id);
                if (this.latestKey && Number.isFinite(chunkCount) && chunkCount > 0) {
                    for (let i = 0; i < chunkCount; i++) {
                        const latestKeyParts = this.latestKey.split('-');
                        const keyPrefix = latestKeyParts[0];
                        const keySuffix = latestKeyParts[1];
                        const keyNumber = i + 1;
                        const keyId = String(keyNumber).padStart(3, '0');
                        const keySignal = keyNumber === 1 ? 'S' : (keyNumber === chunkCount ? 'E' : 'I'); // S for start, E for end, I for indeterminate

                        const chunkURL = `https://unidata-nexrad-level2-chunks.s3.amazonaws.com/${keyPrefix}-${keySuffix}-${keyId}-${keySignal}`;
                        this.previousChunkURLs.push(chunkURL);
                    }
                }

                // /latest can be cached behind. Probe ahead in S3 so first render starts on the newest scan.
                await this._bootstrapLatestFromS3();
            })
            .catch(error => {
                console.error('[ChunkLoader] Error fetching latest volume ID:', error);
                this.stopStream();
            })
            .finally(async () => {
                if (this.isStreaming) {
                    console.log('[ChunkLoader] startStream: triggering first interpolate poll after startup bootstrap');
                    this._interpolate();
                    await this._waitForPollToSettle(6000);
                }
                this._resolveStartupReady();
            });
    }

    stopStream() {
        this.isStreaming = false;
        this.pollInFlight = false;
        if (this.intervalObject) {
            clearInterval(this.intervalObject);
            this.intervalObject = null;
        }
        this._resolveStartupReady();
    }

    pauseStream() {
        this.isStreaming = false;
    }

    _resolveStartupReady() {
        if (typeof this.startupReadyResolver === 'function') {
            this.startupReadyResolver();
            this.startupReadyResolver = null;
        }
    }

    waitForReady(timeoutMs = 6000) {
        if (!this.startupReadyPromise) {
            return Promise.resolve();
        }

        return Promise.race([
            this.startupReadyPromise,
            new Promise(resolve => setTimeout(resolve, timeoutMs)),
        ]);
    }

    _waitForPollToSettle(timeoutMs = 6000) {
        const startedAt = Date.now();

        return new Promise(resolve => {
            const check = () => {
                if (!this.isStreaming || !this.pollInFlight) {
                    resolve();
                    return;
                }

                if ((Date.now() - startedAt) >= timeoutMs) {
                    resolve();
                    return;
                }

                setTimeout(check, 50);
            };

            check();
        });
    }

    _interpolate() {
        // Don't do anything if we're paused
        if (!this.isStreaming) return;
        if (this.pollInFlight) return;

        // Make sure we have a latest volume ID to work with
        if (this.latestVolumeId == null) return;

        // Get the next volume scan ID (which will contain an incomplete scan)
        const YYYYMMDD = new Date().toISOString().slice(0,10).replace(/-/g, '');
        const prefix = `${this.station}/${this.latestVolumeId}/${YYYYMMDD}`;
        this.pollInFlight = true;

        fetch(`https://unidata-nexrad-level2-chunks.s3.amazonaws.com/?list-type=2&prefix=${prefix}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`[ChunkLoader] Chunk listing request failed with status ${response.status}`);
                }
                return response.text();
            })
            .then(str => new window.DOMParser().parseFromString(str, "application/xml"))
            .then(data => {
                // Map keys to chunk URLs
                const keys = Array.from(data.getElementsByTagName('Key'))
                    .map(el => el.textContent)
                    .filter(Boolean);
                const newChunkURLs = keys.map(key => `https://unidata-nexrad-level2-chunks.s3.amazonaws.com/${key}`);

                const oldChunkURLs = [...this.chunkURLs];
                const oldVolumeId = this._getVolumeIdFromChunkUrls(oldChunkURLs);
                const newVolumeId = this._getVolumeIdFromChunkUrls(newChunkURLs);
                const oldWasComplete = oldChunkURLs.length > 0 && oldChunkURLs[oldChunkURLs.length - 1].endsWith('E');

                // Check if we have a new chunk
                if (newChunkURLs.length > this.chunkURLs.length) {
                    // Callback with the latest chunk URL
                    this.onNewChunk(newChunkURLs[newChunkURLs.length - 1]);
                }

                // Check if this chunk ends with an "E" (signals end of this volume scan)
                if (newChunkURLs.length > 0 && newChunkURLs[newChunkURLs.length - 1].endsWith('E')) {
                    // Reset latestVolumeId for the next volume scan
                    this.latestVolumeId = this._incrementVolumeId(this.latestVolumeId);
                }

                // Update our chunk URLs and index
                // Keep previous chunk URLs so we can always have a full volume scan
                if (newChunkURLs.length > 0 || this.chunkURLs.length > 0) {
                    if (oldChunkURLs.length > 0) {
                        // Promote old scan to fallback when it is complete,
                        // or when the stream advances to a different volume.
                        if (oldWasComplete || (oldVolumeId && newVolumeId && oldVolumeId !== newVolumeId)) {
                            this.previousChunkURLs = oldChunkURLs;
                        }
                    }
                    this.chunkURLs = newChunkURLs;
                }
            })
            .catch(error => {
                console.error('[ChunkLoader] Error loading chunk listing:', error);
            })
            .finally(() => {
                this.pollInFlight = false;
            });
    }

    async _bootstrapLatestFromS3() {
        if (!this.isStreaming || this.latestVolumeId == null) {
            return;
        }

        const baseVolumeId = this.latestVolumeId;
        const candidates = [];
        let probeVolumeId = baseVolumeId;

        // Probe a few scans ahead of /latest in case the API response is cached behind S3.
        for (let i = 0; i < 3; i++) {
            probeVolumeId = this._incrementVolumeId(probeVolumeId);
            candidates.push(probeVolumeId);
        }

        let newestVolumeId = null;
        let newestChunkURLs = [];

        for (const candidateVolumeId of candidates) {
            const candidateChunkURLs = await this._loadChunkURLsForVolume(candidateVolumeId);

            if (candidateChunkURLs.length === 0) {
                break;
            }

            newestVolumeId = candidateVolumeId;
            newestChunkURLs = candidateChunkURLs;

            const isComplete = candidateChunkURLs[candidateChunkURLs.length - 1].endsWith('E');
            if (!isComplete) {
                break;
            }
        }

        if (!newestVolumeId || newestChunkURLs.length === 0) {
            console.log(`[ChunkLoader] bootstrap: no newer S3 volume ahead of /latest (${baseVolumeId})`);
            return;
        }

        console.log(`[ChunkLoader] bootstrap: found newer S3 volume ${newestVolumeId} (${newestChunkURLs.length} chunks) ahead of /latest ${baseVolumeId}`);
        this.latestVolumeId = newestVolumeId;
        this.chunkURLs = newestChunkURLs;

        // If the newer scan is already complete, prefer it immediately and avoid stale startup data.
        if (newestChunkURLs[newestChunkURLs.length - 1].endsWith('E')) {
            this.previousChunkURLs = [...newestChunkURLs];
        }

        this.onNewChunk(newestChunkURLs[newestChunkURLs.length - 1]);
    }

    async _loadChunkURLsForVolume(volumeId) {
        if (volumeId == null) {
            return [];
        }

        const YYYYMMDD = new Date().toISOString().slice(0,10).replace(/-/g, '');
        const prefix = `${this.station}/${volumeId}/${YYYYMMDD}`;

        try {
            const response = await fetch(`https://unidata-nexrad-level2-chunks.s3.amazonaws.com/?list-type=2&prefix=${prefix}`);
            if (!response.ok) {
                throw new Error(`[ChunkLoader] Chunk listing request failed with status ${response.status}`);
            }

            const str = await response.text();
            const xml = new window.DOMParser().parseFromString(str, "application/xml");
            const keys = Array.from(xml.getElementsByTagName('Key'))
                .map(el => el.textContent)
                .filter(Boolean);

            return keys.map(key => `https://unidata-nexrad-level2-chunks.s3.amazonaws.com/${key}`);
        } catch (error) {
            console.error(`[ChunkLoader] Error loading chunk listing for volume ${volumeId}:`, error);
            return [];
        }
    }

    _incrementVolumeId(volumeId) {
        const raw = String(volumeId ?? '').trim();
        const width = raw.length;
        const numeric = Number(raw);

        if (!Number.isFinite(numeric)) {
            return volumeId;
        }

        const next = numeric >= 999 ? 1 : numeric + 1;
        return /^\d+$/.test(raw) ? String(next).padStart(width, '0') : next;
    }

    _extractVolumeIdFromChunkUrl(url) {
        if (!url || typeof url !== 'string') return null;
        // Format: https://unidata-nexrad-level2-chunks.s3.amazonaws.com/STATION/VOLUME_ID/YYYYMMDD-HHMMSS-CHUNK_NUM-SIGNAL
        const parts = url.split('/');
        if (parts.length >= 5) {
            return parts[4]; // VOLUME_ID is at index 4 in the split path
        }
        return null;
    }

    _getVolumeIdFromChunkUrls(urls) {
        if (!Array.isArray(urls) || urls.length === 0) return null;
        return this._extractVolumeIdFromChunkUrl(urls[0]);
    }

    getCurrentVolumeChunkCount() {
        return this.chunkURLs.length;
    }

    getCurrentVolumeId() {
        return this._getVolumeIdFromChunkUrls(this.chunkURLs);
    }

    getLatestChunkURL() {
        if (this.chunkURLs.length > 0) {
            return this.chunkURLs[this.chunkURLs.length - 1];
        }
        if (this.previousChunkURLs.length > 0) {
            return this.previousChunkURLs[this.previousChunkURLs.length - 1];
        }
        return null;
    }

    getChunkURLs(completeVolume=true) {
        if (!completeVolume) {
            return [...this.chunkURLs];
        }

        // For a complete volume, get volume IDs from current and previous chunks
        const currentVolumeId = this._getVolumeIdFromChunkUrls(this.chunkURLs);
        const previousVolumeId = this._getVolumeIdFromChunkUrls(this.previousChunkURLs);
        const isCurrentComplete = this.chunkURLs.length > 0 && this.chunkURLs[this.chunkURLs.length - 1].endsWith('-E');

        // If current scan is complete (ends with 'E'), use it as-is
        if (isCurrentComplete) {
            console.log(`[ChunkLoader] getChunkURLs: current scan is complete (${this.chunkURLs.length} chunks, volumeId=${currentVolumeId})`);
            return [...this.chunkURLs];
        }

        // If no current chunks, use previous
        if (this.chunkURLs.length === 0) {
            console.log(`[ChunkLoader] getChunkURLs: no current chunks, using previous scan (${this.previousChunkURLs.length} chunks, volumeId=${previousVolumeId})`);
            return [...this.previousChunkURLs];
        }

        // Current scan is incomplete. Try to fill with available chunks
        // Case 1: Current and previous are from the same scan - combine normally
        if (currentVolumeId && previousVolumeId && currentVolumeId === previousVolumeId) {
            const result = [...this.chunkURLs, ...this.previousChunkURLs.slice(this.chunkURLs.length)];
            console.log(`[ChunkLoader] getChunkURLs: SAME VOLUME - combining (volumeId=${currentVolumeId}, current=${this.chunkURLs.length} chunks, prev=${this.previousChunkURLs.length} total, result=${result.length})`);
            return result;
        }

        // Case 2: Current and previous are from different scans, but current is incomplete
        // Fill from previous to get a complete render while waiting for current to complete
        if (currentVolumeId && previousVolumeId && currentVolumeId !== previousVolumeId && this.previousChunkURLs.length > 0) {
            const result = [...this.chunkURLs, ...this.previousChunkURLs.slice(this.chunkURLs.length)];
            console.warn(`[ChunkLoader] getChunkURLs: CROSS-VOLUME FILL - replacing first ${this.chunkURLs.length} chunks with current volumeId=${currentVolumeId}, filling remaining ${Math.max(0, this.previousChunkURLs.length - this.chunkURLs.length)} chunks from previous volumeId=${previousVolumeId}. Result=${result.length} chunks.`);
            return result;
        }

        // Fallback: return current chunks only (may be incomplete)
        console.log(`[ChunkLoader] getChunkURLs: returning current scan only (${this.chunkURLs.length} chunks, volumeId=${currentVolumeId}). May be incomplete!`);
        return [...this.chunkURLs];
    }
}