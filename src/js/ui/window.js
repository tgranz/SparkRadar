export default class Window {
    static _instances = new Set();
    static _nextZIndex = 1000;

    constructor(options) {
        if (!options) options = {};

        this.isMinimized = false;
        this.isAnimating = false;

        this.wrapper = document.createElement('div');
        this.wrapper.style.position = 'fixed';
        this.wrapper.style.zIndex = `${options.zIndex ?? 1000}`;
        this.wrapper.style.width = `${options.width ?? 300}px`;
        this.wrapper.style.height = `${options.height ?? 200}px`;
        //Start centered
        this.wrapper.style.left = `calc(50% - ${options.width ? options.width / 2 : 150}px)`;
        this.wrapper.style.top = `calc(50% - ${options.height ? options.height / 2 : 100}px)`;
        this.wrapper.classList.add('window');

        this.titleBar = document.createElement('div');
        this.titleBar.classList.add('window-titlebar');

        this.icon = document.createElement('i');
        this.icon.classList.add('ti', `ti-${options.icon ?? 'app-window'}`);
        this.titleBar.appendChild(this.icon);

        this.title = document.createElement('span');
        this.title.classList.add('window-title');
        this.title.textContent = options.title ?? 'Window';
        this.titleBar.appendChild(this.title);

        this.windowControls = document.createElement('div');
        this.windowControls.classList.add('window-controls');
        this.titleBar.appendChild(this.windowControls);

        this.windowMinimizer = document.createElement('button');
        this.windowMinimizer.classList.add('window-minimize');
        this.windowMinimizer.textContent = '−';
        this.windowMinimizer.addEventListener('click', () => this.minimize());
        this.windowControls.appendChild(this.windowMinimizer);

        this.windowCloser = document.createElement('button');
        this.windowCloser.classList.add('window-close');
        this.windowCloser.textContent = '×';
        this.windowCloser.addEventListener('click', () => this.destroy());
        this.windowControls.appendChild(this.windowCloser);

        this.content = document.createElement('div');
        this.content.classList.add('window-content');
        this.content.innerHTML = options.html ?? '';

        this.wrapper.appendChild(this.titleBar);
        this.wrapper.appendChild(this.content);

        document.body.appendChild(this.wrapper);

        Window._instances.add(this);
        const initialZ = Number.parseInt(this.wrapper.style.zIndex, 10) || 1000;
        if (Window._nextZIndex <= initialZ) {
            Window._nextZIndex = initialZ + 1;
        }

        this._focusWindow = () => this.bringToFront();
        this.wrapper.addEventListener('mousedown', this._focusWindow);
        this.wrapper.addEventListener('touchstart', this._focusWindow, { passive: true });
        this.bringToFront();

        this._initDrag();
        this._initResizeHandlers();

        // Ensure taskbar is in the DOM
        if (!document.getElementById('taskbar')) {
            const taskbar = document.createElement('div');
            taskbar.id = 'taskbar';
            document.body.appendChild(taskbar);
        }

        // Add icon to taskbar
        if (document.getElementById('taskbar')) {
            this.taskbarIcon = document.createElement('div');
            this.taskbarIcon.classList.add('taskbar-icon');
            this.taskbarIcon.appendChild(this.icon.cloneNode(true));
            this.taskbarIcon.addEventListener('click', () => {
                this.toggleMinimize();
            });
            document.getElementById('taskbar').appendChild(this.taskbarIcon);
        }

        this._animateOpen();
    }

    bringToFront() {
        if (!this.wrapper || !this.wrapper.parentNode) return;

        const next = Window._nextZIndex++;
        this.wrapper.style.zIndex = `${next}`;
    }

    _getTaskbarIconRect() {
        if (!this.taskbarIcon || !document.body.contains(this.taskbarIcon)) return null;
        return this.taskbarIcon.getBoundingClientRect();
    }

    _buildTaskbarKeyframes(direction = 'to-taskbar') {
        const iconRect = this._getTaskbarIconRect();
        if (!iconRect) {
            if (direction === 'to-taskbar') {
                return [
                    { transform: 'translateY(0px) scale(1)', opacity: 1, filter: 'blur(0px)' },
                    { transform: 'translateY(24px) scale(0.94)', opacity: 0, filter: 'blur(1px)' }
                ];
            }

            return [
                { transform: 'translateY(24px) scale(0.94)', opacity: 0, filter: 'blur(1px)' },
                { transform: 'translateY(0px) scale(1)', opacity: 1, filter: 'blur(0px)' }
            ];
        }

        const windowRect = this.wrapper.getBoundingClientRect();
        const windowCenterX = windowRect.left + (windowRect.width / 2);
        const windowCenterY = windowRect.top + (windowRect.height / 2);
        const iconCenterX = iconRect.left + (iconRect.width / 2);
        const iconCenterY = iconRect.top + (iconRect.height / 2);
        const tx = iconCenterX - windowCenterX;
        const ty = iconCenterY - windowCenterY;
        const scaleX = Math.max(0.14, iconRect.width / Math.max(1, windowRect.width));
        const scaleY = Math.max(0.14, iconRect.height / Math.max(1, windowRect.height));

        if (direction === 'to-taskbar') {
            return [
                { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1, filter: 'blur(0px)' },
                { transform: `translate(${tx}px, ${ty}px) scale(${scaleX}, ${scaleY})`, opacity: 0.2, filter: 'blur(1px)' }
            ];
        }

        return [
            { transform: `translate(${tx}px, ${ty}px) scale(${scaleX}, ${scaleY})`, opacity: 0.2, filter: 'blur(1px)' },
            { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1, filter: 'blur(0px)' }
        ];
    }

    async _runWindowAnimation(keyframes, duration = 260, easing = 'cubic-bezier(0.2, 0.85, 0.2, 1)') {
        if (!this.wrapper.animate) return;

        const animation = this.wrapper.animate(keyframes, {
            duration,
            easing,
            fill: 'both'
        });

        try {
            await animation.finished;
        } catch {
            // Ignore interrupted animations from rapid user clicks.
        }

        animation.cancel();
    }

    async _animateOpen() {
        this.wrapper.classList.add('window-animating');
        await this._runWindowAnimation(this._buildTaskbarKeyframes('from-taskbar'), 300);
        this.wrapper.classList.remove('window-animating');
    }

    _initDrag() {
        let isDragging = false;
        let offsetX, offsetY;

        this.titleBar.addEventListener('mousedown', (e) => {
            isDragging = true;
            const rect = this.wrapper.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (isDragging) {
                this.wrapper.style.left = `${e.clientX - offsetX}px`;
                this.wrapper.style.top = `${e.clientY - offsetY}px`;
            }
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            document.body.style.userSelect = '';
        });
    }

    _initResizeHandlers() {
        const resizers = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
        const MIN_WIDTH = 220;
        const MIN_HEIGHT = 140;
        resizers.forEach((dir) => {
            const resizer = document.createElement('div');
            resizer.classList.add('window-resizer', `window-resizer-${dir}`);
            this.wrapper.appendChild(resizer);

            let isResizing = false;
            let startX, startY, startWidth, startHeight, startLeft, startTop;

            resizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                isResizing = true;
                const rect = this.wrapper.getBoundingClientRect();
                startX = e.clientX;
                startY = e.clientY;
                startWidth = rect.width;
                startHeight = rect.height;
                startLeft = rect.left;
                startTop = rect.top;
                document.body.style.userSelect = 'none';
            });

            window.addEventListener('mousemove', (e) => {
                if (isResizing) {
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    let newWidth = startWidth;
                    let newHeight = startHeight;
                    let newLeft = startLeft;
                    let newTop = startTop;

                    if (dir.includes('right')) {
                        newWidth = Math.max(MIN_WIDTH, startWidth + dx);
                    } else if (dir.includes('left')) {
                        const candidateWidth = startWidth - dx;
                        newWidth = Math.max(MIN_WIDTH, candidateWidth);
                        newLeft = startLeft + (startWidth - newWidth);
                    }

                    if (dir.includes('bottom')) {
                        newHeight = Math.max(MIN_HEIGHT, startHeight + dy);
                    } else if (dir.includes('top')) {
                        const candidateHeight = startHeight - dy;
                        newHeight = Math.max(MIN_HEIGHT, candidateHeight);
                        newTop = startTop + (startHeight - newHeight);
                    }

                    this.wrapper.style.width = `${newWidth}px`;
                    this.wrapper.style.height = `${newHeight}px`;
                    this.wrapper.style.left = `${newLeft}px`;
                    this.wrapper.style.top = `${newTop}px`;
                }
            });

            window.addEventListener('mouseup', () => {
                isResizing = false;
                document.body.style.userSelect = '';
            });
        });
    }

    async minimize() {
        if (this.isMinimized || this.isAnimating) return;

        this.isAnimating = true;
        this.wrapper.classList.add('window-animating');
        await this._runWindowAnimation(this._buildTaskbarKeyframes('to-taskbar'));
        this.wrapper.style.display = 'none';
        this.wrapper.classList.remove('window-animating');

        this.isMinimized = true;
        this.isAnimating = false;
        this.taskbarIcon?.classList.add('minimized');
    }

    async unminimize() {
        if (!this.isMinimized || this.isAnimating) return;

        this.isAnimating = true;
        this.bringToFront();
        this.wrapper.style.display = 'flex';
        this.wrapper.classList.add('window-animating');
        await this._runWindowAnimation(this._buildTaskbarKeyframes('from-taskbar'));
        this.wrapper.classList.remove('window-animating');

        this.isMinimized = false;
        this.isAnimating = false;
        this.taskbarIcon?.classList.remove('minimized');
        this.taskbarIcon?.classList.add('taskbar-icon-launch');
        setTimeout(() => this.taskbarIcon?.classList.remove('taskbar-icon-launch'), 220);
    }

    toggleMinimize() {
        if (this.isMinimized) {
            this.unminimize();
        } else {
            this.minimize();
        }
    }

    async destroy() {
        if (this.isAnimating) return;

        this.isAnimating = true;
        if (!this.isMinimized) {
            this.wrapper.classList.add('window-animating');
            await this._runWindowAnimation(this._buildTaskbarKeyframes('to-taskbar'), 220, 'cubic-bezier(0.4, 0, 1, 1)');
        }

        const taskbar = document.getElementById('taskbar');
        if (this.wrapper.parentNode) {
            this.wrapper.parentNode.removeChild(this.wrapper);
        }
        if (taskbar && this.taskbarIcon && this.taskbarIcon.parentNode === taskbar) {
            taskbar.removeChild(this.taskbarIcon);
        }

        if (this._focusWindow) {
            this.wrapper.removeEventListener('mousedown', this._focusWindow);
            this.wrapper.removeEventListener('touchstart', this._focusWindow);
        }
        Window._instances.delete(this);

        this.isAnimating = false;

        // If the taskbar is now empty, remove it from the DOM
        if (taskbar && taskbar.children.length === 0) {
            taskbar.parentNode.removeChild(taskbar);
        }
    }
}