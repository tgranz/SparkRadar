import Dialog from "./dialog"
import { queryL2Archive } from "../../parse/fetch.js"

export default class ArchiveBrowser {
    constructor(callbacks) {

        const browserHtml = `
            <div style="display: flex; gap: 10px;flex-direction: row; justify-content: space-around; align-items: center;">
                <input type="date" id="archive-date-search" />
                <input type="text" id="archive-station-search" placeholder="Radar Station" />
                <button id="archive-search-button"><i class="ti ti-search"></i></button>
            </div>
            <div id="archive-file-list">
                Enter a date and radar station to search for archived Level 2 radar files.
            </div>
        `;

        this.dialog = new Dialog(
            'Archive Browser',
            'archive',
            browserHtml,
            {
                onClose: () => {
                    this.dialog = null;
                }
            }
        );

        document.getElementById('archive-search-button').addEventListener('click', () => {
            const date = document.getElementById('archive-date-search').value;
            const station = document.getElementById('archive-station-search').value.trim().toUpperCase();
            if (!date || !station) {
                alert('Please enter both a date and radar station.');
                return;
            }
            this.searchArchive(date, station);
        });

    }

    searchArchive(date, station) {
        const [year, month, day] = date.split('-');
        const prefix = `${year}/${month}/${day}/${station}`;
        document.getElementById('archive-file-list').innerHTML = '<div class="loader"></div>';
        queryL2Archive(prefix).then(results => {
            if (results.length === 0) {
                document.getElementById('archive-file-list').innerHTML = 'No files found for the specified date and station.';
                return;
            }
            const fileListHtml = results.map(r => {
                const fileName = r.url.split('/').pop();
                const stationCode = fileName.split('_')[0].slice(0, 4);
                return `<div class="archive-searchresult"><p>${new Date(r.dateTime).toLocaleString()}</p><button onclick="window.loadRadarFromArchive('${r.url}', '${stationCode}'); document.querySelector('.dialog-close').click();">${fileName}</button></div>`;
            }).join('');
            document.getElementById('archive-file-list').innerHTML = "<p style='margin-bottom: 10px;'>Results are in your timezone. Click to load:</p>" + fileListHtml;
        }).catch(err => {
            console.error(err);
            if (err.message.includes('No radar files found')) {
                document.getElementById('archive-file-list').innerHTML = 'No files found for the specified date and station.';
            } else {
                document.getElementById('archive-file-list').innerHTML = 'Error searching for files. Please try again later.';
            }
        });
    }
}