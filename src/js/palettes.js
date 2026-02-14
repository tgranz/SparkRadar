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
        `10 106  90 205
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
        100 77  77  255`,

    // Velocity
    "VEL":
        `-200 255 220 220
        -140 255 20 180
        -120 250 4 130
        -100 105 2 142
        -90 25 1 142
        -70 55 226 229
        -50 180 240 243
        -40 10 248 35
        -10 72 112 71
        0 130 106 120
        10 105 0 0
        40 249 58 84
        55 255 157 206
        60 255 230 169
        80 254 137 80
        120 97 6 2
        140 60 0 0
        200 45 0 0`,
};

class Palettes {
    constructor() {
        const storedPalettes = localStorage.getItem('colorPalettes');
        this.palettes = storedPalettes ? JSON.parse(storedPalettes) : defaultPalettes;
    }

    convertPalToArray(palString) {
        const lines = palString.trim().split('\n');
        const result = [];
        
        lines.forEach(line => {
            const [val, r, g, b] = line.trim().split(/\s+/).map(Number);
            result.push(val, `rgb(${r}, ${g}, ${b})`);
        });

        return result;
    }

    convertPalToGLSL(palString) {
        const lines = palString.trim().split('\n');
        const colors = lines.map(line => {
            const [val, r, g, b] = line.trim().split(/\s+/).map(Number);
            return { val, r, g, b };
        });

        // Create GLSL array string
        let glslArray = `const vec4 palette[${colors.length}] = vec4[](\n`;
        glslArray += colors.map(c => `    vec4(${c.r / 255}, ${c.g / 255}, ${c.b / 255}, 1.0)`).join(',\n');
        glslArray += '\n);';

        return glslArray;
    }

    getPalette(name) {
        if (!this.palettes[name]) {
            console.warn(`Palette "${name}" not found, using default.`);
            return this.convertPalToArray(defaultPalettes["REF"]);
        }
        return this.convertPalToArray(this.palettes[name]);
    }

    storePalette(name, palString) {
        this.palettes[name] = palString;
        localStorage.setItem('colorPalettes', JSON.stringify(this.palettes));
    }
}

export default Palettes;