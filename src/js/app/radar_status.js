import Dialog from '../ui/dialog.js';

export default class RadarStatus extends Dialog {
    constructor(station) {
        super(`${station} Information`, 'info-circle', '');

        this.station = station;
        this.nwsLocation = station.replace(/^K/, ''); // NWS FTM endpoint expects 3-letter location
        this.radarInfo = (window.radarStationFeatures || []).find(
            feature => feature?.properties?.id === this.station
        );
        this._buildDialog();
    }

    _buildDialog() {
        this.dialog.classList.add('radar-status-dialog');

        const infoDiv = document.createElement('div');
        infoDiv.classList.add('radar-status-info');
        const stationProperties = this.radarInfo?.properties || {};
        console.log('Radar station properties:', stationProperties); // Debug log to inspect properties
        infoDiv.innerHTML = `
            <h2 style="width: 100%; text-align: left;">${this.station} | ${stationProperties?.name}</h2><br>
            <p><strong>Type:</strong> ${stationProperties?.stationType || 'Unknown'}</p>
            <p><strong>Elevation:</strong> ${stationProperties.elevation?.value?.toFixed(0) ?? 'Unknown'} m</p>
            <br>
        `;

        this.dialog.appendChild(infoDiv);

        const content = document.createElement('div');
        content.classList.add('radar-status-content');
        content.innerHTML = `
            <p>Loading radar status...</p>
        `;

        this.dialog.appendChild(content);

        // Fetch and display radar status
        this._fetchRadarStatus();
    }

    async _fetchRadarStatus() {
        try {
            const response = await fetch(`https://api.weather.gov/products/types/FTM/locations/${this.nwsLocation}`);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();
            
            const prodUrl = data['@graph']?.[0]?.['@id'];

            if (!prodUrl) {
                this._updateContent({ error: 'No radar status messages available for this station.' });
                return;
            }

            try {
                const productResponse = await fetch(prodUrl);
                if (!productResponse.ok) {
                    throw new Error('Network response was not ok');
                }
                const productData = await productResponse.json();
                
                this._updateContent(productData);
            } catch (error) {
                console.error('Error fetching product details:', error);
                this._updateContent({ error: 'Failed to load radar status message. Please try again later.' });
            }
        } catch (error) {
            console.error('Error fetching radar status list:', error);
            this._updateContent({ error: 'Failed to load radar status messages. Please try again later.' });
        }
    }

    _updateContent(data) {
        const content = this.dialog.querySelector('.radar-status-content');

        if (data.error) {
            content.innerHTML = `<p>${data.error}</p>`;
            return;
        }

        // Extract product text from the response
        const productText = data.productText || 'No status message available.';
        
        // Process and display radar status data
        content.innerHTML = `
            <pre class="product-message">${productText}</pre>
        `;
    }
}