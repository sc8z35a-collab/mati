#!/usr/bin/env bash
# EVERCITY autosave daemon.
# Every $INTERVAL seconds (default 180 = 3 minutes):
#   1. if the work tree has changes, commit them as a WIP commit
#   2. push HEAD to origin/<current branch>; if rejected, push to rescue/<branch>-<stamp>
# Never runs during a manual git operation (rebase / merge / cherry-pick / index.lock).
#
# Start:  bash tools/autosave/start.sh     Stop: bash tools/autosave/stop.sh
# Log:    .autosave/autosave.log
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
INTERVAL="${INTERVAL:-180}"
STATE="$ROOT/.autosave"
LOG="$STATE/autosave.log"
mkdir -p "$STATE"
echo $$ > "$STATE/pid"
log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

busy() {
  local g="$1"
  [ -e "$g/index.lock" ] || [ -d "$g/rebase-merge" ] || [ -d "$g/rebase-apply" ] ||
    [ -e "$g/MERGE_HEAD" ] || [ -e "$g/CHERRY_PICK_HEAD" ] || [ -e "$g/REVERT_HEAD" ]
}

save() {
  cd "$ROOT" || return
  local gd br
  gd="$(git rev-parse --git-dir)"
  if busy "$gd"; then log "git busy, skip"; return; fi
  br="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$br" = "HEAD" ]; then log "detached HEAD, skip"; return; fi
  if [ -n "$(git status --porcelain)" ]; then
    git add -A >/dev/null 2>&1
    if git commit -q --no-verify -m "wip(autosave): $(date '+%F %T')" >/dev/null 2>&1; then
      log "committed $(git rev-parse --short HEAD) on $br"
    fi
  fi
  # push only if the remote does not already have HEAD
  if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$br" 2>/dev/null)" ]; then
    if timeout 90 git push -q origin "HEAD:refs/heads/$br" >/dev/null 2>&1; then
      git fetch -q origin "$br" >/dev/null 2>&1
      log "pushed $br"
    else
      local rescue="rescue/$br-$(date +%m%d%H%M)"
      timeout 90 git push -q origin "HEAD:refs/heads/$rescue" >/dev/null 2>&1 &&
        log "push rejected -> saved to $rescue" || log "push failed (network?)"
    fi
  fi
}

log "autosave started (interval=${INTERVAL}s pid=$$)"
trap 'log "autosave stopped"; rm -f "$STATE/pid"; exit 0' INT TERM
while true; do
  save
  date '+%F %T' > "$STATE/last-run"
  sleep "$INTERVAL" &
  wait $!
done
