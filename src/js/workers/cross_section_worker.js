/*
 * cross_section_worker.js
 * Web worker for cross-section gate sampling.
 *
 * The main thread sends tilt mesh data once after loading, then fires
 * lightweight 'collectGates' requests (just sample lat/lng pairs) on each
 * map update.  All O(N × mesh_size) work happens here off the main thread.
 *
 * (c) 2026 Tyler G (@tgranz)
 * See LICENSE for more.
 */

let tiltMeshes = [null, null, null, null];
let tiltBounds = [null, null, null, null];

/**
 * Zero-allocation point-in-quad test via ray casting.
 * Takes the 4 quad corner coordinates directly from the mesh flat array
 * to avoid any intermediate object allocations in the hot loop.
 */
function pointInQuad(px, py, x0, y0, x1, y1, x2, y2, x3, y3) {
    let inside = false;
    // Edge 0 → 1
    if ((y0 > py) !== (y1 > py) && px < ((x1 - x0) * (py - y0)) / (y1 - y0) + x0) inside = !inside;
    // Edge 1 → 2
    if ((y1 > py) !== (y2 > py) && px < ((x2 - x1) * (py - y1)) / (y2 - y1) + x1) inside = !inside;
    // Edge 2 → 3
    if ((y2 > py) !== (y3 > py) && px < ((x3 - x2) * (py - y2)) / (y3 - y2) + x2) inside = !inside;
    // Edge 3 → 0
    if ((y3 > py) !== (y0 > py) && px < ((x0 - x3) * (py - y3)) / (y0 - y3) + x3) inside = !inside;
    return inside;
}

function findValueInMesh(meshData, bounds, px, py) {
    if (!(meshData instanceof Float32Array) || !bounds) return null;
    // Bounding-box pre-rejection
    if (px < bounds[0] || px > bounds[2] || py < bounds[1] || py > bounds[3]) return null;

    for (let i = 0, len = meshData.length; i < len; i += 9) {
        if (pointInQuad(
            px, py,
            meshData[i],     meshData[i + 1],
            meshData[i + 2], meshData[i + 3],
            meshData[i + 4], meshData[i + 5],
            meshData[i + 6], meshData[i + 7]
        )) {
            const raw = meshData[i + 8];
            // NaN encodes range-folded gates — treat as no data
            return Number.isNaN(raw) ? null : raw;
        }
    }
    return null;
}

self.onmessage = (event) => {
    const msg = event.data;
    if (!msg) return;

    // ── Load tilt mesh data (sent once after _loadAllTilts completes) ──────────
    if (msg.type === 'loadTilts') {
        tiltMeshes = msg.tiltMeshes;
        tiltBounds = msg.tiltBounds;
        return;
    }

    // ── Sample gates along the cross-section line ─────────────────────────────
    if (msg.type === 'collectGates') {
        const { id, samples } = msg;
        const gateValues = new Array(samples.length);

        for (let s = 0; s < samples.length; s++) {
            const { lat, lng } = samples[s];
            const tilts = [null, null, null, null];

            for (let t = 0; t < 4; t++) {
                const mesh = tiltMeshes[t];
                const bounds = tiltBounds[t];
                if (mesh && bounds) {
                    const v = findValueInMesh(mesh, bounds, lng, lat);
                    if (v !== null && Number.isFinite(v)) tilts[t] = v;
                }
            }

            gateValues[s] = { lat, lng, tilts };
        }

        self.postMessage({ type: 'gatesResult', id, gateValues });
    }
};
