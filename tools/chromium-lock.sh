#!/usr/bin/env bash
# Shared-sandbox Chromium serializer (985MB RAM: two Chromiums = OOM reset). Same lock files as
# the other agents' tools/chromium-lock.sh, so every agent waits its turn.
# Usage: bash tools/chromium-lock.sh <command...>
set -u
mkdir -p /tmp/pw
exec 8>/tmp/pw/.chromium.lock
flock 8
exec 9>/tmp/pw/.shot.lock
flock 9
timeout "${LOCK_MAX:-400}" "$@"
