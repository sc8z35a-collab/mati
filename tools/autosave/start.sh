#!/usr/bin/env bash
# Starts the 3-minute autosave daemon and its watchdog (idempotent).
exec bash "$(cd "$(dirname "$0")" && pwd)/autosave.sh" start
