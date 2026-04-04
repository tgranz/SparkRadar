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
    // Reflectivity: Custom based on Vipir HD (https://www.wxtools.org/reflectivity/viper-hd)
    "REF": 
        `-10  30 30 30 0
        0     1 243 247
        0.5    3 231 239
        1.0    5 219 231
        1.5    7 207 223
        2.0    9 195 215
        2.5    11 183 207
        3.0    13 171 199
        3.5    15 195 191
        4.0    17 147 183
        4.5    19 135 175
        5.0    21 123 167
        5.5    23 112 159
        6.0    21 114 163
        6.5    20 117 168
        7.0    19 120 173
        7.5    18 123 178
        8.0    17 126 182
        8.5    16 129 187
        9.0    15 132 192
        9.5    14 135 197
        10.0   12 137 201
        10.5   11 140 206
        11.0   10 143 211
        11.5    9 146 216
        12.0    8 149 220
        12.5    7 152 255
        13.0    6 155 230
        13.5    5 158 235
        14.0   21 191 180
        14.5   37 225 125
        15.0   36 221 121
        15.5   35 218 118
        16.0   34 214 115
        16.5   33 211 112
        17.0   32 207 108
        17.5   31 204 105
        18.0   30 200 102
        18.5   29 197  99
        19.0   28 194  96
        19.5   27 190  93
        20.0   26 187  90
        20.5   28 184  87
        21.0   24 180  84
        21.5   24 177  81
        22.0   23 174  77
        22.5   22 170  74
        23.0   21 167  71
        23.5   20 164  68
        24.0   19 160  65
        24.5   18 157  62
        25.0   17 154  59
        25.5   16 150  56
        26.0   15 147  53
        26.5   15 144  50
        27.0   14 140  46
        27.5   13 137  43
        28.0   12 133  40
        28.5   11 130  37
        29.0   10 127  34
        29.5    9 123  31
        30.0    8 120  27
        30.5    7 117  24
        31.0    6 113  21
        31.5    5 110  18
        32.0    4 107  15 
        32.5    3 103  12
        33.0    2 100   9
        33.5    1  96   5
        34.0  128 175  19
        34.5  255 255  33
        35.0  255 247  28
        35.5  255 239  23
        36.0  255 231  18
        36.5  255 223  14
        37.0  255 215   9
        37.5  255 207   4
        38.0  255 199   0
        38.5  255 191   0
        44.0  255  17   0
        44.5  255   0   0
        54.0  154   0   0
        54.5  180   0 180
        55.0  186   9 185
        55.5  192  19 190
        56.0  198  29 195
        56.5  204  39 201
        57.0  210  49 206
        57.5  216  59 211
        58.0  223  68 216
        58.5  229  78 222
        59.0  235  88 227 
        59.5  241  98 232
        60.0  247 108 237
        60.5  253 117 243
        61.0  232 109 232
        61.5  212 104 204
        62.0  192  93 184
        62.5  171  85 165
        63.0  151  77 146
        63.5  131  69 126
        64.0  111  61 107
        64.5   90  53  88
        65.0   70  45  68
        65.5   50  37  49
        66.0   29  30  29
        66.5   33  34  33
        67.0   37  38  37
        67.5   41  42  41
        68.0   45  46  45
        68.5   49  50  49
        69.0   53  54  53
        69.5   57  58  57
        70.0   61  62  61
        70.5   65  66  65
        71.0   69  70  69
        71.5   73  74  73
        72.0   77  78  77
        72.5   81  82  81
        73.0   85  86  85
        73.5   89  90  89
        74.0   93  94  93
        74.5   97  98  97
        75.0  101 102 101
        75.5  105 106 105
        76.0  109 110 109
        76.5  113 114 113
        77.0  117 118 117
        77.5  121 122 121
        78.0  125 126 125
        78.5  129 130 129
        79.0  133 134 133
        79.5  137 138 137
        80.0  142 142 142
        80.5  146 146 146
        81.0  150 150 150
        81.5  154 154 154
        82.0  158 158 158
        82.5  162 162 162
        83.0  166 166 166
        83.5  170 170 170
        84.0  174 174 174 
        84.5  178 178 178
        85.0  182 182 182
        85.5  186 186 186
        86.0  190 190 190
        86.5  194 194 194
        87.0  198 198 198
        87.5  202 202 202
        88.0  206 206 206
        90.5  226 226 226
        92.5  242 242 242
        94.0  254 254 254
        100.0 262 262 262
        `,

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
        `0 0 0 0 
        9.9 0 0 0
        10 200 200 200
        19.9 200 200 200
        20 100 100 100
        29.9 100 100 100
        30 255 100 100
        39.9 255 100 100
        40 100 100 255
        49.9 100 100 255
        50 0 0 255
        59.9 0 0 255
        60 0 100 0
        69.9 0 100 0
        70 0 255 0
        79.9 0 255 0
        80 255 50 50
        89.9 255 50 50
        90 255 100 0
        99.9 255 100 0
        100 255 0 0
        109.9 255 0 0
        110 255 128 0
        119.9 255 128 0
        120 255 255 0
        129.9 255 255 0
        130 255 0 255
        139.9 255 0 255
        140 0 255 255
        149.9 0 255 255
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
        `-7 0 0 0
        -3.5 0 0 0
        0 255 255 255
        0.5 0 0 255
        2 0 255 0
        2.5 255 255 0
        4.5 255 0 0
        6.5 255 100 100
        8 255 255 255
        `,
    // Storm Relative Motion: SuperCellWX default (https://github.com/dpaulat/supercell-wx/blob/develop/scwx-qt/res/palettes/wct/SRV.pal)
    "SRV":
        `-75 0 224 255
        -60.1 0 224 255
        -60 0 138 255
        -45.1 0 138 255
        -45 50 0 150
        -30.1 50 0 150
        -30 0 251 144
        -20.1 0 251 144
        -20 0 187 0
        -10.1 0 187 0
        -10 0 143 0
        -1.1 0 143 0
        -1 205 192 159
        -0.1 205 192 159
        0 118 118 118
        9.9 118 118 118
        10 248 135 0
        19.9 248 135 0
        20 255 207 0
        29.9 255 207 0
        30 255 255 0
        44.9 255 255 0
        45 174 0 0
        59.9 174 0 0
        60 208 122 0
        74.9 208 122 0
        75 255 0 0`,
    // 1-hr Precipitation Accumulation: entirely custom
    'DAA':
        `0 100 100 100
        0.1 200 200 200
        0.5 0 0 255
        1 0 255 0
        1.5 255 255 0
        2 255 100 0
        2.5 255 0 0
        3 255 0 100
        4 255 0 255
        5 255 255 255`,
    // Storm Total Accumulation: entirely custom
    'DTA':
        `0 100 100 100
        0.1 200 200 200
        0.5 0 0 255
        1 0 255 0
        1.5 255 255 0
        2 255 100 0
        2.5 255 0 0
        3 255 0 100
        4 255 0 255
        5 255 255 255
        6 200 200 200
        8 0 0 0
        10 255 100 0`,
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

    _palArrayToString(palArray) {
        if (!Array.isArray(palArray)) return '';
        const lines = [];
        for (let i = 0; i < palArray.length; i += 2) {
            const val = palArray[i];
            const color = palArray[i + 1] || '';
            const match = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
            if (match) {
                lines.push(`${val} ${match[1]} ${match[2]} ${match[3]} ${match[4]}`);
            } else {
                const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                if (rgbMatch) {
                    lines.push(`${val} ${rgbMatch[1]} ${rgbMatch[2]} ${rgbMatch[3]}`);
                }
            }
        }
        return lines.join('\n').replace('	', ' '); // Replace tabs with spaces if present
    }

    convertPalToArray(palString, paletteName = null) {
        const lines = palString.trim().split('\n');
        const parsed = [];
        
        lines.forEach(line => {
            const parts = line.trim().split(/\s+/).map(Number);
            const val = parts[0];
            const r = parts[1];
            const g = parts[2];
            const b = parts[3];
            let a = parts[4]; // Alpha, if present
            
            if (!isNaN(val) && !isNaN(r)) {
                // Include alpha if present and valid, otherwise default to 255 (1.0)
                if (!Number.isFinite(a)) {
                    a = 255;
                } else if (a <= 1) {
                    a = Math.round(a * 255);
                }
                parsed.push({ val, r, g, b, a });
            }
        });

        // Add transparent color at start of REF palettes (before sorting)
        // Only add if one doesn't already exist
        if (paletteName === 'REF' && parsed.length > 0) {
            const hasTransparent = parsed.some(p => p.a === 0 && p.r === 0 && p.g === 0 && p.b === 0);
            if (!hasTransparent) {
                // Use a value just before the first color stop to ensure transparency at low values
                const firstVal = Math.min(...parsed.map(p => p.val));
                parsed.push({ val: firstVal - 0.1, r: 0, g: 0, b: 0, a: 0 });
                console.log("[Palettes] Added transparent color stop at val:", firstVal - 0.1);
            }
        }

        // Sort by value to ensure correct order
        parsed.sort((a, b) => a.val - b.val);

        // Convert to interleaved array format: [val1, 'rgba(...)', val2, 'rgba(...)', ...]
        const result = [];
        parsed.forEach(({val, r, g, b, a}) => {
            result.push(val, `rgba(${r}, ${g}, ${b}, ${a})`);
        });

        return result;
    }

    convertPalToGLSL(palString) {
        const lines = palString.trim().split('\n');
        const colors = [];
        
        lines.forEach(line => {
            const parts = line.trim().split(/\s+/).map(Number);
            const val = parts[0];
            const r = parts[1];
            const g = parts[2];
            const b = parts[3];
            const a = parts[4]; // Alpha, if present
            
            if (!isNaN(val) && !isNaN(r)) {
                colors.push({ val, r, g, b, a: isNaN(a) ? 255 : a });
            }
        });

        // Sort by value to ensure correct order
        colors.sort((a, b) => a.val - b.val);

        // Create GLSL array string with alpha
        let glslArray = `const vec4 palette[${colors.length}] = vec4[](\n`;
        glslArray += colors.map(c => `    vec4(${c.r / 255}, ${c.g / 255}, ${c.b / 255}, ${c.a / 255})`).join(',\n');
        glslArray += '\n);';

        return glslArray;
    }

    convertPalFileFormat(palFileContent, options = {}) {
    const lines = palFileContent.split('\n')
        .map(line => line.split(';')[0].trim())
        .filter(line => line.length > 0);

    const entries = [];
    let scale = 1;
    
    lines.forEach(rawLine => {
        const match = rawLine.match(/^([a-zA-Z]+)\s*:\s*(.*)$/i);
        if (!match) return;

        const key = match[1].toLowerCase();
        const value = match[2].trim();

        if (key === 'scale') {
            const s = Number(value);
            if (Number.isFinite(s) && s !== 0) scale = s;
            return;
        }

        if (['units', 'step', 'product'].includes(key)) return; // Skip for now

        if (key !== 'color') return; // Only process color lines

        const nums = value.split(/\s+/).map(Number).filter(n => !isNaN(n));
        if (nums.length < 4) return; // Need at least val + RGB

        const val = nums[0] / scale;
        const r1 = Math.round(nums[1]);
        const g1 = Math.round(nums[2]);
        const b1 = Math.round(nums[3]);
        let r2 = r1, g2 = g1, b2 = b1;
        if (nums.length >= 7) {
            r2 = Math.round(nums[4]);
            g2 = Math.round(nums[5]);
            b2 = Math.round(nums[6]);
        }
        // Assume no alpha for now

        entries.push({ val, start: {r: r1, g: g1, b: b1, a: 255}, end: {r: r2, g: g2, b: b2, a: 255} });
    });

    // Sort entries by val
    entries.sort((a, b) => a.val - b.val);

    // Build the color stops
    const colors = [];
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        colors.push({ val: entry.val, r: entry.start.r, g: entry.start.g, b: entry.start.b, a: entry.start.a });

        const hasGradient = (entry.start.r !== entry.end.r || entry.start.g !== entry.end.g || entry.start.b !== entry.end.b);
        if (hasGradient) {
            if (i < entries.length - 1) {
                // Add end color at next val (will create jump if != next start)
                colors.push({ val: entries[i + 1].val, r: entry.end.r, g: entry.end.g, b: entry.end.b, a: entry.end.a });
            } else {
                // For last entry with gradient, add end at same val (jump at end point)
                colors.push({ val: entry.val, r: entry.end.r, g: entry.end.g, b: entry.end.b, a: entry.end.a });
            }
        }
    }

    // Sort by val (stable, preserves order for same val)
    colors.sort((a, b) => a.val - b.val);

    // Dedup exact duplicates (same val and same color)
    const deduped = [];
    for (let c of colors) {
        const last = deduped[deduped.length - 1];
        if (!last || last.val !== c.val || last.r !== c.r || last.g !== c.g || last.b !== c.b || last.a !== c.a) {
            deduped.push(c);
        }
    }

    // Format output
    const resultLines = deduped.map(c => `${c.val.toFixed(2)} ${c.r} ${c.g} ${c.b} ${c.a}`);

    return resultLines.join('\n');
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
        // Try rgba first
        let match = rgbString.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
        if (match) {
            return { 
                r: parseInt(match[1]), 
                g: parseInt(match[2]), 
                b: parseInt(match[3]),
                a: parseInt(match[4])
            };
        }
        
        // Fall back to rgb
        match = rgbString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            return { 
                r: parseInt(match[1]), 
                g: parseInt(match[2]), 
                b: parseInt(match[3]),
                a: 255 // Default alpha
            };
        }
        
        return { r: 255, g: 255, b: 255, a: 255 };
    }

    lerpColor(color1, color2, t) {
        const r = Math.round(color1.r + (color2.r - color1.r) * t);
        const g = Math.round(color1.g + (color2.g - color1.g) * t);
        const b = Math.round(color1.b + (color2.b - color1.b) * t);
        const a = Math.round(color1.a + (color2.a - color1.a) * t);
        
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    getPalette(name) {
        if (!this.palettes[name]) {
            console.warn(`Palette "${name}" not found, using default.`);
            return this.convertPalToArray(defaultPalettes["REF"], "REF");
        }
        const palString = this.palettes[name];
        if (Array.isArray(palString)) {
            return palString;
        }
        const preview = typeof palString === 'string' ? palString.substring(0, 100) : String(palString);
        return this.convertPalToArray(palString, name);
    }

    storePalette(name, palString) {
        let storedValue = Array.isArray(palString) ? this._palArrayToString(palString) : palString;
        
        // For REF palettes, add transparent color stop before storing
        if (name === 'REF' && typeof storedValue === 'string') {
            const lines = storedValue.trim().split('\n');
            const parsed = [];
            
            lines.forEach(line => {
                const parts = line.trim().split(/\s+/).map(Number);
                if (parts.length >= 4 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    parsed.push({ val: parts[0], r: parts[1], g: parts[2], b: parts[3], a: parts[4] || 255 });
                }
            });
            
            if (parsed.length > 0) {
                const firstVal = Math.min(...parsed.map(p => p.val));
                const firstColor = parsed.find(p => p.val === firstVal);
                const transparentLine = `${(firstVal - 10).toFixed(2)} ${firstColor.r} ${firstColor.g} ${firstColor.b} 0`;
                storedValue = transparentLine + '\n' + storedValue;
                console.log('[Palettes] Added transparent stop to stored REF palette at val:', firstVal - 10);
            }
        }
        
        const preview = typeof storedValue === 'string' ? storedValue.substring(0, 100) : String(storedValue);
        console.log(`[Palettes] Storing palette "${name}" - first 100 chars:`, preview);
        this.palettes[name] = storedValue;
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

        const rawString = Array.isArray(palString) ? this._palArrayToString(palString) : palString;
        const lines = rawString.trim().split('\n');
        const colorStops = [];
        
        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;
            
            // Parse value and RGBA (format: "value r g b [a]")
            const parts = trimmed.split(/\s+/).map(Number);
            if (parts.length >= 4) {
                const val = parts[0];
                const r = parts[1];
                const g = parts[2];
                const b = parts[3];
                const a = parts[4]; // Optional alpha (0-255 or 0-1)
                
                // Filter out invalid values
                if (Number.isFinite(val) && Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
                    // Skip RF value (999) and very high values
                    if (val < 900) {
                        // Convert alpha from 0-255 to 0-1 if present
                        let alpha = 1;
                        if (Number.isFinite(a)) {
                            alpha = a <= 1 ? a : a / 255;
                        }
                        colorStops.push({ val, r, g, b, a: alpha });
                    }
                }
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
            return `rgba(${stop.r}, ${stop.g}, ${stop.b}, ${stop.a}) ${percent.toFixed(2)}%`;
        }).join(', ');
        
        return `linear-gradient(to right, ${gradientStops})`;
    }
}

export default Palettes;