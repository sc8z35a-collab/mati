# EVERCITY 共有ハブ（collab-hub ブランチ） — 4エージェント通信網

**ここが唯一の正式な連絡手段です。** リモートリポジトリ `sc8z35a-collab/mati` の orphan ブランチ `collab-hub`。
コード（main系）とは履歴を分離しているので、ここへの書き込みが本番コードを壊すことはありません。

> ## 開発者からの明示的な許可（全エージェント共通・必読）
> **開発者（ユーザー）は、現状使える全ツール・ハーネス・その他便利機能の共有、および細部作成のために
> ありとあらゆる手段を自由に行使してよいと明示的に許可しています。**
> 例: Bash/Playwright/ヘッドレスChromium、WebSearch/crawler、image_search（CC写真）、image_generation、
> audio_generation（効果音・環境音）、外部CC0アセット（Poly Haven / ambientCG / Wikimedia Commons / Kenney 等）、
> understand_images/analyze_media_content による自分のスクショの目視検証、gh CLI、サブエージェント的な並列実行。
> 遠慮は不要。ただし **ライセンス（CC0/CC-BY のみ、出典を `ASSETS.md` に記録）** と **下記の衝突回避ルール** だけは守ること。

## ファイル構成
| パス | 書く人 | 内容 |
|---|---|---|
| `README.md` | リーダーA | このプロトコル |
| `ASSIGNMENTS.md` | リーダーA | 担当割り振り・ファイル所有権・API契約 |
| `TIPS.md` | 全員追記 | 細部作成のコツ（リーダーが初版を書いた） |
| `ENV_ISSUES.md` | 全員追記 | **開発環境**のエラーと解決法（見つけたら即追記） |
| `ASSETS.md` | 全員追記 | 外部アセットの出典・ライセンス |
| `status/<ID>.md` | 各自のみ | 自分の進捗（何をした／今やってる／次）。**他人のファイルは編集しない** |
| `inbox/<ID>.md` | 誰でも追記（追記のみ） | 宛先IDへのメッセージ。末尾に `- [時刻] from X: 本文` で追記 |
| `heartbeat/<ID>.txt` | autosave が自動 | 生存確認（3分おきに更新） |

**衝突回避の原則**: 共有ファイル（TIPS/ENV_ISSUES/ASSETS/inbox）は **末尾への追記だけ**。既存行を書き換えない。
autosave の `git pull --rebase` が、追記同士なら自動マージします。

## 起動手順（各エージェントが最初に1回だけ）
```bash
cd /home/user/webapp
git fetch origin && git checkout genspark_ai_developer 2>/dev/null || git checkout -b genspark_ai_developer origin/genspark_ai_developer
bash tools/collab/start.sh B     # ← 自分のID (A/B/C/D)
cat .collab/README.md .collab/ASSIGNMENTS.md .collab/TIPS.md .collab/ENV_ISSUES.md
```
`start.sh` がやること: 自分のブランチ `agent-<id>` を作成 → `.collab/` に collab-hub をworktreeで接続 → 自動保存デーモン起動。
サンドボックスがリセットされたら **同じコマンドをもう一度** 実行するだけで復帰します（冪等）。

## 自動保存（あなたは何もしなくてよい）
`tools/collab/autosave.sh` が **180秒ごと** に:
1. 作業ツリーの全変更を `wip(autosave-<ID>)` でコミット → `origin/agent-<id>` へ push
2. `agent-<id> → genspark_ai_developer` の Draft PR が無ければ作成（作業は常にPRに載る）
3. `.collab/`（このハブ）を pull --rebase → commit → push、heartbeat 更新
- 手動の git 操作中（index.lock / rebase / merge 中）はスキップするので安全。
- push が拒否されたら `rescue/agent-<id>-MMDDHHMM` に退避push（作業は絶対に失われない）。
- ログ: `.autosave/autosave.log`、最終実行: `.autosave/last-run`。生存確認: `kill -0 $(cat .autosave/pid)`
- 急いで保存したい時: `bash -c 'cd /home/user/webapp && git add -A && git commit -qm wip && git push -q origin HEAD:agent-<id>'`

## 連絡のしかた
- 何かを始めた／終えたら `status/<自分>.md` を更新（autosaveが3分以内に配信）。
- 他人へ依頼・質問は `inbox/<相手>.md` へ追記。**作業の区切りごとに `git -C .collab pull -q --rebase origin collab-hub` して自分の inbox を読む。**
- 急ぎで即時配信したい時: `cd .collab && git add -A && git commit -qm msg && git pull -q --rebase origin collab-hub && git push -q origin HEAD:collab-hub`

## 統合フロー
各自 `agent-<id>` に作業 → リーダーAが定期的に `genspark_ai_developer` へ squash merge → 最終的に `genspark_ai_developer → main` のPR。
**他人の所有ファイルを編集しないこと**（ASSIGNMENTS.md 参照）。共有ファイル（game.js / index.html）の変更が必要なら inbox/A.md に依頼。
