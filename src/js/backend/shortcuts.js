export default function setupKeybinds(callbacks = {}) {
  window.addEventListener('keydown', (e) => {
    const target = e.target;
    const tagName = target?.tagName;

    // Ignore key presses when focused on input fields, textareas, or contenteditable elements
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable) return;

    const pressedKey = String(e.key || '').toLowerCase();
    const getShortcut = (key, fallback) => {
        const value = window.settingsInstance?.getSetting(key);
        if (typeof value !== 'string') return fallback;
        return value.trim().slice(0, 1).toLowerCase();
    };

    if (pressedKey && pressedKey === getShortcut('shortcutToggleSplitView', 'm')) {
        callbacks.toggleSplitMap?.();
    } else if (pressedKey && pressedKey === getShortcut('shortcutToggleCrossSection', 'x')) {
        callbacks.toggleCrossSectionView?.();
    } else if (pressedKey && pressedKey === getShortcut('shortcutShowRadarStatus', 's')) {
        callbacks.showRadarStatus?.();
    } else if (pressedKey && pressedKey === getShortcut('shortcutShowMenu', 'h')) {
        callbacks.showMenu?.();
    } else if (pressedKey && pressedKey === getShortcut('shortcutShowLayerMenu', 'l')) {
        callbacks.showLayerMenu?.();
    } else if (pressedKey && pressedKey === getShortcut('shortcutDraw', 'd')) {
        callbacks.startDraw?.();
    } else if (pressedKey && pressedKey === getShortcut('shortcutFinder', 'f')) {
        callbacks.showFinder?.();
    } else if (pressedKey && pressedKey === getShortcut('shortcutInspector', 'i')) {
        callbacks.toggleInspector?.();
    } else if (pressedKey && pressedKey === getShortcut('shortcutMeasure', 'n')) {
        callbacks.startMeasure?.();
    } else if (pressedKey && pressedKey === getShortcut('shortcutProductReflectivity', '1')) {
        callbacks.setRadar?.(null, 'N0B', 'main') // Reflectivity
    } else if (pressedKey && pressedKey === getShortcut('shortcutProductVelocity', '2')) {
        callbacks.setRadar?.(null, 'N0G', 'main') // Velocity
    } else if (pressedKey && pressedKey === getShortcut('shortcutProductCorrelationCoefficient', '3')) {
        callbacks.setRadar?.(null, 'N0C', 'main') // Correlation Coefficient
    } else if (pressedKey && pressedKey === getShortcut('shortcutProductHydrometeorClassification', '4')) {
        callbacks.setRadar?.(null, 'N0H', 'main') // Hydrometer Classification
    } else if (pressedKey && pressedKey === getShortcut('shortcutProductSpecificDifferentialPhase', '5')) {
        callbacks.setRadar?.(null, 'N0K', 'main') // Specific Differential Phase
    }
    });
}