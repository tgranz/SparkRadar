export function createToolbar(onSplitMap, onOpenMenu, onRadarStatusClick, onLayerPickerClick, onDrawClick, onSplit3d, onInspectorClick) {    
    const toolbar = document.createElement('div');
    toolbar.id = 'toolbar';

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
    startSplitLayoutButton.innerHTML = '<i class="ti ti-layout-rows"></i>';
    startSplitLayoutButton.title = 'Dual-radar view';
    startSplitLayoutButton.addEventListener('click', () => {
        if (typeof onSplitMap === 'function') {
            onSplitMap();
        }
    });

    const start3dButton = document.createElement('button');
    start3dButton.type = 'button';
    start3dButton.innerHTML = '<i class="ti ti-chart-scatter"></i>';
    start3dButton.title = '3D radar view';
    start3dButton.addEventListener('click', () => {
        if (typeof onSplit3d === 'function') {
            onSplit3d();
        }
    });

    const openMenuButton = document.createElement('button');
    openMenuButton.type = 'button';
    openMenuButton.innerHTML = '<i class="ti ti-menu-2"></i>';
    openMenuButton.title = 'Open menu';
    openMenuButton.addEventListener('click', () => {
        if (typeof onOpenMenu === 'function') {
            onOpenMenu();
        }
    });

    toolbar.appendChild(openMenuButton);
    toolbar.appendChild(openLayerPickerButton);
    toolbar.appendChild(startSplitLayoutButton);
    //toolbar.appendChild(start3dButton);

    // Toolbox
    const toolboxButton = document.createElement('button');
    toolboxButton.type = 'button';
    toolboxButton.innerHTML = '<i class="ti ti-tool"></i>';
    toolboxButton.title = 'Toolbox';
    toolbar.appendChild(toolboxButton);

    const toolbox = document.createElement('div');
    toolbox.id = 'toolbar-toolbox';
    toolbox.classList.add('toolbox-hidden');

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

    document.body.appendChild(toolbox);

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

    const inspectorDiv = document.createElement('div');

    const inspectorButton = document.createElement('button');
    inspectorButton.type = 'button';
    inspectorButton.id = 'inspector-button';
    inspectorButton.innerHTML = '<i class="ti ti-viewfinder"></i>';
    inspectorButton.title = 'Inspector';
    inspectorButton.addEventListener('click', () => {
        if (typeof onInspectorClick === 'function') {
            onInspectorClick();
        }
    });

    inspectorDiv.appendChild(inspectorButton);
    const inspectorLabel = document.createElement('span');
    inspectorLabel.textContent = 'Inspector';
    inspectorDiv.appendChild(inspectorLabel);

    toolbox.appendChild(inspectorDiv);
    toolbox.appendChild(drawDiv);

    const loader = document.createElement('div');
    loader.className = 'loader';
    loader.id = 'toolbar-loader';
    toolbar.appendChild(loader);

    const spacer = document.createElement('div');
    spacer.className = 'toolbar-spacer';
    toolbar.appendChild(spacer); // push everything to the left

    const stationInfoDiv = document.createElement('div');
    stationInfoDiv.id = 'toolbar-station-info';
    stationInfoDiv.textContent = '';
    document.body.appendChild(stationInfoDiv);

    if (window.innerWidth <= 450) {
        stationInfoDiv.id = 'toolbar-station-info-mobile';
    } else {
        stationInfoDiv.id = 'toolbar-station-info';
    }

    window.onresize = () => {
        if (window.innerWidth <= 450) {
            stationInfoDiv.id = 'toolbar-station-info-mobile';
        } else {
            stationInfoDiv.id = 'toolbar-station-info';
        }
    };

    const stationInfo = document.createElement('div');
    stationInfo.textContent = '';
    stationInfo.id = 'toolbar-station';
    stationInfoDiv.appendChild(stationInfo);
    stationInfoDiv.addEventListener('click', () => {
        if (typeof onRadarStatusClick === 'function') {
            onRadarStatusClick();
        }
    });

    const vcpInfo = document.createElement('div');
    vcpInfo.id = 'toolbar-vcp';
    vcpInfo.textContent = 'VCP --';
    stationInfoDiv.appendChild(vcpInfo);

    return toolbar;
}