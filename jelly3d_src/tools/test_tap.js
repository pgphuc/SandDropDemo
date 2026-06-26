(async()=>{
  const g=window.__game,N=g.CFG.N;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  // find a bottom-row droppable cell and tap it via screen raycast
  const G=g.GRID(); let target=null;
  for(let r=N-1;r>=0&&!target;r--)for(let c=0;c<N;c++){
    if(G[r][c]<0)continue; const cl=g.floodFill(r,c);
    if(g.canDrop(cl)){target=[r,c];break;}
  }
  const before=g.delivered;
  const f0=g.fallers.length;
  g.tapCell(target[0],target[1]);     // routes through raycaster
  await sleep(200);
  const afterFall=g.fallers.length;
  await sleep(2500);
  return {target, raycastTriggeredFall: afterFall>0 || g.beltCubes.length>0 || g.delivered>before,
          fallersAfterTap:afterFall, belt:g.beltCubes.length, delivered:g.delivered};
})()
