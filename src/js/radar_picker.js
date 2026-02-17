/*

> radar_picker.js
This module handles the radar picker menu.

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

const products = {
    'N_B': 'Base Reflectivity',
    'N_G': 'Base Velocity',
    'N_H': 'Hydrometeor Classification',
    'N_K': 'Specific Differential Phase',
    'N_C': 'Correlation Coefficient',
    'REF': 'Base Reflectivity (L2)',
    'VEL': 'Base Velocity (L2)',
    'CC': 'Correlation Coefficient (L2)',
    'KDP': 'Specific Differential Phase (L2)',
    'SW': 'Spectrum Width (L2)',
};

class RadarPicker {
    constructor(currentProduct, coords, onChangeProduct) {
        this.picker = document.createElement('div');
        this.picker.classList.add('radar-picker');
        this.picker.style.top = coords[0] || '';
        this.picker.style.right = coords[1] || '';
        this.picker.style.bottom = coords[2] || '';
        this.picker.style.left = coords[3] || '';

        // Build a current product
        this.currentProduct = document.createElement('div');
        this.currentProduct.classList.add('radar-picker-current-product');
        this.currentProduct.textContent = currentProduct || 'Select Product';
        this.currentProduct.onclick = () => this.toggle();
        this.picker.appendChild(this.currentProduct);

        // Build a product list
        this.productsList = document.createElement('div');
        this.productsList.classList.add('radar-products-list');
        this.productsList.classList.add('hidden');
        this.picker.appendChild(this.productsList);

        // Set the initial product
        this.setCurrentProduct(currentProduct);

        // Create selectors for each product
        Object.entries(products).forEach(([code, label]) => {
            const productItem = document.createElement('div');
            productItem.textContent = label;
            productItem.addEventListener('click', () => {
                this.setCurrentProduct(code);
                if (typeof onChangeProduct === 'function') {
                    onChangeProduct(code);
                }
            });
            this.productsList.appendChild(productItem);
        });

        // Store the onChangeProduct callback for later use
        this.onChangeProduct = onChangeProduct;

        // Append the picker to the body
        document.body.appendChild(this.picker);
    }

    setCurrentProduct(product, tilt = 0) {
        this.currentProduct.textContent = products[product.replace(tilt, '_')] || product || 'No product selected';
    }

    show() {
        this.productsList.classList.remove('hidden');
    }

    hide() {
        this.productsList.classList.add('hidden');
    }

    toggle() {
        this.productsList.classList.toggle('hidden');
    }

    destroy() {
        if (this.picker && this.picker.parentNode) {
            this.picker.parentNode.removeChild(this.picker);
        }
    }
}

export default RadarPicker;