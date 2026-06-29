// Bake "test 4.jpg" (rainbow-band wallpaper) -> 20x20 colour-index level + de-isolation.
// No image libs available, so the band layout is authored from the visible image, then the
// spec's DE-ISOLATION pass guarantees every cell has >=1 orthogonal same-colour neighbour.
// Palette index -> image colour: 0 NAVY, 1 BLUE, 2 TEAL, 3 GREEN, 4 YELLOW, 5 ORANGE, 6 RED.
const N=20;
// Authored bands (top -> bottom of the image): blue top, blue, blue->teal, teal/green, green,
// yellow, orange (red block left), red, maroon (->red), navy, blue, navy bottom.
let rows=[
  "00001111111111110000", // navy edges + blue top band
  "11111111111111111111", // bright blue
  "11111111111122222222", // blue with cyan/teal blocks on the right
  "11111111112222222222", // blue -> teal transition
  "22222233333333322222", // teal with a green block in the centre
  "22223333333333332222", // teal/green
  "33333333333333332222", // green (teal-green block far right)
  "33333333333333333333", // green
  "44444444444444444444", // yellow
  "44444444444444444444", // yellow
  "66666555555555555555", // orange band, red block on the left
  "55555555555555555555", // orange
  "66666666666666666666", // red
  "66666666666666666666", // red
  "66666666666666666666", // maroon/brown -> red
  "66666666666666666666", // maroon/brown -> red
  "00000000000000000000", // dark navy band
  "00000111111110000000", // navy with a blue block
  "11111111111111111111", // blue band
  "00000000000000000000", // navy bottom
].map(s=>s.split('').map(Number));

function deIsolate(g){
  const isLone=(r,c)=>{
    const v=g[r][c];
    const nb=[[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
    return !nb.some(([nr,nc])=> nr>=0&&nc>=0&&nr<N&&nc<N && g[nr][nc]===v);
  };
  for(let pass=0; pass<50; pass++){
    let changed=false;
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){
      if(!isLone(r,c)) continue;
      // adopt the most common colour among NON-lone orthogonal neighbours (stable clusters)
      const cnt={};
      for(const [nr,nc] of [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]){
        if(nr<0||nc<0||nr>=N||nc>=N) continue;
        if(isLone(nr,nc)) continue;
        cnt[g[nr][nc]]=(cnt[g[nr][nc]]||0)+1;
      }
      let best=null,bn=-1;
      for(const k in cnt) if(cnt[k]>bn){bn=cnt[k];best=+k;}
      if(best!==null){ g[r][c]=best; changed=true; }
    }
    if(!changed) break;
  }
  return g;
}
deIsolate(rows);

// verify: no lone cells, which colours appear
let lone=0; const seen=new Set();
for(let r=0;r<N;r++)for(let c=0;c<N;c++){
  seen.add(rows[r][c]);
  const v=rows[r][c];
  const ok=[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].some(([nr,nc])=>nr>=0&&nc>=0&&nr<N&&nc<N&&rows[nr][nc]===v);
  if(!ok) lone++;
}
console.log('lone cells:', lone, ' colours used:', [...seen].sort().join(','));
console.log('const LEVEL_BITMAP = [');
for(const r of rows) console.log('  "'+r.join('')+'",');
console.log('];');
