"use strict";
// EVERCITY detail plugin: building-services detail inside every lobby and upper floor
// (owner: agent A). Fire-safety kit, exit signage, ceiling services, baseboards, entrance
// mats, umbrella stands and per-floor elevator-hall plates. Contract: .collab/ASSIGNMENTS.md
// All static parts go through the shared primitive batches (api.box/cyl), so the ground
// floors of all 76 buildings add instances, not draw calls. Upper floors are rebuilt in the
// active interior group and re-instanced by game.js (batchActiveInterior).
(() => {
  const stats = { floors: 0, sprinklers: 0, extinguishers: 0, exitSigns: 0, plates: 0 };
  let materialsReady = false;

  function exitTexture(T) {
    // Green running-figure pictogram + EXIT / 非常口, drawn once and shared.
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 96;
    const g = c.getContext("2d");
    g.fillStyle = "#1f9a5c";
    g.fillRect(0, 0, 256, 96);
    g.strokeStyle = "#e9fff1";
    g.lineWidth = 3;
    g.strokeRect(5, 5, 246, 86);
    // Door frame and running figure.
    g.fillStyle = "#e9fff1";
    g.fillRect(16, 16, 46, 64);
    g.fillStyle = "#1f9a5c";
    g.fillRect(22, 22, 34, 58);
    g.fillStyle = "#e9fff1";
    g.beginPath();
    g.arc(86, 26, 7, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 7;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(84, 36);
    g.lineTo(78, 56); // torso
    g.moveTo(78, 56);
    g.lineTo(92, 68);
    g.lineTo(90, 80); // front leg
    g.moveTo(78, 56);
    g.lineTo(66, 66);
    g.lineTo(56, 64); // back leg
    g.moveTo(83, 42);
    g.lineTo(96, 50); // front arm
    g.moveTo(82, 42);
    g.lineTo(70, 44); // back arm
    g.stroke();
    g.font = "bold 30px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("EXIT", 172, 36);
    g.font = "bold 22px sans-serif";
    g.fillText("非常口", 172, 70);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }

  function ensureMaterials(api) {
    if (materialsReady) return;
    materialsReady = true;
    const { THREE: T, mat } = api;
    mat("exitSign", "#ffffff", 0.5, 0, {
      map: exitTexture(T),
      emissive: "#ffffff",
      emissiveMap: null,
      emissiveIntensity: 0.0,
    });
    // Self-lit: use the texture as the emissive map so the sign reads at night.
    api.materials.exitSign.emissiveMap = api.materials.exitSign.map;
    api.materials.exitSign.emissiveIntensity = 0.55;
    mat("ceilingWhite", "#e9e7df", 0.7);
    mat("extinguisher", "#b8322a", 0.35, 0.15);
  }

  // Deterministic per-building jitter (never Math.random: photos must be reproducible).
  const hash = (a, b) => {
    let h = Math.imul(Math.round(a * 13) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.round(b * 7);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  function fireCabinet(api, x, y, z, side) {
    // Recessed extinguisher on a wall bracket, with its red location sign above.
    const { box, cyl, solid } = api;
    const wx = x - side * 0.2; // just off the wall face
    box("dark", x - side * 0.05, y + 0.62, z, 0.04, 0.12, 0.26); // bracket plate
    cyl("extinguisher", wx, y + 0.5, z, 0.085, 0.52);
    api.part("sphere", "extinguisher", wx, y + 0.77, z, 0.085, 0.05, 0.085);
    box("black", wx, y + 0.86, z, 0.05, 0.08, 0.05); // valve
    box("metal", wx, y + 0.9, z + 0.05, 0.03, 0.03, 0.14); // lever
    box("black", wx - side * 0.06, y + 0.55, z + 0.08, 0.02, 0.42, 0.02); // hose
    box("paper", wx, y + 0.45, z - 0.086, 0.11, 0.16, 0.004); // label
    box("extinguisher", x - side * 0.03, y + 1.55, z, 0.03, 0.3, 0.42); // wall sign
    box("paper", x - side * 0.05, y + 1.55, z, 0.01, 0.12, 0.3);
    solid(wx, z, 0.32, 0.36, 1.0);
    stats.extinguishers++;
  }

  function exitSign(api, x, y, z, ry = 0) {
    api.box("dark", x, y, z, 1.02, 0.4, 0.07, ry);
    api.box("exitSign", x, y, z, 0.96, 0.34, 0.085, ry);
    stats.exitSigns++;
  }

  function ceilingServices(api, b, y) {
    // Sprinkler heads and smoke detectors on a 4.2m grid below the slab soffit,
    // plus two linear supply diffusers. Pure decoration: no collision.
    const { box, cyl } = api,
      ceiling = y + api.FLOOR - 0.29;
    for (let u = -b.w / 2 + 3; u <= b.w / 2 - 3; u += 4.2)
      for (let v = -b.d / 2 + 6.5; v <= b.d / 2 - 2; v += 4.2) {
        const x = b.x + u,
          z = b.z + v;
        cyl("ceilingWhite", x, ceiling - 0.015, z, 0.035, 0.03);
        cyl("gold", x, ceiling - 0.05, z, 0.012, 0.05);
        cyl("gold", x, ceiling - 0.078, z, 0.034, 0.006);
        stats.sprinklers++;
      }
    for (const side of [-1, 1]) {
      const x = b.x + side * b.w * 0.16;
      cyl("ceilingWhite", x, ceiling - 0.025, b.z + 2, 0.075, 0.045);
      cyl("mintGlow", x + 0.045, ceiling - 0.05, b.z + 2, 0.008, 0.008);
      box("dark", x, ceiling - 0.01, b.z - 4, 0.18, 0.02, b.d * 0.42);
      for (let n = -3; n <= 3; n++)
        box("ceilingWhite", x, ceiling - 0.022, b.z - 4 + n * b.d * 0.06, 0.22, 0.012, 0.03);
    }
  }

  function baseboards(api, b, y, floor) {
    // Thin skirting where the floor finish meets the side and rear walls.
    const { box } = api,
      h = floor === 0 || b.type !== "residential" ? 0.07 : 0.22,
      top = y + h + 0.1;
    for (const side of [-1, 1])
      box("walnut" in api.materials ? "walnut" : "wood", b.x + side * (b.w / 2 - 0.345), top - 0.06, b.z, 0.025, 0.12, b.d - 0.7);
    box("walnut" in api.materials ? "walnut" : "wood", b.x - b.w / 4 - 1.8, top - 0.06, b.z - b.d / 2 + 0.37, b.w / 2 - 3.9, 0.12, 0.025);
    box("walnut" in api.materials ? "walnut" : "wood", b.x + b.w / 4 + 1.8, top - 0.06, b.z - b.d / 2 + 0.37, b.w / 2 - 3.9, 0.12, 0.025);
  }

  function elevatorHall(api, b, y, floor) {
    const { box, cyl } = api,
      front = b.z - b.d / 2 + 5.17,
      top = floor === b.floors ? null : y;
    if (top === null) return;
    // Hall-position indicator: dark lens bar with lit direction arrows.
    box("black", b.x, y + 4.55, front + 0.03, 1.3, 0.3, 0.05);
    api.part("cone", "mintGlow", b.x - 0.32, y + 4.55, front + 0.07, 0.07, 0.12, 0.02);
    const down = api.part("cone", "previewGlow", b.x + 0.32, y + 4.55, front + 0.07, 0.07, 0.12, 0.02);
    if (down?.isMesh) down.rotation.z = Math.PI;
    for (let n = 0; n < 5; n++)
      box("mintGlow", b.x - 0.1 + n * 0.05, y + 4.55, front + 0.065, 0.025, 0.12, 0.01);
    // Brushed stainless door jambs and a threshold plate.
    for (const s of [-1, 1]) box("stainless" in api.materials ? "stainless" : "metal", b.x + s * 1.95, y + 2.0, front + 0.04, 0.1, 4.0, 0.08);
    box("stainless" in api.materials ? "stainless" : "metal", b.x, y + 4.04, front + 0.04, 4.0, 0.1, 0.08);
    box("metal", b.x, y + 0.13, front + 0.25, 3.8, 0.02, 0.4);
    // Braille plate below the call button (button itself is built by game.js).
    box("gold", b.x + 2.4, y + 1.12, front + 0.04, 0.16, 0.2, 0.012);
    for (let n = 0; n < 6; n++)
      cyl("gold", b.x + 2.36 + (n % 2) * 0.05, y + 1.17 - Math.floor(n / 2) * 0.04, front + 0.05, 0.008, 0.008);
    // Waste bin and a slim bench-side ashtray-free planter beside the core.
    const bx = b.x + 3.1 + hash(b.x, floor) * 0.3;
    cyl("stainless" in api.materials ? "stainless" : "metal", bx + 1.2, y + 0.45, front + 0.55, 0.2, 0.7);
    cyl("black", bx + 1.2, y + 0.81, front + 0.55, 0.21, 0.03);
    api.solid(bx + 1.2, front + 0.55, 0.45, 0.45, 0.85);
  }

  function lobbyEntrance(api, b, y) {
    const { box, cyl, solid } = api,
      zIn = b.z + b.d / 2 - 1.6;
    // Recessed entrance mat with a woven border, flush with the 0.065 finish.
    box("dark", b.x, y + 0.072, zIn, 5.2, 0.016, 2.2);
    box("rug" in api.materials ? "rug" : "fabric", b.x, y + 0.075, zIn, 4.9, 0.016, 1.9);
    for (let n = -11; n <= 11; n++) box("dark", b.x + n * 0.2, y + 0.084, zIn, 0.03, 0.004, 1.7);
    // Umbrella stand and a folded "wet floor" A-frame tucked against the glazing.
    const ux = b.x + 4.4,
      uz = b.z + b.d / 2 - 0.75;
    cyl("stainless" in api.materials ? "stainless" : "metal", ux, y + 0.36, uz, 0.2, 0.62);
    cyl("dark", ux, y + 0.68, uz, 0.21, 0.025);
    const tones = ["navy", "red", "teal", "black"];
    for (let n = 0; n < 3; n++) {
      const a = n * 2.1 + hash(b.x, b.z) * 3;
      box(tones[(n + Math.round(b.x)) & 3], ux + Math.cos(a) * 0.07, y + 0.95, uz + Math.sin(a) * 0.07, 0.035, 0.75, 0.035);
      box("black", ux + Math.cos(a) * 0.07, y + 1.34, uz + Math.sin(a) * 0.07 + 0.05, 0.03, 0.03, 0.12);
    }
    solid(ux, uz, 0.5, 0.5, 1.4);
    // Exit sign above the open entrance, facing in.
    exitSign(api, b.x, y + 4.62, b.z + b.d / 2 - 0.45);
    // A directory board on the side wall listing tenants (simple ruled strips).
    const dx = b.x - b.w / 2 + 0.42;
    box("walnut" in api.materials ? "walnut" : "wood", dx, y + 2.2, b.z + b.d / 2 - 6, 0.06, 1.5, 1.1);
    box("paper", dx + 0.035, y + 2.2, b.z + b.d / 2 - 6, 0.01, 1.32, 0.92);
    for (let n = 0; n < 8; n++)
      box(n === 0 ? "gold" : "dark", dx + 0.042, y + 2.75 - n * 0.15, b.z + b.d / 2 - 6, 0.004, n === 0 ? 0.06 : 0.025, n === 0 ? 0.7 : 0.5 + hash(n, b.x) * 0.3);
  }

  function floorPlate(api, b, floor, y) {
    // Large floor number beside the elevator. Upper floors only: one live canvas sign
    // per loaded floor (a worldSign, so game.js disposes it when the floor unloads).
    if (!api.active() || floor === b.floors) return;
    const name = { office: "OFFICE", cafe: "LOUNGE", gallery: "GALLERY", hotel: "GUEST ROOMS", residential: "RESIDENCES", shop: "STORE" }[b.type] || "";
    const text = `${floor + 1}F   ${floor === b.floors - 1 && b.type !== "residential" ? "SKY LOUNGE" : name}`;
    const front = b.z - b.d / 2 + 5.2;
    const m = api.label(text, b.x - 2.4 - 0.9, y + 2.9, front + 0.02, 1.7, "#e7eee6", "#26363b");
    api.group()?.attach(m);
    stats.plates++;
  }

  (window.EvercityDetails ||= []).push({
    name: "interior",
    owner: "A",
    interior(api, b, floor, theme) {
      ensureMaterials(api);
      const y = api.BASE + floor * api.FLOOR;
      stats.floors++;
      ceilingServices(api, b, y);
      if (floor === 0 || b.type !== "residential") baseboards(api, b, y, floor);
      elevatorHall(api, b, y, floor);
      // Extinguisher on the core's side wall, exit sign over the stair side.
      fireCabinet(api, b.x + 3.3 + 0.24, y, b.z - b.d / 2 + 3.2, -1);
      exitSign(api, b.x - 3.3 - 0.04, y + 4.2, b.z - b.d / 2 + 3.2, Math.PI / 2);
      if (floor === 0) lobbyEntrance(api, b, y);
      floorPlate(api, b, floor, y);
    },
    selfTest(api) {
      const debug = window.evercity?.debug;
      const sample = api.buildings.slice(0, 12);
      return {
        everyLobbyDressed: stats.floors >= api.buildings.length,
        fireSafetyKit: stats.extinguishers >= api.buildings.length && stats.exitSigns >= api.buildings.length * 2,
        ceilingServices: stats.sprinklers > api.buildings.length * 40,
        entranceStillOpen: !debug || sample.every((b) => !debug.blocked(b.x, b.z + b.d / 2 - 1.6) && !debug.blocked(b.x, b.z + b.d / 2 - 4)),
        elevatorApproachOpen: !debug || sample.every((b) => !debug.blocked(b.x, b.z - b.d / 2 + 6.4)),
      };
    },
    snapshot() {
      return { ...stats };
    },
  });
})();
