#!/usr/bin/env bash
# Idempotent: makes sure the 3-minute autosave daemon and the local preview server are alive.
# Safe to call before every command (the sandbox may restart and kill background processes).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3217}"
bash "$ROOT/tools/autosave/autosave.sh" start >/dev/null 2>&1
if ! curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/"; then
  (cd "$ROOT" && nohup setsid python3 -m http.server "$PORT" --bind 0.0.0.0 >/tmp/lsx-http.log 2>&1 < /dev/null &)
  sleep 1
fi
echo "ensure: autosave $(bash "$ROOT/tools/autosave/autosave.sh" status | head -1 | cut -c1-60) / http $(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:$PORT/)"
