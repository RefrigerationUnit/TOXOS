/* ASCII-like grid background tuned to match the screenshot:
   - aligned lattice of glyphs with subtle drift
   - soft radial vignette and faint scanlines */
(function(){
  const canvas = document.getElementById('ascii-bg');
  if (canvas) {
  const ctx = canvas.getContext('2d', { alpha: true });

  let w, h, dpr, fs, cols, rows, tick = 0;

  function resize(){
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    w = canvas.width = Math.floor(innerWidth * dpr);
    h = canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';

    fs = Math.max(10, Math.floor(11 * dpr));
    cols = Math.ceil(w / (fs * 0.95));
    rows = Math.ceil(h / (fs * 1.05));
    ctx.font = `${fs}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.textBaseline = 'top';
  }

  function glyphAt(x, y){
    const tW = 8, tH = 4; // repeating tile
    const ax = x % tW, ay = y % tH;
    if(ax === 0 && ay === 0) return '+';           // strong nodes
    if(ay === 0 && ax === 4) return '+';           // mid nodes
    if(ay === 0) return '-';                       // horizontals
    if(ax === 0) return ':';                       // vertical guides
    return '·';                                    // filler
  }

  function draw(){
    tick += 1;
  // base fade (stronger for a darker field)
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0,0,w,h);

    const cx = w*0.5, cy = h*0.42;
    // frame-level flicker factor: subtle global fluctuation
    const frameFlicker = Math.max(0.84, Math.min(1.08, 0.94 + 0.08*Math.sin(tick*0.27) + 0.03*(Math.random()-0.5)));
    for(let gy=0; gy<rows; gy++){
      for(let gx=0; gx<cols; gx++){
        const sx = Math.sin((gx*0.25) + tick*0.01) * 0.6;
        const sy = Math.cos((gy*0.22) + tick*0.012) * 0.6;
        const px = Math.floor(gx * fs * 0.95 + sx);
        const py = Math.floor(gy * fs * 1.02 + sy);

        const dx = px - cx, dy = py - cy;
        const vignette = 1 - Math.min(1, Math.hypot(dx,dy) / Math.max(w,h) * 2.1);
        const tw = Math.sin(gx + gy + tick*0.15) * 0.5 + 0.5;
  let alpha = (0.035 + vignette*0.10) * (0.55 + tw*0.20);
  alpha *= frameFlicker; // apply global flicker

  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(190,205,230,0.9)';
        ctx.fillText(glyphAt(gx, gy), px, py);
      }
    }
    ctx.globalAlpha = 1;

    // soft radial glow overlay
  const g = ctx.createRadialGradient(cx, cy, Math.min(w,h)*0.06, cx, cy, Math.max(w,h)*0.75);
  g.addColorStop(0, 'rgba(255,255,255,0.02)');
    g.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    // faint scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for(let y=0; y<h; y+=3){ ctx.fillRect(0,y, w, 1); }

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();
  requestAnimationFrame(draw);
  }

  // Smooth scroll cue
  const cue = document.querySelector('.scroll-cue');
  if(cue){
    cue.addEventListener('click', ()=>{
      const sel = cue.getAttribute('data-target');
      const target = sel ? document.querySelector(sel) : null;
      if(target){ target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  }

  // Dummy donate button
  const donate = document.getElementById('donate-btn');
  if(donate){ donate.addEventListener('click', ()=> alert('Thanks for the support! The donate flow is coming soon.')); }

  // Ensure Home link reloads if already on home
  const home = document.getElementById('home-link');
  if(home){
    home.addEventListener('click', (e)=>{
      if(location.pathname === '/' || /\/TOXOS\/?$/.test(location.pathname)){
        e.preventDefault();
        location.reload();
      }
    });
  }
  // Manifesto fade-in on scroll
  const manifesto = document.getElementById('manifesto');
  if(manifesto){
    if('IntersectionObserver' in window){
      const io = new IntersectionObserver((entries)=>{
        entries.forEach(entry => {
          if(entry.isIntersecting){ manifesto.classList.add('reveal'); }
        });
      }, { threshold: 0.15 });
      io.observe(manifesto);
    } else {
      // Fallback: reveal immediately
      manifesto.classList.add('reveal');
    }
  }
})();