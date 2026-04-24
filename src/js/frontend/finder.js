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
        this.currentHighlightIndex = -1;
        this.results = [];
        this.handleCloseClick = () => this.close();
        this.handleKeyDown = (e) => this._onKeyDown(e);
        this.handleEscapeKey = (e) => {
            if (e.key === 'Escape') {
                this.close();
            }
        };

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

    _onKeyDown(e) {
        // When search input is focused, only allow arrow keys and Enter
        console.log('Key down:', e.key, 'Focused element:', document.activeElement);
        if (document.activeElement === this.searchInput) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this._highlightNext();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this._highlightPrevious();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this._activateHighlighted();
            }
            // Allow spacebar and other keys to work normally in input
            return;
        }
    }

    _highlightNext() {
        if (this.results.length === 0) return;
        this.currentHighlightIndex = (this.currentHighlightIndex + 1) % this.results.length;
        this._updateHighlight();
    }

    _highlightPrevious() {
        if (this.results.length === 0) return;
        this.currentHighlightIndex = this.currentHighlightIndex <= 0 
            ? this.results.length - 1 
            : this.currentHighlightIndex - 1;
        this._updateHighlight();
    }

    _updateHighlight() {
        const resultItems = this.resultsContainer.querySelectorAll('.finder-result');
        resultItems.forEach((item, index) => {
            if (index === this.currentHighlightIndex) {
                item.classList.add('finder-result-highlighted');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('finder-result-highlighted');
            }
        });
    }

    _activateHighlighted() {
        if (this.currentHighlightIndex >= 0 && this.currentHighlightIndex < this.results.length) {
            const result = this.results[this.currentHighlightIndex];
            if (result.action) {
                result.action();
            }
        } else {
            console.log('No result is currently highlighted.');
        }
    }

    _addResult(icon, text, action) {
        const resultItem = buildResultItem(icon, text);
        resultItem.addEventListener('click', () => {
            action();
        });
        resultItem.addEventListener('mouseenter', () => {
            this.currentHighlightIndex = this.results.length;
            this._updateHighlight();
        });
        this.resultsContainer.appendChild(resultItem);
        this.results.push({ icon, text, action, element: resultItem });
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
        // Clear any highlighted items before rebuilding
        const oldHighlighted = this.resultsContainer.querySelectorAll('.finder-result-highlighted');
        oldHighlighted.forEach(item => item.classList.remove('finder-result-highlighted'));
        
        this.resultsContainer.innerHTML = '';
        this.results = [];
        console.log('Cleared results array.');
        this.currentHighlightIndex = -1;

        if (query.length === 0) {
            return;
        }

        // Search for direct link matches
        for (const [url, ...keywords] of links) {
            if (this.results.length >= 25) break;
            if (keywords.some(keyword => keyword.includes(query.toLowerCase()))) {
                this._addResult('link', `Go to ${url}`, () => {
                    window.open(url, '_blank');
                    this.close();
                });
            }
        }

        // Search for radar station matches
        const radarStations = window.radarStationFeatures || [];
        const matchingStations = radarStations.filter(station => {
            const name = station.properties?.name || '';
            const icao = station.properties?.id || '';
            return name.toLowerCase().includes(query.toLowerCase()) || icao.toLowerCase().includes(query.toLowerCase());
        });

        matchingStations.forEach(station => {
            if (this.results.length >= 25) return;
            const name = station.properties?.name || 'Unknown';
            const icao = station.properties?.id || 'Unknown callsign';
            const bbox = station.bbox || station.properties?.bbox;
            const lat = station.geometry?.coordinates[1] || station.properties?.latitude;
            const lon = station.geometry?.coordinates[0] || station.properties?.longitude;

            this._addResult('radar-2', `${icao} (${name})`, () => {
                this._setMapView(bbox, 11, lat, lon);
                this.close();
            });
        });

        // Search Nominatim for queries longer than 4 characters
        if (query.length > 4) {
            if (this.isTyping) {
                clearTimeout(this.typingTimeout);
            }
            
            this.isTyping = true;
            
            this.typingTimeout = setTimeout(async () => {
                this.isTyping = false;
                const results = await this._searchNominatim(query);

                // Ignore stale responses from older searches
                if (currentSearchSequence !== this.searchSequence) {
                    return;
                }

                if (results && results.length > 0) {
                    // Remove any "no results" placeholder before adding Nominatim results
                    const noResultsItems = this.resultsContainer.querySelectorAll('.finder-no-results');
                    noResultsItems.forEach(item => item.remove());

                    results.forEach(result => {
                        if (this.results.length >= 25) return;
                        this._addResult('map-pin', result.display_name, () => {
                            this._setMapView(result.boundingbox, 11, result.lat, result.lon);
                            this.close();
                        });
                    });

                    // Update highlighting in case this is the first batch of results
                    if (this.currentHighlightIndex === -1 && this.results.length > 0) {
                        this.currentHighlightIndex = 0;
                        this._updateHighlight();
                    }
                } else if (this.results.length === 0) {
                    const noResultsItem = document.createElement('div');
                    noResultsItem.classList.add('finder-no-results');
                    noResultsItem.textContent = 'No results found';
                    this.resultsContainer.appendChild(noResultsItem);
                }
            }, 500);
        }

        if (this.results.length === 0 && query.length <= 4) {
            const noResultsItem = document.createElement('div');
            noResultsItem.classList.add('finder-no-results');
            noResultsItem.textContent = 'No results found';
            this.resultsContainer.appendChild(noResultsItem);
        }

        // Auto-highlight first result
        if (this.results.length > 0) {
            this.currentHighlightIndex = 0;
            this._updateHighlight();
        }
    }

    open() {
        this.wrapper.classList.remove('finder-closing');
        this.wrapper.classList.remove('finder-hidden');
        // Defer focus until after the element is displayed
        requestAnimationFrame(() => {
            setTimeout(() => {this.searchInput.focus();}, 210);
        });
        document.addEventListener('keydown', this.handleEscapeKey);
        document.addEventListener('keydown', this.handleKeyDown);
        this.searchInput.value = '';
        this.resultsContainer.innerHTML = '';
        this.results = [];
        console.log('Cleared results array.');
        this.currentHighlightIndex = -1;
    }

    close() {
        // Remove event listeners immediately
        document.removeEventListener('keydown', this.handleEscapeKey);
        document.removeEventListener('keydown', this.handleKeyDown);
        this.searchInput.value = '';
        this.resultsContainer.innerHTML = '';
        this.results = [];
        console.log('Cleared results array.');
        this.currentHighlightIndex = -1;

        this.wrapper.classList.add('finder-closing');
        this.wrapper.addEventListener('animationend', () => {
            if (this.wrapper.classList.contains('finder-closing')) {
                this.wrapper.classList.add('finder-hidden');
                this.wrapper.classList.remove('finder-closing');
            }
        }, { once: true });
    }
}