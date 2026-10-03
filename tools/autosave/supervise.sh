#!/usr/bin/env bash
# Starts the autosave daemon plus a 60 s watchdog loop that restarts it if it dies.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
bash "$ROOT/tools/autosave/start.sh"
if [ -f "$ROOT/.autosave/watchdog.pid" ] && kill -0 "$(cat "$ROOT/.autosave/watchdog.pid")" 2>/dev/null; then
  echo "watchdog already running"; exit 0
fi
nohup setsid bash -c "echo \$\$ > '$ROOT/.autosave/watchdog.pid'; while true; do sleep 60; bash '$ROOT/tools/autosave/watchdog.sh' >/dev/null 2>&1; done" >/dev/null 2>&1 < /dev/null &
sleep 1; echo "watchdog started (pid $(cat "$ROOT/.autosave/watchdog.pid"))"
