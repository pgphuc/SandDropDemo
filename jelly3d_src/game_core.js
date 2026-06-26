/* ============================================================
   Jelly Drop 3D — core game logic (global THREE + FBXLoader)
   ============================================================ */
(function(){
"use strict";

// ---------------------------------------------------------------- CONFIG
const PALETTE = [0xe8403a,0xf08a2c,0xf5c531,0x5fb84f,0x2f8fd0,0x3a52b0,0x9c4fd0];
const CFG = {
  N: 20,                       // grid resolution
  cell: 0.245,                 // world size of a board cell
  boardCenter: {x:0, y:4.8},   // center of picture (centered in the frame window)
  boardZ: 0.06,
  frame:  {pos:[0,4.4,-0.25], width:6.0},   // frame outer width in world units
  funnelY: 0.4,                // y where falling cubes converge / belt feed point
  belt:   {pos:[0,-0.9,0.4], size:6.0, depthRatio:0.43, tilt:1.0},  // belt ASSET placement only (max-dim, depth/width ratio, lean toward camera). The ride CHANNEL (trough walls) is MEASURED from the real mesh in buildBelt -> CH{}.
  jarsY:  -2.8,
  jarSlotsX: [-3.0,-1.0,1.0,3.0],
  jarWidth: 1.7,               // world width of jar (asset is a wide shallow bowl)
  lidWidth: 1.62,
  cam:    {fov:40, pos:[0,5.6,20.5], look:[0,2.2,0]},
  jarCapMin: 28, jarCapMax: 70,
  beltSpeed: 0.12,             // loop fraction per second (conveyor angular drift of the whole pack)
  maxBeltCubes: 322,           // ~7x the old single-row capacity — cubes now PACK + OVERLAP in the trough
  beltGap: 0.038,              // (legacy) kept for reference; entry spacing now handled by physical packing
  beltPack: { collR:0.92, soft:0.85, iters:2, win:0.55 }, // cube collision radius (×cell), push softness, relax iters, broadphase angle window
  // ---- physics fall (cubes roll down the picture/frame like terrain) ----
  phys: { g:-9.0, rest:0.16, wallRest:0.28, fric:0.985, maxV:6.0, life:9.0 },
  funnel: { chuteHalf:0.42 },  // half-width of the funnel throat at the tip (CFG.funnelY)
  feedFloorY: 0.32,            // cubes pile here (just above belt entry) and feed onto the belt
};

// ---------------------------------------------------------------- helpers
const TAU = Math.PI*2;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const easeOut=t=>1-Math.pow(1-t,3);
function b64buf(b64){const bin=atob(b64),len=bin.length,a=new Uint8Array(len);for(let i=0;i<len;i++)a[i]=bin.charCodeAt(i);return a.buffer;}

// deterministic RNG so layout is reproducible per load (seedable)
let _seed = 1337;
function rnd(){ _seed = (_seed*1664525 + 1013904223) >>> 0; return _seed/4294967296; }
function rndInt(a,b){ return a + Math.floor(rnd()*(b-a+1)); }

// ---------------------------------------------------------------- THREE setup
let renderer, scene, camera, raycaster, clock;
let pictureMesh, jellyGeo, jellyMat;
const els = {};

function setupRenderer(canvas){
  renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false, preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = !window.__NOSHADOW;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfd0ec);
  camera = new THREE.PerspectiveCamera(CFG.cam.fov, 1, 0.1, 200);
  camera.position.set(...CFG.cam.pos);
  camera.lookAt(...CFG.cam.look);
  raycaster = new THREE.Raycaster();
  clock = new THREE.Clock();

  scene.add(new THREE.AmbientLight(0xffffff, 0.66));
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8090b0, 0.45); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 0.95);
  key.position.set(5,12,8); key.castShadow = renderer.shadowMap.enabled;
  key.shadow.mapSize.set(1024,1024);
  key.shadow.camera.near=1; key.shadow.camera.far=40;
  key.shadow.camera.left=-10; key.shadow.camera.right=10;
  key.shadow.camera.top=14; key.shadow.camera.bottom=-8;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.35); fill.position.set(-6,4,6); scene.add(fill);
}

function resize(){
  const w = els.wrap.clientWidth, h = els.wrap.clientHeight;
  renderer.setSize(w,h,false);
  camera.aspect = w/h; camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- asset normalize
function loadFBX(loader, key){ return loader.parse(b64buf(window.FBX[key]), ""); }

// returns {group, size} ; recenters obj and scales group so max-dim == target (if target given)
function normalize(obj, opts={}){
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  obj.position.sub(c);
  const g = new THREE.Group(); g.add(obj);
  let k=1;
  if(opts.maxDim) k = opts.maxDim/Math.max(s.x,s.y,s.z);
  else if(opts.byWidth) k = opts.byWidth/s.x;
  else if(opts.byHeight) k = opts.byHeight/s.y;
  g.scale.setScalar(k);
  return {group:g, size:s, scale:k, center:c};
}

function makeJellyMat(){
  return new THREE.MeshStandardMaterial({roughness:0.28, metalness:0.0, envMapIntensity:0.6});
}

// ---------------------------------------------------------------- level / picture
let GRID;          // GRID[r][c] = color idx or -1
let totalUnits=0;
let deliveredUnits=0;

// draw a colorful blocky picture into an N×N grid using the palette
function generateLevel(N){
  const cv = document.createElement('canvas'); cv.width=N; cv.height=N;
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled=false;
  const hex = i=>'#'+PALETTE[i].toString(16).padStart(6,'0');
  // background: vertical rainbow-ish bands but chunky
  ctx.fillStyle=hex(2); ctx.fillRect(0,0,N,N);                 // yellow bg
  ctx.fillStyle=hex(4); ctx.fillRect(0,0,N,Math.round(N*0.32)); // blue sky top
  ctx.fillStyle=hex(3); ctx.fillRect(0,Math.round(N*0.72),N,N);// green ground
  // a sun (orange) top-right
  ctx.fillStyle=hex(1);
  circle(ctx, N*0.74, N*0.20, N*0.13);
  // big red apple body center
  ctx.fillStyle=hex(0);
  circle(ctx, N*0.46, N*0.52, N*0.24);
  circle(ctx, N*0.58, N*0.52, N*0.20);
  // purple accent block bottom-left
  ctx.fillStyle=hex(6); ctx.fillRect(Math.round(N*0.06),Math.round(N*0.60),Math.round(N*0.20),Math.round(N*0.22));
  // indigo stripe
  ctx.fillStyle=hex(5); ctx.fillRect(Math.round(N*0.78),Math.round(N*0.42),Math.round(N*0.18),Math.round(N*0.30));
  // read back & snap to nearest palette
  const img = ctx.getImageData(0,0,N,N).data;
  const grid = [];
  for(let r=0;r<N;r++){ grid[r]=[]; for(let c=0;c<N;c++){
    const o=(r*N+c)*4; grid[r][c]=nearestPalette(img[o],img[o+1],img[o+2]);
  }}
  return grid;
}
function circle(ctx,cx,cy,rad){ ctx.beginPath(); ctx.arc(cx,cy,rad,0,TAU); ctx.fill(); }
function nearestPalette(r,g,b){
  let best=0,bd=1e9;
  for(let i=0;i<PALETTE.length;i++){
    const p=PALETTE[i], pr=(p>>16)&255, pg=(p>>8)&255, pb=p&255;
    const d=(r-pr)**2+(g-pg)**2+(b-pb)**2;
    if(d<bd){bd=d;best=i;}
  }
  return best;
}

// cell -> world position (center of picture, r=0 at top)
function cellWorld(r,c){
  const N=CFG.N, cell=CFG.cell;
  const x = CFG.boardCenter.x + (c - (N-1)/2)*cell;
  const y = CFG.boardCenter.y - (r - (N-1)/2)*cell;
  return {x,y,z:CFG.boardZ};
}

// instanceId <-> cell maps
let idToCell=[];          // idToCell[id] = [r,c] or null
let cellToId=[];          // cellToId[r][c] = id
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _col = new THREE.Color();

function buildPicture(){
  const N=CFG.N;
  // jelly geometry scaled to cell, centered
  const inst = N*N;
  pictureMesh = new THREE.InstancedMesh(jellyGeo, jellyMat, inst);
  pictureMesh.castShadow=true; pictureMesh.receiveShadow=true;
  pictureMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(inst*3),3);
  idToCell = new Array(inst).fill(null);
  cellToId = Array.from({length:N},()=>new Array(N).fill(-1));
  let id=0;
  for(let r=0;r<N;r++)for(let c=0;c<N;c++){
    const ci = GRID[r][c];
    const w = cellWorld(r,c);
    _p.set(w.x,w.y,w.z); _q.identity(); _s.set(1,1,1);
    _m.compose(_p,_q,_s);
    pictureMesh.setMatrixAt(id,_m);
    _col.setHex(PALETTE[ci]);
    pictureMesh.setColorAt(id,_col);
    idToCell[id]=[r,c]; cellToId[r][c]=id;
    totalUnits++;
    id++;
  }
  pictureMesh.instanceMatrix.needsUpdate=true;
  if(pictureMesh.instanceColor) pictureMesh.instanceColor.needsUpdate=true;
  scene.add(pictureMesh);
}

function hideInstance(id){
  _p.set(0,-999,0); _q.identity(); _s.set(0.0001,0.0001,0.0001);
  _m.compose(_p,_q,_s); pictureMesh.setMatrixAt(id,_m);
  pictureMesh.instanceMatrix.needsUpdate=true;
}

// ---------------------------------------------------------------- jars / belt models
let jarProto, lidProto, beltGroup;
let frameGroup=null, frameSize=null, frameScale=1;
function buildBelt(beltObj){
  const n = normalize(beltObj, {maxDim: CFG.belt.size});
  // lay flat (oval XY->XZ) then tilt its top toward the camera by CFG.belt.tilt
  n.group.rotation.x = -Math.PI/2 + CFG.belt.tilt;
  n.group.position.set(...CFG.belt.pos);
  // squish depth (belt local Y -> world depth) to the desired width/depth ratio
  const ratio = n.size.y / n.size.x;
  n.group.scale.z *= (CFG.belt.depthRatio/ratio);
  beltGroup = n.group;
  beltGroup.traverse(m=>{if(m.isMesh){m.material=new THREE.MeshStandardMaterial({color:0x8aa0c8,roughness:0.6,metalness:0.05}); m.castShadow=false; m.receiveShadow=true;}});
  scene.add(beltGroup);
  measureBeltChannel();
}

// ------ belt TROUGH channel: an elliptical annulus measured from the real belt mesh ------
// Cubes live in (th = angle around loop, rho = lateral 0..1 across the channel). rho=0 is the
// INNER wall, rho=1 the OUTER wall; clamping rho is what keeps cubes from spilling off the belt.
let beltCtr=new THREE.Vector3(0,-0.9,0.4);
let beltAxA=new THREE.Vector3(1,0,0), beltAxB=new THREE.Vector3(0,1,0), beltAxN=new THREE.Vector3(0,0,1);
const CH={Ao:2.55,Bo:0.60,Ai:1.08,Bi:0.14,heightN:0.42,Rmaj:1.8};  // outer/inner wall half-axes, ride height, centerline major-radius
function measureBeltChannel(){
  beltGroup.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(beltGroup);
  box.getCenter(beltCtr);
  beltAxA.set(1,0,0).transformDirection(beltGroup.matrixWorld).normalize();   // local major axis (world)
  beltAxB.set(0,1,0).transformDirection(beltGroup.matrixWorld).normalize();   // local minor axis (world)
  beltAxN.set(0,0,1).transformDirection(beltGroup.matrixWorld).normalize();   // belt surface normal (world up-ish)
  const v=new THREE.Vector3(), d=new THREE.Vector3(); let zMax=-1e9; const S=[];
  beltGroup.traverse(m=>{ if(m.isMesh&&m.geometry){ const pos=m.geometry.attributes.position; m.updateMatrixWorld(true);
    const step=Math.max(1,Math.floor(pos.count/3000));
    for(let i=0;i<pos.count;i+=step){ v.fromBufferAttribute(pos,i).applyMatrix4(m.matrixWorld); d.copy(v).sub(beltCtr);
      S.push([d.dot(beltAxA), d.dot(beltAxB), d.dot(beltAxN)]); } } });
  for(const s of S) if(s[2]>zMax) zMax=s[2];
  const zThr=zMax-0.18; let aMax=0,bMax=0;       // top-face extent = the oval the belt presents upward
  for(const s of S){ if(s[2]<zThr) continue; if(Math.abs(s[0])>aMax)aMax=Math.abs(s[0]); if(Math.abs(s[1])>bMax)bMax=Math.abs(s[1]); }
  const cubeR=CFG.cell*0.46;
  CH.Ao=aMax*0.93 - cubeR; CH.Bo=bMax*0.86 - cubeR*0.5;   // outer wall sits a cube-radius inside the rim
  CH.Ai=CH.Ao*0.42;        CH.Bi=CH.Bo*0.22;              // inner wall -> leaves an annular band (the trough)
  CH.heightN=zMax + cubeR*0.85;                            // cube centre rides just above the top face
  CH.Rmaj=(CH.Ai+CH.Ao)/2;
}
function chRadii(rho){ return [CH.Ai+(CH.Ao-CH.Ai)*rho, CH.Bi+(CH.Bo-CH.Bi)*rho]; }
// (th,rho) -> world position on the belt surface (+lift along the surface normal)
function beltWorld(th, rho, lift, out){
  const Rmaj=CH.Ai+(CH.Ao-CH.Ai)*rho, Rmin=CH.Bi+(CH.Bo-CH.Bi)*rho;
  const a=Rmaj*Math.cos(th), b=Rmin*Math.sin(th), h=CH.heightN+(lift||0);
  out=out||new THREE.Vector3();
  return out.copy(beltCtr).addScaledVector(beltAxA,a).addScaledVector(beltAxB,b).addScaledVector(beltAxN,h);
}
// convert a small planar push (pa along local-a, pb along local-b) into (dth,drho) at (th,rho)
function planarToThRho(th, rho, pa, pb){
  const Rmaj=CH.Ai+(CH.Ao-CH.Ai)*rho, Rmin=CH.Bi+(CH.Bo-CH.Bi)*rho;
  const Tx=-Rmaj*Math.sin(th), Tb=Rmin*Math.cos(th);                 // d(pos)/d(th)
  const Rx=(CH.Ao-CH.Ai)*Math.cos(th), Rb=(CH.Bo-CH.Bi)*Math.sin(th);// d(pos)/d(rho)
  const tl=Tx*Tx+Tb*Tb||1e-6, rl=Rx*Rx+Rb*Rb||1e-6;
  return [ (pa*Tx+pb*Tb)/tl, (pa*Rx+pb*Rb)/rl ];
}
// back-compat shim for old probes/tests that called beltPoint(t,lateral)
function beltPoint(t, lateral=0){ return beltWorld(t*TAU, clamp(0.5+lateral,0,1), 0); }

let jars=[]; // active jar slot objects
function makeJarSlot(slotIndex){
  return {slot:slotIndex, color:-1, capacity:0, filled:0, reserved:0, full:false,
          group:null, fillMesh:null, lid:null, label:null, state:'empty', anim:0};
}

// ---------------------------------------------------------------- text sprite
function numberSprite(text, color){
  const cv=document.createElement('canvas'); cv.width=128; cv.height=72;
  const ctx=cv.getContext('2d');
  ctx.clearRect(0,0,128,72);
  ctx.font='bold 46px system-ui, Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.lineWidth=7; ctx.strokeStyle='rgba(40,40,60,0.85)'; ctx.strokeText(text,64,38);
  ctx.fillStyle='#ffffff'; ctx.fillText(text,64,38);
  const tex=new THREE.CanvasTexture(cv); tex.minFilter=THREE.LinearFilter;
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,depthWrite:false}));
  spr.scale.set(1.1,0.62,1);
  spr._cv=cv; spr._ctx=ctx; spr._tex=tex;
  return spr;
}
function updateSprite(spr,text){
  const ctx=spr._ctx; ctx.clearRect(0,0,128,72);
  ctx.font='bold 46px system-ui, Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.lineWidth=7; ctx.strokeStyle='rgba(40,40,60,0.85)'; ctx.strokeText(text,64,38);
  ctx.fillStyle='#ffffff'; ctx.fillText(text,64,38);
  spr._tex.needsUpdate=true;
}

// ---------------------------------------------------------------- jar queue & spawning
let jarQueue=[];   // pending jars {color,capacity}
function buildJarQueue(){
  // count colors
  const counts=new Array(PALETTE.length).fill(0);
  for(let r=0;r<CFG.N;r++)for(let c=0;c<CFG.N;c++) counts[GRID[r][c]]++;
  const all=[];
  for(let ci=0;ci<counts.length;ci++){
    let remain=counts[ci];
    while(remain>0){
      const cap=Math.min(remain, rndInt(CFG.jarCapMin,CFG.jarCapMax));
      all.push({color:ci, capacity:cap});
      remain-=cap;
    }
  }
  // shuffle
  for(let i=all.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[all[i],all[j]]=[all[j],all[i]];}
  jarQueue = all;
}

// pick the queued jar whose color is most in demand right now (cubes riding the belt
// without a home, plus queued/falling units). Guarantees belt cubes always get a jar
// (no deadlock) while still feeling varied. Prefers colors not already on another slot.
function pickJarDef(forSlot){
  if(jarQueue.length===0) return null;
  const demand=new Array(PALETTE.length).fill(0);
  for(const bc of beltCubes) if(!bc.target) demand[bc.color]++;
  for(const q of beltQueue2) demand[q.color]++;
  for(const f of fallers) demand[f.color]++;
  const covered=new Set();
  for(const J of jars){ if(J.slot!==forSlot && J.color>=0 && !J.full &&
      (J.state==='active'||J.state==='sliding-in')) covered.add(J.color); }
  let bi=0, bscore=-1;
  for(let i=0;i<jarQueue.length;i++){
    const col=jarQueue[i].color;
    const score=demand[col]*10 + (covered.has(col)?0:4) + 1;
    if(score>bscore){ bscore=score; bi=i; }
  }
  return jarQueue.splice(bi,1)[0];
}

function spawnJarIntoSlot(slot, fromSide){
  if(jarQueue.length===0){ jars[slot].state='empty'; jars[slot].color=-1; return; }
  const def = pickJarDef(slot);
  const J = jars[slot];
  J.color=def.color; J.capacity=def.capacity; J.filled=0; J.reserved=0; J.full=false; J.state='active'; J.anim=0;
  // build group
  const g = jarProto.clone(true);
  const colHex = PALETTE[def.color];
  g.traverse(m=>{ if(m.isMesh){ m.material=new THREE.MeshStandardMaterial({color:colHex,roughness:0.25,metalness:0.0,transparent:true,opacity:0.92}); m.castShadow=true; m.receiveShadow=true; }});
  const x=CFG.jarSlotsX[slot];
  g.position.set(x, CFG.jarsY, 0);
  g.scale.multiplyScalar(1);
  scene.add(g); J.group=g;
  // fill mesh (a box that grows inside the bowl)
  const fillGeo=new THREE.BoxGeometry(1.18,1,0.78);
  const fillMat=new THREE.MeshStandardMaterial({color:colHex,roughness:0.2,emissive:colHex,emissiveIntensity:0.06});
  const fm=new THREE.Mesh(fillGeo,fillMat); fm.castShadow=false;
  fm.position.set(x, CFG.jarsY-0.18, 0); fm.scale.y=0.001;
  scene.add(fm); J.fillMesh=fm;
  // label
  const spr=numberSprite(String(def.capacity), colHex);
  spr.scale.set(0.95,0.54,1);
  spr.position.set(x, CFG.jarsY+0.02, 0.62);
  scene.add(spr); J.label=spr;
  // slide-in anim
  if(fromSide){ g.position.x = x + 5; J.state='sliding-in'; J.anim=0; }
}

function jarTopWorld(J){ return new THREE.Vector3(CFG.jarSlotsX[J.slot], CFG.jarsY+0.55, 0); }

// gate t-value (loop fraction) under each slot at the FRONT of the loop (toward the camera/jars).
// Front arc is where the minor-axis term is negative (b<0 -> larger world Z). For x=Rmaj*cos(th)
// on that arc, th = 2π - acos(x/Rmaj).
function slotGateT(slot){
  const x=CFG.jarSlotsX[slot];
  const th=TAU - Math.acos(clamp(x/CH.Rmaj,-1,1));
  return th/TAU;
}

// ---------------------------------------------------------------- belt cubes (packed in the trough)
let beltCubes=[];        // {mesh,th,rho,color,target,drop,wob,prevTh,_a,_b}
let beltPool=[];
let beltQueue2=[];       // (legacy) kept so HUD/win checks that reference it still work
function initBeltPool(){
  for(let i=0;i<CFG.maxBeltCubes;i++){
    const m=new THREE.Mesh(jellyGeo, makeJellyMat());
    m.visible=false; m.castShadow=true; scene.add(m);
    beltPool.push(m);
  }
}
function getBeltCube(){ return beltPool.pop()||null; }
function releaseBeltCube(m){ m.visible=false; beltPool.push(m); }
function beltCollR(){ return CFG.cell*CFG.beltPack.collR*0.5; }   // packing radius of one cube

const BELT_ENTRY_TH = Math.PI/2;     // back-center of the loop (under the funnel mouth)
// drop a unit onto the belt at the entry; pick a lateral slot (rho) across the channel that
// isn't already occupied so cubes pack in MULTIPLE across the width instead of one row.
function enterBeltUnit(color, target){
  const m=getBeltCube(); if(!m) return false;
  const r=beltCollR(), rr=(2*r)*(2*r);
  let rho=-1;
  for(const cand of [0.5,0.72,0.3,0.9,0.12,0.62,0.4,0.82,0.2]){
    const Rmaj=CH.Ai+(CH.Ao-CH.Ai)*cand, Rmin=CH.Bi+(CH.Bo-CH.Bi)*cand;
    const a=Rmaj*Math.cos(BELT_ENTRY_TH), b=Rmin*Math.sin(BELT_ENTRY_TH);
    let clear=true;
    for(const bc of beltCubes){ if(bc.drop) continue;
      let dth=Math.abs(bc.th-BELT_ENTRY_TH); dth=Math.min(dth,TAU-dth);
      if(dth>0.55) continue;
      const dx=bc._a-a, dy=bc._b-b; if(dx*dx+dy*dy<rr){ clear=false; break; } }
    if(clear){ rho=cand; break; }
  }
  if(rho<0){ beltPool.push(m); return false; }   // entry congested this frame -> cube keeps piling
  m.visible=true; m.material.color.setHex(PALETTE[color]);
  const Rmaj=CH.Ai+(CH.Ao-CH.Ai)*rho, Rmin=CH.Bi+(CH.Bo-CH.Bi)*rho;
  beltCubes.push({mesh:m, th:BELT_ENTRY_TH, rho, color, target, drop:null, wob:rnd()*TAU,
                  prevTh:BELT_ENTRY_TH, _a:Rmaj*Math.cos(BELT_ENTRY_TH), _b:Rmin*Math.sin(BELT_ENTRY_TH)});
  return true;
}
// Slide the lowest piled cube onto the belt (whether or not a jar of its colour is active yet).
// Feeding only succeeds when the entry has a free lateral slot, so the belt fills up to maxBeltCubes.
function tryFeedBelt(){
  if(beltPool.length===0 || !fallers.length) return;
  let pick=-1, lowY=1e9;
  for(let i=0;i<fallers.length;i++){ const f=fallers[i];
    if(f.y < CFG.feedFloorY + f.r*3.0 && f.y < lowY){ lowY=f.y; pick=i; } }
  if(pick<0) return;
  const f=fallers[pick];
  const J=findTargetJar(f.color);   // may be null -> cube rides/packs on the belt until a matching jar appears
  if(enterBeltUnit(f.color, J||null)){ if(J) J.reserved++; releaseFaller(f.mesh); fallers.splice(pick,1); }
}
// cube-cube packing inside the trough: positional relaxation in (th,rho), broadphase by angle.
// Lets cubes pile/overlap and spread across the channel width; rho clamp = the trough walls.
function packBeltCubes(){
  const arr=[]; for(const b of beltCubes) if(!b.drop) arr.push(b);
  for(const b of arr){ const Rmaj=CH.Ai+(CH.Ao-CH.Ai)*b.rho, Rmin=CH.Bi+(CH.Bo-CH.Bi)*b.rho; b._a=Rmaj*Math.cos(b.th); b._b=Rmin*Math.sin(b.th); }
  const m=arr.length; if(m<2) return;
  arr.sort((p,q)=>p.th-q.th);
  const rr=2*beltCollR(), soft=CFG.beltPack.soft, win=CFG.beltPack.win;
  for(let it=0; it<CFG.beltPack.iters; it++){
    for(let i=0;i<m;i++){ const A=arr[i];
      for(let k=1;k<m;k++){ const j=(i+k)%m; const B=arr[j];
        let dth=B.th-A.th; if(dth<0)dth+=TAU; if(dth>win) break;       // only nearby (forward) cubes can touch
        let dx=B._a-A._a, dy=B._b-A._b, d2=dx*dx+dy*dy;
        if(d2>=rr*rr) continue;
        if(d2<1e-9){ dx=0.01; dy=(k&1?0.01:-0.01); d2=dx*dx+dy*dy; }
        const d=Math.sqrt(d2), nx=dx/d, ny=dy/d, push=(rr-d)*0.5*soft;
        const ap=planarToThRho(A.th,A.rho,-nx*push,-ny*push);
        const bp=planarToThRho(B.th,B.rho, nx*push, ny*push);
        A.th+=ap[0]; A.rho=clamp(A.rho+ap[1],0,1);
        B.th+=bp[0]; B.rho=clamp(B.rho+bp[1],0,1);
        let Ra=CH.Ai+(CH.Ao-CH.Ai)*A.rho, Rb=CH.Bi+(CH.Bo-CH.Bi)*A.rho; A._a=Ra*Math.cos(A.th); A._b=Rb*Math.sin(A.th);
        Ra=CH.Ai+(CH.Ao-CH.Ai)*B.rho; Rb=CH.Bi+(CH.Bo-CH.Bi)*B.rho; B._a=Ra*Math.cos(B.th); B._b=Rb*Math.sin(B.th);
      }
    }
  }
}
// find an active, non-full jar of this color with spare (capacity - filled - reserved)
function findTargetJar(color){
  for(const J of jars){
    if(J.state==='active' && !J.full && J.color===color && (J.filled+J.reserved)<J.capacity) return J;
  }
  return null;
}

// ---------------------------------------------------------------- board / funnel geometry
function boardHalfW(){ return CFG.N*CFG.cell/2; }
function picBottomY(){ return CFG.boardCenter.y - boardHalfW(); }
// half-width of the side walls (frame) at a given world y:
//  - full picture width while inside the picture,
//  - linearly narrowing through the funnel down to the throat at CFG.funnelY.
function funnelHalfAt(y){
  const hw=boardHalfW(), bottom=picBottomY(), tip=CFG.funnelY, chute=CFG.funnel.chuteHalf;
  if(y>=bottom) return hw;
  if(y<=tip)    return chute;
  return lerp(hw, chute, (bottom-y)/(bottom-tip));
}

// ---------------------------------------------------------------- falling cubes (physics)
let fallers=[]; // {mesh,x,y,vx,vy,ang,vang,r,color,life}
const FALL_R = ()=>CFG.cell*0.46;
function startFallCluster(cells){
  // cells: array of [r,c], all same color ci
  const ci = GRID[cells[0][0]][cells[0][1]];
  for(const [r,c] of cells){
    const id=cellToId[r][c];
    const w=cellWorld(r,c);
    const m=getFaller();
    m.visible=true; m.material.color.setHex(PALETTE[ci]); m.scale.setScalar(1);
    m.position.set(w.x,w.y,CFG.boardZ);
    // clear grid + instance FIRST so the cube isn't blocked by its own cell
    GRID[r][c]=-1; idToCell[id]=null; cellToId[r][c]=-1; hideInstance(id);
    fallers.push({mesh:m, x:w.x, y:w.y, vx:(rnd()-0.5)*0.6, vy:-0.2,
                  ang:0, vang:(rnd()-0.5)*2, r:FALL_R(), color:ci, life:0});
  }
}
let fallerPool=[];
function initFallerPool(){
  for(let i=0;i<200;i++){const m=new THREE.Mesh(jellyGeo, makeJellyMat()); m.visible=false; m.castShadow=true; scene.add(m); fallerPool.push(m);}
}
function getFaller(){ return fallerPool.pop()||new THREE.Mesh(jellyGeo, makeJellyMat()); }
function releaseFaller(m){ m.visible=false; fallerPool.push(m); }

// advance one faller with gravity + collision against remaining picture cells and frame walls
function stepFaller(f, dt){
  const P=CFG.phys, SUB=2, h=dt/SUB, N=CFG.N, cell=CFG.cell, half=cell/2;
  for(let s=0;s<SUB;s++){
    f.vy += P.g*h;
    // clamp speed
    const sp=Math.hypot(f.vx,f.vy);
    if(sp>P.maxV){ const k=P.maxV/sp; f.vx*=k; f.vy*=k; }
    f.x += f.vx*h; f.y += f.vy*h; f.ang += f.vang*h;

    // --- collide with remaining picture cells (terrain) ---
    if(f.y > picBottomY()-cell && f.y < CFG.boardCenter.y+boardHalfW()+cell){
      const cf=(f.x-CFG.boardCenter.x)/cell + (N-1)/2;
      const rf=(N-1)/2 - (f.y-CFG.boardCenter.y)/cell;
      const c0=Math.floor(cf), r0=Math.floor(rf);
      for(let r=r0-1;r<=r0+1;r++) for(let c=c0-1;c<=c0+1;c++){
        if(r<0||c<0||r>=N||c>=N) continue;
        if(GRID[r][c]<0) continue;
        const w=cellWorld(r,c);
        const nx0=clamp(f.x, w.x-half, w.x+half);
        const ny0=clamp(f.y, w.y-half, w.y+half);
        let dx=f.x-nx0, dy=f.y-ny0, d2=dx*dx+dy*dy;
        if(d2 < f.r*f.r){
          let d, nx, ny;
          if(d2<1e-7){ nx=0; ny=1; d=0; }   // center inside cell -> push up
          else { d=Math.sqrt(d2); nx=dx/d; ny=dy/d; }
          const push=f.r-d;
          f.x+=nx*push; f.y+=ny*push;
          const vn=f.vx*nx+f.vy*ny;
          if(vn<0){ f.vx-=(1+P.rest)*vn*nx; f.vy-=(1+P.rest)*vn*ny; }
          // tangential -> rolling spin + slight friction
          const tx=-ny, ty=nx, vt=f.vx*tx+f.vy*ty;
          f.vang = -vt/Math.max(f.r,1e-3);
          f.vx*=P.fric;
        }
      }
    }
    // --- frame / funnel side walls ---
    const lim=funnelHalfAt(f.y)-f.r;
    if(f.x> lim){ f.x= lim; f.vx=-Math.abs(f.vx)*P.wallRest-0.25; f.vang-=3; }
    if(f.x<-lim){ f.x=-lim; f.vx= Math.abs(f.vx)*P.wallRest+0.25; f.vang+=3; }
    // --- feed floor: cubes pile here (just above the belt) until fed onto the belt ---
    const floorY=CFG.feedFloorY+f.r;
    if(f.y<floorY){ f.y=floorY; if(f.vy<0) f.vy=-f.vy*P.rest; f.vx*=0.86; f.vang=-f.vx/Math.max(f.r,1e-3); }
  }
}
// pairwise soft separation so cubes stack/pile instead of overlapping (jelly heap)
function collideFallers(){
  const n=fallers.length, P=CFG.phys;
  for(let it=0;it<2;it++){
    for(let a=0;a<n;a++){ const A=fallers[a];
      for(let b=a+1;b<n;b++){ const B=fallers[b];
        let dx=B.x-A.x, dy=B.y-A.y; const rr=A.r+B.r; let d2=dx*dx+dy*dy;
        if(d2>=rr*rr) continue;
        if(d2<1e-7){ dx=(a&1?1:-1)*0.01; dy=0.01; d2=dx*dx+dy*dy; }
        const d=Math.sqrt(d2), nx=dx/d, ny=dy/d, push=(rr-d)*0.5;
        A.x-=nx*push; A.y-=ny*push; B.x+=nx*push; B.y+=ny*push;
        const rvn=(B.vx-A.vx)*nx+(B.vy-A.vy)*ny;
        if(rvn<0){ const j=rvn*0.5*(1+P.rest); A.vx+=j*nx; A.vy+=j*ny; B.vx-=j*nx; B.vy-=j*ny; }
      }
    }
  }
}

// ---------------------------------------------------------------- flood fill + drop test
function floodFill(r0,c0){
  const N=CFG.N, ci=GRID[r0][c0]; if(ci<0) return [];
  const seen=new Set(), out=[], stack=[[r0,c0]];
  const key=(r,c)=>r*N+c;
  seen.add(key(r0,c0));
  while(stack.length){
    const [r,c]=stack.pop(); out.push([r,c]);
    const nb=[[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
    for(const [nr,nc] of nb){
      if(nr<0||nc<0||nr>=N||nc>=N) continue;
      if(seen.has(key(nr,nc))) continue;
      if(GRID[nr][nc]===ci){ seen.add(key(nr,nc)); stack.push([nr,nc]); }
    }
  }
  return out;
}
function canDrop(cells){
  const N=CFG.N;
  const set=new Set(cells.map(([r,c])=>r*N+c));
  // for at least one cell, every cell directly below to bottom is empty or in cluster
  // consider the lowest cell of each column in the cluster
  const lowestByCol={};
  for(const [r,c] of cells){ if(lowestByCol[c]===undefined||r>lowestByCol[c]) lowestByCol[c]=r; }
  for(const c in lowestByCol){
    const r=lowestByCol[c]; let clear=true;
    for(let rr=r+1; rr<N; rr++){
      if(GRID[rr][+c]!==-1 && !set.has(rr*N+ +c)){ clear=false; break; }
    }
    if(clear) return true;
  }
  return false;
}

// flash red on blocked
let flashes=[]; // {ids:[], t}
function flashBlocked(cells){
  const ids=cells.map(([r,c])=>cellToId[r][c]).filter(id=>id>=0);
  flashes.push({ids, t:0});
}

// ---------------------------------------------------------------- input
function onTap(clientX, clientY){
  if(state.won) return;
  const rect=renderer.domElement.getBoundingClientRect();
  const nx=((clientX-rect.left)/rect.width)*2-1;
  const ny=-((clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera({x:nx,y:ny}, camera);
  const hit=raycaster.intersectObject(pictureMesh);
  if(!hit.length) return;
  const id=hit[0].instanceId;
  const cell=idToCell[id]; if(!cell) return;
  const [r,c]=cell;
  const cluster=floodFill(r,c);
  if(cluster.length===0) return;
  if(canDrop(cluster)){
    startFallCluster(cluster);
  } else {
    flashBlocked(cluster);
  }
}

// ---------------------------------------------------------------- state / loop
const state={won:false, started:false};
let _accum=0;

function update(dt){
  // ---- falling cubes (gravity + roll over the remaining picture/frame "terrain")
  for(const f of fallers){ f.life+=dt; stepFaller(f, dt); }
  collideFallers();
  for(let i=fallers.length-1;i>=0;i--){
    const f=fallers[i];
    // approach the belt's z-plane as the cube descends past the picture
    const zT = clamp((picBottomY()-f.y)/Math.max(0.01,picBottomY()-CFG.feedFloorY),0,1);
    const z = lerp(CFG.boardZ, CFG.belt.pos[2], zT);
    f.mesh.position.set(f.x, f.y, z);
    f.mesh.rotation.set(0,0,f.ang);
    // jelly squash based on vertical speed
    const sq = clamp(1 - f.vy*0.02, 0.78, 1.22);
    f.mesh.scale.set(1/Math.sqrt(sq), sq, 1/Math.sqrt(sq));
    // stuck too long on the terrain (never reached the throat) -> drop it into the pile
    // at the funnel mouth so it can feed normally once a matching jar appears.
    if(f.life > CFG.phys.life && f.y > CFG.feedFloorY + 0.6){
      f.x=clamp(f.x, -CFG.funnel.chuteHalf+f.r, CFG.funnel.chuteHalf-f.r);
      f.y=CFG.feedFloorY + f.r; f.vx=0; f.vy=0; f.life=0;
    }
  }
  tryFeedBelt();
  // ---- advance belt cubes: conveyor drift, then PACK them inside the trough, then resolve ----
  const omega=CFG.beltSpeed*TAU;
  for(const bc of beltCubes){ if(bc.drop) continue; bc.prevTh=bc.th; bc.th+=omega*dt; }  // the whole pack is carried around
  packBeltCubes();                                                                        // cube-cube packing + wall clamp
  for(let i=beltCubes.length-1;i>=0;i--){
    const bc=beltCubes[i];
    // ---- cube is leaving the belt: play the "fall into the jar" animation, then deposit ----
    if(bc.drop){
      bc.drop.t += dt/0.36;
      const k=clamp(bc.drop.t,0,1), e=easeOut(k), fr=bc.drop.from, to=bc.drop.to;
      bc.mesh.position.set(lerp(fr.x,to.x,e), lerp(fr.y,to.y,e)+Math.sin(k*Math.PI)*0.5, lerp(fr.z,to.z,e));
      const sq=clamp(1.16-Math.sin(k*Math.PI)*0.30, 0.7,1.3);   // squash/plop as it lands
      bc.mesh.scale.set(1/Math.sqrt(sq),sq,1/Math.sqrt(sq));
      bc.mesh.rotation.y += dt*7;
      if(bc.drop.t>=1){
        const J=bc.target;
        if(J){ J.reserved=Math.max(0,J.reserved-1); deliverToJar(J); }
        releaseBeltCube(bc.mesh); beltCubes.splice(i,1);
      }
      continue;
    }
    if(bc.th>=TAU) bc.th-=TAU; else if(bc.th<0) bc.th+=TAU;
    bc.rho=clamp(bc.rho,0,1);                   // trough walls (inner=0, outer=1) confine the cube
    bc.wob+=dt*8;
    beltWorld(bc.th, bc.rho, Math.sin(bc.wob*2.0)*0.02, _p);   // little jelly bob along surface normal
    bc.mesh.position.copy(_p);
    const sq=1+Math.sin(bc.wob*1.3)*0.12;       // wobble squash (jelly)
    bc.mesh.scale.set(1/Math.sqrt(sq),sq,1/Math.sqrt(sq));
    bc.mesh.rotation.y=bc.th + bc.wob*0.1;
    // drop stale targets (jar got capped by other cubes), then (re)acquire a jar
    if(bc.target && (bc.target.state!=='active' || bc.target.full || bc.target.color!==bc.color)) bc.target=null;
    if(!bc.target){ const J=findTargetJar(bc.color); if(J){ J.reserved++; bc.target=J; } }
    // exit ONLY when reaching the gate of a matching jar -> physically drop into it (no blink-out)
    const J=bc.target;
    if(J && J.state==='active' && !J.full && crossed(bc.prevTh/TAU, bc.th/TAU, slotGateT(J.slot))){
      bc.drop={t:0, from:bc.mesh.position.clone(),
               to:new THREE.Vector3(CFG.jarSlotsX[J.slot], CFG.jarsY+0.30, 0.02)};
    }
  }
  // ---- jar fill anim & slide
  for(const J of jars){
    if(J.state==='sliding-in'){
      J.anim+=dt/0.4; const x=CFG.jarSlotsX[J.slot];
      const sx=lerp(x+5,x,easeOut(clamp(J.anim,0,1)));
      J.group.position.x=sx; J.fillMesh.position.x=sx; J.label.position.x=sx;
      if(J.anim>=1){ J.state='active'; J.group.position.x=x; }
    } else if(J.state==='capping'){
      J.anim+=dt/0.5;
      if(J.lid){ J.lid.position.y=lerp(CFG.jarsY+2.2, CFG.jarsY+0.34, easeOut(clamp(J.anim,0,1))); }
      if(J.anim>=1){ J.state='leaving'; J.anim=0; }
    } else if(J.state==='leaving'){
      J.anim+=dt/0.5; const dy=-easeOut(clamp(J.anim,0,1))*6;
      J.group.position.y=CFG.jarsY+dy; if(J.lid)J.lid.position.y=CFG.jarsY+0.34+dy;
      J.fillMesh.position.y=CFG.jarsY-0.18+dy; J.label.position.y=CFG.jarsY+0.02+dy;
      J.label.material.opacity=1-J.anim;
      if(J.anim>=1){ cleanupJar(J); spawnJarIntoSlot(J.slot,true); }
    }
    // smooth fill grow
    if(J.fillMesh && (J.state==='active'||J.state==='capping')){
      const target=clamp(J.filled/Math.max(1,J.capacity),0,1)*0.52+0.02;
      J.fillMesh.scale.y += (target - J.fillMesh.scale.y)*Math.min(1,dt*8);
      J.fillMesh.position.y = CFG.jarsY-0.30 + J.fillMesh.scale.y*0.5;
    }
  }
  // ---- flashes
  for(let i=flashes.length-1;i>=0;i--){
    const fl=flashes[i]; fl.t+=dt/0.45;
    const k=Math.sin(clamp(fl.t,0,1)*Math.PI); // 0->1->0
    for(const id of fl.ids){
      const cell=idToCell[id]; if(!cell) continue;
      _col.setHex(PALETTE[GRID[cell[0]][cell[1]]]);
      _col.lerp(new THREE.Color(0xff2020), k*0.85);
      pictureMesh.setColorAt(id,_col);
    }
    pictureMesh.instanceColor.needsUpdate=true;
    if(fl.t>=1){
      for(const id of fl.ids){ const cell=idToCell[id]; if(!cell)continue; _col.setHex(PALETTE[GRID[cell[0]][cell[1]]]); pictureMesh.setColorAt(id,_col);}
      pictureMesh.instanceColor.needsUpdate=true;
      flashes.splice(i,1);
    }
  }
  // ---- win check
  if(!state.won) checkWin();
  updateHUD();
}

function crossed(prev,cur,gate){
  // did param pass through gate going forward (with wrap)?
  if(prev<=cur){ return gate>prev && gate<=cur; }
  else { return gate>prev || gate<=cur; } // wrapped
}

function deliverToJar(J){
  J.filled++; deliveredUnits++;
  updateSprite(J.label, String(Math.max(0,J.capacity-J.filled)));
  if(J.filled>=J.capacity){
    J.full=true; J.state='capping'; J.anim=0;
    updateSprite(J.label,'✓');
    // lid
    const g=lidProto.clone(true);
    g.traverse(m=>{if(m.isMesh){m.material=new THREE.MeshStandardMaterial({color:PALETTE[J.color],roughness:0.3,metalness:0.0});m.castShadow=true;}});
    g.position.set(CFG.jarSlotsX[J.slot], CFG.jarsY+2.2, 0);
    scene.add(g); J.lid=g;
  }
}
function cleanupJar(J){
  if(J.group)scene.remove(J.group);
  if(J.fillMesh)scene.remove(J.fillMesh);
  if(J.lid)scene.remove(J.lid);
  if(J.label)scene.remove(J.label);
  J.group=J.fillMesh=J.lid=J.label=null;
}

function checkWin(){
  // board empty?
  let boardEmpty=true;
  for(let r=0;r<CFG.N&&boardEmpty;r++)for(let c=0;c<CFG.N;c++) if(GRID[r][c]!==-1){boardEmpty=false;break;}
  const beltEmpty = beltCubes.length===0 && beltQueue2.length===0 && fallers.length===0;
  const queueEmpty = jarQueue.length===0;
  const jarsIdle = jars.every(J=>J.state==='empty'||J.state==='leaving');
  if(boardEmpty && beltEmpty && queueEmpty && deliveredUnits>=totalUnits){
    state.won=true;
    if(els.win) els.win.classList.add('show');
  }
}

function updateHUD(){
  const pct = totalUnits? Math.round(deliveredUnits/totalUnits*100):0;
  if(els.pct) els.pct.textContent = pct+'%';
  if(els.bar) els.bar.style.width = pct+'%';
}

// ---------------------------------------------------------------- boot
function start(){
  els.wrap = document.getElementById('stage');
  els.canvas = document.getElementById('gl');
  els.pct = document.getElementById('pct');
  els.bar = document.getElementById('bar');
  els.win = document.getElementById('win');
  els.loader = document.getElementById('loader');

  setupRenderer(els.canvas);
  resize(); window.addEventListener('resize', resize);

  const loader=new THREE.FBXLoader();
  // jelly geometry
  const jellyObj=loadFBX(loader,'jelly');
  let geo=null;
  jellyObj.traverse(m=>{if(m.isMesh&&!geo){geo=m.geometry;}});
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const jb=geo.boundingBox, jc=jb.getCenter(new THREE.Vector3()), js=jb.getSize(new THREE.Vector3());
  geo.translate(-jc.x,-jc.y,-jc.z);
  const jk=(CFG.cell*0.92)/Math.max(js.x,js.y,js.z);
  geo.scale(jk,jk,jk);
  jellyGeo=geo; jellyMat=makeJellyMat();

  // frame
  const frameObj=loadFBX(loader,'frame');
  const fn=normalize(frameObj,{byWidth:CFG.frame.width});
  fn.group.position.set(...CFG.frame.pos);
  fn.group.traverse(m=>{if(m.isMesh){m.material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.5,metalness:0.0});m.castShadow=true;m.receiveShadow=true;}});
  scene.add(fn.group);
  frameGroup=fn.group; frameSize=fn.size; frameScale=fn.scale;

  // jar & lid prototypes (normalized, recentered, base at origin)
  const jarObj=loadFBX(loader,'jar');
  const jn=normalize(jarObj,{byWidth:CFG.jarWidth});
  jarProto=jn.group;
  const lidObj=loadFBX(loader,'lid');
  const ln=normalize(lidObj,{byWidth:CFG.lidWidth});
  lidProto=ln.group;

  // belt
  buildBelt(loadFBX(loader,'belt'));

  // level
  GRID=generateLevel(CFG.N);
  buildPicture();
  buildJarQueue();

  // jars
  jars=[makeJarSlot(0),makeJarSlot(1),makeJarSlot(2),makeJarSlot(3)];
  for(let s=0;s<4;s++) spawnJarIntoSlot(s,false);

  initBeltPool();
  initFallerPool();

  // input
  els.canvas.addEventListener('pointerdown', e=>{ onTap(e.clientX,e.clientY); });

  if(els.loader) els.loader.style.display='none';
  state.started=true;

  // expose for tests
  window.__game={CFG,jars,get beltCubes(){return beltCubes;},get fallers(){return fallers;},
    tapCell:(r,c)=>onTap(...cellCenterScreen(r,c)), state, get delivered(){return deliveredUnits;}, get total(){return totalUnits;},
    floodFill, canDrop, dropAt:(r,c)=>{const cl=floodFill(r,c); if(canDrop(cl)){startFallCluster(cl);return true;} return false;},
    render:()=>renderer.render(scene,camera), GRID:()=>GRID, snapshot:()=>renderer.domElement.toDataURL('image/png'),
    scene, camera, get frame(){return frameGroup;}, get belt(){return beltGroup;}, beltPoint, THREE,
    CH, beltWorld, slotGateT, get beltAxes(){return {ctr:beltCtr,A:beltAxA,B:beltAxB,N:beltAxN};}};

  animate();
}
function cellCenterScreen(r,c){
  const w=cellWorld(r,c); const v=new THREE.Vector3(w.x,w.y,w.z).project(camera);
  const rect=renderer.domElement.getBoundingClientRect();
  return [ (v.x*0.5+0.5)*rect.width+rect.left, (-v.y*0.5+0.5)*rect.height+rect.top ];
}

function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),0.05);
  if(state.started) update(dt);
  renderer.render(scene,camera);
}

window.JellyDrop={start, CFG, PALETTE};
})();
