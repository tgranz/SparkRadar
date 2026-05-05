import { buildAlertDefaults } from "../frontend/settings/settings.js";
import { getCurrentSetting } from "../frontend/settings/setting_utils.js";


export function getAlertSettings(alertName) {
    try {
        // Convert alert name to settings key format
        // e.g., "Severe Thunderstorm Warning" -> "alert_severe_thunderstorm_warning"
        const settingKey = `alert_${alertName.replace(/\s+/g, '_').toLowerCase()}`;
        const defaults = buildAlertDefaults();
        const defaultColor = defaults[alertName]?.color || null;
        
        const configuredValue = getCurrentSetting(settingKey, null);
        if (configuredValue !== null && configuredValue !== undefined) {
            if (typeof configuredValue === 'object') {
                return {
                    enabled: typeof configuredValue.enabled === 'boolean' ? configuredValue.enabled : true,
                    // Older saved configs may not include notify; default to true to preserve behavior.
                    notify: typeof configuredValue.notify === 'boolean' ? configuredValue.notify : true,
                    updnotify: typeof configuredValue.updnotify === 'boolean'
                        ? configuredValue.updnotify
                        : (typeof configuredValue.notify === 'boolean' ? configuredValue.notify : true),
                    color: configuredValue.color || configuredValue.fillColor || configuredValue.borderColor || defaultColor,
                    sound: configuredValue.sound || 'none',
                    updsound: configuredValue.updsound || 'none'
                };
            }

            // Legacy boolean format support.
            const enabled = Boolean(configuredValue);
            return {
                enabled,
                notify: enabled,
                updnotify: enabled,
                color: defaultColor,
                sound: 'none',
                updsound: 'none'
            };
        }
        
        // Return defaults if not found
        return {
            enabled: true,
            notify: true,
            updnotify: true,
            color: defaultColor,
            sound: 'none',
            updsound: 'none'
        };
    } catch (error) {
        return {
            enabled: true,
            notify: true,
            updnotify: true,
            color: null,
            sound: 'none',
            updsound: 'none'
        };
    }
}

export function getTornadoStatus(props = {}) {
    const hasObserved = Boolean(props?.is_tor_observed);
    const hasEmergency = Boolean(props?.is_emergency);
    const hasPds = Boolean(props?.is_pds);
    const hasRadarIndicated = Boolean(props?.is_tor_radar_indicated);
    const hasPossible = Boolean(props?.is_tor_possible);

    if (hasObserved && hasEmergency) {
        return { text: 'Deadly', color: '#c021ff' };
    }

    if (hasObserved && hasPds) {
        return { text: 'Dangerous', color: '#ff00ff' };
    }

    if (hasObserved) {
        return { text: 'Observed', color: '#b80000' };
    }

    if (hasRadarIndicated) {
        return { text: 'Radar Indicated', color: '#ff2121' };
    }

    if (hasPossible) {
        return { text: 'Possible', color: '#ffa200' };
    }

    return null;
}

export function getTornadoStatusHtml(props = {}, label = 'Tornado') {
    const status = getTornadoStatus(props);
    if (!status) return '';
    return `<strong>${label}:</strong> <span style="color: ${status.color};">${status.text}</span>`;
}

export function renderAlert(alert) {
    const name = (alert?.productName || '').toLowerCase();

    if (name == "Dust Storm Warning and Dust Advisory".toLowerCase()) {
        // Legacy SparkAlerts system compatibility
        alert.productName = "Dust Storm Warning";
    }

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
    let latestAlertMessage = messages[0] || alertMessage;

    // Loop over each message update until we find the latest non-cancellation message
    for (const msg of messages) {
        if (msg.toLowerCase().includes('cancelled')) {
            continue; // Skip cancellation messages
        }

        // If we find a non-cancellation message, use it as the latest message
        if (msg.trim() !== "") {
            latestAlertMessage = msg.toLowerCase();
            break;
        }
    }

    const is_new = messages.length < 1;
    const is_destructive = latestAlertMessage.includes('thunderstorm damage threat...destructive') || false;
    const is_consid = latestAlertMessage.includes('thunderstorm damage threat...considerable') || false;
    const is_emergency = latestAlertMessage.includes('tornado emergency') || latestAlertMessage.includes('flash flood emergency') || false;
    const is_pds = latestAlertMessage.includes('particularly dangerous situation') || false;
    const damagelevel = latestAlertMessage.includes('thunderstorm damage threat...destructive') ? 'destructive' : latestAlertMessage.includes('thunderstorm damage threat...considerable') ? 'considerable' : 'normal';
    const hailMatch = latestAlertMessage.match(/max hail size...(.*?)\n/i);
    const maxHailSize = hailMatch ? hailMatch[1].trim() : null;
    const windMatch = latestAlertMessage.match(/max wind gust\.\.\.(.*?)(\r?\n|$)/i);
    const maxWindGust = windMatch ? windMatch[1].trim() : null;
    const is_confirmed_tor = latestAlertMessage.includes('tornado...observed') || false;
    const is_test = latestAlertMessage.includes(' test') || false;

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
    } else {
        if (alert?.productName?.toLowerCase().includes('extreme')) {
            alert.priority = 19;
        } else if (alert?.productName?.toLowerCase().includes('tornado')) {
            if (is_confirmed_tor) {
                alert.priority = 18;
            } else {
                alert.priority = 17;
            }
        } else if (alert?.productName?.toLowerCase().includes('severe thunderstorm')) {
            if(damagelevel === 'destructive') {
                alert.priority = 16;
            } else if(damagelevel === 'considerable') {
                alert.priority = 15;
            } else {
                alert.priority = 14;
            }
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

    // TIME...MOT...LOC 1331Z 261DEG 49KT 3378 9817 <- example
    const decodeMotLocCoordinate = (raw, isLongitude = false) => {
        if (typeof raw !== 'string') return null;

        const trimmed = raw.trim();
        const hasSign = /^[-+]/.test(trimmed);
        const numeric = Number(trimmed);
        if (!Number.isFinite(numeric)) {
            return null;
        }

        const scaled = numeric / 100;
        if (hasSign) {
            return scaled;
        }

        // NWS TIME...MOT...LOC values are typically unsigned; assume western hemisphere longitudes.
        if (isLongitude) {
            return -Math.abs(scaled);
        }

        return scaled;
    };

    const timeMotLocMatch = alertMessage.match(
        /time\.\.\.mot\.\.\.loc\s+(\d{3,4})z?\s+(\d{1,3})deg\s+(\d{1,3})kt\s+([^\r\n]+)/i
    );

    let time = null;
    let direction = null;
    let speed = null;
    let lat = null;
    let lon = null;
    let points = [];

    if (timeMotLocMatch) {
        time = String(timeMotLocMatch[1]);
        direction = String(timeMotLocMatch[2]) - 180; // Convert from NWS compass to standard
        speed = String(timeMotLocMatch[3]);

        const rawCoordinateText = String(timeMotLocMatch[4] || '');
        const coordinateTokens = rawCoordinateText.match(/[-+]?\d{3,6}/g) || [];

        for (let i = 0; i + 1 < coordinateTokens.length; i += 2) {
            const pointLat = decodeMotLocCoordinate(String(coordinateTokens[i]), false);
            const pointLon = decodeMotLocCoordinate(String(coordinateTokens[i + 1]), true);
            if (!Number.isFinite(pointLat) || !Number.isFinite(pointLon)) {
                continue;
            }
            points.push({ lat: pointLat, lon: pointLon });
        }

        if (points.length > 0) {
            lat = points[0].lat;
            lon = points[0].lon;
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
            soundFile: alertSettings.sound || 'none'
        },
        updnotif: {
            icon: icon,
            enabled: alertSettings.updnotify,
            soundFile: alertSettings.updsound || 'none'
        },
        props: {
            is_pds: is_pds,
            is_emergency: is_emergency,
            damagelevel: damagelevel,
            is_tor_possible:latestAlertMessage.includes('tornado...possible') || false,
            is_tor_observed: latestAlertMessage.includes('tornado...observed') || false,
            is_tor_radar_indicated: latestAlertMessage.includes('tornado...radar indicated') || false,
            is_waterspout_possible: latestAlertMessage.includes('waterspout...possible') || false,
            max_hail_size: maxHailSize,
            max_wind_gust: maxWindGust,
            is_test: is_test,
            is_new: is_new
        },
        timeMotLoc: {
            time,
            direction,
            speed,
            lat,
            lon,
            points
        }
    }
}