"use strict";
window.EvercityStories = class EvercityStories {
  constructor(api) {
    this.a = api;
    this.npcs = [];
    this.time = 0;
    this.saveTimer = 0;
    this.photoMode = false;
    this.busy = false;
    this.photoURLs = [];
    this.db = null;
    this.sessionPhotos = [];
    this.data = this.readSave();
    this.resumePosition = this.data.position
      ? structuredClone(this.data.position)
      : null;
    const named = (n) => api.buildings.find((b) => b.name === n);
    this.maple = named("MAPLE COURT");
    this.cafe = named("COMMON GROUNDS");
    this.museum = named("MUSEUM OF FORM");
    this.atlas = named("ATLAS TOWER");
    this.people = [
      {
        id: "hana",
        name: "ハナ",
        role: "ガーデン・キーパー",
        x: 14,
        z: 94,
        color: "#74967d",
        hello:
          "ようこそ、エバーシティへ。今日は公園の彫刻を撮ってみませんか？ 見慣れた景色にも、きっと発見があります。",
      },
      {
        id: "ren",
        name: "レン",
        role: "コモングラウンズの店主",
        x: this.cafe.x + 5,
        z: this.cafe.z + this.cafe.d / 2 + 5,
        color: "#c39566",
        hello:
          "いらっしゃい。メイプル・コート401号室に届けたいコーヒー豆があるんです。散歩のついでにお願いできますか？",
      },
      {
        id: "aya",
        name: "アヤ",
        role: "フォーム美術館の学芸員",
        x: this.museum.x + 5,
        z: this.museum.z + this.museum.d / 2 + 5,
        color: "#75859a",
        hello:
          "建築もアートも、見る角度で表情が変わります。1階の左奥にある彫刻を、写真に残してみてください。",
      },
    ];
    this.people.push(
      {
        id: "sora",
        name: "ソラ",
        role: "街の写真家",
        x: 19,
        z: 92,
        color: "#816b9b",
        hello:
          "光の変化を探しているんです。昼のカフェ、雨の公園、夜のタワー。同じ街も、時間と天気で違って見えます。",
      },
      {
        id: "kei",
        name: "ケイ",
        role: "シティガイド",
        x: this.atlas.x + 6,
        z: this.atlas.z + this.atlas.d / 2 + 4,
        color: "#738fa8",
        hello:
          "歩くほど街がつながります。散歩の道具や、屋上へのアクセスをご案内します。",
      },
      {
        id: "mio",
        name: "ミオ",
        role: "街の植栽係",
        x: this.maple.x + 6,
        z: this.maple.z + this.maple.d / 2 + 4,
        color: "#a3786b",
        hello:
          "建物の足元や屋上にも、小さな庭があります。植物のある暮らしを記録してもらえますか？",
      },
    );
    const talk = (npc, text) => ({ type: "talk", npc, text });
    this.missions = [
      {
        id: "garden",
        title: "この街で、最初の一枚",
        tag: "01 / A FIRST IMPRESSION",
        description: "公園のハナと話し、中央の彫刻を撮影して報告する。",
        reward: 60,
        steps: [
          talk("hana", "公園のハナと話す"),
          {
            type: "photo",
            text: "公園中央の彫刻を撮影",
            x: 0,
            z: 72,
            y: 4,
            floor: 0,
            radius: 29,
          },
          talk("hana", "ハナに写真の報告をする"),
        ],
      },
      {
        id: "delivery",
        title: "一杯の、その向こうへ",
        tag: "02 / SPECIAL DELIVERY",
        description:
          "カフェで荷物を受け取り、マンション4階の401号室前へ届ける。",
        reward: 140,
        steps: [
          talk("ren", "カフェのレンから荷物を受け取る"),
          {
            type: "deliver",
            text: "メイプル・コート4階・401号室前へ配達",
            x: this.maple.x - 1.65,
            z:
              this.maple.z -
              this.maple.d / 2 +
              7.2 +
              (this.maple.d - 9.4) * 0.72,
            floor: 3,
            b: this.maple,
          },
          talk("ren", "カフェに戻ってレンに報告する"),
        ],
      },
      {
        id: "art",
        title: "かたちの記憶",
        tag: "03 / ART WALK",
        description: "学芸員のアヤを訪ね、美術館の中にある彫刻を撮影する。",
        reward: 100,
        steps: [
          talk("aya", "美術館のアヤと話す"),
          {
            type: "photo",
            text: "美術館1階・左奥の彫刻を撮影",
            x: this.museum.x - this.museum.w * 0.33,
            z: this.museum.z - this.museum.d / 2 + 9,
            y: 2.6,
            floor: 0,
            b: this.museum,
            radius: 26,
          },
          talk("aya", "アヤに撮影したことを伝える"),
        ],
      },
      {
        id: "skyline",
        title: "街がひとつになる場所",
        tag: "04 / ABOVE THE CITY",
        description:
          "アトラス・タワーの屋上から、南側に広がる街並みを撮影する。",
        reward: 180,
        steps: [
          {
            type: "photo",
            text: "アトラス屋上から南側の街並みを撮影",
            x: this.atlas.x,
            z: this.atlas.z + 6,
            y: this.atlas.height + 2,
            floor: this.atlas.floors,
            b: this.atlas,
            radius: 24,
            look: { x: 0, y: 65, z: 160 },
          },
        ],
      },
    ];
    const photo = (text, x, z, y, extra = {}) => ({
      type: "photo",
      text,
      x,
      z,
      y,
      floor: 0,
      radius: 35,
      ...extra,
    });
    this.missions.push(
      {
        id: "morning",
        title: "朝のコモングラウンズ",
        tag: "05 / MORNING LIGHT",
        description:
          "ソラと話し、昼のカフェ入口を撮って報告する。設定で時間帯を選べます。",
        reward: 100,
        steps: [
          talk("sora", "公園の写真家ソラと話す"),
          photo(
            "昼のカフェ入口を撮る",
            this.cafe.x,
            this.cafe.z + this.cafe.d / 2 + 0.7,
            3,
            { time: "day" },
          ),
          talk("sora", "ソラに報告する"),
        ],
      },
      {
        id: "rain",
        title: "雨の彫刻",
        tag: "06 / RAIN STUDY",
        description: "雨の日に公園の彫刻を撮る。設定で天候を変更できます。",
        reward: 100,
        steps: [photo("雨の公園の彫刻を撮る", 0, 72, 4, { weather: "rain" })],
      },
      {
        id: "night",
        title: "タワーに灯る夜",
        tag: "07 / NIGHT WALK",
        description: "ケイと話し、夜のアトラス入口を撮影する。",
        reward: 120,
        steps: [
          talk("kei", "アトラス前のケイと話す"),
          photo(
            "夜のアトラス入口を撮る",
            this.atlas.x,
            this.atlas.z + this.atlas.d / 2 + 0.7,
            3,
            { time: "night" },
          ),
          talk("kei", "ケイに報告する"),
        ],
      },
      {
        id: "roofgarden",
        title: "空に近い小さな庭",
        tag: "08 / ROOF GARDEN",
        description: "ミオに話を聞き、メイプル屋上のハーブを記録する。",
        reward: 150,
        steps: [
          talk("mio", "メイプル前のミオと話す"),
          photo(
            "メイプル屋上のハーブを撮る",
            this.maple.x + 8,
            this.maple.z + 12,
            0.32 + this.maple.floors * 5.6 + 1.6,
            { b: this.maple, floor: this.maple.floors, radius: 12 },
          ),
          talk("mio", "ミオに報告する"),
        ],
      },
      {
        id: "architecture",
        title: "三つの入口",
        tag: "09 / CITY FACADES",
        description: "カフェ、美術館、メイプルの入口を順番に記録する。",
        reward: 180,
        steps: [this.cafe, this.museum, this.maple].map((b) =>
          photo(b.jp + "の入口を撮る", b.x, b.z + b.d / 2 + 0.7, 3),
        ),
      },
      {
        id: "changinglight",
        title: "同じ場所、違う空",
        tag: "10 / PASSING HOURS",
        description: "中央公園の彫刻を昼・夕・夜の順で撮る。",
        reward: 200,
        steps: ["day", "golden", "night"].map((time, i) =>
          photo(["昼", "夕方", "夜"][i] + "の彫刻を撮る", 0, 72, 4, { time }),
        ),
      },
    );
    this.data.claimed = this.data.claimed.filter((id) =>
      this.missions.some((m) => m.id === id),
    );
    for (const m of this.missions) {
      const v = this.data.progress[m.id];
      this.data.progress[m.id] = Number.isInteger(v)
        ? Math.max(0, Math.min(m.steps.length, v))
        : 0;
    }
    if (!this.missions.some((m) => m.id === this.data.active))
      this.data.active = "garden";
    this.data.purchases = Array.isArray(this.data.purchases)
      ? this.data.purchases.filter((id) => ["shoes", "roofpass"].includes(id))
      : [];
    this.coffeeUntil = Math.max(
      0,
      Math.min(180, Number(this.data.coffeeRemaining) || 0),
    );
    this.createResidents();
    this.createBeacon();
    this.bind();
    this.databaseReady = this.openDatabase();
    this.renderHUD();
    if (this.data.position)
      document.getElementById("resume-button").classList.remove("hidden");
  }
  static blank() {
    return {
      version: 3,
      active: "garden",
      progress: {},
      claimed: [],
      credits: 0,
      purchases: [],
      coffeeRemaining: 0,
      position: null,
      weather: "clear",
      time: "golden",
      autoTime: false,
    };
  }
  readSave() {
    try {
      const raw = JSON.parse(
        localStorage.getItem("evercity-stories-v3") || "null",
      );
      if (!raw || raw.version !== 3) return EvercityStories.blank();
      return {
        ...EvercityStories.blank(),
        ...raw,
        progress:
          raw.progress && typeof raw.progress === "object" ? raw.progress : {},
        claimed: Array.isArray(raw.claimed)
          ? raw.claimed.filter((s) => typeof s === "string")
          : [],
        credits: Math.max(
          0,
          Math.min(99999, Math.floor(Number(raw.credits) || 0)),
        ),
      };
    } catch (e) {
      return EvercityStories.blank();
    }
  }
  save(includePosition = true) {
    if (
      includePosition &&
      this.a.started() &&
      [
        this.a.player.x,
        this.a.player.z,
        this.a.player.yaw,
        this.a.player.pitch,
        this.a.player.floor,
      ].every(Number.isFinite)
    ) {
      const p = this.a.player;
      this.data.position = {
        x: p.x,
        z: p.z,
        yaw: p.yaw,
        pitch: p.pitch,
        floor: p.floor,
        bid: (p.building || this.a.current())?.id || null,
      };
    }
    this.data.coffeeRemaining = Math.max(
      0,
      (this.coffeeUntil || 0) - this.time,
    );
    this.data.time = this.a.getTime();
    this.data.weather = this.a.environment()?.weather || "clear";
    this.data.autoTime = this.a.environment()?.autoTime || false;
    try {
      localStorage.setItem("evercity-stories-v3", JSON.stringify(this.data));
      document.getElementById("save-status").textContent = "この端末に保存済み";
      return true;
    } catch (e) {
      document.getElementById("save-status").textContent =
        "保存不可：ブラウザの容量・設定を確認";
      return false;
    }
  }
  active() {
    return this.missions.find((m) => m.id === this.data.active);
  }
  step() {
    const m = this.active();
    return m?.steps[this.data.progress[m.id] || 0] || null;
  }
  goal() {
    const s = this.step();
    if (!s) return null;
    if (s.type === "talk") {
      const p = this.people.find((p) => p.id === s.npc);
      return { ...p, floor: 0, text: s.text };
    }
    return s;
  }
  advance(type, detail) {
    const m = this.active(),
      s = this.step();
    if (!s || s.type !== type) return false;
    if (type === "talk" && s.npc !== detail) return false;
    this.data.progress[m.id]++;
    if (
      this.data.progress[m.id] === m.steps.length &&
      !this.data.claimed.includes(m.id)
    ) {
      this.data.claimed.push(m.id);
      this.data.credits += m.reward;
      this.a.toast(`STORY COMPLETE / ${m.title}　＋${m.reward} EC`);
    } else this.a.toast("NEXT / " + this.step().text);
    this.save();
    this.renderHUD();
    return true;
  }
  createResidents() {
    const { THREE: T, scene, materials } = this.a;
    const box = new T.BoxGeometry(1, 1, 1),
      sphere = new T.SphereGeometry(1, 12, 10);
    for (const p of this.people) {
      const g = new T.Group(),
        shirt = new T.MeshStandardMaterial({ color: p.color, roughness: 0.9 }),
        skin = new T.MeshStandardMaterial({ color: "#cda481" });
      const piece = (geo, mat, x, y, z, sx, sy, sz) => {
        const mesh = new T.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.scale.set(sx, sy, sz);
        g.add(mesh);
        return mesh;
      };
      piece(sphere, skin, 0, 1.68, 0, 0.19, 0.23, 0.19);
      piece(sphere, materials.dark, 0, 1.84, -0.015, 0.195, 0.1, 0.19);
      piece(box, shirt, 0, 1.11, 0, 0.51, 0.82, 0.31);
      for (const side of [-1, 1]) {
        piece(box, materials.navy, side * 0.13, 0.46, 0, 0.19, 0.85, 0.22);
        piece(box, skin, side * 0.33, 1.08, 0, 0.12, 0.68, 0.16);
        piece(box, materials.dark, side * 0.13, 0.08, 0.06, 0.2, 0.12, 0.35);
      }
      if (p.id === "ren")
        piece(box, materials.woodLight, 0, 1.03, 0.175, 0.42, 0.62, 0.05);
      const pin = new T.Mesh(
        new T.OctahedronGeometry(0.17),
        new T.MeshBasicMaterial({ color: "#a5efd0" }),
      );
      pin.userData.photoMarker = true;
      pin.position.y = 2.55;
      g.add(pin);
      g.position.set(p.x, ["hana", "sora"].includes(p.id) ? 0.65 : 0.32, p.z);
      scene.add(g);
      this.npcs.push({ ...p, g, pin });
      const nameplate = this.a.label(
        p.name + " / " + p.role,
        p.x,
        2.45,
        p.z + 0.4,
        3.7,
        "#dcf1e2",
        "#25433e",
      );
      nameplate.userData.photoMarker = true;
      this.npcs.at(-1).nameplate = nameplate;
      g.traverse((m) => {
        if (m.isMesh) m.castShadow = true;
      });
    }
  }
  createBeacon() {
    const T = this.a.THREE;
    this.beacon = new T.Mesh(
      new T.TorusGeometry(0.48, 0.045, 8, 32),
      new T.MeshBasicMaterial({
        color: "#f4cc8b",
        depthTest: false,
        transparent: true,
        opacity: 0.8,
      }),
    );
    this.beacon.rotation.x = Math.PI / 2;
    this.beacon.userData.photoMarker = true;
    this.beacon.renderOrder = 8;
    this.a.scene.add(this.beacon);
  }
  blocked(x, z, floor) {
    return (
      floor === 0 &&
      this.people.some((p) => Math.hypot(p.x - x, p.z - z) < 0.64)
    );
  }
  near() {
    const p = this.a.player;
    if (p.floor === 0) {
      const npc = this.people.find(
        (n) => Math.hypot(n.x - p.x, n.z - p.z) < 3.4,
      );
      if (npc) return { kind: "npc", npc, label: npc.name + "と話す" };
    }
    const s = this.step();
    if (s?.type === "deliver" && this.atGoal(s, 2.5))
      return { kind: "deliver", label: "401号室前に荷物を届ける" };
    return null;
  }
  atGoal(g, radius = g.radius || 3) {
    const p = this.a.player;
    return (
      p.floor === g.floor &&
      (!g.b || this.a.current() === g.b) &&
      Math.hypot(p.x - g.x, p.z - g.z) <= radius
    );
  }
  use() {
    const near = this.near();
    if (!near) return false;
    if (near.kind === "deliver") {
      this.advance("deliver");
      return true;
    }
    this.talk(near.npc);
    return true;
  }
  talk(npc) {
    const $ = (id) => document.getElementById(id),
      s = this.step();
    $("resident-name").textContent = npc.name;
    $("resident-role").textContent = npc.role;
    $("resident-words").textContent = npc.hello;
    const actions = $("resident-actions");
    actions.replaceChildren();
    const button = (text, action) => {
      const b = document.createElement("button");
      b.className = "primary-button";
      b.textContent = text;
      b.onclick = action;
      actions.append(b);
    };
    if (s?.type === "talk" && s.npc === npc.id) {
      const m = this.active();
      $("resident-words").textContent =
        this.data.progress[m.id] > 0
          ? "見せてくれてありがとう。この街を、少し好きになってくれたなら嬉しいです。"
          : npc.hello;
      button(
        this.data.progress[m.id] > 0
          ? "報告して報酬を受け取る"
          : npc.id === "ren"
            ? "コーヒー豆の荷物を受け取る"
            : "話を聞いて依頼を進める",
        () => {
          this.advance("talk", npc.id);
          $("resident-dialog").close();
        },
      );
    } else
      button("この人の依頼を確認", () => {
        $("resident-dialog").close();
        this.openJournal();
      });
    if (npc.id === "ren")
      button("散歩のコーヒーを買う / 30 EC", () => {
        if (this.data.credits < 30) {
          this.a.toast("ECが足りません。依頼を完了すると獲得できます。");
          return;
        }
        this.data.credits -= 30;
        this.coffeeUntil = this.time + 180;
        this.save();
        this.a.toast("コーヒーで一息。3分間、徒歩の速度が少し上がります。");
        $("resident-dialog").close();
      });
    if (npc.id === "kei") {
      for (const [id, title, cost] of [
        ["shoes", "散歩靴 / 歩行・走行速度＋8%", 240],
        ["roofpass", "屋上パス / 注目建物の屋上へ移動", 320],
      ]) {
        if (this.data.purchases.includes(id)) continue;
        button(title + " / " + cost + " EC", () => {
          if (this.data.credits < cost) {
            this.a.toast("ECが足りません");
            return;
          }
          this.data.credits -= cost;
          this.data.purchases.push(id);
          this.save();
          this.a.toast(title + "を購入しました");
          $("resident-dialog").close();
        });
      }
      if (this.data.purchases.includes("roofpass"))
        for (const b of [this.atlas, this.maple, this.museum])
          button(b.jp + "の屋上へ", () => {
            this.a.loadFloor(b, b.floors);
            this.a.closeDialogs();
          });
    }
    this.a.openDialog("resident-dialog");
  }
  openJournal() {
    const $ = (id) => document.getElementById(id);
    $("journal-credits").textContent = this.data.credits + " EC";
    document.querySelector(".journal-summary > span").textContent =
      `${this.missions.length} STORIES · ${this.people.length} RESIDENTS`;
    const list = $("mission-list");
    list.replaceChildren();
    for (const m of this.missions) {
      const progress = this.data.progress[m.id],
        done = progress === m.steps.length,
        card = document.createElement("article");
      card.className =
        "mission-card" + (this.data.active === m.id ? " selected" : "");
      const top = document.createElement("div");
      top.className = "eyebrow";
      top.textContent = m.tag;
      const h = document.createElement("h3");
      h.textContent = m.title;
      const p = document.createElement("p");
      p.textContent = m.description;
      const b = document.createElement("button");
      b.className = "secondary-button";
      b.textContent = done
        ? "完了 ✓"
        : this.data.active === m.id
          ? "追跡中 / " + (progress + 1) + "段階目"
          : "この依頼を追跡する";
      b.disabled = done;
      b.onclick = () => {
        this.data.active = m.id;
        this.save();
        this.renderHUD();
        this.openJournal();
      };
      const meta = document.createElement("small");
      meta.textContent = `${Math.min(progress, m.steps.length)} / ${m.steps.length}　報酬 ${m.reward} EC`;
      card.append(top, h, p, meta, b);
      list.append(card);
    }
    this.a.openDialog("journal-dialog");
  }
  renderHUD() {
    const $ = (id) => document.getElementById(id),
      s = this.step(),
      g = this.goal(),
      p = this.a.player,
      m = this.active();
    $("story-title").textContent = m?.title || "自由に街を歩こう";
    $("story-objective").textContent =
      s?.text || "依頼完了！ 手帳から次の物語へ。";
    $("story-credits").textContent = this.data.credits + " EC";
    $("parcel-badge").classList.toggle(
      "hidden",
      !(this.data.progress.delivery === 1),
    );
    if (g) {
      const dist = Math.hypot(p.x - g.x, p.z - g.z);
      let guide = Math.round(dist) + " m";
      if (g.b && this.a.current() !== g.b) guide += " / 建物の入口へ";
      else if (p.floor !== g.floor)
        guide +=
          " / エレベーターで" +
          (g.floor === g.b?.floors ? "RF" : g.floor + 1 + "F") +
          "へ";
      else if (dist < 3) guide += " / 到着";
      $("destination-distance").textContent = guide;
      const bearing = Math.atan2(-(g.x - p.x), -(g.z - p.z));
      $("destination-arrow").style.transform =
        `rotate(${((p.yaw - bearing) * 180) / Math.PI}deg)`;
      this.beacon.visible =
        p.floor === g.floor && (!g.b || this.a.current() === g.b);
      this.beacon.position.set(g.x, 0.38 + g.floor * 5.6, g.z);
      this.beacon.scale.setScalar(1 + Math.sin(this.time * 2) * 0.08);
    } else {
      $("destination-distance").textContent = "すべての場所に、新しい発見を。";
      this.beacon.visible = false;
    }
    if (this.photoMode)
      $("photo-hint").textContent = this.canPhotograph()
        ? "✓ 依頼の被写体を捉えています"
        : "自由に撮影 / 依頼の被写体を中央に入れてください";
  }
  canPhotograph() {
    const s = this.step();
    if (s?.type !== "photo" || !this.atGoal(s)) return false;
    if (s.weather && this.a.environment()?.weather !== s.weather) return false;
    if (s.time && this.a.getTime() !== s.time) return false;
    const projection = EvercityPhotography.camera(
      this.a.camera,
      EvercityPhotography.options().aspect,
    );
    return EvercityPhotography.framed(
      this.a.THREE,
      projection,
      s.look || s,
      this.a.scene,
      s.look ? 6 : 1.25,
      // A skyline's distant buildings are the subject; only foreground obstructions disqualify it.
      s.look ? 35 : Infinity,
    );
  }
  toggleCamera(force) {
    if (this.busy) return;
    this.photoMode = force === undefined ? !this.photoMode : !!force;
    if (this.photoMode) {
      this.a.closeDialogs();
      document.getElementById("photo-options").hidden = true;
      document
        .getElementById("photo-options-toggle")
        .setAttribute("aria-expanded", "false");
      this.walkFov = this.a.camera.fov;
      document.getElementById("photo-fov").value = this.walkFov;
    } else if (this.walkFov) {
      this.a.camera.fov = this.walkFov;
      this.a.camera.updateProjectionMatrix();
    }
    document.body.classList.toggle("photo-mode", this.photoMode);
    document
      .getElementById("photo-controls")
      .classList.toggle("hidden", !this.photoMode);
    this.a.start();
    this.renderHUD();
  }
  async openDatabase() {
    try {
      this.db = await new Promise((resolve, reject) => {
        let finished = false;
        const timeout = setTimeout(() => {
          finished = true;
          reject(Error("アルバムを開けませんでした。写真は一時保存します。"));
        }, 8000);
        const r = indexedDB.open("evercity-photo-album", 2);
        r.onupgradeneeded = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains("photos"))
            db.createObjectStore("photos", { keyPath: "id" });
          const previews = db.createObjectStore("previews", { keyPath: "id" });
          // Migrate metadata without decoding or loading all original images into memory.
          const cursor = r.transaction.objectStore("photos").openCursor();
          cursor.onsuccess = () => {
            const c = cursor.result;
            if (!c) return;
            const { blob, ...meta } = c.value;
            previews.put(meta);
            c.continue();
          };
        };
        r.onsuccess = () => {
          clearTimeout(timeout);
          if (finished) {
            r.result.close();
            return;
          }
          finished = true;
          resolve(r.result);
        };
        r.onerror = () => {
          clearTimeout(timeout);
          finished = true;
          reject(r.error);
        };
        r.onblocked = () =>
          (document.getElementById("photo-status").textContent =
            "古いタブを閉じるとアルバムの更新を続行できます。");
      });
      this.db.onversionchange = () => {
        this.db.close();
        this.db = null;
      };
    } catch (e) {
      this.db = null;
    }
  }
  async putPhoto(record) {
    await this.databaseReady;
    const session = () => {
      this.sessionPhotos = this.sessionPhotos.filter((p) => p.id !== record.id);
      this.sessionPhotos.unshift(record);
      return false;
    };
    if (!this.db) return session();
    try {
      return await new Promise((resolve) => {
        const tx = this.db.transaction(["photos", "previews"], "readwrite");
        const { blob, ...metadata } = record;
        tx.objectStore("photos").put(record);
        tx.objectStore("previews").put(metadata);
        tx.oncomplete = () => resolve(true);
        tx.onabort = () => resolve(session());
        tx.onerror = () => {};
      });
    } catch (e) {
      return session();
    }
  }
  async photos() {
    await this.databaseReady;
    const session = this.sessionPhotos.map(({ blob, ...metadata }) => metadata);
    if (!this.db) return session;
    return new Promise((resolve) => {
      const r = this.db
        .transaction("previews")
        .objectStore("previews")
        .getAll();
      r.onsuccess = () =>
        resolve([...r.result, ...session].sort((a, b) => b.time - a.time));
      r.onerror = () => resolve(session);
    });
  }
  async photo(id) {
    const cached = this.sessionPhotos.find((p) => p.id === id);
    if (cached) return cached;
    if (!this.db) throw Error("写真を読み込めません。");
    return new Promise((resolve, reject) => {
      const r = this.db.transaction("photos").objectStore("photos").get(id);
      r.onsuccess = () =>
        r.result ? resolve(r.result) : reject(Error("写真が見つかりません。"));
      r.onerror = () => reject(r.error);
    });
  }
  async capture() {
    if (this.busy) return;
    this.busy = true;
    this.captureController = new AbortController();
    const $ = (id) => document.getElementById(id),
      settings = EvercityPhotography.options(),
      ultra = settings.quality === "hdr-ultra";
    this.a.camera.rotation.set(
      this.a.player.pitch,
      this.a.player.yaw,
      settings.roll,
    );
    this.a.camera.updateMatrixWorld(true);
    const valid = this.canPhotograph(),
      p = this.a.player;
    const context = {
      time: Date.now(),
      title: this.a.current()?.jp || "エバーシティの街角",
      floor: p.floor,
      location: !this.a.current()
        ? "屋外"
        : p.floor === this.a.current().floors
          ? "RF"
          : `${p.floor + 1}F`,
      weather: this.a.environment()?.weather || "clear",
    };
    $("shutter-button").disabled = true;
    $("photo-status").textContent = "";
    $("capture-cancel").disabled = false;
    $("capture-progress").value = 0;
    $("capture-message").textContent = ultra
      ? "HDR ULTRAの光と影を準備中…"
      : "現在の画質で再レンダリング中…";
    this.a.openDialog("capture-dialog");
    try {
      // Let the progress dialog paint before allocating high-resolution GPU resources.
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      if (this.captureController.signal.aborted)
        throw new DOMException("撮影を中止しました。", "AbortError");
      const result = await this.a.capturePhoto(settings.quality, {
        ...settings,
        signal: this.captureController.signal,
        progress: (text, value) => {
          $("capture-message").textContent = text;
          $("capture-progress").value = value;
        },
      });
      if (this.captureController.signal.aborted)
        throw new DOMException("撮影を中止しました。", "AbortError");
      $("capture-cancel").disabled = true;
      $("capture-message").textContent = "アルバムに保存中…";
      const record = {
        ...context,
        ...result,
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      };
      record.thumbnail = await EvercityPhotography.thumbnail(record.blob).catch(
        () => null,
      );
      const saved = await this.putPhoto(record);
      if (valid) this.advance("photo");
      $("shutter-flash").classList.add("flash");
      setTimeout(() => $("shutter-flash").classList.remove("flash"), 180);
      this.showPhotoResult(record, saved);
    } catch (e) {
      console.warn("Photo capture:", e);
      $("capture-dialog").close();
      $("photo-options").hidden = false;
      $("photo-options-toggle").setAttribute("aria-expanded", "true");
      $("photo-status").textContent =
        e.name === "AbortError"
          ? "撮影を中止しました。"
          : e.message || "撮影できませんでした。通常撮影をお試しください。";
      $("photo-status").scrollIntoView({ block: "nearest" });
    } finally {
      this.busy = false;
      this.captureController = null;
      $("shutter-button").disabled = false;
    }
  }
  photoFilename(record) {
    return `evercity-${record.quality === "HDR ULTRA" ? "hdr-ultra-" : ""}${record.width ? record.width + "x" + record.height + "-" : ""}${record.id}.${record.format || "jpg"}`;
  }
  showPhotoResult(record, saved, source = "capture") {
    const $ = (id) => document.getElementById(id);
    if (this.resultURL) URL.revokeObjectURL(this.resultURL);
    this.resultURL = URL.createObjectURL(record.blob);
    $("photo-result-image").src = this.resultURL;
    $("photo-result-meta").textContent =
      `${record.quality} / ${record.width} × ${record.height} / ${(record.format || "jpg").toUpperCase()} / ${(record.blob.size / 1048576).toFixed(1)} MB`;
    $("photo-result-storage").textContent = saved
      ? "アルバムに保存済み。下のボタンから原寸画像を端末へ保存できます。"
      : "ブラウザへの永続保存ができませんでした。ページを閉じる前に端末へ保存してください。";
    const link = $("photo-download");
    link.href = this.resultURL;
    link.download = this.photoFilename(record);
    const file = new File([record.blob], this.photoFilename(record), {
      type: record.blob.type,
    });
    const share = $("photo-share");
    share.hidden = !(
      navigator.canShare && navigator.canShare({ files: [file] })
    );
    share.onclick = async () => {
      try {
        await navigator.share({ files: [file], title: record.title });
      } catch (e) {
        if (e.name !== "AbortError")
          $("photo-result-storage").textContent =
            "共有できませんでした。「原寸写真を保存」をお使いください。";
      }
    };
    const back = $("photo-result-back");
    back.textContent = source === "album" ? "アルバムに戻る" : "撮影に戻る";
    back.onclick = () => {
      $("photo-result-dialog").close();
      if (source === "album") this.openAlbum();
    };
    this.a.openDialog("photo-result-dialog");
  }
  // Originals are deleted only by an explicit album action.
  async deletePhoto(id) {
    if (this.db)
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(["photos", "previews"], "readwrite");
        tx.objectStore("photos").delete(id);
        tx.objectStore("previews").delete(id);
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error || Error("削除できませんでした。"));
        tx.onerror = () => {};
      });
    this.sessionPhotos = this.sessionPhotos.filter((p) => p.id !== id);
  }
  async openAlbum() {
    this.a.openDialog("album-dialog");
    const list = document.getElementById("album-grid");
    const message = document.createElement("p");
    message.textContent = "写真を読み込んでいます…";
    list.replaceChildren(message);
    this.photoURLs.forEach(URL.revokeObjectURL);
    this.photoURLs = [];
    const records = await this.photos();
    if (!document.getElementById("album-dialog").open) return;
    list.replaceChildren();
    if (!records.length) {
      message.textContent =
        "まだ写真がありません。カメラで街を撮影してみましょう。";
      list.append(message);
      return;
    }
    const note = document.createElement("p");
    note.textContent = `${records.length}枚 / 写真は自動削除されません。`;
    list.append(note);
    // Display 24 previews at a time; originals are fetched only when selected.
    let offset = 0;
    const more = document.createElement("button");
    more.textContent = "さらに表示";
    const append = () => {
      for (const record of records.slice(offset, offset + 24)) {
        const card = document.createElement("article"),
          img = document.createElement("img");
        if (record.thumbnail) {
          const url = URL.createObjectURL(record.thumbnail);
          this.photoURLs.push(url);
          img.src = url;
        }
        img.alt = record.title + "（下のボタンで原寸表示）";
        img.loading = "lazy";
        if (!record.thumbnail) {
          this.previewQueue = (this.previewQueue || Promise.resolve())
            .then(async () => {
              if (
                !document.getElementById("album-dialog").open ||
                !img.isConnected
              )
                return;
              const original = await this.photo(record.id),
                thumbnail = await EvercityPhotography.thumbnail(original.blob);
              if (!thumbnail) return;
              if (this.db) {
                const tx = this.db.transaction("previews", "readwrite");
                tx.objectStore("previews").put({ ...record, thumbnail });
              }
              if (
                img.isConnected &&
                document.getElementById("album-dialog").open
              ) {
                const url = URL.createObjectURL(thumbnail);
                this.photoURLs.push(url);
                img.src = url;
              }
            })
            .catch(() => {});
        }
        const p = document.createElement("p");
        p.textContent = `${record.title} / ${record.location || (record.floor > 0 ? record.floor + 1 + "F" : "階情報なし")} / ${record.width}×${record.height}`;
        const view = document.createElement("button");
        view.textContent = "原寸を表示・保存";
        view.onclick = async () => {
          try {
            this.showPhotoResult(
              await this.photo(record.id),
              !this.sessionPhotos.some((p) => p.id === record.id),
              "album",
            );
          } catch (e) {
            this.a.toast(e.message);
          }
        };
        const del = document.createElement("button");
        del.textContent = "削除";
        del.onclick = async () => {
          if (confirm("この写真を削除しますか？"))
            try {
              await this.deletePhoto(record.id);
              this.openAlbum();
            } catch (e) {
              this.a.toast("削除できませんでした。写真は保持されています。");
            }
        };
        card.append(img, p, view, del);
        list.insertBefore(card, more);
      }
      offset += 24;
      more.hidden = offset >= records.length;
    };
    list.append(more);
    more.onclick = append;
    append();
  }
  resume() {
    const saved = this.resumePosition || this.data.position;
    if (!saved) {
      this.a.toast("再開できる記録がありません");
      return;
    }
    if (
      ![saved.x, saved.z, saved.yaw, saved.pitch, saved.floor].every(
        Number.isFinite,
      )
    ) {
      this.a.toast("位置記録が壊れているため再開できません");
      return;
    }
    const b = this.a.buildings.find((b) => b.id === saved.bid);
    if (saved.floor > 0 && !b) {
      this.a.toast("保存した建物が見つかりません");
      return;
    }
    if (saved.floor > 0)
      this.a.loadFloor(
        b,
        Math.max(1, Math.min(b.floors, Math.floor(saved.floor))),
      );
    else
      this.a.teleport({ park: true, x: 0, z: 72, jp: "セントラル・ガーデン" });
    const p = this.a.player;
    if (
      Math.abs(saved.x) <= 329 &&
      Math.abs(saved.z) <= 330 &&
      !this.a.blocked(saved.x, saved.z)
    ) {
      p.x = saved.x;
      p.z = saved.z;
    }
    p.yaw = saved.yaw;
    p.pitch = Math.max(-1.35, Math.min(1.35, saved.pitch));
    this.a.setTime(
      ["day", "golden", "night"].includes(this.data.time)
        ? this.data.time
        : "golden",
    );
    document.getElementById("time-select").value = this.a.getTime();
    const env = this.a.environment();
    if (env) {
      env.setWeather(this.data.weather);
      env.autoTime = !!this.data.autoTime;
      document.getElementById("auto-time").checked = env.autoTime;
    }
    this.a.start();
    this.a.closeDialogs();
    this.a.player.y = 0.32 + this.a.player.floor * 5.6 + 1.7;
    this.a.toast("前回の探索から再開しました");
  }
  bind() {
    const $ = (id) => document.getElementById(id);
    $("journal-button").onclick = () => this.openJournal();
    $("story-card").onclick = () => this.openJournal();
    $("camera-button").onclick = () => this.toggleCamera();
    $("camera-close").onclick = () => this.toggleCamera(false);
    $("photo-options-toggle").onclick = () => {
      const panel = $("photo-options");
      panel.hidden = !panel.hidden;
      $("photo-options-toggle").setAttribute(
        "aria-expanded",
        String(!panel.hidden),
      );
    };
    $("shutter-button").onclick = () => this.capture();
    $("album-button").onclick = () => this.openAlbum();
    $("photo-album-button").onclick = () => this.openAlbum();
    $("resume-button").onclick = () => this.resume();
    $("save-button").onclick = () => {
      this.a.toast(
        this.save() ? "現在地と依頼を保存しました" : "保存に失敗しました",
      );
    };
    addEventListener("keydown", (e) => {
      if (this.busy || this.a.dialogOpen() || e.repeat) return;
      if (e.code === "KeyJ") this.openJournal();
      if (e.code === "KeyP") this.toggleCamera();
      if (e.code === "Enter" && this.photoMode) {
        e.preventDefault();
        this.capture();
      }
      if (e.code === "Escape" && this.photoMode) this.toggleCamera(false);
    });
    const cancel = () => {
      this.captureController?.abort();
      $("capture-cancel").disabled = true;
      $("capture-message").textContent = "撮影を中止しています…";
    };
    $("capture-cancel").onclick = cancel;
    $("capture-dialog").addEventListener("cancel", (e) => {
      e.preventDefault();
      if (!$("capture-cancel").disabled) cancel();
    });
    const updateFrame = () => {
      const aspect = EvercityPhotography.options().aspect;
      document.body.classList.add("photo-4k");
      document.documentElement.style.setProperty(
        "--photo-width",
        `min(100vw, ${aspect * 100}dvh)`,
      );
      document.documentElement.style.setProperty(
        "--photo-height",
        `min(100dvh, ${100 / aspect}vw)`,
      );
    };
    $("photo-aspect").onchange = updateFrame;
    updateFrame();
    $("photo-fov").oninput = (e) => {
      if (this.photoMode) {
        this.a.camera.fov = Number(e.target.value);
        this.a.camera.updateProjectionMatrix();
      }
    };
    $("album-dialog").addEventListener("close", () => {
      this.photoURLs.forEach(URL.revokeObjectURL);
      this.photoURLs = [];
    });
    $("photo-result-dialog").addEventListener("close", () => {
      if (this.resultURL) {
        URL.revokeObjectURL(this.resultURL);
        this.resultURL = null;
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.save();
    });
  }
  update(dt) {
    this.time += dt;
    this.saveTimer += dt;
    if (this.saveTimer > 10) {
      this.saveTimer = 0;
      this.save();
    }
    if (Math.floor(this.time * 5) !== this.lastHUD) {
      this.lastHUD = Math.floor(this.time * 5);
      this.renderHUD();
    }
    for (const n of this.npcs) {
      n.pin.position.y = 2.55 + Math.sin(this.time * 1.6) * 0.07;
      n.pin.rotation.y += dt * 0.7;
    }
  }
  drawGoal(ctx, px, pz) {
    const g = this.goal();
    if (!g) return;
    ctx.strokeStyle = "#f3cb86";
    ctx.fillStyle = "#f3cb86";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px(g.x), pz(g.z), 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px(g.x), pz(g.z), 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  selfTest() {
    const copy = structuredClone(this.data),
      position = { ...this.a.player },
      tests = {};
    const originalToast = this.a.toast,
      originalSave = this.save;
    this.a.toast = () => {};
    this.save = () => true;
    try {
      this.data = EvercityStories.blank();
      this.data.progress = { garden: 0, delivery: 0, art: 0, skyline: 0 };
      tests.wrongPersonRejected = !this.advance("talk", "ren");
      tests.firstTalkAdvances =
        this.advance("talk", "hana") && this.data.progress.garden === 1;
      tests.cannotSkipPhoto = !this.advance("talk", "hana");
      this.advance("photo");
      this.advance("talk", "hana");
      tests.rewardPaid = this.data.credits === 60;
      this.advance("talk", "hana");
      tests.noDuplicateReward = this.data.credits === 60;
      this.data.active = "delivery";
      this.advance("talk", "ren");
      tests.parcelTracked = this.data.progress.delivery === 1;
      const s = this.step();
      this.a.player.floor = 0;
      tests.wrongFloorRejected = !this.atGoal(s);
      this.advance("deliver");
      this.advance("talk", "ren");
      tests.deliveryReward = this.data.credits === 200;
      tests.tenStories = this.missions.length === 10;
      tests.sixResidents = this.npcs.length === 6;
    } finally {
      this.data = copy;
      Object.assign(this.a.player, position);
      this.a.toast = originalToast;
      this.save = originalSave;
      this.renderHUD();
    }
    return tests;
  }
};
