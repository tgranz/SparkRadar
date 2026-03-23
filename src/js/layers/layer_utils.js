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

export function hasUsableMapStyle(map) {
    if (!map || typeof map.getStyle !== 'function') return false;

    try {
        const style = map.getStyle();
        return !!style && Array.isArray(style.layers);
    } catch {
        return false;
    }
}

export function waitForMapStyleReady(map) {
    if (!map) return Promise.resolve();

    if (hasUsableMapStyle(map)) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        let resolved = false;
        const events = ['styledata', 'data', 'idle', 'load'];
        let pollId = null;
        let timeoutId = null;

        const cleanup = () => {
            events.forEach((eventName) => {
                map.off(eventName, onMapUpdate);
            });
            if (pollId) {
                clearInterval(pollId);
                pollId = null;
            }
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
        };

        const onMapUpdate = () => {
            if (hasUsableMapStyle(map)) {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve();
            }
        };

        events.forEach((eventName) => {
            map.on(eventName, onMapUpdate);
        });

        pollId = setInterval(onMapUpdate, 100);

        timeoutId = setTimeout(() => {
            if (resolved) return;
            cleanup();
            resolve();
        }, 15000);
    });
}

/**
 * Returns the best layer ID to insert weather overlays beneath roads and labels.
 */
export function getWeatherOverlayBeforeLayerId(map, target) {
    if (!map) return undefined;

    const preferredOrder = [
        'road_area_pier',
        'road_pier',
        target === 'main' ? 'radar-webgl' : 'radar-webgl-dual'
    ];

    for (const layerId of preferredOrder) {
        if (map.getLayer(layerId)) {
            return layerId;
        }
    }

    return undefined;
}

export function getRadarLayerId(target) {
    return target === 'main' ? 'radar-webgl' : 'radar-webgl-dual';
}

/**
 * Fill layers should render below radar when possible.
 */
export function getWeatherFillBeforeLayerId(map, target) {
    if (!map) return undefined;
    const radarLayerId = getRadarLayerId(target);
    if (map.getLayer(radarLayerId)) {
        return radarLayerId;
    }
    return getWeatherOverlayBeforeLayerId(map, target);
}

/**
 * Outline layers should render above radar but below roads/labels.
 */
export function getWeatherOutlineBeforeLayerId(map, target) {
    return getWeatherOverlayBeforeLayerId(map, target);
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

// ─── Layer Ordering ──────────────────────────────────────────────────────────

export const DEFAULT_LAYER_ORDER = [
    'signatures', 'labels', 'alerts', 'watches', 'mesoscaleDiscussions', 'roads', 'surfaceAnalysis', 'lightning', 'spotterNetworkPositions', 'radar', 'outlook'
];

export const LAYER_ORDER_LABELS = {
    labels:                'Labels',
    signatures:            'TVS / Hail Signatures',
    alerts:                'Alerts',
    watches:               'Watches',
    mesoscaleDiscussions:  'Mesoscale Discussions',
    surfaceAnalysis:       'Surface Fronts',
    lightning:             'Lightning',
    spotterNetworkPositions:'Spotter Network Positions',
    outlook:               'SPC Outlook',
    roads:                 'Roads',
    radar:                 'Radar',
};

export const LAYER_ORDER_ANCHORS = new Set(['roads', 'labels']);

export function findFirstRoadLayer(map) {
    const layers = map.getStyle()?.layers || [];
    // Exclude tunnel layers; find the first above-grade road/highway/bridge/railway layer
    return layers.find(l => !l.id.startsWith('tunnel') && /road|highway|railway|bridge/.test(l.id))?.id;
}

export function findFirstLabelLayer(map) {
    const layers = map.getStyle()?.layers || [];
    // Match only place-label layers (label_city, label_country, etc.), not waterway/highway name
    // layers whose IDs end in '_label' (e.g. waterway_line_label, highway-name-minor)
    return layers.find(l => /^label_/.test(l.id))?.id;
}

function _getGroupLayerIds(map, group, target) {
    const isDual = target === 'dual';

    // Custom layers (type: 'custom') are excluded from map.getStyle().layers serialization,
    // so radar must be checked with map.getLayer() directly.
    if (group === 'radar') {
        const id = isDual ? 'radar-webgl-dual' : 'radar-webgl';
        return map.getLayer(id) ? [id] : [];
    }

    const layers = map.getStyle()?.layers || [];
    return layers.filter(l => {
        const id = l.id;
        const hasDual = id.includes('-dual');
        const isBaseStyleGroup = group === 'roads' || group === 'labels';
        if (!isBaseStyleGroup && isDual !== hasDual) return false;
        if (isBaseStyleGroup && hasDual) return false;
        switch (group) {
            case 'roads':               return !id.startsWith('tunnel') && /road|highway|railway|bridge/.test(id);
            case 'labels':              return /^label_/.test(id);
            case 'alerts':              return id.startsWith('alerts-combined')
                                              && !id.endsWith('-fill')
                                              && !id.endsWith('-fill-new');
            case 'watches':             return id.startsWith('watch-');
            case 'mesoscaleDiscussions':return id.startsWith('md-');
            case 'surfaceAnalysis':     return id.startsWith('surface-analysis-');
            case 'lightning':           return id.startsWith('lightning-');
            case 'spotterNetworkPositions': return id.startsWith('spotter-network-position-');
            case 'outlook':             return id.startsWith('outlook-layer');
            case 'signatures':          return id.startsWith('center-');
            case 'alertFills':          return id.startsWith('alerts-combined')
                                              && (id.endsWith('-fill') || id.endsWith('-fill-new'));
            default:                    return false;
        }
    }).map(l => l.id);
}

/**
 * Reorders all active weather + base-map layers on `map` according to `orderList`.
 * orderList should go from highest z-index (index 0) to lowest.
 * Includes data layers (alerts, watches, etc.), weather overlays (radar, outlook, signatures),
 * and base-map components (roads, labels) as movable groups.
 */
export function applyLayerOrder(map, orderList, target = 'main') {
    if (!map || !orderList || orderList.length === 0) return;
    if (typeof map.getStyle !== 'function') return;

    // beforeIdForNext is the layer that the NEXT (lower z-index) group should be inserted before.
    // undefined means "place at the very top of the stack".
    let beforeIdForNext = undefined;

    for (let i = 0; i < orderList.length; i++) {
        const group = orderList[i];
        const beforeId      = beforeIdForNext;
        const groupLayerIds = _getGroupLayerIds(map, group, target);
        if (groupLayerIds.length === 0) continue;

        // Move the topmost group layer to just below `beforeId`
        try { map.moveLayer(groupLayerIds[groupLayerIds.length - 1], beforeId); } catch (e) {}

        // Stack remaining group layers below the topmost, maintaining their relative order
        for (let j = groupLayerIds.length - 2; j >= 0; j--) {
            try { map.moveLayer(groupLayerIds[j], groupLayerIds[j + 1]); } catch (e) {}
        }

        // Next group goes just below the bottom of this group
        beforeIdForNext = groupLayerIds[0];
    }

    // Keep alert fills pinned beneath all customizable groups.
    const alertFillLayerIds = _getGroupLayerIds(map, 'alertFills', target);
    if (alertFillLayerIds.length > 0) {
        const fillBeforeId = beforeIdForNext;

        try { map.moveLayer(alertFillLayerIds[alertFillLayerIds.length - 1], fillBeforeId); } catch (e) {}
        for (let i = alertFillLayerIds.length - 2; i >= 0; i--) {
            try { map.moveLayer(alertFillLayerIds[i], alertFillLayerIds[i + 1]); } catch (e) {}
        }
    }
}
