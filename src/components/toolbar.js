export function createToolbar(onSplitLayout, onOpenMenu, onRadarStatusClick, onLayerPickerClick) {    
    const toolbar = document.createElement('div');
    toolbar.id = 'toolbar';

    const startSplitLayoutButton = document.createElement('button');
    startSplitLayoutButton.type = 'button';
    startSplitLayoutButton.innerHTML = '<i class="ti ti-layout-rows"></i>';
    startSplitLayoutButton.title = 'Dual-radar view';
    startSplitLayoutButton.addEventListener('click', () => {
        if (typeof onSplitLayout === 'function') {
            onSplitLayout();
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

    const openLayerPickerButton = document.createElement('button');
    openLayerPickerButton.type = 'button';
    openLayerPickerButton.innerHTML = '<i class="ti ti-stack-2"></i>';
    openLayerPickerButton.style.fontSize = '1.3em'; // this icon looks smaller than the others, so make it bigger
    openLayerPickerButton.title = 'Open layer menu';
    openLayerPickerButton.addEventListener('click', () => {
        if (typeof onLayerPickerClick === 'function') {
            onLayerPickerClick();
        }
    });

    toolbar.appendChild(openMenuButton);
    toolbar.appendChild(startSplitLayoutButton);
    toolbar.appendChild(openLayerPickerButton);

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