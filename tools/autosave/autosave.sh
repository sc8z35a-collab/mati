#!/usr/bin/env bash
# EVERCITY autosave daemon v2 — every $INTERVAL seconds (default 180 = 3 min):
#   1. commits every change in this work tree as "wip(autosave): <time>" on the current branch
#   2. pushes HEAD to origin/<branch>; if rejected (diverged) pushes to
#      origin/rescue/<branch>-<stamp> so the work is always stored off-machine.
# Never commits during merge / rebase / cherry-pick or while git holds index.lock.
# A flock guarantees one daemon per work tree, so `ensure` is safe to call before every command
# (sandbox restarts kill background processes; `ensure` resurrects the daemon in ~10 ms).
#
#   bash tools/autosave/autosave.sh ensure  # start if not running (silent, idempotent)
#   bash tools/autosave/autosave.sh start   # start + print status
#   bash tools/autosave/autosave.sh stop    # stop daemon
#   bash tools/autosave/autosave.sh status  # state and last log lines
#   bash tools/autosave/autosave.sh once    # one immediate save (commit + push)
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SELF="$ROOT/tools/autosave/autosave.sh"
STATE="$ROOT/.autosave"
INTERVAL="${INTERVAL:-180}"
mkdir -p "$STATE"
LOG="$STATE/autosave.log"
LOCK="$STATE/daemon.lock"
log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }
running() { [ -f "$STATE/pid" ] && kill -0 "$(cat "$STATE/pid")" 2>/dev/null; }

busy() {
  local g; g="$(git -C "$ROOT" rev-parse --git-dir)"
  case "$g" in /*) ;; *) g="$ROOT/$g" ;; esac
  [ -e "$g/index.lock" ] || [ -d "$g/rebase-merge" ] || [ -d "$g/rebase-apply" ] ||
    [ -e "$g/MERGE_HEAD" ] || [ -e "$g/CHERRY_PICK_HEAD" ] || [ -e "$g/REVERT_HEAD" ] || [ -e "$g/BISECT_LOG" ]
}

save_once() {
  cd "$ROOT" || return
  if busy; then log "git busy -> skip"; return; fi
  local br; br="$(git rev-parse --abbrev-ref HEAD)"
  [ "$br" = "HEAD" ] && { log "detached HEAD -> skip"; return; }
  if [ -n "$(git status --porcelain)" ]; then
    git add -A >/dev/null 2>&1 &&
      git commit -q --no-verify -m "wip(autosave): $(date '+%F %T')" >/dev/null 2>&1 &&
      log "committed $(git rev-parse --short HEAD) on $br"
  fi
  if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$br" 2>/dev/null)" ]; then
    if timeout 90 git push -q origin "HEAD:refs/heads/$br" >/dev/null 2>&1; then
      git update-ref "refs/remotes/origin/$br" HEAD; log "pushed $br $(git rev-parse --short HEAD)"
    else
      local r="rescue/$br-$(date +%m%d%H%M)"
      timeout 90 git push -q origin "HEAD:refs/heads/$r" >/dev/null 2>&1 &&
        log "push rejected -> saved to $r" || log "push failed (offline?) - commit kept locally"
    fi
  fi
  date '+%F %T' > "$STATE/last-run"
}

case "${1:-run}" in
  ensure) running || { nohup setsid bash "$SELF" run >/dev/null 2>&1 < /dev/null & };;
  start)
    running && echo "autosave already running (pid $(cat "$STATE/pid"))" || {
      nohup setsid bash "$SELF" run >/dev/null 2>&1 < /dev/null & sleep 1
      echo "autosave started (pid $(cat "$STATE/pid" 2>/dev/null))"; };;
  stop)
    running && kill "$(cat "$STATE/pid")" 2>/dev/null; rm -f "$STATE/pid"; echo "autosave stopped";;
  status)
    running && echo "daemon running pid $(cat "$STATE/pid"), last save: $(cat "$STATE/last-run" 2>/dev/null)" || echo "daemon NOT running"
    tail -5 "$LOG" 2>/dev/null;;
  once) save_once;;
  run)
    exec 9>"$LOCK"
    flock -n 9 || exit 0   # another daemon owns this work tree
    echo $$ > "$STATE/pid"
    log "autosave loop started (interval ${INTERVAL}s pid $$)"
    trap 'log "autosave stopped"; rm -f "$STATE/pid"; exit 0' TERM INT
    while true; do
      save_once
      # Short sleeps survive suspend/resume of the sandbox without drifting far past 3 minutes.
      next=$(( $(date +%s) + INTERVAL ))
      while [ "$(date +%s)" -lt "$next" ]; do sleep 10 & wait $!; done
    done;;
esac
