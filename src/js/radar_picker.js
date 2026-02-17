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
    'REF': 'Super-Res Base Reflectivity',
    'VEL': 'Super-Res Base Velocity',
    'CC': 'Super-Res Correlation Coefficient',
    'KDP': 'Super-Res Specific Differential Phase',
    'SW': 'Super-Res Spectrum Width'
};

const productEntries = [
    { type: 'header', label: 'Standard Products' },
    { type: 'item', code: 'N_B' },
    { type: 'item', code: 'N_G' },
    { type: 'item', code: 'N_H' },
    { type: 'item', code: 'N_K' },
    { type: 'item', code: 'N_C' },
    { type: 'header', label: 'Super-Res Products' },
    { type: 'item', code: 'REF' },
    { type: 'item', code: 'VEL' },
    { type: 'item', code: 'CC' },
    { type: 'item', code: 'KDP' },
    { type: 'item', code: 'SW' }
];

class RadarPicker {
    constructor(currentProduct, coords, onChangeProduct) {
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

            // Build a current product
            this.currentProduct = document.createElement('div');
            this.currentProduct.classList.add('radar-picker-current-product');
            this.currentProduct.textContent = currentProduct || 'Select Product';
            this.header.appendChild(this.currentProduct);

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

        // Create selectors for each product
        productEntries.forEach((entry) => {
            if (entry.type === 'header') {
                const categoryHeader = document.createElement('div');
                categoryHeader.classList.add('radar-product-category');
                categoryHeader.textContent = entry.label;
                this.productsList.appendChild(categoryHeader);
                return;
            }

            if (entry.type === 'item') {
                const productItem = document.createElement('div');
                productItem.textContent = productLabels[entry.code] || entry.code;
                productItem.addEventListener('click', () => {
                    this.setCurrentProduct(entry.code);
                    if (typeof onChangeProduct === 'function') {
                        onChangeProduct(entry.code);
                    }
                });
                this.productsList.appendChild(productItem);
            }
        });

        // Store the onChangeProduct callback for later use
        this.onChangeProduct = onChangeProduct;

        // Append the picker to the body
        document.body.appendChild(this.picker);
    }

    setCurrentProduct(product) {
        if (!product) {
            this.currentProduct.textContent = 'No product selected';
            return;
        }

        const normalizedProduct = String(product).replace(/\d/, '_');
        this.currentProduct.textContent = productLabels[normalizedProduct] || product || 'No product selected';
    }

    setTimeAndTilt(time, tilt, timeIso = null) {
        if (!this.timeAndTilt) return;
        this.radarTime = time;
        const parsedTime = timeIso || time;
        const parsedMs = parsedTime ? Date.parse(parsedTime) : NaN;
        let minutesOld = Number.isFinite(parsedMs) ? (Date.now() - parsedMs) / 60000 : null;
        if (minutesOld != null && minutesOld < 0) {
            if (minutesOld < -720) minutesOld += 1440;
            else minutesOld = 0;
        }

        this.timeAndTilt.innerHTML = `<div class="timeAndTiltSub"><p id="timeElem">${time || '--:--:--'}</p><p>@ ${tilt ?? '--'}</p></div>`;

        const timeElem = this.timeAndTilt.querySelector('#timeElem');
        if (minutesOld != null && minutesOld > 20) {
            timeElem.style.color = '#ff2121';
        } else if (minutesOld != null && minutesOld > 15) {
            timeElem.style.color = '#ffcc00';
        } else {
            timeElem.style.color = 'white';
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