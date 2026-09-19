"use strict";
// Deterministic, instanced exterior detail. No external textures or per-frame allocations.
window.EvercityExterior = class EvercityExterior {
  constructor({ THREE: T, scene, renderer, materials, obstacle, sun }) {
    Object.assign(this, { T, scene, renderer, materials, obstacle, sun });
    this.seed = 482731;
    this.batches = new Map();
    this.roughnessMaps = new WeakMap();
    this.meshes = [];
    this.counts = {};
    this.elapsed = 1;
    this.objects = {};
    this.placements = [];
    this.objectComponents = 0;
    this.quality = matchMedia("(pointer:coarse)").matches ? "balanced" : "high";
    try {
      const saved = localStorage.getItem("evercity-quality-v1");
      if (["balanced", "high", "ultra", "hdr-ultra"].includes(saved))
        this.quality = saved;
    } catch (e) {}
    this.dummy = new T.Object3D();
    this.color = new T.Color();
    this.geometry = {
      box: new T.BoxGeometry(1, 1, 1),
      cylinder: new T.CylinderGeometry(1, 1, 1, 12),
      sphere: new T.IcosahedronGeometry(1, 1),
      leaf: new T.PlaneGeometry(1, 1),
      ring: new T.TorusGeometry(1, 0.065, 6, 20),
    };
    this.makeMaterials();
    this.makeReflection();
  }
  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  pick(a) {
    return a[Math.floor(this.random() * a.length)];
  }
  canvas(size = 512) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    return c;
  }
  texture(c) {
    const t = new this.T.CanvasTexture(c);
    t.colorSpace = this.T.SRGBColorSpace;
    t.wrapS = t.wrapT = this.T.RepeatWrapping;
    t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  surface(kind) {
    const c = this.canvas(1024),
      ctx = c.getContext("2d");
    ctx.scale(2, 2);
    ctx.fillStyle = kind === "asphalt" ? "#b1b3b4" : "#dedbd4";
    ctx.fillRect(0, 0, 512, 512);
    // Fine aggregate remains visible close up, with mipmaps preventing distant shimmer.
    for (let i = 0; i < 24000; i++) {
      const v = 100 + Math.floor(this.random() * 145);
      ctx.fillStyle = `rgba(${v},${v},${v},${kind === "asphalt" ? 0.27 : 0.12})`;
      const s = this.random() * 2 + 0.4;
      ctx.fillRect(this.random() * 512, this.random() * 512, s, s);
    }
    if (kind === "pavers" || kind === "brick") {
      const h = kind === "brick" ? 64 : 128,
        w = kind === "brick" ? 128 : 256;
      for (let row = 0; row < 512 / h; row++)
        for (let col = -1; col < 512 / w + 1; col++) {
          const x = col * w + ((row % 2) * w) / 2,
            y = row * h;
          ctx.fillStyle = `rgba(90,78,66,${0.02 + this.random() * 0.08})`;
          ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
          ctx.strokeStyle = "rgba(61,63,61,.28)";
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, w, h);
          ctx.strokeStyle = "rgba(255,255,245,.30)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
        }
    } else if (kind === "stone") {
      ctx.strokeStyle = "rgba(76,76,70,.2)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, 510, 510);
      for (let i = 0; i < 50; i++) {
        ctx.strokeStyle = "rgba(130,127,119,.08)";
        ctx.beginPath();
        const y = this.random() * 512;
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(140, y - 10, 300, y + 20, 512, y + 5);
        ctx.stroke();
      }
    } else if (kind === "plaster") {
      for (let i = 0; i < 160; i++) {
        const x = this.random() * 512,
          y = this.random() * 512;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 32);
        g.addColorStop(0, "rgba(116,109,90,.045)");
        g.addColorStop(1, "rgba(116,109,90,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - 32, y - 32, 64, 64);
      }
    } else if (kind === "grass") {
      for (let i = 0; i < 14000; i++) {
        const x = this.random() * 512,
          y = this.random() * 512;
        ctx.strokeStyle = this.pick([
          "#c1c9a5",
          "#9daa85",
          "#dde0bb",
          "#7c906e",
        ]);
        ctx.lineWidth = 0.7 + this.random();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + this.random() * 5 - 2.5, y - 2 - this.random() * 7);
        ctx.stroke();
      }
    } else if (kind === "metal") {
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = `rgba(65,73,70,${this.random() * 0.12})`;
        ctx.fillRect(
          this.random() * 512,
          this.random() * 512,
          8 + this.random() * 60,
          0.6,
        );
      }
    } else if (kind === "canvas") {
      // Fine warp/weft stays in physical scale; mipmaps soften it in the distance.
      for (let n = 0; n < 512; n += 4) {
        ctx.fillStyle = "rgba(83,76,59,.12)";
        ctx.fillRect(n, 0, 1, 512);
        ctx.fillStyle = "rgba(255,255,245,.22)";
        ctx.fillRect(0, n, 512, 1);
      }
    } else if (kind === "asphalt") {
      // Small repaired fissures, not a high-contrast tiled crack grid.
      for (let i = 0; i < 4; i++) {
        let x = 50 + this.random() * 320,
          y = 50 + this.random() * 320;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let n = 0; n < 6; n++) {
          x += this.random() * 22 - 11;
          y += this.random() * 18;
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(38,44,43,.23)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    } else if (kind === "wood") {
      for (let i = 0; i < 280; i++) {
        ctx.strokeStyle = `rgba(78,59,35,${this.random() * 0.18})`;
        ctx.beginPath();
        const x = this.random() * 512;
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + 12, 160, x - 10, 300, x + 3, 512);
        ctx.stroke();
      }
    }
    if (kind === "stone" || kind === "brick") {
      for (let i = 0; i < 18; i++) {
        const x = this.random() * 512,
          y = this.random() * 512,
          w = 2 + this.random() * 7,
          h = 12 + this.random() * 75;
        const g = ctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, "rgba(55,65,58,.055)");
        g.addColorStop(1, "rgba(55,65,58,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
      }
    }
    return this.texture(c);
  }
  worldTexture(material, texture, meters, bump = 0.035) {
    material.map = texture;
    material.bumpMap = texture;
    material.bumpScale = bump;
    // Separate linear data texture: albedo stays sRGB, roughness must not be decoded.
    if (!this.roughnessMaps.has(texture)) {
      const roughness = texture.clone();
      roughness.colorSpace = this.T.NoColorSpace;
      roughness.needsUpdate = true;
      this.roughnessMaps.set(texture, roughness);
    }
    material.roughnessMap = this.roughnessMaps.get(texture);
    // Planar UVs in world meters prevent giant stretched road/building textures.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vec4 detailWorld = vec4(position, 1.0);
        vec3 detailNormal = normal;
        #ifdef USE_INSTANCING
          detailWorld = instanceMatrix * detailWorld;
          detailNormal = mat3(instanceMatrix) * detailNormal;
        #endif
        detailWorld = modelMatrix * detailWorld;
        detailNormal = abs(normalize(mat3(modelMatrix) * detailNormal));
        vec2 detailUv = detailNormal.y > .5 ? detailWorld.xz : (detailNormal.x > .5 ? detailWorld.zy : detailWorld.xy);
        #ifdef USE_MAP
          vMapUv = detailUv / ${meters.toFixed(3)};
        #endif
        #ifdef USE_BUMPMAP
          vBumpMapUv = detailUv / ${meters.toFixed(3)};
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = detailUv / ${meters.toFixed(3)};
        #endif`,
      );
    };
    material.customProgramCacheKey = () => `exterior-world-uv-${meters}`;
    material.needsUpdate = true;
  }
  makeMaterials() {
    const T = this.T,
      m = this.materials;
    const pavers = this.surface("pavers"),
      stone = this.surface("stone"),
      asphalt = this.surface("asphalt"),
      brick = this.surface("brick"),
      wood = this.surface("wood"),
      plaster = this.surface("plaster"),
      grass = this.surface("grass"),
      metal = this.surface("metal"),
      canvas = this.surface("canvas");
    this.worldTexture(m.road, asphalt, 4, 0.045);
    m.road.color.set("#454d51");
    this.worldTexture(m.paving, pavers, 3.2, 0.028);
    for (const k of ["stone", "concrete", "curb"])
      this.worldTexture(m[k], stone, 2, 0.022);
    for (const k of ["warm", "light"])
      this.worldTexture(m[k], plaster, 2.6, 0.018);
    for (const k of ["grass", "grass2"])
      this.worldTexture(m[k], grass, 1.6, 0.045);
    for (const k of ["wood", "woodLight", "trunk"])
      this.worldTexture(m[k], wood, 1.8, 0.028);
    this.m = {
      render: new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.94 }),
      fabric: new T.MeshStandardMaterial({ color: "#ffffff", roughness: 1 }),
      masonry: new T.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.86,
      }),
      trim: new T.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.52,
        metalness: 0.35,
      }),
      timber: new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.78 }),
      glass: new T.MeshStandardMaterial({
        color: "#84b4bc",
        metalness: 0.65,
        roughness: 0.19,
      }),
      dark: new T.MeshStandardMaterial({ color: "#25373a", roughness: 0.68 }),
      glow: new T.MeshStandardMaterial({
        color: "#ffe6bc",
        emissive: "#ffd397",
        emissiveIntensity: 0.8,
        roughness: 0.45,
      }),
      foliage: new T.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.95,
      }),
      leaf: new T.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.9,
        side: T.DoubleSide,
        alphaTest: 0.48,
      }),
      sign: new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.68 }),
    };
    this.worldTexture(this.m.masonry, brick, 1.2, 0.032);
    this.worldTexture(this.m.render, plaster, 2.6, 0.018);
    this.worldTexture(this.m.trim, metal, 0.8, 0.008);
    this.worldTexture(this.m.timber, wood, 1.8, 0.035);
    this.worldTexture(this.m.fabric, canvas, 0.65, 0.007);
    // A tiny shared contact-shade decal keeps street props grounded even when
    // BALANCED disables detail shadows. This is a static approximation, not SSAO.
    const contact = this.canvas(64),
      shade = contact.getContext("2d");
    const falloff = shade.createRadialGradient(32, 32, 6, 32, 32, 31);
    falloff.addColorStop(0, "rgba(255,255,255,0.7)");
    falloff.addColorStop(0.45, "rgba(255,255,255,0.45)");
    falloff.addColorStop(1, "rgba(255,255,255,0)");
    shade.fillStyle = falloff;
    shade.fillRect(0, 0, 64, 64);
    this.m.contact = new T.MeshBasicMaterial({
      map: this.texture(contact),
      color: "#27342b",
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const c = this.canvas(128),
      ctx = c.getContext("2d");
    // One alpha-cutout branch card contains many individual leaves, not a solid billboard.
    ctx.strokeStyle = "#6b7550";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(62, 120);
    ctx.quadraticCurveTo(70, 60, 60, 7);
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const y = 13 + i * 8,
        side = i % 2 ? 1 : -1,
        x = 63 + side * (10 + this.random() * 10);
      ctx.save();
      ctx.translate(x, y + 5);
      ctx.rotate(side * 0.65);
      ctx.fillStyle = this.pick(["#c9dcb0", "#9dbb81", "#b5ce99", "#8da970"]);
      ctx.beginPath();
      ctx.ellipse(0, 0, 6 + this.random() * 3, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(72,105,51,.4)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(0, 10);
      ctx.stroke();
      ctx.restore();
    }
    this.m.leaf.map = this.texture(c);
    const atlas = this.canvas(1024),
      a = atlas.getContext("2d");
    const panels = [
      ["EVERCITY", "CITY TRANSIT", "CENTRAL / 04"],
      ["COMMON", "COFFEE & BAKERY", "OPEN 08:00 — 20:00"],
      ["FORM", "ART & CULTURE", "EXHIBITION / 2026"],
      ["BOTANICA", "FLOWERS & PLANTS", "GROWN IN THE CITY"],
      ["NORTHLINE", "BOOKS & OBJECTS", "FIND YOUR NEXT STORY"],
      ["CENTRAL", "GARDEN DISTRICT", "WALK • EXPLORE • DISCOVER"],
      ["CITY MARKET", "FRESH EVERY DAY", "LOCAL / SEASONAL"],
      ["ATELIER", "DESIGN STUDIO", "ARCHITECTURE & LIVING"],
    ];
    panels.forEach((p, i) => {
      const x = (i % 2) * 512,
        y = Math.floor(i / 2) * 256;
      a.fillStyle = ["#213f44", "#cfb58d", "#d1d0bc", "#354d3d"][i % 4];
      a.fillRect(x, y, 512, 256);
      a.strokeStyle = "#8baf9a";
      a.lineWidth = 2;
      a.strokeRect(x + 14, y + 14, 484, 228);
      a.textAlign = "center";
      a.fillStyle = i % 4 === 1 || i % 4 === 2 ? "#263c3c" : "#eee8d4";
      a.font = "bold 46px sans-serif";
      a.fillText(p[0], x + 256, y + 92, 462);
      a.font = "19px sans-serif";
      a.fillText(p[1], x + 256, y + 142, 470);
      a.font = "14px sans-serif";
      a.fillText(p[2], x + 256, y + 202, 470);
    });
    this.m.sign.map = this.texture(atlas);
    this.makeDetailAtlas();
    for (let i = 0; i < 8; i++) {
      const g = new T.PlaneGeometry(1, 1),
        uv = g.attributes.uv;
      for (let j = 0; j < uv.count; j++)
        uv.setXY(
          j,
          (uv.getX(j) + (i % 2)) / 2,
          (uv.getY(j) + 3 - Math.floor(i / 2)) / 4,
        );
      this.geometry["sign" + i] = g;
    }
  }
  makeDetailAtlas() {
    // One shared atlas for address tiles, opening hours, menus and garden labels.
    const c = this.canvas(1024),
      ctx = c.getContext("2d");
    const labels = [
      ["01", "CENTRAL AVENUE", "EVERCITY"],
      ["02", "GARDEN STREET", "EVERCITY"],
      ["03", "CANAL WALK", "EVERCITY"],
      ["04", "MAPLE LANE", "EVERCITY"],
      ["DAILY MENU", "ESPRESSO  3.50", "SOURDOUGH  5.00"],
      ["WELCOME", "MON — SUN", "08:00 — 20:00"],
      ["FORM / 26", "SCULPTURE GARDEN", "PLEASE DO NOT CLIMB"],
      ["HERB GARDEN", "ROSEMARY / SAGE", "GROWN WITH CARE"],
    ];
    labels.forEach((lines, i) => {
      const x = (i % 2) * 512,
        y = Math.floor(i / 2) * 256;
      ctx.fillStyle = i < 4 ? "#e1d9c3" : "#294d47";
      ctx.fillRect(x, y, 512, 256);
      ctx.strokeStyle = i < 4 ? "#4b625b" : "#a9b798";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 12, y + 12, 488, 232);
      ctx.textAlign = "center";
      ctx.fillStyle = i < 4 ? "#304b46" : "#ece3cc";
      ctx.font = i < 4 ? "bold 116px serif" : "bold 43px sans-serif";
      ctx.fillText(lines[0], x + 256, y + 126, 462);
      ctx.font = "22px sans-serif";
      ctx.fillText(lines[1], x + 256, y + 182, 460);
      ctx.font = "18px sans-serif";
      ctx.fillText(lines[2], x + 256, y + 219, 460);
    });
    this.m.detailSign = new this.T.MeshStandardMaterial({
      map: this.texture(c),
      roughness: 0.82,
      color: "#ffffff",
    });
  }
  detailPanel(index, x, y, z, w, h, rotation = 0) {
    this.add(
      "sign" + index,
      "detailSign",
      x,
      y,
      z,
      w,
      h,
      1,
      "#ffffff",
      0,
      rotation,
      0,
      "near",
    );
  }
  makeReflection() {
    const T = this.T,
      s = new T.Scene();
    s.background = new T.Color("#bfd9de");
    const sky = new T.Mesh(
      new T.SphereGeometry(180, 24, 12),
      new T.ShaderMaterial({
        side: T.BackSide,
        vertexShader:
          "varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader:
          "varying vec3 p;void main(){float h=normalize(p).y;vec3 c=mix(vec3(.84,.79,.65),vec3(.33,.55,.70),smoothstep(-.1,.8,h));gl_FragColor=vec4(c,1.);}",
      }),
    );
    s.add(sky);
    const geo = new T.BoxGeometry(1, 1, 1),
      mats = ["#7b959a", "#b4b5a7", "#577985"].map(
        (color) => new T.MeshBasicMaterial({ color }),
      );
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.reflection = pmrem.fromScene(s, 0.035, 0.1, 400);
    this.scene.environment = this.reflection.texture;
    pmrem.dispose();
    geo.dispose();
    sky.geometry.dispose();
    sky.material.dispose();
    mats.forEach((m) => m.dispose());
    for (const m of Object.values(this.materials)) m.envMapIntensity = 0.24;
    for (const k of ["glass", "glassLight", "glassWarm"]) {
      this.materials[k].envMapIntensity = 0.75;
      this.materials[k].roughness = 0.22;
    }
    for (const m of Object.values(this.m)) m.envMapIntensity = 0.4;
  }
  refreshReflection(p) {
    if (!this.ready || this.quality === "balanced") return;
    const T = this.T,
      r = this.renderer,
      previous = this.scene.environment,
      oldTone = r.toneMapping,
      oldTarget = r.getRenderTarget();
    const target = new T.WebGLCubeRenderTarget(128, {
      generateMipmaps: true,
      minFilter: T.LinearMipmapLinearFilter,
    });
    const probe = new T.CubeCamera(0.2, 750, target);
    probe.position.set(p.x, p.y, p.z);
    const hidden = [];
    this.scene.traverse((o) => {
      if (o.visible && (o.userData.photoMarker || o.userData.worldSign)) {
        hidden.push(o);
        o.visible = false;
      }
    });
    let pmrem;
    try {
      this.scene.environment = null;
      r.toneMapping = T.NoToneMapping;
      probe.update(r, this.scene);
      pmrem = new T.PMREMGenerator(r);
      const next = pmrem.fromCubemap(target.texture);
      this.reflection?.dispose();
      this.reflection = next;
      this.scene.environment = next.texture;
    } catch (error) {
      this.scene.environment = previous;
      console.warn("Environment probe unavailable", error);
    } finally {
      hidden.forEach((o) => (o.visible = true));
      r.toneMapping = oldTone;
      r.setRenderTarget(oldTarget);
      target.dispose();
      pmrem?.dispose();
    }
    this.probePosition = { x: p.x, y: p.y, z: p.z };
  }
  add(
    kind,
    mat,
    x,
    y,
    z,
    w,
    h,
    d,
    color = "#ffffff",
    rx = 0,
    ry = 0,
    rz = 0,
    tier = "near",
  ) {
    const cellX = Math.floor((x + 36) / 72),
      cellZ = Math.floor((z + 36) / 72),
      key = `${kind}:${mat}:${cellX}:${cellZ}:${tier}`;
    if (!this.batches.has(key))
      this.batches.set(key, { kind, mat, cellX, cellZ, tier, items: [] });
    this.batches.get(key).items.push([x, y, z, w, h, d, color, rx, ry, rz]);
    this.counts[tier] = (this.counts[tier] || 0) + 1;
  }
  box(mat, x, y, z, w, h, d, color, ry = 0, tier = "near") {
    this.add("box", mat, x, y, z, w, h, d, color, 0, ry, 0, tier);
  }
  cylinder(mat, x, y, z, r, h, color, tier = "near") {
    this.add("cylinder", mat, x, y, z, r, h, r, color, 0, 0, 0, tier);
  }
  beam(mat, a, b, r, color, tier = "near") {
    const T = this.T,
      from = new T.Vector3(...a),
      to = new T.Vector3(...b),
      delta = to.clone().sub(from),
      q = new T.Quaternion().setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        delta.clone().normalize(),
      ),
      e = new T.Euler().setFromQuaternion(q),
      mid = from.add(to).multiplyScalar(0.5);
    this.add(
      "cylinder",
      mat,
      mid.x,
      mid.y,
      mid.z,
      r,
      delta.length(),
      r,
      color,
      e.x,
      e.y,
      e.z,
      tier,
    );
  }
  panel(index, x, y, z, w, h, rotation = 0) {
    this.add(
      "sign" + index,
      "sign",
      x,
      y,
      z,
      w,
      h,
      1,
      "#ffffff",
      0,
      rotation,
      0,
      "near",
    );
  }
  tree(x, z, s) {
    const colors =
      Math.abs(Math.round(x + z)) % 3
        ? ["#4f795c", "#74976a", "#a5b17a", "#456951"]
        : ["#617b56", "#97a366", "#769b79", "#4d7363"];
    for (let i = 0; i < 7; i++) {
      const a = i * 2.399,
        r = (i % 3) * 0.53 * s,
        xx = x + Math.cos(a) * r,
        zz = z + Math.sin(a) * r,
        yy = (4.6 + (i % 3) * 0.58) * s;
      this.beam(
        "timber",
        [x, 2.5 * s, z],
        [xx, yy, zz],
        0.065 * s,
        "#70614a",
        "green",
      );
      this.add(
        "sphere",
        "foliage",
        xx,
        yy,
        zz,
        0.58 * s,
        0.68 * s,
        0.58 * s,
        colors[i % 4],
        0,
        a,
        0,
        "green",
      );
    }
    for (let i = 0; i < 180; i++) {
      const a = i * 2.399,
        y = 1 - (2 * (i + 0.5)) / 180,
        r = Math.sqrt(1 - y * y),
        jitter = 0.85 + this.random() * 0.3;
      this.add(
        "leaf",
        "leaf",
        x + Math.cos(a) * r * 2.3 * s * jitter,
        (4.95 + y * 2.55) * s,
        z + Math.sin(a) * r * 2.15 * s * jitter,
        0.68 * s,
        0.85 * s,
        1,
        colors[i % 4],
        this.random() * Math.PI,
        this.random() * Math.PI,
        this.random() * Math.PI,
        "green",
      );
    }
    // Tree grate, concentric irrigation ring and corner fasteners.
    this.box("dark", x, 0.77, z, 2.7, 0.035, 2.7);
    for (let n = -6; n <= 6; n++)
      if (Math.abs(n) > 1) {
        this.box("trim", x + n * 0.19, 0.794, z, 0.045, 0.035, 2.6, "#6c766d");
        this.box("trim", x, 0.794, z + n * 0.19, 2.6, 0.035, 0.045, "#6c766d");
      }
  }
  shrub(x, y, z, s = 1, flowers = false) {
    this.add(
      "sphere",
      "foliage",
      x,
      y + 0.35 * s,
      z,
      0.7 * s,
      0.5 * s,
      0.6 * s,
      "#52714b",
      0,
      0,
      0,
      "near",
    );
    for (let k = 0; k < 8; k++) {
      const a = k * 2.4;
      this.add(
        "leaf",
        "leaf",
        x + Math.cos(a) * 0.5 * s,
        y + (0.4 + this.random() * 0.3) * s,
        z + Math.sin(a) * 0.4 * s,
        0.7 * s,
        0.8 * s,
        1,
        "#95ae6d",
        0,
        a,
        0.5,
        "near",
      );
    }
    if (flowers)
      for (let k = 0; k < 5; k++) {
        const a = k * 2.4;
        this.flower(
          x + Math.sin(a) * 0.4 * s,
          y + 0.7 * s,
          z + Math.cos(a) * 0.35 * s,
          s,
          this.pick(["#f5e1ce", "#c56875", "#f4db80", "#8e7aac"]),
        );
      }
  }
  flower(x, y, z, s, color) {
    this.cylinder(
      "foliage",
      x,
      y - 0.13 * s,
      z,
      0.018 * s,
      0.25 * s,
      "#41644d",
    );
    for (let n = 0; n < 5; n++) {
      const a = (n * Math.PI * 2) / 5;
      this.add(
        "sphere",
        "foliage",
        x + Math.cos(a) * 0.085 * s,
        y,
        z + Math.sin(a) * 0.085 * s,
        0.09 * s,
        0.024 * s,
        0.055 * s,
        color,
        0,
        -a,
        0,
        "near",
      );
    }
    this.add(
      "sphere",
      "foliage",
      x,
      y + 0.025 * s,
      z,
      0.036 * s,
      0.03 * s,
      0.036 * s,
      "#d5a440",
      0,
      0,
      0,
      "near",
    );
  }
  building(b) {
    const { x, z, w, d, floors, type } = b,
      F = 5.6,
      B = 0.32,
      roof = B + floors * F;
    const residential = type === "residential",
      cafe = type === "cafe" || type === "shop",
      gallery = type === "gallery";
    const tone = residential
      ? this.pick(["#bd8869", "#d3b99b", "#b5b0a0", "#ba9c7d"])
      : gallery
        ? "#d9d4c4"
        : this.pick(["#bbc3bd", "#859f9e", "#c7bea9"]);
    const metal = this.pick(["#667274", "#897b6c", "#566b76"]);
    const style =
      (Math.abs(Math.round(x / 72)) + Math.abs(Math.round(z / 72))) % 3;
    // Four elevation coordinate systems; keep all details outside the existing shell.
    for (let face = 0; face < 4; face++) {
      const side = face % 2 ? 1 : -1,
        alongX = face < 2,
        length = alongX ? w : d;
      const at = (u, v, out) =>
        alongX
          ? [x + u, v, z + side * (d / 2 + out)]
          : [x + side * (w / 2 + out), v, z + u];
      const block = (mat, u, v, out, a, h, depth, color, tier = "facade") => {
        const p = at(u, v, out);
        this.box(
          mat === "masonry" && !residential ? "render" : mat,
          ...p,
          alongX ? a : depth,
          h,
          alongX ? depth : a,
          color,
          0,
          tier,
        );
      };
      for (let f = 1; f < floors; f++) {
        const y = B + f * F;
        if (
          face === 1 &&
          (residential || type === "hotel") &&
          f >= 2 &&
          f % 2 === 0
        ) {
          let left = -length / 2 + 0.25;
          for (const center of [-w * 0.27, w * 0.27]) {
            block(
              "masonry",
              (left + center - 1.05) / 2,
              y + 0.46,
              0.1,
              center - 1.05 - left,
              0.78,
              0.23,
              tone,
            );
            left = center + 1.05;
          }
          block(
            "masonry",
            (left + length / 2 - 0.25) / 2,
            y + 0.46,
            0.1,
            length / 2 - 0.25 - left,
            0.78,
            0.23,
            tone,
          );
        } else
          block("masonry", 0, y + 0.46, 0.1, length - 0.5, 0.78, 0.23, tone);
        if (
          !(face === 1 && (residential || type === "hotel") && f % 2 === 0) &&
          (f % 3 === 0 || residential)
        )
          block("trim", 0, y + 0.88, 0.23, length + 0.35, 0.055, 0.32, metal);
        for (let u = -length / 2 + 2; u < length / 2 - 1; u += 5.4) {
          if (
            face === 1 &&
            (residential || type === "hotel") &&
            f % 2 === 0 &&
            Math.abs(Math.abs(u) - w * 0.27) < 1.2
          )
            continue;
          block("trim", u, y + 2.85, 0.19, 0.11, 4.5, 0.34, metal);
          if (style === 1)
            block(
              "trim",
              u - 1.7,
              y + 3.65,
              0.16,
              3.3,
              0.045,
              0.15,
              metal,
              "near",
            );
          if (residential && Math.round((u + length / 2) / 3.6) % 2 === 0)
            block("masonry", u, y + 2.9, 0.2, 0.5, 4.35, 0.48, tone);
          // Narrow window reveals and external shading slats do not fill the glazing.
          if (!residential && style === 2 && f % 3 === 1)
            for (let l = 0; l < 3; l++)
              block(
                "trim",
                u - 1.7,
                y + 4.6 + l * 0.19,
                0.42,
                3.35,
                0.055,
                0.7,
                metal,
                "near",
              );
        }
      }
      // Deep window sills, drip edges and lintels at walking-distance elevations.
      // South balconies and their door sweeps are deliberately excluded.
      if (face !== 1) {
        for (let f = 1; f < Math.min(floors, 5); f++) {
          const y = B + f * F;
          for (let u = -length / 2 + 3.8; u < length / 2 - 2; u += 5.4) {
            block(
              "render",
              u,
              y + 0.98,
              0.36,
              3.45,
              0.14,
              0.58,
              "#d4cebb",
              "near",
            );
            block(
              "dark",
              u,
              y + 0.87,
              0.46,
              3.22,
              0.04,
              0.12,
              "#ffffff",
              "near",
            );
            block("trim", u, y + 5.0, 0.23, 3.45, 0.1, 0.24, metal, "near");
          }
        }
        // Service grille set in the opaque plinth, with a hood and visible slats.
        for (const u of [-length * 0.28, length * 0.28]) {
          block("trim", u, 1.17, 0.56, 1.5, 0.68, 0.16, metal, "near");
          block("dark", u, 1.17, 0.65, 1.3, 0.51, 0.04, "#ffffff", "near");
          for (let n = 0; n < 5; n++)
            block(
              "trim",
              u,
              0.97 + n * 0.1,
              0.69,
              1.25,
              0.035,
              0.1,
              "#9aaba1",
              "near",
            );
        }
      }
      // Coped parapet and corner stone courses add depth without closing windows.
      block(
        "trim",
        0,
        roof + 1.12,
        0.1,
        length + 0.8,
        0.08,
        0.8,
        metal,
        "facade",
      );
      for (const edge of [-1, 1])
        for (let n = 0; n < 6; n++)
          block(
            "render",
            edge * (length / 2 - 0.25),
            0.72 + n * 0.78,
            0.34,
            n % 2 ? 0.78 : 1.05,
            0.65,
            0.45,
            "#c7c5b5",
            "near",
          );
      block("masonry", 0, roof + 0.95, 0.1, length + 0.65, 0.24, 0.65, tone);
      // Ground-level plinths and wall bays leave the original south entrance untouched.
      if (face !== 1) {
        block("masonry", 0, 1.0, 0.28, length, 1.3, 0.45, tone);
        for (let u = -length / 2 + 2; u < length / 2 - 2; u += 5.5) {
          block("trim", u, 3.3, 0.27, 0.12, 3.6, 0.35, metal);
          block("glass", u + 2.3, 3.1, 0.26, 4.2, 2.9, 0.06, "#b4caca");
          block("trim", u + 2.3, 4.63, 0.34, 4.7, 0.14, 0.7, metal);
        }
      }
      if (residential || type === "hotel") {
        // Balcony top rails, vertical balusters, side returns and planted ends.
        if (face === 1)
          for (let f = 2; f < floors; f += 2)
            for (const side of [-1, 1]) {
              const u = side * w * 0.27,
                y = B + f * F,
                bw = w * 0.32;
              block("trim", u, y + 1.25, 2.53, bw, 0.07, 0.1, metal);
              for (let n = -bw / 2; n <= bw / 2; n += 0.6)
                block(
                  "trim",
                  u + n,
                  y + 0.69,
                  2.53,
                  0.045,
                  1.05,
                  0.06,
                  metal,
                  "near",
                );
              for (const edge of [-1, 1]) {
                const p = at(u + (edge * bw) / 2, y + 0.68, 1.35);
                this.box("trim", ...p, 0.07, 1.15, 2.35, metal);
              }
              const p = at(u + bw / 2 - 0.8, y + 0.42, 1.45);
              this.box("masonry", ...p, 1.2, 0.62, 0.7, "#b7b5a1");
              this.shrub(p[0], y + 0.73, p[2], 0.65, true);
            }
      }
      // Rainwater pipes and collar clamps follow the corners.
      const p = at(-length / 2 + 0.6, roof / 2, 0.5);
      this.cylinder("trim", ...p, 0.075, roof, metal, "facade");
      for (let f = 1; f < floors; f += 2)
        block(
          "trim",
          -length / 2 + 0.6,
          B + f * F,
          0.5,
          0.22,
          0.12,
          0.26,
          metal,
          "near",
        );
    }
    // Entrance fascia, stone jambs, wall sconces and a recessed welcome mat.
    for (const side of [-1, 1]) {
      this.box(
        "masonry",
        x + side * 3.45,
        2.55,
        z + d / 2 + 0.25,
        0.48,
        4.45,
        0.65,
        tone,
        0,
        "facade",
      );
      this.box(
        "trim",
        x + side * 4.15,
        3.1,
        z + d / 2 + 0.43,
        0.32,
        0.95,
        0.25,
        metal,
      );
      this.box(
        "glow",
        x + side * 4.15,
        3.1,
        z + d / 2 + 0.58,
        0.16,
        0.72,
        0.045,
      );
      if (cafe) {
        for (let n = 0; n < 12; n++)
          this.box(
            "fabric",
            x + side * w * 0.29 - 4.4 + n * 0.8,
            4.3,
            z + d / 2 + 1.45,
            0.8,
            0.12,
            2.7,
            n % 2 ? "#dbd2b4" : "#466c63",
            0,
            "facade",
          );
        this.box(
          "fabric",
          x + side * w * 0.29,
          4.02,
          z + d / 2 + 2.8,
          9.6,
          0.48,
          0.1,
          "#ded1ac",
          0,
          "facade",
        );
      }
    }
    this.box("dark", x, 0.34, z + d / 2 + 0.4, 5.6, 0.025, 1.2);
    const signIndex =
      type === "cafe"
        ? 1
        : type === "gallery"
          ? 2
          : type === "shop"
            ? 6
            : residential
              ? 3
              : 4;
    this.panel(signIndex, x - w * 0.3, 3.1, z + d / 2 + 0.5, 5.4, 2.7);
    // Rooftop solar arrays, cable trays, ventilation ducts, fans and planted terrace.
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 4; col++) {
        const xx = x - w * 0.34 + col * 2.5,
          zz = z - d * 0.27 + row * 3;
        b.solids[b.floors].push({ x: xx, z: zz, w: 1.15, d: 1.1, height: 0.9 });
        this.box("trim", xx, roof + 0.5, zz, 2.3, 0.1, 2.2, "#bec8c5");
        this.add(
          "box",
          "glass",
          xx,
          roof + 0.65,
          zz,
          2.1,
          0.1,
          2,
          "#31566a",
          -0.16,
          0,
          0,
          "roof",
        );
        for (let k = -1; k <= 1; k++)
          this.box(
            "trim",
            xx + k * 0.64,
            roof + 0.74,
            zz,
            0.025,
            0.025,
            1.95,
            "#b2c5c4",
            0,
            "roof",
          );
      }
    for (let n = 0; n < 3; n++) {
      const xx = x + w / 2 - 4,
        zz = z - d / 2 + 4 + n * 4;
      this.cylinder("trim", xx, roof + 1.99, zz, 0.72, 0.18, "#a9b5b1", "roof");
      this.cylinder("dark", xx, roof + 2.1, zz, 0.58, 0.045, undefined, "roof");
      for (let k = 0; k < 4; k++)
        this.box(
          "trim",
          xx,
          roof + 2.13,
          zz,
          1.1,
          0.035,
          0.12,
          "#81948f",
          (k * Math.PI) / 4,
          "roof",
        );
      this.box(
        "trim",
        xx - 1.8,
        roof + 0.45,
        zz,
        1,
        0.7,
        0.7,
        "#a8b7b3",
        0,
        "roof",
      );
    }
    this.box(
      "trim",
      x + w / 2 - 6,
      roof + 0.32,
      z - d / 2 + 8,
      0.48,
      0.35,
      13,
      "#8c9b97",
      0,
      "roof",
    );
    for (let n = 0; n < 5; n++) {
      const xx = x - w * 0.35 + n * w * 0.175,
        zz = z + d / 2 - 2;
      this.box("masonry", xx, roof + 0.42, zz, 2.8, 0.65, 1.1, tone, 0, "roof");
      b.solids[b.floors].push({ x: xx, z: zz, w: 1.4, d: 0.55, height: 1.1 });
      this.shrub(xx, roof + 0.75, zz, 1, true);
    }
    if (type === "office") {
      for (let tier = 0; tier < 3; tier++)
        this.box(
          "masonry",
          x,
          roof + 4.5 + tier * 0.7,
          z - d / 2 + 3.2,
          6.6 - tier * 1.3,
          0.65,
          5.8 - tier,
          "#8197a2",
          0,
          "facade",
        );
    } else if (gallery) {
      this.add(
        "box",
        "masonry",
        x,
        roof + 4.8,
        z - d / 2 + 3.2,
        6.4,
        0.4,
        6,
        "#dbd6cf",
        0,
        0,
        0.15,
        "facade",
      );
    } else if (type === "hotel") {
      this.cylinder(
        "trim",
        x,
        roof + 6,
        z - d / 2 + 3.2,
        0.12,
        4.5,
        "#be9670",
        "facade",
      );
    }
    this.street(b, signIndex);
    this.neighborhoodObjects(b);
    this.streetCraft(b);
    this.frontageProp(b);
  }
  streetCraft(b) {
    const { x, z, w, d, type } = b;
    const district = Math.abs(Math.round(x / 72) + Math.round(z / 72)) % 4;
    // Beside the entry, not across the six-meter opening or its canopy sign.
    this.box(
      "trim",
      x + 5.05,
      2.48,
      z + d / 2 + 0.15,
      1.1,
      0.69,
      0.17,
      "#65756b",
    );
    this.detailPanel(district, x + 5.05, 2.48, z + d / 2 + 0.245, 1, 0.5);
    if (["cafe", "shop", "gallery"].includes(type))
      this.detailPanel(5, x + 7.3, 2.2, z + d / 2 + 0.11, 1.1, 0.55);
    // Small pipe shoes and wall-mounted meter boxes stay out of the walking lane.
    this.box(
      "trim",
      x - w / 2 - 0.34,
      2.12,
      z + 3,
      0.48,
      1.04,
      0.72,
      "#94a297",
    );
    this.box("dark", x - w / 2 - 0.59, 2.25, z + 3, 0.025, 0.25, 0.4);
    for (const dz of [2.78, 3.22])
      this.cylinder(
        "trim",
        x - w / 2 - 0.38,
        1.03,
        z + dz,
        0.025,
        1.22,
        "#65776e",
      );
    for (const side of [-1, 1]) {
      // Segmented curb mortar and a narrow cobbled drainage course.
      for (let n = -24; n <= 24; n += 2) {
        this.box(
          "dark",
          x + n,
          0.342,
          z + side * 27,
          0.026,
          0.009,
          0.25,
          "#b3b7a5",
        );
        this.box(
          "dark",
          x + side * 27,
          0.342,
          z + n,
          0.25,
          0.009,
          0.026,
          "#b3b7a5",
        );
      }
      for (let n = -18; n <= 18; n += 1.2) {
        this.box(
          "render",
          x + side * 26.6,
          0.29,
          z + n,
          0.32,
          0.016,
          1.12,
          n % 2 ? "#89988b" : "#b4b7a4",
        );
      }
      // Flush utility patch in the asphalt: no extra collision or traffic obstruction.
      this.box("dark", x + side * 30, 0.019, z - 7, 1.9, 0.012, 3.5, "#c3c4b7");
      this.box(
        "trim",
        x + side * 30,
        0.027,
        z - 7,
        1.55,
        0.006,
        3.12,
        "#66716b",
      );
      for (let n = 0; n < 12; n++) {
        const xx = x + side * (25.85 + this.random() * 0.5),
          zz = z + 16 + this.random() * 3;
        this.add(
          "sphere",
          "foliage",
          xx,
          0.3,
          zz,
          0.065,
          0.008,
          0.13,
          this.pick(["#b1995e", "#a97a4f", "#7f9164"]),
          0,
          this.random() * Math.PI,
        );
      }
    }
    if (type === "cafe") {
      // Dress the existing terrace tables rather than placing duplicate furniture.
      for (const side of [-1, 1]) {
        const tx = x + side * 12,
          tz = z + d / 2 + 4;
        this.cylinder("trim", tx - 0.48, 1.393, tz, 0.16, 0.025, "#e1d6bc");
        this.cylinder("trim", tx - 0.48, 1.49, tz, 0.095, 0.17, "#eee5d0");
        this.cylinder("dark", tx - 0.48, 1.578, tz, 0.078, 0.006, "#846543");
        this.box(
          "render",
          tx + 0.45,
          1.398,
          tz,
          0.4,
          0.035,
          0.28,
          "#dcc7a8",
          0.2,
        );
      }
    }
  }
  frontageProp(b) {
    const x = b.x - 7.2,
      z = b.z + 24.5;
    // Flush to the 0.28m pavement, inside the furnishing bay and below the prop.
    this.add(
      "leaf",
      "contact",
      x,
      0.284,
      z,
      3.3,
      1.7,
      1,
      "#ffffff",
      -Math.PI / 2,
      0,
      0,
      "near",
    );
    // This bay is outside the entry axis, NPC lanes, benches and terrace chairs.
    if (b.type === "residential" || b.type === "hotel") {
      this.prop("climbing-planter", x, z, 2.6, 1.1, () => {
        this.box("masonry", x, 0.65, z, 2.6, 0.66, 1.1, "#b48766");
        this.box("dark", x, 0.989, z, 2.36, 0.016, 0.88, "#998570");
        for (let n = -2; n <= 2; n++)
          this.box(
            "timber",
            x + n * 0.49,
            1.96,
            z - 0.36,
            0.045,
            2.2,
            0.06,
            "#a99b79",
          );
        for (let n = 0; n < 5; n++)
          this.box(
            "timber",
            x,
            1.18 + n * 0.42,
            z - 0.36,
            2.45,
            0.045,
            0.06,
            "#a99b79",
          );
        for (let n = 0; n < 24; n++) {
          const xx = x + Math.sin(n * 2.4) * 0.95,
            yy = 1.18 + n * 0.075;
          this.add(
            "leaf",
            "leaf",
            xx,
            yy,
            z - 0.28,
            0.6,
            0.65,
            1,
            n % 3 ? "#719261" : "#a6ae71",
            0,
            0.3 * Math.sin(n),
            n * 0.5,
          );
        }
        for (const dx of [-0.85, 0, 0.85])
          this.shrub(x + dx, 1.0, z, 0.55, true);
      });
    } else if (b.type === "cafe") {
      this.prop("coffee-cart", x, z, 2.6, 1.2, () => {
        this.box("timber", x, 1.01, z, 2.5, 1.04, 1.1, "#b89165");
        for (const dx of [-1, 1])
          for (const dz of [-0.42, 0.42])
            this.add("ring", "dark", x + dx, 0.45, z + dz, 0.16, 0.16, 0.16);
        // Framed wood panels, corner hardware and real contact with the pavement.
        for (const dx of [-1.2, 1.2]) {
          this.box(
            "trim",
            x + dx,
            1.03,
            z + 0.56,
            0.07,
            0.99,
            0.045,
            "#688172",
          );
          for (const yy of [0.61, 1.43])
            this.cylinder(
              "trim",
              x + dx,
              yy,
              z + 0.59,
              0.028,
              0.055,
              "#b8bca7",
            );
        }
        for (let n = -3; n <= 3; n++)
          this.box(
            "dark",
            x + n * 0.3,
            1.0,
            z + 0.552,
            0.012,
            0.83,
            0.009,
            "#b2a88c",
          );
        this.box("trim", x, 1.57, z, 2.6, 0.12, 1.2, "#d5d0b8");
        this.box("dark", x - 0.6, 1.641, z + 0.1, 1.04, 0.02, 0.83, "#b6baaa");
        this.box("trim", x + 0.6, 1.76, z + 0.29, 0.46, 0.24, 0.33, "#617d73");
        this.box("dark", x + 0.6, 1.892, z + 0.29, 0.38, 0.025, 0.25);
        for (let n = 0; n < 4; n++)
          this.cylinder(
            "trim",
            x + 1.02,
            1.7 + n * 0.045,
            z + 0.22,
            0.09 + n * 0.005,
            0.06,
            "#e5d8bd",
          );
        this.box("trim", x - 0.6, 1.93, z, 0.9, 0.61, 0.64, "#839c8e");
        this.box("dark", x - 0.6, 1.89, z + 0.33, 0.72, 0.32, 0.03);
        for (const dx of [-0.81, -0.4]) {
          this.cylinder("trim", x + dx, 1.73, z + 0.42, 0.075, 0.17, "#e4dbbf");
          this.box("trim", x + dx, 1.98, z + 0.4, 0.045, 0.16, 0.16, "#cbd0c0");
        }
        for (let n = 0; n < 3; n++)
          this.cylinder(
            "trim",
            x + 0.26 + n * 0.28,
            1.87,
            z - 0.16,
            0.1,
            0.47,
            "#c6aa7d",
          );
        this.detailPanel(4, x + 0.66, 1.12, z + 0.565, 1.02, 0.51);
      });
    } else if (b.type === "gallery") {
      this.prop("sculpture-plinth", x, z, 2.4, 1.4, () => {
        this.box("render", x, 0.85, z, 2.4, 1.05, 1.4, "#d3ccba");
        this.add(
          "ring",
          "trim",
          x,
          2.36,
          z,
          0.84,
          0.84,
          0.84,
          "#b2915d",
          0.2,
          0.4,
        );
        this.add(
          "ring",
          "trim",
          x,
          2.36,
          z,
          0.64,
          0.64,
          0.64,
          "#66897f",
          0.4,
          1.4,
        );
        this.box("trim", x, 1.46, z, 0.32, 0.21, 0.3, "#b2915d");
        this.detailPanel(6, x, 0.95, z + 0.71, 1.25, 0.625);
      });
    } else {
      this.prop("parcel-locker", x, z, 2.6, 0.85, () => {
        this.box("trim", x, 1.44, z, 2.6, 2.24, 0.85, "#617f76");
        for (let row = 0; row < 3; row++)
          for (let col = 0; col < 4; col++) {
            const xx = x - 0.96 + col * 0.64,
              yy = 0.73 + row * 0.7;
            this.box(
              "trim",
              xx,
              yy,
              z + 0.439,
              0.59,
              0.64,
              0.025,
              (row + col) % 3 ? "#90a08d" : "#bead88",
            );
            this.box("dark", xx + 0.18, yy, z + 0.46, 0.045, 0.15, 0.018);
          }
        this.box("trim", x, 2.62, z, 2.6, 0.12, 0.85, "#b9c3ad");
      });
    }
  }
  bicycle(x, z, color) {
    // Bicycle lies parallel to sidewalk: both wheels share the same vertical plane.
    const y = 0.83;
    for (const dx of [-0.72, 0.72]) {
      this.add(
        "ring",
        "dark",
        x + dx,
        y,
        z,
        0.52,
        0.52,
        0.52,
        "#ffffff",
        0,
        0,
        0,
        "near",
      );
      this.add(
        "ring",
        "trim",
        x + dx,
        y,
        z,
        0.45,
        0.45,
        0.45,
        "#b4c4be",
        0,
        0,
        0,
        "near",
      );
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        this.beam(
          "trim",
          [x + dx, y, z],
          [x + dx + Math.cos(a) * 0.44, y + Math.sin(a) * 0.44, z],
          0.009,
          "#c1c8c2",
        );
      }
    }
    const a = [x - 0.72, y, z],
      b = [x - 0.25, y + 0.65, z],
      c = [x + 0.15, y, z],
      d = [x + 0.45, y + 0.72, z],
      e = [x + 0.72, y, z];
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
      [b, d],
      [d, c],
      [d, e],
    ])
      this.beam("trim", p, q, 0.036, color);
    this.box("dark", x - 0.25, y + 0.78, z, 0.43, 0.12, 0.26);
    this.beam("trim", d, [x + 0.4, y + 1, z], 0.035, "#c2c8be");
    this.box("dark", x + 0.4, y + 1, z, 0.1, 0.07, 0.62);
    this.cylinder("trim", x - 0.13, 0.64, z - 0.13, 0.025, 0.65, "#5a6560");
  }
  street(b, index) {
    const { x, z, w, d, type } = b;
    // Utilities are in the furnishing strip, not on NPC lanes (at +/-29) or the entrance axis.
    for (const side of [-1, 1]) {
      this.box("dark", x + side * 25.9, 0.296, z - 10, 1.2, 0.024, 2.2);
      for (let n = 0; n < 12; n++)
        this.box(
          "trim",
          x + side * 25.9,
          0.317,
          z - 10.98 + n * 0.18,
          1.12,
          0.018,
          0.05,
          "#8a9286",
        );
      this.cylinder(
        "trim",
        x + side * 25.6,
        0.33,
        z + 10,
        0.52,
        0.04,
        "#68746d",
      );
      this.add(
        "ring",
        "dark",
        x + side * 25.6,
        0.36,
        z + 10,
        0.41,
        0.41,
        0.41,
        undefined,
        Math.PI / 2,
        0,
        0,
      );
      for (let n = -2; n <= 2; n++)
        this.box(
          "trim",
          x + side * 25.6 + n * 0.14,
          0.365,
          z + 10,
          0.026,
          0.02,
          0.65,
          "#354b48",
        );
    }
    for (let n = -2; n <= 2; n++) {
      this.box("trim", x + n * 0.42, 0.325, z + 26, 0.38, 0.04, 1.5, "#d5bd75");
      for (let k = -2; k <= 2; k++)
        this.cylinder(
          "trim",
          x + n * 0.42,
          0.357,
          z + 26 + k * 0.22,
          0.035,
          0.023,
          "#ead39b",
        );
    }
    // Proper slatted public benches, bollards, recycling bins and bike racks.
    for (let n = 0; n < 6; n++)
      this.box(
        "timber",
        x - 12,
        0.99,
        z + 23.65 + n * 0.14,
        3,
        0.055,
        0.1,
        "#b0956c",
      );
    for (const side of [-1, 1]) {
      this.box(
        "trim",
        x - 12 + side * 1.4,
        1.23,
        z + 24,
        0.055,
        0.45,
        0.8,
        "#51675f",
      );
      this.cylinder(
        "trim",
        x + side * 5.2,
        0.88,
        z + 26,
        0.085,
        1.15,
        "#455a57",
      );
      this.cylinder(
        "trim",
        x + side * 5.2,
        1.33,
        z + 26,
        0.095,
        0.08,
        "#d4c6a4",
      );
    }
    for (let n = 0; n < 2; n++) {
      const xx = x + 12 + n * 1.1;
      this.box(
        "trim",
        xx,
        0.99,
        z + 24,
        0.83,
        1.3,
        0.78,
        n ? "#648375" : "#5a7079",
      );
      this.box("dark", xx, 1.48, z + 24.405, 0.58, 0.15, 0.035);
      this.box("trim", xx, 1.69, z + 24, 0.94, 0.12, 0.88, "#a4b1a5");
    }
    this.box("trim", x - 25, 1.05, z - 7, 1.2, 1.5, 0.6, "#aab3a4");
    for (let k = 0; k < 8; k++)
      this.box("dark", x - 24.387, 1.1 + k * 0.065, z - 7, 0.025, 0.018, 0.4);
    for (let n = 0; n < 3; n++) {
      const xx = x - 14 + n * 2.5,
        zz = z - 24;
      this.cylinder("trim", xx - 0.65, 0.8, zz, 0.045, 1, "#81968b");
      this.cylinder("trim", xx + 0.65, 0.8, zz, 0.045, 1, "#81968b");
      this.box("trim", xx, 1.3, zz, 1.3, 0.09, 0.09, "#81968b");
      if (n < 2)
        this.bicycle(
          xx,
          zz + 0.3,
          this.pick(["#ba7859", "#769791", "#d6c69f"]),
        );
    }
    if (type === "cafe" || type === "shop") {
      // Sidewalk menu board and a planted terrace edge, central 6m entrance stays clear.
      this.box(
        "timber",
        x + 7,
        1.14,
        z + d / 2 + 3,
        1.2,
        1.65,
        0.16,
        "#9a7a55",
      );
      this.panel(index, x + 7, 1.17, z + d / 2 + 3.09, 1.06, 1.45);
      for (const dx of [-0.53, 0.53])
        this.beam(
          "timber",
          [x + 7 + dx, 0.32, z + d / 2 + 2.5],
          [x + 7 + dx, 1.95, z + d / 2 + 3],
          0.045,
          "#9a7a55",
        );
    }
    for (let n = 0; n < 4; n++) {
      const zz = z - 12 + n * 6;
      this.box("masonry", x + 24, 0.63, zz, 1.5, 0.6, 3.8, "#bab4a0");
      for (let k = -1; k <= 1; k++)
        this.shrub(x + 24, 0.93, zz + k * 1.1, 0.75, n % 2 === 0);
    }
    if ((Math.round(x / 72) + Math.round(z / 72)) % 4 === 0) this.busStop(x, z);
  }
  busStop(x, z) {
    // Shelter sits along the north furnishing strip, away from crossings.
    const xx = x + 8,
      zz = z - 24.4;
    this.box("trim", xx, 3.4, zz, 7.3, 0.18, 2.4, "#4d6662", 0, "facade");
    for (const dx of [-3.35, 3.35])
      this.box("trim", xx + dx, 1.85, zz - 0.8, 0.13, 3.1, 0.14, "#50645f");
    this.box("glass", xx, 1.95, zz - 0.83, 6.7, 2.65, 0.045, "#9cafaa");
    this.box("timber", xx, 1.01, zz - 0.32, 5, 0.13, 0.68, "#ac956e");
    for (const dx of [-1.7, 1.7])
      this.box("trim", xx + dx, 0.65, zz - 0.32, 0.12, 0.7, 0.55, "#526760");
    this.panel(0, xx + 2.5, 2.1, zz - 0.78, 1.3, 1.95);
    this.box("glow", xx, 3.27, zz, 5, 0.035, 0.14);
    this.obstacle(xx, zz - 0.83, 6.8, 0.2);
    this.obstacle(xx, zz - 0.32, 5, 0.68);
  }
  park(p) {
    const { x, z } = p;
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        for (let n = 0; n < 11; n++) {
          const xx = x + side * 16 + (n - 5) * 1.65,
            zz = z + end * 7;
          this.shrub(xx, 0.69, zz, 0.9, true);
          // Tufts of ornamental grass, each using three crossed slender blades.
          for (let k = 0; k < 3; k++)
            this.add(
              "leaf",
              "leaf",
              xx + 0.35,
              0.99,
              zz + end * 0.6,
              0.32,
              1.1,
              1,
              "#b2b47c",
              0,
              (k * Math.PI) / 3,
              0,
              "near",
            );
        }
      }
    for (const side of [-1, 1]) {
      // Pergola on a planted lawn, never across the existing walkable axial paths.
      const px = x + side * 16,
        pz = z - 15;
      for (const dx of [-3.6, 3.6])
        for (const dz of [-3, 3])
          this.box(
            "timber",
            px + dx,
            2.28,
            pz + dz,
            0.19,
            3.3,
            0.19,
            "#8d7956",
            0,
            "facade",
          );
      for (let n = -4; n <= 4; n++)
        this.box(
          "timber",
          px + n * 0.95,
          4.01,
          pz,
          0.12,
          0.23,
          7,
          "#a59169",
          0,
          "facade",
        );
      for (const dz of [-3, 3])
        this.box(
          "timber",
          px,
          3.87,
          pz + dz,
          8.2,
          0.26,
          0.16,
          "#8d7956",
          0,
          "facade",
        );
    }
    for (let n = 0; n < 20; n++) {
      const a = (n * Math.PI * 2) / 20;
      this.cylinder(
        "trim",
        x + Math.sin(a) * 4.8,
        1.05,
        z + Math.cos(a) * 4.8,
        0.045,
        0.16,
        "#c4c9b1",
      );
    }
    this.panel(5, x + 8, 1.5, z + 24, 3, 1.5);
    this.box("trim", x + 8, 0.85, z + 23.96, 0.12, 1.2, 0.12, "#526259");
    this.parkObjects(p);
    // A low herb bed on the lawn, separate from axial paths and existing play areas.
    this.prop("herb-garden", x + 10, z + 22, 4.2, 2, () => {
      this.box("timber", x + 10, 0.88, z + 22, 4.2, 0.46, 2, "#9c8660");
      this.box("dark", x + 10, 1.12, z + 22, 3.96, 0.025, 1.76, "#9e8a73");
      for (let n = 0; n < 5; n++) {
        this.shrub(x + 8.4 + n * 0.8, 1.13, z + 22, 0.55, n % 2 === 0);
        this.box(
          "timber",
          x + 8.4 + n * 0.8,
          1.28,
          z + 22.72,
          0.04,
          0.35,
          0.035,
          "#cfbd92",
        );
      }
      this.detailPanel(7, x + 10, 1.46, z + 22.76, 1.2, 0.6);
    });
    for (const side of [-1, 1])
      for (let n = 0; n < 18; n++) {
        const xx = x + side * (7 + this.random() * 18),
          zz = z + 24.8;
        this.add(
          "leaf",
          "leaf",
          xx,
          0.91,
          zz,
          0.3,
          0.6,
          1,
          "#b5bd87",
          0,
          n * 2.4,
        );
      }
  }
  // Count complete props separately from the primitive parts used to model them.
  // All new freestanding props have one conservative, stable collision envelope.
  prop(kind, x, z, w, d, build) {
    const before = Object.values(this.counts).reduce((a, b) => a + b, 0);
    build();
    this.objects[kind] = (this.objects[kind] || 0) + 1;
    this.objectComponents +=
      Object.values(this.counts).reduce((a, b) => a + b, 0) - before;
    this.placements.push({ kind, x, z, w, d });
    this.obstacle(x, z, w, d);
  }
  vending(x, z) {
    this.prop("vending-machine", x, z, 1.65, 1.05, () => {
      this.box("trim", x, 1.56, z, 1.65, 2.55, 1.05, "#647f79");
      this.box("dark", x - 0.2, 1.85, z + 0.54, 1.02, 1.55, 0.045);
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 4; col++) {
          const xx = x - 0.57 + col * 0.25,
            yy = 1.32 + row * 0.48;
          this.cylinder(
            "trim",
            xx,
            yy,
            z + 0.58,
            0.08,
            0.28,
            ["#c58463", "#bdc8a3", "#739fbb", "#e5d2a1"][col],
          );
          this.box("glow", xx, yy - 0.18, z + 0.57, 0.17, 0.025, 0.025);
        }
      this.box("glow", x + 0.58, 2.05, z + 0.55, 0.26, 0.29, 0.035);
      this.box("dark", x + 0.58, 1.6, z + 0.56, 0.22, 0.075, 0.045);
      this.box("dark", x, 0.61, z + 0.55, 1.15, 0.26, 0.06);
      this.box("trim", x, 2.9, z, 1.76, 0.13, 1.17, "#cfdbcd");
    });
  }
  postbox(x, z) {
    this.prop("postbox", x, z, 0.85, 0.7, () => {
      this.box("trim", x, 1.46, z, 0.85, 1.2, 0.7, "#a55746");
      this.box("trim", x, 0.67, z, 0.28, 0.76, 0.32, "#485b57");
      this.box("trim", x, 2.1, z, 0.95, 0.12, 0.8, "#bc7961");
      this.box("dark", x, 1.8, z + 0.36, 0.61, 0.065, 0.035);
      this.box("trim", x, 1.46, z + 0.365, 0.38, 0.27, 0.025, "#ece2c9");
      this.box("trim", x, 0.34, z, 0.58, 0.1, 0.5, "#485b57");
    });
  }
  hydrant(x, z) {
    this.prop("fire-hydrant", x, z, 0.85, 0.6, () => {
      this.cylinder("trim", x, 0.76, z, 0.2, 0.84, "#b77551");
      this.add("sphere", "trim", x, 1.2, z, 0.22, 0.17, 0.22, "#bf9166");
      this.box("trim", x, 0.93, z, 0.73, 0.17, 0.19, "#bf9166");
      for (const dx of [-0.36, 0.36])
        this.box("dark", x + dx, 0.93, z, 0.08, 0.25, 0.25);
      this.cylinder("trim", x, 0.35, z, 0.3, 0.11, "#676d60");
    });
  }
  directory(x, z, index) {
    this.prop("wayfinding-totem", x, z, 1.1, 0.48, () => {
      this.box("trim", x, 1.73, z, 1.1, 2.9, 0.32, "#47635d");
      this.panel(index, x, 2, z + 0.17, 0.95, 1.65);
      for (let n = 0; n < 3; n++)
        this.box(
          "trim",
          x,
          1.02 - n * 0.16,
          z + 0.18,
          0.73,
          0.035,
          0.025,
          "#d1c5a7",
        );
      this.box("trim", x, 0.34, z, 1.1, 0.1, 0.48, "#8c9988");
    });
  }
  flowerCart(x, z) {
    this.prop("flower-cart", x, z, 3.5, 1.3, () => {
      this.box("timber", x, 0.86, z, 3.4, 0.16, 1.2, "#b2956e");
      for (const dx of [-1.3, 1.3])
        for (const dz of [-0.42, 0.42]) {
          this.box("trim", x + dx, 0.6, z + dz, 0.08, 0.6, 0.08, "#55675b");
          this.add("ring", "dark", x + dx, 0.46, z + dz, 0.18, 0.18, 0.18);
        }
      for (let n = 0; n < 5; n++) {
        const xx = x - 1.3 + n * 0.65;
        this.cylinder("trim", xx, 1.14, z, 0.23, 0.4, "#b7b8a0");
        for (let k = 0; k < 4; k++) {
          const zz = z + ((k % 2) - 0.5) * 0.23,
            px = xx + (Math.floor(k / 2) - 0.5) * 0.24,
            h = 1.63 + (k % 2) * 0.16;
          this.cylinder(
            "foliage",
            px,
            (1.3 + h) / 2,
            zz,
            0.017,
            h - 1.3,
            "#56704c",
          );
          this.flower(
            px,
            h,
            zz,
            1.3,
            ["#dab794", "#cb8179", "#ede0b1", "#aa98b6"][k],
          );
        }
      }
    });
  }
  produceStand(x, z) {
    this.prop("produce-stall", x, z, 4.7, 1.5, () => {
      this.box("timber", x, 0.96, z, 4.7, 1.3, 1.4, "#ad8760");
      for (let bin = 0; bin < 4; bin++) {
        const xx = x - 1.73 + bin * 1.15;
        this.box("dark", xx, 1.63, z, 1.01, 0.03, 1.1);
        for (const dz of [-0.57, 0.57])
          this.box("timber", xx, 1.75, z + dz, 1.08, 0.25, 0.06, "#d1b182");
        for (const dx of [-0.52, 0.52])
          this.box("timber", xx + dx, 1.75, z, 0.05, 0.25, 1.15, "#d1b182");
        for (let n = 0; n < 12; n++)
          this.add(
            "sphere",
            "foliage",
            xx + ((n % 4) - 1.5) * 0.23,
            1.8,
            z + (Math.floor(n / 4) - 1) * 0.28,
            0.12,
            0.12,
            0.12,
            ["#bd6b51", "#cbaa55", "#829257", "#b57746"][bin],
          );
        this.box("trim", xx, 1.36, z + 0.72, 0.38, 0.23, 0.025, "#eee4cb");
      }
      for (const dx of [-2.25, 2.25])
        this.box("trim", x + dx, 2, z - 0.58, 0.07, 3.4, 0.07, "#5d7361");
      for (let n = 0; n < 12; n++)
        this.box(
          "fabric",
          x - 2.2 + n * 0.4,
          3.67,
          z,
          0.4,
          0.14,
          1.5,
          n % 2 ? "#ddcba5" : "#557764",
        );
    });
  }
  newsRack(x, z) {
    this.prop("newspaper-rack", x, z, 1.6, 0.8, () => {
      for (const dx of [-0.7, 0.7])
        this.box("trim", x + dx, 1.1, z, 0.08, 1.65, 0.72, "#50645f");
      for (let row = 0; row < 3; row++) {
        const y = 0.65 + row * 0.5;
        this.box("trim", x, y, z, 1.55, 0.07, 0.8, "#50645f");
        for (let n = 0; n < 3; n++) {
          this.box(
            "timber",
            x - 0.48 + n * 0.48,
            y + 0.17,
            z + 0.12,
            0.4,
            0.27,
            0.48,
            ["#ded5b7", "#97aaa0", "#bf9176"][n],
          );
          for (let k = 0; k < 3; k++)
            this.box(
              "dark",
              x - 0.48 + n * 0.48,
              y + 0.11 + k * 0.06,
              z + 0.365,
              0.28,
              0.017,
              0.012,
            );
        }
      }
    });
  }
  luggageCart(x, z) {
    this.prop("luggage-cart", x, z, 2, 1.25, () => {
      this.box("trim", x, 0.6, z, 2, 0.15, 1.25, "#b19a67");
      for (const dx of [-0.85, 0.85]) {
        this.cylinder("trim", x + dx, 1.65, z, 0.04, 2.1, "#bba470");
        for (const dz of [-0.45, 0.45])
          this.add("sphere", "dark", x + dx, 0.42, z + dz, 0.12, 0.12, 0.1);
      }
      this.box("trim", x, 2.71, z, 1.75, 0.08, 0.08, "#bba470");
      for (let n = 0; n < 3; n++) {
        const xx = x - 0.63 + n * 0.61,
          h = 0.7 + (n % 2) * 0.3;
        this.box(
          "timber",
          xx,
          0.69 + h / 2,
          z,
          0.52,
          h,
          0.65,
          ["#926f55", "#536e6f", "#ac987a"][n],
        );
        this.box("dark", xx, 1.43 + (n % 2) * 0.3, z, 0.2, 0.055, 0.09);
        for (const dx of [-0.15, 0.15])
          this.box(
            "trim",
            xx + dx,
            0.69 + h / 2,
            z + 0.335,
            0.025,
            h - 0.08,
            0.02,
            "#cfb98d",
          );
      }
    });
  }
  repairStation(x, z) {
    this.prop("cycle-repair-station", x, z, 1.6, 0.7, () => {
      this.box("trim", x, 1.06, z, 0.36, 1.55, 0.45, "#688a7c");
      this.box("dark", x, 1.86, z, 1.5, 0.12, 0.3);
      for (const dx of [-0.55, -0.25, 0.25, 0.55]) {
        this.box("trim", x + dx, 1.32, z + 0.06, 0.022, 0.86, 0.025, "#596861");
        this.box("trim", x + dx, 0.84, z + 0.06, 0.1, 0.22, 0.07, "#b7beb0");
      }
      this.cylinder("trim", x + 0.65, 0.71, z, 0.08, 0.8, "#8a9990");
      this.box("dark", x + 0.65, 1.13, z, 0.4, 0.05, 0.08);
    });
  }
  neighborhoodObjects(b) {
    const { x, z, type } = b,
      index =
        type === "shop" ? 6 : type === "cafe" ? 1 : type === "gallery" ? 2 : 5;
    this.hydrant(x - 25, z + 7);
    this.directory(x - 19, z + 24.5, index);
    // West furnishing strip is between the shell (<=22m) and walking lane (29m).
    this.vending(x - 24.5, z - 16);
    this.postbox(x - 24.5, z + 15);
    this.repairStation(x - 24.5, z);
    // North-east display bay is separate from bikes, bus shelters and corner trees.
    if (type === "shop") this.produceStand(x + 18, z - 24.5);
    else if (type === "residential") this.flowerCart(x + 18, z - 24.5);
    else if (type === "hotel") this.luggageCart(x + 18, z - 24.5);
    else this.newsRack(x + 18, z - 24.5);
    // Small rooftop gardening station, behind the existing seating and away from the lift.
    const roof = 0.32 + b.floors * 5.6,
      rx = x + 8,
      rz = z + 12;
    const before = this.counts.roof || 0;
    this.box("timber", rx, roof + 0.95, rz, 3, 0.14, 1.2, "#b0956c", 0, "roof");
    for (const dx of [-1.25, 1.25])
      this.box(
        "trim",
        rx + dx,
        roof + 0.52,
        rz,
        0.1,
        0.85,
        1,
        "#52675a",
        0,
        "roof",
      );
    for (let n = 0; n < 3; n++) {
      this.cylinder(
        "trim",
        rx - 0.9 + n * 0.85,
        roof + 1.2,
        rz,
        0.22,
        0.35,
        "#b58363",
        "roof",
      );
      this.add(
        "sphere",
        "foliage",
        rx - 0.9 + n * 0.85,
        roof + 1.56,
        rz,
        0.27,
        0.32,
        0.27,
        "#809964",
        0,
        0,
        0,
        "roof",
      );
    }
    this.objectComponents += (this.counts.roof || 0) - before;
    this.objects["rooftop-herb-bench"] =
      (this.objects["rooftop-herb-bench"] || 0) + 1;
    (b.solids[b.floors] ||= []).push({ x: rx, z: rz, w: 1.5, d: 0.6 });
  }
  picnicTable(x, z, chess = false) {
    this.prop(chess ? "chess-table" : "picnic-table", x, z, 3.8, 3.3, () => {
      const top = chess ? 1.2 : 2.8;
      this.box("timber", x, 1.58, z, top, 0.14, 1.2, "#b49b72");
      for (const dx of [-0.5, 0.5])
        this.box("trim", x + dx, 1.1, z, 0.09, 0.84, 0.9, "#53665b");
      for (const dz of [-1.2, 1.2]) {
        for (let slat = 0; slat < 3; slat++)
          this.box(
            "timber",
            x,
            1.13,
            z + dz + (slat - 1) * 0.19,
            chess ? 1.4 : 3.4,
            0.09,
            0.16,
            "#ab9069",
          );
        for (const dx of [-0.55, 0.55])
          this.box("trim", x + dx, 0.87, z + dz, 0.1, 0.48, 0.6, "#53665b");
      }
      if (chess) {
        for (let row = 0; row < 8; row++)
          for (let col = 0; col < 8; col++)
            this.box(
              "trim",
              x + (col - 3.5) * 0.125,
              1.657,
              z + (row - 3.5) * 0.125,
              0.125,
              0.012,
              0.125,
              (row + col) % 2 ? "#435850" : "#e2d7b8",
            );
        for (const row of [0, 1, 6, 7])
          for (let col = 0; col < 8; col++) {
            const px = x + (col - 3.5) * 0.125,
              pz = z + (row - 3.5) * 0.125,
              h = row === 1 || row === 6 ? 0.08 : 0.13;
            this.cylinder(
              "trim",
              px,
              1.67 + h / 2,
              pz,
              0.035,
              h,
              row < 2 ? "#dfc99c" : "#314a46",
            );
            this.add(
              "sphere",
              "trim",
              px,
              1.67 + h,
              pz,
              0.035,
              0.035,
              0.035,
              row < 2 ? "#dfc99c" : "#314a46",
            );
          }
      } else {
        this.box("timber", x + 0.7, 1.83, z, 0.6, 0.36, 0.45, "#b49a70");
        this.box("trim", x - 0.6, 1.67, z, 0.55, 0.025, 0.48, "#e4ddc5");
        this.cylinder("trim", x, 1.82, z + 0.12, 0.09, 0.32, "#879c8b");
      }
    });
  }
  parkObjects(p) {
    const { x, z } = p;
    this.picnicTable(x - 16, z - 14, true);
    this.picnicTable(x - 16, z + 13);
    this.prop("playhouse-slide", x + 16, z + 13, 5.2, 5.2, () => {
      const px = x + 16,
        pz = z + 13;
      for (const dx of [-1, 1])
        for (const dz of [-1, 1])
          this.box(
            "timber",
            px + dx,
            1.73,
            pz + dz,
            0.14,
            2.15,
            0.14,
            "#a58961",
          );
      this.box("timber", px, 2.12, pz, 2.2, 0.16, 2.2, "#b89c70");
      for (const dx of [-1, 1])
        this.box("trim", px + dx, 2.66, pz, 0.08, 0.95, 2.1, "#678b7d");
      // Slide descends toward the lawn, not across a park path.
      this.add(
        "box",
        "trim",
        px,
        1.43,
        pz + 1.85,
        0.95,
        0.09,
        2.25,
        "#c5b07a",
        0.67,
        0,
        0,
      );
      for (const dx of [-0.5, 0.5])
        this.beam(
          "trim",
          [px + dx, 2.29, pz + 1],
          [px + dx, 0.94, pz + 2.6],
          0.05,
          "#668979",
        );
      for (let n = 0; n < 5; n++)
        this.box(
          "timber",
          px,
          0.82 + n * 0.28,
          pz - 1.2,
          0.9,
          0.1,
          0.24,
          "#ba9b6a",
        );
      this.box("timber", px, 3.07, pz, 2.5, 0.12, 2.5, "#668979");
    });
    this.prop("drinking-fountain", x + 24, z + 12, 1, 0.8, () => {
      this.cylinder("trim", x + 24, 1.2, z + 12, 0.19, 1.8, "#6c8880");
      this.box("trim", x + 24, 2.04, z + 12, 0.9, 0.15, 0.7, "#bdc8b6");
      this.box("dark", x + 24, 2.13, z + 12, 0.65, 0.02, 0.46);
      this.cylinder("trim", x + 24.28, 2.21, z + 12, 0.04, 0.19, "#d2d7c1");
    });
    this.prop("garden-tool-bench", x + 16, z - 14, 3.4, 1.2, () => {
      this.box("timber", x + 16, 1.55, z - 14, 3.4, 0.15, 1.2, "#bda27a");
      for (const dx of [-1.45, 1.45])
        this.box("timber", x + 16 + dx, 1.05, z - 14, 0.12, 0.95, 1, "#897651");
      this.cylinder("trim", x + 15.2, 1.86, z - 14, 0.25, 0.47, "#779389");
      this.beam(
        "trim",
        [x + 15.3, 1.76, z - 14],
        [x + 15.75, 2.04, z - 14],
        0.055,
        "#779389",
      );
      for (let n = 0; n < 3; n++)
        this.cylinder(
          "trim",
          x + 16 + n * 0.4,
          1.81,
          z - 14,
          0.15,
          0.37,
          "#b47b5d",
        );
      this.box("timber", x + 16, 1.03, z - 14, 2.7, 0.12, 1, "#a28965");
      for (let n = 0; n < 2; n++)
        this.box(
          "trim",
          x + 15.3 + n * 1.3,
          1.23,
          z - 14,
          1,
          0.28,
          0.7,
          "#adae80",
        );
    });
    this.prop("bird-bath", x - 24, z + 12, 1.2, 1.2, () => {
      this.cylinder("masonry", x - 24, 1.15, z + 12, 0.17, 1.0, "#c5c4ab");
      this.cylinder("masonry", x - 24, 1.67, z + 12, 0.6, 0.16, "#c5c4ab");
      this.cylinder("glass", x - 24, 1.76, z + 12, 0.51, 0.02, "#9cbbad");
      this.add(
        "sphere",
        "trim",
        x - 23.61,
        1.9,
        z + 12,
        0.12,
        0.14,
        0.09,
        "#8b8675",
      );
    });
    this.directory(x + 19, z + 25, 5);
  }
  waterfront() {
    for (let x = -320; x <= 320; x += 4) {
      this.cylinder("trim", x, 1.35, -339, 0.055, 1.7, "#5f7872", "facade");
      this.box(
        "trim",
        x + 2,
        2.12,
        -339,
        4,
        0.08,
        0.08,
        "#9eada1",
        0,
        "facade",
      );
      for (const y of [0.85, 1.25, 1.65])
        this.box("trim", x + 2, y, -339, 4, 0.026, 0.026, "#778d83");
    }
  }
  flush() {
    for (const batch of this.batches.values()) {
      const mesh = new this.T.InstancedMesh(
        this.geometry[batch.kind],
        this.m[batch.mat],
        batch.items.length,
      );
      batch.items.forEach((v, i) => {
        this.dummy.position.set(v[0], v[1], v[2]);
        this.dummy.scale.set(v[3], v[4], v[5]);
        this.dummy.rotation.set(v[7], v[8], v[9]);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
        mesh.setColorAt(i, this.color.set(v[6]));
      });
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      mesh.userData.detailTier = batch.tier;
      mesh.userData.bounds = mesh.boundingBox;
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
    this.batches.clear();
    this.setQuality(this.quality);
    console.info("EVERCITY exterior", JSON.stringify(this.snapshot()));
  }
  setQuality(value, { persist = true } = {}) {
    this.quality = ["balanced", "high", "ultra", "hdr-ultra"].includes(value)
      ? value
      : "high";
    const ratio = { balanced: 1, high: 1.5, ultra: 2, "hdr-ultra": 2 }[
      this.quality
    ];
    this.renderer.setPixelRatio(
      Math.min(
        devicePixelRatio,
        ratio,
        Math.sqrt(4200000 / (innerWidth * innerHeight)),
      ),
    );
    // Quality controls shadows as well as pixels and detail distance.
    const size = Math.min(
      this.renderer.capabilities.maxTextureSize,
      { balanced: 1024, high: 2048, ultra: 4096, "hdr-ultra": 4096 }[
        this.quality
      ],
    );
    if (this.sun && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.sun.shadow.mapSize.set(size, size);
      this.renderer.shadowMap.needsUpdate = true;
    }
    try {
      if (persist) localStorage.setItem("evercity-quality-v1", this.quality);
    } catch (e) {}
    this.elapsed = 1;
  }
  update(dt, p, mode) {
    this.reflectionClock = (this.reflectionClock || 0) + dt;
    if (
      this.ready &&
      this.reflectionClock > 20 &&
      (!this.probePosition ||
        Math.hypot(p.x - this.probePosition.x, p.z - this.probePosition.z) >
          72 ||
        this.lastProbeMode !== mode)
    ) {
      this.refreshReflection(p);
      this.reflectionClock = 0;
      this.lastProbeMode = mode;
    }
    this.elapsed += dt;
    if (this.elapsed < 0.3) return;
    this.elapsed = 0;
    const ranges = {
      "hdr-ultra": { near: 210, green: 430, roof: 350, facade: 720 },
      balanced: { near: 75, green: 185, roof: 135, facade: 300 },
      high: { near: 120, green: 280, roof: 210, facade: 470 },
      ultra: { near: 175, green: 380, roof: 300, facade: 650 },
    }[this.quality];
    for (const m of this.meshes) {
      const b = m.userData.bounds,
        dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x),
        dy = Math.max(b.min.y - p.y, 0, p.y - b.max.y),
        dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z),
        r = ranges[m.userData.detailTier];
      const distance2 = dx * dx + dy * dy + dz * dz;
      const limit = r + (m.visible ? 18 : -18);
      m.visible = distance2 < limit * limit;
      const casts =
        m.visible &&
        this.quality !== "balanced" &&
        distance2 <
          (this.quality === "hdr-ultra"
            ? 180
            : this.quality === "ultra"
              ? 155
              : 100) **
            2 &&
        m.material !== this.m.glass &&
        m.material !== this.m.glow &&
        m.material !== this.m.contact;
      if (m.castShadow !== casts) {
        m.castShadow = casts;
        this.renderer.shadowMap.needsUpdate = true;
      }
    }
    if (this.lastMode !== mode) {
      const night = mode === "night";
      for (const [k, m] of Object.entries(this.materials))
        m.envMapIntensity = night ? 0.06 : k.startsWith("glass") ? 0.75 : 0.24;
      this.m.glow.emissiveIntensity = night ? 2.5 : 0.55;
      this.m.glass.envMapIntensity = night ? 0.12 : 0.65;
      this.lastMode = mode;
    }
  }
  snapshot() {
    return {
      objects: { ...this.objects },
      objectCount: Object.values(this.objects).reduce((a, b) => a + b, 0),
      objectComponents: this.objectComponents,
      propColliders: this.placements.length,
      quality: this.quality,
      shadowSize: this.sun?.shadow.mapSize.x,
      components: Object.values(this.counts).reduce((a, b) => a + b, 0),
      categories: { ...this.counts },
      batches: this.meshes.length,
      visibleBatches: this.meshes.filter((m) => m.visible).length,
      reflection: !!this.scene.environment,
    };
  }
  selfTest() {
    return {
      objectVariety: Object.keys(this.objects).length >= 16,
      substantialNewObjects: this.snapshot().objectCount >= 550,
      propsHaveCollision:
        this.placements.length ===
        this.snapshot().objectCount - (this.objects["rooftop-herb-bench"] || 0),
      safePropDimensions: this.placements.every(
        (p) =>
          [p.x, p.z, p.w, p.d].every(Number.isFinite) && p.w > 0 && p.d > 0,
      ),
      denseExterior: this.snapshot().components > 50000,
      instanced: this.meshes.every((m) => m.isInstancedMesh),
      finiteBounds: this.meshes.every((m) =>
        Number.isFinite(m.boundingSphere.radius),
      ),
      worldScalePaving: !!this.materials.paving.map,
      surfaceRoughness: [
        this.m.masonry,
        this.m.render,
        this.m.trim,
        this.materials.grass,
      ].every(
        (m) =>
          m.map &&
          m.bumpMap &&
          m.roughnessMap &&
          m.roughnessMap.colorSpace === this.T.NoColorSpace,
      ),
      sharedDetailAtlas: !!this.m.detailSign.map,
      lightweightContactShade:
        this.m.contact.map.image.width === 64 && !this.m.contact.depthWrite,
      neighborhoodIdentity: [
        "climbing-planter",
        "coffee-cart",
        "sculpture-plinth",
        "parcel-locker",
        "herb-garden",
      ].every((kind) => this.objects[kind] > 0),
      leafCutouts: this.m.leaf.alphaTest > 0,
      environmentReflection: !!this.scene.environment,
      allTiersPresent: ["near", "green", "roof", "facade"].every(
        (k) => this.counts[k] > 0,
      ),
    };
  }
};
