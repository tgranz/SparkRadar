const menu = document.createElement('div');
menu.id = 'layer-menu';
menu.classList.add('layer-menu-hidden');

menu.innerHTML = `
    <div class="layer-menu-header">
        <h2>Layers</h2>
        <button class="menu-close-btn" id="close-layer-menu"><i class="ti ti-x"></i></button>
    </div>
    <div class="layer-menu-content">
        <div class="layer-menu-section-header">
            Severe Weather
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Alerts</h3>
                <p class="tag beta">BETA</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-alerts-layer" class="switch" checked>
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Watches</h3>
                <p class="tag beta">BETA</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-watches-layer" class="switch" checked>
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Mesoscale Discussions</h3>
                <p class="tag inprogress">IN DEVELOPMENT</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-mesoscale-discussions-layer" class="switch">
            </div>
        </div>

        <div class="layer-menu-section-header">
            Outlooks
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Day 1 Outlook</h3>
                <p class="tag inprogress">IN DEVELOPMENT</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-day-1-outlook-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Day 2 Outlook</h3>
                <p class="tag inprogress">IN DEVELOPMENT</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-day-2-outlook-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Day 3 Outlook</h3>
                <p class="tag inprogress">IN DEVELOPMENT</p>
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
                <p class="tag inprogress">IN DEVELOPMENT</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-nws-tornado-reports-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>NWS Wind Reports</h3>
                <p class="tag inprogress">IN DEVELOPMENT</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-nws-wind-reports-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>NWS Hail Reports</h3>
                <p class="tag inprogress">IN DEVELOPMENT</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-nws-hail-reports-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Spotter Network Positions</h3>
                <p class="tag inprogress">IN DEVELOPMENT</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-spotter-network-positions-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Spotter Network Reports</h3>
                <p class="tag inprogress">IN DEVELOPMENT</p>
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
                <h3>Hurricanes</h3>
                <p class="tag inprogress">IN DEVELOPMENT</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-hurricanes-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Weather Radios</h3>
                <p class="tag inprogress">IN DEVELOPMENT</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-weather-radios-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>METAR Stations</h3>
                <p class="tag inprogress">IN DEVELOPMENT</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-metars-layer" class="switch">
            </div>
        </div>
        <div class="layer-menu-section">
            <div class="layer-menu-item">
                <h3>Wildfires</h3>
                <p class="tag inprogress">IN DEVELOPMENT</p>
            </div>
            <div class="layer-menu-item">
                <input type="checkbox" id="toggle-wildfires-layer" class="switch">
            </div>
        </div>
    </div>
`;

document.body.appendChild(menu);

// Map closing actions
document.getElementById('close-layer-menu').addEventListener('click', () => {
    menu.classList.add('layer-menu-hidden');
});

document.onkeydown = (e) => {
    if (e.key === 'Escape') {
        menu.classList.add('layer-menu-hidden');
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
                watchesEnabled: settings.watchesEnabled !== undefined ? settings.watchesEnabled : true
            };
        } catch (e) {
            return { alertsEnabled: true, watchesEnabled: true };
        }
    };

    const settings = loadLayerSettings();

    // Set initial checkbox states
    const alertsCheckbox = document.getElementById('toggle-alerts-layer');
    const watchesCheckbox = document.getElementById('toggle-watches-layer');
    
    if (alertsCheckbox) {
        alertsCheckbox.checked = settings.alertsEnabled;
    }
    if (watchesCheckbox) {
        watchesCheckbox.checked = settings.watchesEnabled;
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

    // Fetch alerts/watches if they're enabled, but wait for radar to load first
    // Check actual checkbox state at fetch time, not initial settings
    setTimeout(() => {
        if (alertsCheckbox && alertsCheckbox.checked) {
            mapInstance.layers.fetchAlerts();
        }
        if (watchesCheckbox && watchesCheckbox.checked) {
            mapInstance.layers.fetchWatches();
        }
    }, 5000);
}


const layerMenu = {
    open: function() {
        menu.classList.remove('layer-menu-hidden');
    },
    init: initializeLayerToggles
};

export { layerMenu };