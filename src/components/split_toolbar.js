export function createSplitToolbar(onSplitLayoutToggle, onStopSplit) {
    const toolbar = document.createElement('div');
    toolbar.id = 'split-toolbar';

    const stopSplitScreenButton = document.createElement('button');
    stopSplitScreenButton.type = 'button';
    stopSplitScreenButton.innerHTML = '<i class="ti ti-x"></i>';
    stopSplitScreenButton.addEventListener('click', () => {
        if (typeof onStopSplit === 'function') {
            onStopSplit();
        }
    });

    const splitScreenLayoutChooser = document.createElement('button');
    splitScreenLayoutChooser.type = 'button';
    splitScreenLayoutChooser.innerHTML = '<i class="ti ti-columns-2"></i>';
    splitScreenLayoutChooser.addEventListener('click', () => {
        if (typeof onSplitLayoutToggle === 'function') {
            onSplitLayoutToggle();
            if (splitScreenLayoutChooser.innerHTML.includes('ti-columns-2')) {
                splitScreenLayoutChooser.innerHTML = '<i class="ti ti-layout-rows"></i>';
                toolbar.style.setProperty('flex-direction', 'column');
            } else {
                splitScreenLayoutChooser.innerHTML = '<i class="ti ti-columns-2"></i>';
                toolbar.style.setProperty('flex-direction', 'row');
            }
        }
    });

    toolbar.appendChild(stopSplitScreenButton);
    toolbar.appendChild(splitScreenLayoutChooser);
    return toolbar;
}