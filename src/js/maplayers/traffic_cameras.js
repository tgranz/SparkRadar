import AppWindow from '../ui/window.js';
import { hasUsableMapStyle, waitForMapStyleReady, waitForRadarLayer, getWeatherOutlineBeforeLayerId } from './layer_utils.js';
import trafficCamerasByState from '../../data/traffic_cameras.json';

const EMPTY_FEATURE_COLLECTION = {
    type: 'FeatureCollection',
    features: []
};

const SYNC_PENDING_STALE_MS = 15000;
const STATIC_IMAGE_REFRESH_INTERVAL_SEC = 5;

// Keep this list trimmed to the states you want displayed.
// Empty array means all states present in traffic_cameras.json are allowed.
export const TRAFFIC_CAMERA_STATE_WHITELIST = ['Kansas'];

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toFiniteNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function normalizeUrl(value) {
    const url = String(value || '').trim();
    return /^https?:\/\//i.test(url) ? url : '';
}

function isLikelyHls(url) {
    return /\.m3u8(?:$|\?|#)/i.test(String(url || ''));
}

function isLikelyImage(url) {
    return /\.(jpg|jpeg|png|gif|webp)(?:$|\?|#)/i.test(String(url || ''));
}

function appendCacheBuster(url) {
    const sep = String(url).includes('?') ? '&' : '?';
    return `${url}${sep}cb=${Date.now()}`;
}

class TrafficCamerasLayer {
    constructor(mapInstance) {
        this.map = mapInstance;
        this.data = EMPTY_FEATURE_COLLECTION;
        this.syncPending = { main: false, dual: false };
        this.syncPendingSince = { main: 0, dual: 0 };

        this.clickHandlers = { main: null, dual: null };
        this.mouseEnterHandlers = { main: null, dual: null };
        this.mouseLeaveHandlers = { main: null, dual: null };
    }

    _isEnabled() {
        try {
            const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
            if (typeof settings.trafficCamerasEnabled === 'boolean') {
                return settings.trafficCamerasEnabled;
            }
        } catch {}

        const checkbox = document.getElementById('toggle-cameras-layer');
        return checkbox ? checkbox.checked : false;
    }

    _getMap(target) {
        return target === 'main' ? this.map?.map : this.map?.dualMap;
    }

    _getSourceId(target) {
        return target === 'main' ? 'traffic-camera-source' : 'traffic-camera-source-dual';
    }

    _getLayerId(target) {
        return target === 'main' ? 'traffic-camera-layer' : 'traffic-camera-layer-dual';
    }

    _getAllowedStates() {
        const whitelist = Array.isArray(TRAFFIC_CAMERA_STATE_WHITELIST)
            ? TRAFFIC_CAMERA_STATE_WHITELIST.map((state) => String(state || '').trim()).filter(Boolean)
            : [];

        if (whitelist.length === 0) {
            return null;
        }

        return new Set(whitelist.map((state) => state.toLowerCase()));
    }

    _normalizeFeature(state, camera) {
        const lat = toFiniteNumber(camera?.lat);
        const lon = toFiniteNumber(camera?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

        const streamStatic = normalizeUrl(camera?.stream?.static);
        const streamVideo = normalizeUrl(camera?.stream?.video);
        if (!streamStatic && !streamVideo) return null;

        const name = String(camera?.name || 'Traffic Camera');
        const facing = String(camera?.facing || '').trim();
        const encoding = String(camera?.stream?.encoding || '').trim();
        const format = String(camera?.stream?.format || '').trim();

        return {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [lon, lat]
            },
            properties: {
                state: String(state || 'Unknown'),
                name,
                facing,
                streamStatic,
                streamVideo,
                encoding,
                format,
                hasVideo: streamVideo ? 1 : 0,
                markerColor: streamVideo ? '#a855f7' : '#3b82f6'
            }
        };
    }

    _buildData() {
        const allowedStates = this._getAllowedStates();
        const features = [];

        for (const [state, cameras] of Object.entries(trafficCamerasByState || {})) {
            if (allowedStates && !allowedStates.has(String(state || '').toLowerCase())) {
                continue;
            }

            if (!Array.isArray(cameras)) continue;

            for (const camera of cameras) {
                const feature = this._normalizeFeature(state, camera);
                if (feature) features.push(feature);
            }
        }

        return {
            type: 'FeatureCollection',
            features
        };
    }

    _buildWindowHtml(properties) {
        const name = escapeHtml(properties?.name || 'Traffic Camera');
        const state = escapeHtml(properties?.state || 'Unknown');
        const facing = escapeHtml(properties?.facing || 'Unknown');
        const staticUrl = normalizeUrl(properties?.streamStatic);
        const videoUrl = normalizeUrl(properties?.streamVideo);
        const encoding = escapeHtml(properties?.encoding || 'Unknown');
        const format = escapeHtml(properties?.format || 'Unknown');

        const mediaParts = [];
        if (videoUrl) {
            if (isLikelyHls(videoUrl)) {
                mediaParts.push(`
                    <video controls autoplay muted playsinline style="width: 100%; max-height: 260px; background: #000; border-radius: 8px;" src="${escapeHtml(videoUrl)}"></video>
                    <p style="margin: 8px 0 0 0; font-size: 0.85em; color: lightgray;">HLS stream. If playback fails in-browser, open directly.</p>
                `);
            } else {
                mediaParts.push(`
                    <video controls autoplay muted playsinline style="width: 100%; max-height: 260px; background: #000; border-radius: 8px;" src="${escapeHtml(videoUrl)}"></video>
                `);
            }
        }

        if (staticUrl) {
            if (isLikelyImage(staticUrl)) {
                mediaParts.push(`
                    <img
                        data-camera-static-image="1"
                        data-static-url="${escapeHtml(staticUrl)}"
                        src="${escapeHtml(appendCacheBuster(staticUrl))}"
                        alt="${name}"
                        style="width: 100%; max-height: 260px; object-fit: contain; background: #000; border-radius: 8px;"
                    />
                    <p data-camera-refresh-label="1" style="margin: 4px 0 0 0; font-size: 0.85em; color: lightgray;">Refrshing in ${STATIC_IMAGE_REFRESH_INTERVAL_SEC} seconds.</p>
                `);
            } else {
                mediaParts.push(`<a href="${escapeHtml(staticUrl)}" target="_blank" rel="noopener noreferrer">Open static feed</a>`);
            }
        }

        const links = [];

        return `
            <div style="padding: 10px; display: flex; flex-direction: column; gap: 12px; max-width: calc(100% - 20px);">
                <div>
                    <h3 style="margin: 0 0 6px 0; color: white;">${name}${facing != 'Unknown' ? `, looking ${facing}` : ''}</h3>
                </div>
                <div style="display: flex; flex-direction: column; gap: 10px;">${mediaParts.join('')}</div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">${links.join('')}</div>
            </div>
        `;
    }

    _showCameraWindow(feature) {
        const properties = feature?.properties || {};
        const title = "Camera Stream";
        const html = this._buildWindowHtml(properties);

        const cameraWindow = new AppWindow({
            title,
            icon: 'camera',
            width: 560,
            height: 460,
            html
        });

        const staticImageEl = cameraWindow?.content?.querySelector('[data-camera-static-image="1"]');
        const refreshLabelEl = cameraWindow?.content?.querySelector('[data-camera-refresh-label="1"]');
        const staticUrl = staticImageEl?.getAttribute('data-static-url') || '';
        if (staticImageEl && refreshLabelEl && staticUrl) {
            let secondsRemaining = STATIC_IMAGE_REFRESH_INTERVAL_SEC;

            const updateLabel = () => {
                refreshLabelEl.textContent = `Refrshing in ${secondsRemaining} seconds.`;
            };

            const intervalId = setInterval(() => {
                secondsRemaining -= 1;
                if (secondsRemaining <= 0) {
                    staticImageEl.src = appendCacheBuster(staticUrl);
                    secondsRemaining = STATIC_IMAGE_REFRESH_INTERVAL_SEC;
                }
                updateLabel();
            }, 1000);

            updateLabel();

            const originalDestroy = cameraWindow.destroy.bind(cameraWindow);
            cameraWindow.destroy = async (...args) => {
                clearInterval(intervalId);
                return originalDestroy(...args);
            };
        }
    }

    _ensureLayerHandlers(target) {
        const map = this._getMap(target);
        if (!map) return;

        const layerId = this._getLayerId(target);

        if (!this.clickHandlers[target]) {
            this.clickHandlers[target] = (event) => {
                if (event.stopPropagation) event.stopPropagation();
                event.originalEvent?.stopPropagation?.();
                event.originalEvent?.preventDefault?.();

                const feature = event.features?.[0];
                if (!feature) return;
                this._showCameraWindow(feature);
            };
        }

        if (!this.mouseEnterHandlers[target]) {
            this.mouseEnterHandlers[target] = () => {
                map.getCanvas().style.cursor = 'pointer';
                if (this.map?.layers) {
                    this.map.layers.trafficCameraHovered = true;
                }
            };
        }

        if (!this.mouseLeaveHandlers[target]) {
            this.mouseLeaveHandlers[target] = () => {
                map.getCanvas().style.cursor = '';
                if (this.map?.layers) {
                    this.map.layers.trafficCameraHovered = false;
                }
            };
        }

        map.off('click', layerId, this.clickHandlers[target]);
        map.off('mouseenter', layerId, this.mouseEnterHandlers[target]);
        map.off('mouseleave', layerId, this.mouseLeaveHandlers[target]);

        map.on('click', layerId, this.clickHandlers[target]);
        map.on('mouseenter', layerId, this.mouseEnterHandlers[target]);
        map.on('mouseleave', layerId, this.mouseLeaveHandlers[target]);
    }

    _scheduleSync(target) {
        const map = this._getMap(target);
        if (!map) return;

        if (hasUsableMapStyle(map)) {
            this.syncPending[target] = false;
            this.syncPendingSince[target] = 0;
            waitForRadarLayer(map, target).then(() => this._syncToMap(target));
            return;
        }

        if (this.syncPending[target]) {
            const pendingAge = Date.now() - (this.syncPendingSince[target] || 0);
            if (pendingAge < SYNC_PENDING_STALE_MS) {
                return;
            }
            this.syncPending[target] = false;
        }

        this.syncPending[target] = true;
        this.syncPendingSince[target] = Date.now();

        waitForMapStyleReady(map).then(() => {
            this.syncPending[target] = false;
            this.syncPendingSince[target] = 0;
            waitForRadarLayer(map, target).then(() => this._syncToMap(target));
        });
    }

    _syncToMap(target) {
        const map = this._getMap(target);
        if (!map) return;

        const sourceId = this._getSourceId(target);
        const layerId = this._getLayerId(target);

        const featureCount = this.data?.features?.length || 0;
        if (!this._isEnabled() || featureCount === 0) {
            this.clearTrafficCameras(target);
            return;
        }

        if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
                type: 'geojson',
                data: this.data
            });
        } else {
            map.getSource(sourceId).setData(this.data);
        }

        const beforeLayerId = getWeatherOutlineBeforeLayerId(map, target);
        if (!map.getLayer(layerId)) {
            map.addLayer({
                id: layerId,
                type: 'circle',
                source: sourceId,
                paint: {
                    'circle-radius': 4,
                    'circle-color': ['get', 'markerColor'],
                    'circle-stroke-color': '#ffffff',
                    'circle-stroke-width': 1.4,
                    'circle-opacity': 0.95
                }
            }, beforeLayerId);
        }

        this._ensureLayerHandlers(target);
        this.map?.layers?.applyLayerOrder(target);
    }

    async fetchTrafficCameras() {
        this.data = this._buildData();
        return this.data;
    }

    getTrafficCameras() {
        return this.data;
    }

    displayTrafficCamerasOnMap(target = 'main') {
        if (!this._isEnabled() || !this.data?.features?.length) {
            this.clearTrafficCameras(target);
            return;
        }

        this._scheduleSync(target);
    }

    displayTrafficCameras() {
        this.displayTrafficCamerasOnMap('main');
        if (this.map?.isSplit()) {
            this.displayTrafficCamerasOnMap('dual');
        }
    }

    clearTrafficCameras(target = 'main') {
        const map = this._getMap(target);
        if (!map) return;

        const sourceId = this._getSourceId(target);
        if (map.getSource(sourceId)) {
            map.getSource(sourceId).setData(EMPTY_FEATURE_COLLECTION);
        }

        map.getCanvas().style.cursor = '';
        if (this.map?.layers) {
            this.map.layers.trafficCameraHovered = false;
        }
    }
}

export default TrafficCamerasLayer;
