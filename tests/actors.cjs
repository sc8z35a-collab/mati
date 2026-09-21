"use strict";
// THREE_MODULE / PLAYWRIGHT_MODULE can point at isolated test installs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const T = require(process.env.THREE_MODULE || "three");
const source = path.resolve(__dirname, "../js/actors.js");
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(source, "utf8"), context);
const Actors = context.window.EvercityActors;
const storage = new Map();
storage.getItem = storage.get.bind(storage);
storage.setItem = storage.set.bind(storage);
const actor = (npc = false) => {
  const g = new T.Group();
  for (let i = 0; i < 5; i++)
    g.add(
      new T.Mesh(
        new T.BoxGeometry(),
        new T.MeshStandardMaterial({ color: "#4e8b88" }),
      ),
    );
  const marker = new T.Mesh();
  marker.userData.photoMarker = true;
  g.add(marker);
  return {
    g,
    id: npc ? "ren" : 0,
    legs: g.children.slice(3, 5),
    wheels: g.children.slice(1, 5),
    brakes: [],
  };
};
function units() {
  const car = actor(),
    person = actor(),
    npc = actor(true);
  const brake = new T.Mesh();
  car.brakes.push(brake);
  car.g.add(brake);
  const actors = new Actors({
    THREE: T,
    vehicles: [car],
    people: [person],
    npcs: [npc],
    storage,
  });
  const eye = new T.Vector3();
  actors.update(eye);
  assert.equal(
    actors.cache.size,
    0,
    "normal mode allocates no voxel geometries",
  );
  const twoCells = actors.geometry([[1, 0.5, 0.5, 2, 1, 1, "#fff"]], 1);
  assert.equal(
    twoCells.index.count / 3,
    20,
    "shared/internal voxel faces removed",
  );
  const positions = twoCells.attributes.position,
    normals = twoCells.attributes.normal;
  for (let i = 0; i < twoCells.index.count; i += 3) {
    const ids = [0, 1, 2].map((j) => twoCells.index.getX(i + j));
    const [a, b, c] = ids.map((id) =>
      new T.Vector3().fromBufferAttribute(positions, id),
    );
    const normal = new T.Vector3().fromBufferAttribute(normals, ids[0]);
    assert(b.sub(a).cross(c.sub(a)).dot(normal) > 0, "outward face winding");
  }
  twoCells.dispose();
  actors.setMode("voxel-ultra");
  actors.update(eye);
  assert.equal(actors.snapshot().visible, 3);
  for (const record of actors.records) {
    assert.equal(record.tier, 2);
    assert(record.originals.every((m) => !m.visible));
    assert(record.actor.g.children.find((m) => m.userData.photoMarker).visible);
    assert.equal(
      record.model.children.length,
      5,
      "bounded draw calls, not a mesh per voxel",
    );
    assert(
      record.model.children.every(
        (m) => m.geometry.attributes.position.count > 0,
      ),
    );
  }
  assert(brake.visible, "traffic brake lamps stay active");
  assert.equal(
    actors.records[0].model.children[0].geometry.userData.step,
    0.04,
  );
  assert.equal(
    actors.records[1].model.children[0].geometry.userData.step,
    0.02,
  );
  assert.strictEqual(
    actors.template({ ...actors.records[0], index: 4 }, 2),
    actors.template(actors.records[0], 2),
    "same paint shares car geometry",
  );
  person.legs[0].rotation.x = 0.25;
  car.wheels[0].rotation.x = 1.2;
  actors.update(eye);
  assert.equal(
    actors.records[1].model.children.find((m) => m.name === "leg").rotation.x,
    0.25,
  );
  assert.equal(
    actors.records[1].model.children.find((m) => m.name === "arm").rotation.x,
    -0.25,
  );
  assert.equal(actors.records[0].model.children[1].rotation.x, 1.2);
  eye.z = 60;
  actors.update(eye);
  assert(actors.records.every((r) => r.tier === 0));
  actors.update(eye, true);
  assert(
    actors.records.every((r) => r.tier === 2),
    "photo detail radius expands",
  );
  actors.update(eye);
  assert(
    actors.records.every((r) => r.tier === 0),
    "photo detail restored",
  );
  eye.z = 0;
  actors.setMode("voxel");
  actors.update(eye);
  const cacheSize = actors.cache.size;
  for (let i = 0; i < 5; i++) {
    actors.setMode("standard");
    actors.update(eye);
    assert(
      actors.records.every(
        (r) => !r.model.visible && r.originals.every((m) => m.visible),
      ),
    );
    actors.setMode("voxel");
    actors.update(eye);
  }
  assert.equal(
    actors.cache.size,
    cacheSize,
    "repeated switches do not leak templates",
  );
  const restored = new Actors({
    THREE: T,
    vehicles: [],
    people: [],
    npcs: [],
    storage,
  });
  assert.equal(restored.mode, "voxel");
  restored.setMode("bad-data");
  assert.equal(restored.mode, "standard");
  restored.dispose();
  const denied = new Actors({
    THREE: T,
    vehicles: [],
    people: [],
    npcs: [],
    storage: {
      getItem() {
        throw Error("denied");
      },
      setItem() {
        throw Error("denied");
      },
    },
  });
  denied.setMode("voxel");
  denied.dispose();
  let disposed = 0;
  for (const parts of actors.cache.values())
    for (const p of parts)
      p.geometry.addEventListener("dispose", () => disposed++);
  const geometryCount = [...actors.cache.values()].reduce(
    (n, p) => n + p.length,
    0,
  );
  actors.dispose();
  assert.equal(disposed, geometryCount);
  assert(!car.g.children.some((m) => m.name === "voxel-actor"));
  const sizing = {
    window: {},
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    localStorage: storage,
  };
  vm.runInNewContext(
    fs.readFileSync(path.resolve(__dirname, "../js/exterior.js"), "utf8"),
    sizing,
  );
  const ext = Object.create(sizing.window.EvercityExterior.prototype);
  ext.quality = "balanced";
  ext.renderer = {
    capabilities: { maxTextureSize: 8192 },
    setPixelRatio(r) {
      this.ratio = r;
    },
  };
  ext.setResolution("ultra");
  assert.equal(ext.renderer.ratio, 2, "1920x1080 renders at actual 3840x2160");
  assert.equal(ext.renderer.evercityPixelBudget, 8294400);
  ext.setResolution("auto");
  assert.equal(ext.renderer.ratio, 1);
  sizing.innerWidth = 900;
  sizing.innerHeight = 1600;
  ext.setResolution("ultra");
  assert.equal(ext.renderer.ratio, 2.4, "portrait preserves aspect");
  ext.renderer.capabilities.maxTextureSize = 2048;
  ext.applyResolution();
  assert.equal(ext.renderer.ratio, 1.28, "GPU texture limit respected");
  sizing.innerWidth = 1000;
  sizing.innerHeight = 1000;
  ext.renderer.capabilities.maxTextureSize = 8192;
  ext.applyResolution();
  assert(
    ext.renderer.ratio ** 2 * 1e6 <= 8294400.01,
    "square screen obeys pixel budget",
  );
  console.log(
    "PASS actor geometry, animation, markers, LOD/capture, persistence, disposal and resolution budgets",
  );
}
async function browserTests() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--disable-dev-shm-usage",
    ],
  });
  const artifacts = path.resolve(__dirname, "../.artifacts");
  fs.mkdirSync(artifacts, { recursive: true });
  const errors = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 640, height: 400 },
    });
    page.setDefaultTimeout(180000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && /WebGL|Shader|THREE/.test(m.text()))
        errors.push(m.text());
    });
    if (process.env.THREE_SCRIPT)
      await page.route("**/three.min.js", (route) =>
        route.fulfill({
          path: process.env.THREE_SCRIPT,
          contentType: "application/javascript",
        }),
      );
    // Capture the real constructed system without adding mutable production globals.
    await page.route("**/js/actors.js*", (route) =>
      route.fulfill({
        body:
          fs.readFileSync(source, "utf8") +
          "\nwindow.EvercityActors = new Proxy(window.EvercityActors, { construct(C, args) { const instance = new C(...args); window.__actors = instance; return instance; } });",
        contentType: "application/javascript",
      }),
    );
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("actor-test")) {
        localStorage.clear();
        localStorage.setItem("evercity-quality-v1", "balanced");
        sessionStorage.setItem("actor-test", "1");
      }
    });
    await page.goto(process.env.TEST_URL || "http://127.0.0.1:3000/?test=1", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector('#game[data-ready="true"]');
    console.log("PASS real game boot");
    await page.evaluate(() => {
      document.querySelector("#settings-dialog").showModal();
      document.querySelector("#adaptive-quality").checked = false;
    });
    const choose = async (id, value) => page.selectOption(id, value);
    await choose("#actor-style", "voxel-ultra");
    assert.equal(
      await page.evaluate(() => window.__actors.snapshot().visible),
      141,
    );
    assert(
      await page.evaluate(() =>
        window.__actors.records.every((r) =>
          r.originals.every((m) => !m.visible),
        ),
      ),
    );
    await page.screenshot({ path: path.join(artifacts, "voxel-settings.png") });
    await choose("#render-resolution", "ultra");
    const dimensions = await page.evaluate(() => {
      const c = document.querySelector("#world");
      return [c.width, c.height];
    });
    assert(
      dimensions[0] * dimensions[1] <= 8294400 && dimensions[0] > 3000,
      JSON.stringify(dimensions),
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('#game[data-ready="true"]');
    assert.equal(await page.inputValue("#actor-style"), "voxel-ultra");
    assert.equal(await page.inputValue("#render-resolution"), "ultra");
    await page.evaluate(() =>
      document.querySelector("#settings-dialog").showModal(),
    );
    await choose("#render-resolution", "auto");
    await choose("#actor-style", "standard");
    assert(
      await page.evaluate(() =>
        window.__actors.records.every((r) =>
          r.originals.every((m) => m.visible),
        ),
      ),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await choose("#actor-style", "voxel");
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: path.join(artifacts, "voxel-mobile-settings.png"),
    });
    // Dedicated close-up uses the exact production models and real WebGL shaders.
    await page.setViewportSize({ width: 1200, height: 720 });
    await page.evaluate(() => {
      document.querySelectorAll("dialog[open]").forEach((d) => d.close());
      const T = THREE,
        scene = new T.Scene();
      scene.background = new T.Color("#dbe5e2");
      const camera = new T.PerspectiveCamera(40, 1200 / 720, 0.1, 100);
      camera.position.set(7, 4.2, 8);
      camera.lookAt(0, 0.85, 0);
      const r = new T.WebGLRenderer({ antialias: true });
      r.setSize(1200, 720);
      r.setPixelRatio(1);
      r.outputColorSpace = T.SRGBColorSpace;
      r.toneMapping = T.ACESFilmicToneMapping;
      r.domElement.style.cssText = "position:fixed;inset:0;z-index:99999";
      document.body.append(r.domElement);
      scene.add(new T.HemisphereLight("#dcecff", "#a49a86", 2.6));
      const sun = new T.DirectionalLight("#fff5df", 3);
      sun.position.set(5, 7, 4);
      scene.add(sun);
      const ground = new T.Mesh(
        new T.PlaneGeometry(50, 50),
        new T.MeshStandardMaterial({ color: "#adbdb6", roughness: 1 }),
      );
      ground.rotation.x = -Math.PI / 2;
      scene.add(ground);
      const system = window.__actors;
      system.setMode("voxel-ultra", false);
      const records = [
        system.records[0],
        system.records[40],
        system.records[135],
      ];
      records.forEach((rec, i) => {
        system.useTier(rec, 2);
        const g = rec.model.clone();
        g.visible = true;
        g.position.set(
          i === 0 ? -1.6 : 1.2 + (i - 1) * 1.2,
          0,
          i === 0 ? 0 : 0.7,
        );
        if (i === 0) g.rotation.y = Math.PI * 0.9;
        scene.add(g);
      });
      r.render(scene, camera);
    });
    await page.screenshot({
      path: path.join(artifacts, "voxel-actors-closeup.png"),
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS 141 real actors, UI switches, persisted reload, actual high resolution, mobile layout and WebGL close-up",
    );
  } finally {
    await browser.close();
  }
}
units();
if (process.env.BROWSER_TEST === "1")
  browserTests().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
