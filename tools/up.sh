#!/usr/bin/env bash
# Idempotent dev bootstrap after a sandbox reset: autosave daemon + static server on :3100.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
bash tools/autosave/autosave.sh ensure
curl -s -m 3 -o /dev/null localhost:3100/ || { nohup setsid python3 -m http.server 3100 >/dev/null 2>&1 < /dev/null & sleep 0.5; }
[ -d .tools/node_modules/playwright ] || (mkdir -p .tools && cd .tools && { [ -f package.json ] || echo '{"name":"t","private":true}' > package.json; } && npm i -s --no-audit --no-fund playwright@1.47 >/dev/null 2>&1)
[ -f .tools/three.min.js ] || curl -s -o .tools/three.min.js https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js
