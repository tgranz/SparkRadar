/*

> mesh_worker.js
Web Worker for off-thread mesh vertex data computation.

Receives:  { type: 'buildMesh', id, meshData, colorStops, palette, reflectivityGateFilter }
Responds:  { type: 'meshResult', id, vertexData }
           — vertexData.buffer is transferred (zero-copy) back to the main thread.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

import { buildVertexDataFromMesh } from '../frontend/mesh.js';

self.onmessage = (e) => {
    const { type, id, meshData, colorStops, palette, reflectivityGateFilter } = e.data;

    if (type === 'buildMesh') {
        const vertexData = buildVertexDataFromMesh(meshData, colorStops, palette, reflectivityGateFilter);
        // Transfer the underlying ArrayBuffer so no copy is made on the way back.
        self.postMessage({ type: 'meshResult', id, vertexData }, [vertexData.buffer]);
    }
};
