/*
 * radar_cache.js
 * Radar data caching system for fast re-rendering
 * 
 * Caches parsed mesh data (Float32Array) to avoid re-fetching
 * and re-parsing radar files when switching between stations,
 * tilts, or products.
 * 
 * (c) 2026 Tyler G (@tgranz)
 */

class RadarCache {
    constructor(maxSlots = 6, maxSizeGB = 0) {
        this.maxSlots = maxSlots;
        this.maxBytes = Number.isFinite(maxSizeGB) && maxSizeGB > 0
            ? Math.floor(maxSizeGB * 1024 * 1024 * 1024)
            : Infinity;
        this.cache = [];
        this.hits = 0;
        this.misses = 0;
        this.totalBytes = 0;
    }

    _estimateMetadataBytes(metadata = {}) {
        try {
            const encoded = new TextEncoder().encode(JSON.stringify(metadata));
            return encoded.byteLength;
        } catch {
            return 0;
        }
    }

    _estimateEntryBytes(meshData, bounds, metadata) {
        const meshBytes = meshData?.byteLength || 0;
        const boundsBytes = Array.isArray(bounds) ? (bounds.length * 8) : 0;
        const metadataBytes = this._estimateMetadataBytes(metadata);
        // Rough overhead for object/string bookkeeping.
        const overheadBytes = 256;
        return meshBytes + boundsBytes + metadataBytes + overheadBytes;
    }

    _formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let value = bytes;
        let idx = 0;
        while (value >= 1024 && idx < units.length - 1) {
            value /= 1024;
            idx += 1;
        }
        return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[idx]}`;
    }

    /**
     * Generate a unique key for a cache entry
     * @param {string} station - Radar station (e.g., 'KIWX')
     * @param {string} product - Product code (e.g., 'REF', 'VEL', 'N0Q')
     * @param {number|string} tilt - Tilt/elevation angle
     * @param {string} timeIso - ISO timestamp of the radar scan
     * @returns {string} Cache key
     */
    _generateKey(station, product, tilt, timeIso) {
        return `${station}|${product}|${tilt}|${timeIso}`;
    }

    /**
     * Check if a cache entry exists and is valid
     * @param {string} station - Radar station
     * @param {string} product - Product code
     * @param {number|string} tilt - Tilt/elevation angle
     * @param {string} timeIso - ISO timestamp
     * @returns {Object|null} Cache entry or null if not found
     */
    get(station, product, tilt, timeIso) {
        const key = this._generateKey(station, product, tilt, timeIso);
        const entry = this.cache.find(item => item.key === key);
        
        if (entry) {
            // Update last accessed time
            entry.lastAccessed = Date.now();
            this.hits++;
            console.log(`[RadarCache] Cache HIT: ${key} (${this.hits} hits, ${this.misses} misses)`);
            return {
                meshData: entry.meshData,
                bounds: entry.bounds,
                metadata: entry.metadata
            };
        }
        
        this.misses++;
        console.log(`[RadarCache] Cache MISS: ${key} (${this.hits} hits, ${this.misses} misses)`);
        return null;
    }

    /**
     * Add or update a cache entry
     * @param {string} station - Radar station
     * @param {string} product - Product code
     * @param {number|string} tilt - Tilt/elevation angle
     * @param {string} timeIso - ISO timestamp
     * @param {Float32Array} meshData - Parsed mesh data
     * @param {Array} bounds - Bounding box [minLng, minLat, maxLng, maxLat]
     * @param {Object} metadata - Additional metadata
     */
    set(station, product, tilt, timeIso, meshData, bounds, metadata = {}) {
        const key = this._generateKey(station, product, tilt, timeIso);
        const entryBytes = this._estimateEntryBytes(meshData, bounds, metadata);

        if (entryBytes > this.maxBytes) {
            console.warn(`[RadarCache] Skipping entry larger than cache max size: ${key} (${this._formatBytes(entryBytes)} > ${this._formatBytes(this.maxBytes)})`);
            return;
        }
        
        // Check if entry already exists
        const existingIndex = this.cache.findIndex(item => item.key === key);
        if (existingIndex !== -1) {
            const previousBytes = this.cache[existingIndex].byteSize || 0;
            // Update existing entry
            this.cache[existingIndex] = {
                key,
                station,
                product,
                tilt,
                timeIso,
                meshData: new Float32Array(meshData), // Create a copy
                bounds: bounds ? [...bounds] : null,
                metadata: { ...metadata },
                byteSize: entryBytes,
                created: this.cache[existingIndex].created,
                lastAccessed: Date.now()
            };
            this.totalBytes = Math.max(0, this.totalBytes - previousBytes + entryBytes);

            // Enforce memory limit after update
            while (this.totalBytes > this.maxBytes && this.cache.length > 0) {
                this._evictOldest();
            }
            console.log(`[RadarCache] Updated existing entry: ${key}`);
            return;
        }

        // Create new entry
        const entry = {
            key,
            station,
            product,
            tilt,
            timeIso,
            meshData: new Float32Array(meshData), // Create a copy
            bounds: bounds ? [...bounds] : null,
            metadata: { ...metadata },
            byteSize: entryBytes,
            created: Date.now(),
            lastAccessed: Date.now()
        };

        // Enforce slot limit - evict oldest entries only if all slots are full
        while (this.cache.length >= this.maxSlots) {
            if (this.cache.length === 0) break;
            this._evictOldest();
        }

        // Add the new entry
        this.cache.push(entry);
        this.totalBytes += entryBytes;
        console.log(`[RadarCache] Added new entry: ${key} (${this.cache.length}/${this.maxSlots} slots used)`);

        // Enforce memory limit as secondary constraint - evict if we exceeded byte limit
        while (this.totalBytes > this.maxBytes && this.cache.length > 1) {
            this._evictOldest();
        }
    }

    /**
     * Evict the oldest cache entry based on last accessed time
     * @private
     */
    _evictOldest() {
        if (this.cache.length === 0) return;

        // Find the entry with the oldest lastAccessed time
        let oldestIndex = 0;
        let oldestTime = this.cache[0].lastAccessed;

        for (let i = 1; i < this.cache.length; i++) {
            if (this.cache[i].lastAccessed < oldestTime) {
                oldestTime = this.cache[i].lastAccessed;
                oldestIndex = i;
            }
        }

        const evicted = this.cache.splice(oldestIndex, 1)[0];
        this.totalBytes = Math.max(0, this.totalBytes - (evicted?.byteSize || 0));
        console.log(`[RadarCache] Evicted oldest entry: ${evicted.key}`);
    }

    /**
     * Check if there's a newer version available for a given station/product/tilt
     * This should be called before fetching new data
     * @param {string} station
     * @param {string} product
     * @param {number|string} tilt
     * @returns {string|null} The cached timeIso if found, null otherwise
     */
    getLatestCachedTime(station, product, tilt) {
        const entries = this.cache.filter(item => 
            item.station === station &&
            item.product === product &&
            item.tilt === tilt
        );

        if (entries.length === 0) return null;

        // Find the most recent time
        let latestTime = entries[0].timeIso;
        for (let i = 1; i < entries.length; i++) {
            if (entries[i].timeIso > latestTime) {
                latestTime = entries[i].timeIso;
            }
        }

        return latestTime;
    }

    /**
     * Clear all cache entries
     */
    clear() {
        const count = this.cache.length;
        this.cache = [];
        this.hits = 0;
        this.misses = 0;
        this.totalBytes = 0;
        console.log(`[RadarCache] Cleared ${count} entries`);
    }

    /**
     * Get cache statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        const total = this.hits + this.misses;
        const hitRate = total > 0 ? ((this.hits / total) * 100).toFixed(1) : 0;
        
        return {
            slots: this.cache.length,
            maxSlots: this.maxSlots,
            totalBytes: this.totalBytes,
            totalSize: this._formatBytes(this.totalBytes),
            maxBytes: Number.isFinite(this.maxBytes) ? this.maxBytes : null,
            maxSize: Number.isFinite(this.maxBytes) ? this._formatBytes(this.maxBytes) : 'Unlimited',
            hits: this.hits,
            misses: this.misses,
            hitRate: `${hitRate}%`,
            entries: this.cache.map(entry => ({
                station: entry.station,
                product: entry.product,
                tilt: entry.tilt,
                time: entry.timeIso,
                age: Date.now() - entry.created,
                sizeBytes: entry.byteSize || 0,
                size: this._formatBytes(entry.byteSize || 0)
            }))
        };
    }

    /**
     * Update the maximum number of cache slots
     * @param {number} newMaxSlots - New maximum number of slots
     */
    setMaxSlots(newMaxSlots) {
        if (newMaxSlots < 1) {
            console.warn('[RadarCache] Max slots must be at least 1');
            return;
        }

        this.maxSlots = newMaxSlots;
        
        // Evict excess entries if needed
        while (this.cache.length > this.maxSlots) {
            this._evictOldest();
        }
        
        console.log(`[RadarCache] Max slots updated to ${newMaxSlots}`);
    }

    setMaxSizeGB(maxSizeGB) {
        if (!Number.isFinite(maxSizeGB) || maxSizeGB <= 0) {
            this.maxBytes = Infinity;
            console.log('[RadarCache] Max size disabled (unlimited)');
            return;
        }

        this.maxBytes = Math.floor(maxSizeGB * 1024 * 1024 * 1024);
        while (this.totalBytes > this.maxBytes && this.cache.length > 0) {
            this._evictOldest();
        }
        console.log(`[RadarCache] Max size updated to ${maxSizeGB} GB (${this._formatBytes(this.maxBytes)})`);
    }

    /**
     * Remove specific entries matching criteria
     * @param {Object} criteria - Object with station, product, tilt properties to match
     */
    removeMatching(criteria) {
        const before = this.cache.length;
        let removedBytes = 0;
        this.cache = this.cache.filter(entry => {
            if (criteria.station && entry.station !== criteria.station) return true;
            if (criteria.product && entry.product !== criteria.product) return true;
            if (criteria.tilt !== undefined && entry.tilt !== criteria.tilt) return true;
            removedBytes += entry.byteSize || 0;
            return false;
        });
        const removed = before - this.cache.length;
        this.totalBytes = Math.max(0, this.totalBytes - removedBytes);
        if (removed > 0) {
            console.log(`[RadarCache] Removed ${removed} entries matching criteria`);
        }
    }
}

export default RadarCache;
