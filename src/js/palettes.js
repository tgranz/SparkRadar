/*

> palettes.js
This module handles the color palettes for the radar data, including
custom .pal files as well as interpolation and palette conversion.

Find excellent palettes at https://www.wxtools.org/

(c) 2026 Tyler G (@tgranz)
See LICENSE for more.
*/

// Palettes are stored in text .pal format
const defaultPalettes = {
    // Reflectivity: Ben's BR (https://www.wxtools.org/reflectivity/bens-br)
    "REF": 
        `-10 0 0 0 0
        10 106  90 205
        12  72  61 139
        14  70 130 180
        16  95 158 160
        18   0 139 139
        20  34 139  34
        22  60 179 113
        24 107 142  35
        26 154 205  50
        28 205 173   0
        30 255 215   0
        32 255 255   0
        34 255 165   0
        36 255 140   0
        38 255 127   0
        40 255  99  71
        42 255  69   0
        44 226  1   30
        46 200  6   30
        48 185  1   30
        50 252 156 156
        52 255 182 193
        54 238 130 238
        56 219 112 147
        58 218 112 214
        60 186  85 211
        62 153  50 204
        64 160  32 240
        66 159 121 238
        68 171 130 255
        70 138 143 255
        72 54  62  255
        74 45  48  122
        76 45  48  82
        78 32  40  44
        80 0   0   0
        82 64  64  64
        84 102 102 102
        86 140 140 140
        88 179 179 179
        90 204 204 204
        92 230 230 230
        94 255 255 255
        96 179 179 255
        98 128 128 255
        100 77  77  255
        100.4     240 200 240
        100.5    250 250 250 50`,

    // Velocity: AWIPS Evans (https://www.wxtools.org/velocity/awips-evans)
    "VEL":
        `-120 255 0 128 
        -90.5 0 0 160
        -70 0 224 255
        -69.99 0 255 224
        -60 0 255 225
        -59.99 160 255 208
        -50 160 255 208
        -49.99 160 255 208 
        -40 0 255 0
        -10 16 96 16
        -9.99 16 96 16
        -.01 112 128 112
        0 144 128 144 
        10 112 0 0
        40 255 0 0
        48.6 255 0 128
        49.5 255 0 144
        69.99 255 196 255
        70 255 96 0 
        120 255 255 0`,
    // Correlation Coefficient: AWIPS RHO (https://www.wxtools.org/correlation-coefficient/awips-rho-cc)
    "CC":
        `0.00   15   15  140
        0.45    15   15  140
        0.60    10   10  190
        0.75   120  120  255
        0.80    95  245  100
        0.85   135  215   10
        0.90   255  255    0
        0.95   255  140    0
        0.97   225    3    0
        0.99   139   30   77
        1.00  255  180  215
        1.05  164   54  150`,
    // Specific Differential Phase: custom based on radarscope
    "KDP":
        `-2 0 0 0
        -1 200 200 200
        -0.5 255 100 100
        0.5 255 0 0
        2.3 255 0 255
        3.5 0 255 0
        5.8 255 255 0
        10 255 255 255
        `,
    // Digital Hydrometeor Classification: custom
    "DHC": 
        `0 0 0 0 0
        10 200 200 200
        20 100 100 100
        30 255 100 100
        40 100 100 255
        50 0 0 255
        60 0 100 0
        70 0 255 0
        80 255 50 50
        90 255 100 0
        100 255 0 0
        110 200 0 0
        120 255 255 0
        130 255 0 255
        140 0 255 255
        150 255 255 255`,
    // Spectrum Width: Ben's SW (https://www.wxtools.org/spectrum-width/bens-sw)
    "SW":
        `0 20 5 72
        2 50 20 140
        4 124 38 190
        7 218 55 120
        15 251 126 33
        18 255 255 0
        22 153 255 51
        30 0 153 230
        35 0 17 26
        40 255 255 255`,
    // Differential Reflectivity: custom based on radarscope
    "ZDR":
        `-5 0 0 255
        -2 0 100 255
        0 255 255 255
        2 255 100 100
        5 255 0 0`,
};

class Palettes {
    constructor() {
        const storedPalettes = localStorage.getItem('colorPalettes');
        console.log('[Palettes] Constructor - stored palettes in localStorage:', storedPalettes ? 'exists' : 'empty');
        // Merge stored palettes with defaults, giving priority to stored (custom) palettes
        this.palettes = storedPalettes 
            ? { ...defaultPalettes, ...JSON.parse(storedPalettes) }
            : defaultPalettes;
        if (storedPalettes) {
            const customKeys = Object.keys(JSON.parse(storedPalettes));
            console.log('[Palettes] Custom palette keys loaded:', customKeys);
        }
    }

    convertPalToArray(palString) {
        const lines = palString.trim().split('\n');
        const parsed = [];
        
        lines.forEach(line => {
            const [val, r, g, b] = line.trim().split(/\s+/).map(Number);
            if (!isNaN(val) && !isNaN(r)) {
                parsed.push({ val, r, g, b });
            }
        });

        // Sort by value to ensure correct order
        parsed.sort((a, b) => a.val - b.val);

        // Convert to interleaved array format: [val1, 'rgb(...)', val2, 'rgb(...)', ...]
        const result = [];
        parsed.forEach(({val, r, g, b}) => {
            result.push(val, `rgb(${r}, ${g}, ${b})`);
        });

        return result;
    }

    convertPalToGLSL(palString) {
        const lines = palString.trim().split('\n');
        const colors = [];
        
        lines.forEach(line => {
            const [val, r, g, b] = line.trim().split(/\s+/).map(Number);
            if (!isNaN(val) && !isNaN(r)) {
                colors.push({ val, r, g, b });
            }
        });

        // Sort by value to ensure correct order
        colors.sort((a, b) => a.val - b.val);

        // Create GLSL array string
        let glslArray = `const vec4 palette[${colors.length}] = vec4[](\n`;
        glslArray += colors.map(c => `    vec4(${c.r / 255}, ${c.g / 255}, ${c.b / 255}, 1.0)`).join(',\n');
        glslArray += '\n);';

        return glslArray;
    }

    convertPalFileFormat(palFileContent, options = {}) {
        const { paletteName } = options;
        const lines = palFileContent.split('\n');
        const unitsLine = lines.find(line => /\bunits\b\s*:/i.test(line));
        const scaleLine = lines.find(line => /\bscale\s*:/i.test(line));
        let units = null;
        let scale = 1;
        if (unitsLine) {
            const match = unitsLine.match(/units\s*:\s*([A-Za-z]+)/i);
            if (match) {
                units = match[1].toUpperCase();
            }
        }
        // For velocity palettes: only apply scale as a divisor if units are NOT specified or not MPH
        // When units: MPH, the scale is metadata (conversion factor), not a divisor
        if (paletteName === 'VEL' && scaleLine && units !== 'MPH') {
            const match = scaleLine.match(/scale\s*:\s*([\d.]+)/i);
            if (match) {
                const parsedScale = Number(match[1]);
                if (Number.isFinite(parsedScale) && parsedScale !== 0) {
                    scale = parsedScale;
                }
            }
        }
        // Match both 'color:' and 'Color:' (case-insensitive) or 'Color4:'
        const colorLines = lines.filter(line => {
            const trimmed = line.trim();
            return /^color\d*:/i.test(trimmed);
        });
        
        const result = [];
        const epsilon = 0.00001; // Small offset for hard stops
        
        colorLines.forEach(line => {
            // Remove the color label (Color:, Color4:, color:, etc.)
            const withoutLabel = line.replace(/^.*?color\d*:\s*/i, '').trim();
            
            // Split by whitespace and convert to numbers
            const parts = withoutLabel.split(/\s+/).map(Number);
            
            if (parts.length < 4) return; // Need at least value + RGB
            
            // Apply scale division (for raw values) unless units are specified
            let val = parts[0] / scale;
            // If palette values are in MPH, convert to knots to match radar data
            if (paletteName === 'VEL' && units === 'MPH') {
                val *= 0.868976;
            }
            const r1 = parts[1];
            const g1 = parts[2];
            const b1 = parts[3];
            
            // Check for second RGB set (hard stop between colors)
            if (parts.length >= 7) {
                const r2 = parts[4];
                const g2 = parts[5];
                const b2 = parts[6];
                
                // Output the first color slightly before this value to create the hard stop
                result.push({ val: val - epsilon, r: r1, g: g1, b: b1 });
                
                // Output the second color at the value
                result.push({ val, r: r2, g: g2, b: b2 });
            } else {
                // Output the only color at the value
                result.push({ val, r: r1, g: g1, b: b1 });
            }
        });

        // Sort by value to ensure correct order
        result.sort((a, b) => a.val - b.val);
        
        // Convert back to string format
        const sortedLines = result.map(stop => 
            `${stop.val.toFixed(5)} ${stop.r} ${stop.g} ${stop.b}`
        );

        return sortedLines.join('\n');
    }

    interpolateColor(value, palArray) {
        // palArray is [val1, 'rgb(...)', val2, 'rgb(...)', ...]
        for (let i = 0; i < palArray.length; i += 2) {
            const currentVal = palArray[i];
            if (i + 2 < palArray.length) {
                const nextVal = palArray[i + 2];
                if (value >= currentVal && value <= nextVal) {
                    // Interpolate between current and next color
                    const t = (value - currentVal) / (nextVal - currentVal);
                    const color1 = this.parseRGB(palArray[i + 1]);
                    const color2 = this.parseRGB(palArray[i + 3]);
                    
                    return this.lerpColor(color1, color2, t);
                }
            } else if (value === currentVal) {
                return palArray[i + 1];
            }
        }
        
        // Fallback to closest value
        return palArray[palArray.length - 1];
    }

    parseRGB(rgbString) {
        const match = rgbString.match(/\d+/g);
        return { r: parseInt(match[0]), g: parseInt(match[1]), b: parseInt(match[2]) };
    }

    lerpColor(color1, color2, t) {
        const r = Math.round(color1.r + (color2.r - color1.r) * t);
        const g = Math.round(color1.g + (color2.g - color1.g) * t);
        const b = Math.round(color1.b + (color2.b - color1.b) * t);
        
        return `rgb(${r}, ${g}, ${b})`;
    }

    getPalette(name) {
        if (!this.palettes[name]) {
            console.warn(`Palette "${name}" not found, using default.`);
            return this.convertPalToArray(defaultPalettes["REF"]);
        }
        const palString = this.palettes[name];
        console.log(`[Palettes] Getting palette "${name}" - first 100 chars:`, palString.substring(0, 100));
        return this.convertPalToArray(palString);
    }

    storePalette(name, palString) {
        console.log(`[Palettes] Storing palette "${name}" - first 100 chars:`, palString.substring(0, 100));
        this.palettes[name] = palString;
        const toStore = {};
        // Only store custom palettes, not defaults
        Object.keys(this.palettes).forEach(key => {
            if (this.palettes[key] !== defaultPalettes[key]) {
                toStore[key] = this.palettes[key];
            }
        });
        localStorage.setItem('colorPalettes', JSON.stringify(toStore));
        console.log('[Palettes] Stored custom palettes:', Object.keys(toStore));
    }

    generateGradientCSS(paletteName) {
        const palString = this.palettes[paletteName];
        
        if (!palString) {
            return null; // Palette not found
        }
        
        const lines = palString.trim().split('\n');
        const colorStops = [];
        
        lines.forEach(line => {
            const parts = line.trim().split(/\s+/).map(Number);
            if (parts.length >= 4) {
                const val = parts[0];
                const r = parts[1];
                const g = parts[2];
                const b = parts[3];
                colorStops.push({ val, r, g, b });
            }
        });
        
        if (colorStops.length === 0) {
            return null;
        }
        
        // Sort by value to ensure correct order
        colorStops.sort((a, b) => a.val - b.val);
        
        // Find min and max values to normalize positions
        const minVal = colorStops[0].val;
        const maxVal = colorStops[colorStops.length - 1].val;
        const range = maxVal - minVal;
        
        // Generate gradient stops based on actual value positions
        const gradientStops = colorStops.map(stop => {
            const percent = range === 0 ? 0 : ((stop.val - minVal) / range) * 100;
            return `rgb(${stop.r}, ${stop.g}, ${stop.b}) ${percent}%`;
        }).join(', ');
        
        return `linear-gradient(to right, ${gradientStops})`;
    }
}

export default Palettes;