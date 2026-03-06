import { buildAlertDefaults } from "./ui/settings";


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
    else if (name.includes('flash flood')) icon = 'droplet';
    else if (name.includes('flood')) icon = 'droplet';
    else if (name.includes('winter') || name.includes('blizzard') || name.includes('snow')) icon = 'snowflake';
    else if (name.includes('wind')) icon = 'wind';
    else if (name.includes('tsunami') || name.includes('marine') || name.includes('lakeshore')) icon = 'wave';
    else if (name.includes('coastal') || name.includes('storm surge')) icon = 'waves';
    else if (name.includes('hurricane') || name.includes('tropical') || name.includes('typhoon')) icon = 'cloud-storm';
    else icon = 'alert-triangle';

    // Check props
    const alertMessage = alert?.message || "";
    const _is_consid = alert?.message.toLowerCase().includes('considerable') || false;
    const _is_destructive = alert?.message.toLowerCase().includes('destructive') || alert?.message.toLowerCase().includes('catastrophic') || false;
    const is_emergency = alert?.message.includes('TORNADO EMERGENCY') || alert?.message.includes('FLASH FLOOD EMERGENCY') || false;
    const is_pds = alert?.message.toLowerCase().includes('particularly dangerous situation') || false;
    const damagelevel = _is_consid ? 'considerable' : _is_destructive ? 'destructive' : 'normal';
    const hailMatch = alertMessage.match(/max hail size...(.*?)\n/i);
    const maxHailSize = hailMatch ? hailMatch[1].trim() : null;
    const windMatch = alertMessage.match(/max wind gust\.\.\.(.*?)(\r?\n|$)/i);
    const maxWindGust = windMatch ? windMatch[1].trim() : null;
    const is_confirmed_tor = alertMessage.includes('tornado...observed');

    // Store original product name for settings lookup
    const originalProductName = alert?.productName.replace(/(CONSIDERABLE|DESTRUCTIVE|CATASTROPHIC)/gi, '').trim() || "Unknown Alert";

    // Now re-render the title
    if (alert?.productName.toLowerCase() == "tornado warning") {
        if (is_emergency) {
            alert.productName = "Tornado Emergency";
        } else if (is_pds) {
            alert.productName = "PDS Tornado Warning";
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

    // Get alert settings using original product name
    const alertSettings = getAlertSettings(originalProductName);

    return {
        name: alert?.productName || "Unknown Alert",
        color: alertSettings.color || "#ff2121",
        outline: alertSettings.color ? '#000000' : null,
        enabled: alertSettings.enabled,
        notif: {
            icon: icon,
            enabled: alertSettings.notify,
        },
        props: {
            is_pds: is_pds,
            is_emergency: is_emergency,
            damagelevel: damagelevel,
            is_tor_possible: alert?.message.toLowerCase().includes('tornado...possible') || false,
            is_tor_observed: is_confirmed_tor,
            is_waterspout_possible: alert?.message.toLowerCase().includes('waterspout...possible') || false,
            max_hail_size: maxHailSize,
            max_wind_gust: maxWindGust
        }
    }
}