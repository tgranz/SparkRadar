import Window from '../js/ui/window.js';

export default class EmbedPlayer {
    constructor(data) {
        const initialSrc = this._extractEmbedSrc(data);

        // Normalize provided embed HTML so initial iframe fills the window content area.
        const parser = new DOMParser();
        const doc = parser.parseFromString(data, 'text/html');
        const parsedIframe = doc.querySelector('iframe');
        if (parsedIframe) {
            parsedIframe.style.width = '100%';
            parsedIframe.style.height = 'calc(100% - 40px)';
            parsedIframe.style.border = 'none';
            data = doc.body.innerHTML;
        }

        const headerHTML = `
            <div class="embed-player-header" style="height: 30px; padding: 5px; display: flex; align-items: center; gap: 10px;">
                <input class="embed-player-url-input" type="text" value="${initialSrc}" placeholder="Enter an embed URL or paste embed code" style="flex: 1; padding: 4px; background: none; border: 1px solid var(--border-color); border-radius: 10px; color: white;"/>
                <button class="embed-player-go-btn" type="button" style="padding: 5px 20px; font-size: 1em; margin: 5px; font-weight: bold;">Go</button>
            </div>
        `

        this.window = new Window({
            title: 'Embed Player',
            html: headerHTML + data,
            icon: 'video',
            width: 600,
            height: 400,
        });

        this.urlInput = this.window.content.querySelector('.embed-player-url-input');
        this.goButton = this.window.content.querySelector('.embed-player-go-btn');
        this.iframe = this.window.content.querySelector('iframe');

        if (this.iframe) {
            this.iframe.style.width = '100%';
            this.iframe.style.height = 'calc(100% - 40px)';
            this.iframe.style.border = 'none';
        }

        this.goButton?.addEventListener('click', () => this._setEmbedFromInput());
        this.urlInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this._setEmbedFromInput();
            }
        });
    }

    _extractEmbedSrc(value = '') {
        const input = value.trim();
        if (!input) return '';

        if (input.includes('<iframe')) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(input, 'text/html');
            const iframe = doc.querySelector('iframe');
            return iframe?.src ?? '';
        }

        return '';
    }

    _setEmbedFromInput() {
        const rawValue = this.urlInput?.value?.trim() ?? '';
        if (!rawValue) return;

        const newSrc = this._extractEmbedSrc(rawValue);
        if (!newSrc) return;

        if (!this.iframe) {
            this.iframe = document.createElement('iframe');
            this.iframe.style.width = '100%';
            this.iframe.style.height = 'calc(100% - 40px)';
            this.iframe.style.border = 'none';
            this.window.content.appendChild(this.iframe);
        }

        this._clearIntroContent();
        this.iframe.src = newSrc;
        if (this.urlInput) {
            this.urlInput.value = newSrc;
        }
    }

    _clearIntroContent() {
        if (!this.window?.content) return;

        const children = Array.from(this.window.content.children);
        for (const child of children) {
            const isHeader = child.classList?.contains('embed-player-header');
            const isIframe = child.tagName === 'IFRAME';
            if (!isHeader && !isIframe) {
                child.remove();
            }
        }
    }
}