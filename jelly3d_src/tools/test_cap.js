(async()=>{
  const g=window.__game, N=g.CFG.N;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  g.CFG.beltSpeed=0.6; g.CFG.beltGap=0.02;
  // drop everything droppable repeatedly (board drains; pending feeds as jars allow)
  function boardEmpty(){const G=g.GRID();for(let r=0;r<N;r++)for(let c=0;c<N;c++)if(G[r][c]>=0)return false;return true;}
  let drops=0,guard=0;
  while(!boardEmpty() && guard<2000){
    guard++; const G=g.GRID(); let did=false;
    for(let r=N-1;r>=0&&!did;r--)for(let c=0;c<N;c++){
      if(G[r][c]<0)continue; const cl=g.floodFill(r,c);
      if(g.canDrop(cl)){g.dropAt(r,c);drops++;did=true;break;}
    }
    if(!did)break; if(drops%5===0) await sleep(40);
  }
  // wait until at least one jar is capping/leaving (lid visible) OR up to 18s
  let waited=0, sawCap=false;
  while(waited<18000){
    await sleep(300); waited+=300;
    if(g.jars.some(J=>J.state==='capping'||J.state==='leaving'||J.state==='sliding-in')){ sawCap=true; break; }
  }
  return {drops, sawCap, belt:g.beltCubes.length, delivered:g.delivered, total:g.total,
          jars:g.jars.map(J=>({color:J.color,filled:J.filled,cap:J.capacity,state:J.state,hasLid:!!J.lid}))};
})()
