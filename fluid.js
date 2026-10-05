/* ========================================
   Ink — real-time fluid simulation
   Stable fluids (Stam 1999) on the GPU: advection, vorticity confinement,
   Jacobi pressure solve. Dark theme renders luminous dye; light theme
   renders absorbing ink on paper.
   ======================================== */

(function () {
    'use strict';

    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const SMALL = Math.min(window.screen.width, window.screen.height) < 700;

    const CONFIG = {
        simResolution: SMALL ? 96 : 128,
        dyeResolution: SMALL ? 384 : 640,
        pressureIterations: SMALL ? 16 : 20,
        curl: 26,
        pressure: 0.8,
        velocityDissipation: 0.2,
        dyeDissipation: 0.85,
        splatRadius: 0.22,
        splatForce: 6000,
        maxDpr: SMALL ? 1 : 1.5,
        idleDelay: 2200
    };

    // Dark: emitted light. Light: pigment, stored as absorption (1 - colour).
    const PALETTES = {
        dark: [[1.0, 0.52, 0.16], [1.0, 0.22, 0.46], [0.5, 0.32, 1.0], [0.16, 0.72, 1.0], [1.0, 0.8, 0.3]],
        light: [[0.12, 0.13, 0.22], [0.14, 0.26, 0.62], [0.2, 0.38, 0.72], [0.8, 0.22, 0.12], [0.08, 0.45, 0.5]]
    };
    const BACKGROUND = { dark: [0.043, 0.039, 0.035], light: [0.961, 0.953, 0.933] };

    const VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
uniform vec2 texel;
out vec2 vUv; out vec2 vL; out vec2 vR; out vec2 vT; out vec2 vB;
void main() {
    vUv = aPos * 0.5 + 0.5;
    vL = vUv - vec2(texel.x, 0.0); vR = vUv + vec2(texel.x, 0.0);
    vT = vUv + vec2(0.0, texel.y); vB = vUv - vec2(0.0, texel.y);
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

    const HEADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
out vec4 o;
`;

    const SHADERS = {
        splat: `uniform sampler2D uTarget; uniform float aspect; uniform float radius; uniform vec3 color; uniform vec2 point;
void main() {
    vec2 p = vUv - point; p.x *= aspect;
    o = vec4(texture(uTarget, vUv).xyz + exp(-dot(p, p) / radius) * color, 1.0);
}`,
        advect: `uniform sampler2D uVelocity; uniform sampler2D uSource; uniform vec2 simTexel; uniform float dt; uniform float dissipation;
void main() {
    vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * simTexel;
    o = texture(uSource, coord) / (1.0 + dissipation * dt);
}`,
        divergence: `uniform sampler2D uVelocity;
void main() {
    float L = texture(uVelocity, vL).x; float R = texture(uVelocity, vR).x;
    float T = texture(uVelocity, vT).y; float B = texture(uVelocity, vB).y;
    vec2 C = texture(uVelocity, vUv).xy;
    if (vL.x < 0.0) L = -C.x; if (vR.x > 1.0) R = -C.x;
    if (vT.y > 1.0) T = -C.y; if (vB.y < 0.0) B = -C.y;
    o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`,
        curl: `uniform sampler2D uVelocity;
void main() {
    float L = texture(uVelocity, vL).y; float R = texture(uVelocity, vR).y;
    float T = texture(uVelocity, vT).x; float B = texture(uVelocity, vB).x;
    o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`,
        vorticity: `uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float curl; uniform float dt;
void main() {
    float L = texture(uCurl, vL).x; float R = texture(uCurl, vR).x;
    float T = texture(uCurl, vT).x; float B = texture(uCurl, vB).x;
    float C = texture(uCurl, vUv).x;
    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 1e-4;
    force *= curl * C; force.y *= -1.0;
    vec2 v = texture(uVelocity, vUv).xy + force * dt;
    o = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`,
        pressure: `uniform sampler2D uPressure; uniform sampler2D uDivergence;
void main() {
    float L = texture(uPressure, vL).x; float R = texture(uPressure, vR).x;
    float T = texture(uPressure, vT).x; float B = texture(uPressure, vB).x;
    o = vec4((L + R + B + T - texture(uDivergence, vUv).x) * 0.25, 0.0, 0.0, 1.0);
}`,
        gradient: `uniform sampler2D uPressure; uniform sampler2D uVelocity;
void main() {
    float L = texture(uPressure, vL).x; float R = texture(uPressure, vR).x;
    float T = texture(uPressure, vT).x; float B = texture(uPressure, vB).x;
    o = vec4(texture(uVelocity, vUv).xy - vec2(R - L, T - B), 0.0, 1.0);
}`,
        clear: `uniform sampler2D uTexture; uniform float value;
void main() { o = value * texture(uTexture, vUv); }`,
        display: `uniform sampler2D uTexture; uniform vec2 texel; uniform vec3 bg; uniform float paper;
void main() {
    vec3 c = texture(uTexture, vUv).rgb;
    float l = length(texture(uTexture, vL).rgb); float r = length(texture(uTexture, vR).rgb);
    float t = length(texture(uTexture, vT).rgb); float b = length(texture(uTexture, vB).rgb);
    vec3 n = normalize(vec3(r - l, t - b, length(texel)));
    float shade = clamp(n.z + 0.7, 0.7, 1.0);
    vec2 q = vUv - 0.5;
    float vignette = 1.0 - dot(q, q) * 0.7;
    vec3 light = bg + (1.0 - exp(-c * shade * 1.5)) * vignette;
    vec3 ink = bg * exp(-c * (2.0 + (1.0 - shade) * 3.0));
    o = vec4(mix(light, ink, paper), 1.0);
}`
    };

    function create(canvas, options) {
        const host = options.host;
        const gl = canvas.getContext('webgl2', {
            alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false
        });
        if (!gl) return null;
        gl.getExtension('EXT_color_buffer_float');
        gl.getExtension('EXT_color_buffer_half_float');

        let theme = options.theme === 'light' ? 'light' : 'dark';
        const listeners = [];
        const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); listeners.push([target, type, fn, opts]); };

        // --- programs -------------------------------------------------------
        function compile(type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
            return shader;
        }
        const programs = {};
        try {
            const vertex = compile(gl.VERTEX_SHADER, VERTEX);
            for (const name in SHADERS) {
                const program = gl.createProgram();
                gl.attachShader(program, vertex);
                gl.attachShader(program, compile(gl.FRAGMENT_SHADER, HEADER + SHADERS[name]));
                gl.linkProgram(program);
                if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
                const cache = {};
                programs[name] = {
                    program,
                    u: new Proxy(cache, { get: (o, key) => (key in o ? o[key] : (o[key] = gl.getUniformLocation(program, key))) })
                };
            }
        } catch (err) {
            console.warn('Ink: shader setup failed', err);
            return null;
        }

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        // --- render targets -------------------------------------------------
        function target(w, h) {
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
            const framebuffer = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
            gl.viewport(0, 0, w, h);
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            return {
                framebuffer, w, h, ok,
                attach(unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture); return unit; },
                clear() { gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT); },
                dispose() { gl.deleteTexture(texture); gl.deleteFramebuffer(framebuffer); }
            };
        }
        function pair(w, h) {
            let a = target(w, h), b = target(w, h);
            return {
                w, h, ok: a.ok && b.ok,
                get read() { return a; }, get write() { return b; },
                swap() { const t = a; a = b; b = t; },
                clear() { a.clear(); b.clear(); },
                dispose() { a.dispose(); b.dispose(); }
            };
        }
        function size(resolution) {
            const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
            const aspect = w > h ? w / h : h / w;
            const min = Math.round(resolution), max = Math.round(resolution * aspect);
            return w > h ? [max, min] : [min, max];
        }

        let velocity, dye, pressure, divergence, curl;
        function build() {
            [velocity, dye, pressure, divergence, curl].forEach(t => t && t.dispose());
            const [sw, sh] = size(CONFIG.simResolution);
            const [dw, dh] = size(Math.min(CONFIG.dyeResolution, Math.max(gl.drawingBufferWidth, gl.drawingBufferHeight)));
            velocity = pair(sw, sh); dye = pair(dw, dh); pressure = pair(sw, sh);
            divergence = target(sw, sh); curl = target(sw, sh);
            return velocity.ok && dye.ok && pressure.ok && divergence.ok && curl.ok;
        }

        function resize() {
            const rect = canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr);
            const w = Math.max(2, Math.round(rect.width * dpr)), h = Math.max(2, Math.round(rect.height * dpr));
            if (canvas.width === w && canvas.height === h) return false;
            canvas.width = w; canvas.height = h;
            return true;
        }

        // --- simulation -----------------------------------------------------
        function use(name) { gl.useProgram(programs[name].program); return programs[name].u; }
        function blit(t) {
            if (t) { gl.viewport(0, 0, t.w, t.h); gl.bindFramebuffer(gl.FRAMEBUFFER, t.framebuffer); }
            else { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        function step(dt) {
            const tx = 1 / velocity.w, ty = 1 / velocity.h;
            let u = use('curl');
            gl.uniform2f(u.texel, tx, ty); gl.uniform1i(u.uVelocity, velocity.read.attach(0)); blit(curl);

            u = use('vorticity');
            gl.uniform2f(u.texel, tx, ty); gl.uniform1i(u.uVelocity, velocity.read.attach(0)); gl.uniform1i(u.uCurl, curl.attach(1));
            gl.uniform1f(u.curl, CONFIG.curl); gl.uniform1f(u.dt, dt); blit(velocity.write); velocity.swap();

            u = use('divergence');
            gl.uniform2f(u.texel, tx, ty); gl.uniform1i(u.uVelocity, velocity.read.attach(0)); blit(divergence);

            u = use('clear');
            gl.uniform1i(u.uTexture, pressure.read.attach(0)); gl.uniform1f(u.value, CONFIG.pressure); blit(pressure.write); pressure.swap();

            u = use('pressure');
            gl.uniform2f(u.texel, tx, ty); gl.uniform1i(u.uDivergence, divergence.attach(0));
            for (let i = 0; i < CONFIG.pressureIterations; i++) {
                gl.uniform1i(u.uPressure, pressure.read.attach(1)); blit(pressure.write); pressure.swap();
            }

            u = use('gradient');
            gl.uniform2f(u.texel, tx, ty); gl.uniform1i(u.uPressure, pressure.read.attach(0)); gl.uniform1i(u.uVelocity, velocity.read.attach(1));
            blit(velocity.write); velocity.swap();

            u = use('advect');
            gl.uniform2f(u.texel, tx, ty); gl.uniform2f(u.simTexel, tx, ty);
            const v = velocity.read.attach(0);
            gl.uniform1i(u.uVelocity, v); gl.uniform1i(u.uSource, v);
            gl.uniform1f(u.dt, dt); gl.uniform1f(u.dissipation, CONFIG.velocityDissipation);
            blit(velocity.write); velocity.swap();

            gl.uniform1i(u.uVelocity, velocity.read.attach(0)); gl.uniform1i(u.uSource, dye.read.attach(1));
            gl.uniform1f(u.dissipation, CONFIG.dyeDissipation);
            blit(dye.write); dye.swap();
        }

        function splat(x, y, fx, fy, color) {
            const aspect = canvas.width / canvas.height;
            const u = use('splat');
            gl.uniform1i(u.uTarget, velocity.read.attach(0));
            gl.uniform1f(u.aspect, aspect);
            gl.uniform2f(u.point, x, y);
            gl.uniform3f(u.color, fx, fy, 0);
            gl.uniform1f(u.radius, (CONFIG.splatRadius / 100) * (aspect > 1 ? aspect : 1));
            blit(velocity.write); velocity.swap();
            gl.uniform1i(u.uTarget, dye.read.attach(0));
            gl.uniform3f(u.color, color[0], color[1], color[2]);
            blit(dye.write); dye.swap();
        }

        function render() {
            const u = use('display');
            const bg = BACKGROUND[theme];
            gl.uniform2f(u.texel, 1 / dye.w, 1 / dye.h);
            gl.uniform1i(u.uTexture, dye.read.attach(0));
            gl.uniform3f(u.bg, bg[0], bg[1], bg[2]);
            gl.uniform1f(u.paper, theme === 'light' ? 1 : 0);
            blit(null);
        }

        function colour(boost) {
            const base = PALETTES[theme][(Math.random() * PALETTES[theme].length) | 0];
            const k = (theme === 'light' ? 0.11 : 0.16) * (boost || 1);
            return theme === 'light'
                ? [(1 - base[0]) * k, (1 - base[1]) * k, (1 - base[2]) * k]
                : [base[0] * k, base[1] * k, base[2] * k];
        }

        function seed(count) {
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2, force = 900 + Math.random() * 900;
                splat(0.45 + Math.random() * 0.5, 0.2 + Math.random() * 0.65, Math.cos(angle) * force, Math.sin(angle) * force, colour(2.2));
            }
        }

        resize();
        if (!build()) { console.warn('Ink: float render targets unsupported'); return null; }
        seed(8);
        for (let i = 0; i < 40; i++) step(1 / 60);

        // --- input ----------------------------------------------------------
        const queue = [];
        let prevX = null, prevY = null, lastMove = -1e9, nextAmbient = 0, stroke = colour(), strokeAt = 0;
        const toUV = e => {
            const rect = canvas.getBoundingClientRect();
            return [(e.clientX - rect.left) / rect.width, 1 - (e.clientY - rect.top) / rect.height];
        };
        on(host, 'pointermove', e => {
            const [x, y] = toUV(e);
            if (prevX !== null) queue.push([x, y, x - prevX, y - prevY, null]);
            prevX = x; prevY = y; lastMove = performance.now(); wake();
        });
        on(host, 'pointerleave', () => { prevX = null; });
        on(host, 'pointerdown', e => {
            if (e.target.closest('a, button')) return;
            const [x, y] = toUV(e);
            for (let i = 0; i < 3; i++) {
                const angle = Math.random() * Math.PI * 2;
                queue.push([x, y, Math.cos(angle) * 0.012, Math.sin(angle) * 0.012, colour(3)]);
            }
            lastMove = performance.now(); wake();
        });

        // --- loop -----------------------------------------------------------
        let raf = 0, visible = true, last = 0, activeUntil = 0, frames = 0, fpsAt = 0, fps = 0;
        function frame(now) {
            raf = 0;
            const dt = last ? Math.min((now - last) / 1000, 1 / 60) : 1 / 60;
            last = now;
            if (resize()) { if (!build()) return; seed(6); }
            const aspect = canvas.width / canvas.height;
            if (now - strokeAt > 380) { stroke = colour(); strokeAt = now; }
            for (const [x, y, dx, dy, c] of queue) {
                const cx = aspect < 1 ? dx * aspect : dx, cy = aspect > 1 ? dy / aspect : dy;
                splat(x, y, cx * CONFIG.splatForce, cy * CONFIG.splatForce, c || stroke);
            }
            queue.length = 0;
            if (!REDUCED && now - lastMove > CONFIG.idleDelay && now > nextAmbient) {
                nextAmbient = now + 650 + Math.random() * 900;
                const angle = Math.random() * Math.PI * 2, force = 500 + Math.random() * 600;
                splat(0.15 + Math.random() * 0.8, 0.2 + Math.random() * 0.65, Math.cos(angle) * force, Math.sin(angle) * force, colour(1.8));
            }
            step(dt);
            render();
            frames++;
            if (now - fpsAt > 500) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; if (options.onStats) options.onStats(stats()); }
            if (visible && !document.hidden && (!REDUCED || now < activeUntil)) raf = requestAnimationFrame(frame);
            else last = 0;
        }
        function wake() {
            activeUntil = performance.now() + 1500;
            if (visible && !raf) raf = requestAnimationFrame(frame);
        }
        function stats() { return { gridW: velocity.w, gridH: velocity.h, iterations: CONFIG.pressureIterations, fps: REDUCED ? 0 : fps }; }

        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver(entries => {
                visible = entries[entries.length - 1].isIntersecting;
                if (visible && !raf) raf = requestAnimationFrame(frame);
            });
            io.observe(host);
        }
        on(document, 'visibilitychange', () => { if (!document.hidden && visible && !raf) raf = requestAnimationFrame(frame); });
        raf = requestAnimationFrame(frame);

        return {
            setTheme(next) {
                if (next === theme) return;
                theme = next === 'light' ? 'light' : 'dark';
                dye.clear();
                seed(6);
                for (let i = 0; i < 20; i++) step(1 / 60);
                stroke = colour();
                wake();
                if (!raf) raf = requestAnimationFrame(frame);
            },
            stats
        };
    }

    window.Ink = { create };
})();
