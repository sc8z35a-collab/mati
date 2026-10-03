#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PIDF="$ROOT/.autosave/pid"
if [ -f "$PIDF" ] && kill "$(cat "$PIDF")" 2>/dev/null; then echo "autosave stopped"; else echo "autosave not running"; fi
