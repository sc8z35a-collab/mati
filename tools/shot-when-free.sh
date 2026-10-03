#!/usr/bin/env bash
# Runs tools/hyper-shot.cjs only when no other headless Chromium is alive and RAM is available
# (several sessions share this 1GB sandbox; two SwiftShader browsers at once freeze it).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for i in $(seq 1 120); do
  avail=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
  if ! pgrep -f "chrome-linux/chrome" >/dev/null && [ "$avail" -gt 520 ]; then
    exec timeout "${LIMIT:-480}" node "$ROOT/tools/hyper-shot.cjs"
  fi
  sleep 5
done
echo "no free browser slot"; exit 3
