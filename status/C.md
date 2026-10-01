# C status (建物ファサード・看板・屋上 / js/detail-facade.js)
- [claimed 10:34] **C枠取得済み。** 作業 worktree `/home/user/webapp/.wt-c`（branch agent-c）、配信 :3003、撮影 `/tmp/pw/cshot.sh`（.chromium.lock→.shot.lock の順で取得）。
- [done] 既存コード読了: exterior.js building()/streetCraft/frontageProp/street, game.js makeBuilding/buildResidencePreview/buildBalconyDoors/setTime/flushBatches, lighting.js HDR, visibility.js, photography.js raycast
- 観察: 上階は「透明ガラス(opacity .14)の奥が空洞」→ 窓がただの穴に見えるのが最大の弱点。

## 計画（優先順）
1. **Interior Mapping 窓シェーダ**（1 draw call / 全76棟×4面のInstancedMesh）: ガラスの内側0.1mに不透明面を置き、
   視差レイで「部屋の箱（床・天井・側壁・奥壁）＋家具シルエット層＋カーテン/ブラインド層」を描画。
   部屋ごとにハッシュで壁色・照明の色温度(2700K〜5000K)・点灯確率(昼/夕/夜)・TVのちらつき・ブラインド高さ・カーテン開き具合を変える。
   用途別(office=オープンフロア+デスク+モニタ/hotel=ベッド/shop=棚/gallery=白壁+額/residential=カーテン層のみで既存previewを残す)。
   空の色(skyUniforms)を参照したフレネル反射。**プレイヤーがいる階は discard して本物の内装を見せる。** raycast無効化でゲーム判定に影響なし。
2. 屋上: 給水塔(脚・梯子)、アンテナ/避雷針、航空障害灯(夜に点滅)、衛星アンテナ、キュービクル、屋上看板。
3. 看板: 袖看板(日本語・内照式・夜点灯)、ネオン管(色付きHDR発光)、ひさし/オーニング(shop等)、室外機+配管。
4. 外壁の経年: 雨だれ・泥はね・スラブ下の汚れ（外殻近傍だけに効くシェーダ注入。内装には効かない）。
- 静的ジオメトリは既存の (kind,mat,tier) バッチに相乗り＝draw call 増ほぼゼロ。独自メッシュは数個のみ。
- [12:01] サンドボックスがリセット → 新環境で origin/agent-c から復元して再開
- [doing] 1. Interior Mapping のAA調整・撮影検証
- [12:02] サンドボックスリセット → 新環境(単独)で復帰。agent-c を genspark_ai_developer 最新に載せ直し（detail-facade.js のみ差分）。
- [doing] Interior Mapping 窓の検証撮影 → 屋上/看板/ネオン/経年汚れ → 本番(main / GitHub Pages)反映
