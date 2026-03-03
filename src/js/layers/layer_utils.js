/*
Layer Utilities
Shared utilities for all layer types

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

/**
 * Waits for the radar layer to be added to the map
 */
export function waitForRadarLayer(map, target) {
    if (!map) return Promise.resolve();

    const radarLayerId = target === 'main' ? 'radar-webgl' : 'radar-webgl-dual';

    // If radar layer already exists, resolve immediately
    if (map.getLayer(radarLayerId)) {
        return Promise.resolve();
    }

    // Otherwise, wait for it to be added
    return new Promise((resolve) => {
        let resolved = false;
        const events = ['layeradd', 'styledata', 'data', 'idle'];

        const cleanup = () => {
            events.forEach((eventName) => {
                map.off(eventName, onMapUpdate);
            });
        };

        const onMapUpdate = () => {
            if (map.getLayer(radarLayerId)) {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve();
            }
        };

        events.forEach((eventName) => {
            map.on(eventName, onMapUpdate);
        });

        setTimeout(() => {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve();
        }, 2500);
    });
}

/**
 * Normalizes a polygon ring by removing duplicates and ensuring proper closure
 */
export function normalizePolygonRing(ring) {
    if (!ring || ring.length < 3) return ring;
    
    const epsilon = 0.0001;
    
    // First, find which point should be the start/end (the one that appears at both ends for closing)
    const lastPoint = ring[ring.length - 1];
    let properStartIndex = 0;
    
    // Check if the first point matches the last (properly closed polygon)
    const firstMatchesLast = Math.abs(ring[0][0] - lastPoint[0]) < epsilon && 
                             Math.abs(ring[0][1] - lastPoint[1]) < epsilon;
    
    if (!firstMatchesLast) {
        // The polygon isn't properly closed with first=last, so we need to find the real start
        // Look for a point that appears twice (once in the middle, once at the end)
        for (let i = 1; i < ring.length - 1; i++) {
            if (Math.abs(ring[i][0] - lastPoint[0]) < epsilon && 
                Math.abs(ring[i][1] - lastPoint[1]) < epsilon) {
                properStartIndex = i;
                console.log(`[LayerUtils] Found proper start point at index ${i}: [${ring[i][0]}, ${ring[i][1]}]`);
                break;
            }
        }
    }
    
    // Rebuild the ring starting from the proper start point
    const normalized = [];
    const seen = new Map();
    
    // Start from the proper start point and wrap around
    for (let offset = 0; offset < ring.length; offset++) {
        const i = (properStartIndex + offset) % ring.length;
        
        // Skip the last point for now - we'll add the closing point manually
        if (offset === ring.length - 1) break;
        
        const point = ring[i];
        const key = `${point[0].toFixed(4)},${point[1].toFixed(4)}`;
        
        // Skip if we've already added this point
        if (seen.has(key)) {
            console.log(`[LayerUtils] Skipping duplicate point: [${point[0]}, ${point[1]}]`);
            continue;
        }
        
        seen.set(key, true);
        normalized.push([point[0], point[1]]);
    }
    
    // Close the polygon by adding the first point at the end
    if (normalized.length >= 3) {
        normalized.push([normalized[0][0], normalized[0][1]]);
    }
    
    // Need at least 4 points for a valid closed polygon
    if (normalized.length < 4) {
        console.warn('[LayerUtils] Polygon ring has too few points after normalization:', normalized.length);
        return ring;
    }
    
    console.log(`[LayerUtils] Normalized polygon: ${ring.length} points → ${normalized.length} points`);
    return normalized;
}

/**
 * Checks if a point is inside a polygon ring
 */
export function pointInRing(point, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > point[1]) !== (yj > point[1]))
            && (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Checks if a point is inside a polygon (accounting for holes)
 */
export function pointInPolygon(point, rings) {
    if (!rings || rings.length === 0) {
        console.log(`[LayerUtils] Invalid rings for point-in-polygon check`);
        return false;
    }
    console.log(`[LayerUtils] Checking point [${point[0]}, ${point[1]}] against polygon with ${rings.length} rings`);
    if (!pointInRing(point, rings[0])) {
        console.log(`[LayerUtils] Point is outside outer ring`);
        return false;
    }
    console.log(`[LayerUtils] Point is inside outer ring`);
    for (let i = 1; i < rings.length; i += 1) {
        if (pointInRing(point, rings[i])) {
            console.log(`[LayerUtils] Point is inside hole ring ${i}, excluding`);
            return false;
        }
    }
    return true;
}
