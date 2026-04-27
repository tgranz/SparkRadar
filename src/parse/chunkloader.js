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
        this.activeDayToken = null;
        this.previousChunkURLs = [];
        this.chunkURLs = [];
        this.pollInFlight = false;
        this.startupReadyPromise = null;
        this.startupReadyResolver = null;
        this.gapStart = null;
        this.gapEnd = null;
        this.consecutiveEmptyProbes = 0;
        this.maxEmptyProbesBeforeGapSearch = 3;
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
        this.activeDayToken = null;
        this.previousChunkURLs = [];
        this.chunkURLs = [];
        this.pollInFlight = false;
        this.gapStart = null;
        this.gapEnd = null;
        this.consecutiveEmptyProbes = 0;
        this.startupReadyPromise = new Promise(resolve => {
            this.startupReadyResolver = resolve;
        });
        this.intervalObject = setInterval(() => this._interpolate(), this.interval);

        this._initializeFromS3()
            .catch(error => {
                console.error('[ChunkLoader] Error initializing stream from S3:', error);
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

        this.pollInFlight = true;

        this._loadChunkURLsForVolume(this.latestVolumeId)
            .then(async loadedChunkURLs => {

                let newChunkURLs = loadedChunkURLs;

                const oldChunkURLs = [...this.chunkURLs];
                const oldVolumeId = this._getVolumeIdFromChunkUrls(oldChunkURLs);
                let newVolumeId = this._getVolumeIdFromChunkUrls(newChunkURLs);
                const oldWasComplete = oldChunkURLs.length > 0 && oldChunkURLs[oldChunkURLs.length - 1].endsWith('E');

                // Check if we have a new chunk
                if (newChunkURLs.length > this.chunkURLs.length) {
                    // Callback with the latest chunk URL
                    const newestChunkURL = newChunkURLs[newChunkURLs.length - 1];
                    this._updateLatestKeyFromChunkUrl(newestChunkURL);
                    this.onNewChunk(newestChunkURL);
                    this.consecutiveEmptyProbes = 0; // Reset gap probe counter on successful chunk
                }

                // Check if this chunk ends with an "E" (signals end of this volume scan)
                if (newChunkURLs.length > 0 && newChunkURLs[newChunkURLs.length - 1].endsWith('E')) {
                    // Current volume is complete. Fast-forward across contiguous scans to avoid slow +1 polling.
                    const currentVolumeId = this.latestVolumeId;
                    const minTimestampKey = this._getReferenceChunkTimestampKey();
                    const jumpTargetVolumeId = await this._findLatestAheadBeforeGap(
                        currentVolumeId,
                        this.activeDayToken ? [this.activeDayToken] : null,
                        minTimestampKey,
                    );
                    const nextVolumeId = jumpTargetVolumeId || this._incrementVolumeId(currentVolumeId);

                    if (jumpTargetVolumeId && jumpTargetVolumeId !== currentVolumeId) {
                        console.log(`[ChunkLoader] _interpolate: current volume ${currentVolumeId} complete, fast-forwarding to volumeId=${nextVolumeId}`);

                        const jumpChunkURLs = await this._loadChunkURLsForVolume(nextVolumeId);
                        if (jumpChunkURLs.length > 0) {
                            newChunkURLs = jumpChunkURLs;
                            newVolumeId = this._getVolumeIdFromChunkUrls(newChunkURLs);
                            const newestJumpChunkURL = newChunkURLs[newChunkURLs.length - 1];
                            this._updateLatestKeyFromChunkUrl(newestJumpChunkURL);
                            this.onNewChunk(newestJumpChunkURL);
                        }
                    } else {
                        console.log(`[ChunkLoader] _interpolate: current volume ${currentVolumeId} complete, moving to next volumeId=${nextVolumeId}`);
                    }

                    this.latestVolumeId = nextVolumeId;
                    this._persistLatestVolumeId(this.latestVolumeId);
                    this.consecutiveEmptyProbes = 0; // Reset counter for new volume
                } else if (newChunkURLs.length === 0 && this.chunkURLs.length === 0) {
                    // No chunks found for current volume - might be hitting a gap
                    this.consecutiveEmptyProbes++;
                    console.log(`[ChunkLoader] _interpolate: no chunks at volumeId=${this.latestVolumeId} (empty probe count: ${this.consecutiveEmptyProbes}/${this.maxEmptyProbesBeforeGapSearch})`);
                    
                    // If we've probed too many times without finding chunks, assume a gap
                    if (this.consecutiveEmptyProbes >= this.maxEmptyProbesBeforeGapSearch) {
                        console.log(`[ChunkLoader] _interpolate: reached empty probe limit, attempting gap detection`);
                        this._handlePossibleGap();
                    }
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
                    if (newChunkURLs.length > 0) {
                        this._updateLatestKeyFromChunkUrl(newChunkURLs[newChunkURLs.length - 1]);
                    }
                }
            })
            .catch(error => {
                console.error('[ChunkLoader] Error loading chunk listing:', error);
            })
            .finally(() => {
                this.pollInFlight = false;
            });
    }

    async _handlePossibleGap() {
        console.log(`[ChunkLoader] _handlePossibleGap: detected possible gap starting at volumeId=${this.latestVolumeId}`);
        if (this.gapStart === null) {
            this.gapStart = this.latestVolumeId;
            console.log(`[ChunkLoader] _handlePossibleGap: gap tracking initiated at volumeId=${this.gapStart}`);
        }

        // Try to find the next available volume after this gap.
        // Reject candidates that are older than our most recent chunk timestamp.
        const minTimestampKey = this._getReferenceChunkTimestampKey();
        let nextAvailableVolumeId = await this._findNextAvailableVolumeAfterGap(this.latestVolumeId, null, minTimestampKey);

        // If we are anchored to yesterday and cannot bridge, try today's token once.
        if (!nextAvailableVolumeId && this.activeDayToken) {
            const [todayToken] = this._getDateTokensToProbe();
            if (todayToken && todayToken !== this.activeDayToken) {
                console.log(`[ChunkLoader] _handlePossibleGap: retrying gap bridge with today's token ${todayToken}`);
                nextAvailableVolumeId = await this._findNextAvailableVolumeAfterGap(this.latestVolumeId, [todayToken], minTimestampKey);
                if (nextAvailableVolumeId) {
                    this.activeDayToken = todayToken;
                }
            }
        }

        if (nextAvailableVolumeId) {
            console.log(`[ChunkLoader] _handlePossibleGap: gap bridged! volumeId ${this.latestVolumeId} -> ${nextAvailableVolumeId}`);
            this.latestVolumeId = nextAvailableVolumeId;
            this._persistLatestVolumeId(this.latestVolumeId);
            this.gapEnd = this.latestVolumeId;
            console.log(`[ChunkLoader] _handlePossibleGap: gap detected from ${this.gapStart} to ${this.gapEnd}`);
            this.gapStart = null;
            this.consecutiveEmptyProbes = 0;
        } else {
            console.log(`[ChunkLoader] _handlePossibleGap: could not bridge gap at volumeId=${this.latestVolumeId}`);
        }
    }

    async _bootstrapLatestFromS3() {
        if (!this.isStreaming || this.latestVolumeId == null) {
            return;
        }

        const baseVolumeId = this.latestVolumeId;
        console.log(`[ChunkLoader] bootstrap: starting with baseVolumeId=${baseVolumeId}`);
        
        const candidates = [];
        let probeVolumeId = baseVolumeId;

        // Probe a few scans ahead of /latest in case the API response is cached behind S3.
        for (let i = 0; i < 3; i++) {
            probeVolumeId = this._incrementVolumeId(probeVolumeId);
            candidates.push(probeVolumeId);
        }

        console.log(`[ChunkLoader] bootstrap: sequential candidates to probe: [${candidates.join(', ')}]`);

        let newestVolumeId = null;
        let newestChunkURLs = [];
        let hitGap = false;
        let gapStartVolume = null;

        for (let i = 0; i < candidates.length; i++) {
            const candidateVolumeId = candidates[i];
            console.log(`[ChunkLoader] bootstrap: probing sequential candidate ${i + 1}/${candidates.length}: volumeId=${candidateVolumeId}`);
            const candidateChunkURLs = await this._loadChunkURLsForVolume(candidateVolumeId);

            if (candidateChunkURLs.length === 0) {
                console.log(`[ChunkLoader] bootstrap: no chunks found at volumeId=${candidateVolumeId} (hit gap or end of data)`);
                if (!hitGap) {
                    hitGap = true;
                    gapStartVolume = candidateVolumeId;
                    console.log(`[ChunkLoader] bootstrap: gap detected starting at volumeId=${gapStartVolume}`);
                }
                break;
            }

            newestVolumeId = candidateVolumeId;
            newestChunkURLs = candidateChunkURLs;
            console.log(`[ChunkLoader] bootstrap: found chunks at volumeId=${candidateVolumeId} (${candidateChunkURLs.length} chunks)`);

            const isComplete = candidateChunkURLs[candidateChunkURLs.length - 1].endsWith('E');
            if (!isComplete) {
                console.log(`[ChunkLoader] bootstrap: volumeId=${candidateVolumeId} incomplete, stopping sequential probe`);
                break;
            }
        }

        // If we hit a gap, try to find volumes beyond it
        if (hitGap && gapStartVolume) {
            console.log(`[ChunkLoader] bootstrap: attempting to probe across gap starting at volumeId=${gapStartVolume}`);
            const gapJumpVolumeId = await this._findNextAvailableVolumeAfterGap(gapStartVolume);
            if (gapJumpVolumeId) {
                console.log(`[ChunkLoader] bootstrap: found volume beyond gap: volumeId=${gapJumpVolumeId}`);
                const gapJumpChunkURLs = await this._loadChunkURLsForVolume(gapJumpVolumeId);
                if (gapJumpChunkURLs.length > 0) {
                    console.log(`[ChunkLoader] bootstrap: successfully loaded chunks from beyond gap (volumeId=${gapJumpVolumeId}, ${gapJumpChunkURLs.length} chunks)`);
                    newestVolumeId = gapJumpVolumeId;
                    newestChunkURLs = gapJumpChunkURLs;
                }
            } else {
                console.log(`[ChunkLoader] bootstrap: could not find volumes beyond gap`);
            }
        }

        if (!newestVolumeId || newestChunkURLs.length === 0) {
            console.log(`[ChunkLoader] bootstrap: no newer S3 volume ahead of /latest (${baseVolumeId})`);
            return;
        }

        console.log(`[ChunkLoader] bootstrap: found newer S3 volume ${newestVolumeId} (${newestChunkURLs.length} chunks) ahead of /latest ${baseVolumeId}`);
        this.latestVolumeId = newestVolumeId;
        this._persistLatestVolumeId(this.latestVolumeId);
        this.chunkURLs = newestChunkURLs;
        this._updateLatestKeyFromChunkUrl(newestChunkURLs[newestChunkURLs.length - 1]);

        // If the newer scan is already complete, prefer it immediately and avoid stale startup data.
        if (newestChunkURLs[newestChunkURLs.length - 1].endsWith('E')) {
            this.previousChunkURLs = [...newestChunkURLs];
        }

        this.onNewChunk(newestChunkURLs[newestChunkURLs.length - 1]);
    }

    async _initializeFromS3() {
        if (!this.isStreaming) {
            return;
        }

        const restoredVolumeId = this._restoreLatestVolumeId();
        if (restoredVolumeId) {
            this.latestVolumeId = restoredVolumeId;
            console.log(`[ChunkLoader] startup: restored previous latestVolumeId=${restoredVolumeId}`);
        }

        // Always run a fresh discovery to avoid locking onto stale localStorage IDs.
        const discoveredVolumeId = await this._discoverLatestVolumeIdFromS3();
        if (discoveredVolumeId) {
            if (this.latestVolumeId && this.latestVolumeId !== discoveredVolumeId) {
                console.log(`[ChunkLoader] startup: overriding restored latestVolumeId=${this.latestVolumeId} with discovered latestVolumeId=${discoveredVolumeId}`);
            }
            this.latestVolumeId = discoveredVolumeId;
        }

        if (this.latestVolumeId == null) {
            // Last chance fallback to restored value if discovery failed.
            if (restoredVolumeId) {
                this.latestVolumeId = restoredVolumeId;
            }
        }

        if (this.latestVolumeId == null) {
            console.warn('[ChunkLoader] startup: unable to discover a latest volume ID from S3 yet; waiting for next poll');
            return;
        }

        this._persistLatestVolumeId(this.latestVolumeId);

        // Prime startup with at least one complete volume when possible.
        const seedChunkURLs = await this._loadChunkURLsForVolume(this.latestVolumeId);
        if (Array.isArray(seedChunkURLs) && seedChunkURLs.length > 0) {
            this.chunkURLs = seedChunkURLs;
            const last = seedChunkURLs[seedChunkURLs.length - 1];
            this.latestKey = typeof last === 'string'
                ? last.replace('https://unidata-nexrad-level2-chunks.s3.amazonaws.com/', '')
                : null;

            if (last.endsWith('E')) {
                this.previousChunkURLs = [...seedChunkURLs];
            }
        }

        await this._bootstrapLatestFromS3();
    }

    async _discoverLatestVolumeIdFromS3() {
        const dateTokens = this._getDateTokensToProbe();

        for (const dateToken of dateTokens) {
            const discovered = await this._findLatestVolumeBeforeGap(dateToken);
            if (discovered) {
                console.log(`[ChunkLoader] startup: discovered latest volumeId=${discovered} for date ${dateToken}`);
                return discovered;
            }
        }

        return null;
    }

    async _findLatestVolumeBeforeGap(dateToken) {
        const idWidth = 3;
        const formatVolumeId = (numericId) => String(numericId).padStart(idWidth, '0');
        const hasChunksAtVolume = async (numericId) => {
            if (numericId < 1 || numericId > 999) {
                return false;
            }
            const urls = await this._loadChunkURLsForVolume(formatVolumeId(numericId), [dateToken]);
            return urls.length > 0;
        };

        let lowerHit = null;
        let upperMiss = null;

        // Coarse pass: probe every 100 IDs to quickly bracket the gap.
        for (let probe = 100; probe <= 900; probe += 100) {
            const found = await hasChunksAtVolume(probe);
            console.log(`[ChunkLoader] startup: coarse +100 probe volumeId=${formatVolumeId(probe)} => ${found ? 'hit' : 'miss'}`);

            if (found) {
                lowerHit = probe;
                continue;
            }

            upperMiss = probe;
            break;
        }

        // If 100 was already missing, discover whether anything exists in 001-099.
        if (lowerHit === null) {
            const hasFirstVolume = await hasChunksAtVolume(1);
            if (!hasFirstVolume) {
                console.log(`[ChunkLoader] startup: no chunks available for date ${dateToken}`);
                return null;
            }

            lowerHit = 1;
            if (upperMiss === null) {
                upperMiss = 100;
            }
        }

        // If all coarse probes hit, keep refining up to 999.
        if (upperMiss === null) {
            upperMiss = 1000;
        }

        // Refinement pass: tighten bounds to the first missing scan after latest hit.
        const refinementSteps = [50, 10, 5, 1];
        for (const step of refinementSteps) {
            let probe = lowerHit + step;

            while (probe < upperMiss) {
                const found = await hasChunksAtVolume(probe);
                console.log(`[ChunkLoader] startup: refine +${step} probe volumeId=${formatVolumeId(probe)} => ${found ? 'hit' : 'miss'}`);

                if (found) {
                    lowerHit = probe;
                    probe += step;
                    continue;
                }

                upperMiss = probe;
                break;
            }
        }

        const discovered = formatVolumeId(lowerHit);
        console.log(`[ChunkLoader] startup: resolved latest pre-gap volumeId=${discovered} for date ${dateToken}`);
        return discovered;
    }

    async _findLatestAheadBeforeGap(baseVolumeId, dateTokens = null, minTimestampKey = null) {
        const baseNumeric = Number(baseVolumeId);
        if (!Number.isFinite(baseNumeric) || baseNumeric < 1 || baseNumeric > 999) {
            return null;
        }

        const idWidth = String(baseVolumeId).length || 3;
        const formatVolumeId = (numericId) => String(numericId).padStart(idWidth, '0');
        const hasUsableChunksAtVolume = async (numericId) => {
            if (numericId < 1 || numericId > 999) {
                return false;
            }

            const urls = await this._loadChunkURLsForVolume(formatVolumeId(numericId), dateTokens);
            if (urls.length === 0) {
                return false;
            }

            if (!minTimestampKey) {
                return true;
            }

            const candidateTimestampKey = this._extractChunkTimestampKey(urls[urls.length - 1]);
            return !candidateTimestampKey || candidateTimestampKey >= minTimestampKey;
        };

        let lowerHit = baseNumeric;
        let upperMiss = null;

        for (let probe = baseNumeric + 100; probe <= 999; probe += 100) {
            const found = await hasUsableChunksAtVolume(probe);
            console.log(`[ChunkLoader] _findLatestAheadBeforeGap: coarse +100 probe volumeId=${formatVolumeId(probe)} => ${found ? 'hit' : 'miss'}`);

            if (found) {
                lowerHit = probe;
                continue;
            }

            upperMiss = probe;
            break;
        }

        if (upperMiss === null) {
            upperMiss = 1000;
        }

        const refinementSteps = [50, 10, 5, 1];
        for (const step of refinementSteps) {
            let probe = lowerHit + step;

            while (probe < upperMiss && probe <= 999) {
                const found = await hasUsableChunksAtVolume(probe);
                console.log(`[ChunkLoader] _findLatestAheadBeforeGap: refine +${step} probe volumeId=${formatVolumeId(probe)} => ${found ? 'hit' : 'miss'}`);

                if (found) {
                    lowerHit = probe;
                    probe += step;
                    continue;
                }

                upperMiss = probe;
                break;
            }
        }

        if (lowerHit <= baseNumeric) {
            return null;
        }

        const discovered = formatVolumeId(lowerHit);
        console.log(`[ChunkLoader] _findLatestAheadBeforeGap: fast-forward target resolved to volumeId=${discovered} (from base=${formatVolumeId(baseNumeric)})`);
        return discovered;
    }

    async _findNextAvailableVolumeAfterGap(gapStartVolume, dateTokens = null, minTimestampKey = null) {
        console.log(`[ChunkLoader] _findNextAvailableVolumeAfterGap: searching for volumes after gap starting at ${gapStartVolume}`);
        
        const numeric = Number(gapStartVolume);
        if (!Number.isFinite(numeric)) {
            console.log(`[ChunkLoader] _findNextAvailableVolumeAfterGap: invalid volume ID, cannot search gap`);
            return null;
        }

        // Probe progressively larger jumps across most of the 001-999 ring,
        // so large gaps do not strand the stream near low IDs.
        const jumpSizes = [
            1, 2, 3, 5, 10,
            25, 50, 75, 100,
            150, 200, 250, 300,
            400, 500, 600, 700, 800, 900,
        ];
        const probed = new Set();
        const idWidth = String(gapStartVolume).length || 3;

        for (const jumpSize of jumpSizes) {
            const candidateVolumeId = numeric + jumpSize;
            const wrappedId = ((candidateVolumeId - 1) % 999) + 1;
            const finalVolumeIdStr = String(wrappedId).padStart(idWidth, '0');
            
            if (probed.has(finalVolumeIdStr)) {
                continue;
            }
            probed.add(finalVolumeIdStr);
            
            console.log(`[ChunkLoader] _findNextAvailableVolumeAfterGap: probing jump +${jumpSize} -> volumeId=${finalVolumeIdStr}`);
            const chunkURLs = await this._loadChunkURLsForVolume(finalVolumeIdStr, dateTokens);
            
            if (chunkURLs.length > 0) {
                const candidateTimestampKey = this._extractChunkTimestampKey(chunkURLs[chunkURLs.length - 1]);
                if (minTimestampKey && candidateTimestampKey && candidateTimestampKey < minTimestampKey) {
                    console.log(`[ChunkLoader] _findNextAvailableVolumeAfterGap: skipping older candidate volumeId=${finalVolumeIdStr} (candidate=${candidateTimestampKey}, min=${minTimestampKey})`);
                    continue;
                }
                console.log(`[ChunkLoader] _findNextAvailableVolumeAfterGap: SUCCESS found volume at volumeId=${finalVolumeIdStr} after jump of +${jumpSize}`);
                return finalVolumeIdStr;
            }
            console.log(`[ChunkLoader] _findNextAvailableVolumeAfterGap: no chunks at jump +${jumpSize}`);
        }

        console.log(`[ChunkLoader] _findNextAvailableVolumeAfterGap: exhausted jump sizes, could not find volume beyond gap`);
        return null;
    }

    async _loadChunkURLsForVolume(volumeId, dateTokens = null) {
        if (volumeId == null) {
            return [];
        }

        const volumeIdsToProbe = this._getVolumeIdPathCandidates(volumeId);
        const daysToProbe = Array.isArray(dateTokens) && dateTokens.length > 0
            ? dateTokens
            : (this.activeDayToken ? [this.activeDayToken] : this._getDateTokensToProbe());

        for (const probeVolumeId of volumeIdsToProbe) {
            for (const dayToken of daysToProbe) {
                const prefix = `${this.station}/${probeVolumeId}/${dayToken}`;

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

                    if (keys.length > 0) {
                        if (!this.activeDayToken) {
                            this.activeDayToken = dayToken;
                            console.log(`[ChunkLoader] _loadChunkURLsForVolume: active day token set to ${dayToken}`);
                        }
                        return keys.map(key => `https://unidata-nexrad-level2-chunks.s3.amazonaws.com/${key}`);
                    }
                } catch (error) {
                    console.error(`[ChunkLoader] Error loading chunk listing for volume ${probeVolumeId} (${dayToken}):`, error);
                }
            }
        }

        return [];
    }

    _getDateTokensToProbe() {
        const now = new Date();
        const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        return [
            now.toISOString().slice(0, 10).replace(/-/g, ''),
            yesterday.toISOString().slice(0, 10).replace(/-/g, ''),
        ];
    }

    _getLatestVolumeStorageKey() {
        return `sparkradar:l2chunk:latestVolume:${this.station || 'UNKNOWN'}`;
    }

    _restoreLatestVolumeId() {
        try {
            if (typeof localStorage === 'undefined') {
                return null;
            }
            const value = localStorage.getItem(this._getLatestVolumeStorageKey());
            if (!value || !/^\d+$/.test(value)) {
                return null;
            }
            return value;
        } catch {
            return null;
        }
    }

    _persistLatestVolumeId(volumeId) {
        try {
            if (typeof localStorage === 'undefined' || volumeId == null) {
                return;
            }
            localStorage.setItem(this._getLatestVolumeStorageKey(), String(volumeId));
        } catch {
            // Ignore storage errors.
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

    _getVolumeIdPathCandidates(volumeId) {
        const raw = String(volumeId ?? '').trim();
        if (!raw) {
            return [];
        }

        const candidates = [raw];
        if (/^\d+$/.test(raw)) {
            const normalized = String(Number(raw));
            if (normalized && !candidates.includes(normalized)) {
                candidates.push(normalized);
            }
        }

        return candidates;
    }

    _extractChunkTimestampKey(pathLike) {
        if (!pathLike || typeof pathLike !== 'string') return null;
        const fileName = pathLike.split('/').pop() || '';
        const match = fileName.match(/^(\d{8})-(\d{6})-/);
        if (!match) {
            return null;
        }
        return `${match[1]}${match[2]}`;
    }

    _getReferenceChunkTimestampKey() {
        const candidates = [];

        if (typeof this.latestKey === 'string' && this.latestKey.length > 0) {
            const keyTs = this._extractChunkTimestampKey(this.latestKey);
            if (keyTs) {
                candidates.push(keyTs);
            }
        }

        if (this.chunkURLs.length > 0) {
            const currentTs = this._extractChunkTimestampKey(this.chunkURLs[this.chunkURLs.length - 1]);
            if (currentTs) {
                candidates.push(currentTs);
            }
        }

        if (this.previousChunkURLs.length > 0) {
            const previousTs = this._extractChunkTimestampKey(this.previousChunkURLs[this.previousChunkURLs.length - 1]);
            if (previousTs) {
                candidates.push(previousTs);
            }
        }

        if (candidates.length === 0) {
            return null;
        }

        return candidates.sort().pop();
    }

    _updateLatestKeyFromChunkUrl(url) {
        if (!url || typeof url !== 'string') {
            return;
        }
        this.latestKey = url.replace('https://unidata-nexrad-level2-chunks.s3.amazonaws.com/', '');
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