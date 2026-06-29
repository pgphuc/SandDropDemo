// Standalone replica of stepFaller + sand-drain to verify a blocked faller drains
// to the feed floor (visibly) instead of wedging until the phys.life teleport fires.
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const CFG={
  N:20, cell:0.245, boardCenter:{x:0,y:4.8}, boardZ:0.06, funnelY:0.4,
  phys:{g:-9.0,rest:0.16,wallRest:0.28,fric:0.985,maxV:6.0,life:9.0,maxSpin:1.6},
  funnel:{chuteHalf:0.42}, feedFloorY:0.32,
};
let GRID=[];
function boardHalfW(){ return CFG.N*CFG.cell/2; }
function picBottomY(){ return CFG.boardCenter.y - boardHalfW(); }
function cellWorld(r,c){ const N=CFG.N,cell=CFG.cell;
  return {x:CFG.boardCenter.x+(c-(N-1)/2)*cell, y:CFG.boardCenter.y-(r-(N-1)/2)*cell, z:CFG.boardZ}; }
function funnelHalfAt(y){
  const hw=boardHalfW(), bottom=picBottomY(), tip=CFG.funnelY, chute=CFG.funnel.chuteHalf;
  if(y>=bottom) return hw;
  if(y<=tip)    return chute;
  return lerp(hw, chute, (bottom-y)/(bottom-tip));
}
// --- exact copy of stepFaller (with the new SAND DRAIN block) ---
function stepFaller(f, dt){
  const P=CFG.phys, SUB=2, h=dt/SUB, N=CFG.N, cell=CFG.cell, half=cell/2;
  const ld=f.load||0;
  for(let s=0;s<SUB;s++){
    f.contactEnv=false;
    f.vy += P.g*h;
    const sp=Math.hypot(f.vx,f.vy);
    if(sp>P.maxV){ const k=P.maxV/sp; f.vx*=k; f.vy*=k; }
    f.x += f.vx*h; f.y += f.vy*h; f.ang += f.vang*h;
    const settling = ld>=1 || f.y < picBottomY();
    if(f.y > picBottomY()-cell && f.y < CFG.boardCenter.y+boardHalfW()+cell){
      const cf=(f.x-CFG.boardCenter.x)/cell + (N-1)/2;
      const rf=(N-1)/2 - (f.y-CFG.boardCenter.y)/cell;
      const c0=Math.floor(cf), r0=Math.floor(rf);
      for(let r=r0-1;r<=r0+1;r++) for(let c=c0-1;c<=c0+1;c++){
        if(r<0||c<0||r>=N||c>=N) continue;
        if(GRID[r][c]<0) continue;
        const w=cellWorld(r,c);
        const nx0=clamp(f.x, w.x-half, w.x+half);
        const ny0=clamp(f.y, w.y-half, w.y+half);
        let dx=f.x-nx0, dy=f.y-ny0, d2=dx*dx+dy*dy;
        if(d2 < f.r*f.r){
          let d, nx, ny;
          if(d2<1e-7){ nx=0; ny=1; d=0; }
          else { d=Math.sqrt(d2); nx=dx/d; ny=dy/d; }
          const push=f.r-d;
          f.x+=nx*push; f.y+=ny*push;
          const vn=f.vx*nx+f.vy*ny;
          if(vn<0){ f.vx-=(1+P.rest)*vn*nx; f.vy-=(1+P.rest)*vn*ny; }
          const tx=-ny, ty=nx, vt=f.vx*tx+f.vy*ty;
          if(!settling && Math.abs(vt)>1.2) f.vang=-vt/Math.max(f.r,1e-3); else f.vang*=0.5;
          f.vx*=P.fric; f.contactEnv=true;
        }
      }
    }
    // --- SAND DRAIN ---
    if(f.y > picBottomY() && Math.hypot(f.vx,f.vy) < 1.0){
      const cI=Math.round((f.x-CFG.boardCenter.x)/cell + (N-1)/2);
      const rI=Math.round((N-1)/2 - (f.y-CFG.boardCenter.y)/cell);
      const occ=(r,c)=> r>=0 && c>=0 && r<N && c<N && GRID[r][c]>=0;
      if(rI+1<N && occ(rI+1,cI)){
        const sideL = cI>0   && !occ(rI,cI-1);
        const sideR = cI<N-1 && !occ(rI,cI+1);
        const dropL = sideL && !occ(rI+1,cI-1);
        const dropR = sideR && !occ(rI+1,cI+1);
        let dir=0;
        if(dropL && dropR) dir = (f.x>CFG.boardCenter.x)?-1:1;
        else if(dropL)     dir = -1;
        else if(dropR)     dir =  1;
        else if(sideL && sideR) dir = (f.x>CFG.boardCenter.x)?-1:1;
        else if(sideL)     dir = -1;
        else if(sideR)     dir =  1;
        if(dir) f.vx += dir*4.5*h;
      }
    }
    const slow=Math.hypot(f.vx,f.vy)<0.5;
    const lim=funnelHalfAt(f.y)-f.r;
    const nudge=(slow||settling)?0:0.25;
    if(f.x> lim){ f.x= lim; f.vx=-Math.abs(f.vx)*P.wallRest-nudge; if(!settling && Math.abs(f.vy)>1.2) f.vang=-f.vy/Math.max(f.r,1e-3); else f.vang*=0.5; f.contactEnv=true; }
    if(f.x<-lim){ f.x=-lim; f.vx= Math.abs(f.vx)*P.wallRest+nudge; if(!settling && Math.abs(f.vy)>1.2) f.vang= f.vy/Math.max(f.r,1e-3); else f.vang*=0.5; f.contactEnv=true; }
    const floorY=CFG.feedFloorY+f.r;
    if(f.y<floorY){ f.y=floorY; if(f.vy<0) f.vy=-f.vy*P.rest; f.vx*=(slow?0.55:(ld>=2?0.7:0.86)); if(!settling && Math.abs(f.vx)>1.2) f.vang=-f.vx/Math.max(f.r,1e-3); else f.vang*=0.5; f.contactEnv=true; }
    if(f.contactEnv){ const sp=Math.hypot(f.vx,f.vy); f.vang*=(sp<0.35?0.55:(sp<0.9?0.8:0.92));
      if(settling){ f.vx*=0.6; if(f.vy>0) f.vy*=0.45; f.vang*=0.45; }
    }
    else f.vang*=0.98;
    const ms=P.maxSpin; if(f.vang>ms)f.vang=ms; else if(f.vang<-ms)f.vang=-ms;
  }
  f.resting = f.contactEnv && Math.hypot(f.vx,f.vy)<0.5;
}

function emptyGrid(){ return Array.from({length:CFG.N},()=>Array(CFG.N).fill(-1)); }
const FALL_R=CFG.cell*0.46;

// Simulate one faller, return {reachedFloor, time, teleported}
function run(label, setupTerrain, startRC){
  GRID=emptyGrid();
  setupTerrain(GRID);
  const w=cellWorld(startRC[0], startRC[1]);
  GRID[startRC[0]][startRC[1]]=-1; // the cube's own cell is empty (it lifted off)
  const f={x:w.x,y:w.y,vx:0,vy:-0.2,ang:0,vang:0,r:FALL_R,color:0,life:0,load:0};
  const dt=1/60; let reached=false, teleported=false, t=0;
  for(let i=0;i<60*15;i++){          // up to 15 s
    f.life+=dt; t+=dt; stepFaller(f,dt);
    // replicate the anti-hang teleport from update()
    if(f.life > CFG.phys.life && f.y > CFG.feedFloorY + 0.6){
      teleported=true; break;
    }
    if(f.y <= CFG.feedFloorY + f.r + 0.02){ reached=true; break; }
  }
  console.log(`${label}: reachedFloor=${reached} teleported=${teleported} t=${t.toFixed(2)}s finalY=${f.y.toFixed(2)}`);
  return {reached,teleported,t};
}

// Scenario 1: single blocking cell directly below, both sides open -> should slide off and fall out.
run('single-cell-below', g=>{ g[6][10]=1; }, [5,10]);

// Scenario 2: LEFT block of terrain (cols 0..6, rows 10..19); centre channel (cols 7+) open to the funnel.
// Cube starts above the left block -> must walk right toward centre, clear the block, drop the open channel.
run('left-block-walk-to-centre', g=>{
  for(let r=10;r<CFG.N;r++) for(let c=0;c<=6;c++) g[r][c]=2;
}, [9,3]);

// Scenario 3: RIGHT block of terrain (cols 13..19); cube starts above-right -> walk left to centre & drop.
run('right-block-walk-to-centre', g=>{
  for(let r=10;r<CFG.N;r++) for(let c=13;c<CFG.N;c++) g[r][c]=2;
}, [9,16]);

// Scenario 4: staircase — cube must cascade down-and-over several steps to reach the open centre.
run('staircase-drain', g=>{
  // descending steps on the left; open channel down the centre-right
  for(let c=0;c<=8;c++){ const top=6+c; for(let r=top;r<CFG.N;r++) g[r][c]=2; }
}, [5,2]);

// Scenario 5: genuinely pocketed (solid shelf, no escape anywhere) -> SHOULD still teleport (safety net intact).
run('pocketed-no-escape', g=>{
  for(let c=0;c<CFG.N;c++) g[10][c]=2;   // full shelf spanning the width, nothing open below
}, [9,10]);
