   
 mapboxgl.accessToken = 'pk.eyJ1Ijoid3h0ZXJzaGlwIiwiYSI6ImNseW1kZ2w1czBkYjAycXBta256aWJuM2UifQ.z3LKPJ_2-58-1prCFaoahQ';
 
 // Add this to your JavaScript code
document.addEventListener('DOMContentLoaded', function() {
    const debugConsoleToggle = document.getElementById('debug-console-toggle');
    const debugConsoleContainer = document.getElementById('debug-console-container');
    const debugConsoleContent = document.getElementById('debug-console-content');
    const debugConsoleClear = document.getElementById('debug-console-clear');
    const debugConsoleClose = document.getElementById('debug-console-close');
    const debugCheckIcon = debugConsoleToggle.querySelector('.menu-item-check');
    
    let isDebugConsoleActive = false;
    
    // Override console methods to capture logs
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;
    
    // Function to create a log entry in the debug console
    function createLogEntry(type, args) {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        
        // Add timestamp
        const now = new Date();
        const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-entry-time';
        timeSpan.textContent = `[${timestamp}]`;
        logEntry.appendChild(timeSpan);
        
        // Convert arguments to string representation
        let content = '';
        for (let i = 0; i < args.length; i++) {
            try {
                if (typeof args[i] === 'object') {
                    content += JSON.stringify(args[i], null, 2);
                } else {
                    content += args[i];
                }
                if (i < args.length - 1) {
                    content += ' ';
                }
            } catch (error) {
                content += '[Object]';
            }
        }
        
        const contentSpan = document.createElement('span');
        contentSpan.textContent = ' ' + content;
        logEntry.appendChild(contentSpan);
        
        // Add to debug console
        debugConsoleContent.appendChild(logEntry);
        debugConsoleContent.scrollTop = debugConsoleContent.scrollHeight;
    }
    
    // Override console methods
    if (isDebugConsoleActive) {
        console.log = function() {
            createLogEntry('log', arguments);
            originalConsoleLog.apply(console, arguments);
        };
        
        console.warn = function() {
            createLogEntry('warn', arguments);
            originalConsoleWarn.apply(console, arguments);
        };
        
        console.error = function() {
            createLogEntry('error', arguments);
            originalConsoleError.apply(console, arguments);
        };
    }
    
    // Toggle debug console
    debugConsoleToggle.addEventListener('click', function() {
        isDebugConsoleActive = !isDebugConsoleActive;
        
        if (isDebugConsoleActive) {
            debugConsoleContainer.style.display = 'flex';
            debugCheckIcon.style.display = 'block';
            
            // Override console methods when active
            console.log = function() {
                createLogEntry('log', arguments);
                originalConsoleLog.apply(console, arguments);
            };
            
            console.warn = function() {
                createLogEntry('warn', arguments);
                originalConsoleWarn.apply(console, arguments);
            };
            
            console.error = function() {
                createLogEntry('error', arguments);
                originalConsoleError.apply(console, arguments);
            };
            
            // Add a welcome message
            originalConsoleLog.call(console, 'Debug console activated');
            createLogEntry('log', ['Debug console activated']);
        } else {
            debugConsoleContainer.style.display = 'none';
            debugCheckIcon.style.display = 'none';
            
            // Restore original console methods
            console.log = originalConsoleLog;
            console.warn = originalConsoleWarn;
            console.error = originalConsoleError;
        }
        
        // Close the circle menu popup
        const circleMenuPopup = document.getElementById('circle-menu-popup');
        if (circleMenuPopup.style.display !== 'none') {
            circleMenuPopup.style.display = 'none';
        }
    });
    
    // Clear debug console
    debugConsoleClear.addEventListener('click', function() {
        debugConsoleContent.innerHTML = '';
        createLogEntry('log', ['Console cleared']);
    });
    
    // Close debug console
    debugConsoleClose.addEventListener('click', function() {
        debugConsoleContainer.style.display = 'none';
        debugCheckIcon.style.display = 'none';
        isDebugConsoleActive = false;
        
        // Restore original console methods
        console.log = originalConsoleLog;
        console.warn = originalConsoleWarn;
        console.error = originalConsoleError;
    });
    
    // Test log after initialization
    setTimeout(() => {
        console.log('Debug console ready. Click to enable console capture.');
    }, 1000);
});
 
// Get parameters from URL
const url = new URL(window.location.href);
const params = new URLSearchParams(url.search);
const maplat = params.get('lat');
const maplon = params.get('lon');
const mapz = params.get('z');
const mappitch = params.get('pitch');
const mapbearing = params.get('bearing');

const centerLat = parseFloat(maplat) || 37.0902;
const centerLon = parseFloat(maplon) || -95.7129;
const zoomLevel = parseFloat(mapz) || 2;
const pitchLevel = params.has('pitch') ? parseFloat(mappitch) : 0;
const bearingLevel = params.has('bearing') ? parseFloat(mapbearing) : 0;

// Read saved projection & style settings from localStorage
const savedProjection = localStorage.getItem('mapProjection') || 'globe';
const savedStyle = localStorage.getItem('mapStyle') || 'default'; // 'default' or 'satellite'

// Initialize the Mapbox map
let map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/wxtership/cm5k4lv1l004001qob2p40uno',
    center: [centerLon, centerLat],
    zoom: zoomLevel,
    pitch: pitchLevel,
    bearing: bearingLevel,
    projection: savedProjection,
    preferCanvas: true,
    attributionControl: false,
    antialias: false,
      interactive: true, // Keep interaction but reduce unnecessary calculations
    renderWorldCopies: false, // Disable unnecessary duplicate rendering
});

// Function to find the first road layer
function getFirstRoadLayer() {
    const layers = map.getStyle().layers;
    for (const layer of layers) {
        if (layer.type === "line" && layer.id.includes("road")) {
            return layer.id; // Return the first road layer ID
        }
    }
    return null; // Fallback if no road layer found
}

// Function to toggle satellite layer BELOW ROADS
function toggleSatelliteLayer(enable) {
    const satelliteLayerId = "satellite-overlay";

    if (enable) {
        // Check if the layer already exists
        if (!map.getLayer(satelliteLayerId)) {
            map.addSource(satelliteLayerId, {
                type: "raster",
                tiles: ["https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.jpg90?access_token=" + mapboxgl.accessToken],
                tileSize: 256
            });

            map.addLayer({
                id: satelliteLayerId,
                type: "raster",
                source: satelliteLayerId,
                layout: { visibility: "visible" }
            });
            
            

            // Move the satellite layer BELOW roads
            const firstRoadLayer = getFirstRoadLayer();
            if (firstRoadLayer) {
                map.moveLayer(satelliteLayerId, firstRoadLayer);
            }
        } else {
            map.setLayoutProperty(satelliteLayerId, "visibility", "visible");
        }
    } else {
        if (map.getLayer(satelliteLayerId)) {
            map.setLayoutProperty(satelliteLayerId, "visibility", "none");
        }
    }
}

// Wait for the map to load before adding the satellite layer
map.on("load", () => {
    if (savedStyle === "satellite") {
        toggleSatelliteLayer(true);
    }
});

// Handle UI selection for map style
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.style-option').forEach(option => {
        const styleType = option.getAttribute('data-style');
        if (styleType === savedStyle) {
            option.classList.add('active');
        }
    });

    document.querySelectorAll('.style-option').forEach(option => {
        option.addEventListener('click', function () {
            document.querySelectorAll('.style-option').forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');

            const selectedStyle = this.getAttribute('data-style');
            localStorage.setItem('mapStyle', selectedStyle);

            if (selectedStyle === "satellite") {
                toggleSatelliteLayer(true);
            } else {
                toggleSatelliteLayer(false);
            }
        });
    });
});

// Handle UI selection for projection
document.querySelectorAll('.projection-option').forEach(option => {
    if (option.getAttribute('data-projection') === savedProjection) {
        option.classList.add('active');
    }
});

document.querySelectorAll(".projection-option").forEach(option => {
    option.addEventListener("click", function () {
        document.querySelectorAll(".projection-option").forEach(opt => opt.classList.remove("active"));
        this.classList.add("active");

        let selectedProjection = this.getAttribute("data-projection");
        localStorage.setItem("mapProjection", selectedProjection);
        map.setProjection(selectedProjection);

        const warningBox = document.getElementById("projection-warning");
        const mappingPopup = document.getElementById("mapping-popup");

        if (selectedProjection === "globe") {
            warningBox.classList.remove("hide");
            setTimeout(() => {
                mappingPopup.classList.add("expanded"); // Allow CSS to handle height increase
            }, 50);
        } else {
            warningBox.classList.add("hide");
            setTimeout(() => {
                mappingPopup.classList.remove("expanded"); // Allow CSS to shrink naturally
            }, 50);
        }
    });
});




map.on("load", () => {
    const warningBox = document.getElementById('projection-warning');
    const mappingPopup = document.getElementById('mapping-popup');

    // Ensure correct projection is set
    let selectedProjection = localStorage.getItem('mapProjection') || "globe";
    console.log(`🚀 Initial Projection: ${selectedProjection}`);

    // If Flat (Mercator), hide the warning immediately
    if (selectedProjection === "mercator") {
        warningBox.classList.add('hide');
        mappingPopup.classList.remove('expanded');
        console.log("✅ Flat projection detected on init: Hiding warning.");
    } else {
        warningBox.classList.remove('hide');
        mappingPopup.classList.add('expanded');
        console.log("⚠️ Globe projection detected on init: Showing warning.");
    }

    // Ensure projection change works properly
    document.querySelectorAll(".projection-option").forEach(option => {
        option.addEventListener("click", function () {
            document.querySelectorAll(".projection-option").forEach(opt => opt.classList.remove("active"));
            this.classList.add("active");

            let selectedProjection = this.getAttribute("data-projection");
            localStorage.setItem("mapProjection", selectedProjection);
            map.setProjection(selectedProjection);

            if (selectedProjection === "mercator") {
                warningBox.classList.add('hide');
                mappingPopup.classList.remove('expanded');
                console.log("✅ Switched to Flat: Hiding warning.");
            } else {
                warningBox.classList.remove('hide');
                mappingPopup.classList.add('expanded');
                console.log("⚠️ Switched to Globe: Showing warning.");
            }
        });
    });
});



document.querySelectorAll(".projection-option").forEach(option => {
    option.addEventListener("click", function () {
        document.querySelectorAll(".projection-option").forEach(opt => opt.classList.remove("active"));
        this.classList.add("active");

        let selectedProjection = this.getAttribute("data-projection");
        localStorage.setItem("mapProjection", selectedProjection);
        map.setProjection(selectedProjection);

        const warningBox = document.getElementById("projection-warning");
        const mappingPopup = document.getElementById("mapping-popup");

        if (selectedProjection === "globe") {
            warningBox.classList.remove("hide");
            setTimeout(() => {
                mappingPopup.classList.add("expanded"); // Add class for gradual height increase
            }, 50);
        } else {
            warningBox.classList.add("hide");
            setTimeout(() => {
                mappingPopup.classList.remove("expanded"); // Remove class to shrink naturally
            }, 50);
        }
    });
});

// Add this script to your JavaScript file
document.addEventListener('DOMContentLoaded', function() {
    // Get all welcome pages
    const welcomePages = document.querySelectorAll('.welcome-page');
    
    // Initialize videos only when they become visible
    welcomePages.forEach(page => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target.querySelector('video');
                if (entry.isIntersecting && video) {
                    // Load video when page becomes visible
                    if (video.dataset.src) {
                        video.src = video.dataset.src;
                        video.load();
                        video.play();
                    }
                } else if (video) {
                    // Pause and free resources when not visible
                    video.pause();
                    if (!video.dataset.src) {
                        video.dataset.src = video.src;
                        video.removeAttribute('src');
                    }
                }
            });
        }, {threshold: 0.1});
        
        observer.observe(page);
    });
});

document.addEventListener("DOMContentLoaded", function () {
    const highwayBadgesToggle = document.getElementById("toggle-highway-badges");
    const countyBordersToggle = document.getElementById("toggle-county-borders");

    function removeLayer(layerId) {
        if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
            console.log(`Removed layer: ${layerId}`);
        }
    }

    function addLayer(layerId, sourceId, type, paint = {}) {
        if (!map.getLayer(layerId) && map.getSource(sourceId)) {
            map.addLayer({
                id: layerId,
                type: type,
                source: sourceId,
                paint: paint
            });
            console.log(`Added layer: ${layerId}`);
        }
    }

    function updateLayersFromToggles() {
        // **Admin (County Borders) - Ensure Immediate Toggle**
        if (countyBordersToggle.checked) {
            if (map.getLayer("admin")) {
                map.setLayoutProperty("admin", "visibility", "visible");
                console.log("Enabled county borders.");
            } else {
                addLayer("admin", "composite", "line", {
                    "line-color": "#FF0000",
                    "line-width": 1
                });
                console.log("Added county borders layer.");
            }
        } else {
            if (map.getLayer("admin")) {
                map.setLayoutProperty("admin", "visibility", "none");
                console.log("Disabled county borders.");
            }
        }

        // **Highway Badges (Works fine)**
        const highwayLayers = [
            "road-number-shield", 
            "road-number-shield-navigation", 
            "road-label"
        ];

        if (highwayBadgesToggle.checked) {
            highwayLayers.forEach(layerId => {
                if (map.getLayer(layerId)) {
                    map.setLayoutProperty(layerId, "visibility", "visible");
                    console.log(`Enabled layer: ${layerId}`);
                }
            });
        } else {
            highwayLayers.forEach(layerId => {
                if (map.getLayer(layerId)) {
                    map.setLayoutProperty(layerId, "visibility", "none");
                    console.log(`Disabled layer: ${layerId}`);
                }
            });
        }
    }

    // **Load saved settings (default ON)**
    highwayBadgesToggle.checked = localStorage.getItem("highwayBadges") !== "false";
    countyBordersToggle.checked = localStorage.getItem("countyBorders") !== "false";

    // **Update instantly on toggle**
    highwayBadgesToggle.addEventListener("change", function () {
        localStorage.setItem("highwayBadges", this.checked);
        updateLayersFromToggles();
    });

    countyBordersToggle.addEventListener("change", function () {
        localStorage.setItem("countyBorders", this.checked);
        updateLayersFromToggles();
    });

    // **Ensure toggles work immediately on map load**
    map.on("load", function () {
        updateLayersFromToggles();
    });
});


document.addEventListener('DOMContentLoaded', function() {
    // Check if this is the first visit
    if (!localStorage.getItem('hasVisitedBefore')) {
        // Hide loading screen on first visit
        document.getElementById('loading-screen').style.display = 'none';
        // Set the flag for future visits
        localStorage.setItem('hasVisitedBefore', 'true');
    }
});

map.scrollZoom.setWheelZoomRate(.0045);
map.setMaxPitch(65);
map.setMaxBounds(null);
map.dragPan.inertia = 1.5;
map.setRenderWorldCopies(true);
map.setMaxBounds(null);
map.on("load", () => {
    map.getCanvas().style.willChange = "transform";
});
map.setMinZoom(1);
map.setMaxBounds(null);
map.on("render", () => {
    requestAnimationFrame(() => map.triggerRepaint());
});
map.getCanvas().getContext("webgl", {
    preserveDrawingBuffer: true
});
map.on("style.load", () => {
    map.setFog({
        color: "rgb(126, 150, 175)",
        "horizon-blend": .045,
        "space-color": "rgb(11, 11, 25)",
        "star-intensity": .6
    });
    initializeRadarStations();
});
document.getElementById("share-tool").addEventListener("click", function() {
    document.getElementById("circle-menu-popup");
    const shareData = {
        title: "Xtreme Weather Radar",
        text: "The Xtreme Weather radar let's you track the storm like a pro with over 150 NEXRAD stations across the globe—all for free.",
        url: window.location.href
    };
    navigator.share ? navigator.share(shareData)
        .then(() => console.log("Shared successfully"))
        .catch(e => console.error("Error sharing:", e)) 
        : alert("Your browser does not support the sharing API.");
});

if (!localStorage.getItem("controlBarState")) {
    localStorage.setItem("controlBarState", "collapsed");
}

map.boxZoom.disable();
const canvas = map.getCanvasContainer();

        function startBoxZoom(e) {
            e.shiftKey && 0 === e.button && (map.dragPan.disable(), start = e, box = document.createElement("div"), box.style.position = "absolute", box.style.border = "4px solid #7F1DF0", box.style.background = "rgba(127, 29, 240, 0.2)", box.style.boxShadow = "0 0 15px #7F1DF0", box.style.pointerEvents = "none", box.style.borderRadius = "2px", canvas.appendChild(box), document.addEventListener("mousemove", onMove), document.addEventListener("mouseup", onEnd))
        }

function onMove(e) {
    if (!start) return;

    end = e;
    // Get the canvas' position relative to the viewport
    const canvasRect = canvas.getBoundingClientRect();
    
    // Calculate positions relative to the canvas
    const startX = start.clientX - canvasRect.left;
    const startY = start.clientY - canvasRect.top;
    const endX = end.clientX - canvasRect.left;
    const endY = end.clientY - canvasRect.top;

    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(startX - endX);
    const height = Math.abs(startY - endY);

    box.style.left = left + 'px';
    box.style.top = top + 'px';
    box.style.width = width + 'px';
    box.style.height = height + 'px';
}

function onEnd() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);

    if (box) {
        canvas.removeChild(box);
    }

    if (start && end) {
        const canvasRect = canvas.getBoundingClientRect();
        const startPos = [start.clientX - canvasRect.left, start.clientY - canvasRect.top];
        const endPos = [end.clientX - canvasRect.left, end.clientY - canvasRect.top];
        const bounds = [map.unproject(startPos), map.unproject(endPos)];
        map.fitBounds(bounds, { padding: 20 });
    }

    // Re-enable map panning after box zoom is complete
    map.dragPan.enable();

    start = null;
    end = null;
}

// Only attach for desktop use
map.getCanvas().addEventListener('mousedown', startBoxZoom);





 // Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Get references to elements
    const keyboardButton = document.getElementById('keyboard-shortcuts-btn');
    const keyboardPopup = document.getElementById('keyboard-popup');
    const keyboardBlur = document.getElementById('keyboard-blur');
    const closeKeyboardBtn = document.getElementById('close-keyboard-popup');
    
    // Function to open the keyboard shortcuts popup
    function openKeyboardPopup() {
        // Show the blur overlay and popup
        keyboardBlur.style.display = 'block';
        keyboardPopup.style.display = 'block';
        
        // Force reflow to ensure transitions work properly
        keyboardBlur.offsetWidth;
        keyboardPopup.offsetWidth;
        
        // Add visible classes to trigger animations
        keyboardBlur.classList.add('visible');
        keyboardPopup.classList.add('show');
        keyboardPopup.classList.remove('hide');
    }
    
    // Function to close the keyboard shortcuts popup
    function closeKeyboardPopup() {
        // Start hiding animations
        keyboardBlur.classList.remove('visible');
        keyboardPopup.classList.remove('show');
        keyboardPopup.classList.add('hide');
        
        // After animation completes, actually hide the elements
        setTimeout(() => {
            keyboardBlur.style.display = 'none';
            keyboardPopup.style.display = 'none';
        }, 300); // Match the animation duration
    }
    
    // Add event listeners
    if (keyboardButton) {
        keyboardButton.addEventListener('click', function(event) {
            event.stopPropagation();
            openKeyboardPopup();
        });
    }
    
    if (closeKeyboardBtn) {
        closeKeyboardBtn.addEventListener('click', function(event) {
            event.stopPropagation();
            closeKeyboardPopup();
        });
    }
    
    // Close when clicking on the blur overlay
    if (keyboardBlur) {
        keyboardBlur.addEventListener('click', function(event) {
            event.stopPropagation();
            closeKeyboardPopup();
        });
    }
    
    // Prevent clicks inside the popup from closing it
    if (keyboardPopup) {
        keyboardPopup.addEventListener('click', function(event) {
            event.stopPropagation();
        });
    }
    
    // Add keyboard shortcut to open the shortcuts menu (Shift + /)
    document.addEventListener('keydown', function(event) {
        // Check if the active element is a text input or textarea
        if (document.activeElement.tagName === 'INPUT' || 
            document.activeElement.tagName === 'TEXTAREA' || 
            document.activeElement.isContentEditable) {
          return; // Exit early if user is typing in a text field
        }
        
        // Check for Shift + / (question mark)
        if (event.shiftKey && event.key === '?') {
            event.preventDefault();
            openKeyboardPopup();
        }
        
        // Close with Escape key
        if (event.key === 'Escape' && keyboardBlur.classList.contains('visible')) {
            closeKeyboardPopup();
        }
    });
});
 
document.addEventListener("DOMContentLoaded", function() {
    // Get all needed elements
    const tropicalButton = document.getElementById("tropical-button");
    const tropicalPopup = document.getElementById("tropical-popup");
    const tropicalBlur = document.getElementById("tropical-blur");
    const closeTropicalButton = document.getElementById("close-tropical-popup");
    
    // Function to open the tropical popup
    function openTropicalPopup() {
        // Show the blur overlay and popup
        tropicalBlur.style.display = 'block';
        tropicalPopup.style.display = 'block';
        
        // Force reflow to ensure transitions work properly
        tropicalBlur.offsetWidth;
        tropicalPopup.offsetWidth;
        
        // Add visible class to blur and show class to popup
        tropicalBlur.classList.add('visible');
        tropicalPopup.classList.add('show');
        tropicalPopup.classList.remove('hide');
    }
    
    // Function to close the tropical popup
    function closeTropicalPopup() {
        // Start hiding animations
        tropicalBlur.classList.remove('visible');
        tropicalPopup.classList.remove('show');
        tropicalPopup.classList.add('hide');
        
        // After animation completes, actually hide the elements
        setTimeout(() => {
            tropicalBlur.style.display = 'none';
            tropicalPopup.style.display = 'none';
        }, 300); // Match the animation duration
    }
    
    // Check if all elements exist before adding event listeners
    if (tropicalButton && tropicalPopup && tropicalBlur && closeTropicalButton) {
        // Prevent clicks inside the popup from closing it
        tropicalPopup.addEventListener("click", function(event) {
            event.stopPropagation();
        });
        
        // Clicking on the blur overlay closes the popup
        tropicalBlur.addEventListener("click", function(event) {
            event.stopPropagation();
            closeTropicalPopup();
        });
        
        // Clicking the tropical button opens the popup
        tropicalButton.addEventListener("click", function(event) {
            event.stopPropagation();
            openTropicalPopup();
        });
        
        // Clicking the X button closes the popup
        closeTropicalButton.addEventListener("click", function(event) {
            event.stopPropagation();
            closeTropicalPopup();
        });
    } else {
        // Log errors if any elements are missing
        if (!tropicalButton) console.error("Tropical button (#tropical-button) not found.");
        if (!tropicalPopup) console.error("Tropical popup (#tropical-popup) not found.");
        if (!tropicalBlur) console.error("Tropical blur overlay (#tropical-blur) not found.");
        if (!closeTropicalButton) console.error("Tropical close button (#close-tropical-popup) not found.");
    }
});


document.addEventListener('DOMContentLoaded', function() {
    // Check if this is the first visit
    const hasVisitedBefore = localStorage.getItem('hasVisitedBefore');
    
    if (!hasVisitedBefore) {
        // First visit - show welcome overlay
        const welcomeOverlay = document.getElementById('welcome-overlay');
        welcomeOverlay.style.display = window.innerWidth <= 760 ? 'flex' : 'none';
        welcomeOverlay.classList.add('visible');
        document.body.classList.add('welcome-overlay-visible');
        
        // Set flag in localStorage
        localStorage.setItem('hasVisitedBefore', 'true');
    }
    
    // Handle skip and finish buttons
    document.getElementById('skip-welcome').addEventListener('click', closeWelcome);
    document.getElementById('finish-welcome').addEventListener('click', closeWelcome);
    
    function closeWelcome() {
        const welcomeOverlay = document.getElementById('welcome-overlay');
        welcomeOverlay.classList.remove('visible');
        welcomeOverlay.classList.add('closing');
        
        // After animation completes, fully hide the overlay
        setTimeout(function() {
            welcomeOverlay.style.display = 'none';
            document.body.classList.remove('welcome-overlay-visible');
        }, 500);
    }
});
// Create variable to track if we've shown this specific alert already
window.lastShownCoverageAlert = {
    shown: false,
    heading: '',
    mode: '',
    timestamp: 0
};

// Define icon URLs for different modes
const COVERAGE_ICONS = {
    severe: "https://i.ibb.co/ymLnK1M1/IMG-1047-ezgif-com-optimize.gif",
    tropical: "https://i.ibb.co/60gdMCwp/IMG-8518.gif",
    winter: "https://i.ibb.co/FLRyvJs0/IMG-8020.gif"
};

// Fallback icon in case mode isn't recognized
const DEFAULT_ICON = "https://i.ibb.co/ymLnK1M1/IMG-1047-ezgif-com-optimize.gif";

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Set up the close button handler
    const closeBtn = document.getElementById('coverage-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const popup = document.getElementById('coverage-mode-popup');
            if (popup) {
                popup.classList.add('fade-out');
                popup.classList.remove('visible');
                
                // Reset after animation completes
                setTimeout(function() {
                    popup.classList.remove('fade-out');
                }, 300);
            }
        });
    }
    
    // Check when map loads (if map variable exists)
    if (typeof map !== 'undefined') {
        map.on('load', function() {
            // Wait 6 seconds after map loads before first check
            setTimeout(function() {
                checkCoverageData();
                
                // Then check every 10 seconds
                setInterval(checkCoverageData, 10000);
            }, 6000);
        });
    } else {
        // If map doesn't exist or is not available, check anyway
        setTimeout(function() {
            checkCoverageData();
            
            // Then check every 10 seconds
            setInterval(checkCoverageData, 10000);
        }, 6000);
    }
});

// Another check when the window loads (as backup)
window.addEventListener('load', function() {
    // If map check hasn't run, run this one after 5 seconds
    if (!window.coverageCheckStarted) {
        window.coverageCheckStarted = true;
        
        setTimeout(function() {
            checkCoverageData();
            
            // Then check every 10 seconds
            setInterval(checkCoverageData, 10000);
        }, 5000);
    }
});

// Direct implementation to fetch data and show popup
function checkCoverageData() {
    // Create a script element for JSONP request (works without CORS)
    const script = document.createElement('script');
    
    // Create a unique callback name
    const callbackName = 'coverageCallback_' + Math.floor(Math.random() * 100000);
    
    // Define the callback function in the global scope
    window[callbackName] = function(data) {
        console.log('Coverage data loaded:', data);
        
        // Check if coverage mode is enabled and is one of the supported modes
        if (data && data.coverageModeEnabled === true && 
            ['severe', 'tropical', 'winter'].includes(data.coverageMode)) {
            
            const currentMode = data.coverageMode;
            
            // Only proceed if we haven't shown this alert before
            // Or if the heading has changed or the mode has changed
            if (!window.lastShownCoverageAlert.shown || 
                window.lastShownCoverageAlert.heading !== data.coverageHeading ||
                window.lastShownCoverageAlert.mode !== currentMode) {
                
                // Get the elements
                const popup = document.getElementById('coverage-mode-popup');
                const titleTextElem = document.getElementById('coverage-title-text');
                const headingElem = document.getElementById('coverage-heading');
                const iconElem = document.getElementById('coverage-icon');
                
                // Set the icon based on the mode
                if (iconElem) {
                    iconElem.src = COVERAGE_ICONS[currentMode] || DEFAULT_ICON;
                }
                
                // Set the title text with capitalized mode
                if (titleTextElem) {
                    const capitalizedMode = currentMode.charAt(0).toUpperCase() + currentMode.slice(1);
                    titleTextElem.textContent = `${capitalizedMode} Coverage Mode`;
                }
                
                // Set the heading text
                if (headingElem && data.coverageHeading) {
                    headingElem.textContent = data.coverageHeading;
                }
                
                // Show the popup
                if (popup) {
                    // Mark this alert as shown
                    window.lastShownCoverageAlert = {
                        shown: true,
                        heading: data.coverageHeading,
                        mode: currentMode,
                        timestamp: Date.now()
                    };
                    
                    popup.classList.add('visible');
                    
                    // Hide after 8 seconds
                    setTimeout(function() {
                        if (popup.classList.contains('visible')) { // Only hide if still visible
                            popup.classList.add('fade-out');
                            popup.classList.remove('visible');
                            
                            // Reset after animation completes
                            setTimeout(function() {
                                popup.classList.remove('fade-out');
                            }, 300);
                        }
                    }, 8000);
                }
            }
        } else {
            // If coverage mode is no longer active or not a supported mode,
            // reset the shown flag to ensure we'll show it again if it gets re-enabled
            window.lastShownCoverageAlert.shown = false;
        }
        
        // Clean up the script tag and callback
        document.head.removeChild(script);
        delete window[callbackName];
    };
    
    // Set the src attribute with the callback parameter
    script.src = 'https://xtremewx.com/api/proxy.php?callback=' + callbackName;
    
    // Handle errors
    script.onerror = function() {
        console.error('Error loading coverage data');
        document.head.removeChild(script);
        delete window[callbackName];
    };
    
    // Add the script to the document to start the request
    document.head.appendChild(script);
}
function adjustPopupHeight() {
  const popup = document.getElementById("feedback-popup");
  // Use a 0.3s transition to match the error fade timing
  popup.style.transition = "height 0.3s ease";
  popup.style.height = popup.scrollHeight + "px";
}

// This function will update the popup height repeatedly for 300ms.
function animateHeightDuringError() {
  const duration = 300; // duration in milliseconds
  const startTime = performance.now();
  function update() {
    adjustPopupHeight();
    if (performance.now() - startTime < duration) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}

function showError(field, errorEl) {
  if (!errorEl.classList.contains("show")) {
    errorEl.classList.add("show");
    field.classList.add("error");
    // Continuously update height during the error fade-in
    animateHeightDuringError();
  }
}

function hideError(field, errorEl) {
  if (errorEl.classList.contains("show")) {
    errorEl.classList.remove("show");
    field.classList.remove("error");
    // Also animate the height update when hiding the error
    animateHeightDuringError();
  }
}

function hideFeedbackAlert() {
  const alertEl = document.getElementById("feedback-alert");
  if (alertEl && alertEl.style.display === "block") {
    // Ensure transitions are set
    alertEl.style.transition = "opacity 0.3s ease, max-height 0.3s ease";
    alertEl.style.opacity = "0";
    alertEl.style.maxHeight = "0px";
    alertEl.addEventListener("transitionend", function handler(e) {
      // Use the max-height transition to know when it's done
      if (e.propertyName === "max-height") {
        alertEl.style.display = "none";
        alertEl.removeEventListener("transitionend", handler);
        // Recalculate the popup height so it animates smoothly back
        adjustPopupHeight();
        // Reset properties for future use
        alertEl.style.opacity = "1";
        alertEl.style.maxHeight = "";
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", function() {
    console.log("DOM fully loaded. Setting up Alerts Popup.");
    
    // Get all needed elements
    const alertsButton = document.getElementById("alerts-button");
    const alertsPopup = document.getElementById("alerts-popup");
    const alertsBlur = document.getElementById("alerts-blur");
    const closeAlertsButton = document.getElementById("close-alerts-popup");
    
    // Function to close the alerts popup
    function closeAlertsPopup() {
        console.log("Closing Alerts Popup");
        alertsPopup.classList.remove("show");
        alertsPopup.classList.add("hide");
        alertsBlur.style.opacity = "0";
        
        setTimeout(() => {
            alertsPopup.style.display = "none";
            alertsBlur.style.display = "none";
        }, 300);
    }
    
    // Check if all elements exist before adding event listeners
    if (alertsButton && alertsPopup && alertsBlur && closeAlertsButton) {
        // Prevent clicks inside the popup from closing it
        alertsPopup.addEventListener("click", function(event) {
            event.stopPropagation();
        });
        
        // Clicking on the blur overlay closes the popup
        alertsBlur.addEventListener("click", function(event) {
            event.stopPropagation();
            closeAlertsPopup();
        });
        
        // Clicking the alerts button opens the popup
        alertsButton.addEventListener("click", function(event) {
            event.stopPropagation();
            console.log("Opening Alerts Popup");
            
            alertsPopup.style.display = "block";
            alertsBlur.style.display = "block";
            
            // Force reflow to ensure transitions work properly
            alertsPopup.offsetWidth;
            alertsBlur.offsetWidth;
            
            alertsPopup.classList.add("show");
            alertsPopup.classList.remove("hide");
            alertsBlur.style.opacity = "1";
        });
        
        // Clicking the X button closes the popup
        closeAlertsButton.addEventListener("click", function(event) {
            event.stopPropagation();
            closeAlertsPopup();
        });
    } else {
        // Log errors if any elements are missing
        if (!alertsButton) console.error("Alerts button (#alerts-button) not found.");
        if (!alertsPopup) console.error("Alerts popup (#alerts-popup) not found.");
        if (!alertsBlur) console.error("Alerts blur overlay (#alerts-blur) not found.");
        if (!closeAlertsButton) console.error("Alerts close button (#close-alerts-popup) not found.");
    }
});
document.addEventListener("DOMContentLoaded", function () {
  const feedbackPopup = document.getElementById("feedback-popup");
  const feedbackBlur = document.getElementById("feedback-blur");
  const closeFeedbackBtn = document.getElementById("close-feedback-popup");
  const feedbackForm = document.getElementById("feedback-form");
  const feedbackContent = document.getElementById("feedback-content");
  const feedbackSuccess = document.getElementById("feedback-success");

  const emailInput = document.getElementById("email");
  const messageInput = document.getElementById("message");
  const emailError = document.getElementById("email-error");
  const messageError = document.getElementById("message-error");

  // Inline validation for email field.
  emailInput.addEventListener("input", function () {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(emailInput.value.trim())) {
      hideError(emailInput, emailError);
    } else {
      showError(emailInput, emailError);
    }
  });

  // Inline validation for message field.
  messageInput.addEventListener("input", function () {
    if (messageInput.value.trim() !== "") {
      hideError(messageInput, messageError);
    } else {
      showError(messageInput, messageError);
    }
  });

  // Prevent clicks inside the popup from closing it.
  feedbackPopup.addEventListener("click", function (event) {
    event.stopPropagation();
  });

  // Clicking on the blur overlay closes the popup.
  feedbackBlur.addEventListener("click", function (event) {
    event.stopPropagation();
    if (event.target === feedbackBlur) {
      closeFeedbackPopup();
    }
  });

  // Clicking the X button closes the popup.
  closeFeedbackBtn.addEventListener("click", function (event) {
    event.stopPropagation();
    closeFeedbackPopup();
  });

// When it's time to hide the success screen:
feedbackSuccess.classList.remove("show");
// Listen for the transition end before removing the content
feedbackSuccess.addEventListener("transitionend", function handler() {
  // Remove the content or set display to none so it doesn't briefly reappear
  feedbackSuccess.style.display = "none";
  feedbackSuccess.removeEventListener("transitionend", handler);
});

feedbackForm.addEventListener("submit", function (event) {
  event.preventDefault();
  // Remove any error states first.
  emailError.classList.remove("show");
  messageError.classList.remove("show");
  emailInput.classList.remove("error");
  messageInput.classList.remove("error");

  let valid = true;
  const emailValue = emailInput.value.trim();
  const messageValue = messageInput.value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailValue || !emailRegex.test(emailValue)) {
    showError(emailInput, emailError);
    valid = false;
  }
  if (!messageValue) {
    showError(messageInput, messageError);
    valid = false;
  }
  if (!valid) return;

  const formData = new FormData(feedbackForm);
  fetch(feedbackForm.action, {
    method: feedbackForm.method,
    body: formData,
    headers: { Accept: "application/json" }
  })
    .then((response) => {
      if (response.ok) {
        feedbackForm.reset();
        // Hide the form content.
        feedbackContent.classList.add("hide");
        setTimeout(() => {
          feedbackContent.style.display = "none";
          // Show the success screen.
          feedbackSuccess.style.display = "flex";
          feedbackSuccess.classList.add("show");
          adjustPopupHeight();
          // Wait for a few seconds before fading out the success screen.
          setTimeout(() => {
            hideFeedbackSuccess(() => {
              // Only after the success message is completely faded out, close the popup.
              closeFeedbackPopup();
              // Then restore the form for the next use.
              feedbackContent.classList.remove("hide");
              feedbackContent.style.display = "";
            });
          }, 3000);  // Adjust display time as desired.
        }, 300);
      } 
      
    
   
adjustPopupHeight();

    });
});

});

async function checkRadarAvailability() {
    try {
        const response = await fetch("https://api.weather.gov/");

        // Only show the popup for specific error codes
        const errorCodes = [500, 501, 502, 503, 520];
        if (response.ok && errorCodes.includes(response.status)) {
            showRadarError(response.status);
        }
    } catch (error) {
        // Do nothing for connection issues or network failures
        console.log("Network error occurred, but will not show radar popup.");
    }
}

function showRadarError(statusCode) {
    const radarPopup = document.getElementById("radar-status-popup");

    radarPopup.innerHTML = `
        <h2><i class="fas fa-times-circle status-icon"></i>Radar not available</h2>
        <p>The hosting server that stores and distributes radar data is currently unavailable with a status code of <b>${statusCode}</b>. All other features are still operational.</p>
    `;

    // Show the popup
    radarPopup.classList.add("visible");

    // Hide after 10 seconds
    setTimeout(() => {
        radarPopup.classList.add("fade-out");
        radarPopup.classList.remove("visible");

        // Ensure it's fully hidden after animation
        setTimeout(() => {
            radarPopup.classList.remove("fade-out");
        }, 300);
    }, 10000);
}

// Run the check when the page loads
window.addEventListener("load", checkRadarAvailability);



function openFeedbackPopup() {
  const popup = document.getElementById("feedback-popup");
  const blur = document.getElementById("feedback-blur");

  popup.style.display = "block";
  blur.style.display = "block";

  setTimeout(() => {
    popup.classList.add("visible");
    blur.classList.add("visible");
  }, 10);
}

function closeFeedbackPopup() {
  const popup = document.getElementById("feedback-popup");
  const blur = document.getElementById("feedback-blur");

  // Remove visible class and add "closing" to trigger fade-down animation
  popup.classList.remove("visible");
  popup.classList.add("closing");
  blur.classList.remove("visible");

  // Wait for animation to complete, then hide popup
  setTimeout(() => {
    popup.style.display = "none";
    blur.style.display = "none";
    popup.classList.remove("closing"); // Reset state for next open
  }, 300); // Matches animation duration
}

document.getElementById("activities-close").addEventListener("click", function() {
    let activitiesSection = document.getElementById("activities-section");
    activitiesSection.classList.add("fade-out");

    // Optional: Remove from DOM after animation
    setTimeout(() => {
        activitiesSection.style.display = "none";
    }, 300);
});





function hideFeedbackSuccess(callback) {
  const feedbackSuccess = document.getElementById("feedback-success");
  // Trigger fade-out
  feedbackSuccess.classList.remove("show");
  feedbackSuccess.addEventListener("transitionend", function handler() {
    feedbackSuccess.style.display = "none";
    feedbackSuccess.removeEventListener("transitionend", handler);
    if (callback) callback();
  });
}



function handleKeyboardResize() {
  const popup = document.getElementById("feedback-popup");

  // Detect keyboard open
  window.addEventListener("resize", () => {
    if (window.innerHeight < 500) {  // Approximate keyboard height detection
      document.body.classList.add("keyboard-open");
      popup.style.transform = "translate(-50%, -60%)"; // Move popup up when keyboard opens
    } else {
      document.body.classList.remove("keyboard-open");
      popup.style.transform = "translate(-50%, -50%)"; // Recenter after closing
    }
  });
}

// Run the function to listen for keyboard changes
handleKeyboardResize();

document.addEventListener("focusin", () => {
  // When an input field is focused, prevent the popup from being cut off
  document.body.classList.add("keyboard-open");
});

document.addEventListener("focusout", () => {
  // When input loses focus, restore everything
  document.body.classList.remove("keyboard-open");

  setTimeout(() => {
    window.scrollTo(0, 0); // Reset viewport to prevent weird cutoffs
    const popup = document.getElementById("feedback-popup");
    popup.style.transform = "translate(-50%, -50%)"; // Always recenter
  }, 100);
});




document.addEventListener('DOMContentLoaded', function() {
    // Get the welcome overlay and container elements
    const welcomeOverlay = document.getElementById('welcome-overlay');
    const welcomeContainer = document.querySelector('.welcome-container');
    
    if (welcomeOverlay) {
        // Check if this is the user's first time
        if (localStorage.getItem('welcomeCompleted') !== 'true') {
            // First time user - show the welcome screen
            welcomeOverlay.style.display = 'flex'; // Show the overlay
            
            // Show the container too (needed for small screens)
            if (welcomeContainer) {
                welcomeContainer.style.display = 'block';
            }
            
            document.body.classList.add('welcome-overlay-visible');
        } else {
            // Returning user - make sure overlay is completely removed
            welcomeOverlay.remove();
            return; // Exit early - no need to set up event listeners
        }
    }
    
    
    // Rest of welcome screen code
    const pages = document.querySelectorAll('.welcome-page');
    const dots = document.querySelectorAll('.page-dot');
    const nextButton = document.getElementById('next-welcome');
    const skipButton = document.getElementById('skip-welcome');
    const finishButton = document.getElementById('finish-welcome');
    let currentPage = 1;
    const totalPages = pages.length;

    // Initialize
    updatePageDisplay();

    // Event listeners
    dots.forEach(dot => {
        dot.addEventListener('click', function() {
            navigateToPage(parseInt(this.dataset.page));
        });
    });

    nextButton.addEventListener('click', function() {
        if (currentPage < totalPages) {
            navigateToPage(currentPage + 1);
        }
    });
    
    // Mark as completed when user skips
    skipButton.addEventListener('click', function() {
        localStorage.setItem('welcomeCompleted', 'true');
        closeWelcome();
    });
    
    // Mark as completed when user finishes all pages
    finishButton.addEventListener('click', function() {
        localStorage.setItem('welcomeCompleted', 'true');
        closeWelcome();
    });

    function navigateToPage(newPage) {
        if (newPage === currentPage) return;
        
        // Add leaving animation to current page
        const currentPageElement = document.querySelector(`.welcome-page[data-page="${currentPage}"]`);
        currentPageElement.classList.add('leaving');
        
        // After animation finishes, switch pages
        setTimeout(() => {
            currentPageElement.classList.remove('active', 'leaving');
            currentPage = newPage;
            updatePageDisplay();
        }, 500);
    }

    function updatePageDisplay() {
        // Update pages
        pages.forEach(page => {
            if (parseInt(page.dataset.page) === currentPage) {
                page.classList.add('active');
            }
        });

        // Update pagination dots
        dots.forEach(dot => {
            dot.classList.remove('active');
        });
        const activeDot = document.querySelector(`.page-dot[data-page="${currentPage}"]`);
        if (activeDot) activeDot.classList.add('active');

        // Show/hide skip button based on page
        if (currentPage === totalPages) {
            skipButton.style.display = 'none';
        } else {
            skipButton.style.display = 'flex';
        }

        // Show/hide next button based on page
        if (currentPage === totalPages) {
            nextButton.style.display = 'none';
        } else {
            nextButton.style.display = 'flex';
        }
    }

    function closeWelcome() {
        welcomeOverlay.style.opacity = '0';
        welcomeOverlay.style.transition = 'opacity 0.5s ease';
        
        // Remove from DOM after animation
        setTimeout(() => {
            welcomeOverlay.remove();
        }, 500);
    }
});




const sideMenu = document.getElementById("side-menu"),
    sideMenuOverlay = document.getElementById("side-menu-overlay"),
    menuToggleBtn = document.getElementById("menu-toggle");

function openSideMenu() {
    sideMenu.classList.remove("hide");
    sideMenuOverlay.classList.remove("hide");
    sideMenu.style.display = "";
    sideMenuOverlay.style.display = "";
    sideMenu.classList.add("show");
    sideMenuOverlay.classList.add("show");
}

function closeSideMenu() {
    sideMenu.classList.remove("show");
    sideMenu.classList.add("hide");
    sideMenuOverlay.classList.remove("show");
    sideMenuOverlay.classList.add("hide");
    setTimeout(() => {
        sideMenu.classList.contains("hide") && (sideMenu.style.display = "none");
        sideMenuOverlay.classList.contains("hide") && (sideMenuOverlay.style.display = "none");
    }, 300);
}

function toggleSideMenu() {
    sideMenu.classList.contains("show") ? closeSideMenu() : openSideMenu();
}

menuToggleBtn.addEventListener("click", e => {
    e.stopPropagation();
    toggleSideMenu();
});

document.addEventListener("click", e => {
    sideMenu.classList.contains("show") && !sideMenu.contains(e.target) && e.target !== menuToggleBtn && closeSideMenu();
});

const headerCloseButton = document.querySelector("#side-menu-header button");
let start, end, box;

headerCloseButton.addEventListener("click", e => {
    e.stopPropagation();
    closeSideMenu();
});

document.addEventListener("DOMContentLoaded", function() {
    console.log("DOM fully loaded. Setting up Mapping Popup.");
    const mappingButton = document.getElementById("mapping-button"),
        mappingPopup = document.getElementById("mapping-popup"),
        mappingBlur = document.getElementById("mapping-blur"),
        closeMapping = document.getElementById("close-mapping-popup");

    function closeMappingPopup() {
        console.log("Closing Mapping Popup");
        mappingPopup.classList.remove("show");
        mappingPopup.classList.add("hide");
        mappingBlur.style.opacity = "0";
        setTimeout(() => {
            mappingPopup.style.display = "none";
            mappingBlur.style.display = "none";
        }, 300);
    }

    if (mappingButton && mappingPopup && mappingBlur && closeMapping) {
        mappingPopup.addEventListener("click", function(e) {
            e.stopPropagation();
        });
        
        mappingBlur.addEventListener("click", function(e) {
            e.stopPropagation();
            closeMappingPopup();
        });
        
        mappingButton.addEventListener("click", function(e) {
            e.stopPropagation();
            console.log("Opening Mapping Popup");
            mappingPopup.style.display = "block";
            mappingBlur.style.display = "block";
            mappingPopup.offsetWidth;
            mappingBlur.offsetWidth;
            mappingPopup.classList.add("show");
            mappingPopup.classList.remove("hide");
            mappingBlur.style.opacity = "1";
        });
        
        closeMapping.addEventListener("click", function(e) {
            e.stopPropagation();
            closeMappingPopup();
        });
    } else {
        if (!mappingButton) console.error("Mapping button (#mapping-button) not found.");
        if (!mappingPopup) console.error("Mapping popup (#mapping-popup) not found.");
        if (!mappingBlur) console.error("Mapping blur overlay (#mapping-blur) not found.");
        if (!closeMapping) console.error("Mapping close button (#close-mapping-popup) not found.");
    }
});

document.addEventListener("DOMContentLoaded", function() {
    const legalPopup = document.getElementById("legal-popup"),
        legalBlur = document.getElementById("legal-blur"),
        legalBtn = document.getElementById("legal-btn"),
        closeLegalBtn = document.getElementById("close-legal-btn");

    function closeLegalPopup() {
        legalPopup.classList.remove("visible");
        legalPopup.classList.add("closing");
        legalBlur.classList.remove("visible");
        setTimeout(() => {
            legalPopup.style.display = "none";
            legalBlur.style.display = "none";
            legalPopup.classList.remove("closing");
        }, 300);
    }

    legalBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        legalPopup.style.display = "block";
        legalBlur.style.display = "block";
        setTimeout(() => {
            legalPopup.classList.add("visible");
            legalBlur.classList.add("visible");
        }, 10);
    });

    closeLegalBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        closeLegalPopup();
    });

    legalBlur.addEventListener("click", function(e) {
        e.stopPropagation();
        closeLegalPopup();
    });

    legalPopup.addEventListener("click", function(e) {
        e.stopPropagation();
    });
});

document.addEventListener("DOMContentLoaded", function() {
    const layersMenuItem = document.querySelector(".side-menu-item:nth-child(2)"),
        layersSubmenu = document.getElementById("layers-submenu"),
        closeLayersBtn = document.getElementById("layers-submenu-close"),
        backBtn = document.getElementById("layers-submenu-back"),
        layersLegalBtn = document.getElementById("layers-legal-btn");

    // Modified: from main menu to layers menu
    layersMenuItem.addEventListener("click", function(e) {
        e.stopPropagation();
        
        // Keep the main blur overlay visible
        // Just hide the main side menu
        sideMenu.classList.remove("show");
        sideMenu.classList.add("hide");
        
        setTimeout(() => {
            // Show the layers menu with the same blur overlay
            layersSubmenu.classList.remove("hide");
            layersSubmenu.style.display = "";
            layersSubmenu.classList.add("show");
            
            setTimeout(() => {
                if (sideMenu.classList.contains("hide")) {
                    sideMenu.style.display = "none";
                }
            }, 150);
        }, 150);
    });

    // When X is clicked on layers menu
    closeLayersBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        
        // Hide the layers menu and the blur overlay
        layersSubmenu.classList.remove("show");
        layersSubmenu.classList.add("hide");
        sideMenuOverlay.classList.remove("show");
        sideMenuOverlay.classList.add("hide");
        
        setTimeout(() => {
            layersSubmenu.style.display = "none";
            sideMenuOverlay.style.display = "none";
        }, 300);
    });

    // Modified: from layers menu back to main menu
    backBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        
        // Hide layers submenu but keep blur overlay
        layersSubmenu.classList.remove("show");
        layersSubmenu.classList.add("hide");
        
        setTimeout(() => {
            // Show main menu with the overlay still visible
            sideMenu.style.display = "";
            sideMenu.classList.remove("hide");
            sideMenu.classList.add("show");
            
            setTimeout(() => {
                if (layersSubmenu.classList.contains("hide")) {
                    layersSubmenu.style.display = "none";
                }
            }, 150);
        }, 150);
    });

    // When clicking on the overlay while layers menu is open
    sideMenuOverlay.addEventListener("click", function(e) {
        if (layersSubmenu.classList.contains("show")) {
            // Hide both the layers menu and the blur overlay
            layersSubmenu.classList.remove("show");
            layersSubmenu.classList.add("hide");
            sideMenuOverlay.classList.remove("show");
            sideMenuOverlay.classList.add("hide");
            
            setTimeout(() => {
                layersSubmenu.style.display = "none";
                sideMenuOverlay.style.display = "none";
            }, 300);
        }
    });

    layersLegalBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        const legalPopup = document.getElementById("legal-popup"),
            legalBlur = document.getElementById("legal-blur");
        legalPopup.style.display = "block";
        legalBlur.style.display = "block";
        setTimeout(() => {
            legalPopup.classList.add("visible");
            legalBlur.classList.add("visible");
        }, 10);
    });
});


document.addEventListener("DOMContentLoaded", function() {
    // Get all needed elements
    const faqButton = document.querySelector('.side-menu-item:nth-child(7)'); // The Frequently Asked menu item
    const faqPopup = document.getElementById("faq-popup");
    const faqBlur = document.getElementById("faq-blur");
    const closeFaqButton = document.getElementById("close-faq-popup");
    const faqItems = document.querySelectorAll(".faq-item");
    
    // Function to show FAQ items
    function showFaqItems() {
        faqItems.forEach(item => {
            item.style.display = "block";
        });
    }
    
    // Function to hide FAQ items
    function hideFaqItems() {
        faqItems.forEach(item => {
            item.style.display = "none";
        });
    }
    
    // Function to close the FAQ popup
    function closeFaqPopup() {
        console.log("Closing FAQ Popup");
        faqPopup.classList.remove("show");
        faqPopup.classList.add("hide");
        faqBlur.style.opacity = "0";
        
        setTimeout(() => {
            faqPopup.style.display = "none";
            faqBlur.style.display = "none";
            // Hide FAQ items again to prevent flashing on next load
            hideFaqItems();
        }, 300);
    }
    
    // Check if all elements exist before adding event listeners
    if (faqButton && faqPopup && faqBlur && closeFaqButton) {
        // Prevent clicks inside the popup from closing it
        faqPopup.addEventListener("click", function(event) {
            event.stopPropagation();
        });
        
        // Clicking on the blur overlay closes the popup
        faqBlur.addEventListener("click", function(event) {
            event.stopPropagation();
            closeFaqPopup();
        });
        
        // Clicking the FAQ button opens the popup
        faqButton.addEventListener("click", function(event) {
            event.stopPropagation();
            console.log("Opening FAQ Popup");
            
            // Show the FAQ popup
            faqPopup.style.display = "block";
            faqBlur.style.display = "block";
            
            // Force reflow to ensure transitions work properly
            faqPopup.offsetWidth;
            faqBlur.offsetWidth;
            
            // Show the FAQ items before animation starts
            showFaqItems();
            
            faqPopup.classList.add("show");
            faqPopup.classList.remove("hide");
            faqBlur.style.opacity = "1";
        });
        
        // Clicking the X button closes the popup
        closeFaqButton.addEventListener("click", function(event) {
            event.stopPropagation();
            closeFaqPopup();
        });
    } else {
        // Log errors if any elements are missing
        if (!faqButton) console.error("FAQ button not found.");
        if (!faqPopup) console.error("FAQ popup not found.");
        if (!faqBlur) console.error("FAQ blur overlay not found.");
        if (!closeFaqButton) console.error("FAQ close button not found.");
    }
});




// -------------------- NOAA METAR FETCH & INCREMENTAL UPDATE --------------------
map.on('load', function() {
  // Define an inline SVG for a white circle (SDF image)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <circle cx="16" cy="16" r="14" fill="white" />
  </svg>`;
  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

  // Create an Image object to load the SVG
  const img = new Image();
  img.onload = function() {
    if (!map.hasImage('circle-icon')) {
      map.addImage('circle-icon', img, { sdf: true });
    }
    
    // Create an empty GeoJSON source to be updated incrementally
    map.addSource('noaa-all', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      generateId: true
    });
    
map.addLayer({
  id: 'noaa-all-symbols',
  type: 'symbol',
  source: 'noaa-all',
  layout: {
    "visibility": "none",  
    'icon-image': 'circle-icon',
    'icon-size': 0.7,    // smaller, so the white ring shows
    'icon-allow-overlap': false,
    'text-field': [
      'to-string',
      ['round', ['to-number', ['get', 'temperature']]]
    ],
    'text-font': ['Inter Bold'],
    'text-size': 10,
    'text-offset': [0, 0],
    'text-anchor': 'center',
    'text-allow-overlap': false
  },
  paint: {
    'icon-color': [
      'interpolate',
      ['linear'],
      ['to-number', ['get', 'temperature']],
      -20, "#800080",
      0, "#00008B",
      20, "#1E90FF",
      50, "#32CD32",
      70, "#FFFF00",
      85, "#FFA500",
      95, "#FF4500",
      105, "#FF0000",
      120, "#8B0000"
    ],
    'text-color': '#ffffff',
    'text-halo-color': '#000000',
    'text-halo-width': 1
  }
});

    
    // Define a function to fetch NOAA data.
    function fetchNOAAData() {
      const layers = [10, 20, 30, 40, 50, 60];
      // Request only necessary fields and reduce geometry precision.
     // Request necessary fields, *including timeobs*
const fetchOptions = "&outFields=temperature,stationname,dewpoint,winddir,windspeed,visibility,rawdata,timeobs&f=geojson&geometryPrecision=5";
      let combinedFeatures = [];
      
      layers.forEach(layer => {
        const url = `https://mapservices.weather.noaa.gov/vector/rest/services/obs/surface_obs/MapServer/${layer}/query?where=1%3D1${fetchOptions}`;
        fetch(url)
          .then(response => response.json())
          .then(result => {
            if (result.features && result.features.length) {
              // Filter out features with no temperature or temperature of 0.
              const newFeatures = result.features.filter(feature => {
                const temp = feature.properties.temperature;
                return temp !== null && temp !== undefined && Number(temp) !== 0;
              });
              combinedFeatures = combinedFeatures.concat(newFeatures);
              // Update the source incrementally.
              map.getSource('noaa-all').setData({
                type: 'FeatureCollection',
                features: combinedFeatures
              });
            }
          })
          .catch(error => console.error('Error fetching NOAA data for layer ' + layer + ':', error));
      });
    }
    
    // Call the NOAA fetch immediately on load, then update every 5 minutes.
    fetchNOAAData();
    setInterval(fetchNOAAData, 100000);
  };
  
  img.src = dataUrl;
});

function showMetarPopup() {
  const popup = document.getElementById('metar-popup');
  const blur = document.getElementById('metar-blur');

  // 1) Make both visible in the DOM (but still fully transparent)
  popup.style.display = 'block';
  blur.style.display = 'block';

  // Position the popup slightly below center, invisible
  popup.style.opacity = 0;
  popup.style.transform = 'translate(-50%, calc(-50% + 10px))';

  // Blur also starts at opacity = 0 (set in CSS)
  blur.style.opacity = 0;

  // 2) Force reflow so the browser registers the starting state
  popup.offsetHeight;  // or blur.offsetWidth; either triggers reflow

  // 3) Animate to final positions
  setTimeout(() => {
    popup.style.opacity = 1;
    popup.style.transform = 'translate(-50%, -50%)';

    blur.style.opacity = 1; // fade in the blur
  }, 10);
}

function hideMetarPopup() {
  const popup = document.getElementById('metar-popup');
  const blur = document.getElementById('metar-blur');

  // Fade popup down to 0 opacity, shift slightly
  popup.style.opacity = 0;
  popup.style.transform = 'translate(-50%, calc(-50% + 10px))';

  // Fade out the blur as well
  blur.style.opacity = 0;

  // After the transition (0.3s), set display: none
  setTimeout(() => {
    popup.style.display = 'none';
    blur.style.display = 'none';
  }, 300); // match your transition duration
}


// -------------------- TOGGLE LOGIC (RADAR, WEATHER RADIOS, & METAR) --------------------

// If no stored values exist, initialize them.
if (localStorage.getItem('metarVisibility') === null) {
  localStorage.setItem('metarVisibility', 'none');
  localStorage.setItem('metarChecked', 'false');
}
if (localStorage.getItem('metarsMarkers') === null) {
  localStorage.setItem('metarsMarkers', 'false');
}

// Reads the stored "metarVisibility" and applies it to the METAR layer.
function applyMetarState() {
  const metarVisibility = localStorage.getItem('metarVisibility') || 'none';
  if (map.getLayer('noaa-all-symbols')) {
    map.setLayoutProperty('noaa-all-symbols', 'visibility', metarVisibility);
  }
}

// Waits until the METAR layer is available, then applies the stored state
function restoreMetarLayerState() {
  if (map.getLayer('noaa-all-symbols')) {
    const metarsMarkers = localStorage.getItem('metarsMarkers') || 'false';
    map.setLayoutProperty('noaa-all-symbols', 'visibility', metarsMarkers === 'true' ? 'visible' : 'none');

    const metarToggle = document.getElementById('metar-toggle');
    if (metarToggle) {
      metarToggle.querySelector('.menu-item-check').style.display = metarsMarkers === 'true' ? 'block' : 'none';
    }
  } else {
    setTimeout(restoreMetarLayerState, 500);
  }
}
map.on('load', restoreMetarLayerState);

// Toggle radar markers, hide METAR if markers are on
document.getElementById('toggle-markers').addEventListener('click', () => {
  markersVisible = !markersVisible;
  setMarkerVisibility(markersVisible);

  if (map.getLayer('mping-reports-layer')) {
    map.setLayoutProperty('mping-reports-layer', 'visibility', markersVisible ? 'none' : 'visible');
  }
  if (map.getLayer('weather-radio-layer')) {
    map.setLayoutProperty('weather-radio-layer', 'visibility', markersVisible ? 'none' : 'visible');
  }
  
  if (map.getLayer('noaa-all-symbols')) {
    if (markersVisible) {
      map.setLayoutProperty('noaa-all-symbols', 'visibility', 'none');
    } else {
      applyMetarState();
    }
  }
});

function formatMetarDate(epoch) {
  if (!epoch) return "--";
  const dateObj = new Date(Number(epoch));
  const options = {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  };
  return dateObj.toLocaleString('en-US', options);
}
/**
 * Returns an 8-point cardinal direction (e.g. "Southwest") 
 * for the given wind direction in degrees.
 */
function getCardinalDirection(deg) {
  // Normalize degrees to 0..359
  deg = ((deg % 360) + 360) % 360;

  // We'll break 360° into 8 segments of 45° each.
  // Add 22.5 so each segment centers nicely, then floor the result.
  const directions = [
    "North",      // 0   - 44.999...
    "Northeast",  // 45  - 89.999...
    "East",       // 90  - 134.999...
    "Southeast",  // 135 - 179.999...
    "South",      // 180 - 224.999...
    "Southwest",  // 225 - 269.999...
    "West",       // 270 - 314.999...
    "Northwest"   // 315 - 359.999...
  ];
  
  // e.g. if deg=250 -> offset by +22.5 => 272.5 => floor(272.5/45)=6 => "West"
  // But we want 225..274.999 => "Southwest". So let's see:
  // Using +22.5 => 250 +22.5=272.5 => 272.5/45=6.05 => floor=6 => "West"
  // Actually we want 225..  then let's adjust logic slightly:
  // We'll do (deg + 22.5) % 360 => /45 => floor => index
  let index = Math.floor((deg + 22.5) / 45) % 8;
  return directions[index];
}



function rotateArrowClockwise(newDir) {
  const arrow = document.getElementById('wind-arrow');
  // Immediately set the arrow rotation without any animation or spinning
  arrow.style.transform = `rotate(${Number(newDir) || 0}deg)`;
}



// Gradient interpolation for temperature colors
function getTempColor(tempValue) {
  const t = Number(tempValue);

  // Define the color stops
  const stops = [
    { t: -20, color: "#800080" },
    { t: 0,   color: "#00008B" },
    { t: 20,  color: "#1E90FF" },
    { t: 50,  color: "#32CD32" },
    { t: 70,  color: "#FFFF00" },
    { t: 85,  color: "#FFA500" },
    { t: 95,  color: "#FF4500" },
    { t: 105, color: "#FF0000" },
    { t: 120, color: "#8B0000" }
  ];

  // Clamp the value if it's outside our range
  if (t <= stops[0].t) return stops[0].color;
  if (t >= stops[stops.length - 1].t) return stops[stops.length - 1].color;

  // Find the two stops between which t falls
  let lowerStop, upperStop;
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t < stops[i + 1].t) {
      lowerStop = stops[i];
      upperStop = stops[i + 1];
      break;
    }
  }

  // Calculate the interpolation ratio between the two stops
  const ratio = (t - lowerStop.t) / (upperStop.t - lowerStop.t);

  // Helper function to convert a hex color to an RGB object
  function hexToRgb(hex) {
    hex = hex.replace("#", "");
    const bigint = parseInt(hex, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255
    };
  }

  // Helper function to convert an RGB object to a hex string
  function rgbToHex(r, g, b) {
    return (
      "#" +
      [r, g, b]
        .map(x => {
          const hex = x.toString(16);
          return hex.length === 1 ? "0" + hex : hex;
        })
        .join("")
    );
  }

  // Convert the two hex colors to RGB
  const lowerRGB = hexToRgb(lowerStop.color);
  const upperRGB = hexToRgb(upperStop.color);

  // Interpolate each color channel
  const r = Math.round(lowerRGB.r + (upperRGB.r - lowerRGB.r) * ratio);
  const g = Math.round(lowerRGB.g + (upperRGB.g - lowerRGB.g) * ratio);
  const b = Math.round(lowerRGB.b + (upperRGB.b - lowerRGB.b) * ratio);

  return rgbToHex(r, g, b);
}


map.on('click', 'noaa-all-symbols', function(e) {
  const features = map.queryRenderedFeatures(e.point, { layers: ['noaa-all-symbols'] });
  if (!features.length) return;

  const f = features[0];
  const stationName = f.properties.stationname || "Unknown Station";
  const stationTemp = f.properties.temperature || "--";
  const dewPoint = f.properties.dewpoint || "--";
  const windSpeed = f.properties.windspeed || "--";
  const windDir = f.properties.winddir || 0;
  const directionText = getCardinalDirection(windDir);
  const timeObs = f.properties.timeobs;
  const rawData = f.properties.rawdata || "No Data";
  
  // ** Get visibility value **
  const visValue = f.properties.visibility || "--";
  
  document.getElementById('wind-arrow-container').style.display = 'block';

  // Delay arrow animation if desired
  setTimeout(() => {
    rotateArrowClockwise(windDir);
  }, 0);

  // Title
  document.querySelector('#metar-popup .metar-popup-title').textContent =
    `METAR Station (${stationName})`;

  // Temp box
const tempBox = document.getElementById('metar-temp-box');
tempBox.textContent = `Temperature: ${stationTemp}°F`;
tempBox.style.backgroundColor = getTempColor(stationTemp);

// Set text color to black if temperature is between 55°F and 80°F; otherwise, white
if (stationTemp >= 55 && stationTemp <= 80) {
  tempBox.style.webkitTextFillColor = "#000"; // black text for WebKit browsers
  tempBox.style.color = "#000";              // fallback for other browsers
} else {
  tempBox.style.webkitTextFillColor = "#fff"; // white text
  tempBox.style.color = "#fff";
}



  // Data rows
  document.getElementById('metar-time').textContent = formatMetarDate(timeObs);
  document.getElementById('metar-dewpoint').textContent = dewPoint + "°F";

  // ** Set the visibility line **
  document.getElementById('metar-visibility').textContent = visValue + " mi";

  document.getElementById('metar-windspeed').textContent = windSpeed + " mph";
  document.getElementById('metar-winddir').textContent = `${directionText} (${windDir}°)`;
  
  document.getElementById('metar-rawdata').textContent = rawData;

  // Show popup
  showMetarPopup();
});


// Close the popup
document.getElementById('close-metar-popup').addEventListener('click', hideMetarPopup);
document.getElementById('metar-blur').addEventListener('click', hideMetarPopup);

// METAR Toggle
document.getElementById('metar-toggle').addEventListener('click', function() {
  const metarLayerId = 'noaa-all-symbols';
  if (!map.getLayer(metarLayerId)) return;
  
  let currentState = localStorage.getItem('metarVisibility') || 'none';
  let newState = currentState === 'visible' ? 'none' : 'visible';
  
  localStorage.setItem('metarVisibility', newState);
  localStorage.setItem('metarChecked', newState === 'visible' ? 'true' : 'false');
  localStorage.setItem('metarsMarkers', newState === 'visible' ? 'true' : 'false');
  
  const metarToggle = this.querySelector('.menu-item-check');
  metarToggle.style.display = newState === 'visible' ? 'block' : 'none';

  if (!markersVisible) {
    map.setLayoutProperty(metarLayerId, 'visibility', newState);
  }
});

map.on('mouseenter', 'noaa-all-symbols', function() {
  map.getCanvas().style.cursor = 'pointer';
});

map.on('mouseleave', 'noaa-all-symbols', function() {
  map.getCanvas().style.cursor = '';
});


// Reference elements
const drawingControls = document.getElementById("drawing-controls");
const colorPicker = document.getElementById("drawing-color");
const brushSizeSlider = document.getElementById("brush-size");
const closeButton = document.getElementById("close-drawing");
const deleteButton = document.getElementById("delete-drawing");
const undoButton = document.getElementById("undo-drawing");
const redoButton = document.getElementById("redo-drawing");
const circleMenuPopup = document.getElementById("circle-menu-popup");

// Create main and offscreen (buffer) canvas
const drawCanvas = document.createElement("canvas");
const bufferCanvas = document.createElement("canvas"); // Offscreen buffer
drawCanvas.id = "drawing-canvas";

drawCanvas.style.position = "absolute";
drawCanvas.style.top = "0";
drawCanvas.style.left = "0";
drawCanvas.style.width = "100%";
drawCanvas.style.height = "100%";
drawCanvas.style.pointerEvents = "none";
document.body.appendChild(drawCanvas);

// Canvas contexts
const ctx = drawCanvas.getContext("2d");
const bufferCtx = bufferCanvas.getContext("2d");

let isDrawing = false;
let drawColor = "#7F1DF0";
let brushSize = 5;
let paths = [];
let undonePaths = [];

let lastX, lastY; // Store last coordinates
const minDistance = 2; // Minimum distance to record movement

// Resize canvases
function resizeCanvas() {
    drawCanvas.width = window.innerWidth;
    drawCanvas.height = window.innerHeight;
    bufferCanvas.width = window.innerWidth;
    bufferCanvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// Enable Drawing Mode
document.getElementById("draw-tool").addEventListener("click", function () {
    enableDrawingMode();
});

// Fix for the drawing controls animation
function enableDrawingMode() {
    drawCanvas.style.pointerEvents = "auto";
    map.getCanvas().style.cursor = "crosshair";

    // First set display to flex but with opacity 0
    drawingControls.style.display = "flex"; 
    
    // Ensure transition is set for both showing and hiding
    drawingControls.style.transition = "opacity 0.3s ease-in-out, transform 0.3s ease-in-out";
    
    // Set initial state (slightly down and transparent)
    drawingControls.style.opacity = "0";
    drawingControls.style.transform = "translateX(-50%) translateY(10px)";

    // Force a reflow to ensure the initial state is rendered
    drawingControls.offsetHeight; 

    // Then animate to final state
    drawingControls.style.opacity = "1";
    drawingControls.style.transform = "translateX(-50%) translateY(0)"; // Centered

    drawingControls.classList.add("active");

    // Hide circle menu popup instantly
    if (circleMenuPopup.style.display !== "none") {
        setTimeout(() => {
            circleMenuPopup.style.display = "none";
        }, 0);
    }
}
function disableDrawingMode() {
    drawingControls.style.transition = "opacity 0.3s ease-out, transform 0.3s ease-in-out";
    drawingControls.style.opacity = "0"; // Fade out
    drawingControls.style.transform = "translateX(-50%) translateY(10px)"; // Move down 10px

    setTimeout(() => {
        drawingControls.style.display = "none"; // Hide after fade-out completes
    }, 300);

    drawCanvas.style.pointerEvents = "none";
    map.getCanvas().style.cursor = "";
}


// Listen for Color Changes
colorPicker.addEventListener("input", (event) => {
    drawColor = event.target.value;
});

// 🎨 Handle Drawing - Works on Desktop AND Mobile
function startDrawing(x, y) {
    isDrawing = true;
    lastX = x;
    lastY = y;

    paths.push({ color: drawColor, size: brushSize, points: [{ x: lastX, y: lastY }] });
    undonePaths = []; // Clear redo history on new draw
}

function draw(x, y) {
    if (!isDrawing) return;

    // Only store if movement is significant
    if (Math.hypot(x - lastX, y - lastY) < minDistance) return;

    paths[paths.length - 1].points.push({ x, y });
    lastX = x;
    lastY = y;

    requestAnimationFrame(() => redrawCanvas());
}

function stopDrawing() {
    isDrawing = false;
}

// **🎯 Add Event Listeners for Desktop (Mouse) and Mobile (Touch)**
drawCanvas.addEventListener("mousedown", (event) => {
    startDrawing(event.clientX, event.clientY);
});

drawCanvas.addEventListener("mousemove", (event) => {
    draw(event.clientX, event.clientY);
});

drawCanvas.addEventListener("mouseup", stopDrawing);
drawCanvas.addEventListener("mouseleave", stopDrawing);

// **📱 Add Touch Support**
drawCanvas.addEventListener("touchstart", (event) => {
    const touch = event.touches[0];
    startDrawing(touch.clientX, touch.clientY);
});

drawCanvas.addEventListener("touchmove", (event) => {
    event.preventDefault(); // Prevent scrolling
    const touch = event.touches[0];
    draw(touch.clientX, touch.clientY);
});

drawCanvas.addEventListener("touchend", stopDrawing);

// 🗑️ Clear Drawing but Keep Drawing Mode
deleteButton.addEventListener("click", () => {
    bufferCtx.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    paths = [];
    undonePaths = [];
});

// 🔙 Undo Function (Limit Stack Size to Reduce Memory)
undoButton.addEventListener("click", () => {
    if (paths.length > 0) {
        undonePaths.push(paths.pop());
        if (undonePaths.length > 20) undonePaths.shift(); // Keep max 20 undos
        redrawCanvas();
    }
});

// 🔄 Redo Function
redoButton.addEventListener("click", () => {
    if (undonePaths.length > 0) {
        paths.push(undonePaths.pop());
        redrawCanvas();
    }
});

// 🖌️ **Function to Redraw Canvas Using Bezier Curves for Smoothness**
function redrawCanvas() {
    bufferCtx.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);

    paths.forEach((path) => {
        let borderSize = Math.max(path.size * 0.6, 2); // Dynamic border size
        let points = path.points;

        if (points.length < 2) return; // Skip single-point paths

        // Draw black border first (Larger Stroke for Outline)
        bufferCtx.beginPath();
        bufferCtx.strokeStyle = "black";
        bufferCtx.lineWidth = parseInt(path.size) + borderSize;
        bufferCtx.lineCap = "round";

        bufferCtx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
            let midX = (points[i].x + points[i + 1].x) / 2;
            let midY = (points[i].y + points[i + 1].y) / 2;
            bufferCtx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
        }
        bufferCtx.stroke();

        // Draw actual colored line on top
        bufferCtx.beginPath();
        bufferCtx.strokeStyle = path.color;
        bufferCtx.lineWidth = path.size;
        bufferCtx.lineCap = "round";

        bufferCtx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
            let midX = (points[i].x + points[i + 1].x) / 2;
            let midY = (points[i].y + points[i + 1].y) / 2;
            bufferCtx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
        }
        bufferCtx.stroke();
    });

    // Copy from buffer to main canvas (Faster)
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    ctx.drawImage(bufferCanvas, 0, 0);
}

// ❌ Close Drawing Mode and Remove Controls (Clears drawings but keeps color)
closeButton.addEventListener("click", () => {
    bufferCtx.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

    paths = [];
    undonePaths = [];

    let lastColor = drawColor;

    disableDrawingMode();

    drawColor = lastColor;
    colorPicker.value = lastColor;
});


function fadeInCircleMenu() {
    circleMenuPopup.style.display = "block"; // Ensure it's visible before applying styles

    // Force a reflow to prevent weird animations
    circleMenuPopup.offsetHeight;

    circleMenuPopup.style.opacity = "1";
    circleMenuPopup.style.transform = "translateY(0)"; // Reset back to normal position
}

function fadeOutCircleMenu() {
    if (circleMenuPopup.style.display !== "none") {
        circleMenuPopup.style.transition = "opacity 0.3s ease-out, transform 0.3s ease-out";
        circleMenuPopup.style.opacity = "0";
        circleMenuPopup.style.transform = "translateY(10px)"; // Moves down 10px

        setTimeout(() => {
            circleMenuPopup.style.display = "none";
            circleMenuPopup.style.transform = "translateY(0)"; // Reset for next use
        }, 300);
    }
}



function toggleDetailPanel() {
  const detailBox = document.getElementById("station-detail-box");

  if (detailBox.classList.contains("visible")) {
    detailBox.classList.remove("visible");
  } else {
    if (window.currentStation && window.currentStation.id && window.currentStation.name) {
      updateDetailPanelContent(window.currentStation);
    } else {
      const stationText = document.getElementById("top-station-id").textContent;
      document.getElementById("station-detail-title").textContent = stationText;
    }

    detailBox.classList.add("visible");

    // ✅ Ensure the panel resizes properly
    detailBox.style.height = "auto";
  }
}


function updateDetailPanelContent(station) {
  if (!station || !station.id || !station.name) return;

  // Extract values correctly from the station object
  const radarType = station.stationType || "Unknown Radar Type";
  const status = station.status || "Unknown";
  const alarmSummary = station.alarmSummary || "No Alarms";
  const avgLatency = station.avgLatency !== "N/A" ? `${station.avgLatency} sec` : "Unknown";
  const transmitPower = station.transmitterPeakPower !== "N/A" ? `${station.transmitterPeakPower} kW` : "Unknown"; 
  const avgTransmitterPower = station.avgTransmitterPower !== "N/A" ? `${station.avgTransmitterPower} watts` : "Unknown"; 
  
 const detailText = `
    <span style="font-weight: bold; font-size: 1.15em; display: flex; align-items: center; margin-bottom: -10px;">
        <i class="fas fa-satellite-dish" style="margin-right: 8px;"></i> Radar ${station.id} in ${station.name}
    </span>
    <br>
    <span style="font-weight: bold;">Status:</span> ${status} <br>
    <span style="font-weight: bold;">Latency:</span> ${avgLatency} <br>
    <span style="font-weight: bold;">Alarms:</span> ${alarmSummary} <br>
    <span style="font-weight: bold;">Transmit Power:</span> ${avgTransmitterPower} <br>

    <!-- Instead of an <hr>, just add a margin -->
    <div style="margin-bottom: 15px;"></div>

    <span style="font-weight: bold; font-size: 1.1em;">
        <i class="fa-solid fa-circle-exclamation" style="margin-right: 5px;"></i> Radar Status Message
    </span>
    <div id="radar-status-message" style="margin-top: 5px; font-size: 0.95em; color: #DDD;">
        Loading radar status...
    </div>
`;


  // Updating the DOM
  document.getElementById('station-detail-title').innerHTML = detailText;
  
  document.getElementById("station-detail-box").style.height = "auto";

  
  loadProd("RDA", station.id);
}




// Add click listeners to the top info elements.
document.getElementById('top-station-id').addEventListener('click', (e) => {
  e.stopPropagation();  // Prevent the click from bubbling up
  toggleDetailPanel();
});

document.getElementById('top-timestamp').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleDetailPanel();
});

// Hide the detail panel if clicking anywhere outside of it.
document.addEventListener('click', (e) => {
  const detailBox = document.getElementById('station-detail-box');
  if (detailBox.classList.contains('visible')) {
    detailBox.classList.remove('visible');
  }
});

// (Optional) Prevent clicks inside the detail panel from closing it.
document.getElementById('station-detail-box').addEventListener('click', (e) => {
  e.stopPropagation();
});


function isoTimeAgo(isoString) {
    const timeAgo = new Date(isoString);
    const now = new Date();
    const diffMs = now - timeAgo;
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

if (diffMinutes < 5) return "Just now";
if (diffMinutes < 60) return `${diffMinutes} min ago`;
if (diffHours < 2) return `${diffHours} hr ago`;
if (diffHours < 24) return `${diffHours} hrs ago`;
if (diffDays < 2) return "1 day ago";
return `${diffDays} days ago`;

}

function loadProd(producttoview, radarId) {
    const producElement = document.getElementById("radar-status-message");

    // Ensure the element exists
    if (!producElement) {
        console.error("Error: Element with ID 'radar-status-message' not found.");
        return;
    }

    producElement.innerHTML = "Loading radar status...";

    if (producttoview === "RDA") {
        fetch(`https://api.weather.gov/products/types/FTM/locations/${radarId.replace("K", "")}`, {
            headers: { 
                'User-Agent': 'Xtreme Weather, https://xtremewx.com', 
                'Accept': 'Application/geo+json' 
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data['@graph'] && data['@graph'][0] && data['@graph'][0]['@id']) {
                return fetch(String(data['@graph'][0]['@id']), { 
                    headers: { 
                        'User-Agent': 'Xtreme Weather, https://xtremewx.com', 
                        'Accept': 'Application/geo+json' 
                    } 
                });
            } else {
                throw new Error("No status messages available for this radar.");
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }
            return response.json();
        })
     .then(data => {
    let messageText = String(data.productText).replace(/\n+/g, "<br>").trim();

    // ✅ Remove everything before and including "Message Date:"
    messageText = messageText.replace(/.*?(Message Date:.*?<br>)/is, "").trim();

    // ✅ Format issued time properly
    const issuedTime = formatTimestamp(data.issuanceTime);
    const issuedAgo = isoTimeAgo(data.issuanceTime);

    // ✅ If there's no message, remove spacing
    if (!messageText || messageText.length < 10) {
        producElement.innerHTML = "";
        return;
    }

    // ✅ Insert only when there is an actual message
    producElement.innerHTML = `
        <p style="margin: 0px; font-size: 14px; color: #FFF;">
            <b>Issued:</b> ${issuedTime} (${issuedAgo})
        </p>
        <div style="margin-top: 5px; font-size: 14px; color: #FFF;">${messageText}</div>
    `;

    producElement.style.height = "auto";
        })
        .catch(error => {
            console.error('Error fetching radar status message:', error);
            producElement.innerHTML = "<span style='color: #FFF;'>There are no recent status messages for this radar, or none could be retrieved due to an error.</span>";
        });
    }
}



// Attach an event listener to ensure clicking works
document.addEventListener("DOMContentLoaded", () => {
    const statusButton = document.getElementById("radar-status-button"); // Replace with the actual button ID

    if (statusButton) {
        statusButton.addEventListener("click", () => {
            loadProd("RDA"); // Ensure it loads the radar status
        });
    } else {
        console.warn("Radar status button not found, ensure the ID is correct.");
    }
});

 document.addEventListener("DOMContentLoaded", function () {
      const controlBar = document.getElementById("control-bar");
      const legendToggle = document.getElementById("legend-toggle");
      const radarLegend = document.getElementById("radar-legend");
      const bottomLayerPopup = document.getElementById("bottom-layer-popup");
      const legendToggleIcon = legendToggle.querySelector("i");
      const circleMenu = document.getElementById("circle-menu");

      // ----------------------------------------------------
      // 1) A helper function to set the circle menu & popup
      //    bottom positions based on screen size & state.
      // ----------------------------------------------------
      function positionCircleMenu(animate = false) {
        let circleMenuBottom, popupBottom;

        if (window.innerWidth > 600) {
          // Over 600px => always "expanded" style for the control bar
          // => circle menu is 5px above the *legend* (combined ~90px), so 95px
          circleMenuBottom = 100;
          // The circle-menu-popup typically sits ~40-45px above that
          // We'll keep the same ~45px gap => 95 + 45 = 140
          popupBottom = 145;
        } else {
          // 600px or below => depends on collapsed or expanded
          if (controlBar.classList.contains("collapsed")) {
            // collapsed => circle menu at 65px, popup at 110px
            circleMenuBottom = 65;
            popupBottom = 110;
          } else {
            // expanded => circle menu at 100px, popup at 145px
            circleMenuBottom = 100;
            popupBottom = 145;
          }
        }

        if (animate) {
          gsap.to(circleMenu, { bottom: circleMenuBottom + "px", duration: 0.3, ease: "power1.out" });
          gsap.to("#circle-menu-popup", { bottom: popupBottom + "px", duration: 0.3, ease: "power1.out" });
        } else {
          gsap.set(circleMenu, { bottom: circleMenuBottom + "px" });
          gsap.set("#circle-menu-popup", { bottom: popupBottom + "px" });
        }
      }

      // ----------------------------------------------------
      // 2) Save/restore the "collapsed/expanded" state
      // ----------------------------------------------------
      function saveState() {
        localStorage.setItem(
          "controlBarState",
          controlBar.classList.contains("collapsed") ? "collapsed" : "expanded"
        );
      }

      function restoreState() {
        const savedState = localStorage.getItem("controlBarState");
        // If "expanded", do expanded. Otherwise, default to collapsed.
        if (savedState === "expanded") {
          controlBar.classList.remove("collapsed");
          gsap.set(radarLegend, { opacity: 1, maxHeight: "35px", visibility: "visible" });
          gsap.set(bottomLayerPopup, { bottom: "95px" });
          gsap.set(legendToggleIcon, { rotation: 0 });
        } else {
          controlBar.classList.add("collapsed");
          gsap.set(radarLegend, { opacity: 0, maxHeight: 0, visibility: "hidden" });
          gsap.set(bottomLayerPopup, { bottom: "62px" });
          gsap.set(legendToggleIcon, { rotation: 180 });
        }
        // Set circle menu position (no animation on initial load)
        positionCircleMenu(false);
      }

      // ----------------------------------------------------
      // 3) Toggling the legend on smaller screens
      // ----------------------------------------------------
      function toggleLegend() {
        const isCollapsed = controlBar.classList.toggle("collapsed");
        saveState();

        if (isCollapsed) {
          // Collapse animation
          gsap.to(controlBar, { height: "55px", duration: 0.3, ease: "power1.out" });
          gsap.to(radarLegend, {
            opacity: 0,
            maxHeight: 0,
            duration: 0.3,
            ease: "power1.out",
            onStart: () => { radarLegend.style.visibility = "visible"; },
            onComplete: () => { radarLegend.style.visibility = "hidden"; }
          });
          gsap.to(bottomLayerPopup, { bottom: "60px", duration: 0.3, ease: "power1.out" });
          gsap.to(legendToggleIcon, { rotation: 180, duration: 0.2, ease: "power1.out" });

        } else {
          // Expand animation
          radarLegend.style.visibility = "visible";
          gsap.to(controlBar, { height: "90px", duration: 0.3, ease: "power1.out" });
          gsap.to(radarLegend, {
            opacity: 1,
            maxHeight: "35px",
            duration: 0.3,
            ease: "power1.out"
          });
          gsap.to(bottomLayerPopup, { bottom: "95px", duration: 0.3, ease: "power1.out" });
          gsap.to(legendToggleIcon, { rotation: 0, duration: 0.3, ease: "power1.out" });
        }

        // After animations, position circle menu & popup accordingly (with animation)
        positionCircleMenu(true);
      }

      legendToggle.addEventListener("click", toggleLegend);

      // ----------------------------------------------------
      // 4) Force "expanded" style on wide screens
      //    or restore the localStorage state on smaller screens
      // ----------------------------------------------------
      function checkScreenSize() {
        if (window.innerWidth > 600) {
          // Over 600px => forcibly expanded
          controlBar.classList.remove("collapsed");
          saveState(); // so next time, localStorage says "expanded"

          // Animate control bar & legend so they're "expanded"
          gsap.to(controlBar, { height: "55px", duration: 0.3, ease: "power1.out" });
          gsap.to(radarLegend, {
            opacity: 1,
            maxHeight: "35px",
            visibility: "visible",
            duration: 0.3,
            ease: "power1.out"
          });
          gsap.to(bottomLayerPopup, { bottom: "62px", duration: 0.3, ease: "power1.out" });
          gsap.to(legendToggleIcon, { rotation: 0, duration: 0.3, ease: "power1.out" });

          // Then re-position the circle menu (with animation)
          positionCircleMenu(true);

        } else {
          // 600px or below => revert to localStorage state
          const savedState = localStorage.getItem("controlBarState");

          // If collapsed
          if (savedState === "collapsed") {
            controlBar.classList.add("collapsed");
            gsap.to(controlBar, { height: "55px", duration: 0.3, ease: "power1.out" });
            gsap.to(radarLegend, {
              opacity: 0,
              maxHeight: 0,
              duration: 0.3,
              ease: "power1.out",
              onStart: () => { radarLegend.style.visibility = "visible"; },
              onComplete: () => { radarLegend.style.visibility = "hidden"; }
            });
            gsap.to(bottomLayerPopup, { bottom: "62px", duration: 0.3, ease: "power1.out" });
            gsap.to(legendToggleIcon, { rotation: 180, duration: 0.3, ease: "power1.out" });
          } else {
            // Otherwise expanded
            controlBar.classList.remove("collapsed");
            gsap.to(controlBar, { height: "90px", duration: 0.3, ease: "power1.out" });
            gsap.to(radarLegend, {
              opacity: 1,
              maxHeight: "35px",
              duration: 0.3,
              ease: "power1.out"
            });
            gsap.to(bottomLayerPopup, { bottom: "95px", duration: 0.3, ease: "power1.out" });
            gsap.to(legendToggleIcon, { rotation: 0, duration: 0.3, ease: "power1.out" });
          }

          // Finally, position circle menu (with animation)
          positionCircleMenu(true);
        }
      }

      // 5) Restore any prior state on first load and adjust for screen
      restoreState();
      checkScreenSize();

      // Re-check on resize
      window.addEventListener("resize", checkScreenSize);
    });


    // -------------------------------------------------------
    // 6) Circle Menu Popup code (same as before)
    // -------------------------------------------------------
    document.addEventListener("DOMContentLoaded", function () {
      const circleMenu = document.getElementById("circle-menu");
      const circleMenuPopup = document.getElementById("circle-menu-popup");
      
      let popupVisible = false;

      // Function to show the popup with a fade-up effect
      function showPopup() {
        // Make the element visible before animating
        circleMenuPopup.style.display = "block";
        gsap.fromTo(circleMenuPopup,
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.3, ease: "power1.out" }
        );
        popupVisible = true;
      }

      // Function to hide the popup with a fade-down effect
      function hidePopup() {
        gsap.to(circleMenuPopup, {
          opacity: 0,
          y: 10,
          duration: 0.3,
          ease: "power1.out",
          onComplete: () => {
            circleMenuPopup.style.display = "none";
          }
        });
        popupVisible = false;
      }

      // Toggle the popup when clicking the circle menu button
      circleMenu.addEventListener("click", function (e) {
        e.stopPropagation(); // Prevent the click from propagating
        if (popupVisible) {
          hidePopup();
        } else {
          showPopup();
        }
      });

      // Dismiss the popup if clicking anywhere outside the popup or circle menu
      document.addEventListener("click", function (e) {
        if (!circleMenuPopup.contains(e.target) && !circleMenu.contains(e.target)) {
          if (popupVisible) {
            hidePopup();
          }
        }
      });
    });

 const bottomLayerPopup = document.getElementById('bottom-layer-popup');
const bottomLayerList = document.getElementById('bottom-layer-list');
const currentLayerName = document.getElementById('current-layer-name');
const currentLayerSubtext = document.getElementById('current-layer-subtext');

// Toggle the popup’s display
function toggleBottomLayerPopup() {
  if (bottomLayerPopup.classList.contains('show')) {
    bottomLayerPopup.classList.remove('show');
  } else {
    // Refresh the list each time we open
    populateBottomLayerList();
    bottomLayerPopup.classList.add('show');
  }
}

// 1) The mapping from “type” → icon class
const layerIconMap = {
  sr_bref: 'fa-cloud-rain',            
  sr_bvel: 'fa-wind',                  
  bdhc: 'fa-magnifying-glass',         
  boha: 'fa-cloud-showers-water',              
  bdsa: 'fa-cloud-showers-water'         
};

async function populateBottomLayerList() {
  bottomLayerList.innerHTML = '';

  // Get current station ID from top-station-id
  const topStationElement = document.getElementById('top-station-id');
  let stationId = topStationElement.textContent.trim();
  if (stationId.includes('•')) {
    stationId = stationId.split('•')[1].trim();
  }

  // If no station or station not known
  if (!stationId || !radarStations[stationId]) {
   bottomLayerList.innerHTML = `
  <div style="color: #bbb; padding: 5px;">
    <i class="fa-solid fa-triangle-exclamation" style="margin-right: 3px;"></i>
    No station selected
  </div>
`;
    return;
  }

  const station = radarStations[stationId];

  // If offline => no layers
  if (station.status !== 'Operational') {
 bottomLayerList.innerHTML = `
  <div style="color: #bbb; padding: 5px;">
    <i class="fa-solid fa-triangle-exclamation" style="margin-right: 3px;"></i>
    No layers available
  </div>
`;

    return;
  }

  // Ensure station layers are fetched
  if (!station.layers) {
    await fetchLayers(stationId);
  }
  const layerElems = station.layers || [];
  if (layerElems.length === 0) {
    bottomLayerList.innerHTML = '<div style="color:#bbb; padding:5px;"><i class="fa-solid fa-triangle-exclamation"> style="margin-right: 3px;</i>  No layers available</div>';
    return;
  }

  // Build a map from layerName => layerElement
  const layerMap = {};
  layerElems.forEach(layer => {
    const ln = layer.getElementsByTagName('Name')[0].textContent;
    layerMap[ln] = layer;
  });

  // Sort them in your desired order
  const sortedLayers = desiredLayerOrder.map(type => {
    const matchingLayerName = Object.keys(layerMap).find(ln => {
      return getLayerTypeFromName(ln) === type;
    });
    if (matchingLayerName) {
      return {
        layerName: matchingLayerName,
        layer: layerMap[matchingLayerName],
      };
    }
    return null;
  }).filter(Boolean);

  // Figure out which layer is currently active
  const layerSelect = document.getElementById('layer-select');
  const activeLayerName = layerSelect.value; // e.g. 'KXYZ_sr_bvel'

  // Separate them into two groups: "Level-III" vs. "Digital"
  const level3Group = [];  // sr_bref, sr_bvel
  const digitalGroup = []; // bdhc, boha, bdsa

  sortedLayers.forEach(item => {
    const layerType = getLayerTypeFromName(item.layerName);
    if (layerType === 'sr_bref' || layerType === 'sr_bvel') {
      level3Group.push(item);
    } else {
      digitalGroup.push(item);
    }
  });

  // Helper to build a group heading
  function addGroupHeading(text, extraClass = '') {
    const heading = document.createElement('div');
    heading.classList.add('group-heading');
    if (extraClass) heading.classList.add(extraClass);
    heading.textContent = text;
    bottomLayerList.appendChild(heading);
  }

  // Helper to render an array of layers
  function renderLayers(layerArray) {
    layerArray.forEach(item => {
      const { layerName } = item;
      const friendlyName = getFriendlyLayerName(layerName);
      const isActive = (layerName === activeLayerName);

      // Build a clickable div
      const layerDiv = document.createElement('div');
      layerDiv.classList.add('layer-item');
      if (isActive) layerDiv.classList.add('active');

      // Decide on an icon based on the layerType
      const thisType = getLayerTypeFromName(layerName);
      const iconClass = layerIconMap[thisType] || 'fa-question-circle';

      // Build the HTML with icon + text + optional check
      layerDiv.innerHTML = `
        <i class="fa-solid ${iconClass}"></i> 
        ${friendlyName}
        ${isActive ? '<i class="fa-solid fa-circle-check"></i>' : ''}
      `;

      // On click => activate that layer
      layerDiv.addEventListener('click', () => {
        activateLayer(layerName, stationId);
        populateBottomLayerList(); // re-draw so we see the new .active
      });

      bottomLayerList.appendChild(layerDiv);
    });
  }

  // Render the Level-III group if any
  if (level3Group.length > 0) {
    addGroupHeading('Level-III');
    renderLayers(level3Group);
  }

  // Add extra spacing + “Digital” heading, then render digital layers
  if (digitalGroup.length > 0) {
    // Add bigger margin
    const spacer = document.createElement('div');
    spacer.style.height = '5px';
    bottomLayerList.appendChild(spacer);

    addGroupHeading('Digital', 'digital-spacing');
    renderLayers(digitalGroup);
  }

  // If no layers in both => fallback
  if (level3Group.length === 0 && digitalGroup.length === 0) {
    bottomLayerList.innerHTML = '<div style="color:#bbb; padding:5px;">No layers available</div>';
  }
}


// Attach the click event to the bottom-left texts
currentLayerName.addEventListener('click', toggleBottomLayerPopup);
currentLayerSubtext.addEventListener('click', toggleBottomLayerPopup);

// 1) Add a hide function
function hideBottomLayerPopup() {
  if (!bottomLayerPopup.classList.contains('show')) return;

  // Remove 'show' + add 'hide'
  bottomLayerPopup.classList.remove('show');
  bottomLayerPopup.classList.add('hide');

  // After the animation completes (0.3s), set display: none
  bottomLayerPopup.addEventListener('animationend', function handleAnimationEnd() {
    // Make sure it's the fadeDown animation
    if (bottomLayerPopup.classList.contains('hide')) {
      bottomLayerPopup.style.display = 'none';
      bottomLayerPopup.classList.remove('hide');
    }
    bottomLayerPopup.removeEventListener('animationend', handleAnimationEnd);
  }, { once: true });
}

// 2) Replace your toggle function with “show” logic
function toggleBottomLayerPopup() {
  // If currently hidden => show it
  if (!bottomLayerPopup.classList.contains('show')) {
    bottomLayerPopup.style.display = 'block';
    populateBottomLayerList();
    bottomLayerPopup.classList.remove('hide');
    bottomLayerPopup.classList.add('show');
  } else {
    // If it's already shown => fadeDown
    hideBottomLayerPopup();
  }
}

// 3) Listen for clicks anywhere in the document
document.addEventListener('mousedown', (e) => {
  // If the popup is shown, and the click is NOT inside the popup
  // nor on the bottom-left labels (#current-layer-name, #current-layer-subtext),
  // close the popup
  if (bottomLayerPopup.classList.contains('show')) {
    if (
      !bottomLayerPopup.contains(e.target) && 
      !currentLayerName.contains(e.target) &&
      !currentLayerSubtext.contains(e.target)
    ) {
      hideBottomLayerPopup();
    }
  }
});

map.on('load', function() {
  // Wait 3 seconds after the map loads
  setTimeout(() => {
    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) {
      // Animate opacity and slide down (y: 100 pixels)
      gsap.to(loadingScreen, {
        opacity: 0,
        y: 0,
        duration: 0.4,
        ease: "power1.out",
        onComplete: () => {
          // Optionally remove it from the DOM
          loadingScreen.parentNode.removeChild(loadingScreen);
        }
      });
    }
  }, 3000);
});



// Toggle the Weather Glossary popup when the menu item is clicked
document.getElementById("weather-glossary-toggle").addEventListener("click", function (e) {
  e.stopPropagation();
  toggleWeatherGlossary();
});

// Close the glossary when clicking the close button
document.getElementById("close-glossary-btn").addEventListener("click", function (e) {
  e.stopPropagation();
  closeWeatherGlossary();
});



function toggleWeatherGlossary() {
  const glossary = document.getElementById("weather-glossary-popup");
  const blurOverlay = document.getElementById("glossary-blur");

  if (window.getComputedStyle(glossary).display !== "none") {
    closeWeatherGlossary();
  } else {
    // Show the blur overlay first
    blurOverlay.style.display = "block";
    // Force reflow to register the change
    blurOverlay.offsetWidth;
    blurOverlay.style.opacity = "1";

    // Show the glossary popup
    glossary.style.display = "block";
    // Set initial state: fully transparent and slightly shifted down
    glossary.style.opacity = "0";
    glossary.style.transform = "translate(-50%, calc(-50% + 10px))";
    // Force reflow so the browser registers the starting state
    glossary.offsetWidth;
    // Animate to final state: visible and centered
    setTimeout(() => {
      glossary.style.opacity = "1";
      glossary.style.transform = "translate(-50%, -50%)";
    }, 10);

    // Load glossary entries (fresh fetch every time)
    doDictSearch("");
  }
}

function closeWeatherGlossary() {
  const glossary = document.getElementById("weather-glossary-popup");
  const blurOverlay = document.getElementById("glossary-blur");
  const container = document.getElementById("glossary-content");
  const searchInput = document.getElementById("glossary-search");

  // Animate the glossary to fade out and move down
  glossary.style.opacity = "0";
  glossary.style.transform = "translate(-50%, calc(-50% + 10px))";
  setTimeout(() => {
    glossary.style.display = "none";
    // Clear the container and reset its scroll position for a fresh load next time
    container.innerHTML = "";
    container.scrollTop = 0;
    // Clear the search input (reset to placeholder)
    searchInput.value = "";
  }, 300);

  // Fade out the blur overlay
  blurOverlay.style.opacity = "0";
  setTimeout(() => {
    blurOverlay.style.display = "none";
  }, 300);
}

// Listen for Enter key on the search input to trigger a search
document.getElementById("glossary-search").addEventListener("keyup", function (e) {
  if (e.key === "Enter") {
    doDictSearch(this.value);
  }
});

// Debounce search input to reduce excessive fetching
let searchTimeout = null;
document.getElementById("glossary-search").addEventListener("keyup", function (e) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    doDictSearch(this.value);
  }, 300);
});


// --- IntersectionObserver Setup ---
// This observer adds the fade-in class to any entry that becomes at least 20% visible
const fadeInObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("fade-in");
      // Remove the inline opacity so the animation can take over
      entry.target.style.opacity = "";
      observer.unobserve(entry.target);
    }
  });
}, {
  root: document.getElementById("glossary-content"),
  threshold: 0.2
});

// --- Pagination & Fetching Functions ---

// Global variables for full alphabetical view pagination (only used when search term is empty)
let fullViewMatches = [];
let fullViewStartIndex = 0;
const batchSize = 50; // Adjust as needed for each batch

function doDictSearch(term) {
  const container = document.getElementById("glossary-content");

  // Animate existing entries to fade down before loading new results
  if (container.children.length > 0) {
    Array.from(container.children).forEach(child => {
      child.classList.remove("fade-in");
      child.classList.add("fade-down");
      child.style.animationDelay = "0s";
    });
    setTimeout(() => {
      container.innerHTML = "";
      fetchAndRender(term);
    }, 400);
  } else {
    fetchAndRender(term);
  }
}

// Add event listener to the glossary blur overlay
document.addEventListener('DOMContentLoaded', function() {
  const glossaryBlur = document.getElementById('glossary-blur');
  const glossaryPopup = document.getElementById('weather-glossary-popup');

  // Check if elements exist before attaching the event listener
  if (glossaryBlur && glossaryPopup) {
    // Add click event listener to the blur overlay
    glossaryBlur.addEventListener('click', function(e) {
      // Prevent the click from propagating
      e.stopPropagation();
      
      // Call the existing close function if it exists, otherwise implement the fade-down animation
      if (typeof closeWeatherGlossary === 'function') {
        closeWeatherGlossary();
      } else {
        // Implement the fade-down animation inline
        glossaryPopup.style.opacity = '0';
        glossaryPopup.style.transform = 'translate(-50%, calc(-50% + 10px))';
        
        // Fade out the blur overlay
        glossaryBlur.style.opacity = '0';
        
        // After the transition completes, set display to none
        setTimeout(() => {
          glossaryPopup.style.display = 'none';
          glossaryBlur.style.display = 'none';
          
          // Reset the container and search input for next time
          const container = document.getElementById('glossary-content');
          const searchInput = document.getElementById('glossary-search');
          
          if (container) {
            container.innerHTML = '';
            container.scrollTop = 0;
          }
          
          if (searchInput) {
            searchInput.value = '';
          }
        }, 300); // Match the transition duration in CSS
      }
    });
    
    console.log('✅ Glossary blur click handler initialized');
  } else {
    console.warn('⚠️ Could not find glossary blur or popup elements');
  }
});

function fetchAndRender(term) {
  const container = document.getElementById("glossary-content");

  fetch('https://api.weather.gov/glossary')
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok: ' + response.statusText);
      }
      return response.json();
    })
    .then(data => {
      // Add custom glossary entry
      data.glossary.push({
        term: 'XWD',
        definition: 'Xtreme Weather Discord'
      });
      // Sort entries alphabetically by term
      data.glossary.sort((a, b) => a.term.localeCompare(b.term));

      // Filter matches based on search term (case-insensitive)
      let matches = data.glossary.filter(item =>
        item.term && item.term.toLowerCase().includes(term.toLowerCase())
      );

      if (term.trim() !== "") {
        // In search mode, limit to 50 results
        matches = matches.slice(0, 200);
        renderMatches(matches, matches.length, 0, false);
        // Reset full view globals for subsequent full view displays.
        fullViewMatches = [];
        fullViewStartIndex = 0;
      } else {
        // In full alphabetical view, store matches globally and render in batches.
        fullViewMatches = matches;
        fullViewStartIndex = 0;
        renderMatches(fullViewMatches, batchSize, fullViewStartIndex, true);
      }
    })
    .catch(error => {
      console.error('doDictSearch() > fetch() > ', error);
    });
}

// Renders a batch of matches starting at startIndex.
// If isFullView is true (alphabetical view), a "Load More" button is added if more items remain.
function renderMatches(matches, batchSize, startIndex, isFullView) {
  const container = document.getElementById("glossary-content");
  // Remove any existing Load More button
  const existingBtn = container.querySelector(".load-more-btn");
  if (existingBtn) {
    existingBtn.remove();
  }
  
  const endIndex = Math.min(startIndex + batchSize, matches.length);
  for (let i = startIndex; i < endIndex; i++) {
    const item = matches[i];
    const entryDiv = document.createElement("div");
    entryDiv.classList.add("glossary-entry");
    // Start with inline opacity set to 0 so the observer can trigger the fade-in animation
    entryDiv.style.opacity = "0";
    entryDiv.innerHTML = `
      <p><b>${item.term}</b></p>
      <p>${item.definition.replace("â€™", "'")}</p>
    `;
    container.appendChild(entryDiv);
    // Observe this entry. When it scrolls into view, fadeInObserver will add the "fade-in" class.
    fadeInObserver.observe(entryDiv);
  }
  
  // In full view, if more items remain, append a "Load More" button.
  if (isFullView && endIndex < matches.length) {
    const loadMoreBtn = document.createElement("button");
    loadMoreBtn.classList.add("load-more-btn");
    loadMoreBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Load More';
    loadMoreBtn.style.margin = "15px 5px";
    loadMoreBtn.style.fontWeight = "bold";
    loadMoreBtn.style.display = "block";
    loadMoreBtn.addEventListener("click", () => {
      loadMoreBtn.remove();
      fullViewStartIndex = endIndex;
      renderMatches(fullViewMatches, batchSize, endIndex, true);
    });
    container.appendChild(loadMoreBtn);
  }
}


// Toggle popup when clicking the glossary toggle button
document.getElementById("weather-glossary-toggle").addEventListener("click", function(e) {
  e.stopPropagation();
  document.getElementById("weather-glossary-popup").style.display = "block";
  doDictSearch(""); // Load all entries (alphabetically sorted)
});




        let radarStations = {};
        let currentLayer = null;
        let previousLayerType = null; // Store layer type

        // Mapping of layer types to friendly names
        const layerNameMap = {
            'sr_bref': 'Super-Res Reflectivity',
            'sr_bvel': 'Super-Res Velocity',
            'bdhc': 'Digital Hydrometer Classification',
            'boha': 'Rainfall Accumulation (One Hour)',
            'bdsa': 'Rainfall Accumulation (Storm Total)',
            // Add more mappings as needed
        };

        // Desired layer order
        const desiredLayerOrder = [
            'sr_bref',
            'sr_bvel',
            'bdhc',
            'boha',
            'bdsa'
        ];
        
function updateURL() {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const pitch = map.getPitch();
    const bearing = map.getBearing(); // Get current rotation angle

    const newUrl = new URL(window.location.href);
    const params = new URLSearchParams(newUrl.search);
    params.set('lat', center.lat.toFixed(5));
    params.set('lon', center.lng.toFixed(5));
    params.set('z', zoom.toFixed(1));

    if (pitch !== 0) params.set('pitch', pitch.toFixed(1)); 
    else params.delete('pitch');

    if (bearing !== 0) params.set('bearing', bearing.toFixed(1)); // Save bearing
    else params.delete('bearing'); 

    newUrl.search = params.toString();
    window.history.replaceState({}, '', newUrl);
}

map.setPitch(pitchLevel);
// Ensure bearing is set correctly after loading
map.setBearing(bearingLevel);

     map.on('moveend', updateURL);
map.on('zoomend', updateURL);
map.on('pitchend', updateURL);
map.on('rotateend', updateURL); // Detects when the user rotates the map
        
    


async function fetchRadarStations() {
    try {
        const response = await fetch('https://api.weather.gov/radar/stations?stationType=WSR-88D');
        if (!response.ok) {
            throw new Error('Network response was not ok: ' + response.statusText);
        }
        const data = await response.json();

        const radarStationsArray = data.features.map(feature => {
            const properties = feature.properties || {};
            const rdaProps = properties.rda?.properties || {};
            const performanceProps = properties.performance?.properties || {};

            // Basic Station Details
            const id = properties.id;
            const name = rdaProps.location || rdaProps.name || properties.name || id;
            const coords = feature.geometry.coordinates;
            const stationType = properties.stationType || "Unknown Radar Type";

            // Status & Performance
            let status = rdaProps.status || 'Unknown';
            if (status === 'Operate') status = 'Operational';
            else if (status === 'Standby') status = 'Out of Service';

            const lastReceivedTime = properties.latency?.levelTwoLastReceivedTime;
            const alarmSummary = rdaProps.alarmSummary || "No Alarms";

            // Transmitter & Power
            const avgTransmitterPower = rdaProps.averageTransmitterPower?.value ?? "N/A";
            const transmitterPeakPower = performanceProps?.transmitterPeakPower?.value ?? "N/A";
            const powerSource = properties.performance?.properties?.powerSource || "Unknown";
            const fuelLevel = performanceProps?.fuelLevel?.value ?? "N/A";

            // Calibration & Noise
            const reflectivityCalibration = rdaProps.reflectivityCalibrationCorrection?.value ?? "N/A";
            const horizontalNoiseTemp = performanceProps?.horizontalNoiseTemperature?.value ?? "N/A";
            const shelterTemperature = performanceProps?.shelterTemperature?.value ?? "N/A";

            // Timing & Latency
            const performanceCheckTime = performanceProps?.performanceCheckTime ?? "Unknown";
            const maxLatency = properties.latency?.max?.value ?? "N/A";
            const avgLatency = properties.latency?.average?.value ?? "N/A";
            
           const volumeCoveragePattern = rdaProps.volumeCoveragePattern || "N/A";


            // Construct the WMS URL
            const wmsUrl = `https://opengeo.ncep.noaa.gov/geoserver/${id.toLowerCase()}/ows`;

            return {
                id,
                name,
                lon: coords[0],
                lat: coords[1],
                stationType,
                status,
                lastReceivedTime,
                alarmSummary,
                avgTransmitterPower,
                transmitterPeakPower,
                powerSource,
                fuelLevel,
                reflectivityCalibration,
                horizontalNoiseTemp,
                shelterTemperature,
                performanceCheckTime,
                maxLatency,
                avgLatency,
                wmsUrl,
                layers: null, // To store cached layers
                volumeCoveragePattern  // NEW property added here
            };
        });

        return radarStationsArray;
    } catch (error) {
        console.error('Error fetching radar stations:', error);
        return [];
    }
}



        
// Define legend URLs based on layer type
const radarLegends = {
    'sr_bref': 'https://i.ibb.co/S77K82DW/Screenshot-2025-01-26-211206-upscaled-1.png',  // Reflectivity
    'sr_bvel': 'https://i.ibb.co/XkttPQmL/Screenshot-2025-01-26-211358-upscaled-3336x288-1.png', // Velocity
    'bdhc': 'https://i.ibb.co/kVLrzPSF/Screenshot-2025-01-26-211643-upscaled-3336x288-1.png', // Digital Hydrometer
    'boha': 'https://i.ibb.co/spV0nCxm/Screenshot-2025-01-26-211713-upscaled-3336x288-1.png', // Rainfall Accumulation (1 Hour)
    'bdsa': 'https://i.ibb.co/DPNj7PPH/Screenshot-2025-01-26-211751-upscaled-3336x288-1.png'  // Rainfall Accumulation (Storm Total)
};

function updateRadarLegend(layerName) {
  const legendImage = document.getElementById('legend-image');
  const legendElement = document.getElementById('radar-legend');
  const layerType = getLayerTypeFromName(layerName);

  if (radarLegends[layerType]) {
    legendImage.classList.remove('loaded');
    legendImage.src = radarLegends[layerType] + "?t=" + new Date().getTime(); // Force refresh

    legendImage.onload = () => {
      legendImage.classList.add('loaded');
    };

    legendElement.style.display = 'block';
  } else {
    legendImage.style.display = 'none';
  }
}



function updateMarkerVisibility() {
  // Read the active station from localStorage or from the “top-station-id” element
  const savedStationId = localStorage.getItem("activeStationId") || "";
  const topStationElem = document.getElementById("top-station-id");
  const stationName = topStationElem ? topStationElem.textContent.trim().toLowerCase() : "";

  // Read the currently selected layer’s text from the <select>:
  const layerSelect = document.getElementById("layer-select");
  let layerText = "Select a Station";
  if (layerSelect && layerSelect.selectedIndex >= 0) {
    layerText = layerSelect.options[layerSelect.selectedIndex].textContent.trim().toLowerCase();
  }

  // Also check the #current-layer-name element for “No station selected”
  const currentLayerNameElem = document.getElementById("current-layer-name");
  let currentLayerNameText = "";
  if (currentLayerNameElem) {
    currentLayerNameText = currentLayerNameElem.textContent.trim().toLowerCase();
  }

  // Decide if we have “no station” or “Select a Station” or “No station selected”
  const noValidStation = (
    !savedStationId ||
    stationName.includes("select a station") ||
    layerText === "select a station" ||
    currentLayerNameText.includes("no station selected")
  );

  // If no valid station => show markers
  // Otherwise (a real station is selected) => hide markers
  setMarkerVisibility(noValidStation);
}

 async function initializeRadarStations() {
    const radarStationsArray = await fetchRadarStations();
    radarStationsArray.forEach(station => {
        radarStations[station.id] = station;
    });
    addStationMarkers();

    // Restore station/layer if saved
    restorePreviousSelection();
}



async function restorePreviousSelection() {
    const savedStationId = localStorage.getItem('activeStationId');
    const savedLayerName = localStorage.getItem('activeLayerName');

    // Ensure we have valid saved data
    if (savedStationId && savedLayerName && radarStations[savedStationId]) {
        const station = radarStations[savedStationId];

        // 1) If we haven't fetched the station's layers yet, do so now
        if (!station.layers) {
            await fetchLayers(savedStationId);
            // fetchLayers calls populateLayerSelect(...) once done
        } else {
            // The station.layers are already cached, so just re-populate the dropdown
            populateLayerSelect(station.layers);
        }

        // 2) Now pick the correct option in <select id="layer-select"> 
        const layerSelect = document.getElementById('layer-select');
        for (let i = 0; i < layerSelect.options.length; i++) {
            if (layerSelect.options[i].value === savedLayerName) {
                layerSelect.selectedIndex = i;
                break;
            }
        }

        // 3) Activate the layer so it actually shows on the map
        activateLayer(savedLayerName, savedStationId);

        // 4) Update the info box so the top station name/time looks correct
        updateInfoBox(station, new Date().toLocaleTimeString('en-US'));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const savedStationId = localStorage.getItem('activeStationId');
    const urlParams = new URLSearchParams(window.location.search);
    const hasMapParams = urlParams.has('lat') && urlParams.has('lon') && urlParams.has('z');

    if (hasMapParams) {
        // If URL contains lat/lon/z, hide markers by default
        setMarkerVisibility(false);
    } else {
        // Base URL behavior: Hide markers if station is saved
        if (savedStationId) {
            setMarkerVisibility(false); // Hide markers
        } else {
            setMarkerVisibility(true); // Show markers
        }
    }

    // Hide the mping-reports-layer initially
    if (map.getLayer('mping-reports-layer')) {
        map.setLayoutProperty('mping-reports-layer', 'visibility', 'visible');
    }

    // Ensure city labels are hidden by default
    toggleCityLabels(true);
});





let markersVisible = true; // Global flag for marker visibility

function refreshStationMarkers() {
    Object.keys(radarStations).forEach(id => {
        const station = radarStations[id];

        // Default status to Operational
        let finalStatus = 'Operational';

        // Determine status based on lastReceivedTime
        if (station.lastReceivedTime) {
            const now = new Date();
            const lastReceived = new Date(station.lastReceivedTime);
            const diffInMinutes = (now - lastReceived) / (1000 * 60);

            if (diffInMinutes > 15) {
                finalStatus = 'Offline';
            }
        }

        // Ensure the station's status is updated
        station.status = finalStatus;

        // Skip updating marker visibility if markers are hidden
        if (!markersVisible) {
            if (station.marker) {
                station.marker.getElement().style.display = 'none';
            }
            return;
        }

        // Update marker appearance
        const markerElement = station.marker.getElement();
        if (finalStatus === 'Operational') {
            markerElement.style.backgroundColor = '#7F1DF0'; // Purple for operational
            markerElement.style.boxShadow = '0 0 15px rgba(127, 29, 240, 0.8)'; // Purple glow
        } else {
            markerElement.style.backgroundColor = '#FF0000'; // Red for offline
            markerElement.style.boxShadow = '0 0 15px rgba(255, 0, 0, 0.8)'; // Red glow
        }

        // Ensure marker visibility is updated
        markerElement.style.display = markersVisible ? '' : 'none';

        // Update the selected info box if necessary
        const displayedStationText = document.getElementById('top-station-id').textContent;
        const displayedStationId = displayedStationText.includes('•')
            ? displayedStationText.split('•')[1].trim()
            : displayedStationText.trim();
    });
}

// Set up periodic updates using the Page Visibility API
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        refreshStationMarkers(); // Refresh markers when the page becomes visible
        
           
    }
});



// Trigger an initial refresh when the script loads
refreshStationMarkers();

// Function to manually control marker visibility separately
function setMarkerVisibility(visible) {
    markersVisible = visible;
    Object.keys(radarStations).forEach(id => {
        const station = radarStations[id];
        if (station.marker) {
            station.marker.getElement().style.display = visible ? '' : 'none';
        }
    });

    const button = document.getElementById('toggle-markers');
    if (!visible) {
        button.style.border = '2px solid white';
        button.style.backgroundColor = '#636381';
        button.style.color = 'white';
    } else {
        button.style.border = '';
        button.style.backgroundColor = '';
        button.style.color = '';
    }
}


document.addEventListener('DOMContentLoaded', () => {
    const savedStationId = localStorage.getItem('activeStationId');
    const urlParams = new URLSearchParams(window.location.search);
    const maplat = urlParams.get('lat');
    const maplon = urlParams.get('lon');
    const mapz = urlParams.get('z');

    // Ensure markers are hidden when lat/lon/z params are present
    if (maplat && maplon && mapz) {
        setMarkerVisibility(false);  // Hide markers when lat/lon/z exists
        console.log('Markers hidden by default due to lat/lon/z params.');
    } else {
        // Base URL behavior: Hide markers if station is saved
        if (savedStationId) {
            setMarkerVisibility(false); // Hide markers
            console.log('Markers hidden due to saved station.');
        } else {
            setMarkerVisibility(true); // Show markers
            console.log('Markers visible by default.');
        }
    }

    // Hide the mping-reports-layer initially
    if (map.getLayer('mping-reports-layer')) {
        map.setLayoutProperty('mping-reports-layer', 'visibility', 'visible');
    }

    // Ensure city labels are hidden by default
    toggleCityLabels(true);
});




// Background refresh for radar station data
setInterval(async () => {
    try {
        console.log('Refreshing radar station data in the background...');
        const updatedStations = await fetchRadarStations();

        updatedStations.forEach(updatedStation => {
            const existingStation = radarStations[updatedStation.id];

            if (existingStation) {
                // Update only lastReceivedTime, keep Operational as default
                existingStation.lastReceivedTime = updatedStation.lastReceivedTime;
            } else {
                // Add new stations with default "Operational" status
                radarStations[updatedStation.id] = {
                    ...updatedStation,
                    status: 'Operational'
                };
                addStationMarkers(); // Add new markers for new stations
            }
        });

        // Refresh markers without disrupting visibility state
        Object.keys(radarStations).forEach(id => {
            const station = radarStations[id];

            if (station.marker) {
                let finalStatus = 'Operational'; // Default to operational

                // Determine offline status based on lastReceivedTime
                if (station.lastReceivedTime) {
                    const lastReceived = new Date(station.lastReceivedTime);
                    const now = new Date();
                    const diffInMinutes = (now - lastReceived) / (1000 * 60);

                    if (diffInMinutes > 15) {
                        finalStatus = 'Offline';
                    }
                }

                // Ensure station's status is updated
                station.status = finalStatus;

                // Update marker appearance
                const markerElement = station.marker.getElement();
                if (finalStatus === 'Operational') {
                    markerElement.style.backgroundColor = '#7F1DF0'; // Purple for operational
                    markerElement.style.boxShadow = '0 0 15px rgba(127, 29, 240, 0.8)'; // Purple glow
                } else {
                    markerElement.style.backgroundColor = '#FF0000'; // Red for offline
                    markerElement.style.boxShadow = '0 0 15px rgba(255, 0, 0, 0.8)'; // Red glow
                }

                // Keep the visibility consistent with markersVisible flag
                markerElement.style.display = markersVisible ? '' : 'none';
            }
        });

        console.log('Background refresh complete.');
    } catch (error) {
        console.error('Error refreshing radar station data:', error);
    }
}, 5000); // Refresh data every 60 seconds

// Regular refresh to update markers
setInterval(() => {
    console.log('Refreshing markers...');
    refreshStationMarkers();
}, 5000); // Update every 1 minute



document.addEventListener('DOMContentLoaded', () => {
    handleInitialMarkerVisibility();
    addStationMarkers();
});


let selectedLayerType = 'sr_bref'; // Default global layer type

function addStationMarkers() {
    const savedStationId = localStorage.getItem('activeStationId');
    const savedLayerName = localStorage.getItem('activeLayerName');
    const urlParams = new URLSearchParams(window.location.search);

    // Determine if markers should be hidden by default when lat/lon/z are present
    let hasMapParams = urlParams.has('lat') && urlParams.has('lon') && urlParams.has('z');
    let hideMarkersByDefault = hasMapParams || (savedStationId && !hasMapParams);

    // Set global marker visibility based on the condition
    markersVisible = !hideMarkersByDefault;

    // Preserve the custom map view if lat/lon/z are provided
    if (hasMapParams) {
        const lat = parseFloat(urlParams.get('lat'));
        const lon = parseFloat(urlParams.get('lon'));
        const zoom = parseFloat(urlParams.get('z'));

        map.setCenter([lon, lat]);
        map.setZoom(zoom);
    }

    Object.keys(radarStations).forEach(id => {
        const station = radarStations[id];
        const markerElement = document.createElement('div');
        markerElement.className = 'circle-marker';

        // Determine final status
        let finalStatus = station.status;
        if (station.lastReceivedTime) {
            const lastReceived = new Date(station.lastReceivedTime);
            const now = new Date();
            const diffInMinutes = (now - lastReceived) / (1000 * 60);
            if (diffInMinutes > 15) {
                finalStatus = 'Offline';
            }
        }

        // Set marker color and glow based on status
        markerElement.style.backgroundColor = finalStatus === 'Operational' ? '#7F1DF0' : '#FF0000';
        markerElement.style.boxShadow = finalStatus === 'Operational'
            ? '0 0 15px rgba(127, 29, 240, 0.8)'  // Purple glow for operational
            : '0 0 15px rgba(255, 0, 0, 0.8)';   // Red glow for offline

        const marker = new mapboxgl.Marker(markerElement)
            .setLngLat([station.lon, station.lat])
            .addTo(map);

        station.marker = marker; // Store marker reference

        // Hide markers by default if necessary
        if (hideMarkersByDefault) {
            marker.getElement().style.display = 'none'; // Hide marker
            console.log(`Marker ${id} hidden by default due to lat/lon/z in URL.`);
        }

        // First load: Center map without animation if station ID exists and no lat/lon/z params
        if (!hasMapParams && savedStationId && id === savedStationId) {
            map.setCenter([station.lon, station.lat]);
            map.setZoom(7);

            if (savedLayerName) {
                activateLayer(savedLayerName, savedStationId);
            }

            updateInfoBox(station, new Date().toLocaleTimeString('en-US'));
        }

        // Add click event listener to marker
        marker.getElement().addEventListener('click', async (event) => {
            event.stopPropagation(); // Prevents click from propagating to the map

            updateInfoBox(station, new Date().toLocaleTimeString('en-US'));

            // Use flyTo animation on click
            map.flyTo({
                center: [station.lon, station.lat],
                zoom: 7.5,
                speed: 0.8
            });

            if (finalStatus === 'Operational') {
                await fetchLayers(station.id);
                const layerSelect = document.getElementById('layer-select');
                let layerToSelect = null;

                // Match the previously selected layer type
                for (let i = 0; i < layerSelect.options.length; i++) {
                    const option = layerSelect.options[i];
                    if (getLayerTypeFromName(option.value) === selectedLayerType) {
                        layerToSelect = option.value;
                        layerSelect.selectedIndex = i; // Set dropdown selection
                        break;
                    }
                }

                // Fallback to default layer if not available
                if (!layerToSelect) {
                    for (let i = 0; i < layerSelect.options.length; i++) {
                        const option = layerSelect.options[i];
                        if (option.value.includes('sr_bref')) {
                            layerToSelect = option.value;
                            layerSelect.selectedIndex = i;
                            break;
                        }
                    }
                }

                // Activate the selected or fallback layer
                if (layerToSelect) {
                    activateLayer(layerToSelect, station.id);
                }
            } else {
                // Clear layers for non-operational radars
                document.getElementById('layer-select').innerHTML = '';
                if (currentLayer) {
                    if (map.getLayer(currentLayer)) map.removeLayer(currentLayer);
                    if (map.getSource(currentLayer)) map.removeSource(currentLayer);
                    currentLayer = null;
                }
            }
        });
    });

    // Ensure markers reflect visibility state correctly
    setMarkerVisibility(markersVisible);
}



// Capture layer changes to update the global selectedLayerType
document.getElementById('layer-select').addEventListener('change', (event) => {
    const layerName = event.target.value;
    selectedLayerType = getLayerTypeFromName(layerName); // Persist the selected layer globally
    const stationName = document.getElementById('top-station-id').textContent;
    const activeStationId = stationName.includes('•') 
        ? stationName.split('•')[1].trim() 
        : stationName.trim();

    if (layerName && activeStationId) {
        activateLayer(layerName, activeStationId); // Update layer immediately
        const timestamp = new Date().toLocaleTimeString('en-US');
      
    }
});




        

function formatTimeDifference(msDiff) {
    const totalMinutes = Math.floor(msDiff / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);

    return parts.join(' ');
}

function updateDetailPanelContentFromCurrentStation() {
  if (!window.currentStation || !window.currentStation.id || !window.currentStation.name) return;

  // Format the text properly: "Radar [ID] in [Name]"
  const detailText = `Radar ${window.currentStation.id} in ${window.currentStation.name}`;
  document.getElementById('station-detail-title').textContent = detailText;
}


function updateInfoBox(station, currentTimestamp) {
    const stationIdElem = document.getElementById('top-station-id');
    const timestampElem = document.getElementById('top-timestamp');
    const statusIndicator = document.getElementById('top-status-indicator');

    // Save station globally for the detail panel
    window.currentStation = station;

    // Update station name and ID in the top info bar
    if (station.name && station.name !== station.id) {
        stationIdElem.innerHTML = `
            <span class="station-name">${station.name}</span>
            <span class="sep"> • </span>
            <span class="station-id">${station.id}</span>
        `;
    } else {
        stationIdElem.innerHTML = `<span class="station-id">${station.id}</span>`;
    }

    // Default status: "Operational"
    let finalStatus = 'Operational';
    let lastCheckTime = station.lastReceivedTime ? new Date(station.lastReceivedTime) : null;

    if (lastCheckTime) {
        const now = new Date();
        const diffInMinutes = (now - lastCheckTime) / (1000 * 60);

        if (diffInMinutes > 15) {
            finalStatus = 'Offline';
        }

        // Update the status indicator classes (unchanged)
        statusIndicator.classList.remove('operational', 'out-of-service');
        if (finalStatus === 'Operational') {
            statusIndicator.classList.add('operational');
        } else {
            statusIndicator.classList.add('out-of-service');
        }
    } else {
        statusIndicator.classList.add('operational');
    }

// Extract VCP from station data and prepare display text
let vcp = station.volumeCoveragePattern || "";
let vcpDisplay = vcp;
if (vcp && (vcp.charAt(0).toUpperCase() === 'R' || vcp.charAt(0).toUpperCase() === 'L')) {
    vcpDisplay = vcp.substring(1);
}

let modeText = "";
if (vcp === "R31" || vcp === "R35" || vcp === "L31") {
    modeText = "Clear Air Mode";
} else if (
    vcp === "R12" || vcp === "R112" || vcp === "R212" || vcp === "R215" ||
    vcp === "L212" || vcp === "L215"
) {
    modeText = "Precipitation Mode";
}

// Replace the timestamp display with VCP info
timestampElem.textContent = `VCP ${vcpDisplay}: ${modeText}`;

// If the detail panel is open, update it immediately
const detailBox = document.getElementById('station-detail-box');
if (detailBox.classList.contains('visible')) {
    updateDetailPanelContent(station);
}

}

async function handleStationClick(station) {
    const timestamp = new Date().toLocaleTimeString('en-US');
    map.flyTo({ center: [station.lon, station.lat], zoom: 7.5, speed: 0.8 });
    updateInfoBox(station, timestamp);
    

    // Default status to "Operational"
    let finalStatus = 'Operational';

    // Determine offline status based on lastReceivedTime
    if (station.lastReceivedTime) {
        const now = new Date();
        const lastReceived = new Date(station.lastReceivedTime);
        const diffInMinutes = (now - lastReceived) / (1000 * 60);

        if (diffInMinutes > 15) {
            finalStatus = 'Offline';
        }
    }

    station.status = finalStatus; // Ensure station status is updated properly

    if (finalStatus === 'Operational') {
        // 1) Fetch layers if not already
        if (!station.layers) {
            await fetchLayers(station.id);
        }

        // 2) Attempt to find the layer name that matches our global "selectedLayerType"
        const allLayerElems = station.layers || [];
        let chosenLayerName = null;

        for (let i = 0; i < allLayerElems.length; i++) {
            const ln = allLayerElems[i].getElementsByTagName('Name')[0].textContent;
            const layerType = getLayerTypeFromName(ln);
            if (layerType === selectedLayerType) {
                chosenLayerName = ln;
                break;
            }
        }

        // 3) If not found, fallback to super-res reflectivity (sr_bref)
        if (!chosenLayerName) {
            // Try to find any layer containing "sr_bref"
            chosenLayerName = allLayerElems.find(layer => {
                const ln = layer.getElementsByTagName('Name')[0].textContent;
                return getLayerTypeFromName(ln) === 'sr_bref';
            })?.getElementsByTagName('Name')[0].textContent;

            // If we still have no fallback, just pick the first available layer
            if (!chosenLayerName && allLayerElems.length > 0) {
                chosenLayerName = allLayerElems[0].getElementsByTagName('Name')[0].textContent;
            }
        }

        // 4) Activate that layer
        if (chosenLayerName) {
            activateLayer(chosenLayerName, station.id);
        }

    } else {
        // Station offline => clear layers
        document.getElementById('layer-select').innerHTML = '';
        if (currentLayer) {
            if (map.getLayer(currentLayer)) map.removeLayer(currentLayer);
            if (map.getSource(currentLayer)) map.removeSource(currentLayer);
            currentLayer = null;
        }
    }
}


        async function fetchLayers(stationId) {
            const station = radarStations[stationId];
            if (station.layers) {
                // Use cached layers
                populateLayerSelect(station.layers);
                return;
            }
            const wmsUrl = station.wmsUrl;
            try {
                const response = await fetch(`${wmsUrl}?service=WMS&version=1.3.0&request=GetCapabilities`);
                const text = await response.text();
                const parser = new DOMParser();
                const xml = parser.parseFromString(text, 'text/xml');
                const layers = Array.from(xml.getElementsByTagName('Layer')[0].getElementsByTagName('Layer'));
                station.layers = layers; // Cache the layers
                populateLayerSelect(layers);
            } catch (error) {
                console.error('Error fetching layers:', error);
            }
        }
        
  

        function populateLayerSelect(layers) {
            const layerSelect = document.getElementById('layer-select');
            layerSelect.innerHTML = ''; // Clear previous layers

            // Create a mapping of layerName to layer object for easy access
            const layerMap = {};
            layers.forEach(layer => {
                const layerName = layer.getElementsByTagName('Name')[0].textContent;
                layerMap[layerName] = layer;
            });

            // Sort layers according to desired order
            const sortedLayers = desiredLayerOrder.map(type => {
                // Find the layer that matches the desired type
                const matchingLayerName = Object.keys(layerMap).find(layerName => getLayerTypeFromName(layerName) === type);
                if (matchingLayerName) {
                    return {
                        layerName: matchingLayerName,
                        layer: layerMap[matchingLayerName]
                    };
                }
                return null;
            }).filter(item => item !== null);

            // Populate the layer select dropdown with friendly names in the desired order
            sortedLayers.forEach(item => {
                const friendlyName = getFriendlyLayerName(item.layerName);

                const option = document.createElement('option');
                option.value = item.layerName;
                option.textContent = friendlyName;
                layerSelect.appendChild(option);
            });
        }

        function getLayerTypeFromName(layerName) {
            // Extract the layer type from the layer name
            const parts = layerName.split('_');
            // Assuming the layer type is everything after the station ID prefix
            const type = parts.slice(1).join('_'); // Remove the station ID prefix
            return type;
        }

        function getFriendlyLayerName(layerName) {
            const type = getLayerTypeFromName(layerName);
            const friendlyType = layerNameMap[type] || type;
            return friendlyType;
        }
  function updateLayerInfo(layerName, stationId) {
  const layerTextElement = document.getElementById('current-layer-name');
  const subTextElement = document.getElementById('current-layer-subtext');

  if (!stationId || !radarStations[stationId]) return;

  const station = radarStations[stationId];

  // Don't immediately reset to "No Data"
  if (!layerName || !station.layers || station.layers.length === 0) {
    setTimeout(() => {
      if (!currentLayer) {
        layerTextElement.textContent = "No layers available";
        subTextElement.textContent = "No Data";
      }
    }, 500); // Delay clearing text to avoid flicker
    return;
  }

  const friendlyName = getFriendlyLayerName(layerName);
  const groupText = friendlyName.includes("Super-Res") ? "Level-III" : "Digital";

  layerTextElement.textContent = friendlyName;
  subTextElement.textContent = groupText;
}
// Add a global variable to track drawing mode state
let drawingModeActive = false;

// First event listener for shortcuts that require Shift key
document.addEventListener('keydown', (event) => {
  // Check if the active element is a text input or textarea
  if (document.activeElement.tagName === 'INPUT' || 
      document.activeElement.tagName === 'TEXTAREA' || 
      document.activeElement.isContentEditable) {
    return; // Exit early if user is typing in a text field
  }
  
  if (!event.shiftKey) return; // Only proceed if Shift is held down
  
  const key = event.key.toLowerCase();
  const keyCode = event.keyCode || event.which;
  
  console.log("Shift pressed with key:", key, "keyCode:", keyCode); // Debug

  // Special case for Shift+3 which might be "#" on many keyboards
  if (keyCode === 51 || key === '#' || key === '3') {
    event.preventDefault();
    console.log("3D toggle triggered with Shift+3");
    if (map.getPitch() === 0) {
      map.easeTo({ pitch: 40, bearing: map.getBearing(), duration: 1000 });
    } else {
      map.easeTo({ pitch: 0, bearing: map.getBearing(), duration: 1000 });
    }
    return; // Exit after handling this case
  }
  
  // New keyboard shortcuts
  switch (key) {
    case 'g': // Shift + G for glossary
      event.preventDefault();
      toggleWeatherGlossary();
      break;
    case 'd': // Shift + D for drawing - now properly toggles
      event.preventDefault();
      if (drawingModeActive) {
        // First clear the drawings from the canvas
        bufferCtx.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
        ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        paths = [];
        undonePaths = [];
        
        // Then disable the drawing mode UI
        disableDrawingMode();
        drawingModeActive = false;
      } else {
        enableDrawingMode();
        drawingModeActive = true;
      }
      break;
    case 'm': // Shift + M for marker toggling
      event.preventDefault();
      // Toggle marker visibility
      setMarkerVisibility(!markersVisible);
      break;
    case 'l': // Shift + L for location
      event.preventDefault();
      document.getElementById('show-location').click();
      break;
  }
  
  // The rest of the code remains the same...
  // Old shortcuts for station layers from the first event listener
  const stationElem = document.getElementById('top-station-id');
  const layerSelect = document.getElementById('layer-select');
  
  if (!stationElem || !layerSelect) return;
  
  const stationText = stationElem.textContent;
  const activeStationId = stationText.includes('•')
    ? stationText.split('•')[1].trim()
    : stationText.trim();
  
  if (!activeStationId || !radarStations[activeStationId]) {
      console.warn('No valid station selected.');
      return;
  }
  
  // Layer mapping: require shift+key for these actions
  const layerShortcuts = {
      'r': 'sr_bref',  // Reflectivity
      'v': 'sr_bvel',  // Velocity
      'h': 'bdhc',     // Hydrometeor Classification
      'o': 'boha',     // One-Hour Rainfall
      's': 'bdsa'      // Storm Total Rainfall
  };
  
  if (!(key in layerShortcuts)) return;
  
  const targetLayerType = layerShortcuts[key];
  let selectedLayer = null;
  
  for (let i = 0; i < layerSelect.options.length; i++) {
      if (getLayerTypeFromName(layerSelect.options[i].value) === targetLayerType) {
          selectedLayer = layerSelect.options[i].value;
          layerSelect.selectedIndex = i;
          break;
      }
  }
  
  if (selectedLayer) {
      console.log(`Activating ${targetLayerType.toUpperCase()} for station ${activeStationId}`);
      activateLayer(selectedLayer, activeStationId);
  } else {
      console.warn(`${targetLayerType.toUpperCase()} layer not found for this station.`);
  }
});

// Alternative approach using keyCode
document.addEventListener('keydown', (event) => {
  // Check if the active element is a text input or textarea
  if (document.activeElement.tagName === 'INPUT' || 
      document.activeElement.tagName === 'TEXTAREA' || 
      document.activeElement.isContentEditable) {
    return; // Exit early if user is typing in a text field
  }
  
  // Skip if Shift is held down (handled by the other listener)
  if (event.shiftKey) return;
  
  const key = event.key.toLowerCase();
  const keyCode = event.keyCode || event.which;
  
  // Handle standard navigation keys
  switch (key) {
    case '+':
    case '=':
      event.preventDefault();
      map.zoomIn({ duration: 300 });
      break;
    case '-':
      event.preventDefault();
      map.zoomOut({ duration: 300 });
      break;
    case 'arrowup':
      event.preventDefault();
      map.panBy([0, -50], { duration: 300 });
      break;
    case 'arrowdown':
      event.preventDefault();
      map.panBy([0, 50], { duration: 300 });
      break;
    case 'arrowleft':
      event.preventDefault();
      map.panBy([-50, 0], { duration: 300 });
      break;
    case 'arrowright':
      event.preventDefault();
      map.panBy([50, 0], { duration: 300 });
      break;
    case 'tab':
      event.preventDefault();
      toggleSideMenu();
      break;
  }
  
});


function disableDrawingMode() {
    drawingControls.style.transition = "opacity 0.3s ease-out, transform 0.3s ease-in-out";
    drawingControls.style.opacity = "0"; // Fade out
    drawingControls.style.transform = "translateX(-50%) translateY(10px)"; // Move down 10px

    setTimeout(() => {
        drawingControls.style.display = "none"; // Hide after fade-out completes
    }, 300);

    drawCanvas.style.pointerEvents = "none";
    map.getCanvas().style.cursor = "";
}

// Function to clear drawings when disabling
function clearDrawings() {
    bufferCtx.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    paths = [];
    undonePaths = [];
    console.log("Drawings cleared.");
}

setInterval(() => {
  const layerSelect = document.getElementById('layer-select');
  const stationElem = document.getElementById('top-station-id');
  if (!layerSelect || !stationElem) return;
  
  const layerName = layerSelect.value;
  const stationText = stationElem.textContent;
  // Assume the station ID is after the "•" separator, or use the whole text if not found
  const activeStationId = stationText.includes('•') 
    ? stationText.split('•')[1].trim() 
    : stationText.trim();
  
  if (layerName && activeStationId) {
    updateLayerInfo(layerName, activeStationId);
  }
}, 400);











function activateLayer(layerName, stationId) {
  // Remove existing radar layers & sources
  Object.keys(map.getStyle().sources).forEach((source) => {
    if (source.startsWith('radar-')) {
      if (map.getLayer(source)) {
        map.removeLayer(source);
      }
      if (map.getSource(source)) {
        map.removeSource(source);
      }
    }
  });

  const station = radarStations[stationId];
  if (!station) {
    console.error(`Station ID ${stationId} not found.`);
    return;
  }

  const wmsUrl = station.wmsUrl;
  currentLayer = `radar-${layerName}-${stationId}`;

  // 1) Parse out just the type, e.g. "sr_bvel" from "KABC_sr_bvel"
  const thisLayerType = getLayerTypeFromName(layerName);

  // 2) Update the global selectedLayerType and save to localStorage
  selectedLayerType = thisLayerType;
  localStorage.setItem('globalSelectedLayerType', thisLayerType);

  // Add the new source
  map.addSource(currentLayer, {
    type: 'raster',
    tiles: [
      `${wmsUrl}?service=WMS&version=1.1.1&request=GetMap&layers=${layerName}&styles=&bbox={bbox-epsg-3857}&width=512&height=512&srs=EPSG:3857&format=image/png&transparent=true&_=${Date.now()}`
    ],
    tileSize: 512
  });

  // Add the new layer
  map.addLayer({
    id: currentLayer,
    type: 'raster',
    source: currentLayer,
    paint: {
      'raster-resampling': 'nearest',
      'raster-opacity': 0.9
    }
  }, 'road-street-navigation', 'road-street-low-navigation', 'building');

  // Update the displayed layer info (bottom-left text, etc.)
  updateLayerInfo(layerName, stationId);
  
  // Update radar legend every time a layer is activated
  updateRadarLegend(layerName);

  // Also update <select id="layer-select"> to reflect we’ve chosen this layer
  const layerSelect = document.getElementById('layer-select');
  for (let i = 0; i < layerSelect.options.length; i++) {
    if (layerSelect.options[i].value === layerName) {
      layerSelect.selectedIndex = i;
      break;
    }
  }

  // Possibly also re-populate the bottom layer popup to highlight the new active layer
  populateBottomLayerList(); 
  
  // -- ADD THESE TWO LINES --
  localStorage.setItem('activeStationId', stationId);
  localStorage.setItem('activeLayerName', layerName);

  console.log(`Activated layer ${layerName} for station ${stationId}.`);
}


// Call this function initially to set the default display
updateLayerInfo();

// Hide legend if no layer selected
function clearRadarLegend() {
    document.getElementById('radar-legend').style.display = 'none';
}

// Initial state: hide legend
clearRadarLegend();


        document.getElementById('layer-select').addEventListener('change', (event) => {
            const layerName = event.target.value;
            const stationName = document.getElementById('station-name').textContent;
            const activeStationId = stationName.split('•')[1]?.trim() || stationName.trim();
            if (layerName && activeStationId) {
                previousLayerType = getLayerTypeFromName(layerName); // Update to keep track of the layer type
                activateLayer(layerName, activeStationId);
            }
        });

        document.getElementById('toggle-3d').addEventListener('click', () => {
    const pitch = map.getPitch() === 0 ? 20 : 0;
    map.easeTo({ pitch, duration: 1000 });
});
/////////////////////////////////////////////////////////
// 1. Helper Functions (Distance Calculation - Optional)
/////////////////////////////////////////////////////////

/**
 * Haversine distance function (can be omitted if not used elsewhere).
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

/////////////////////////////////////////////////////////
// 2. Create the Native GeolocateControl (using Mapbox native marker)
/////////////////////////////////////////////////////////

// Initialize Mapbox's GeolocateControl using the native marker.
const geolocateControl = new mapboxgl.GeolocateControl({
  positionOptions: {
    enableHighAccuracy: true,
  },
  trackUserLocation: true,    // Continues to track the user's location
  showUserLocation: true,     // Displays the native user location marker
  showAccuracyCircle: false,  // Hides the accuracy circle
});

// Add the GeolocateControl to the map.
map.addControl(geolocateControl);

/////////////////////////////////////////////////////////
// 3. Custom "Show Location" Button Logic
/////////////////////////////////////////////////////////

let isGeolocationActive = false;
const locationButton = document.getElementById("show-location");

/**
 * Update the appearance of the location button based on its state.
 */
function updateLocationButtonStyle() {
  if (isGeolocationActive) {
    locationButton.style.backgroundColor = "white";
    locationButton.style.color = "#7F1DF0"; // Purple text
    locationButton.style.border = "2px solid #636381"; // Gray border
  } else {
    locationButton.style.backgroundColor = "#636381"; // Gray background
    locationButton.style.color = "white";            // White text
    locationButton.style.border = "2px solid white";   // White border
  }
}

// Initialize the location button's style.
updateLocationButtonStyle();

/**
 * Handle the location button click event.
 */
locationButton.addEventListener("click", () => {
  if (!isGeolocationActive) {
    // Turn on geolocation.
    isGeolocationActive = true;
    updateLocationButtonStyle();
    // Example usage: Call removePopups() when needed
removePopups();

    // Programmatically trigger the GeolocateControl.
    geolocateControl._geolocateButton.click();
    geolocateControl._watchState = "ACTIVE";

    // One-time event listener to fly to the user's location.
    const onFirstGeolocate = (e) => {
      map.flyTo({
        center: [e.coords.longitude, e.coords.latitude],
        zoom: 7.5,
        speed: 0.8,
      });
      // Remove this listener to avoid repeated zooming.
      geolocateControl.off("geolocate", onFirstGeolocate);
    };
    geolocateControl.on("geolocate", onFirstGeolocate);
    
  } else {
    // Turn off geolocation.
    isGeolocationActive = false;
    updateLocationButtonStyle();

    // Stop tracking the user's location.
    geolocateControl._clearWatch();
    geolocateControl._watchState = "OFF";

    // Remove any open weather popup.
    if (weatherPopup) {
      weatherPopup.remove();
      weatherPopup = null;
    }

    // Remove native user location layers if present.
    if (map.getSource("mapbox-gl-geolocation-source")) {
      if (map.getLayer("mapbox-user-location-accuracy-circle")) {
        map.removeLayer("mapbox-user-location-accuracy-circle");
      }
      if (map.getLayer("mapbox-user-location-dot")) {
        map.removeLayer("mapbox-user-location-dot");
      }
      map.removeSource("mapbox-gl-geolocation-source");
    }
  }
});
/////////////////////////////////////////////////////////
// 4. Toggle Weather Popup on Clicking the Native Marker
//    AND Automatically Fire Immediately When a Location is Acquired
/////////////////////////////////////////////////////////

// Global variable to keep track of the weather popup.
let weatherPopup = null;

// Global variable to store the current user coordinates.
let currentUserCoords = null;

/**
 * Toggle (or update) the weather popup at the given location.
 * @param {Array} location - [longitude, latitude]
 */
function toggleWeatherPopup(location) {
  // Save the latest coordinates.
  currentUserCoords = location;
  
   if (weatherPopup) {
    weatherPopup.remove();
    weatherPopup = null;
  }

  // If a popup is already open, update its position; otherwise, create it.
  if (!weatherPopup) {
    // Preload the popup with a skeleton layout.
    const preloadedPopupContent = `
      <div style="
          font-size: 14px; 
          color: white; 
          line-height: 1.2;
          max-width: 205px; 
          border-radius: 8px; 
          padding: 8px; 
          overflow: hidden; 
          white-space: normal;
          max-height: 100%; 
          height: auto;
          display: block;
          word-wrap: break-word;
        ">
        <!-- Header with Icon and "Current Location" text -->
        <div style="display: flex; align-items: center; margin-bottom: 8px;">
          <img 
            src="https://i.ibb.co/hx7yZz7r/download-43-upscaled-1.png"
            style="width: 45px; height: 45px; margin-right: 10px; border-radius: 8px;">
          <div style="flex: 1; text-align: left;">
            <strong style="font-size: 18px;">Current Location</strong>
          </div>
        </div>
    
        <!-- Weather Data Section (placeholders) -->
        <div style="text-align: left;">
          <p style="margin: 5px 0;"><strong>Temperature:</strong> --</p>
          <p style="margin: 5px 0;"><strong>Conditions:</strong> --</p>
        </div>
      </div>
    `;
    
    // Create a new animated popup.
    weatherPopup = new AnimatedPopup({
      closeButton: false,
      anchor: 'bottom',
      offset: [0, 0],
      // Reduce the animation duration for faster performance.
      openingAnimation: { duration: 300, easing: 'easeInOutExpo', transform: 'scale' },
      closingAnimation: { duration: 300, easing: 'easeInOutExpo', transform: 'scale' }
    })
      .setLngLat(location)
      .setHTML(preloadedPopupContent)
      .addTo(map);

    // When the popup is closed, reset our variable.
    weatherPopup.on('close', () => {
      weatherPopup = null;
    });
  } else {
    // If a popup exists, update its position.
    weatherPopup.setLngLat(location);
  }

  // Fetch weather data and update the popup.
  fetch(`https://forecast.weather.gov/MapClick.php?lon=${location[0]}&lat=${location[1]}&FcstType=json`)
    .then(response => response.json())
    .then(data => {
      const temperature = data.currentobservation.Temp;
      const weatherCondition = data.currentobservation.Weather;
      const forecastText = data.data.text[0];

      const popupContent = `
        <div style="
            font-size: 14px; 
            color: white; 
            line-height: 1.2;
            max-width: 205px; 
            border-radius: 8px; 
            padding: 8px; 
            overflow: hidden; 
            white-space: normal;
            max-height: 100%; 
            height: auto;
            display: block;
            word-wrap: break-word;
          ">
          <!-- Header with Icon and "Current Location" text -->
          <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <img 
              src="https://i.ibb.co/hx7yZz7r/download-43-upscaled-1.png"
              style="width: 45px; height: 45px; margin-right: 10px; border-radius: 8px;">
            <div style="flex: 1; text-align: left;">
              <strong style="font-size: 18px;">Current Location</strong>
            </div>
          </div>
      
          <!-- Weather Data Section -->
          <div style="text-align: left;">
            <p style="margin: 5px 0;"><strong>Temperature:</strong> ${temperature}°F</p>
            <p style="margin: 5px 0;"><strong>Conditions:</strong> ${weatherCondition}</p>
          </div>
        </div>
      `;
      if (weatherPopup) {
        weatherPopup.setHTML(popupContent);
      }
    })
    .catch(() => {
      if (weatherPopup) {
        weatherPopup.setHTML(`
          <div style="font-size: 14px; color: white; line-height: 1.2; max-width: 205px; border-radius: 8px; padding: 8px;">
            <!-- Header with Icon and "Current Location" text -->
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <img 
                src="https://i.ibb.co/hx7yZz7r/download-43-upscaled-1.png"
                style="width: 45px; height: 45px; margin-right: 10px; border-radius: 8px;">
              <div style="flex: 1; text-align: left;">
                <strong style="font-size: 18px;">Current Location</strong>
              </div>
            </div>
        
            <!-- Weather Data Section -->
            <div style="text-align: left;">
              <p style="margin: 5px 0;"><strong>Not Available:</strong> Live weather conditions aren't supported in your area.</p>
            </div>
          </div>
        `);
      }
    });
}


  


/**
 * Attach a click event listener to the native user location marker DOM element.
 *
 * Since the Mapbox native marker is rendered as a DOM element with the class
 * "mapboxgl-user-location", we wait until geolocation is triggered to grab it.
 *
 * IMPORTANT: If the native marker is not clickable, ensure your CSS allows pointer events:
 *   .mapboxgl-user-location { pointer-events: auto; }
 */
geolocateControl.on("geolocate", (e) => {
  // Save the current coordinates.
  currentUserCoords = [e.coords.longitude, e.coords.latitude];

  // Attempt to get the native marker element.
  const userLocationEl = document.querySelector('.mapboxgl-user-location');
  if (userLocationEl && !userLocationEl.dataset.clickListenerAttached) {
    // Mark that we've attached our listener to avoid duplicate listeners.
    userLocationEl.dataset.clickListenerAttached = "true";
    userLocationEl.addEventListener("click", (evt) => {
      evt.stopPropagation(); // Prevent the click from propagating to the map.
      // Use the most recent coordinates.
      if (currentUserCoords) {
        toggleWeatherPopup(currentUserCoords);
      }
    });
  }
});


 // Refresh the radar layer every minute
setInterval(() => {
    const layerSelect = document.getElementById('layer-select');
    const layerName = layerSelect.value;
    const stationName = document.getElementById('top-station-id').textContent;
    const activeStationId = stationName.includes('•')
        ? stationName.split('•')[1].trim()
        : stationName.trim();
    if (layerName && activeStationId) {
        const station = radarStations[activeStationId];
        // Refresh the radar tile
        activateLayer(layerName, activeStationId);
        
        // Compute VCP display info
        let vcp = station.volumeCoveragePattern || "";
        let vcpDisplay = vcp;
        
        // Remove both 'R' and 'L' prefixes if they exist
        if (vcp && (vcp.charAt(0).toUpperCase() === 'R' || vcp.charAt(0).toUpperCase() === 'L')) {
            vcpDisplay = vcp.substring(1);
        }
        
        let modeText = "";
        
        // Updated mode detection logic
        // Check if VCP is in the 30s range for Clear Air Mode
        if (/^[RL]?3\d$/.test(vcp)) {
            modeText = "Clear Air Mode";
        } 
        // Check for L212 and other precipitation patterns
        else if (/^[RL]?(12|112|212|215)$/.test(vcp)) {
            modeText = "Precipitation Mode";
        }
        
        document.getElementById('top-timestamp').textContent = `VCP ${vcpDisplay}: ${modeText}`;
    }
}, 60000); // Refresh every 60 seconds


// Event listener for layer selection to update instantly
document.getElementById('layer-select').addEventListener('change', (event) => {
    const layerName = event.target.value;
    const stationName = document.getElementById('top-station-id').textContent;
    const activeStationId = stationName.includes('•')
        ? stationName.split('•')[1].trim()
        : stationName.trim();
    if (layerName && activeStationId && radarStations[activeStationId]) {
        activateLayer(layerName, activeStationId); // Update layer immediately
        const station = radarStations[activeStationId];
        let vcp = station.volumeCoveragePattern || "";
        let vcpDisplay = vcp;
        
        // Remove both 'R' and 'L' prefixes if they exist
        if (vcp && (vcp.charAt(0).toUpperCase() === 'R' || vcp.charAt(0).toUpperCase() === 'L')) {
            vcpDisplay = vcp.substring(1);
        }
        
        let modeText = "";
        
        // Updated mode detection logic
        // Check if VCP is in the 30s range for Clear Air Mode
        if (/^[RL]?3\d$/.test(vcp)) {
            modeText = "Clear Air Mode";
        } 
        // Check for L212 and other precipitation patterns
        else if (/^[RL]?(12|112|212|215)$/.test(vcp)) {
            modeText = "Precipitation Mode";
        }
        
        document.getElementById('top-timestamp').textContent = `VCP ${vcpDisplay}: ${modeText}`;
    }
});

const toggle3DButton = document.getElementById('toggle-3d');
let isAnimating = false; // Flag to track if the map is currently animating

toggle3DButton.addEventListener('click', () => {
    // If the map is already animating, ignore clicks
    if (isAnimating) {
        return;
    }

    // Mark as animating and disable pointer events
    isAnimating = true;
    toggle3DButton.style.pointerEvents = 'none';

    const pitch = map.getPitch() === 0 ? 40 : 0;
    map.easeTo({ pitch, duration: 1000 });

    // Re-enable clicks after the animation completes
    setTimeout(() => {
        isAnimating = false;
        toggle3DButton.style.pointerEvents = 'auto';
    }, 1000);
});




const audioElement = new Audio(); // Ensure this exists before using it

document.addEventListener("DOMContentLoaded", function () {
    const lastPlayed = JSON.parse(localStorage.getItem("lastPlayedStation"));
    if (lastPlayed && lastPlayed.isPlaying) {
        togglePlayPause(lastPlayed.callSign, lastPlayed.url);
    }
});



function updateMediaSession(CALLSIGN) {
    if ('mediaSession' in navigator) {
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: `Weather Radio - ${CALLSIGN}`, 
                artist: "XWD Radar",
                artwork: [// Artwork must be an array
                    { src: "https://i.ibb.co/kVFYwcpV/IMG-7379.jpg", sizes: "96x96", type: "image/png" },
                    { src: "https://i.ibb.co/kVFYwcpV/IMG-7379.jpg", sizes: "128x128", type: "image/png" },
                    { src: "https://i.ibb.co/kVFYwcpV/IMG-7379.jpg", sizes: "192x192", type: "image/png" },
                    { src: "https://i.ibb.co/kVFYwcpV/IMG-7379.jpg", sizes: "256x256", type: "image/png" }
                ]
            });

            // ✅ Add Play/Pause/Stop Controls
            navigator.mediaSession.setActionHandler('play', () => {
                audioElement.play();
            });

            navigator.mediaSession.setActionHandler('pause', () => {
                audioElement.pause();
            });

            navigator.mediaSession.setActionHandler('stop', () => {
                audioElement.pause();
                audioElement.currentTime = 0;
            });

            console.log(`Updated media session: Weather Radio - ${CALLSIGN}`);
        } catch (error) {
            console.error("Failed to update media session metadata:", error);
        }
    } else {
        console.warn("Media Session API not supported.");
    }
}
document.addEventListener("DOMContentLoaded", function () {
  // --- Weather Radios Toggle Setup ---
  const weatherRadioToggle = document.getElementById("weather-radio-toggle");
  const weatherRadioCheckIcon = weatherRadioToggle.querySelector(".menu-item-check");

  // Retrieve stored state (default to false if not set)
  let weatherRadioEnabled = localStorage.getItem("weatherRadioVisible") === "true";
  weatherRadioCheckIcon.style.display = weatherRadioEnabled ? "block" : "none";

  // When the user clicks the Weather Radios menu item...
  weatherRadioToggle.addEventListener("click", function (e) {
    e.stopPropagation(); // Prevent the popup from dismissing

    // Toggle the state and store it
    weatherRadioEnabled = !weatherRadioEnabled;
    localStorage.setItem("weatherRadioVisible", weatherRadioEnabled);
    weatherRadioCheckIcon.style.display = weatherRadioEnabled ? "block" : "none";

    // Immediately update the Weather Radios on the map
    updateWeatherRadios();
  });
});

/**
 * updateWeatherRadios
 *
 * This function checks the stored toggle state:
 * - If Weather Radios are NOT enabled, it clears the NOAA transmitter GeoJSON source
 *   (so that no markers appear).
 * - If enabled, it calls your function (addNOAATransmittersGeoJSON) to fetch and add the markers.
 */
function updateWeatherRadios() {
  if (localStorage.getItem("weatherRadioVisible") !== "true") {
    // Clear the source so no markers show
    if (map.getSource('weather-radio')) {
      map.getSource('weather-radio').setData({
        type: "FeatureCollection",
        features: []
      });
    }
    return; // Exit early
  }
  // Otherwise, update the markers by fetching the latest data.
  addNOAATransmittersGeoJSON();
}


// Global player for audio streams, markers array, and weatherRadioVisible variable are assumed to be declared already:
const globalPlayer = document.getElementById('global-player');
// Array to store weather radio markers
let weatherRadioMarkers = [];
// Retrieve stored value or default to true
let weatherRadioVisible = JSON.parse(localStorage.getItem('weatherRadioVisible')) ?? true;


document.addEventListener('DOMContentLoaded', function() {
    if (localStorage.getItem("weatherRadioVisible") === "true") {
        addNOAATransmittersGeoJSON();
    }
});

/* -----------------------------
   TOGGLE BUTTON INITIALIZATION
----------------------------- */

function initializeWeatherRadioToggleButton() {
    const weatherRadioButton = document.getElementById('toggle-weather-radio');
    if (weatherRadioButton) {
        weatherRadioButton.innerHTML = `<i class="fas fa-radio"></i> Toggle Stations`;
        switchButtonStyle(weatherRadioButton, weatherRadioVisible);
    }
}

function switchButtonStyle(button, isOn) {
    if (isOn) {
        // ON style
        button.style.backgroundColor = "white";
        button.style.color = "#7F1DF0";  // Purple text
        button.style.border = "2px solid #636381"; // Gray border
    } else {
        // OFF style
        button.style.backgroundColor = "#636381"; // Gray background
        button.style.color = "white";  // White text
        button.style.border = "2px solid white"; // White border
    }
}

/* -----------------------------
   FETCH & ADD NOAA TRANSMITTERS
----------------------------- */


async function addNOAATransmittersGeoJSON() {
  try {
    // 1. Fetch transmitter data
    const transmitterResponse = await fetch('https://transmitters.weatherradio.org/');
    if (!transmitterResponse.ok) {
      throw new Error('Failed to fetch transmitter data.');
    }
    const transmitterData = await transmitterResponse.json();

    // 2. Fetch audio stream data from icestats
    const iceStatsResponse = await fetch('https://icestats.weatherradio.org/');
    if (!iceStatsResponse.ok) {
      throw new Error('Failed to fetch icestats data.');
    }
    const iceStatsData = await iceStatsResponse.json();
    const audioSources = iceStatsData.icestats.source;

    // 3. Build a lookup for audio streams by callSign
    const audioStreams = {};
    for (let source of audioSources) {
      const serverName = source.server_name;
      const listenUrl = source.listenurl;
      const serverDescription = source.server_description;
      if (serverName && listenUrl) {
        // e.g. "Weather Radio - KABC" => callSign = "KABC"
        const callSign = serverName.split('-').pop().trim();
        audioStreams[callSign] = {
          url: listenUrl,
          description: serverDescription.replace(/^Stream provided by /i, "") || "Unknown Provider",
          listeners: source.listeners || 0
        };
      }
    }

    // 4. Convert transmitter data into GeoJSON features
    let features = [];
    if (transmitterData.transmitters) {
      const transmitters = transmitterData.transmitters;
      for (let key in transmitters) {
        if (!transmitters.hasOwnProperty(key)) continue;
        const transmitter = transmitters[key];
        const { LAT, LON, CALLSIGN, FREQ, SITENAME } = transmitter;
        if (!LAT || !LON) continue;
        const streamDetails = audioStreams[CALLSIGN] || null;
        if (streamDetails) {
          features.push({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [parseFloat(LON), parseFloat(LAT)]
            },
            properties: {
              CALLSIGN: CALLSIGN,
              FREQ: FREQ,
              SITENAME: SITENAME,
              streamUrl: streamDetails.url,
              streamDescription: streamDetails.description
            }
          });
        }
      }
    } else {
      console.error('Transmitter data format incorrect.');
      return;
    }

    const geojsonData = {
      type: "FeatureCollection",
      features: features
    };

    // 5. Load the custom icon image into the map.
    // Use your provided image URL and add it with the name "weather-radio-icon".
    map.loadImage("https://i.ibb.co/jk1CNt17/IMG-1276.webp", function(error, image) {
      if (error) {
        console.error("Error loading custom icon:", error);
        return;
      }
      if (!map.hasImage('weather-radio-icon')) {
        map.addImage('weather-radio-icon', image);
      }

      // 6. Add (or update) the GeoJSON source for NOAA transmitters.
      if (map.getSource('weather-radio')) {
        map.getSource('weather-radio').setData(geojsonData);
      } else {
        map.addSource('weather-radio', {
          type: 'geojson',
          data: geojsonData
        });
      }

 // 7. Add a symbol layer that uses the custom icon.
      if (!map.getLayer('weather-radio-layer')) {
        map.addLayer({
          id: 'weather-radio-layer',
          type: 'symbol',
          source: 'weather-radio',
          layout: {
            "icon-image": "weather-radio-icon",
            "icon-size": 0.19,
            "icon-anchor": "center",
            "icon-allow-overlap": true
          }
        });
      }
    });

// Attach a click event to show a popup for each transmitter.
map.on('click', 'weather-radio-layer', function(e) {
  const feature = e.features[0];
  // Extract coordinates from the feature’s geometry
  const coordinates = feature.geometry.coordinates.slice();
  const props = feature.properties;

removePopups();
  
  // Build popup content using properties from the feature.
  const popupContent = `
    <div style="
          font-size: 14px; 
          color: white; 
          line-height: 1.5; 
          max-width: 279px; 
          border-radius: 8px; 
          padding: 8px; 
          overflow: hidden !important; 
          white-space: normal !important;
          max-height: 100%; 
          height: auto;
          display: block;
          word-wrap: break-word;
        ">
      <!-- Header section (image + station title) -->
      <div style="display: flex; align-items: center; margin-bottom: 10px;">
        <img 
          src="https://i.ibb.co/vw43hWJ/Square-256x-20.png"
          alt="Weather Radio Icon"
          style="width: 45px; height: 45px; margin-right: 8px; border-radius: 8px;"
        >
        <div style="text-align: left; flex: 1; padding-left: 8px;">
          <strong style="font-size: 18px;">Weather Radio - ${props.CALLSIGN}</strong>
        </div>
      </div>

      <!-- Details section -->
      <div style="text-align: left;">
        <strong>Frequency:</strong> ${props.FREQ} MHz<br>
        <strong>Location:</strong> ${props.SITENAME}<br>
        <!-- Play/Pause button -->
        <div style="margin-top: 10px;">
          <button class="more-info-button"
                  onclick="togglePlayPause('${props.CALLSIGN}', '${props.streamUrl}')">
            <i class='fas fa-volume-up'></i> Play
          </button>
        </div>
      </div>
    </div>
  `;
  
  // Create the AnimatedPopup using the proper coordinates.
  new AnimatedPopup({
      closeButton: false,
      anchor: 'bottom',
      offset: [0, 0],
      openingAnimation: { duration: 300, easing: 'easeInOutExpo', transform: 'scale' },
      closingAnimation: { duration: 300, easing: 'easeInOutExpo', transform: 'scale' }
    })
    .setLngLat(coordinates)  // Use the coordinates from the feature.
    .setHTML(popupContent)
    .addTo(map);
    
    // ✅ Update button state AFTER the popup is added to the map
    setTimeout(() => refreshPlayButtonState(props.CALLSIGN, props.streamUrl), 100);

});

// Change the cursor style when hovering over the symbol layer.
map.on('mouseenter', 'weather-radio-layer', function() {
  map.getCanvas().style.cursor = 'pointer';
});
map.on('mouseleave', 'weather-radio-layer', function() {
  map.getCanvas().style.cursor = '';
});



  } catch (error) {
    console.error('Error in addNOAATransmittersGeoJSON:', error);
  }
}



/* -----------------------------
   TOGGLE WEATHER RADIO VISIBILITY
----------------------------- */
function toggleWeatherRadio() {
    // Ensure our global variable is up-to-date from localStorage
    weatherRadioVisible = JSON.parse(localStorage.getItem('weatherRadioVisible')) ?? true;
    
    // Toggle visibility for each weather radio marker
    weatherRadioMarkers.forEach(marker => {
        const markerElement = marker.getElement();
        if (weatherRadioVisible) {
            markerElement.style.opacity = "1";  // Show marker
            markerElement.style.pointerEvents = "auto"; // Enable interactions
        } else {
            markerElement.style.opacity = "0";  // Hide marker
            markerElement.style.pointerEvents = "none"; // Disable interactions
        }
    });
    
    // If markers are hidden, stop any audio
    if (!weatherRadioVisible) {
        globalPlayer.pause();
        globalPlayer.src = '';
    }
    
    // Update button styles – try updating both any standalone toggle and the circle-menu toggle.
    let weatherRadioButton = document.getElementById('toggle-weather-radio');
    if (weatherRadioButton) {
        switchButtonStyle(weatherRadioButton, weatherRadioVisible);
    }
    let weatherRadioCircleButton = document.getElementById('weather-radio-toggle');
    if (weatherRadioCircleButton) {
        switchButtonStyle(weatherRadioCircleButton, weatherRadioVisible);
    }
}




function togglePlayPause(callSign, url) {
    const player = document.getElementById('global-player');
    const playButton = document.querySelector(`[onclick="togglePlayPause('${callSign}', '${url}')"]`);

    if (player.src !== url) {
        // Load new stream
        player.src = url;
        player.load();
        player.play().then(() => {
            updateMediaSession(callSign); // ✅ Update media metadata
            localStorage.setItem("lastPlayedStation", JSON.stringify({ callSign, url, isPlaying: true })); // ✅ Save station & playing state

            if (playButton) {
                playButton.innerHTML = '<i class="fas fa-volume-up"></i> Pause';
            }
        }).catch((error) => {
            console.error("Playback error:", error);
        });
    } else {
        // Toggle play/pause on current stream
        if (player.paused) {
            player.play().then(() => {
                localStorage.setItem("lastPlayedStation", JSON.stringify({ callSign, url, isPlaying: true })); // ✅ Mark as playing
                if (playButton) {
                    playButton.innerHTML = '<i class="fas fa-volume-up"></i> Pause';
                }
            }).catch((error) => {
                console.error("Playback error:", error);
            });
        } else {
            player.pause();
            localStorage.setItem("lastPlayedStation", JSON.stringify({ callSign, url, isPlaying: false })); // ✅ Mark as paused
            if (playButton) {
                playButton.innerHTML = '<i class="fas fa-volume-up"></i> Play';
            }
        }
    }
}


function refreshPlayButtonState(callSign, url) {
    const lastPlayed = JSON.parse(localStorage.getItem("lastPlayedStation"));
    const playButton = document.querySelector(`[onclick="togglePlayPause('${callSign}', '${url}')"]`);

    if (lastPlayed && lastPlayed.callSign === callSign && lastPlayed.isPlaying) {
        // ✅ Show "Pause" if it's currently playing
        if (playButton) {
            playButton.innerHTML = '<i class="fas fa-volume-up"></i> Pause';
        }
    } else {
        // ✅ Show "Play" if it's not playing
        if (playButton) {
            playButton.innerHTML = '<i class="fas fa-volume-up"></i> Play';
        }
    }
}
function isLightColor(color) {
  // Handle empty or null color
  if (!color) return false;
  
  // Convert hex to RGB
  let r, g, b;
  
  if (color.startsWith('#')) {
    // Handle hex color
    const hex = color.substring(1);
    r = parseInt(hex.substr(0, 2), 16);
    g = parseInt(hex.substr(2, 2), 16);
    b = parseInt(hex.substr(4, 2), 16);
  } else if (color.startsWith('rgb')) {
    // Handle rgb color
    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
    if (rgbMatch) {
      r = parseInt(rgbMatch[1]);
      g = parseInt(rgbMatch[2]);
      b = parseInt(rgbMatch[3]);
    } else {
      // Default to assuming it's dark
      return false;
    }
  } else {
    // Unknown format, default to assuming it's dark
    return false;
  }
  
  // Calculate perceived brightness using the formula: (0.299*R + 0.587*G + 0.114*B)
  const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // More lenient threshold - use 0.4 instead of 0.5
  // This will make more colors get classified as "light" and use black text
  return brightness > 0.7;
}

// Helper function to get text color based on background color
function getTextColorForBackground(backgroundColor) {
  return isLightColor(backgroundColor) ? 'black' : 'white';
}
// Global flags to track if an alert or spotter popup is open
let alertPopupActive = false;
let spotterPopupActive = false;

function getWatchRisk(percentage, type) {
    let category = "Very Low";
    let color = "beige";
    let textColor = "black"; // Default text color for Very Low risk
  
    if (type === "EF2-EF5 tornadoes") {
        if (percentage < 6) {
            category = "Very Low";
            color = "beige";
            textColor = "black"; // Black text for Very Low
        } else if (percentage < 25) {
            category = "Low";
            color = "orange";
            textColor = "white"; // White text for all other categories
        } else if (percentage < 65) {
            category = "Moderate";
            color = "red";
            textColor = "white";
        } else if (percentage < 85) {
            category = "High";
            color = "pink";
            textColor = "white";
        }
    } else {
        if (percentage < 5) {
            category = "Very Low";
            color = "beige";
            textColor = "black"; // Black text for Very Low
        } else if (percentage >= 5 && percentage < 25) {
            category = "Low"; 
            color = "orange";
            textColor = "white";
        } else if (percentage >= 26 && percentage < 69) {
            category = "Moderate"; 
            color = "red";
            textColor = "white";
        } else if (percentage >= 70) {
            category = "High"; 
            color = "magenta";
            textColor = "white";
        }
    }

    // Using the determined text color in the span
    return `<span style="background-color: ${color}; font-family: 'Inter', sans-serif !important; color: ${textColor} !important;
 padding: 3px; border-radius: 5px;">${category}</span>`;
}
function getWatch(watch) {
    // Use stored custom colors from localStorage, or fall back to defaults
    const tornadoWatchColor = localStorage.getItem('tornadoWatchColor') || '#841213';
    const severeWatchColor = localStorage.getItem('severeWatchColor') || '#998207';
    
    const type = watch.properties.TYPE === "TOR" ? "Tornado Watch #" : "Severe T-Storm Watch #";
    const alertTitle = `${type} ${watch.properties.NUM}`;
    const backgroundColor = watch.properties.TYPE === "TOR" ? tornadoWatchColor : severeWatchColor;
    
    
    // Determine text color based on background color
    const textColor = getTextColorForBackground(backgroundColor);


    const issuedDate = new Date(watch.properties.ISSUE).toLocaleString('en-US', {
        timeZone: 'America/New_York', 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric', 
        hour: 'numeric', 
        minute: 'numeric', 
        hour12: true
    });

    const expiresDate = new Date(watch.properties.EXPIRE).toLocaleString('en-US', {
        timeZone: 'America/New_York', 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric', 
        hour: 'numeric', 
        minute: 'numeric', 
        hour12: true
    });

  return `
    <div style="color: white; max-width: 320px; padding: 20px; border-radius: 8px; background-color: rgba(0, 0, 0, 0.75);">
        <h3 style="
            background-color: ${backgroundColor}; 
            padding: 5px; 
            border-radius: 5px; 
            margin: 0;
            text-align: center;
        ">
            ${alertTitle}
        </h3>
        ${watch.properties.IS_PDS ? `
            <div style="background-color: magenta; padding: 5px; border-radius: 5px; margin-top: 8px; text-align: center;">
                <b>PARTICULARLY DANGEROUS SITUATION</b>
            </div>` : ''}
        <p style="margin: 10px 0 5px;"><b>Issued:</b> ${issuedDate}</p>
        <p style="margin: 5px 0;"><b>Expires:</b> ${expiresDate}</p>
        <p style="margin: 5px 0;"><b>Max Hail Size:</b> ${watch.properties.MAX_HAIL}"</p>
        <p style="margin: 5px 0;"><b>Max Wind Gusts:</b> ${Math.ceil(watch.properties.MAX_GUST * 1.15077945)} mph</p>
    </div>
`;
}

// Store active watches
let watchPolygons = {};

function loadWatches() {
    console.info("Fetching active watches...");

    // Get current UTC date
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0'); 
    const day = String(now.getUTCDate()).padStart(2, '0');

    // Calculate yesterday's UTC date
    const yesterday = new Date();
    yesterday.setUTCDate(now.getUTCDate() - 1);
    const prevYear = yesterday.getUTCFullYear();
    const prevMonth = String(yesterday.getUTCMonth() + 1).padStart(2, '0'); 
    const prevDay = String(yesterday.getUTCDate()).padStart(2, '0');

    // Modified API request to include both today and yesterday
    const url = `https://www.mesonet.agron.iastate.edu/cgi-bin/request/gis/spc_watch.py?year1=${prevYear}&month1=${prevMonth}&day1=${prevDay}&hour1=0&minute1=0&year2=${year}&month2=${month}&day2=${day}&hour2=23&minute2=0&format=geojson`;

    // Add debug test data if no watches are available
    let useTestData = false;

    fetch(url, { headers: { 'Accept': 'Application/geo+json' } })
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch watches');
            return response.json();
        })
        .then(data => {
            if (!data.features || data.features.length === 0) {
                console.warn("No active watches found - using test data");
                // Use test data only if needed
                useTestData = true;
                return createTestWatchData();
            }

            console.log(`Loaded ${data.features.length} watches:`, data.features);
            return data;
        })
        .then(data => {
            // If we're using real data, filter out expired watches
            let activeWatches = data.features;
            if (!useTestData) {
                activeWatches = data.features.filter(watch => isWatchValid(watch.properties.EXPIRE));
            }

            if (activeWatches.length === 0) {
                console.warn("No active watches remain after filtering - using test data");
                useTestData = true;
                data = createTestWatchData();
                activeWatches = data.features;
            }

            // Create new GeoJSON object with only active watches
            const activeWatchData = {
                type: "FeatureCollection",
                features: activeWatches
            };

            // Always get current settings from localStorage with proper defaults
            const tornadoWatchEnabled = localStorage.getItem('tornadoWatchEnabled') !== 'false'; // Default true
            const severeWatchEnabled = localStorage.getItem('severeWatchEnabled') !== 'false';  // Default true
            const tornadoWatchColor = localStorage.getItem('tornadoWatchColor') || '#841213';
            const severeWatchColor = localStorage.getItem('severeWatchColor') || '#998207';
            
            console.log('Current watch settings:', { 
                tornadoWatchEnabled, 
                severeWatchEnabled, 
                tornadoWatchColor, 
                severeWatchColor 
            });

            if (map.getSource('watches')) {
                // If the source already exists, update the data
                map.getSource('watches').setData(activeWatchData);
                console.log("Updated existing watch source");
            } else {
                // If the source doesn't exist, create it along with layers
                console.log("Creating new watch source and layers");
                map.addSource('watches', { 
                    type: 'geojson',
                    data: activeWatchData,
                    generateId: true // Enable feature IDs for easier referencing
                });

                // IMPORTANT: Add fill layer with non-zero opacity for testing
                map.addLayer({
                    id: 'watch-layer-fill',
                    type: 'fill',
                    source: 'watches',
                    paint: {
                        'fill-color': [
                            'match',
                            ['get', 'TYPE'],
                            'TOR', tornadoWatchEnabled ? tornadoWatchColor : 'rgba(0,0,0,0)',
                            'SVR', severeWatchEnabled ? severeWatchColor : 'rgba(0,0,0,0)',
                            '#888888' // Default fallback color
                        ],
                        'fill-opacity': 0 // Small opacity to make it visible but not obtrusive
                    }
                });

                // Outer Black Border (Thicker 5px)
                map.addLayer({
                    id: 'watch-layer-border-outer',
                    type: 'line',
                    source: 'watches',
                    paint: {
                        'line-color': [
                            'match',
                            ['get', 'TYPE'],
                            'TOR', tornadoWatchEnabled ? 'black' : 'rgba(0,0,0,0)',
                            'SVR', severeWatchEnabled ? 'black' : 'rgba(0,0,0,0)',
                            '#888888' // Default fallback color
                        ],
                        'line-width': 7
                    }
                });

                // Inner Border (3px, Matches Fill Color)
                map.addLayer({
                    id: 'watch-layer-border-inner',
                    type: 'line',
                    source: 'watches',
                    paint: {
                        'line-color': [
                            'match',
                            ['get', 'TYPE'],
                            'TOR', tornadoWatchEnabled ? tornadoWatchColor : 'rgba(0,0,0,0)',
                            'SVR', severeWatchEnabled ? severeWatchColor : 'rgba(0,0,0,0)',
                            '#888888' // Default fallback color
                        ],
                        'line-width': 4
                    }
                });

                // Watch Click Handler
                map.on('click', 'watch-layer-fill', (e) => {
                    console.log("Watch clicked:", e.features[0]);
                    
                    // Prevent watch popup if alert or spotter popup is active
                    if (alertPopupActive || spotterPopupActive) {
                        alertPopupActive = false;
                        spotterPopupActive = false;
                        return;
                    }
                    
                    const spotterFeatures = map.queryRenderedFeatures(e.point, { layers: ['spotters-layer'] });
                    if (spotterFeatures && spotterFeatures.length > 0) {
                        // A spotter is present; do not show the watch popup.
                        return;
                    }
                    
                    // Check if any weather radio features are present at this click point
                    const weatherFeatures = map.queryRenderedFeatures(e.point, { layers: ['weather-radio-layer'] });
                    if (weatherFeatures && weatherFeatures.length > 0) {
                        // A weather radio feature is present, so do nothing.
                        return;
                    }

                    const watch = e.features[0].properties;
                    const expiresIn = getTimeRemaining(watch.EXPIRE);
                    const alertTitle = watch.TYPE === "TOR" ? `Tornado Watch #${watch.NUM}` : `Severe T-Storm Watch #${watch.NUM}`;
                    
                    // Use stored colors from localStorage, or fallback to defaults
const tornadoWatchColor = localStorage.getItem('tornadoWatchColor') || '#841213';
const severeWatchColor = localStorage.getItem('severeWatchColor') || '#998207';
const backgroundColor = watch.TYPE === "TOR" ? tornadoWatchColor : severeWatchColor;

// Determine text color based on background color
const textColor = getTextColorForBackground(backgroundColor);

const popupHTML = `
    <div style="
        color: white; 
        text-align: center; 
        width: 225px; 
        padding: 5px; 
        border-radius: 8px;">
        <h3 style="
            background-color: ${backgroundColor}; 
            color: ${textColor}; 
            padding: 5px; 
            border-radius: 5px; 
            margin: 0;
            font-size: 17px;
            line-height: 1.5em;
        ">
            ${alertTitle}
        </h3>
        <p style="margin: 8px 0 0; text-align: left;">
            <b>Expires in:</b> ${expiresIn}
        </p>
        <p style="margin: 0 0 0; text-align: left;">
            <b>Max Wind Gusts:</b> ${Math.ceil(watch.MAX_GUST * 1.15077945)} mph
        </p>
        <button 
            class="more-info-button" 
            style="margin-top: 12px; cursor: pointer;"
            onclick="showWatchPopup('${escape(JSON.stringify(watch))}')"
        >
            <i class="fas fa-info-circle" style="margin-right: 5px;"></i> More Info
        </button>
    </div>
`;

                    new AnimatedPopup({
                        closeButton: false,
                        anchor: 'bottom',
                        offset: [0, 0],
                        openingAnimation: { 
                            duration: 300, 
                            easing: 'easeInOutExpo', 
                            transform: 'scale' 
                        },
                        closingAnimation: { 
                            duration: 300, 
                            easing: 'easeInOutExpo', 
                            transform: 'scale' 
                        }
                    })
                    .setLngLat(e.lngLat)
                    .setHTML(popupHTML)
                    .addTo(map);
                });
            }
            
            
        })
        .catch(error => {
            console.error("Error loading watches:", error);
            // If API fails, use test data as fallback
            const testData = createTestWatchData();
            if (map.getSource('watches')) {
                map.getSource('watches').setData(testData);
            } else {
                // Set up source and layers with test data
                // (code would be the same as the .then block above)
            }
        });
}



function scrapeWatchText(watchNum) {
  // Pad watch number to 4 digits (e.g. 15 → "0015")
  const padded = String(watchNum).padStart(4, '0');
  const url = `https://www.spc.noaa.gov/products/watch/ww${padded}.html`;

  return fetch(url)
    .then(response => response.text())
    .then(html => {
      const startMarker = "URGENT - IMMEDIATE BROADCAST REQUESTED";
      const endMarker = "&&";

      // Find the watch text starting at startMarker
      let startIndex = html.indexOf(startMarker);
      if (startIndex === -1) {
        console.warn("Could not find the start marker in the watch HTML.");
        return { description: "", actions: "" };
      }

      // Cut off at endMarker
      let endIndex = html.indexOf(endMarker, startIndex);
      if (endIndex === -1) {
        endIndex = html.length;
      }
      let snippet = html.substring(startIndex, endIndex);

      // 1) Remove HTML tags
      snippet = snippet.replace(/<[^>]*>/g, "");

      // 2) Normalize newlines
      snippet = snippet.replace(/\r\n/g, "\n");

      // 3) Ensure a newline follows the start marker if needed
      snippet = snippet.replace(startMarker, match => {
        return match + (snippet[match.length] === "\n" ? "" : "\n");
      });

      // 4) Split off the precautionary actions (if present)
      const precautionMarker = /PRECAUTIONARY\/PREPAREDNESS ACTIONS\.\.\./i;
      let snippetDescription = snippet;
      let snippetActions = "";
      if (precautionMarker.test(snippet)) {
        const parts = snippet.split(precautionMarker);
        snippetDescription = parts[0];
        snippetActions = parts[1] || "";
      }

      // Remove any "REMEMBER..." text from actions
      snippetActions = snippetActions.replace(/REMEMBER\.\.\.\s*/i, "");

      // 5) Process snippetDescription:
      // Split into paragraphs on two or more newlines.
      let paragraphs = snippetDescription.split(/\n{2,}/);
      let processedDescription = "";

      if (paragraphs.length >= 2) {
        // First two paragraphs: preserve line breaks fully.
        let headerParagraphs = paragraphs.slice(0, 2)
          .map(p => p.split("\n").map(line => line.trim()).join("<br>"))
          .join("<br><br>");

        // Remaining paragraphs: collapse single newlines, except for one that
        // contains "* Primary threats include" (preserve newlines there).
        let remainingParagraphs = paragraphs.slice(2).map(p => {
          const trimmed = p.trim();
          if (/\*?\s*Primary threats include/i.test(trimmed)) {
            return trimmed
              .split("\n")
              .map(line => line.trim())
              .filter(line => line !== "")
              .join("<br>");
          } else {
            return trimmed.replace(/\n+/g, " ");
          }
        }).join("<br><br>");

        processedDescription = headerParagraphs;
        if (remainingParagraphs) {
          processedDescription += "<br><br>" + remainingParagraphs;
        }
      } else if (paragraphs.length === 1) {
        processedDescription = paragraphs[0]
          .split("\n")
          .map(line => line.trim())
          .join("<br>");
      }

      // Remove any trailing <br> tags and extra whitespace at the very end
      processedDescription = processedDescription.replace(/(<br>\s*)+$/, "").trim();

      // 6) Process snippetActions (collapse newlines into spaces)
      snippetActions = snippetActions.replace(/\n+/g, " ").trim();

      return {
        description: processedDescription,
        actions: snippetActions
      };
    })
    .catch(err => {
      console.error("Error scraping watch text:", err);
      // Return sample text for test watches
      if (watchNum === "123" || watchNum === "124") {
        return {
          description: "THIS IS A TEST WATCH. A powerful weather system is producing severe thunderstorms across the region. Conditions are favorable for the development of tornadoes and severe thunderstorms.<br><br>* Primary threats include:<br>  - Tornadoes<br>  - Large hail up to 2.5 inches in diameter<br>  - Damaging wind gusts up to 70 mph",
          actions: "People in the path of these storms should seek shelter immediately and monitor local weather updates."
        };
      }
      return { description: "", actions: "" };
    });
}

// Global variables for watch text-to-speech
let watchSelectedVoice = null;
let watchIsPlaying = false;
let watchIsPaused = false;
let watchSpeechUtterance = null;
let watchRadioWasPlaying = false;

// Populate voice list for watches
function populateWatchVoiceList() {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
        const isAppleDevice = /Mac|iPhone|iPod|iPad/.test(navigator.platform);
        watchSelectedVoice = isAppleDevice 
            ? voices.find(voice => voice.name.includes('Samantha')) || voices[0]
            : voices.find(voice => voice.name === 'Microsoft David Desktop - English (United States)') || voices[0];

        console.log("Selected voice for watch TTS:", watchSelectedVoice.name);
    } else {
        console.warn("No voices found for watch TTS!");
    }
}

if (typeof speechSynthesis !== 'undefined') {
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = function() {
            if (typeof populateVoiceList === 'function') {
                populateVoiceList(); // Original function for alerts if it exists
            }
            populateWatchVoiceList(); // New function for watches
        };
    }
    populateWatchVoiceList();
}



function formatWatchTextForSpeech(text) {
    return text
        .replace(/\*\s+/g, ' ')
        .replace(/\bmph\b/gi, 'miles per hour')
        .replace(/\bkts\b/gi, 'knots')
        .replace(/\bnm\b/gi, 'nautical miles')
        .replace(/\bEDT\b/g, 'Eastern Daylight Time')
        .replace(/\bEST\b/g, 'Eastern Standard Time')
        .replace(/\bCDT\b/g, 'Central Daylight Time')
        .replace(/\bCST\b/g, 'Central Standard Time')
        .replace(/\bMDT\b/g, 'Mountain Daylight Time')
        .replace(/\bMST\b/g, 'Mountain Standard Time')
        .replace(/\bPDT\b/g, 'Pacific Daylight Time')
        .replace(/\bPST\b/g, 'Pacific Standard Time')
        // Convert numbers to words
        .replace(/\b5\b/g, 'five')
        .replace(/\b10\b/g, 'ten')
        .replace(/\b15\b/g, 'fifteen')
        .replace(/\b20\b/g, 'twenty')
        .replace(/\b25\b/g, 'twenty-five')
        .replace(/\b30\b/g, 'thirty')
        .replace(/\b35\b/g, 'thirty-five')
        .replace(/\b40\b/g, 'forty')
        .replace(/\b45\b/g, 'forty-five')
        .replace(/\b50\b/g, 'fifty')
        .replace(/\b55\b/g, 'fifty-five')
        .replace(/\b60\b/g, 'sixty')
        .replace(/\b65\b/g, 'sixty-five')
        .replace(/\b70\b/g, 'seventy')
        .replace(/\b75\b/g, 'seventy-five')
        .replace(/\b80\b/g, 'eighty')
        .replace(/\b85\b/g, 'eighty-five')
        .replace(/\b90\b/g, 'ninety')
        .replace(/\b95\b/g, 'ninety-five')
        // Convert state abbreviations to full names
        .replace(/\bAL\b/g, 'Alabama')
        .replace(/\bAK\b/g, 'Alaska')
        .replace(/\bAZ\b/g, 'Arizona')
        .replace(/\bAR\b/g, 'Arkansas')
        .replace(/\bCA\b/g, 'California')
        .replace(/\bCO\b/g, 'Colorado')
        .replace(/\bCT\b/g, 'Connecticut')
        .replace(/\bDE\b/g, 'Delaware')
        .replace(/\bFL\b/g, 'Florida')
        .replace(/\bGA\b/g, 'Georgia')
        .replace(/\bHI\b/g, 'Hawaii')
        .replace(/\bID\b/g, 'Idaho')
        .replace(/\bIL\b/g, 'Illinois')
        .replace(/\bIN\b/g, 'Indiana')
        .replace(/\bIA\b/g, 'Iowa')
        .replace(/\bKS\b/g, 'Kansas')
        .replace(/\bKY\b/g, 'Kentucky')
        .replace(/\bLA\b/g, 'Louisiana')
        .replace(/\bME\b/g, 'Maine')
        .replace(/\bMD\b/g, 'Maryland')
        .replace(/\bMA\b/g, 'Massachusetts')
        .replace(/\bMI\b/g, 'Michigan')
        .replace(/\bMN\b/g, 'Minnesota')
        .replace(/\bMS\b/g, 'Mississippi')
        .replace(/\bMO\b/g, 'Missouri')
        .replace(/\bMT\b/g, 'Montana')
        .replace(/\bNE\b/g, 'Nebraska')
        .replace(/\bNV\b/g, 'Nevada')
        .replace(/\bNH\b/g, 'New Hampshire')
        .replace(/\bNJ\b/g, 'New Jersey')
        .replace(/\bNM\b/g, 'New Mexico')
        .replace(/\bNY\b/g, 'New York')
        .replace(/\bNC\b/g, 'North Carolina')
        .replace(/\bND\b/g, 'North Dakota')
        .replace(/\bOH\b/g, 'Ohio')
        .replace(/\bOK\b/g, 'Oklahoma')
        .replace(/\bOR\b/g, 'Oregon')
        .replace(/\bPA\b/g, 'Pennsylvania')
        .replace(/\bRI\b/g, 'Rhode Island')
        .replace(/\bSC\b/g, 'South Carolina')
        .replace(/\bSD\b/g, 'South Dakota')
        .replace(/\bTN\b/g, 'Tennessee')
        .replace(/\bTX\b/g, 'Texas')
        .replace(/\bUT\b/g, 'Utah')
        .replace(/\bVT\b/g, 'Vermont')
        .replace(/\bVA\b/g, 'Virginia')
        .replace(/\bWA\b/g, 'Washington')
        .replace(/\bWV\b/g, 'West Virginia')
        .replace(/\bWI\b/g, 'Wisconsin')
        .replace(/\bWY\b/g, 'Wyoming');
}

// Toggle text-to-speech for watch
function toggleWatchListen() {
    const playPauseBtn = document.getElementById('watch-play-pause-btn');
    
    // Always ensure styles are applied directly
    if (!watchSelectedVoice) {
        // Try to get voices again
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            watchSelectedVoice = voices[0];
        } else {
            console.warn("No voices available for TTS");
            return;
        }
    }

    // If playing and pause button is clicked
    if (watchIsPlaying && !watchIsPaused) {
        window.speechSynthesis.pause();
        playPauseBtn.innerHTML = '<i class="fa-solid fa-volume-up" style="margin-right: 5px;"></i> Resume Watch';
        watchIsPaused = true;
        
        // Force style update
        playPauseBtn.style.backgroundColor = "#636381";
        playPauseBtn.style.color = "white";
        playPauseBtn.style.border = "2px solid white";
        return;
    }
    
    // If paused and resume button is clicked
    if (watchIsPlaying && watchIsPaused) {
        window.speechSynthesis.resume();
        playPauseBtn.innerHTML = '<i class="fa-solid fa-volume-up" style="margin-right: 5px;"></i> Pause Watch';
        watchIsPaused = false;
        
        // Force style update
        playPauseBtn.style.backgroundColor = "white";
        playPauseBtn.style.color = "#7F1DF0";
        playPauseBtn.style.border = "2px solid #636381";
        return;
    }
    
    // If not playing yet (initial state)
    // Get watch description text
    const watchDescElement = document.getElementById('watch-description');
    if (!watchDescElement) return;
    
    // Get all text content without HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = watchDescElement.innerHTML;
    let descriptionText = tempDiv.textContent || '';
    descriptionText = descriptionText.replace(/\s+/g, ' ').trim();
    
    if (!descriptionText) return;
    
    // Cancel any existing speech
    window.speechSynthesis.cancel();
    
    // Prep new speech
    watchSpeechUtterance = new SpeechSynthesisUtterance(formatWatchTextForSpeech(descriptionText));
    watchSpeechUtterance.lang = 'en-US';
    watchSpeechUtterance.voice = watchSelectedVoice;

    // Handle weather radio
    let player = document.getElementById('global-player');
    if (player && !player.paused) {
        player.pause();
        watchRadioWasPlaying = true;
    }

    // Speech ended handler
    watchSpeechUtterance.onend = function() {
        // Reset button
        playPauseBtn.innerHTML = '<i class="fa-solid fa-volume-up" style="margin-right: 5px;"></i> Play Watch';
        watchIsPlaying = false;
        watchIsPaused = false;
        
        // Force style update
        playPauseBtn.style.backgroundColor = "#636381";
        playPauseBtn.style.color = "white";
        playPauseBtn.style.border = "2px solid white";
        
        // Resume weather radio if it was playing
        if (watchRadioWasPlaying) {
            player.play();
            watchRadioWasPlaying = false;
        }
    };

    // Start speech
    window.speechSynthesis.speak(watchSpeechUtterance);
    
    // Update UI
    playPauseBtn.innerHTML = '<i class="fa-solid fa-volume-up" style="margin-right: 5px;"></i> Pause Watch';
    watchIsPlaying = true;
    watchIsPaused = false;
    
    // Force style update
    playPauseBtn.style.backgroundColor = "white";
    playPauseBtn.style.color = "#7F1DF0";
    playPauseBtn.style.border = "2px solid #636381";
}

// Modify closeWatchPopup to properly reset TTS state
function closeWatchPopup() {
    const popup = document.getElementById('watch-popup');
    popup.classList.add('hide');

    // Always cancel speech and reset state when closing
    window.speechSynthesis.cancel();
    watchIsPlaying = false;
    watchIsPaused = false;
    
    // Resume weather radio if needed
    if (watchRadioWasPlaying) {
        const player = document.getElementById('global-player');
        if (player) {
            player.play();
            watchRadioWasPlaying = false;
        }
    }

    // Wait for animation to complete
    setTimeout(() => {
        popup.classList.remove('show', 'hide'); 
        
        // Remove the status line
        const statusLine = document.querySelector('.watch-status-line');
        if (statusLine) {
            statusLine.remove();
        }
    }, 300);
}

function resetWatchSpeechAndButton(playPauseBtn) {
    window.speechSynthesis.cancel();
    playPauseBtn.innerHTML = '<i class="fa-solid fa-volume-up" style="margin-right: 5px;"></i> Play Watch';
    watchIsPlaying = false;
    watchIsPaused = false;
    // Set the button to its "off" style: gray background, white text, white border.
    updateWatchButtonStyle(playPauseBtn, false);
}

function updateWatchButtonStyle(button, isOn, isResume = false) {
    if (isResume) {
        button.style.backgroundColor = "#636381";
        button.style.color = "white";
        button.style.border = "2px solid white";
    } else if (isOn) {
        button.style.backgroundColor = "white";
        button.style.color = "#7F1DF0";
        button.style.border = "2px solid #636381";
    } else {
        // Off state style
        button.style.backgroundColor = "#636381";
        button.style.color = "white";
        button.style.border = "2px solid white";
    }
}

// Modify fetchWatchDescription to create button with inline onclick and use custom watch color
function fetchWatchDescription(watchNum, backgroundColor) {
  return scrapeWatchText(watchNum)
    .then(({ description, actions }) => {
      if (!description && !actions) return "";

      // DESCRIPTION BLOCK (unchanged)
      const descriptionBlock = `
        <div style="margin-top: 25px; width: 100%;">
          <b style="display: block; margin-bottom: 5px;">Description:</b>
          <div style="display: flex; align-items: stretch; width: 100%;">
            <div style="
              width: 5px;
              min-width: 5px;
              flex: 0 0 auto;
              background-color: ${backgroundColor};
              border-radius: 10px 0 0 10px;
              margin-right: 10px;
            "></div>
            <div style="flex: 1; min-width: 0;">
              <div style="
                margin: 0;
                white-space: normal;
                line-height: 1.4;
                overflow-wrap: break-word;
                font-size: 16px;
                color: white;
              ">
                ${description}
              </div>
            </div>
          </div>
        </div>
      `;

      // ACTION RECOMMENDED BLOCK
      let actionsBlock = "";
      if (actions) {
        actionsBlock = `
          <div style="margin-top: 20px; width: 100%;">
            <div style="
              margin: 0;
              white-space: normal;
              overflow-wrap: break-word;
              font-size: 16px;
              line-height: 1.4;
              color: white;
            ">
              <b>Action Recommended:</b> ${actions}
            </div>
          </div>
        `;
      }

      // ADD TTS BUTTON with direct JS function
      const ttsButton = `
        <div style="margin-top: 20px; width: 100%;">
          <button 
            id="watch-play-pause-btn" 
            onclick="toggleWatchListen()" 
            style="
              width: 100%;
              padding: 8px;
              border-radius: 10px;
              font-size: 16px;
              cursor: pointer;
              font-weight: bold;
              background-color: #636381;
              color: white;
              border: 2px solid white;
              transition: all 0.2s ease;
            "
          >
            <i class="fa-solid fa-volume-up" style="margin-right: 5px;"></i> Play Watch
          </button>
        </div>
      `;

      return descriptionBlock + actionsBlock + ttsButton;
    });
}

// Refresh watches every 60 seconds
setInterval(loadWatches, 60000);

// Function to check if a watch is still valid
function isWatchValid(timestamp) {
    const watchDate = formatWatchDate(timestamp);
    return watchDate > new Date();
}

/**
 * Converts SPC timestamp to "MM/DD/YYYY, h:mm:ss AM/PM" format
 */
function formatWatchDateStandard(timestamp) {
    const year = parseInt(timestamp.slice(0, 4), 10);
    const month = parseInt(timestamp.slice(4, 6), 10) - 1; // JavaScript months are 0-indexed
    const day = parseInt(timestamp.slice(6, 8), 10);
    const hour = parseInt(timestamp.slice(8, 10), 10);
    const minute = parseInt(timestamp.slice(10, 12), 10);
    const second = 0; // Defaulting to zero since SPC timestamp doesn't provide seconds

    return new Date(Date.UTC(year, month, day, hour, minute, second)).toLocaleString('en-US', {
        timeZone: 'America/New_York', // Change if needed
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: true // Ensures AM/PM format
    });
}

// Function to determine watch status
function getWatchStatus(sentTime, expiresTime) {
  const now = new Date();
  const sent = new Date(sentTime);
  const expires = new Date(expiresTime);
  
  // Check if watch is expired
  if (now >= expires) {
    return "Expired";
  }
  
  // Calculate the percentage of the watch duration that has elapsed
  const totalDuration = expires - sent;
  const elapsedDuration = now - sent;
  const percentComplete = (elapsedDuration / totalDuration) * 100;
  
  // Status thresholds based on percentage complete
  if (percentComplete <= 20) {
    return "Recently Issued";
  }
  else if (percentComplete >= 80) {
    return "Expiring Soon";
  }
  else {
    return "Active";
  }
}

// Function to format time for display in watch status line
function formatTimeForStatusWatch(timeString, sentTime, expiresTime) {
  if (!timeString) return '';
  
  const date = new Date(timeString);
  
  // Get time in 12-hour format
  const timeStr = date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' });
  
  // Check if the sent date and expires date are on different days
  if (sentTime && expiresTime) {
    const sent = new Date(sentTime);
    const expires = new Date(expiresTime);
    
    const differentDays = sent.toDateString() !== expires.toDateString();
    
    // If watch spans multiple days, include the day name
    if (differentDays) {
      const dayName = date.toLocaleString('en-US', { weekday: 'short' });
      return `${dayName}, ${timeStr}`;
    }
  }
  
  // Otherwise just show the time
  return timeStr;
}

// Animation function with strong easing (fast start, slow end)
function animateWatchStatusLine(element, finalPosition) {
  // Reset any previous animation state
  const dotElement = element.querySelector('.indicator-dot');
  const lineElement = element.querySelector('.elapsed-line');
  
  if (dotElement) dotElement.style.left = '0%';
  if (lineElement) lineElement.style.width = '0%';
  
  // Force browser to acknowledge the reset
  void element.offsetWidth;
  
  // Get current status
  const sentTime = element.getAttribute('data-sent');
  const expiresTime = element.getAttribute('data-expires');
  const currentStatus = getWatchStatus(sentTime, expiresTime);
  const isExpired = currentStatus === "Expired";
  
  // If expired, set directly to 100% with exclamation mark
  if (isExpired) {
    if (dotElement) {
      dotElement.innerHTML = '<i class="fas fa-exclamation"></i>';
      dotElement.classList.add('expired');
      dotElement.style.display = 'flex';
      dotElement.style.alignItems = 'center';
      dotElement.style.justifyContent = 'center';
      dotElement.style.fontSize = '10px';
      dotElement.style.color = '#fff';
      dotElement.style.width = '18px';
      dotElement.style.height = '18px';
      dotElement.style.left = '100%';
      dotElement.style.animation = 'pulseExpired 2s infinite ease-in-out';
    }
    if (lineElement) {
      lineElement.style.width = '100%';
    }
    
    const statusText = element.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = "Expired";
      statusText.style.color = '#ff0000';
    }
    
    return; // Skip animation for expired watches
  }
  
  // Regular animation for non-expired watches
  let startPosition = 0;
  const duration = 500; // 500ms animation
  const startTime = performance.now();
  
  function easeOutQuint(t) {
    // Strong deceleration curve (fast start, very slow end)
    return 1 - Math.pow(1 - t, 5);
  }
  
  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    
    if (elapsed < duration) {
      // Calculate progress with strong easing
      const progress = elapsed / duration;
      const easedProgress = easeOutQuint(progress);
      const currentPosition = startPosition + (finalPosition - startPosition) * easedProgress;
      
      // Update elements
      if (dotElement) dotElement.style.left = `${currentPosition}%`;
      if (lineElement) lineElement.style.width = `${currentPosition}%`;
      
      requestAnimationFrame(animate);
    } else {
      // Ensure we end at exactly the target position
      if (dotElement) dotElement.style.left = `${finalPosition}%`;
      if (lineElement) lineElement.style.width = `${finalPosition}%`;
    }
  }
  
  requestAnimationFrame(animate);
}

// Add CSS for the pulsing animation if it doesn't exist
function addPulseAnimation() {
  if (!document.getElementById('pulse-animation-style')) {
    const style = document.createElement('style');
    style.id = 'pulse-animation-style';
    style.textContent = `
      @keyframes pulseExpired {
        0% { transform: translate(-50%, -50%) scale(1); }
        50% { transform: translate(-50%, -50%) scale(1.2); }
        100% { transform: translate(-50%, -50%) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize pulse animation on page load
document.addEventListener('DOMContentLoaded', addPulseAnimation);

// Real-time updating of watch status lines
function initWatchStatusUpdater() {
  // Update every second for smooth movement
  setInterval(() => {
    const statusElements = document.querySelectorAll('.watch-status-line');
    
    statusElements.forEach(element => {
      const sentTime = element.getAttribute('data-sent');
      const expiresTime = element.getAttribute('data-expires');
      
      if (!sentTime || !expiresTime) return;
      
      // Calculate new position
      const now = new Date();
      const startTime = new Date(sentTime);
      const endTime = new Date(expiresTime);
      const totalDuration = endTime - startTime;
      const elapsedDuration = now - startTime;
      const positionPercent = Math.min(Math.max((elapsedDuration / totalDuration) * 100, 0), 100);
      
      // Get current status
      const currentStatus = getWatchStatus(sentTime, expiresTime);
      const isExpired = currentStatus === "Expired";
      
      // Update position of indicator
      const indicator = element.querySelector('.indicator-dot');
      if (indicator) {
        // For expired watches, show exclamation mark
        if (isExpired && !indicator.classList.contains('expired')) {
          indicator.innerHTML = '<i class="fas fa-exclamation"></i>';
          indicator.classList.add('expired');
          indicator.style.display = 'flex';
          indicator.style.alignItems = 'center';
          indicator.style.justifyContent = 'center';
          indicator.style.fontSize = '10px';
          indicator.style.color = '#fff';
          indicator.style.width = '18px';
          indicator.style.height = '18px';
          indicator.style.animation = 'pulseExpired 2s infinite ease-in-out';
        }
        indicator.style.left = isExpired ? '100%' : `${positionPercent}%`;
      }
      
      // Update elapsed time line
      const elapsedLine = element.querySelector('.elapsed-line');
      if (elapsedLine) {
        elapsedLine.style.width = isExpired ? '100%' : `${positionPercent}%`;
      }
      
      // Update status text if it changed
      const statusText = element.querySelector('.status-text');
      if (statusText && statusText.textContent !== currentStatus) {
        // Update the status text
        statusText.textContent = currentStatus;
        
        // For expired watches, change color to red
        if (isExpired) {
          statusText.style.color = '#ff0000';
        }
        
        // Add a brief highlight animation when status changes
        statusText.style.transition = 'none';
        statusText.style.transform = 'scale(1.2)';
        statusText.style.opacity = '0.8';
        
        // Reset after a moment to create flash effect
        setTimeout(() => {
          statusText.style.transition = 'all 0.5s ease-out';
          statusText.style.transform = 'scale(1)';
          statusText.style.opacity = '1';
        }, 50);
      }
    });
  }, 1000);
}

// Start the updater when the page loads
document.addEventListener('DOMContentLoaded', initWatchStatusUpdater);

function showWatchPopup(watchInfoString) {
  const watch = JSON.parse(unescape(watchInfoString));

  // Get custom colors from localStorage
  const tornadoWatchColor = localStorage.getItem('tornadoWatchColor') || '#841213';
  const severeWatchColor = localStorage.getItem('severeWatchColor') || '#998207';
  const watchColor = watch.TYPE === "TOR" ? tornadoWatchColor : severeWatchColor;
  
  // Determine appropriate text color based on background
  const titleTextColor = getTextColorForBackground(watchColor);

  

  // Grab DOM references
  const titleElement = document.getElementById('watch-popup-title');
  const detailsElement = document.getElementById('watch-popup-details');
  const probabilitiesElement = document.getElementById('watch-popup-probabilities');
  const actionElement = document.getElementById('popup-action');

 // Set title and styling
  titleElement.innerText = watch.TYPE === "TOR" 
    ? `Tornado Watch #${watch.NUM}` 
    : `Severe T-Storm Watch #${watch.NUM}`;
  titleElement.style.backgroundColor = watchColor;
  titleElement.style.color = titleTextColor;

  // Set basic details
  detailsElement.innerHTML = `
    <p><b>Issued:</b> ${formatWatchDateStandard(watch.ISSUE)}</p>
    <p style="margin-bottom: 10px;"><b>Expires:</b> ${formatWatchDateStandard(watch.EXPIRE)}</p>
    <p><b>Max Wind Gusts:</b> ${Math.ceil(watch.MAX_GUST * 1.15077945)} mph</p>
    <p style="margin-bottom: 20px;"><b>Max Hail Size:</b> ${watch.MAX_HAIL}"</p>
  `;
  
  // Convert the watch timestamps to JavaScript Date objects
  const issuedTime = formatWatchDate(watch.ISSUE);
  const expiresTime = formatWatchDate(watch.EXPIRE);
  
  // Calculate position of indicator based on elapsed time
  const now = new Date();
  const totalDuration = expiresTime - issuedTime;
  const elapsedDuration = now - issuedTime;
  const positionPercent = Math.min(Math.max((elapsedDuration / totalDuration) * 100, 0), 100);
  
  // Get watch status
  const watchStatus = getWatchStatus(issuedTime, expiresTime);
  const isExpired = watchStatus === "Expired";
  
  // Format times for display
  const formattedIssuedTime = formatTimeForStatusWatch(issuedTime, issuedTime, expiresTime);
  const formattedExpiresTime = formatTimeForStatusWatch(expiresTime, issuedTime, expiresTime);
  
  const statusColor = isExpired ? '#ff0000' : watchColor;
  
  // Special handling for expired watches
  const dotContent = isExpired ? '<i class="fas fa-exclamation"></i>' : '';
  const dotClasses = isExpired ? 'indicator-dot expired' : 'indicator-dot';
  const dotStyle = isExpired ? 
    `position: absolute; left: 100%; top: 50%; transform: translate(-50%, -50%); 
     width: 18px; height: 18px; background-color: ${watchColor}; border-radius: 50%; 
     box-shadow: 0 0 8px 2px ${watchColor}; z-index: 2; display: flex; align-items: center; 
     justify-content: center; font-size: 10px !important; color: #fff; animation: pulseExpired 2s infinite ease-in-out;` : 
    `position: absolute; left: 0%; top: 50%; transform: translate(-50%, -50%); 
     width: 14px; height: 14px; background-color: ${watchColor}; border-radius: 50%; 
     box-shadow: 0 0 8px 2px ${watchColor}; z-index: 2;`;
  
  const initialLineWidth = isExpired ? '100%' : '0%';
  
// Add status line right after the details section
const statusLineHTML = `
  <div class="watch-status-line" 
       data-sent="${issuedTime.toISOString()}" 
       data-expires="${expiresTime.toISOString()}" 
       style="margin: 0 0 20px 0; position: relative;">
    
    <div style="height: 6px; background-color: #333; border-radius: 3px; position: relative; overflow: visible;">
      <!-- Status line background -->
      <div style="
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: 100%;
        background-color: #555;
        border-radius: 3px;
      "></div>
      
      <!-- Elapsed time indicator -->
      <div class="elapsed-line" style="
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: ${initialLineWidth};
        background-color: ${watchColor || '#FFFFFF'};
        border-radius: 3px 0 0 3px;
      "></div>
      
      <!-- Current position indicator with glow effect -->
      <div class="${dotClasses}" style="${dotStyle}">
        ${dotContent}
      </div>
    </div>
    
    <div style="display: flex; justify-content: space-between; margin-top: 5px;">
      <span style="font-size: 12px !important; color: #ccc !important;">${formattedIssuedTime}</span>
      <span class="status-text" style="font-size: 14px !important; font-weight: bold !important; color: ${statusColor} !important;">${watchStatus}</span>
      <span style="font-size: 12px !important; color: #ccc !important;">${formattedExpiresTime}</span>
    </div>
  </div>
`;

  
  // Insert status line after details
  detailsElement.insertAdjacentHTML('afterend', statusLineHTML);

  // Set probabilities
  probabilitiesElement.innerHTML = `
    <h2 style="color: white; font-size: 20px; margin-bottom: 12px;">Probabilities</h2>
    <p style="margin-bottom: 12px;"><b>Tornado threat:</b> ${getWatchRisk(watch.P_TORTWO, "tornadoes")}</p>
    <p style="margin-bottom: 20px;"><b>Strong tornado threat:</b> ${getWatchRisk(watch.P_TOREF2, "EF2-EF5 tornadoes")}</p>
    <p style="margin-bottom: 12px;"><b>Wind threat:</b> ${getWatchRisk(watch.P_WIND10, "wind")}</p>
    <p style="margin-bottom: 20px;"><b>Strong wind threat:</b> ${getWatchRisk(watch.P_WIND65, "wind")}</p>
    <p style="margin-bottom: 12px;"><b>Hail threat:</b> ${getWatchRisk(watch.P_HAIL10, "hail")}</p>
    <p><b>Severe hail threat:</b> ${getWatchRisk(watch.P_HAIL2I, "hail")}</p>
  `;

  // Create or clear the description container below probabilities
  let descContainer = document.getElementById('watch-description');
  if (!descContainer) {
    descContainer = document.createElement('div');
    descContainer.id = 'watch-description';
    probabilitiesElement.insertAdjacentElement('afterend', descContainer);
  } else {
    descContainer.innerHTML = '';
  }

  // Fetch the dynamic watch description snippet
  fetchWatchDescription(watch.NUM, watchColor)
    .then(descHTML => {
      descContainer.innerHTML = descHTML;
    });

  // Finally, show the popup (assumes CSS handles the .show class)
  document.getElementById('watch-popup').classList.add('show');
  
  // Animate the status line if not expired
  setTimeout(() => {
    const statusLineElement = document.querySelector('.watch-status-line');
    if (statusLineElement && !isExpired) {
      animateWatchStatusLine(statusLineElement, positionPercent);
    }
  }, 300); // Small delay to ensure the DOM is ready
}

/**
 * Function to calculate time remaining until expiration
 * Returns a formatted string like "1hr 45m" or "45m"
 */
function getTimeRemaining(expireTimestamp) {
    const now = new Date();
    const expireDate = formatWatchDate(expireTimestamp); // Convert SPC format to Date object
    const diffMs = expireDate - now; // Difference in milliseconds

    if (diffMs <= 0) return "Expired"; // If already expired

    const totalMinutes = Math.floor(diffMs / 60000); // Convert ms to minutes
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
        return `${hours}hr ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

/**
 * Converts SPC timestamp format to a JavaScript Date object
 */
function formatWatchDate(timestamp) {
    const year = parseInt(timestamp.slice(0, 4), 10);
    const month = parseInt(timestamp.slice(4, 6), 10) - 1;
    const day = parseInt(timestamp.slice(6, 8), 10);
    const hour = parseInt(timestamp.slice(8, 10), 10);
    const minute = parseInt(timestamp.slice(10, 12), 10);
    return new Date(Date.UTC(year, month, day, hour, minute));
}

// Helper function to log all current watches for debugging
function logCurrentWatches() {
    console.log("Current watches in watchPolygons:");
    for (const expirationTime in watchPolygons) {
        const parsedExpirationTime = parseInt(expirationTime);
        const expirationDate = new Date(parsedExpirationTime);
        console.log(`Watch expiration time: ${expirationDate.toISOString()} (${parsedExpirationTime})`);
    }
}

// Function to remove all watches from the map
function removeAllWatches() {
  // Check if the watch layers exist and remove them
  const watchLayers = [
    'watch-layer-fill',
    'watch-layer-border-outer',
    'watch-layer-border-inner'
  ];
  
  watchLayers.forEach(layerId => {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  });
  
  // Remove the watches source if it exists
  if (map.getSource('watches')) {
    map.removeSource('watches');
  }
  
  // Clear any stored watch polygons
  watchPolygons = {};
  
  console.log("All watches have been removed from the map.");
}

// Function to check for and remove any expired watches
function checkAndRemoveExpiredWatches() {
  if (!map.getSource('watches')) return;
  
  try {
    // Get the current watch data
    const currentData = map.getSource('watches')._data;
    
    if (!currentData || !currentData.features || currentData.features.length === 0) return;
    
    // Filter to only include valid (non-expired) watches
    const activeWatches = currentData.features.filter(watch => 
      isWatchValid(watch.properties.EXPIRE)
    );
    
    // If all watches are expired, remove everything
    if (activeWatches.length === 0) {
      console.log("All watches have expired, removing from map.");
      removeAllWatches();
      return;
    }
    
    // If some watches expired but others remain, update the data
    if (activeWatches.length < currentData.features.length) {
      console.log(`Removed ${currentData.features.length - activeWatches.length} expired watch(es).`);
      
      const updatedData = {
        type: "FeatureCollection",
        features: activeWatches
      };
      
      map.getSource('watches').setData(updatedData);
    }
  } catch (error) {
    console.error("Error checking for expired watches:", error);
  }
}

// Set up a more frequent check for expired watches (every 15 seconds)
// This ensures watches are removed promptly when they expire
setInterval(checkAndRemoveExpiredWatches, 15000);

// Load watches on map load and refresh every 60 seconds
map.on('load', () => {
    console.log("Map loaded, loading watches...");
    loadWatches();
    setInterval(loadWatches, 60000);
});

// Initialize watch settings from localStorage or use defaults
document.addEventListener('DOMContentLoaded', function() {
    // Find all alert toggle options in the watches settings container
    const watchesSettingsContainer = document.getElementById('watches-settings-container');
    
    if (watchesSettingsContainer) {
        const alertToggleOptions = watchesSettingsContainer.querySelectorAll('.alert-toggle-option');
        
        // Process each toggle option
        alertToggleOptions.forEach(option => {
            const toggleText = option.querySelector('.toggle-text').textContent.trim();
            const colorPicker = option.querySelector('input[type="color"]');
            const checkbox = option.querySelector('input[type="checkbox"]');
            
            if (toggleText === 'Tornado Watch') {
                // Set initial values from localStorage or defaults
                const savedColor = localStorage.getItem('tornadoWatchColor') || '#841213';
                const isEnabled = localStorage.getItem('tornadoWatchEnabled') !== 'false';
                
                if (colorPicker) colorPicker.value = savedColor;
                if (checkbox) checkbox.checked = isEnabled;
                
                // Add event listeners
                if (colorPicker) {
                    colorPicker.addEventListener('input', function() {
                        localStorage.setItem('tornadoWatchColor', this.value);
                        updateWatchLayers();
                        console.log('Tornado Watch color updated:', this.value);
                    });
                }
                
                if (checkbox) {
                    checkbox.addEventListener('change', function() {
                        localStorage.setItem('tornadoWatchEnabled', this.checked);
                        updateWatchLayers();
                        console.log('Tornado Watch enabled:', this.checked);
                    });
                }
            }
            
            if (toggleText === 'Severe Thunderstorm Watch') {
                // Set initial values from localStorage or defaults
                const savedColor = localStorage.getItem('severeWatchColor') || '#998207';
                const isEnabled = localStorage.getItem('severeWatchEnabled') !== 'false';
                
                if (colorPicker) colorPicker.value = savedColor;
                if (checkbox) checkbox.checked = isEnabled;
                
                // Add event listeners
                if (colorPicker) {
                    colorPicker.addEventListener('input', function() {
                        localStorage.setItem('severeWatchColor', this.value);
                        updateWatchLayers();
                        console.log('Severe Watch color updated:', this.value);
                    });
                }
                
                if (checkbox) {
                    checkbox.addEventListener('change', function() {
                        localStorage.setItem('severeWatchEnabled', this.checked);
                        updateWatchLayers();
                        console.log('Severe Watch enabled:', this.checked);
                    });
                }
            }
        });
    } else {
        console.warn('Watches settings container not found, adding watches programmatically');
        
        // Set default values in localStorage if not already set
        if (localStorage.getItem('tornadoWatchEnabled') === null) {
            localStorage.setItem('tornadoWatchEnabled', 'true');
        }
        if (localStorage.getItem('severeWatchEnabled') === null) {
            localStorage.setItem('severeWatchEnabled', 'true');
        }
        if (!localStorage.getItem('tornadoWatchColor')) {
            localStorage.setItem('tornadoWatchColor', '#841213');
        }
        if (!localStorage.getItem('severeWatchColor')) {
            localStorage.setItem('severeWatchColor', '#998207');
        }
    }
});

// Function to update watch layers based on current settings
function updateWatchLayers() {
    // Only proceed if map and watches source exist
    if (!map || !map.getSource('watches')) {
        console.log('Map or watches source not ready yet');
        return;
    }
    
    // Get current settings
    const tornadoWatchEnabled = localStorage.getItem('tornadoWatchEnabled') !== 'false';
    const severeWatchEnabled = localStorage.getItem('severeWatchEnabled') !== 'false';
    const tornadoWatchColor = localStorage.getItem('tornadoWatchColor') || '#841213';
    const severeWatchColor = localStorage.getItem('severeWatchColor') || '#998207';
    
    console.log('Applying watch settings:', {
        tornadoWatchEnabled,
        severeWatchEnabled,
        tornadoWatchColor,
        severeWatchColor
    });
    
    // Update fill layer color and opacity
    map.setPaintProperty('watch-layer-fill', 'fill-color', [
        'match',
        ['get', 'TYPE'],
        'TOR', tornadoWatchEnabled ? tornadoWatchColor : 'rgba(0,0,0,0)',
        'SVR', severeWatchEnabled ? severeWatchColor : 'rgba(0,0,0,0)',
        '#888888' // Default fallback color
    ]);
    
    // Set opacity to 0.15 for visible watches, 0 for hidden watches
    map.setPaintProperty('watch-layer-fill', 'fill-opacity', [
        'case',
        ['all', ['==', ['get', 'TYPE'], 'TOR'], ['==', tornadoWatchEnabled, true]], 0.,
        ['all', ['==', ['get', 'TYPE'], 'SVR'], ['==', severeWatchEnabled, true]], 0,
        0 // If neither condition matches
    ]);
    
    // Update the paint property for the inner border layer to use the custom colors
    map.setPaintProperty('watch-layer-border-inner', 'line-color', [
        'match',
        ['get', 'TYPE'],
        'TOR', tornadoWatchEnabled ? tornadoWatchColor : 'rgba(0,0,0,0)', // If disabled, make transparent
        'SVR', severeWatchEnabled ? severeWatchColor : 'rgba(0,0,0,0)',   // If disabled, make transparent
        '#888888' // Default fallback color
    ]);
    
    // Also update visibility of outer black border based on toggle state
    map.setPaintProperty('watch-layer-border-outer', 'line-color', [
        'match',
        ['get', 'TYPE'],
        'TOR', tornadoWatchEnabled ? 'black' : 'rgba(0,0,0,0)', // If disabled, make transparent
        'SVR', severeWatchEnabled ? 'black' : 'rgba(0,0,0,0)',  // If disabled, make transparent
        '#888888' // Default fallback color
    ]);
    
    // Add a filter to hide watches that are toggled off - this is what was missing!
    const filter = [
        'any',
        ['all', ['==', ['get', 'TYPE'], 'TOR'], ['==', tornadoWatchEnabled, true]],
        ['all', ['==', ['get', 'TYPE'], 'SVR'], ['==', severeWatchEnabled, true]]
    ];
    
    // Apply the same filter to all watch layers
    map.setFilter('watch-layer-fill', filter);
    map.setFilter('watch-layer-border-outer', filter);
    map.setFilter('watch-layer-border-inner', filter);
}

// Call this when watches are loaded or refreshed
function onWatchesLoaded() {
    // This will be called after map.getSource('watches').setData() in loadWatches()
    updateWatchLayers();
}











document.addEventListener("DOMContentLoaded", function () {
  // Grab the menu item element
  const spotterToggle = document.getElementById("spotter-network-toggle");
  // Grab the check icon inside it
  const checkIcon = spotterToggle.querySelector(".menu-item-check");

  // Read saved state from localStorage (default to false if not set)
  let spotterEnabled = localStorage.getItem("spotterNetworkEnabled") === "true";
  
  // Update UI based on stored state
  checkIcon.style.display = spotterEnabled ? "block" : "none";

  // Add click event listener to toggle state
  spotterToggle.addEventListener("click", function (e) {
    // Prevent event propagation so the popup doesn't dismiss (if that's your behavior)
    e.stopPropagation();
    
    // Toggle the state
    spotterEnabled = !spotterEnabled;
    // Save the new state to localStorage
    localStorage.setItem("spotterNetworkEnabled", spotterEnabled);
    // Update the check icon: show when enabled, hide when disabled
    checkIcon.style.display = spotterEnabled ? "block" : "none";
    
    // Optionally call your toggle function (for example, to toggle reports)
    if (typeof toggleReports === "function") {
      toggleReports();
    }
    
    // Immediately update the spotter markers
    updateSpotters();
  });
});





 // Function to convert UTC time to user's local time
function formatLocalTime(utcString) {
    if (!utcString) return null;
    const timeParts = utcString.match(/([A-Za-z]+) (\d+) (\d+):(\d+) UTC/);
    if (!timeParts) return null;

    const monthNames = {
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
        Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    };

    const month = monthNames[timeParts[1]];
    const day = parseInt(timeParts[2]);
    const hour = parseInt(timeParts[3]);
    const minute = parseInt(timeParts[4]);
    const year = new Date().getFullYear();

    const utcDate = new Date(Date.UTC(year, month, day, hour, minute));
    const options = {
        year: '2-digit', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: true
    };

    return utcDate.toLocaleString(undefined, options).replace(",", ",");
}

// Function to format phone numbers (e.g., "1234567890" → "123-456-7890")
function formatPhoneNumber(phone) {
    // Remove non-numeric characters
    const cleaned = phone.replace(/\D/g, '');

    // Check if it's a valid 10-digit phone number
    if (cleaned.length === 10) {
        return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    } else {
        return null; // Invalid phone number, return null to exclude it
    }
}

// Function to format movement data (e.g., "N (341)" → "Moving N at 341°")
function formatMovement(movement) {
    const match = movement.match(/([A-Z]+)\s*\((\d+)\)/);
    if (match) {
        return `Moving ${match[1]} at ${match[2]}°`;
    }
    return movement; // Return as-is if it doesn't match the pattern
}

// Function to shorten email addresses over 25 characters
function shortenEmail(email) {
    return email.length > 20 ? email.substring(0, 17) + "..." : email;
}

function updateSpotters() {
    // Check if the Spotter Network is enabled.
    // localStorage.getItem returns a string so we compare to "true".
    if (localStorage.getItem("spotterNetworkEnabled") !== "true") {
        // If not enabled, update the source with an empty FeatureCollection and return.
        if (map.getSource('spotters')) {
            map.getSource('spotters').setData({
                type: "FeatureCollection",
                features: []
            });
        }
        return; // Skip fetching the data.
    }
    
    // Otherwise, continue with fetching and updating the spotter data
    fetch('https://www.spotternetwork.org/feeds/stormlab.txt')
        .then(response => response.text())
        .then(data => {
            let features = [];
            const objects = data.split('Object:');

            objects.forEach(obj => {
                let lat, lon;
                let properties = {};

                // Extract latitude and longitude
                const latLonMatch = obj.match(/Lat\/Lon:\s*([\d.-]+),\s*([\d.-]+)/);
                if (latLonMatch) {
                    lat = parseFloat(latLonMatch[1]);
                    lon = parseFloat(latLonMatch[2]);
                }




                // Extract details
                const fields = {
                    "Name": /Name:\s*(.+?)\\n/,
                    "Time": /Position Time:\s*(.+?)\\n/,  // Renamed "Position Time" to "Time"
                    "Movement": /Movement:\s*(.+?)\\n/,
                    "Phone": /Phone:\s*([\d\-]+)/,
                    "Email": /Email:\s*([\w.@]+)/
                };

                for (const [key, regex] of Object.entries(fields)) {
                    const match = obj.match(regex);
                    if (match) {
                        properties[key] = match[1];
                    }
                }

                // Convert Time to local format
                if (properties["Time"]) {
                    const localTime = formatLocalTime(properties["Time"]);
                    if (localTime) {
                        properties["Time"] = localTime;
                    } else {
                        delete properties["Time"];
                    }
                }

                // Format Movement (if not "Stationary")
                if (properties["Movement"]) {
                    if (properties["Movement"] === "Stationary") {
                        delete properties["Movement"];
                    } else {
                        properties["Movement"] = formatMovement(properties["Movement"]);
                    }
                }

                // Validate and format phone number
                if (properties["Phone"]) {
                    const formattedPhone = formatPhoneNumber(properties["Phone"]);
                    if (formattedPhone) {
                        properties["Phone"] = formattedPhone;
                    } else {
                        delete properties["Phone"];
                    }
                }

                // Shorten long email addresses
                if (properties["Email"]) {
                    properties["Email"] = shortenEmail(properties["Email"]);
                }

                // Remove empty fields
                for (const key in properties) {
                    if (!properties[key] || properties[key] === "N/A") {
                        delete properties[key];
                    }
                }

                // Add feature if valid coordinates exist
                if (lat && lon) {
                    features.push({
                        type: "Feature",
                        geometry: {
                            type: "Point",
                            coordinates: [lon, lat]
                        },
                        properties: properties
                    });
                }
            });

            // Ensure the source exists before updating
            if (map.getSource('spotters')) {
                map.getSource('spotters').setData({
                    type: "FeatureCollection",
                    features: features
                });
            } else {
                console.error("Spotter source not found.");
            }
        })
        .catch(err => console.error('Error fetching or parsing stormlab.txt:', err));
}

// Add spotters layer when the map is loaded
map.on('load', function () {
    map.loadImage('https://i.ibb.co/Md3GvZm/IMG-1278.webp', function (error, image) {
        if (error) {
            console.error("Error loading spotter icon:", error);
            return;
        }
        // Add custom icon
        if (!map.hasImage('spotter-icon')) {
            map.addImage('spotter-icon', image);
        }

        // Create an empty GeoJSON source
        map.addSource('spotters', {
            type: 'geojson',
            data: {
                type: "FeatureCollection",
                features: []
            }
        });

// Add the spotter layer
map.addLayer({
    id: 'spotters-layer',
    type: 'symbol',
    source: 'spotters',
    layout: {
        'icon-image': 'spotter-icon',
        'icon-size': 0.17, // Adjust size as needed
        'icon-allow-overlap': true
    }
});
// Enable popups when clicking on a marker
map.on('click', 'spotters-layer', function (e) {
    const coordinates = e.features[0].geometry.coordinates.slice();
    const props = e.features[0].properties;
    
    
    
    // Example usage: Call removePopups() when needed
removePopups();

    // Build styled popup content
    let popupContent = `
        <div style="
            font-size: 14px; 
            color: white; 
            line-height: 1.5; 
            max-width: 205px; 
            border-radius: 10px; 
            padding: 10px; 
            overflow: hidden !important; 
            white-space: normal !important;
            max-height: 100%; 
            height: auto;
            display: block;
            word-wrap: break-word;
            
        ">
            <!-- Header section (icon + title) -->
            <div style="display: flex; align-items: center; margin-bottom: 12px;">
                <img 
                    src="https://i.ibb.co/q3FmsZHy/IMG-1235.png"
                    style="width: 45px; height: 45px; margin-right: 10px; border-radius: 8px;"
                >
                <div style="text-align: left; flex: 1; padding-left: 0px;">
                    <strong style="font-size: 18px;">Spotter Position</strong>
                </div>
            </div>

            <!-- Details section -->
            <div style="text-align: left;">
                <ul style="padding: 0; list-style: none; margin-bottom: 0px;">
    `;

    // Loop through properties and display them
    for (const [key, value] of Object.entries(props)) {
        popupContent += `<li><strong>${key}:</strong> ${value}</li>`;
    }

    popupContent += `</ul></div></div>`;

    // Show the AnimatedPopup
    new AnimatedPopup({
        closeButton: false,
        anchor: 'bottom',
        offset: [0, 0],
        openingAnimation: {
            duration: 300,
            easing: 'easeInOutExpo',
            transform: 'scale'
        },
        closingAnimation: {
            duration: 300,
            easing: 'easeInOutExpo',
            transform: 'scale'
        }
    })
        .setLngLat(coordinates)
        .setHTML(popupContent)
        .addTo(map);
});

        // Change cursor on hover
        map.on('mouseenter', 'spotters-layer', function () {
            map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'spotters-layer', function () {
            map.getCanvas().style.cursor = '';
        });

        // Start fetching spotters
        updateSpotters();
    });
});

// Auto-refresh every 60 seconds (1 minute)
setInterval(updateSpotters, 60000);


// Add this to your map initialization or where you set up other event handlers
map.on('click', (e) => {
  // Reset alertPopupActive when clicking anywhere on the map
  // This ensures the next click on any layer will respond immediately
  alertPopupActive = false;
  
  // If you have specific areas where you don't want to reset this flag,
  // you can add conditions here
});


function fetchActiveAlerts() {
  // Cache the results with a timestamp
  if (window.cachedAlerts && (Date.now() - window.cachedAlertsTimestamp < 20000)) {
    return Promise.resolve(window.cachedAlerts);
  }
  
  const url = 'https://api.weather.gov/alerts/active';
  return fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Error fetching alerts: ${response.status} - ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      // Filter out expired alerts during fetch
      const now = new Date();
      if (data && data.features) {
        data.features = data.features.filter(f => {
          const expires = f.properties.expires ? new Date(f.properties.expires) : null;
          return expires && expires > now;
        });
      }
      window.cachedAlerts = data;
      window.cachedAlertsTimestamp = Date.now();
      return data;
    })
    .catch(err => {
      console.error('Could not fetch alerts:', err);
      return null;
    });
}

// ----------------------------------------------------------------------
// 2) Priority Function: Higher = On Top
// ----------------------------------------------------------------------
function getAlertPriority(eventName = '') {
  const e = eventName.toLowerCase();

  // Highest to lowest
  if (e.includes('tornado warning')) return 8;
  if (e.includes('extreme wind warning')) return 7;
  if (e.includes('severe thunderstorm')) return 6;
  if (e.includes('dust storm')) return 5; // New: Dust storm warnings
  if (e.includes('flash flood')) return 4;
  if (e.includes('flood warning')) return 3;
  if (e.includes('special marine warning')) return 2;
  if (e.includes('snow squall warning')) return 1;
  if (e.includes('special weather statement')) return 0;

  return -1; 
}


document.addEventListener('DOMContentLoaded', function() {
  const alertSettingsContainer = document.getElementById('alert-settings-container');
  
  if (alertSettingsContainer) {
    const alertToggleOptions = alertSettingsContainer.querySelectorAll('.alert-toggle-option');
    
   
    alertToggleOptions.forEach(option => {
      const toggleText = option.querySelector('.toggle-text').textContent.trim();
      const colorPicker = option.querySelector('input[type="color"]');
      const checkbox = option.querySelector('input[type="checkbox"]');
      
    
      if (!toggleText || !checkbox) return;
    
      const alertTypeId = formatAlertTypeId(toggleText);
      
    
      const isEnabled = localStorage.getItem(`${alertTypeId}Enabled`) !== 'false';
      
    
      checkbox.checked = isEnabled;
      
      if (colorPicker) {
        const savedColor = localStorage.getItem(`${alertTypeId}Color`);
        if (savedColor) colorPicker.value = savedColor;
        
   
        if (!savedColor) {
          localStorage.setItem(`${alertTypeId}Color`, colorPicker.value);
        }
      }
       
      checkbox.addEventListener('change', function() {
        localStorage.setItem(`${alertTypeId}Enabled`, this.checked);
        refreshAlerts(); 
        console.log(`${toggleText} alerts ${this.checked ? 'enabled' : 'disabled'}`);
      });
            
      if (colorPicker) {
        colorPicker.addEventListener('input', function() {
          localStorage.setItem(`${alertTypeId}Color`, this.value);
          
          updateAlertColors();
          
          console.log(`${toggleText} color updated to: ${this.value}`);
        });
      }
    });
  } else {
    console.warn('Alert settings container not found');
  }
});

// Helper function to format alert type as ID for localStorage
function formatAlertTypeId(alertName) {
  return alertName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

// Map alert display names to storage IDs
const alertTypeMapping = {
  'tornado warning': 'tornado_warning',
  'extreme wind warning': 'extreme_wind_warning',
  'flash flood warning': 'flash_flood_warning',
  'flood warning': 'flood_warning',
  'flood advisory': 'flood_advisory',
  'dust storm warning': 'dust_storm_warning',
  'dust advisory': 'dust_advisory',
  'severe thunderstorm warning': 'severe_thunderstorm_warning',
  'special marine warning': 'special_marine_warning',
  'snow squall warning': 'snow_squall_warning',
  'special weather statement': 'special_weather_statement'
};

// Reverse mapping (ID to display name) for debug purposes
const reverseAlertMapping = Object.fromEntries(
  Object.entries(alertTypeMapping).map(([key, value]) => [value, key])
);

function getAlertColor(alertEvent = '') {
  if (!alertEvent) return null;

  const e = alertEvent.toLowerCase();
  let alertTypeId = null;
  
  // Use the mapping to identify the alert type ID
  for (const [pattern, id] of Object.entries(alertTypeMapping)) {
    if (e.includes(pattern)) {
      alertTypeId = id;
      break;
    }
  }

  // Check for a custom color saved in localStorage
  if (alertTypeId) {
    const customColor = localStorage.getItem(`${alertTypeId}Color`);
    if (customColor) {
      return customColor;
    }
  }

  // Fallback defaults
  if (e.includes('tornado warning')) return '#FF0000';
  if (e.includes('extreme wind warning')) return '#FF00FF';
  if (e.includes('flash flood warning')) return '#006400';
  if (e.includes('flood warning')) return '#7EDC43';
  if (e.includes('flood advisory')) return '#45F097';
  if (e.includes('dust storm warning')) return '#F4A460';
  if (e.includes('dust advisory')) return '#D2B48C';
  if (e.includes('severe thunderstorm warning')) return '#FFD700';
  if (e.includes('special marine warning')) return '#800080';
  if (e.includes('snow squall warning')) return '#33F7F3';
  if (e.includes('special weather statement')) return '#CBC099';

  return null;
}

// Modified function to check if alert is enabled based on localStorage settings
function isAlertTypeEnabled(eventName = '') {
  if (!eventName) return true;
  
  const e = eventName.toLowerCase();
  
  // Find matching alert type ID
  let alertTypeId = null;
  
  // Check each alert type pattern
  for (const [pattern, id] of Object.entries(alertTypeMapping)) {
    if (e.includes(pattern)) {
      alertTypeId = id;
      break;
    }
  }
  
  // Default to enabled if not specifically disabled
  return alertTypeId ? localStorage.getItem(`${alertTypeId}Enabled`) !== 'false' : true;
}

// ----------------------------------------------------------------------
// 4) Compute "Expires in" with a fancy format: "1d 12hr 20m"
// ----------------------------------------------------------------------
function formatExpiresIn(expireTimeStr) {
  if (!expireTimeStr) return 'Expired';

  const now = new Date();
  const expires = new Date(expireTimeStr);
  const diffMs = expires - now;

  if (diffMs <= 0) return 'Expired'; // Already expired

  const totalMinutes = Math.floor(diffMs / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`; // Less than 60 minutes

  const days = Math.floor(totalMinutes / (60 * 24));
  const leftoverMinutes = totalMinutes % (60 * 24);
  const hours = Math.floor(leftoverMinutes / 60);
  const minutes = leftoverMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}hr`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.join(' ');
}

// Define the priority layers that should take precedence over alerts when clicked
// You can add or remove from this list as needed
const PRIORITY_LAYERS = [
  // Add your custom layers that should take priority here
  // For example: 'weather-radar-layer', 'spotters-layer', etc.
  'mping-reports-layer',
  'spotters-layer',
   'weather-radio-layer',
  'lightning-icon-layer',
];

// Track existing alert layers to avoid duplicate event listeners
let alertLayersInitialized = false;

// Function to add destructive alert border pulsing animation
function addDestructiveAlertsPulseAnimation() {
  // Create a style element if it doesn't exist
  let styleElement = document.getElementById('alert-pulse-styles');
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = 'alert-pulse-styles';
    document.head.appendChild(styleElement);
  }
  
  // Define CSS for pulsing border effect
  const pulseCSS = `
    @keyframes destructiveBorderPulse {
      0% { 
        stroke-width: 3px;
        stroke-opacity: 0.7;
      }
      50% { 
        stroke-width: 8px;
        stroke-opacity: 1;
      }
      100% { 
        stroke-width: 3px;
        stroke-opacity: 0.7;
      }
    }
  `;
  
  // Set the CSS content
  styleElement.textContent = pulseCSS;
}
/**
 * Optimized function to add alerts to the map
 * @param {Object} featureCollection - GeoJSON FeatureCollection of alert data
 */
function addAlertsToMap(featureCollection) {
  // Performance measurement
  const startTime = performance.now();
  console.log("Adding alerts to map...");
  
  
  if (!featureCollection || !featureCollection.features) {
    console.warn('No valid alerts data to add.');
    return;
  }
  
  // Track which layers already exist to avoid recreation
  const existingLayers = {};
  const existingSources = {};
  
  // Add the pulse animation styles only once
  if (!window.alertPulseStylesAdded) {
    addDestructiveAlertsPulseAnimation();
    window.alertPulseStylesAdded = true;
  }

  // Cache expensive operations
  const labelLayerId = map.getStyle().layers.find(layer => 
    layer.type === "symbol" && layer.id.includes("place")
  )?.id || 'road-label-navigation';
  
  // Filter and prepare features in a single pass
  const polygonFeatures = [];
  const priorityBuckets = {};
  
  // Pre-check layer existence for later use
  for (let i = -1; i <= 13; i++) {
    const fillId = `alerts-fill-layer-p${i}`;
    const sourceId = `alerts-data-p${i}`;
    existingLayers[fillId] = map.getLayer(fillId) ? true : false;
    existingSources[sourceId] = map.getSource(sourceId) ? true : false;
  }
  
  // Single-pass feature processing
  featureCollection.features.forEach(f => {
    const geom = f.geometry;
    if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) {
      return; // Skip non-polygon features
    }
    
    const eventName = f.properties.event || '';
    const hasColor = getAlertColor(eventName) !== null;
    const isEnabled = isAlertTypeEnabled(eventName);
    
    if (!hasColor || !isEnabled) return; // Skip disabled alerts
    
    // Add all properties in a single step
    f.properties.alertPriority = getAlertPriority(eventName);
    f.properties.alertColor = getAlertColor(eventName);
    
    // Quick check for special properties using indexOf (faster than includes for large strings)
    const descLower = (f.properties.description || '').toLowerCase();
    f.properties.isConsiderable = descLower.indexOf('considerable') !== -1;
    f.properties.isDestructive = descLower.indexOf('destructive') !== -1;
    
    // Add to filtered features
    polygonFeatures.push(f);
    
    // Add to priority buckets
    const p = f.properties.alertPriority;
    if (!priorityBuckets[p]) priorityBuckets[p] = [];
    priorityBuckets[p].push(f);
  });
  
  // Store priority levels to track which ones are no longer needed
  const activePriorities = new Set(Object.keys(priorityBuckets).map(p => parseInt(p, 10)));
  
  // Use a single event handler for all alert layers if not already set up
  if (!window.alertClickHandlerInitialized) {
    setupAlertClickHandler();
    window.alertClickHandlerInitialized = true;
  }
  
  // Process priorities in sorted order
  const sortedPriorities = Array.from(activePriorities).sort((a, b) => a - b);
  
  sortedPriorities.forEach(pri => {
    const feats = priorityBuckets[pri];
    const fc = {
      type: 'FeatureCollection',
      features: feats
    };

    const sourceId = `alerts-data-p${pri}`;
    const fillId = `alerts-fill-layer-p${pri}`;
    const blackId = `alerts-black-border-layer-p${pri}`;
    const outlineId = `alerts-outline-layer-p${pri}`;
    
    // Update existing source if possible
    if (existingSources[sourceId]) {
      map.getSource(sourceId).setData(fc);
    } else {
      // Create new source
      map.addSource(sourceId, { 
        type: 'geojson',
        data: fc
      });
      
      // Create new layers
      map.addLayer({
        id: fillId,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': ['coalesce', ['get', 'alertColor'], '#666666'],
          'fill-opacity': [
            'case',
            ['get', 'isDestructive'], 0,
            0
          ]
        }
      }, labelLayerId);

      map.addLayer({
        id: blackId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#000000',
          'line-width': [
            'case',
            ['get', 'isDestructive'], 8, 
            6
          ]
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        }
      }, labelLayerId);

      map.addLayer({
        id: outlineId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': ['coalesce', ['get', 'alertColor'], '#666666'],
          'line-width': [
            'case',
            ['get', 'isDestructive'], 5,
            ['get', 'isConsiderable'], 4,
            3
          ]
        },
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        }
      }, labelLayerId);
    }
  });
  
  // Clean up unused priority levels
  for (let i = -1; i <= 13; i++) {
    if (!activePriorities.has(i)) {
      // This priority level isn't used anymore, remove its layers & source
      const fillId = `alerts-fill-layer-p${i}`;
      const blackId = `alerts-black-border-layer-p${i}`;
      const outlineId = `alerts-outline-layer-p${i}`;
      const sourceId = `alerts-data-p${i}`;
      
      if (map.getLayer(fillId)) map.removeLayer(fillId);
      if (map.getLayer(blackId)) map.removeLayer(blackId);
      if (map.getLayer(outlineId)) map.removeLayer(outlineId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    }
  }
  
  // Schedule animation setup on next tick
  window.hasDestructiveAlerts = polygonFeatures.some(f => f.properties.isDestructive);
  
  if (window.hasDestructiveAlerts) {
    // Use requestAnimationFrame for better performance
    if (!window.destructiveAnimationScheduled) {
      window.destructiveAnimationScheduled = true;
      requestAnimationFrame(() => {
        applyPulsingEffectToDestructiveAlerts();
        window.destructiveAnimationScheduled = false;
      });
    }
  }
  
  // Set flag to indicate we've initialized the layers with event handlers
  alertLayersInitialized = true;
  
  // Log performance
  const endTime = performance.now();
  console.log(`Alerts added in ${(endTime - startTime).toFixed(2)}ms`);
}

/**
 * Set up a single event handler for all alert layers
 */
function setupAlertClickHandler() {
  // Remove any existing handlers first
  if (window.existingAlertClickHandler) {
    map.off('click', window.existingAlertClickHandler);
  }
  
  // Single handler for all clicks
  window.existingAlertClickHandler = function(e) {
    // Skip if a popup is already active
    if (alertPopupActive) return;
    
    // Check for alert layers at this point
    const features = [];
    for (let i = -1; i <= 13; i++) {
      const layerId = `alerts-fill-layer-p${i}`;
      if (map.getLayer(layerId)) {
        const layerFeatures = map.queryRenderedFeatures(e.point, { layers: [layerId] });
        features.push(...layerFeatures);
      }
    }
    
    if (!features.length) return; // No alerts at this point
    
    // Check if any priority layers are at this click point first
    for (const layerId of PRIORITY_LAYERS) {
      if (map.getLayer(layerId)) {
        const priorityFeatures = map.queryRenderedFeatures(e.point, { layers: [layerId] });
        if (priorityFeatures.length > 0) {
          // A higher priority layer is present, don't show the alert popup
          return;
        }
      }
    }
    
    // Find the highest priority alert (lowest array index)
    features.sort((a, b) => {
      return b.properties.alertPriority - a.properties.alertPriority;
    });
    
    // Use the highest priority feature
    const feature = features[0];
    
    // No priority layers found, proceed with showing the alert popup
    alertPopupActive = true; // Set the flag to block other popups
    
    // Remove any existing popups
    if (typeof removePopups === 'function') {
      removePopups();
    } else {
      // Fallback if removePopups isn't defined
      const existingPopups = document.querySelectorAll('.mapboxgl-popup');
      existingPopups.forEach(popup => popup.remove());
    }
    
    const props = feature.properties || {};
    const eventName = props.event || 'No alert title identified.';
    
    // Determine expiration text
    let expiresIn = '';
    if (props.description && props.description.match(/WHEN\.\.\.Until further notice\./i)) {
      expiresIn = 'Until further notice.';
    } else {
      expiresIn = formatExpiresIn(props.expires);
    }
    
    // Pre-compute values that might be used multiple times
    const headingColor = props.alertColor || getAlertColor(eventName);
    const fontSize = eventName.toLowerCase().includes('severe thunderstorm warning') ? '14px' :
                     eventName.toLowerCase().includes('special weather statement') ? '15px' :
                     eventName.toLowerCase().includes('special marine warning') ? '15px' : '17px';
    
    // Cache description lowercase version
    const descriptionLower = (props.description || '').toLowerCase();
    
    // Use cached properties when available
    let customMessage = '';
    if (props.isDestructive) {
      customMessage = '<div style="background-color: red; color: white; font-weight: bold; border-radius: 5px; margin-bottom: 10px; padding: 5px; text-align: center;">DESTRUCTIVE</div>';
    } else if (props.isConsiderable) {
      customMessage = '<div style="background-color: orange; color: white; font-weight: bold; border-radius: 5px; margin-bottom: 10px; padding: 5px; text-align: center;">CONSIDERABLE</div>';
    } else if (descriptionLower.indexOf('flash flood emergency') !== -1) {
      customMessage = '<div style="background-color: magenta; color: white; font-weight: bold; border-radius: 5px; margin-bottom: 10px; padding: 5px; text-align: center;">EMERGENCY SITUATION</div>';
    } else if (descriptionLower.indexOf('particularly dangerous situation') !== -1) {
      customMessage = '<div style="background-color: magenta; color: white; font-weight: bold; border-radius: 5px; margin-bottom: 10px; padding: 5px; text-align: center;">PARTICULARLY DANGEROUS</div>';
    } else if (descriptionLower.indexOf('confirmed tornado') !== -1 || descriptionLower.indexOf('reported tornado') !== -1) {
      customMessage = '<div style="background-color: orange; color: white; font-weight: bold; border-radius: 5px; margin-bottom: 10px; padding: 5px; text-align: center;">TORNADO ON THE GROUND</div>';
    }
    
    // Extract source information
    let sourceText = 'No source identified.';
    if (props.description) {
   const sourceMatch = props.description.match(/SOURCE\.\.\.(.*?)(?=\n[A-Z]|$)/s);
if (sourceMatch && sourceMatch[1]) {
  sourceText = sourceMatch[1].replace(/\n/g, ' ').trim();
}
    }
    
    
    const headingTextColor = getTextColorForBackground(headingColor);

    
   const popupHTML = `
  <div style="
    width: 225px;
    background: #14111F;
    color: #fff;
    border-radius: 10px;
    padding: 5px;
    font-size: 14px;
    line-height: 1.3;
    max-height: 300px;
    overflow-y: auto;
  ">
    <h3 style="
      margin-top: 0;
      background-color: ${headingColor};
      color: ${headingTextColor};
      border-radius: 5px;
      padding: 8px;
      margin-bottom: 5px;
      font-size: ${fontSize};
      text-align: center;
    ">
      ${eventName}
    </h3>
    
    ${customMessage}

    <p style="margin: 0;">
      <strong>Expires in:</strong> ${expiresIn}
    </p>
    <p style="margin: 0; padding-bottom: 8px;">
      <strong>Source:</strong> ${sourceText}
    </p>
    <button 
      class="more-info-button" 
      style="cursor: pointer;"
      onclick="showAlertPopup('${escape(JSON.stringify(feature))}')"
    >
      <i class="fas fa-info-circle" style="margin-right: 5px;"></i> More Info
    </button>
  </div>
`;
    
    // Show the popup with animation
    new AnimatedPopup({
      closeButton: false,
      anchor: 'bottom',
      offset: [0, 0],
      openingAnimation: {
        duration: 300,
        easing: 'easeInOutExpo',
        transform: 'scale'
      },
      closingAnimation: {
        duration: 300,
        easing: 'easeInOutExpo',
        transform: 'scale'
      }
    })
      .setLngLat(e.lngLat)
      .setHTML(popupHTML)
      .addTo(map);
  };
  
  // Add the unified click handler
  map.on('click', window.existingAlertClickHandler);
  
  // Set up mouseover effects with a single handler
  if (!window.mouseEnterHandler) {
    window.mouseEnterHandler = function(e) {
      // Check for alert layers
      let hasAlert = false;
      
      for (let i = -1; i <= 13; i++) {
        const layerId = `alerts-fill-layer-p${i}`;
        if (map.getLayer(layerId)) {
          const features = map.queryRenderedFeatures(e.point, { layers: [layerId] });
          if (features.length > 0) {
            hasAlert = true;
            break;
          }
        }
      }
      
      if (hasAlert) {
        map.getCanvas().style.cursor = 'pointer';
      } else {
        map.getCanvas().style.cursor = '';
      }
    };
    
    // Add a debounced mouse move handler for better performance
    const throttledMouseMove = throttle(window.mouseEnterHandler, 30);
    map.on('mousemove', throttledMouseMove);
  }
}

/**
 * Throttle function to limit the rate at which a function is executed
 */
function throttle(fn, delay) {
  let lastCall = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return fn.apply(this, args);
    }
  };
}

/**
 * Optimized function to apply pulsing effects to destructive alerts
 */
function applyPulsingEffectToDestructiveAlerts() {
  // Only proceed if there are destructive alerts
  if (!window.hasDestructiveAlerts) return;
  
  // Use requestAnimationFrame to handle animations in sync with the browser
  if (!window.animationLoopRunning) {
    window.animationLoopRunning = true;
    
    let startTime = performance.now();
    function animate(currentTime) {
      // Calculate animation progress
      const elapsed = currentTime - startTime;
      const progress = (elapsed % 3000) / 3000; // 3-second cycle
      
      // Pulse between 2px and 7px with easeInOutSine
      const width = 2 + 5 * Math.sin(progress * Math.PI);
      
      // Update all destructive alert outlines directly via Mapbox expressions
      for (let i = -1; i <= 13; i++) {
        const outlineId = `alerts-outline-layer-p${i}`;
        if (map.getLayer(outlineId)) {
          map.setPaintProperty(outlineId, 'line-width', [
            'case',
            ['get', 'isDestructive'], width,
            ['get', 'isConsiderable'], 4,
            3
          ]);
        }
      }
      
      // Continue animation loop
      window.destructiveAnimationId = requestAnimationFrame(animate);
    }
    
    // Start the animation
    window.destructiveAnimationId = requestAnimationFrame(animate);
    
    // Add visibility change handling for better performance
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        // Pause animation when tab not visible
        if (window.destructiveAnimationId) {
          cancelAnimationFrame(window.destructiveAnimationId);
          window.animationLoopRunning = false;
        }
      } else if (window.hasDestructiveAlerts) {
        // Resume animation when tab becomes visible again
        if (!window.animationLoopRunning) {
          startTime = performance.now();
          window.destructiveAnimationId = requestAnimationFrame(animate);
          window.animationLoopRunning = true;
        }
      }
    });
  }
}
// Call this function after map style is loaded to set up animation frames for destructive alerts
function setupDestructiveAlertAnimations() {
  // This function will be called by the map on each frame to animate the destructive alerts
  const animate = () => {
    // Trigger map repaint to update the time-based expressions
    map.triggerRepaint();
    // Request next animation frame
    requestAnimationFrame(animate);
  };
  
  // Start the animation loop
  const animationId = requestAnimationFrame(animate);
  
  // Store the animation ID in a global variable so we can cancel it if needed
  window.destructiveAlertAnimationId = animationId;
}

// Add a new event listener to ensure animations are applied after style load
map.on('style.load', () => {
  console.log('Map style loaded - setting up destructive alert animations');
  setupDestructiveAlertAnimations();
});

// Make sure alerts are refreshed properly
const originalRefreshAlerts = refreshAlerts;
window.refreshAlerts = async function() {
  // Cancel any existing animation
  if (window.destructiveAlertAnimationId) {
    cancelAnimationFrame(window.destructiveAlertAnimationId);
    window.destructiveAlertAnimationId = null;
  }
  
  // Call original refresh function
  await originalRefreshAlerts();
  
  // Setup animations again
  setupDestructiveAlertAnimations();
};

// Function to check if there are destructive alerts that need animation
function hasDestructiveAlerts() {
  // Check each priority level for destructive alerts
  for (let pri = -1; pri <= 13; pri++) {
    const sourceId = `alerts-data-p${pri}`;
    if (!map.getSource(sourceId)) continue;
    
    const source = map.getSource(sourceId);
    if (!source || !source._data || !source._data.features) continue;
    
    // Check if any feature is marked as destructive
    const hasDestructive = source._data.features.some(f => 
      f.properties && f.properties.isDestructive && !isExpired(f.properties.expires));
    
    if (hasDestructive) return true;
  }
  
  return false;
}

// Helper function to check if an alert is expired
function isExpired(expiresTime) {
  if (!expiresTime) return false;
  
  const now = new Date();
  const expires = new Date(expiresTime);
  
  return now > expires;
}

// Handle page visibility changes to save resources
document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    // Stop animation when page is not visible
    if (window.destructiveAlertAnimationId) {
      cancelAnimationFrame(window.destructiveAlertAnimationId);
      window.destructiveAlertAnimationId = null;
    }
  } else if (hasDestructiveAlerts()) {
    // Restart animation if there are destructive alerts
    setupDestructiveAlertAnimations();
  }
});

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', function() {
  // Make sure animation is set up
  if (hasDestructiveAlerts() && !window.destructiveAlertAnimationId) {
    setupDestructiveAlertAnimations();
  }
});
 

// OPTIMIZATION: Function to update only colors without recreating layers
function updateAlertColors() {
  console.log("Updating alert colors only...");
  
  // For each priority level
  for (let i = -1; i <= 13; i++) {
    const sourceId = `alerts-data-p${i}`;
    const fillId = `alerts-fill-layer-p${i}`;
    const outlineId = `alerts-outline-layer-p${i}`;
    
    // Check if the source exists
    if (map.getSource(sourceId)) {
      try {
        // Get the current data
        const currentData = map.getSource(sourceId)._data;
        if (!currentData || !currentData.features) continue;
        
        // Update colors for each feature
        currentData.features.forEach(feature => {
          if (feature.properties && feature.properties.event) {
            feature.properties.alertColor = getAlertColor(feature.properties.event);
          }
        });
        
        // Update the source data
        map.getSource(sourceId).setData(currentData);
      } catch (err) {
        console.error(`Error updating colors for layer ${sourceId}:`, err);
      }
    }
  }
  
  // Update popup colors if popup is visible
  updateAlertPopupColors();
}

// Enhanced function to update alert popup colors when localStorage colors change
function updateAlertPopupColors() {
  // Update the mini popup if it exists
  const miniPopups = document.querySelectorAll('.mapboxgl-popup');
  if (miniPopups) {
    miniPopups.forEach(popup => {
      const titleElement = popup.querySelector('h3');
      const eventNameElement = titleElement ? titleElement.textContent.trim() : null;
      
      if (eventNameElement) {
        const newColor = getAlertColor(eventNameElement);
        if (newColor && titleElement) {
          titleElement.style.backgroundColor = newColor;
        }
      }
    });
  }
  
  // Update the detailed alert popup if it's open
  const popup = document.getElementById('alert-popup');
  if (!popup || !popup.classList.contains('show')) return;
  
  const alertType = popup.getAttribute('data-alert-type');
  if (!alertType) return;
  
  console.log(`Updating colors for alert type: ${alertType}`);
  const newColor = getAlertColor(alertType);
  console.log(`New color: ${newColor}`);
  
  // Update popup title
  const titleElement = document.getElementById('popup-title');
  if (titleElement && newColor) {
    titleElement.style.backgroundColor = newColor;
  }
  
  // Update description sidebar color
  const descriptionSidebar = document.querySelector('#popup-description > div > div:first-child');
  if (descriptionSidebar && newColor) {
    descriptionSidebar.style.backgroundColor = newColor;
  }
}

// Modified showAlertPopup function to use the updated color retrieval logic
const originalShowAlertPopup = window.showAlertPopup;
window.showAlertPopup = function(alertInfoString) {
  // Parse the feature object passed from the button
  const alertInfo = JSON.parse(unescape(alertInfoString));
  
  // Get the alert color using our updated function
  const alertType = alertInfo.properties.event || 'No alert title identified.';
  alertInfo.properties.alertColor = getAlertColor(alertType);
  
  // Store the alert type in a data attribute so we can update it if colors change
  document.getElementById('alert-popup').setAttribute('data-alert-type', alertType);
  
  // Call the original function with our modified alertInfo
  originalShowAlertPopup(alertInfoString);
};

// Get color from localStorage with fallback
function getStoredAlertColor(alertTypeId, defaultColor) {
  const customColor = localStorage.getItem(`${alertTypeId}Color`);
  return customColor || defaultColor;
}

// Initialize default values in localStorage if not set
function initializeAlertSettings() {
  // Define default alert settings with color mapping to display names
  const defaultAlertSettings = [
    { id: 'tornado_warning', displayName: 'Tornado Warning', color: '#FF0000', enabled: true },
    { id: 'extreme_wind_warning', displayName: 'Extreme Wind Warning', color: '#FF00FF', enabled: true },
    { id: 'severe_thunderstorm_warning', displayName: 'Severe Thunderstorm Warning', color: '#FFD700', enabled: true },
    { id: 'flash_flood_warning', displayName: 'Flash Flood Warning', color: '#006400', enabled: true },
    { id: 'flood_warning', displayName: 'Flood Warning', color: '#7EDC43', enabled: true },
    { id: 'flood_advisory', displayName: 'Flood Advisory', color: '#45F097', enabled: true },
    { id: 'special_marine_warning', displayName: 'Special Marine Warning', color: '#800080', enabled: true },
    { id: 'snow_squall_warning', displayName: 'Snow Squall Warning', color: '#33F7F3', enabled: true },
    { id: 'special_weather_statement', displayName: 'Special Weather Statement', color: '#CBC099', enabled: true },
    { id: 'dust_storm_warning', displayName: 'Dust Storm Warning', color: '#F4A460', enabled: true },
    { id: 'dust_advisory', displayName: 'Dust Advisory', color: '#D2B48C', enabled: true }
  ];

  // Initialize settings if not already set
  defaultAlertSettings.forEach(setting => {
    // Only set if not already in localStorage
    if (localStorage.getItem(`${setting.id}Enabled`) === null) {
      localStorage.setItem(`${setting.id}Enabled`, setting.enabled);
    }
    if (!localStorage.getItem(`${setting.id}Color`)) {
      localStorage.setItem(`${setting.id}Color`, setting.color);
    }
  });
}

// Run initialization on page load
document.addEventListener('DOMContentLoaded', function() {
  initializeAlertSettings();
  
  // Additional initialization for Alerts button
  const alertsButton = document.getElementById("alerts-button");
  if (alertsButton) {
    alertsButton.addEventListener("click", function(e) {
      e.stopPropagation();
      // Open the alerts settings popup
      const alertsPopup = document.getElementById("alerts-popup");
      const alertsBlur = document.getElementById("alerts-blur");
      
      if (alertsPopup && alertsBlur) {
        alertsPopup.style.display = "block";
        alertsBlur.style.display = "block";
        
        // Force reflow
        alertsPopup.offsetWidth;
        alertsBlur.offsetWidth;
        
        alertsPopup.classList.add("show");
        alertsPopup.classList.remove("hide");
        alertsBlur.style.opacity = "1";
      }
    });
  }
});

// ----------------------------------------------------------------------
// 7) On Map Load, Fetch and Add Alerts
// ----------------------------------------------------------------------
map.on('load', async () => {
  const data = await fetchActiveAlerts();
  if (data) {
    addAlertsToMap(data);
  }
});



// Modified refreshAlerts function - optimized to handle full refreshes
async function refreshAlerts() {
     console.log("Full alert refresh...");
  const data = await fetchActiveAlerts();
  if (data) {
    // Filter out expired alerts
    const now = new Date();
    const activeFeatures = data.features.filter(f => {
      const expires = f.properties.expires ? new Date(f.properties.expires) : null;
      return expires && expires > now; // Keep only non-expired alerts
    });

    // Update the map layers with the filtered data
    addAlertsToMap({ type: 'FeatureCollection', features: activeFeatures });
  }
}


// Call refreshAlerts every 30 secs (adjust as needed)
setInterval(refreshAlerts, 30 * 1000);

// Initial load
map.on('load', async () => {
  await refreshAlerts();
});




//
// 1) Helper function to extract "HAZARD...", "HAZARDS INCLUDE...", and "IMPACTS..." sections
//
function parseHazardsImpacts(description) {
  let hazards = 'No hazards identified.';
  let impacts = 'No impacts identified.';

  if (description) {
    // Try to capture IMPACTS using provided regex pattern
    try {
      impacts = description.match(/IMPACTS?\.\.\.(.*?)(?:\n\n|\*|$)/s)[1]
        .replace(/\n/g, ' ') // Replace newlines within the impacts with spaces for formatting
        .trim(); // Clean up any leading or trailing whitespace
    } catch (e) {
      try {
        impacts = description.match(/IMPACT\.\.\.(.*?)(?:\n\n|\*|$)/s)[1]
          .replace(/\n/g, ' ') // Replace newlines within the impacts with spaces for formatting
          .trim(); // Clean up any leading or trailing whitespace
      } catch (e) {
        console.log('Error extracting impacts:', e);
      }
    }

    // Try to capture "HAZARDS INCLUDE..." section (if available, takes priority over "HAZARD...")
    try {
      hazards = description.match(/HAZARDS INCLUDE\.\.\.(.*?)(?:\n\n|\*|$)/s)[1]
        .replace(/\n/g, ' ') // Replace newlines within the hazards with spaces
        .trim(); // Clean up any leading or trailing whitespace
    } catch (e) {
      try {
        // If "HAZARDS INCLUDE..." is not found, fallback to "HAZARD..."
        hazards = description.match(/HAZARD\.\.\.(.*?)(?:\n\n|\*|$)/s)[1]
          .replace(/\n/g, ' ') // Replace newlines within the hazards with spaces
          .trim(); // Clean up any leading or trailing whitespace
      } catch (e) {
        console.log('Error extracting hazards:', e);
      }
    }
  }

  return { hazards, impacts };
}


// Function to determine alert status
function getAlertStatus(sentTime, expiresTime) {
  const now = new Date();
  const sent = new Date(sentTime);
  const expires = new Date(expiresTime);
  
  // Check if alert is expired
  if (now >= expires) {
    return "Expired";
  }
  
  // Calculate the percentage of the alert duration that has elapsed
  const totalDuration = expires - sent;
  const elapsedDuration = now - sent;
  const percentComplete = (elapsedDuration / totalDuration) * 100;
  
  // Status thresholds based on percentage complete
  if (percentComplete <= 20) {
    return "Recently Issued";
  }
  else if (percentComplete >= 80) {
    return "Expiring Soon";
  }
  else {
    return "Active";
  }
}

// Function to format time for display in alert status line
function formatTimeForStatusAlert(timeString, sentTime, expiresTime) {
  if (!timeString) return '';
  
  const date = new Date(timeString);
  
  // Get time in 12-hour format
  const timeStr = date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' });
  
  // Check if the sent date and expires date are on different days
  if (sentTime && expiresTime) {
    const sent = new Date(sentTime);
    const expires = new Date(expiresTime);
    
    const differentDays = sent.toDateString() !== expires.toDateString();
    
    // If alert spans multiple days, include the day name
    if (differentDays) {
      const dayName = date.toLocaleString('en-US', { weekday: 'short' });
      return `${dayName}, ${timeStr}`;
    }
  }
  
  // Otherwise just show the time
  return timeStr;
}
function animateAlertStatusLine(element, finalPosition) {
  // Get elements
  const dotElement = element.querySelector('.indicator-dot');
  const lineElement = element.querySelector('.elapsed-line');
  
  // 1. Make sure elements exist before continuing
  if (!dotElement || !lineElement) return;
  
  // 2. Ensure initial state is correctly set before animation
  dotElement.style.transition = 'none';
  lineElement.style.transition = 'none';
  
  // 3. Set initial positions explicitly
  dotElement.style.left = '0%';
  lineElement.style.width = '0%';
  
  // 4. Use a more reliable way to force reflow
  element.getBoundingClientRect();
  
  // Get current status
  const sentTime = element.getAttribute('data-sent');
  const expiresTime = element.getAttribute('data-expires');
  const currentStatus = getAlertStatus(sentTime, expiresTime);
  const isExpired = currentStatus === "Expired";
  
  // If expired, set directly to 100% with exclamation mark
  if (isExpired) {
    if (dotElement) {
      dotElement.innerHTML = '<i class="fas fa-exclamation"></i>';
      dotElement.classList.add('expired');
      dotElement.style.display = 'flex';
      dotElement.style.alignItems = 'center';
      dotElement.style.justifyContent = 'center';
      dotElement.style.fontSize = '10px';
      dotElement.style.color = '#fff';
      dotElement.style.width = '18px';
      dotElement.style.height = '18px';
      dotElement.style.left = '100%';
      dotElement.style.animation = 'pulseExpired 2s infinite ease-in-out';
    }
    if (lineElement) {
      lineElement.style.width = '100%';
    }
    
    const statusText = element.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = "Expired";
      statusText.style.color = '#ff0000';
    }
    
    return; // Skip animation for expired alerts
  }
  
  // 5. Add a slight delay before starting the animation
  setTimeout(() => {
    // Regular animation for non-expired alerts
    let startPosition = 0;
    const duration = 500; // 500ms animation
    const startTime = performance.now();
    
    function easeOutQuint(t) {
      // Strong deceleration curve (fast start, very slow end)
      return 1 - Math.pow(1 - t, 5);
    }
    
    function animate(currentTime) {
      const elapsed = currentTime - startTime;
      
      if (elapsed < duration) {
        // Calculate progress with strong easing
        const progress = elapsed / duration;
        const easedProgress = easeOutQuint(progress);
        const currentPosition = startPosition + (finalPosition - startPosition) * easedProgress;
        
        // Update elements
        if (dotElement) dotElement.style.left = `${currentPosition}%`;
        if (lineElement) lineElement.style.width = `${currentPosition}%`;
        
        requestAnimationFrame(animate);
      } else {
        // Ensure we end at exactly the target position
        if (dotElement) dotElement.style.left = `${finalPosition}%`;
        if (lineElement) lineElement.style.width = `${finalPosition}%`;
      }
    }
    
    requestAnimationFrame(animate);
  }, 50); // Small internal delay to ensure everything is ready
}
// Real-time updating of alert status lines
function initAlertStatusUpdater() {
  // Update every second for smooth movement
  setInterval(() => {
    const statusElements = document.querySelectorAll('.alert-status-line');
    
    statusElements.forEach(element => {
      const sentTime = element.getAttribute('data-sent');
      const expiresTime = element.getAttribute('data-expires');
      
      if (!sentTime || !expiresTime) return;
      
      // Calculate new position
      const now = new Date();
      const startTime = new Date(sentTime);
      const endTime = new Date(expiresTime);
      const totalDuration = endTime - startTime;
      const elapsedDuration = now - startTime;
      const positionPercent = Math.min(Math.max((elapsedDuration / totalDuration) * 100, 0), 100);
      
      // Get current status
      const currentStatus = getAlertStatus(sentTime, expiresTime);
      const isExpired = currentStatus === "Expired";
      
      // Update position of indicator
      const indicator = element.querySelector('.indicator-dot');
      if (indicator) {
        // For expired alerts, show exclamation mark
        if (isExpired && !indicator.classList.contains('expired')) {
          indicator.innerHTML = '<i class="fas fa-exclamation"></i>';
          indicator.classList.add('expired');
          indicator.style.display = 'flex';
          indicator.style.alignItems = 'center';
          indicator.style.justifyContent = 'center';
          indicator.style.fontSize = '10px';
          indicator.style.color = '#fff';
          indicator.style.width = '18px';
          indicator.style.height = '18px';
          indicator.style.animation = 'pulseExpired 2s infinite ease-in-out';
        }
        indicator.style.left = isExpired ? '100%' : `${positionPercent}%`;
      }
      
      // Update elapsed time line
      const elapsedLine = element.querySelector('.elapsed-line');
      if (elapsedLine) {
        elapsedLine.style.width = isExpired ? '100%' : `${positionPercent}%`;
      }
      
      // Update status text if it changed
      const statusText = element.querySelector('.status-text');
      if (statusText && statusText.textContent !== currentStatus) {
        // Update the status text
        statusText.textContent = currentStatus;
        
        // For expired alerts, change color to red
        if (isExpired) {
          statusText.style.color = '#ff0000';
        }
        
        // Add a brief highlight animation when status changes
        statusText.style.transition = 'none';
        statusText.style.transform = 'scale(1.2)';
        statusText.style.opacity = '0.8';
        
        // Reset after a moment to create flash effect
        setTimeout(() => {
          statusText.style.transition = 'all 0.5s ease-out';
          statusText.style.transform = 'scale(1)';
          statusText.style.opacity = '1';
        }, 50);
      }
    });
  }, 1000);
}

// Start the alert updater when the page loads
document.addEventListener('DOMContentLoaded', function() {
  initAlertStatusUpdater();
  // Make sure the pulse animation is added (already done for watches)
  addPulseAnimation();
});

function showAlertPopup(alertInfoString) {
  // Parse the feature object passed from the button
  const alertInfo = JSON.parse(unescape(alertInfoString));

  // Grab elements from the DOM
  const titleElement = document.getElementById('popup-title');
  const detailsElement = document.getElementById('popup-details');
  const hazardsImpactsElement = document.getElementById('popup-hazards-impacts');
  const descriptionElement = document.getElementById('popup-description');
  const actionElement = document.getElementById('popup-action');

  // First, clean up any existing status lines to prevent duplicates
  const existingStatusLines = document.querySelectorAll('.alert-status-line');
  existingStatusLines.forEach(line => line.remove());
  
  // ------------------------------------------------------------
  // 1) Title & Header Background
  // ------------------------------------------------------------
  const alertType = alertInfo.properties.event || 'No alert title identified.';
  const alertColor = getAlertColor(alertType);
 // Calculate text color based on background
  const titleTextColor = getTextColorForBackground(alertColor);

  // Title text & styling
  titleElement.innerText = alertType;
  titleElement.style.backgroundColor = alertColor || 'gray';
  titleElement.style.color = titleTextColor;
  titleElement.style.padding = '10px';
  titleElement.style.borderRadius = '5px';
  titleElement.style.textAlign = 'center';
  titleElement.style.fontWeight = 'bold';
  titleElement.style.marginBottom = '10px';
  titleElement.style.fontSize = '18px';
  
  
  let threatMessage = ''; // Ensure variable is properly declared

  // Convert description to lowercase for case-insensitive checking
  const descriptionLower = alertInfo.properties.description.toLowerCase();

  if (descriptionLower.includes("destructive")) {
      threatMessage = '<div style="background-color: red; color: white; font-weight: bold; border-radius: 5px; margin-bottom: 10px; padding: 5px; text-align: center;">DESTRUCTIVE</div>';
  } 
  else if (descriptionLower.includes("considerable")) {
      threatMessage = '<div style="background-color: orange; color: white; font-weight: bold; border-radius: 5px; margin-bottom: 10px; padding: 5px; text-align: center;">DAMAGE THREAT: CONSIDERABLE</div>';
  } 
  else if (descriptionLower.includes("flash flood emergency")) {
      threatMessage = '<div style="background-color: magenta; color: white; font-weight: bold; border-radius: 5px; margin-bottom: 10px; padding: 5px; text-align: center;">THIS IS AN EMERGENCY SITUATION</div>';
  } 
  else if (descriptionLower.includes("particularly dangerous situation")) {
      threatMessage = '<div style="background-color: magenta; color: white; font-weight: bold; border-radius: 5px; margin-bottom: 10px; padding: 5px; text-align: center;">THIS IS A PARTICULARLY DANGEROUS SITUATION</div>';
  } 
  else if (descriptionLower.includes("confirmed tornado") || descriptionLower.includes("reported tornado")) {
      threatMessage = '<div style="background-color: orange; color: white; font-weight: bold; border-radius: 5px; margin-bottom: 10px; padding: 5px; text-align: center;">THIS TORNADO IS ON THE GROUND</div>';
  }

  // ------------------------------------------------------------
  // 2) Extract "SOURCE" from the description
  // ------------------------------------------------------------
  const description = alertInfo.properties.description || 'No description available.';
  let sourceText = 'No source identified.';
  try {
   const match = description.match(/SOURCE\.\.\.(.*?)(?=\n[A-Z]|$)/s);
if (match && match[1]) {
  sourceText = match[1].replace(/\n/g, ' ').trim();
}
  } catch (err) {
    console.error('Error extracting source:', err);
  }

  // ------------------------------------------------------------
  // 3) Details Section (Issued, Expires, Source)
  // ------------------------------------------------------------
  let expiresText = '';
  if (description.match(/WHEN\.\.\.Until further notice\./i)) {
      expiresText = 'Until further notice.';
  } else {
      expiresText = formatTimestamp(alertInfo.properties.expires);
  }

  detailsElement.innerHTML = `
      ${threatMessage} 
      <b>Issued:</b> ${formatTimestamp(alertInfo.properties.sent)}<br>
      <b>Expires:</b> ${expiresText}<br>
      <b>Source:</b> ${sourceText}<br>
      <div style="margin-bottom: 10px;"></div> <!-- Adds spacing -->
  `;
  
  // ------------------------------------------------------------
  // NEW: Add alert status line
  // ------------------------------------------------------------
  const issuedTime = new Date(alertInfo.properties.sent);
  const expiresTime = new Date(alertInfo.properties.expires);
  
  // Calculate position of indicator based on elapsed time
  const now = new Date();
  const totalDuration = expiresTime - issuedTime;
  const elapsedDuration = now - issuedTime;
  const positionPercent = Math.min(Math.max((elapsedDuration / totalDuration) * 100, 0), 100);
  
  // Get alert status
  const alertStatus = getAlertStatus(issuedTime, expiresTime);
  const isExpired = alertStatus === "Expired";
  
  // Format times for display
  const formattedIssuedTime = formatTimeForStatusAlert(issuedTime, issuedTime, expiresTime);
  const formattedExpiresTime = formatTimeForStatusAlert(expiresTime, issuedTime, expiresTime);
  
  const statusColor = isExpired ? '#ff0000' : alertColor;
  
  // Special handling for expired alerts
  const dotContent = isExpired ? '<i class="fas fa-exclamation"></i>' : '';
  const dotClasses = isExpired ? 'indicator-dot expired' : 'indicator-dot';
  const dotStyle = isExpired ? 
    `position: absolute; left: 100%; top: 50%; transform: translate(-50%, -50%); 
     width: 18px; height: 18px; background-color: ${alertColor}; border-radius: 50%; 
     box-shadow: 0 0 8px 2px ${alertColor}; z-index: 2; display: flex; align-items: center; 
     justify-content: center; font-size: 10px !important; color: #fff; animation: pulseExpired 2s infinite ease-in-out;` : 
    `position: absolute; left: 0%; top: 50%; transform: translate(-50%, -50%); 
     width: 14px; height: 14px; background-color: ${alertColor}; border-radius: 50%; 
     box-shadow: 0 0 8px 2px ${alertColor}; z-index: 2;`;
  
  const initialLineWidth = isExpired ? '100%' : '0%';
  
  // Add status line right after details section
  const statusLineHTML = `
    <div class="alert-status-line" 
         data-sent="${issuedTime.toISOString()}" 
         data-expires="${expiresTime.toISOString()}" 
         style="margin: 0 0 20px 0; position: relative;">
      
      <div style="height: 6px; background-color: #333; border-radius: 3px; position: relative; overflow: visible;">
        <!-- Status line background -->
        <div style="
          position: absolute;
          left: 0;
          top: 0;
          height: 100%;
          width: 100%;
          background-color: #555;
          border-radius: 3px;
        "></div>
        
        <!-- Elapsed time indicator -->
        <div class="elapsed-line" style="
          position: absolute;
          left: 0;
          top: 0;
          height: 100%;
          width: ${initialLineWidth};
          background-color: ${alertColor || '#FFFFFF'};
          border-radius: 3px 0 0 3px;
        "></div>
        
        <!-- Current position indicator with glow effect -->
        <div class="${dotClasses}" style="${dotStyle}">
          ${dotContent}
        </div>
      </div>
      
      <div style="display: flex; justify-content: space-between; margin-top: 5px;">
        <span style="font-size: 12px !important; color: #ccc !important;">${formattedIssuedTime}</span>
        <span class="status-text" style="font-size: 14px !important; font-weight: bold !important; color: ${statusColor} !important;">${alertStatus}</span>
        <span style="font-size: 12px !important; color: #ccc !important;">${formattedExpiresTime}</span>
      </div>
    </div>
  `;
  
  // Insert status line after details
  detailsElement.insertAdjacentHTML('afterend', statusLineHTML);
  
  // ------------------------------------------------------------
  // 4) Hazards & Impacts (parsed from description)
  // ------------------------------------------------------------
  const { hazards, impacts } = parseHazardsImpacts(description);

  hazardsImpactsElement.innerHTML = `
    <p style="margin: 0;"><b>Hazards:</b> ${hazards}</p>
    <p style="margin: 0 0 10px; white-space: normal; overflow-wrap: break-word;"><b>Impacts:</b> ${impacts}</p>
  `;

  // ------------------------------------------------------------
  // 5) Description Section
  // ------------------------------------------------------------
  const rawDescription = alertInfo.properties.description || 'No description available.';

  // Pre-process the description with your custom regex
  const cleanedDescription = rawDescription
    .replace(/(?:SVR|FFW|TOR)\d{4}/g, '')
    .replace(/\*/g, '')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, ' ');

  descriptionElement.innerHTML = `
    <b>Description:</b>
    <div style="display: flex; align-items: stretch; margin-top: 5px; margin-bottom: 15px;">
      <div style="
        width: 5px;
        min-width: 5px;
        flex: 0 0 auto;
        background-color: ${alertColor || 'gray'};
        border-radius: 10px 0 0 10px;
        margin-right: 10px;
      "></div>
      <div style="flex: 1; min-width: 0;">
        <p style="
          margin: 0;
          white-space: normal;
          overflow-wrap: break-word;
        ">
          ${cleanedDescription}
        </p>
      </div>
    </div>
  `;

  // ------------------------------------------------------------
  // 6) Actions & Areas Section
  // ------------------------------------------------------------
  const instruction = alertInfo.properties.instruction || 'No specific actions recommended.';
  const areaDesc = alertInfo.properties.areaDesc || 'No area specified.';

  actionElement.innerHTML = `
    <b>Action Recommended:</b> ${instruction}
    <div style="margin-bottom: 3px;"></div>
    <b>Areas:</b> ${areaDesc}
  `;

  // Extract senderName for NWS Office
  const senderName = alertInfo.properties.senderName || 'No NWS office identified.';

  // Convert parameters object to a string and clean it
  const parametersRaw = JSON.stringify(alertInfo.properties.parameters || '');

  // Remove unwanted characters, keeping only letters, numbers, ., /, and -
  const cleanedParameters = parametersRaw.replace(/[^a-zA-Z0-9./\-\s]/g, '');

  // Extract content between "WMOidentifier" and "NWSheadline"
  const wmoStartIndex = cleanedParameters.indexOf("WMOidentifier");
  const nwsIndex = cleanedParameters.indexOf("NWSheadline");
  const wmoData = wmoStartIndex !== -1 && nwsIndex !== -1 
    ? cleanedParameters.substring(wmoStartIndex + 13, nwsIndex).trim() 
    : 'No WMO identifier found.';

  // Extract content between "VTEC" and "eventEndingTime"
  const vtecIndex = cleanedParameters.indexOf("VTEC");
  const endIndex = cleanedParameters.indexOf("eventEndingTime");
  const vtecData = vtecIndex !== -1 && endIndex !== -1 
    ? cleanedParameters.substring(vtecIndex + 4, endIndex).trim() 
    : 'No VTEC identified.';

  // Display the extracted and cleaned data with spacing adjustments
  actionElement.innerHTML += `
    <div style="margin-top: 20px;"></div>
    <b>NWS Office:</b> ${senderName}<br>
    <div style="margin-top: 2px;"><b>WMO Identifier:</b> ${wmoData}</div>
    <div style="margin-top: 2px;"><b>VTEC:</b> ${vtecData}</div>
  `;

  // ------------------------------------------------------------
  // 7) Play Alert Button (TTS)
  // ------------------------------------------------------------
  const playButtonHTML = `
    <button id="play-pause-btn" class="tts-btn" onclick="toggleListen()">
      <i class="fa-solid fa-volume-up" style="margin-right: 5px;"></i> Play Alert
    </button>
  `;

  actionElement.innerHTML += playButtonHTML;

  // ------------------------------------------------------------
  // 8) Finally, Show the Popup
  // ------------------------------------------------------------
  document.getElementById('alert-popup').classList.add('show');
  
  // Animate the status line if not expired
  setTimeout(() => {
    const statusLineElement = document.querySelector('.alert-status-line');
    if (statusLineElement && !isExpired) {
      animateAlertStatusLine(statusLineElement, positionPercent);
    }
  }, 300); // Small delay to ensure the DOM is ready
}

function closeAlertPopup() {
  const popup = document.getElementById('alert-popup');

  // Stop the speech synthesis when the popup is closed
  window.speechSynthesis.cancel();
  isPlaying = false;

  // Reset the Play/Pause button to its "Play Alert" state
  const playPauseBtn = document.getElementById('play-pause-btn');
  if (playPauseBtn) {
    playPauseBtn.innerHTML = '<i class="fa-solid fa-volume-up" style="margin-right: 5px;"></i> Play Alert';
  }

  // 1) Trigger your fade-out or "hide" animation
  popup.classList.remove('show');
  popup.classList.add('hide');

  // 2) When the animation ends, fully hide the popup
  popup.addEventListener('animationend', function handleAnimationEnd() {
    popup.removeEventListener('animationend', handleAnimationEnd);

    // Remove the .hide class & set display=none
    popup.classList.remove('hide');
  
    // 3) Start the cooldown
    isPopupOnCooldown = true;
    setTimeout(() => {
      // After 300 ms, end the cooldown
      isPopupOnCooldown = false;
      console.log('Popup cooldown is over; you can open a new popup now.');
    }, POPUP_COOLDOWN_MS);
  });
}

// Helper function to format timestamps
function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleString();
}






let selectedVoice = null;
let isPlaying = false;
let isPaused = false;
let speechSynthesisUtterance = null;
let weatherRadioWasPlaying = false;

// Populate voice list
function populateVoiceList() {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
        const isAppleDevice = /Mac|iPhone|iPod|iPad/.test(navigator.platform);
        selectedVoice = isAppleDevice 
            ? voices.find(voice => voice.name.includes('Samantha')) || voices[0]
            : voices.find(voice => voice.name === 'Microsoft David Desktop - English (United States)') || voices[0];

        console.log("Selected voice:", selectedVoice.name);
    } else {
        console.warn("No voices found!");
    }
}

if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoiceList;
}
populateVoiceList();

function formatTextForSpeech(text) {
    return text
        .replace(/\bmph\b/gi, 'miles per hour')
        .replace(/\bkts\b/gi, 'knots')
        .replace(/\bnm\b/gi, 'nautical miles')
        .replace(/\bEDT\b/g, 'Eastern Daylight Time')
        .replace(/\bEST\b/g, 'Eastern Standard Time')
        .replace(/\bCDT\b/g, 'Central Daylight Time')
        .replace(/\bCST\b/g, 'Central Standard Time')
        .replace(/\bMDT\b/g, 'Mountain Daylight Time')
        .replace(/\bMST\b/g, 'Mountain Standard Time')
        .replace(/\bPDT\b/g, 'Pacific Daylight Time')
        .replace(/\bPST\b/g, 'Pacific Standard Time')
        // Convert numbers to words
        .replace(/\b5\b/g, 'five')
        .replace(/\b10\b/g, 'ten')
        .replace(/\b15\b/g, 'fifteen')
        .replace(/\b20\b/g, 'twenty')
        .replace(/\b25\b/g, 'twenty-five')
        .replace(/\b30\b/g, 'thirty')
        .replace(/\b35\b/g, 'thirty-five')
        .replace(/\b40\b/g, 'forty')
        .replace(/\b45\b/g, 'forty-five')
        .replace(/\b50\b/g, 'fifty')
        .replace(/\b55\b/g, 'fifty-five')
        .replace(/\b60\b/g, 'sixty')
        .replace(/\b65\b/g, 'sixty-five')
        .replace(/\b70\b/g, 'seventy')
        .replace(/\b75\b/g, 'seventy-five')
        .replace(/\b80\b/g, 'eighty')
        .replace(/\b85\b/g, 'eighty-five')
        .replace(/\b90\b/g, 'ninety')
        .replace(/\b95\b/g, 'ninety-five')
        // Convert state abbreviations to full names
        .replace(/\bAL\b/g, 'Alabama')
        .replace(/\bAK\b/g, 'Alaska')
        .replace(/\bAZ\b/g, 'Arizona')
        .replace(/\bAR\b/g, 'Arkansas')
        .replace(/\bCA\b/g, 'California')
        .replace(/\bCO\b/g, 'Colorado')
        .replace(/\bCT\b/g, 'Connecticut')
        .replace(/\bDE\b/g, 'Delaware')
        .replace(/\bFL\b/g, 'Florida')
        .replace(/\bGA\b/g, 'Georgia')
        .replace(/\bHI\b/g, 'Hawaii')
        .replace(/\bID\b/g, 'Idaho')
        .replace(/\bIL\b/g, 'Illinois')
        .replace(/\bIN\b/g, 'Indiana')
        .replace(/\bIA\b/g, 'Iowa')
        .replace(/\bKS\b/g, 'Kansas')
        .replace(/\bKY\b/g, 'Kentucky')
        .replace(/\bLA\b/g, 'Louisiana')
        .replace(/\bME\b/g, 'Maine')
        .replace(/\bMD\b/g, 'Maryland')
        .replace(/\bMA\b/g, 'Massachusetts')
        .replace(/\bMI\b/g, 'Michigan')
        .replace(/\bMN\b/g, 'Minnesota')
        .replace(/\bMS\b/g, 'Mississippi')
        .replace(/\bMO\b/g, 'Missouri')
        .replace(/\bMT\b/g, 'Montana')
        .replace(/\bNE\b/g, 'Nebraska')
        .replace(/\bNV\b/g, 'Nevada')
        .replace(/\bNH\b/g, 'New Hampshire')
        .replace(/\bNJ\b/g, 'New Jersey')
        .replace(/\bNM\b/g, 'New Mexico')
        .replace(/\bNY\b/g, 'New York')
        .replace(/\bNC\b/g, 'North Carolina')
        .replace(/\bND\b/g, 'North Dakota')
        .replace(/\bOH\b/g, 'Ohio')
        .replace(/\bOK\b/g, 'Oklahoma')
        .replace(/\bOR\b/g, 'Oregon')
        .replace(/\bPA\b/g, 'Pennsylvania')
        .replace(/\bRI\b/g, 'Rhode Island')
        .replace(/\bSC\b/g, 'South Carolina')
        .replace(/\bSD\b/g, 'South Dakota')
        .replace(/\bTN\b/g, 'Tennessee')
        .replace(/\bTX\b/g, 'Texas')
        .replace(/\bUT\b/g, 'Utah')
        .replace(/\bVT\b/g, 'Vermont')
        .replace(/\bVA\b/g, 'Virginia')
        .replace(/\bWA\b/g, 'Washington')
        .replace(/\bWV\b/g, 'West Virginia')
        .replace(/\bWI\b/g, 'Wisconsin')
        .replace(/\bWY\b/g, 'Wyoming');
}


// Toggle text-to-speech functionality
function toggleListen() {
    const playPauseBtn = document.getElementById('play-pause-btn');

    if (!selectedVoice) {
        console.warn("Voice not loaded yet.");
        return;
    }

    if (isPlaying) {
        if (isPaused) {
            window.speechSynthesis.resume();
            playPauseBtn.innerHTML = '<i class="fa-solid fa-volume-up" style="margin-right: 5px;"></i> Pause Alert';
            isPaused = false;
            updateButtonStyle(playPauseBtn, true);
        } else {
            window.speechSynthesis.pause();
            playPauseBtn.innerHTML = '<i class="fa-solid fa-volume-up" style="margin-right: 5px;"></i> Resume Alert';
            isPaused = true;
            updateButtonStyle(playPauseBtn, false, true);
        }
    } else {
        let descriptionText = document.getElementById('popup-description').innerText || '';
        if (!descriptionText) {
            console.warn("No description available!");
            return;
        }

        const alertText = formatTextForSpeech(descriptionText);
        window.speechSynthesis.cancel();
        speechSynthesisUtterance = new SpeechSynthesisUtterance(alertText);
        speechSynthesisUtterance.lang = 'en-US';
        speechSynthesisUtterance.voice = selectedVoice;

        let player = document.getElementById('global-player');
        if (player && !player.paused) {
            player.pause();
            weatherRadioWasPlaying = true;
        }

        speechSynthesisUtterance.onend = function() {
            resetSpeechAndButton(playPauseBtn);
            if (weatherRadioWasPlaying) {
                player.play();
                weatherRadioWasPlaying = false;
            }
        };

        window.speechSynthesis.speak(speechSynthesisUtterance);
        playPauseBtn.innerHTML = '<i class="fa-solid fa-volume-up" style="margin-right: 5px;"></i> Pause Alert';
        isPlaying = true;
        isPaused = false;
        updateButtonStyle(playPauseBtn, true);
    }
}
function resetSpeechAndButton(playPauseBtn) {
    window.speechSynthesis.cancel();
    playPauseBtn.innerHTML = '<i class="fa-solid fa-volume-up" style="margin-right: 5px;"></i> Play Alert';
    isPlaying = false;
    isPaused = false;
    // Set the button to its "off" style: gray background, white text, white border.
    updateButtonStyle(playPauseBtn, false);
}


function updateButtonStyle(button, isOn, isResume = false) {
    if (isResume) {
        button.style.backgroundColor = "#636381";
        button.style.color = "white";
        button.style.border = "2px solid white";
    } else if (isOn) {
        button.style.backgroundColor = "white";
        button.style.color = "#7F1DF0";
        button.style.border = "2px solid #636381";
    } else {
        // Off state style
        button.style.backgroundColor = "#636381";
        button.style.color = "white";
        button.style.border = "2px solid white";
    }
}

  







document.addEventListener("DOMContentLoaded", function () {
  // Grab the mPING menu item element (Menu Item 1)
  const mpingToggle = document.getElementById("mping-reports-toggle");
  // Grab the check icon inside it
  const mpingCheckIcon = mpingToggle.querySelector(".menu-item-check");

  // Read saved state from localStorage (default to false if not set)
  let mpingEnabled = localStorage.getItem("mpingReportsEnabled") === "true";
  
  // Update UI based on stored state
  mpingCheckIcon.style.display = mpingEnabled ? "block" : "none";

  // Toggle the mPING reports when the menu item is clicked
  mpingToggle.addEventListener("click", function (e) {
    // Prevent the click from propagating (so it doesn't dismiss the popup)
    e.stopPropagation();
    
    // Toggle the state
    mpingEnabled = !mpingEnabled;
    localStorage.setItem("mpingReportsEnabled", mpingEnabled);
    
    // Update the check icon: show when enabled, hide when disabled
    mpingCheckIcon.style.display = mpingEnabled ? "block" : "none";
    
    // Immediately update the mPING markers on the map
    updateMpingReports();
  });
});

/**
 * updateMpingReports
 *
 * This function checks whether mPING reports are enabled via localStorage.
 * - If disabled, it clears the mPING GeoJSON source so that no markers appear.
 * - If enabled, it fetches the mPING report data (using your existing fetchReportData()
 *   and createGeoJSON() functions) and updates the source.
 */
function updateMpingReports() {
    // Check if the mPING toggle is enabled.
    if (localStorage.getItem("mpingReportsEnabled") !== "true") {
        // If not enabled, clear the source (if it exists) so that no markers are displayed.
        if (map.getSource('mping-reports')) {
            map.getSource('mping-reports').setData({
                type: "FeatureCollection",
                features: []
            });
        }
        return; // Exit early.
    }
    
    // Otherwise, fetch and update the mPING reports as usual.
    fetchReportData()
        .then(reportData => {
            // Rebuild the GeoJSON from the fetched data.
            reportGeoJSON = createGeoJSON(reportData);
            // Update the mPING reports source (if it exists).
            if (map.getSource('mping-reports')) {
                map.getSource('mping-reports').setData(reportGeoJSON);
            }
        })
        .catch(error => console.error('Error fetching mPING reports:', error));
}


// Function to remove popups with a smooth shrink & fade-out effect
function removePopups() {
    document.querySelectorAll('.mapboxgl-popup', '.mapboxgl-popup-anchor-bottom > .mapboxgl-popup-tip').forEach(popup => {
        const popupContent = popup.querySelector('.mapboxgl-popup-content', '.mapboxgl-popup-anchor-bottom > .mapboxgl-popup-tip');

        if (popupContent) {
            popupContent.style.transition = 'transform 300ms ease-in-out, opacity 30000ms ease-in-out';
            popupContent.style.transform = 'scale(0.5)'; // Shrink effect
            popupContent.style.opacity = '0'; // Fade out
        }

        // Wait for animation to finish before removing the whole popup
        setTimeout(() => {
            popup.remove();
        }, 300);
    });
}






function loadDay1ConvectiveOutlook() {
    // Remove any existing outlook layers first
    if (map.getLayer('day1-convective-outlook-fill')) {
        map.removeLayer('day1-convective-outlook-fill');
    }
    if (map.getLayer('day1-convective-outlook-border')) {
        map.removeLayer('day1-convective-outlook-border');
    }
    if (map.getSource('day1-convective-outlook-source')) {
        map.removeSource('day1-convective-outlook-source');
    }
    
    // Only proceed if this outlook is enabled
    if (localStorage.getItem('day1_convective_outlookEnabled') !== 'true') {
        return;
    }
    
    // Fetch the GeoJSON data
    fetch('https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/1/query?where=1%3D1&outFields=*&f=geojson')
        .then(response => response.json())
        .then(data => {
            // Add the source to the map
            map.addSource('day1-convective-outlook-source', {
                type: 'geojson',
                data: data
            });
            
            // Create the fill layer
            const fillLayer = {
                id: 'day1-convective-outlook-fill',
                type: 'fill',
                source: 'day1-convective-outlook-source',
                paint: {
                    'fill-color': [
                        'match',
                        ['get', 'dn'],
                        2, '#C1E9C1', // Thunderstorm
                        3, '#66A366', // Marginal
                        4, '#FFE066', // Slight
                        5, '#F4971D', // Enhanced
                        6, '#FF3C32', // Moderate
                        8, '#E234FD', // High
                        'transparent'
                    ],
                    'fill-opacity': 1
                }
            };
            
            // Create the border layer
            const borderLayer = {
                id: 'day1-convective-outlook-border',
                type: 'line',
                source: 'day1-convective-outlook-source',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'dn'],
                        2, '#55BB55', // Thunderstorm border
                        3, '#1A621C', // Marginal border
                        4, '#DDAA00', // Slight border
                        5, '#DD790D', // Enhanced border
                        6, '#A20901', // Moderate border
                        8, '#A701C0', // High border
                        'transparent'
                    ],
                    'line-width': 2
                }
            };
            
            // Add the layers
            map.addLayer(fillLayer, 'road-primary-case-navigation');
            map.addLayer(borderLayer, 'road-primary-case-navigation');
        })
        .catch(error => {
            console.error('Error loading Day 1 Convective Outlook:', error);
        });
}

function loadDay1TornadoOutlook() {
    // Remove any existing outlook layers first
    if (map.getLayer('day1-tornado-outlook-fill')) {
        map.removeLayer('day1-tornado-outlook-fill');
    }
    if (map.getLayer('day1-tornado-outlook-border')) {
        map.removeLayer('day1-tornado-outlook-border');
    }
    if (map.getSource('day1-tornado-outlook-source')) {
        map.removeSource('day1-tornado-outlook-source');
    }
    
    // Only proceed if this outlook is enabled
    if (localStorage.getItem('day1_tornado_outlookEnabled') !== 'true') {
        return;
    }
    
    // Fetch the GeoJSON data
    fetch('https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/3/query?where=1%3D1&outFields=*&f=geojson')
        .then(response => response.json())
        .then(data => {
            // Add the source to the map
            map.addSource('day1-tornado-outlook-source', {
                type: 'geojson',
                data: data
            });
            
            // Create the fill layer
            const fillLayer = {
                id: 'day1-tornado-outlook-fill',
                type: 'fill',
                source: 'day1-tornado-outlook-source',
                paint: {
                    'fill-color': [
                        'match',
                        ['get', 'dn'],
                        2, '#66A366',     // 2%
                        5, '#9D4E15',     // 5%
                        10, '#FFE066',    // 10%
                        15, '#FF3C32',    // 15%
                        30, '#E234FD',    // 30%
                        45, '#A730C4',    // 45%
                        60, 'rgba(0, 77, 168, 1)',    // 60% (keeping existing)
                        'transparent'
                    ],
                    'fill-opacity': 1
                }
            };
            
            // Create the border layer
            const borderLayer = {
                id: 'day1-tornado-outlook-border',
                type: 'line',
                source: 'day1-tornado-outlook-source',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'dn'],
                        2, '#005500',     // 2% outline
                        5, '#733E18',     // 5% outline
                        10, '#DDAA00',    // 10% outline
                        15, '#A20901',    // 15% outline
                        30, '#A701C0',    // 30% outline
                        45, '#7C2192',    // 45% outline
                        60, 'rgb(0, 47, 138)',  // 60% outline (keeping existing)
                        'transparent'
                    ],
                    'line-width': 2
                }
            };
            
            // Add the layers
            map.addLayer(fillLayer, 'road-primary-case-navigation');
            map.addLayer(borderLayer, 'road-primary-case-navigation');
        })
        .catch(error => {
            console.error('Error loading Day 1 Tornado Outlook:', error);
        });
}

function loadDay1WindOutlook() {
    // Remove any existing outlook layers first
    if (map.getLayer('day1-wind-outlook-fill')) {
        map.removeLayer('day1-wind-outlook-fill');
    }
    if (map.getLayer('day1-wind-outlook-border')) {
        map.removeLayer('day1-wind-outlook-border');
    }
    if (map.getSource('day1-wind-outlook-source')) {
        map.removeSource('day1-wind-outlook-source');
    }
    
    // Only proceed if this outlook is enabled
    if (localStorage.getItem('day1_wind_outlookEnabled') !== 'true') {
        return;
    }
    
    // Fetch the GeoJSON data
    fetch('https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/7/query?where=1%3D1&outFields=*&f=geojson')
        .then(response => response.json())
        .then(data => {
            // Add the source to the map
            map.addSource('day1-wind-outlook-source', {
                type: 'geojson',
                data: data
            });
            
            // Create the fill layer
            const fillLayer = {
                id: 'day1-wind-outlook-fill',
                type: 'fill',
                source: 'day1-wind-outlook-source',
                paint: {
                    'fill-color': [
                        'match',
                        ['get', 'dn'],
                        5, '#9D4E15',     // 5%
                        15, '#FFE066',    // 15%
                        30, '#FF3C32',    // 30%
                        45, '#E234FD',    // 45%
                        60, '#A539C0',    // 60%
                        'transparent'
                    ],
                    'fill-opacity': 1
                }
            };
            
            // Create the border layer
            const borderLayer = {
                id: 'day1-wind-outlook-border',
                type: 'line',
                source: 'day1-wind-outlook-source',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'dn'],
                        5, '#733E18',     // 5% outline
                        15, '#DDAA00',    // 15% outline
                        30, '#A20901',    // 30% outline
                        45, '#A701C0',    // 45% outline
                        60, '#832799',    // 60% outline
                        'transparent'
                    ],
                    'line-width': 2
                }
            };
            
            // Add the layers
            map.addLayer(fillLayer, 'road-primary-case-navigation');
            map.addLayer(borderLayer, 'road-primary-case-navigation');
        })
        .catch(error => {
            console.error('Error loading Day 1 Wind Outlook:', error);
        });
}

function loadDay1HailOutlook() {
    // Remove any existing outlook layers first
    if (map.getLayer('day1-hail-outlook-fill')) {
        map.removeLayer('day1-hail-outlook-fill');
    }
    if (map.getLayer('day1-hail-outlook-border')) {
        map.removeLayer('day1-hail-outlook-border');
    }
    if (map.getSource('day1-hail-outlook-source')) {
        map.removeSource('day1-hail-outlook-source');
    }
    
    // Only proceed if this outlook is enabled
    if (localStorage.getItem('day1_hail_outlookEnabled') !== 'true') {
        return;
    }
    
    // Fetch the GeoJSON data
    fetch('https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/5/query?where=1%3D1&outFields=*&f=geojson')
        .then(response => response.json())
        .then(data => {
            // Add the source to the map
            map.addSource('day1-hail-outlook-source', {
                type: 'geojson',
                data: data
            });
            
            // Create the fill layer
            const fillLayer = {
                id: 'day1-hail-outlook-fill',
                type: 'fill',
                source: 'day1-hail-outlook-source',
                paint: {
                    'fill-color': [
                        'match',
                        ['get', 'dn'],
                        5, '#9D4E15',     // 5%
                        15, '#FFE066',    // 15%
                        30, '#FF3C32',    // 30%
                        45, '#E234FD',    // 45%
                        60, '#A539C0',    // 60%
                        'transparent'
                    ],
                    'fill-opacity': 1
                }
            };
            
            // Create the border layer
            const borderLayer = {
                id: 'day1-hail-outlook-border',
                type: 'line',
                source: 'day1-hail-outlook-source',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'dn'],
                        5, '#733E18',     // 5% outline
                        15, '#DDAA00',    // 15% outline
                        30, '#A20901',    // 30% outline
                        45, '#A701C0',    // 45% outline
                        60, '#832799',    // 60% outline
                        'transparent'
                    ],
                    'line-width': 2
                }
            };
            
            // Add the layers
            map.addLayer(fillLayer, 'road-primary-case-navigation');
            map.addLayer(borderLayer, 'road-primary-case-navigation');
        })
        .catch(error => {
            console.error('Error loading Day 1 Hail Outlook:', error);
        });
}

// Day 2 Outlooks
function loadDay2ConvectiveOutlook() {
    // Remove any existing outlook layers first
    if (map.getLayer('day2-convective-outlook-fill')) {
        map.removeLayer('day2-convective-outlook-fill');
    }
    if (map.getLayer('day2-convective-outlook-border')) {
        map.removeLayer('day2-convective-outlook-border');
    }
    if (map.getSource('day2-convective-outlook-source')) {
        map.removeSource('day2-convective-outlook-source');
    }
    
    // Only proceed if this outlook is enabled
    if (localStorage.getItem('day2_convective_outlookEnabled') !== 'true') {
        return;
    }
    
    // Fetch the GeoJSON data
    fetch('https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/9/query?where=1%3D1&outFields=*&f=geojson')
        .then(response => response.json())
        .then(data => {
            // Add the source to the map
            map.addSource('day2-convective-outlook-source', {
                type: 'geojson',
                data: data
            });
            
            // Create the fill layer
            const fillLayer = {
                id: 'day2-convective-outlook-fill',
                type: 'fill',
                source: 'day2-convective-outlook-source',
                paint: {
                    'fill-color': [
                        'match',
                        ['get', 'dn'],
                        2, '#C1E9C1', // Thunderstorm
                        3, '#66A366', // Marginal
                        4, '#FFE066', // Slight
                        5, '#F4971D', // Enhanced
                        6, '#FF3C32', // Moderate
                        8, '#E234FD', // High
                        'transparent'
                    ],
                    'fill-opacity': 1
                }
            };
            
            // Create the border layer
            const borderLayer = {
                id: 'day2-convective-outlook-border',
                type: 'line',
                source: 'day2-convective-outlook-source',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'dn'],
                        2, '#55BB55', // Thunderstorm border
                        3, '#1A621C', // Marginal border
                        4, '#DDAA00', // Slight border
                        5, '#DD790D', // Enhanced border
                        6, '#A20901', // Moderate border
                        8, '#A701C0', // High border
                        'transparent'
                    ],
                    'line-width': 2
                }
            };
            
            // Add the layers
            map.addLayer(fillLayer, 'road-primary-case-navigation');
            map.addLayer(borderLayer, 'road-primary-case-navigation');
        })
        .catch(error => {
            console.error('Error loading Day 2 Convective Outlook:', error);
        });
}

function loadDay2TornadoOutlook() {
    // Remove any existing outlook layers first
    if (map.getLayer('day2-tornado-outlook-fill')) {
        map.removeLayer('day2-tornado-outlook-fill');
    }
    if (map.getLayer('day2-tornado-outlook-border')) {
        map.removeLayer('day2-tornado-outlook-border');
    }
    if (map.getSource('day2-tornado-outlook-source')) {
        map.removeSource('day2-tornado-outlook-source');
    }
    
    // Only proceed if this outlook is enabled
    if (localStorage.getItem('day2_tornado_outlookEnabled') !== 'true') {
        return;
    }
    
    // Fetch the GeoJSON data
    fetch('https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/11/query?where=1%3D1&outFields=*&f=geojson')
        .then(response => response.json())
        .then(data => {
            // Add the source to the map
            map.addSource('day2-tornado-outlook-source', {
                type: 'geojson',
                data: data
            });
            
            // Create the fill layer
            const fillLayer = {
                id: 'day2-tornado-outlook-fill',
                type: 'fill',
                source: 'day2-tornado-outlook-source',
                paint: {
                    'fill-color': [
                        'match',
                        ['get', 'dn'],
                        2, '#66A366',     // 2%
                        5, '#9D4E15',     // 5%
                        10, '#FFE066',    // 10%
                        15, '#FF3C32',    // 15%
                        30, '#E234FD',    // 30%
                        45, '#A730C4',    // 45%
                        60, 'rgba(0, 77, 168, 1)',    // 60% (keeping existing)
                        'transparent'
                    ],
                    'fill-opacity': 1
                }
            };
            
            // Create the border layer
            const borderLayer = {
                id: 'day2-tornado-outlook-border',
                type: 'line',
                source: 'day2-tornado-outlook-source',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'dn'],
                        2, '#005500',     // 2% outline
                        5, '#733E18',     // 5% outline
                        10, '#DDAA00',    // 10% outline
                        15, '#A20901',    // 15% outline
                        30, '#A701C0',    // 30% outline
                        45, '#7C2192',    // 45% outline
                        60, 'rgb(0, 47, 138)',  // 60% outline (keeping existing)
                        'transparent'
                    ],
                    'line-width': 2
                }
            };
            
            // Add the layers
            map.addLayer(fillLayer, 'road-primary-case-navigation');
            map.addLayer(borderLayer, 'road-primary-case-navigation');
        })
        .catch(error => {
            console.error('Error loading Day 2 Tornado Outlook:', error);
        });
}

function loadDay2WindOutlook() {
    // Remove any existing outlook layers first
    if (map.getLayer('day2-wind-outlook-fill')) {
        map.removeLayer('day2-wind-outlook-fill');
    }
    if (map.getLayer('day2-wind-outlook-border')) {
        map.removeLayer('day2-wind-outlook-border');
    }
    if (map.getSource('day2-wind-outlook-source')) {
        map.removeSource('day2-wind-outlook-source');
    }
    
    // Only proceed if this outlook is enabled
    if (localStorage.getItem('day2_wind_outlookEnabled') !== 'true') {
        return;
    }
    
    // Fetch the GeoJSON data
    fetch('https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/15/query?where=1%3D1&outFields=*&f=geojson')
        .then(response => response.json())
        .then(data => {
            // Add the source to the map
            map.addSource('day2-wind-outlook-source', {
                type: 'geojson',
                data: data
            });
            
            // Create the fill layer
            const fillLayer = {
                id: 'day2-wind-outlook-fill',
                type: 'fill',
                source: 'day2-wind-outlook-source',
                paint: {
                    'fill-color': [
                        'match',
                        ['get', 'dn'],
                        5, '#9D4E15',     // 5%
                        15, '#FFE066',    // 15%
                        30, '#FF3C32',    // 30%
                        45, '#E234FD',    // 45%
                        60, '#A539C0',    // 60%
                        'transparent'
                    ],
                    'fill-opacity': 1
                }
            };
            
            // Create the border layer
            const borderLayer = {
                id: 'day2-wind-outlook-border',
                type: 'line',
                source: 'day2-wind-outlook-source',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'dn'],
                        5, '#733E18',     // 5% outline
                        15, '#DDAA00',    // 15% outline
                        30, '#A20901',    // 30% outline
                        45, '#A701C0',    // 45% outline
                        60, '#832799',    // 60% outline
                        'transparent'
                    ],
                    'line-width': 2
                }
            };
            
            // Add the layers
            map.addLayer(fillLayer, 'road-primary-case-navigation');
            map.addLayer(borderLayer, 'road-primary-case-navigation');
        })
        .catch(error => {
            console.error('Error loading Day 2 Wind Outlook:', error);
        });
}

function loadDay2HailOutlook() {
    // Remove any existing outlook layers first
    if (map.getLayer('day2-hail-outlook-fill')) {
        map.removeLayer('day2-hail-outlook-fill');
    }
    if (map.getLayer('day2-hail-outlook-border')) {
        map.removeLayer('day2-hail-outlook-border');
    }
    if (map.getSource('day2-hail-outlook-source')) {
        map.removeSource('day2-hail-outlook-source');
    }
    
    // Only proceed if this outlook is enabled
    if (localStorage.getItem('day2_hail_outlookEnabled') !== 'true') {
        return;
    }
    
    // Fetch the GeoJSON data
    fetch('https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/13/query?where=1%3D1&outFields=*&f=geojson')
        .then(response => response.json())
        .then(data => {
            // Add the source to the map
            map.addSource('day2-hail-outlook-source', {
                type: 'geojson',
                data: data
            });
            
            // Create the fill layer
            const fillLayer = {
                id: 'day2-hail-outlook-fill',
                type: 'fill',
                source: 'day2-hail-outlook-source',
                paint: {
                    'fill-color': [
                        'match',
                        ['get', 'dn'],
                        5, '#9D4E15',     // 5%
                        15, '#FFE066',    // 15%
                        30, '#FF3C32',    // 30%
                        45, '#E234FD',    // 45%
                        60, '#A539C0',    // 60%
                        'transparent'
                    ],
                    'fill-opacity': 1
                }
            };
            
            // Create the border layer
            const borderLayer = {
                id: 'day2-hail-outlook-border',
                type: 'line',
                source: 'day2-hail-outlook-source',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'dn'],
                        5, '#733E18',     // 5% outline
                        15, '#DDAA00',    // 15% outline
                        30, '#A20901',    // 30% outline
                        45, '#A701C0',    // 45% outline
                        60, '#832799',    // 60% outline
                        'transparent'
                    ],
                    'line-width': 2
                }
            };
            
            // Add the layers
            map.addLayer(fillLayer, 'road-primary-case-navigation');
            map.addLayer(borderLayer, 'road-primary-case-navigation');
        })
        .catch(error => {
            console.error('Error loading Day 2 Hail Outlook:', error);
        });
}

// Day 3 Convective Outlook
function loadDay3ConvectiveOutlook() {
    // Remove any existing outlook layers first
    if (map.getLayer('day3-convective-outlook-fill')) {
        map.removeLayer('day3-convective-outlook-fill');
    }
    if (map.getLayer('day3-convective-outlook-border')) {
        map.removeLayer('day3-convective-outlook-border');
    }
    if (map.getSource('day3-convective-outlook-source')) {
        map.removeSource('day3-convective-outlook-source');
    }
    
    // Only proceed if this outlook is enabled
    if (localStorage.getItem('day3_convective_outlookEnabled') !== 'true') {
        return;
    }
    
    // Fetch the GeoJSON data
    fetch('https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/17/query?where=1%3D1&outFields=*&f=geojson')
        .then(response => response.json())
        .then(data => {
            // Add the source to the map
            map.addSource('day3-convective-outlook-source', {
                type: 'geojson',
                data: data
            });
            
            // Create the fill layer
            const fillLayer = {
                id: 'day3-convective-outlook-fill',
                type: 'fill',
                source: 'day3-convective-outlook-source',
                paint: {
                    'fill-color': [
                        'match',
                        ['get', 'dn'],
                        2, '#C1E9C1', // Thunderstorm
                        3, '#66A366', // Marginal
                        4, '#FFE066', // Slight
                        5, '#F4971D', // Enhanced
                        6, '#FF3C32', // Moderate
                        8, '#E234FD', // High
                        'transparent'
                    ],
                    'fill-opacity': 1
                }
            };
            
            // Create the border layer
            const borderLayer = {
                id: 'day3-convective-outlook-border',
                type: 'line',
                source: 'day3-convective-outlook-source',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'dn'],
                        2, '#55BB55', // Thunderstorm border
                        3, '#1A621C', // Marginal border
                        4, '#DDAA00', // Slight border
                        5, '#DD790D', // Enhanced border
                        6, '#A20901', // Moderate border
                        8, '#A701C0', // High border
                        'transparent'
                    ],
                    'line-width': 2
                }
            };
            
            // Add the layers
            map.addLayer(fillLayer, 'road-primary-case-navigation');
            map.addLayer(borderLayer, 'road-primary-case-navigation');
        })
        .catch(error => {
            console.error('Error loading Day 3 Convective Outlook:', error);
        });
}

function loadDay3ProbabilisticOutlook() {
    // Remove any existing outlook layers first
    if (map.getLayer('day3-probabilistic-outlook-fill')) {
        map.removeLayer('day3-probabilistic-outlook-fill');
    }
    if (map.getLayer('day3-probabilistic-outlook-border')) {
        map.removeLayer('day3-probabilistic-outlook-border');
    }
    if (map.getSource('day3-probabilistic-outlook-source')) {
        map.removeSource('day3-probabilistic-outlook-source');
    }
    
    // Only proceed if this outlook is enabled
    if (localStorage.getItem('day3_probabilistic_outlookEnabled') !== 'true') {
        return;
    }
    
    // Fetch the GeoJSON data
    fetch('https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/19/query?where=1%3D1&outFields=*&f=geojson')
        .then(response => response.json())
        .then(data => {
            // Add the source to the map
            map.addSource('day3-probabilistic-outlook-source', {
                type: 'geojson',
                data: data
            });
            
            // Create the fill layer
            const fillLayer = {
                id: 'day3-probabilistic-outlook-fill',
                type: 'fill',
                source: 'day3-probabilistic-outlook-source',
                paint: {
                    'fill-color': [
                        'match',
                        ['get', 'dn'],
                        5, '#9D4E15',     // 5%
                        15, '#FFE066',    // 15%
                        30, '#FF3C32',    // 30%
                        45, '#E234FD',    // 45%
                        60, '#A539C0',    // 60%
                        'transparent'
                    ],
                    'fill-opacity': 1
                }
            };
            
            // Create the border layer
            const borderLayer = {
                id: 'day3-probabilistic-outlook-border',
                type: 'line',
                source: 'day3-probabilistic-outlook-source',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'dn'],
                        5, '#733E18',     // 5% outline
                        15, '#DDAA00',    // 15% outline
                        30, '#A20901',    // 30% outline
                        45, '#A701C0',    // 45% outline
                        60, '#832799',    // 60% outline
                        'transparent'
                    ],
                    'line-width': 2
                }
            };
            
            // Add the layers
            map.addLayer(fillLayer, 'road-primary-case-navigation');
            map.addLayer(borderLayer, 'road-primary-case-navigation');
        })
        .catch(error => {
            console.error('Error loading Day 3 Probabilistic Outlook:', error);
        });
}

// Day 4-8 Probabilistic Outlooks
function loadDay4ProbabilisticOutlook() {
    // Remove any existing outlook layers first
    if (map.getLayer('day4-probabilistic-outlook-fill')) {
        map.removeLayer('day4-probabilistic-outlook-fill');
    }
    if (map.getLayer('day4-probabilistic-outlook-border')) {
        map.removeLayer('day4-probabilistic-outlook-border');
    }
    if (map.getSource('day4-probabilistic-outlook-source')) {
        map.removeSource('day4-probabilistic-outlook-source');
    }
    
    // Only proceed if this outlook is enabled
    if (localStorage.getItem('day4_probabilistic_outlookEnabled') !== 'true') {
        return;
    }
    
    // Fetch the GeoJSON data
    fetch('https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/21/query?where=1%3D1&outFields=*&f=geojson')
        .then(response => response.json())
        .then(data => {
            // Add the source to the map
            map.addSource('day4-probabilistic-outlook-source', {
                type: 'geojson',
                data: data
            });
            
            // Create the fill layer - using Slight and Enhanced colors from convective outlooks
            const fillLayer = {
                id: 'day4-probabilistic-outlook-fill',
                type: 'fill',
                source: 'day4-probabilistic-outlook-source',
                paint: {
                    'fill-color': [
                        'match',
                        ['get', 'dn'],
                        15, '#FFE066',    // 15% - Slight risk color
                        30, '#F4971D',    // 30% - Enhanced risk color
                        'transparent'
                    ],
                    'fill-opacity': 1
                }
            };
            
            // Create the border layer - using Slight and Enhanced border colors from convective outlooks
            const borderLayer = {
                id: 'day4-probabilistic-outlook-border',
                type: 'line',
                source: 'day4-probabilistic-outlook-source',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'dn'],
                        15, '#DDAA00',    // 15% outline - Slight risk border color
                        30, '#DD790D',    // 30% outline - Enhanced risk border color
                        'transparent'
                    ],
                    'line-width': 2
                }
            };
            
            // Add the layers
            map.addLayer(fillLayer, 'road-primary-case-navigation');
            map.addLayer(borderLayer, 'road-primary-case-navigation');
        })
        .catch(error => {
            console.error('Error loading Day 4 Probabilistic Outlook:', error);
        });
}

function loadDay5ProbabilisticOutlook() {
    // Remove any existing outlook layers first
    if (map.getLayer('day5-probabilistic-outlook-fill')) {
        map.removeLayer('day5-probabilistic-outlook-fill');
    }
    if (map.getLayer('day5-probabilistic-outlook-border')) {
        map.removeLayer('day5-probabilistic-outlook-border');
    }
    if (map.getSource('day5-probabilistic-outlook-source')) {
        map.removeSource('day5-probabilistic-outlook-source');
    }
    
    // Only proceed if this outlook is enabled
    if (localStorage.getItem('day5_probabilistic_outlookEnabled') !== 'true') {
        return;
    }
    
    // Fetch the GeoJSON data
    fetch('https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/22/query?where=1%3D1&outFields=*&f=geojson')
        .then(response => response.json())
        .then(data => {
            // Add the source to the map
            map.addSource('day5-probabilistic-outlook-source', {
                type: 'geojson',
                data: data
            });
            
            // Create the fill layer - using Slight and Enhanced colors from convective outlooks
            const fillLayer = {
                id: 'day5-probabilistic-outlook-fill',
                type: 'fill',
                source: 'day5-probabilistic-outlook-source',
                paint: {
                    'fill-color': [
                        'match',
                        ['get', 'dn'],
                        15, '#FFE066',    // 15% - Slight risk color
                        30, '#F4971D',    // 30% - Enhanced risk color
                        'transparent'
                    ],
                    'fill-opacity': 1
                }
            };
            
            // Create the border layer - using Slight and Enhanced border colors from convective outlooks
            const borderLayer = {
                id: 'day5-probabilistic-outlook-border',
                type: 'line',
                source: 'day5-probabilistic-outlook-source',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'dn'],
                        15, '#DDAA00',    // 15% outline - Slight risk border color
                        30, '#DD790D',    // 30% outline - Enhanced risk border color
                        'transparent'
                    ],
                    'line-width': 2
                }
            };
            
            // Add the layers
            map.addLayer(fillLayer, 'road-primary-case-navigation');
            map.addLayer(borderLayer, 'road-primary-case-navigation');
        })
        .catch(error => {
            console.error('Error loading Day 5 Probabilistic Outlook:', error);
        });
}

function loadDay6ProbabilisticOutlook() {
    // Remove any existing outlook layers first
    if (map.getLayer('day6-probabilistic-outlook-fill')) {
        map.removeLayer('day6-probabilistic-outlook-fill');
    }
    if (map.getLayer('day6-probabilistic-outlook-border')) {
        map.removeLayer('day6-probabilistic-outlook-border');
    }
    if (map.getSource('day6-probabilistic-outlook-source')) {
        map.removeSource('day6-probabilistic-outlook-source');
    }
    
    // Only proceed if this outlook is enabled
    if (localStorage.getItem('day6_probabilistic_outlookEnabled') !== 'true') {
        return;
    }
    
    // Fetch the GeoJSON data
    fetch('https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/23/query?where=1%3D1&outFields=*&f=geojson')
        .then(response => response.json())
        .then(data => {
            // Add the source to the map
            map.addSource('day6-probabilistic-outlook-source', {
                type: 'geojson',
                data: data
            });
            
            // Create the fill layer - using Slight and Enhanced colors from convective outlooks
            const fillLayer = {
                id: 'day6-probabilistic-outlook-fill',
                type: 'fill',
                source: 'day6-probabilistic-outlook-source',
                paint: {
                    'fill-color': [
                        'match',
                        ['get', 'dn'],
                        15, '#FFE066',    // 15% - Slight risk color
                        30, '#F4971D',    // 30% - Enhanced risk color
                        'transparent'
                    ],
                    'fill-opacity': 1
                }
            };
            
            // Create the border layer - using Slight and Enhanced border colors from convective outlooks
            const borderLayer = {
                id: 'day6-probabilistic-outlook-border',
                type: 'line',
                source: 'day6-probabilistic-outlook-source',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'dn'],
                        15, '#DDAA00',    // 15% outline - Slight risk border color
                        30, '#DD790D',    // 30% outline - Enhanced risk border color
                        'transparent'
                    ],
                    'line-width': 2
                }
            };
            
            // Add the layers
            map.addLayer(fillLayer, 'road-primary-case-navigation');
            map.addLayer(borderLayer, 'road-primary-case-navigation');
        })
        .catch(error => {
            console.error('Error loading Day 6 Probabilistic Outlook:', error);
        });
}

function loadDay7ProbabilisticOutlook() {
    // Remove any existing outlook layers first
    if (map.getLayer('day7-probabilistic-outlook-fill')) {
        map.removeLayer('day7-probabilistic-outlook-fill');
    }
    if (map.getLayer('day7-probabilistic-outlook-border')) {
        map.removeLayer('day7-probabilistic-outlook-border');
    }
    if (map.getSource('day7-probabilistic-outlook-source')) {
        map.removeSource('day7-probabilistic-outlook-source');
    }
    
    // Only proceed if this outlook is enabled
    if (localStorage.getItem('day7_probabilistic_outlookEnabled') !== 'true') {
        return;
    }
    
    // Fetch the GeoJSON data
    fetch('https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/24/query?where=1%3D1&outFields=*&f=geojson')
        .then(response => response.json())
        .then(data => {
            // Add the source to the map
            map.addSource('day7-probabilistic-outlook-source', {
                type: 'geojson',
                data: data
            });
            
            // Create the fill layer - using Slight and Enhanced colors from convective outlooks
            const fillLayer = {
                id: 'day7-probabilistic-outlook-fill',
                type: 'fill',
                source: 'day7-probabilistic-outlook-source',
                paint: {
                    'fill-color': [
                        'match',
                        ['get', 'dn'],
                        15, '#FFE066',    // 15% - Slight risk color
                        30, '#F4971D',    // 30% - Enhanced risk color
                        'transparent'
                    ],
                    'fill-opacity': 1
                }
            };
            
            // Create the border layer - using Slight and Enhanced border colors from convective outlooks
            const borderLayer = {
                id: 'day7-probabilistic-outlook-border',
                type: 'line',
                source: 'day7-probabilistic-outlook-source',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'dn'],
                        15, '#DDAA00',    // 15% outline - Slight risk border color
                        30, '#DD790D',    // 30% outline - Enhanced risk border color
                        'transparent'
                    ],
                    'line-width': 2
                }
            };
            
            // Add the layers
            map.addLayer(fillLayer, 'road-primary-case-navigation');
            map.addLayer(borderLayer, 'road-primary-case-navigation');
        })
        .catch(error => {
            console.error('Error loading Day 7 Probabilistic Outlook:', error);
        });
}

function loadDay8ProbabilisticOutlook() {
    // Remove any existing outlook layers first
    if (map.getLayer('day8-probabilistic-outlook-fill')) {
        map.removeLayer('day8-probabilistic-outlook-fill');
    }
    if (map.getLayer('day8-probabilistic-outlook-border')) {
        map.removeLayer('day8-probabilistic-outlook-border');
    }
    if (map.getSource('day8-probabilistic-outlook-source')) {
        map.removeSource('day8-probabilistic-outlook-source');
    }
    
    // Only proceed if this outlook is enabled
    if (localStorage.getItem('day8_probabilistic_outlookEnabled') !== 'true') {
        return;
    }
    
    // Fetch the GeoJSON data
    fetch('https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/25/query?where=1%3D1&outFields=*&f=geojson')
        .then(response => response.json())
        .then(data => {
            // Add the source to the map
            map.addSource('day8-probabilistic-outlook-source', {
                type: 'geojson',
                data: data
            });
            
            // Create the fill layer - using Slight and Enhanced colors from convective outlooks
            const fillLayer = {
                id: 'day8-probabilistic-outlook-fill',
                type: 'fill',
                source: 'day8-probabilistic-outlook-source',
                paint: {
                    'fill-color': [
                        'match',
                        ['get', 'dn'],
                        15, '#FFE066',    // 15% - Slight risk color
                        30, '#F4971D',    // 30% - Enhanced risk color
                        'transparent'
                    ],
                    'fill-opacity': 1
                }
            };
            
            // Create the border layer - using Slight and Enhanced border colors from convective outlooks
            const borderLayer = {
                id: 'day8-probabilistic-outlook-border',
                type: 'line',
                source: 'day8-probabilistic-outlook-source',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'dn'],
                        15, '#DDAA00',    // 15% outline - Slight risk border color
                        30, '#DD790D',    // 30% outline - Enhanced risk border color
                        'transparent'
                    ],
                    'line-width': 2
                }
            };
            
            // Add the layers
            map.addLayer(fillLayer, 'road-primary-case-navigation');
            map.addLayer(borderLayer, 'road-primary-case-navigation');
        })
        .catch(error => {
            console.error('Error loading Day 8 Probabilistic Outlook:', error);
        });
}

document.addEventListener("DOMContentLoaded", function() {
    // Get all needed elements
    const outlooksButton = document.getElementById("outlooks-button");
    const outlooksPopup = document.getElementById("outlooks-popup");
    const outlooksBlur = document.getElementById("outlooks-blur");
    const closeOutlooksButton = document.getElementById("close-outlooks-popup");
    
    // Initialize toggle states from localStorage
    initializeOutlookToggles();
    
    // Function to close the outlooks popup
    function closeOutlooksPopup() {
        outlooksPopup.classList.remove("show");
        outlooksPopup.classList.add("hide");
        outlooksBlur.style.opacity = "0";
        
        setTimeout(() => {
            outlooksPopup.style.display = "none";
            outlooksBlur.style.display = "none";
        }, 300);
    }
    
    // Check if all elements exist before adding event listeners
    if (outlooksButton && outlooksPopup && outlooksBlur && closeOutlooksButton) {
        // Popup event handling
        outlooksPopup.addEventListener("click", e => e.stopPropagation());
        outlooksBlur.addEventListener("click", closeOutlooksPopup);
        
        outlooksButton.addEventListener("click", function(event) {
            event.stopPropagation();
            
            outlooksPopup.style.display = "block";
            outlooksBlur.style.display = "block";
            
            // Force reflow to ensure transitions work properly
            outlooksPopup.offsetWidth;
            outlooksBlur.offsetWidth;
            
            outlooksPopup.classList.add("show");
            outlooksPopup.classList.remove("hide");
            outlooksBlur.style.opacity = "1";
        });
        
        closeOutlooksButton.addEventListener("click", closeOutlooksPopup);
    }
    
    // Get all toggle checkboxes
    const allToggles = document.querySelectorAll('.outlook-toggle');
    
    // Single active toggle behavior
    allToggles.forEach(toggle => {
        toggle.addEventListener('change', function() {
            if (this.checked) {
                // Turn OFF all other toggles
                allToggles.forEach(otherToggle => {
                    if (otherToggle !== this) {
                        otherToggle.checked = false;
                        localStorage.setItem(otherToggle.id + 'Enabled', 'false');
                        updateToggleAppearance(otherToggle);
                        
                        // Remove any layers from the toggled-off outlook
                        removeOutlookLayer(otherToggle.id);
                    }
                });
                
                localStorage.setItem(this.id + 'Enabled', 'true');
                updateToggleAppearance(this);
                
                // Load the appropriate outlook layer
                loadOutlookLayer(this.id);
            } else {
                // This toggle is being turned OFF
                localStorage.setItem(this.id + 'Enabled', 'false');
                updateToggleAppearance(this);
                
                // Remove the appropriate outlook layer
                removeOutlookLayer(this.id);
            }
        });
    });
    
    // Helper function to update toggle appearance
    function updateToggleAppearance(toggle) {
        const parentOption = toggle.closest('.outlook-toggle-option');
        if (parentOption) {
            if (toggle.checked) {
                parentOption.classList.add('active');
            } else {
                parentOption.classList.remove('active');
            }
        }
    }
    
// all the legend data
window.legendData = {
    day1_convective_outlook: {
        title: 'Day 1 Convective Outlook',
        items: [
            { color: '#C1E9C1', border: '#55BB55', label: 'Thunderstorm Risk' },
            { color: '#66A366', border: '#1A621C', label: 'Marginal Risk' },
            { color: '#FFE066', border: '#DDAA00', label: 'Slight Risk' },
            { color: '#F4971D', border: '#DD790D', label: 'Enhanced Risk' },
            { color: '#FF3C32', border: '#A20901', label: 'Moderate Risk' },
            { color: '#E234FD', border: '#A701C0', label: 'High Risk' }
        ]
    },
    
    day2_convective_outlook: {
        title: 'Day 2 Convective Outlook',
        items: [
            { color: '#C1E9C1', border: '#55BB55', label: 'Thunderstorm Risk' },
            { color: '#66A366', border: '#1A621C', label: 'Marginal Risk' },
            { color: '#FFE066', border: '#DDAA00', label: 'Slight Risk' },
            { color: '#F4971D', border: '#DD790D', label: 'Enhanced Risk' },
            { color: '#FF3C32', border: '#A20901', label: 'Moderate Risk' },
            { color: '#E234FD', border: '#A701C0', label: 'High Risk' }
        ]
    },
    day3_convective_outlook: {
        title: 'Day 3 Convective Outlook',
        items: [
            { color: '#C1E9C1', border: '#55BB55', label: 'Thunderstorm Risk' },
            { color: '#66A366', border: '#1A621C', label: 'Marginal Risk' },
            { color:  '#FFE066', border: '#DDAA00', label: 'Slight Risk' },
            { color: '#F4971D', border: '#DD790D', label: 'Enhanced Risk'  },
            { color: '#FF3C32', border: '#A20901', label: 'Moderate Risk' },
            { color: '#E234FD', border: '#A701C0', label: 'High Risk' }
        ]
    },
    day1_tornado_outlook: {
        title: 'Day 1 Tornado Outlook',
        items: [
            { color: '#66A366', border: '#005500', label: '2% Risk' },
            { color: '#9D4E15', border: '#733E18', label: '5% Risk' },
            { color: '#FFE066', border: '#DDAA00', label: '10% Risk' },
            { color: '#FF3C32', border: '#A20901', label: '15% Risk' },
            { color: '#E234FD', border: '#A701C0', label: '30% Risk' },
            { color: '#A730C4', border: '#7C2192', label: '45% Risk' },
            { color: 'rgba(0, 77, 168, 1)', border: 'rgb(0, 47, 138)', label: '60% Risk' }
        ]
    },
    day2_tornado_outlook: {
        title: 'Day 2 Tornado Outlook',
        items: [
            { color: '#66A366', border: '#005500', label: '2% Risk' },
            { color: '#9D4E15', border: '#733E18', label: '5% Risk' },
            { color: '#FFE066', border: '#DDAA00', label: '10% Risk' },
            { color: '#FF3C32', border: '#A20901', label: '15% Risk' },
            { color: '#E234FD', border: '#A701C0', label: '30% Risk' },
            { color: '#A730C4', border: '#7C2192', label: '45% Risk' },
            { color: 'rgba(0, 77, 168, 1)', border: 'rgb(0, 47, 138)', label: '60% Risk' }
        ]
    },
    day1_wind_outlook: {
        title: 'Day 1 Wind Outlook',
        items: [
            { color: '#9D4E15', border: '#733E18', label: '5% Risk' },
            { color: '#FFE066', border: '#DDAA00', label: '15% Risk' },
            { color: '#FF3C32', border: '#A20901', label: '30% Risk' },
            { color: '#E234FD', border: '#A701C0', label: '45% Risk' },
            { color: '#A539C0', border: '#832799', label: '60% Risk' }
        ]
    },
    day2_wind_outlook: {
        title: 'Day 2 Wind Outlook',
        items: [
            { color: '#9D4E15', border: '#733E18', label: '5% Risk' },
            { color: '#FFE066', border: '#DDAA00', label: '15% Risk' },
            { color: '#FF3C32', border: '#A20901', label: '30% Risk' },
            { color: '#E234FD', border: '#A701C0', label: '45% Risk' },
            { color: '#A539C0', border: '#832799', label: '60% Risk' }
        ]
    },
    day1_hail_outlook: {
        title: 'Day 1 Hail Outlook',
        items: [
            { color: '#9D4E15', border: '#733E18', label: '5% Risk' },
            { color: '#FFE066', border: '#DDAA00', label: '15% Risk' },
            { color: '#FF3C32', border: '#A20901', label: '30% Risk' },
            { color: '#E234FD', border: '#A701C0', label: '45% Risk' },
            { color: '#A539C0', border: '#832799', label: '60% Risk' }
        ]
    },
    day2_hail_outlook: {
        title: 'Day 2 Hail Outlook',
        items: [
            { color: '#9D4E15', border: '#733E18', label: '5% Risk' },
            { color: '#FFE066', border: '#DDAA00', label: '15% Risk' },
            { color: '#FF3C32', border: '#A20901', label: '30% Risk' },
            { color: '#E234FD', border: '#A701C0', label: '45% Risk' },
            { color: '#A539C0', border: '#832799', label: '60% Risk' }
        ]
    },
    
    day3_probabilistic_outlook: {
        title: 'Day 3 Probabilistic Outlook',
        items: [
            { color: '#9D4E15', border: '#733E18', label: '5% Risk' },
            { color: '#FFE066', border: '#DDAA00', label: '15% Risk' },
            { color: '#FF3C32', border: '#A20901', label: '30% Risk' },
            { color: '#E234FD', border: '#A701C0', label: '45% Risk' },
            { color: '#A539C0', border: '#832799', label: '60% Risk' }
        ]
    },
    day4_probabilistic_outlook: {
        title: 'Day 4 Probabilistic Outlook',
        items: [
            { color: '#FFE066', border: '#DDAA00', label: '15% Risk' },
            { color: '#F4971D', border: '#DD790D', label: '30% Risk' }
        ]
    },
    day5_probabilistic_outlook: {
        title:  'Day 5 Probabilistic Outlook',
        items: [
            {   color: '#FFE066', border: '#DDAA00', label: '15% Risk' },
            { color: '#F4971D', border: '#DD790D', label: '30% Risk' }
        ]
    },
    day6_probabilistic_outlook: {
        title: 'Day 6 Probabilistic Outlook',
        items: [
            { color: '#FFE066', border: '#DDAA00', label: '15% Risk' },
            { color: '#F4971D', border: '#DD790D', label: '30% Risk' }
        ]
    },
    day7_probabilistic_outlook: {
        title: 'Day 7 Probabilistic Outlook',
        items: [
            { color: '#FFE066', border: '#DDAA00', label: '15% Risk' },
            { color: '#F4971D', border: '#DD790D', label: '30% Risk' }
        ]
    },
    day8_probabilistic_outlook: {
        title: 'Day 8 Probabilistic Outlook',
        items: [
            { color: '#FFE066', border: '#DDAA00', label: '15% Risk' },
            { color: '#F4971D', border: '#DD790D', label: '30% Risk' }
        ]
    }
};

// Initialize the outlooks functionality when the DOM is loaded
document.addEventListener("DOMContentLoaded", function() {
    // Get all needed elements
    const outlooksButton = document.getElementById("outlooks-button");
    const outlooksPopup = document.getElementById("outlooks-popup");
    const outlooksBlur = document.getElementById("outlooks-blur");
    const closeOutlooksButton = document.getElementById("close-outlooks-popup");
    const legendToggle = document.getElementById('outlook_legend_toggle');
    
    // IMPORTANT: Set default for legend toggle to FALSE
    if (localStorage.getItem('outlookLegendVisible') === null) {
        localStorage.setItem('outlookLegendVisible', 'false');
    }
    
    // Initialize toggle states from localStorage
    initializeOutlooksSystem();
    
   // STEP 1: Set up legend toggle independent behavior
if (legendToggle) {
    // Initialize from localStorage with default of FALSE if not set
    const legendVisible = localStorage.getItem('outlookLegendVisible') === 'true';
    legendToggle.checked = legendVisible;
    updateToggleAppearance(legendToggle);
    
    // Use 'change' event for more immediate response
    legendToggle.addEventListener('change', function() {
        // Save state to localStorage
        localStorage.setItem('outlookLegendVisible', this.checked);
        updateToggleAppearance(this);
        
        if (this.checked) {
            // Immediately show legend if there's an active outlook
            const activeOutlookId = findActiveOutlookId();
            if (activeOutlookId) {
                updateLegend(activeOutlookId);
            }
        } else {
            // Immediately hide legend
            removeLegend();
        }
    });
}

    // STEP 2: Add event listeners to all outlook toggles
    const allOutlookToggles = document.querySelectorAll('.outlook-toggle');
    allOutlookToggles.forEach(toggle => {
        toggle.addEventListener('change', function() {
            if (this.checked) {
                // Turn off all other toggles
                allOutlookToggles.forEach(otherToggle => {
                    if (otherToggle !== this) {
                        otherToggle.checked = false;
                        localStorage.setItem(otherToggle.id + 'Enabled', 'false');
                        updateToggleAppearance(otherToggle);
                        removeOutlookLayer(otherToggle.id);
                    }
                });
                
                // Enable this outlook
                localStorage.setItem(this.id + 'Enabled', 'true');
                updateToggleAppearance(this);
                loadOutlookLayer(this.id);
                
                // Show legend if toggle is on
                if (legendToggle && legendToggle.checked) {
                    updateLegend(this.id);
                }
            } else {
                // This toggle is being turned off
                localStorage.setItem(this.id + 'Enabled', 'false');
                updateToggleAppearance(this);
                removeOutlookLayer(this.id);
                
                // Always remove the legend when turning off an outlook
                removeLegend();
            }
        });
    });
    
    // Function to close the outlooks popup
    function closeOutlooksPopup() {
        outlooksPopup.classList.remove("show");
        outlooksPopup.classList.add("hide");
        outlooksBlur.style.opacity = "0";
        
        setTimeout(() => {
            outlooksPopup.style.display = "none";
            outlooksBlur.style.display = "none";
        }, 300);
    }
    
    // Add event listeners for popup open/close if all elements exist
    if (outlooksButton && outlooksPopup && outlooksBlur && closeOutlooksButton) {
        outlooksPopup.addEventListener("click", e => e.stopPropagation());
        outlooksBlur.addEventListener("click", closeOutlooksPopup);
        
        outlooksButton.addEventListener("click", function(event) {
            event.stopPropagation();
            
            outlooksPopup.style.display = "block";
            outlooksBlur.style.display = "block";
            
            // Force reflow to ensure transitions work properly
            outlooksPopup.offsetWidth;
            outlooksBlur.offsetWidth;
            
            outlooksPopup.classList.add("show");
            outlooksPopup.classList.remove("hide");
            outlooksBlur.style.opacity = "1";
        });
        
        closeOutlooksButton.addEventListener("click", closeOutlooksPopup);
    }
    
    // STEP 3: Load active outlook layers on page load
    if (window.map) {
        // If map is already loaded, initialize outlook layers now
        initializeOutlookLayers();
    } else {
        // If map isn't ready yet, wait for it to be ready
        window.addEventListener('map_ready', initializeOutlookLayers);
    }
});

// Initialize the toggle states and appearance
function initializeOutlooksSystem() {
    // First, make sure the legend toggle has a default value in localStorage
    // Set default to FALSE instead of true
    if (localStorage.getItem('outlookLegendVisible') === null) {
        localStorage.setItem('outlookLegendVisible', 'false');
    }
    
    // Get all outlook toggles
    const outlookToggles = [
        'day1_convective_outlook', 'day1_tornado_outlook', 'day1_wind_outlook', 'day1_hail_outlook',
        'day2_convective_outlook', 'day2_tornado_outlook', 'day2_wind_outlook', 'day2_hail_outlook',
        'day3_convective_outlook', 'day3_probabilistic_outlook',
        'day4_probabilistic_outlook', 'day5_probabilistic_outlook', 'day6_probabilistic_outlook',
        'day7_probabilistic_outlook', 'day8_probabilistic_outlook'
    ];
    
    // Check if any toggle is active
    let hasActiveToggle = false;
    
    // Initialize all toggles from localStorage
    outlookToggles.forEach(id => {
        const toggle = document.getElementById(id);
        if (toggle) {
            // Get toggle state from localStorage with default of false
            const isEnabled = localStorage.getItem(id + 'Enabled') === 'true';
            toggle.checked = isEnabled;
            updateToggleAppearance(toggle);
            
            if (isEnabled) {
                hasActiveToggle = true;
            }
        }
    });
    
    // If no toggle is active, make sure all are explicitly set to false in localStorage
    if (!hasActiveToggle) {
        outlookToggles.forEach(id => {
            if (localStorage.getItem(id + 'Enabled') !== 'false') {
                localStorage.setItem(id + 'Enabled', 'false');
            }
        });
    }
}

// Create a more reliable function to manage the outlook legend toggle
function setupLegendToggle() {
  const legendToggle = document.getElementById('outlook_legend_toggle');
  if (!legendToggle) return;
  
  // Clear any existing event handlers by cloning and replacing
  const newLegendToggle = legendToggle.cloneNode(true);
  legendToggle.parentNode.replaceChild(newLegendToggle, legendToggle);
  
  // First, load the initial state from localStorage (default to false if not set)
  const isLegendVisible = localStorage.getItem('outlookLegendVisible') === 'true';
  
  // Apply the initial state
  newLegendToggle.checked = isLegendVisible;
  
  // Add style to prevent the parent from getting the purple highlight
  const style = document.createElement('style');
  style.textContent = `
    #outlooks-popup .outlook-toggle-option:has(#outlook_legend_toggle:checked) {
      border-color: #636381 !important;
      background-color: #1c1929 !important;
    }
  `;
  document.head.appendChild(style);
  
  // Add the event listener that will directly save the state
  newLegendToggle.addEventListener('click', function() {
    // Immediately save the state to localStorage
    const isChecked = this.checked;
    localStorage.setItem('outlookLegendVisible', isChecked ? 'true' : 'false');
    console.log(`Legend toggle state saved: ${isChecked}`);
    
    // Show or hide the legend based on the toggle state
    if (isChecked) {
      const activeOutlookId = findActiveOutlookId();
      if (activeOutlookId) {
        updateLegend(activeOutlookId);
      }
    } else {
      removeLegend();
    }
  });
  
  // Also immediately apply the current state
  if (isLegendVisible) {
    const activeOutlookId = findActiveOutlookId();
    if (activeOutlookId) {
      // Small delay to ensure DOM is ready
      setTimeout(() => updateLegend(activeOutlookId), 10);
    }
  } else {
    removeLegend();
  }
  
  return newLegendToggle;
}

// Also update the updateToggleAppearance function to skip the legend toggle
function updateToggleAppearance(toggle) {
  // Skip applying the active class for the legend toggle
  if (toggle && toggle.id === 'outlook_legend_toggle') return;
  
  const parentOption = toggle.closest('.outlook-toggle-option');
  if (parentOption) {
    if (toggle.checked) {
      parentOption.classList.add('active');
    } else {
      parentOption.classList.remove('active');
    }
  }
}

// Call the setup function when the document is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Initialize the legend toggle
  setupLegendToggle();
  
  // Ensure we initialize the outlook system too
  initializeOutlooksSystem();
  
  // Debug - check if the legend is visible according to localStorage
  console.log(`Legend visible (localStorage): ${localStorage.getItem('outlookLegendVisible')}`);
});

// For extra reliability, also call the setup after a short delay
// This ensures the DOM is fully loaded and ready
setTimeout(function() {
  setupLegendToggle();
  
  // Also verify if an active outlook exists and if the legend should be visible
  const activeOutlookId = findActiveOutlookId();
  const isLegendVisible = localStorage.getItem('outlookLegendVisible') === 'true';
  
  console.log(`Active outlook: ${activeOutlookId}, Legend visible: ${isLegendVisible}`);
  
  if (activeOutlookId && isLegendVisible) {
    updateLegend(activeOutlookId);
  }
}, 1500);

// Helper function to find which outlook is currently active
function findActiveOutlookId() {
    const toggles = [
        'day1_convective_outlook', 'day1_tornado_outlook', 'day1_wind_outlook', 'day1_hail_outlook',
        'day2_convective_outlook', 'day2_tornado_outlook', 'day2_wind_outlook', 'day2_hail_outlook',
        'day3_convective_outlook', 'day3_probabilistic_outlook',
        'day4_probabilistic_outlook', 'day5_probabilistic_outlook', 'day6_probabilistic_outlook',
        'day7_probabilistic_outlook', 'day8_probabilistic_outlook'
    ];
    
    for (let id of toggles) {
        if (localStorage.getItem(id + 'Enabled') === 'true') {
            return id;
        }
    }
    
    return null;
}

// Update toggle appearance based on checked state
function updateToggleAppearance(toggle) {
    const parentOption = toggle.closest('.outlook-toggle-option');
    if (parentOption) {
        if (toggle.checked) {
            parentOption.classList.add('active');
        } else {
            parentOption.classList.remove('active');
        }
    }
}

// Update the map legend
function updateLegend(outlookId) {
    // Remove any existing legend with fade effect
    removeLegend();
    
    // If no outlook is active or no legend data is available, return
    if (!outlookId || !window.legendData || !window.legendData[outlookId]) {
        console.log("No valid outlook data for legend:", outlookId);
        return;
    }
    
    // Create the legend container
    const legend = document.createElement('div');
    legend.id = 'map-legend';
    legend.className = 'map-legend';
    
    // Initially set opacity to 0 for fade-in
    legend.style.opacity = '0';
    
    // Create the title
    const title = document.createElement('div');
    title.className = 'legend-title';
    title.textContent = window.legendData[outlookId].title;
    legend.appendChild(title);
    
    // Create the legend items
    window.legendData[outlookId].items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'legend-item';
        
        const colorDiv = document.createElement('div');
        colorDiv.className = 'legend-color';
        colorDiv.style.backgroundColor = item.color;
        colorDiv.style.borderColor = item.border;
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'legend-label';
        labelDiv.textContent = item.label;
        
        itemDiv.appendChild(colorDiv);
        itemDiv.appendChild(labelDiv);
        legend.appendChild(itemDiv);
    });
    
    // Add the legend to the map container
    const mapContainer = document.querySelector('.mapboxgl-map');
    if (mapContainer) {
        mapContainer.appendChild(legend);
        
        // Force reflow then fade in
        void legend.offsetWidth;
        requestAnimationFrame(() => {
            legend.style.opacity = '1';
        });
    }
}

// Improved fade-out function for the legend
function removeLegend() {
    const existingLegend = document.getElementById('map-legend');
    if (existingLegend) {
        // Set direct opacity for immediate effect
        existingLegend.style.opacity = '0';
        
        // Remove after transition completes
        setTimeout(() => {
            if (existingLegend.parentNode) {
                existingLegend.parentNode.removeChild(existingLegend);
            }
        }, 300); // Match the CSS transition duration
    }
}// Enhanced loadOutlookLayer function
function loadOutlookLayer(toggleId) {
    // First ensure all layers are removed
    const allOutlookIds = [
        'day1_convective_outlook', 'day1_tornado_outlook', 'day1_wind_outlook', 'day1_hail_outlook',
        'day2_convective_outlook', 'day2_tornado_outlook', 'day2_wind_outlook', 'day2_hail_outlook',
        'day3_convective_outlook', 'day3_probabilistic_outlook',
        'day4_probabilistic_outlook', 'day5_probabilistic_outlook', 'day6_probabilistic_outlook',
        'day7_probabilistic_outlook', 'day8_probabilistic_outlook'
    ];
    
    // Remove all other layers first
    allOutlookIds.forEach(id => {
        if (id !== toggleId) {
            removeOutlookLayer(id);
        }
    });
    
    // Then load the requested layer
    switch(toggleId) {
        case 'day1_convective_outlook':
            loadDay1ConvectiveOutlook();
            break;
        case 'day1_tornado_outlook':
            loadDay1TornadoOutlook();
            break;
        case 'day1_wind_outlook':
            loadDay1WindOutlook();
            break;
        case 'day1_hail_outlook':
            loadDay1HailOutlook();
            break;
        case 'day2_convective_outlook':
            loadDay2ConvectiveOutlook();
            break;
        case 'day2_tornado_outlook':
            loadDay2TornadoOutlook();
            break;
        case 'day2_wind_outlook':
            loadDay2WindOutlook();
            break;
        case 'day2_hail_outlook':
            loadDay2HailOutlook();
            break;
        case 'day3_convective_outlook':
            loadDay3ConvectiveOutlook();
            break;
        case 'day3_probabilistic_outlook':
            loadDay3ProbabilisticOutlook();
            break;
        case 'day4_probabilistic_outlook':
            loadDay4ProbabilisticOutlook();
            break;
        case 'day5_probabilistic_outlook':
            loadDay5ProbabilisticOutlook();
            break;
        case 'day6_probabilistic_outlook':
            loadDay6ProbabilisticOutlook();
            break;
        case 'day7_probabilistic_outlook':
            loadDay7ProbabilisticOutlook();
            break;
        case 'day8_probabilistic_outlook':
            loadDay8ProbabilisticOutlook();
            break;
    }
    
    // Only show legend if legend toggle is enabled
    const legendToggle = document.getElementById('outlook_legend_toggle');
    if (legendToggle && legendToggle.checked) {
        updateLegend(toggleId);
    }
}




// Enhanced removeOutlookLayer function to ensure complete removal of all layers
function removeOutlookLayer(toggleId) {
    switch(toggleId) {
        case 'day1_convective_outlook':
            if (map.getLayer('day1-convective-outlook-fill')) {
                map.removeLayer('day1-convective-outlook-fill');
            }
            if (map.getLayer('day1-convective-outlook-border')) {
                map.removeLayer('day1-convective-outlook-border');
            }
            if (map.getSource('day1-convective-outlook-source')) {
                map.removeSource('day1-convective-outlook-source');
            }
            break;
        case 'day1_tornado_outlook':
            if (map.getLayer('day1-tornado-outlook-fill')) {
                map.removeLayer('day1-tornado-outlook-fill');
            }
            if (map.getLayer('day1-tornado-outlook-border')) {
                map.removeLayer('day1-tornado-outlook-border');
            }
            if (map.getSource('day1-tornado-outlook-source')) {
                map.removeSource('day1-tornado-outlook-source');
            }
            break;
        case 'day1_wind_outlook':
            if (map.getLayer('day1-wind-outlook-fill')) {
                map.removeLayer('day1-wind-outlook-fill');
            }
            if (map.getLayer('day1-wind-outlook-border')) {
                map.removeLayer('day1-wind-outlook-border');
            }
            if (map.getSource('day1-wind-outlook-source')) {
                map.removeSource('day1-wind-outlook-source');
            }
            break;
        case 'day1_hail_outlook':
            if (map.getLayer('day1-hail-outlook-fill')) {
                map.removeLayer('day1-hail-outlook-fill');
            }
            if (map.getLayer('day1-hail-outlook-border')) {
                map.removeLayer('day1-hail-outlook-border');
            }
            if (map.getSource('day1-hail-outlook-source')) {
                map.removeSource('day1-hail-outlook-source');
            }
            break;
        case 'day2_convective_outlook':
            if (map.getLayer('day2-convective-outlook-fill')) {
                map.removeLayer('day2-convective-outlook-fill');
            }
            if (map.getLayer('day2-convective-outlook-border')) {
                map.removeLayer('day2-convective-outlook-border');
            }
            if (map.getSource('day2-convective-outlook-source')) {
                map.removeSource('day2-convective-outlook-source');
            }
            break;
        case 'day2_tornado_outlook':
            if (map.getLayer('day2-tornado-outlook-fill')) {
                map.removeLayer('day2-tornado-outlook-fill');
            }
            if (map.getLayer('day2-tornado-outlook-border')) {
                map.removeLayer('day2-tornado-outlook-border');
            }
            if (map.getSource('day2-tornado-outlook-source')) {
                map.removeSource('day2-tornado-outlook-source');
            }
            break;
        case 'day2_wind_outlook':
            if (map.getLayer('day2-wind-outlook-fill')) {
                map.removeLayer('day2-wind-outlook-fill');
            }
            if (map.getLayer('day2-wind-outlook-border')) {
                map.removeLayer('day2-wind-outlook-border');
            }
            if (map.getSource('day2-wind-outlook-source')) {
                map.removeSource('day2-wind-outlook-source');
            }
            break;
        case 'day2_hail_outlook':
            if (map.getLayer('day2-hail-outlook-fill')) {
                map.removeLayer('day2-hail-outlook-fill');
            }
            if (map.getLayer('day2-hail-outlook-border')) {
                map.removeLayer('day2-hail-outlook-border');
            }
            if (map.getSource('day2-hail-outlook-source')) {
                map.removeSource('day2-hail-outlook-source');
            }
            break;
        case 'day3_convective_outlook':
            if (map.getLayer('day3-convective-outlook-fill')) {
                map.removeLayer('day3-convective-outlook-fill');
            }
            if (map.getLayer('day3-convective-outlook-border')) {
                map.removeLayer('day3-convective-outlook-border');
            }
            if (map.getSource('day3-convective-outlook-source')) {
                map.removeSource('day3-convective-outlook-source');
            }
            break;
        case 'day3_probabilistic_outlook':
            if (map.getLayer('day3-probabilistic-outlook-fill')) {
                map.removeLayer('day3-probabilistic-outlook-fill');
            }
            if (map.getLayer('day3-probabilistic-outlook-border')) {
                map.removeLayer('day3-probabilistic-outlook-border');
            }
            if (map.getSource('day3-probabilistic-outlook-source')) {
                map.removeSource('day3-probabilistic-outlook-source');
            }
            break;
        case 'day4_probabilistic_outlook':
            if (map.getLayer('day4-probabilistic-outlook-fill')) {
                map.removeLayer('day4-probabilistic-outlook-fill');
            }
            if (map.getLayer('day4-probabilistic-outlook-border')) {
                map.removeLayer('day4-probabilistic-outlook-border');
            }
            if (map.getSource('day4-probabilistic-outlook-source')) {
                map.removeSource('day4-probabilistic-outlook-source');
            }
            break;
        case 'day5_probabilistic_outlook':
            if (map.getLayer('day5-probabilistic-outlook-fill')) {
                map.removeLayer('day5-probabilistic-outlook-fill');
            }
            if (map.getLayer('day5-probabilistic-outlook-border')) {
                map.removeLayer('day5-probabilistic-outlook-border');
            }
            if (map.getSource('day5-probabilistic-outlook-source')) {
                map.removeSource('day5-probabilistic-outlook-source');
            }
            break;
        case 'day6_probabilistic_outlook':
            if (map.getLayer('day6-probabilistic-outlook-fill')) {
                map.removeLayer('day6-probabilistic-outlook-fill');
            }
            if (map.getLayer('day6-probabilistic-outlook-border')) {
                map.removeLayer('day6-probabilistic-outlook-border');
            }
            if (map.getSource('day6-probabilistic-outlook-source')) {
                map.removeSource('day6-probabilistic-outlook-source');
            }
            break;
        case 'day7_probabilistic_outlook':
            if (map.getLayer('day7-probabilistic-outlook-fill')) {
                map.removeLayer('day7-probabilistic-outlook-fill');
            }
            if (map.getLayer('day7-probabilistic-outlook-border')) {
                map.removeLayer('day7-probabilistic-outlook-border');
            }
            if (map.getSource('day7-probabilistic-outlook-source')) {
                map.removeSource('day7-probabilistic-outlook-source');
            }
            break;
        case 'day8_probabilistic_outlook':
            if (map.getLayer('day8-probabilistic-outlook-fill')) {
                map.removeLayer('day8-probabilistic-outlook-fill');
            }
            if (map.getLayer('day8-probabilistic-outlook-border')) {
                map.removeLayer('day8-probabilistic-outlook-border');
            }
            if (map.getSource('day8-probabilistic-outlook-source')) {
                map.removeSource('day8-probabilistic-outlook-source');
            }
            break;
    }
    
    // Always remove the legend when removing a layer
    removeLegend();
}
// Create a custom event for map ready state
window.dispatchEvent(new Event('map_ready'));
    
    // Initialize toggles from localStorage
    function initializeOutlookToggles() {
        const toggles = [
            'day1_convective_outlook', 'day1_tornado_outlook', 'day1_wind_outlook', 'day1_hail_outlook',
            'day2_convective_outlook', 'day2_tornado_outlook', 'day2_wind_outlook', 'day2_hail_outlook',
            'day3_convective_outlook', 'day3_probabilistic_outlook',
            'day4_probabilistic_outlook', 'day5_probabilistic_outlook', 'day6_probabilistic_outlook',
            'day7_probabilistic_outlook', 'day8_probabilistic_outlook'
        ];
        
        let hasActiveToggle = false;
        
        toggles.forEach(id => {
            const toggle = document.getElementById(id);
            if (toggle) {
                const isEnabled = localStorage.getItem(id + 'Enabled') === 'true';
                if (isEnabled) hasActiveToggle = true;
                toggle.checked = isEnabled;
                updateToggleAppearance(toggle);
            }
        });
        
        // If none are active yet, initialize all as disabled in localStorage
        if (!hasActiveToggle) {
            toggles.forEach(id => {
                localStorage.setItem(id + 'Enabled', 'false');
            });
        }
    }
    
    // Initialize outlook layers on page load based on saved settings
    setTimeout(function() {
        // Check which outlook is enabled and load it
        const toggles = [
            'day1_convective_outlook', 'day1_tornado_outlook', 'day1_wind_outlook', 'day1_hail_outlook',
            'day2_convective_outlook', 'day2_tornado_outlook', 'day2_wind_outlook', 'day2_hail_outlook',
            'day3_convective_outlook', 'day3_probabilistic_outlook',
            'day4_probabilistic_outlook', 'day5_probabilistic_outlook', 'day6_probabilistic_outlook',
            'day7_probabilistic_outlook', 'day8_probabilistic_outlook'
        ];
        
        toggles.forEach(id => {
            if (localStorage.getItem(id + 'Enabled') === 'true') {
                loadOutlookLayer(id);
            }
        });
    }, 2000); // Small delay to ensure map is fully loaded
});





const iconMap = {   
    'rain-icon': 'https://i.ibb.co/SyTLmsD/IMG-8940.webp',
    'freezing-rain-icon': 'https://i.ibb.co/YdDyV5y/IMG-8944.webp',
    'drizzle-icon': 'https://i.ibb.co/sbxq9Xf/IMG-8951.webp',
    'freezing-drizzle-icon': 'https://i.ibb.co/YdDyV5y/IMG-8944.webp',
    'ice-pellets-icon': 'https://i.ibb.co/YdDyV5y/IMG-8944.webp',
    'snow-icon': 'https://i.ibb.co/qyGnQbP/IMG-8937.webp',
    'mixed-rain-snow-icon': 'https://i.ibb.co/HYhs7gR/IMG-8947.webp',
    'mixed-rain-ice-pellets-icon': 'https://i.ibb.co/LxpF01s/IMG-8942.webp',
    'mixed-ice-pellets-snow-icon': 'https://i.ibb.co/WVZWpQn/IMG-8941.webp',
    'mixed-freezing-rain-ice-pellets-icon': 'https://i.ibb.co/LxpF01s/IMG-8942.webp',
    'mixed-rain-ice-pellets-icon': 'https://i.ibb.co/LxpF01s/IMG-8942.webp',
    'downed-tree-icon': 'https://i.ibb.co/tbWjm7m/IMG-8955.webp',
    'frozen-pipes-icon': 'https://i.ibb.co/5WyW4Zs/IMG-8956.webp',
    'roof-collapse-icon': 'https://i.ibb.co/kqNdGmX/IMG-0856.webp',
    'school-dismissal-icon': 'https://i.ibb.co/XLm2ztp/IMG-8954.webp',
    'school-closure-icon': 'https://i.ibb.co/ZNM4jjr/IMG-8953.webp',
    'power-outage-icon': 'https://i.ibb.co/SRtxhLH/IMG-8968.webp',
    'road-closure-icon': 'https://i.ibb.co/hKWVH4B/IMG-8952.webp',
    'snow-grass-icon': 'https://i.ibb.co/qyGnQbP/IMG-8937.webp',
    'snow-roads-icon': 'https://i.ibb.co/qyGnQbP/IMG-8937.webp',
    'hail-icon': 'https://i.ibb.co/YdDyV5y/IMG-8944.webp',
    'lawn-damage-icon': 'https://i.ibb.co/7YqC1RB/IMG-8939.webp',
    'one-inch-tree-icon': 'https://i.ibb.co/7YqC1RB/IMG-8939.webp',
    'three-inch-tree-icon': 'https://i.ibb.co/K5HbBbB/IMG-8938.webp',
    'tree-uprooted-icon': 'https://i.ibb.co/K5HbBbB/IMG-8938.webp',
    'building-damage-icon': 'https://i.ibb.co/K5HbBbB/IMG-8938.webp',
    'flooding-icon': 'https://i.ibb.co/9bCFYbz/IMG-8959.webp',
    'street-flooding-icon': 'https://i.ibb.co/9bCFYbz/IMG-8959.webp',
    'homes-flooded-icon': 'https://i.ibb.co/qJwfpXk/IMG-8958.webp',
    'homes-swept-away-icon': 'https://i.ibb.co/qJwfpXk/IMG-8958.webp',
    'mudslide-icon': 'https://i.ibb.co/NLcCKxD/IMG-8957.webp',
    'dense-fog-icon': 'https://i.ibb.co/7zZYS9Y/IMG-8949.webp',
    'blowing-dust-icon': 'https://i.ibb.co/sHSW3yk/IMG-8974.webp',
    'blowing-snow-icon': 'https://i.ibb.co/x3RXpD9/IMG-8946.webp',
    'snow-squall-icon': 'https://i.ibb.co/x3RXpD9/IMG-8946.webp',
    'smoke-icon': 'https://i.ibb.co/7zZYS9Y/IMG-8949.webp',
    'default-icon': ''
};

const iconKeywords = new Map([
    ['rain', 'rain-icon'],
    ['freezing rain', 'freezing-rain-icon'],
    ['drizzle', 'drizzle-icon'],
    ['freezing drizzle', 'freezing-drizzle-icon'],
    ['ice pellets/sleet', 'ice-pellets-icon'],
    ['snow and/or graupel', 'snow-icon'],
    ['mixed rain and snow', 'mixed-rain-snow-icon'],
    ['mixed rain and ice pellets', 'mixed-rain-ice-pellets-icon'],
    ['mixed ice pellets and snow', 'mixed-ice-pellets-snow-icon'],
    ['mixed freezing rain and ice pellets', 'mixed-freezing-rain-ice-pellets-icon'],
    ['downed tree limbs or', 'downed-tree-icon'],
    ['burst water pipes', 'frozen-pipes-icon'],
    ['structrual collapse', 'roof-collapse-icon'],
    ['early dismissal', 'school-dismissal-icon'],
    ['business closure', 'school-closure-icon'],
    ['internet outage', 'power-outage-icon'],
    ['road closure', 'road-closure-icon'],
    ['icy sidewalks,', 'icy-roads-icon'],
    ['only on grass', 'snow-grass-icon'],
    ['snow accumulating on roads', 'snow-roads-icon'],
    ['in.)', 'hail-icon'],
    ['trash cans', 'lawn-damage-icon'],
    ['1-inch tree', 'one-inch-tree-icon'],
    ['3-inch tree', 'three-inch-tree-icon'],
    ['trees uprooted', 'tree-uprooted-icon'],
    ['homes/buildings', 'building-damage-icon'],
    ['river/creek overflowing;', 'flooding-icon'],
    ['street/road closed;', 'street-flooding-icon'],
    ['filled with water', 'homes-flooded-icon'],
    ['swept away', 'homes-swept-away-icon'],
    ['mudslide', 'mudslide-icon'],
    ['dense fog', 'dense-fog-icon'],
    ['blowing dust/sand', 'blowing-dust-icon'],
    ['blowing snow', 'blowing-snow-icon'],
    ['snow squall', 'snow-squall-icon'],
    ['smoke', 'smoke-icon']
]);

function determineIcon(descText) {
    const lower = (descText || '').toLowerCase();
    for (const [keyword, icon] of iconKeywords.entries()) {
        if (lower.includes(keyword)) {
            return icon;
        }
    }
    return 'default-icon';
}


// 3) A helper function to load all icons into the map style.
function loadIcons(map, callback) {
    const entries = Object.entries(iconMap);
    let loadedCount = 0;

    entries.forEach(([iconName, iconUrl]) => {
        map.loadImage(iconUrl, (error, image) => {
            if (!error && image) {
                map.addImage(iconName, image);
            } else {
                console.error('Failed to load icon:', iconName, iconUrl, error);
            }
            loadedCount++;
            if (loadedCount === entries.length && typeof callback === 'function') {
                callback();
            }
        });
    });
}

// 4) Global references
var descriptionMap;
var reportGeoJSON;

map.on('load', function() {
    // Fetch the menu data and report data
    Promise.all([fetchMenuData(), fetchReportData()])
        .then(([descMap, reportData]) => {
            descriptionMap = descMap;

            // Create GeoJSON data from the fetched reports
            reportGeoJSON = createGeoJSON(reportData);

            // Check if mPING reports are enabled.
            // If not, override the GeoJSON with an empty FeatureCollection.
            if (localStorage.getItem("mpingReportsEnabled") !== "true") {
                reportGeoJSON = {
                    type: 'FeatureCollection',
                    features: []
                };
            }

            // Add the GeoJSON source to the map
            map.addSource('mping-reports', {
                type: 'geojson',
                data: reportGeoJSON
            });

// === Load icons, then add the symbol layer. ===
loadIcons(map, function() {
    // Once icons are loaded, add the symbol layer
    map.addLayer({
        id: 'mping-reports-layer',
        type: 'symbol',
        source: 'mping-reports',
        layout: {
            // Use the 'icon' property from each feature
            'icon-image': ['get', 'icon'],
            'icon-size': 0.045,
            'icon-anchor': 'center',
            'icon-allow-overlap': true
        }
    });
});

            // Click event to show popup (AnimatedPopup)
            map.on('click', 'mping-reports-layer', function (e) {
                const coordinates = e.features[0].geometry.coordinates.slice();
                const properties = e.features[0].properties;
                
                
// Example usage: Call removePopups() when needed
removePopups();

                // Get description information
                const descriptionId = parseInt(properties.description_id);
                const descriptionInfo = descriptionMap[descriptionId];

                // Format the observation time
                const formattedTime = new Intl.DateTimeFormat('en-US', {
                    month: '2-digit',
                    day: '2-digit',
                    year: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: 'America/New_York',
                    timeZoneName: 'short'
                }).format(new Date(properties.obtime));

                const descriptionSection = descriptionInfo?.name !== 'NULL'
                    ? `<strong>Description:</strong> ${descriptionInfo?.name || 'Unknown'}<br>`
                    : '';

                const popupContent = `
                    <div style="
                        font-size: 14px; 
                        color: white; 
                        line-height: 1.5; 
                        max-width: 207px; 
                        border-radius: 8px; 
                        padding: 8px; 
                        overflow: hidden !important; 
                        white-space: normal !important;
                        max-height: 100%; 
                        height: auto;
                        display: block;
                        -webkit-overflow-scrolling: none !important;
                        scrollbar-width: none !important;
                        -ms-overflow-style: none !important; 
                        touch-action: none !important; 
                        pointer-events: auto; 
                        word-wrap: break-word; 
                        position: relative;
                    " onwheel="return false;" onscroll="return false;" ontouchmove="return false;">
                        <div style="display: flex; align-items: center; margin-bottom: 10px;">
                            <img src="https://i.ibb.co/1ZMYr5f/8246f7f64d873cd2d82ddc86294dc95f.webp"
                                 style="width: 45px; height: 45px; margin-right: 8px; border-radius: 8px; flex-shrink: 0;">
                            <div style="text-align: left; flex: 1; padding-left: 8px;">
                                <strong style="font-size: 18px;">mPING Report</strong>
                            </div>
                        </div>
                        <div style="
                            text-align: left; 
                            overflow: hidden !important; 
                            white-space: normal !important;
                            pointer-events: auto; 
                            word-wrap: break-word; 
                            max-height: none !important;
                            position: relative;
                        ">
                            <strong>Category:</strong> ${descriptionInfo?.category || 'Unknown'}<br>
                            ${descriptionSection}
                            <strong>Time:</strong> ${formattedTime || 'Unknown'}
                        </div>
                    </div>
                `;

                new AnimatedPopup({
                    closeButton: false,
                    anchor: 'bottom',
                    offset: [0, 0],
                    openingAnimation: {
                        duration: 300,
                        easing: 'easeInOutExpo',
                        transform: 'scale'
                    },
                    closingAnimation: {
                        duration: 300,
                        easing: 'easeInOutExpo',
                        transform: 'scale'
                    }
                })
                    .setLngLat(coordinates)
                    .setHTML(popupContent)
                    .addTo(map);
            });

            // Cursor styling for hover
            map.on('mouseenter', 'mping-reports-layer', function() {
                map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', 'mping-reports-layer', function() {
                map.getCanvas().style.cursor = '';
            });

            // Start the data refresh interval
            setInterval(refreshData, 8000);
        })
        .catch(error => {
            console.error('Error:', error);
        });
});


// 6) fetchMenuData (unchanged except for your key)
function fetchMenuData() {
    return fetch('https://mping.ou.edu/mping/api/v2/menu', {
        headers: {
            'Accept': 'application/json',
            'Authorization': 'Token YOUR_API_KEY_HERE'
        }
    })
    .then(response => response.json())
    .then(menuData => {
        var descriptionMap = {};
        menuData.results.forEach(category => {
            category.descriptions.forEach(description => {
                descriptionMap[description.id] = {
                    name: description.name,
                    category: category.name
                };
            });
        });
        return descriptionMap;
    });
}

// 7) fetchReportData (unchanged except for your key)
function fetchReportData() {
    var now = new Date();
    var twoHoursAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);

    function formatDate(date) {
        var yyyy = date.getUTCFullYear();
        var mm = ('0' + (date.getUTCMonth() + 1)).slice(-2);
        var dd = ('0' + date.getUTCDate()).slice(-2);
        var HH = ('0' + date.getUTCHours()).slice(-2);
        var MM = ('0' + date.getUTCMinutes()).slice(-2);
        var SS = ('0' + date.getUTCSeconds()).slice(-2);
        return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}`;
    }

    var endTime = formatDate(now);
    var startTime = formatDate(twoHoursAgo);

    var endTimeEncoded = encodeURIComponent(endTime);
    var startTimeEncoded = encodeURIComponent(startTime);

    var url = `https://mping.ou.edu/mping/api/v2/reports?obtime_gte=${startTimeEncoded}&obtime_lte=${endTimeEncoded}`;

    return fetch(url, {
        headers: {
            'Accept': 'application/json',
            'Authorization': 'Token bf3fb5c7518524226228e436808dfdf75e6e1a11'
        }
    })
    .then(response => response.json());
}

function createGeoJSON(reportData) {
    var features = reportData.results
        .map(report => {
            const descId = report.description_id;
            const descInfo = descriptionMap[descId] || {};
            const descName = descInfo.name || '';
            const categoryName = descInfo.category || '';

            // Exclude if the category is "None"
            if (categoryName === 'None') {
                return null;
            }

            // Check for "mudslide" and "hail" in the category and assign specific icons
            let iconKey;
            if (categoryName.toLowerCase().includes('mudslide')) {
                iconKey = 'mudslide-icon';
            } else if (categoryName.toLowerCase().includes('hail')) {
                iconKey = 'hail-icon';
            } else {
                // Determine icon based on description text
                iconKey = determineIcon(descName);
            }

            return {
                type: 'Feature',
                geometry: report.geom,
                properties: {
                    description_id: descId,
                    obtime: report.obtime,
                    id: report.id,
                    icon: iconKey
                }
            };
        })
        .filter(feature => feature !== null);

    return {
        type: 'FeatureCollection',
        features: features
    };
}

setInterval(() => {
    if (localStorage.getItem("mpingReportsEnabled") !== "true") {
        if (map.getSource('mping-reports')) {
            map.getSource('mping-reports').setData({
                type: 'FeatureCollection',
                features: []
            });
        }
        return;
    }
    fetchReportData()
        .then(reportData => {
            reportGeoJSON = createGeoJSON(reportData);
            if (map.getSource('mping-reports')) {
                map.getSource('mping-reports').setData(reportGeoJSON);
            }
        })
        .catch(error => console.error('Error refreshing data:', error));
}, 30000);


function refreshData() {
    // If mPING reports are not enabled, clear the data source and exit.
    if (localStorage.getItem("mpingReportsEnabled") !== "true") {
        if (map.getSource('mping-reports')) {
            map.getSource('mping-reports').setData({
                type: 'FeatureCollection',
                features: []
            });
        }
        return;
    }
    
    // Otherwise, fetch and update the mPING report data as usual.
    fetchReportData()
        .then(reportData => {
            // Rebuild the GeoJSON so new features also get the correct .icon
            reportGeoJSON = createGeoJSON(reportData);
            // Update the data source if it exists
            if (map.getSource('mping-reports')) {
                map.getSource('mping-reports').setData(reportGeoJSON);
            }
        })
        .catch(error => {
            console.error('Error refreshing data:', error);
        });
}


// Track Lightning Strike Layer Visibility
let lightningVisible = localStorage.getItem("lightningVisible") === "true";

function isInCONUS(lon, lat) {
  // Basic north-south check
  if (lat < 24 || lat > 50) return false;
  // Basic west boundary
  if (lon < -125) return false;

  // Get the maximum allowed longitude for this latitude
  const maxLon = getMaxLonForLat(lat);
  if (maxLon === null) return false;

  // Keep the point if it's west of or on that line
  return lon <= maxLon;
}

/**
 * Returns the maximum allowed longitude for a given latitude,
 * using a piecewise linear approach:
 *
 * Segment 1: lat=24..35 => boundary from -80 (at lat=24) to -75 (at lat=35)
 * Segment 2: lat=35..50 => boundary from -75 (at lat=35) to -68 (at lat=50)
 */
function getMaxLonForLat(lat) {
  // Segment 1
  if (lat >= 24 && lat <= 35) {
    const lat1 = 24, lat2 = 35;
    const lon1 = -80, lon2 = -75;
    return interpolate(lat, lat1, lat2, lon1, lon2);
  }

  // Segment 2
  if (lat > 35 && lat <= 50) {
    const lat1 = 35, lat2 = 50;
    const lon1 = -75, lon2 = -68;
    return interpolate(lat, lat1, lat2, lon1, lon2);
  }

  return null;
}


/**
 * Linearly interpolates longitude for the given lat,
 * clamped between lat1 and lat2.
 */
function interpolate(lat, lat1, lat2, lon1, lon2) {
  // Clamp lat
  const clampedLat = Math.max(lat1, Math.min(lat2, lat));
  // 0..1 interpolation factor
  const t = (clampedLat - lat1) / (lat2 - lat1);
  return lon1 + t * (lon2 - lon1);
}

// Opacity function over a full hour (in minutes)
function calculateOpacity(now, strikeTime) {
  let ageInMinutes = Math.floor((now - strikeTime) / 60000);
  if (ageInMinutes < 3) return 1.0;
  else if (ageInMinutes < 7.5) return 0.75;
  else if (ageInMinutes < 12) return 0.5;
  else if (ageInMinutes < 16) return 0.3;
  return 0;
}

// Format a timestamp to include the full date and time (e.g. "2/27/2025, 8:24:39 PM")
function formatLightningTimestamp(timestamp) {
  if (!timestamp) return "Unknown Time";
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: true
  });
}

// Map raw strike type to a human-readable label (without emojis)
function getStrikeTypeLabel(type) {
  const typeMap = {
    "cloud-to-ground": "Cloud to Ground",
    "negative-cloud-to-ground": "Cloud to Ground",
    "in-cloud": "Intra-Cloud"
  };
  return typeMap[type] || "Unknown";
}

// Format intensity into a qualitative description without showing the number.
function formatIntensity(value) {
  if (value == null) return "N/A";
  const absValue = Math.abs(value);
  if (absValue < 2) return "Very Low";
  else if (absValue < 10) return "Low";
  else if (absValue < 25) return "Moderate";
  else if (absValue < 45) return "High";
  else if (absValue < 60) return "Very High";
  else return "Extreme";
}

// Determine the charge based on the intensity value.
function getCharge(value) {
  if (value == null) return "N/A";
  return (value < 0) ? "Negative" : "Positive";
}

async function fetchAllFeatures(queryURL) {
  let allFeatures = [];
  let offset = 0;
  const recordCount = 2000;
  let done = false;
  while (!done) {
    const url = queryURL + `&resultOffset=${offset}&resultRecordCount=${recordCount}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.features && data.features.length > 0) {
      allFeatures = allFeatures.concat(data.features);
      if (data.features.length < recordCount) {
        done = true;
      } else {
        offset += recordCount;
      }
    } else {
      done = true;
    }
  }
  // Update the lightning layer once with all features at once
  updateLightningLayer(allFeatures);
  return allFeatures;
}

// Updates the lightning layer source with new data
function updateLightningLayer(featuresRaw) {
  const now = Date.now();
  const features = featuresRaw.map(strike => {
    const strikeTime = new Date(strike.properties.ts).getTime();
    const ageInMinutes = (now - strikeTime) / 60000;
    // Filter out strikes older than 30 minutes
    if (ageInMinutes >= 15) return null;
    const lon = strike.properties.lon;
    const lat = strike.properties.lat;
    // Only include strikes in CONUS
    if (!isInCONUS(lon, lat)) return null;
    const opacity = calculateOpacity(now, strikeTime);
    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [lon, lat]
      },
      properties: {
        time: formatLightningTimestamp(strike.properties.ts),
        strikeType: getStrikeTypeLabel(strike.properties.type),
        intensity: formatIntensity(strike.properties.intensity),
        charge: getCharge(strike.properties.intensity),
        opacity: opacity
      }
    };
  }).filter(feature => feature !== null);

  const sourceData = {
    type: "FeatureCollection",
    features: features
  };

  if (map.getSource('lightning-strikes')) {
    map.getSource('lightning-strikes').setData(sourceData);
  } else {
    map.addSource('lightning-strikes', {
      type: 'geojson',
      data: sourceData
    });

    // Load the marker image (size 0.024)
    map.loadImage('https://i.ibb.co/qtPs16w/IMG-2440.webp', (error, image) => {
      if (error) throw error;
      map.addImage('lightning-icon', image);
    });

    // Add the lightning strike layer with minzoom 7
    map.addLayer({
      id: 'lightning-icon-layer',
      type: 'symbol',
      source: 'lightning-strikes',
      minzoom: 7.5,
      layout: {
        'icon-image': 'lightning-icon',
        'icon-size': 0.024,
        'icon-anchor': 'center',
        'visibility': lightningVisible ? 'visible' : 'none',
        'icon-allow-overlap': false
      },
      paint: {
        'icon-opacity': ['get', 'opacity']
      }
    });

    // Animated popup on click (no offset)
    map.on('click', 'lightning-icon-layer', function (e) {
      removePopups(); // Ensure you have a removePopups function defined elsewhere
      const props = e.features[0].properties;
      const popupContent = `
        <div style="font-size: 14px; color: white; line-height: 1.5; background: #14111F; border-radius: 8px; padding: 10px; width: 200px;">
          <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <img src="https://i.ibb.co/prQpQgs/IMG-5739.png" style="width: 45px; height: 45px; margin-right: 10px;" />
            <strong style="font-size: 18px; color: #FFFFFF;">Lightning Strike</strong>
          </div>
          <b>Time:</b> ${props.time}<br>
          <b>Strike Type:</b> ${props.strikeType}<br>
          <b>Charge:</b> ${props.charge}<br>
          <b>Intensity:</b> ${props.intensity}<br>
        </div>
      `;
      new AnimatedPopup({
        closeButton: false,
        anchor: 'bottom',
        openingAnimation: {
          duration: 300,
          easing: 'easeInOutExpo',
          transform: 'scale'
        },
        closingAnimation: {
          duration: 300,
          easing: 'easeInOutExpo',
          transform: 'scale'
        }
      })
        .setLngLat(e.features[0].geometry.coordinates)
        .setHTML(popupContent)
        .addTo(map);
    });

    map.on('mouseenter', 'lightning-icon-layer', function () {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'lightning-icon-layer', function () {
      map.getCanvas().style.cursor = '';
    });
  }
}

// Fetch and display lightning strikes (only CONUS strikes from the past 30 minutes)
// The query now uses server-side filtering for faster results.
async function loadLightningLayer() {
  const thirtyMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
const baseURL = 'https://utility.arcgis.com/usrsvcs/servers/df6eac2461454bae9a33a2d12363996f/rest/services/text/Live_Lightning_Strikes/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson';


  try {
    await fetchAllFeatures(baseURL);
  } catch (error) {
    console.error('Error loading lightning data:', error);
  }
}

// Initial load if layer is visible
if (lightningVisible) {
  loadLightningLayer();
}

// Modified interval timing - changed from 30000ms (30 seconds) to 5000ms (5 seconds)
lightningVisible && loadLightningLayer(),
    setInterval(() => {
        lightningVisible && loadLightningLayer();
    }, 5000),
    document.addEventListener("DOMContentLoaded", function() {
        const e = document.getElementById("lightning-strikes-toggle"),
            t = e.querySelector(".menu-item-check");
        (t.style.display = lightningVisible ? "block" : "none"),
        e.addEventListener("click", function(e) {
            e.stopPropagation(),
                (lightningVisible = !lightningVisible),
                localStorage.setItem("lightningVisible", lightningVisible),
                (t.style.display = lightningVisible ? "block" : "none"),
                map.getLayer("lightning-icon-layer") && map.setLayoutProperty("lightning-icon-layer", "visibility", lightningVisible ? "visible" : "none"),
                lightningVisible && loadLightningLayer();
        });
    });


function setMarkerVisibility(e) {
    (markersVisible = e),
    Object.keys(radarStations).forEach((t) => {
            const n = radarStations[t];
            n.marker && (n.marker.getElement().style.display = e ? "" : "none");
        }),
        weatherRadioMarkers.forEach((t) => {
            t.getElement().style.display = e ? "none" : "";
        }),
        map.getLayer("spotters-layer") && map.setLayoutProperty("spotters-layer", "visibility", e ? "none" : "visible");
    const t = document.getElementById("toggle-markers");
    e ? ((t.style.border = ""), (t.style.backgroundColor = ""), (t.style.color = "")) : ((t.style.border = "2px solid white"), (t.style.backgroundColor = "#636381"), (t.style.color = "white"));
}
