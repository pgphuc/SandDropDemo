(async()=>{
  const g=window.__game, N=g.CFG.N;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  // drop many droppable clusters so the belt fills up and cubes pack/overlap
  let drops=0;
  for(let round=0; round<14; round++){
    const GRID=g.GRID(); let sel=null;
    for(let r=N-1;r>=0 && !sel;r--)for(let c=0;c<N;c++){
      if(GRID[r][c]<0) continue; const cl=g.floodFill(r,c); if(g.canDrop(cl)){ sel=[r,c]; break; }
    }
    if(!sel) break; if(g.dropAt(sel[0],sel[1])) drops++; await sleep(700);
  }
  await sleep(3000);
  const bc=g.beltCubes.filter(b=>!b.drop);
  // rho in [0,1] = lateral position between inner(0) and outer(1) wall -> confirm confinement
  let rhoMin=9,rhoMax=-9, multiRowAtTh=0;
  const byTh={};
  for(const b of bc){ rhoMin=Math.min(rhoMin,b.rho); rhoMax=Math.max(rhoMax,b.rho);
    const key=Math.round(b.th/0.25); (byTh[key]=byTh[key]||[]).push(b.rho); }
  // count angular bins that hold 2+ cubes across the width (=packed multiple rows, not single file)
  for(const k in byTh) if(byTh[k].length>=2) multiRowAtTh++;
  // measure min cube-cube distance (overlap allowed -> can be < cube size)
  let minD=9; const CH=g.CH;
  const loc=b=>[ (CH.Ai+(CH.Ao-CH.Ai)*b.rho)*Math.cos(b.th), (CH.Bi+(CH.Bo-CH.Bi)*b.rho)*Math.sin(b.th) ];
  const P=bc.map(loc);
  for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++){ const dx=P[i][0]-P[j][0],dy=P[i][1]-P[j][1]; minD=Math.min(minD,Math.hypot(dx,dy)); }
  return {drops, beltCount:bc.length, pool:g.__poolLeft, fallers:g.fallers.length,
          rhoMin:+rhoMin.toFixed(2), rhoMax:+rhoMax.toFixed(2),
          insideWalls: rhoMin>=-0.001 && rhoMax<=1.001,
          angularBinsWith2plus: multiRowAtTh, minPairDist:+minD.toFixed(3),
          cubeSize:+(g.CFG.cell*0.92).toFixed(3), delivered:g.delivered};
})()
