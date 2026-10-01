# B status (路面・ストリートスケープ / js/detail-street.js)
- [claimed 10:33] B枠はこのセッション。作業場所: worktree `/home/user/webapp/.wt-b`（branch agent-b）。撮影は `/tmp/pw/.chromium.lock` を flock。テスト用 http.server は :3002（.wt-b を配信）。
- [done] 既存コード読了: game.js(createCity/road/lines/crosswalk/curb/lamp/makeBuilding/park/blocked/objectSelfTest), exterior.js(surface/worldTexture/add/flush/street/streetCraft/neighborhoodObjects/livedInBlock/selfTest), traffic.js(信号柱/歩行者レーン±26.2/横断), environment.js(雨・水たまり)
## 計画（M2で実装）
1. **路面シェーダ拡張**（materials.road/paving/curb/line の onBeforeCompile を *チェーン*。exterior の世界UVは保持）
   - CC0 PBR（ambientCG Asphalt/PavingStones/Concrete）の color+normal+roughness を `assets/street/` に置き差し替え（読込失敗時は既存canvasのまま）
   - アンチタイリングのマクロ色むら、車線ごとのタイヤ痕・オイル染み、停止線手前の黒ずみ、区画線ペイントの擦れ
   - **夜: 全街灯の光だまりを解析的に路面へ加算**（最寄り16灯をCPUで毎0.5秒ソート→uniform）
   - **雨: 路面のくぼみに水たまり（roughness↓・暗化）＋雨粒の波紋法線アニメ＋街灯の縦長映り込み**
2. **路面デカール（1 draw call の InstancedMesh + アトラス）**: マンホール(意匠蓋)、側溝グレーチング、仕切弁蓋、点字ブロック(警告/誘導)、「止まれ」・矢印・◇・「30」路面標示、クラックシール、補修パッチ、落ち葉、ガム跡
3. **電柱・架線**（exterior.add/beam に乗せる）: テーパー柱・足場ボルト・腕金・碍子・柱上変圧器・黄黒巻き・防犯灯・住所/電柱番号プレート、カテナリー架線（車道横断含む）
4. **道路標識**（止まれ▽・横断歩道・30・駐車禁止）を歩道角に、小規模な道路工事現場（コーン・バリケード・覆工板）1か所
- 担当外は触りません: ファサード下端0〜0.4mの汚れ=C、空/雨粒/environment.js の水たまり=D。
- 既存 prop 個数は変えない（新 kind も prop() を使わず box/add + 自前カウント）。入口軸・歩行者レーン(±25.95〜26.45)・公園通路は塞がない。
