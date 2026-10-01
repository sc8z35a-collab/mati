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
