"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  if (!window.THREE) {
    $("loading-text").textContent =
      "3Dライブラリを読み込めませんでした。通信接続を確認して再読み込みしてください。";
    return;
  }
  const T = THREE;
  EvercityLighting.installSunFilter(T);
  let renderer;
  try {
    renderer = new T.WebGLRenderer({
      canvas: $("world"),
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch (e) {
    $("loading-text").textContent =
      "WebGLを起動できません。WebGL対応ブラウザで開いてください。";
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = T.SRGBColorSpace;
  const scene = new T.Scene();
  scene.background = new T.Color("#9cbbc3");
  scene.fog = new T.FogExp2("#b4c6c6", 0.00165);
  const camera = new T.PerspectiveCamera(
    74,
    innerWidth / innerHeight,
    0.09,
    1200,
  );
  camera.rotation.order = "YXZ";
  const hdr = new EvercityHDR(T, renderer, camera);
  const ambient = new T.HemisphereLight("#c3e5f4", "#a39376", 2.15);
  scene.add(ambient);
  const sun = new T.DirectionalLight("#ffdda7", 3.2);
  sun.position.set(-130, 200, 95);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, {
    left: -165,
    right: 165,
    top: 165,
    bottom: -165,
    near: 1,
    far: 600,
  });
  sun.shadow.normalBias = 0.12;
  sun.shadow.bias = -0.00015;
  scene.add(sun);
  scene.add(sun.target);
  const skyUniforms = {
    top: { value: new T.Color("#78a8bf") },
    bottom: { value: new T.Color("#f1d1a6") },
    sunColor: { value: new T.Color("#ffe4b7") },
    sunDirection: { value: new T.Vector3(-130, 200, 95).normalize() },
  };
  const sky = new T.Mesh(
    new T.SphereGeometry(850, 32, 16),
    new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      uniforms: skyUniforms,
      vertexShader:
        "varying vec3 vPos; void main(){vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader:
        "varying vec3 vPos; uniform vec3 top; uniform vec3 bottom; uniform vec3 sunColor; uniform vec3 sunDirection; void main(){vec3 p=normalize(vPos); float t=pow(max(p.y,0.0),0.55); vec3 c=mix(bottom,top,t); float glow=pow(max(dot(p,sunDirection),0.0),22.0); c+=sunColor*(glow*.22+pow(max(dot(p,sunDirection),0.0),18000.0)*8.0); gl_FragColor=vec4(c,1.0);}",
    }),
  );
  scene.add(sky);
  const materials = {};
  function mat(name, color, roughness = 0.8, metalness = 0, extra = {}) {
    materials[name] = new T.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      ...extra,
    });
    return materials[name];
  }
  mat("paving", "#b8baba");
  mat("curb", "#cfcebf");
  mat("road", "#404c51");
  mat("line", "#dbd7ba");
  mat("grass", "#567c60");
  mat("grass2", "#78947c");
  mat("soil", "#536145");
  mat("trunk", "#725340");
  mat("leaf", "#557751");
  mat("leaf2", "#79956a");
  mat("stone", "#d5c9b3");
  mat("concrete", "#a9b5b2");
  mat("warm", "#c6b79e");
  mat("light", "#e4dfd0");
  mat("dark", "#273e43", 0.6, 0.3);
  mat("metal", "#52646a", 0.35, 0.7);
  mat("wood", "#a1754e");
  mat("woodLight", "#b99468");
  mat("teal", "#39746f");
  mat("fabric", "#718b82");
  mat("navy", "#42565f");
  mat("paper", "#e7deca");
  mat("art", "#d38c61");
  mat("art2", "#659492");
  mat("gold", "#b79a64", 0.4, 0.4);
  mat("black", "#253032");
  mat("water", "#74b8b1", 0.12, 0.45);
  mat("red", "#a55848");
  mat("whiteCar", "#d4d9d2", 0.35, 0.35);
  mat("carBlue", "#45616b", 0.3, 0.5);
  mat("glass", "#5e8b95", 0.2, 0.5, {
    emissive: "#4c737a",
    emissiveIntensity: 0.16,
  });
  mat("glassLight", "#88a9ae", 0.24, 0.4, {
    emissive: "#708d8b",
    emissiveIntensity: 0.1,
  });
  mat("glassWarm", "#a7a28e", 0.25, 0.35, {
    emissive: "#bba377",
    emissiveIntensity: 0.16,
  });
  // Exterior glazing is separate from opaque mirrors/appliance glass.
  for (const [name, color] of [
    ["facadeGlass", "#b1d6d9"],
    ["facadeGlassLight", "#c7e1df"],
    ["facadeGlassWarm", "#e0d7ba"],
  ])
    mat(name, color, 0.12, 0.08, {
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: T.FrontSide,
    });
  mat("lobbyGlass", "#afdcdd", 0.08, 0.15, {
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: T.DoubleSide,
  });
  mat("glow", "#f2dc9e", 0.4, 0, { emissive: "#ffcc7a", emissiveIntensity: 1 });
  mat("previewGlow", "#ffe2b6", 0.6, 0, {
    emissive: "#ffc67d",
    emissiveIntensity: 0.2,
  });
  mat("mintGlow", "#8de4cc", 0.3, 0, {
    emissive: "#64cbb1",
    emissiveIntensity: 0.6,
  });
  const boxGeo = new T.BoxGeometry(1, 1, 1);
  const cylinderGeo = new T.CylinderGeometry(1, 1, 1, 9);
  const sphereGeo = new T.IcosahedronGeometry(1, 1);
  const coneGeo = new T.ConeGeometry(1, 1, 8);
  const batches = new Map();
  const dummy = new T.Object3D();
  let activeBuildGroup = null,
    furnishingBuilding = null,
    furnishingFloor = 0;
  const batchMeshes = new Map();
  let hiddenPreviews = [];

  function furnitureSolid(x, z, w, d, height) {
    const h = height ?? (Math.min(w, d) < 0.32 ? 5.6 : 1.5);
    if (furnishingBuilding)
      furnishingBuilding.solids[furnishingFloor].push({
        x,
        z,
        w: w / 2,
        d: d / 2,
        height: h,
      });
    else obstacle(x, z, w, d, h);
  }
  function part(kind, key, x, y, z, sx, sy, sz, ry = 0) {
    if (activeBuildGroup) {
      const geo =
        kind === "box"
          ? boxGeo
          : kind === "cylinder"
            ? cylinderGeo
            : kind === "cone"
              ? coneGeo
              : sphereGeo;
      const mesh = new T.Mesh(geo, materials[key]);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.rotation.y = ry;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      activeBuildGroup.add(mesh);
      return mesh;
    }
    const batchKey =
      kind +
      ":" +
      key +
      ":" +
      Math.floor((x + 36) / 144) +
      ":" +
      Math.floor((z + 36) / 144);
    if (!batches.has(batchKey)) batches.set(batchKey, []);
    const entries = batches.get(batchKey);
    entries.push([x, y, z, sx, sy, sz, ry]);
    return { key: batchKey, index: entries.length - 1 };
  }
  const box = (key, x, y, z, w, h, d, ry = 0) =>
    part("box", key, x, y, z, w, h, d, ry);
  const cyl = (key, x, y, z, r, h) => part("cylinder", key, x, y, z, r, h, r);
  const ball = (key, x, y, z, rx, ry, rz) =>
    part("sphere", key, x, y, z, rx, ry, rz);
  let seed = 17342;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const pick = (a) => a[Math.floor(random() * a.length)];
  const buildings = [],
    parks = [],
    signs = [],
    obstacles = [],
    vehicles = [],
    people = [];
  const landmarks = [],
    streetFixtures = [];
  let trafficSystem = null,
    lightingSystem = null,
    stories = null,
    environment = null,
    exterior = null;
  const interactions = new EvercityInteractions({
    THREE: T,
    player: null,
    renderer,
    toast,
  });
  const fixture = (b, f, x, y, z, intensity = 110, color = "#ffe4bd") => {
    b.lights[f].push({ x, y, z, intensity, color });
  };
  const residences = new EvercityResidences({
    THREE: T,
    materials,
    mat,
    box,
    cyl,
    ball,
    part,
    solid: furnitureSolid,
    plant,
    chair,
    table,
    sofa,
    bookcase,
    fixture,
    BASE: 0.32,
    FLOOR: 5.6,
    active: () => !!activeBuildGroup,
    group: () => activeBuildGroup,
    interactions,
    roomLabel: (text, x, y, z, rotation, width = 1.9) => {
      const mesh = label(text, x, y, z, width, "#eadfc7", "#394c46", rotation);
      if (activeBuildGroup) activeBuildGroup.attach(mesh);
    },
  });
  const GRID = 72,
    FLOOR = 5.6,
    BASE = 0.32;
  const player = {
    x: 30,
    z: 108,
    y: 2.02,
    yaw: 0.28,
    pitch: 0.095,
    floor: 0,
    building: null,
    velocityY: 0,
    jump: 0,
  };
  interactions.player = player;
  let currentBuilding = null,
    nearbyElevator = null,
    running = false,
    started = false,
    sensitivity = 1,
    timeMode = "golden",
    lastMap = 0,
    walkPhase = 0,
    traveled = 0,
    toastTimer,
    frameCount = 0;
  let discovered = new Set();
  try {
    const saved = JSON.parse(
      localStorage.getItem("evercity-exploration-v1") || "[]",
    );
    if (Array.isArray(saved))
      discovered = new Set(saved.filter((v) => typeof v === "string"));
  } catch (e) {}
  function obstacle(x, z, w, d, height = 4) {
    obstacles.push({ x, z, w: w / 2, d: d / 2, height });
  }
  function label(
    text,
    x,
    y,
    z,
    width = 10,
    color = "#e5e2cc",
    bg = "#263f43",
    rotation = 0,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 160;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 160);
    ctx.fillStyle = color;
    ctx.font = "500 64px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 512, 85, 950);
    ctx.fillStyle = "#81c8b6";
    ctx.fillRect(32, 32, 4, 96);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    const mesh = new T.Mesh(
      new T.PlaneGeometry(width, width / 6.4),
      new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    mesh.userData.worldSign = true;
    scene.add(mesh);
    signs.push(mesh);
    return mesh;
  }
  function tree(x, z, scale = 1, planter = true) {
    if (planter) {
      box("stone", x, 0.47, z, 3.4, 0.5, 3.4);
      box("soil", x, 0.74, z, 2.9, 0.05, 2.9);
    }
    cyl("trunk", x, 2.2 * scale, z, 0.19 * scale, 3.7 * scale);
    // Keep a compact shadow-casting canopy underneath the detailed leaf clusters.
    ball("leaf", x, 4.8 * scale, z, 0.85 * scale, 1.3 * scale, 0.85 * scale);
    exterior?.tree(x, z, scale, planter ? 0.765 : 0.65);
    obstacle(x, z, 0.65, 0.65, 8);
    if (planter) obstacle(x, z, 3.4, 3.4, 0.4);
  }
  function plant(x, y, z, s = 1) {
    cyl("light", x, y + 0.37 * s, z, 0.43 * s, 0.74 * s);
    ball("leaf", x, y + 1.2 * s, z, 0.55 * s, 0.8 * s, 0.55 * s);
    ball("leaf2", x + 0.15 * s, y + 1.65 * s, z, 0.36 * s, 0.6 * s, 0.36 * s);
  }
  function bench(x, z, rot = 0) {
    obstacle(
      x,
      z,
      Math.abs(Math.cos(rot)) * 3 + Math.abs(Math.sin(rot)) * 0.83,
      Math.abs(Math.sin(rot)) * 3 + Math.abs(Math.cos(rot)) * 0.83,
      1.35,
    );
    box("wood", x, 0.93, z, 3, 0.17, 0.83, rot);
    box("wood", x, 1.45, z - 0.37, 3, 0.6, 0.12, rot);
    box("metal", x - 1, 0.57, z, 0.12, 0.7, 0.65, rot);
    box("metal", x + 1, 0.57, z, 0.12, 0.7, 0.65, rot);
  }
  function lamp(x, z) {
    streetFixtures.push({ x, z: z + 0.9 });
    cyl("metal", x, 3.4, z, 0.065, 6.2);
    box("metal", x, 6.5, z + 0.45, 0.12, 0.12, 1.1);
    box("glow", x, 6.42, z + 0.9, 0.45, 0.09, 0.65);
  }
  function chair(x, y, z, rot = 0, color = "fabric") {
    furnitureSolid(x, z, 0.85, 0.85, 1.4);
    box(color, x, y + 0.6, z, 0.75, 0.16, 0.77, rot);
    box(
      color,
      x + Math.sin(rot) * 0.32,
      y + 1,
      z + Math.cos(rot) * 0.32,
      0.75,
      0.75,
      0.13,
      rot,
    );
    for (const dx of [-0.25, 0.25])
      for (const dz of [-0.25, 0.25])
        box("metal", x + dx, y + 0.28, z + dz, 0.05, 0.55, 0.05);
  }
  function table(x, y, z, w = 2, d = 1.15) {
    const datum = BASE + (furnishingBuilding ? furnishingFloor * FLOOR : 0);
    furnitureSolid(x, z, w, d, y - datum + 1.06);
    box("woodLight", x, y + 1, z, w, 0.12, d);
    for (const dx of [-w * 0.4, w * 0.4])
      for (const dz of [-d * 0.36, d * 0.36])
        box("dark", x + dx, y + 0.47, z + dz, 0.07, 0.94, 0.07);
  }
  function sofa(x, y, z, rot = 0) {
    furnitureSolid(
      x,
      z,
      Math.abs(Math.cos(rot)) * 3.5 + Math.abs(Math.sin(rot)) * 1.3,
      Math.abs(Math.sin(rot)) * 3.5 + Math.abs(Math.cos(rot)) * 1.3,
    );
    box("fabric", x, y + 0.47, z, 3.5, 0.7, 1.3, rot);
    box(
      "teal",
      x + Math.sin(rot) * 0.55,
      y + 1.02,
      z + Math.cos(rot) * 0.55,
      3.5,
      0.95,
      0.23,
      rot,
    );
    box("fabric", x - 1.66, y + 0.8, z, 0.2, 0.6, 1.3, rot);
    box("fabric", x + 1.66, y + 0.8, z, 0.2, 0.6, 1.3, rot);
    for (let i = -1; i <= 1; i++)
      box("fabric", x + i * 1.08, y + 0.88, z, 1.02, 0.15, 1.05, rot);
  }
  function bookcase(x, y, z, w = 3) {
    furnitureSolid(x, z, w, 0.6, 2.9);
    box("wood", x, y + 1.45, z, w, 2.9, 0.46);
    for (let h = 0.48; h < 2.8; h += 0.67) {
      box("dark", x, y + h + 0.2, z + 0.245, w - 0.18, 0.51, 0.03);
      for (let j = -w / 2 + 0.22; j < w / 2 - 0.15; j += 0.18) {
        box(
          pick(["paper", "teal", "art", "gold", "navy"]),
          x + j,
          y + h + 0.22,
          z + 0.36,
          0.12,
          0.33 + random() * 0.14,
          0.26,
        );
      }
    }
  }
  function desk(x, y, z) {
    table(x, y, z, 2.35, 1.15);
    box("black", x, y + 1.58, z - 0.24, 0.92, 0.57, 0.07);
    box("metal", x, y + 1.24, z - 0.25, 0.08, 0.35, 0.08);
    box("metal", x, y + 1.08, z - 0.2, 0.42, 0.04, 0.28);
    box("black", x, y + 1.09, z + 0.25, 0.66, 0.04, 0.22);
    box("paper", x + 0.83, y + 1.095, z + 0.15, 0.36, 0.06, 0.42);
    chair(x, y, z + 1.05, 0, "navy");
  }
  function interior(b, floor = 0) {
    const y = BASE + floor * FLOOR,
      x = b.x,
      z = b.z,
      w = b.w,
      d = b.d;
    furnishingBuilding = b;
    furnishingFloor = floor;
    b.solids[floor] = [];
    b.lights[floor] = [];
    // A continuous walkable central aisle connects the doorway with the elevator.
    const detailedFloor = b.type === "residential" && floor > 0;
    if (detailedFloor) residences.floor(b, floor);
    else {
      const baseFloor = box("light", x, y + 0.02, z, w - 0.6, 0.09, d - 0.6);
      if (baseFloor.isMesh) baseFloor.userData.floorSurface = "base";
    }
    for (const side of [-1, 1]) {
      if (floor === 0)
        box(
          "warm",
          x + side * (w / 2 - 0.28),
          y + 2.35,
          z,
          0.1,
          4.65,
          d - 0.65,
        );
      else {
        box("warm", x + side * (w / 2 - 0.28), y + 0.55, z, 0.1, 1.1, d - 0.65);
        box(
          "warm",
          x + side * (w / 2 - 0.28),
          y + 4.85,
          z,
          0.1,
          1.25,
          d - 0.65,
        );
      }
    }
    // Keep the single exterior pane; do not stack a second interior window.
    box("teal", x, y + 2.35, z - d / 2 + 0.3, w - 0.6, 4.65, 0.1);
    if (!detailedFloor) {
      const corridorFloor = box("dark", x, y + 0.08, z + 1, 5, 0.08, d - 10);
      if (corridorFloor.isMesh)
        corridorFloor.userData.floorSurface = "corridor";
      box("gold", x - 2.55, y + 0.13, z + 1, 0.035, 0.03, d - 10);
      box("gold", x + 2.55, y + 0.13, z + 1, 0.035, 0.03, d - 10);
    }
    // Elevator core and operable front. Floor navigation is available on approach.
    box("concrete", x, y + 2.45, z - d / 2 + 2.7, 6.6, 4.9, 4.7);
    box("dark", x, y + 2, z - d / 2 + 5.08, 3.8, 4, 0.16);
    box("metal", x - 0.87, y + 1.9, z - d / 2 + 5.18, 1.7, 3.8, 0.06);
    box("metal", x + 0.87, y + 1.9, z - d / 2 + 5.18, 1.7, 3.8, 0.06);
    box("mintGlow", x, y + 4.17, z - d / 2 + 5.19, 2, 0.13, 0.08);
    box("black", x + 2.4, y + 1.55, z - d / 2 + 5.2, 0.28, 0.52, 0.1);
    box("mintGlow", x + 2.4, y + 1.65, z - d / 2 + 5.27, 0.09, 0.09, 0.02);
    for (const side of [-1, 1]) {
      const xx = x + side * w * 0.3;
      plant(xx, y, z + d / 2 - 3, 1.1);
      plant(xx, y, z - d / 2 + 3, 1.15);
      if (b.type !== "residential")
        for (let zz = -d / 2 + 9; zz < d / 2 - 3; zz += 9) {
          box("light", xx, y + FLOOR - 0.2, z + zz, 5, 0.12, 0.7);
          box("glow", xx, y + FLOOR - 0.28, z + zz, 4.7, 0.04, 0.5);
          if (b.type !== "residential")
            fixture(b, floor, xx, y + FLOOR - 0.4, z + zz, 135);
        }
    }
    const theme =
      b.type === "residential"
        ? "residential"
        : floor === b.floors - 1
          ? "lounge"
          : b.type;
    if (theme === "residential") residences.build(b, floor);
    else if (theme === "cafe" || theme === "shop") {
      furnitureSolid(x - w * 0.29, z - d * 0.24, w * 0.26, 2.1);
      box("teal", x - w * 0.29, y + 0.68, z - d * 0.24, w * 0.26, 1.35, 2.1);
      box(
        "woodLight",
        x - w * 0.29,
        y + 1.41,
        z - d * 0.24,
        w * 0.27,
        0.15,
        2.3,
      );
      box("metal", x - w * 0.29, y + 1.8, z - d * 0.24, 1.9, 0.66, 0.9);
      box("black", x - w * 0.29, y + 1.8, z - d * 0.24 + 0.48, 1.7, 0.45, 0.06);
      for (let n = 0; n < 5; n++) {
        cyl(
          "paper",
          x - w * 0.4 + n * 0.6,
          y + 1.58,
          z - d * 0.24 + 0.66,
          0.1,
          0.22,
        );
      }
      bookcase(x - w * 0.29, y, z - d / 2 + 1, w * 0.28);
      bookcase(x + w * 0.29, y, z - d / 2 + 1, w * 0.26);
      for (const side of [-1, 1])
        for (let zz = -4; zz < d / 2 - 4; zz += 6) {
          let tx = x + side * w * 0.29;
          table(tx, y, z + zz, 2.6, 1.4);
          chair(tx - 1.75, y, z + zz, Math.PI / 2);
          chair(tx + 1.75, y, z + zz, -Math.PI / 2);
          plant(tx, y + 1.1, z + zz, 0.23);
          box("paper", tx + 0.7, y + 1.09, z + zz, 0.38, 0.03, 0.45);
        }
    } else if (theme === "gallery") {
      for (const side of [-1, 1])
        for (let zz = -d / 2 + 9; zz < d / 2 - 5; zz += 7) {
          const tx = x + side * w * 0.33;
          furnitureSolid(tx, z + zz, 2, 2);
          box("paper", tx, y + 0.65, z + zz, 2, 1.3, 2);
          part(
            "sphere",
            pick(["gold", "art2", "art"]),
            tx,
            y + 2.25,
            z + zz,
            1.15,
            1.45,
            1.15,
            0.5,
          );
          box(
            "dark",
            x + side * (w / 2 - 0.48),
            y + 2.7,
            z + zz,
            0.08,
            2.6,
            3.4,
          );
          box(
            "art",
            x + side * (w / 2 - 0.55),
            y + 2.7,
            z + zz,
            0.08,
            2.3,
            3.1,
          );
          box(
            "art2",
            x + side * (w / 2 - 0.61),
            y + 2.9,
            z + zz - 0.35,
            0.08,
            1.45,
            1.25,
          );
        }
      sofa(x - 7, y, z + d / 2 - 5);
      sofa(x + 7, y, z + d / 2 - 5);
    } else if (theme === "hotel") {
      for (const side of [-1, 1])
        for (let zz = -d / 2 + 10; zz < d / 2 - 5; zz += 11) {
          let tx = x + side * w * 0.3;
          furnitureSolid(tx, z + zz, 4, 5.2);
          furnitureSolid(tx, z + zz - 4.6, w * 0.34, 0.14);
          box("wood", tx, y + 0.35, z + zz, 4, 0.65, 5.2);
          box("paper", tx, y + 0.8, z + zz, 3.8, 0.36, 4.9);
          box("teal", tx, y + 1.02, z + zz + 1, 3.82, 0.08, 2.5);
          box("light", tx - 0.9, y + 1.08, z + zz - 1.8, 1.3, 0.23, 0.7);
          box("light", tx + 0.9, y + 1.08, z + zz - 1.8, 1.3, 0.23, 0.7);
          box("wood", tx, y + 1.25, z + zz - 2.6, 4, 1.8, 0.2);
          box("woodLight", tx + 2.7, y + 0.55, z + zz - 1.7, 0.9, 1.1, 0.9);
          cyl("gold", tx + 2.7, y + 1.4, z + zz - 1.7, 0.07, 0.7);
          part(
            "cone",
            "paper",
            tx + 2.7,
            y + 1.85,
            z + zz - 1.7,
            0.4,
            0.6,
            0.4,
          );
          box("warm", tx, y + 2.2, z + zz - 4.6, w * 0.34, 4.4, 0.14);
          box("art2", tx, y + 2.6, z + zz - 4.5, 2.4, 1.5, 0.05);
        }
    } else if (theme === "lounge") {
      for (const side of [-1, 1])
        for (let zz = -d / 2 + 10; zz < d / 2 - 4; zz += 9) {
          const tx = x + side * w * 0.3;
          sofa(tx, y, z + zz);
          table(tx, y, z + zz - 2.2, 2.6, 1.3);
          plant(tx - 2.5, y, z + zz, 1.1);
          box("paper", tx, y + 1.08, z + zz - 2.2, 0.7, 0.05, 0.5);
        }
      bookcase(x - w * 0.3, y, z - d / 2 + 1, w * 0.27);
      bookcase(x + w * 0.3, y, z - d / 2 + 1, w * 0.27);
    } else {
      for (const side of [-1, 1])
        for (let zz = -d / 2 + 10; zz < d / 2 - 4; zz += 5.8) {
          if (floor % 3 === 1) {
            const tx = x + side * w * 0.29;
            table(tx, y, z + zz, 4.8, 1.5);
            for (const dx of [-1.4, 1.4]) {
              chair(tx + dx, y, z + zz - 1.4, Math.PI);
              chair(tx + dx, y, z + zz + 1.4);
            }
            box("paper", tx, y + 1.12, z + zz, 1, 0.05, 0.8);
          } else if (floor % 3 === 2) {
            const tx = x + side * w * 0.29;
            desk(tx, y, z + zz);
            plant(tx + side * 3, y, z + zz, 0.7);
          } else
            for (let n = 0; n < 2; n++)
              desk(x + side * (5.7 + n * 4.6), y, z + zz);
        }
      bookcase(x - w * 0.3, y, z - d / 2 + 1, w * 0.24);
      bookcase(x + w * 0.3, y, z - d / 2 + 1, w * 0.24);
      if (floor === 0) {
        furnitureSolid(x + 7, z + d / 2 - 6, 6, 1.6);
        box("wood", x + 7, y + 0.66, z + d / 2 - 6, 6, 1.3, 1.6);
        box("light", x + 7, y + 1.38, z + d / 2 - 6, 6.2, 0.15, 1.8);
        box("black", x + 7, y + 1.8, z + d / 2 - 6, 0.9, 0.6, 0.07);
      }
    }
    if (!detailedFloor) commercialObjects(b, floor, theme);
    furnishingBuilding = null;
  }
  function commercialObjects(b, f, theme) {
    const { x, z, w, d } = b,
      y = BASE + f * FLOOR,
      objects = {};
    let components = 0;
    const B = (m, xx, h, zz, a, t, c) => {
      components++;
      return box(m, xx, y + h, zz, a, t, c);
    };
    const C = (m, xx, h, zz, r, t) => {
      components++;
      return cyl(m, xx, y + h, zz, r, t);
    };
    const O = (m, xx, h, zz, a, t, c) => {
      components++;
      return ball(m, xx, y + h, zz, a, t, c);
    };
    const item = (name, build) => {
      objects[name] = (objects[name] || 0) + 1;
      build();
    };
    // Everything rests on an existing counter, desk, bed or display plinth.
    // Reuse shared materials and primitive geometry; active floors are batched/unloaded.
    const cup = (xx, h, zz) => {
      C("paper", xx, h + 0.12, zz, 0.11, 0.24);
      C("dark", xx, h + 0.245, zz, 0.086, 0.012);
      O("paper", xx + 0.12, h + 0.12, zz, 0.08, 0.08, 0.024);
    };
    const book = (xx, h, zz, m) => {
      B(m, xx, h + 0.035, zz, 0.7, 0.07, 0.48);
      B("paper", xx, h + 0.036, zz + 0.247, 0.61, 0.043, 0.014);
    };
    const pastries = (xx, h, zz) => {
      B("woodLight", xx, h + 0.02, zz, 1.6, 0.04, 0.7);
      for (let n = 0; n < 6; n++) {
        O(
          "gold",
          xx + ((n % 3) - 1) * 0.46,
          h + 0.15,
          zz + (Math.floor(n / 3) - 0.5) * 0.3,
          0.18,
          0.11,
          0.12,
        );
        B(
          "paper",
          xx + ((n % 3) - 1) * 0.46,
          h + 0.25,
          zz + (Math.floor(n / 3) - 0.5) * 0.3,
          0.1,
          0.012,
          0.025,
        );
      }
    };
    if (theme === "cafe" || theme === "shop") {
      const cx = x - w * 0.29,
        cz = z - d * 0.24;
      item(theme === "cafe" ? "bakery-case" : "checkout-display", () => {
        B("wood", cx + 2.9, 1.53, cz, 2.05, 0.08, 1.25);
        pastries(cx + 2.9, 1.58, cz);
        for (const dx of [-0.97, 0.97])
          B("metal", cx + 2.9 + dx, 1.96, cz, 0.035, 0.84, 1.18);
        B("lobbyGlass", cx + 2.9, 1.99, cz + 0.62, 1.9, 0.72, 0.035);
        B("lobbyGlass", cx + 2.9, 2.39, cz, 2.05, 0.04, 1.25);
        B("paper", cx + 2.9, 1.69, cz + 0.66, 0.65, 0.2, 0.025);
      });
      for (const side of [-1, 1])
        for (let zz = -4; zz < d / 2 - 4; zz += 6) {
          const tx = x + side * w * 0.29,
            tz = z + zz;
          item(
            theme === "cafe" ? "cafe-table-service" : "market-gift-display",
            () => {
              if (theme === "cafe") {
                cup(tx - 0.7, 1.07, tz + 0.2);
                C("paper", tx + 0.65, 1.085, tz - 0.25, 0.27, 0.025);
                O("gold", tx + 0.65, 1.19, tz - 0.25, 0.18, 0.09, 0.14);
                B("wood", tx, 1.28, tz - 0.49, 0.35, 0.42, 0.055);
                B("paper", tx, 1.3, tz - 0.453, 0.28, 0.29, 0.014);
              } else {
                for (let n = 0; n < 3; n++) {
                  B(
                    ["sage", "terracotta", "linen"][n],
                    tx - 0.8 + n * 0.8,
                    1.33,
                    tz,
                    0.53,
                    0.54,
                    0.65,
                  );
                  B("gold", tx - 0.8 + n * 0.8, 1.611, tz, 0.065, 0.014, 0.65);
                  B(
                    "paper",
                    tx - 0.8 + n * 0.8,
                    1.38,
                    tz + 0.336,
                    0.25,
                    0.23,
                    0.017,
                  );
                }
              }
            },
          );
        }
    } else if (theme === "gallery") {
      for (const side of [-1, 1])
        for (let zz = -d / 2 + 9; zz < d / 2 - 5; zz += 7) {
          const tx = x + side * w * 0.33;
          item("gallery-caption", () => {
            B("gold", tx, 0.93, z + zz + 1.025, 1.4, 0.44, 0.025);
            B("paper", tx, 0.93, z + zz + 1.045, 1.3, 0.36, 0.014);
            for (let n = 0; n < 4; n++)
              B(
                "dark",
                tx,
                0.83 + n * 0.065,
                z + zz + 1.058,
                1.02 - n * 0.15,
                0.015,
                0.009,
              );
          });
        }
    } else if (theme === "hotel") {
      for (const side of [-1, 1])
        for (let zz = -d / 2 + 10; zz < d / 2 - 5; zz += 11) {
          const tx = x + side * w * 0.3;
          item("hotel-welcome-tray", () => {
            B("woodLight", tx, 1.13, z + zz + 1, 1.8, 0.08, 1.1);
            for (const dx of [-0.86, 0.86])
              B("gold", tx + dx, 1.25, z + zz + 1, 0.035, 0.17, 0.9);
            cup(tx - 0.4, 1.18, z + zz + 1);
            B("paper", tx + 0.4, 1.22, z + zz + 1, 0.5, 0.04, 0.6);
            for (let n = 0; n < 3; n++)
              B(
                "gold",
                tx + 0.4,
                1.246,
                z + zz + 0.83 + n * 0.12,
                0.3,
                0.012,
                0.018,
              );
          });
          item("folded-hotel-towels", () => {
            for (let n = 0; n < 3; n++)
              B(
                "linen",
                tx + 1,
                1.2 + n * 0.13,
                z + zz - 0.35,
                1.25 - n * 0.17,
                0.12,
                0.66,
              );
          });
        }
    } else if (theme === "lounge" || theme === "residential") {
      for (const side of [-1, 1]) {
        const tx = x + side * w * (theme === "residential" ? 0.29 : 0.3);
        const tables = theme === "residential" ? [z + 3.5] : [];
        if (theme === "lounge")
          for (let zz = -d / 2 + 10; zz < d / 2 - 4; zz += 9)
            tables.push(z + zz - 2.2);
        for (const tz of tables)
          item("lounge-reading-set", () => {
            book(tx - 0.7, 1.07, tz, "terracotta");
            book(tx - 0.65, 1.15, tz, "teal");
            cup(tx + 0.65, 1.07, tz + 0.13);
            C("gold", tx + 0.1, 1.26, tz - 0.28, 0.09, 0.35);
            C("paper", tx + 0.1, 1.44, tz - 0.28, 0.07, 0.015);
          });
      }
    } else {
      for (const side of [-1, 1])
        for (let zz = -d / 2 + 10; zz < d / 2 - 4; zz += 5.8)
          for (let n = 0; n < 2; n++) {
            const tx = x + side * (5.7 + n * 4.6),
              tz = z + zz;
            item("office-desk-set", () => {
              O("black", tx + 0.49, 1.14, tz + 0.26, 0.07, 0.045, 0.1);
              cup(tx - 0.87, 1.07, tz + 0.26);
              B("black", tx - 0.78, 1.14, tz - 0.27, 0.38, 0.11, 0.33);
              B("screen", tx - 0.78, 1.21, tz - 0.31, 0.27, 0.035, 0.13);
              for (let k = 0; k < 3; k++)
                B(
                  "paper",
                  tx - 0.88 + k * 0.1,
                  1.207,
                  tz - 0.15,
                  0.055,
                  0.013,
                  0.05,
                );
              C("teal", tx + 0.84, 1.26, tz - 0.32, 0.1, 0.36);
              for (let k = 0; k < 3; k++)
                B(
                  k % 2 ? "gold" : "navy",
                  tx + 0.79 + k * 0.05,
                  1.52,
                  tz - 0.32,
                  0.022,
                  0.38,
                  0.022,
                );
              for (let k = 0; k < 4; k++)
                B(
                  "teal",
                  tx + 0.83,
                  1.133,
                  tz + 0.02 + k * 0.065,
                  0.24,
                  0.011,
                  0.016,
                );
            });
          }
    }
    b.objectDetails = b.objectDetails || {};
    b.objectDetails[f] = {
      categories: objects,
      count: Object.values(objects).reduce((a, b) => a + b, 0),
      components,
    };
  }
  // Low-cost silhouettes make glazed upper floors feel inhabited from the street.
  // They share instanced primitive batches and are replaced, not layered, on entry.
  function buildResidencePreview(b, f) {
    const y = BASE + f * FLOOR,
      refs = [];
    const add = (key, x, h, z, w, t, d) =>
      refs.push(box(key, x, y + h, z, w, t, d));
    for (const side of [-1, 1]) {
      const width = b.w / 2 - 4.1,
        depth = b.d - 9.4,
        origin = b.x + side * 3.4,
        back = b.z - b.d / 2 + 7.2;
      const X = (u) => origin + side * u,
        Z = (v) => back + v,
        split = depth * 0.44;
      const fabric = ["sage", "teal", "terracotta"][
        (Math.abs(Math.round(b.x / 72)) + f + (side > 0 ? 1 : 0)) % 3
      ];
      add("plaster", X(0), 2.3, Z(depth / 2), 0.18, 4.2, depth);
      add("plaster", X(width / 2), 2.3, Z(split), width, 4.2, 0.17);
      add("plaster", X(width / 2), 2.3, Z(0), width, 4.2, 0.17);
      add(fabric, X(width * 0.58), 0.65, Z(depth - 5.1), 3.5, 0.85, 1.3);
      add(fabric, X(width * 0.58), 1.3, Z(depth - 4.6), 3.5, 0.65, 0.2);
      add("woodLight", X(width * 0.58), 0.64, Z(depth - 7.7), 2.9, 0.25, 1.6);
      add("wood", X(width * 0.58), 0.7, Z(depth - 10.8), 5, 1, 0.8);
      add("black", X(width * 0.58), 1.8, Z(depth - 10.8), 3.3, 1.8, 0.1);
      add("woodLight", X(5.2), 1.2, Z(split + 2.9), 2.9, 0.14, 1.7);
      add("kitchen", X(width - 2.8), 0.9, Z(split + 2.1), 4.3, 1.4, 1.2);
      add("linen", X((6.5 + width) / 2), 0.9, Z(4.4), 3.7, 0.55, 4.9);
      add(fabric, X((6.5 + width) / 2), 1.22, Z(5.4), 3.7, 0.08, 2.4);
      add("previewGlow", X(width * 0.58), 5.04, Z(depth - 6.2), 1.3, 0.06, 0.7);
      add("previewGlow", X((6.5 + width) / 2), 5.04, Z(4.4), 1.3, 0.06, 0.7);
    }
    b.previews[f] = refs;
  }
  function makeBuilding(i, j) {
    const x = i * GRID,
      z = j * GRID;
    const types = [
      "residential",
      "office",
      "residential",
      "hotel",
      "shop",
      "cafe",
      "gallery",
      "residential",
    ];
    let type = types[((i + 4) * 9 + j + 4) % types.length],
      floors = 6 + Math.floor(random() * 16),
      w = 35 + random() * 9,
      d = 34 + random() * 10;
    let name =
      {
        office: "MERIDIAN",
        residential: "THE RESIDENCE",
        cafe: "COMMON GROUNDS",
        hotel: "NORTHLINE HOTEL",
        gallery: "FORM GALLERY",
        shop: "CITY MARKET",
      }[type] +
      " " +
      String((i + 4) * 9 + j + 5).padStart(2, "0");
    let jp = {
      office: "オフィス",
      residential: "レジデンス",
      cafe: "カフェ",
      hotel: "ホテル",
      gallery: "ギャラリー",
      shop: "マーケット",
    }[type];
    let special = null;
    if (i === 0 && j === 0) {
      name = "ATLAS TOWER";
      jp = "アトラス・タワー";
      type = "office";
      floors = 25;
      w = 42;
      d = 40;
      special = "SKYLINE / 25 FLOORS";
    }
    if (i === 1 && j === 1) {
      name = "COMMON GROUNDS";
      jp = "コモングラウンズ";
      type = "cafe";
      floors = 5;
      special = "CAFE / ROOFTOP GARDEN";
    }
    if (i === -1 && j === 1) {
      name = "MUSEUM OF FORM";
      jp = "フォーム現代美術館";
      type = "gallery";
      floors = 4;
      w = 44;
      d = 44;
      special = "ART / ARCHITECTURE";
    }
    if (i === 1 && j === 0) {
      name = "THE HALCYON";
      jp = "ザ・ハルシオン";
      type = "hotel";
      floors = 18;
      special = "HOTEL / CITY VIEW";
    }
    if (i === -1 && j === 0) {
      name = "VERDANT RESIDENCE";
      jp = "ヴェルダント・レジデンス";
      type = "residential";
      floors = 12;
      special = "LIVING / INTERIORS";
    }
    if (i === -2 && j === 1) {
      name = "MAPLE COURT";
      jp = "メイプル・コート";
      type = "residential";
      floors = 10;
      w = 43;
      d = 44;
      special = "NEW / GARDEN APARTMENTS";
    }
    if (i === 2 && j === 1) {
      name = "CANAL HOUSE";
      jp = "カナル・ハウス";
      type = "residential";
      floors = 14;
      w = 44;
      d = 43;
      special = "NEW / DESIGN RESIDENCES";
    }
    if (i === -3 && j === 0) {
      name = "AURORA HEIGHTS";
      jp = "オーロラ・ハイツ";
      type = "residential";
      floors = 16;
      w = 42;
      d = 44;
      special = "NEW / FAMILY SUITES";
    }
    if (type === "residential") {
      w = Math.max(w, 42);
      d = Math.max(d, 43);
    }
    const b = {
      id: `${i}:${j}`,
      x,
      z,
      w,
      d,
      floors,
      type,
      name,
      jp,
      height: floors * FLOOR,
      special,
      solids: {},
      windows: {},
      lights: {},
      slabs: {},
      previews: {},
    };
    buildings.push(b);
    if (special) landmarks.push(b);
    // Shadow-only massing preserves full facade detail without redrawing every window into the shadow map.
    const shadowProxy = new T.Mesh(
      boxGeo,
      new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    );
    shadowProxy.position.set(x, BASE + b.height / 2, z);
    shadowProxy.scale.set(w, b.height, d);
    shadowProxy.castShadow = true;
    b.shadowProxy = shadowProxy;
    scene.add(shadowProxy);
    const facade = pick(["stone", "concrete", "warm", "light"]),
      glass = pick([
        "facadeGlass",
        "facadeGlassLight",
        "facadeGlass",
        "facadeGlassWarm",
      ]);
    box("paving", x, 0.14, z, 54, 0.28, 54);
    box("curb", x, 0.17, z + 27, 54, 0.34, 0.25);
    box("curb", x, 0.17, z - 27, 54, 0.34, 0.25);
    box("curb", x - 27, 0.17, z, 0.25, 0.34, 54);
    box("curb", x + 27, 0.17, z, 0.25, 0.34, 54);
    // Ground level has a real six-meter-wide open entrance, not a teleport door.
    box(facade, x - w / 2, BASE + FLOOR / 2, z, 0.45, FLOOR, d);
    box(facade, x + w / 2, BASE + FLOOR / 2, z, 0.45, FLOOR, d);
    box(facade, x, BASE + FLOOR / 2, z - d / 2, w, FLOOR, 0.45);
    for (const side of [-1, 1]) {
      box(
        "lobbyGlass",
        x + side * (w / 4 + 1.5),
        BASE + 2.6,
        z + d / 2,
        (w - 6) / 2,
        5.2,
        0.08,
      );
      box("dark", x + side * 3.1, BASE + 2.7, z + d / 2, 0.15, 5.4, 0.2);
      for (let n = 6; n < w / 2; n += 4)
        box("dark", x + side * n, BASE + 2.7, z + d / 2, 0.1, 5.4, 0.17);
    }
    box(facade, x, BASE + 5.15, z + d / 2, w, 0.9, 0.6);
    box("dark", x, BASE + 4.3, z + d / 2 + 1, 9, 0.22, 3.3);
    label(name, x, BASE + 3.63, z + d / 2 + 2.68, Math.min(12, w * 0.6));
    for (let f = 1; f <= floors; f++) {
      const y = BASE + f * FLOOR;
      // Keep the structural slab below the floor datum: top = y - .04.
      // Previously its top (y + .12) was coplanar with the corridor finish,
      // and above the base finish (y + .065), causing flicker on upper floors.
      b.slabs[f] = box(facade, x, y - 0.16, z, w + 0.5, 0.24, d + 0.5);
      if (f === floors) break;
      if (type === "residential") buildResidencePreview(b, f);
      const paneH = FLOOR - 0.52;
      b.windows[f] = [];
      for (const side of [-1, 1]) {
        b.windows[f].push(
          box(
            glass,
            x + side * (w / 2 - 0.02),
            y + FLOOR / 2,
            z,
            0.11,
            paneH,
            d - 0.45,
          ),
        );
        b.windows[f].push(
          box(
            glass,
            x,
            y + FLOOR / 2,
            z + side * (d / 2 - 0.02),
            w - 0.45,
            paneH,
            0.11,
          ),
        );
      }
      for (let wx = -w / 2 + 2; wx < w / 2; wx += 3.6)
        for (const side of [-1, 1]) {
          if (
            !(
              side === 1 &&
              (type === "residential" || type === "hotel") &&
              f >= 2 &&
              f % 2 === 0 &&
              Math.abs(Math.abs(wx) - w * 0.27) < 1.1
            ) &&
            Math.round((wx + w / 2 - 2) / 3.6) % 3 !== 1
          )
            box(
              "dark",
              x + wx,
              y + FLOOR / 2,
              z + (side * d) / 2,
              0.07,
              paneH,
              0.1,
            );
          random(); // Preserve procedural layout seeds without overlapping tinted panes.
        }
      for (let dz = -d / 2 + 2; dz < d / 2; dz += 5.4)
        for (const side of [-1, 1])
          box(
            "dark",
            x + (side * w) / 2,
            y + FLOOR / 2,
            z + dz,
            0.12,
            paneH,
            0.09,
          );
      if (f % 4 === 0) {
        box("dark", x, y - 0.3, z + d / 2 + 0.15, w, 0.24, 0.55);
        box("dark", x - w / 2 - 0.15, y - 0.3, z, 0.55, 0.24, d);
      }
    }
    for (const side of [-1, 1])
      for (const edge of [-1, 1])
        box(
          facade,
          x + (side * w) / 2,
          BASE + b.height / 2,
          z + (edge * d) / 2,
          0.55,
          b.height,
          0.55,
        );
    if (type === "residential" || type === "hotel")
      for (let f = 2; f < floors; f += 2) {
        for (const side of [-1, 1]) {
          box(
            "stone",
            x + side * w * 0.27,
            BASE + f * FLOOR,
            z + d / 2 + 1.3,
            w * 0.32,
            0.22,
            2.6,
          );
          box(
            "metal",
            x + side * w * 0.27,
            BASE + f * FLOOR + 0.8,
            z + d / 2 + 2.5,
            w * 0.32,
            0.85,
            0.07,
          );
        }
      }
    // Rooftop is reachable on every building, complete with safety parapets.
    const ry = BASE + b.height;
    furnishingBuilding = b;
    furnishingFloor = b.floors;
    b.solids[b.floors] = [];
    box("paving", x, ry + 0.1, z, w, 0.2, d);
    for (const side of [-1, 1]) {
      box(facade, x + (side * w) / 2, ry + 0.62, z, 0.4, 1.25, d);
      box(facade, x, ry + 0.62, z + (side * d) / 2, w, 1.25, 0.4);
    }
    box("concrete", x, ry + 2.2, z - d / 2 + 3.2, 6.6, 4.4, 6);
    box("metal", x, ry + 1.7, z - d / 2 + 6.23, 3.2, 3.4, 0.08);
    box("mintGlow", x, ry + 3.65, z - d / 2 + 6.3, 1.8, 0.1, 0.08);
    for (let n = 0; n < 3; n++) {
      furnitureSolid(x + w / 2 - 4, z - d / 2 + 4 + n * 4, 3, 2.5, 1.9);
      box("metal", x + w / 2 - 4, ry + 1, z - d / 2 + 4 + n * 4, 3, 1.7, 2.5);
      for (let k = 0; k < 5; k++)
        box(
          "dark",
          x + w / 2 - 4,
          ry + 1.89,
          z - d / 2 + 3 + n * 4 + k * 0.4,
          2.5,
          0.03,
          0.13,
        );
    }
    for (const side of [-1, 1]) {
      plant(x + side * (w / 2 - 4), ry, z + d / 2 - 4, 1.5);
      sofa(x + side * 8, ry, z + 4);
      table(x + side * 8, ry, z + 1.5, 2.7, 1.3);
    }
    cyl("metal", x - w / 2 + 4, ry + 4, z - d / 2 + 4, 0.07, 8);
    interior(b, 0);
    // Street-side details: bike hoops, planters, terraces, signs and lighting.
    tree(x - 23, z + 22, 0.85);
    tree(x + 23, z + 22, 0.85);
    tree(x + 23, z - 22, 0.8);
    lamp(x - 25, z + 25);
    lamp(x + 25, z - 25);
    bench(x - 12, z + 24);
    cyl("dark", x + 10, 0.85, z + 25, 0.4, 1.2);
    if (type === "cafe") {
      for (const side of [-1, 1]) {
        table(x + side * 12, BASE, z + d / 2 + 4, 2, 1.3);
        chair(x + side * 12 - 1.3, BASE, z + d / 2 + 4, Math.PI / 2);
        chair(x + side * 12 + 1.3, BASE, z + d / 2 + 4, -Math.PI / 2);
        cyl("metal", x + side * 12, 2.2, z + d / 2 + 4, 0.06, 3.8);
        part(
          "cone",
          "paper",
          x + side * 12,
          4.15,
          z + d / 2 + 4,
          2.8,
          0.7,
          2.8,
        );
      }
    }
    return b;
  }
  function park(i, j) {
    const x = i * GRID,
      z = j * GRID;
    parks.push({ x, z });
    box("paving", x, 0.14, z, 54, 0.28, 54);
    for (const side of [-1, 1])
      for (const s2 of [-1, 1]) {
        box("stone", x + side * 16, 0.3, z + s2 * 16, 20, 0.55, 20);
        box("grass", x + side * 16, 0.61, z + s2 * 16, 19.3, 0.08, 19.3);
        tree(x + side * 20, z + s2 * 20, 1.35, false);
        tree(x + side * 11, z + s2 * 19, 1, false);
      }
    box("stone", x, 0.56, z, 12, 0.7, 12);
    box("dark", x, 0.93, z, 10.7, 0.08, 10.7);
    box("water", x, 0.99, z, 10.2, 0.03, 10.2);
    cyl("stone", x, 1.8, z, 1.5, 2.3);
    part("sphere", "gold", x, 4, z, 1.1, 2.3, 1.1, 0.5);
    obstacle(x, z, 12, 12);
    for (const side of [-1, 1]) {
      bench(x + side * 15, z + 5);
      bench(x + side * 15, z - 5);
      lamp(x + side * 25, z + 25);
      lamp(x + side * 25, z - 25);
    }
    if (i === 0 && j === 1) {
      label("CENTRAL GARDEN", x - 16, 1.2, z + 26, 8, "#dfe4d5", "#485c4c");
      landmarks.push({
        x,
        z,
        w: 0,
        d: 0,
        name: "CENTRAL GARDEN",
        jp: "セントラル・ガーデン",
        special: "PARK / PUBLIC ART",
        park: true,
      });
    }
  }
  function createCity() {
    box("soil", 0, -0.3, 0, 1900, 0.4, 1900);
    box("road", 0, -0.05, 0, 660, 0.12, 660);
    for (let i = -4; i <= 5; i++) {
      const v = i * GRID - 36;
      for (let n = -324; n < 325; n += 13) {
        box("line", v, 0.027, n, 0.12, 0.025, 5);
        box("line", n, 0.027, v, 5, 0.025, 0.12);
      }
      // Lane dashes continue between the signal-controlled junctions.
    }
    for (let i = -4; i < 4; i++)
      for (let j = -4; j < 4; j++) {
        const cx = i * 72 + 36,
          cz = j * 72 + 36;
        for (const side of [-1, 1]) {
          for (let stripe = -7; stripe <= 7; stripe++) {
            box(
              "line",
              cx + stripe * 1.13,
              0.036,
              cz + side * 11,
              0.56,
              0.025,
              2.5,
            );
            box(
              "line",
              cx + side * 11,
              0.036,
              cz + stripe * 1.13,
              2.5,
              0.025,
              0.56,
            );
          }
          box(
            "line",
            cx + side * 4.1,
            0.039,
            cz - side * 14.1,
            7.5,
            0.027,
            0.32,
          );
          box(
            "line",
            cx - side * 14.1,
            0.039,
            cz + side * 4.1,
            0.32,
            0.027,
            7.5,
          );
        }
      }
    const parkIds = new Set(["0:1", "-2:-2", "2:2", "-3:3", "3:-2"]);
    for (let i = -4; i <= 4; i++)
      for (let j = -4; j <= 4; j++) {
        if (parkIds.has(`${i}:${j}`)) park(i, j);
        else makeBuilding(i, j);
        for (let n = -24; n <= 24; n += 6) {
          box("curb", i * GRID + n, 0.291, j * GRID + 25, 0.035, 0.012, 3.5);
          box("curb", i * GRID + 25, 0.291, j * GRID + n, 3.5, 0.012, 0.035);
        }
      }
    // A waterline and landscaped perimeter give the city a visible boundary.
    box("water", 0, -0.19, -430, 1500, 0.1, 165);
    box("stone", 0, 0.5, -341, 670, 1, 3);
    for (let x = -310; x <= 310; x += 16) {
      tree(x, 338, 1.1);
      lamp(x, -337);
    }
    label(
      "EVERCITY  /  CENTRAL DISTRICT",
      -14,
      1.6,
      103,
      9,
      "#f0e9d5",
      "#425c57",
    );
  }
  function flushBatches() {
    let count = 0;
    for (const [key, items] of batches) {
      const [kind, name] = key.split(":");
      const geo =
        kind === "box"
          ? boxGeo
          : kind === "cylinder"
            ? cylinderGeo
            : kind === "cone"
              ? coneGeo
              : sphereGeo;
      const mesh = new T.InstancedMesh(geo, materials[name], items.length);
      items.forEach((v, i) => {
        dummy.position.set(v[0], v[1], v[2]);
        dummy.scale.set(v[3], v[4], v[5]);
        dummy.rotation.set(0, v[6], 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.castShadow = ["leaf", "leaf2", "trunk"].includes(name);
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
      batchMeshes.set(key, mesh);
      count += items.length;
    }
    batches.clear();
    console.info(
      "EVERCITY: built",
      buildings.length,
      "enterable buildings;",
      count,
      "instanced architectural / interior components.",
    );
  }
  function localBox(g, key, x, y, z, w, h, d) {
    const m = new T.Mesh(boxGeo, materials[key]);
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  }
  function traffic() {
    const wheelGeo = new T.CylinderGeometry(0.38, 0.38, 0.25, 12);
    for (let n = 0; n < 40; n++) {
      const g = new T.Group(),
        wheels = [],
        color = pick(["whiteCar", "carBlue", "red", "teal", "gold"]);
      localBox(g, color, 0, 0.7, 0, 1.95, 0.7, 4.25);
      localBox(g, color, 0, 1.17, -0.2, 1.74, 0.6, 2.3);
      localBox(g, "glass", 0, 1.27, -1.4, 1.6, 0.43, 0.035);
      localBox(g, "glass", 0, 1.27, 1, 1.6, 0.43, 0.035);
      for (const s of [-1, 1]) {
        localBox(g, "glass", s * 0.88, 1.26, -0.25, 0.03, 0.43, 2.06);
        localBox(g, "glow", s * 0.68, 0.82, -2.15, 0.46, 0.19, 0.035);
        localBox(g, "red", s * 0.68, 0.82, 2.15, 0.46, 0.17, 0.035);
        for (const z of [-1.4, 1.4]) {
          const m = new T.Mesh(wheelGeo, materials.black);
          m.rotation.z = Math.PI / 2;
          m.position.set(s * 0.98, 0.4, z);
          g.add(m);
          wheels.push(m);
        }
      }
      const axis = n % 2,
        dir = n % 4 < 2 ? 1 : -1,
        lane = (Math.floor(random() * 8) - 4) * 72 + 36 + dir * 3.9;
      let pos = 0;
      for (let attempt = 0; attempt < 200; attempt++) {
        pos = random() * 620 - 310;
        const crossing = Math.round((pos - 36) / 72) * 72 + 36;
        if (Math.abs(pos - crossing) < 20) pos = crossing - dir * 21;
        if (
          !vehicles.some(
            (v) =>
              v.axis === axis &&
              Math.abs(v.lane - lane) < 2 &&
              Math.abs(v.pos - pos) < 8,
          )
        )
          break;
      }
      g.rotation.y = axis ? Math.PI / 2 : 0;
      g.rotation.y += dir > 0 ? Math.PI : 0;
      g.position.set(axis ? pos : lane, 0, axis ? lane : pos);
      g.traverse((o) => {
        o.castShadow = false;
      });
      scene.add(g);
      vehicles.push({
        g,
        wheels,
        axis,
        dir,
        lane,
        pos,
        speed: 7 + random() * 6,
      });
    }
    const headGeo = new T.SphereGeometry(0.17, 7, 6),
      bodyGeo = new T.CylinderGeometry(0.2, 0.15, 0.65, 7);
    const skin = new T.MeshStandardMaterial({
      color: "#c49b7b",
      roughness: 0.85,
    });
    for (let n = 0; n < 95; n++) {
      const g = new T.Group();
      const body = new T.Mesh(
        bodyGeo,
        materials[pick(["teal", "navy", "paper", "art", "warm"])],
      );
      body.position.y = 1.08;
      g.add(body);
      const head = new T.Mesh(headGeo, skin);
      head.position.y = 1.62;
      g.add(head);
      const legs = [];
      for (const s of [-1, 1]) {
        const leg = localBox(g, "dark", s * 0.1, 0.48, 0, 0.14, 0.77, 0.17);
        legs.push(leg);
        localBox(g, "warm", s * 0.28, 1.07, 0, 0.105, 0.63, 0.12);
      }
      const axis = n % 2,
        dir = n % 4 < 2 ? 1 : -1,
        lane =
          (Math.floor(random() * 9) - 4) * 72 + dir * 29 + ((n % 3) - 1) * 0.65;
      let pos = 0;
      for (let attempt = 0; attempt < 200; attempt++) {
        pos = random() * 620 - 310;
        const crossing = Math.round((pos - 36) / 72) * 72 + 36;
        if (Math.abs(pos - crossing) < 14) pos = crossing - dir * 15;
        const px = axis ? pos : lane,
          pz = axis ? lane : pos;
        if (
          !blocked(px, pz, false, 0, null) &&
          !people.some(
            (p) =>
              Math.hypot(
                (p.axis ? p.pos : p.lane) - px,
                (p.axis ? p.lane : p.pos) - pz,
              ) < 1,
          )
        )
          break;
      }
      g.position.set(axis ? pos : lane, 0.31, axis ? lane : pos);
      g.traverse((o) => {
        o.castShadow = false;
      });
      scene.add(g);
      people.push({
        g,
        legs,
        axis,
        dir,
        lane,
        pos,
        speed: 1.25 + random() * 0.4,
        phase: random() * 6,
      });
    }
  }
  const activeInterior = new T.Group();
  scene.add(activeInterior);
  const roomLight = new T.PointLight("#ffe5b5", 0, 55, 1.5);
  scene.add(roomLight);
  function hideResidencePreview(b, f) {
    for (const ref of b.previews[f] || []) {
      const mesh = batchMeshes.get(ref.key),
        matrix = new T.Matrix4();
      mesh.getMatrixAt(ref.index, matrix);
      hiddenPreviews.push({ mesh, index: ref.index, matrix });
      mesh.setMatrixAt(ref.index, new T.Matrix4().makeScale(0, 0, 0));
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  function restoreResidencePreview() {
    for (const { mesh, index, matrix } of hiddenPreviews) {
      mesh.setMatrixAt(index, matrix);
      mesh.instanceMatrix.needsUpdate = true;
    }
    hiddenPreviews = [];
  }
  function clearActiveInterior() {
    restoreResidencePreview();
    interactions.clear();
    activeInterior.traverse((obj) => {
      if (obj.isInstancedMesh) obj.dispose();
      if (obj.isMesh && obj.userData.worldSign) {
        obj.material.map.dispose();
        obj.material.dispose();
        obj.geometry.dispose();
        const index = signs.indexOf(obj);
        if (index >= 0) signs.splice(index, 1);
      }
    });
    activeInterior.clear();
  }
  function batchActiveInterior() {
    // Only static direct children using shared primitive geometry can be instanced.
    // Doors/drums are nested groups; panels, emitters, screens and floor-test meshes stay live.
    const groups = new Map();
    for (const mesh of [...activeInterior.children]) {
      if (
        !mesh.isMesh ||
        mesh.userData.dynamicInterior ||
        mesh.userData.floorSurface ||
        mesh.userData.worldSign ||
        mesh.material.transparent ||
        ![boxGeo, cylinderGeo, sphereGeo, coneGeo].includes(mesh.geometry)
      )
        continue;
      const key = `${mesh.geometry.uuid}/${mesh.material.uuid}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(mesh);
    }
    let components = 0,
      batches = 0;
    for (const meshes of groups.values()) {
      if (meshes.length < 2) continue;
      const batch = new T.InstancedMesh(
        meshes[0].geometry,
        meshes[0].material,
        meshes.length,
      );
      meshes.forEach((mesh, i) => {
        mesh.updateMatrix();
        batch.setMatrixAt(i, mesh.matrix);
        activeInterior.remove(mesh);
      });
      batch.castShadow = true;
      batch.receiveShadow = true;
      batch.computeBoundingSphere();
      activeInterior.add(batch);
      components += meshes.length;
      batches++;
    }
    activeInterior.userData.batching = { components, batches };
  }
  function buildBalconyDoors(b, f) {
    if (
      !["residential", "hotel"].includes(b.type) ||
      f < 2 ||
      f % 2 ||
      f >= b.floors
    )
      return;
    const ref = b.windows[f][3],
      mesh = batchMeshes.get(ref.key),
      matrix = new T.Matrix4();
    mesh.getMatrixAt(ref.index, matrix);
    hiddenPreviews.push({ mesh, index: ref.index, matrix });
    mesh.setMatrixAt(ref.index, new T.Matrix4().makeScale(0, 0, 0));
    mesh.instanceMatrix.needsUpdate = true;
    const y = BASE + f * FLOOR,
      z = b.z + b.d / 2,
      centers = [b.x - b.w * 0.27, b.x + b.w * 0.27],
      edge = b.w / 2 - 0.225;
    let left = b.x - edge;
    b.balconies ||= {};
    b.balconies[f] = [];
    for (const [index, x] of centers.entries()) {
      if (x - 1 - left > 0)
        box(
          "facadeGlass",
          (left + x - 1) / 2,
          y + FLOOR / 2,
          z,
          x - 1 - left,
          FLOOR - 0.52,
          0.11,
        );
      box("facadeGlass", x, y + 4.5, z, 2, 1.65, 0.11);
      for (const side of [-1, 1])
        box("metal", x + side, y + 1.8, z, 0.08, 3.6, 0.16);
      const panel = box("facadeGlass", x, y + 1.8, z, 1.92, 3.5, 0.12);
      panel.userData.dynamicInterior = true;
      const handle = box("gold", x + 0.7, y + 1.5, z + 0.09, 0.06, 0.45, 0.08);
      handle.userData.dynamicInterior = true;
      const state = interactions.state(`${b.id}:${f}:balcony:${index}`, {
          open: false,
        }),
        door = { x, z, width: b.w * 0.32, state, amount: state.open ? 1 : 0 };
      b.balconies[f].push(door);
      b.solids[f].push({
        x: x + door.width / 2 - 0.8,
        z: z + 1.45,
        w: 0.6,
        d: 0.35,
        height: 1.1,
      });
      const apply = () => {
        panel.position.x = x + door.amount * 1.95;
        handle.position.x = x + 0.7 + door.amount * 1.95;
      };
      apply();
      interactions.add({
        id: `${b.id}:${f}:balcony:${index}`,
        b,
        f,
        x,
        z,
        y: y + 1.5,
        radius: 3.4,
        kind: "balcony",
        state,
        label: () =>
          state.open ? "バルコニーの扉を閉める" : "バルコニーの扉を開ける",
        activate: () => {
          if (
            state.open &&
            Math.abs(player.x - x) < 1.35 &&
            Math.abs(player.z - z) < 0.55
          ) {
            toast("扉の位置から一歩離れてください");
            return false;
          }
          state.open = !state.open;
          return true;
        },
        animate: (_time, dt) => {
          const target = state.open ? 1 : 0;
          door.amount +=
            Math.sign(target - door.amount) *
            Math.min(Math.abs(target - door.amount), dt * 1.7);
          apply();
        },
      });
      left = x + 1;
    }
    box(
      "facadeGlass",
      (left + b.x + edge) / 2,
      y + FLOOR / 2,
      z,
      b.x + edge - left,
      FLOOR - 0.52,
      0.11,
    );
  }
  function loadFloor(b, f) {
    clearActiveInterior();
    player.floor = f;
    player.building = b;
    player.jump = 0;
    player.velocityY = 0;
    if (f > 0 && f < b.floors) {
      activeBuildGroup = activeInterior;
      interior(b, f);
      buildBalconyDoors(b, f);
      activeBuildGroup = null;
      batchActiveInterior();
      hideResidencePreview(b, f);
    }
    player.x = b.x;
    player.z = b.z - b.d / 2 + (f === b.floors ? 10 : 8.5);
    player.y = BASE + f * FLOOR + 1.7;
    player.yaw = Math.PI;
    player.pitch = 0;
    closeDialogs();
    toast(`${b.jp} / ${floorName(b, f)}`);
    updateLocation();
  }
  function floorName(b, f) {
    if (f === b.floors) return "RF — ルーフトップ";
    if (f === 0)
      return (
        "1F — " +
        {
          office: "ロビー・ワークスペース",
          cafe: "カフェ",
          gallery: "アートギャラリー",
          hotel: "ゲストルーム",
          residential: "コンシェルジュ・ロビー",
          shop: "マーケット",
        }[b.type]
      );
    if (b.type === "residential")
      return `${f + 1}F — 2LDK住戸 × 2${f === b.floors - 1 ? " / 最上階" : ""}`;
    if (f === b.floors - 1) return `${f + 1}F — スカイラウンジ`;
    return (
      `${f + 1}F — ` +
      {
        office: "オフィス",
        cafe: "カフェラウンジ",
        gallery: "展示フロア",
        hotel: "ゲストルーム",
        residential: "レジデンス",
        shop: "ライフスタイルストア",
      }[b.type]
    );
  }
  function openElevator() {
    if (!nearbyElevator) return;
    const b = nearbyElevator;
    $("elevator-title").textContent = b.name;
    $("floor-list").replaceChildren();
    for (let f = b.floors; f >= 0; f--) {
      const btn = document.createElement("button");
      btn.textContent = floorName(b, f);
      if (f === player.floor) {
        btn.setAttribute("aria-current", "true");
        btn.style.borderColor = "#82e3c9";
      }
      btn.onclick = () => loadFloor(b, f);
      $("floor-list").append(btn);
    }
    openDialog("elevator-dialog");
    const selected = $("floor-list").querySelector("[aria-current]");
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView({ block: "nearest" });
  }
  function toast(text) {
    clearTimeout(toastTimer);
    $("toast").textContent = text;
    $("toast").classList.remove("hidden");
    toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 4200);
  }
  function updateDiscovery() {
    const count = buildings.filter((b) => discovered.has(b.id)).length;
    $("discovered-count").textContent = count;
    $("building-count").textContent = buildings.length;
    const pct = Math.round((count / buildings.length) * 100);
    $("explore-percent").textContent = pct + "%";
    $("discovery-bar").style.width = pct + "%";
  }
  const buildingGrid = new Map();
  function findBuilding(x, z) {
    const b = buildingGrid.get(Math.round(x / 72) + ":" + Math.round(z / 72));
    return b &&
      Math.abs(x - b.x) < b.w / 2 - 0.35 &&
      Math.abs(z - b.z) < b.d / 2 - 0.35
      ? b
      : null;
  }
  function updateLocation() {
    currentBuilding =
      player.floor > 0 ? player.building : findBuilding(player.x, player.z);
    if (currentBuilding && !discovered.has(currentBuilding.id)) {
      discovered.add(currentBuilding.id);
      try {
        localStorage.setItem(
          "evercity-exploration-v1",
          JSON.stringify([...discovered]),
        );
      } catch (e) {}
      updateDiscovery();
    }
    let title = "セントラル・ディストリクト",
      en = "CENTRAL DISTRICT";
    const inPark = parks.find(
      (p) => Math.abs(player.x - p.x) < 28 && Math.abs(player.z - p.z) < 28,
    );
    if (inPark) {
      title =
        inPark.x === 0 && inPark.z === 72
          ? "セントラル・ガーデン"
          : "ネイバーフッド・パーク";
      en = "CENTRAL GARDEN";
    }
    if (currentBuilding) {
      title = currentBuilding.jp;
      en = currentBuilding.name;
    } else if (!inPark) {
      if (player.x > 105) {
        title = "イースト・コモンズ";
        en = "EAST COMMONS";
      } else if (player.x < -105) {
        title = "ウエスト・クォーター";
        en = "WEST QUARTER";
      } else if (player.z < -105) {
        title = "ノース・ウォーターフロント";
        en = "NORTH WATERFRONT";
      }
    }
    $("location-name").textContent = title;
    $("area-label").textContent = title;
    $("position-label").textContent = en;
    $("district-name").textContent = currentBuilding ? "BUILDING INTERIOR" : en;
    $("floor-badge").textContent = currentBuilding
      ? player.floor === currentBuilding.floors
        ? "ROOFTOP"
        : `${player.floor + 1}F / ${currentBuilding.floors}F`
      : "OUTDOOR";
    nearbyElevator = null;
    if (currentBuilding) {
      const ez =
        currentBuilding.z -
        currentBuilding.d / 2 +
        (player.floor === currentBuilding.floors ? 7 : 5.2);
      if (Math.hypot(player.x - currentBuilding.x, player.z - ez) < 6)
        nearbyElevator = currentBuilding;
    }
    const item = interactions.nearest(),
      storyItem = stories?.near();
    $("crosshair").classList.toggle(
      "has-target",
      !!item || !!nearbyElevator || !!storyItem,
    );
    $("interaction").classList.toggle(
      "hidden",
      !nearbyElevator && !item && !storyItem,
    );
    if (nearbyElevator)
      $("interaction-label").textContent =
        `${player.floor === nearbyElevator.floors ? "RF" : player.floor + 1 + "F"} / エレベーター`;
    else if (storyItem) $("interaction-label").textContent = storyItem.label;
    else if (item) $("interaction-label").textContent = item.label();
    $("interact-button").textContent = nearbyElevator ? "↕" : "◇";
    $("interact-button").setAttribute(
      "aria-label",
      $("interaction-label").textContent,
    );
    updateResidenceHUD();
    roomLight.intensity = 0; // Illumination now comes from real ceiling fixtures, not a light following the camera.
  }
  function residenceContext() {
    const b = currentBuilding;
    if (
      !b ||
      b.type !== "residential" ||
      player.floor < 1 ||
      player.floor >= b.floors
    )
      return null;
    const units = b.units[player.floor] || [];
    const unit = units.find((u) => {
      const x = (player.x - u.origin) * u.side,
        z = player.z - u.back;
      return x >= 0 && x <= u.width && z >= 0 && z <= u.depth;
    });
    if (!unit) return { b, unit: null, room: "共用廊下" };
    const u = (player.x - unit.origin) * unit.side,
      v = player.z - unit.back;
    const room =
      v < unit.split
        ? u < 5.8
          ? v < 7.1
            ? "バス・ランドリー"
            : "書斎・第二寝室"
          : "主寝室"
        : u < 2.5 && Math.abs(v - unit.depth * 0.72) < 2
          ? "玄関"
          : u > unit.width - 5.6 && v < unit.split + 6
            ? "キッチン"
            : "リビング・ダイニング";
    return { b, unit, room };
  }
  function updateResidenceHUD() {
    const context = residenceContext();
    $("residence-panel").classList.toggle("hidden", !context);
    $("game").classList.toggle("residence-mode", !!context);
    if (!context) return;
    $("residence-room").textContent = context.room;
    $("residence-unit").textContent = context.unit
      ? context.unit.roomNumber + "号室"
      : `${player.floor + 1}F`;
    $("residence-palette").textContent = context.unit
      ? [
          "GARDEN / セージの住まい",
          "WALNUT / 木の温もり",
          "TERRACE / テラコッタ",
        ][context.unit.variant]
      : "2 RESIDENCES / エレベーターホール";
  }
  function openResidenceGuide() {
    const context = residenceContext();
    if (!context) {
      toast("住宅の2階以上で設備ガイドを開けます");
      return;
    }
    const { b } = context,
      unit = context.unit || b.units[player.floor][0];
    $("residence-title").textContent = `${b.jp} / ${unit.roomNumber}号室`;
    $("residence-description").textContent =
      "2LDK · " +
      ["ガーデン", "ウォルナット", "テラコッタ"][unit.variant] +
      "の配色。設備の状態と操作方法を確認できます。";
    const definitions = {
      door: ["玄関扉", "玄関 / 開閉する範囲から離れて操作"],
      switch: ["照明", "玄関のスイッチ / 住戸全体を点灯・消灯"],
      tv: ["テレビ", "リビング / 都市番組・自然番組・OFF"],
      faucet: ["キッチン水栓", "キッチン / 水流と波紋を切り替え"],
      curtain: ["カーテン", "リビングの窓中央 / 左右に開閉"],
      cabinet: ["ワードローブ", "主寝室 / 引き戸を開けて衣類を見る"],
      washer: ["洗濯機", "浴室 / 運転・一時停止・取り出し"],
      fridge: ["冷蔵庫", "キッチン / スライド扉を開けて食品棚を見る"],
    };
    const list = $("residence-equipment");
    list.replaceChildren();
    for (const item of interactions
      .snapshot()
      .filter((i) =>
        i.id.startsWith(`${b.id}:${player.floor}:${unit.side}:`),
      )) {
      const [name, hint] = definitions[item.kind] || [item.kind, ""];
      const row = document.createElement("article"),
        heading = document.createElement("div"),
        title = document.createElement("strong"),
        status = document.createElement("span"),
        note = document.createElement("p");
      title.textContent = name;
      const s = item.state;
      status.textContent =
        item.kind === "tv"
          ? ["OFF", "都市番組", "自然番組"][s.channel]
          : item.kind === "washer"
            ? s.running
              ? "運転中"
              : s.done
                ? "完了"
                : s.remaining > 0
                  ? "一時停止"
                  : "待機"
            : "open" in s
              ? s.open
                ? "開"
                : "閉"
              : s.on
                ? "ON"
                : "OFF";
      status.className = "equipment-status";
      heading.append(title, status);
      note.textContent = hint;
      row.append(heading, note);
      list.append(row);
    }
    drawInteriorMap($("residence-map"), b);
    openDialog("residence-dialog");
  }
  $("residence-panel").onclick = openResidenceGuide;
  function blocked(
    x,
    z,
    dynamic = true,
    atFloor = player.floor,
    inBuilding = player.building,
  ) {
    if (Math.abs(x) > 329 || Math.abs(z) > 330) return true;
    const radius = 0.32;
    const feet = dynamic ? player.jump : 0;
    const intersects = (ob) =>
      feet < (ob.height ?? FLOOR) - 0.02 &&
      Math.abs(x - ob.x) < ob.w + radius &&
      Math.abs(z - ob.z) < ob.d + radius;
    if (stories?.blocked(x, z, atFloor)) return true;
    if (atFloor > 0 && inBuilding) {
      const b = inBuilding;
      const balconies = b.balconies?.[atFloor] || [],
        front = b.z + b.d / 2;
      if (Math.abs(x - b.x) > b.w / 2 - 0.75 || z < b.z - b.d / 2 + 0.75)
        return true;
      if (z > front - 0.75) {
        const balcony = balconies.find(
          (d) => Math.abs(x - d.x) < d.width / 2 - 0.4 && z < front + 2.1,
        );
        if (!balcony) return true;
        if (
          z < front + 0.5 &&
          (Math.abs(x - balcony.x) > 0.65 || (dynamic && balcony.amount < 0.95))
        )
          return true;
      }
      if (
        balconies.some(
          (d) =>
            Math.abs(x - d.x) < 1.3 &&
            Math.abs(z - front) < 0.5 &&
            dynamic &&
            d.amount < 0.95,
        )
      )
        return true;
      if (
        Math.abs(x - b.x) < 3.6 &&
        z < b.z - b.d / 2 + (atFloor === b.floors ? 6.6 : 5.5)
      )
        return true;
      if (dynamic && interactions.blocked(x, z, atFloor, b)) return true;
      return (b.solids[atFloor] || []).some(intersects);
    }
    if (dynamic && trafficSystem?.dynamicBlocked(x, z)) return true;
    for (const b of buildings) {
      const dx = x - b.x,
        dz = z - b.z,
        hw = b.w / 2,
        hd = b.d / 2;
      if (Math.abs(dx) > hw + 1 || Math.abs(dz) > hd + 1) continue;
      if (
        Math.abs(dx) > hw - 0.55 - radius &&
        Math.abs(dx) < hw + 0.3 + radius &&
        Math.abs(dz) < hd + 0.5
      )
        return true;
      if (Math.abs(dz + hd) < 0.35 + radius && Math.abs(dx) < hw + 0.5)
        return true;
      if (
        Math.abs(dz - hd) < 0.3 + radius &&
        Math.abs(dx) > 2.72 &&
        Math.abs(dx) < hw + 0.5
      )
        return true;
      if (Math.abs(dx) < 3.65 && dz < -hd + 5.55 && dz > -hd) return true;
      if ((b.solids[0] || []).some(intersects)) return true;
    }
    for (const ob of obstacles) if (intersects(ob)) return true;
    return false;
  }
  function supportHeight() {
    const b =
      player.floor > 0 ? player.building : findBuilding(player.x, player.z);
    let ground = -0.04;
    if (b) {
      if (player.floor === b.floors) ground = 0.2;
      else if (player.floor > 0 && b.type === "residential") ground = 0.21;
      else
        ground =
          Math.abs(player.x - b.x) < 2.5 &&
          Math.abs(player.z - b.z - 1) < (b.d - 10) / 2
            ? 0.12
            : 0.065;
      if (player.z > b.z + b.d / 2) ground = 0.11;
    }
    if (!b && player.floor === 0) {
      const gx = Math.abs(player.x - Math.round(player.x / 72) * 72),
        gz = Math.abs(player.z - Math.round(player.z / 72) * 72);
      ground = gx > 27 || gz > 27 ? -0.31 : -0.04;
      for (const p of parks)
        if (
          Math.abs(player.x - p.x) > 6 &&
          Math.abs(player.x - p.x) < 26 &&
          Math.abs(player.z - p.z) > 6 &&
          Math.abs(player.z - p.z) < 26
        )
          ground = 0.33;
    }
    const solids = b ? b.solids[player.floor] || [] : obstacles;
    for (const ob of solids) {
      if (
        ob.height !== undefined &&
        Math.abs(player.x - ob.x) < ob.w + 0.25 &&
        Math.abs(player.z - ob.z) < ob.d + 0.25 &&
        ob.height <= player.jump + 0.05
      )
        ground = Math.max(ground, ob.height);
    }
    return ground;
  }
  function move(dx, dz) {
    const startX = player.x,
      startZ = player.z;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / 0.2));
    for (let n = 0; n < steps; n++) {
      if (!blocked(player.x + dx / steps, player.z)) player.x += dx / steps;
      if (!blocked(player.x, player.z + dz / steps)) player.z += dz / steps;
    }
    traveled += Math.hypot(player.x - startX, player.z - startZ);
  }
  const keys = new Set(),
    joy = { x: 0, y: 0 },
    pointer = { drag: false, id: null, x: 0, y: 0, moved: 0 };
  const isTouch = matchMedia("(pointer: coarse)").matches;
  let comfortMode = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function saveControls() {
    try {
      localStorage.setItem(
        "evercity-controls-v1",
        JSON.stringify({ sensitivity, fov: camera.fov, comfortMode }),
      );
    } catch (e) {}
  }
  try {
    const saved = JSON.parse(
      localStorage.getItem("evercity-controls-v1") || "null",
    );
    if (saved && typeof saved === "object") {
      if (Number.isFinite(saved.sensitivity))
        sensitivity = T.MathUtils.clamp(saved.sensitivity, 0.5, 2);
      if (Number.isFinite(saved.fov))
        camera.fov = T.MathUtils.clamp(saved.fov, 55, 95);
      if (typeof saved.comfortMode === "boolean")
        comfortMode = saved.comfortMode;
    }
  } catch (e) {}
  camera.updateProjectionMatrix();
  $("sensitivity").value = sensitivity;
  $("fov").value = camera.fov;
  $("comfort-mode").checked = comfortMode;
  $("comfort-mode").onchange = (e) => {
    comfortMode = e.target.checked;
    saveControls();
  };
  function dialogOpen() {
    return captureBusy || !!document.querySelector("dialog[open]");
  }
  function startGame(lock = false) {
    started = true;
    $("enter-button").classList.add("hidden");
    if (lock && !isTouch && document.pointerLockElement !== $("world")) {
      try {
        const promise = $("world").requestPointerLock();
        if (promise && promise.catch) promise.catch(() => {});
      } catch (e) {}
    }
  }
  $("enter-button").onclick = () => {
    startGame(!isTouch);
    toast(
      isTouch
        ? "左スティックで移動 / 右側をスワイプで見回す"
        : "WASDで移動 / Escでマウスを解放 / 建物の南側から入れます",
    );
  };
  addEventListener("keydown", (e) => {
    if (dialogOpen()) return;
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Space",
      ].includes(e.code)
    ) {
      e.preventDefault();
      startGame();
      keys.add(e.code);
    }
    if (e.code.startsWith("Shift")) keys.add(e.code);
    if (e.repeat) return;
    if (e.code === "KeyM") openMap();
    if (e.code === "KeyE") useNearby();
    if (e.code === "KeyF") toggleFullscreen();
    if (e.code === "KeyH") openResidenceGuide();
    if (e.code === "Space" && player.velocityY === 0) player.velocityY = 4.6;
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", () => {
    keys.clear();
    joy.x = joy.y = 0;
    pointer.drag = false;
    resetJoystick();
  });
  const world = $("world");
  let joyPointer = null;
  const joyOrigin = { x: 0, y: 0 };
  function resetJoystick() {
    joy.x = joy.y = 0;
    joyPointer = null;
    $("joystick").classList.remove("active");
    $("joystick-knob").style.transform = "translate(0,0)";
  }
  function setJoystick(e) {
    let x = e.clientX - joyOrigin.x,
      y = e.clientY - joyOrigin.y;
    const l = Math.hypot(x, y),
      max = 36;
    if (l > max) {
      x = (x / l) * max;
      y = (y / l) * max;
    }
    const strength = Math.max(0, (Math.min(l / max, 1) - 0.12) / 0.88),
      direction = Math.hypot(x, y) || 1;
    joy.x = (x / direction) * strength;
    joy.y = (y / direction) * strength;
    $("joystick-knob").style.transform = `translate(${x}px,${y}px)`;
  }
  world.addEventListener("pointerdown", (e) => {
    if (dialogOpen()) return;
    startGame();
    if (e.pointerType === "touch" && e.clientX < innerWidth * 0.45) {
      if (joyPointer !== null) return;
      joyPointer = e.pointerId;
      joyOrigin.x = e.clientX;
      joyOrigin.y = e.clientY;
      const stick = $("joystick");
      stick.style.left = `${e.clientX - 54}px`;
      stick.style.top = `${e.clientY - 54}px`;
      stick.classList.add("active");
      world.setPointerCapture(e.pointerId);
      setJoystick(e);
      return;
    }
    if (pointer.drag) return;
    pointer.drag = true;
    pointer.id = e.pointerId;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.moved = 0;
    if (!document.pointerLockElement) world.setPointerCapture(e.pointerId);
  });
  world.addEventListener("pointermove", (e) => {
    if (dialogOpen()) return;
    if (e.pointerId === joyPointer) {
      setJoystick(e);
      return;
    }
    if (document.pointerLockElement === world) {
      player.yaw -= e.movementX * 0.002 * sensitivity;
      player.pitch -= e.movementY * 0.002 * sensitivity;
    } else if (pointer.drag && pointer.id === e.pointerId) {
      const dx = e.clientX - pointer.x,
        dy = e.clientY - pointer.y;
      player.yaw -= dx * 0.0032 * sensitivity;
      player.pitch -= dy * 0.0032 * sensitivity;
      pointer.moved += Math.abs(dx) + Math.abs(dy);
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    }
    player.pitch = T.MathUtils.clamp(player.pitch, -1.35, 1.35);
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) =>
    world.addEventListener(type, (e) => {
      if (e.pointerId === joyPointer) {
        resetJoystick();
        return;
      }
      if (pointer.id !== e.pointerId) return;
      pointer.drag = false;
      pointer.id = null;
      if (
        type === "pointerup" &&
        pointer.moved < 4 &&
        e.pointerType === "mouse"
      )
        startGame(true);
    }),
  );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      keys.clear();
      resetJoystick();
      pointer.drag = false;
    }
  });
  $("run-button").onclick = () => {
    running = !running;
    $("run-button").classList.toggle("active", running);
    $("run-button").setAttribute("aria-pressed", String(running));
  };
  function useNearby() {
    if (nearbyElevator) openElevator();
    else {
      if (!stories?.use()) interactions.use();
      updateLocation();
    }
  }
  $("interact-button").onclick = useNearby;
  function openDialog(id) {
    keys.clear();
    resetJoystick();
    pointer.drag = false;
    if (document.pointerLockElement) document.exitPointerLock();
    document.querySelectorAll("dialog[open]").forEach((d) => {
      if (d.id !== id) d.close();
    });
    if (!$(id).open) $(id).showModal();
  }
  function closeDialogs() {
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  }
  document
    .querySelectorAll(".close-dialog")
    .forEach((btn) => (btn.onclick = () => btn.closest("dialog").close()));
  document.querySelectorAll("dialog").forEach((d) =>
    d.addEventListener("click", (e) => {
      if (d.id === "capture-dialog") return;
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          d.close();
      }
    }),
  );
  $("menu-button").onclick = () => {
    document.querySelector('[data-menu-action="residence-panel"]').disabled =
      !residenceContext();
    document.querySelector('[data-menu-action="resume-button"]').disabled =
      $("resume-button").classList.contains("hidden");
    const run = document.querySelector('[data-menu-action="run-button"]');
    run.textContent = running ? "走る：ON" : "走る：OFF";
    run.setAttribute("aria-pressed", String(running));
    openDialog("menu-dialog");
  };
  document.querySelectorAll("[data-menu-action]").forEach(
    (button) =>
      (button.onclick = () => {
        closeDialogs();
        $(button.dataset.menuAction).click();
      }),
  );
  $("help-button").onclick = () => openDialog("help-dialog");
  $("settings-button").onclick = () => openDialog("settings-dialog");
  const fullscreenElement = () =>
    document.fullscreenElement || document.webkitFullscreenElement;
  async function toggleFullscreen() {
    keys.clear();
    resetJoystick();
    pointer.drag = false;
    $("fullscreen-status").textContent = "";
    try {
      if (fullscreenElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (!exit) throw Error("Unsupported fullscreen");
        await exit.call(document);
      } else {
        const root = document.documentElement,
          request = root.requestFullscreen || root.webkitRequestFullscreen;
        if (!request) throw Error("Unsupported fullscreen");
        await request.call(root);
      }
    } catch (error) {
      $("fullscreen-status").textContent =
        "このブラウザでは全画面表示を開始できません。対応するブラウザで開くか、ホーム画面に追加して起動してください。";
      openDialog("settings-dialog");
    }
    syncFullscreen();
  }
  function syncFullscreen() {
    const active = !!fullscreenElement(),
      button = $("fullscreen-button");
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", active ? "全画面を終了" : "全画面表示");
    button.textContent = active ? "⊡" : "⛶";
    resizeWorld();
  }
  $("fullscreen-button").onclick = toggleFullscreen;
  document.addEventListener("fullscreenchange", syncFullscreen);
  document.addEventListener("webkitfullscreenchange", syncFullscreen);
  $("sensitivity").oninput = (e) => {
    sensitivity = Number(e.target.value);
    saveControls();
  };
  $("fov").oninput = (e) => {
    camera.fov = Number(e.target.value);
    camera.updateProjectionMatrix();
    saveControls();
  };
  $("time-select").onchange = (e) => setTime(e.target.value);
  function setTime(mode) {
    timeMode = mode;
    const night = mode === "night",
      day = mode === "day";
    skyUniforms.top.value.set(night ? "#08172d" : day ? "#71b0d3" : "#78a8bf");
    skyUniforms.bottom.value.set(
      night ? "#303e59" : day ? "#d3e6e9" : "#f1d1a6",
    );
    skyUniforms.sunColor.value.set(
      night ? "#000000" : day ? "#ecf5ff" : "#ffe4b7",
    );
    scene.fog.color.set(night ? "#1c2c43" : day ? "#c7dfe5" : "#b4c6c6");
    scene.fog.density = night ? 0.0022 : 0.00165;
    ambient.intensity = night ? 0.16 : day ? 0.68 : 0.44;
    ambient.color.set(night ? "#7c9cc9" : "#c3e5f4");
    sun.intensity = night ? 0.1 : day ? 4.6 : 4.0;
    sun.color.set(night ? "#9db7e0" : day ? "#fff1d9" : "#ffdda7");
    sun.position.set(day ? 90 : -130, day ? 300 : 200, 95);
    renderer.shadowMap.needsUpdate = true;
    for (const name of ["glass", "glassLight", "glassWarm"])
      materials[name].emissiveIntensity = night
        ? name === "glassWarm"
          ? 0.95
          : 0.12
        : 0.09;
    materials.previewGlow.emissiveIntensity = night ? 1.6 : 0.2;
    materials.glow.emissiveIntensity = night ? 3.3 : 1;
    materials.mintGlow.emissiveIntensity = night ? 2 : 0.6;
    $("clock").textContent = night ? "21:08" : day ? "12:30" : "16:42";
    $("weather-icon").textContent = night ? "☾" : "☀";
    $("weather-label").textContent = night ? "晴れ / 19°C" : "晴れ / 24°C";
    environment?.apply();
  }
  function teleport(b) {
    clearActiveInterior();
    player.floor = 0;
    player.building = null;
    player.x = b.park ? b.x + 15 : b.x;
    player.z = b.park ? b.z + 29 : b.z + b.d / 2 + 7;
    player.y = 2.02;
    player.yaw = 0;
    player.pitch = 0.07;
    player.jump = 0;
    player.velocityY = 0;
    closeDialogs();
    startGame();
    updateLocation();
    toast(`${b.jp} に到着しました`);
  }
  function visitApartment(b, f = 3, showcase = false) {
    loadFloor(b, Math.min(f, b.floors - 1));
    const unit = b.units[player.floor][0];
    player.x = unit.entry.x;
    player.z = unit.entry.z;
    player.yaw = Math.PI / 2;
    player.pitch = -0.04;
    if (showcase) {
      player.x = b.x - 3.4 - 2;
      player.z = b.z + b.d / 2 - 4;
      player.yaw = 0.48;
      player.pitch = -0.075;
    }
    startGame();
    updateLocation();
    toast(`${b.jp} / ${player.floor + 1}階・家具付き2LDK`);
  }
  $("apartment-tour").onclick = () =>
    visitApartment(buildings.find((b) => b.name === "MAPLE COURT"));
  $("reset-position").onclick = () => teleport(landmarks.find((b) => b.park));
  function openMap() {
    drawMap($("city-map"), true);
    openDialog("map-dialog");
  }
  $("map-button").onclick = openMap;
  $("landmarks-button").onclick = openMap;
  function setupLandmarks() {
    for (const b of landmarks) {
      const button = document.createElement("button");
      const text = document.createElement("span");
      text.textContent = b.jp;
      const small = document.createElement("small");
      small.textContent = b.special;
      text.append(small);
      const arrow = document.createElement("span");
      arrow.textContent = "↗";
      button.append(text, arrow);
      button.onclick = () => teleport(b);
      $("landmark-list").append(button);
    }
  }
  function drawInteriorMap(canvas, b) {
    const ctx = canvas.getContext("2d"),
      w = canvas.width,
      h = canvas.height,
      s = Math.min((w - 26) / b.w, (h - 30) / b.d),
      px = (x) => w / 2 + (x - b.x) * s,
      pz = (z) => h / 2 + (z - b.z) * s;
    ctx.fillStyle = "#10292b";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#294444";
    ctx.strokeStyle = "#a4bab0";
    ctx.lineWidth = 1;
    ctx.fillRect(px(b.x - b.w / 2), pz(b.z - b.d / 2), b.w * s, b.d * s);
    ctx.strokeRect(px(b.x - b.w / 2), pz(b.z - b.d / 2), b.w * s, b.d * s);
    for (const ob of b.solids[player.floor] || []) {
      ctx.fillStyle = ob.w < 0.2 || ob.d < 0.2 ? "#a6b6a5" : "#61776a";
      ctx.fillRect(
        px(ob.x - ob.w),
        pz(ob.z - ob.d),
        Math.max(1, ob.w * 2 * s),
        Math.max(1, ob.d * 2 * s),
      );
    }
    for (const d of interactions.doors) {
      ctx.strokeStyle = "#e4c68f";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px(d.x), pz(d.z));
      ctx.lineTo(
        px(d.x + Math.sin(d.angle) * 2.2),
        pz(d.z + Math.cos(d.angle) * 2.2),
      );
      ctx.stroke();
    }
    for (const item of interactions.items) {
      if (item.kind === "door") continue;
      ctx.fillStyle = "#9aecd2";
      ctx.beginPath();
      ctx.arc(px(item.x), pz(item.z), 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
    if (canvas.id === "residence-map") {
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      for (const unit of b.units?.[player.floor] || []) {
        const X = (u) => unit.origin + unit.side * u,
          Z = (v) => unit.back + v;
        for (const [text, u, v] of [
          ["LDK", unit.width * 0.5, unit.depth - 7],
          ["主寝室", (6.5 + unit.width) / 2, 8.5],
          ["書斎", 2.7, 11],
          ["浴室", 2.5, 3.6],
          ["キッチン", unit.width - 3, unit.split + 5.5],
        ]) {
          const x = px(X(u)),
            z = pz(Z(v));
          ctx.fillStyle = "#10292beb";
          ctx.fillRect(x - 30, z - 10, 60, 20);
          ctx.fillStyle = "#e0e8d6";
          ctx.fillText(text, x, z + 5);
        }
        ctx.fillStyle = "#e5cfa3";
        ctx.fillText(
          unit.roomNumber,
          px(X(unit.width * 0.5)),
          pz(Z(unit.depth - 1)),
        );
      }
      ctx.textAlign = "left";
    }
    if (stories?.goal()?.b === b) stories.drawGoal(ctx, px, pz);
    ctx.save();
    ctx.translate(px(player.x), pz(player.z));
    ctx.rotate(-player.yaw);
    ctx.fillStyle = "#b7ffe2";
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-4, 4);
    ctx.lineTo(4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#b8cbbf";
    ctx.font = "9px Arial";
    ctx.fillText(
      (player.floor === b.floors ? "RF" : player.floor + 1 + "F") +
        " / FLOOR PLAN",
      10,
      12,
    );
    ctx.fillText("N ↑", w - 24, 12);
    $("coordinates").textContent = player.floor + 1 + "F";
  }
  function drawMap(canvas, full = false) {
    if (!full && currentBuilding) {
      drawInteriorMap(canvas, currentBuilding);
      return;
    }
    const ctx = canvas.getContext("2d"),
      w = canvas.width,
      h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#12292e";
    ctx.fillRect(0, 0, w, h);
    const scale = full ? Math.min((w - 30) / 670, (h - 25) / 670) : 0.98;
    const cx = full ? 0 : player.x,
      cz = full ? 0 : player.z;
    const px = (x) => w / 2 + (x - cx) * scale,
      pz = (z) => h / 2 + (z - cz) * scale;
    ctx.strokeStyle = "#385052";
    ctx.lineWidth = full ? 3 : 9;
    for (let i = -4; i <= 5; i++) {
      let v = i * GRID - 36;
      ctx.beginPath();
      ctx.moveTo(px(v), pz(-337));
      ctx.lineTo(px(v), pz(337));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px(-337), pz(v));
      ctx.lineTo(px(337), pz(v));
      ctx.stroke();
    }
    for (const b of buildings) {
      ctx.fillStyle = discovered.has(b.id)
        ? "#508b7d"
        : b.special
          ? "#9d946f"
          : "#3b5558";
      ctx.fillRect(
        px(b.x - b.w / 2),
        pz(b.z - b.d / 2),
        b.w * scale,
        b.d * scale,
      );
      ctx.strokeStyle = "#75918b45";
      ctx.lineWidth = 0.7;
      ctx.strokeRect(
        px(b.x - b.w / 2),
        pz(b.z - b.d / 2),
        b.w * scale,
        b.d * scale,
      );
      if (b.special) {
        ctx.fillStyle = "#eed6a2";
        ctx.beginPath();
        ctx.arc(px(b.x), pz(b.z), full ? 2 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const p of parks) {
      ctx.fillStyle = "#305b49";
      ctx.fillRect(px(p.x - 26), pz(p.z - 26), 52 * scale, 52 * scale);
      ctx.strokeStyle = "#789377";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px(p.x - 23), pz(p.z));
      ctx.lineTo(px(p.x + 23), pz(p.z));
      ctx.moveTo(px(p.x), pz(p.z - 23));
      ctx.lineTo(px(p.x), pz(p.z + 23));
      ctx.stroke();
    }
    stories?.drawGoal(ctx, px, pz);
    const x = px(player.x),
      y = pz(player.z);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-player.yaw);
    const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, 36);
    grad.addColorStop(0, "#82e3c938");
    grad.addColorStop(1, "#82e3c900");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 36, -Math.PI * 0.7, -Math.PI * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#b6ffe4";
    ctx.strokeStyle = "#112b2a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-5, 5);
    ctx.lineTo(0, 3);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#92b6aa";
    ctx.font = "10px Arial";
    ctx.fillText("N", w - 16, 16);
    ctx.fillText("↑", w - 15, 30);
    if (full) {
      ctx.fillStyle = "#92aaa4";
      ctx.font = "11px Arial";
      ctx.fillText("EVERCITY / 648 × 648 m", 15, h - 14);
      ctx.fillStyle = "#416872";
      ctx.fillRect(px(-335), pz(-360), 670 * scale, 12 * scale);
    }
    $("coordinates").textContent =
      `${Math.round(player.x)}, ${Math.round(player.z)}`;
  }
  function updateTrafficHUD() {
    const s = trafficSystem.snapshot();
    $("traffic-panel").classList.toggle("hidden", !!currentBuilding);
    for (const axis of ["ns", "ew"]) {
      $("signal-" + axis).dataset.state = s[axis];
      $("signal-" + axis).textContent = {
        green: "青",
        yellow: "黄",
        red: "赤",
      }[s[axis]];
    }
    $("walk-signal").textContent = s.walk
      ? "横断できます"
      : s.clearance
        ? "横断を終えてください"
        : "横断待ち";
    $("walk-signal").dataset.state = s.walk ? "green" : "red";
    $("signal-countdown").textContent = s.remaining + "s";
  }
  let cityAudio;
  $("sound-toggle").onchange = async (e) => {
    try {
      cityAudio ||= new EvercityAudio();
      await cityAudio.enabled(e.target.checked);
    } catch (error) {
      e.target.checked = false;
      toast("このブラウザでは環境音を再生できません");
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (cityAudio)
      cityAudio
        .enabled(!document.hidden && $("sound-toggle").checked)
        .catch(() => {});
  });
  let captureBusy = false;
  async function capturePhoto(photoQuality, options = {}) {
    if (captureBusy) throw Error("撮影処理中です。");
    captureBusy = true;
    keys.clear();
    resetJoystick();
    pointer.drag = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const quality = exterior.quality,
      exposure = renderer.toneMappingExposure;
    const markers = [
      stories.beacon,
      ...stories.npcs.flatMap((n) => [n.pin, n.nameplate]),
    ]
      .filter(Boolean)
      .map((mesh) => ({ mesh, visible: mesh.visible }));
    markers.forEach(({ mesh }) => {
      mesh.visible = false;
    });
    try {
      hdr.release();
      exterior.setQuality(photoQuality, { persist: false });
      lightingSystem.setQuality(photoQuality);
      hdr.setQuality(photoQuality);
      exterior.update(1, player, timeMode);
      lightingSystem.update(1, currentBuilding, timeMode, environment.weather);
      sun.shadow.needsUpdate = true;
      renderer.shadowMap.needsUpdate = true;
      if (hdr.enabled) return await hdr.capture(scene, timeMode, options);
      renderer.toneMappingExposure =
        (timeMode === "night" ? 1.35 : timeMode === "day" ? 1.02 : 1.12) *
        2 ** (options.exposure || 0);
      return await EvercityPhotography.direct(
        T,
        renderer,
        scene,
        camera,
        options,
      );
    } finally {
      markers.forEach(({ mesh, visible }) => {
        mesh.visible = visible;
      });
      try {
        exterior.setQuality(quality, { persist: false });
        lightingSystem.setQuality(quality);
        hdr.setQuality(quality);
        renderer.toneMappingExposure = exposure;
        exterior.update(1, player, timeMode);
        lightingSystem.update(
          1,
          currentBuilding,
          timeMode,
          environment.weather,
        );
      } finally {
        captureBusy = false;
        previous = performance.now();
        resizeWorld();
      }
    }
  }
  let lastDialogPaint = 0,
    qualitySeconds = 0,
    slowSeconds = 0;
  const frameTimes = [];
  function adaptiveQuality(dt) {
    if (!$("adaptive-quality").checked || dialogOpen() || document.hidden)
      return;
    qualitySeconds += dt;
    slowSeconds += dt > 0.033 ? dt : 0;
    if (qualitySeconds < 10) return;
    if (slowSeconds > 7) {
      const next = { "hdr-ultra": "ultra", ultra: "high", high: "balanced" }[
        exterior.quality
      ];
      if (next) {
        exterior.setQuality(next, { persist: false });
        lightingSystem.setQuality(next);
        hdr.setQuality(next);
        $("quality-select").value = next;
        toast(
          "動作を安定させるため画質を " +
            next.toUpperCase() +
            " に調整しました",
        );
      }
    }
    qualitySeconds = slowSeconds = 0;
  }
  let previous = performance.now();
  function animate(now) {
    requestAnimationFrame(animate);
    const wallMilliseconds = Math.max(0, now - previous),
      dt = Math.min(wallMilliseconds / 1000, 0.25);
    previous = now;
    if (captureBusy || document.hidden || renderer.getContext().isContextLost())
      return;
    if (dialogOpen() && now - lastDialogPaint < 125) return;
    lastDialogPaint = now;
    frameCount++;
    frameTimes.push(wallMilliseconds);
    if (frameTimes.length > 600) frameTimes.shift();
    adaptiveQuality(dt);
    if (started && !dialogOpen()) {
      let forward =
        (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
        (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) -
        joy.y;
      let strafe =
        (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
        (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) +
        joy.x;
      const len = Math.hypot(forward, strafe);
      if (len > 1) {
        forward /= len;
        strafe /= len;
      }
      const speed =
        (running || keys.has("ShiftLeft") || keys.has("ShiftRight")
          ? 11
          : 4.8) *
        (stories?.coffeeUntil > stories?.time ? 1.25 : 1) *
        (stories?.data.purchases?.includes("shoes") ? 1.08 : 1);
      const dx =
          (-Math.sin(player.yaw) * forward + Math.cos(player.yaw) * strafe) *
          speed *
          dt,
        dz =
          (-Math.cos(player.yaw) * forward - Math.sin(player.yaw) * strafe) *
          speed *
          dt;
      if (len > 0.04) {
        move(dx, dz);
        walkPhase += dt * (speed > 5 ? 12 : 8);
      }
      player.velocityY -= 12 * dt;
      player.jump += player.velocityY * dt;
      const support = supportHeight();
      if (player.jump < support) {
        player.jump = support;
        player.velocityY = 0;
      }
      player.y =
        BASE +
        player.floor * FLOOR +
        1.7 +
        player.jump +
        (len > 0.04 && !comfortMode ? Math.sin(walkPhase) * 0.035 : 0);
    }
    camera.position.set(player.x, player.y, player.z);
    camera.rotation.set(
      player.pitch,
      player.yaw,
      stories?.photoMode ? EvercityPhotography.options().roll : 0,
    );
    hdr.photoMode = !!stories?.photoMode;
    hdr.exposureMultiplier = stories?.photoMode
      ? 2 ** EvercityPhotography.options().exposure
      : 1;
    sky.position.copy(camera.position);
    if (!dialogOpen()) {
      trafficSystem?.update(dt);
      interactions.update(dt);
      stories?.update(dt);
      environment?.update(
        started ? dt : 0,
        !!currentBuilding && player.floor < currentBuilding.floors,
      );
    }
    cityAudio?.update(dt, {
      player,
      vehicles,
      weather: environment?.weather,
      indoor: !!currentBuilding && player.floor < currentBuilding.floors,
      distance: traveled,
      paused: dialogOpen(),
    });
    lightingSystem?.update(dt, currentBuilding, timeMode, environment?.weather);
    skyUniforms.sunDirection.value
      .copy(sun.position)
      .sub(sun.target.position)
      .normalize();
    exterior?.update(dt, player, timeMode);
    if (trafficSystem && frameCount % 8 === 0) updateTrafficHUD();
    if (now - lastMap > 180) {
      updateLocation();
      if (!$("hud-toggle") || $("hud-toggle").checked) drawMap($("minimap"));
      if ($("map-dialog").open) drawMap($("city-map"), true);
      const deg = ((((player.yaw * 180) / Math.PI) % 360) + 360) % 360;
      const dirs = ["N", "NW", "W", "SW", "S", "SE", "E", "NE"];
      $("compass-direction").textContent = dirs[Math.round(deg / 45) % 8];
      lastMap = now;
    }
    hdr.render(scene, timeMode);
  }
  function resizeWorld() {
    if (captureBusy) return;
    resetJoystick();
    pointer.drag = false;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    hdr.resize();
  }
  addEventListener("resize", resizeWorld);
  window.visualViewport?.addEventListener("resize", resizeWorld);
  world.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    $("loading").style.display = "flex";
    $("loading").style.opacity = "1";
    stories?.save();
    $("loading-text").textContent =
      "描画が中断されました。軽量設定で再開できます。";
    $("recover-button").classList.remove("hidden");
  });
  $("recover-button").onclick = () => {
    try {
      localStorage.setItem("evercity-quality-v1", "balanced");
    } catch (e) {}
    location.reload();
  };
  $("hud-toggle").onchange = (e) => {
    document.body.classList.toggle("minimal-hud", !e.target.checked);
    try {
      localStorage.setItem("evercity-hud", String(e.target.checked));
    } catch (e) {}
  };
  try {
    $("hud-toggle").checked = localStorage.getItem("evercity-hud") !== "false";
    document.body.classList.toggle("minimal-hud", !$("hud-toggle").checked);
  } catch (e) {}
  function validateApartmentPaths(b, f) {
    const step = 0.4,
      minX = b.x - b.w / 2 + 0.7,
      minZ = b.z - b.d / 2 + 0.7,
      nx = Math.ceil((b.w - 1.4) / step),
      nz = Math.ceil((b.d - 1.4) / step);
    const open = new Uint8Array(nx * nz),
      seen = new Uint8Array(nx * nz),
      queue = [];
    for (let iz = 0; iz < nz; iz++)
      for (let ix = 0; ix < nx; ix++)
        open[iz * nx + ix] = blocked(
          minX + ix * step,
          minZ + iz * step,
          false,
          f,
          b,
        )
          ? 0
          : 1;
    const index = (x, z) =>
      Math.round((z - minZ) / step) * nx + Math.round((x - minX) / step);
    const start = index(b.x, b.z - b.d / 2 + 8.5);
    if (open[start]) {
      queue.push(start);
      seen[start] = 1;
    }
    for (let q = 0; q < queue.length; q++) {
      const cell = queue[q],
        ix = cell % nx,
        iz = Math.floor(cell / nx);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const xx = ix + dx,
          zz = iz + dz;
        if (xx < 0 || xx >= nx || zz < 0 || zz >= nz) continue;
        const n = zz * nx + xx;
        if (open[n] && !seen[n]) {
          seen[n] = 1;
          queue.push(n);
        }
      }
    }
    const tests = { twoRealApartments: b.units[f].length === 2 };
    b.units[f].forEach((u, i) => {
      tests[`unit${i + 1}_entrance`] = !!seen[index(u.entry.x, u.entry.z)];
      for (const [name, pos] of Object.entries(u.targets))
        tests[`unit${i + 1}_${name}`] = !!seen[index(pos.x, pos.z)];
    });
    tests.ceilingFixtures = (b.lights[f] || []).length >= 10;
    return tests;
  }
  function visualSelfTest() {
    const matrix = new T.Matrix4(),
      position = new T.Vector3(),
      scale = new T.Vector3(),
      rotation = new T.Quaternion();
    const slabBelowFinishes = buildings.every((b) =>
      Object.entries(b.slabs).every(([f, ref]) => {
        batchMeshes.get(ref.key).getMatrixAt(ref.index, matrix);
        matrix.decompose(position, rotation, scale);
        return position.y + scale.y / 2 < BASE + Number(f) * FLOOR - 0.03;
      }),
    );
    const transparentFacades = buildings.every((b) =>
      Object.values(b.windows).every(
        (refs) =>
          refs.length === 4 &&
          refs.every((ref) => {
            const m = batchMeshes.get(ref.key).material;
            return m.transparent && m.opacity <= 0.2 && !m.depthWrite;
          }),
      ),
    );
    const previewCoverage = buildings
      .filter((b) => b.type === "residential")
      .every((b) => Object.keys(b.previews).length === b.floors - 1);
    const previewSwitching = buildings.every((b) =>
      Object.entries(b.previews).every(([f, refs]) =>
        refs.every((ref) => {
          batchMeshes.get(ref.key).getMatrixAt(ref.index, matrix);
          const active = player.building === b && player.floor === Number(f);
          return active ? matrix.elements[0] === 0 : matrix.elements[0] > 0;
        }),
      ),
    );
    return {
      previewCoverage,
      previewSwitching,
      slabBelowFinishes,
      transparentFacades,
      noDuplicateInteriorGlazing: !activeInterior.children.some(
        (o) =>
          o.material === materials.lobbyGlass &&
          Math.max(o.scale.x, o.scale.z) > 10,
      ),
      mapAvailable: typeof $("map-button").onclick === "function",
      floatingStickIdle:
        joyPointer !== null ||
        getComputedStyle($("joystick")).visibility === "hidden",
    };
  }
  function validateFloorSurfaces() {
    const matrix = new T.Matrix4(),
      slabTops = new Map();
    for (const b of buildings)
      for (const [floor, ref] of Object.entries(b.slabs)) {
        const mesh = batchMeshes.get(ref.key);
        if (!mesh) continue;
        mesh.getMatrixAt(ref.index, matrix);
        slabTops.set(
          `${b.id}/${floor}`,
          matrix.elements[13] + Math.abs(matrix.elements[5]) * 0.5,
        );
      }
    const surfaces = [];
    activeInterior.traverse((mesh) => {
      if (mesh.userData.floorSurface) surfaces.push(mesh);
    });
    const indoor =
      player.floor > 0 &&
      player.building &&
      player.floor < player.building.floors;
    const top = indoor
      ? slabTops.get(`${player.building.id}/${player.floor}`)
      : null;
    const base = surfaces.find((mesh) => mesh.userData.floorSurface === "base");
    const corridor = surfaces.find(
      (mesh) => mesh.userData.floorSurface === "corridor",
    );
    const surfaceTop = (mesh) => mesh.position.y + mesh.scale.y * 0.5;
    const residential = indoor && player.building.type === "residential";
    const layout = residential
      ? surfaces.map((mesh) => mesh.userData.floorBounds)
      : [];
    const overlaps = (a, b) =>
      Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-6 &&
      Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 1e-6;
    return {
      allSlabsTracked:
        slabTops.size === buildings.reduce((n, b) => n + b.floors, 0),
      slabsBelowFloorDatum: buildings.every((b) =>
        Object.keys(b.slabs).every(
          (f) => slabTops.get(`${b.id}/${f}`) < BASE + Number(f) * FLOOR - 0.03,
        ),
      ),
      oneActiveFloor: indoor
        ? residential
          ? surfaces.length === residences.floorLayout(player.building).length
          : surfaces.length === 2 && !!base && !!corridor
        : surfaces.length === 0,
      finishesAboveSlab:
        !indoor ||
        (surfaces.length > 0 &&
          surfaces.every(
            (mesh) => mesh.position.y - mesh.scale.y * 0.5 - top > 0.009,
          )),
      noOverlappingResidentialFinishes:
        !residential ||
        layout.every(
          (r, i) => r && layout.slice(i + 1).every((s) => s && !overlaps(r, s)),
        ),
      completeResidentialFloor:
        !residential ||
        Math.abs(
          layout.reduce((area, r) => area + (r.x1 - r.x0) * (r.z1 - r.z0), 0) -
            (player.building.w - 0.6) * (player.building.d - 0.6),
        ) < 0.001,
      levelResidentialFinishes:
        !residential ||
        surfaces.every(
          (mesh) =>
            Math.abs(surfaceTop(mesh) - (BASE + player.floor * FLOOR + 0.21)) <
            0.001,
        ),
      currentFloorOnly:
        !indoor ||
        surfaces.every(
          (mesh) =>
            Math.abs(mesh.position.y - (BASE + player.floor * FLOOR)) < 0.2,
        ),
    };
  }
  function objectSnapshot() {
    const current = player.building || currentBuilding;
    return {
      exterior: exterior?.snapshot(),
      ground: buildings.reduce(
        (n, b) => n + (b.objectDetails?.[0]?.count || 0),
        0,
      ),
      interior: current
        ? current.units?.[player.floor]?.map((u) => u.objects) ||
          [current.objectDetails?.[player.floor]].filter(Boolean)
        : [],
    };
  }
  function objectSelfTest() {
    const props = exterior?.placements || [];
    const clear = (x, z) =>
      !props.some(
        (p) =>
          Math.abs(x - p.x) < p.w / 2 + 0.32 &&
          Math.abs(z - p.z) < p.d / 2 + 0.32,
      );
    return {
      allEntrancesClear: buildings.every((b) => {
        for (let dz = b.d / 2; dz <= 29; dz += 0.25)
          for (const dx of [-2, 0, 2])
            if (!clear(b.x + dx, b.z + dz)) return false;
        return true;
      }),
      pedestrianLanesClear: [...buildings, ...parks].every((b) => {
        for (let n = -29; n <= 29; n++)
          for (const side of [-1, 1])
            if (
              !clear(b.x + n, b.z + side * 29) ||
              !clear(b.x + side * 29, b.z + n)
            )
              return false;
        return true;
      }),
      parkPathsClear: parks.every((p) => {
        for (let n = -26; n <= 26; n++)
          if (!clear(p.x, p.z + n) || !clear(p.x + n, p.z)) return false;
        return true;
      }),
      allGroundFloorsEnriched: buildings.every(
        (b) => b.objectDetails?.[0]?.count > 0,
      ),
      rooftopPropsSolid: buildings.every((b) =>
        b.solids[b.floors]?.some((s) => s.x === b.x + 8 && s.z === b.z + 12),
      ),
      newStreetPropsSolid: props.every((p) =>
        blocked(p.x, p.z, false, 0, null),
      ),
    };
  }
  // A read-only diagnostics hook enables reproducible in-browser validation.
  window.evercity = {
    release: "20260920.1",
    objectSnapshot,
    objectTest: objectSelfTest,
    visualSelfTest,
    floorTest: validateFloorSurfaces,
    residenceSnapshot: () => ({
      room: residenceContext()?.room || null,
      unit: residenceContext()?.unit?.roomNumber || null,
      items: interactions.snapshot(),
    }),
    getState: () => ({
      capturing: captureBusy,
      frameTimes: [...frameTimes],
      buildings: buildings.length,
      parks: parks.length,
      landmarks: landmarks.length,
      position: { x: player.x, y: player.y, z: player.z },
      floor: player.floor,
      inside: currentBuilding?.name || null,
      explored: discovered.size,
      frames: frameCount,
      residentialBuildings: buildings.filter((b) => b.type === "residential")
        .length,
      apartmentCount: buildings
        .filter((b) => b.type === "residential")
        .reduce((n, b) => n + (b.floors - 1) * 2, 0),
      traffic: trafficSystem?.snapshot(),
      lighting: lightingSystem?.snapshot(),
      hdr: hdr.snapshot(),
      story: stories?.data.active,
      storyProgress: stories?.data.progress,
      weather: environment?.weather,
      exterior: exterior?.snapshot(),
      render: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        pixelRatio: renderer.getPixelRatio(),
      },
    }),
    exteriorTest: () => exterior?.selfTest(),
    selfTest: () => {
      const b = buildings.find((v) => v.name === "ATLAS TOWER");
      const old = { ...player };
      player.floor = 0;
      const tests = {
        buildingCount: buildings.length === 76,
        allBuildingsHaveFloors: buildings.every((v) => v.floors >= 4),
        atlasHas25Floors: b.floors === 25,
        entrancePassable: !blocked(b.x, b.z + b.d / 2),
        sideWallSolid: blocked(b.x + b.w / 2, b.z),
        backWallSolid: blocked(b.x, b.z - b.d / 2),
        elevatorCoreSolid: blocked(b.x, b.z - b.d / 2 + 3),
        mapDestinations: landmarks.length === 9,
        groundInteriors: scene.children.some((c) => c.isInstancedMesh),
      };
      player.floor = 1;
      player.building = b;
      tests.upperFloorBoundary = blocked(b.x + b.w / 2 + 1, b.z);
      tests.upperFloorAisle = !blocked(b.x, b.z);
      Object.assign(player, old);
      return tests;
    },
  };
  // Explicit opt-in inspection controls for regression tests, never used by gameplay.
  if (new URLSearchParams(location.search).get("test") === "1")
    window.evercity.debug = {
      stories: () => ({
        data: structuredClone(stories.data),
        missions: stories.missions.map((m) => ({
          id: m.id,
          steps: m.steps.length,
        })),
        npcs: stories.people.map(({ x, z }) => ({ x, z })),
        photoMode: stories.photoMode,
      }),
      photo: (options) => capturePhoto(options.quality, options),
      album: () => stories.photos(),
      capture: () => stories.capture(),
      balcony: () =>
        player.building?.balconies?.[player.floor]?.map(
          ({ x, z, width, amount }) => ({ x, z, width, amount }),
        ) || [],
      buildings: () =>
        buildings.map(({ id, name, type, x, z, w, d, floors }) => ({
          id,
          name,
          type,
          x,
          z,
          w,
          d,
          floors,
        })),
      props: () => exterior.placements.map((p) => ({ ...p })),
      blocked: (x, z) => blocked(x, z, false),
      load: (id, f) => {
        const b = buildings.find((b) => b.id === id);
        if (!b || !Number.isInteger(f) || f < 0 || f > b.floors)
          throw new Error("Invalid test floor");
        loadFloor(b, f);
      },
      paths: () => validateApartmentPaths(player.building, player.floor),
      interactions: () => interactions.selfTest(),
      batching: () => ({
        ...activeInterior.userData.batching,
        meshes: activeInterior.children.length,
      }),
      units: () =>
        JSON.parse(
          JSON.stringify(player.building?.units?.[player.floor] || []),
        ),
      pose: (x, z, yaw, pitch = 0) => {
        player.x = x;
        player.z = z;
        player.yaw = yaw;
        player.pitch = pitch;
        updateLocation();
      },
      use: (id) =>
        interactions.use(interactions.items.find((item) => item.id === id)),
      step: (dt) => interactions.update(dt),
      resources: () => ({
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        signs: signs.length,
      }),
      floorGeometry: () =>
        activeInterior.children
          .filter((m) => m.userData.floorSurface)
          .map((m) => ({
            position: m.position.toArray(),
            scale: m.scale.toArray(),
            bounds: m.userData.floorBounds,
          })),
    };
  setTimeout(() => {
    try {
      exterior = new EvercityExterior({
        THREE: T,
        scene,
        renderer,
        materials,
        obstacle,
        sun,
      });
      createCity();
      for (const b of buildings)
        buildingGrid.set(Math.round(b.x / 72) + ":" + Math.round(b.z / 72), b);
      buildings.forEach((b) => exterior.building(b));
      parks.forEach((p) => exterior.park(p));
      exterior.waterfront();
      exterior.flush();
      exterior.ready = true;
      const qualitySelect = $("quality-select");
      qualitySelect.value = exterior.quality;
      const updateDetailStatus = () => {
        $("detail-status").textContent =
          exterior.snapshot().objectCount.toLocaleString("ja-JP") +
          "個・" +
          Object.keys(exterior.objects).length +
          "種類の新規屋外オブジェクト / " +
          exterior.snapshot().components.toLocaleString("ja-JP") +
          "点の外観パーツ / " +
          (hdr.enabled
            ? exterior.quality === "hdr-ultra"
              ? "HDR ULTRA · 16-bit HDR / 64-sample AO / Bloom"
              : "HDR SUPER LIGHT · 16-bit HDR / 接地AO / Bloom"
            : "ACES / 軽量描画" + (!hdr.supported ? "（HDR非対応GPU）" : "")) +
          " / " +
          (lightingSystem?.snapshot().filter || "PCF") +
          " " +
          sun.shadow.mapSize.x +
          "px";
      };
      qualitySelect.onchange = (e) => {
        exterior.setQuality(e.target.value);
        lightingSystem.setQuality(exterior.quality);
        hdr.setQuality(exterior.quality);
        exterior.update(1, player, timeMode);
        updateDetailStatus();
      };
      flushBatches();
      traffic();
      trafficSystem = new EvercityTraffic({
        THREE: T,
        scene,
        vehicles,
        people,
        player,
        buildings,
        staticBlocked: (x, z) => blocked(x, z, false, 0, null),
      });
      lightingSystem = new EvercityLighting({
        THREE: T,
        scene,
        renderer,
        player,
        streetFixtures,
        vehicles,
        people,
        ambient,
        sun,
        buildings,
        batchMeshes,
      });
      lightingSystem.setQuality(exterior.quality);
      hdr.setQuality(exterior.quality);
      updateDetailStatus();
      setupLandmarks();
      updateDiscovery();
      updateLocation();
      setTime("golden");
      environment = new EvercityEnvironment({
        THREE: T,
        scene,
        renderer,
        player,
        materials,
        sun,
        ambient,
        skyUniforms,
        buildingAt: (x, z) => findBuilding(x, z),
        getTime: () => timeMode,
        setTime,
        toast,
      });
      stories = new EvercityStories({
        THREE: T,
        scene,
        renderer,
        camera,
        player,
        materials,
        buildings,
        label,
        toast,
        openDialog,
        closeDialogs,
        dialogOpen,
        capturePhoto,
        start: () => startGame(),
        started: () => started,
        current: () => currentBuilding,
        loadFloor,
        teleport,
        blocked,
        setTime,
        getTime: () => timeMode,
        environment: () => environment,
      });
      camera.position.set(player.x, player.y, player.z);
      camera.rotation.set(player.pitch, player.yaw, 0);
      const launchParams = new URLSearchParams(location.search);
      if (
        !launchParams.has("spot") &&
        !launchParams.has("test") &&
        stories.resumePosition
      )
        stories.resume();
      $("loading").style.opacity = "0";
      $("loading").style.display = "none";
      $("game").dataset.ready = "true";
      startGame();
      previous = performance.now();
      requestAnimationFrame(animate);
      if (new URLSearchParams(location.search).get("test") === "1") {
        console.info("EVERCITY visual tests", JSON.stringify(visualSelfTest()));
        console.info(
          "EVERCITY self-tests",
          JSON.stringify(window.evercity.selfTest()),
        );
        console.info(
          "EVERCITY traffic tests",
          JSON.stringify(EvercityTraffic.selfTest()),
        );
        console.info(
          "EVERCITY exterior tests",
          JSON.stringify(exterior.selfTest()),
        );
      }
      console.info(
        "EVERCITY living city",
        JSON.stringify({
          residences: buildings.filter((b) => b.type === "residential").length,
          apartments: buildings
            .filter((b) => b.type === "residential")
            .reduce((n, b) => n + 2 * (b.floors - 1), 0),
          intersections: trafficSystem.intersections.length,
          streetFixtures: streetFixtures.length,
        }),
      );
      const params = new URLSearchParams(location.search);
      if (params.get("view") === "night") {
        setTime("night");
        $("time-select").value = "night";
      }
      if (params.get("spot")) {
        const b = landmarks.find((v) =>
          v.name.toLowerCase().includes(params.get("spot").toLowerCase()),
        );
        if (b) teleport(b);
      }
      if (params.has("floor") && params.get("spot")) {
        const b = landmarks.find(
          (v) =>
            !v.park &&
            v.name.toLowerCase().includes(params.get("spot").toLowerCase()),
        );
        if (b) {
          loadFloor(
            b,
            Math.max(
              0,
              Math.min(b.floors, parseInt(params.get("floor"), 10) || 0),
            ),
          );
          startGame();
          if (
            b.type === "residential" &&
            player.floor > 0 &&
            player.floor < b.floors &&
            params.get("room") === "living"
          )
            visitApartment(b, player.floor, true);
        }
      }
      if (params.get("weather")) environment.setWeather(params.get("weather"));
      if (params.get("camera") === "1") stories.toggleCamera(true);
      if (params.get("journal") === "1") stories.openJournal();
      if (params.get("resume") === "1") stories.resume();
      exterior.update(1, player, timeMode);
      lightingSystem.update(1, currentBuilding, timeMode, environment.weather);
      updateTrafficHUD();
      stories.renderHUD();
      startGame();
      if (params.get("test") === "1")
        console.info(
          "EVERCITY floor surface tests",
          JSON.stringify(validateFloorSurfaces()),
        );
      if (params.get("test") === "1") {
        console.info(
          "EVERCITY story tests",
          JSON.stringify(stories.selfTest()),
        );
        console.info(
          "EVERCITY weather tests",
          JSON.stringify(environment.selfTest()),
        );
      }
      if (
        params.get("test") === "1" &&
        currentBuilding?.type === "residential" &&
        player.floor > 0 &&
        player.floor < currentBuilding.floors
      ) {
        console.info(
          "EVERCITY apartment paths",
          JSON.stringify(validateApartmentPaths(currentBuilding, player.floor)),
        );
        if (params.get("test") === "1")
          console.info(
            "EVERCITY interaction tests",
            JSON.stringify(interactions.selfTest()),
          );
      }
    } catch (err) {
      console.error("City initialization failed", err);
      $("loading-text").textContent =
        "街を読み込めませんでした。軽量設定で再開をお試しください。";
      $("recover-button").classList.remove("hidden");
    }
  }, 100);
})();
