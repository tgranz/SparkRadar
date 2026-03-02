export default class Draw {
    static instance = null;

    constructor() {
        // Singleton pattern - only allow one draw instance at a time
        if (Draw.instance) {
            Draw.instance.show();
            return Draw.instance;
        }

        Draw.instance = this;
        this.isDrawing = false;
        this.points = [];
        this.currentColor = '#27beff';
        this.currentLineWidth = 4;
        this.allPaths = []; // Store all drawn paths for redrawing
        
        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.pointerEvents = 'auto';
        this.canvas.style.cursor = 'crosshair';
        this.canvas.style.zIndex = '999';
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // Create toolbar
        this.createToolbar();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initialize canvas size
        this.resize();

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.close();
            }
        });
    }

    createToolbar() {
        this.toolbar = document.createElement('div');
        this.toolbar.id = 'draw-toolbar';

        // Color picker
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.value = this.currentColor;
        colorPicker.classList.add('draw-color-picker');
        
        colorPicker.addEventListener('input', (e) => {
            this.currentColor = e.target.value;
        });
        this.toolbar.appendChild(colorPicker);

        // Undo button
        this.undoBtn = document.createElement('button');
        this.undoBtn.innerHTML = '<i class="ti ti-arrow-back-up"></i>';
        this.undoBtn.title = 'Undo last stroke (Ctrl+Z)';
        this.undoBtn.addEventListener('click', () => this.undo());
        this.toolbar.appendChild(this.undoBtn);

        // Clear button
        const clearBtn = document.createElement('button');
        clearBtn.innerHTML = '<i class="ti ti-trash"></i>';
        clearBtn.style.backgroundColor = '#ff2121';
        clearBtn.title = 'Clear all drawings';
        clearBtn.addEventListener('click', () => this.clear());
        this.toolbar.appendChild(clearBtn);

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '<i class="ti ti-x"></i>';
        closeBtn.title = 'Exit draw mode';
        closeBtn.addEventListener('click', () => this.close());
        this.toolbar.appendChild(closeBtn);

        document.body.appendChild(this.toolbar);
        this.updateUndoButtonState();
    }

    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseleave', () => this.stopDrawing());

        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            this.canvas.dispatchEvent(mouseEvent);
        });

        // Keyboard shortcuts
        this.keydownHandler = (e) => {
            if (e.key === 'Escape') {
                this.close();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                this.undo();
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                this.clear();
            }
        };
        document.addEventListener('keydown', this.keydownHandler);

        // Resize handler
        this.resizeHandler = () => this.resize();
        window.addEventListener('resize', this.resizeHandler);
    }

    startDrawing(e) {
        this.isDrawing = true;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.points = [{ x, y }];
        this.currentPath = {
            points: [],
            color: this.currentColor,
            lineWidth: 3
        };
    }

    draw(e) {
        if (!this.isDrawing) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.points.push({ x, y });
        this.currentPath.points.push({ x, y });

        // Redraw everything
        this.redrawCanvas();

        // Draw current stroke with smooth curves
        if (this.points.length > 1) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.points[0].x, this.points[0].y);

            // Use quadratic curves for smooth lines
            for (let i = 1; i < this.points.length - 1; i++) {
                const xc = (this.points[i].x + this.points[i + 1].x) / 2;
                const yc = (this.points[i].y + this.points[i + 1].y) / 2;
                this.ctx.quadraticCurveTo(this.points[i].x, this.points[i].y, xc, yc);
            }
            
            // Draw last segment
            if (this.points.length > 1) {
                const last = this.points[this.points.length - 1];
                const secondLast = this.points[this.points.length - 2];
                this.ctx.quadraticCurveTo(secondLast.x, secondLast.y, last.x, last.y);
            }
            
            this.ctx.strokeStyle = '#000000';
            this.ctx.lineWidth = 8;
            this.ctx.stroke();

            this.ctx.strokeStyle = this.currentColor;
            this.ctx.lineWidth = 4;
            this.ctx.stroke();
        }
    }

    stopDrawing() {
        if (this.isDrawing && this.currentPath && this.currentPath.points.length > 0) {
            this.allPaths.push(this.currentPath);
            this.updateUndoButtonState();
        }
        this.isDrawing = false;
        this.points = [];
        this.currentPath = null;
    }

    redrawCanvas() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Redraw all saved paths
        this.allPaths.forEach(path => {
            if (path.points.length > 1) {
                this.ctx.beginPath();
                this.ctx.moveTo(path.points[0].x, path.points[0].y);

                for (let i = 1; i < path.points.length - 1; i++) {
                    const xc = (path.points[i].x + path.points[i + 1].x) / 2;
                    const yc = (path.points[i].y + path.points[i + 1].y) / 2;
                    this.ctx.quadraticCurveTo(path.points[i].x, path.points[i].y, xc, yc);
                }
                
                if (path.points.length > 1) {
                    const last = path.points[path.points.length - 1];
                    const secondLast = path.points[path.points.length - 2];
                    this.ctx.quadraticCurveTo(secondLast.x, secondLast.y, last.x, last.y);
                }
                
                this.ctx.strokeStyle = '#000000';
                this.ctx.lineWidth = 8;
                this.ctx.stroke();

                this.ctx.strokeStyle = path.color;
                this.ctx.lineWidth = 4;
                this.ctx.stroke();
            }
        });
    }

    resize() {
        const oldWidth = this.canvas.width;
        const oldHeight = this.canvas.height;
        const newWidth = window.innerWidth;
        const newHeight = window.innerHeight;

        // Only resize if dimensions changed
        if (oldWidth === newWidth && oldHeight === newHeight) return;

        // Save current drawing as image
        const imageData = oldWidth > 0 ? this.ctx.getImageData(0, 0, oldWidth, oldHeight) : null;

        // Resize canvas
        this.canvas.width = newWidth;
        this.canvas.height = newHeight;

        // Restore drawing context settings
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Redraw all paths (they maintain their absolute positions)
        this.redrawCanvas();
    }

    clear() {
        this.allPaths = [];
        this.points = [];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.updateUndoButtonState();
    }

    undo() {
        if (this.allPaths.length > 0) {
            this.allPaths.pop();
            this.redrawCanvas();
            this.updateUndoButtonState();
        }
    }

    updateUndoButtonState() {
        if (this.undoBtn) {
            this.undoBtn.disabled = this.allPaths.length === 0;
            this.undoBtn.style.opacity = this.allPaths.length === 0 ? '0.5' : '1';
            this.undoBtn.style.cursor = this.allPaths.length === 0 ? 'not-allowed' : 'pointer';
        }
    }

    show() {
        this.canvas.style.display = 'block';
        this.toolbar.style.display = 'flex';
    }

    close() {
        this.canvas.style.display = 'none';
        this.toolbar.classList.add('draw-toolbar-closing');
        setTimeout(() => {
            this.toolbar.style.display = 'none';
            this.toolbar.classList.remove('draw-toolbar-closing');
        }, 200);
        this.clear();
    }

    destroy() {
        // Clean up event listeners
        window.removeEventListener('resize', this.resizeHandler);
        document.removeEventListener('keydown', this.keydownHandler);
        
        // Remove DOM elements
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        if (this.toolbar && this.toolbar.parentNode) {
            this.toolbar.parentNode.removeChild(this.toolbar);
        }
        
        // Clear singleton reference
        Draw.instance = null;
    }
}