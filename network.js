(function networkBackground(opts){
  const cfg = Object.assign({
    color:'rgba(0,243,255,1)', glowColor:'rgba(0,243,255,0.85)', bgColor:'transparent',
    maxConnDist:150, speed:[10,26], radius:[1.0,2.0], life:[7,15], density:0.00007
  }, opts||{});

  const canvas=document.getElementById('bg-net');
  const ctx=canvas.getContext('2d',{alpha:true});
  let dpr=Math.min(window.devicePixelRatio||1,2), w=0,h=0,nodes=[],running=true,lastT=0;

  const saveData=navigator.connection&&navigator.connection.saveData;
  const isMobile=/Mobi|Android/i.test(navigator.userAgent);
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  let densityScale=(saveData?0.6:1)*(isMobile?0.85:1)*(reduce.matches?0.7:1);

  const rand=(a,b)=>a+Math.random()*(b-a), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function resize(){
    dpr=Math.min(window.devicePixelRatio||1,2);
    const W=innerWidth, H=innerHeight;
    canvas.width=Math.max(1,Math.floor(W*dpr));
    canvas.height=Math.max(1,Math.floor(H*dpr));
    canvas.style.width=W+'px'; canvas.style.height=H+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    w=W; h=H;
    const target=Math.round(w*h*cfg.density*densityScale);
    while(nodes.length<target) nodes.push(new Node());
    while(nodes.length>target) nodes.pop();
  }

  class Node{
    constructor(){ this.reset(true); }
    reset(randomPos){
      this.x=randomPos?rand(0,w):(Math.random()<0.5?-20:w+20);
      this.y=randomPos?rand(0,h):rand(0,h);
      const sp=rand(cfg.speed[0],cfg.speed[1]), ang=rand(0,Math.PI*2);
      this.vx=Math.cos(ang)*sp; this.vy=Math.sin(ang)*sp;
      this.r=rand(cfg.radius[0],cfg.radius[1]);
      this.life=rand(cfg.life[0],cfg.life[1]); this.t=rand(0,this.life);
    }
    update(dt){
      this.t+=dt; if(this.t>=this.life){ this.reset(false); return; }
      this.x+=this.vx*dt; this.y+=this.vy*dt;
      const m=40; if(this.x<-m)this.x=w+m; if(this.x>w+m)this.x=-m; if(this.y<-m)this.y=h+m; if(this.y>h+m)this.y=-m;
    }
    alpha(){ return Math.sin(Math.PI*(this.t/this.life)); }
    drawDot(ctx){
      const a=this.alpha(); if(a<=0) return;
      const g=ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,this.r*6);
      g.addColorStop(0,cfg.glowColor.replace(/,?[^,]+?\)$/,','+(0.6*a).toFixed(3)+')')); g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(this.x,this.y,this.r*6,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=cfg.color; ctx.globalAlpha=Math.max(0,Math.min(1,0.65*a));
      ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
    }
  }

  function buildGrid(cells,size){
    const cols=Math.ceil(w/size), rows=Math.ceil(h/size);
    cells.length=cols*rows; for(let i=0;i<cells.length;i++)cells[i]=[];
    const gi=(x,y)=>Math.floor(y/size)*cols+Math.floor(x/size);
    for(let i=0;i<nodes.length;i++){ const n=nodes[i]; const idx=gi(clamp(n.x,0,w-1),clamp(n.y,0,h-1)); cells[idx].push(i); }
    return {cols,rows};
  }

  function draw(ts){
    if(!running) return;
    const now=ts*0.001, dt=Math.min(0.033,lastT?now-lastT:0.016); lastT=now;
    for(let i=0;i<nodes.length;i++) nodes[i].update(dt);

    ctx.clearRect(0,0,w,h);

    const maxD=cfg.maxConnDist, maxD2=maxD*maxD;
    const cells=[], {cols,rows}=buildGrid(cells,maxD);
    ctx.lineCap='round'; ctx.lineJoin='round'; ctx.globalCompositeOperation='lighter';
    const idx=(cx,cy)=>cy*cols+cx;

    for(let cy=0;cy<rows;cy++) for(let cx=0;cx<cols;cx++){
      const bucket=cells[idx(cx,cy)]; if(!bucket||!bucket.length)continue;
      const neigh=[[cx,cy],[cx+1,cy],[cx,cy+1],[cx+1,cy+1],[cx-1,cy+1]];
      for(const [nx,ny] of neigh){
        if(nx<0||ny<0||nx>=cols||ny>=rows)continue;
        const nb=cells[idx(nx,ny)]; if(!nb)continue;
        for(let i=0;i<bucket.length;i++){
          const A=nodes[bucket[i]], aA=A.alpha(); if(aA<=0)continue;
          const j0=(nx===cx&&ny===cy)?i+1:0;
          for(let j=j0;j<nb.length;j++){
            const B=nodes[nb[j]], aB=B.alpha(); if(aB<=0)continue;
            const dx=A.x-B.x, dy=A.y-B.y, d2=dx*dx+dy*dy; if(d2>maxD2)continue;
            const d=Math.sqrt(d2), closeness=1-d/maxD, alpha=Math.pow(closeness,1.5)*(0.75*(aA+aB)*0.5);
            ctx.strokeStyle=cfg.color; ctx.globalAlpha=alpha; ctx.lineWidth=1+1.2*closeness;
            ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
          }
        }
      }
    }
    ctx.globalAlpha=1; for(let i=0;i<nodes.length;i++) nodes[i].drawDot(ctx);
    if(!reduce.matches) requestAnimationFrame(draw);
  }

  document.addEventListener('visibilitychange',()=>{ running=!document.hidden; if(running){ lastT=0; requestAnimationFrame(draw); }});
  reduce.addEventListener?.('change',e=>{ if(e.matches){ running=false; for(let i=0;i<nodes.length;i++)nodes[i].update(0.016); lastT=0; draw(performance.now()); } else { running=true; lastT=0; requestAnimationFrame(draw); }});
  addEventListener('resize',resize,{passive:true});
  resize();
  if(reduce.matches){ draw(performance.now()); } else { requestAnimationFrame(draw); }
})();
