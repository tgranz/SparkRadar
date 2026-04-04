// DOES NOT WORK
// 3D Radar visualization using WebGL
// Help appreciated

export default class Radar3D {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl2');
        this.program = null;
        this.vertexBuffer = null;
        this.positionAttributeLocation = null;
        this.projectionMatrixLocation = null;

        // Pan and zoom state
        this.panX = 0;
        this.panY = 0;
        this.zoom = 1.0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        this._initializeShaders();
        this._initializeGeometry();
        this._setupEventListeners();
    }

    _initializeShaders() {
        const gl = this.gl;

        // Vertex Shader Source with projection matrix
        const vsSource = `
            attribute vec2 a_position;
            uniform mat4 u_projection;
            void main() {
                gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
            }
        `;

        // Fragment Shader Source
        const fsSource = `
            void main() {
                gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0); // Blue color
            }
        `;

        const createShader = (type, source) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            }
            return shader;
        };

        const vertexShader = createShader(gl.VERTEX_SHADER, vsSource);
        const fragmentShader = createShader(gl.FRAGMENT_SHADER, fsSource);

        // Link the two shaders into a program
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(this.program));
        }

        gl.useProgram(this.program);

        // Look up where the vertex data needs to go
        this.positionAttributeLocation = gl.getAttribLocation(this.program, 'a_position');
        this.projectionMatrixLocation = gl.getUniformLocation(this.program, 'u_projection');
        gl.enableVertexAttribArray(this.positionAttributeLocation);

        // Set clear color to black, fully opaque
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
    }

    _initializeGeometry() {
        const gl = this.gl;

        // Vertices are in normalized device coordinates (clip space, from -1 to 1)
        const vertices = new Float32Array([
            -0.5, -0.5, // left bottom
            0.5, -0.5, // right bottom
            0.0,  0.5  // center top
        ]);

        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        // Tell the attribute how to get data out of vertexBuffer (ARRAY_BUFFER)
        const size = 2;          // 2 components per iteration (x, y)
        const type = gl.FLOAT;   // the data is 32bit floats
        const normalize = false; // don't normalize the data
        const stride = 0;        // 0 = move forward size * sizeof(type) each iteration
        const offset = 0;        // start at the beginning of the buffer
        gl.vertexAttribPointer(
            this.positionAttributeLocation, size, type, normalize, stride, offset);
    }

    _setupEventListeners() {
        // Mouse wheel for zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSpeed = 0.02;
            const zoomFactor = e.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed; // Reversed: scroll down to zoom out
            this.zoom *= zoomFactor;
            this.zoom = Math.max(0.1, Math.min(10, this.zoom)); // Clamp zoom between 0.1x and 10x
            this.render();
        }, { passive: false });

        // Mouse drag for pan
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            const deltaX = e.clientX - this.lastMouseX;
            const deltaY = e.clientY - this.lastMouseY;

            // Scale pan speed by zoom level (pan slower when zoomed in)
            const panSpeed = this.zoom / 500; // Adjust denominator to control pan sensitivity
            this.panX += deltaX * panSpeed;
            this.panY -= deltaY * panSpeed; // Invert Y because canvas Y is inverted

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            this.render();
        });

        this.canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
        });
    }

    _createProjectionMatrix() {
        // Create orthographic projection matrix with pan and zoom
        const mat4 = this._mat4();
        const ortho = mat4.ortho(-1, 1, -1, 1, -1, 1);
        
        // Apply zoom (scale)
        const scale = mat4.scale(mat4.create(), ortho, [1 / this.zoom, 1 / this.zoom, 1]);
        
        // Apply pan (translation)
        const projection = mat4.translate(mat4.create(), scale, [this.panX, this.panY, 0]);
        
        return projection;
    }

    _mat4() {
        return {
            create: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            ortho: (left, right, bottom, top, near, far) => {
                const lr = 1 / (left - right);
                const bt = 1 / (bottom - top);
                const nf = 1 / (near - far);
                return [
                    -2 * lr, 0, 0, 0,
                    0, -2 * bt, 0, 0,
                    0, 0, 2 * nf, 0,
                    (left + right) * lr, (top + bottom) * bt, (far + near) * nf, 1
                ];
            },
            translate: (out, a, v) => {
                const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
                const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
                const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
                const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

                out[0] = a00; out[1] = a01; out[2] = a02; out[3] = a03;
                out[4] = a10; out[5] = a11; out[6] = a12; out[7] = a13;
                out[8] = a20; out[9] = a21; out[10] = a22; out[11] = a23;
                out[12] = a30 + v[0] * a00 + v[1] * a10 + v[2] * a20;
                out[13] = a31 + v[0] * a01 + v[1] * a11 + v[2] * a21;
                out[14] = a32 + v[0] * a02 + v[1] * a12 + v[2] * a22;
                out[15] = a33 + v[0] * a03 + v[1] * a13 + v[2] * a23;
                return out;
            },
            scale: (out, a, v) => {
                const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
                const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
                const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
                const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

                out[0] = a00 * v[0];
                out[1] = a01 * v[0];
                out[2] = a02 * v[0];
                out[3] = a03 * v[0];
                out[4] = a10 * v[1];
                out[5] = a11 * v[1];
                out[6] = a12 * v[1];
                out[7] = a13 * v[1];
                out[8] = a20 * v[2];
                out[9] = a21 * v[2];
                out[10] = a22 * v[2];
                out[11] = a23 * v[2];
                out[12] = a30;
                out[13] = a31;
                out[14] = a32;
                out[15] = a33;
                return out;
            }
        };
    }

    render() {
        const gl = this.gl;
        const canvas = this.canvas;

        // Set viewport to match canvas pixel size
        gl.viewport(0, 0, canvas.width, canvas.height);

        // Clear the color buffer
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Use the program
        gl.useProgram(this.program);

        // Create and set projection matrix
        const projection = this._createProjectionMatrix();
        gl.uniformMatrix4fv(this.projectionMatrixLocation, false, projection);

        // Make sure vertex buffer is bound
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.enableVertexAttribArray(this.positionAttributeLocation);

        const size = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.vertexAttribPointer(
            this.positionAttributeLocation, size, type, normalize, stride, offset);

        // Draw the triangle
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
}
