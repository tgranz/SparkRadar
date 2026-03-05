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

export default class Finder {
    constructor() {
        if (document.getElementById('finder')) {
            console.warn('[Finder] Finder instance already exists. Reusing existing instance.');
            this.wrapper = document.getElementById('finder');
            this.searchInput = this.wrapper.querySelector('input[type="text"]');
            this.resultsContainer = this.wrapper.querySelector('.finder-results');
            return;
        }

        this.wrapper = document.createElement('div');
        this.wrapper.classList.add('finder-wrapper');
        this.wrapper.classList.add('finder-hidden');
        this.wrapper.id = 'finder';
        
        this.searchInput = document.createElement('input');
        this.searchInput.type = 'text';
        this.searchInput.placeholder = 'Search anything';
        this.wrapper.appendChild(this.searchInput);

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

    performSearch(query) {
        this.resultsContainer.innerHTML = '';
        if (query.length === 0) {
            return;
        }

        let isFirstElement = true;
        
        // First look for direct link matches
        for (const [url, ...keywords] of links) {
            if (keywords.some(keyword => keyword.includes(query.toLowerCase()))) {
                const resultItem = buildResultItem('link', `Go to ${url}`);
                resultItem.addEventListener('click', () => {
                    window.open(url, '_blank');
                    this.close();
                });
                if (isFirstElement) {
                    resultItem.classList.add('finder-result-first');
                    document.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            window.open(url, '_blank');
                            this.close();
                        }
                    }, { once: true });
                }
                this.resultsContainer.appendChild(resultItem);
                isFirstElement = false;
            }
        }

        if (this.resultsContainer.innerHTML === '') {
            const noResultsItem = document.createElement('div');
            noResultsItem.classList.add('finder-no-results');
            noResultsItem.textContent = 'No results found';
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