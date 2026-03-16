export default class Inspector {
    constructor(map) {
        this.map = map;
        this.circles = {}; // { main: element, split: element }
        this.updateInterval = null;
        this.enabled = false;
    }

    _parsePaletteColor(color) {
        let match = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
        if (match) {
            return [
                Number(match[1]) / 255,
                Number(match[2]) / 255,
                Number(match[3]) / 255,
                Number(match[4]) / 255
            ];
        }

        match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            return [
                Number(match[1]) / 255,
                Number(match[2]) / 255,
                Number(match[3]) / 255,
                1
            ];
        }

        return [1, 1, 1, 1];
    }

    _lerp(a, b, t) {
        return a + (b - a) * t;
    }

    _lerpColor(a, b, t) {
        return [
            this._lerp(a[0], b[0], t),
            this._lerp(a[1], b[1], t),
            this._lerp(a[2], b[2], t),
            this._lerp(a[3], b[3], t)
        ];
    }

    _colorForProductValue(product, value) {
        if (value === 'rf') {
            return [0.5, 0.0, 0.5, 1.0];
        }

        const palette = this.map._getPaletteForProduct(product || 'REF');
        const colorTable = this.map.palettes.getPalette(palette) || [];
        const stops = [];

        for (let i = 0; i < colorTable.length; i += 2) {
            const stopValue = Number(colorTable[i]);
            if (!Number.isFinite(stopValue)) continue;
            stops.push({ value: stopValue, color: this._parsePaletteColor(colorTable[i + 1] || '') });
        }

        if (stops.length === 0) {
            return [1, 1, 1, 1];
        }

        stops.sort((a, b) => a.value - b.value);

        if (value <= stops[0].value) {
            return stops[0].color;
        }

        if (value >= stops[stops.length - 1].value) {
            return stops[stops.length - 1].color;
        }

        for (let i = 0; i < stops.length - 1; i++) {
            const leftStop = stops[i];
            const rightStop = stops[i + 1];

            if (value >= leftStop.value && value <= rightStop.value) {
                const span = rightStop.value - leftStop.value;
                const t = span === 0 ? 0 : (value - leftStop.value) / span;
                return this._lerpColor(leftStop.color, rightStop.color, t);
            }
        }

        return stops[stops.length - 1].color;
    }

    // Helper function to get unit for a product
    _getProductUnit(product) {
        if (!product) return '';
        const upper = product.toUpperCase();
        switch (upper) {
            case 'N0B':
            case 'N1B':
            case 'N2B':
            case 'N3B':
            case 'REF':
            return 'dBZ';
            case 'N0G':
            case 'N1G':
            case 'N2G':
            case 'N3G':
            case 'N0U':
            case 'N1U':
            case 'N2U':
            case 'N3U':
            case 'VEL':
            return 'mph';
            case 'N0C':
            case 'N1C':
            case 'N2C':
            case 'N3C':
            case 'CC':
            return '';
            case 'N0X':
            case 'N1X':
            case 'N2X':
            case 'N3X':
            case 'ZDR':
            return 'dB';
            case 'N0K':
            case 'N1K':
            case 'N2K':
            case 'N3K':
            case 'KDP':
            return 'deg/km';
            case 'N0H':
            case 'N1H':
            case 'N2H':
            case 'N3H':
            return 'TYPE';
            case 'SW':
            return 'mph';
            default:
            return '';
        }
    }

    createCircleInspector(mapId) {
        const container = document.createElement('div');
        container.className = `inspector-circle-container inspector-${mapId}`;
        container.id = `inspector-circle-${mapId}`;
        
        const circle = document.createElement('div');
        circle.className = 'inspector-circle';

        const valueDiv = document.createElement('div');
        valueDiv.id = `inspector-text-${mapId}`;
        valueDiv.className = 'inspector-text';
        
        const value = document.createElement('div');
        value.className = 'inspector-value';
        value.textContent = '--';
        
        const unit = document.createElement('div');
        unit.className = 'inspector-unit';
        unit.textContent = '';
        
        container.appendChild(circle);
        valueDiv.appendChild(value);
        valueDiv.appendChild(unit);
        document.body.appendChild(valueDiv);
        
        document.body.appendChild(container);
        
        return { container, value, unit, circle, valueDiv };
    }

    updateCirclePosition(mapId) {
        const mapElement = mapId === 'main' ? document.getElementById('map') : document.getElementById('map-dual');
        if (!mapElement) return;
        
        const rect = mapElement.getBoundingClientRect();
        const container = document.getElementById(`inspector-circle-${mapId}`);
        const valueDiv = document.getElementById(`inspector-text-${mapId}`);
        if (!container) return;
        
        // Center the circle on the map (32px circle = 16px offset)
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        container.style.left = (centerX - 8) + 'px';
        container.style.top = (centerY - 8) + 'px';

        if (valueDiv) {
            valueDiv.style.left = `${centerX}px`;
            valueDiv.style.top = `${centerY + 20}px`;
        }
    }

    updateValue(mapId) {
        if (!this.circles[mapId]) return;
        
        const { value: valueElement, unit: unitElement, circle: circleElement } = this.circles[mapId];
        
        let mapInstance = null;
        let currentGeojson = null;
        let currentMesh = null;
        let currentMeshBounds = null;
        let currentProduct = null;
        
        if (mapId === 'main') {
            mapInstance = this.map.map;
            currentGeojson = this.map.currentGeojson;
            currentMesh = this.map.currentMesh;
            currentMeshBounds = this.map.currentMeshBounds;
            currentProduct = this.map.currentRadarProduct;
        } else if (mapId === 'split' && this.map.dualMap) {
            mapInstance = this.map.dualMap;
            currentGeojson = this.map.currentGeojsonSplit;
            currentMesh = this.map.currentMeshSplit;
            currentMeshBounds = this.map.currentMeshBoundsSplit;
            currentProduct = this.map.currentRadarProductSplit;
        }
        
        if (!mapInstance) {
            valueElement.textContent = '--';
            unitElement.textContent = '';
            circleElement.style.borderColor = 'var(--primary-color)';
            return;
        }
        
        if (!currentGeojson && !currentMesh && !currentProduct) {
            valueElement.textContent = '--';
            unitElement.textContent = '';
            circleElement.style.borderColor = 'var(--primary-color)';
            return;
        }
        
        // Get center of the map
        const center = mapInstance.getCenter();
        const point = [center.lng, center.lat];
        
        let value = null;
        
        // Try GeoJSON first
        if (currentGeojson) {
            value = this.map._findValueAtPoint(currentGeojson, point);

            if (value === null) {
                value = this.map._findValueAtPoint(currentGeojson, [point[1], point[0]]);
            }
        }
        
        // Fall back to mesh data if no GeoJSON
        if (value === null && currentMesh) {
            value = this.map._findValueAtPointInMesh(currentMesh, currentMeshBounds, point);
        }
        
        let displayValue = '--';
        let displayUnit = '';
        let circleColor = 'black';

        // If we are looking at DHC we show the precip type instead of a value
        if (value !== null) {

            const dhcMapping = {
                10: 'Biological',
                20: 'Clutter',
                30: "Ice crystals",
                40: 'Dry snow',
                50: 'Wet snow',
                60: 'Rain',
                70: 'Heavy rain',
                80: 'Big drops',
                90: 'Graupel',
                100: 'Hail + rain',
                110: 'Large hail',
                120: 'Giant hail',
                130: 'RF',
                140: 'Unknown'
            };

            const unit = this._getProductUnit(currentProduct);
            let valueStr = '';

            if (unit === 'TYPE') {
                valueStr = dhcMapping[value] || `Unknown (${value})`;
            } else if (unit == 'mph') {
                // MPH products are stored in m/s, so convert to mph
                valueStr = (value * 2.23694).toFixed(1);
            } else {
                valueStr = value === 'rf' ? 'RF' : value.toFixed(1);
            }
            displayValue = valueStr;
            displayUnit = unit === 'TYPE' ? value.toFixed(0) : unit;
            
            // Get color for this value using the product's palette
            const colorArray = this._colorForProductValue(currentProduct, value);
            circleColor = `rgba(${Math.round(colorArray[0] * 255)}, ${Math.round(colorArray[1] * 255)}, ${Math.round(colorArray[2] * 255)}, ${colorArray[3]})`;
        }
        
        valueElement.textContent = displayValue;
        unitElement.textContent = displayUnit;
        circleElement.style.backgroundColor = circleColor;
    }

    enable() {
        if (this.enabled) return;
        
        this.enabled = true;

        // Update the button
        const inspectorButton = document.getElementById('inspector-button');
        if (inspectorButton) {
            inspectorButton.classList.add('selected');
        }
        
        // Create circle for main map
        this.circles.main = this.createCircleInspector('main');
        
        // Create circle for split map if it exists
        if (this.map.isSplit && this.map.isSplit()) {
            this.circles.split = this.createCircleInspector('split');
        }
        
        // Update positions on window resize
        const resizeHandler = () => {
            Object.keys(this.circles).forEach(mapId => {
                this.updateCirclePosition(mapId);
            });
        };
        window.addEventListener('resize', resizeHandler);
        
        // Update values at regular interval
        this.updateInterval = setInterval(() => {
            Object.keys(this.circles).forEach(mapId => {
                this.updateValue(mapId);
                this.updateCirclePosition(mapId);
            });
        }, 500);
        
        // Initial update
        Object.keys(this.circles).forEach(mapId => {
            this.updateCirclePosition(mapId);
            this.updateValue(mapId);
        });
        
        // Store handlers for cleanup
        this._resizeHandler = resizeHandler;
    }

    disable() {
        if (!this.enabled) return;
        
        this.enabled = false;

        // Update the button
        const inspectorButton = document.getElementById('inspector-button');
        if (inspectorButton) {
            inspectorButton.classList.remove('selected');
        }
        
        // Clear interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        // Remove resize listener
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        
        // Remove circle elements
        Object.keys(this.circles).forEach(mapId => {
            const container = document.getElementById(`inspector-circle-${mapId}`);
            if (container) {
                container.remove();
            }
            const valueDiv = document.getElementById(`inspector-text-${mapId}`);
            if (valueDiv) {
                valueDiv.remove();
            }
        });
        this.circles = {};
    }
};