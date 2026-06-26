(async()=>{
  const g=window.__game, N=g.CFG.N;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const log=[];
  // Drop clusters whose color currently matches an active jar, prefer those.
  function activeColors(){ return new Set(g.jars.filter(J=>J.state==='active').map(J=>J.color)); }
  let drops=0;
  for(let round=0; round<8; round++){
    const GRID=g.GRID(); const ac=activeColors();
    // find a droppable cluster, prefer active-jar colors
    let pick=null, fallback=null;
    for(let r=N-1;r>=0 && !pick;r--)for(let c=0;c<N;c++){
      if(GRID[r][c]<0) continue;
      const cl=g.floodFill(r,c);
      if(!g.canDrop(cl)) continue;
      if(ac.has(GRID[r][c])){ pick=[r,c]; break; }
      if(!fallback) fallback=[r,c];
    }
    const sel=pick||fallback; if(!sel) break;
    const ok=g.dropAt(sel[0],sel[1]); if(ok){drops++; log.push('drop '+sel[0]+','+sel[1]);}
    await sleep(1400);
  }
  // let belt drain a while
  await sleep(4000);
  return {drops, log, belt:g.beltCubes.length, fallers:g.fallers.length,
          delivered:g.delivered, total:g.total, pct:Math.round(g.delivered/g.total*100),
          jars:g.jars.map(J=>({slot:J.slot,color:J.color,filled:J.filled,cap:J.capacity,reserved:J.reserved,state:J.state}))};
})()
