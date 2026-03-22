export default class Modal {
    constructor(title, bodyHTML, buttons = []) {
        this.isOpen = false;
        this.isClosing = false;

        this.darkener = document.createElement('div');
        this.darkener.classList.add('modal-darkener');

        this.modal = document.createElement('div');
        this.modal.classList.add('modal');

        const header = document.createElement('div');
        header.classList.add('modal-header');
        header.textContent = title;

        const body = document.createElement('div');
        body.classList.add('modal-body');
        body.innerHTML = bodyHTML;

        const footer = document.createElement('div');
        footer.classList.add('modal-footer');

        const buttonConfigs = Array.isArray(buttons)
            ? buttons
            : Object.entries(buttons).map(([text, value]) => {
                if (typeof value === 'function') {
                    return { text, click: value };
                }

                if (typeof value === 'string') {
                    return { text, className: value };
                }

                if (value && typeof value === 'object') {
                    return { text, ...value };
                }

                return { text };
            });

        for (const buttonConfig of buttonConfigs) {
            const { text = '', className = '', click } = buttonConfig || {};
            const button = document.createElement('button');
            button.textContent = text;
            button.className = className;
            if (typeof click === 'function') {
                button.addEventListener('click', () => click(this));
            }
            footer.appendChild(button);
        }

        this.modal.appendChild(header);
        this.modal.appendChild(body);
        this.modal.appendChild(footer);
    }

    open() {
        if (this.isOpen || this.isClosing) {
            return;
        }

        document.body.appendChild(this.darkener);
        document.body.appendChild(this.modal);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.darkener.classList.add('modal-open');
                this.modal.classList.add('modal-open');
            });
        });

        this.isOpen = true;
        this.isClosing = false;
    }

    close() {
        if (!this.isOpen || this.isClosing) {
            return;
        }

        this.isClosing = true;

        this.darkener.classList.remove('modal-open');
        this.modal.classList.remove('modal-open');
        this.darkener.classList.add('modal-closing');
        this.modal.classList.add('modal-closing');

        const removeElements = () => {
            if (this.modal.parentNode) {
                this.modal.parentNode.removeChild(this.modal);
            }
            if (this.darkener.parentNode) {
                this.darkener.parentNode.removeChild(this.darkener);
            }
            this.darkener.classList.remove('modal-closing');
            this.modal.classList.remove('modal-closing');
            this.isOpen = false;
            this.isClosing = false;
        };

        window.setTimeout(removeElements, 220);
    }
}