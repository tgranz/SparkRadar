/*

> mesh.js
Pure mesh-computation utilities.
No DOM or maplibregl dependencies — safe to use inside Web Workers.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

/**
 * Convert lng/lat to Mercator {x, y} in [0, 1] range.
 * Matches the output of `maplibregl.MercatorCoordinate.fromLngLat`.
 * @param {number} lng
 * @param {number} lat
 * @returns {{ x: number, y: number }}
 */
export function lngLatToMercator(lng, lat) {
    const x = (180 + lng) / 360;
    const y = (180 - (180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)))) / 360;
    return { x, y };
}

/**
 * Parse an rgb() or rgba() CSS color string into a [r, g, b, a] array
 * with components normalised to [0, 1].
 * @param {string} color
 * @returns {[number, number, number, number]}
 */
export function parseRgb(color) {
    let match = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    if (match) {
        return [
            Number(match[1]) / 255,
            Number(match[2]) / 255,
            Number(match[3]) / 255,
            Number(match[4]) / 255
        ];
    }
    match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) {
        return [1, 1, 1, 1];
    }
    return [
        Number(match[1]) / 255,
        Number(match[2]) / 255,
        Number(match[3]) / 255,
        1.0
    ];
}

/** Linear interpolation between two scalar values. */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/** Linear interpolation between two [r, g, b, a] colour arrays. */
export function lerpColor(a, b, t) {
    return [
        lerp(a[0], b[0], t),
        lerp(a[1], b[1], t),
        lerp(a[2], b[2], t),
        lerp(a[3], b[3], t)
    ];
}

/**
 * Return the interpolated [r, g, b, a] colour for a given radar value
 * using a sorted array of colour stops.
 * @param {number|'rf'} value
 * @param {Array<{value: number, color: [number,number,number,number]}>} colorStops
 * @returns {[number, number, number, number]}
 */
export function colorForValue(value, colorStops) {
    if (value === 'rf') {
        return [0.5, 0.0, 0.5, 1.0]; // Purple for range folding
    }

    const stops = colorStops;
    if (!stops || stops.length === 0) {
        return [1, 1, 1, 1];
    }

    if (value <= stops[0].value) {
        return stops[0].color;
    }

    if (value >= stops[stops.length - 1].value) {
        return stops[stops.length - 1].color;
    }

    // Linear search — fast enough for typical palette sizes (16–32 stops)
    for (let i = 0; i < stops.length - 1; i++) {
        const leftStop = stops[i];
        const rightStop = stops[i + 1];
        if (value >= leftStop.value && value <= rightStop.value) {
            const span = rightStop.value - leftStop.value;
            const t = span > 0 ? (value - leftStop.value) / span : 0;
            return lerpColor(leftStop.color, rightStop.color, t);
        }
    }

    return stops[stops.length - 1].color;
}

/**
 * Build a Float32Array of interleaved position + colour vertex data from a
 * radar mesh buffer.
 *
 * The mesh is a flat Float32Array with 9 floats per quad:
 *   [lon1, lat1, lon2, lat2, lon3, lat3, lon4, lat4, value]
 *
 * The output has 6 floats per vertex: [x, y, r, g, b, a] in Mercator space.
 * Each quad produces two triangles (6 vertices).
 *
 * @param {Float32Array} meshData
 * @param {Array<{value: number, color: [number,number,number,number]}>} colorStops
 * @param {string} palette - Active palette name, e.g. 'REF'
 * @param {number} reflectivityGateFilter - Minimum dBZ to keep (REF palette only)
 * @returns {Float32Array}
 */
export function buildVertexDataFromMesh(meshData, colorStops, palette, reflectivityGateFilter) {
    const data = [];

    for (let i = 0; i < meshData.length; i += 9) {
        const lon1 = meshData[i];
        const lat1 = meshData[i + 1];
        const lon2 = meshData[i + 2];
        const lat2 = meshData[i + 3];
        const lon3 = meshData[i + 4];
        const lat3 = meshData[i + 5];
        const lon4 = meshData[i + 6];
        const lat4 = meshData[i + 7];
        const rawValue = meshData[i + 8];
        const value = Number.isNaN(rawValue) ? 'rf' : rawValue;

        if (palette === 'REF' && value !== 'rf' && value < reflectivityGateFilter) {
            continue;
        }

        const color = colorForValue(value, colorStops);
        const p1 = lngLatToMercator(lon1, lat1);
        const p2 = lngLatToMercator(lon2, lat2);
        const p3 = lngLatToMercator(lon3, lat3);
        const p4 = lngLatToMercator(lon4, lat4);

        data.push(
            p1.x, p1.y, color[0], color[1], color[2], color[3],
            p2.x, p2.y, color[0], color[1], color[2], color[3],
            p3.x, p3.y, color[0], color[1], color[2], color[3],
            p1.x, p1.y, color[0], color[1], color[2], color[3],
            p3.x, p3.y, color[0], color[1], color[2], color[3],
            p4.x, p4.y, color[0], color[1], color[2], color[3]
        );
    }

    return new Float32Array(data);
}

/**
 * Point-in-ring ray casting test.
 * @param {[number, number]} point - [lng, lat]
 * @param {[number, number][]} ring
 * @returns {boolean}
 */
export function pointInRing(point, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = Number(ring[i][0]);
        const yi = Number(ring[i][1]);
        const xj = Number(ring[j][0]);
        const yj = Number(ring[j][1]);
        if (Number.isNaN(xi) || Number.isNaN(yi) || Number.isNaN(xj) || Number.isNaN(yj)) {
            continue;
        }
        const intersect = ((yi > point[1]) !== (yj > point[1]))
            && (point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi + 0.0) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Find the radar value at [lng, lat] by scanning the mesh quad array.
 * Returns the value, 'rf' for range-folded gates, or null if not found.
 *
 * @param {Float32Array} meshData
 * @param {[number, number, number, number]} meshBounds - [minLng, minLat, maxLng, maxLat]
 * @param {[number, number]} point - [lng, lat]
 * @returns {number|'rf'|null}
 */
export function findValueAtPointInMesh(meshData, meshBounds, point) {
    if (!meshData || !(meshData instanceof Float32Array) || !meshBounds) {
        return null;
    }

    const lng = point[0];
    const lat = point[1];

    if (lng < meshBounds[0] || lng > meshBounds[2] || lat < meshBounds[1] || lat > meshBounds[3]) {
        return null;
    }

    for (let i = 0; i < meshData.length; i += 9) {
        const lon1 = meshData[i];
        const lat1 = meshData[i + 1];
        const lon2 = meshData[i + 2];
        const lat2 = meshData[i + 3];
        const lon3 = meshData[i + 4];
        const lat3 = meshData[i + 5];
        const lon4 = meshData[i + 6];
        const lat4 = meshData[i + 7];
        const rawValue = meshData[i + 8];

        const ring = [[lon1, lat1], [lon2, lat2], [lon3, lat3], [lon4, lat4]];
        if (pointInRing(point, ring)) {
            return Number.isNaN(rawValue) ? 'rf' : rawValue;
        }
    }

    return null;
}
