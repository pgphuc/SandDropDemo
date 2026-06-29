#!/bin/bash
# usage: cap.sh <file.html> <out.png> [W] [H] [budgetMs]
SP="C:/Users/Admin/AppData/Local/Temp/claude/C--Users-Admin/dc79abdf-47a5-4c2d-b535-7d949f478b02/scratchpad"
HTML="$1"; OUT="$2"; W="${3:-460}"; H="${4:-940}"; BUD="${5:-12000}"
PROF="$SP/prof_$RANDOM$RANDOM"
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --use-gl=swiftshader --ignore-gpu-blocklist --enable-unsafe-swiftshader --no-sandbox --user-data-dir="$PROF" --window-size=$W,$H --dump-dom --virtual-time-budget=$BUD "file:///$HTML" 2>/dev/null > "$SP/dom.txt"
node -e '
const fs=require("fs");
const s=fs.readFileSync(process.argv[1],"utf8");
const m=s.match(/<div id="png">(data:image\/png;base64,[^<]+)<\/div>/);
if(!m){
  const lg=s.match(/<pre id="log"[^>]*>([\s\S]*?)<\/pre>/);
  console.error("NO PNG. log=",lg?lg[1]:"(none)","domBytes="+s.length);
  process.exit(1);
}
fs.writeFileSync(process.argv[2],Buffer.from(m[1].replace(/^data:image\/png;base64,/,""),"base64"));
console.error("OK png bytes="+fs.statSync(process.argv[2]).size);
' "$SP/dom.txt" "$OUT"
rm -rf "$PROF" 2>/dev/null
