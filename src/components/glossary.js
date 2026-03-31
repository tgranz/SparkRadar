import Window from '../js/ui/window.js';

export default class Glossary {
    static cache = null;
    static cachePromise = null;

    constructor() {
        this.terms = [];

        const htmlContent = `
            <div style="padding: 12px; color: white; display: flex; flex-direction: column; gap: 10px; height: calc(100% - 24px);">
                <input
                    class="glossary-search-input"
                    type="text"
                    placeholder="Search terms or definitions..."
                    style="width: calc(100% - 26px); padding: 10px 12px; background: rgba(0, 0, 0, 0.2); border: 1px solid var(--border-color); border-radius: 10px; color: white; outline: none;"
                />
                <div class="glossary-status" style="font-size: 0.85em; color: rgba(255, 255, 255, 0.7);">Loading glossary terms...</div>
                <div class="glossary-results" style="display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding-right: 4px;"></div>
            </div>
        `;

        this.window = new Window({
            title: 'Glossary',
            html: htmlContent,
            icon: 'book',
            width: 700,
            height: 520,
        });

        this.searchInput = this.window.content.querySelector('.glossary-search-input');
        this.statusEl = this.window.content.querySelector('.glossary-status');
        this.resultsEl = this.window.content.querySelector('.glossary-results');

        this.searchInput?.addEventListener('input', () => {
            this._renderFilteredTerms(this.searchInput.value);
        });

        this._loadTerms();
    }

    static async _getGlossaryData() {
        if (Array.isArray(Glossary.cache)) return Glossary.cache;
        if (Glossary.cachePromise) return Glossary.cachePromise;

        Glossary.cachePromise = fetch('https://api.weather.gov/glossary')
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch glossary (${response.status})`);
                }
                return response.json();
            })
            .then((data) => {
                const glossary = Array.isArray(data?.glossary) ? data.glossary : [];
                Glossary.cache = glossary
                    .filter((item) => item?.term && item?.definition)
                    .map((item) => ({
                        term: String(item.term).trim(),
                        definition: String(item.definition).replace(/\r\n/g, '\n').trim(),
                    }))
                    .sort((a, b) => a.term.localeCompare(b.term));
                return Glossary.cache;
            })
            .catch((error) => {
                Glossary.cachePromise = null;
                throw error;
            });

        return Glossary.cachePromise;
    }

    async _loadTerms() {
        try {
            this.statusEl.textContent = 'Loading glossary terms...';
            this.terms = await Glossary._getGlossaryData();
            this.statusEl.textContent = `${this.terms.length} terms loaded`;
            this._renderFilteredTerms('');
        } catch (error) {
            console.error('Error fetching glossary terms:', error);
            this.statusEl.textContent = 'Unable to load glossary terms right now.';
            if (this.resultsEl) {
                this.resultsEl.innerHTML = '';
            }
        }
    }

    _renderFilteredTerms(query) {
        if (!this.resultsEl) return;

        const normalizedQuery = (query || '').trim().toLowerCase();
        const filtered = normalizedQuery
            ? this.terms.filter((entry) => {
                return (
                    entry.term.toLowerCase().includes(normalizedQuery)
                    || entry.definition.toLowerCase().includes(normalizedQuery)
                );
            })
            : this.terms;

        this.statusEl.textContent = normalizedQuery
            ? `${filtered.length} matching terms`
            : `${this.terms.length} terms loaded`;

        if (filtered.length === 0) {
            this.resultsEl.innerHTML = `
                <div style="border: 1px solid var(--border-color); border-radius: 10px; padding: 12px; color: rgba(255, 255, 255, 0.7);">
                    No terms matched your search.
                </div>
            `;
            return;
        }

        this.resultsEl.innerHTML = filtered
            .map((entry) => {
                return `
                    <div style="border: 1px solid var(--border-color); border-radius: 10px; padding: 12px; background: rgba(0, 0, 0, 0.18);">
                        <div style="font-weight: 700; color: var(--primary-color); margin-bottom: 6px;">${this._escapeHtml(entry.term)}</div>
                        <div style="white-space: pre-wrap; line-height: 1.35;">${this._escapeHtml(entry.definition)}</div>
                    </div>
                `;
            })
            .join('');
    }

    _escapeHtml(value) {
        return value
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }
}