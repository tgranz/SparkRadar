import Layers from "../layers.js";

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
    }

    _setCount(count) {
        if (!this.countEl) return;
        this.countEl.textContent = String(count);
    }

    _setAlerts(alerts) {
        this.list.innerHTML = '';
        if (!alerts || alerts.length === 0) {
            this.list.innerHTML = '<div class="alert-item">No active alerts.</div>';
            return;
        }

        // Reset opener text color
        this.opener.style.color = '#ffffff';

        // Sort alerts by expiry date (soonest first)
        const sortedAlerts = [...alerts].sort((a, b) => {
            const aExpiry = Date.parse(a?.expiry || a?.expiresAt) || 0;
            const bExpiry = Date.parse(b?.expiry || b?.expiresAt) || 0;
            return aExpiry - bExpiry;
        });

        sortedAlerts.forEach(alert => {
            var desiredColor = '#ffffff';

            const title = alert?.name || alert?.productName || alert?.event || 'Alert';
            const alertMessage = (alert?.message || '').toLowerCase();
            const is_pds = alert?.properties?.isPds ?? alertMessage.includes('particularly dangerous situation');
            const is_confirmed = alertMessage.includes('tornado...observed');
            const is_destructive = alert?.properties?.isDestructive ?? (alertMessage.includes('destructive') || alertMessage.includes('catastrophic'));
            const is_considerable = alert?.properties?.isConsiderable ?? alertMessage.includes('considerable');
            const is_tor_possible = alertMessage.includes('tornado...possible');
            const is_waterspout_possible = alertMessage.includes('waterspout...possible');
            const colors = this.layersInstance?.alertLayer?._getAlertColor(alert) || { fill: '#facc15', outline: '#facc15' };

            const hailMatch = alertMessage.match(/max hail size...(.*?)\n/i);
            const maxHailSize = hailMatch ? hailMatch[1].trim() : null;
            const windMatch = alertMessage.match(/max wind gust\.\.\.(.*?)(\r?\n|$)/i);
            const maxWindGust = windMatch ? windMatch[1].trim() : null;

            const has_valid_geometry = !!(alert?.geometry && (
                (Array.isArray(alert.geometry) && alert.geometry.length > 0) ||
                (alert.geometry.type && Array.isArray(alert.geometry.coordinates) && alert.geometry.coordinates.length > 0)
            ));

            // Ignore unknown alerts
            if (title === 'Unknown Alert') return;

            if (is_pds) {
                desiredColor = '#ff00ff';
            } else if (title.toLowerCase().includes('tornado')) {
                desiredColor = '#ff2121';
            } else if (title.toLowerCase().includes('severe thunderstorm')) {
                desiredColor = '#ff7f00';
            }

            const item = document.createElement('div');
            item.classList.add('alert-item', 'alert-list-item');
    
            item.innerHTML = `
                <div style="margin-bottom: 20px; padding: 15px; background: ${colors.fill}30; border-left: 4px solid ${colors.fill}; border-radius: 10px;">
                    <h3 style="margin: 0 0 10px 0; text-align: left; color: ${colors.fill};">${is_pds ? 'PDS ' : ''}${is_confirmed ? 'Confirmed ' : ''}${is_destructive ? 'Destructive ' : ''}${is_considerable ? 'Considerable ' : ''}${title}</h3>
                    <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px; font-size: 0.9em;">
                        <strong>Expires:</strong> <span>${this.formatDate(alert.expiry || alert.expiresAt)}</span>
                        ${is_tor_possible ? `<strong>Tornado:</strong> <span style="color: #ff2121;">Possible</span>` : ''}
                        ${is_waterspout_possible ? `<strong>Waterspout:</strong> <span style="color: #ff2121;">Possible</span>` : ''}
                        ${maxHailSize ? `<strong>Max Hail:</strong> <span>${maxHailSize.toUpperCase()}</span>` : ''}
                        ${maxWindGust ? `<strong>Max Wind:</strong> <span>${maxWindGust.toUpperCase()}</span>` : ''}
                    </div>
                    <div class="alert-btns">
                        ${has_valid_geometry ? `<button class="alert-btn" data-action="view-map">View on Map</button>` : ''}
                        <button class="alert-btn" data-action="view-product">View Product</button>
                    </div>
                </div>
            `;
            this.list.appendChild(item);

            // Add button event listeners
            const viewProductBtn = item.querySelector('[data-action="view-product"]');
            viewProductBtn.addEventListener('click', () => {
                if (this.layersInstance?.alertLayer?._showAlertDialog) {
                    this.layersInstance.alertLayer._showAlertDialog(alert);
                } else {
                    console.warn('Layers instance not available for showing alert dialog');
                }
            });

            if (has_valid_geometry) {
                const viewMapBtn = item.querySelector('[data-action="view-map"]');
                viewMapBtn.addEventListener('click', () => {
                    this._zoomToAlert(alert);
                    this.close();
                });
            }

            // Ensure most severe alert colors take precedence
            if (desiredColor == '#ff2121') {
                if (this.opener.style.color != '#ff00ff') {
                    this.opener.style.color = '#ff2121';
                }
            } else if (desiredColor == '#ff7f00') {
                if (this.opener.style.color != '#ff2121' && this.opener.style.color != '#ff00ff') {
                    this.opener.style.color = '#ff7f00';
                }
            } else if (desiredColor == '#ff00ff') {
                this.opener.style.color = '#ff00ff';
            }
        });
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
}