(async()=>{
  const g=window.__game, N=g.CFG.N;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  // accelerate belt for the test
  g.CFG.beltSpeed=0.55; g.CFG.beltGap=0.022;
  // 1) drain the whole board: repeatedly drop any droppable cluster
  let drops=0, guard=0;
  function boardEmpty(){const G=g.GRID();for(let r=0;r<N;r++)for(let c=0;c<N;c++)if(G[r][c]>=0)return false;return true;}
  while(!boardEmpty() && guard<2000){
    guard++;
    const G=g.GRID(); let did=false;
    for(let r=N-1;r>=0 && !did;r--)for(let c=0;c<N;c++){
      if(G[r][c]<0) continue;
      const cl=g.floodFill(r,c);
      if(g.canDrop(cl)){ g.dropAt(r,c); drops++; did=true; break; }
    }
    if(!did) break;
    if(drops%6===0) await sleep(60);
  }
  const drained=boardEmpty();
  // 2) wait for delivery to converge / win
  let waited=0;
  while(!g.state.won && waited<75000){
    await sleep(750); waited+=750;
  }
  return {drained, drops, won:g.state.won, delivered:g.delivered, total:g.total,
          belt:g.beltCubes.length, pendingFallers:g.fallers.length,
          jars:g.jars.map(J=>({color:J.color,filled:J.filled,cap:J.capacity,state:J.state}))};
})()
