export function getCurrentSetting(key, fallbackValue) {
    if (typeof key !== 'string' || key.length === 0) {
        return fallbackValue;
    }

    if (typeof window !== 'undefined' && window.settingsInstance?.getSetting) {
        const liveValue = window.settingsInstance.getSetting(key, fallbackValue);
        return typeof liveValue === 'undefined' ? fallbackValue : liveValue;
    }

    try {
        const rawSettings = localStorage.getItem('settings');
        if (!rawSettings) {
            return fallbackValue;
        }

        const parsedSettings = JSON.parse(rawSettings);
        if (typeof parsedSettings?.[key] === 'undefined') {
            return fallbackValue;
        }

        return parsedSettings[key];
    } catch {
        return fallbackValue;
    }
}
