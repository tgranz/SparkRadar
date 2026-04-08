import { buildAlertDefaults } from "../app/settings/settings.js";


export function getAlertSettings(alertName) {
    try {
        // Convert alert name to settings key format
        // e.g., "Severe Thunderstorm Warning" -> "alert_severe_thunderstorm_warning"
        const settingKey = `alert_${alertName.replace(/\s+/g, '_').toLowerCase()}`;
        
        // Try to get from localStorage settings
        const storedSettings = localStorage.getItem('settings');
        if (storedSettings) {
            const parsed = JSON.parse(storedSettings);
            if (parsed[settingKey]) {
                const value = parsed[settingKey];
                if (value && typeof value === 'object') {
                    if (!value.color && (value.fillColor || value.borderColor)) {
                        value.color = value.fillColor || value.borderColor;
                    }
                    return value;
                }
                return parsed[settingKey];
            }
        }

        const defaults = buildAlertDefaults();
        
        // Return defaults if not found
        return {
            enabled: true,
            notify: true,
            color: defaults[alertName]?.color || null
        };
    } catch (error) {
        return { enabled: true, notify: true, color: null };
    }
}

export function renderAlert(alert) {
    const name = alert?.productName?.toLowerCase() || null;
    let icon = 'alert-triangle';

    // Find the icon
    if (name.includes('tornado')) icon = 'tornado';
    else if (name.includes('severe thunderstorm')) icon = 'bolt';
    else if (name.includes('flash flood')) icon = 'ripple';
    else if (name.includes('flood')) icon = 'ripple';
    else if (name.includes('winter') || name.includes('blizzard') || name.includes('snow')) icon = 'snowflake';
    else if (name.includes('wind')) icon = 'wind';
    else if (name.includes('tsunami') || name.includes('marine') || name.includes('lakeshore')) icon = 'ripple';
    else if (name.includes('coastal') || name.includes('storm surge')) icon = 'ripple';
    else if (name.includes('hurricane') || name.includes('tropical') || name.includes('typhoon')) icon = 'storm';
    else icon = 'alert-triangle';

    // Check props
    const messages = alert?.message.split('#####') || [];

    const alertMessage = alert?.message || "";
    const latestAlertMessage = messages[0] || alertMessage;
    const _is_destructive = latestAlertMessage.toLowerCase().includes('destructive') || latestAlertMessage.toLowerCase().includes('catastrophic') || false;
    const _is_consid = !_is_destructive && latestAlertMessage.toLowerCase().includes('considerable') || false;
    const is_emergency = latestAlertMessage.includes('TORNADO EMERGENCY') || latestAlertMessage.includes('FLASH FLOOD EMERGENCY') || false;
    const is_pds = latestAlertMessage.toLowerCase().includes('particularly dangerous situation') || false;
    const damagelevel = _is_destructive ? 'destructive' : _is_consid ? 'considerable' : 'normal';
    const hailMatch = latestAlertMessage.match(/max hail size...(.*?)\n/i);
    const maxHailSize = hailMatch ? hailMatch[1].trim() : null;
    const windMatch = latestAlertMessage.match(/max wind gust\.\.\.(.*?)(\r?\n|$)/i);
    const maxWindGust = windMatch ? windMatch[1].trim() : null;
    const is_confirmed_tor = latestAlertMessage.includes('TORNADO...OBSERVED') || false;
    const is_test = latestAlertMessage.includes('TEST') || false;

    // Store original product name for settings lookup
    const originalProductName = alert?.productName.replace(/(CONSIDERABLE|DESTRUCTIVE|CATASTROPHIC)/gi, '').trim() || "Unknown Alert";

    // Now re-render the title
    if (alert?.productName.toLowerCase() == "Severe Weather Statement".toLowerCase()) {
        alert.productName = "Severe Thunderstorm Warning";
    }
    if (alert?.productName.toLowerCase() == "tornado warning") {
        if (is_emergency) {
            alert.productName = "Tornado Emergency";
        } else if (is_pds) {
            alert.productName = "PDS Tornado Warning";
        } else if (is_confirmed_tor) {
            alert.productName = "Confirmed Tornado Warning";
        } else if (damagelevel === 'destructive') {
            alert.productName = "Destructive Tornado Warning";
        } else if (damagelevel === 'considerable') {
            alert.productName = "Considerable Tornado Warning";
        }
    } else if (alert?.productName.toLowerCase() == "flash flood warning") {
        if (is_emergency) {
            alert.productName = "Flash Flood Emergency";
        } else if (damagelevel === 'destructive') {
            alert.productName = "Destructive Flash Flood Warning";
        } else if (damagelevel === 'considerable') {
            alert.productName = "Considerable Flash Flood Warning";
        }
    } else if (alert?.productName.toLowerCase() == "severe thunderstorm warning") {
        if (damagelevel === 'destructive') {
            alert.productName = "Destructive Severe Thunderstorm Warning";
        } else if (damagelevel === 'considerable') {
            alert.productName = "Considerable Severe Thunderstorm Warning";
        }
    }

    // Get alert settings using the final (renamed) product name
    const alertSettings = getAlertSettings(alert?.productName);

    // Now identify priority for sorting
    if (is_emergency) {
        alert.priority = 50;
    } else if (is_pds) {
        alert.priority = 40;
    } else if (damagelevel === 'destructive') {
        alert.priority = 30;
    } else if (damagelevel === 'considerable') {
        alert.priority = 20;
    } else {
        if (alert?.productName.toLowerCase().includes('extreme')) {
            alert.priority = 19;
        } else if (alert?.productName.toLowerCase().includes('tornado')) {
            alert.priority = 15;
        } else if (alert?.productName.toLowerCase().includes('severe thunderstorm')) {
            alert.priority = 14;
        } else if (alert?.productName.toLowerCase().includes('flash flood')) {
            alert.priority = 13;
        } else if (alert?.productName.toLowerCase().includes('snow squall')) {
            alert.priority = 12;
        }  else if (alert?.productName.toLowerCase().includes('special marine')) {
            alert.priority = 11;
        } else if (alert?.productName.toLowerCase().includes('special weather')) {
            alert.priority = 10;
        } else if (alert?.productName.toLowerCase().includes('marine weather')) {
            alert.priority = 9;
        } else if (alert?.productName.toLowerCase().includes('flood')) {
            alert.priority = 8;
        } else {
            alert.priority = 0;
        }
    }

    return {
        name: alert?.productName || "Unknown Alert",
        priority: alert?.priority || 0,
        color: alertSettings.color || 'ff2121',
        enabled: alertSettings.enabled,
        notif: {
            icon: icon,
            enabled: alertSettings.notify,
            soundFile: alertSettings.sound || null
        },
        props: {
            is_pds: is_pds,
            is_emergency: is_emergency,
            damagelevel: damagelevel,
            is_tor_possible: latestAlertMessage.toLowerCase().includes('tornado...possible') || false,
            is_tor_observed: is_confirmed_tor,
            is_tor_radar_indicated: latestAlertMessage.toLowerCase().includes('tornado...radar indicated') || false,
            is_waterspout_possible: latestAlertMessage.toLowerCase().includes('waterspout...possible') || false,
            max_hail_size: maxHailSize,
            max_wind_gust: maxWindGust,
            is_test: is_test
        }
    }
}