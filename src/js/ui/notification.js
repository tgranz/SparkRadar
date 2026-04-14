export default class Notification{
    constructor(title, body, icon, color, duration = 5000, actions = [], soundFile = null){
        this.title = title;
        this.body = body;
        this.icon = icon;
        this.color = color;
        this.duration = duration;
        this.actions = Array.isArray(actions) ? actions : [];
        this.soundFile = soundFile;
        this.autoCloseTimeout = null;
        this.progressAnimationFrame = null;
        this.remainingDuration = this.duration;
        this.countdownStartedAt = null;
        this.hasFineHoverPointer = window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches ?? false;

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

        if (this.duration > 0) {
            this.progressBar = document.createElement('div');
            this.progressBar.classList.add('notification-progress-bar');

            if (this.color) {
                this.progressBar.style.backgroundColor = this.color;
            }

            this.notification.appendChild(this.progressBar);
        }

        // Add close button event listener
        const closeBtn = header.querySelector('.notification-close-btn');
        closeBtn.addEventListener('click', () => this.close());

        document.body.appendChild(this.notification);

        // Auto-close after duration
        if (this.duration > 0) {
            this.startAutoCloseCountdown();

            if (this.hasFineHoverPointer) {
                this.handleHoverPause = () => this.pauseAutoCloseCountdown();
                this.handleHoverResume = () => this.resumeAutoCloseCountdown();
                this.notification.addEventListener('mouseenter', this.handleHoverPause);
                this.notification.addEventListener('mouseleave', this.handleHoverResume);
            }
        }

        // Play sound if provided from sound/{filename}
        if (this.soundFile) {
            this.audio = new Audio(`sound/${this.soundFile}`);
            this.audio.volume = 0.5; // decrease volume
            this.audio.play().catch((err) => {
                if (err.name === 'NotAllowedError') {
                    setTimeout(() => {
                        new Notification(
                            'Audio Blocked',
                            `Alert sounds are being blocked by your browser's autoplay settings. Enable autoplay (usually found in the URL bar or browser settings) for sparkradar.app to hear notification sounds.`,
                            'volume-off',
                            '#f59e0b',
                            15000
                        );
                    }, 5000);
                }
            });
        }
    }

    startAutoCloseCountdown() {
        if (this.remainingDuration <= 0) {
            this.close();
            return;
        }

        if (this.autoCloseTimeout) {
            clearTimeout(this.autoCloseTimeout);
        }

        this.countdownStartedAt = performance.now();
        this.autoCloseTimeout = setTimeout(() => this.close(), this.remainingDuration);
        this.resetProgressBar(this.remainingDuration);
    }

    pauseAutoCloseCountdown() {
        this.remainingDuration = this.duration;

        if (this.autoCloseTimeout) {
            clearTimeout(this.autoCloseTimeout);
            this.autoCloseTimeout = null;
        }

        this.countdownStartedAt = null;

        if (this.progressAnimationFrame) {
            cancelAnimationFrame(this.progressAnimationFrame);
            this.progressAnimationFrame = null;
        }

        if (this.progressBar) {
            const remainingScale = this.duration > 0 ? this.remainingDuration / this.duration : 0;
            this.progressBar.style.transition = 'none';
            this.progressBar.style.transform = `scaleX(${remainingScale})`;
        }
    }

    resumeAutoCloseCountdown() {
        this.remainingDuration = this.duration;

        if (this.autoCloseTimeout) {
            clearTimeout(this.autoCloseTimeout);
            this.autoCloseTimeout = null;
        }

        if (this.progressAnimationFrame) {
            cancelAnimationFrame(this.progressAnimationFrame);
            this.progressAnimationFrame = null;
        }

        if (this.remainingDuration <= 0) {
            this.close();
            return;
        }

        this.startAutoCloseCountdown();
    }

    resetProgressBar(durationMs) {
        if (!this.progressBar) {
            return;
        }

        if (this.progressAnimationFrame) {
            cancelAnimationFrame(this.progressAnimationFrame);
            this.progressAnimationFrame = null;
        }

        const remainingScale = this.duration > 0 ? this.remainingDuration / this.duration : 0;

        this.progressBar.style.transition = 'none';
        this.progressBar.style.transform = `scaleX(${remainingScale})`;

        // Force reflow so the next transition always restarts from full width.
        this.progressBar.offsetWidth;

        this.progressAnimationFrame = requestAnimationFrame(() => {
            this.progressBar.style.transition = `transform ${durationMs}ms linear`;
            this.progressBar.style.transform = 'scaleX(0)';
            this.progressAnimationFrame = null;
        });
    }

    close() {
        // Clear auto-close timeout if it exists
        if (this.autoCloseTimeout) {
            clearTimeout(this.autoCloseTimeout);
            this.autoCloseTimeout = null;
        }

        if (this.progressAnimationFrame) {
            cancelAnimationFrame(this.progressAnimationFrame);
            this.progressAnimationFrame = null;
        }

        if (this.handleHoverPause) {
            this.notification.removeEventListener('mouseenter', this.handleHoverPause);
        }

        if (this.handleHoverResume) {
            this.notification.removeEventListener('mouseleave', this.handleHoverResume);
        }

        // Add closing class to trigger slide-out animation
        this.notification.classList.add('notification-closing');

        // Remove element after animation completes (300ms)
        setTimeout(() => {
            if (this.notification.parentNode) {
                this.notification.parentNode.removeChild(this.notification);
            }
        }, 300);

        // Stop any playing sound if playing
        if (this.soundFile && this.audio) {
            this.audio.pause();
            this.audio.currentTime = 0;
        }
    }
}