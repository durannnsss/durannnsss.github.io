/* ========================================
   Antigravity Physics Engine
   Portfolio Background Animation
   ======================================== */

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        particleCount: 25,
        minSize: 15,
        maxSize: 70,
        baseVelocity: 0.3,
        friction: 0.98,
        mouseInfluence: 200,
        mouseRepelStrength: 0.8,
        rotationSpeed: 0.015,
        bounceDecay: 0.7,
        connectionDistance: 150,
        connectionOpacity: 0.15
    };

    // Particle shapes
    const SHAPES = ['circle', 'triangle', 'square', 'hexagon', 'diamond'];

    // Color palettes for themes
    const COLORS = {
        dark: [
            { fill: 'rgba(129, 140, 248, 0.15)', stroke: 'rgba(129, 140, 248, 0.4)' },
            { fill: 'rgba(167, 139, 250, 0.15)', stroke: 'rgba(167, 139, 250, 0.4)' },
            { fill: 'rgba(99, 102, 241, 0.15)', stroke: 'rgba(99, 102, 241, 0.4)' },
            { fill: 'rgba(139, 92, 246, 0.12)', stroke: 'rgba(139, 92, 246, 0.35)' },
            { fill: 'rgba(196, 181, 253, 0.1)', stroke: 'rgba(196, 181, 253, 0.3)' }
        ],
        light: [
            { fill: 'rgba(99, 102, 241, 0.08)', stroke: 'rgba(99, 102, 241, 0.25)' },
            { fill: 'rgba(129, 140, 248, 0.08)', stroke: 'rgba(129, 140, 248, 0.25)' },
            { fill: 'rgba(79, 70, 229, 0.08)', stroke: 'rgba(79, 70, 229, 0.25)' },
            { fill: 'rgba(67, 56, 202, 0.06)', stroke: 'rgba(67, 56, 202, 0.2)' },
            { fill: 'rgba(55, 48, 163, 0.06)', stroke: 'rgba(55, 48, 163, 0.2)' }
        ]
    };

    // Canvas setup
    const canvas = document.getElementById('physics-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    let mouse = { x: null, y: null, isMoving: false };
    let animationId = null;
    let currentTheme = 'dark';

    // Resize canvas
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    // Particle class
    class Particle {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = CONFIG.minSize + Math.random() * (CONFIG.maxSize - CONFIG.minSize);
            this.vx = (Math.random() - 0.5) * CONFIG.baseVelocity * 2;
            this.vy = (Math.random() - 0.5) * CONFIG.baseVelocity * 2;
            this.rotation = Math.random() * Math.PI * 2;
            this.rotationSpeed = (Math.random() - 0.5) * CONFIG.rotationSpeed * 2;
            this.shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
            this.colorIndex = Math.floor(Math.random() * COLORS.dark.length);
            this.depth = 0.3 + Math.random() * 0.7; // Parallax depth
            this.baseOpacity = 0.3 + Math.random() * 0.5;
            this.pulsePhase = Math.random() * Math.PI * 2;
            this.pulseSpeed = 0.02 + Math.random() * 0.02;
        }

        update() {
            // Apply mouse influence
            if (mouse.x !== null && mouse.y !== null) {
                const dx = this.x - mouse.x;
                const dy = this.y - mouse.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < CONFIG.mouseInfluence) {
                    const force = (CONFIG.mouseInfluence - distance) / CONFIG.mouseInfluence;
                    const angle = Math.atan2(dy, dx);
                    this.vx += Math.cos(angle) * force * CONFIG.mouseRepelStrength * this.depth;
                    this.vy += Math.sin(angle) * force * CONFIG.mouseRepelStrength * this.depth;
                }
            }

            // Apply friction
            this.vx *= CONFIG.friction;
            this.vy *= CONFIG.friction;

            // Add subtle drift
            this.vx += (Math.random() - 0.5) * 0.02;
            this.vy += (Math.random() - 0.5) * 0.02;

            // Update position
            this.x += this.vx;
            this.y += this.vy;

            // Update rotation
            this.rotation += this.rotationSpeed;

            // Update pulse
            this.pulsePhase += this.pulseSpeed;

            // Boundary collision with bounce
            if (this.x < -this.size) {
                this.x = -this.size;
                this.vx *= -CONFIG.bounceDecay;
            } else if (this.x > canvas.width + this.size) {
                this.x = canvas.width + this.size;
                this.vx *= -CONFIG.bounceDecay;
            }

            if (this.y < -this.size) {
                this.y = -this.size;
                this.vy *= -CONFIG.bounceDecay;
            } else if (this.y > canvas.height + this.size) {
                this.y = canvas.height + this.size;
                this.vy *= -CONFIG.bounceDecay;
            }

            // Wrap around for seamless effect
            if (this.x < -this.size * 2) this.x = canvas.width + this.size;
            if (this.x > canvas.width + this.size * 2) this.x = -this.size;
            if (this.y < -this.size * 2) this.y = canvas.height + this.size;
            if (this.y > canvas.height + this.size * 2) this.y = -this.size;
        }

        draw() {
            const colors = COLORS[currentTheme][this.colorIndex];
            const pulse = 1 + Math.sin(this.pulsePhase) * 0.1;
            const currentSize = this.size * pulse * this.depth;
            
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.globalAlpha = this.baseOpacity * this.depth;

            ctx.fillStyle = colors.fill;
            ctx.strokeStyle = colors.stroke;
            ctx.lineWidth = 1.5;

            this.drawShape(currentSize);

            ctx.restore();
        }

        drawShape(size) {
            const halfSize = size / 2;

            switch (this.shape) {
                case 'circle':
                    ctx.beginPath();
                    ctx.arc(0, 0, halfSize, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    break;

                case 'triangle':
                    ctx.beginPath();
                    ctx.moveTo(0, -halfSize);
                    ctx.lineTo(halfSize, halfSize);
                    ctx.lineTo(-halfSize, halfSize);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    break;

                case 'square':
                    ctx.beginPath();
                    ctx.rect(-halfSize, -halfSize, size, size);
                    ctx.fill();
                    ctx.stroke();
                    break;

                case 'hexagon':
                    ctx.beginPath();
                    for (let i = 0; i < 6; i++) {
                        const angle = (i * Math.PI) / 3;
                        const x = halfSize * Math.cos(angle);
                        const y = halfSize * Math.sin(angle);
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    break;

                case 'diamond':
                    ctx.beginPath();
                    ctx.moveTo(0, -halfSize);
                    ctx.lineTo(halfSize * 0.6, 0);
                    ctx.lineTo(0, halfSize);
                    ctx.lineTo(-halfSize * 0.6, 0);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    break;
            }
        }
    }

    // Draw connections between nearby particles
    function drawConnections() {
        const connectionColor = currentTheme === 'dark' 
            ? 'rgba(129, 140, 248, ' 
            : 'rgba(99, 102, 241, ';

        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < CONFIG.connectionDistance) {
                    const opacity = (1 - distance / CONFIG.connectionDistance) * CONFIG.connectionOpacity;
                    ctx.beginPath();
                    ctx.strokeStyle = connectionColor + opacity + ')';
                    ctx.lineWidth = 0.5;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
    }

    // Initialize particles
    function initParticles() {
        particles = [];
        for (let i = 0; i < CONFIG.particleCount; i++) {
            particles.push(new Particle());
        }
    }

    // Animation loop
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw connections first (behind particles)
        drawConnections();

        // Update and draw particles
        particles.forEach(particle => {
            particle.update();
            particle.draw();
        });

        animationId = requestAnimationFrame(animate);
    }

    // Mouse tracking
    function handleMouseMove(e) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.isMoving = true;

        // Reset moving flag after delay
        clearTimeout(mouse.timeout);
        mouse.timeout = setTimeout(() => {
            mouse.isMoving = false;
        }, 100);
    }

    function handleMouseLeave() {
        mouse.x = null;
        mouse.y = null;
        mouse.isMoving = false;
    }

    // Touch support
    function handleTouchMove(e) {
        if (e.touches.length > 0) {
            mouse.x = e.touches[0].clientX;
            mouse.y = e.touches[0].clientY;
        }
    }

    function handleTouchEnd() {
        mouse.x = null;
        mouse.y = null;
    }

    // Theme management
    function initTheme() {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        currentTheme = savedTheme || (prefersDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', currentTheme);
    }

    function toggleTheme() {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', currentTheme);
        localStorage.setItem('theme', currentTheme);
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
            anchor.addEventListener('click', function(e) {
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
        initParticles();
        initSmoothScroll();
        animate();

        // Event listeners
        window.addEventListener('resize', () => {
            resizeCanvas();
            // Reinitialize particles on significant size change
            if (particles.length !== CONFIG.particleCount) {
                initParticles();
            }
        });

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
