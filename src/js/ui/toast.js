export default class Toast {
    constructor(message) {
        this.message = message;
        this.toast = null;
    }

    show() {
        if (this.toast) return; // Prevent multiple toasts

        this.toast = document.createElement('div');
        this.toast.className = 'toast';
        this.toast.textContent = this.message;

        document.body.appendChild(this.toast);

        // Force reflow to enable transition
        void this.toast.offsetWidth;

        this.toast.classList.add('show');

        // Hide after duration
        setTimeout(() => this.hide(), 5000);
    }

    hide() {
        if (!this.toast) return;

        this.toast.classList.remove('show');
        this.toast.addEventListener('transitionend', () => {
            if (this.toast && this.toast.parentNode) {
                this.toast.parentNode.removeChild(this.toast);
                this.toast = null;
            }
        });
    }
}