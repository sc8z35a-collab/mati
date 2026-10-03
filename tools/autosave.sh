#!/usr/bin/env bash
# EVERCITY autosave — 3分ごとに作業ツリーを自動コミットし GitHub へ push する。
#
#   bash tools/autosave.sh start    起動（冪等）。保存ループ + 60秒おきのウォッチドッグ
#   bash tools/autosave.sh stop     停止
#   bash tools/autosave.sh status   状態と最新ログ
#   bash tools/autosave.sh once     今すぐ1回保存
#
# 1サイクル:
#   1. 変更があれば "wip(autosave): <時刻>" で現在のブランチへコミット（未追跡ファイルも含む）
#   2. origin/<ブランチ> へ push。履歴が分岐して拒否されたら origin/rescue/<ブランチ>-<時刻> へ退避
#   3. ネットワーク断ならコミットはローカルに残し、次のサイクルで再送
# merge / rebase / cherry-pick 中、index.lock がある間は手作業を壊さないよう何もしない。
# git worktree でも動作（状態は各作業ツリーの .autosave/ に置く。.gitignore 済み）。
# サンドボックス再起動でプロセスが消えたら `bash tools/autosave.sh start` を再実行する。
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SELF="$ROOT/tools/autosave.sh"
STATE="$ROOT/.autosave"
INTERVAL="${INTERVAL:-180}"
mkdir -p "$STATE"
LOG="$STATE/autosave.log"
log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }
alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

busy() {
  local g; g="$(git -C "$ROOT" rev-parse --absolute-git-dir 2>/dev/null)" || return 0
  [ -e "$g/index.lock" ] || [ -d "$g/rebase-merge" ] || [ -d "$g/rebase-apply" ] ||
    [ -e "$g/MERGE_HEAD" ] || [ -e "$g/CHERRY_PICK_HEAD" ] || [ -e "$g/REVERT_HEAD" ] ||
    [ -e "$g/BISECT_LOG" ]
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
    else
      # Rejected (e.g. after a squash) or offline: never lose work, keep a rescue ref.
      local rescue="rescue/$br-$(date +%m%d%H%M)"
      if timeout 90 git push -q origin "HEAD:refs/heads/$rescue" >/dev/null 2>&1; then
        log "push to $br rejected -> saved to $rescue"
      else
        log "push failed (offline?) - commit kept locally, retry next cycle"
      fi
    fi
  fi
  date '+%F %T' > "$STATE/last-run"
}

case "${1:-status}" in
  run)
    echo $$ > "$STATE/pid"
    log "autosave loop started (interval ${INTERVAL}s, pid $$, root $ROOT)"
    trap 'log "autosave loop stopped"; rm -f "$STATE/pid"; exit 0' TERM INT
    while true; do save_once; sleep "$INTERVAL" & wait $!; done ;;
  watchdog)
    echo $$ > "$STATE/watchdog.pid"
    trap 'rm -f "$STATE/watchdog.pid"; exit 0' TERM INT
    while true; do
      sleep 60 & wait $!
      stuck=0
      if [ -f "$STATE/last-run" ]; then
        age=$(( $(date +%s) - $(date -r "$STATE/last-run" +%s) ))
        [ "$age" -gt $((INTERVAL * 3 + 120)) ] && stuck=1
      fi
      if ! alive "$STATE/pid" || [ "$stuck" = 1 ]; then
        [ "$stuck" = 1 ] && kill "$(cat "$STATE/pid")" 2>/dev/null
        log "watchdog: restarting autosave loop"
        nohup setsid bash "$SELF" run >/dev/null 2>&1 < /dev/null &
      fi
    done ;;
  start)
    if alive "$STATE/pid"; then echo "autosave loop already running (pid $(cat "$STATE/pid"))"
    else nohup setsid bash "$SELF" run >/dev/null 2>&1 < /dev/null & sleep 1
      echo "autosave loop started (pid $(cat "$STATE/pid" 2>/dev/null))"; fi
    if alive "$STATE/watchdog.pid"; then echo "watchdog already running"
    else nohup setsid bash "$SELF" watchdog >/dev/null 2>&1 < /dev/null & sleep 1
      echo "watchdog started (pid $(cat "$STATE/watchdog.pid" 2>/dev/null))"; fi
    echo "log: $LOG" ;;
  stop)
    for f in watchdog.pid pid; do alive "$STATE/$f" && kill "$(cat "$STATE/$f")"; rm -f "$STATE/$f"; done
    echo "autosave stopped" ;;
  once) save_once; tail -1 "$LOG" ;;
  status)
    if alive "$STATE/pid"; then echo "loop: running (pid $(cat "$STATE/pid")) last: $(cat "$STATE/last-run" 2>/dev/null)"; else echo "loop: NOT running"; fi
    if alive "$STATE/watchdog.pid"; then echo "watchdog: running"; else echo "watchdog: NOT running"; fi
    tail -5 "$LOG" 2>/dev/null ;;
  *) echo "usage: $0 start|stop|status|once"; exit 1 ;;
esac
