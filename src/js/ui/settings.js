import settingsHTML from '../../components/settings.html?raw';
import Palettes from '../palettes.js';
import Toast from './toast.js';

// TODO: Alert color defaults dont work

// Mapping of setting keys to palette names
const paletteKeyMap = {
    uploadPaletteRef: 'REF',
    uploadPaletteVel: 'VEL',
    uploadPaletteCC: 'CC',
    uploadPaletteZDR: 'ZDR',
    uploadPaletteKDP: 'KDP',
    uploadPaletteSW: 'SW',
    uploadPaletteDHC: 'DHC'
};

// Alert type configurations organized by category
const ALERT_CATEGORIES = {
    'Severe': {
        "Tornado Emergency": { color: '#ae21ff' },
        "PDS Tornado Warning": { color: '#ff00ff' },
        "Tornado Warning": { color: '#ff2121' },
        "Severe Thunderstorm Warning": { color: '#ff9900' },
        "Special Weather Statement": { color: '#facc15' }
    },
    'Flood': {
        "Flash Flood Emergency": { color: '#1ed400' },
        "Flash Flood Warning": { color: '#38f852' },
        "Flash Flood Watch": { color: '#27bd3b' },
        "Flood Warning": { color: '#27beff' },
    },
    'Marine': {
        "Special Marine Warning": { color: '#1406d4' },
        "Marine Weather Statement": { color: '#06b6d4' },
    },
    'Seismic': {
        "Tsunami Warning": { color: '#00b418' },
        "Earthquake Warning": { color: '#b40000' },
        "Volcano Warning": { color: '#ff8800' }
    },
    'Winter': {
        "Avalanche Warning": { color: '#d52dff' },
        "Avalanche Watch": { color: '#b23acf' },
        "Snow Squall Warning": { color: '#00d4ff' }
    },
    'Miscellaneous': {
        "Extreme Wind Warning": { color: '#ff00ff' },
        "Shelter in Place Warning": { color: '#f700ff' },
        "Dust Storm Warning": { color: '#c76531' }
    },
    'Watches': {
        "Tornado Watch": { color: '#ff2121' },
        "Severe Thunderstorm Watch": { color: '#ff9900' }
    },
    'Products': {
        "Mesoscale Discussion": { color: '#000000' }
    }
};

// Flatten alert defaults for backward compatibility
function buildAlertDefaults() {
    const defaults = {};
    Object.values(ALERT_CATEGORIES).forEach(category => {
        Object.assign(defaults, category);
    });
    return defaults;
}

const ALERT_TYPE_DEFAULTS = buildAlertDefaults();


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
                    bindSectionControls(settingsInstance, content);
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

function generateAlertSettings(settingsInstance, container) {
    container.innerHTML = '';

    Object.entries(ALERT_CATEGORIES).forEach(([category, alerts]) => {
        // Create category header
        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'alert-category-header';
        categoryHeader.style.fontSize = '1.1em';
        categoryHeader.style.fontWeight = 'bold';
        categoryHeader.style.marginTop = '15px';
        categoryHeader.style.color = 'var(--primary-color)';
        categoryHeader.textContent = category;
        container.appendChild(categoryHeader);

        // Create alert items in this category
        Object.entries(alerts).forEach(([alertType, defaultColors]) => {
            const settingKey = `alert_${alertType.replace(/\s+/g, '_').toLowerCase()}`;
            const alertSettings = settingsInstance.getSetting(settingKey);
            
            if (!alertSettings) return;

            const control = document.createElement('div');
            control.className = 'settings-control';
            control.style.padding = '10px';
            
            const header = document.createElement('div');
            header.className = 'settings-control-header';
            header.style.gap = '10px';
            
            // For "Watches" and "Products" categories, only show color picker (no enabled/notify toggles)
            const isVisualCategory = category === 'Watches' || category === 'Products';
            
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
                header.appendChild(enableCheckbox);
            }
            
            // Label
            const label = document.createElement('label');
            label.htmlFor = isVisualCategory ? `${settingKey}-color` : `${settingKey}-enabled`;
            label.style.flex = '1';
            label.textContent = alertType;
            header.appendChild(label);
            
            if (!isVisualCategory) {
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
                header.appendChild(notifyCheckbox);
            }
            
            // Color picker
            const alertColor = document.createElement('input');
            alertColor.type = 'color';
            alertColor.id = `${settingKey}-color`;
            alertColor.value = alertSettings.color || defaultColors.color;
            alertColor.title = `Set the color for ${alertType} on the radar`;
            alertColor.style.width = '40px';
            alertColor.style.height = '32px';
            alertColor.addEventListener('input', () => {
                const current = settingsInstance.getSetting(settingKey);
                settingsInstance.setSetting(settingKey, { ...current, color: alertColor.value });
            });
            header.appendChild(alertColor);
            
            control.appendChild(header);
            container.appendChild(control);
        });
    });
}

export default class Settings {
    constructor() {
        // Generate default alert settings from ALERT_TYPE_DEFAULTS
        const alertDefaults = {};
        Object.entries(ALERT_TYPE_DEFAULTS).forEach(([alertType, colors]) => {
            const key = `alert_${alertType.replace(/\s+/g, '_').toLowerCase()}`;
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
            reflectivityGateFilter: -10,
            enableSplitCursorMarker: true,
            vcpDisplayFormat: 'descriptive',
            cacheMaxSlots: 12,
            cacheMaxSizeGB: 0.5,
            animationFrameCount: 15,
            primaryColor: '#27beff',
            secondaryColor: '#2a7fff',
            borderColor: '#808080',
            secondaryBorderColor: '#27beff',
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

    getSetting(key) {
        return this.settings[key];
    }

    resetSettings() {
        localStorage.removeItem('settings');
        document.dispatchEvent(new CustomEvent('settingsReset'));
        alert('Settings have been reset to default values.');
        window.location.reload();
    }

    applyThemeColors() {
        const root = document.documentElement;
        if (!root) return;

        const primary = this.settings.primaryColor || this.defaults.primaryColor;
        const secondary = this.settings.secondaryColor || this.defaults.secondaryColor;
        const border = this.settings.borderColor || this.defaults.borderColor;
        const secondaryBorder = this.settings.secondaryBorderColor || this.defaults.secondaryBorderColor;

        root.style.setProperty('--primary-color', primary);
        root.style.setProperty('--secondary-color', secondary);
        root.style.setProperty('--border-color', border);
        root.style.setProperty('--secondary-border-color', this._withAlpha(secondaryBorder, 0.2));
    }

    _normalizeSettings() {
        const cacheSlots = Number(this.settings.cacheMaxSlots);
        const effectiveMax = Number.isFinite(cacheSlots) ? Math.max(3, Math.round(cacheSlots)) : 40;

        const animationFrames = Number(this.settings.animationFrameCount);
        if (!Number.isFinite(animationFrames)) {
            this.settings.animationFrameCount = Math.min(15, effectiveMax);
            return;
        }

        this.settings.animationFrameCount = Math.max(3, Math.min(effectiveMax, Math.round(animationFrames)));
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