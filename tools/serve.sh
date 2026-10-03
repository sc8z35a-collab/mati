#!/usr/bin/env bash
# Keeps a static server for this work tree alive on $PORT (default 3100). Idempotent.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; PORT="${PORT:-3100}"; mkdir -p "$ROOT/.hy"
if [ "$1" = loop ]; then
  while true; do
    curl -s -o /dev/null "http://127.0.0.1:$PORT/" || (cd "$ROOT" && setsid python3 -m http.server "$PORT" >"$ROOT/.hy/http.log" 2>&1 < /dev/null &)
    sleep 10
  done
fi
pgrep -f "[s]erve.sh loop $ROOT" >/dev/null || (nohup setsid bash "$0" loop "$ROOT" >/dev/null 2>&1 < /dev/null &)
sleep 2; curl -s -o /dev/null -w "server :$PORT -> %{http_code}\n" "http://127.0.0.1:$PORT/"
