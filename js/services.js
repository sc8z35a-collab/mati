"use strict";
// Public-safety district. Static voxel parts are instanced by material, per movable group.
// Demonstrations stay on their own forecourts; they do not bypass the city's traffic AI.
class EvercityServices {
  constructor({ THREE: T, scene, obstacle, teleport, toast, renderer }) {
    Object.assign(this, { T, scene, obstacle, teleport, toast, renderer });
    this.time = 0;
    this.paused = false;
    this.overview = false;
    this.selected = 0;
    this.sound = false;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.geo = new T.BoxGeometry(1, 1, 1);
    this.materials = {};
    this.parts = 0;
    this.actors = [];
    this.units = [];
    this.rotors = [];
    this.flags = [];
    this.colliders = [];
    this.beacons = [];
    this.dummy = new T.Object3D();
    const palette = {
      white: "#e7ebdf", concrete: "#a4b3b4", dark: "#26363e", asphalt: "#3c4a50",
      glass: "#639aa7", blue: "#326a99", navy: "#253b5d", red: "#bb4137",
      orange: "#ec773c", yellow: "#eccc64", green: "#687856", olive: "#899478",
      skin: "#dca67e", skin2: "#b77959", black: "#20292c", silver: "#b9c4c1",
      wood: "#876547", leaf: "#69816a", pale: "#d6d9c4", cyan: "#a2e2dd",
    };
    for (const [key, color] of Object.entries(palette))
      this.materials[key] = new T.MeshStandardMaterial({ color, roughness: 0.78 });
    for (const [key, color] of [["redLight", "#ff493c"], ["blueLight", "#42b7ff"], ["lamp", "#fff1b3"]])
      this.materials[key] = new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: key === "lamp" ? 0.7 : 0.2 });
    this.sites = [
      { id: "police", name: "POLICE / PUBLIC SAFETY", jp: "中央警察署", x: -108, z: 396, color: "blue", uniform: "navy", title: "街の平穏を、守る。", info: "パトロールカー・機動隊車両 / 巡回と出動訓練", callsign: "POLICE 01" },
      { id: "ambulance", name: "AMBULANCE / MEDICAL CENTER", jp: "救急医療センター", x: -36, z: 396, color: "cyan", uniform: "white", title: "一秒でも早く、その先へ。", info: "高規格救急車・ドクターカー / 搬送訓練", callsign: "MEDIC 02" },
      { id: "fire", name: "FIRE / RESCUE STATION", jp: "中央消防署", x: 36, z: 396, color: "red", uniform: "orange", title: "日々の備えが、命を守る。", info: "ポンプ車・はしご車 / はしご展開・放水訓練", callsign: "RESCUE 03" },
      { id: "defense", name: "DEFENSE / RELIEF BASE", jp: "自衛隊・災害救援駐屯地", x: 108, z: 396, color: "green", uniform: "green", title: "この街を、支える力。", info: "高機動車・輸送車・ヘリ / 災害派遣訓練", callsign: "RELIEF 04" },
    ];
    this.root = new T.Group();
    scene.add(this.root);
    this.buildRoad();
    this.sites.forEach((site, index) => this.buildSite(site, index));
    this.bindUI();
  }
  group(parent = this.root) {
    const g = new this.T.Group();
    g.userData.voxels = new Map();
    parent.add(g);
    return g;
  }
  voxel(g, key, x, y, z, w, h, d, ry = 0) {
    const bins = g.userData.voxels;
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push([x, y, z, w, h, d, ry]);
    this.parts++;
  }
  bake(g) {
    for (const [key, parts] of g.userData.voxels) {
      const mesh = new this.T.InstancedMesh(this.geo, this.materials[key], parts.length);
      parts.forEach((p, i) => {
        this.dummy.position.set(p[0], p[1], p[2]);
        this.dummy.scale.set(p[3], p[4], p[5]);
        this.dummy.rotation.set(0, p[6], 0);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      g.add(mesh);
    }
    g.userData.voxels.clear();
    return g;
  }
  solid(site, x, z, w, d, h = 8) {
    this.obstacle(site.x + x, site.z + z, w, d, h);
    this.colliders.push({ x: site.x + x, z: site.z + z, w, d });
  }
  text(g, text, x, y, z, width, color = "#f0ead7", bg = "#26363e") {
    const canvas = document.createElement("canvas");
    canvas.width = 1024; canvas.height = 128;
    const c = canvas.getContext("2d");
    c.fillStyle = bg; c.fillRect(0, 0, 1024, 128);
    c.fillStyle = color; c.font = "bold 65px sans-serif";
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, 512, 67, 960);
    const texture = new this.T.CanvasTexture(canvas);
    texture.colorSpace = this.T.SRGBColorSpace;
    const mesh = new this.T.Mesh(new this.T.PlaneGeometry(width, width / 8), new this.T.MeshBasicMaterial({ map: texture, side: this.T.DoubleSide }));
    mesh.position.set(x, y, z); g.add(mesh);
    return mesh;
  }
  buildRoad() {
    const g = this.group(), v = (...p) => this.voxel(g, ...p);
    v("asphalt", 0, -0.04, 389, 320, 0.1, 122);
    for (let x = -150; x <= 150; x += 10) {
      v("yellow", x, 0.025, 436, 4, 0.03, 0.16);
      v("white", x, 0.025, 353, 4, 0.03, 0.16);
    }
    for (let z = 333; z < 447; z += 10)
      for (const x of [-144, -72, 0, 72, 144]) v("white", x, 0.025, z, 0.12, 0.03, 4);
    for (const x of [-144, -72, 0, 72, 144])
      for (let s = -5; s <= 5; s++) v("white", x + s, 0.03, 425, 0.5, 0.03, 3);
    for (let x = -155; x <= 155; x += 31) {
      v("dark", x, 4, 447, 0.23, 8, 0.23);
      v("dark", x, 8, 445.5, 0.25, 0.2, 3);
      v("lamp", x, 7.9, 444.3, 0.7, 0.15, 1.1);
    }
    this.text(g, "EVERCITY / PUBLIC SAFETY DISTRICT", 0, 5.3, 450, 24);
    this.bake(g);
  }
  buildSite(s, index) {
    s.d = 50; s.w = 54; s.special = "PUBLIC SAFETY / " + s.callsign;
    s.service = true; s.elapsed = null;
    const g = this.group(); s.group = g; g.position.set(s.x, 0, s.z);
    const v = (...p) => this.voxel(g, ...p);
    v("concrete", 0, 0.13, 0, 54, 0.26, 54);
    v("pale", 0, 0.27, 12, 50, 0.04, 24);
    // Open-front vehicle bays and a closed upper operations floor.
    v("white", -5, 3.7, -21, 38, 7, 0.7);
    v("white", -24, 3.7, -12, 0.7, 7, 18);
    v("white", 14, 3.7, -12, 0.7, 7, 18);
    this.solid(s, -5, -21, 38, 0.7);
    this.solid(s, -24, -12, 0.7, 18);
    this.solid(s, 14, -12, 0.7, 18);
    v("dark", -5, 7.3, -12, 40, 0.6, 20);
    const upper = index === 3 ? 3.4 : 5.4;
    v(index === 3 ? "olive" : "white", -5, 7.6 + upper / 2, -12, 38, upper, 18);
    v(s.color, -5, 7.8 + upper, -12, 40, 0.45, 20);
    v(s.color, -5, 6.5, -2.7, 39, 1.2, 0.5);
    this.text(g, s.jp, -5, 6.65, -2.42, 15);
    this.text(g, s.callsign + "  /  24H", -5, 10.3, -2.94, 12);
    for (let x = -21; x <= 11; x += 4) {
      v("glass", x, 9.1, -2.94, 2.9, 1.5, 0.1);
      v("dark", x, 9.1, -2.85, 0.12, 1.5, 0.12);
      v("silver", x, 8.28, -2.8, 3.2, 0.16, 0.45);
    }
    for (const x of [-23, -15, -7, 1, 13]) {
      v("concrete", x, 3.1, -3, 0.6, 5.8, 0.7);
      v(s.color, x, 1.2, -2.6, 0.8, 1.6, 0.2);
    }
    // Gear lockers, radio desk, monitors, storage and ceiling lights inside open bays.
    for (let i = 0; i < 8; i++) {
      v(s.color, -21 + i * 3.7, 1.65, -19.8, 1.5, 2.7, 0.9);
      v("silver", -20.5 + i * 3.7, 1.65, -19.28, 0.12, 0.45, 0.08);
      for (let n = 0; n < 3; n++) v("dark", -21 + i * 3.7, 2.35 + n * 0.15, -19.3, 0.85, 0.06, 0.06);
    }
    for (const x of [-18, -10, -2, 7]) {
      v("lamp", x, 6.85, -11, 3.2, 0.1, 0.45);
      v("white", x, 0.3, 1, 0.12, 0.04, 10);
      this.text(g, String(Math.round((x + 26) / 8)).padStart(2, "0"), x + 3, 5.3, -2.6, 2);
    }
    v("wood", 8, 1.2, -15.5, 6, 0.18, 2);
    for (const x of [6.4, 9.4]) {
      v("dark", x, 1.75, -15.6, 1.8, 1, 0.2);
      v("cyan", x, 1.78, -15.46, 1.5, 0.65, 0.04);
      v("dark", x, 0.65, -15.5, 0.2, 1.3, 0.2);
    }
    this.solid(s, 8, -15.5, 6, 2, 1.4);
    for (let n = 0; n < 5; n++) {
      v("silver", -20 + n * 5, 8.1 + upper, -16, 3.5, 0.5, 3);
      v("dark", -20 + n * 5, 8.38 + upper, -16, 2.8, 0.1, 2.3);
    }
    // Perimeter bollards, planted trees, benches and parking markings.
    for (const x of [-25.3, 25.3]) {
      for (let z = -23; z <= 22; z += 3) {
        v("dark", x, 0.95, z, 0.2, 1.5, 0.2);
        v("silver", x, 1.3, z, 0.12, 0.12, 3);
      }
      this.solid(s, x, 0, 0.3, 50, 1.7);
    }
    for (const x of [-21, 21]) {
      v("white", x, 0.65, 23, 3.6, 0.8, 3.6);
      v("wood", x, 2.4, 23, 0.55, 3.3, 0.55);
      for (let j = 0; j < 3; j++) v("leaf", x + (j % 2) * 0.5, 4 + j * 0.7, 23, 3.5 - j * 0.7, 1.2, 3.3 - j * 0.6);
      this.solid(s, x, 23, 3.6, 3.6, 5);
    }
    for (let n = 0; n < 5; n++) {
      v("orange", -23, 0.55, 4 + n * 2, 0.35, 0.65, 0.35);
      v("white", -23, 0.7, 4 + n * 2, 0.39, 0.12, 0.39);
      v("black", -23, 0.28, 4 + n * 2, 0.6, 0.1, 0.6);
    }
    v("silver", 22, 7, -21, 0.17, 13.5, 0.17);
    const flag = this.group(g); flag.position.set(22, 12, -21);
    this.voxel(flag, "white", -1.7, 0, 0, 3.4, 2, 0.07);
    this.voxel(flag, "red", -1.7, 0, 0.05, 0.85, 0.85, 0.08);
    this.bake(flag); this.flags.push(flag);
    if (index === 0) this.policeProps(s, g);
    if (index === 1) this.medicalProps(s, g);
    if (index === 2) this.fireProps(s, g);
    if (index === 3) this.defenseProps(s, g);
    this.bake(g);
    const types = [["patrol", "patrol", "van"], ["ambulance", "ambulance", "doctor"], ["engine", "ladder", "rescue"], ["utility", "truck", "utility"]][index];
    types.forEach((type, i) => {
      const unit = this.vehicle(g, type, s.color);
      unit.group.position.set(-18 + i * 8, 0.28, 0);
      unit.home = unit.group.position.clone(); unit.site = s; unit.primary = i === 0;
      this.units.push(unit);
    });
    // Shutter lifts ahead of dispatch. It stays high enough for walk-in exploration.
    s.gate = this.group(g); s.gate.position.set(-18, 5.8, -2.5);
    for (let i = 0; i < 6; i++) this.voxel(s.gate, "silver", 0, -i * 0.24, 0, 6.3, 0.2, 0.16);
    this.bake(s.gate);
    for (let i = 0; i < 7; i++) this.person(s, i);
  }
  policeProps(s, g) {
    const v = (...p) => this.voxel(g, ...p);
    v("blue", 19, 2, -10, 7, 3.4, 8);
    v("glass", 19, 2.4, -5.93, 5.7, 1.7, 0.08);
    v("white", 19, 3.85, -10, 7.8, 0.3, 8.6);
    this.text(g, "交番 / POLICE", 19, 4.4, -5.8, 6);
    this.solid(s, 19, -10, 7, 8, 4);
    for (let i = 0; i < 3; i++) {
      v("dark", 17 + i * 2, 0.6, 1, 0.28, 1.2, 0.28);
      v("yellow", 17 + i * 2, 1.1, 1, 0.3, 0.16, 0.3);
    }
    v("blue", 20, 1.5, 6, 2, 2.5, 1.4);
    this.text(g, "110", 20, 1.65, 6.73, 1.8);
  }
  medicalProps(s, g) {
    const v = (...p) => this.voxel(g, ...p);
    v("white", 19, 3, -11, 8, 5.5, 14);
    v("glass", 19, 2.1, -3.94, 6, 3.3, 0.1);
    v("red", 19, 5.7, -3.85, 2.7, 0.65, 0.15);
    v("red", 19, 5.7, -3.83, 0.65, 2.7, 0.15);
    this.solid(s, 19, -11, 8, 14, 6);
    this.text(g, "救急 / EMERGENCY", 19, 3.8, -3.8, 7);
    for (const z of [3, 8]) {
      v("silver", 19, 0.8, z, 1.2, 0.14, 2.8);
      v("cyan", 19, 1.05, z, 1.1, 0.4, 2.7);
      v("white", 19, 1.3, z - 0.8, 1, 0.2, 0.65);
      for (const x of [18.5, 19.5]) for (const dz of [-1, 1]) {
        v("silver", x, 0.6, z + dz, 0.1, 0.7, 0.1);
        v("black", x, 0.37, z + dz, 0.2, 0.25, 0.25);
      }
      this.solid(s, 19, z, 1.2, 2.8, 1.3);
    }
  }
  fireProps(s, g) {
    const v = (...p) => this.voxel(g, ...p);
    v("concrete", 20, 7.7, -13, 7, 15, 8);
    this.solid(s, 20, -13, 7, 8, 15);
    for (let y = 3; y < 15; y += 3) {
      v("dark", 20, y, -8.94, 3, 1.9, 0.1);
      v("red", 20, y - 1.1, -8.6, 7.4, 0.22, 0.8);
    }
    this.text(g, "訓練塔", 20, 15.2, -8.7, 6);
    v("red", 23, 0.9, 6, 0.6, 1.3, 0.6);
    v("silver", 23, 1.2, 6, 1.2, 0.22, 0.3);
    // A stepped hose physically connects the hydrant to the training monitor.
    v("yellow", 21.5, 0.42, 6, 3, 0.22, 0.22);
    v("yellow", 20, 0.42, 5, 0.22, 0.22, 2);
    v("dark", 20, 0.5, 4.5, 1.3, 0.35, 1.3);
    v("silver", 20, 1.05, 4.5, 0.3, 1.1, 0.3);
    v("silver", 20, 1.6, 4.25, 0.36, 0.3, 0.8);
    v("black", 20, 1.6, 3.92, 0.42, 0.36, 0.16);
    this.solid(s, 20, 4.5, 1.3, 1.3, 1.8);
    // Deterministic cube droplets form a parabolic training water jet.
    s.water = new this.T.InstancedMesh(this.geo, this.materials.cyan, 70);
    s.water.instanceMatrix.setUsage(this.T.DynamicDrawUsage);
    s.water.frustumCulled = false; s.water.visible = false;
    g.add(s.water);
    v("yellow", 20, 0.3, -5, 6, 0.04, 0.2);
  }
  defenseProps(s, g) {
    const v = (...p) => this.voxel(g, ...p);
    v("dark", 17, 0.32, 10, 14, 0.12, 14);
    for (const x of [13.8, 20.2]) v("white", x, 0.4, 10, 0.6, 0.03, 6);
    v("white", 17, 0.4, 10, 6.4, 0.03, 0.6);
    for (const x of [10.5, 23.5]) for (const z of [3.5, 16.5]) v("lamp", x, 0.45, z, 0.35, 0.12, 0.35);
    for (let j = 0; j < 3; j++) for (let n = 0; n < 4 - j; n++) v("wood", 18 + n * 1.3, 0.8 + j * 1.1, -7, 1.15, 1, 1.5);
    this.solid(s, 20, -7, 6, 2, 3);
    const heli = this.group(g); heli.position.set(17, 0.45, 10); s.heli = heli;
    const h = (...p) => this.voxel(heli, ...p);
    h("green", 0, 2, 0, 2.5, 2.1, 5.4);
    h("olive", 0, 2.1, 2.9, 2.1, 1.6, 1.1);
    h("glass", 0, 2.45, 3.49, 1.9, 1.1, 0.08);
    for (const x of [-1.28, 1.28]) {
      h("glass", x, 2.4, 1.4, 0.08, 1.1, 2.7);
      h("dark", x, 0.6, 0.5, 0.16, 0.2, 6.5);
      for (const z of [-1, 2]) h("silver", x, 1, z, 0.15, 1, 0.15);
      h("white", x * 1.02, 2.1, -0.9, 0.08, 0.75, 0.85);
      h("red", x * 1.05, 2.1, -0.9, 0.08, 0.4, 0.4);
    }
    h("green", 0, 2.4, -4.4, 0.75, 0.7, 4.3);
    h("olive", 0, 3.5, -6.1, 0.4, 2.4, 1.3);
    h("olive", 0, 2.6, -5, 3.5, 0.17, 0.75);
    h("dark", 0, 3.4, 0, 0.2, 1.2, 0.2);
    const rotor = this.group(heli); rotor.position.y = 4;
    this.voxel(rotor, "black", 0, 0, 0, 12, 0.12, 0.3);
    this.voxel(rotor, "black", 0, 0.03, 0, 0.3, 0.12, 12);
    this.bake(rotor); this.rotors.push({ rotor, site: s });
    const tail = this.group(heli); tail.position.set(0.5, 3.5, -6.1);
    this.voxel(tail, "black", 0, 0, 0, 0.1, 2.4, 0.16);
    this.voxel(tail, "black", 0, 0, 0, 0.1, 0.16, 2.4);
    this.bake(tail); this.rotors.push({ rotor: tail, site: s, tail: true });
    this.bake(heli);
    s.dust = new this.T.InstancedMesh(this.geo, this.materials.pale, 32);
    s.dust.instanceMatrix.setUsage(this.T.DynamicDrawUsage); s.dust.frustumCulled = false;
    s.dust.visible = false; g.add(s.dust);
  }
  vehicle(parent, type, color) {
    const g = this.group(parent), v = (...p) => this.voxel(g, ...p);
    const big = ["van", "ambulance", "engine", "ladder", "rescue", "truck"].includes(type);
    const army = ["utility", "truck"].includes(type);
    const medical = ["ambulance", "doctor"].includes(type);
    const police = ["patrol", "van"].includes(type);
    const body = army ? "green" : medical || police ? "white" : "red";
    const length = big ? 6.6 : 4.8, height = big ? 2.7 : 1.9;
    v("dark", 0, 0.7, 0, 2.45, 0.45, length);
    v(body, 0, 1.25, 0, 2.4, 0.8, length - 0.1);
    v(body, 0, 2, big ? -0.2 : -0.3, 2.25, big ? 1.7 : 0.8, big ? 5.7 : 2.7);
    v("glass", 0, 2, big ? 2.69 : 1.08, 2, 0.85, 0.08);
    v(body, 0, height + 0.3, big ? -0.2 : -0.3, 2.35, 0.16, big ? 5.8 : 2.9);
    v(police ? "black" : medical ? "red" : "olive", 0, 1.3, 0, 2.47, 0.3, length - 0.25);
    v("silver", 0, 0.8, length / 2 + 0.05, 2.6, 0.25, 0.2);
    v("black", 0, 1.13, length / 2 + 0.07, 1.1, 0.3, 0.1);
    v("white", 0, 0.8, length / 2 + 0.18, 0.7, 0.17, 0.05);
    for (const side of [-1, 1]) {
      v("glass", side * 1.15, 2.02, big ? 1.7 : -0.2, 0.06, 0.7, big ? 1.5 : 2.3);
      v("silver", side * 1.25, 1.58, 0.7, 0.06, 0.12, 0.38);
      v("dark", side * 1.4, 1.85, big ? 2.2 : 0.9, 0.35, 0.28, 0.22);
      v("lamp", side * 0.85, 1.2, length / 2 + 0.08, 0.45, 0.3, 0.12);
      v("redLight", side * 0.85, 1.2, -length / 2 - 0.03, 0.4, 0.25, 0.1);
      if (medical) {
        v("red", side * 1.23, 2.2, -1.3, 0.06, 0.8, 0.24);
        v("red", side * 1.24, 2.2, -1.3, 0.06, 0.24, 0.8);
      }
      if (big && !medical && !army && !police)
        for (let n = 0; n < 3; n++) {
          v("silver", side * 1.23, 2, -0.4 - n * 0.8, 0.08, 1.1, 0.7);
          for (let j = 0; j < 4; j++) v("dark", side * 1.29, 1.65 + j * 0.2, -0.4 - n * 0.8, 0.03, 0.03, 0.65);
        }
      if (army) for (let n = 0; n < 8; n++) v(n % 2 ? "olive" : "dark", side * 1.24, 1.5 + n % 3 * 0.3, -2 + n * 0.5, 0.05, 0.3, 0.7);
    }
    if (type === "truck") {
      v("olive", 0, 2.7, -1.2, 2.5, 1.1, 3.7);
      for (let n = 0; n < 5; n++) v("dark", 0, 3.27, -2.6 + n * 0.7, 2.5, 0.08, 0.1);
    }
    if (type === "engine") {
      v("yellow", 0, 2.97, -1.5, 1.5, 0.24, 2.2);
      for (let n = 0; n < 8; n++) v("dark", -0.65 + n * 0.18, 3.11, -1.5, 0.08, 0.12, 2);
    }
    const wheels = [];
    for (const side of [-1, 1]) for (const z of [-length * 0.31, length * 0.31]) {
      const wheel = this.group(g); wheel.position.set(side * 1.25, 0.65, z);
      this.voxel(wheel, "black", 0, 0, 0, 0.3, 0.92, 0.72);
      this.voxel(wheel, "black", 0, 0, 0, 0.31, 0.72, 0.92);
      this.voxel(wheel, "silver", side * 0.18, 0, 0, 0.08, 0.42, 0.42);
      this.voxel(wheel, "dark", side * 0.23, 0, 0, 0.04, 0.16, 0.16);
      this.bake(wheel); wheels.push(wheel);
    }
    let ladder = null;
    if (type === "ladder") {
      ladder = this.group(g); ladder.position.set(0, 3.1, -1.8);
      for (const x of [-0.65, 0.65]) this.voxel(ladder, "silver", x, 0, 2, 0.13, 0.18, 7.5);
      for (let z = -1.5; z <= 5.5; z += 0.4) this.voxel(ladder, "silver", 0, 0, z, 1.4, 0.13, 0.1);
      this.voxel(ladder, "white", 0, 0.4, 5.8, 1.8, 0.8, 1.2);
      this.bake(ladder);
    }
    const lights = this.group(g); lights.position.set(0, height + 0.48, 1);
    this.voxel(lights, "redLight", -0.62, 0, 0, 0.75, 0.25, 0.42);
    this.voxel(lights, police ? "blueLight" : "redLight", 0.62, 0, 0, 0.75, 0.25, 0.42);
    this.bake(lights); this.beacons.push(lights);
    if (!army) this.text(g, medical ? "救急" : police ? "POLICE" : "消防", 0, 1.6, length / 2 + 0.12, 1.6);
    this.bake(g);
    return { group: g, wheels, ladder, lights, type, length };
  }
  person(s, i) {
    const g = this.group(s.group), uniform = s.uniform;
    const x = i < 3 ? -20 + i * 7 : s.id === "defense" ? (i % 2 ? 22.8 : 7.5) : 16 + (i % 2) * 5;
    const z = i < 3 ? -10 : 2 + (i - 3) * 4;
    g.position.set(x, 0.29, z);
    const v = (...p) => this.voxel(g, ...p);
    v(uniform, 0, 1.13, 0, 0.56, 0.63, 0.32);
    v("black", 0, 0.87, 0, 0.59, 0.09, 0.35);
    v("silver", 0, 0.87, 0.19, 0.12, 0.08, 0.04);
    v(i % 3 ? "skin" : "skin2", 0, 1.65, 0, 0.4, 0.43, 0.38);
    v(s.id === "ambulance" ? "cyan" : uniform, 0, 1.91, 0, 0.47, 0.14, 0.44);
    v(s.id === "fire" ? "yellow" : uniform, 0, 1.87, 0.22, 0.48, 0.08, 0.15);
    for (const side of [-1, 1]) {
      v("black", side * 0.09, 1.68, 0.2, 0.045, 0.05, 0.025);
      v(s.id === "fire" ? "yellow" : "silver", side * 0.15, 1.23, 0.18, 0.13, 0.12, 0.04);
    }
    v("dark", -0.24, 1.43, 0.18, 0.13, 0.25, 0.1); // radio
    v("black", -0.24, 1.64, 0.17, 0.035, 0.2, 0.035);
    if (s.id === "fire") {
      v("yellow", 0, 1.08, 0.18, 0.56, 0.1, 0.04);
      v("yellow", 0, 1.25, -0.28, 0.4, 0.65, 0.25); // breathing apparatus
    }
    if (s.id === "defense") {
      v("olive", 0, 1.16, 0.2, 0.48, 0.4, 0.08);
      for (const side of [-1, 1]) v("dark", side * 0.15, 1.12, 0.26, 0.17, 0.19, 0.07);
    }
    const limbs = [];
    for (let n = 0; n < 4; n++) {
      const arm = n < 2, side = n % 2 ? 1 : -1;
      const limb = this.group(g); limb.position.set(side * (arm ? 0.39 : 0.16), arm ? 1.4 : 0.85, 0);
      this.voxel(limb, arm ? uniform : s.id === "ambulance" ? "navy" : uniform, 0, -0.27, 0, arm ? 0.19 : 0.23, 0.5, 0.24);
      this.voxel(limb, arm ? "skin" : "black", 0, -0.56, arm ? 0 : 0.07, arm ? 0.18 : 0.26, 0.19, arm ? 0.23 : 0.36);
      this.bake(limb); limbs.push(limb);
    }
    this.bake(g);
    this.actors.push({ group: g, limbs, site: s, home: g.position.clone(), phase: i * 1.3, walking: i === 4 || i === 6, salute: i === 3 });
  }
  bindUI() {
    this.panel = document.getElementById("service-panel");
    const open = document.getElementById("service-button");
    open.onclick = () => {
      this.panel.hidden = !this.panel.hidden;
      open.setAttribute("aria-expanded", String(!this.panel.hidden));
      if (!this.panel.hidden) { document.exitPointerLock?.(); this.renderUI(); }
    };
    document.getElementById("service-close").onclick = () => { this.panel.hidden = true; open.setAttribute("aria-expanded", "false"); open.focus(); };
    document.querySelectorAll("[data-service]").forEach(button => {
      button.onclick = () => this.visit(Number(button.dataset.service), this.overview);
    });
    document.getElementById("service-visit").onclick = () => this.visit(this.selected, false);
    document.getElementById("service-overview").onclick = () => this.visit(this.selected, !this.overview);
    document.getElementById("service-dispatch").onclick = () => this.dispatch(this.selected);
    document.getElementById("service-pause").onclick = () => { this.paused = !this.paused; this.renderUI(); };
    document.getElementById("service-sound").onclick = () => {
      try {
        if (!this.audio) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          this.audio = new AudioContext(); this.gain = this.audio.createGain();
          this.gain.gain.value = 0; this.gain.connect(this.audio.destination);
          this.oscillator = this.audio.createOscillator(); this.oscillator.type = "sine";
          this.oscillator.connect(this.gain); this.oscillator.start();
        }
        this.audio.resume().catch(() => this.toast("音声を再生できませんでした"));
        this.sound = !this.sound; this.renderUI();
      } catch { this.toast("このブラウザーでは音声を利用できません"); }
    };
    document.addEventListener("visibilitychange", () => { if (document.hidden && this.gain) this.gain.gain.value = 0; });
    document.addEventListener("keydown", e => {
      if (e.code === "Escape" && this.overview) { this.overview = false; this.renderUI(); }
    });
    this.renderUI();
  }
  visit(index, overview = false) {
    this.selected = index;
    this.overview = false;
    this.teleport(this.sites[index]);
    this.overview = overview;
    this.viewTime = 0;
    this.panel.hidden = false;
    document.getElementById("service-button").setAttribute("aria-expanded", "true");
    document.exitPointerLock?.(); this.renderUI();
  }
  dispatch(index) {
    const site = this.sites[index];
    if (site.elapsed !== null) return false;
    site.elapsed = 0; this.paused = false;
    this.toast(site.jp + "：28秒の敷地内出動訓練を開始します");
    this.renderUI(); return true;
  }
  renderUI() {
    const s = this.sites[this.selected], active = s.elapsed !== null;
    this.panel.style.setProperty("--service-accent", { police: "#81b8e9", ambulance: "#a2e2dd", fire: "#ee9b7f", defense: "#bfd1a3" }[s.id]);
    document.getElementById("service-name").textContent = s.jp;
    document.getElementById("service-tag").textContent = s.callsign;
    document.getElementById("service-title").textContent = s.title;
    document.getElementById("service-info").textContent = s.info;
    document.querySelectorAll("[data-service]").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.service) === this.selected)));
    const dispatch = document.getElementById("service-dispatch");
    dispatch.disabled = active; dispatch.textContent = active ? "出動訓練中" : "出動デモを開始  →";
    document.getElementById("service-overview").textContent = this.overview ? "地上視点に戻る" : "俯瞰で眺める";
    document.getElementById("service-pause").textContent = this.paused ? "演出を再開" : "演出を一時停止";
    document.getElementById("service-pause").setAttribute("aria-pressed", String(this.paused));
    document.getElementById("service-sound").textContent = "サイレン " + (this.sound ? "ON" : "OFF");
    document.getElementById("service-sound").setAttribute("aria-pressed", String(this.sound));
    this.statusUI();
  }
  statusUI() {
    const s = this.sites[this.selected], t = s.elapsed;
    const status = t === null ? "待機中 / READY" : t < 3 ? "車庫開放 / STANDBY" : t < 19 ? "敷地内訓練 / ACTIVE" : "帰投・格納 / RETURN";
    document.getElementById("service-status").textContent = this.paused ? "演出停止中 / PAUSED" : status;
    document.getElementById("service-progress").style.width = t === null ? "0%" : Math.min(100, t / 28 * 100) + "%";
  }
  update(dt, player, camera, suspended = false) {
    const delta = this.paused || suspended ? 0 : dt;
    this.time += delta;
    const near = player.z > 285;
    this.root.visible = near || this.overview;
    this.sites.forEach(s => {
      s.group.visible = this.overview ? s === this.sites[this.selected] || Math.abs(s.x - this.sites[this.selected].x) < 80 : Math.hypot(player.x - s.x, player.z - s.z) < 200;
      if (s.elapsed !== null) {
        s.elapsed += delta;
        if (s.elapsed >= 28) { s.elapsed = null; this.renderUI(); }
      }
      const t = s.elapsed, active = t !== null;
      s.gate.position.y = 5.8 + (active ? Math.min(t / 3, (28 - t) / 3, 1) * 1.4 : 0);
      if (s.heli) {
        const flight = active ? Math.max(0, Math.min((t - 4) / 6, (26 - t) / 6, 1)) : 0;
        s.heli.position.y = 0.45 + flight * 18;
        s.heli.position.x = 17 + Math.sin((t || 0) * 0.25) * flight * 3;
        s.heli.rotation.z = active ? Math.sin(t * 0.6) * flight * 0.045 : 0;
        s.dust.visible = active && flight < 0.8 && t > 3 && t < 27;
        if (s.dust.visible) for (let i = 0; i < 32; i++) {
          const a = i * 2.4 + this.time, r = 1 + ((i / 32 + this.time * 0.4) % 1) * 6;
          this.dummy.position.set(17 + Math.cos(a) * r, 0.6 + Math.sin(i) ** 2 * 0.5, 10 + Math.sin(a) * r);
          this.dummy.rotation.set(0, a, 0); this.dummy.scale.set(0.3, 0.12, 0.3); this.dummy.updateMatrix();
          s.dust.setMatrixAt(i, this.dummy.matrix);
        }
        s.dust.instanceMatrix.needsUpdate = true;
      }
      if (s.water) {
        s.water.visible = active && t > 5 && t < 23;
        if (s.water.visible) for (let i = 0; i < 70; i++) {
          const q = (i / 70 + this.time * 0.7) % 1;
          this.dummy.position.set(20 + Math.sin(i * 2.7) * q * 0.24, 1.6 + 22 * q - 12 * q * q, 4 - 13 * q);
          this.dummy.rotation.set(q, q, 0); this.dummy.scale.setScalar(0.09 + q * 0.12); this.dummy.updateMatrix();
          s.water.setMatrixAt(i, this.dummy.matrix);
        }
        s.water.instanceMatrix.needsUpdate = true;
      }
    });
    for (const unit of this.units) {
      const t = unit.site.elapsed;
      unit.group.position.copy(unit.home); unit.group.rotation.y = 0;
      if (unit.primary && t !== null && t > 3 && t < 25) {
        // A rounded circuit on the empty central forecourt, not public traffic lanes.
        const q = (t - 3) / 22, a = q * Math.PI * 2;
        unit.group.position.x += 12 * (1 - Math.cos(a));
        unit.group.position.z += 10 * Math.sin(a) + 13 * Math.sin(Math.PI * q);
        unit.group.rotation.y = Math.atan2(24 * Math.PI * Math.sin(a), 20 * Math.PI * Math.cos(a) + 13 * Math.PI * Math.cos(Math.PI * q));
        unit.wheels.forEach(w => { w.rotation.x -= delta * 5; });
      }
      unit.lights.visible = t === null || Math.sin(this.time * (this.reducedMotion ? 2 : 9)) > -0.1;
      if (unit.ladder) unit.ladder.rotation.x = t !== null ? -Math.max(0, Math.min((t - 3) / 5, (26 - t) / 5, 1)) * 0.95 : 0;
    }
    for (const a of this.actors) {
      if (!a.site.group.visible) continue;
      const t = this.time + a.phase, walk = a.walking && !this.reducedMotion;
      a.group.position.copy(a.home);
      if (walk) { a.group.position.z += Math.sin(t * 0.4) * 1.7; a.group.rotation.y = Math.cos(t * 0.4) < 0 ? Math.PI : 0; }
      a.limbs.forEach((limb, i) => { limb.rotation.x = walk ? Math.sin(t * 4 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.4 : 0; });
      if (a.salute) { a.limbs[1].rotation.x = -1.9; a.limbs[1].rotation.z = -0.3 + Math.sin(t * 1.5) * 0.04; }
    }
    this.rotors.forEach(({ rotor, site, tail }) => { rotor.rotation[tail ? "x" : "y"] += delta * (site.elapsed !== null ? 32 : 1.8) * (this.reducedMotion ? 0.2 : 1); });
    this.flags.forEach((flag, i) => { flag.rotation.y = Math.sin(this.time * 1.6 + i) * 0.16; flag.rotation.z = Math.sin(this.time * 2 + i) * 0.035; });
    const anyActive = this.sites.some(s => s.elapsed !== null);
    this.materials.redLight.emissiveIntensity = anyActive ? 1.8 : 0.2;
    this.materials.blueLight.emissiveIntensity = anyActive ? 1.8 : 0.2;
    if (this.gain) {
      const audible = this.sound && !suspended && !this.paused && this.sites.some(s => s.elapsed !== null && Math.hypot(player.x - s.x, player.z - s.z) < 95);
      this.gain.gain.setTargetAtTime(audible ? 0.025 : 0, this.audio.currentTime, 0.1);
      this.oscillator.frequency.setTargetAtTime(650 + 220 * Math.sin(this.time * 4), this.audio.currentTime, 0.05);
    }
    if (near && anyActive && Math.floor(this.time * 3) !== this.shadowTick) {
      this.shadowTick = Math.floor(this.time * 3); this.renderer.shadowMap.needsUpdate = true;
    }
    if (!this.panel.hidden) this.statusUI();
    if (this.overview) {
      this.viewTime += delta;
      const s = this.sites[this.selected], angle = this.reducedMotion ? 0.55 : 0.55 + Math.sin(this.viewTime * 0.08) * 0.25;
      camera.position.set(s.x + Math.sin(angle) * 68, 44, s.z + Math.cos(angle) * 68);
      camera.lookAt(s.x - 3, 3.5, s.z - 2);
    }
  }
  blocked(x, z) {
    // Visible units, including moving demonstration vehicles, remain solid.
    return this.units.some(u => {
      const dx = x - u.site.x - u.group.position.x, dz = z - u.site.z - u.group.position.z;
      const angle = u.group.rotation.y, c = Math.cos(angle), s = Math.sin(angle);
      return Math.abs(dx * c - dz * s) < 1.65 && Math.abs(dx * s + dz * c) < u.length / 2 + 0.35;
    });
  }
  drawMap(ctx, px, pz, scale) {
    this.sites.forEach((s, i) => {
      ctx.fillStyle = ["#81b8e9", "#a2e2dd", "#ee9b7f", "#bfd1a3"][i];
      ctx.fillRect(px(s.x - 26), pz(s.z - 25), 52 * scale, 50 * scale);
      ctx.fillStyle = "#10292b"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(["警", "救", "消", "自"][i], px(s.x), pz(s.z) + 4);
    });
  }
  snapshot() {
    return {
      bases: this.sites.length, vehicles: this.units.length + 1, people: this.actors.length,
      voxelParts: this.parts, paused: this.paused, overview: this.overview,
      sites: this.sites.map(s => ({ id: s.id, x: s.x, z: s.z, elapsed: s.elapsed, gate: s.gate.position.y, helicopterHeight: s.heli?.position.y ?? null, water: s.water?.visible ?? false })),
    };
  }
}
window.EvercityServices = EvercityServices;
