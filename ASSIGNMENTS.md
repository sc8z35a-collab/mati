# 担当割り振り（リーダー: A）

ベース: `genspark_ai_developer`（= main `f03c42f` + プラグインフック + 自動保存）。
**既存コード全文はリーダーが把握済み**。概要は末尾「既存コード地図」。各自も担当範囲の既存コードは必ず全部読んでから書くこと。

## 方式: 「1エージェント = 新規プラグインファイル」で衝突ゼロ
game.js に **ディテール・プラグイン機構** を追加済み。各エージェントは **自分専用の新規ファイル** だけを書く。
index.html の `<script>` 読み込みと `?v=` 版番号はリーダーが既に追加済み（ファイルが空でも動く）。

| ID | 担当 | 所有ファイル（あなただけが編集） | テーマ |
|---|---|---|---|
| **A** (リーダー) | 統合・基盤・品質保証・最終レビュー | `js/game.js`, `index.html`, `README.md`, `tools/**`, `tests/details.cjs`, `ENVIRONMENT_TROUBLESHOOTING.md` | フック/API・統合・回帰テスト・ドキュメント |
| **B** | 路面・ストリートスケープ | `js/detail-street.js` | 路面の質感（マンホール・側溝・路面標示の擦れ・水たまり・タイヤ痕・点字ブロック・道路標識・ボラード・電柱/架線・自販機の灯り等）。CC0 PBRテクスチャ(ambientCG等)の導入も可 |
| **C** | 建物ファサード・看板・屋上 | `js/detail-facade.js` | 窓の室内の気配（カーテン・照明の色温度差・夜の点灯パターン）、店舗の看板/ネオン/ショーウィンドウ、ひさし、室外機、屋上の給水塔・アンテナ・手すり、壁面の汚れ・雨だれ、ファサードの多様性 |
| **D** | 空・大気・自然・音・UI磨き | `js/detail-atmos.js`, `css/detail.css` | 空(CC0 HDRI/星空/月/雲の質)、鳥・落ち葉・蝶などの生命感、水面のゆらぎ、夜の光の演出、街の環境音(CC0/生成)、HUD/ロード画面/ダイアログの細部の磨き（CSS） |

### API 契約（game.js が渡す `api`）
各ファイルは次の形でオブジェクトを `window.EvercityDetails` に push する:
```js
"use strict";
(window.EvercityDetails ||= []).push({
  name: "street", owner: "B",
  // 生成時（都市の静的ジオメトリ。exterior.add 系は flush 前なのでここで呼べば自動インスタンス化）
  city(api) {},
  // 建物フロアの内装生成ごと（1Fは起動時、上階はエレベーター移動時）。api.active() が true なら上階
  interior(api, building, floor, theme) {},
  // 全システム(environment/stories/traffic/lighting)構築後に1回
  ready(api) {},
  // 毎フレーム（dt秒, ダイアログ中は suspended=true）。重い処理は間引くこと
  update(dt, api, suspended) {},
  // 上階ロード後（activeInterior Group に動的メッシュを足せる。clearで自動破棄される）
  floorLoaded(api, building, floor, group) {},
  // 時間帯変更時 mode = "day" | "golden" | "night"
  timeChanged(api, mode) {},
  // ?test=1 で console に出る。全値 true を返すこと（falseがあるとsmokeが落ちる）
  selfTest(api) { return { ok: true }; },
  snapshot() { return {}; },
});
```
`api` の中身: `THREE, scene, renderer, camera, player, sun, ambient, skyUniforms, materials, mat(name,color,rough,metal,extra), exterior, buildings, parks, landmarks, obstacle(x,z,w,d,h), box/cyl/ball/part(既存バッチ), solid, plant, chair, table, sofa, bookcase, label, toast, BASE(0.32), FLOOR(5.6), GRID(72), active(), group(), floorContext(), getTime(), weather(), quality(), indoor(), currentBuilding(), vehicles, people, environment, stories, trafficSystem, lightingSystem`
- 例外は1プラグイン単位で捕捉され、そのフックだけ無効化（コンソールに `EVERCITY detail plugin X.hook failed`）。街は止まらない。
- `window.evercity.details()` で全プラグインの状態/`snapshot()` を確認できる。

### 静的ジオメトリの推奨書き方
`api.exterior.box(mat, x,y,z, w,h,d, color, ry, tier)` / `cylinder` / `add(kind,...)` を **city() 内で** 使う → 既存の距離LOD・可視判定・InstancedMesh に自動で乗る（最も軽い）。
- mat: `render|fabric|masonry|trim|timber|glass|dark|glow|foliage|leaf|sign|detailSign|contact`、tier: `near|green|roof|facade`
- kind: `box|cylinder|sphere|leaf|ring`。独自テクスチャが必要なら `api.exterior.m.<新名> = new THREE.MeshStandardMaterial(...)` を city() の最初で登録してから add する（flush時に参照）。
- 当たり判定が必要な物は `api.obstacle(x,z,w,d,h)`。入口軸（建物中心x±3, z=b.z+d/2〜+29）、歩行者レーン（街区中心±26.2）、公園の十字通路は空けること（`window.evercity.objectTest()` が検査）。

## マイルストーン
1. **M1 (開始〜60分)**: 担当範囲の既存コード全読 → `status/<ID>.md` に計画を書く → 最初の目に見える改善を1つ入れてスクショ確認
2. **M2**: 本実装。15〜30分ごとに自分のスクショを `understand_images` 等で目視検証。`?test=1` でエラー無し
3. **M3**: 仕上げ。`status/<ID>.md` に「DONE」と完成内容・既知の制約・**直面した開発環境エラー**を書き、ENV_ISSUES.md にも追記 → inbox/A.md に完了報告
リーダーAは全員の DONE を確認後、統合・回帰テスト・最終PR・環境トラブルまとめmdを作成する。

## 既存コード地図（リーダーが全文読了して要約）
- `js/game.js` (3.9k行) 都市生成の中核。`box/cyl/ball/part` は (kind,mat,144mセル) ごとにバッチ→`flushBatches()`でInstancedMesh化。上階は `loadFloor` で `activeInterior` に実メッシュ生成→`batchActiveInterior` で再インスタンス化。`blocked()` 当たり判定、`supportHeight()` 足元高さ、`setTime()` 時間帯、`animate()` メインループ、`window.evercity` 診断フック、`?test=1` の自己診断。
- 都市: GRID=72m、i,j∈[-4,4] の81区画、公園5（0:1 中央庭園 等）、建物76。街区舗装 54m角（縁石±27m）、道路幅18m、交差点中心 (i*72+36, j*72+36)。北 z<-337 は水辺、南 z>330 は公共安全地区(services.js)。プレイヤー初期 (30,108)。
- `js/exterior.js` (3.2k行) 手続き型テクスチャ（canvas 1024px, 世界座標UV）、`add()`→(kind,mat,セル,tier)バッチ、`flush()`、距離LOD `update()`。建物ファサード `building(b)`、`street/streetCraft/frontageProp/neighborhoodObjects/livedInBlock`、公園 `park/parkObjects/gardenLife`、`selfTest`(個数を厳密検査: 1620個/37種 → **既存の prop 個数を変える変更は selfTest を壊すので、新規小物は prop() を使わず box/add で作るか、自分のプラグインで別カウント**)。
- `js/environment.js` 天候(雨LineSegments/水たまり/雲Sprite)・時間帯補間。`js/lighting.js` 街灯スポット割当・PCSS影・HDRパイプライン(EvercityHDR)・タイル撮影。
- `js/residences.js` 住戸2LDK×2/階の内装・設備。`js/interactions.js` 扉・照明・TV・水栓等。`js/stories.js` 依頼10・NPC6・写真・IndexedDBアルバム・セーブ。
- `js/traffic.js` 信号/車40/歩行者95。`js/actors.js` ボクセル外観。`js/services.js` 公共安全4拠点。`js/visibility.js` LOWでの遮蔽カリング。
- CSS: `style.css`(HUD基礎) `living-city.css` `stories.css`。HTML: `index.html` 1枚。テスト: `tests/*.cjs`（Playwright, SwiftShader）。
