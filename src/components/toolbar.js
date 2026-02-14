export function createToolbar(onSplitLayout, onOpenMenu) {
    const toolbar = document.createElement('div');
    toolbar.id = 'toolbar';

    const startSplitLayoutButton = document.createElement('button');
    startSplitLayoutButton.type = 'button';
    startSplitLayoutButton.innerHTML = '<i class="ti ti-layout-rows"></i>';
    startSplitLayoutButton.addEventListener('click', () => {
        if (typeof onSplitLayout === 'function') {
            onSplitLayout();
        }
    });

    const openMenuButton = document.createElement('button');
    openMenuButton.type = 'button';
    openMenuButton.innerHTML = '<i class="ti ti-menu"></i>';
    openMenuButton.addEventListener('click', () => {
        if (typeof onOpenMenu === 'function') {
            onOpenMenu();
        }
    });

    toolbar.appendChild(startSplitLayoutButton);
    toolbar.appendChild(openMenuButton);
    const spacer = document.createElement('div');
    spacer.className = 'toolbar-spacer';
    toolbar.appendChild(spacer); // push buttons to the left
    const loader = document.createElement('div');
    loader.className = 'loader';
    loader.id = 'toolbar-loader';
    toolbar.appendChild(loader); // loading animation
    return toolbar;
}