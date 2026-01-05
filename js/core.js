/*
THE SPARK RADAR PROJECT
FREE AND EASY TO USE WEATHER RADAR
BECAUSE EVERYONE EXPERIENCES WEATHER
https://sparkradar.app
CODED BY TYLER G

IMPORTANT: This code is open source for your viewing.
THIS CODE IS NOT TO BE COPIED OR USED WITHOUT PERMISSION
FOR QUESTIONS, PLEASE CONTACT ME AT nimbusapps@proton.me
THANK YOU!

*/

var first = localStorage.getItem('sparkradar_firsttime') === null;
var newUser = first;
localStorage.setItem('sparkradar_firsttime', 'false');

var mapparams = {
    container: 'map',
    style: 'https://api.maptiler.com/maps/01991750-e542-745a-bb74-f8f5646a978c/style.json?key=UMONrX6MjViuKZoR882u',
    center: [-95, 40],
    zoom: 4,
    projection: 'globe',
    attributionControl: false
}
var locationtoaddtomap = null;
var appmode = false;

// Evaluate the URL parameters
var urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('mode')) {
    const modeParam = urlParams.get('mode').toLowerCase();
    if (modeParam == 'app'){
        // For viewing fullscreen in the SparkRadarWX app
        // Minor adjustments to the UI
        appmode = true;
        console.log("Running in app mode.");

        document.getElementById('geolocate').style.display = 'none';
        document.getElementById('menu-about-btn').style.display = 'none';
        document.getElementById('menu-notifications-header').innerHTML = 'Radar Notifications';

    } else if (modeParam == 'preview') {
        // For embedding a preview of the new radar, originally for SparkRadarWX app
        // Hide toolbar, info box, and expanded attribution
        document.getElementById('toolbar').style.display = 'none';
        document.getElementById('info').style.display = 'none';
        document.getElementById('attributionText').style.display = 'none';

        console.log("Running in preview mode.");
    }
}
if (urlParams.has('lat') && urlParams.has('lon')) {
    const lat = parseFloat(urlParams.get('lat'));
    const lon = parseFloat(urlParams.get('lon'));

    mapparams.center = [lon, lat];
    mapparams.zoom = 8;

    locationtoaddtomap = [lon, lat];
}
if (urlParams.has('zoom')) {
    const zoom = parseFloat(urlParams.get('zoom'));
    mapparams.zoom = zoom;
}

// Set up the map
const map = new maplibregl.Map(mapparams);

// Variables
var labelLayerId;
var labelLayer;
map.on('load', () => {
    labelLayer = map.getStyle().layers.find(l => l.id.includes('label') && l.type === 'symbol');
    labelLayerId = labelLayer ? labelLayer.id : undefined;

    if (locationtoaddtomap) {
        map.addSource('location-marker', {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: locationtoaddtomap
                }
            }
        });
        map.addLayer({
            id: 'location-marker',
            type: 'circle',
            source: 'location-marker',
            paint: {
                'circle-radius': 10,
                'circle-color': '#2a7fff',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#fff'
            }
        });
    }
});


// Welcome dialog for first-time users
if (first && !appmode) {
    setTimeout(() => {
        document.body.appendChild(document.createElement('div')).innerHTML = `
            <div id="welcomedialog" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;">
                <div style="background: #222; display: flex; color: white; flex-direction: column; color: white; padding: 20px; border-radius: 10px; max-width: 400px; text-align: center; box-shadow: rgba(0, 0, 0, 0.5) 3px 3px 6px 6px;">
                    <div>
                        <h2>Welcome to the new Spark Radar!</h2>
                    </div>
                    <p style="font-size: medium; margin-bottom: 20px;">The new Spark Radar brings significant visual and performance improvements, along with many new features and faster loading times. The new app is still in beta and will contain bugs and missing features. If you prefer to visit the previous version, go to <a href="https://sparkradar.app/legacy" style="color: #27beff;">sparkradar.app/legacy</a>.
                    </p>

                    <button onclick="document.getElementById('welcomedialog').remove();" style="background: #27beff; padding: 10px 20px; border: none; color: black; font-size: large; cursor: pointer;">Continue</button>

                </div>
            </div>
        `;
    }, 100);
    first = false;
}

// Function to guess if the user is on mobile
function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function evaluateDispBoxCloser() { 
    let alwaysshowdispboxcloser = false;
    try {
        alwaysshowdispboxcloser = JSON.parse(localStorage.getItem('sparkradar_settings')).alwaysshowdispboxcloser || false;
    } catch (e) {
        alwaysshowdispboxcloser = false;
    }

    // Show the closer on desktop always. On mobile, show only if the user enabled "always show".
    if (!isMobile()) {
        document.getElementById('displayboxcloser').style.display = 'block';
    } else {
        document.getElementById('displayboxcloser').style.display = alwaysshowdispboxcloser ? 'block' : 'none';
    }
}

evaluateDispBoxCloser();

// Function to calculate relative time to a given ISO timestamp
function isoTimeUntil(isoTimestamp) {
    const now = new Date();
    const then = new Date(isoTimestamp);
    const diffMs = then - now;

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffDays > 0) {
        return `${diffDays} d ${diffHours} hr`;
    } else if (diffHours > 0) {
        return `${diffHours} hr ${diffMinutes} min`;
    } else if (diffMinutes < 0) {
        return '-- min';
    } else {
        return `${diffMinutes} min`;
    }
}

// Function to determine if white or black will have more contrast atop a given hex color
function readableTextColor(hexcolor, invert=false) {
    hexcolor = hexcolor.replace('#', '');

    // Convert the hex color to RGB values
    const r = parseInt(hexcolor.substr(0, 2), 16);
    const g = parseInt(hexcolor.substr(2, 2), 16);
    const b = parseInt(hexcolor.substr(4, 2), 16);

    // Calculate the YIQ value
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;

    // Return black or white based on the YIQ value
    if(!invert) return yiq >= 128 ? 'black' : 'white';
    else return yiq >= 128 ? 'white' : 'black';
}



// This snippit logs all layers on the map
// DEBUGGING
map.on('styledata', function() {
    const layers = map.getStyle().layers;
    layers.forEach((layer, index) => {
        console.debug(index, layer.id, layer.type);
    });
});


// Add event listeners
function viewAlertDetails(id) {
    const alert = alerts.find(a => a.id === id);
    openDisplaybox(alert.properties.event, findAlertColor(alert.properties.event));

    let detectables = [];
    try { detectables.push('<strong style="color: red;">Tornado: ' + alert.properties.parameters.tornadoDetection[0] + '</strong>'); } catch {}
    try { detectables.push('<strong>Hail: ' + alert.properties.parameters.maxHailSize[0] + 'in, ' + alert.properties.parameters.hailThreat[0] + '</strong>'); } catch {
        // Fallback
        try { detectables.push('<strong>Hail: ' + alert.properties.parameters.maxHailSize[0] + 'in. </strong>'); } catch {}
    }
    try { detectables.push('<strong>Wind: ' + alert.alert.properties.parameters.maxWindGust[0]) + ', ' + alert.properties.parameters.windThreat[0] + '</strong>';  } catch {
        // Fallback
        try { detectables.push('<strong>Wind: ' + alert.properties.parameters.maxWindGust[0] + '</strong>'); } catch {}
    }
    try { detectables.push('<strong>Flooding: ' + alert.properties.flashFloodDamage[0] + ', ' + alert.properties.parameters.flashFloodDetection[0] + '</strong>'); } catch {}

    // Format the description text
    var fixedDesc = alert.properties.description
        .replace(/\n\n/g, '<br><br>')
        .replace("WHAT", '<b style="font-family: Consolas, monospace, sans-serif !important;">WHAT</b>')
        .replace("WHERE", '<b style="font-family: Consolas, monospace, sans-serif !important;">WHERE</b>')
        .replace("WHEN", '<b style="font-family: Consolas, monospace, sans-serif !important;">WHEN</b>')
        .replace("IMPACTS", '<b style="font-family: Consolas, monospace, sans-serif !important;">IMPACTS</b>')
        .replace("HAZARDS", '<b style="font-family: Consolas, monospace, sans-serif !important;">HAZARDS</b>')
        .replace("SOURCE", '<b style="font-family: Consolas, monospace, sans-serif !important;">SOURCE</b>')
        .replace("LOCATIONS IMPACTED INCLUDE", '<b style="font-family: Consolas, monospace, sans-serif !important;">LOCATIONS IMPACTED INCLUDE</b>')
        .replace("HAZARD", '<b style="font-family: Consolas, monospace, sans-serif !important;">HAZARD</b>')
        .replace("LOCATION AND MOVEMENT", '<b style="font-family: Consolas, monospace, sans-serif !important;">LOCATION AND MOVEMENT</b>')
        .replace("IMPACT", '<b style="font-family: Consolas, monospace, sans-serif !important;">IMPACT</b>')
        .replace("SAFETY INFO", '<b style="font-family: Consolas, monospace, sans-serif !important;">SAFETY INFO</b>')
        .replace("ADDITIONAL DETAILS", '<b style="font-family: Consolas, monospace, sans-serif !important;">ADDITIONAL DETAILS</b>')
        .replace("Locations impacted include", '<b style="font-family: Consolas, monospace, sans-serif !important;">Locations impacted include</b>')
        
    document.getElementById('displayboxbody').innerHTML = (`
        <p style="font-size: medium;">
            Areas: <strong>${alert.properties.areaDesc}</strong><br>
            Expires in: <strong>${isoTimeUntil(alert.properties.expires)}</strong>
            ${detectables.length ? '<br>' + detectables.join('<br>') : ''}
            <br>
            <p style="margin: 0px; background: black; margin-bottom: 20px; margin-top: 20px; font-family: Consolas, monospace, sans-serif !important; padding: 10px; border-radius: 20px; border: 1px solid gray;">
                ${fixedDesc.replace(/www\./g, "")}
            </p>
        </p>
    `)
}

// Resize
function resizeListener() {
    // DEBUGGING
    console.debug('Viewport size:', window.innerWidth, 'x', window.innerHeight);
    var urlParams = new URLSearchParams(window.location.search);

    if (window.innerWidth < 800 && !urlParams.has('mode') ) {
        document.getElementById('attribution').style.bottom = '80px';
    } else if ( urlParams.has('mode') ) {
        if ( urlParams.get('mode').toLowerCase() == 'preview' ){
            document.getElementById('attribution').style.bottom = '10px';
        }
    }
}

window.addEventListener('resize', () => { resizeListener(); });
resizeListener();

// Attribution
document.getElementById('attribution').addEventListener('click', () => {
    if (document.getElementById('attributionText').style.display == 'flex'){
        document.getElementById('attributionText').style.display = 'none';
    } else {
        document.getElementById('attributionText').style.display = 'flex';
    }
});

setTimeout(() => { if (document.getElementById('attributionText').style.display == 'flex'){ document.getElementById('attributionText').style.display = 'none' } }, 5000);

// Search
const toolbar = document.getElementById('toolbar');
const searchBtn = document.getElementById('searchBtn');
const searchBox = document.getElementById('searchBox');

searchBtn.addEventListener('click', () => {
    toolbar.classList.toggle('search-active');
    if (toolbar.classList.contains('search-active')) {
        setTimeout(() => { searchBox.focus(); }, 400);
    }
});

searchBox.addEventListener('blur', () => {
    toolbar.classList.remove('search-active');
});



// Info
document.getElementById('expandinfo').addEventListener('click', (event) => {
    document.getElementById('infodetails').classList.toggle('expanded');
    document.getElementById('expandinfo').classList.toggle('rotated');

});

// Displaybox
function openDisplaybox(title, color, helpsection = null) {
    if (newUser && document.getElementById('displayboxcloser').style.display == 'none') {
        document.getElementById('displayboxtip').style.display = 'flex';
        setTimeout(() => { document.getElementById('displayboxtip').style.display = 'none'; }, 5000);
        newUser = false;
    }

    if (helpsection) {
        if (helpsection == 'alertsettings') {
            document.getElementById('displayboxbody').innerHTML = `<p style="font-size: medium;">
            SparkRadar allows you to customize the appearance of alerts on the map.<br><br>
            Click on the checkbox on the left to hide that alert from the map.<br><br>
            <strong>C</strong> (Color): Sets the fill color of the alert polygon.<br>
            <strong>B</strong> (Border): Sets the color of the alert polygon's border.<br>
            <strong>F</strong> (Flash): Sets the flash color of the alert polygon. To disable flashing for an alert, set this to pure black (#000000)<br>
            </p>`
        }
    }

    document.getElementById('displaybox').classList.add('open');
    document.getElementById('displayboxtitle').style.backgroundColor = color;
    document.getElementById('displayboxtitle').style.color = readableTextColor(color);
    document.getElementById('displayboxtitle').innerHTML = `<p style="font-size: medium; text-shadow: 1px 1px 3px ${readableTextColor(color, true)};">${title}</p>`;
}

function closeDisplaybox() {
    document.getElementById('displaybox').classList.remove('open');
}

// --- Mobile: drag-down-to-close behavior for the displaybox header ---
(() => {
    const header = document.getElementById('displayboxheader');
    const displaybox = document.getElementById('displaybox');
    if (!header || !displaybox) return;

    // Only allow drag-to-close when on mobile AND the user has not chosen to always show the close button
    function allowDragClose() {
        let alwaysShow = false;
        try {
            alwaysShow = JSON.parse(localStorage.getItem('sparkradar_settings')).alwaysshowdispboxcloser || false;
        } catch (e) {
            alwaysShow = false;
        }
        return isMobile() && !alwaysShow;
    }

    let startY = null;
    let currentTranslate = 0;
    let isDragging = false;
    let origTransition = displaybox.style.transition || '';

    function onTouchStart(e) {
        if (!allowDragClose()) return;
        if (!displaybox.classList.contains('open')) return; // only when open
        const t = e.touches && e.touches[0];
        if (!t) return;
        startY = t.clientY;
        currentTranslate = 0;
        isDragging = true;
        // disable CSS transition while dragging for immediate response
        displaybox.style.transition = 'none';
        // prevent the page from trying to scroll while we drag the handle
        e.preventDefault();
    }

    function onTouchMove(e) {
        if (!isDragging) return;
        const t = e.touches && e.touches[0];
        if (!t) return;
        const delta = t.clientY - startY;
        // only allow downward drag
        if (delta <= 0) {
            currentTranslate = 0;
        } else {
            // dampen the drag a bit so it feels natural
            currentTranslate = Math.pow(delta, 0.95);
        }
        // apply transform relative to open position
        displaybox.style.transform = `translateY(${currentTranslate}px)`;
        // prevent default so the page doesn't scroll under the gesture
        e.preventDefault();
    }

    function endDrag(cancelled) {
        if (!isDragging) return;
        isDragging = false;
        // restore transition for smooth snapping
        displaybox.style.transition = origTransition || '';
        const threshold = Math.min(120, window.innerHeight * 0.25); // px or 25% of viewport
        if (!cancelled && currentTranslate > threshold) {
            // consider this a close gesture
            // Animate the panel off-screen, then remove the open class to reset state
            displaybox.style.transform = `translateY(110%)`;
            // wait for the animation to finish before removing 'open'
            setTimeout(() => {
                displaybox.classList.remove('open');
                // clear inline transform so CSS rules take over next open
                displaybox.style.transform = '';
            }, 220);
        } else {
            // snap back to open position
            displaybox.style.transform = `translateY(0)`;
            // clear translate after transition completes
            setTimeout(() => { displaybox.style.transform = ''; }, 220);
        }
        startY = null;
        currentTranslate = 0;
    }

    function onTouchEnd(e) {
        endDrag(false);
    }

    function onTouchCancel(e) {
        endDrag(true);
    }

    // Attach listeners to the header. Use non-passive so we can preventDefault when needed.
    header.addEventListener('touchstart', onTouchStart, { passive: false });
    header.addEventListener('touchmove', onTouchMove, { passive: false });
    header.addEventListener('touchend', onTouchEnd);
    header.addEventListener('touchcancel', onTouchCancel);

    // If viewport changes (rotate/resize), clear any dragging state
    window.addEventListener('resize', () => { if (isDragging) endDrag(true); });
})();

// Disable pull-to-refresh on iOS Safari: if the page is scrolled to top and the user
// performs a downward touchmove outside of an inner scrollable element, prevent it.
(function disablePullToRefreshForIOS(){
    // Many browsers honor CSS `overscroll-behavior-y: none;` (set in style.css),
    // but iOS Safari does not. This JS intercepts the gesture and prevents
    // the native pull-to-refresh when appropriate.
    let maybePrevent = false;

    function isScrollable(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        return (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
    }

    window.addEventListener('touchstart', function(e){
        if (window.scrollY === 0) {
            // If touching a scrollable descendant, allow normal behavior
            const target = e.target;
            if (isScrollable(target) || target.closest && target.closest('#displayboxbody, .popup-content, .info-content')) {
                maybePrevent = false;
            } else {
                maybePrevent = true;
            }
        } else {
            maybePrevent = false;
        }
    }, { passive: true });

    window.addEventListener('touchmove', function(e){
        if (!maybePrevent) return;
        // If the touchmove is downward, prevent to stop pull-to-refresh
        const t = e.touches && e.touches[0];
        if (!t) return;
        // If the user starts touching at the top and swipes down, prevent default
        // to avoid triggering pull-to-refresh on iOS Safari.
        if (t.clientY > 0) {
            e.preventDefault();
        }
    }, { passive: false });
})();

// Product chooser
function openProductChooser(closeIfAlreadyOpen=false) {
    if (closeIfAlreadyOpen && document.getElementById('productChooser').classList.contains('expanded')){ closeProductChooser(); return; }
    document.getElementById('productChooser').classList.add('expanded');

    document.getElementById("mos").classList.remove('radartypebtn-selected');
    document.getElementById("usnexrad").classList.remove('radartypebtn-selected');
    document.getElementById("sat").classList.remove('radartypebtn-selected');
    loadRadarStations(true);
    
    if (radarMode == "mos"){
        document.getElementById("mos").classList.add('radartypebtn-selected');
        document.getElementById("products").innerHTML  = `
            <div class="product-item" onclick="radarMode = 'mos'; loadRadar('CONUS', false, true);">US Composite Reflectivity</div>
            <div class="product-item" onclick="radarMode = 'mos'; loadRadar('CANMOS', false, true);">CANADA Reflectivity Mosaic</div>
        `/*    <div class="product-item">Base Reflectivity</div>
            <div class="product-item">Precipitation Classification</div>
            <div class="product-item">Echo Tops</div>
        `*/
    } else if (radarMode == "usnexrad"){
        document.getElementById("usnexrad").classList.add('radartypebtn-selected');
        loadRadarStations();
        document.getElementById("products").innerHTML  = '<p style="width: 100%; text-align: center; font-weight: bold;">Select a station to view its products.</p>'
    } else if (radarMode == "station"){
        document.getElementById("usnexrad").classList.add('radartypebtn-selected');
        loadRadarStations();
        
        const products = [
            { code: 'SR_BREF', name: 'Base Reflectivity' },
            { code: 'SR_BVEL', name: 'Base Velocity' },
            { code: 'BDHC', name: 'Precipitation Classification' },
            { code: 'BOHA', name: '1hr Precipitation Accumulation' },
            { code: 'BDSA', name: 'Total Precipitation Accumulation' }
        ];
        
        document.getElementById("products").innerHTML = products.map(p => 
            `<div class="product-item ${radarProduct === p.code ? 'product-selected' : ''}" onclick="radarProduct='${p.code}'; loadRadar(radarStation, false, true); openProductChooser(true);">${p.name}</div>`
        ).join('');
    } else if (radarMode == "sat"){
        document.getElementById("sat").classList.add('radartypebtn-selected');
        /*document.getElementById("products").innerHTML  = `
            <div class="product-item">GOES Geocolor</div>
        `*/
        document.getElementById("products").innerHTML  = 'Coming Soon!'
    }
}

function closeProductChooser() {
    document.getElementById('productChooser').classList.remove('expanded');
}


function sendNotification(title="Test Notification", body="This is a test notification. Click to dismiss.", icon="circle-dashed-check", color="#27beff") {
    const showDuration = 9000;
    const animMs = 300;

    const notif = document.createElement('div');
    notif.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
            <i class="ti ti-${icon}" style="font-size: 30px; color: ${color}; height:40px; width:40px; border-radius:8px; flex:0 0 40px;"></i>
            <div style="color: white; display:flex; flex-direction:column;">
                <strong style="font-size:medium;">${title}</strong>
                <span style="font-size:small;">${body}</span>
            </div>
        </div>
    `;
    // wrapper for positioning + animation. Put notification and ping inside it
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `position: fixed; bottom: 10px; right: -5px; z-index: 10000;`;

    // Make notif positioned relative inside the wrapper so the ping can be absolute
    // Use CSS variables for background/foreground so we can animate the background color
    notif.style.cssText = `
        position: relative;
        background: var(--notif-bg, rgb(20, 20, 20));
        color: var(--notif-foreground, white);
        padding: 10px 15px;
        border-radius: 10px;
        box-shadow: rgba(0, 0, 0, 0.5) 3px 3px 6px 6px;
        border-left: 6px solid ${color};
        font-family: sans-serif;
        transform: translateX(0px);
        opacity: 1;
        transition: transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 300ms;
        cursor: pointer;
        width: calc(100% - 55px);
        max-width: 300px;
        max-height: 200px;
    `;

    // expose color and readable foreground for CSS animations via CSS variables
    notif.style.setProperty('--notif-color', color);
    notif.style.setProperty('--notif-bg', 'rgb(20, 20, 20)');
    try {
        notif.style.setProperty('--notif-foreground', readableTextColor(color));
    } catch (e) {
        notif.style.setProperty('--notif-foreground', 'white');
    }

    // Create ping animation element positioned relative to the notif
    const ping = document.createElement('div');
    ping.style.cssText = `
        position: absolute;
        left: 18px;
        bottom: -10px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--notif-color);
        animation: notification-ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
        pointer-events: none;
    `;

    wrapper.appendChild(notif);
    wrapper.appendChild(ping);
    document.body.appendChild(wrapper);
    notif.classList.add('attention')
    setTimeout(() => { notif.classList.remove('attention'); }, 2000);

    // play sound (safe for autoplay policies; will fail silently if blocked)
    const audio = new Audio('notification.wav');
    audio.preload = 'auto';
    audio.volume = 0.9;
    audio.play().catch(() => { /* may be blocked until a user gesture; ignore */ });

    // stop audio if user dismisses notification
    notif.addEventListener('click', () => {
        try { audio.pause(); audio.currentTime = 0; } catch (e) {}
    });

    // ensure audio is stopped/cleaned up when the wrapper (which contains notif+ping) is removed
    const mo = new MutationObserver((mutations, observer) => {
        for (const m of mutations) {
            for (const n of m.removedNodes) {
                if (n === wrapper) {
                    try { audio.pause(); audio.currentTime = 0; } catch (e) {}
                    observer.disconnect();
                    return;
                }
            }
        }
    });
    mo.observe(document.body, { childList: true });

    // force layout then play enter animation
    requestAnimationFrame(() => {
        notif.style.transform = 'translateX(0)';
        notif.style.opacity = '1';
    });

    let removed = false;
    function removeNotif() {
        if (removed) return;
        removed = true;
        // play exit animation on the notif inside the wrapper
        notif.style.transform = 'translateX(120%)';
        notif.style.opacity = '0';
        // remove the whole wrapper after the exit animation
        setTimeout(() => {
            if (wrapper.parentElement) wrapper.parentElement.removeChild(wrapper);
        }, animMs);
    }

    // auto-remove after duration
    const hideTimeout = setTimeout(removeNotif, showDuration + animMs);

    // allow click to dismiss immediately
    notif.addEventListener('click', () => {
        clearTimeout(hideTimeout);
        removeNotif();
    });
}


/*
const formatDate = (dateStr) => {
                    if (!dateStr) return "N/A";
                    const date = new Date(dateStr);
                    const options = {
                        month: 'numeric',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                        timeZoneName: 'short'
                    };

                    let formatted = date.toLocaleString(undefined, options);
                    formatted = formatted.replace(/\/\d{4}/, '');
                    return formatted;
                };

                const start = formatDate(alert.properties.onset);
                const end = formatDate(alert.properties.expires);
                */
