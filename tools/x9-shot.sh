#!/usr/bin/env bash
# Serialises headless Chromium with every other agent in the shared sandbox and refuses to start
# when memory is too low (two SwiftShader Chromiums = OOM freeze of the whole sandbox).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/tools/ensure.sh"
mkdir -p /tmp/pw
exec 8>/tmp/pw/.chromium.lock
flock -w 600 8 || { echo "lock timeout"; exit 3; }
exec 9>/tmp/pw/.shot.lock
flock -w 600 9 || { echo "lock timeout"; exit 3; }
for i in $(seq 1 60); do
  avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
  if [ "$avail" -gt 560 ] && ! pgrep -f "[c]hrome-linux/chrome" >/dev/null; then break; fi
  [ "$i" = 60 ] && { echo "not enough memory (${avail}MB) or another chrome is running"; exit 4; }
  sleep 5
done
timeout "${LOCK_MAX:-420}" node "$ROOT/tools/x9-shot.cjs"
rc=$?
pkill -f "[p]laywright_chromiumdev_profile.*x9" 2>/dev/null
exit $rc
