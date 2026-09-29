#!/usr/bin/env bash
# Rebuilds the headless Chromium + Three.js r158 environment used for visual debugging.
set -e
mkdir -p /tmp/pw /tmp/shots
cd /tmp/pw
[ -f package.json ] || npm init -y >/dev/null
[ -d node_modules/playwright ] || npm i playwright@1.47 >/dev/null 2>&1
npx playwright install chromium >/dev/null 2>&1
sudo apt-get install -y libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libxcomposite1 libxdamage1 \
  libxrandr2 libgbm1 libxkbcommon0 libpango-1.0-0 libcairo2 libasound2 libnss3 libcups2 fonts-noto-cjk >/tmp/apt.log 2>&1 || true
[ -f three.min.js ] || curl -s -o three.min.js https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js
cp "$(dirname "$0")/shot.cjs" "$(dirname "$0")/probe.cjs" /tmp/pw/
cd "$(dirname "$0")/.." && (curl -s localhost:3000 >/dev/null || (nohup python3 -m http.server 3000 >/tmp/http.log 2>&1 &))
echo READY
