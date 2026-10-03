#!/usr/bin/env bash
# EVERCITY autosave — every $INTERVAL s (default 180 = 3 min) commits all changes in THIS work tree
# as "wip(autosave): <time>" and pushes HEAD to origin/<branch>. If the push is rejected it pushes
# to origin/rescue/<branch>-<stamp> instead, so work is always stored off-machine.
# Skips while a merge/rebase/cherry-pick is in progress or git holds index.lock.
#   bash tools/autosave/autosave.sh start|stop|status|once
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SELF="$ROOT/tools/autosave/autosave.sh"
STATE="$ROOT/.autosave"; mkdir -p "$STATE"
INTERVAL="${INTERVAL:-180}"
LOG="$STATE/autosave.log"
log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }
alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }
busy() {
  local g; g="$(git -C "$ROOT" rev-parse --absolute-git-dir)"
  [ -e "$g/index.lock" ] || [ -d "$g/rebase-merge" ] || [ -d "$g/rebase-apply" ] ||
    [ -e "$g/MERGE_HEAD" ] || [ -e "$g/CHERRY_PICK_HEAD" ] || [ -e "$g/REVERT_HEAD" ]
}
save_once() {
  cd "$ROOT" || return
  if busy; then log "git busy -> skip"; return; fi
  local br; br="$(git rev-parse --abbrev-ref HEAD)"
  [ "$br" = "HEAD" ] && { log "detached -> skip"; return; }
  if [ -n "$(git status --porcelain)" ]; then
    git add -A >/dev/null 2>&1 && git commit -q --no-verify -m "wip(autosave): $(date '+%F %T')" >/dev/null 2>&1 &&
      log "committed $(git rev-parse --short HEAD)"
  fi
  if [ "$(git rev-parse HEAD)" != "$(cat "$STATE/pushed" 2>/dev/null)" ]; then
    if timeout 90 git push -q origin "HEAD:refs/heads/$br" >/dev/null 2>&1; then
      git rev-parse HEAD > "$STATE/pushed"; log "pushed $br $(git rev-parse --short HEAD)"
    else
      local r="rescue/$br-$(date +%m%d%H%M)"
      timeout 90 git push -q origin "HEAD:refs/heads/$r" >/dev/null 2>&1 && log "rejected -> $r" || log "push failed (offline?)"
    fi
  fi
  date '+%F %T' > "$STATE/last-run"
}
case "${1:-status}" in
  start)
    alive "$STATE/pid" || { nohup setsid bash "$SELF" run >/dev/null 2>&1 </dev/null & }
    alive "$STATE/watchdog.pid" || { nohup setsid bash "$SELF" watchdog >/dev/null 2>&1 </dev/null & }
    sleep 1; echo "daemon $(cat "$STATE/pid" 2>/dev/null) watchdog $(cat "$STATE/watchdog.pid" 2>/dev/null)";;
  stop) for f in watchdog.pid pid; do alive "$STATE/$f" && kill "$(cat "$STATE/$f")"; rm -f "$STATE/$f"; done; echo stopped;;
  status) alive "$STATE/pid" && echo "running, last save $(cat "$STATE/last-run" 2>/dev/null)" || echo "NOT running"; tail -4 "$LOG" 2>/dev/null;;
  once) save_once;;
  run) echo $$ > "$STATE/pid"; log "loop start ${INTERVAL}s"
       trap 'rm -f "$STATE/pid"; exit 0' TERM INT
       while true; do save_once; sleep "$INTERVAL" & wait $!; done;;
  watchdog) echo $$ > "$STATE/watchdog.pid"; trap 'rm -f "$STATE/watchdog.pid"; exit 0' TERM INT
       while true; do sleep 60 & wait $!
         if ! alive "$STATE/pid"; then nohup setsid bash "$SELF" run >/dev/null 2>&1 </dev/null & log "watchdog: restarted"; fi
       done;;
esac
