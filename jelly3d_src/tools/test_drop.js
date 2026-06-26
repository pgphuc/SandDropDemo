(async()=>{
  const g=window.__game, N=g.CFG.N;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  // drop clusters whose colour matches an active jar so deliveries happen often
  function activeColors(){ return new Set(g.jars.filter(J=>J.state==='active').map(J=>J.color)); }
  for(let round=0; round<6; round++){
    const GRID=g.GRID(), ac=activeColors(); let sel=null,fb=null;
    for(let r=N-1;r>=0 && !sel;r--)for(let c=0;c<N;c++){
      if(GRID[r][c]<0) continue; const cl=g.floodFill(r,c); if(!g.canDrop(cl)) continue;
      if(ac.has(GRID[r][c])){sel=[r,c];break;} if(!fb)fb=[r,c];
    }
    sel=sel||fb; if(!sel) break; g.dropAt(sel[0],sel[1]); await sleep(700);
  }
  // poll fast until a cube is mid drop-into-jar, then return so the screenshot catches it
  for(let i=0;i<2000;i++){
    const d=g.beltCubes.find(b=>b.drop && b.drop.t>0.15 && b.drop.t<0.8);
    if(d) return {caught:true, t:+d.drop.t.toFixed(2), pos:[+d.mesh.position.x.toFixed(2),+d.mesh.position.y.toFixed(2)], delivered:g.delivered};
    await sleep(8);
  }
  return {caught:false, delivered:g.delivered};
})()
