(async()=>{
  const g=window.__game, N=g.CFG.N, TAU=Math.PI*2;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const seen=new WeakSet();
  let checked=0, badGate=0, worst=0;
  const ENTRY=0.25; // BELT_ENTRY_TH/TAU = (pi/2)/2pi
  let nearEntryDrop=0;
  // drain some clusters to populate the belt
  for(let round=0; round<10; round++){
    const GRID=g.GRID(); let sel=null;
    for(let r=N-1;r>=0 && !sel;r--)for(let c=0;c<N;c++){
      if(GRID[r][c]<0) continue; const cl=g.floodFill(r,c); if(g.canDrop(cl)){sel=[r,c];break;} }
    if(sel) g.dropAt(sel[0],sel[1]);
    // watch for drops being initiated and check th vs gate
    for(let k=0;k<40;k++){
      for(const b of g.beltCubes){
        if(b.drop && !seen.has(b) && b.target){
          seen.add(b); checked++;
          const gate=g.slotGateT(b.target.slot);
          let d=Math.abs((b.th/TAU)-gate); d=Math.min(d,1-d);
          if(d>worst) worst=d;
          if(d>0.03) badGate++;                       // must be AT the gate (within ~omega*dt)
          let de=Math.abs((b.th/TAU)-ENTRY); de=Math.min(de,1-de);
          if(de<0.04) nearEntryDrop++;                // should NOT drop right at the entry
        }
      }
      await sleep(25);
    }
  }
  return {checked, badGate, nearEntryDrop, worstGateDist:+worst.toFixed(4), delivered:g.delivered};
})()
