/* ==========================================================
   effects.js — Canvas particle system & visual effects
   ========================================================== */

const effects = (() => {
  let canvas, ctx, particles = [], raf;

  /* ---- Init ---- */
  function init() {
    canvas = document.getElementById('particle-canvas');
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    if (!raf) loop();
    createStars();
  }

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  /* ---- Loop ---- */
  function loop() {
    raf = requestAnimationFrame(loop);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += p.gravity;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.life -= p.decay;
      p.size = Math.max(0, p.size * 0.97);
      drawParticle(p);
    });
  }

  function drawParticle(p) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.shadowBlur  = p.glow;
    ctx.shadowColor = p.color;
    ctx.fillStyle   = p.color;
    if (p.shape === 'star') {
      drawStar(p.x, p.y, p.size);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawStar(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a  = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const a2 = a + (2 * Math.PI) / 10;
      const ri = r * 0.42;
      if (i === 0) ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
      else         ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
      ctx.lineTo(x + ri * Math.cos(a2), y + ri * Math.sin(a2));
    }
    ctx.closePath();
    ctx.fill();
  }

  /* ---- Spawn helpers ---- */
  function spark(x, y, vx, vy, color, size, options = {}) {
    particles.push({
      x, y, vx, vy,
      color,
      size,
      shape:   options.shape   || 'circle',
      glow:    options.glow    ?? 10,
      life:    options.life    ?? 1,
      decay:   options.decay   ?? 0.022,
      drag:    options.drag    ?? 0.95,
      gravity: options.gravity ?? 0.18,
    });
  }

  /* ---- Public effects ---- */

  function explosion(x, y) {
    const colors = ['#ff4400','#ff8800','#ffcc00','#ff2200','#ff6600','#ffffff','#ffaa00'];
    // Outward sparks
    for (let i = 0; i < 65; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * 11 + 2;
      spark(x, y, Math.cos(a)*s, Math.sin(a)*s,
        colors[i % colors.length],
        Math.random() * 4 + 1,
        { glow: 12, decay: Math.random() * 0.022 + 0.018, drag: 0.94, gravity: 0.22 });
    }
    // White central flash
    for (let i = 0; i < 18; i++) {
      spark(
        x + (Math.random()-0.5)*28,
        y + (Math.random()-0.5)*28,
        (Math.random()-0.5)*3.5,
        (Math.random()-0.5)*3.5 - 1.5,
        '#ffffff',
        Math.random() * 8 + 4,
        { glow: 22, decay: 0.038, drag: 0.92, gravity: -0.04 });
    }
    // Smoke rings
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      spark(x, y, Math.cos(a)*2.5, Math.sin(a)*2.5 - 1,
        `rgba(200,150,80,0.7)`,
        Math.random() * 10 + 6,
        { glow: 0, decay: 0.012, drag: 0.97, gravity: -0.06 });
    }
  }

  function mergeSparkle(x, y, color) {
    const count = 22;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const s = Math.random() * 4 + 1;
      spark(x, y, Math.cos(a)*s, Math.sin(a)*s, color,
        Math.random() * 3 + 1,
        { glow: 9, decay: 0.028, drag: 0.95, gravity: 0.07 });
    }
    // Center star
    spark(x, y, 0, -1, color, 5, { shape: 'star', glow: 16, decay: 0.030, drag: 0.97, gravity: 0.04 });
  }

  function fireworks() {
    const palette = ['#ffd700','#ff00ff','#00ffff','#ff4400','#00ff88','#ffffff'];
    let shot = 0;
    const fire = () => {
      if (shot >= 8) return;
      shot++;
      const x = 80 + Math.random() * (window.innerWidth  - 160);
      const y = 60 + Math.random() * (window.innerHeight * 0.55);
      const color = palette[Math.floor(Math.random() * palette.length)];
      const count = 90;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const sp = Math.random() * 8 + 2;
        spark(x, y, Math.cos(a)*sp, Math.sin(a)*sp, color,
          Math.random() * 5 + 2,
          { shape: Math.random() < 0.4 ? 'star' : 'circle',
            glow: 14, decay: 0.014, drag: 0.96, gravity: 0.12 });
      }
      setTimeout(fire, 320);
    };
    fire();
  }

  /* ---- Stars background ---- */
  function createStars() {
    const el = document.getElementById('stars');
    if (!el) return;
    el.innerHTML = '';
    for (let i = 0; i < 90; i++) {
      const s = document.createElement('div');
      s.className = 'star';
      const sz = Math.random() * 1.8 + 0.4;
      s.style.cssText = [
        `width:${sz}px`, `height:${sz}px`,
        `left:${Math.random()*100}%`, `top:${Math.random()*100}%`,
        `--dur:${(Math.random()*4+2).toFixed(1)}s`,
        `--op:${(Math.random()*0.55+0.08).toFixed(2)}`,
        `animation-delay:${(Math.random()*5).toFixed(1)}s`,
      ].join(';');
      el.appendChild(s);
    }
  }

  return { init, explosion, mergeSparkle, fireworks, createStars };
})();
