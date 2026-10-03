#!/usr/bin/env bash
# EVERCITY autosave daemon — every $INTERVAL seconds (default 180 = 3 min):
#   1. commits every change in the work tree as "wip(autosave): <time>" on the current branch
#   2. pushes HEAD to origin/<branch>; if that is rejected (diverged), pushes to
#      origin/rescue/<branch>-<stamp> so the work is always stored off-machine.
# It never commits during a manual merge / rebase / cherry-pick or while git holds index.lock.
#
#   bash tools/autosave/autosave.sh start   # start (idempotent) + watchdog
#   bash tools/autosave/autosave.sh stop    # stop daemon + watchdog
#   bash tools/autosave/autosave.sh status  # show state and last log lines
#   bash tools/autosave/autosave.sh once    # one immediate save
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SELF="$ROOT/tools/autosave/autosave.sh"
STATE="$ROOT/.autosave"
INTERVAL="${INTERVAL:-180}"
mkdir -p "$STATE"
LOG="$STATE/autosave.log"
log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }
alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

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
      git fetch -q origin "$br" >/dev/null 2>&1; log "pushed $br"
    else
      local r="rescue/$br-$(date +%m%d%H%M)"
      timeout 90 git push -q origin "HEAD:refs/heads/$r" >/dev/null 2>&1 &&
        log "push rejected -> saved to $r" || log "push failed (offline?) - commit kept locally"
    fi
  fi
  date '+%F %T' > "$STATE/last-run"
}

case "${1:-run}" in
  start)
    if alive "$STATE/pid"; then echo "autosave already running (pid $(cat "$STATE/pid"))"
    else nohup setsid bash "$SELF" run >/dev/null 2>&1 < /dev/null & sleep 1; echo "autosave started (pid $(cat "$STATE/pid" 2>/dev/null))"; fi
    if alive "$STATE/watchdog.pid"; then echo "watchdog already running"
    else nohup setsid bash "$SELF" watchdog >/dev/null 2>&1 < /dev/null & sleep 1; echo "watchdog started (pid $(cat "$STATE/watchdog.pid" 2>/dev/null))"; fi;;
  stop)
    for f in watchdog.pid pid; do alive "$STATE/$f" && kill "$(cat "$STATE/$f")" 2>/dev/null; rm -f "$STATE/$f"; done; echo "autosave stopped";;
  status)
    alive "$STATE/pid" && echo "daemon running pid $(cat "$STATE/pid"), last save: $(cat "$STATE/last-run" 2>/dev/null)" || echo "daemon NOT running"
    alive "$STATE/watchdog.pid" && echo "watchdog running pid $(cat "$STATE/watchdog.pid")" || echo "watchdog NOT running"
    tail -5 "$LOG" 2>/dev/null;;
  once) save_once;;
  watchdog)
    # restarts the daemon if it died or has not saved for 10 minutes
    echo $$ > "$STATE/watchdog.pid"
    while true; do
      sleep 60
      if alive "$STATE/pid" && [ -f "$STATE/last-run" ] &&
        [ $(( $(date +%s) - $(date -r "$STATE/last-run" +%s) )) -gt 600 ]; then
        kill "$(cat "$STATE/pid")" 2>/dev/null; rm -f "$STATE/pid"; log "watchdog: daemon stuck -> restart"
      fi
      alive "$STATE/pid" || { nohup setsid bash "$SELF" run >/dev/null 2>&1 < /dev/null & log "watchdog: restarted daemon"; }
    done;;
  run)
    echo $$ > "$STATE/pid"
    log "autosave loop started (interval ${INTERVAL}s pid $$)"
    trap 'log "autosave stopped"; rm -f "$STATE/pid"; exit 0' TERM INT
    while true; do save_once; sleep "$INTERVAL" & wait $!; done;;
esac
