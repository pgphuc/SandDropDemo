(async()=>{
  const g=window.__game,N=g.CFG.N;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  g.CFG.beltSpeed=0.10;          // slower so cubes spread & visible
  // drop several clusters matching active jars
  function activeColors(){return new Set(g.jars.filter(J=>J.state==='active').map(J=>J.color));}
  for(let k=0;k<10;k++){
    const G=g.GRID(),ac=activeColors(); let pick=null,fb=null;
    for(let r=N-1;r>=0&&!pick;r--)for(let c=0;c<N;c++){
      if(G[r][c]<0)continue; const cl=g.floodFill(r,c); if(!g.canDrop(cl))continue;
      if(ac.has(G[r][c])){pick=[r,c];break;} if(!fb)fb=[r,c];
    }
    const s=pick||fb; if(!s)break; g.dropAt(s[0],s[1]); await sleep(700);
  }
  await sleep(2500);
  return {belt:g.beltCubes.length, delivered:g.delivered};
})()
