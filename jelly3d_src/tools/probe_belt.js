(function(){
  const G=window.__game, THREE=G.THREE, belt=G.belt;
  belt.updateMatrixWorld(true);
  // local axis directions in world
  const ex=new THREE.Vector3(1,0,0).transformDirection(belt.matrixWorld).normalize();
  const ey=new THREE.Vector3(0,1,0).transformDirection(belt.matrixWorld).normalize();
  const ez=new THREE.Vector3(0,0,1).transformDirection(belt.matrixWorld).normalize();
  const box=new THREE.Box3().setFromObject(belt);
  const ctr=box.getCenter(new THREE.Vector3());
  const size=box.getSize(new THREE.Vector3());
  // gather verts in world
  const v=new THREE.Vector3(); let verts=[];
  belt.traverse(m=>{ if(m.isMesh&&m.geometry){ const pos=m.geometry.attributes.position; m.updateMatrixWorld(true);
    for(let i=0;i<pos.count;i+=Math.max(1,Math.floor(pos.count/4000))){ v.fromBufferAttribute(pos,i).applyMatrix4(m.matrixWorld); verts.push(v.clone()); } } });
  // project to belt-local frame coords relative to center
  function loc(p){ const d=p.clone().sub(ctr); return {x:d.dot(ex), y:d.dot(ey), z:d.dot(ez)}; }
  // find which local axis is "thickness" (smallest extent)
  let exX=[1e9,-1e9],exY=[1e9,-1e9],exZ=[1e9,-1e9];
  for(const p of verts){ const l=loc(p);
    exX[0]=Math.min(exX[0],l.x);exX[1]=Math.max(exX[1],l.x);
    exY[0]=Math.min(exY[0],l.y);exY[1]=Math.max(exY[1],l.y);
    exZ[0]=Math.min(exZ[0],l.z);exZ[1]=Math.max(exZ[1],l.z); }
  // assume oval lies in local (X,Y); thickness along local Z (smallest). Find top-face verts (max local z).
  const zTop=exZ[1], zBot=exZ[0], zThk=zTop-zBot;
  // ring: among top-face verts, bin by angle and record min/max radius (in local X,Y, with aspect)
  const NB=24, rmin=new Array(NB).fill(1e9), rmax=new Array(NB).fill(0), cnt=new Array(NB).fill(0);
  let topCount=0;
  for(const p of verts){ const l=loc(p); if(l.z < zTop - zThk*0.30) continue; topCount++;
    const a=Math.atan2(l.y,l.x); let bi=Math.floor(((a+Math.PI)/(2*Math.PI))*NB)%NB; if(bi<0)bi+=NB;
    const r=Math.hypot(l.x,l.y); rmin[bi]=Math.min(rmin[bi],r); rmax[bi]=Math.max(rmax[bi],r); cnt[bi]++; }
  // outer/inner radius along +X and +Y axes (bins near angle 0 and 90)
  return JSON.stringify({
    beltPos:G.CFG.belt.pos, tilt:G.CFG.belt.tilt, rx:G.CFG.belt.rx, rz:G.CFG.belt.rz, riderH:G.CFG.belt.riderH,
    worldCtr:[ctr.x,ctr.y,ctr.z], worldSize:[size.x,size.y,size.z],
    localExtent:{x:exX,y:exY,z:exZ}, zThk:zThk,
    ex:[ex.x,ex.y,ex.z], ey:[ey.x,ey.y,ey.z], ez:[ez.x,ez.y,ez.z],
    topCount, ringRmin:rmin.map(x=>+x.toFixed(3)), ringRmax:rmax.map(x=>+x.toFixed(3)), ringCnt:cnt
  });
})();
