const entries = [
    {
        version : "1.8.0",
        date: "May 5, 2026",
        changes: [
            {
                text: "Storm motion vectors: Show the mot...loc information for alerts that support this information. Can be turned on and off in settings > alerts.",
                type: "new"
            },
            {
                text: "Alert thickness setting: Customize the thickness of alert polygons. Can be adjusted in settings > alerts.",
                type: "new"
            },
            {
                text: "Weather Radios: Listen to NOAA Weather Radio streams provided by GWES WeatherRadio. Turn them on in the layer menu.",
                type: "new"
            },
            {
                text: "Improved L2 ChunkLoader algorithm as well as application loading speed.",
                type: "enhancement"
            },
            {
                text: "Traffic cameras now available in Maryland and Oregon.",
                type: "enhancement"
            },
            {
                text: "New icons for radios, traffic cameras, and storm reports.",
                type: "enhancement"
            },
        ]
    },
    {
        version : "1.7.0",
        date: "April 27, 2026",
        changes: [
            {
                text: "Velocity dealiasing for Level-II velocity based on AtticRadar's region-based algorithm. Can be turned on and off in settings > radar.",
                type: "new"
            },
            {
                text: "Traffic cameras: Only available in Kansas currently with more states coming soon. Thanks @cool123bmd for the camera data.",
                type: "new"
            },
            {
                text: "Alert update notifications and new alert notifications can now be customized separately.",
                type: "new"
            },
            {
                text: "More tilt options for L3 products. This is also reflected in cross-section.",
                type: "enhancement"
            },
            {
                text: "Inspector tool updates with map movements rather than every 500ms.",
                type: "enhancement"
            },
            {
                text: "Switch to improved gap detection algorithm for Level-II chunks to find the latest rolling volume scan ID.",
                type: "bugfix"
            }
        ]
    },
    {
        version : "1.6.3",
        date: "April 24, 2026",
        changes: [
            {
                text: "Add support for application announcements.",
                type: "new"
            },
            {
                text: "Update tornado tags for alerts, now shows \"dangerous\" or \"deadly\" for PDS tornadoes and tornado emergencies respectively.",
                type: "enhancement"
            }
        ]
    },
    {
        version : "1.6.2",
        date: "April 23, 2026",
        changes: [
            {
                text: "Resolve alert SSE stream + notification issues.",
                type: "bugfix"
            },
        ]
    },
    {
        version : "1.6.1",
        date: "April 23, 2026",
        changes: [
            {
                text: "Radar Stations Toggle: Turn radar stations on or off from the toolbar.",
                type: "new"
            },
            {
                text: "Migrate to looking for a volume scan ID gap for L2 instead of the L2ChunkAPI. Thanks to Aden Koperczak for this idea.",
                type: "enhancement"
            },
            {
                text: "Fix alerts such that cancellation messages are ignored when looking for alert properties.",
                type: "bugfix"
            },
        ]
    },
    {
        version : "1.6.0",
        date: "April 16, 2026",
        changes: [
            {
                text: "Alert category counts: See the active alert count for each type of alert.",
                type: "new"
            },
            {
                text: "Add setting to adjust how long an alert is considered \"new\" or \"updated\" and a setting to adjust UI border-radius.",
                type: "enhancement"
            },
            {
                text: "Enhance and optomize application loading.",
                type: "enhancement"
            },
            {
                text: "Run another update after load to ensure all layers have loaded.",
                type: "enhancement"
            },
            {
                text: "Update alert priorities and order.",
                type: "enhancement"
            },
            {
                text: "Change radar product selection text when using a shortcut to change the radar product. Thanks to @manthatssocool.",
                type: "bugfix"
            },
        ]
    },
    {
        version : "1.5.2",
        date: "April 14, 2026",
        changes: [
            {
                text: "Add upgrade/update notifications for alerts.",
                type: "enhancement"
            },
            {
                text: "Adjust volume of notification sounds.",
                type: "enhancement"
            },
        ]
    },
    {
        version : "1.5.1",
        date: "April 13, 2026",
        changes: [
            {
                text: "Spotter Network Reports (BETA): Toggle them on in the layer menu.",
                type: "new"
            },
            {
                text: "Fix mesoscale discussions occasionally not hiding when turned off.",
                type: "bugfix"
            },
            {
                text: "Make links not clickable in watch and mesoscale discussion dialogs.",
                type: "bugfix"
            },
            {
                text: "Add setting to enable/disable right-click menu on the map.",
                type: "enhancement"
            },
            {
                text: "Adjust tornado probability color scale in mesoscale discussions.",
                type: "enhancement"
            },
        ]
    },
    {
        version : "1.5.0",
        date: "April 13, 2026",
        changes: [
            {
                text: "Changelog: view the changes in each update and show a notification when a new version is used for the first time.",
                type: "new"
            },
            {
                text: "Wildfires: Toggle them on in the layer menu.",
                type: "new"
            },
            {
                text: "Redesigned about menu + page views graph.",
                type: "new"
            },
            {
                text: "Fix L2 archive ZDR rendering. Thanks to @redbird2010.",
                type: "bugfix"
            },
            {
                text: "Fix searching for archives by date in the archive browser. Thanks to @redbird2010.",
                type: "bugfix"
            },
            {
                text: "Fix settings not updating without a page reload.",
                type: "bugfix"
            },
            {
                text: "Redesigned animate tool as well as other visual enhancements.",
                type: "enhancement"
            },
        ]
    }
];





import Notification from '../ui/notification.js';
import VERSION from '../../VERSION.js';
import Dialog from '../ui/dialog.js';

const styling = `
<style>
    .changelogtype {
        display: inline-block;
        padding: 2px 6px;
        border-radius: var(--roundness);
        margin-right: 5px;
        font-size: 0.75em;
        font-weight: bold;
    }

    .changelogtype-new {
        background: #27beff;
        color: black;
    }

    .changelogtype-bugfix {
        background: #ffcc00;
        color: black;
    }

    .changelogtype-enhancement {
        background: #00af00;
        color: black;
    }

    .changelog-entry {
        padding: 20px;
        border: 1px solid var(--border-color);
        border-radius: var(--roundness);
    }

    .changelog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
    }

    .changelog-entry h3 {
        color: var(--primary-color);
        font-size: 1em;
    }

    .latest {
        background-color: #00af00;
        color: black;
        font-size: 0.75em;
        padding: 2px 6px;
        border-radius: var(--roundness);
        margin-left: 10px;
    }

    .changelog-date {
        font-size: 0.85em;
        color: gray;
    }

    .changelog-entry ul {
        margin-left: 20px;
        list-style: disc;
    }

    .changelog-entry ul li:hover {
        margin-left: 0px;
        color: lightgray;
        cursor: default;
    }

    .changelog-entry li {
        margin-bottom: 10px;
        font-size: 0.9em;
        color: lightgray;
    }
</style>
`;

export class Changelog extends Dialog {    
    constructor() {
        var html = `
            ${styling}
        `;

        var isFirst = true;
        entries.forEach(entry => {
            html += `
                <div class="changelog-entry" style="margin-bottom: 20px;">
                    <div class="changelog-header">
                        <h3>v${entry.version} ${isFirst ? '<span class="latest">Latest</span>' : ''}</h3>
                        <span class="changelog-date">${entry.date}</span>
                    </div>
                    <ul>
                        ${entry.changes.map(change => `<li><span class="changelogtype changelogtype-${change.type}">${change.type.toUpperCase()}</span>${change.text}</li>`).join('')}
                    </ul>
                </div>`;

            isFirst = false;
        });

        super("Changelog", 'book', html, {}, true);
    }
}

export function checkVersion() {
    // Check if the user has not used the latest updated version, and ask if they would like to see the changelog
    const lastVersion = localStorage.getItem('lastVersion');
    console.log(`Last version: ${lastVersion}, Current version: ${VERSION}`);
    if (lastVersion !== VERSION) {
        localStorage.setItem('lastVersion', VERSION);
        window.addEventListener('load', () => {
            new Notification("SparkRadar has been updated", `You are using SparkRadar v${VERSION} for the first time.`, "info-circle", '#27beff', 20000,
            [
                {
                    label: 'View Changelog',
                    onClick: () => new Changelog()
                }
            ]);
        });
    }
}

export function buildLatestChangeElement() {
    const latestEntry = entries[0];

    return `
        ${styling}
        <div class="changelog-entry">
            <div class="changelog-header">
                <h3>v${latestEntry.version}</h3>
                <span class="changelog-date">${latestEntry.date}</span>
            </div>
            <ul>
                ${latestEntry.changes.map(change => `<li><span class="changelogtype changelogtype-${change.type}">${change.type.toUpperCase()}</span>${change.text}</li>`).join('')}
            </ul>
        </div>`;
}
