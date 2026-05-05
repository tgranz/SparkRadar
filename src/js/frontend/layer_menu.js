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
                </div>
                <p class="hint">Provided by the <a href="https://saratoga-weather.org" target="_blank">Saratoga Weather</a> lightning placefile, powered by <a href="https://www.blitzortung.org" target="_blank">Blitzortung</a>.</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-lightning-layer" class="switch">
            </div>
        </div>

        <div class="layer-menu-section-header">
            Outlooks
            <i id="more-products-btn" class="ti ti-chevron-right"></i>
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
            Storm Reports
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>NWS Tornado Reports</h3>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-nws-tornado-reports-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>NWS Wind Reports</h3>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-nws-wind-reports-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>NWS Hail Reports</h3>
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
            <div class="layer-menu-item">
                <h3>Spotter Positions</h3>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-spotter-network-positions-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Spotter Reports</h3>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-spotter-network-reports-layer" class="switch">
            </div>
        </div>

        <div class="layer-menu-section-header">
            Media
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item with-hint">
                <div>
                    <h3>Traffic Cameras</h3>
                    <p class="tag new">NEW</p>
                </div>
                <p class="hint">Provided by the the corresponding state's DOT. Only states that have authorized redistribution of camera feeds will be shown. <a href="https://wiki.sparkradar.app/en/sparkradar/trafficcameras" target="_blank">Learn more</a>.</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-cameras-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item with-hint">
                <div>
                    <h3>Weather Radios</h3>
                    <p class="tag new">NEW</p>
                </div>
                <p class="hint">Streams provided by <a href="https://weatherradio.org" target="_blank">GWES WeatherRadio</a>.</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-weather-radios-layer" class="switch">
            </div>
        </div>

        <div class="layer-menu-section-header">
            Miscellaneous
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Surface Fronts</h3>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-surface-analysis-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>METAR Stations</h3>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-metars-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Wildfires</h3>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-wildfires-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Hurricanes</h3>
                <p class="tag inprogress">COMING SOON</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-hurricanes-layer" class="switch">
            </div>
        </div>
    </div>
    <div id="layer-menu-outlook-products" class="layer-menu-content" style="display:none">
        <div class="layer-menu-section-header">
            <span><i id="outlook-products-back" class="ti ti-chevron-left" style="margin-right: 8px;"></i> Outlook Products</span>
        </div>

        <div class="layer-menu-section-header">Day 1</div>
        <div class="layer-menu-section">
            <div class="layer-menu-item"><h3>Categorical</h3></div>
            <div class="layer-menu-item"><input type="checkbox" id="toggle-day-1-outlook-cat-layer" class="switch"></div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item"><h3>Tornado</h3></div>
            <div class="layer-menu-item"><input type="checkbox" id="toggle-day-1-outlook-torn-layer" class="switch"></div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item"><h3>Wind</h3></div>
            <div class="layer-menu-item"><input type="checkbox" id="toggle-day-1-outlook-wind-layer" class="switch"></div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item"><h3>Hail</h3></div>
            <div class="layer-menu-item"><input type="checkbox" id="toggle-day-1-outlook-hail-layer" class="switch"></div>
        </div>

        <div class="layer-menu-section-header">Day 2</div>
        <div class="layer-menu-section">
            <div class="layer-menu-item"><h3>Categorical</h3></div>
            <div class="layer-menu-item"><input type="checkbox" id="toggle-day-2-outlook-cat-layer" class="switch"></div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item"><h3>Tornado</h3></div>
            <div class="layer-menu-item"><input type="checkbox" id="toggle-day-2-outlook-torn-layer" class="switch"></div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item"><h3>Wind</h3></div>
            <div class="layer-menu-item"><input type="checkbox" id="toggle-day-2-outlook-wind-layer" class="switch"></div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item"><h3>Hail</h3></div>
            <div class="layer-menu-item"><input type="checkbox" id="toggle-day-2-outlook-hail-layer" class="switch"></div>
        </div>

        <div class="layer-menu-section-header">Day 3</div>
        <div class="layer-menu-section">
            <div class="layer-menu-item"><h3>Categorical</h3></div>
            <div class="layer-menu-item"><input type="checkbox" id="toggle-day-3-outlook-cat-layer" class="switch"></div>
        </div>
    </div>
    <div id="layer-menu-order" class="layer-menu-content layer-order-panel" style="display:none">
        <p class="layer-order-hint">Drag to reorder. Top of the list appears on top of the map.</p>
    </div>
`;

document.body.appendChild(menu);

// Tab switching
const tabs = menu.querySelectorAll('.layer-menu-tab');
const allPanel = document.getElementById('layer-menu-all');
const orderPanel = document.getElementById('layer-menu-order');
const outlookProductsPanel = document.getElementById('layer-menu-outlook-products');
const tabPanels = { all: allPanel, order: orderPanel };
const showOutlookProductsPanel = (show) => {
    if (!allPanel || !outlookProductsPanel) return;
    allPanel.style.display = show ? 'none' : '';
    outlookProductsPanel.style.display = show ? '' : 'none';
};
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('selected'));
        tab.classList.add('selected');
        const target = tab.dataset.tab;
        if (target === 'all') showOutlookProductsPanel(false);
        Object.entries(tabPanels).forEach(([key, panel]) => {
            panel.style.display = key === target ? '' : 'none';
        });
    });
});

const moreProductsButton = document.getElementById('more-products-btn');
const outlookProductsBack = document.getElementById('outlook-products-back');

if (moreProductsButton && allPanel && outlookProductsPanel) {
    moreProductsButton.addEventListener('click', () => {
        showOutlookProductsPanel(true);
    });
}

if (outlookProductsBack && allPanel && outlookProductsPanel) {
    outlookProductsBack.addEventListener('click', () => {
        showOutlookProductsPanel(false);
    });
}

// Map closing actions
document.getElementById('close-layer-menu').addEventListener('click', () => {
    menu.classList.add('layer-menu-hidden');
    showOutlookProductsPanel(false);

    // Update the button
    const openLayerPickerButton = document.getElementById('open-layer-picker-button');
    if (openLayerPickerButton) {
        openLayerPickerButton.classList.remove('selected');
    }
});

document.onkeydown = (e) => {
    if (e.key === 'Escape') {
        menu.classList.add('layer-menu-hidden');
        showOutlookProductsPanel(false);

        // Update the button
        const openLayerPickerButton = document.getElementById('open-layer-picker-button');
        if (openLayerPickerButton) {
            openLayerPickerButton.classList.remove('selected');
        }
    }
};

// Initialize layer toggle handlers (called from entry.js after map is ready)
function initializeLayerToggles(mapInstance) {
    const normalizeOutlookProducts = (savedProducts, fallbackDay = null) => {
        const normalized = {
            1: { cat: false, torn: false, wind: false, hail: false },
            2: { cat: false, torn: false, wind: false, hail: false },
            3: { cat: false, torn: false, wind: false, hail: false },
        };

        for (const day of [1, 2, 3]) {
            const rawDay = savedProducts?.[day] || savedProducts?.[String(day)] || {};
            normalized[day] = {
                cat: rawDay.cat === true,
                torn: rawDay.torn === true,
                wind: rawDay.wind === true,
                hail: rawDay.hail === true,
            };
        }

        const hasAny = [1, 2, 3].some((day) => Object.values(normalized[day]).some(Boolean));
        if (!hasAny && [1, 2, 3].includes(fallbackDay)) {
            normalized[fallbackDay].cat = true;
        }

        return normalized;
    };

    const getFirstEnabledOutlookDay = (outlookProducts) => {
        for (const day of [1, 2, 3]) {
            if (Object.values(outlookProducts?.[day] || {}).some(Boolean)) {
                return day;
            }
        }
        return null;
    };

    const hasAnyEnabledOutlookProducts = (outlookProducts) => {
        return [1, 2, 3].some((day) => Object.values(outlookProducts?.[day] || {}).some(Boolean));
    };

    const getDayToggleStateFromProducts = (outlookProducts, day) => {
        return outlookProducts?.[day]?.cat === true;
    };

    // Load saved layer settings from localStorage
    const loadLayerSettings = () => {
        try {
            const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
            const outlookProducts = normalizeOutlookProducts(settings.outlookProducts, settings.outlookDay || null);
            return {
                alertsEnabled: settings.alertsEnabled !== undefined ? settings.alertsEnabled : true,
                watchesEnabled: settings.watchesEnabled !== undefined ? settings.watchesEnabled : true,
                mesoscaleDiscussionsEnabled: settings.mesoscaleDiscussionsEnabled !== undefined ? settings.mesoscaleDiscussionsEnabled : false,
                tvsSignaturesEnabled: settings.tvsSignaturesEnabled !== undefined ? settings.tvsSignaturesEnabled : false,
                hailSignaturesEnabled: settings.hailSignaturesEnabled !== undefined ? settings.hailSignaturesEnabled : false,
                surfaceAnalysisEnabled: settings.surfaceAnalysisEnabled !== undefined ? settings.surfaceAnalysisEnabled : false,
                lightningEnabled: settings.lightningEnabled !== undefined ? settings.lightningEnabled : false,
                nwsTornadoReportsEnabled: settings.nwsTornadoReportsEnabled !== undefined ? settings.nwsTornadoReportsEnabled : false,
                nwsWindReportsEnabled: settings.nwsWindReportsEnabled !== undefined ? settings.nwsWindReportsEnabled : false,
                nwsHailReportsEnabled: settings.nwsHailReportsEnabled !== undefined ? settings.nwsHailReportsEnabled : false,
                spotterNetworkPositionsEnabled: settings.spotterNetworkPositionsEnabled !== undefined ? settings.spotterNetworkPositionsEnabled : false,
                spotterNetworkReportsEnabled: settings.spotterNetworkReportsEnabled !== undefined ? settings.spotterNetworkReportsEnabled : false,
                trafficCamerasEnabled: settings.trafficCamerasEnabled !== undefined ? settings.trafficCamerasEnabled : false,
                weatherRadiosEnabled: settings.weatherRadiosEnabled !== undefined ? settings.weatherRadiosEnabled : false,
                metarStationsEnabled: settings.metarStationsEnabled !== undefined ? settings.metarStationsEnabled : false,
                wildfiresEnabled: settings.wildfiresEnabled !== undefined ? settings.wildfiresEnabled : false,
                outlookDay: settings.outlookDay || getFirstEnabledOutlookDay(outlookProducts) || null,
                outlookProducts,
            };
        } catch (e) {
            return {
                alertsEnabled: true,
                watchesEnabled: true,
                mesoscaleDiscussionsEnabled: false,
                tvsSignaturesEnabled: false,
                hailSignaturesEnabled: false,
                surfaceAnalysisEnabled: false,
                lightningEnabled: false,
                nwsTornadoReportsEnabled: false,
                nwsWindReportsEnabled: false,
                nwsHailReportsEnabled: false,
                spotterNetworkPositionsEnabled: false,
                spotterNetworkReportsEnabled: false,
                trafficCamerasEnabled: false,
                weatherRadiosEnabled: false,
                metarStationsEnabled: false,
                wildfiresEnabled: false,
                outlookDay: null,
                outlookProducts: normalizeOutlookProducts(null, null),
            };
        }
    };

    const settings = loadLayerSettings();

    let forceRefreshTimerId = null;
    const triggerForceRefresh = () => {
        if (forceRefreshTimerId) {
            clearTimeout(forceRefreshTimerId);
        }

        forceRefreshTimerId = setTimeout(() => {
            forceRefreshTimerId = null;
            if (typeof window.forceUpdate === 'function') {
                window.forceUpdate();
            }
        }, 150);
    };

    // When any layer toggle is turned on, force an immediate refresh cycle
    // so newly enabled layers appear right away instead of waiting for interval updates.
    menu.addEventListener('change', (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement)) return;
        if (!input.classList.contains('switch')) return;
        if (!input.id.startsWith('toggle-') || !input.id.endsWith('-layer')) return;
        if (!input.checked) return;
        triggerForceRefresh();
    });

    // Get UI elements
    const alertsCheckbox = document.getElementById('toggle-alerts-layer');
    const watchesCheckbox = document.getElementById('toggle-watches-layer');
    const mesoscaleDiscussionsCheckbox = document.getElementById('toggle-mesoscale-discussions-layer');
    const tvsSignaturesCheckbox = document.getElementById('toggle-tvs-signatures-layer');
    const hailSignaturesCheckbox = document.getElementById('toggle-hail-signatures-layer');
    const day1OutlookCheckbox = document.getElementById('toggle-day-1-outlook-layer');
    const day2OutlookCheckbox = document.getElementById('toggle-day-2-outlook-layer');
    const day3OutlookCheckbox = document.getElementById('toggle-day-3-outlook-layer');
    const day1OutlookCatCheckbox = document.getElementById('toggle-day-1-outlook-cat-layer');
    const day1OutlookTornCheckbox = document.getElementById('toggle-day-1-outlook-torn-layer');
    const day1OutlookWindCheckbox = document.getElementById('toggle-day-1-outlook-wind-layer');
    const day1OutlookHailCheckbox = document.getElementById('toggle-day-1-outlook-hail-layer');
    const day2OutlookCatCheckbox = document.getElementById('toggle-day-2-outlook-cat-layer');
    const day2OutlookTornCheckbox = document.getElementById('toggle-day-2-outlook-torn-layer');
    const day2OutlookWindCheckbox = document.getElementById('toggle-day-2-outlook-wind-layer');
    const day2OutlookHailCheckbox = document.getElementById('toggle-day-2-outlook-hail-layer');
    const day3OutlookCatCheckbox = document.getElementById('toggle-day-3-outlook-cat-layer');
    const day3OutlookTornCheckbox = document.getElementById('toggle-day-3-outlook-torn-layer');
    const day3OutlookWindCheckbox = document.getElementById('toggle-day-3-outlook-wind-layer');
    const day3OutlookHailCheckbox = document.getElementById('toggle-day-3-outlook-hail-layer');

    const outlookTypeCheckboxByDay = {
        1: {
            cat: day1OutlookCatCheckbox,
            torn: day1OutlookTornCheckbox,
            wind: day1OutlookWindCheckbox,
            hail: day1OutlookHailCheckbox,
        },
        2: {
            cat: day2OutlookCatCheckbox,
            torn: day2OutlookTornCheckbox,
            wind: day2OutlookWindCheckbox,
            hail: day2OutlookHailCheckbox,
        },
        3: {
            cat: day3OutlookCatCheckbox,
            torn: day3OutlookTornCheckbox,
            wind: day3OutlookWindCheckbox,
            hail: day3OutlookHailCheckbox,
        },
    };
    const surfaceAnalysisCheckbox = document.getElementById('toggle-surface-analysis-layer');
    const lightningCheckbox = document.getElementById('toggle-lightning-layer');
    const nwsTornadoReportsCheckbox = document.getElementById('toggle-nws-tornado-reports-layer');
    const nwsWindReportsCheckbox = document.getElementById('toggle-nws-wind-reports-layer');
    const nwsHailReportsCheckbox = document.getElementById('toggle-nws-hail-reports-layer');
    const spotterNetworkPositionsCheckbox = document.getElementById('toggle-spotter-network-positions-layer');
    const spotterNetworkReportsCheckbox = document.getElementById('toggle-spotter-network-reports-layer');
    const camerasCheckbox = document.getElementById('toggle-cameras-layer');
    const weatherRadiosCheckbox = document.getElementById('toggle-weather-radios-layer');
    const metarsCheckbox = document.getElementById('toggle-metars-layer');
    const wildfiresCheckbox = document.getElementById('toggle-wildfires-layer');
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
        day1OutlookCheckbox.checked = getDayToggleStateFromProducts(settings.outlookProducts, 1);
    }
    if (day2OutlookCheckbox) {
        day2OutlookCheckbox.checked = getDayToggleStateFromProducts(settings.outlookProducts, 2);
    }
    if (day3OutlookCheckbox) {
        day3OutlookCheckbox.checked = getDayToggleStateFromProducts(settings.outlookProducts, 3);
    }
    for (const day of [1, 2, 3]) {
        const typeCheckboxes = outlookTypeCheckboxByDay[day];
        for (const type of ['cat', 'torn', 'wind', 'hail']) {
            if (typeCheckboxes[type]) {
                typeCheckboxes[type].checked = settings.outlookProducts[day][type] === true;
            }
        }
    }
    if (surfaceAnalysisCheckbox) {
        surfaceAnalysisCheckbox.checked = settings.surfaceAnalysisEnabled;
    }
    if (lightningCheckbox) {
        lightningCheckbox.checked = settings.lightningEnabled;
    }
    if (nwsTornadoReportsCheckbox) {
        nwsTornadoReportsCheckbox.checked = settings.nwsTornadoReportsEnabled;
    }
    if (nwsWindReportsCheckbox) {
        nwsWindReportsCheckbox.checked = settings.nwsWindReportsEnabled;
    }
    if (nwsHailReportsCheckbox) {
        nwsHailReportsCheckbox.checked = settings.nwsHailReportsEnabled;
    }
    if (spotterNetworkPositionsCheckbox) {
        spotterNetworkPositionsCheckbox.checked = settings.spotterNetworkPositionsEnabled;
    }
    if (spotterNetworkReportsCheckbox) {
        spotterNetworkReportsCheckbox.checked = settings.spotterNetworkReportsEnabled;
    }
    if (camerasCheckbox) {
        camerasCheckbox.checked = settings.trafficCamerasEnabled;
    }
    if (weatherRadiosCheckbox) {
        weatherRadiosCheckbox.checked = settings.weatherRadiosEnabled;
    }
    if (metarsCheckbox) {
        metarsCheckbox.checked = settings.metarStationsEnabled;
    }
    if (wildfiresCheckbox) {
        wildfiresCheckbox.checked = settings.wildfiresEnabled;
    }

    // Initialize storm center enabled types based on saved settings
    if (mapInstance.layers && mapInstance.layers.stormCentersLayer) {
        mapInstance.layers.stormCentersLayer.setEnabledTypes({
            tvs: settings.tvsSignaturesEnabled,
            hail: settings.hailSignaturesEnabled
        });
    }

    if (mapInstance.layers && mapInstance.layers.nwsStormReportsLayer) {
        mapInstance.layers.nwsStormReportsLayer.setEnabledTypes({
            tornado: settings.nwsTornadoReportsEnabled,
            wind: settings.nwsWindReportsEnabled,
            hail: settings.nwsHailReportsEnabled
        });
    }

    // Listen for connection status changes
    if (connectionStatusElement) {
        document.addEventListener('alertConnectionStatusChanged', (e) => {
            var status = e.detail.status;
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

    const persistOutlookProducts = (outlookProducts) => {
        const activeDay = getFirstEnabledOutlookDay(outlookProducts);
        try {
            const saved = JSON.parse(localStorage.getItem('layerSettings') || '{}');
            saved.outlookProducts = outlookProducts;
            saved.outlookDay = activeDay;
            localStorage.setItem('layerSettings', JSON.stringify(saved));
        } catch (error) {
            console.error('Error saving layer settings:', error);
        }
    };

    const syncDayCheckboxesFromOutlookProducts = (outlookProducts) => {
        if (day1OutlookCheckbox) day1OutlookCheckbox.checked = getDayToggleStateFromProducts(outlookProducts, 1);
        if (day2OutlookCheckbox) day2OutlookCheckbox.checked = getDayToggleStateFromProducts(outlookProducts, 2);
        if (day3OutlookCheckbox) day3OutlookCheckbox.checked = getDayToggleStateFromProducts(outlookProducts, 3);
    };

    const syncOutlookTypeCheckboxesFromProducts = (outlookProducts) => {
        for (const day of [1, 2, 3]) {
            const typeCheckboxes = outlookTypeCheckboxByDay[day];
            for (const type of ['cat', 'torn', 'wind', 'hail']) {
                if (typeCheckboxes[type]) {
                    typeCheckboxes[type].checked = outlookProducts?.[day]?.[type] === true;
                }
            }
        }
    };

    const setSingleOutlookSelection = (day, type, enabled) => {
        const nextOutlookProducts = normalizeOutlookProducts(settings.outlookProducts);

        for (const d of [1, 2, 3]) {
            nextOutlookProducts[d] = { cat: false, torn: false, wind: false, hail: false };
        }

        if (enabled) {
            nextOutlookProducts[day][type] = true;
        }

        settings.outlookProducts = nextOutlookProducts;
        syncOutlookTypeCheckboxesFromProducts(nextOutlookProducts);
        syncDayCheckboxesFromOutlookProducts(nextOutlookProducts);
        persistOutlookProducts(nextOutlookProducts);
        refreshOutlooksFromSettings();
    };

    const refreshOutlooksFromSettings = () => {
        mapInstance.layers.fetchOutlooks();
    };

    // Outlook day toggle handlers
    const handleOutlookToggle = (day, checkbox) => {
        if (!checkbox) return;

        checkbox.addEventListener('change', (e) => {
            setSingleOutlookSelection(day, 'cat', e.target.checked);
        });
    };

    handleOutlookToggle(1, day1OutlookCheckbox);
    handleOutlookToggle(2, day2OutlookCheckbox);
    handleOutlookToggle(3, day3OutlookCheckbox);

    const handleOutlookTypeToggle = (day, type, checkbox) => {
        if (!checkbox) return;

        checkbox.addEventListener('change', (e) => {
            setSingleOutlookSelection(day, type, e.target.checked);
        });
    };

    for (const day of [1, 2, 3]) {
        handleOutlookTypeToggle(day, 'cat', outlookTypeCheckboxByDay[day].cat);
        handleOutlookTypeToggle(day, 'torn', outlookTypeCheckboxByDay[day].torn);
        handleOutlookTypeToggle(day, 'wind', outlookTypeCheckboxByDay[day].wind);
        handleOutlookTypeToggle(day, 'hail', outlookTypeCheckboxByDay[day].hail);
    }

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

    const syncNwsStormReportLayer = () => {
        const enabledTypes = {
            tornado: nwsTornadoReportsCheckbox ? nwsTornadoReportsCheckbox.checked : false,
            wind: nwsWindReportsCheckbox ? nwsWindReportsCheckbox.checked : false,
            hail: nwsHailReportsCheckbox ? nwsHailReportsCheckbox.checked : false,
        };

        if (mapInstance.layers?.nwsStormReportsLayer) {
            mapInstance.layers.nwsStormReportsLayer.setEnabledTypes(enabledTypes);
        }

        if (enabledTypes.tornado || enabledTypes.wind || enabledTypes.hail) {
            mapInstance.layers.displayNwsStormReports();
            mapInstance.layers.fetchNwsStormReports();
        } else {
            mapInstance.layers.displayNwsStormReports();
        }
    };

    const handleNwsStormReportToggle = (checkbox, settingKey) => {
        if (!checkbox) return;

        checkbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            try {
                const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
                settings[settingKey] = isChecked;
                localStorage.setItem('layerSettings', JSON.stringify(settings));
            } catch (error) {
                console.error('Error saving layer settings:', error);
            }

            syncNwsStormReportLayer();
        });
    };

    handleNwsStormReportToggle(nwsTornadoReportsCheckbox, 'nwsTornadoReportsEnabled');
    handleNwsStormReportToggle(nwsWindReportsCheckbox, 'nwsWindReportsEnabled');
    handleNwsStormReportToggle(nwsHailReportsCheckbox, 'nwsHailReportsEnabled');

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

    if (spotterNetworkReportsCheckbox) {
        spotterNetworkReportsCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            try {
                const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
                settings.spotterNetworkReportsEnabled = isChecked;
                localStorage.setItem('layerSettings', JSON.stringify(settings));
            } catch (error) {
                console.error('Error saving layer settings:', error);
            }

            if (isChecked) {
                mapInstance.layers.displaySpotterNetworkReports();
                mapInstance.layers.fetchSpotterNetworkReports();
            } else {
                mapInstance.layers.displaySpotterNetworkReports();
            }
        });
    }

    if (camerasCheckbox) {
        camerasCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            try {
                const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
                settings.trafficCamerasEnabled = isChecked;
                localStorage.setItem('layerSettings', JSON.stringify(settings));
            } catch (error) {
                console.error('Error saving layer settings:', error);
            }

            if (isChecked) {
                mapInstance.layers.displayTrafficCameras();
                mapInstance.layers.fetchTrafficCameras();
            } else {
                mapInstance.layers.displayTrafficCameras();
            }
        });
    }

    if (weatherRadiosCheckbox) {
        weatherRadiosCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            try {
                const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
                settings.weatherRadiosEnabled = isChecked;
                localStorage.setItem('layerSettings', JSON.stringify(settings));
            } catch (error) {
                console.error('Error saving layer settings:', error);
            }

            if (isChecked) {
                mapInstance.layers.displayWeatherRadios();
                mapInstance.layers.fetchWeatherRadios();
            } else {
                mapInstance.layers.displayWeatherRadios();
            }
        });
    }

    if (metarsCheckbox) {
        metarsCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            try {
                const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
                settings.metarStationsEnabled = isChecked;
                localStorage.setItem('layerSettings', JSON.stringify(settings));
            } catch (error) {
                console.error('Error saving layer settings:', error);
            }

            if (isChecked) {
                mapInstance.layers.displayMetarStations();
                mapInstance.layers.fetchMetarStations();
            } else {
                mapInstance.layers.displayMetarStations();
            }
        });
    }

    if (wildfiresCheckbox) {
        wildfiresCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            try {
                const settings = JSON.parse(localStorage.getItem('layerSettings') || '{}');
                settings.wildfiresEnabled = isChecked;
                localStorage.setItem('layerSettings', JSON.stringify(settings));
            } catch (error) {
                console.error('Error saving layer settings:', error);
            }

            if (isChecked) {
                mapInstance.layers.displayWildfires();
                mapInstance.layers.fetchWildfires();
            } else {
                mapInstance.layers.displayWildfires();
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
        if (hasAnyEnabledOutlookProducts(settings.outlookProducts)) {
            mapInstance.layers.fetchOutlooks();
        }
        if (surfaceAnalysisCheckbox && surfaceAnalysisCheckbox.checked) {
            mapInstance.layers.fetchSurfaceAnalysis();
        }
        if (lightningCheckbox && lightningCheckbox.checked) {
            mapInstance.layers.fetchLightning();
        }
        if ((nwsTornadoReportsCheckbox && nwsTornadoReportsCheckbox.checked) || (nwsWindReportsCheckbox && nwsWindReportsCheckbox.checked) || (nwsHailReportsCheckbox && nwsHailReportsCheckbox.checked)) {
            mapInstance.layers.fetchNwsStormReports();
        }
        if (spotterNetworkPositionsCheckbox && spotterNetworkPositionsCheckbox.checked) {
            mapInstance.layers.fetchSpotterNetworkPositions();
        }
        if (spotterNetworkReportsCheckbox && spotterNetworkReportsCheckbox.checked) {
            mapInstance.layers.fetchSpotterNetworkReports();
        }
        if (camerasCheckbox && camerasCheckbox.checked) {
            mapInstance.layers.fetchTrafficCameras();
        }
        if (weatherRadiosCheckbox && weatherRadiosCheckbox.checked) {
            mapInstance.layers.fetchWeatherRadios();
        }
        if (metarsCheckbox && metarsCheckbox.checked) {
            mapInstance.layers.fetchMetarStations();
        }
        if (wildfiresCheckbox && wildfiresCheckbox.checked) {
            mapInstance.layers.fetchWildfires();
        }
    }, 5000);
}


import { DEFAULT_LAYER_ORDER, LAYER_ORDER_LABELS, LAYER_ORDER_ANCHORS } from '../maplayers/layer_utils.js';

function renderOrderPanel(panel, mapInstance) {
    const order = mapInstance.layers.getLayerOrder();
    panel.innerHTML = '<p class="layer-order-hint">Drag to reorder. Top of the list appears on top of the map.</p>';

    const iconMapping = {
        'alerts': { type: 'icon' , value: 'ti ti-alert-triangle' },
        'alertVectors': { type: 'icon' , value: 'ti ti-navigation' },
        'roads': { type: 'icon' , value: 'ti ti-road' },
        'mesoscaleDiscussions': { type: 'icon' , value: 'ti ti-message' },
        'radar': { type: 'icon' , value: 'ti ti-radar-2' },
        'labels': { type: 'icon' , value: 'ti ti-label' },
        'watches': { type: 'icon' , value: 'ti ti-eye' },
        'lightning': { type: 'image' , value: 'https://i.ibb.co/jkfmTDbt/lightningmarker.png' },
        'signatures': { type: 'icon' , value: 'ti ti-cloud-storm' },
        'spotterNetworkPositions': { type: 'image' , value: 'https://i.ibb.co/Md3GvZm/IMG-1278.webp' },
        'spotterNetworkReports': { type: 'image' , value: 'https://i.ibb.co/N2BZqZ16/other.png' },
        'trafficCameras': { type: 'image' , value: 'https://i.ibb.co/272YqqtL/videocamera.png' },
        'weatherRadios': { type: 'image' , value: 'https://i.ibb.co/chwwBPTt/radio.png' },
        'nwsStormReports': { type: 'image' , value: 'https://i.ibb.co/WvXTH7n6/tornado.png' },
        'metarStations': { type: 'icon' , value: 'ti ti-temperature' },
        'surfaceAnalysis': { type: 'icon' , value: 'ti ti-wind' },
        'outlook': { type: 'icon' , value: 'ti ti-calendar-event' },
        'wildfires': { type: 'icon' , value: 'ti ti-flame' },
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