import { renderAlert } from '../alert_utils.js';

export default class AlertList {
    constructor(layersInstance = null) {
        // Store reference to Layers instance for showing dialogs
        this.layersInstance = layersInstance;

        const formatDate = (dateStr) => {
            if (!dateStr) return 'N/A';
            const date = new Date(dateStr);
            return date.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        };

        this.formatDate = formatDate;

        this.opener = document.createElement('div');
        this.opener.classList.add('alert-list-opener');
        this.opener.innerHTML = `
            <i class="ti ti-alert-triangle"></i>
            <span id="alert-count">--</span>
        `;
        this.countEl = this.opener.querySelector('#alert-count');

        this.list = document.createElement('div');
        this.list.classList.add('alert-list');
        this.list.style.display = 'none';

        // Add a searchbar and settings shortcut at the top of the list
        const header = document.createElement('div');
        header.classList.add('alert-list-header');
        header.innerHTML = `
            <input type="text" class="alert-search" placeholder="Search alerts...">
        `;
        this.list.appendChild(header);

        const searchInput = header.querySelector('.alert-search');
        this.searchInput = searchInput;
        searchInput.addEventListener('input', () => {
            this._applySearchFilter();
        });

        const mainList = document.createElement('div');
        mainList.classList.add('alert-main-list');
        this.list.appendChild(mainList);

        document.body.appendChild(this.opener);
        document.body.appendChild(this.list);

        document.addEventListener('alertsUpdated', (event) => {
            const count = event?.detail?.count ?? 0;
            const alerts = event?.detail?.alerts ?? [];
            this._setCount(count);
            this._setAlerts(alerts);
        });

        this.opener.addEventListener('click', () => {
            this.toggle();
        });

        this.escListener = document.addEventListener('keydown', (event) => {
            if (event.key === "Escape") {
                this.close();
            }
        });
    }

    _setCount(count) {
        if (!this.countEl) return;
        this.countEl.textContent = String(count);
    }

    _applySearchFilter() {
        if (!this.list) return;
        const query = (this.searchInput?.value || '').toLowerCase();
        const alertItems = this.list.querySelectorAll('.alert-item');
        alertItems.forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(query) ? '' : 'none';
        });
    }

    _setAlerts(alerts) {
        const mainList = this.list.querySelector('.alert-main-list');
        if (!mainList) return;
        mainList.innerHTML = '';
        if (!alerts || alerts.length === 0) {
            mainList.innerHTML = '<div class="alert-item">No active alerts.</div>';
            return;
        }

        const severityColorMap = {
            0: '#ffffff',
            1: '#ff7f00',
            2: '#ff2121',
            3: '#ff00ff',
            4: '#ad00ad'
        };
        let highestSeverity = 0;

        // Higher number = higher priority (from renderAlert)
        const getPriority = (rendered) => Number(rendered?.priority) || 0;

        const now = Date.now();
        const ONE_MINUTE_MS = 60 * 1000;

        // Pre-process: render, filter unknowns, compute recency & priority
        const processed = [];
        for (const alert of alerts) {
            const rendered = renderAlert(alert);
            if (rendered.name === 'Unknown Alert') continue;

            const has_valid_geometry = !!(alert?.geometry && (
                (Array.isArray(alert.geometry) && alert.geometry.length > 0) ||
                (alert.geometry.type && Array.isArray(alert.geometry.coordinates) && alert.geometry.coordinates.length > 0)
            ));

            const issuedTime = Date.parse(alert?.issued || alert?.issuedAt) || 0;
            const isRecent = (now - issuedTime) < ONE_MINUTE_MS;
            const priority = getPriority(rendered);

            if (rendered.props.is_emergency && rendered.name.toLowerCase().includes('tornado')) {
                highestSeverity = Math.max(highestSeverity, 4);
            } else if (rendered.props.is_pds && rendered.name.toLowerCase().includes('tornado')) {
                highestSeverity = Math.max(highestSeverity, 3);
            } else if (rendered.name.toLowerCase().includes('tornado')) {
                highestSeverity = Math.max(highestSeverity, 2);
            } else if (rendered.name.toLowerCase().includes('severe thunderstorm')) {
                highestSeverity = Math.max(highestSeverity, 1);
            }

            processed.push({ alert, rendered, has_valid_geometry, issuedTime, isRecent, priority });
        }

        const compareProcessedAlerts = (a, b) =>
            a.priority !== b.priority ? b.priority - a.priority : b.issuedTime - a.issuedTime;

        // Sort by priority, then newest-issued first within each priority tier
        processed.sort(compareProcessedAlerts);

        const buildItem = ({ alert, rendered, has_valid_geometry }) => {
            const item = document.createElement('div');
            item.classList.add('alert-item', 'alert-list-item');
            item.innerHTML = `
                <div style="margin-bottom: 20px; padding: 15px; background: ${rendered.color}30; border-left: 4px solid ${rendered.color}; border-radius: 10px;">
                    <h3 style="margin: 0 0 10px 0; text-align: left; color: ${rendered.color};">${rendered.name}</h3>
                    <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px; font-size: 0.9em;">
                        <strong>Expires:</strong> <span>${this.formatDate(alert.expiry || alert.expiresAt)}</span>
                        ${rendered.props.is_tor_possible ? `<strong>Tornado:</strong> <span style="color: #ff2121;">Possible</span>` : (rendered.props.is_tor_observed ? `<strong>Tornado:</strong> <span style="color: #ff2121;">Observed</span>` : (rendered.props.is_tor_radar_indicated ? `<strong>Tornado:</strong> <span style="color: #ffcc00;">Radar Indicated</span>` : ''))}
                        ${rendered.props.is_waterspout_possible ? `<strong>Waterspout:</strong> <span style="color: #ff2121;">Possible</span>` : ''}
                        ${rendered.props.max_hail_size ? `<strong>Max Hail:</strong> <span>${rendered.props.max_hail_size.toUpperCase()}</span>` : ''}
                        ${rendered.props.max_wind_gust ? `<strong>Max Wind:</strong> <span>${rendered.props.max_wind_gust.toUpperCase()}</span>` : ''}
                        ${rendered.props.is_test ? `<strong>Test:</strong> <span>THIS IS A TEST MESSAGE</span>` : ''}
                    </div>
                    <div class="alert-btns">
                        ${has_valid_geometry ? `<button class="alert-btn" data-action="view-map">View on Map</button>` : ''}
                        <button class="alert-btn" data-action="view-product">View Product</button>
                    </div>
                </div>
            `;

            item.querySelector('[data-action="view-product"]').addEventListener('click', () => {
                if (this.layersInstance?.alertLayer?._showAlertDialog) {
                    this.layersInstance.alertLayer._showAlertDialog(alert);
                } else {
                    console.warn('Layers instance not available for showing alert dialog');
                }
            });

            if (has_valid_geometry) {
                item.querySelector('[data-action="view-map"]').addEventListener('click', () => {
                    this._zoomToAlert(alert);
                    this.close();
                });
            }

            return item;
        };

        const makeSectionHeader = (label) => {
            const el = document.createElement('div');
            el.classList.add('alert-section-header');
            el.textContent = label;
            return el;
        };

        // Recents section
        const recents = processed.filter(e => e.isRecent).sort(compareProcessedAlerts);
        if (recents.length > 0) {
            mainList.appendChild(makeSectionHeader('New and Recently Updated'));
            recents.forEach(entry => mainList.appendChild(buildItem(entry)));
            mainList.appendChild(makeSectionHeader('All Alerts'));
        }

        // Full priority-sorted list
        processed.forEach(entry => mainList.appendChild(buildItem(entry)));

        // Preserve active search filtering after list refresh
        this._applySearchFilter();

        if (highestSeverity === 3) {
            this.opener.classList.add('pds');
            this.opener.classList.remove('emergency');
            this.opener.style.color = '';
        } else if (highestSeverity === 4) {
            this.opener.classList.add('emergency');
            this.opener.classList.remove('pds');
            this.opener.style.color = '';
        } else {
            this.opener.classList.remove('pds');
            this.opener.classList.remove('emergency');
            this.opener.style.color = severityColorMap[highestSeverity] || '#ffffff';
        }
    }

    open() {
        this.list.style.display = 'block';
        this.list.classList.remove('alert-list-closing');
    }

    close() {
        this.list.classList.add('alert-list-closing');
        setTimeout(() => {
            this.list.style.display = 'none';
        }, 300);

        // Remove escape key listener when closing
        if (this.escListener) {
            document.removeEventListener('keydown', this.escListener);
            this.escListener = null;
        }
    }

    toggle() {
        if (this.list.style.display === 'none') {
            this.open();
        } else {
            this.close();
        }
    }

    _zoomToAlert(alert) {
        if (!alert?.geometry) {
            console.warn('Alert has no geometry data');
            return;
        }

        // Calculate bounds from alert geometry
        let minLng = Infinity;
        let minLat = Infinity;
        let maxLng = -Infinity;
        let maxLat = -Infinity;

        const geometry = alert.geometry;
        if (!geometry) {
            console.warn('Alert has no geometry data');
            return;
        }

        const coordinates = geometry.type && Array.isArray(geometry.coordinates)
            ? geometry.coordinates
            : geometry;

        // Detect whether this is a ring (2D array) or the old 3D array format
        // A coordinate pair is [number, number], a ring is [[number, number], ...]
        // If first element is a number, this is a coordinate pair - invalid
        // If first element is an array with 2 numbers, this is a ring
        // If first element is an array of arrays, this is multiple rings/polygons
        
        let rings = [];
        if (Array.isArray(coordinates) && coordinates.length > 0) {
            if (geometry.type === 'MultiPolygon') {
                rings = coordinates.flat();
            } else if (Array.isArray(coordinates[0]) && coordinates[0].length === 2 && typeof coordinates[0][0] === 'number') {
                rings = [coordinates];
            } else if (Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0])) {
                rings = coordinates;
            }
        }

        // Iterate over all rings and extract bounds
        for (const ring of rings) {
            for (const coord of ring) {
                const lng = Number(coord[0]);
                const lat = Number(coord[1]);
                if (Number.isNaN(lng) || Number.isNaN(lat)) continue;
                minLng = Math.min(minLng, lng);
                minLat = Math.min(minLat, lat);
                maxLng = Math.max(maxLng, lng);
                maxLat = Math.max(maxLat, lat);
            }
        }

        // Check if we found valid bounds
        if (!Number.isFinite(minLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLng) || !Number.isFinite(maxLat)) {
            console.warn('Could not calculate alert bounds');
            return;
        }

        // Get the map instance from the layers object
        const map = this.layersInstance?.map?.map;
        if (!map) {
            console.warn('Map instance not available');
            return;
        }

        // Select nearest radar station to the alert center
        const centerLng = (minLng + maxLng) / 2;
        const centerLat = (minLat + maxLat) / 2;
        this._selectNearestStation(centerLng, centerLat);

        // Zoom to bounds with padding
        try {
            map.fitBounds(
                [[minLng, minLat], [maxLng, maxLat]],
                { padding: 50, maxZoom: 10, duration: 1000 }
            );
        } catch (error) {
            console.error('Error zooming to alert:', error);
        }
    }

    _selectNearestStation(centerLng, centerLat) {
        const stations = window.radarStationFeatures || [];
        let nearestId = null;
        let nearestDist = Infinity;

        for (const station of stations) {
            const id = station?.properties?.id;
            const coords = station?.geometry?.coordinates;
            if (!id || !Array.isArray(coords) || coords.length < 2) continue;
            if (!/^[KPR]?[A-Z]{3}$/.test(id)) continue;

            const toRad = (v) => v * (Math.PI / 180);
            const dLat = toRad(Number(coords[1]) - centerLat);
            const dLon = toRad(Number(coords[0]) - centerLng);
            const a = Math.sin(dLat / 2) ** 2
                + Math.sin(dLon / 2) ** 2 * Math.cos(toRad(centerLat)) * Math.cos(toRad(Number(coords[1])));
            const dist = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

            if (dist < nearestDist) {
                nearestDist = dist;
                nearestId = id;
            }
        }

        if (nearestId) {
            const callbacks = this.layersInstance?.map?.callbacks;
            if (typeof callbacks?.onSelectStation === 'function') {
                callbacks.onSelectStation(nearestId);
            }
        }
    }
}