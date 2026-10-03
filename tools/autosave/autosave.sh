#!/usr/bin/env bash
# EVERCITY autosave daemon — commits and pushes all work every $INTERVAL seconds (default 180 = 3 min).
#   start : bash tools/autosave/autosave.sh start   (idempotent)
#   stop  : bash tools/autosave/autosave.sh stop
#   status: bash tools/autosave/autosave.sh status
#   once  : bash tools/autosave/autosave.sh once    (save immediately)
# Every cycle:
#   1. if the work tree has changes -> "wip(autosave): <time>" commit on the current branch
#   2. push HEAD to origin/<branch>; if rejected (diverged) -> push to rescue/<branch>-<stamp>
#   3. if the network is down the commit stays local and is pushed on the next cycle
# Never commits during a merge/rebase/cherry-pick or while git holds index.lock.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="$ROOT/.autosave"
INTERVAL="${INTERVAL:-180}"
mkdir -p "$STATE"
LOG="$STATE/autosave.log"
log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

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
  local remote; remote="$(git rev-parse -q --verify "refs/remotes/origin/$br" 2>/dev/null)"
  if [ "$(git rev-parse HEAD)" != "$remote" ]; then
    if timeout 90 git push -q origin "HEAD:refs/heads/$br" >/dev/null 2>&1; then
      git update-ref "refs/remotes/origin/$br" HEAD
      log "pushed $br @ $(git rev-parse --short HEAD)"
    elif timeout 90 git push -q origin "HEAD:refs/heads/rescue/$br-$(date +%m%d%H%M)" >/dev/null 2>&1; then
      log "push to $br rejected -> saved to rescue/$br-$(date +%m%d%H%M)"
    else
      log "push failed (offline?) - commit kept locally, retry next cycle"
    fi
  fi
  date '+%F %T' > "$STATE/last-run"
}

running() { [ -f "$STATE/pid" ] && kill -0 "$(cat "$STATE/pid")" 2>/dev/null; }

case "${1:-run}" in
  start)
    if running; then echo "autosave already running (pid $(cat "$STATE/pid"))"; exit 0; fi
    nohup setsid bash "$0" run >/dev/null 2>&1 < /dev/null &
    sleep 1; echo "autosave started (pid $(cat "$STATE/pid" 2>/dev/null)); log: .autosave/autosave.log";;
  stop) if running; then kill "$(cat "$STATE/pid")"; echo "autosave stopped"; else echo "autosave not running"; fi; rm -f "$STATE/pid";;
  status)
    if running; then echo "running pid $(cat "$STATE/pid"), last run: $(cat "$STATE/last-run" 2>/dev/null)"; else echo "NOT running"; fi
    tail -5 "$LOG" 2>/dev/null;;
  once) save_once; tail -1 "$LOG";;
  run)
    echo $$ > "$STATE/pid"
    log "autosave loop started (interval ${INTERVAL}s, pid $$)"
    trap 'log "autosave stopped"; rm -f "$STATE/pid"; exit 0' TERM INT
    while true; do save_once; sleep "$INTERVAL" & wait $!; done;;
  *) echo "usage: $0 start|stop|status|once"; exit 1;;
esac
