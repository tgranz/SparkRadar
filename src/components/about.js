import Dialog from "../js/ui/dialog.js";

export default function openAbout() {
    const aboutContent = `
        <style>
            .about-tabs {
                display: flex;
                gap: 8px;
                margin-bottom: 14px;
                border-bottom: 1px solid var(--border-color);
                padding-bottom: 10px;
            }

            .about-tab {
                border: 1px solid var(--secondary-border-color);
                background: rgba(0, 0, 0, 0.25);
                color: rgba(255, 255, 255, 0.8);
                border-radius: 100px;
                padding: 6px 14px;
                font-size: 0.9em;
                font-weight: 600;
                cursor: pointer;
                transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;
                width: 100%;
            }

            .about-tab:hover {
                border-color: var(--primary-color);
                color: white;
            }

            .about-tab.about-tab-active {
                border-color: var(--primary-color);
                background: rgba(39, 190, 255, 0.2);
                color: white;
            }

            .about-panel {
                display: none;
            }

            .about-panel.about-panel-active {
                display: block;
            }
        </style>

        <div class="about-tabs" role="tablist" aria-label="About sections">
            <button class="about-tab about-tab-active" id="about-tab-general" role="tab" aria-selected="true" aria-controls="about-panel-general" data-panel="general">General</button>
            <button class="about-tab" id="about-tab-map" role="tab" aria-selected="false" aria-controls="about-panel-map" data-panel="map">Map</button>
            <button class="about-tab" id="about-tab-data" role="tab" aria-selected="false" aria-controls="about-panel-data" data-panel="data">Data</button>
        </div>

        <div class="about-panel about-panel-active" id="about-panel-general" role="tabpanel" aria-labelledby="about-tab-general">
            <p style="margin-bottom: 10px;"><strong>SparkRadar</strong> is a 100% free, open-source, advanced weather radar visualization app that runs in your browser. Because everyone experiences weather. Knowing what's coming shouldn't be a mystery.</p>
            <p style="margin-bottom: 10px;">SparkRadar is on its <strong>third rewrite</strong> since development started in 2024. Every version is open source on <a href="https://github.com/tgranz/sparkradar">GitHub</a>.</p>
            <p>SparkRadar focuses on ease of use, a simple yet beautiful interface, and privacy. The only tracker on this website is the anonymous, privacy-first Simple Analytics.</p>
            <div class="badge-container" style="display: flex; justify-content: space-around; flex-direction: row; align-items: center; margin-top: 20px; width: 100%; flex-wrap: wrap;">
                <div style="background-color: #fff5ec; color: #F6821F; font-size: 14px; padding: 4px; border-radius: 10px;">
                    <p style="margin-bottom: 0px; font-weight: bold; text-align: center;">Secured by</p>
                    <img src="https://cdn.brandfetch.io/idJ3Cg8ymG/theme/dark/logo.svg?c=1bxid64Mup7aczewSAYMX&amp;t=1667589504295" alt="Cloudflare" style="height: 45px; width: auto; margin-right: 0px; vertical-align: middle;">
                </div>

                <a href="https://dashboard.simpleanalytics.com/sparkradar.app?utm_source=sparkradar.app&utm_content=badge&affiliate=vatip-vib" referrerpolicy="origin" target="_blank">
                    <picture>
                        <img id="simpleanalytics-badge" src="https://simpleanalyticsbadges.com/sparkradar.app?mode=dark&radius=10" loading="lazy" referrerpolicy="no-referrer" crossorigin="anonymous" />
                    </picture>
                </a>

                <div>
                    <p id="active-users" style="margin-bottom: 0px; font-weight: bold; text-align: center;">0</p>
                    <p style="margin-bottom: 0px; font-weight: bold; text-align: center;">Live Users</p>
                </div>
            </div>
        </div>

        <div class="about-panel" id="about-panel-map" role="tabpanel" aria-labelledby="about-tab-map">
            <p>Map styling provided by &copy; <a href="https://openfreemap.org/" target="_blank">OpenFreeMap</a></p>
            <p>Tiling from <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> with map data from <a href="https://openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>.</p>
        </div>

        <div class="about-panel" id="about-panel-data" role="tabpanel" aria-labelledby="about-tab-data">
            <h2 style="margin-left: 10px; margin-bottom: 5px; text-align: left; width: 100%;">Sources</h2>
            <p style="margin-bottom: 10px;"><strong>Radar</strong> comes from the <a href="https://registry.opendata.aws/noaa-nexrad/">NEXRAD on AWS</a> which provides real-time raw radar binary files.</p>
            <p style="margin-bottom: 10px;"><strong>Alerts</strong> come from the <a href="https://www.weather.gov/nwws/" target="_blank">NOAA Weather Wire Service (NWWS)</a> over networking, run by <a href="https://github.com/tgranz/sparkalerts" target="_blank">SparkAlerts</a>.</p>
            <p style="margin-bottom: 10px;"><strong>SPC Outlooks</strong> come from the <a href="https://www.spc.noaa.gov/products/outlook" target="_blank">Storm Prediction Center (SPC)</a> in GeoJSON format.</p>
            <p style="margin-bottom: 10px;"><strong>TVS and Hail centers</strong> come from the <a href="https://mesonet.agron.iastate.edu/cgi-bin/request/gis/nexrad_storm_attrs.py?help" target="_blank">Iowa Environmental Mesonet</a>.</p>
            <p style="margin-bottom: 10px;"><strong>Mesoscale Discussions</strong> come from the <a href="https://mesonet.agron.iastate.edu/cgi-bin/request/gis/spc_mcd.py?help" target="_blank">Iowa Environmental Mesonet</a>.</p>
            <p style="margin-bottom: 30px;"><strong>Watches</strong> come from the <a href="https://mesonet.agron.iastate.edu/cgi-bin/request/gis/spc_watch.py?help" target="_blank">Iowa Environmental Mesonet</a>.</p>
 
            <h2 style="margin-left: 10px; margin-bottom: 5px; text-align: left; width: 100%;">Cool people</h2>
            <p style="margin-bottom: 10px;"><strong>Matt Walsh</strong> for his <a href="https://github.com/netbymatt/nexrad-level-2-data" target="_blank">nexrad-level-2-data</a> and <a href="https://github.com/netbymatt/nexrad-level-3-data" target="_blank">nexrad-level-3-data</a> modules which have been integrated into SparkRadar and largely provide the processing algorithms for the NEXRAD binary files.</p>
            <p style="margin-bottom: 10px;"><strong><a href="https://github.com/dpaulat" target="_blank">Dan Paulat</a></strong> and <strong><a href="https://github.com/CGray1234/" target="_blank">CGray09</a></strong> for help on some radar subjects.</p>
        </div>
    `;

    const dialog = new Dialog('About SparkRadar', 'info-circle', aboutContent);

    const activeUsersEl = dialog.content?.querySelector('#active-users');
    if (!activeUsersEl) {
        return;
    }

    const tabs = dialog.content.querySelectorAll('.about-tab');
    const panels = dialog.content.querySelectorAll('.about-panel');
    const setActivePanel = (panelKey) => {
        tabs.forEach((tab) => {
            const isActive = tab.dataset.panel === panelKey;
            tab.classList.toggle('about-tab-active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        panels.forEach((panel) => {
            const isActive = panel.id === `about-panel-${panelKey}`;
            panel.classList.toggle('about-panel-active', isActive);
        });
    };

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            setActivePanel(tab.dataset.panel);
        });
    });

    const updateActiveUsers = async () => {
        try {
            const response = await fetch('https://api.sparkradar.app/connections');
            const data = await response.json();
            const count = typeof data?.count === 'number' ? data.count : 0;
            activeUsersEl.textContent = String(count);
        } catch {
            activeUsersEl.textContent = '0';
        }
    };

    updateActiveUsers();
    const activeUsersInterval = setInterval(updateActiveUsers, 30000);

    const originalClose = dialog.close.bind(dialog);
    dialog.close = () => {
        clearInterval(activeUsersInterval);
        originalClose();
    };
}