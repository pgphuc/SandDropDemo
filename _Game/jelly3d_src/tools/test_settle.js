(async()=>{
  const g=window.__game, N=g.CFG.N;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const picBottom=g.CFG.boardCenter.y - (N*g.CFG.cell/2);
  // drop a lot of clusters to build a pile at the funnel mouth
  for(let round=0; round<24; round++){
    const GRID=g.GRID(); let sel=null;
    for(let r=N-1;r>=0 && !sel;r--)for(let c=0;c<N;c++){
      if(GRID[r][c]<0) continue; const cl=g.floodFill(r,c); if(g.canDrop(cl)){sel=[r,c];break;} }
    if(sel) g.dropAt(sel[0],sel[1]);
    await sleep(120);
  }
  // let everything settle
  await sleep(2500);
  // sample spin of the settled pile over ~1s
  let samples=0, sumAbs=0, mx=0, spinning=0, piled=0;
  for(let k=0;k<30;k++){
    for(const f of g.fallers){
      if(f.y < picBottom){                       // a faller down in the funnel/pile
        piled++; samples++;
        const a=Math.abs(f.vang||0); sumAbs+=a; if(a>mx)mx=a;
        if(a>0.5) spinning++;                     // still visibly twirling
      }
    }
    await sleep(33);
  }
  return { pileSamples:samples, avgAbsVang:+(sumAbs/Math.max(1,samples)).toFixed(3),
           maxAbsVang:+mx.toFixed(3), fracStillSpinning:+(spinning/Math.max(1,samples)).toFixed(3),
           fallersNow:g.fallers.length, beltNow:g.beltCubes.length, delivered:g.delivered };
})()
