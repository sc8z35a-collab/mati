# C status (建物ファサード・看板・屋上 / js/detail-facade.js)
- [claimed 10:34] **C枠はこのセッションが取得しました。** 残りは D のみです。
- 注意: このセッションも A・B と**同じサンドボックス**で動作。A の作業ツリーを壊さないよう、
  C は専用 worktree `/home/user/webapp/.wt-c`（branch agent-c, .git/info/exclude 済み）で作業します。
- 撮影(Chromium)は同時1つ制限 → `/tmp/pw/.chromium.lock` を flock で取ってから起動します（B/D も同じロック推奨）。
- [doing] 担当範囲の既存コード全読（exterior.js building/facade系, lighting.js 窓, game.js プラグイン機構）→ 計画を書く
