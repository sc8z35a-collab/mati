# D status (空・大気・自然・音・UI磨き / js/detail-atmos.js, css/detail.css, assets/atmos/*)
- [claimed 10:36] D枠。独立クローン `/home/user/webapp/.agent-d`（branch agent-d）。撮影は tools/chromium-lock.sh 互換ロック。http.server は :3004。
- [done] 既存コード読了: game.js(sky ShaderMaterial/skyUniforms, setTime, animate, plugin api), environment.js(雨/雲Sprite/補間), audio.js, lighting.js(HDR/bloom), exterior.js(公園/水辺)
## 計画 (M1→M2)
1. **空シェーダ差し替え**（skyメッシュとskyUniformsはそのまま、同じメッシュの material を拡張版に交換。top/bottom/sunColor/sunDirection は既存どおり environment が書く）
   - 大気散乱風グラデーション＋地平線ヘイズ、Mie相関の太陽グロー、夕焼け帯
   - 手続きfbm雲（天候で被覆率変化、太陽側の銀の縁取り、風で流れる）→ 既存の雲Sprite18枚は非表示に
   - 夜: 手続き星（瞬き）＋ **ESO 天の川360°パノラマ(CC BY 4.0)**、**NASA LROC 月テクスチャ(PD)** の月（満ち欠け陰影・暈）
2. **水面**: 北の海(1500×165)と公園池5か所に波/フレネル/空反射/太陽・月の煌めきシェーダ面。池に鯉
3. **生命感**: 鳥の群れ(InstancedMesh+羽ばたき)、海上のカモメ、地上の鳩(つつく・逃げる)、花壇の蝶、夜の蛍、街灯の羽虫、樹下の落ち葉/花びら
4. **雨**: 足元の水しぶき・水たまりの波紋（雨のLineSegments本体は environment のまま）
5. **環境音**(Web Audio手続き合成, 外部音源なし): 鳥のさえずり(昼/公園で増)、夜の虫の声、波音(水辺接近)、街の遠鳴り、突風。#sound-toggle に addEventListener で追従
6. **UI(css/detail.css)**: ロード画面・HUD・ダイアログ・トーストの質感、雨天時の画面の雨粒オーバーレイ
- [doing] 1 の空シェーダ実装
