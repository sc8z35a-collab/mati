#!/usr/bin/env bash
# Starts the 3-minute autosave daemon (idempotent). Use `autosave.sh ensure` as a command prefix
# after sandbox restarts: cd .wt-v2 && bash tools/autosave/autosave.sh ensure && <command>
exec bash "$(cd "$(dirname "$0")" && pwd)/autosave.sh" start
