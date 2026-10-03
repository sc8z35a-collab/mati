#!/usr/bin/env bash
# Starts the 3-minute autosave daemon (idempotent: does nothing if it is already running).
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PIDF="$ROOT/.autosave/pid"
if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then
  echo "autosave already running (pid $(cat "$PIDF"))"
  exit 0
fi
mkdir -p "$ROOT/.autosave"
nohup setsid bash "$ROOT/tools/autosave/autosave.sh" >/dev/null 2>&1 < /dev/null &
sleep 1
echo "autosave started (pid $(cat "$PIDF" 2>/dev/null)); log: .autosave/autosave.log"
