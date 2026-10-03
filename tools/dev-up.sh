#!/usr/bin/env bash
# Restore the dev session after a sandbox reset (idempotent):
# autosave (3 min) + watchdog, and the static server on :3100.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/tools/autosave.sh" start >/dev/null
bash "$ROOT/tools/serve.sh"
bash "$ROOT/tools/autosave.sh" status | head -2
