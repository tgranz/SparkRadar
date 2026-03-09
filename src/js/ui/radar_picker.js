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
    'N_H': 'Hydrometer Classification',
    'N_X': 'Differential Reflectivity',
    'REF': 'Super-Res Base Reflectivity',
    'VEL': 'Super-Res Base Velocity',
    'CC': 'Super-Res Correlation Coefficient',
    'KDP': 'Super-Res Specific Differential Phase',
    'SW': 'Super-Res Spectrum Width',
    'ZDR': 'Super-Res Differential Reflectivity'
};

const productEntries = [
    { type: 'header', label: 'Standard Products (Level III)' },
    { type: 'item', code: 'N_B', hasTiltOptions: true },
    { type: 'item', code: 'N_G', hasTiltOptions: true },
    { type: 'item', code: 'N_C', hasTiltOptions: true },
    { type: 'item', code: 'N_X', hasTiltOptions: true },
    { type: 'item', code: 'N_K', hasTiltOptions: true },
    { type: 'item', code: 'N_H', hasTiltOptions: true },
    { type: 'header', label: 'Super-Res Products (Level II)' },
    { type: 'item', code: 'REF', hasTiltOptions: false },
    { type: 'item', code: 'VEL', hasTiltOptions: false },
    { type: 'item', code: 'CC', hasTiltOptions: false },
    // { type: 'item', code: 'ZDR' }, <-- Error adding radar layer: Incorrect file type header: AR2V00
    //{ type: 'item', code: 'KDP' }, <-- looks wrong
    //{ type: 'item', code: 'SW' } <-- blank?
];

class RadarPicker {
    constructor(currentProduct, coords, onChangeProduct, level2Only = false) {
        this.level2Only = level2Only;
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

        // Build a product list
        this.productsList = document.createElement('div');
        this.productsList.classList.add('radar-products-list');
        this.productsList.classList.add('radar-products-collapsed');
        this.picker.appendChild(this.productsList);

        // Set the initial product
        this.setCurrentProduct(currentProduct);

        // Filter entries based on level2Only flag
        const filteredEntries = level2Only
            ? productEntries.filter(entry => {
                if (entry.type === 'header') {
                    return entry.label.includes('Level II');
                }
                return entry.type === 'item' && ['REF', 'VEL', 'CC', 'ZDR', 'KDP', 'SW'].includes(entry.code);
              })
            : productEntries;

        // Create selectors for each product
        filteredEntries.forEach((entry) => {
            if (entry.type === 'header') {
                const categoryHeader = document.createElement('div');
                categoryHeader.classList.add('radar-product-category');
                categoryHeader.textContent = entry.label;
                this.productsList.appendChild(categoryHeader);
                return;
            }

            if (entry.type === 'item') {
                const productItem = document.createElement('div');

                if (entry.hasTiltOptions) {
                    const productName = document.createElement('p');
                    productName.textContent = productLabels[entry.code] || entry.code;
                    productItem.appendChild(productName);

                    const tiltSelector = document.createElement('select');
                    tiltSelector.innerHTML = `
                        <option value="0" selected>Tilt 1</option>
                        <option value="1">Tilt 2</option>
                        <option value="2">Tilt 3</option>
                        <option value="3">Tilt 4</option>
                    `;
                    
                    // Stop click events from bubbling to prevent double-firing
                    tiltSelector.addEventListener('click', (e) => {
                        e.stopPropagation();
                    });
                    
                    tiltSelector.addEventListener('change', (e) => {
                        e.stopPropagation();
                        const selectedTilt = Number(tiltSelector.value);
                        const baseLabel = productLabels[entry.code] || entry.code;
                        this.currentProduct.textContent = baseLabel;
                        if (typeof onChangeProduct === 'function') {
                            onChangeProduct(entry.code, selectedTilt || 0);
                        }
                    });
                    
                    productItem.appendChild(tiltSelector);
                    
                    // Add click handler to the productName only
                    productName.addEventListener('click', () => {
                        const baseLabel = productLabels[entry.code] || entry.code;
                        this.currentProduct.textContent = baseLabel;
                        tiltSelector.value = '0'; // Reset dropdown to Tilt 1
                        this.setProductCode(entry.code);
                        if (typeof onChangeProduct === 'function') {
                            onChangeProduct(entry.code, 0);
                    }
                    });
                    productName.style.cursor = 'pointer';
                } else {
                    const productName = document.createElement('p');
                    productName.textContent = productLabels[entry.code] || entry.code;
                    productItem.appendChild(productName);
                    productItem.addEventListener('click', () => {
                        this.setCurrentProduct(entry.code);
                        this.setProductCode(entry.code);
                        if (typeof onChangeProduct === 'function') {
                            onChangeProduct(entry.code, 0);
                        }
                    });
                }
                
                this.productsList.appendChild(productItem);
            }
        });

        // Store the onChangeProduct callback for later use
        this.onChangeProduct = onChangeProduct;

        // Restore persisted time and tilt data
        this.restoreTimeAndTilt();

        // Append the picker to the body
        document.body.appendChild(this.picker);
    }

    setCurrentProduct(product) {
        if (!product) {
            this.currentProduct.textContent = 'No product selected';
            this.currentProductCode.textContent = '';
            return;
        }

        this.setProductCode(product);
        const normalizedProduct = String(product).replace(/\d/, '_');
        this.currentProduct.textContent = productLabels[normalizedProduct] || product || 'No product selected';
    }

    setProductCode(code) {
        const normalizedProduct = String(code).replace(/\d/, '_');
        this.currentProductCode.textContent = `(${normalizedProduct})`;
    }

    setTimeAndTilt(time, tilt, timeIso = null, options = {}) {
        if (!this.timeAndTilt) return;
        this.radarTime = time;
        this.radarTilt = tilt;
        const { ignoreAgeColoring = false } = options || {};
        const parsedTime = timeIso || time;
        const parsedMs = parsedTime ? Date.parse(parsedTime) : NaN;
        let minutesOld = Number.isFinite(parsedMs) ? (Date.now() - parsedMs) / 60000 : null;
        // Compensate for 1-hour timestamp offset correction
        if (minutesOld != null) {
            minutesOld = Math.max(0, minutesOld - 60);
        }
        if (minutesOld != null && minutesOld < 0) {
            if (minutesOld < -720) minutesOld += 1440;
            else minutesOld = 0;
        }

        this.timeAndTilt.innerHTML = `<div class="timeAndTiltSub"><p id="timeElem">${time || '--:--:--'}</p><p>• ${tilt ?? '--'}</p></div>`;

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

    destroy() {
        if (this.picker && this.picker.parentNode) {
            this.picker.parentNode.removeChild(this.picker);
        }
    }
}

export default RadarPicker;