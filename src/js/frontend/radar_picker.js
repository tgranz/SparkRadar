/*

> radar_picker.js
This module handles the radar picker menu.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

const productLabels = {
    'N_B': 'Base Reflectivity',
    'N_G': 'Base Velocity',
    'N_C': 'Correlation Coefficient',
    'N_K': 'Specific Differential Phase',
    'N_H': 'Hydrometeor Classification',
    'HHC': 'Hybrid Hydrometeor Classification',
    'N_X': 'Differential Reflectivity',
    'N_S': 'Storm Relative Velocity',
    'N_U': 'Storm Relative Velocity',
    'DAA': '1-hr Precipitation Accumulation',
    'DTA': 'Storm Total Accumulation',
    'EET': 'Enhanced Echo Tops',
    'NVL': 'Vertically Integrated Liquid',
    'REF': 'Super-Res Base Reflectivity',
    'VEL': 'Super-Res Base Velocity',
    'CC': 'Super-Res Correlation Coefficient',
    'KDP': 'Super-Res Specific Differential Phase',
    'SW': 'Super-Res Spectrum Width',
    'ZDR': 'Super-Res Differential Reflectivity'
};

const productEntries = [
    { type: 'header', label: 'Standard Products (Level III)' },
    { type: 'item', code: 'N_B', tilts: ['0', 'A', '1', '2', 'B', '3'] },
    { type: 'item', code: 'N_G', tilts: ['0', 'A', '1'] },
    { type: 'item', code: 'N_C', tilts: ['0', 'A', '1', '2', 'B', '3'] },
    { type: 'item', code: 'N_X', tilts: ['0', 'A', '1', '2', 'B', '3'] },
    { type: 'item', code: 'N_K', tilts: ['0', 'A', '1', '2', 'B', '3'] },
    { type: 'item', code: 'N_H', tilts: ['0', '1', '2', '3'] },
    { type: 'item', code: 'N_S', tilts: ['0', '2', '3'] },
    { type: 'item', code: 'HHC', tilts: [] },
    { type: 'item', code: 'DAA', tilts: [] },
    { type: 'item', code: 'DTA', tilts: [] },
    //{ type: 'item', code: 'NST', tilts: [] },
    //{ type: 'item', code: 'NMD', tilts: [] },
    { type: 'header', label: 'Super-Res Products (Level II, BETA)' },
    { type: 'item', code: 'REF', hasTiltOptions: false },
    { type: 'item', code: 'VEL', hasTiltOptions: false },
    { type: 'item', code: 'CC', hasTiltOptions: false },
    { type: 'item', code: 'ZDR', hasTiltOptions: false },
    //{ type: 'item', code: 'KDP', hasTiltOptions: false }, gate values are VERY wrong, use L3 instead
    { type: 'item', code: 'SW', hasTiltOptions: false },
];

const satelliteEntries = [
    { type: 'header', label: 'GOES-16 (West)' },
    { type: 'item', code: 'west/conus_ch01', displayName: 'B1 - Blue Visible' },
    { type: 'item', code: 'west/conus_ch02', displayName: 'B2 - Red Visible' },
    { type: 'item', code: 'west/conus_ch03', displayName: 'B3 - Veggie' },
    { type: 'item', code: 'west/conus_ch04', displayName: 'B4 - Cirrus' },
    { type: 'item', code: 'west/conus_ch05', displayName: 'B5 - Snow/Ice' },
    { type: 'item', code: 'west/conus_ch06', displayName: 'B6 - Cloud Top' },
    { type: 'item', code: 'west/conus_ch07', displayName: 'B7 - Shortwave IR' },
    { type: 'item', code: 'west/conus_ch08', displayName: 'B8 - Water Vapor' },
    { type: 'item', code: 'west/conus_ch09', displayName: 'B9 - Water Vapor' },
    { type: 'item', code: 'west/conus_ch10', displayName: 'B10 - Water Vapor' },
    { type: 'item', code: 'west/conus_ch11', displayName: 'B11 - Cloud Top Temperature' },
    { type: 'item', code: 'west/conus_ch12', displayName: 'B12 - Fire Temperature' },
    { type: 'item', code: 'west/conus_ch13', displayName: 'B13 - Clean IR Longwave' },
    { type: 'item', code: 'west/conus_ch14', displayName: 'B14 - IR Longwave' },
    { type: 'item', code: 'west/conus_ch15', displayName: 'B15 - Dirty IR' },
    { type: 'item', code: 'west/conus_ch16', displayName: 'B16 - CO2' },
    { type: 'header', label: 'GOES-16 (East)' },
    { type: 'item', code: 'east/conus_ch01', displayName: 'B1 - Blue Visible' },
    { type: 'item', code: 'east/conus_ch02', displayName: 'B2 - Red Visible' },
    { type: 'item', code: 'east/conus_ch03', displayName: 'B3 - Veggie' },
    { type: 'item', code: 'east/conus_ch04', displayName: 'B4 - Cirrus' },
    { type: 'item', code: 'east/conus_ch05', displayName: 'B5 - Snow/Ice' },
    { type: 'item', code: 'east/conus_ch06', displayName: 'B6 - Cloud Top' },
    { type: 'item', code: 'east/conus_ch07', displayName: 'B7 - Shortwave IR' },
    { type: 'item', code: 'east/conus_ch08', displayName: 'B8 - Water Vapor' },
    { type: 'item', code: 'east/conus_ch09', displayName: 'B9 - Water Vapor' },
    { type: 'item', code: 'east/conus_ch10', displayName: 'B10 - Water Vapor' },
    { type: 'item', code: 'east/conus_ch11', displayName: 'B11 - Cloud Top Temperature' },
    { type: 'item', code: 'east/conus_ch12', displayName: 'B12 - Fire Temperature' },
    { type: 'item', code: 'east/conus_ch13', displayName: 'B13 - Clean IR Longwave' },
    { type: 'item', code: 'east/conus_ch14', displayName: 'B14 - IR Longwave' },
    { type: 'item', code: 'east/conus_ch15', displayName: 'B15 - Dirty IR' },
    { type: 'item', code: 'east/conus_ch16', displayName: 'B16 - CO2' },
]

class RadarPicker {
    constructor(currentProduct, coords, onChangeProduct, level2Only = false) {
        this.level2Only = level2Only;
        this.onChangeProduct = onChangeProduct;
        this.currentMode = 'radar';
        this.picker = document.createElement('div');
        this.picker.classList.add('radar-picker');
        this.picker.style.top = coords[0] || '';
        this.picker.style.right = coords[1] || '';
        this.picker.style.bottom = coords[2] || '';
        this.picker.style.left = coords[3] || '';

        // Build a header
        this.header = document.createElement('div');
        this.header.onclick = () => this.toggle();
        this.picker.appendChild(this.header);

            // Build a product object
            const productDiv = document.createElement('div');
            productDiv.classList.add('radar-picker-product');
            this.header.appendChild(productDiv);

                // Build a current product name element
                this.currentProduct = document.createElement('div');
                this.currentProduct.classList.add('radar-picker-current-product');
                this.currentProduct.textContent = currentProduct || 'Select Product';
                productDiv.appendChild(this.currentProduct);

                // Build a current product code element
                this.currentProductCode = document.createElement('div');
                this.currentProductCode.classList.add('radar-picker-current-product-code');
                this.currentProductCode.textContent = currentProduct || '';
                productDiv.appendChild(this.currentProductCode);

            // Build a time and tilt element
            this.timeAndTilt = document.createElement('div');
            this.timeAndTilt.classList.add('radar-picker-time-tilt');
            this.header.appendChild(this.timeAndTilt);

        // Build an element that shows when in archive / local-file mode (hidden by default)
        this.archiveDiv = document.createElement('div');
        this.archiveDiv.classList.add('radar-picker-archive-mode');
        this.archiveDiv.style.display = 'none';
        this.picker.appendChild(this.archiveDiv);
            this.archiveModeIndicator = document.createElement('p');
            this.archiveModeIndicator.classList.add('radar-picker-archive-text');
            this.archiveModeIndicator.textContent = 'Viewing archived data';
            this.archiveDiv.appendChild(this.archiveModeIndicator);

            this.archiveModeStopButton = document.createElement('button');
            this.archiveModeStopButton.classList.add('radar-picker-archive-stop-button');
            this.archiveModeStopButton.textContent = 'Stop';
            this.archiveDiv.appendChild(this.archiveModeStopButton);


        // Build a product list
        this.productsList = document.createElement('div');
        this.productsList.classList.add('radar-products-list');
        this.productsList.classList.add('radar-products-collapsed');
        this.picker.appendChild(this.productsList);

        // Set initial mode/content and product.
        const initialMode = String(currentProduct || '').includes('/') ? 'satellite' : 'radar';
        this.setMode(initialMode, currentProduct);

        // Restore persisted time and tilt data
        this.restoreTimeAndTilt();

        // Append the picker to the body
        document.body.appendChild(this.picker);
    }

    _getRadarEntries() {
        if (!this.level2Only) {
            return productEntries;
        }

        return productEntries.filter((entry) => {
            if (entry.type === 'header') {
                return entry.label.includes('Level II');
            }
            return entry.type === 'item' && ['REF', 'VEL', 'CC', 'ZDR', 'KDP', 'SW'].includes(entry.code);
        });
    }

    _getSatelliteDisplayName(productCode) {
        const entry = satelliteEntries.find((item) => item.type === 'item' && item.code === productCode);
        return entry?.displayName || productCode;
    }

    _clearProductsList() {
        while (this.productsList.firstChild) {
            this.productsList.removeChild(this.productsList.firstChild);
        }
    }

    _renderRadarEntries() {
        const entries = this._getRadarEntries();

        entries.forEach((entry) => {
            if (entry.type === 'header') {
                const categoryHeader = document.createElement('div');
                categoryHeader.classList.add('radar-product-category');
                categoryHeader.textContent = entry.label;
                this.productsList.appendChild(categoryHeader);
                return;
            }

            if (entry.type !== 'item') {
                return;
            }

            const productItem = document.createElement('div');
            const hasTilts = Array.isArray(entry.tilts) && entry.tilts.length > 1;

            if (hasTilts) {
                const productName = document.createElement('p');
                productName.textContent = productLabels[entry.code] || entry.code;
                productName.style.cursor = 'pointer';
                productItem.appendChild(productName);

                const tiltSelector = document.createElement('select');
                entry.tilts.forEach((tilt, i) => {
                    const option = document.createElement('option');
                    option.value = tilt;
                    option.textContent = `Tilt ${i + 1}`;
                    tiltSelector.appendChild(option);
                });

                tiltSelector.addEventListener('click', (e) => {
                    e.stopPropagation();
                });

                tiltSelector.addEventListener('change', (e) => {
                    e.stopPropagation();
                    this.setCurrentProduct(entry.code);
                    if (typeof this.onChangeProduct === 'function') {
                        this.onChangeProduct(entry.code, tiltSelector.value);
                    }
                });

                productName.addEventListener('click', () => {
                    tiltSelector.value = entry.tilts[0];
                    this.setCurrentProduct(entry.code);
                    if (typeof this.onChangeProduct === 'function') {
                        this.onChangeProduct(entry.code, entry.tilts[0]);
                    }
                });

                productItem.appendChild(tiltSelector);
            } else {
                const productName = document.createElement('p');
                productName.textContent = productLabels[entry.code] || entry.code;
                productItem.appendChild(productName);
                productItem.addEventListener('click', () => {
                    this.setCurrentProduct(entry.code);
                    if (typeof this.onChangeProduct === 'function') {
                        this.onChangeProduct(entry.code, entry.tilts?.[0] ?? 0);
                    }
                });
            }

            this.productsList.appendChild(productItem);
        });
    }

    _renderSatelliteEntries() {
        satelliteEntries.forEach((entry) => {
            if (entry.type === 'header') {
                const categoryHeader = document.createElement('div');
                categoryHeader.classList.add('radar-product-category');
                categoryHeader.textContent = entry.label;
                this.productsList.appendChild(categoryHeader);
                return;
            }

            if (entry.type !== 'item') {
                return;
            }

            const productItem = document.createElement('div');
            const productName = document.createElement('p');
            productName.textContent = entry.displayName || entry.code;
            productItem.appendChild(productName);
            productItem.addEventListener('click', () => {
                this.setCurrentProduct(entry.code);
                if (typeof this.onChangeProduct === 'function') {
                    this.onChangeProduct(entry.code, 0);
                }
            });
            this.productsList.appendChild(productItem);
        });
    }

    setMode(mode, currentProduct = null) {
        this.currentMode = mode === 'satellite' ? 'satellite' : 'radar';
        this._clearProductsList();

        if (this.currentMode === 'satellite') {
            this._renderSatelliteEntries();
        } else {
            this._renderRadarEntries();
        }

        const fallbackProduct = this.currentMode === 'satellite' ? 'west/conus_ch13' : 'N0B';
        this.setCurrentProduct(currentProduct || fallbackProduct);

        
        // No time or tilt for satellite
        if (this.currentMode === 'satellite') {
            this.timeAndTilt.innerHTML = '';
            return;
        }
    }

    setCurrentProduct(product) {
        if (!product) {
            this.currentProduct.textContent = 'No product selected';
            this.currentProductCode.textContent = '';
            return;
        }

        this.setProductCode(product);
        if (String(product).includes('/')) {
            this.currentProduct.textContent = this._getSatelliteDisplayName(product);
            return;
        }

        // Replace the second letter with an underscore
        let normalizedProduct = String(product);
        if (product.substring(1, 2) == 'A' || product.substring(1, 2) == 'B' || !isNaN(product.substring(1, 2))) {
            normalizedProduct = product.substring(0, 1) + '_' + product.substring(2);
        } else {
            normalizedProduct = product;
        }

        if (normalizedProduct == "D_A") normalizedProduct = "DAA";

        console.log("Using str product:", product, "normalized to:", normalizedProduct);

        this.currentProduct.textContent = productLabels[normalizedProduct] || product || 'No product selected';

        // No time or tilt for satellite
        if (this.currentMode === 'satellite') {
            this.timeAndTilt.innerHTML = '';
            return;
        }
    }

    setProductCode(code) {
        if (String(code).includes('/')) {
            this.currentProductCode.textContent = `(${code.replace('conus_', '')})`;
            return;
        }

        const normalizedProduct = String(code).replace('conus_', '');
        this.currentProductCode.textContent = `(${normalizedProduct})`;
    }

    setTimeAndTilt(time, tilt, timeIso = null, options = {}) {
        if (this.currentMode === 'satellite') {
            this.timeAndTilt.innerHTML = '';
            return;
        }
        if (!this.timeAndTilt) return;
        this.radarTime = time;
        this.radarTilt = tilt;
        const { ignoreAgeColoring = false } = options || {};
        const parsedTime = timeIso || time;
        const parsedMs = parsedTime ? Date.parse(parsedTime) : NaN;
        let minutesOld = Number.isFinite(parsedMs) ? (Date.now() - parsedMs) / 60000 : null;
        
        console.log(`[RadarPicker] timeIso=${timeIso}, displayTime=${time}, minutesOld=${minutesOld}, now=${new Date().toISOString()}`);
        
        if (minutesOld != null && minutesOld < 0) {
            if (minutesOld < -720) minutesOld += 1440;
            else minutesOld = 0;
        }

        this.timeAndTilt.innerHTML = `<div class="timeAndTiltSub"><p id="timeElem">${time || '--:--:--'}</p>${tilt != '0.0°' ? `<p>• ${tilt ?? '--'}</p>` : ''}</div>`;

        const timeElem = this.timeAndTilt.querySelector('#timeElem');
        if (ignoreAgeColoring) {
            timeElem.style.color = 'white';
        } else if (minutesOld != null && minutesOld > 20) {
            timeElem.style.color = '#ff2121';
        } else if (minutesOld != null && minutesOld > 15) {
            timeElem.style.color = '#ffcc00';
        } else {
            timeElem.style.color = 'white';
        }

        // Persist time and tilt to localStorage
        try {
            localStorage.setItem('radarPicker_timeAndTilt', JSON.stringify({
                time,
                tilt,
                timeIso
            }));
        } catch (e) {
            console.warn('Failed to persist radar picker time and tilt:', e);
        }
    }

    restoreTimeAndTilt() {
        try {
            const saved = localStorage.getItem('radarPicker_timeAndTilt');
            if (saved) {
                const { time, tilt, timeIso } = JSON.parse(saved);
                this.setTimeAndTilt(time, tilt, timeIso);
            }
        } catch (e) {
            console.warn('Failed to restore radar picker time and tilt:', e);
        }
    }

    show() {
        this.productsList.classList.remove('radar-products-collapsed');
    }

    hide() {
        this.productsList.classList.add('radar-products-collapsed');
    }

    toggle() {
        this.productsList.classList.toggle('radar-products-collapsed');
    }

    /**
     * Lock or unlock the product picker.
     * When locked, clicking the header does nothing and the product name is
     * shown in white to signal it is not interactive.
     * @param {boolean} locked
     */
    setPickerLocked(locked) {
        this._pickerLocked = locked;
        if (locked) {
            this.header.onclick = null;
            this.currentProduct.style.color = 'white';
        } else {
            this.header.onclick = () => this.toggle();
            this.currentProduct.style.color = '';
        }
    }

    /**
     * Show or hide the archive-mode banner.
     * @param {boolean} active - true to show, false to hide.
     * @param {Function} [onStop] - Called when the Stop button is clicked.
     * @param {string} [label] - Banner text (defaults to 'Viewing archived data').
     */
    setArchiveMode(active, onStop, label = 'Viewing archived data') {
        if (active) {
            this.archiveModeIndicator.textContent = label;
            this.archiveDiv.style.display = 'flex';
            // Replace the button node to cleanly remove any prior click listeners.
            const newBtn = this.archiveModeStopButton.cloneNode(true);
            this.archiveModeStopButton.replaceWith(newBtn);
            this.archiveModeStopButton = newBtn;
            if (typeof onStop === 'function') {
                this.archiveModeStopButton.addEventListener('click', onStop);
            }
            // Fix any red/yellow age coloring left by restoreTimeAndTilt() in the constructor.
            // Age coloring is meaningless for archive/local-file data.
            if (this.radarTime != null) {
                this.setTimeAndTilt(this.radarTime, this.radarTilt, null, { ignoreAgeColoring: true });
            }
        } else {
            this.archiveDiv.style.display = 'none';
        }
    }

    destroy() {
        if (this.picker && this.picker.parentNode) {
            this.picker.parentNode.removeChild(this.picker);
        }
    }
}

export default RadarPicker;