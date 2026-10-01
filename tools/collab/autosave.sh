#!/usr/bin/env bash
# EVERCITY multi-agent autosave daemon.
# Every $INTERVAL seconds (default 180):
#   1. commits all work-tree changes as a WIP commit and pushes to origin/agent-<id>
#   2. makes sure a draft PR agent-<id> -> genspark_ai_developer exists
#   3. syncs the shared hub worktree (.collab, branch collab-hub): pull --rebase, commit, push
# Usage: AGENT_ID=A bash tools/collab/autosave.sh        (normally started via tools/collab/start.sh)
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ID="${AGENT_ID:-$(cat "$ROOT/.collab-agent" 2>/dev/null || echo X)}"
ID_LC="$(echo "$ID" | tr 'A-Z' 'a-z')"
BRANCH="agent-$ID_LC"
BASE="${BASE_BRANCH:-genspark_ai_developer}"
INTERVAL="${INTERVAL:-180}"
HUB="$ROOT/.collab"
LOG="$ROOT/.autosave/autosave.log"
mkdir -p "$ROOT/.autosave"
echo $$ > "$ROOT/.autosave/pid"
log() { echo "[$(date '+%F %T')] [$ID] $*" >> "$LOG"; }

busy() { # never commit in the middle of a manual git operation
  local g="$1"
  [ -e "$g/index.lock" ] || [ -d "$g/rebase-merge" ] || [ -d "$g/rebase-apply" ] || [ -e "$g/MERGE_HEAD" ] || [ -e "$g/CHERRY_PICK_HEAD" ]
}

save_work() {
  cd "$ROOT" || return
  local gd; gd="$(git rev-parse --git-dir)"
  if busy "$gd"; then log "work: git busy, skip"; return; fi
  local cur; cur="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$cur" != "$BRANCH" ]; then log "work: on '$cur' not '$BRANCH' -> pushing current HEAD to $BRANCH anyway"; fi
  if [ -n "$(git status --porcelain)" ]; then
    git add -A >/dev/null 2>&1
    git commit -q --no-verify -m "wip(autosave-$ID): $(date '+%F %T')" >/dev/null 2>&1 && log "work: committed"
  fi
  timeout 60 git fetch -q origin "$BASE" >/dev/null 2>&1
  if ! timeout 60 git push -q origin "HEAD:refs/heads/$BRANCH" >/dev/null 2>&1; then
    # remote moved (e.g. leader force-updated). Never lose local work: push to a rescue ref.
    timeout 60 git push -q origin "HEAD:refs/heads/rescue/$BRANCH-$(date +%m%d%H%M)" >/dev/null 2>&1
    log "work: push rejected -> saved to rescue/$BRANCH-*"
  fi
  # Re-check every cycle: a PR can be merged/closed by the leader at any time.
  if command -v gh >/dev/null && [ -n "$(git log --oneline "origin/$BASE..HEAD" 2>/dev/null | head -1)" ]; then
    if [ -z "$(timeout 30 gh pr list --head "$BRANCH" --state open --json number -q '.[].number' 2>/dev/null)" ]; then
      timeout 60 gh pr create --draft --base "$BASE" --head "$BRANCH" \
        --title "wip(agent-$ID): autosaved work of agent $ID" \
        --body "Autosaved by tools/collab/autosave.sh every ${INTERVAL}s. Leader squashes on merge. See collab-hub branch for coordination." \
        >/dev/null 2>&1 && log "work: draft PR created"
    fi
  fi
}

save_hub() {
  [ -d "$HUB" ] || return
  cd "$HUB" || return
  local gd; gd="$(git rev-parse --git-dir)"
  if busy "$gd"; then log "hub: busy, skip"; return; fi
  date '+%F %T' > "heartbeat/$ID.txt" 2>/dev/null || { mkdir -p heartbeat; date '+%F %T' > "heartbeat/$ID.txt"; }
  git add -A >/dev/null 2>&1
  git diff --cached --quiet || git commit -q --no-verify -m "hub($ID): $(date '+%F %T')" >/dev/null 2>&1
  for i in 1 2 3 4 5; do
    timeout 60 git pull -q --rebase origin collab-hub >/dev/null 2>&1 || { git rebase --abort >/dev/null 2>&1; log "hub: rebase conflict (someone edited a file you also edited) attempt $i"; }
    timeout 60 git push -q origin HEAD:collab-hub >/dev/null 2>&1 && return
    sleep $((RANDOM % 7 + 2))
  done
  log "hub: push failed 5x"
}

log "autosave started (branch=$BRANCH base=$BASE interval=${INTERVAL}s)"
while true; do
  save_work
  save_hub
  date '+%F %T' > "$ROOT/.autosave/last-run"
  sleep "$INTERVAL"
done
