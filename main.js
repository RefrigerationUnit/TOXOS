/* ASCII-like animated background inspired by terminal glyph fields.
   Rendered on a canvas to mimic a subtle Code-like moving texture. */
(function(){
  const canvas = document.getElementById('ascii-bg');
  const ctx = canvas.getContext('2d', { alpha: true });

  // Character set to sprinkle
  const CHARS = ('+ * x - / \\ # = : . · : ; ~'.split(' ')).filter(Boolean);
  let w, h, dpr, fontSize, cols, rows, field, tick = 0;

  function resize(){
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    w = canvas.width = Math.floor(innerWidth * dpr);
    h = canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';

    // Derive grid from size
    fontSize = Math.max(10, Math.floor(12 * dpr));
    cols = Math.ceil(w / (fontSize * 0.9));
    rows = Math.ceil(h / (fontSize * 1.2));

    // Build field
    field = new Array(cols * rows).fill().map(() => ({
      ch: CHARS[(Math.random()*CHARS.length)|0],
      phase: Math.random() * Math.PI * 2,
      speed: 0.002 + Math.random()*0.004,
      jitter: (Math.random()*0.6 + 0.4),
      opacity: 0.15 + Math.random()*0.35
    }));

    ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.textBaseline = 'top';
  }

  function draw(t){
    tick += 1;
    // Subtle fade to create trails
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0,0,w,h);

    // Vignette focus (lighter center, darker edges)
    const grad = ctx.createRadialGradient(w*0.5, h*0.4, Math.min(w,h)*0.05, w*0.5, h*0.4, Math.max(w,h)*0.6);
    grad.addColorStop(0, 'rgba(255,255,255,0.06)');
    grad.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,w,h);

    // Render characters
    for(let y=0; y<rows; y++){
      for(let x=0; x<cols; x++){
        const i = y*cols + x;
        const cell = field[i];
        // Wave offset
        const offX = Math.sin((x*0.35) + (tick*cell.speed) + cell.phase) * cell.jitter;
        const offY = Math.cos((y*0.25) + (tick*cell.speed*1.1) + cell.phase) * cell.jitter;
        const px = Math.floor(x * fontSize * 0.9 + offX);
        const py = Math.floor(y * fontSize * 1.1 + offY);

        // Twinkle
        const tw = (Math.sin((tick*cell.speed*90) + cell.phase) * 0.5 + 0.5);
        ctx.globalAlpha = cell.opacity * (0.6 + tw*0.8);
        ctx.fillStyle = 'rgba(176,240,255,0.85)';
        ctx.fillText(cell.ch, px, py);
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();
  requestAnimationFrame(draw);

  // Smooth scroll cue
  const cue = document.querySelector('.scroll-cue');
  if(cue){
    cue.addEventListener('click', (e)=>{
      const sel = cue.getAttribute('data-target');
      const target = sel ? document.querySelector(sel) : null;
      if(target){ target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  }

  // Dummy donate button
  const donate = document.getElementById('donate-btn');
  if(donate){
    donate.addEventListener('click', ()=>{
      alert('Thanks for the support! The donate flow is coming soon.');
    });
  }

  // Ensure Home link reloads (useful if cached)
  const home = document.getElementById('home-link');
  if(home){
    home.addEventListener('click', (e)=>{
      if(location.pathname === '/' || location.pathname.endsWith('/index.html')){
        e.preventDefault();
        location.reload();
      }
    });
  }
})();