import { getPastScans } from '../../parse/fetch.js';
import Toast from '../ui/toast.js';
import { showLoadingAnimation, hideLoadingAnimation } from '../ui/loader.js';

export default class AnimationController {
    constructor() {
        this.frames = [];
        this.currentFrameIndex = 0;
        this.isPlaying = false;
        this.playTimer = null;
        this.frameDelay = 500; // ms between frames
        this.radar = null;
        this.map = null;
        this.isLoading = false;
        this.currentStation = null;
        this.currentProduct = null;
        this.currentLevel = null;
        this.mainOrSplit = 'main';
        
        this._createUI();
    }
    
    _createUI() {
        const animationControllerDiv = document.createElement('div');
        animationControllerDiv.id = 'anim-container';
        animationControllerDiv.classList.add('anim-hidden'); // Hidden by default
        document.body.appendChild(animationControllerDiv);

        // Animation slider
        this.animationSlider = document.createElement('input');
        this.animationSlider.type = 'range';
        this.animationSlider.min = '0';
        this.animationSlider.max = '0';
        this.animationSlider.value = '0';
        this.animationSlider.addEventListener('input', () => this._onSliderChange());
        animationControllerDiv.appendChild(this.animationSlider);

        // Controls container
        const controls = document.createElement('div');
        controls.classList.add('anim-controls');
        animationControllerDiv.appendChild(controls);

        // Control functions wrapper
        const wrapper = document.createElement('div');
        wrapper.classList.add('anim-controls-wrapper');
        controls.appendChild(wrapper);

        // Previous frame button
        this.prevFrameButton = document.createElement('button');
        this.prevFrameButton.innerHTML = '<i class="ti ti-player-track-prev"></i>';
        this.prevFrameButton.title = 'Previous frame';
        this.prevFrameButton.addEventListener('click', () => this.stepBackward());
        wrapper.appendChild(this.prevFrameButton);

        // Play/Pause button
        this.playPauseButton = document.createElement('button');
        this.playPauseButton.innerHTML = '<i class="ti ti-player-play"></i>';
        this.playPauseButton.title = 'Play/Pause';
        this.playPauseButton.addEventListener('click', () => this.togglePlayPause());
        this.playPauseShortcutListener = document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.repeat && !e.target.matches('input, textarea')) {
                e.preventDefault();
                this.togglePlayPause();
            }
        });
        wrapper.appendChild(this.playPauseButton);

        // Next frame button
        this.nextFrameButton = document.createElement('button');
        this.nextFrameButton.innerHTML = '<i class="ti ti-player-track-next"></i>';
        this.nextFrameButton.title = 'Next frame';
        this.nextFrameButton.addEventListener('click', () => this.stepForward());
        wrapper.appendChild(this.nextFrameButton);

        // Close button
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '<i class="ti ti-x"></i>';
        closeButton.title = 'Exit animation mode';
        closeButton.addEventListener('click', () => this.stop());
        this.escListener = document.addEventListener('keydown', (e) => {
            if (e.code === 'Escape' && !e.repeat) {
                e.preventDefault();
                this.stop();
            }
        });
        controls.appendChild(closeButton);

        this.containerDiv = animationControllerDiv;
    }

    initialize(radar, map) {
        this.radar = radar;
        this.map = map;
    }

    async start(station, product, level, mainOrSplit = 'main') {
        if (this.isLoading) return;
        showLoadingAnimation();
        
        this.currentStation = station;
        this.currentProduct = product;
        this.currentLevel = level;
        this.mainOrSplit = mainOrSplit;
        
        this.isLoading = true;
        
        try {
            const levelNum = level === 'L2' ? 2 : 3;
            const requestedFrames = this._getConfiguredFrameCount();
            const scans = await getPastScans(station, levelNum, product, requestedFrames);
            
            if (scans.length === 0) {
                new Toast('Could not load frames for this station.').show();
                this.isLoading = false;
                return;
            }
            
            this.frames = scans.map(scan => ({
                url: scan.url,
                timestamp: scan.timestamp,
                fileName: scan.fileName,
                loaded: false,
                meshData: null,
                bounds: null
            }));
            
            this.currentFrameIndex = this.frames.length - 1; // Start at most recent
            this.animationSlider.max = String(this.frames.length - 1);
            this.animationSlider.value = String(this.currentFrameIndex);
            
            // Show UI
            this.containerDiv.classList.remove('anim-hidden');
            
            // Load the current (latest) frame first
            await this._loadFrame(this.currentFrameIndex);
            this._displayCurrentFrame();
            
            new Toast(`Ready to animate.`).show();
            this.isLoading = false;
            hideLoadingAnimation();
            
        } catch (error) {
            console.error('Error starting animation:', error);
            new Toast('Failed to load frames.').show();
            this.isLoading = false;
            hideLoadingAnimation();
        }
    }

    stop() {
        this.pause();
        this.frames = [];
        this.currentFrameIndex = 0;
        this.containerDiv.classList.add('anim-hidden');
        hideLoadingAnimation();
        
        // Return to live radar - reload current station
        if (window.setRadar && this.currentStation && this.currentProduct) {
            window.setRadar(this.currentStation, this.currentProduct, this.mainOrSplit);
        }

        // Remove all event handlers
        if (this.playPauseShortcutListener) {
            document.removeEventListener('keydown', this.playPauseShortcutListener);
            this.playPauseShortcutListener = null;
        }
        if (this.escListener) {
            document.removeEventListener('keydown', this.escListener);
            this.escListener = null;
        }
    }

    async _loadFrame(index) {
        if (index < 0 || index >= this.frames.length) return;
        const frame = this.frames[index];
        
        if (frame.loaded) return;
        
        try {
            const result = await this.radar.getRadarLayer(
                this.currentStation,
                this.currentProduct,
                {
                    fromUrl: frame.url,
                    includeGeojson: false
                }
            );
            
            if (result?.meshData) {
                frame.meshData = result.meshData;
                frame.bounds = result.bounds;
                frame.loaded = true;
            }
        } catch (error) {
            console.error(`Failed to load frame ${index}:`, error);
        }
    }

    _displayCurrentFrame() {
        const frame = this.frames[this.currentFrameIndex];
        if (!frame) return;

        // Update the picker timestamp while bypassing stale-age color warnings for archive frames.
        const picker = this.mainOrSplit === 'split' ? this.map?.splitRadarPicker : this.map?.radarPicker;
        if (picker && typeof picker.setTimeAndTilt === 'function' && frame.timestamp) {
            const date = new Date(frame.timestamp);
            const frameTime = date.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            picker.setTimeAndTilt(frameTime, picker.radarTilt ?? '--', frame.timestamp, { ignoreAgeColoring: true });
        }
        
        // Display frame on map
        if (frame.loaded && frame.meshData && frame.bounds) {
            this.map.addWebGlRadarMesh(
                frame.meshData,
                frame.bounds,
                this.mainOrSplit,
                this.currentProduct
            );
        }
    }

    async _onSliderChange() {
        const newIndex = parseInt(this.animationSlider.value);
        if (newIndex === this.currentFrameIndex) return;
        
        this.currentFrameIndex = newIndex;
        
        // Load frame if not loaded yet
        if (!this.frames[this.currentFrameIndex]?.loaded) {
            await this._loadFrame(this.currentFrameIndex);
        }
        
        this._displayCurrentFrame();
        
        // Preload adjacent frames
        this._preloadAdjacentFrames();
    }

    async _preloadAdjacentFrames() {
        const toLoad = [
            this.currentFrameIndex - 2,
            this.currentFrameIndex - 1,
            this.currentFrameIndex + 1,
            this.currentFrameIndex + 2
        ].filter(i => i >= 0 && i < this.frames.length && !this.frames[i]?.loaded);
        
        for (const i of toLoad) {
            await this._loadFrame(i);
        }
    }

    togglePlayPause() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    async stepForward() {
        if (this.frames.length === 0) return;

        this.currentFrameIndex = (this.currentFrameIndex + 1) % this.frames.length;
        this.animationSlider.value = String(this.currentFrameIndex);

        if (!this.frames[this.currentFrameIndex]?.loaded) {
            await this._loadFrame(this.currentFrameIndex);
        }

        this._displayCurrentFrame();
        this._preloadAdjacentFrames();
    }

    async stepBackward() {
        if (this.frames.length === 0) return;

        this.currentFrameIndex = (this.currentFrameIndex - 1 + this.frames.length) % this.frames.length;
        this.animationSlider.value = String(this.currentFrameIndex);

        if (!this.frames[this.currentFrameIndex]?.loaded) {
            await this._loadFrame(this.currentFrameIndex);
        }

        this._displayCurrentFrame();
        this._preloadAdjacentFrames();
    }

    play() {
        if (this.isPlaying || this.frames.length === 0) return;
        
        this.isPlaying = true;
        this.playPauseButton.innerHTML = '<i class="ti ti-player-pause"></i>';
        
        // Preload all frames in the background
        this._preloadAllFrames();
        
        const scheduleNextFrame = () => {
            if (!this.isPlaying || this.frames.length === 0) {
                return;
            }

            this.currentFrameIndex = (this.currentFrameIndex + 1) % this.frames.length;
            this.animationSlider.value = String(this.currentFrameIndex);
            
            if (!this.frames[this.currentFrameIndex]?.loaded) {
                this._loadFrame(this.currentFrameIndex).then(() => {
                    this._displayCurrentFrame();
                });
            } else {
                this._displayCurrentFrame();
            }

            const isLastFrame = this.currentFrameIndex === this.frames.length - 1;
            const framePause = isLastFrame ? this.frameDelay * 3 : this.frameDelay;
            this.playTimer = setTimeout(scheduleNextFrame, framePause);
        };

        const initialDelay = this.currentFrameIndex === this.frames.length - 1
            ? this.frameDelay * 3
            : this.frameDelay;
        this.playTimer = setTimeout(scheduleNextFrame, initialDelay);
    }

    pause() {
        if (!this.isPlaying) return;
        
        this.isPlaying = false;
        this.playPauseButton.innerHTML = '<i class="ti ti-player-play"></i>';
        
        if (this.playTimer) {
            clearTimeout(this.playTimer);
            this.playTimer = null;
        }
    }

    async _preloadAllFrames() {
        for (let i = 0; i < this.frames.length; i++) {
            if (!this.frames[i]?.loaded) {
                await this._loadFrame(i);
            }
        }
    }

    _getConfiguredFrameCount() {
        const settings = window.settingsInstance;
        const configuredCount = Number(settings?.getSetting('animationFrameCount'));
        const cacheSlotLimit = Number(settings?.getSetting('cacheMaxSlots'));
        const effectiveMax = Number.isFinite(cacheSlotLimit) ? Math.max(3, cacheSlotLimit) : 40;

        if (!Number.isFinite(configuredCount)) {
            return Math.min(15, effectiveMax);
        }

        return Math.max(3, Math.min(effectiveMax, Math.round(configuredCount)));
    }
}