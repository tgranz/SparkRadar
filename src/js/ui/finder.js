const links = [
    [
        'https://wiki.sparkradar.app',
        'help',
        'documentation',
        'docs',
        'support',
        'wiki'
    ],
    [
        'https://lite.sparkradar.app',
        'lite',
        'light',
        'lightweight',
        'lowres',
        'low-res'
    ],
    [
        'https://www.spc.noaa.gov/products/',
        'spc',
        'storm prediction center',
        'severe weather',
        'outlooks',
        'information'
    ]
]

function buildResultItem(icon, text) {
    const resultItem = document.createElement('div');
    resultItem.classList.add('finder-result');
    resultItem.innerHTML = `<i class="ti ti-${icon}"></i> ${text}`;
    return resultItem;
}

function buildCloseButton() {
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.classList.add('finder-close-btn');
    closeButton.setAttribute('aria-label', 'Close finder');
    closeButton.title = 'Close';
    closeButton.innerHTML = '<i class="ti ti-x"></i>';
    return closeButton;
}

export default class Finder {
    constructor(map) {
        this.map = map;
        this.isTyping = false;
        this.typingTimeout = null;
        this.searchSequence = 0;
        this.isFirstElement = true;
        this.handleCloseClick = () => this.close();

        if (document.getElementById('finder')) {
            console.warn('[Finder] Finder instance already exists. Reusing existing instance.');
            this.wrapper = document.getElementById('finder');
            this.searchRow = this.wrapper.querySelector('.finder-search-row');
            this.searchInput = this.wrapper.querySelector('input[type="text"]');
            this.resultsContainer = this.wrapper.querySelector('.finder-results');
            this.closeButton = this.wrapper.querySelector('.finder-close-btn');

            if (!this.searchRow && this.searchInput) {
                this.searchRow = document.createElement('div');
                this.searchRow.classList.add('finder-search-row');
                this.searchInput.parentNode?.insertBefore(this.searchRow, this.searchInput);
                this.searchRow.appendChild(this.searchInput);
            }

            if (!this.closeButton && this.searchRow) {
                this.closeButton = buildCloseButton();
                this.searchRow.appendChild(this.closeButton);
            }

            if (this.closeButton) {
                this.closeButton.removeEventListener('click', this.handleCloseClick);
                this.closeButton.addEventListener('click', this.handleCloseClick);
            }
            return;
        }

        this.wrapper = document.createElement('div');
        this.wrapper.classList.add('finder-wrapper');
        this.wrapper.classList.add('finder-hidden');
        this.wrapper.id = 'finder';
        
        this.searchInput = document.createElement('input');
        this.searchInput.type = 'text';
        this.searchInput.placeholder = 'Search anything';

        this.searchRow = document.createElement('div');
        this.searchRow.classList.add('finder-search-row');
        this.searchRow.appendChild(this.searchInput);

        this.closeButton = buildCloseButton();
        this.closeButton.addEventListener('click', this.handleCloseClick);
        this.searchRow.appendChild(this.closeButton);

        this.wrapper.appendChild(this.searchRow);

        this.resultsContainer = document.createElement('div');
        this.resultsContainer.classList.add('finder-results');
        this.wrapper.appendChild(this.resultsContainer);

        document.body.appendChild(this.wrapper);

        this.searchInput.addEventListener('input', () => {
            const query = this.searchInput.value.trim();
            if (query === '/') {
                this.searchInput.value = '';
                return;
            }
            this.performSearch(query);
        });
    }

    async _searchNominatim(q){
        console.log('Searching Nominatim for:', q);
        try {
            const response = await fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json');
            if (!response.ok) {
                throw new Error('Nominatim request failed: ' + response.status);
            }
            const data = await response.json();
            console.log(data);
            return data;
        } catch (error) {
            console.error('Error fetching Nominatim data:', error);
            return [];
        }
    }

    _setMapView(boundingBox, zoom = 11, fallbackLat = null, fallbackLon = null) {
        const mapInstance = this.map?.map ?? this.map;
        if (!mapInstance) {
            return;
        }

        const parsedBounds = Array.isArray(boundingBox) && boundingBox.length >= 4
            ? {
                south: Number(boundingBox[0]),
                north: Number(boundingBox[1]),
                west: Number(boundingBox[2]),
                east: Number(boundingBox[3])
            }
            : null;

        if (
            parsedBounds &&
            Number.isFinite(parsedBounds.south) &&
            Number.isFinite(parsedBounds.north) &&
            Number.isFinite(parsedBounds.west) &&
            Number.isFinite(parsedBounds.east)
        ) {
            if (typeof mapInstance.fitBounds === 'function') {
                // Nominatim bbox format: [south, north, west, east]
                if (typeof mapInstance.setView === 'function') {
                    mapInstance.fitBounds([
                        [parsedBounds.south, parsedBounds.west],
                        [parsedBounds.north, parsedBounds.east]
                    ]);
                    return;
                }

                mapInstance.fitBounds([
                    [parsedBounds.west, parsedBounds.south],
                    [parsedBounds.east, parsedBounds.north]
                ], { padding: 24, duration: 600 });
                return;
            }
        }

        const lat = Number(fallbackLat);
        const lon = Number(fallbackLon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return;
        }

        if (typeof mapInstance.setView === 'function') {
            mapInstance.setView([lat, lon], zoom);
            return;
        }

        if (typeof mapInstance.flyTo === 'function') {
            mapInstance.flyTo({ center: [lon, lat], zoom });
            return;
        }

        if (typeof mapInstance.setCenter === 'function') {
            mapInstance.setCenter([lon, lat]);
        }
        if (typeof mapInstance.setZoom === 'function') {
            mapInstance.setZoom(zoom);
        }
    }

    async performSearch(query) {
        const currentSearchSequence = ++this.searchSequence;
        this.resultsContainer.innerHTML = '';
        if (query.length === 0) {
            return;
        }

        this.isFirstElement = true;
        
        // First look for direct link matches
        for (const [url, ...keywords] of links) {
            if (keywords.some(keyword => keyword.includes(query.toLowerCase()))) {
                const resultItem = buildResultItem('link', `Go to ${url}`);
                resultItem.addEventListener('click', () => {
                    window.open(url, '_blank');
                    this.close();
                });
                if (this.isFirstElement) {
                    resultItem.classList.add('finder-result-first');
                    document.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            window.open(url, '_blank');
                            this.close();
                        }
                    }, { once: true });
                }
                this.resultsContainer.appendChild(resultItem);
                this.isFirstElement = false;
            }
        }

        // Next look for radar station matches
        const radarStations = window.radarStationFeatures || [];
        const matchingStations = radarStations.filter(station => {
            const name = station.properties?.name || '';
            const icao = station.properties?.id || '';
            return name.toLowerCase().includes(query.toLowerCase()) || icao.toLowerCase().includes(query.toLowerCase());
        });

        if (matchingStations.length > 0) {
            const sectionHeader = document.createElement('p');
            sectionHeader.textContent = 'Radar Stations:';
            sectionHeader.style.padding = '10px';
            sectionHeader.style.fontWeight = 'bold';
            this.resultsContainer.appendChild(sectionHeader);

            matchingStations.forEach(station => {
                const name = station.properties?.name || 'Unknown';
                const icao = station.properties?.id || 'Unknown callsign';
                const resultItem = buildResultItem('radar-2', `${icao} (${name})`);
                resultItem.addEventListener('click', () => {
                    const bbox = station.bbox || station.properties?.bbox;
                    const lat = station.geometry?.coordinates[1] || station.properties?.latitude;
                    const lon = station.geometry?.coordinates[0] || station.properties?.longitude;
                    this._setMapView(bbox, 11, lat, lon);
                    this.close();
                });
                if (this.isFirstElement) {
                    resultItem.classList.add('finder-result-first');
                    document.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            const bbox = station.bbox || station.properties?.bbox;
                            const lat = station.geometry?.coordinates[1] || station.properties?.latitude;
                            const lon = station.geometry?.coordinates[0] || station.properties?.longitude;
                            this._setMapView(bbox, 8, lat, lon);
                            this.close();
                        }
                    }, { once: true });
                }
                this.resultsContainer.appendChild(resultItem);
                this.isFirstElement = false;
            });
        }


        // Finally, search Nominatim for any remaining queries (longer than 4 chars)
        if (query.length > 4) {
            if (this.isTyping) {
                clearTimeout(this.typingTimeout);
            }
            
            this.isTyping = true;
            
            this.typingTimeout = setTimeout(async () => {
                this.isTyping = false;
                const results = await this._searchNominatim(query);

                // Ignore stale responses from older searches.
                if (currentSearchSequence !== this.searchSequence) {
                    return;
                }

                const sectionHeader = document.createElement('p');
                sectionHeader.innerHTML = 'From <a href="https://nominatim.org/" target="_blank">Nominatim</a>:';
                sectionHeader.style.padding = '10px';
                sectionHeader.style.fontWeight = 'bold';
                this.resultsContainer.appendChild(sectionHeader);

                if (results && results.length > 0) {
                    results.forEach(result => {
                        const resultItem = buildResultItem('map-pin', result.display_name);
                        resultItem.addEventListener('click', () => {
                            this._setMapView(result.boundingbox, 11, result.lat, result.lon);
                            this.close();
                        });
                        if (this.isFirstElement) {
                            resultItem.classList.add('finder-result-first');
                            document.addEventListener('keydown', (e) => {
                                if (e.key === 'Enter') {
                                    this._setMapView(result.boundingbox, 11, result.lat, result.lon);
                                    this.close();
                                }
                            }, { once: true });
                        }
                        this.resultsContainer.appendChild(resultItem);
                        this.isFirstElement = false;
                    });
                } else if (this.resultsContainer.innerHTML === '') {
                    const noResultsItem = document.createElement('div');
                    noResultsItem.classList.add('finder-no-results');
                    noResultsItem.textContent = 'No results found';
                    this.resultsContainer.appendChild(noResultsItem);
                }
            }, 500);
        }

        if (this.isFirstElement && this.resultsContainer.innerHTML === '') {
            const noResultsItem = document.createElement('div');
            noResultsItem.classList.add('finder-no-results');
            this.resultsContainer.appendChild(noResultsItem);
        }

    }

    open() {
        this.wrapper.classList.remove('finder-closing');
        this.wrapper.classList.remove('finder-hidden');
        // Defer focus until after the element is displayed
        requestAnimationFrame(() => {
            setTimeout(() => {this.searchInput.focus();}, 210);
        });
        this.escListener = (e) => {
            if (e.key === 'Escape') {
                this.close();
            }
        };
        document.addEventListener('keydown', this.escListener);
        this.searchInput.value = '';
        this.resultsContainer.innerHTML = '';
    }

    close() {
        this.wrapper.classList.add('finder-closing');
        this.wrapper.addEventListener('animationend', () => {
            if (this.wrapper.classList.contains('finder-closing')) {
                this.wrapper.classList.add('finder-hidden');
                this.wrapper.classList.remove('finder-closing');
                this.searchInput.value = '';
                this.resultsContainer.innerHTML = '';
                document.removeEventListener('keydown', this.escListener);
            }
        }, { once: true });
    }
}