import Window from '../../ui/window.js';

export default class NEXRADStatus {
    constructor() {
        this.currentStation = this._getActiveStation();
        this.currentChunkNumber = null;
        this.currentVolumeId = null;
        this.maxChunks = null;
        this.latestChunkUrl = null;
        this.currentGapRange = null;

        const html = `
            <div style="padding: 12px; color: white; display: flex; flex-direction: column; gap: 12px; height: calc(100% - 24px);">
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.85em; color: rgba(255, 255, 255, 0.75);">
                        <span>Scan Progress</span>
                        <span id="nexrad-status-progress-label">--%</span>
                    </div>
                    <div style="height: 16px; border-radius: 999px; border: 1px solid var(--border-color); background: rgba(0, 0, 0, 0.35); overflow: hidden;">
                        <div id="nexrad-status-progress-fill" style="height: 100%; border-radius: 999px; width: 0%; background: linear-gradient(90deg, #2fb8ff, #2a7fff); transition: width 0.2s ease;"></div>
                    </div>
                </div>

                <div id="nexrad-status-details" style="font-size: 0.8em; color: rgba(255, 255, 255, 0.7); line-height: 1.4;"></div>
            </div>
        `;

        this.window = new Window({
            title: 'NEXRAD Status',
            html,
            icon: 'radar-2',
            width: 460,
            height: 260,
        });

        this.progressLabel = this.window.content.querySelector('#nexrad-status-progress-label');
        this.progressFill = this.window.content.querySelector('#nexrad-status-progress-fill');
        this.details = this.window.content.querySelector('#nexrad-status-details');

        this._onChunkUpdate = (event) => {
            this._handleChunkUpdate(event?.detail || {});
        };
        window.addEventListener('sparkradar:l2-chunk-update', this._onChunkUpdate);

        const originalDestroy = this.window.destroy.bind(this.window);
        this.window.destroy = async () => {
            this._stopPolling();
            window.removeEventListener('sparkradar:l2-chunk-update', this._onChunkUpdate);
            await originalDestroy();
        };

        this._startPolling();
        this._renderStatusLine();
        this._refreshStatusSnapshot();
    }

    _normalizeStation(value) {
        const station = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        return station.slice(0, 4) || 'KTLX';
    }

    _getActiveStation() {
        const stationEl = document.getElementById('toolbar-station');
        const stationText = stationEl?.textContent?.trim();
        if (stationText) {
            return this._normalizeStation(stationText);
        }

        const urlStation = new URLSearchParams(window.location.search).get('station');
        return this._normalizeStation(urlStation || 'KTLX');
    }

    _parseChunkUpdateFromUrl(chunkUrl) {
        if (!chunkUrl || typeof chunkUrl !== 'string') return null;
        const parts = chunkUrl.split('/');
        if (parts.length < 6) return null;

        const station = this._normalizeStation(parts[3]);
        const volumeId = parts[4] || null;
        const fileName = parts[5] || '';
        const match = fileName.match(/-(\d+)-([SIE])$/i);
        if (!match) return null;

        const chunkNumber = Number(match[1]);
        if (!Number.isFinite(chunkNumber)) return null;

        return {
            station,
            volumeId,
            chunkNumber,
            marker: match[2].toUpperCase(),
        };
    }

    _getChunkLoader() {
        const radar = window.radarInstance;
        if (!radar || !radar.level2ChunkLoader) {
            return null;
        }
        return radar.level2ChunkLoader;
    }

    _readChunkLoaderStatus(station) {
        const chunkLoader = this._getChunkLoader();
        if (!chunkLoader) {
            return null;
        }

        const activeStation = this._normalizeStation(chunkLoader.station || station);
        const liveChunkURLs = chunkLoader.getChunkURLs(false);
        const combinedChunkURLs = chunkLoader.getChunkURLs(true);
        const liveCount = Array.isArray(liveChunkURLs) ? liveChunkURLs.length : 0;
        const combinedCount = Array.isArray(combinedChunkURLs) ? combinedChunkURLs.length : 0;

        return {
            station: activeStation,
            latestVolumeId: chunkLoader.getCurrentVolumeId() || chunkLoader.latestVolumeId || null,
            currentChunkCount: liveCount,
            maxChunks: combinedCount > 0 ? combinedCount : null,
            latestChunkUrl: chunkLoader.getLatestChunkURL(),
            gapStart: chunkLoader.gapStart || null,
            gapEnd: chunkLoader.gapEnd || null,
            isStreaming: chunkLoader.isStreaming === true,
        };
    }

    _renderStatusLine() {
        const station = this.currentStation || '--';
        const volume = this.currentVolumeId || '--';
    }

    _renderProgress() {
        const current = Number.isFinite(this.currentChunkNumber) ? this.currentChunkNumber : 0;
        const max = Number.isFinite(this.maxChunks) && this.maxChunks > 0 ? this.maxChunks : 0;
        const percent = max > 0 ? Math.min(100, (current / max) * 100) : 0;

        this.progressLabel.textContent = `${percent.toFixed(0)}%`;
        this.progressFill.style.width = `${percent}%`;
        this.details.innerHTML = `
            <div><strong>Latest chunk URL:</strong> ${this._escapeHtml(this.latestChunkUrl || '--')}</div>
            <div><strong>At chunk:</strong> ${current || '--'}${max > 0 ? ` of ${max}` : ''}</div>
        `;
    }

    _renderError(error) {
        this.progressLabel.textContent = '--%';
        this.progressFill.style.width = '0%';
        this.details.textContent = error?.message || String(error);
    }

    _escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    _handleChunkUpdate(detail) {
        const station = this._getActiveStation();
        const parsed = this._parseChunkUpdateFromUrl(detail?.chunkUrl);
        if (!parsed) {
            return;
        }

        // Track only the currently selected radar station.
        if (parsed.station !== station) {
            return;
        }

        this.currentStation = station;
        this.currentVolumeId = parsed.volumeId;
        this.currentChunkNumber = parsed.chunkNumber;
        this.latestChunkUrl = detail.chunkUrl || null;
        this._refreshStatusSnapshot();
        this._renderStatusLine();
        this._renderProgress();
    }

    _refreshStatusSnapshot() {
        const station = this._getActiveStation();
        const stationChanged = this.currentStation !== station;
        this.currentStation = station;

        if (stationChanged) {
            this.currentChunkNumber = null;
            this.currentVolumeId = null;
            this.latestChunkUrl = null;
            this.currentGapRange = null;
        }

        this._renderStatusLine();

        const snapshot = this._readChunkLoaderStatus(station);
        if (!snapshot) {
            this._renderError(new Error('Chunk loader is not available. Start a live Level-II product to view status.'));
            return;
        }

        this.maxChunks = snapshot.maxChunks;
        if (Number.isFinite(snapshot.currentChunkCount) && snapshot.currentChunkCount > 0) {
            this.currentChunkNumber = snapshot.currentChunkCount;
        }
        if (snapshot.latestVolumeId != null) {
            this.currentVolumeId = snapshot.latestVolumeId;
        }
        if (snapshot.latestChunkUrl) {
            this.latestChunkUrl = snapshot.latestChunkUrl;
        }

        if (snapshot.gapStart && snapshot.gapEnd) {
            this.currentGapRange = `${snapshot.gapStart} -> ${snapshot.gapEnd}`;
        } else if (snapshot.gapStart) {
            this.currentGapRange = `${snapshot.gapStart} -> ...`;
        } else {
            this.currentGapRange = null;
        }

        this._renderStatusLine();
        this._renderProgress();
    }

    _startPolling() {
        this._stopPolling();
        this.pollInterval = setInterval(() => {
            this._refreshStatusSnapshot();
        }, 5000);
    }

    _stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
}
