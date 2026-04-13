const entries = [
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
        border-radius: 10px;
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
        border-radius: 10px;
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
        background-color: var(--primary-color);
        color: black;
        font-size: 0.75em;
        padding: 2px 6px;
        border-radius: 10px;
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
                <div class="changelog-entry">
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
                <h3>v${latestEntry.version} <span class="latest">Latest</span></h3>
                <span class="changelog-date">${latestEntry.date}</span>
            </div>
            <ul>
                ${latestEntry.changes.map(change => `<li><span class="changelogtype changelogtype-${change.type}">${change.type.toUpperCase()}</span>${change.text}</li>`).join('')}
            </ul>
        </div>`;
}
