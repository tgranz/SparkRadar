const menu = document.createElement('div');
menu.id = 'layer-menu';
menu.classList.add('layer-menu-hidden');

menu.innerHTML = `
    <div class="layer-menu-header">
        <h2>Layers</h2>
        <button class="menu-close-btn" id="close-layer-menu"><i class="ti ti-x"></i></button>
    </div>
    <div class="layer-menu-tabs">
        <button class="layer-menu-tab selected" data-tab="all">Toggles</button>
        <button class="layer-menu-tab" data-tab="order">Order</button>
    </div>
    <div id="layer-menu-all" class="layer-menu-content">
        <div class="layer-menu-section-header">
            Severe Weather
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Alerts</h3>
                <p class="onlineindicator delayed" id="alerts-connection-status">CHECKING...</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-alerts-layer" class="switch" checked>
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Watches</h3>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-watches-layer" class="switch" checked>
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Mesoscale Discussions</h3>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-mesoscale-discussions-layer" class="switch">
            </div>
        </div>

        <div class="layer-menu-section-header">
            Storms
        </div>
        
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>TVS Signatures</h3>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-tvs-signatures-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Hail Signatures</h3>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-hail-signatures-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item with-hint">
                <div>
                    <h3>Lightning</h3>
                    <p class="tag new">NEW</p>
                </div>
                <p class="hint">Provided by the <a href="https://saratoga-weather.org" target="_blank">Saratoga Weather</a> lightning placefile, powered by <a href="https://www.blitzortung.org" target="_blank">Blitzortung</a>.</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-lightning-layer" class="switch">
            </div>
        </div>

        <div class="layer-menu-section-header">
            Outlooks
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Day 1 Outlook</h3>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-day-1-outlook-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Day 2 Outlook</h3>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-day-2-outlook-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Day 3 Outlook</h3>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-day-3-outlook-layer" class="switch">
            </div>
        </div>

        <div class="layer-menu-section-header">
            Reports
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>mPING Reports</h3>
                <p class="tag inprogress">WIP</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-mping-reports-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>NWS Tornado Reports</h3>
                <p class="tag inprogress">WIP</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-nws-tornado-reports-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>NWS Wind Reports</h3>
                <p class="tag inprogress">WIP</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-nws-wind-reports-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>NWS Hail Reports</h3>
                <p class="tag inprogress">WIP</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-nws-hail-reports-layer" class="switch">
            </div>
        </div>

        <div class="layer-menu-section-header">
            Spotter Network
        </div>
        <p style="margin: 0px 10px 10px 10px; color: lightgray; font-size: 0.8em;">&copy; Spotter Network Inc. (NFP). SparkRadar is not affiliated in any way with Spotter Network, Inc.</p>
        <div class="layer-menu-section">
            <div class="layer-menu-item with-hint">
                <div>
                    <h3>Spotter Positions</h3>
                    <p class="tag new">NEW</p>
                </div>
                <p class="hint">Updates every 60 seconds.</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-spotter-network-positions-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Spotter Reports</h3>
                <p class="tag inprogress">WIP</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-spotter-network-reports-layer" class="switch">
            </div>
        </div>

        <div class="layer-menu-section-header">
            Miscellaneous
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Surface Fronts</h3>
                <p class="tag new">NEW</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-surface-analysis-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Hurricanes</h3>
                <p class="tag inprogress">WIP</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-hurricanes-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Weather Radios</h3>
                <p class="tag inprogress">WIP</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-weather-radios-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>METAR Stations</h3>
                <p class="tag inprogress">WIP</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-metars-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Wildfires</h3>
                <p class="tag inprogress">WIP</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-wildfires-layer" class="switch">
            </div>
        </div>
    </div>
    <div id="layer-menu-order" class="layer-menu-content layer-order-panel" style="display:none">
        <p class="layer-order-hint">Drag to reorder. Top of the list appears on top of the map.</p>
    </div>
`;

document.body.appendChild(menu);

// Tab switching
const tabs = menu.querySelectorAll('.layer-menu-tab');
const tabPanels = { all: document.getElementById('layer-menu-all'), order: document.getElementById('layer-menu-order') };
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('selected'));
        tab.classList.add('selected');
        const target = tab.dataset.tab;
        Object.entries(tabPanels).forEach(([key, panel]) => {
            panel.style.display = key === target ? '' : 'none';
        });
    });
});

// Map closing actions
document.getElementById('close-layer-menu').addEventListener('click', () => {
    menu.classList.add('layer-menu-hidden');

    // Update the button
    const openLayerPickerButton = document.getElementById('open-layer-picker-button');
    if (openLayerPickerButton) {
        openLayerPickerButton.classList.remove('selected');
    }
});

document.onkeydown = (e) => {
    if (e.key === 'Escape') {
        menu.classList.add('layer-menu-hidden');

        // Update the button
        const openLayerPickerButton = document.getElementById('open-layer-picker-button');
        if (openLayerPickerButton) {
            openLayerPickerButton.classList.remove('selected');
        }
    }
};

// Initialize layer toggle handlers (called from entry.js after map is ready)
function initializeLayerToggles(mapInstance) {
    // Load saved layer settings from localStorage
    const loadLayerSettings = () => {
        try {
            const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
            return {
                alertsEnabled: settings.alertsEnabled !== undefined ? settings.alertsEnabled : true,
                watchesEnabled: settings.watchesEnabled !== undefined ? settings.watchesEnabled : true,
                mesoscaleDiscussionsEnabled: settings.mesoscaleDiscussionsEnabled !== undefined ? settings.mesoscaleDiscussionsEnabled : false,
                tvsSignaturesEnabled: settings.tvsSignaturesEnabled !== undefined ? settings.tvsSignaturesEnabled : false,
                hailSignaturesEnabled: settings.hailSignaturesEnabled !== undefined ? settings.hailSignaturesEnabled : false,
                surfaceAnalysisEnabled: settings.surfaceAnalysisEnabled !== undefined ? settings.surfaceAnalysisEnabled : false,
                lightningEnabled: settings.lightningEnabled !== undefined ? settings.lightningEnabled : false,
                spotterNetworkPositionsEnabled: settings.spotterNetworkPositionsEnabled !== undefined ? settings.spotterNetworkPositionsEnabled : false,
                outlookDay: settings.outlookDay || null // 1, 2, 3, or null
            };
        } catch (e) {
            return { alertsEnabled: true, watchesEnabled: true, mesoscaleDiscussionsEnabled: false, tvsSignaturesEnabled: false, hailSignaturesEnabled: false, surfaceAnalysisEnabled: false, lightningEnabled: false, spotterNetworkPositionsEnabled: false, outlookDay: null };
        }
    };

    const settings = loadLayerSettings();

    // Get UI elements
    const alertsCheckbox = document.getElementById('toggle-alerts-layer');
    const watchesCheckbox = document.getElementById('toggle-watches-layer');
    const mesoscaleDiscussionsCheckbox = document.getElementById('toggle-mesoscale-discussions-layer');
    const tvsSignaturesCheckbox = document.getElementById('toggle-tvs-signatures-layer');
    const hailSignaturesCheckbox = document.getElementById('toggle-hail-signatures-layer');
    const day1OutlookCheckbox = document.getElementById('toggle-day-1-outlook-layer');
    const day2OutlookCheckbox = document.getElementById('toggle-day-2-outlook-layer');
    const day3OutlookCheckbox = document.getElementById('toggle-day-3-outlook-layer');
    const surfaceAnalysisCheckbox = document.getElementById('toggle-surface-analysis-layer');
    const lightningCheckbox = document.getElementById('toggle-lightning-layer');
    const spotterNetworkPositionsCheckbox = document.getElementById('toggle-spotter-network-positions-layer');
    const connectionStatusElement = document.getElementById('alerts-connection-status');
    
    // Set initial checkbox states
    if (alertsCheckbox) {
        alertsCheckbox.checked = settings.alertsEnabled;
    }
    if (watchesCheckbox) {
        watchesCheckbox.checked = settings.watchesEnabled;
    }
    if (mesoscaleDiscussionsCheckbox) {
        mesoscaleDiscussionsCheckbox.checked = settings.mesoscaleDiscussionsEnabled;
    }
    if (tvsSignaturesCheckbox) {
        tvsSignaturesCheckbox.checked = settings.tvsSignaturesEnabled;
    }
    if (hailSignaturesCheckbox) {
        hailSignaturesCheckbox.checked = settings.hailSignaturesEnabled;
    }
    if (day1OutlookCheckbox) {
        day1OutlookCheckbox.checked = settings.outlookDay === 1;
    }
    if (day2OutlookCheckbox) {
        day2OutlookCheckbox.checked = settings.outlookDay === 2;
    }
    if (day3OutlookCheckbox) {
        day3OutlookCheckbox.checked = settings.outlookDay === 3;
    }
    if (surfaceAnalysisCheckbox) {
        surfaceAnalysisCheckbox.checked = settings.surfaceAnalysisEnabled;
    }
    if (lightningCheckbox) {
        lightningCheckbox.checked = settings.lightningEnabled;
    }
    if (spotterNetworkPositionsCheckbox) {
        spotterNetworkPositionsCheckbox.checked = settings.spotterNetworkPositionsEnabled;
    }

    // Initialize storm center enabled types based on saved settings
    if (mapInstance.layers && mapInstance.layers.stormCentersLayer) {
        mapInstance.layers.stormCentersLayer.setEnabledTypes({
            tvs: settings.tvsSignaturesEnabled,
            hail: settings.hailSignaturesEnabled
        });
    }

    // Listen for connection status changes
    if (connectionStatusElement) {
        document.addEventListener('alertConnectionStatusChanged', (e) => {
            const status = e.detail.status;
            if (status === "ISSUES") status = "RECONNECTING...";
            connectionStatusElement.textContent = status;
            
            // Update color classes
            connectionStatusElement.classList.remove('online', 'delayed', 'offline');
            
            if (status === 'CONNECTED') {
                connectionStatusElement.classList.add('online');
            } else if (status === 'RECONNECTING...') {
                connectionStatusElement.classList.add('delayed');
            } else {
                connectionStatusElement.classList.add('offline');
            }
        });
    }

    // Setup event listeners
    if (alertsCheckbox) {
        alertsCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            try {
                const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
                settings.alertsEnabled = isChecked;
                localStorage.setItem('layerSettings', JSON.stringify(settings));
            } catch (error) {
                console.error('Error saving layer settings:', error);
            }

            if (isChecked) {
                // Fetch and display alerts
                mapInstance.layers.fetchAlerts();
            } else {
                // Clear alerts from map
                mapInstance.layers.clearAlerts('main');
                if (mapInstance.isSplit()) {
                    mapInstance.layers.clearAlerts('dual');
                }
            }
        });
    }

    if (watchesCheckbox) {
        watchesCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            try {
                const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
                settings.watchesEnabled = isChecked;
                localStorage.setItem('layerSettings', JSON.stringify(settings));
            } catch (error) {
                console.error('Error saving layer settings:', error);
            }

            if (isChecked) {
                // Fetch and display watches
                mapInstance.layers.fetchWatches();
            } else {
                // Clear watches from map
                mapInstance.layers.clearWatches('main');
                if (mapInstance.isSplit()) {
                    mapInstance.layers.clearWatches('dual');
                }
            }
        });
    }

    if (mesoscaleDiscussionsCheckbox) {
        mesoscaleDiscussionsCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            try {
                const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
                settings.mesoscaleDiscussionsEnabled = isChecked;
                localStorage.setItem('layerSettings', JSON.stringify(settings));
            } catch (error) {
                console.error('Error saving layer settings:', error);
            }

            if (isChecked) {
                // Fetch and display mesoscale discussions
                mapInstance.layers.fetchMesoscaleDiscussions();
            } else {
                // Clear mesoscale discussions from map
                mapInstance.layers.clearMesoscaleDiscussions('main');
                if (mapInstance.isSplit()) {
                    mapInstance.layers.clearMesoscaleDiscussions('dual');
                }
            }
        });
    }

    if (tvsSignaturesCheckbox) {
        tvsSignaturesCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            try {
                const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
                settings.tvsSignaturesEnabled = isChecked;
                localStorage.setItem('layerSettings', JSON.stringify(settings));
            } catch (error) {
                console.error('Error saving layer settings:', error);
            }

            // Update the layer's type filter
            if (mapInstance.layers && mapInstance.layers.stormCentersLayer) {
                mapInstance.layers.stormCentersLayer.setEnabledTypes({
                    tvs: isChecked,
                    hail: hailSignaturesCheckbox ? hailSignaturesCheckbox.checked : false
                });
            }

            if (isChecked || (hailSignaturesCheckbox && hailSignaturesCheckbox.checked)) {
                // Fetch and display storm centers
                mapInstance.layers.fetchStormCenters();
            } else {
                // Clear storm centers from map
                mapInstance.layers.clearStormCenters('main');
                if (mapInstance.isSplit()) {
                    mapInstance.layers.clearStormCenters('dual');
                }
            }
        });
    }

    if (hailSignaturesCheckbox) {
        hailSignaturesCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            try {
                const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
                settings.hailSignaturesEnabled = isChecked;
                localStorage.setItem('layerSettings', JSON.stringify(settings));
            } catch (error) {
                console.error('Error saving layer settings:', error);
            }

            // Update the layer's type filter
            if (mapInstance.layers && mapInstance.layers.stormCentersLayer) {
                mapInstance.layers.stormCentersLayer.setEnabledTypes({
                    tvs: tvsSignaturesCheckbox ? tvsSignaturesCheckbox.checked : false,
                    hail: isChecked
                });
            }

            if (isChecked || (tvsSignaturesCheckbox && tvsSignaturesCheckbox.checked)) {
                // Fetch and display storm centers
                mapInstance.layers.fetchStormCenters();
            } else {
                // Clear storm centers from map
                mapInstance.layers.clearStormCenters('main');
                if (mapInstance.isSplit()) {
                    mapInstance.layers.clearStormCenters('dual');
                }
            }
        });
    }

    // Outlook toggle handlers - only one can be active at a time
    const handleOutlookToggle = (day, checkbox) => {
        if (!checkbox) return;

        checkbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;

            if (isChecked) {
                // Uncheck other outlook checkboxes
                if (day !== 1 && day1OutlookCheckbox) day1OutlookCheckbox.checked = false;
                if (day !== 2 && day2OutlookCheckbox) day2OutlookCheckbox.checked = false;
                if (day !== 3 && day3OutlookCheckbox) day3OutlookCheckbox.checked = false;

                // Save to localStorage
                try {
                    const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
                    settings.outlookDay = day;
                    localStorage.setItem('layerSettings', JSON.stringify(settings));
                } catch (error) {
                    console.error('Error saving layer settings:', error);
                }

                // Re-display any cached outlook immediately, then refresh in background.
                mapInstance.layers.displayOutlook();
                mapInstance.layers.fetchOutlook(day);
            } else {
                // Save to localStorage
                try {
                    const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
                    settings.outlookDay = null;
                    localStorage.setItem('layerSettings', JSON.stringify(settings));
                } catch (error) {
                    console.error('Error saving layer settings:', error);
                }

                mapInstance.layers.displayOutlook();
            }
        });
    };

    handleOutlookToggle(1, day1OutlookCheckbox);
    handleOutlookToggle(2, day2OutlookCheckbox);
    handleOutlookToggle(3, day3OutlookCheckbox);

    if (surfaceAnalysisCheckbox) {
        surfaceAnalysisCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            try {
                const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
                settings.surfaceAnalysisEnabled = isChecked;
                localStorage.setItem('layerSettings', JSON.stringify(settings));
            } catch (error) {
                console.error('Error saving layer settings:', error);
            }

            if (isChecked) {
                mapInstance.layers.displaySurfaceAnalysis();
                mapInstance.layers.fetchSurfaceAnalysis();
            } else {
                mapInstance.layers.displaySurfaceAnalysis();
            }
        });
    }

    if (lightningCheckbox) {
        lightningCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            try {
                const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
                settings.lightningEnabled = isChecked;
                localStorage.setItem('layerSettings', JSON.stringify(settings));
            } catch (error) {
                console.error('Error saving layer settings:', error);
            }

            if (isChecked) {
                mapInstance.layers.displayLightning();
                mapInstance.layers.fetchLightning();
            } else {
                mapInstance.layers.displayLightning();
            }
        });
    }

    if (spotterNetworkPositionsCheckbox) {
        spotterNetworkPositionsCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            try {
                const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
                settings.spotterNetworkPositionsEnabled = isChecked;
                localStorage.setItem('layerSettings', JSON.stringify(settings));
            } catch (error) {
                console.error('Error saving layer settings:', error);
            }

            if (isChecked) {
                mapInstance.layers.displaySpotterNetworkPositions();
                mapInstance.layers.fetchSpotterNetworkPositions();
            } else {
                mapInstance.layers.displaySpotterNetworkPositions();
            }
        });
    }

    // Fetch alerts/watches if they're enabled, but wait for radar to load first
    // Check actual checkbox state at fetch time, not initial settings
    setTimeout(() => {
        if (alertsCheckbox && alertsCheckbox.checked) {
            mapInstance.layers.fetchAlerts();
        }
        if (watchesCheckbox && watchesCheckbox.checked) {
            mapInstance.layers.fetchWatches();
        }
        if (mesoscaleDiscussionsCheckbox && mesoscaleDiscussionsCheckbox.checked) {
            mapInstance.layers.fetchMesoscaleDiscussions();
        }
        if (tvsSignaturesCheckbox && tvsSignaturesCheckbox.checked) {
            mapInstance.layers.fetchStormCenters();
        }
        if (day1OutlookCheckbox && day1OutlookCheckbox.checked) {
            mapInstance.layers.fetchOutlook(1);
        } else if (day2OutlookCheckbox && day2OutlookCheckbox.checked) {
            mapInstance.layers.fetchOutlook(2);
        } else if (day3OutlookCheckbox && day3OutlookCheckbox.checked) {
            mapInstance.layers.fetchOutlook(3);
        }
        if (surfaceAnalysisCheckbox && surfaceAnalysisCheckbox.checked) {
            mapInstance.layers.fetchSurfaceAnalysis();
        }
        if (lightningCheckbox && lightningCheckbox.checked) {
            mapInstance.layers.fetchLightning();
        }
        if (spotterNetworkPositionsCheckbox && spotterNetworkPositionsCheckbox.checked) {
            mapInstance.layers.fetchSpotterNetworkPositions();
        }
    }, 5000);
}


import { DEFAULT_LAYER_ORDER, LAYER_ORDER_LABELS, LAYER_ORDER_ANCHORS } from '../js/layers/layer_utils.js';

function renderOrderPanel(panel, mapInstance) {
    const order = mapInstance.layers.getLayerOrder();
    panel.innerHTML = '<p class="layer-order-hint">Drag to reorder. Top of the list appears on top of the map.</p>';

    const iconMapping = {
        'alerts': { type: 'icon' , value: 'ti ti-alert-triangle' },
        'roads': { type: 'icon' , value: 'ti ti-road' },
        'mesoscaleDiscussions': { type: 'icon' , value: 'ti ti-message' },
        'radar': { type: 'icon' , value: 'ti ti-radar-2' },
        'labels': { type: 'icon' , value: 'ti ti-label' },
        'watches': { type: 'icon' , value: 'ti ti-eye' },
        'lightning': { type: 'image' , value: 'https://i.ibb.co/jkfmTDbt/lightningmarker.png' },
        'signatures': { type: 'icon' , value: 'ti ti-cloud-storm' },
        'spotterNetworkPositions': { type: 'image' , value: 'https://i.ibb.co/Md3GvZm/IMG-1278.webp' },
        'surfaceAnalysis': { type: 'icon' , value: 'ti ti-wind' },
        'outlook': { type: 'icon' , value: 'ti ti-calendar-event' },
    };

    order.forEach((key, index) => {
        const item = document.createElement('div');
        item.className = 'layer-order-item';
        item.draggable = true;
        item.dataset.key = key;
        item.dataset.index = String(index);

        item.innerHTML = `
            <span class="layer-order-handle"><i class="ti ti-grip-vertical"></i></span>
            ${iconMapping[key] ? (iconMapping[key].type === 'icon' ? `<span class="layer-order-icon" style="color: var(--primary-color)"><i class="${iconMapping[key].value}"></i></span>` : `<span style="height: 18px; width: 18px;"><img style="height: 100%; width: 100%;" src="${iconMapping[key].value}"></span>`) : ''}
            <span class="layer-order-label">${LAYER_ORDER_LABELS[key] || key}</span>
        `;

        console.log('Rendering layer order item:', key, 'with label:', LAYER_ORDER_LABELS[key]);

        panel.appendChild(item);
    });
}

function initializeOrderPanel(mapInstance) {
    const panel = document.getElementById('layer-menu-order');
    if (!panel) return;

    // Set up drag handlers only once — they use event delegation so they survive re-renders
    if (!panel._dragHandlersInit) {
        panel._dragHandlersInit = true;
        setupDragHandlers(panel, mapInstance);
    }

    renderOrderPanel(panel, mapInstance);
}

function setupDragHandlers(panel, mapInstance) {
    let dragEl = null;
    let placeholder = null;

    panel.addEventListener('dragstart', (e) => {
        dragEl = e.target.closest('.layer-order-item');
        if (!dragEl) return;
        dragEl.classList.add('dragging');

        placeholder = document.createElement('div');
        placeholder.className = 'layer-order-placeholder';
        placeholder.style.height = dragEl.offsetHeight + 'px';

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragEl.dataset.key);
    });

    panel.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!dragEl || !placeholder) return;

        const target = e.target.closest('.layer-order-item');
        if (!target || target === dragEl) return;

        const rect = target.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
            panel.insertBefore(placeholder, target);
        } else {
            panel.insertBefore(placeholder, target.nextSibling);
        }
    });

    panel.addEventListener('dragend', () => {
        if (!dragEl) return;
        dragEl.classList.remove('dragging');

        if (placeholder && placeholder.parentNode) {
            // Move the dragged element to where the placeholder is, then remove placeholder
            placeholder.parentNode.insertBefore(dragEl, placeholder);
            placeholder.parentNode.removeChild(placeholder);

            // Read the new order from current DOM state
            const newOrder = [...panel.querySelectorAll('.layer-order-item')].map(el => el.dataset.key);
            mapInstance.layers.setLayerOrder(newOrder);
        }

        placeholder = null;
        dragEl = null;
    });
}

const layerMenu = {
    open: function() {
        menu.classList.remove('layer-menu-hidden');

        const openLayerPickerButton = document.getElementById('open-layer-picker-button');
        if (openLayerPickerButton) {
            openLayerPickerButton.classList.add('selected');
        }
    },
    init: initializeLayerToggles,
    initOrderPanel: initializeOrderPanel
};

export { layerMenu };