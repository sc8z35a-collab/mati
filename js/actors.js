"use strict";
// Actor-only appearance: original simulation roots, collision shapes and markers stay intact.
window.EvercityActors = class EvercityActors {
  constructor({ THREE: T, vehicles, people, npcs, storage = null }) {
    Object.assign(this, { T, storage });
    this.cache = new Map();
    this.material = new T.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
    });
    this.mode = "standard";
    this.records = [
      ...vehicles.map((a, i) => this.record(a, "car", i)),
      ...people.map((a, i) => this.record(a, "person", i)),
      ...npcs.map((a, i) => this.record(a, "npc", i)),
    ];
    try {
      this.storage = storage || window.localStorage;
      const saved = this.storage.getItem("evercity-actors-v1");
      if (["standard", "voxel", "voxel-ultra"].includes(saved))
        this.mode = saved;
    } catch (_) {}
  }
  record(actor, kind, index) {
    const originals = actor.g.children.filter(
      (m) => !m.userData.photoMarker && !(actor.brakes || []).includes(m),
    );
    const shirt =
      kind === "car"
        ? originals[0]
        : kind === "npc"
          ? originals[2]
          : originals[0];
    return {
      actor,
      kind,
      index,
      originals,
      color: shirt.material.color.getHex(),
      tier: null,
      model: null,
    };
  }
  setMode(value, persist = true) {
    this.mode = ["standard", "voxel", "voxel-ultra"].includes(value)
      ? value
      : "standard";
    if (persist) {
      try {
        this.storage.setItem("evercity-actors-v1", this.mode);
      } catch (_) {}
    }
  }
  // Rasterize solids once; emit only exposed faces, never a draw call per voxel.
  geometry(boxes, step) {
    const T = this.T,
      cells = new Map(),
      palette = [],
      colors = new Map();
    const key = (x, y, z) => `${x},${y},${z}`;
    for (const [x, y, z, w, h, d, color] of boxes) {
      if (!colors.has(color)) {
        colors.set(color, palette.length);
        palette.push(new T.Color(color));
      }
      const lo = [x - w / 2, y - h / 2, z - d / 2].map((v) =>
        Math.round(v / step),
      );
      const hi = [x + w / 2, y + h / 2, z + d / 2].map((v, i) =>
        Math.max(lo[i] + 1, Math.round(v / step)),
      );
      for (let a = lo[0]; a < hi[0]; a++)
        for (let b = lo[1]; b < hi[1]; b++)
          for (let c = lo[2]; c < hi[2]; c++)
            cells.set(key(a, b, c), [a, b, c, colors.get(color)]);
    }
    const positions = [],
      normals = [],
      rgb = [],
      indices = [];
    // Counter-clockwise winding viewed from outside each cube.
    const faces = [
      [
        [1, 0, 0],
        [
          [1, 0, 1],
          [1, 0, 0],
          [1, 1, 0],
          [1, 1, 1],
        ],
      ],
      [
        [-1, 0, 0],
        [
          [0, 0, 0],
          [0, 0, 1],
          [0, 1, 1],
          [0, 1, 0],
        ],
      ],
      [
        [0, 1, 0],
        [
          [0, 1, 1],
          [1, 1, 1],
          [1, 1, 0],
          [0, 1, 0],
        ],
      ],
      [
        [0, -1, 0],
        [
          [0, 0, 0],
          [1, 0, 0],
          [1, 0, 1],
          [0, 0, 1],
        ],
      ],
      [
        [0, 0, 1],
        [
          [0, 0, 1],
          [1, 0, 1],
          [1, 1, 1],
          [0, 1, 1],
        ],
      ],
      [
        [0, 0, -1],
        [
          [1, 0, 0],
          [0, 0, 0],
          [0, 1, 0],
          [1, 1, 0],
        ],
      ],
    ];
    for (const [x, y, z, id] of cells.values()) {
      const color = palette[id];
      const shade =
        0.94 +
        (((Math.imul(x, 73856093) ^
          Math.imul(y, 19349663) ^
          Math.imul(z, 83492791)) >>>
          0) %
          7) *
          0.01;
      for (const [normal, corners] of faces) {
        if (cells.has(key(x + normal[0], y + normal[1], z + normal[2])))
          continue;
        const base = positions.length / 3;
        for (const [a, b, c] of corners) {
          positions.push((x + a) * step, (y + b) * step, (z + c) * step);
          normals.push(...normal);
          rgb.push(color.r * shade, color.g * shade, color.b * shade);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new T.Float32BufferAttribute(rgb, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData.voxels = cells.size;
    geometry.userData.step = step;
    return geometry;
  }
  template(record, tier) {
    const { kind, color, index, actor } = record;
    const variant = kind === "npc" ? actor.id : kind === "car" ? 0 : index % 5;
    const key = `${kind}:${color}:${variant}:${tier}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const step = (kind === "car" ? [0.16, 0.08, 0.04] : [0.08, 0.04, 0.02])[
      tier
    ];
    const parts = [];
    const part = (name, boxes, position = [0, 0, 0]) =>
      parts.push({ name, geometry: this.geometry(boxes, step), position });
    if (kind === "car") this.car(part, color);
    else this.person(part, color, index, kind === "npc" ? actor.id : null);
    this.cache.set(key, parts);
    return parts;
  }
  car(part, paint) {
    const boxes = [],
      add = (...b) => boxes.push(b);
    const trim = "#35454d",
      glass = "#477489",
      chrome = "#afbec6";
    add(0, 0.56, 0, 1.88, 0.4, 4.16, paint);
    add(0, 0.84, 0, 1.88, 0.24, 3.96, paint);
    add(0, 1.06, -0.2, 1.72, 0.2, 2.64, paint);
    add(0, 1.26, -0.2, 1.6, 0.2, 2.32, glass);
    add(0, 1.44, -0.2, 1.52, 0.16, 2.08, paint);
    for (const s of [-1, 1]) {
      // Pillars, door seams, handles, mirrors and stepped wheel arches.
      for (const z of [-1.28, -0.16, 0.88])
        add(s * 0.81, 1.23, z, 0.08, 0.36, 0.08, paint);
      add(s * 0.86, 1.06, -0.2, 0.04, 0.04, 2.44, chrome);
      add(s * 0.94, 0.68, 0, 0.04, 0.08, 3.96, trim);
      for (const z of [-0.28, 0.88]) {
        add(s * 0.94, 0.85, z, 0.04, 0.24, 0.04, trim);
        add(s * 0.96, 0.95, z - 0.18, 0.04, 0.04, 0.2, chrome);
      }
      add(s * 0.98, 1.14, -0.95, 0.12, 0.12, 0.2, paint);
      for (const z of [-1.4, 1.4]) {
        add(s * 0.94, 0.64, z, 0.08, 0.24, 0.8, trim);
        add(s * 0.94, 0.8, z, 0.08, 0.12, 0.56, trim);
      }
      add(s * 0.64, 0.85, -2.06, 0.48, 0.16, 0.08, "#e5f7ff");
      add(s * 0.84, 0.85, -2.07, 0.08, 0.12, 0.08, "#edb453");
      add(s * 0.64, 0.85, 2.06, 0.48, 0.16, 0.08, "#a32e32");
    }
    for (const z of [-2.08, 2.08]) {
      add(0, 0.53, z, 1.72, 0.12, 0.08, chrome);
      add(0, 0.69, z + Math.sign(z) * 0.02, 0.4, 0.16, 0.04, "#e8e5d6");
      for (const x of [-0.12, -0.04, 0.04, 0.12])
        add(x, 0.69, z + Math.sign(z) * 0.045, 0.04, 0.08, 0.04, trim);
    }
    for (const y of [0.8, 0.88]) add(0, y, -2.09, 0.64, 0.04, 0.04, trim);
    part("body", boxes);
    for (const s of [-1, 1])
      for (const z of [-1.4, 1.4]) {
        const wheel = [];
        // Square cells trace an octagonal tire, with tread, concentric rim and spokes.
        for (let y = -4; y <= 4; y++)
          for (let a = -4; a <= 4; a++) {
            const r = Math.hypot(y, a);
            if (r > 4.4) continue;
            const rim = r < 2.7;
            wheel.push([
              0,
              y * 0.08,
              a * 0.08,
              0.2,
              0.08,
              0.08,
              rim ? chrome : "#20272b",
            ]);
            if (rim)
              wheel.push([
                s * 0.11,
                y * 0.08,
                a * 0.08,
                0.04,
                0.08,
                0.08,
                y === 0 || a === 0 || Math.abs(y) === Math.abs(a)
                  ? chrome
                  : trim,
              ]);
            else if ((y + a) % 2 === 0)
              wheel.push([
                s * 0.11,
                y * 0.08,
                a * 0.08,
                0.04,
                0.06,
                0.06,
                "#30383d",
              ]);
          }
        part("wheel", wheel, [s * 0.98, 0.4, z]);
      }
  }
  person(part, shirt, index, npc) {
    const skin = ["#d4aa88", "#b88362", "#e3bf9f", "#98674f", "#c99473"][
      index % 5
    ];
    const hair = ["#302724", "#554035", "#252c32", "#8a6240", "#42342f"][
      index % 5
    ];
    const trousers = ["#344552", "#4d5050", "#384657", "#554a41", "#334d4b"][
      index % 5
    ];
    const boxes = [],
      add = (...b) => boxes.push(b);
    add(0, 1.15, 0, 0.44, 0.58, 0.28, shirt);
    add(0, 1.39, 0, 0.48, 0.12, 0.28, shirt);
    add(0, 0.86, 0, 0.4, 0.08, 0.28, "#30363b");
    add(0, 0.86, 0.15, 0.08, 0.06, 0.02, "#b8b5a3");
    add(0, 1.5, 0, 0.14, 0.12, 0.16, skin);
    // Stepped jaw / cheeks and pixel-level features, facing +Z like pedestrians.
    add(0, 1.6, 0.01, 0.28, 0.16, 0.28, skin);
    add(0, 1.72, 0, 0.32, 0.16, 0.32, skin);
    add(0, 1.82, -0.02, 0.36, 0.08, 0.32, hair);
    add(0, 1.74, -0.15, 0.32, 0.16, 0.08, hair);
    add(-0.08, 1.78, 0.15, 0.2, 0.06, 0.04, hair);
    for (const s of [-1, 1]) {
      add(s * 0.17, 1.66, 0, 0.04, 0.08, 0.1, skin);
      add(s * 0.075, 1.7, 0.17, 0.06, 0.04, 0.02, "#eee9df");
      add(s * 0.075, 1.7, 0.19, 0.02, 0.04, 0.02, "#27323a");
      add(s * 0.075, 1.75, 0.17, 0.08, 0.02, 0.02, hair);
      add(s * 0.055, 1.4, 0.15, 0.08, 0.08, 0.04, "#d5d8cc");
    }
    add(0, 1.65, 0.18, 0.04, 0.06, 0.04, skin);
    add(0, 1.59, 0.16, 0.08, 0.02, 0.02, "#945f52");
    for (const y of [1.02, 1.14, 1.26])
      add(0, y, 0.15, 0.02, 0.02, 0.02, "#d8d5c5");
    add(0.13, 1.26, 0.15, 0.1, 0.1, 0.02, "#819b9c");
    if (npc === "ren") {
      add(0, 1.08, 0.17, 0.36, 0.5, 0.04, "#c5a77c");
      add(0, 1.02, 0.2, 0.24, 0.12, 0.02, "#9c805e");
    } else if (index % 3 === 1) {
      add(0, 1.17, -0.21, 0.32, 0.4, 0.14, "#906c48");
      for (const s of [-1, 1])
        add(s * 0.16, 1.27, 0.15, 0.04, 0.32, 0.04, "#6b573e");
    }
    part("body", boxes);
    for (const s of [-1, 1]) {
      part(
        "leg",
        [
          [0, -0.34, 0, 0.16, 0.64, 0.2, trousers],
          [0, -0.64, 0.01, 0.16, 0.08, 0.22, "#8f9491"],
          [0, -0.72, 0.06, 0.2, 0.12, 0.32, "#333c42"],
          [0, -0.79, 0.06, 0.2, 0.02, 0.32, "#b7b6ad"],
          [0, -0.65, 0.15, 0.12, 0.02, 0.08, "#d3d0bc"],
        ],
        [s * 0.12, 0.82, 0],
      );
      part(
        "arm",
        [
          [0, -0.1, 0, 0.16, 0.24, 0.22, shirt],
          [0, -0.34, 0, 0.12, 0.24, 0.16, skin],
          [0, -0.48, 0.02, 0.12, 0.12, 0.18, skin],
          [0, -0.4, 0, 0.14, 0.04, 0.18, s < 0 ? "#53656c" : skin],
        ],
        [s * 0.3, 1.4, 0],
      );
    }
  }
  useTier(record, tier) {
    if (record.tier === tier) return;
    const parts = this.template(record, tier);
    if (!record.model) {
      record.model = new this.T.Group();
      record.model.name = "voxel-actor";
      record.actor.g.add(record.model);
      for (const part of parts) {
        const mesh = new this.T.Mesh(part.geometry, this.material);
        mesh.name = part.name;
        mesh.position.fromArray(part.position);
        mesh.receiveShadow = true;
        record.model.add(mesh);
      }
    } else
      parts.forEach((part, i) => {
        record.model.children[i].geometry = part.geometry;
      });
    record.tier = tier;
  }
  update(eye, capture = false) {
    for (const record of this.records) {
      const { actor, kind } = record;
      const active = this.mode !== "standard";
      record.originals.forEach((mesh) => {
        mesh.visible = !active;
      });
      if (!active) {
        if (record.model) record.model.visible = false;
        continue;
      }
      const distance = actor.g.position.distanceTo(eye);
      const near = capture ? 110 : record.tier > 0 ? 36 : 30;
      this.useTier(
        record,
        distance < near ? (this.mode === "voxel-ultra" ? 2 : 1) : 0,
      );
      record.model.visible = true;
      let leg = 0,
        arm = 0,
        wheel = 0;
      for (const mesh of record.model.children) {
        if (mesh.name === "leg")
          mesh.rotation.x = actor.legs?.[leg++]?.rotation.x || 0;
        if (mesh.name === "arm")
          mesh.rotation.x = -(actor.legs?.[arm++]?.rotation.x || 0);
        if (mesh.name === "wheel")
          mesh.rotation.x = actor.wheels?.[wheel++]?.rotation.x || 0;
        if (kind === "npc") mesh.castShadow = distance < 48;
      }
    }
  }
  snapshot() {
    return {
      mode: this.mode,
      cars: this.records.filter((r) => r.kind === "car").length,
      pedestrians: this.records.filter((r) => r.kind === "person").length,
      npcs: this.records.filter((r) => r.kind === "npc").length,
      visible: this.records.filter((r) => r.model?.visible).length,
      detailed: this.records.filter((r) => r.model?.visible && r.tier > 0)
        .length,
      templates: this.cache.size,
      minVoxelMeters:
        this.mode === "voxel-ultra"
          ? 0.02
          : this.mode === "voxel"
            ? 0.04
            : null,
    };
  }
  dispose() {
    for (const record of this.records) {
      if (record.model) record.actor.g.remove(record.model);
      record.originals.forEach((mesh) => {
        mesh.visible = true;
      });
    }
    for (const parts of this.cache.values())
      for (const part of parts) part.geometry.dispose();
    this.cache.clear();
    this.material.dispose();
  }
};
