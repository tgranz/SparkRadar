import { buildAlertDefaults } from "../app/settings/settings.js";
import { getCurrentSetting } from "../app/settings/setting_utils.js";


export function getAlertSettings(alertName) {
    try {
        // Convert alert name to settings key format
        // e.g., "Severe Thunderstorm Warning" -> "alert_severe_thunderstorm_warning"
        const settingKey = `alert_${alertName.replace(/\s+/g, '_').toLowerCase()}`;
        
        const configuredValue = getCurrentSetting(settingKey, null);
        if (configuredValue) {
            if (configuredValue && typeof configuredValue === 'object') {
                if (!configuredValue.color && (configuredValue.fillColor || configuredValue.borderColor)) {
                    configuredValue.color = configuredValue.fillColor || configuredValue.borderColor;
                }
                return configuredValue;
            }
            return configuredValue;
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
    const alertProperties = alert?.properties || {};
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
    const messages = alert?.message ? alert?.message.split('#####') || [] : [];

    const alertMessage = alert?.message || "";
    const latestAlertMessage = messages[0] || alertMessage;
    const is_destructive = !!alertProperties.isDestructive;
    const is_consid = !!alertProperties.isConsiderable;
    const is_emergency = !!alertProperties.isEmergency;
    const is_pds = !!alertProperties.isPds;
    const damagelevel = is_destructive ? 'destructive' : is_consid ? 'considerable' : 'normal';
    const hailMatch = latestAlertMessage.match(/max hail size...(.*?)\n/i);
    const maxHailSize = hailMatch ? hailMatch[1].trim() : null;
    const windMatch = latestAlertMessage.match(/max wind gust\.\.\.(.*?)(\r?\n|$)/i);
    const maxWindGust = windMatch ? windMatch[1].trim() : null;
    const is_confirmed_tor = !!alertProperties.isTorConfirmed || latestAlertMessage.includes('TORNADO...OBSERVED') || false;
    const is_test = latestAlertMessage.includes('TEST') || false;

    // Now re-render the title
    if (alert?.productName?.toLowerCase() == "Severe Weather Statement".toLowerCase()) {
        alert.productName = "Severe Thunderstorm Warning";
    }
    if (alert?.productName?.toLowerCase() == "tornado warning") {
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
    } else if (alert?.productName?.toLowerCase() == "flash flood warning") {
        if (is_emergency) {
            alert.productName = "Flash Flood Emergency";
        } else if (damagelevel === 'destructive') {
            alert.productName = "Destructive Flash Flood Warning";
        } else if (damagelevel === 'considerable') {
            alert.productName = "Considerable Flash Flood Warning";
        }
    } else if (alert?.productName?.toLowerCase() == "severe thunderstorm warning") {
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
        if (alert?.productName?.toLowerCase().includes('extreme')) {
            alert.priority = 19;
        } else if (alert?.productName?.toLowerCase().includes('tornado')) {
            alert.priority = 15;
        } else if (alert?.productName?.toLowerCase().includes('severe thunderstorm')) {
            alert.priority = 14;
        } else if (alert?.productName?.toLowerCase().includes('flash flood')) {
            alert.priority = 13;
        } else if (alert?.productName?.toLowerCase().includes('snow squall')) {
            alert.priority = 12;
        }  else if (alert?.productName?.toLowerCase().includes('special marine')) {
            alert.priority = 11;
        } else if (alert?.productName?.toLowerCase().includes('special weather')) {
            alert.priority = 10;
        } else if (alert?.productName?.toLowerCase().includes('marine weather')) {
            alert.priority = 9;
        } else if (alert?.productName?.toLowerCase().includes('flood')) {
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
            is_tor_possible: !!alertProperties.isTorPossible,
            is_tor_observed: !!alertProperties.isTorConfirmed,
            is_tor_radar_indicated: !!alertProperties.isTorRadarIndicated,
            is_waterspout_possible: !!alertProperties.isWaterspoutPossible,
            max_hail_size: maxHailSize,
            max_wind_gust: maxWindGust,
            is_test: is_test
        }
    }
}