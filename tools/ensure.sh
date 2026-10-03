#!/usr/bin/env bash
# Idempotent "make the dev environment alive" script. Safe to run before every command:
#  - (re)starts the 3-minute autosave daemon + watchdog if a sandbox reset killed them
#  - (re)starts the static HTTP server for this worktree on $PORT (default 3109)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3109}"
bash "$ROOT/tools/autosave/autosave.sh" start >/dev/null 2>&1
if ! curl -s -o /dev/null -m 2 "http://127.0.0.1:$PORT/index.html"; then
  (cd "$ROOT" && nohup setsid python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/x9-http.log 2>&1 < /dev/null &)
  sleep 1
fi
