#!/usr/bin/env bash
# Serialises headless Chromium runs across every session sharing this sandbox
# (same lock files as tools/chromium-lock.sh on the collab branches), keeps the
# Playwright + three.js test kit inside the work tree (.pw/, survives /tmp wipes on
# sandbox reset) and makes sure a static server for this work tree listens on $PORT.
#   bash tools/gfx-run.sh node tools/gfx-shot.cjs
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3107}"
KIT="$ROOT/.pw"
export PORT PLAYWRIGHT_MODULE="$KIT/node_modules/playwright" THREE_SCRIPT="$KIT/three.min.js"
bash "$ROOT/tools/autosave.sh" start >/dev/null 2>&1
mkdir -p "$KIT" /tmp/pw
if [ ! -d "$KIT/node_modules/playwright" ]; then
  (cd "$KIT" && { [ -f package.json ] || echo '{"name":"pwkit","private":true}' > package.json; } && npm i playwright@1.47 >/dev/null 2>&1)
  ls ~/.cache/ms-playwright/chromium-* >/dev/null 2>&1 || (cd "$KIT" && npx playwright install chromium >/dev/null 2>&1)
fi
[ -s "$KIT/three.min.js" ] || curl -s -o "$KIT/three.min.js" https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js
if ! curl -s -o /dev/null "http://127.0.0.1:$PORT/index.html"; then
  (cd "$ROOT" && nohup setsid python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 < /dev/null &)
  sleep 1
fi
exec 8>/tmp/pw/.chromium.lock
flock -w 600 8 || { echo "chromium lock timeout"; exit 1; }
exec 9>/tmp/pw/.shot.lock
flock -w 600 9 || { echo "shot lock timeout"; exit 1; }
# Memory watchdog: kill our Chromium before the 1 GB sandbox freezes.
( while sleep 1; do
    avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
    if [ "$avail" -lt "${MEM_FLOOR:-120}" ]; then
      echo "MEMORY GUARD: ${avail}MB left -> killing headless chromium" >&2
      pkill -f "[c]hrome-linux/chrome.*playwright_chromiumdev"; break
    fi
  done ) & GUARD=$!
cd "$ROOT"
# Hard cap in a transient cgroup: the OOM killer then hits Chromium, never the sandbox.
if sudo -n true 2>/dev/null && command -v systemd-run >/dev/null; then
  sudo -E systemd-run --scope -q -p MemoryMax="${MEM_MAX:-600M}" -p MemorySwapMax=0 \
    --uid="$(id -u)" --gid="$(id -g)" --setenv=HOME="$HOME" \
    timeout "${LIMIT:-560}" "$@"; rc=$?
else
  timeout "${LIMIT:-560}" "$@"; rc=$?
fi
kill $GUARD 2>/dev/null
exit $rc
