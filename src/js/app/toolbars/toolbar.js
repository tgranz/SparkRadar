import Toast from "../../ui/toast";

export function createToolbar(onSplitMap, onOpenMenu, onRadarStatusClick, onLayerPickerClick, onDrawClick, onSplit3d, onInspectorClick, onFinderClick, onAnimationClick, onMeasureClick) {    
    // Create main toolbar
    const toolbar = document.createElement('div');
    toolbar.id = 'toolbar';

    // Create main toolbar buttons
    const openMenuButton = document.createElement('button');
    openMenuButton.type = 'button';
    openMenuButton.innerHTML = '<i class="ti ti-menu-2"></i>';
    openMenuButton.title = 'Open menu';
    openMenuButton.addEventListener('click', () => {
        if (typeof onOpenMenu === 'function') {
            onOpenMenu();
        }
    });

    const openLayerPickerButton = document.createElement('button');
    openLayerPickerButton.type = 'button';
    openLayerPickerButton.id = 'open-layer-picker-button';
    openLayerPickerButton.innerHTML = '<i class="ti ti-stack-2"></i>';
    openLayerPickerButton.style.fontSize = '1.3em'; // this icon looks smaller than the others, so make it bigger
    openLayerPickerButton.title = 'Open layer menu';
    openLayerPickerButton.addEventListener('click', () => {
        if (typeof onLayerPickerClick === 'function') {
            onLayerPickerClick();
        }
    });

    const startSplitLayoutButton = document.createElement('button');
    startSplitLayoutButton.type = 'button';
    startSplitLayoutButton.id = 'dual-map-button';
    startSplitLayoutButton.innerHTML = '<i class="ti ti-layout-rows"></i>';
    startSplitLayoutButton.title = 'Dual-radar view';
    startSplitLayoutButton.addEventListener('click', () => {
        if (window.appmode === 'satellite') {
            return;
        }
        if (typeof onSplitMap === 'function') {
            onSplitMap();
        }
    });

    // Create toolbox container and button
    const toolbox = document.createElement('div');
    toolbox.id = 'toolbar-toolbox';
    toolbox.classList.add('toolbox-hidden');

    const toolboxButton = document.createElement('button');
    toolboxButton.type = 'button';
    toolboxButton.id = 'toolbox-button';
    toolboxButton.innerHTML = '<i class="ti ti-tool"></i>';
    toolboxButton.title = 'Tools';

    toolboxButton.addEventListener('click', () => {
        const isHidden = toolbox.classList.contains('toolbox-hidden');
        const isClosing = toolbox.classList.contains('toolbox-closing');

        if (isHidden || isClosing) {
            toolbox.classList.remove('toolbox-hidden', 'toolbox-closing');
            toolbox.classList.add('toolbox-opening');
            return;
        }

        toolbox.classList.remove('toolbox-opening');
        toolbox.classList.add('toolbox-closing');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            toolbox.classList.remove('toolbox-opening');
            toolbox.classList.add('toolbox-closing');
        }
    });

    toolbox.addEventListener('animationend', () => {
        if (toolbox.classList.contains('toolbox-closing')) {
            toolbox.classList.remove('toolbox-closing');
            toolbox.classList.add('toolbox-hidden');
            toolboxButton.classList.remove('selected');
        }

        if (toolbox.classList.contains('toolbox-opening')) {
            toolbox.classList.remove('toolbox-opening');
            toolboxButton.classList.add('selected');
        }
    });

    // Create tool buttons (inside toolbox)
    const finderButton = document.createElement('button');
    finderButton.type = 'button';
    finderButton.innerHTML = '<i class="ti ti-search"></i>';
    finderButton.title = 'Finder';
    finderButton.addEventListener('click', () => {
        if (typeof onFinderClick === 'function') {
            onFinderClick();
        }
    });

    const drawDiv = document.createElement('div');
    const drawButton = document.createElement('button');
    drawButton.type = 'button';
    drawButton.innerHTML = '<i class="ti ti-pencil"></i>';
    drawButton.title = 'Draw on map';
    drawButton.addEventListener('click', () => {
        if (typeof onDrawClick === 'function') {
            onDrawClick();
            const isHidden = toolbox.classList.contains('toolbox-hidden');
            const isClosing = toolbox.classList.contains('toolbox-closing');

            if (isHidden || isClosing) {
                toolbox.classList.remove('toolbox-hidden', 'toolbox-closing');
                toolbox.classList.add('toolbox-opening');
                return;
            }

            toolbox.classList.remove('toolbox-opening');
            toolbox.classList.add('toolbox-closing');
        }
    });
    const drawLabel = document.createElement('span');
    drawLabel.textContent = 'Draw';
    drawDiv.appendChild(drawButton);
    drawDiv.appendChild(drawLabel);

    const measureDiv = document.createElement('div');
    const measureButton = document.createElement('button');
    measureButton.type = 'button';
    measureButton.id = 'measure-button';
    measureButton.innerHTML = '<i class="ti ti-ruler-2"></i>';
    measureButton.title = 'Measure distance';
    measureButton.addEventListener('click', () => {
        if (typeof onMeasureClick === 'function') {
            onMeasureClick();
        }
    });
    const measureLabel = document.createElement('span');
    measureLabel.textContent = 'Measure';
    measureDiv.appendChild(measureButton);
    measureDiv.appendChild(measureLabel);

    const inspectorDiv = document.createElement('div');
    const inspectorButton = document.createElement('button');
    inspectorButton.type = 'button';
    inspectorButton.id = 'inspector-button';
    inspectorButton.innerHTML = '<i class="ti ti-viewfinder"></i>';
    inspectorButton.title = 'Inspect radar gates';
    inspectorButton.addEventListener('click', () => {
        if (window.appmode === 'satellite') {
            return;
        }
        if (typeof onInspectorClick === 'function') {
            onInspectorClick();
        }
    });
    const inspectorLabel = document.createElement('span');
    inspectorLabel.textContent = 'Inspector';
    inspectorDiv.appendChild(inspectorButton);
    inspectorDiv.appendChild(inspectorLabel);
    
    const animationDiv = document.createElement('div');
    const animationButton = document.createElement('button');
    animationButton.type = 'button';
    animationButton.id = 'animation-button';
    animationButton.innerHTML = '<i class="ti ti-player-play"></i>';
    animationButton.title = 'Animate past scans';
    animationButton.addEventListener('click', () => {
        if (window.appmode === 'satellite') {
            return;
        }
        if (typeof onAnimationClick === 'function') {
            onAnimationClick();
            const isHidden = toolbox.classList.contains('toolbox-hidden');
            const isClosing = toolbox.classList.contains('toolbox-closing');

            if (isHidden || isClosing) {
                toolbox.classList.remove('toolbox-hidden', 'toolbox-closing');
                toolbox.classList.add('toolbox-opening');
                return;
            }

            toolbox.classList.remove('toolbox-opening');
            toolbox.classList.add('toolbox-closing');
        }
    });
    const animationLabel = document.createElement('span');
    animationLabel.textContent = 'Animate';
    animationDiv.appendChild(animationButton);
    animationDiv.appendChild(animationLabel);

    const crossSectionDiv = document.createElement('div');
    const crossSectionButton = document.createElement('button');
    crossSectionButton.type = 'button';
    crossSectionButton.id = 'cross-section-button';
    crossSectionButton.innerHTML = '<i class="ti ti-line"></i>';
    crossSectionButton.title = 'Cross-section view';
    crossSectionButton.addEventListener('click', () => {
        if (window.appmode === 'satellite') {
            return;
        }
        if (typeof onSplit3d === 'function') {
            onSplit3d();
        }
    });
    const crossSectionLabel = document.createElement('span');
    crossSectionLabel.textContent = 'Cross-section';
    crossSectionDiv.appendChild(crossSectionButton);
    crossSectionDiv.appendChild(crossSectionLabel);

    // Create bottom UI elements
    const loader = document.createElement('div');
    loader.className = 'loader';
    loader.id = 'toolbar-loader';

    const spacer = document.createElement('div');
    spacer.className = 'toolbar-spacer';

    const stationInfoDiv = document.createElement('div');
    stationInfoDiv.id = 'toolbar-station-info';
    stationInfoDiv.textContent = '';

    const stationInfo = document.createElement('div');
    stationInfo.textContent = '';
    stationInfo.id = 'toolbar-station';

    const vcpInfo = document.createElement('div');
    vcpInfo.id = 'toolbar-vcp';
    vcpInfo.textContent = 'VCP --';

    // Handle responsive station info layout
    const updateStationInfoLayout = () => {
        if (window.innerWidth <= 550) {
            stationInfoDiv.id = 'toolbar-station-info-mobile';
        } else {
            stationInfoDiv.id = 'toolbar-station-info';
        }
    };
    updateStationInfoLayout();
    window.addEventListener('resize', updateStationInfoLayout);

    // Add station info click handler
    stationInfoDiv.addEventListener('click', () => {
        if (window.appmode === 'satellite') {
            return;
        }
        if (typeof onRadarStatusClick === 'function') {
            onRadarStatusClick();
        }
    });

    const setElementVisibleAndEnabled = (element, button, visible) => {
        if (!element || !button) return;
        element.classList.toggle('hidden', !visible);
        if (typeof window.setToolEnabled === 'function') {
            window.setToolEnabled(button, visible);
        } else {
            button.disabled = !visible;
            button.setAttribute('aria-disabled', String(!visible));
            button.style.pointerEvents = visible ? '' : 'none';
            button.style.color = visible ? '' : 'gray';
        }
    };

    const applyModeState = (mode) => {
        const normalized = mode === 'satellite' ? 'satellite' : 'radar';
        const isSatellite = normalized === 'satellite';

        if (typeof window.setToolEnabled === 'function') {
            window.setToolEnabled(startSplitLayoutButton, !isSatellite);
        } else {
            startSplitLayoutButton.disabled = isSatellite;
            startSplitLayoutButton.setAttribute('aria-disabled', String(isSatellite));
            startSplitLayoutButton.style.pointerEvents = isSatellite ? 'none' : '';
            startSplitLayoutButton.style.color = isSatellite ? 'gray' : '';
        }
        startSplitLayoutButton.style.opacity = isSatellite ? '0.45' : '';
        startSplitLayoutButton.title = isSatellite ? 'Dual-radar view unavailable in satellite mode' : 'Dual-radar view';

        stationInfoDiv.classList.toggle('hidden', isSatellite);
        stationInfoDiv.style.pointerEvents = isSatellite ? 'none' : '';
        stationInfoDiv.setAttribute('aria-hidden', String(isSatellite));

        setElementVisibleAndEnabled(inspectorDiv, inspectorButton, !isSatellite);
        setElementVisibleAndEnabled(animationDiv, animationButton, !isSatellite);
        setElementVisibleAndEnabled(crossSectionDiv, crossSectionButton, !isSatellite);

        if (isSatellite && !toolbox.classList.contains('toolbox-hidden')) {
            toolbox.classList.remove('toolbox-opening');
            toolbox.classList.add('toolbox-closing');
        }
    };

    document.addEventListener('dataModeChanged', (event) => {
        applyModeState(event?.detail?.mode);
    });
    applyModeState(window.appmode || 'radar');

    // Assemble toolbar hierarchy
    toolbar.appendChild(openMenuButton);
    toolbar.appendChild(openLayerPickerButton);
    toolbar.appendChild(startSplitLayoutButton);
    toolbar.appendChild(toolboxButton);
    toolbar.appendChild(finderButton);
    toolbar.appendChild(loader);
    toolbar.appendChild(spacer);

    // Assemble toolbox
    toolbox.appendChild(inspectorDiv);
    toolbox.appendChild(drawDiv);
    toolbox.appendChild(measureDiv);
    toolbox.appendChild(animationDiv);
    toolbox.appendChild(crossSectionDiv);
    document.body.appendChild(toolbox);

    // Assemble station info
    stationInfoDiv.appendChild(stationInfo);
    stationInfoDiv.appendChild(vcpInfo);
    document.body.appendChild(stationInfoDiv);

    return toolbar;
}