#!/usr/bin/env bash
# EVERCITY autosave — 3分ごとに作業ツリーを自動コミットし、GitHub へ push する。
#
#   bash tools/autosave.sh start    # 起動（冪等）。デーモン + ウォッチドッグ
#   bash tools/autosave.sh stop     # 停止
#   bash tools/autosave.sh status   # 状態と最新ログ
#   bash tools/autosave.sh once     # 今すぐ1回保存
#
# 1サイクルの動作:
#   1. 変更があれば "wip(autosave): <時刻>" で現在のブランチにコミット
#   2. origin/<ブランチ> へ push。拒否されたら（履歴分岐）origin/rescue/<ブランチ>-<時刻> へ退避 push
#   3. ネットワーク断ならコミットはローカルに残り、次のサイクルで再送
# merge / rebase / cherry-pick 中や index.lock がある間は何もしない（手作業を壊さない）。
# git worktree でも動く（状態は各作業ツリーの .autosave/ に置く）。
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
  local g; g="$(git -C "$ROOT" rev-parse --git-dir)"
  # サンドボックスのリセット等で残った古い index.lock（5分以上・git プロセス無し）は除去する
  if [ -e "$g/index.lock" ] && [ -n "$(find "$g/index.lock" -mmin +5 2>/dev/null)" ] &&
    ! pgrep -x git >/dev/null 2>&1; then
    rm -f "$g/index.lock" && log "removed stale index.lock"
  fi
  [ -e "$g/index.lock" ] || [ -d "$g/rebase-merge" ] || [ -d "$g/rebase-apply" ] ||
    [ -e "$g/MERGE_HEAD" ] || [ -e "$g/CHERRY_PICK_HEAD" ] || [ -e "$g/REVERT_HEAD" ]
}

save_once() {
  cd "$ROOT" || return
  if busy; then log "git busy (merge/rebase/lock) - skip"; return; fi
  local br; br="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$br" = "HEAD" ]; then log "detached HEAD - skip"; return; fi
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
      local r; r="rescue/$br-$(date +%m%d%H%M)"
      if timeout 90 git push -q origin "HEAD:refs/heads/$r" >/dev/null 2>&1; then
        log "push to $br rejected -> saved to $r"
      else
        log "push failed (offline?) - commit kept locally, retry next cycle"
      fi
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
    for f in watchdog.pid pid; do alive "$STATE/$f" && kill "$(cat "$STATE/$f")" 2>/dev/null; rm -f "$STATE/$f"; done
    echo "autosave stopped";;
  status)
    alive "$STATE/pid" && echo "daemon running pid $(cat "$STATE/pid"), last save: $(cat "$STATE/last-run" 2>/dev/null)" || echo "daemon NOT running"
    alive "$STATE/watchdog.pid" && echo "watchdog running pid $(cat "$STATE/watchdog.pid")" || echo "watchdog NOT running"
    tail -5 "$LOG" 2>/dev/null;;
  once) save_once; tail -1 "$LOG";;
  watchdog)
    # デーモンが落ちたら 30 秒以内に再起動する
    echo $$ > "$STATE/watchdog.pid"
    trap 'rm -f "$STATE/watchdog.pid"; exit 0' INT TERM
    while true; do
      alive "$STATE/pid" || { log "watchdog: daemon dead -> restart"; nohup setsid bash "$SELF" run >/dev/null 2>&1 < /dev/null & }
      sleep 30 & wait $!
    done;;
  run)
    echo $$ > "$STATE/pid"
    log "autosave started (interval=${INTERVAL}s pid=$$ root=$ROOT)"
    trap 'log "autosave stopped"; rm -f "$STATE/pid"; exit 0' INT TERM
    while true; do
      save_once
      sleep "$INTERVAL" & wait $!
    done;;
  *) echo "usage: $0 start|stop|status|once"; exit 1;;
esac
