(function networkBackground(opts){
  // ---- Config --------------------------------------------------------------
  const cfg = Object.assign({
    color:       'rgba(0,243,255,1)',    // line + dot core color
    glowColor:   'rgba(0,243,255,0.85)', // soft dot glow
    bgColor:     'transparent',
    maxConnDist: 165,                    // px distance to draw lines
    speed:       [10, 24],               // px/sec
    radius:      [1.0, 2.0],             // dot radius (px)
    life:        [12, 28],               // seconds (longer lives)
    density:     0.000085,               // nodes per pixel
    fadeIn:      0.18,                   // % life to fade in
    fadeOut:     0.22,                   // % life to fade out

    // Cursor attraction (already added previously)
    attractRadius:   140,                // px
    attractStrength: 90,                 // px/s^2

    // NEW: spawn separation + link pop guard
    minSpawnDist: 32,                    // px minimum distance from existing nodes
    spawnAttempts: 6,                    // respawn tries to find a free spot
    spawnAttemptsFirst: 2,               // lighter checks during initial seeding
    linkAlphaMin: 0.14                   // both nodes must be at least this visible
  }, opts || {});

  // Spawn mix: sides + center + anywhere
  const SPAWN = {
    edgeBias:   0.45,
    centerBias: 0.20,
    margin:     40,
    centerBox:  0.40
  };

  // ---- Setup ---------------------------------------------------------------
  const canvas = document.getElementById('bg-net');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d', { alpha: true });

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0, nodes = [], running = true, lastT = 0;

  const saveData = navigator.connection && navigator.connection.saveData;
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  const reduce   = window.matchMedia('(prefers-reduced-motion: reduce)');

  let densityScale =
    (saveData ? 0.6 : 1) *
    (isMobile ? 0.85 : 1) *
    (reduce.matches ? 0.7 : 1);

  // Cursor/touch position
  const cursor = { x: 0, y: 0, active: false };
  addEventListener('pointermove', (e) => {
    cursor.x = e.clientX; cursor.y = e.clientY; cursor.active = true;
  }, { passive: true });
  addEventListener('pointerleave', () => { cursor.active = false; }, { passive: true });
  addEventListener('touchstart', (e) => {
    const t = e.touches[0]; if (!t) return;
    cursor.x = t.clientX; cursor.y = t.clientY; cursor.active = true;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    const t = e.touches[0]; if (!t) return;
    cursor.x = t.clientX; cursor.y = t.clientY;
  }, { passive: true });
  addEventListener('touchend',   () => { cursor.active = false; }, { passive: true });
  addEventListener('touchcancel',() => { cursor.active = false; }, { passive: true });

  // Utils
  const rand  = (a,b) => a + Math.random() * (b - a);
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const ease  = t => t*t*(3 - 2*t); // smoothstep 0..1

  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = innerWidth, H = innerHeight;

    canvas.width  = Math.max(1, Math.floor(W * dpr));
    canvas.height = Math.max(1, Math.floor(H * dpr));
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    w = W; h = H;

    const target = Math.round(w * h * cfg.density * densityScale);
    while (nodes.length < target) nodes.push(new Node());
    while (nodes.length > target) nodes.pop();
  }

  // Quick proximity test for spawn rejection
  const minD2 = cfg.minSpawnDist * cfg.minSpawnDist;
  function tooClose(x, y){
    for (let i = 0; i < nodes.length; i++){
      const n = nodes[i];
      const dx = n.x - x, dy = n.y - y;
      if (dx*dx + dy*dy < minD2) return true;
    }
    return false;
  }

  // ---- Node ---------------------------------------------------------------
  class Node{
    constructor(){ this.reset(true); }

    reset(firstGen){
      const sp = rand(cfg.speed[0], cfg.speed[1]);
      let ang = 0;
      let baseLife = rand(cfg.life[0], cfg.life[1]);

      // Choose a spawn location, but avoid being too close to others
      let attempts = firstGen ? cfg.spawnAttemptsFirst : cfg.spawnAttempts;
      let edgeSpawn = false;

      let candX = 0, candY = 0, candAng = 0;
      for (let a = 0; a < Math.max(1, attempts); a++){
        const r = Math.random();
        edgeSpawn = false;

        if (!firstGen && r < SPAWN.edgeBias){
          // Edge spawn (left/right), aimed inward
          edgeSpawn = true;
          const fromLeft = Math.random() < 0.5;
          candX = fromLeft ? -SPAWN.margin : w + SPAWN.margin;
          candY = rand(0, h);
          candAng = fromLeft ? rand(-Math.PI/3,  Math.PI/3)
                             : rand( 2*Math.PI/3, 4*Math.PI/3);
        } else if (!firstGen && r < SPAWN.edgeBias + SPAWN.centerBias){
          // Center box spawn
          const cx = w * 0.5, cy = h * 0.5;
          const bw = w * SPAWN.centerBox, bh = h * SPAWN.centerBox;
          candX = rand(cx - bw/2, cx + bw/2);
          candY = rand(cy - bh/2, cy + bh/2);
          candAng = rand(0, Math.PI * 2);
        } else {
          // Anywhere (used also for firstGen)
          candX = rand(0, w);
          candY = rand(0, h);
          candAng = rand(0, Math.PI * 2);
        }

        if (!tooClose(candX, candY)) break; // accept this candidate
        if (a === attempts - 1) break;      // give up and use last candidate
      }

      this.x = candX; this.y = candY; ang = candAng;

      if (edgeSpawn){
        // Ensure lifetime long enough to cross center band
        const centerW = w * SPAWN.centerBox;
        const distX   = (w - centerW) * 0.5 + SPAWN.margin;
        const minTimeToCenter = distX / Math.max(1e-6, sp * 0.5);
        baseLife = Math.max(baseLife, minTimeToCenter + 3);
      }

      this.vx = Math.cos(ang) * sp;
      this.vy = Math.sin(ang) * sp;

      this.r    = rand(cfg.radius[0], cfg.radius[1]);
      this.life = baseLife;

      // Subtle fade-in for respawns
      if (firstGen){
        this.t = rand(0, this.life); // variety on first paint
      } else {
        const jitter = rand(0, cfg.fadeIn * this.life * 0.3);
        this.t = jitter;
      }
    }

    update(dt){
      this.t += dt;
      if (this.t >= this.life){ this.reset(false); return; }

      // Cursor attraction (disabled if reduced motion)
      if (cursor.active && !reduce.matches){
        const dx = cursor.x - this.x;
        const dy = cursor.y - this.y;
        const r2 = dx*dx + dy*dy;
        const R  = cfg.attractRadius;
        if (r2 > 0 && r2 < R*R){
          const d = Math.sqrt(r2);
          const falloff = 1 - (d / R);
          const ax = (dx / d) * cfg.attractStrength * falloff;
          const ay = (dy / d) * cfg.attractStrength * falloff;

          // Accelerate toward cursor
          this.vx += ax * dt;
          this.vy += ay * dt;

          // Clamp max speed so it stays calm
          const v = Math.hypot(this.vx, this.vy);
          const vmax = Math.max(cfg.speed[1] * 1.8, 40);
          if (v > vmax){ const s = vmax / v; this.vx *= s; this.vy *= s; }
        }
      }

      // Integrate position
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Soft wrap
      const m = 40;
      if (this.x < -m) this.x = w + m;
      if (this.x > w + m) this.x = -m;
      if (this.y < -m) this.y = h + m;
      if (this.y > h + m) this.y = -m;
    }

    alpha(){
      const p  = this.t / this.life;       // 0..1
      const fi = Math.max(0.001, cfg.fadeIn);
      const fo = Math.max(0.001, cfg.fadeOut);

      let aIn = 1, aOut = 1;
      if (p < fi)     aIn  = ease(p / fi);        // ramp 0→1
      if (p > 1 - fo) aOut = ease((1 - p) / fo);  // ramp 1→0
      return Math.min(aIn, aOut);                 // plateau between
    }

    drawDot(ctx){
      const a = this.alpha();
      if (a <= 0) return;

      // Glow
      const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 6);
      g.addColorStop(0, cfg.glowColor.replace(/,?[^,]+?\)$/, ',' + (0.6 * a).toFixed(3) + ')'));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 6, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = cfg.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, 0.65 * a));
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ---- Spatial grid for faster neighbor queries ---------------------------
  function buildGrid(cells, size){
    const cols = Math.ceil(w / size), rows = Math.ceil(h / size);
    cells.length = cols * rows;
    for (let i = 0; i < cells.length; i++) cells[i] = [];
    const gi = (x, y) => (Math.floor(y / size) * cols + Math.floor(x / size));
    for (let i = 0; i < nodes.length; i++){
      const n = nodes[i];
      const idx = gi(clamp(n.x, 0, w - 1), clamp(n.y, 0, h - 1));
      cells[idx].push(i);
    }
    return { cols, rows };
  }

  // ---- Render loop --------------------------------------------------------
  function draw(ts){
    if (!running) return;

    const now = ts * 0.001;
    const dt  = Math.min(0.033, lastT ? now - lastT : 0.016);
    lastT = now;

    for (let i = 0; i < nodes.length; i++) nodes[i].update(dt);

    ctx.clearRect(0, 0, w, h);

    const maxD = cfg.maxConnDist, maxD2 = maxD * maxD;
    const cells = [], { cols, rows } = buildGrid(cells, maxD);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';

    const idx = (cx, cy) => cy * cols + cx;

    for (let cy = 0; cy < rows; cy++){
      for (let cx = 0; cx < cols; cx++){
        const bucket = cells[idx(cx, cy)];
        if (!bucket || !bucket.length) continue;

        const neigh = [[cx,cy],[cx+1,cy],[cx,cy+1],[cx+1,cy+1],[cx-1,cy+1]];
        for (const [nx, ny] of neigh){
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const nb = cells[idx(nx, ny)];
          if (!nb) continue;

          for (let i = 0; i < bucket.length; i++){
            const A = nodes[bucket[i]], aA = A.alpha();
            if (aA < cfg.linkAlphaMin) continue; // NEW: guard early

            const j0 = (nx === cx && ny === cy) ? i + 1 : 0;
            for (let j = j0; j < nb.length; j++){
              const B = nodes[nb[j]], aB = B.alpha();
              if (aB < cfg.linkAlphaMin) continue; // NEW: both must be visible enough

              const dx = A.x - B.x, dy = A.y - B.y;
              const d2 = dx*dx + dy*dy;
              if (d2 > maxD2) continue;

              const d = Math.sqrt(d2);
              const closeness = 1 - d / maxD;
              const alphaLine = Math.pow(closeness, 1.5) * (0.75 * (aA + aB) * 0.5);

              ctx.strokeStyle = cfg.color;
              ctx.globalAlpha = alphaLine;
              ctx.lineWidth = 1 + 1.2 * closeness;
              ctx.beginPath();
              ctx.moveTo(A.x, A.y);
              ctx.lineTo(B.x, B.y);
              ctx.stroke();
            }
          }
        }
      }
    }
    ctx.globalAlpha = 1;

    for (let i = 0; i < nodes.length; i++) nodes[i].drawDot(ctx);

    if (!reduce.matches) requestAnimationFrame(draw);
  }

  // ---- Lifecycle & events -------------------------------------------------
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running){ lastT = 0; requestAnimationFrame(draw); }
  });

  reduce.addEventListener?.('change', e => {
    if (e.matches){
      running = false;
      for (let i = 0; i < nodes.length; i++) nodes[i].update(0.016);
      lastT = 0; draw(performance.now()); // static frame
    } else {
      running = true; lastT = 0; requestAnimationFrame(draw);
    }
  });

  addEventListener('resize', resize, { passive: true });

  // Init
  resize();
  if (reduce.matches){
    draw(performance.now());
  } else {
    requestAnimationFrame(draw);
  }
})();  // end network IIFE

// --- Manifesto typewriter (paragraph-safe, idempotent) ---------------------
document.addEventListener('DOMContentLoaded', () => {
  const details = document.getElementById('manifesto-details');
  if (!details) return;

  const inner = details.querySelector('.manifesto-inner');
  const paragraphs = Array.from(inner.querySelectorAll('p'));
  const originals = paragraphs.map(p => p.textContent); // snapshot once

  let raf = 0, last = 0, pIndex = 0, cIndex = 0;
  const CPS = 120; // chars per second

  function cancel(){ if (raf){ cancelAnimationFrame(raf); raf = 0; } }
  function resetDisplay(){
    paragraphs.forEach(p => { p.textContent = ''; p.classList.remove('typing'); });
    pIndex = 0; cIndex = 0; last = 0;
  }

  function step(ts){
    if (!last) last = ts;
    let toAdd = Math.max(1, Math.floor((CPS * (ts - last)) / 1000));
    last = ts;

    while (toAdd-- > 0){
      if (pIndex >= originals.length){
        paragraphs[paragraphs.length - 1]?.classList.remove('typing');
        raf = 0; return;
      }
      const text = originals[pIndex];
      if (cIndex === 0) paragraphs[pIndex].classList.add('typing');
      paragraphs[pIndex].textContent += text[cIndex++];
      if (cIndex >= text.length){
        paragraphs[pIndex].classList.remove('typing');
        pIndex++; cIndex = 0;
      }
    }
    raf = requestAnimationFrame(step);
  }

  function start(){ cancel(); resetDisplay(); raf = requestAnimationFrame(step); }

  details.addEventListener('toggle', () => {
    if (details.open) start();
    else { cancel(); resetDisplay(); }
  });

  if (details.open) start(); // in case it's open on load
});



