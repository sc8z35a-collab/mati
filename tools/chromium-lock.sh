#!/usr/bin/env bash
# Team-wide Chromium serializer for the SHARED sandbox (985MB RAM: two Chromiums = OOM freeze).
# Usage: bash tools/chromium-lock.sh <command...>
#   e.g. bash tools/chromium-lock.sh env SET=street TAG=b1 node tools/views.cjs
# Lock order is fixed (.chromium.lock THEN .shot.lock) so agents holding both never deadlock.
# The lock is released automatically when the command exits (flock on an fd).
set -u
mkdir -p /tmp/pw
exec 8>/tmp/pw/.chromium.lock
echo "[lock] waiting for /tmp/pw/.chromium.lock ($(date +%T))" >&2
flock 8
exec 9>/tmp/pw/.shot.lock
flock 9
echo "[lock] acquired ($(date +%T))" >&2
# Absolutely bounded: never hold the team lock longer than LOCK_MAX seconds (default 420).
timeout "${LOCK_MAX:-420}" "$@"
rc=$?
echo "[lock] released rc=$rc ($(date +%T))" >&2
exit $rc
