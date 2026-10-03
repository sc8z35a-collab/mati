#!/usr/bin/env bash
# Keeps the autosave daemon alive. Run it from any long-lived shell, a dev-server
# wrapper, or cron:  */1 * * * * bash /home/user/webapp/tools/autosave/watchdog.sh
# It is idempotent: when the daemon is alive this exits immediately.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PIDF="$ROOT/.autosave/pid"
LAST="$ROOT/.autosave/last-run"
alive=0
if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then alive=1; fi
# A daemon that has not run for 10 minutes is considered stuck.
if [ "$alive" = 1 ] && [ -f "$LAST" ]; then
  age=$(( $(date +%s) - $(date -r "$LAST" +%s) ))
  if [ "$age" -gt 600 ]; then kill "$(cat "$PIDF")" 2>/dev/null; alive=0; fi
fi
[ "$alive" = 1 ] || bash "$ROOT/tools/autosave/start.sh"
