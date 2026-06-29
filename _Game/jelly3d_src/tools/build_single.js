// Inline all <script src="..."> into one self-contained HTML.
const fs=require('fs'), path=require('path');
const buildDir=process.argv[2];           // dir containing game.html + lib/ + assets
const srcHtml=path.join(buildDir,'game.html');
const outFile=process.argv[3];
let html=fs.readFileSync(srcHtml,'utf8');

function safe(js){ return js.replace(/<\/script/gi,'<\\/script'); }

html=html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g,(m,src)=>{
  const p=path.join(buildDir,src);
  if(!fs.existsSync(p)){ console.error('MISSING',src); return m; }
  const code=fs.readFileSync(p,'utf8');
  console.error('inlined',src,(code.length/1024).toFixed(0)+'KB');
  return '<script>\n'+safe(code)+'\n</script>';
});

// title tweak
html=html.replace('<title>Jelly Drop 3D</title>','<title>Jelly Drop 3D — self-contained demo</title>');

fs.writeFileSync(outFile,html);
console.error('WROTE',outFile,(fs.statSync(outFile).size/1024/1024).toFixed(2)+'MB');
