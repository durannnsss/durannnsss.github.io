/* ========================================
   Antigravity Flow Animation Engine
   Inspired by antigravity.google
   ======================================== */

(function () {
    'use strict';

    // Configuration
    const CONFIG = {
        particleCount: 800,
        particleLength: 12,
        particleWidth: 2,
        noiseScale: 0.003,
        noiseSpeed: 0.0003,
        flowSpeed: 1.2,
        mouseInfluence: 120,
        mouseStrength: 0.15,
        friction: 0.96,
        maxSpeed: 3,
        fadeSpeed: 0.012
    };

    // Color palettes matching antigravity.google but adapted for themes
    const COLORS = {
        dark: [
            'rgba(129, 140, 248, 0.7)',  // Indigo
            'rgba(167, 139, 250, 0.7)',  // Purple
            'rgba(99, 102, 241, 0.7)',   // Blue
            'rgba(192, 132, 252, 0.6)',  // Violet
            'rgba(96, 165, 250, 0.6)',   // Sky blue
            'rgba(129, 140, 248, 0.5)',  // Indigo light
        ],
        light: [
            'rgba(79, 70, 229, 0.6)',    // Indigo
            'rgba(124, 58, 237, 0.6)',   // Purple
            'rgba(99, 102, 241, 0.6)',   // Blue
            'rgba(139, 92, 246, 0.5)',   // Violet
            'rgba(59, 130, 246, 0.5)',   // Sky blue
            'rgba(67, 56, 202, 0.4)',    // Indigo dark
        ]
    };

    // Canvas setup
    const canvas = document.getElementById('physics-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    let mouse = { x: null, y: null };
    let time = 0;
    let currentTheme = 'dark';

    // Perlin noise implementation
    class PerlinNoise {
        constructor() {
            this.permutation = [];
            for (let i = 0; i < 256; i++) {
                this.permutation.push(i);
            }
            // Shuffle
            for (let i = 255; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this.permutation[i], this.permutation[j]] = [this.permutation[j], this.permutation[i]];
            }
            this.permutation = [...this.permutation, ...this.permutation];
        }

        fade(t) {
            return t * t * t * (t * (t * 6 - 15) + 10);
        }

        lerp(a, b, t) {
            return a + t * (b - a);
        }

        grad(hash, x, y) {
            const h = hash & 3;
            const u = h < 2 ? x : y;
            const v = h < 2 ? y : x;
            return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
        }

        noise(x, y) {
            const X = Math.floor(x) & 255;
            const Y = Math.floor(y) & 255;
            x -= Math.floor(x);
            y -= Math.floor(y);
            const u = this.fade(x);
            const v = this.fade(y);
            const a = this.permutation[X] + Y;
            const b = this.permutation[X + 1] + Y;
            return this.lerp(
                this.lerp(this.grad(this.permutation[a], x, y), this.grad(this.permutation[b], x - 1, y), u),
                this.lerp(this.grad(this.permutation[a + 1], x, y - 1), this.grad(this.permutation[b + 1], x - 1, y - 1), u),
                v
            );
        }
    }

    const perlin = new PerlinNoise();

    // Resize canvas
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        initParticles();
    }

    // Particle class
    class Particle {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.vx = 0;
            this.vy = 0;
            this.color = this.getColor();
            this.opacity = 0.3 + Math.random() * 0.5;
            this.size = 0.5 + Math.random() * 1.5;
        }

        getColor() {
            const colors = COLORS[currentTheme];
            return colors[Math.floor(Math.random() * colors.length)];
        }

        update() {
            // Get flow direction from noise field
            const noiseValue = perlin.noise(
                this.x * CONFIG.noiseScale,
                this.y * CONFIG.noiseScale + time
            );

            // Convert noise to angle (full rotation range)
            const angle = noiseValue * Math.PI * 4;

            // Add flow force (upward bias for "antigravity" effect)
            this.vx += Math.cos(angle) * CONFIG.flowSpeed * 0.1;
            this.vy += Math.sin(angle) * CONFIG.flowSpeed * 0.1 - 0.05; // Upward bias

            // Mouse interaction - soft repulsion
            if (mouse.x !== null && mouse.y !== null) {
                const dx = this.x - mouse.x;
                const dy = this.y - mouse.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < CONFIG.mouseInfluence && distance > 0) {
                    const force = (CONFIG.mouseInfluence - distance) / CONFIG.mouseInfluence;
                    const smoothForce = force * force * CONFIG.mouseStrength;
                    this.vx += (dx / distance) * smoothForce;
                    this.vy += (dy / distance) * smoothForce;
                }
            }

            // Apply friction
            this.vx *= CONFIG.friction;
            this.vy *= CONFIG.friction;

            // Limit speed
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (speed > CONFIG.maxSpeed) {
                this.vx = (this.vx / speed) * CONFIG.maxSpeed;
                this.vy = (this.vy / speed) * CONFIG.maxSpeed;
            }

            // Update position
            this.x += this.vx;
            this.y += this.vy;

            // Wrap around edges seamlessly
            if (this.x < -20) this.x = canvas.width + 20;
            if (this.x > canvas.width + 20) this.x = -20;
            if (this.y < -20) this.y = canvas.height + 20;
            if (this.y > canvas.height + 20) this.y = -20;
        }

        draw() {
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            const angle = Math.atan2(this.vy, this.vx);
            const length = CONFIG.particleLength * (0.5 + speed * 0.5) * this.size;

            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);

            // Draw elongated particle (dash/stroke style)
            ctx.beginPath();
            ctx.moveTo(-length / 2, 0);
            ctx.lineTo(length / 2, 0);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = CONFIG.particleWidth * this.size;
            ctx.lineCap = 'round';
            ctx.globalAlpha = this.opacity;
            ctx.stroke();

            ctx.restore();
        }
    }

    // Initialize particles
    function initParticles() {
        particles = [];
        const count = Math.min(CONFIG.particleCount, Math.floor((canvas.width * canvas.height) / 2500));
        for (let i = 0; i < count; i++) {
            particles.push(new Particle());
        }
    }

    // Animation loop
    function animate() {
        // Fade effect for trail
        ctx.fillStyle = currentTheme === 'dark'
            ? 'rgba(10, 10, 11, 0.15)'
            : 'rgba(248, 249, 252, 0.15)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Update time for noise animation
        time += CONFIG.noiseSpeed;

        // Update and draw particles
        particles.forEach(particle => {
            particle.update();
            particle.draw();
        });

        requestAnimationFrame(animate);
    }

    // Mouse tracking with smoothing
    let targetMouse = { x: null, y: null };

    function handleMouseMove(e) {
        targetMouse.x = e.clientX;
        targetMouse.y = e.clientY;
    }

    function handleMouseLeave() {
        targetMouse.x = null;
        targetMouse.y = null;
    }

    function updateMouse() {
        if (targetMouse.x !== null && targetMouse.y !== null) {
            if (mouse.x === null) {
                mouse.x = targetMouse.x;
                mouse.y = targetMouse.y;
            } else {
                mouse.x += (targetMouse.x - mouse.x) * 0.1;
                mouse.y += (targetMouse.y - mouse.y) * 0.1;
            }
        } else {
            mouse.x = null;
            mouse.y = null;
        }
        requestAnimationFrame(updateMouse);
    }

    // Touch support
    function handleTouchMove(e) {
        if (e.touches.length > 0) {
            targetMouse.x = e.touches[0].clientX;
            targetMouse.y = e.touches[0].clientY;
        }
    }

    function handleTouchEnd() {
        targetMouse.x = null;
        targetMouse.y = null;
    }

    // Theme management
    function initTheme() {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        currentTheme = savedTheme || (prefersDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', currentTheme);
        updateParticleColors();
    }

    function toggleTheme() {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', currentTheme);
        localStorage.setItem('theme', currentTheme);
        updateParticleColors();
    }

    function updateParticleColors() {
        particles.forEach(particle => {
            particle.color = particle.getColor();
        });
    }

    // Navbar scroll effect
    function handleScroll() {
        const navbar = document.querySelector('.navbar');
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }

    // Smooth scroll for navigation
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    }

    // Initialize everything
    function init() {
        resizeCanvas();
        initTheme();
        initSmoothScroll();
        animate();
        updateMouse();

        // Event listeners
        window.addEventListener('resize', resizeCanvas);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseleave', handleMouseLeave);
        window.addEventListener('touchmove', handleTouchMove, { passive: true });
        window.addEventListener('touchend', handleTouchEnd);
        window.addEventListener('scroll', handleScroll);

        // Theme toggle button
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleTheme);
        }
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
