export default class Notification{
    constructor(title, body, icon, color, duration = 5000, actions = []){
        this.title = title;
        this.body = body;
        this.icon = icon;
        this.color = color;
        this.duration = duration;
        this.actions = Array.isArray(actions) ? actions : [];
        this.autoCloseTimeout = null;

        this.notification = document.createElement("div");
        this.notification.classList.add("notification");

        const content = document.createElement("div");
        content.classList.add("notification-content");

        // Apply custom color if provided
        if (this.color) {
            content.style.borderLeftColor = this.color;
        }

        const header = document.createElement("div");
        header.classList.add("notification-header");
        header.innerHTML = `<div class="notification-header-wrapper"><i class="ti ti-${this.icon} notification-icon"></i><span class="notification-title">${this.title}</span></div><button class="notification-close-btn"><i class="ti ti-x"></i></button>`;
        content.appendChild(header);

        // Apply custom icon color if provided
        if (this.color) {
            const iconElem = header.querySelector('.notification-icon');
            if (iconElem) {
                iconElem.style.color = this.color;
            }
        }

        const bodyElem = document.createElement("div");
        bodyElem.classList.add("notification-body");
        bodyElem.innerHTML = this.body;
        content.appendChild(bodyElem);

        if (this.actions.length > 0) {
            const actionRow = document.createElement('div');
            actionRow.classList.add('alert-btns', 'notification-actions');

            this.actions.forEach((action) => {
                const button = document.createElement('button');
                button.classList.add('alert-btn');
                button.type = 'button';
                button.textContent = action.label;
                button.addEventListener('click', () => {
                    action.onClick?.();
                    this.close();
                });
                actionRow.appendChild(button);
            });

            content.appendChild(actionRow);
        }

        this.notification.appendChild(content);

        // Add close button event listener
        const closeBtn = header.querySelector('.notification-close-btn');
        closeBtn.addEventListener('click', () => this.close());

        document.body.appendChild(this.notification);

        // Auto-close after duration
        if (this.duration > 0) {
            this.autoCloseTimeout = setTimeout(() => this.close(), this.duration);
        }
    }

    close() {
        // Clear auto-close timeout if it exists
        if (this.autoCloseTimeout) {
            clearTimeout(this.autoCloseTimeout);
            this.autoCloseTimeout = null;
        }

        // Add closing class to trigger slide-out animation
        this.notification.classList.add('notification-closing');

        // Remove element after animation completes (300ms)
        setTimeout(() => {
            if (this.notification.parentNode) {
                this.notification.parentNode.removeChild(this.notification);
            }
        }, 300);
    }
}