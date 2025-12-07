// Menu toggle: slide in/out
const menuBtn = document.getElementById('menuBtn');
const menu = document.getElementById('menu');
const menuCloser = document.getElementById('menucolser');

function openMenu() {
    menu.classList.add('open');
}

function closeMenu() {
    menu.classList.remove('open');
}

function openMenuItem(id) {
    //document.getElementById("menu-settings").style.display = 'none';
    document.getElementById("menu-menu").style.display = 'none';
    document.getElementById("menu-about").style.display = 'none';
    document.getElementById("menu-settings").style.display = 'none';
    document.getElementById("menu-contact").style.display = 'none';

    document.getElementById(id).style.display = 'flex';

    if (id == 'menu-menu') {
        document.getElementById("menutitlebar").innerHTML = `<img src="assets/logo-rounded.png" style="height: 28px; width: 28px; vertical-align: bottom; margin-right: -4px;"><span id="menutitle">SparkRadar.app</span>`;
    } else if (id == 'menu-about') {
        document.getElementById("menutitlebar").innerHTML = '<span style="font-size: 20px; font-weight: bolder; margin: 10px;">About</span>';
    } else if (id == 'menu-settings') {
        document.getElementById("menutitlebar").innerHTML = '<span style="font-size: 20px; font-weight: bolder; margin: 10px;">Settings</span>';
    } else if (id == 'menu-contact') {
        document.getElementById("menutitlebar").innerHTML = '<span style="font-size: 20px; font-weight: bolder; margin: 10px;">Contact</span>';
    }
}

if (menuBtn) menuBtn.addEventListener('click', openMenu);
if (menuCloser) menuCloser.addEventListener('click', () => {
    if (document.getElementById("menu-menu").style.display == 'flex') {
        closeMenu();
    } else {
        openMenuItem('menu-menu');
    }
});

// Close menu when pressing esc
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
});

// Settings submenu toggle with expand/collapse animation
function opensettingdialog(id) {
    const submenu = document.getElementById(id);
    if (!submenu) return;
    
    // Find the toggle button associated with this submenu
    const toggleBtn = submenu.previousElementSibling?.querySelector('.setting-submenu-toggle');
    
    submenu.classList.toggle('expanded');
    if (toggleBtn) {
        toggleBtn.classList.toggle('rotated');
    }
}


// Settings
var notificationsEnabled = localStorage.getItem('sparkradar_notifications') === 'true';
var sparkalertsEnabled = localStorage.getItem('sparkradar_sparkalerts') === 'true';

function updateSettingsUI() {
    document.getElementById('set-notifications').style.background = notificationsEnabled ? '#27beff' : '#333';
    document.getElementById('set-sparkalerts').style.background = sparkalertsEnabled ? '#27beff' : '#333';

    refreshAlertSettings();
}

// Initial UI update
updateSettingsUI();

var firstuse = true;
function toggleNotifications() {
    notificationsEnabled = !notificationsEnabled;
    localStorage.setItem('sparkradar_notifications', notificationsEnabled ? 'true' : 'false');
    updateSettingsUI();
    if (firstuse) {
        sendNotification("Notifications unavailble", "Alert notifications are still a WIP and do not function yet.", "bell-x", "#ff4444");
    }
    firstuse = false;
}

var firstuse1 = true;
function togglesparkalerts() {
    sparkalertsEnabled = !sparkalertsEnabled;
    localStorage.setItem('sparkradar_sparkalerts', sparkalertsEnabled ? 'true' : 'false');
    if (firstuse1) {
        sendNotification("Warning", "DO NOT RELY ON THESE ALERTS. They may not be reliable yet!", "alert-square-rounded", "#ff4444");
    }
    updateSettingsUI();
    firstuse1 = false;
}

function resetSettings() {
    setTimeout(() => {
        document.body.appendChild(document.createElement('div')).innerHTML = `
            <div id="areyousure" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;">
                <div style="background: #222; display: flex; color: white; flex-direction: column; color: white; padding: 20px; border-radius: 10px; max-width: 400px; text-align: center; box-shadow: rgba(0, 0, 0, 0.5) 3px 3px 6px 6px;">
                    <div>
                        <h2>Are you sure?</h2>
                    </div>
                    <p style="font-size: medium; margin-bottom: 20px;">You cannot return to your previous settings. This will clear all alert customizations, stored variables, and settings.</a>
                    </p>

                    <div style="display: flex; flex-direction: row;">
                        <button onclick="document.getElementById('areyousure').remove();" style="width: 100%; background: #27beff; padding: 10px 20px; margin-right: 3px; border: none; color: black; font-size: large; cursor: pointer;">Nevermind</button>
                        <button onclick="localStorage.clear(); window.location.reload();" style="width: 100%; background: #ff2121; padding: 10px 20px; margin-left: 3px; border: none; color: black; font-size: large; cursor: pointer;">Clear settings</button>
                    </div>
                </div>
            </div>
        `;
    }, 100); 
}

// Alert settings
function refreshAlertSettings() {
    const alertsSubmenu = document.getElementById('sett-alerts');

    var alertsToPopulate = {}
    const defaultAlerts = {
        "Air Quality Alert":
            { enabled: true, color: "#768b00", border: "#768b00", flash: null },
        "Dust Advisory":
            { enabled: true, color: "#706e00", border: "#706e00", flash: null },
        "Dust Storm Warning":
            { enabled: true, color: "#776b00", border: "#776b00", flash: null },
        "Flash Flood Emergency":
            { enabled: true, color: "#00ff00", border: "#00ff00", flash: "#00b600" },
        "Flash Flood Warning":
            { enabled: true, color: "#00ff00", border: "#00ff00", flash: null },
        "Flood Advisory":
            { enabled: true, color: "#00538b", border: "#00538b", flash: null },
        "Flood Warning":
            { enabled: true, color: "#1E90FF", border: "#1E90FF", flash: null },
        "Flood Watch":
            { enabled: true, color: "#60fd82", border: "#60fd82", flash: null },
        "Marine Weather Statement":
            { enabled: true, color: "#690083", border: "#690083", flash: null },
        "PDS Tornado Warning":
            { enabled: true, color: "#e900dd", border: "#e900dd", flash: "#e90000" },
        "Severe Thunderstorm Warning":
            { enabled: true, color: "#f1a500", border: "#f1a500", flash: null },
        "Snow Squall Warning":
            { enabled: true, color: "#0096aa", border: "#0096aa", flash: null },
        "Special Marine Warning":
            { enabled: true, color: "#8b3300", border: "#8b3300", flash: null },
        "Special Weather Statement":
            { enabled: true, color: "#eeff00", border: "#eeff00", flash: null },
        "Tornado Emergency":
            { enabled: true, color: "#9f00e9", border: "#9f00e9", flash: "#e900dd" },
        "Tornado Warning":
            { enabled: true, color: "#e90000", border: "#e90000", flash: null },
        "Tropical Storm Watch":
            { enabled: true, color: "#3f0072", border: "#3f0072", flash: null },
    }


    if (localStorage.getItem('sparkradar_alerts')) {
        alertsToPopulate = JSON.parse(localStorage.getItem('sparkradar_alerts'));
    } else {
        // Load default assortment
        alertsToPopulate = defaultAlerts;
        localStorage.setItem('sparkradar_alerts', JSON.stringify(alertsToPopulate));
    }

    document.getElementById('sett-alerts').innerHTML = '';

    var iterations = 0;
    var lastDiv = null;

    for (const [alertType, settings] of Object.entries(alertsToPopulate)) {
        iterations++;

        const alertDiv = document.createElement('div');
        alertDiv.style.borderRadius = (iterations == 1) ? '20px 20px 5px 5px' : '5px';
        alertDiv.className = 'setting-checkbox';
        alertDiv.display = 'flex';

        alertDiv.innerHTML = `
            <div class="styledcheckbox alertitem" pointer-events: all; style="width: 38px; background: ${settings.enabled ? '#27beff' : '#333'};" id="set-alert-${alertType.replace(/\s+/g, '-')}"></div>
            <p style="width: 100%; margin-right: 10px;">${alertType}</p>
            <div class="alertcolor" id="set-color-${alertType.replace(/\s+/g, '-')}" style="color: ${readableTextColor(settings.color)}; background-color: ${settings.color}; cursor: pointer;">c</div>
        `;

        var thisBorder = !settings.border ? '#000000' : settings.border;
        alertDiv.innerHTML += `
            <div class="alertborder" id="set-border-${alertType.replace(/\s+/g, '-')}" style="color: ${readableTextColor(thisBorder)}; background-color: ${thisBorder}; cursor: pointer;">b</div>
        `;

        var thisFlash = !settings.flash ? '#000000' : settings.flash;
        alertDiv.innerHTML += `
            <div class="alertflash" id="set-flash-${alertType.replace(/\s+/g, '-')}" style="color: ${readableTextColor(thisFlash)}; background-color: ${thisFlash}; cursor: pointer;">f</div>
        `;

        alertDiv.onclick = (e) => {
            // If clicking on a color/border/flash div, don't toggle the alert
            if (
                e.target.classList.contains('alertcolor') ||
                e.target.classList.contains('alertflash') ||
                e.target.classList.contains('alertborder')
            ) {
                return;
            }
            settings.enabled = !settings.enabled;
            localStorage.setItem('sparkradar_alerts', JSON.stringify(alertsToPopulate));
            updateSettingsUI();
            // Refresh the alerts on the map so changes take effect immediately
            if (typeof loadAlerts === 'function') loadAlerts(true);
        };

        alertsSubmenu.appendChild(alertDiv);
        lastDiv = alertDiv;
    };

    lastDiv.style.borderRadius = '5px 5px 20px 20px';

    console.log("Populated alert settings submenu with " + iterations + " alert types.");
}

setTimeout(() => refreshAlertSettings(), 8000);

// Handle alert toggling and color selectors 
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('alertcolor')) {
        // Create invisible color input and trigger it
        const colorDiv = e.target;
        const alertId = colorDiv.id.replace('set-color-', '').replace(/-/g, ' ');
        const alertsToPopulate = JSON.parse(localStorage.getItem('sparkradar_alerts'));
        
        if (alertsToPopulate && alertsToPopulate[alertId]) {
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = alertsToPopulate[alertId].color;
            colorInput.style.display = 'none';
            document.body.appendChild(colorInput);
            
            colorInput.addEventListener('input', (evt) => {
                const newColor = evt.target.value;
                alertsToPopulate[alertId].color = newColor;
                colorDiv.style.backgroundColor = newColor;
                localStorage.setItem('sparkradar_alerts', JSON.stringify(alertsToPopulate));
                loadAlerts(true); // Refresh alerts with new color
            });
            
            colorInput.addEventListener('change', () => {
                document.body.removeChild(colorInput);
                loadAlerts(true); // Refresh alerts with new color
                updateSettingsUI();
            });
            
            colorInput.click();
        }
    } else if (e.target.classList.contains('alertborder')) {
        // Create invisible color input and trigger it
        const borderDiv = e.target;
        const alertId = borderDiv.id.replace('set-border-', '').replace(/-/g, ' ');
        const alertsToPopulate = JSON.parse(localStorage.getItem('sparkradar_alerts'));
        
        if (alertsToPopulate && alertsToPopulate[alertId]) {
            const borderInput = document.createElement('input');
            borderInput.type = 'color';
            borderInput.value = alertsToPopulate[alertId].border || '#000000';
            borderInput.style.display = 'none';
            document.body.appendChild(borderInput);
            
            borderInput.addEventListener('input', (evt) => {
                const newColor = evt.target.value;
                alertsToPopulate[alertId].border = newColor;
                borderDiv.style.backgroundColor = newColor;
                localStorage.setItem('sparkradar_alerts', JSON.stringify(alertsToPopulate));
                loadAlerts(true); // Refresh alerts with new color
            });
            
            borderInput.addEventListener('change', () => {
                document.body.removeChild(borderInput);
                updateSettingsUI();
                loadAlerts(true); // Refresh alerts with new color
            });
            
            borderInput.click();
        }
    } else if (e.target.classList.contains('alertflash')) {
        // Create invisible color input and trigger it
        const flashDiv = e.target;
        const alertId = flashDiv.id.replace('set-flash-', '').replace(/-/g, ' ');
        const alertsToPopulate = JSON.parse(localStorage.getItem('sparkradar_alerts'));

        if (alertsToPopulate && alertsToPopulate[alertId]) {
            const flashInput = document.createElement('input');
            flashInput.type = 'color';
            flashInput.value = alertsToPopulate[alertId].flash || '#000000';
            flashInput.style.display = 'none';
            document.body.appendChild(flashInput);

            flashInput.addEventListener('input', (evt) => {
                const newColor = evt.target.value;
                alertsToPopulate[alertId].flash = newColor;
                flashDiv.style.backgroundColor = newColor;
                localStorage.setItem('sparkradar_alerts', JSON.stringify(alertsToPopulate));
                loadAlerts(true); // Refresh alerts with new color
            });

            flashInput.addEventListener('change', () => {
                document.body.removeChild(flashInput);
                updateSettingsUI();
                loadAlerts(true); // Refresh alerts with new color
            });

            flashInput.click();
        }
    } else if (e.target.classList.contains('alertitem')) {
        // Convert ID back to alert name
        const alertId = e.target.id.replace('set-alert-', '').replace(/-/g, ' ');

        var alertsToPopulate = JSON.parse(localStorage.getItem('sparkradar_alerts'));

        if (alertsToPopulate && alertsToPopulate[alertId]) {
            alertsToPopulate[alertId].enabled = !alertsToPopulate[alertId].enabled;
            localStorage.setItem('sparkradar_alerts', JSON.stringify(alertsToPopulate));
            updateSettingsUI();
            loadAlerts(true);
        }
    }
});


function help(section) {
    if (section == 'alertsettings') openDisplaybox("Alert Settings Help", "#27beff", section);
}