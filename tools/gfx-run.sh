#!/usr/bin/env bash
# Serialises headless Chromium runs across every session sharing this sandbox
# (same lock files as tools/chromium-lock.sh on the collab branches) and makes sure
# a static server for this work tree is listening on $PORT (default 3107).
#   bash tools/gfx-run.sh node tools/gfx-shot.cjs
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3107}"
export PORT
mkdir -p /tmp/pw
if ! curl -s -o /dev/null "http://127.0.0.1:$PORT/index.html"; then
  (cd "$ROOT" && nohup setsid python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/gfx-http-$PORT.log 2>&1 < /dev/null &)
  sleep 1
fi
exec 8>/tmp/pw/.chromium.lock
flock -w 600 8 || { echo "chromium lock timeout"; exit 1; }
exec 9>/tmp/pw/.shot.lock
flock -w 600 9 || { echo "shot lock timeout"; exit 1; }
cd "$ROOT" && timeout "${LIMIT:-560}" "$@"
