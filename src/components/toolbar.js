export function createToolbar(onSplitLayout, onOpenMenu) {
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

    toolbar.appendChild(openMenuButton);
    toolbar.appendChild(startSplitLayoutButton);
    const spacer = document.createElement('div');
    spacer.className = 'toolbar-spacer';
    toolbar.appendChild(spacer); // push buttons to the left

    const loader = document.createElement('div');
    loader.className = 'loader';
    loader.id = 'toolbar-loader';
    toolbar.appendChild(loader); // loading animation

    const stationInfoDiv = document.createElement('div');
    stationInfoDiv.id = 'toolbar-station-info';
    stationInfoDiv.textContent = '';
    toolbar.appendChild(stationInfoDiv);

    const stationInfo = document.createElement('div');
    stationInfo.id = 'toolbar-station';
    stationInfo.textContent = '';
    stationInfoDiv.appendChild(stationInfo);

    const vcpInfo = document.createElement('div');
    vcpInfo.id = 'toolbar-vcp';
    vcpInfo.textContent = 'VCP --';
    stationInfoDiv.appendChild(vcpInfo);

    return toolbar;
}