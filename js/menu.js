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

    document.getElementById(id).style.display = 'flex';

    if (id == 'menu-menu') {
        document.getElementById("menutitlebar").innerHTML = `<img src="assets/logo-rounded.png" style="height: 28px; width: 28px; vertical-align: bottom; margin-right: -4px;"><span id="menutitle">SparkRadar.app</span>`;
    } else if (id == 'menu-about') {
        document.getElementById("menutitlebar").innerHTML = '<span style="font-size: 20px; font-weight: bolder; margin: 10px;">About</span>';
    } else if (id == 'menu-settings') {
        document.getElementById("menutitlebar").innerHTML = '<span style="font-size: 20px; font-weight: bolder; margin: 10px;">Settings</span>';
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

// Close menu when clicking outside or pressing Escape
document.addEventListener('click', (e) => {
    if (!menu.classList.contains('open')) return;
    const path = e.composedPath ? e.composedPath() : (e.path || []);
    if (!path.includes(menu) && !path.includes(menuBtn)) {
        closeMenu();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
});


// Settings
var notificationsEnabled = localStorage.getItem('sparkradar_notifications') === 'true';
var livealertsEnabled = localStorage.getItem('sparkradar_livealerts') === 'true';

function updateSettingsUI() {
    document.getElementById('set-notifications').style.background = notificationsEnabled ? '#27beff' : '#333';
    document.getElementById('set-livealerts').style.background = livealertsEnabled ? '#27beff' : '#333';
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
function toggleLivealerts() {
    livealertsEnabled = !livealertsEnabled;
    localStorage.setItem('sparkradar_livealerts', livealertsEnabled ? 'true' : 'false');
    if (firstuse1) {
        sendNotification("Warning", "DO NOT RELY ON THESE ALERTS. They may not be reliable yet!", "alert-square-rounded", "#ff4444");
    }
    updateSettingsUI();
    firstuse1 = false;
}