#!/bin/bash
# Portable headless-Chrome runner/screenshotter for the dev game.
# usage: run.sh <htmlfile-abs> <out.png-abs> [preWaitMs] [codeFile-abs] [postWaitMs] [W] [H]
# - codeFile: optional JS evaluated in the page after load (e.g. tools/test_win.js).
# - Captures a composite PNG (HTML overlay + WebGL) via CDP Page.captureScreenshot.
DIR="$(cd "$(dirname "$0")" && pwd)"
HTML="$1"; OUT="$2"; PRE="${3:-1800}"; CODEFILE="${4:-}"; POST="${5:-300}"; W="${6:-460}"; H="${7:-940}"
PROF="$DIR/.prof_$RANDOM$RANDOM"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
CODE_B64=""
if [ -n "$CODEFILE" ] && [ -f "$CODEFILE" ]; then CODE_B64=$(base64 -w0 "$CODEFILE"); fi
"$CHROME" --headless=new --use-gl=swiftshader --ignore-gpu-blocklist --enable-unsafe-swiftshader \
  --no-sandbox --disable-dev-shm-usage --user-data-dir="$PROF" --remote-debugging-port=9222 \
  --window-size=$W,$H "about:blank" >/dev/null 2>&1 &
CHROME_PID=$!
node "$DIR/drive.js" "file:///$HTML" "$OUT" "$PRE" "$CODE_B64" "$POST"
RC=$?
kill $CHROME_PID 2>/dev/null
rm -rf "$PROF" 2>/dev/null
exit $RC
