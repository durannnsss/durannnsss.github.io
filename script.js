/* ========================================
   Ink — page behaviour
   Theme, kinetic name, project previews, small conveniences.
   ======================================== */

(function () {
    'use strict';

    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = document.documentElement;
    const hero = document.querySelector('.hero');
    const topbar = document.getElementById('topbar');
    const THEME_COLOR = { dark: '#0B0A09', light: '#F5F3EE' };

    const currentTheme = () => (root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    const token = name => getComputedStyle(root).getPropertyValue(name).trim();
    const storedTheme = () => {
        let saved = null;
        try { saved = localStorage.getItem('theme'); } catch (e) { /* storage unavailable */ }
        return saved === 'light' || saved === 'dark' ? saved : null;
    };

    /* ---------- fluid ---------- */
    const solverText = document.getElementById('solver-text');
    const fallBack = () => hero.classList.add('no-webgl');
    let ink = null;
    try {
        ink = window.InkFluid ? window.InkFluid.create(document.getElementById('ink'), {
            host: hero,
            theme: currentTheme(),
            onFail: fallBack,
            onStats: s => {
                solverText.textContent = `stable fluids · ${s.gridW}×${s.gridH} grid · ${s.iterations} Jacobi iterations` +
                    (s.fps >= 30 ? ` · ${s.fps} fps` : '');
            }
        }) : null;
    } catch (err) {
        console.warn('Ink: disabled', err);
    }
    if (!ink) fallBack();

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

    // Follow the OS setting until the visitor picks a theme themselves.
    const schemeQuery = window.matchMedia('(prefers-color-scheme: light)');
    const onSchemeChange = e => { if (!storedTheme()) applyTheme(e.matches ? 'light' : 'dark', false); };
    if (schemeQuery.addEventListener) schemeQuery.addEventListener('change', onSchemeChange);
    else if (schemeQuery.addListener) schemeQuery.addListener(onSchemeChange);

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

    if (!REDUCED) {
        const REST = { wght: 640, wdth: 86 }, PEAK = { wght: 800, wdth: 100 };
        let pointer = null, kineticRaf = 0;
        const kineticFrame = () => {
            kineticRaf = 0;
            const radius = Math.max(160, hero.clientWidth * 0.26);
            // Read every letter's box before writing any style, so the frame costs one layout.
            const rects = pointer ? letters.map(letter => letter.el.getBoundingClientRect()) : null;
            let moving = false;
            letters.forEach((letter, i) => {
                let target = 0;
                if (rects) {
                    const r = rects[i];
                    const d = Math.hypot(pointer.x - (r.left + r.width / 2), (pointer.y - (r.top + r.height / 2)) * 0.8);
                    target = Math.max(0, 1 - d / radius);
                    target = target * target * (3 - 2 * target);
                }
                const next = letter.t + (target - letter.t) * 0.16;
                if (Math.abs(next - letter.t) > 0.002) moving = true;
                letter.t = Math.abs(next - target) < 0.002 ? target : next;
                const wght = Math.round(REST.wght + (PEAK.wght - REST.wght) * letter.t);
                const wdth = Math.round(REST.wdth + (PEAK.wdth - REST.wdth) * letter.t);
                letter.el.style.fontVariationSettings = `"wght" ${wght}, "wdth" ${wdth}, "opsz" 96`;
            });
            if (moving) kineticRaf = requestAnimationFrame(kineticFrame);
        };
        const kick = () => { if (!kineticRaf) kineticRaf = requestAnimationFrame(kineticFrame); };
        hero.addEventListener('pointermove', e => { pointer = { x: e.clientX, y: e.clientY }; kick(); });
        hero.addEventListener('pointerleave', () => { pointer = null; kick(); });
    }

    /* ---------- top bar ---------- */
    const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* ---------- project previews ---------- */
    const preview = document.getElementById('preview');
    const previewCanvas = preview.querySelector('canvas');
    const previewCaption = preview.querySelector('.preview-caption');
    const CAPTIONS = {
        search: '65 → 8 finalists → 7 replicated',
        ring: 'lock-free ring buffer · ingest → process',
        ink: 'vortex pair · streamlines'
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
        const fg = token('--fg'), muted = token('--muted'), faint = token('--faint'), accent = token('--accent'),
            line = token('--line'), chip = token('--chip');
        g.fillStyle = chip; g.fillRect(0, 0, 224, 140);
        g.font = '500 9px "Geist Mono", ui-monospace, monospace';

        if (kind === 'search') {
            // Holdout retention of the 8 finalists. The CV gives the range (0.91–1.16) and the
            // rejected one (0.11); the bars in between are spaced evenly, hence "illustrative".
            const values = [0.91, 0.95, 0.99, 1.03, 1.07, 1.11, 1.16, 0.11];
            const base = 118, scale = 72, Y = v => base - v * scale;
            g.fillStyle = muted; g.fillText('holdout / train retention', 10, 16);
            g.strokeStyle = line; g.lineWidth = 1; g.setLineDash([3, 3]);
            g.beginPath(); g.moveTo(10, Y(1)); g.lineTo(214, Y(1)); g.stroke();
            g.setLineDash([]);
            g.fillStyle = muted; g.fillText('1.0', 192, Y(1) - 4);
            values.forEach((v, i) => {
                const x = 18 + i * 23, w = 14;
                if (i < 7) { g.fillStyle = accent; g.fillRect(x, Y(v), w, v * scale); }
                else { g.strokeStyle = muted; g.lineWidth = 1.2; g.strokeRect(x + 0.5, Y(v) + 0.5, w - 1, v * scale - 1); }
            });
            g.strokeStyle = line; g.beginPath(); g.moveTo(10, base + 0.5); g.lineTo(214, base + 0.5); g.stroke();
            g.fillStyle = muted; g.textAlign = 'right'; g.fillText('rejected', 214, Y(0.11) - 6); g.textAlign = 'left';
            g.fillStyle = faint; g.fillText('illustrative', 10, 132);
        } else if (kind === 'ring') {
            const cx = 112, cy = 70, R = 46, n = 16, head = 11, tail = 3;
            for (let i = 0; i < n; i++) {
                const a0 = (i / n) * 6.283 - 1.571 + 0.03, a1 = ((i + 1) / n) * 6.283 - 1.571 - 0.03;
                g.strokeStyle = i >= tail && i < head ? accent : line; g.lineWidth = 12;
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
            const vortices = [[80, 70, 1], [148, 70, -1]];
            const velocity = (x, y) => {
                let vx = 0, vy = 0;
                for (const [px, py, s] of vortices) {
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
                    const [vx, vy] = velocity(x, y), m = Math.hypot(vx, vy) || 1;
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

    const bounds = () => ({
        w: preview.offsetWidth || 240,
        h: preview.offsetHeight || 200,
        minY: topbar.getBoundingClientRect().bottom + 8,
        maxX: root.clientWidth - (preview.offsetWidth || 240) - 16
    });
    const place = (x, y, tilt) => {
        preview.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${(tilt || 0).toFixed(2)}deg)`;
    };

    // Mouse: the card trails the cursor on a spring, above-right of it, flipping at the edges.
    const spring = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, raf: 0 };
    function springFrame() {
        spring.raf = 0;
        if (REDUCED) { spring.x = spring.tx; spring.y = spring.ty; spring.vx = spring.vy = 0; }
        else {
            spring.vx = (spring.vx + (spring.tx - spring.x) * 0.1) * 0.72;
            spring.vy = (spring.vy + (spring.ty - spring.y) * 0.1) * 0.72;
            spring.x += spring.vx; spring.y += spring.vy;
        }
        const b = bounds();
        let x = spring.x + 22;
        if (x > b.maxX) x = spring.x - b.w - 22;
        let y = spring.y - b.h - 14;
        if (y < b.minY) y = spring.y + 28;
        place(Math.max(12, x), y, Math.max(-6, Math.min(6, spring.vx * 0.35)));
        if (Math.abs(spring.tx - spring.x) + Math.abs(spring.ty - spring.y) > 0.5) spring.raf = requestAnimationFrame(springFrame);
    }
    function aim(x, y, jump) {
        spring.tx = x; spring.ty = y;
        if (jump) { spring.x = x; spring.y = y; spring.vx = spring.vy = 0; }
        if (!spring.raf) spring.raf = requestAnimationFrame(springFrame);
    }

    // Keyboard: the card sits above the focused project (below it if there is no room).
    function placeFor(item) {
        const r = item.getBoundingClientRect(), b = bounds();
        if (r.bottom < b.minY || r.top > window.innerHeight) { hide(); return; }
        let y = r.top - b.h - 12;
        if (y < b.minY) y = r.bottom + 12;
        place(Math.max(12, Math.min(b.maxX, r.right - b.w)), y, 0);
        show(item.dataset.preview);
    }
    const focusedProject = () => {
        const a = document.activeElement;
        return a && a.classList && a.classList.contains('project') && a.matches(':focus-visible') ? a : null;
    };

    const canHover = window.matchMedia('(hover: hover)').matches;
    document.querySelectorAll('.project').forEach(item => {
        const kind = item.dataset.preview;
        if (canHover) {
            item.addEventListener('pointerenter', e => { aim(e.clientX, e.clientY, !preview.classList.contains('on')); show(kind); });
            item.addEventListener('pointermove', e => {
                if (!preview.classList.contains('on') || preview.dataset.kind !== kind) { aim(e.clientX, e.clientY, true); show(kind); }
                else aim(e.clientX, e.clientY);
            });
            item.addEventListener('pointerleave', () => { if (!focusedProject()) hide(); });
        }
        item.addEventListener('focus', () => {
            if (!item.matches(':focus-visible')) return;
            placeFor(item);
            requestAnimationFrame(() => { if (focusedProject() === item) placeFor(item); });
        });
        item.addEventListener('blur', hide);
    });
    window.addEventListener('scroll', () => {
        const item = focusedProject();
        if (item) placeFor(item);
        else if (preview.classList.contains('on')) hide();
    }, { passive: true });

    /* ---------- copy email ---------- */
    const copy = document.getElementById('copy-email');
    const copyStatus = document.getElementById('copy-status');
    let copyTimer = 0;
    function copied(label, announcement) {
        copy.textContent = label;
        copyStatus.textContent = announcement;
        clearTimeout(copyTimer);
        copyTimer = setTimeout(() => { copy.textContent = 'Copy'; copyStatus.textContent = ''; }, 1800);
    }
    function copyBySelection() {
        const range = document.createRange();
        range.selectNodeContents(document.querySelector('.email'));
        const selection = window.getSelection();
        selection.removeAllRanges(); selection.addRange(range);
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        if (ok) copied('Copied', 'Email address copied');
        else copied('Selected', 'Email address selected. Press Ctrl+C or Command+C to copy it.');
    }
    copy.addEventListener('click', () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(copy.dataset.email)
                .then(() => copied('Copied', 'Email address copied'), copyBySelection);
        } else {
            copyBySelection();
        }
    });

    /* ---------- misc ---------- */
    document.getElementById('year').textContent = new Date().getFullYear();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawPreviews);
    applyTheme(currentTheme(), false);
})();
