(function networkBackground(opts){
  // ---- Config --------------------------------------------------------------
  const cfg = Object.assign({
    color:      'rgba(0,243,255,1)',   // line + dot core color
    glowColor:  'rgba(0,243,255,0.85)',// soft dot glow
    bgColor:    'transparent',         // canvas clear (kept transparent)
    maxConnDist: 150,                  // px distance to draw lines
    speed:      [10, 26],              // px/sec
    radius:     [1.0, 2.0],            // dot radius
    life:       [7, 15],               // seconds
    density:    0.00007                // nodes per pixel (auto scales)
  }, opts || {});

  // Spawn mix: sides + center + anywhere
  const SPAWN = {
    edgeBias:   0.45,  // 45% from left/right edges (aimed inward)
    centerBias: 0.20,  // 20% seeded near center box
    margin:     40,    // offscreen margin for edge spawns
    centerBox:  0.40   // width/height fraction of centered spawn box
  };

  // ---- Setup ---------------------------------------------------------------
  const canvas = document.getElementById('bg-net');
  const ctx    = canvas.getContext('2d', { alpha: true });

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0, nodes = [], running = true, lastT = 0;

  // Performance-awareness
  const saveData = navigator.connection && navigator.connection.saveData;
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  const reduce   = window.matchMedia('(prefers-reduced-motion: reduce)');

  let densityScale =
    (saveData ? 0.6 : 1) *
    (isMobile ? 0.85 : 1) *
    (reduce.matches ? 0.7 : 1);

  // Utils
  const rand   = (a,b) => a + Math.random() * (b - a);
  const clamp  = (v,a,b) => Math.max(a, Math.min(b, v));

  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;

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

  // ---- Node ---------------------------------------------------------------
  class Node{
    constructor(){ this.reset(true); }

    reset(firstGen){
      const sp = rand(cfg.speed[0], cfg.speed[1]);
      let ang;

      if (firstGen){
        // Initial seed: anywhere
        this.x = rand(0, w);
        this.y = rand(0, h);
        ang = rand(0, Math.PI * 2);
      } else {
        const r = Math.random();
        if (r < SPAWN.edgeBias){
          // Edge spawn (left or right), aimed inward
          const fromLeft = Math.random() < 0.5;
          this.x = fromLeft ? -SPAWN.margin : w + SPAWN.margin;
          this.y = rand(0, h);
          ang = fromLeft
            ? rand(-Math.PI/3,  Math.PI/3)      // around → (0 rad)
            : rand( 2*Math.PI/3, 4*Math.PI/3);  // around ← (π rad)
        } else if (r < SPAWN.edgeBias + SPAWN.centerBias){
          // Center box spawn
          const cx = w * 0.5, cy = h * 0.5;
          const bw = w * SPAWN.centerBox, bh = h * SPAWN.centerBox;
          this.x = rand(cx - bw/2, cx + bw/2);
          this.y = rand(cy - bh/2, cy + bh/2);
          ang = rand(0, Math.PI * 2);
        } else {
          // Anywhere
          this.x = rand(0, w);
          this.y = rand(0, h);
          ang = rand(0, Math.PI * 2);
        }
      }

      this.vx = Math.cos(ang) * sp;
      this.vy = Math.sin(ang) * sp;
      this.r     = rand(cfg.radius[0], cfg.radius[1]);
      this.life  = rand(cfg.life[0],   cfg.life[1]);
      this.t     = rand(0, this.life); // desync fade phases
    }

    update(dt){
      this.t += dt;
      if (this.t >= this.life){ this.reset(false); return; }
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
      // Smooth fade in/out over life
      return Math.sin(Math.PI * (this.t / this.life)); // 0→1→0
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

    // Update
    for (let i = 0; i < nodes.length; i++) nodes[i].update(dt);

    // Clear (keep transparent so body bg shows)
    ctx.clearRect(0, 0, w, h);

    // Lines
    const maxD = cfg.maxConnDist, maxD2 = maxD * maxD;
    const cells = [], { cols, rows } = buildGrid(cells, maxD);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';

    const idx = (cx, cy) => cy * cols + cx;

    for (let cy = 0; cy < rows; cy++){
      for (let cx = 0; cx < cols; cx++){
        const bucket = cells[idx(cx, cy)];
        if (!bucket || !bucket.length) continue;

        // Check this cell + a few neighbors to avoid duplicates
        const neigh = [[cx,cy],[cx+1,cy],[cx,cy+1],[cx+1,cy+1],[cx-1,cy+1]];
        for (const [nx, ny] of neigh){
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const nb = cells[idx(nx, ny)];
          if (!nb) continue;

          for (let i = 0; i < bucket.length; i++){
            const A = nodes[bucket[i]], aA = A.alpha();
            if (aA <= 0) continue;

            const j0 = (nx === cx && ny === cy) ? i + 1 : 0;
            for (let j = j0; j < nb.length; j++){
              const B = nodes[nb[j]], aB = B.alpha();
              if (aB <= 0) continue;

              const dx = A.x - B.x, dy = A.y - B.y;
              const d2 = dx*dx + dy*dy;
              if (d2 > maxD2) continue;

              const d = Math.sqrt(d2);
              const closeness = 1 - d / maxD;
              const alpha = Math.pow(closeness, 1.5) * (0.75 * (aA + aB) * 0.5);

              ctx.strokeStyle = cfg.color;
              ctx.globalAlpha = alpha;
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

    // Dots
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

  window.addEventListener('resize', resize, { passive: true });

  // Init
  resize();
  if (reduce.matches){
    draw(performance.now());
  } else {
    requestAnimationFrame(draw);
  }
})();

