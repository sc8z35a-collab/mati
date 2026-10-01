#!/usr/bin/env bash
# Idempotent bootstrap for an agent sandbox.  Usage: bash tools/collab/start.sh <A|B|C|D>
#  - remembers the agent id, checks out agent-<id> (creating it from origin/genspark_ai_developer)
#  - attaches the shared hub (branch collab-hub) at ./.collab
#  - starts the autosave daemon unless it is already alive
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
ID="${1:-$(cat .collab-agent 2>/dev/null)}"; [ -n "$ID" ] || { echo "usage: start.sh A|B|C|D"; exit 1; }
echo "$ID" > .collab-agent
ID_LC="$(echo "$ID" | tr 'A-Z' 'a-z')"; BR="agent-$ID_LC"
git config user.name >/dev/null || git config user.name "agent-$ID"
git config user.email >/dev/null || git config user.email "agent-$ID_LC@users.noreply.github.com"
git fetch -q origin
if [ "$(git rev-parse --abbrev-ref HEAD)" != "$BR" ]; then
  if git show-ref -q "refs/heads/$BR"; then git checkout -q "$BR"
  elif git show-ref -q "refs/remotes/origin/$BR"; then git checkout -q -b "$BR" "origin/$BR"
  else git checkout -q -b "$BR" origin/genspark_ai_developer; fi
fi
if [ ! -d .collab ]; then
  git worktree prune
  git worktree add -q .collab -B collab-hub origin/collab-hub 2>/dev/null || git worktree add -q .collab collab-hub
fi
(cd .collab && git pull -q --rebase origin collab-hub || true)
PID="$(cat .autosave/pid 2>/dev/null || true)"
if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then echo "autosave already running (pid $PID)"
else
  mkdir -p .autosave
  AGENT_ID="$ID" nohup setsid bash tools/collab/autosave.sh >/dev/null 2>&1 < /dev/null &
  sleep 1; echo "autosave started (pid $(cat .autosave/pid))"
fi
echo "agent=$ID branch=$BR hub=$ROOT/.collab"
