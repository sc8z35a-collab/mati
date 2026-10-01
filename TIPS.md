# 細部作成のコツ（リーダーA初版。全員、気づいたら末尾に追記）

## 0. 心構え
- **「見て確かめる」が全て。** コードを書いたら必ずヘッドレスで撮影 → `understand_images`/Readで目視。数値テストが通っても見た目が悪ければ未完成。
- 1回の撮影に **約100秒** かかる（SwiftShader + 都市生成）。1回の起動で `STEPS` に複数カメラ位置を並べて **まとめ撮り** すること。
- 遠景より **プレイヤー目線（地上1.7m、2〜15m先）** の密度が体感品質を決める。初期位置 (30,108) 付近・中央庭園・カフェ前を最優先で作り込む。

## 1. 撮影・検証ワークフロー（実証済み）
```bash
bash tools/setup-browser-env.sh        # /tmp/pw にplaywright+chromium+three.min.js、:3000 に http.server（約20秒）
cd /tmp/pw
VP=960x540 WAIT=1500 STEPS='[
 {"eval":"evercity.debug.pose(30,108,0.28,0.05)","wait":400,"shot":"b_start"},
 {"eval":"evercity.debug.pose(12,104,-0.6,-0.15)","wait":400,"shot":"b_ground"}
]' Q='?test=1' node shot.cjs     # → /tmp/shots/*.png
```
- `evercity.debug.*` は `?test=1` のときだけ存在（pose/load/blocked/props/buildings…）。
- 時間帯: `{"eval":"document.getElementById('time-select').value='night';document.getElementById('time-select').onchange({target:{value:'night'}})"}` 天候: `?weather=rain`。夜: `?view=night`。
- 自分の selfTest: `Q='?test=1'` で console に `EVERCITY detail <name> tests {...}` が出る。`tests/smoke.cjs` は false を1つでも検出すると落ちる。
- 画面を見せる時は `/tmp/shots/x.png` を Read（画像として表示される）。

## 2. パフォーマンス予算（超重要）
- 現状: 起動直後 1572 draw calls / 153万三角形（BALANCED, 960x540）。**InstancedMesh バッチに乗せれば draw call は増えない。**
- `exterior.box/add` は (形状,材質,72mセル,tier) ごとに1バッチ。**新しい材質を増やすほど draw call が セル数(約100)×tier 倍で増える** → 材質は増やさず `color`（インスタンスカラー）で塗り分ける。
- 毎フレーム `new THREE.Vector3()` 等のアロケーション禁止。`update()` は `this.t += dt; if (this.t < 0.1) return;` で間引く。
- 透明物（transparent）はソートコスト大。デカールは `contact` 材質（depthWrite:false, polygonOffset）を流用。
- テクスチャは 1024px 以下、共有アトラス化。外部画像は `assets/` に置き、**最大 512KB/枚** 目安（リポジトリと読み込み時間のため）。
- メモリ 985MB の非力なサンドボックス。Chromiumを同時に2つ起動しない（OOMでサンドボックスが固まる）。

## 3. 「細部」に効くテクニック集
- **接地感**: 物の足元に `contact` デカール（`exterior.add("leaf","contact",x,y+0.004,z,w,d,1,"#fff",-Math.PI/2)`）。浮いて見える最大の原因は影の欠如。
- **エッジの面取り感**: 箱の上に 0.6倍厚の少し小さい箱を重ねる／明るい色の細い帯(0.02m)を上端に置くとハイライトに見える。
- **経年・汚れ**: 下端に暗い薄板（雨だれ・泥はね）、角に色むら。インスタンスカラーで ±5% の明度ジッタを入れると工業製品の均一感が消える。
- **人の気配**: 窓辺の植木鉢・カーテンの開き具合のランダム化・自転車・傘立て・郵便受けのチラシ・床の落ち葉。「誰かが今そこにいた」痕跡。
- **夜**: `materials.glow` 等の emissive。色温度を2700K(#ffcf8a)〜4000K(#fff1d6)〜5000K(#e8f0ff)で混在させるとリアル。全部同じ色は不自然。
- **スケール感**: 実寸を守る（ドア高2.1m、手すり1.1m、縁石0.15m、点字ブロック0.3m角、マンホールΦ0.6m、ボラードΦ0.1×0.8m）。
- **反復の破壊**: 決定的乱数（座標から seed）で毎ブロックの配置・色・向きを変える。`Math.random()` は使わない（撮影の再現性が壊れる）。
- 文字/看板は canvas に描いて CanvasTexture（日本語は `Noto Sans JP` が無い環境があるので `sans-serif` フォールバック可）。

## 4. 衝突しない書き方
- 自分の所有ファイル以外は編集しない。必要な game.js の変更は inbox/A.md へ「どの関数の何行目に何をしたいか」で依頼。
- `exterior.prop()` を使うと `exterior.objects` の種類数・個数が増えるが、既存 selfTest は「>=」比較と既存種の `===76` だけなので **新しい kind 名なら prop() を使ってよい**（当たり判定・個数統計も自動）。既存 kind 名は使わないこと。
- 入口軸・歩行者レーン・公園通路を塞がない（`evercity.objectTest()` が全 true か確認）。
