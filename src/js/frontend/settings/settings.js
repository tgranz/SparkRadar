import settingsHTML from './settings.html?raw';
import Palettes from '../../backend/palettes.js';
import Toast from '../../ui/toast.js';
import Modal from '../../ui/modal.js';
import Window from '../../ui/window.js';
import { buildMapLayerVisibilityObjects } from '../../maplayers/layer_utils.js';

// Mapping of setting keys to palette names
const paletteKeyMap = {
    uploadPaletteRef: 'REF',
    uploadPaletteVel: 'VEL',
    uploadPaletteCC: 'CC',
    uploadPaletteZDR: 'ZDR',
    uploadPaletteKDP: 'KDP',
    uploadPaletteSW: 'SW',
    uploadPaletteDHC: 'DHC',
    uploadPaletteSRV: 'SRV',
    uploadPaletteDAA: 'DAA',
    uploadPaletteDTA: 'DTA'
};

// Alert type configurations organized by category
const ALERT_CATEGORIES = [
    {
        name: 'Severe',
        visualOnly: false,
        alerts: [
            { type: 'Tornado Emergency', color: '#ae21ff' },
            { type: 'PDS Tornado Warning', color: '#ff00ff' },
            { type: 'Confirmed Tornado Warning', color: '#ca2020' },
            { type: 'Tornado Warning', color: '#ff2121' },
            { type: 'Destructive Severe Thunderstorm Warning', color: '#ff5500'},
            { type: 'Considerable Severe Thunderstorm Warning', color: '#ff7700'},
            { type: 'Severe Thunderstorm Warning', color: '#ff9900' },
            { type: 'Special Weather Statement', color: '#facc15' }
        ]
    },
    {
        name: 'Flood',
        visualOnly: false,
        alerts: [
            { type: 'Flash Flood Emergency', color: '#1ed400' },
            { type: 'Considerable Flash Flood Warning', color: '#38f852' },
            { type: 'Flash Flood Warning', color: '#38f852' },
            { type: 'Flash Flood Watch', color: '#27bd3b' },
            { type: 'Flood Warning', color: '#27beff' }
        ]
    },
    {
        name: 'Marine',
        visualOnly: false,
        alerts: [
            { type: 'Special Marine Warning', color: '#1406d4' },
            { type: 'Marine Weather Statement', color: '#06b6d4' }
        ]
    },
    {
        name: 'Seismic',
        visualOnly: false,
        alerts: [
            { type: 'Tsunami Warning', color: '#00b418' },
            { type: 'Earthquake Warning', color: '#b40000' },
            { type: 'Volcano Warning', color: '#ff8800' }
        ]
    },
    {
        name: 'Winter',
        visualOnly: false,
        alerts: [
            { type: 'Avalanche Warning', color: '#d52dff' },
            { type: 'Avalanche Watch', color: '#b23acf' },
            { type: 'Snow Squall Warning', color: '#00d4ff' }
        ]
    },
    {
        name: 'Miscellaneous',
        visualOnly: false,
        alerts: [
            { type: 'Extreme Wind Warning', color: '#ff00ff' },
            { type: 'Shelter in Place Warning', color: '#f700ff' },
            { type: 'Dust Storm Warning', color: '#c76531' }
        ]
    },
    {
        name: 'Watches',
        visualOnly: true,
        alerts: [
            { type: 'Tornado Watch', color: '#ff2121' },
            { type: 'Severe Thunderstorm Watch', color: '#ff9900' }
        ]
    },
    {
        name: 'Products',
        visualOnly: true,
        alerts: [
            { type: 'Mesoscale Discussion', color: '#ffcc00' }
        ]
    }
];

function buildAlertSettingKey(alertType) {
    return `alert_${alertType.replace(/\s+/g, '_').toLowerCase()}`;
}

// Flatten alert defaults for backward compatibility
function buildAlertDefaults() {
    const defaults = {};
    ALERT_CATEGORIES.forEach((category) => {
        category.alerts.forEach((alertConfig) => {
            defaults[alertConfig.type] = { color: alertConfig.color };
        });
    });
    return defaults;
}

const ALERT_TYPE_DEFAULTS = buildAlertDefaults();

let activePreviewAudio = null;

function stopActivePreviewAudio() {
    if (!activePreviewAudio) {
        return;
    }

    activePreviewAudio.pause();
    activePreviewAudio.currentTime = 0;
    activePreviewAudio = null;
}

function previewNotificationSound(soundFile) {
    stopActivePreviewAudio();

    if (!soundFile || soundFile === 'none') return;

    const audio = new Audio(`sound/${soundFile}`);
    audio.volume = 0.5; // decrease volume
    activePreviewAudio = audio;

    const clearPreview = () => {
        if (activePreviewAudio === audio) {
            activePreviewAudio = null;
        }
    };

    audio.addEventListener('ended', clearPreview, { once: true });
    audio.addEventListener('error', () => {
        clearPreview();
        new Toast('Unable to play preview sound.').show();
    }, { once: true });

    audio.play().catch((error) => {
        clearPreview();
        if (error?.name === 'NotAllowedError') {
            new Toast('Audio preview blocked by browser autoplay settings.').show();
            return;
        }
        new Toast('Unable to play preview sound.').show();
    });
}


function initSettings(settingsInstance) {
    const settingsNav = document.querySelector('.settings-nav');
    const navToggle = document.querySelector('.settings-nav-toggle');
    const navItems = document.querySelectorAll('.settings-nav-item');
    const closeBtn = document.querySelector('.settings-header-close');
    const navTitle = document.querySelector('.settings-nav-title');

    const setNavTitle = (item) => {
        if (!navTitle || !item) {
            return;
        }

        navTitle.textContent = item.textContent.trim();
    };

    // Wire close button
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            settingsInstance.closeSettings();
        });
    }

    // Toggle mobile nav
    if (navToggle) {
        navToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            settingsNav.classList.toggle('nav-open');
        });
    }

    // Close nav when item is clicked (mobile)
    navItems.forEach((item) => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active class from all items
            navItems.forEach((i) => i.classList.remove('active'));
            
            // Add active class to clicked item
            item.classList.add('active');

            setNavTitle(item);
            
            // Close nav on mobile
            if (window.innerWidth < 768) {
                settingsNav.classList.remove('nav-open');
            }

            // Handle section navigation
            const section = item.getAttribute('data-section');
            loadSection(section, settingsInstance);
        });
    });

    // Load first section by default
    if (navItems.length > 0) {
        navItems[0].classList.add('active');
        const firstSection = navItems[0].getAttribute('data-section');
        loadSection(firstSection, settingsInstance);
        setNavTitle(navItems[0]);
    }
}

function loadSection(section, settingsInstance) {
    if (settingsInstance?.cacheStatsInterval) {
        clearInterval(settingsInstance.cacheStatsInterval);
        settingsInstance.cacheStatsInterval = null;
    }

    const content = document.querySelector('.settings-content');
    const sectionTemplate = document.querySelector(`.settings-section[data-section="${section}"]`);

    if (content && sectionTemplate) {
        content.innerHTML = sectionTemplate.innerHTML;
        bindSectionControls(settingsInstance, content);
    }
}

function bindSectionControls(settingsInstance, content) {
    if (!settingsInstance || !content) {
        return;
    }

    const palettes = new Palettes();
    const syncAnimationFrameControl = () => {
        const frameInput = content.querySelector('#animation-frame-count');
        if (!frameInput) return;

        const cacheMaxSlots = Number(settingsInstance.getSetting('cacheMaxSlots'));
        const fallbackMax = Number(frameInput.dataset.fallbackMax || frameInput.max || 40);
        const effectiveMax = Number.isFinite(cacheMaxSlots) ? Math.max(3, cacheMaxSlots) : fallbackMax;

        frameInput.max = String(effectiveMax);

        const currentFrames = Number(settingsInstance.getSetting('animationFrameCount'));
        const clampedFrames = Math.max(3, Math.min(effectiveMax, Number.isFinite(currentFrames) ? currentFrames : 15));

        if (String(frameInput.value) !== String(clampedFrames)) {
            frameInput.value = String(clampedFrames);
        }

        const frameLabel = content.querySelector('.settings-control-value[data-for="animation-frame-count"]');
        if (frameLabel) {
            frameLabel.textContent = String(clampedFrames);
        }

        if (clampedFrames !== currentFrames) {
            settingsInstance.setSetting('animationFrameCount', clampedFrames);
        }
    };

    const refreshCacheStatsUi = () => {
        const usageSizeEl = content.querySelector('#cache-usage-size');
        const usageDetailsEl = content.querySelector('#cache-usage-details');

        if (!usageSizeEl && !usageDetailsEl) return;

        const radar = typeof window !== 'undefined' ? window.radarInstance : null;
        if (!radar?.getCacheStats) {
            if (usageSizeEl) usageSizeEl.textContent = 'Unavailable';
            if (usageDetailsEl) usageDetailsEl.textContent = 'Radar cache stats are unavailable until radar initializes.';
            return;
        }

        const stats = radar.getCacheStats();
        if (usageSizeEl) {
            usageSizeEl.textContent = `${stats.totalSize} / ${stats.maxSize}`;
        }
        if (usageDetailsEl) {
            usageDetailsEl.textContent = `Entries: ${stats.slots}/${stats.maxSlots} | Hit rate: ${stats.hitRate} | Hits: ${stats.hits} | Misses: ${stats.misses}`;
        }
    };
    
    // Apply gradient previews to palette upload buttons
    Object.entries(paletteKeyMap).forEach(([key, paletteName]) => {
        const button = content.querySelector(`[data-setting="${key}"]`);
        if (button) {
            const gradient = palettes.generateGradientCSS(paletteName);
            if (gradient) {
                button.style.background = gradient;
                button.style.color = 'white';
                button.style.textShadow = '0 0 2px rgba(0,0,0,0.7)';
            }
        }
    });

    // Handle Spotter Network section
    const snContainer = content.querySelector('#sn-settings-container');
    if (snContainer) {
        generateSpotterNetworkSettings(snContainer, settingsInstance);
        return;
    }

    // Handle map section specially
    const mapSettingsContainer = content.querySelector('#map-settings-container');
    if (mapSettingsContainer) {
        generateMapLayerVisibilitySettings(settingsInstance, mapSettingsContainer);
        return;
    }

    // Handle alerts section specially
    const alertSettingsList = content.querySelector('#alerts-settings-list');
    if (alertSettingsList) {
        generateAlertSettings(settingsInstance, alertSettingsList);
        return;
    }

    const settingInputs = content.querySelectorAll('[data-setting]');
    settingInputs.forEach((input) => {
        const key = input.getAttribute('data-setting');
        if (!key) {
            return;
        }

        if (input.type === 'button') {
            input.addEventListener('click', (event) => {
                event.preventDefault();
                
                // Handle palette uploads
                if (paletteKeyMap[key]) {
                    handlePaletteUpload(key, settingsInstance);
                } else if (key === 'generalReset') {
                    // Handle reset settings
                    settingsInstance.resetSettings();
                } else if (key === 'generalExport') {
                    settingsInstance.exportSettings();
                } else if (key === 'generalImport') {
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = '.json,application/json';

                    fileInput.addEventListener('change', () => {
                        const file = fileInput.files?.[0];
                        if (!file) return;
                        settingsInstance.importSettings(file);
                    }, { once: true });

                    fileInput.click();
                }
            });
            return;
        }

        if (input.type === 'checkbox') {
            const currentValue = settingsInstance.getSetting(key);
            if (typeof currentValue === 'boolean') {
                input.checked = currentValue;
            }
            input.addEventListener('change', () => {
                settingsInstance.setSetting(key, input.checked);
            });
            return;
        }

        if (input.type === 'color') {
            const currentValue = settingsInstance.getSetting(key);
            if (typeof currentValue === 'string') {
                input.value = currentValue;
            }
            input.addEventListener('input', () => {
                settingsInstance.setSetting(key, input.value);
            });
            return;
        }

        if (input.tagName === 'SELECT') {
            const currentValue = settingsInstance.getSetting(key);
            if (typeof currentValue === 'string') {
                input.value = currentValue;
            }
            input.addEventListener('change', () => {
                settingsInstance.setSetting(key, input.value);
            });
            return;
        }

        if (input.type === 'text') {
            const currentValue = settingsInstance.getSetting(key);
            if (typeof currentValue === 'string') {
                input.value = currentValue;
            }

            const normalizeShortcut = (value) => {
                if (typeof value !== 'string') return '';
                return value.trim().slice(0, 1).toLowerCase();
            };

            input.addEventListener('input', () => {
                const normalized = normalizeShortcut(input.value);
                if (input.value !== normalized) {
                    input.value = normalized;
                }
                settingsInstance.setSetting(key, normalized);
            });
            return;
        }

        const currentValue = settingsInstance.getSetting(key);
        if (typeof currentValue !== 'undefined') {
            input.value = currentValue;
        }

        const valueLabel = content.querySelector(`.settings-control-value[data-for="${input.id}"]`);
        if (valueLabel) {
            valueLabel.textContent = input.value;
        }

        input.addEventListener('input', () => {
            if (valueLabel) {
                valueLabel.textContent = input.value;
            }
            settingsInstance.setSetting(key, Number(input.value));

            if (key === 'cacheMaxSlots' && window.radarInstance?.setCacheSize) {
                window.radarInstance.setCacheSize(Number(input.value));
                refreshCacheStatsUi();
            }
            if (key === 'cacheMaxSlots') {
                syncAnimationFrameControl();
            }
            if (key === 'cacheMaxSizeGB' && window.radarInstance?.setCacheMaxSizeGB) {
                window.radarInstance.setCacheMaxSizeGB(Number(input.value));
                refreshCacheStatsUi();
            }
        });
    });

    syncAnimationFrameControl();

    // Initialize and periodically refresh cache usage stats in Radar section.
    refreshCacheStatsUi();
    if (content.querySelector('#cache-usage-size')) {
        settingsInstance.cacheStatsInterval = setInterval(refreshCacheStatsUi, 1500);
    }
}

function generateMapLayerVisibilitySettings(settingsInstance, container, options = {}) {
    const { showOpenInWindowButton = true } = options;

    container.innerHTML = '';

    const mapInstance = window.mapInstance;
    const mapObject = mapInstance?.map;
    const visibilityObjects = buildMapLayerVisibilityObjects(mapObject, 'main');

    if (showOpenInWindowButton) {
        const openControl = document.createElement('div');
        openControl.style.cssText = 'display: flex; flex-direction: row; justify-content: flex-end; margin: 10px;';
        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.style.cssText = 'width: auto; font-size: 1em; padding: 10px;';
        openButton.innerHTML = '<i class="ti ti-external-link" style="margin-right: 5px; font-size: 1.5em;"></i> Pop out editor';
        openButton.addEventListener('click', () => openMapSettingsInWindow(settingsInstance));
        openControl.appendChild(openButton);

        container.appendChild(openControl);
    }

    // Create background style selector
    const backgroundControl = document.createElement('div');
    backgroundControl.className = 'settings-control';
    backgroundControl.style.marginBottom = '20px';
    
    const backgroundHeader = document.createElement('div');
    backgroundHeader.className = 'settings-control-header';
    
    const backgroundLabel = document.createElement('label');
    backgroundLabel.textContent = 'Map Background';
    backgroundHeader.appendChild(backgroundLabel);
    
    const backgroundSelect = document.createElement('select');
    backgroundSelect.style.width = 'auto';
    
    const defaultOption = document.createElement('option');
    defaultOption.value = 'default';
    defaultOption.textContent = 'Default';
    backgroundSelect.appendChild(defaultOption);
    
    const satelliteOption = document.createElement('option');
    satelliteOption.value = 'satellite';
    satelliteOption.textContent = 'Satellite';
    backgroundSelect.appendChild(satelliteOption);
    
    const currentBackground = settingsInstance.getSetting('mapBackgroundStyle') || 'default';
    backgroundSelect.value = currentBackground;
    
    backgroundSelect.addEventListener('change', () => {
        settingsInstance.setSetting('mapBackgroundStyle', backgroundSelect.value);
        document.dispatchEvent(new CustomEvent('mapBackgroundStyleChanged', {
            detail: { style: backgroundSelect.value }
        }));
    });
    
    backgroundHeader.appendChild(backgroundSelect);
    backgroundControl.appendChild(backgroundHeader);
    
    const backgroundHelp = document.createElement('p');
    backgroundHelp.className = 'settings-control-help';
    backgroundHelp.textContent = 'Choose between a solid color or satellite imagery.';
    backgroundControl.appendChild(backgroundHelp);
    
    container.appendChild(backgroundControl);

    if (visibilityObjects.length === 0) {
        const unavailable = document.createElement('p');
        unavailable.className = 'settings-control-help';
        unavailable.textContent = 'Map style layers are not available yet. Open this section again after the map loads.';
        container.appendChild(unavailable);
        return;
    }

    const currentVisibility = settingsInstance.getSetting('mapLayerVisibility') || {};
    const currentStyles = settingsInstance.getSetting('mapLayerStyles') || {};

    const grouped = visibilityObjects.filter((item) => item.grouped);
    grouped.forEach((item) => {
        container.appendChild(createMapLayerVisibilityControl(item, currentVisibility, currentStyles, settingsInstance));
    });

    const singles = visibilityObjects.filter((item) => !item.grouped);
    // Ignore extranneous layers
}

function openMapSettingsInWindow(settingsInstance) {
    const mapWindow = new Window({
        title: 'Map Layer Settings',
        icon: 'settings',
        width: 860,
        height: 620,
        html: '<div class="map-settings-window-content" style="display: flex; flex-direction: column; height: 100%; overflow: auto; padding: 10px; color: white;"></div>'
    });

    const content = mapWindow.content.querySelector('.map-settings-window-content');
    if (!content) {
        return;
    }

    // Close setting menu
    const settingsCloser = document.querySelector('.settings-header-close');
    if (settingsCloser) {
        settingsCloser.click();
    }

    generateMapLayerVisibilitySettings(settingsInstance, content, { showOpenInWindowButton: false });
}

function createMapLayerVisibilityControl(item, currentVisibility, currentStyles, settingsInstance) {
    const control = document.createElement('div');
    control.className = 'settings-control alert-setting-control';

    const topRow = document.createElement('div');
    topRow.className = 'alert-setting-top';

    const title = document.createElement('div');
    title.className = 'alert-setting-title';
    title.textContent = item.label;
    topRow.appendChild(title);

    const topControls = document.createElement('div');
    topControls.className = 'alert-setting-top-controls';

    const visibilityGroup = document.createElement('div');
    visibilityGroup.className = 'alert-setting-group';

    const visibilityLabel = document.createElement('span');
    visibilityLabel.className = 'alert-setting-group-label';
    visibilityLabel.textContent = 'Visible';
    visibilityGroup.appendChild(visibilityLabel);

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'switch';
    toggle.checked = currentVisibility[item.key] !== false;
    visibilityGroup.appendChild(toggle);

    topControls.appendChild(visibilityGroup);

    toggle.addEventListener('change', () => {
        const existing = settingsInstance.getSetting('mapLayerVisibility') || {};
        settingsInstance.setSetting('mapLayerVisibility', {
            ...existing,
            [item.key]: toggle.checked
        });
    });

    const styleValues = currentStyles[item.key] || {};
    let bottomRow = null;

    if (item.grouped && Array.isArray(item.customizable)) {
        const styleControls = [];

        item.customizable.forEach((property) => {
            if (property === 'visibility') {
                return;
            }

            const controlInput = createMapLayerPropertyInput(property, styleValues[property], (value) => {
                const existing = settingsInstance.getSetting('mapLayerStyles') || {};
                const existingGroup = existing[item.key] || {};

                settingsInstance.setSetting('mapLayerStyles', {
                    ...existing,
                    [item.key]: {
                        ...existingGroup,
                        [property]: value
                    }
                });
            });

            if (controlInput) {
                styleControls.push(controlInput);
            }
        });

        if (styleControls.length > 0) {
            const topStyleControls = styleControls
            topStyleControls.forEach((styleControl) => {
                topControls.appendChild(styleControl);
            });
        }
    }

    topRow.appendChild(topControls);
    control.appendChild(topRow);

    if (!item.grouped) {
        const help = document.createElement('p');
        help.className = 'settings-control-help';
        help.textContent = item.layerIds[0];
        control.appendChild(help);
    }

    return control;
}

function createMapLayerPropertyInput(property, currentValue, onChange) {
    const wrapper = document.createElement('div');
    wrapper.className = 'alert-setting-group';

    const text = document.createElement('span');
    text.className = 'alert-setting-group-label';
    text.textContent = property.replace('fill', 'color').replace('stroke', 'border').replace(/-/g, ' ');
    wrapper.appendChild(text);

    let input = null;

    if (property === 'fill' || property === 'stroke') {
        input = document.createElement('input');
        input.type = 'color';
        input.className = 'alert-setting-color';
        input.value = typeof currentValue === 'string' && /^#([0-9a-fA-F]{6})$/.test(currentValue)
            ? currentValue
            : '#ffffff';
        input.addEventListener('input', () => onChange(input.value));
    } else if (property === 'opacity') {
        input = document.createElement('input');
        input.type = 'range';
        input.min = '0';
        input.max = '1';
        input.step = '0.01';
        input.value = Number.isFinite(Number(currentValue)) ? String(Number(currentValue)) : '1';
        input.style.width = '110px';
        input.addEventListener('input', () => onChange(Number(input.value)));
    } else if (property === 'stroke-width') {
        input = document.createElement('input');
        input.type = 'range';
        input.min = '0';
        input.max = '12';
        input.step = '0.1';
        input.value = Number.isFinite(Number(currentValue)) ? String(Number(currentValue)) : '1';
        input.style.width = '110px';
        input.addEventListener('input', () => onChange(Number(input.value)));
    } else if (property === 'font-size') {
        input = document.createElement('input');
        input.type = 'range';
        input.min = '8';
        input.max = '40';
        input.step = '1';
        input.value = Number.isFinite(Number(currentValue)) ? String(Number(currentValue)) : '14';
        input.style.width = '110px';
        input.addEventListener('input', () => onChange(Number(input.value)));
    }

    if (!input) {
        return null;
    }

    wrapper.appendChild(input);
    return wrapper;
}

function handlePaletteUpload(settingKey, settingsInstance) {
    const paletteName = paletteKeyMap[settingKey];
    if (!paletteName) {
        console.error('Unknown palette type:', settingKey);
        return;
    }

    // Create a hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pal';
    
    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const fileContent = await file.text();
            const palettes = new Palettes();
            
            // Convert the .pal file format to simplified format
            const simplifiedPalette = palettes.convertPalFileFormat(fileContent, { paletteName });
            
            // Store the palette
            palettes.storePalette(paletteName, simplifiedPalette);
            
            console.log(`Palette "${paletteName}" uploaded and stored successfully`);

            // Clear radar data cache so subsequent loads re-process with fresh palette state
            if (typeof window !== 'undefined' && window.radarInstance?.clearCache) {
                window.radarInstance.clearCache();
                new Toast('Radar cache cleared after palette update.').show();
            }
            
            // Update button background with gradient preview
            const button = document.querySelector(`[data-setting="${settingKey}"]`);
            if (button) {
                const newPalettes = new Palettes();
                const gradient = newPalettes.generateGradientCSS(paletteName);
                if (gradient) {
                    button.style.background = gradient;
                }
            }
            
            // Dispatch a custom event to notify the map/radar to reload palettes
            document.dispatchEvent(new CustomEvent('paletteUpdated', { 
                detail: { paletteName } 
            }));
            
        } catch (error) {
            console.error('Error processing palette file:', error);
        }
    });
    
    // Trigger file selection
    fileInput.click();
}

function generateSpotterNetworkSettings(container, settingsInstance) {
    const sn = window.spotterNetworkInstance;
    container.innerHTML = '';

    if (sn?.isLoggedIn) {
        const accountHeader = document.createElement('h3');
        accountHeader.textContent = 'Account';
        accountHeader.classList.add('settings-subheader');
        accountHeader.style.marginTop = '20px';
        container.appendChild(accountHeader);

        const statusControl = document.createElement('div');
        statusControl.className = 'settings-control';
        const statusHeader = document.createElement('div');
        statusHeader.className = 'settings-control-header';
        const statusLabel = document.createElement('label');
        statusLabel.textContent = 'Status';
        const statusValue = document.createElement('span');
        statusValue.className = 'settings-control-value';
        statusValue.style.color = '#4caf50';
        statusValue.textContent = `Logged in${sn.username ? ` as ${sn.username}` : ''}`;
        statusHeader.appendChild(statusLabel);
        statusHeader.appendChild(statusValue);
        statusControl.appendChild(statusHeader);
        container.appendChild(statusControl);

        const logoutControl = document.createElement('div');
        logoutControl.className = 'settings-control';
        const logoutHeader = document.createElement('div');
        logoutHeader.className = 'settings-control-header';
        const logoutLabel = document.createElement('label');
        logoutLabel.textContent = 'Log Out';
        const logoutBtn = document.createElement('input');
        logoutBtn.type = 'button';
        logoutBtn.value = 'Logout';
        logoutBtn.className = 'danger-button';
        logoutBtn.addEventListener('click', () => {
            sn.logout();
            generateSpotterNetworkSettings(container, settingsInstance);
        });
        logoutHeader.appendChild(logoutLabel);
        logoutHeader.appendChild(logoutBtn);
        logoutControl.appendChild(logoutHeader);
        const logoutHelp = document.createElement('p');
        logoutHelp.className = 'settings-control-help';
        logoutHelp.textContent = 'Delete stored Spotter Network credentials.';
        logoutControl.appendChild(logoutHelp);
        container.appendChild(logoutControl);


        const locationSettingsHeader = document.createElement('h3');
        locationSettingsHeader.textContent = 'Location Sharing';
        locationSettingsHeader.classList.add('settings-subheader');
        locationSettingsHeader.style.marginTop = '20px';
        container.appendChild(locationSettingsHeader);


        // Switch to enable/disable location sharing
        const sendLocationControl = document.createElement('div');
        sendLocationControl.className = 'settings-control';
        const sendLocationHeader = document.createElement('div');
        sendLocationHeader.className = 'settings-control-header';
        const sendLocationLabel = document.createElement('label');
        sendLocationLabel.textContent = 'Send Location';
        const sendLocationCheckbox = document.createElement('input');
        sendLocationCheckbox.type = 'checkbox';
        sendLocationCheckbox.className = 'switch';
        sendLocationCheckbox.checked = Boolean(sn.shareLocation);
        sendLocationCheckbox.addEventListener('change', () => {
            sn.setLocationSharing(sendLocationCheckbox.checked);
        });
        sendLocationHeader.appendChild(sendLocationLabel);
        sendLocationHeader.appendChild(sendLocationCheckbox);
        sendLocationControl.appendChild(sendLocationHeader);
        const sendLocationHelp = document.createElement('p');
        sendLocationHelp.className = 'settings-control-help';
        sendLocationControl.appendChild(sendLocationHelp);
        container.appendChild(sendLocationControl);

        const isLocationEnabled = () => settingsInstance?.getSetting('enableLocation') !== false;
        const syncLocationSharingControl = () => {
            const locationEnabled = isLocationEnabled();

            sendLocationCheckbox.disabled = !locationEnabled;
            sendLocationCheckbox.classList.toggle('disabled', !locationEnabled);

            if (!locationEnabled && sn.shareLocation) {
                sn.setLocationSharing(false);
            }

            sendLocationCheckbox.checked = Boolean(sn.shareLocation);

            if (locationEnabled) {
                sendLocationHelp.textContent = `Send your current location to Spotter Network. Last update: ${window.spotterNetworkInstance.lastLocationSent ? window.spotterNetworkInstance.lastLocationSent.toLocaleTimeString() : 'Never'}`;
            } else {
                sendLocationHelp.textContent = 'Cannot send a location if location services are disabled. Enable them in "General" to use this feature.';
            }
        };

        syncLocationSharingControl();

        setInterval(() => {
            syncLocationSharingControl();
        }, 1000);


        // Switch to enable high accuracy
        const highAccuracyControl = document.createElement('div');
        highAccuracyControl.className = 'settings-control';
        const highAccuracyHeader = document.createElement('div');
        highAccuracyHeader.className = 'settings-control-header';
        const highAccuracyLabel = document.createElement('label');
        highAccuracyLabel.textContent = 'High Accuracy';
        const highAccuracyCheckbox = document.createElement('input');
        highAccuracyCheckbox.type = 'checkbox';
        highAccuracyCheckbox.className = 'switch';
        highAccuracyCheckbox.checked = sn.highAccuracy;
        highAccuracyCheckbox.addEventListener('change', () => {
            sn.setHighAccuracy(highAccuracyCheckbox.checked);
        });
        highAccuracyHeader.appendChild(highAccuracyLabel);
        highAccuracyHeader.appendChild(highAccuracyCheckbox);
        highAccuracyControl.appendChild(highAccuracyHeader);
        const highAccuracyHelp = document.createElement('p');
        highAccuracyHelp.className = 'settings-control-help';
        highAccuracyHelp.textContent = 'Turn on to enable precision location reporting (lat/lon to 6 digits), or disable for coarse reporting (lat/lon to 1 digit, more privacy).';
        highAccuracyControl.appendChild(highAccuracyHelp);
        container.appendChild(highAccuracyControl);
    } else {
        const usernameControl = document.createElement('div');
        usernameControl.className = 'settings-control';
        const usernameHeader = document.createElement('div');
        usernameHeader.className = 'settings-control-header';
        const usernameLabel = document.createElement('label');
        usernameLabel.htmlFor = 'sn-username';
        usernameLabel.textContent = 'Login';
        usernameHeader.appendChild(usernameLabel);
        usernameControl.appendChild(usernameHeader);
        const usernameInput = document.createElement('input');
        usernameInput.type = 'text';
        usernameInput.id = 'sn-username';
        usernameInput.name = 'username';
        usernameInput.autocomplete = 'username';
        usernameInput.placeholder = 'Spotter Network username';
        usernameInput.classList.add('settings-input');
        usernameInput.value = sn?.username || '';
        usernameControl.appendChild(usernameInput);
        const passwordInput = document.createElement('input');
        passwordInput.type = 'password';
        passwordInput.id = 'sn-password';
        passwordInput.name = 'password';
        passwordInput.classList.add('settings-input');
        passwordInput.autocomplete = 'current-password';
        passwordInput.placeholder = 'Spotter Network password';
        usernameControl.appendChild(passwordInput);
        const loginBtn = document.createElement('input');
        loginBtn.type = 'button';
        loginBtn.value = 'Login';
        loginBtn.className = 'primary-button';
        usernameControl.appendChild(loginBtn);
        const statusMsg = document.createElement('p');
        statusMsg.className = 'settings-control-help';
        usernameControl.appendChild(statusMsg);
        container.appendChild(usernameControl);

        const handleLogin = async () => {
            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            if (!username || !password) {
                statusMsg.textContent = 'Please enter both username and password.';
                statusMsg.style.color = '#ff2121';
                return;
            }
            loginBtn.disabled = true;
            loginBtn.value = 'Logging in\u2026';
            statusMsg.textContent = '';
            statusMsg.style.color = '';
            const success = await sn?.login(username, password);
            if (success) {
                generateSpotterNetworkSettings(container, settingsInstance);
            } else {
                loginBtn.disabled = false;
                loginBtn.value = 'Login';
                statusMsg.textContent = 'Login failed. Check your credentials and try again.';
                statusMsg.style.color = '#ff2121';
            }
        };

        loginBtn.addEventListener('click', handleLogin);
        passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
    }
}

function generateAlertSettings(settingsInstance, container) {
    container.innerHTML = '';

    const flashingSubheader = document.createElement('h3');
    flashingSubheader.textContent = 'Flashing';
    flashingSubheader.classList.add('settings-subheader');
    container.append(flashingSubheader);

    const flashControl = document.createElement('div');
    flashControl.className = 'settings-control alert-setting-control';

    const flashHeader = document.createElement('div');
    flashHeader.className = 'settings-control-header';

    const flashLabel = document.createElement('label');
    flashLabel.htmlFor = 'alerts-flash-newly-issued';
    flashLabel.textContent = 'Flash newly issued alerts';

    const flashToggle = document.createElement('input');
    flashToggle.type = 'checkbox';
    flashToggle.id = 'alerts-flash-newly-issued';
    flashToggle.className = 'switch';
    flashToggle.checked = settingsInstance.getSetting('alertFlashNewlyIssued') !== false;
    flashToggle.addEventListener('change', () => {
        settingsInstance.setSetting('alertFlashNewlyIssued', flashToggle.checked);
    });

    flashHeader.appendChild(flashLabel);
    flashHeader.appendChild(flashToggle);
    flashControl.appendChild(flashHeader);

    const flashHelp = document.createElement('p');
    flashHelp.className = 'settings-control-help';
    flashHelp.textContent = 'Flash new or updated alert polygons.';
    flashControl.appendChild(flashHelp);

    container.appendChild(flashControl);

    const flashTime = document.createElement('div');
    flashTime.className = 'settings-control alert-setting-control';

    const flashTimeHeader = document.createElement('div');
    flashTimeHeader.className = 'settings-control-header';

    const flashTimeLabel = document.createElement('label');
    flashTimeLabel.htmlFor = 'alerts-flash-newly-issued-time';
    flashTimeLabel.textContent = 'Flash for';

    const flashTimeToggle = document.createElement('select');
    flashTimeToggle.id = 'alerts-flash-newly-issued-time';
    flashTimeToggle.innerHTML = 
    `<option value="10">10 seconds</option>
    <option value="30">30 seconds</option>
    <option value="60">60 seconds</option>`;
    flashTimeToggle.value = String(settingsInstance.getSetting('alertFlashNewlyIssuedTime', 60));
    flashTimeToggle.addEventListener('change', () => {
        settingsInstance.setSetting('alertFlashNewlyIssuedTime', Number(flashTimeToggle.value));
    });

    flashTimeHeader.appendChild(flashTimeLabel);
    flashTimeHeader.appendChild(flashTimeToggle);
    flashTime.appendChild(flashTimeHeader);

    const flashTimeHelp = document.createElement('p');
    flashTimeHelp.className = 'settings-control-help';
    flashTimeHelp.textContent = 'Alerts are considered "new" or "updated" for this duration after the issued time.';
    flashTime.appendChild(flashTimeHelp);

    container.appendChild(flashTime);

    const colorSubheader = document.createElement('h3');
    colorSubheader.textContent = 'Alert Colors';
    colorSubheader.classList.add('settings-subheader');
    colorSubheader.style.marginBottom = '0px';
    container.append(colorSubheader);

    ALERT_CATEGORIES.forEach((categoryConfig) => {
        const { name: category, alerts, visualOnly } = categoryConfig;

        // Create category header
        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'alert-category-header';
        categoryHeader.textContent = category;
        container.appendChild(categoryHeader);

        // Create alert items in this category
        alerts.forEach((alertConfig) => {
            const alertType = alertConfig.type;
            const settingKey = buildAlertSettingKey(alertType);
            const alertSettings = settingsInstance.getSetting(settingKey);
            
            if (!alertSettings) return;

            const control = document.createElement('div');
            control.className = 'settings-control alert-setting-control';
            
            const topRow = document.createElement('div');
            topRow.className = 'alert-setting-top';

            const title = document.createElement('div');
            title.className = 'alert-setting-title';
            title.textContent = alertType;
            topRow.appendChild(title);

            const topControls = document.createElement('div');
            topControls.className = 'alert-setting-top-controls';

            const createControlGroup = (text) => {
                const group = document.createElement('div');
                group.className = 'alert-setting-group';

                const groupLabel = document.createElement('span');
                groupLabel.className = 'alert-setting-group-label';
                groupLabel.textContent = text;
                group.appendChild(groupLabel);

                return group;
            };
            
            // Visual-only categories show color picker only
            const isVisualCategory = visualOnly;
            
            if (!isVisualCategory) {
                // Checkbox for enabled/disabled
                const enableCheckbox = document.createElement('input');
                enableCheckbox.type = 'checkbox';
                enableCheckbox.className = 'switch';
                enableCheckbox.id = `${settingKey}-enabled`;
                enableCheckbox.title = `Enable or disable ${alertType}s`;
                enableCheckbox.checked = alertSettings.enabled;
                enableCheckbox.addEventListener('change', () => {
                    const current = settingsInstance.getSetting(settingKey);
                    settingsInstance.setSetting(settingKey, { ...current, enabled: enableCheckbox.checked });
                });

                const enabledGroup = createControlGroup('Show on map');
                enabledGroup.appendChild(enableCheckbox);
                topControls.appendChild(enabledGroup);
            }

            const colorGroup = createControlGroup('Color');
            
            // Color picker
            const alertColor = document.createElement('input');
            alertColor.type = 'color';
            alertColor.id = `${settingKey}-color`;
            alertColor.value = alertSettings.color || alertConfig.color;
            alertColor.title = `Set the color for ${alertType} on the radar`;
            alertColor.className = 'alert-setting-color';
            alertColor.addEventListener('input', () => {
                const current = settingsInstance.getSetting(settingKey);
                settingsInstance.setSetting(settingKey, { ...current, color: alertColor.value });
            });
            colorGroup.appendChild(alertColor);
            topControls.appendChild(colorGroup);

            topRow.appendChild(topControls);
            control.appendChild(topRow);

            if (!isVisualCategory) {
                const bottomRow = document.createElement('div');
                bottomRow.className = 'alert-setting-bottom';
                bottomRow.style.maxWidth = '100%';

                // Notification toggle
                const notifyCheckbox = document.createElement('input');
                notifyCheckbox.type = 'checkbox';
                notifyCheckbox.id = `${settingKey}-notify`;
                notifyCheckbox.checked = alertSettings.notify;
                notifyCheckbox.title = `Send notifications when a new ${alertType} is issued`;
                notifyCheckbox.classList.add('switch');
                notifyCheckbox.addEventListener('change', () => {
                    const current = settingsInstance.getSetting(settingKey);
                    settingsInstance.setSetting(settingKey, { ...current, notify: notifyCheckbox.checked });
                });

                const notificationGroup = createControlGroup('Notifications');
                notificationGroup.appendChild(notifyCheckbox);
                bottomRow.appendChild(notificationGroup);

                // Notification sound picker
                const soundSelect = document.createElement('select');
                soundSelect.id = `${settingKey}-sound`;
                soundSelect.title = `Select notification sound for new ${alertType}s`;
                soundSelect.className = 'alert-setting-sound';
                const sounds = [
                    { name: 'Silent', value: 'none' },
                    { name: 'Default', value: 'warning.mp3' },
                    { name: 'Alert', value: 'alert.mp3' },
                    { name: 'Beep', value: 'singlebeep.mp3' },
                    { name: 'Double Beep', value: 'doublebeep.mp3' },
                    { name: 'EAS Tone', value: 'eas.mp3' },
                    { name: 'Max Velocity', value: 'maxvelocity.mp3' },
                    { name: 'Ryan Hall - Tornado Emergency', value: 'ryanhall_tore.mp3' },
                    { name: 'Ryan Hall - PDS Tornado Warning', value: 'ryanhall_pdstor.mp3' },
                    { name: 'Ryan Hall - Tornado Warning', value: 'ryanhall_tor.mp3' },
                    { name: 'Ryan Hall - Severe Thunderstorm Warning', value: 'ryanhall_svr.mp3' },
                ];
                sounds.forEach((sound) => {
                    const option = document.createElement('option');
                    option.value = sound.value;
                    option.textContent = sound.name;
                    if (alertSettings.sound === sound.value) {
                        option.selected = true;
                    }
                    soundSelect.appendChild(option);
                });
                soundSelect.addEventListener('change', () => {
                    const current = settingsInstance.getSetting(settingKey);
                    settingsInstance.setSetting(settingKey, { ...current, sound: soundSelect.value });
                });

                const previewButton = document.createElement('button');
                previewButton.type = 'button';
                previewButton.className = 'alert-setting-preview';
                previewButton.innerHTML = '<i class="ti ti-volume"></i>';
                previewButton.title = `Preview selected sound for ${alertType}`;
                previewButton.addEventListener('click', () => {
                    previewNotificationSound(soundSelect.value);
                });

                const soundGroup = createControlGroup('Sound');
                soundGroup.appendChild(soundSelect);
                soundGroup.appendChild(previewButton);
                bottomRow.appendChild(soundGroup);

                control.appendChild(bottomRow);
            }

            container.appendChild(control);
        });
    });
}

export default class Settings {
    constructor() {
        // Generate default alert settings from ALERT_TYPE_DEFAULTS
        const alertDefaults = {};
        Object.entries(ALERT_TYPE_DEFAULTS).forEach(([alertType, colors]) => {
            const key = buildAlertSettingKey(alertType);
            alertDefaults[key] = {
                enabled: true,
                notify: true,
                color: colors.color
            };
        });

        this.defaults = {
            showToolbar: true,
            showProductPicker: true,
            showTimeAndTilt: true,
            enableLocation: false,
            alertDetailsAppearIn: 'dialogs',
            weatherTempUnit: 'F',
            weatherPressureUnit: 'MB',
            weatherWindUnit: 'MPH',
            weatherPrecipUnit: 'IN',
            weatherDistanceUnit: 'MI',
            reflectivityGateFilter: -10,
            enableSplitCursorMarker: true,
            enableRightClickMenu: true,
            vcpDisplayFormat: 'descriptive',
            cacheMaxSlots: 24,
            cacheMaxSizeGB: 1,
            animationFrameCount: 6,
            animationSpeed: 0.5,
            primaryColor: '#27beff',
            secondaryColor: '#2a7fff',
            borderColor: '#808080',
            secondaryBorderColor: '#27beff',
            roundness: 10,
            mapLayerVisibility: {},
            mapLayerStyles: {},
            mapBackgroundStyle: 'default',
            enableErrorNotifications: false,
            alertFlashNewlyIssued: true,
            alertFlashNewlyIssuedTime: 60,
            shortcutToggleSplitView: 'm',
            shortcutToggleCrossSection: 'x',
            shortcutShowRadarStatus: 's',
            shortcutShowMenu: 'h',
            shortcutShowLayerMenu: 'l',
            shortcutDraw: 'd',
            shortcutFinder: 'f',
            shortcutInspector: 'i',
            shortcutMeasure: 'n',
            shortcutProductReflectivity: '1',
            shortcutProductVelocity: '2',
            shortcutProductCorrelationCoefficient: '3',
            shortcutProductHydrometeorClassification: '4',
            shortcutProductSpecificDifferentialPhase: '5',
            ...alertDefaults
        };

        this.settings = {
            ...this.defaults,
            ...this.loadSettings(),
        };

        this._normalizeSettings();

        this.applyThemeColors();
    }

    loadSettings() {
        try {
            const stored = localStorage.getItem('settings');
            const parsed = stored ? JSON.parse(stored) : {};
            Object.entries(parsed).forEach(([key, value]) => {
                if (!key.startsWith('alert_')) return;
                if (!value || typeof value !== 'object') return;
                if (!value.color && (value.fillColor || value.borderColor)) {
                    value.color = value.fillColor || value.borderColor;
                }
                if (Object.prototype.hasOwnProperty.call(value, 'fillColor')) {
                    delete value.fillColor;
                }
                if (Object.prototype.hasOwnProperty.call(value, 'borderColor')) {
                    delete value.borderColor;
                }
            });
            if (typeof parsed.radarOpacity === 'number' && typeof parsed.reflectivityGateFilter === 'undefined') {
                parsed.reflectivityGateFilter = parsed.radarOpacity;
                delete parsed.radarOpacity;
            }

            if (!parsed.mapLayerStyles || typeof parsed.mapLayerStyles !== 'object') {
                parsed.mapLayerStyles = {};
            }

            if (typeof parsed.mapLandFillColor === 'string' && parsed.mapLandFillColor) {
                const existingLandStyles = parsed.mapLayerStyles['group:land'] || {};
                parsed.mapLayerStyles['group:land'] = {
                    ...existingLandStyles,
                    fill: parsed.mapLandFillColor
                };
                delete parsed.mapLandFillColor;
            }
            return parsed;
        } catch (error) {
            return {};
        }
    }

    saveSettings() {
        localStorage.setItem('settings', JSON.stringify(this.settings));
    }

    setSetting(key, value) {
        this.settings[key] = value;
        this.saveSettings();
        this.applyThemeColors();
        document.dispatchEvent(new CustomEvent('settingsChanged', { detail: { key, value } }));

        // Some settings may show a toast notification when changed
        if (key === 'enableSplitCursorMarker') {
            new Toast('If split screen is currently open, close and reopen it to apply changes.').show();
        }
    }

    getSetting(key, fallbackValue = undefined) {
        const value = this.settings[key];
        return typeof value === 'undefined' ? fallbackValue : value;
    }

    getMapTileSource() {
        const style = this.getSetting('mapBackgroundStyle');
        const key = import.meta.env.VITE_ESRI_KEY;

        if (style === 'satellite' && key) {
            return {
                imagery: {
                    type: 'raster',
                    tiles: [`https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${key}`]
                }
            };
        }

        return null;
    }

    resetSettings() {
        const confirmReset = new Modal("Confirm Reset Settings", "Are you sure you want to reset all settings, including color palettes and customizations, to defaults?", [
            { text: "Cancel", className: "secondary-button", click: (modal) => modal.close() },
            { text: "Reset", className: "danger-button", click: (modal) => {
                modal.close();
                this._performReset();
            } }
        ]);
        confirmReset.open();
    }

    exportSettings() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.settings, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        const dateStr = new Date().toISOString().split('T')[0];
        downloadAnchor.setAttribute("download", `sparkradar_settings_${dateStr}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        document.body.removeChild(downloadAnchor);
    }

    importSettings(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedSettings = JSON.parse(event.target.result);
                if (typeof importedSettings !== 'object' || importedSettings === null) {
                    throw new Error('Invalid settings format');
                }
                this.settings = { ...this.defaults, ...importedSettings };
                this._normalizeSettings();
                this.saveSettings();
                this.applyThemeColors();
                document.dispatchEvent(new CustomEvent('settingsChanged', { detail: { key: 'all', value: this.settings } }));
                window.location.reload();
            } catch (error) {
                new Toast('Failed to import settings: ' + error.message).show();
            }
        };
        reader.readAsText(file);
    }

    _performReset() {
        localStorage.removeItem('settings');
        document.dispatchEvent(new CustomEvent('settingsReset'));
        const resetDone = new Modal("Settings Reset", "Settings reset successfully. Click OK to reload the page.", [
            { text: "OK", className: "primary-button", click: (modal) => {
                modal.close();
                window.location.reload();
            } }
        ]);
        resetDone.open();
    }

    applyThemeColors() {
        const root = document.documentElement;
        if (!root) return;

        const primary = this.settings.primaryColor || this.defaults.primaryColor;
        const secondary = this.settings.secondaryColor || this.defaults.secondaryColor;
        const border = this.settings.borderColor || this.defaults.borderColor;
        const secondaryBorder = this.settings.secondaryBorderColor || this.defaults.secondaryBorderColor;
        const roundness = Number.isFinite(Number(this.settings.roundness))
            ? Number(this.settings.roundness)
            : this.defaults.roundness;

        root.style.setProperty('--primary-color', primary);
        root.style.setProperty('--secondary-color', secondary);
        root.style.setProperty('--border-color', border);
        root.style.setProperty('--secondary-border-color', this._withAlpha(secondaryBorder, 0.2));
        root.style.setProperty('--roundness', `${roundness}px`);
    }

    _normalizeSettings() {
        const alertDetailsAppearIn = this.settings.alertDetailsAppearIn;
        if (alertDetailsAppearIn !== 'dialogs' && alertDetailsAppearIn !== 'windows') {
            this.settings.alertDetailsAppearIn = 'dialogs';
        }

        const weatherUnitDefaults = {
            weatherTempUnit: ['F', 'C', 'K'],
            weatherPressureUnit: ['MB', 'INHG', 'MMHG'],
            weatherWindUnit: ['MPH', 'KPH'],
            weatherPrecipUnit: ['IN', 'MM'],
            weatherDistanceUnit: ['MI', 'KM']
        };

        Object.entries(weatherUnitDefaults).forEach(([key, allowedValues]) => {
            if (!allowedValues.includes(this.settings[key])) {
                this.settings[key] = this.defaults[key];
            }
        });

        this.settings.enableErrorNotifications = this.settings.enableErrorNotifications !== false;
        this.settings.alertFlashNewlyIssued = this.settings.alertFlashNewlyIssued !== false;

        const flashNewlyIssuedSeconds = Number(this.settings.alertFlashNewlyIssuedTime);
        if (![10, 30, 60].includes(flashNewlyIssuedSeconds)) {
            this.settings.alertFlashNewlyIssuedTime = 60;
        } else {
            this.settings.alertFlashNewlyIssuedTime = flashNewlyIssuedSeconds;
        }

        const cacheSlots = Number(this.settings.cacheMaxSlots);
        const effectiveMax = Number.isFinite(cacheSlots) ? Math.max(3, Math.round(cacheSlots)) : 40;

        const animationFrames = Number(this.settings.animationFrameCount);
        if (!Number.isFinite(animationFrames)) {
            this.settings.animationFrameCount = Math.min(15, effectiveMax);
        } else {
            this.settings.animationFrameCount = Math.max(3, Math.min(effectiveMax, Math.round(animationFrames)));
        }

        const animationSpeed = Number(this.settings.animationSpeed);
        if (!Number.isFinite(animationSpeed)) {
            this.settings.animationSpeed = this.defaults.animationSpeed;
        } else {
            this.settings.animationSpeed = Math.max(0.1, Math.min(2, animationSpeed));
        }

        const roundness = Number(this.settings.roundness);
        if (!Number.isFinite(roundness)) {
            this.settings.roundness = this.defaults.roundness;
        } else {
            this.settings.roundness = Math.max(0, Math.min(50, Math.round(roundness)));
        }
    }

    _withAlpha(hexColor, alpha) {
        if (typeof hexColor !== 'string') return `rgba(39, 190, 255, ${alpha})`;
        const trimmed = hexColor.trim();
        const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
        if (![3, 6].includes(hex.length)) {
            return `rgba(39, 190, 255, ${alpha})`;
        }

        const fullHex = hex.length === 3
            ? hex.split('').map((ch) => ch + ch).join('')
            : hex;

        const r = parseInt(fullHex.slice(0, 2), 16);
        const g = parseInt(fullHex.slice(2, 4), 16);
        const b = parseInt(fullHex.slice(4, 6), 16);

        if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
            return `rgba(39, 190, 255, ${alpha})`;
        }

        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    showSettingsMenu() {
        this.menu = document.createElement('div');
        this.menu.id = 'settings-menu';
        this.menu.classList.add('menu-hidden');

        // Create wrapper for styling
        const wrapper = document.createElement('div');
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.innerHTML = settingsHTML;
        this.menu.appendChild(wrapper);

        document.body.appendChild(this.menu);

        // Trigger animation by removing menu-hidden on next frame
        requestAnimationFrame(() => {
            this.menu.classList.remove('menu-hidden');
            // Initialize settings functionality
            initSettings(this);
        });

        // Remove the menu if esc is pressed
        this.escListener = (event) => {
            if (event.key === 'Escape') {
                this.closeSettings();
            }
        };
        document.addEventListener('keydown', this.escListener);
    }

    closeSettings() {
        stopActivePreviewAudio();

        if (this.cacheStatsInterval) {
            clearInterval(this.cacheStatsInterval);
            this.cacheStatsInterval = null;
        }
        this.menu.classList.add('menu-hidden');
        document.removeEventListener('keydown', this.escListener);
        setTimeout(() => {
            document.body.removeChild(this.menu);
        }, 300);
    }
}

export { buildAlertDefaults };