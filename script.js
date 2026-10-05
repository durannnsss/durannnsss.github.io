/* ========================================
   Ink — page behaviour
   Theme, kinetic name, project previews, small conveniences.
   ======================================== */

(function () {
    'use strict';

    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = document.documentElement;
    const hero = document.querySelector('.hero');
    const THEME_COLOR = { dark: '#0B0A09', light: '#F5F3EE' };

    const currentTheme = () => (root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    const token = name => getComputedStyle(root).getPropertyValue(name).trim();

    /* ---------- fluid ---------- */
    const solverText = document.getElementById('solver-text');
    let ink = null;
    try {
        ink = window.Ink ? window.Ink.create(document.getElementById('ink'), {
            host: hero,
            theme: currentTheme(),
            onStats: s => {
                solverText.textContent = `stable fluids · ${s.gridW}×${s.gridH} grid · ${s.iterations} Jacobi iterations` +
                    (s.fps ? ` · ${s.fps} fps` : '');
            }
        }) : null;
    } catch (err) {
        console.warn('Ink: disabled', err);
    }
    if (!ink) hero.classList.add('no-webgl');

    /* ---------- theme ---------- */
    const toggle = document.getElementById('theme-toggle');
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    function applyTheme(theme, persist) {
        root.setAttribute('data-theme', theme);
        toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
        if (metaTheme) metaTheme.setAttribute('content', THEME_COLOR[theme]);
        if (persist) {
            try { localStorage.setItem('theme', theme); } catch (e) { /* storage unavailable */ }
        }
        if (ink) ink.setTheme(theme);
        drawPreviews();
    }
    toggle.addEventListener('click', () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true));

    /* ---------- kinetic name ---------- */
    const name = document.getElementById('name');
    const letters = [];
    name.querySelectorAll('.name-line').forEach(line => {
        const text = line.textContent;
        line.textContent = '';
        for (const ch of text) {
            const span = document.createElement('span');
            span.className = 'ch';
            span.setAttribute('aria-hidden', 'true');
            span.textContent = ch;
            line.appendChild(span);
            if (ch.trim()) letters.push({ el: span, t: 0 });
        }
    });

    const REST = { wght: 640, wdth: 86 }, PEAK = { wght: 800, wdth: 100 };
    let pointer = null, kineticRaf = 0;
    function kineticFrame() {
        kineticRaf = 0;
        const radius = Math.max(160, hero.clientWidth * 0.26);
        let moving = false;
        for (const letter of letters) {
            let target = 0;
            if (pointer) {
                const r = letter.el.getBoundingClientRect();
                const d = Math.hypot(pointer.x - (r.left + r.width / 2), (pointer.y - (r.top + r.height / 2)) * 0.8);
                target = Math.max(0, 1 - d / radius);
                target = target * target * (3 - 2 * target);
            }
            const next = REDUCED ? target : letter.t + (target - letter.t) * 0.16;
            if (Math.abs(next - letter.t) > 0.002) moving = true;
            letter.t = Math.abs(next - target) < 0.002 ? target : next;
            const wght = Math.round(REST.wght + (PEAK.wght - REST.wght) * letter.t);
            const wdth = Math.round(REST.wdth + (PEAK.wdth - REST.wdth) * letter.t);
            letter.el.style.fontVariationSettings = `"wght" ${wght}, "wdth" ${wdth}, "opsz" 96`;
        }
        if (moving) kineticRaf = requestAnimationFrame(kineticFrame);
    }
    const kick = () => { if (!kineticRaf) kineticRaf = requestAnimationFrame(kineticFrame); };
    hero.addEventListener('pointermove', e => { pointer = { x: e.clientX, y: e.clientY }; kick(); });
    hero.addEventListener('pointerleave', () => { pointer = null; kick(); });

    /* ---------- top bar ---------- */
    const topbar = document.getElementById('topbar');
    const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* ---------- project previews ---------- */
    const preview = document.getElementById('preview');
    const previewCanvas = preview.querySelector('canvas');
    const previewCaption = preview.querySelector('.preview-caption');
    const CAPTIONS = {
        search: '65 candidates · 8 finalists · 7 replicated',
        ring: 'lock-free ring buffer · ingest → process',
        ink: 'velocity field · vorticity confinement'
    };
    const drawings = {};

    function rng(seed) {
        return function () {
            seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function canvasFor(kind) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const c = document.createElement('canvas');
        c.width = 224 * dpr; c.height = 140 * dpr;
        const g = c.getContext('2d');
        g.scale(dpr, dpr);
        const fg = token('--fg'), muted = token('--muted'), accent = token('--accent'), line = token('--line'), chip = token('--chip');
        g.fillStyle = chip; g.fillRect(0, 0, 224, 140);
        g.font = '500 9px "Geist Mono", ui-monospace, monospace';

        if (kind === 'search') {
            // Train score (x) against holdout score (y) for the 65 candidates.
            const r = rng(7);
            const X = v => 18 + v * 196, Y = v => 122 - v * 108;
            g.strokeStyle = line; g.lineWidth = 1;
            g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(1), Y(1)); g.stroke();
            g.fillStyle = muted;
            for (let i = 0; i < 57; i++) {
                const x = r() * 0.62, y = Math.max(0.02, x * (0.4 + r() * 0.7) + (r() - 0.5) * 0.12);
                g.globalAlpha = 0.55; g.beginPath(); g.arc(X(x), Y(Math.min(y, 0.95)), 2, 0, 6.283); g.fill();
            }
            g.globalAlpha = 1; g.fillStyle = accent;
            for (let i = 0; i < 7; i++) {
                const x = 0.68 + r() * 0.28, y = x * (0.91 + r() * 0.25);
                g.beginPath(); g.arc(X(x), Y(Math.min(y, 0.98)), 3.4, 0, 6.283); g.fill();
            }
            g.strokeStyle = accent; g.lineWidth = 1.4;
            g.beginPath(); g.arc(X(0.86), Y(0.86 * 0.11), 3.4, 0, 6.283); g.stroke();
            g.fillStyle = muted; g.fillText('train →', 168, 134); g.fillText('holdout ↑', 6, 12);
        } else if (kind === 'ring') {
            const cx = 112, cy = 70, R = 46, n = 16, head = 11, tail = 3;
            for (let i = 0; i < n; i++) {
                const a0 = (i / n) * 6.283 - 1.571 + 0.03, a1 = ((i + 1) / n) * 6.283 - 1.571 - 0.03;
                const filled = i >= tail && i < head;
                g.strokeStyle = filled ? accent : line; g.lineWidth = 12;
                g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
            }
            const mark = (i, label, color) => {
                const a = (i / n) * 6.283 - 1.571;
                const x = cx + Math.cos(a) * (R + 16), y = cy + Math.sin(a) * (R + 16);
                g.fillStyle = color; g.textAlign = x < cx ? 'right' : 'left'; g.fillText(label, x, y + 3);
            };
            mark(head, 'head', fg); mark(tail, 'tail', muted);
            g.textAlign = 'center'; g.fillStyle = muted; g.fillText('no mutex', cx, cy + 3);
            g.textAlign = 'left';
        } else {
            // Streamlines around a counter-rotating vortex pair.
            const vort = [[80, 70, 1], [148, 70, -1]];
            const vel = (x, y) => {
                let vx = 0, vy = 0;
                for (const [px, py, s] of vort) {
                    const dx = x - px, dy = y - py, d2 = dx * dx + dy * dy + 60;
                    vx += -s * dy / d2 * 40; vy += s * dx / d2 * 40;
                }
                return [vx + 0.25, vy];
            };
            const r = rng(3);
            g.lineWidth = 1.2; g.lineCap = 'round';
            for (let k = 0; k < 70; k++) {
                let x = r() * 224, y = r() * 140;
                g.strokeStyle = k % 5 === 0 ? accent : muted;
                g.globalAlpha = k % 5 === 0 ? 0.95 : 0.45;
                g.beginPath(); g.moveTo(x, y);
                for (let s = 0; s < 26; s++) {
                    const [vx, vy] = vel(x, y), m = Math.hypot(vx, vy) || 1;
                    x += vx / m * 2.4; y += vy / m * 2.4; g.lineTo(x, y);
                }
                g.stroke();
            }
            g.globalAlpha = 1;
        }
        return c;
    }

    function drawPreviews() {
        for (const kind of Object.keys(CAPTIONS)) drawings[kind] = null;
        if (preview.classList.contains('on') && preview.dataset.kind) show(preview.dataset.kind);
    }

    function show(kind) {
        if (!drawings[kind]) drawings[kind] = canvasFor(kind);
        const g = previewCanvas.getContext('2d');
        previewCanvas.width = drawings[kind].width; previewCanvas.height = drawings[kind].height;
        g.drawImage(drawings[kind], 0, 0);
        previewCaption.textContent = CAPTIONS[kind];
        preview.dataset.kind = kind;
        preview.classList.add('on');
    }
    const hide = () => preview.classList.remove('on');

    const spring = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, raf: 0, placed: false };
    function springFrame() {
        spring.raf = 0;
        if (REDUCED) { spring.x = spring.tx; spring.y = spring.ty; spring.vx = 0; }
        else {
            spring.vx = (spring.vx + (spring.tx - spring.x) * 0.1) * 0.72;
            spring.vy = (spring.vy + (spring.ty - spring.y) * 0.1) * 0.72;
            spring.x += spring.vx; spring.y += spring.vy;
        }
        const maxX = window.innerWidth - 252;
        const x = Math.max(12, Math.min(maxX, spring.x + 22));
        const y = Math.max(12, spring.y - 190 < 12 ? spring.y + 28 : spring.y - 190);
        const tilt = Math.max(-6, Math.min(6, spring.vx * 0.35));
        preview.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${tilt.toFixed(2)}deg)`;
        if (Math.abs(spring.tx - spring.x) + Math.abs(spring.ty - spring.y) > 0.5) spring.raf = requestAnimationFrame(springFrame);
    }
    function aim(x, y, jump) {
        spring.tx = x; spring.ty = y;
        if (jump || !spring.placed) { spring.x = x; spring.y = y; spring.vx = spring.vy = 0; spring.placed = true; }
        if (!spring.raf) spring.raf = requestAnimationFrame(springFrame);
    }

    const canHover = window.matchMedia('(hover: hover)').matches;
    document.querySelectorAll('.project').forEach(item => {
        const kind = item.dataset.preview;
        if (canHover) {
            item.addEventListener('pointerenter', e => { aim(e.clientX, e.clientY, !preview.classList.contains('on')); show(kind); });
            item.addEventListener('pointermove', e => {
                if (!preview.classList.contains('on')) { aim(e.clientX, e.clientY, true); show(kind); }
                else aim(e.clientX, e.clientY);
            });
            item.addEventListener('pointerleave', hide);
        }
        item.addEventListener('focus', () => {
            const r = item.getBoundingClientRect();
            aim(Math.min(r.right - 260, r.left + r.width * 0.6), r.top + 40, true);
            show(kind);
        });
        item.addEventListener('blur', hide);
    });
    window.addEventListener('scroll', () => { if (preview.classList.contains('on') && !document.activeElement.classList.contains('project')) hide(); }, { passive: true });

    /* ---------- copy email ---------- */
    const copy = document.getElementById('copy-email');
    copy.addEventListener('click', () => {
        const email = copy.dataset.email;
        const done = text => { copy.textContent = text; setTimeout(() => { copy.textContent = 'Copy'; }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(email).then(() => done('Copied'), () => selectEmail(done));
        } else {
            selectEmail(done);
        }
    });
    function selectEmail(done) {
        const link = document.querySelector('.email');
        const range = document.createRange();
        range.selectNodeContents(link);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
        done('Selected');
    }

    /* ---------- misc ---------- */
    document.getElementById('year').textContent = new Date().getFullYear();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawPreviews);
    applyTheme(currentTheme(), false);
})();
