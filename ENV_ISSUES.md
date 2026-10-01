# 開発環境のエラーと解決法（全員、直面したら即・末尾に追記）
書式: `## [ID] 症状` / 原因 / 解決 / 再発防止

## [A] サンドボックスのリソースが極小（2コア / RAM 985MB / swap 127MB）
- 原因: 実行環境の仕様。
- 解決: Chromium(SwiftShader) は同時に1つだけ。`--disable-dev-shm-usage` を付ける。大きな `npm install` と同時に走らせない。
- 再発防止: `free -m` を時々確認。固まったら ResetSandbox → `bash tools/collab/start.sh <ID>` と `bash tools/setup-browser-env.sh` を再実行（プロセスは全部止まる）。

## [A] ヘッドレス撮影1回が約100秒
- 原因: GPU無し（SwiftShader ソフトウェアWebGL）で 150万三角形・1500 draw calls を描画、加えて起動時の都市生成。
- 解決: 1起動で STEPS に複数ショットを並べる。Bashツールのタイムアウトは既定120秒なので `timeout` 引数を 300000ms 以上に設定。
- 再発防止: 撮影ジョブは `run_in_background` にして BashOutput で回収するのも有効。

## [A] Bashツールのcwdが毎回 /home/user に戻る
- 解決: 全コマンドを `cd /home/user/webapp && ...` で始める。

## [A] CDN（three.js / Google Fonts）がテスト中に不安定・遅い
- 解決: `tools/setup-browser-env.sh` が three.min.js r158 を /tmp/pw に落とし、shot.cjs/probe.cjs が route で差し替え、fonts は abort。テストは `THREE_SCRIPT=/tmp/pw/three.min.js PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright` を付ける。

## [A] 作業が失われるリスク（環境が不意にリセット/終了）
- 解決: `tools/collab/autosave.sh`（3分おき commit+push+Draft PR）を `tools/collab/start.sh <ID>` で起動。`setsid nohup` で Bashツール終了後も生存。
- 注意: サンドボックスリセットでデーモンも死ぬ → start.sh を再実行（冪等）。cron は環境に無い（`which crontab` 空）ため常駐ループ方式。

## [A] 4エージェントが「同じサンドボックス」に同居していた（想定外）
- 症状: B/C/D が同じ /home/user/webapp・同じ RAM 985MB を共有。A の作業ツリーで別エージェントが checkout すると全員が壊れる危険。
- 解決: 各自は専用 `git worktree`（`.wt-b` `.wt-c`）や独立クローン（`.agent-d`）で作業し、HTTPサーバーもポートを分ける（A:3000 B:3001 C:3003 D:3002…）。`.gitignore` に `.wt-*/ .agent-*/` を追加済み。
- 再発防止: 起動時に `git worktree list` と `ls /tmp/pw` で同居者を確認する。

## [A] page.screenshot() が無限に待つ（WebGLページ）
- 症状: Playwright `page.screenshot()` が SwiftShader で重いページだと返ってこない（6分以上）。
- 原因: 安定フレーム/フォント待ちでrAFが忙しいページが完了扱いにならない。
- 解決: CDP の `Page.captureScreenshot` を使う（`tools/shot.cjs` / `tools/views.cjs` は対応済み）。

## [A] `pkill -f <パターン>` で自分のBashシェルごと死ぬ
- 症状: `pkill -f views.cjs; ...` を実行したら Bash ツール自体が exit -1。
- 原因: Bashツールは `bash -c "<コマンド全文>"` で動くため、そのシェルのコマンドラインにもパターン文字列が含まれ、自分自身にマッチする。
- 解決: `pgrep -f "node /path/to/views"` でPIDを確認してから `kill <pid>`、または `pkill -f "[v]iews.cjs"` のように正規表現でパターン自身を外す。
- さらに注意: 共有サンドボックスでは `pkill chrome` は **他エージェントの撮影も殺す**。自分の子プロセスだけを止めること。

## [A] Chromium同時起動の直列化
- 解決: `bash tools/chromium-lock.sh <cmd>`（.chromium.lock → .shot.lock の順で flock、最大420秒で自動解放）。B/C/D の各ラッパーと同じロックファイルなので互換。
