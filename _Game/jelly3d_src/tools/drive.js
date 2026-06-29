// CDP driver: node drive.js <url> <outPng> <preWaitMs> <code(base64)> <postWaitMs>
const fs=require('fs');
const url=process.argv[2], out=process.argv[3];
const preWait=+(process.argv[4]||1500);
const code=process.argv[5]? Buffer.from(process.argv[5],'base64').toString('utf8') : '';
const postWait=+(process.argv[6]||300);

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function getTargets(){ const r=await fetch('http://127.0.0.1:9222/json'); return r.json(); }

(async()=>{
  // find or create a page target for the url
  let t=null;
  for(let i=0;i<40;i++){
    try{ const list=await getTargets(); t=list.find(x=>x.type==='page'); if(t&&t.webSocketDebuggerUrl) break; }catch(e){}
    await sleep(250);
  }
  if(!t){ console.error('no target'); process.exit(2); }
  const ws=new WebSocket(t.webSocketDebuggerUrl);
  let id=0; const pending=new Map();
  ws.addEventListener('message',ev=>{
    const m=JSON.parse(ev.data);
    if(m.id&&pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id); }
  });
  await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
  const send=(method,params={})=>new Promise(res=>{ const mid=++id; pending.set(mid,res); ws.send(JSON.stringify({id:mid,method,params})); });
  const evalJs=async(expr,awaitP=true)=>{
    const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:awaitP,returnByValue:true});
    if(r.result&&r.result.exceptionDetails) console.error('EXC',JSON.stringify(r.result.exceptionDetails));
    if(r.result&&r.result.result&&r.result.result.subtype==='error') console.error('ERR',r.result.result.description);
    return r.result&&r.result.result? r.result.result.value : undefined;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  // navigate
  await send('Page.navigate',{url});
  // wait for game ready
  let ready=false;
  for(let i=0;i<60;i++){
    const ok=await evalJs('!!(window.__game&&window.__game.state&&window.__game.state.started)',false);
    if(ok){ready=true;break;}
    const lerr=await evalJs("(document.getElementById('loader')&&document.getElementById('loader').textContent.indexOf('Lỗi')>=0)?document.getElementById('loader').textContent:''",false);
    if(lerr){ console.error('PAGE ERROR:',lerr); break; }
    await sleep(250);
  }
  console.error('ready='+ready);
  await sleep(preWait);
  if(code){ try{ const r=await evalJs(code,true); if(r!==undefined) console.error('CODE_RESULT:',JSON.stringify(r)); }catch(e){ console.error('code err',e.message);} }
  await sleep(postWait);
  // full-page screenshot via CDP (composites HTML overlay + WebGL canvas)
  let shot=null;
  try{ const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}); shot=r.result&&r.result.data; }catch(e){}
  if(shot){ fs.writeFileSync(out,Buffer.from(shot,'base64')); console.error('OK png bytes='+fs.statSync(out).size); }
  else {
    const durl=await evalJs('window.__game?window.__game.snapshot():""',false);
    if(durl&&durl.startsWith('data:image')){ fs.writeFileSync(out,Buffer.from(durl.split(',')[1],'base64')); console.error('OK(fallback) png bytes='+fs.statSync(out).size); }
    else console.error('NO SNAPSHOT');
  }
  ws.close();
  process.exit(0);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
