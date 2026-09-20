"use strict";
// Uses the project's pinned Three r158, not a renderer mock. BROWSER_TEST=1 also
// compares exact WebGL pixels and actual draw/triangle counters (not FPS claims).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const T = require(process.env.THREE_MODULE || "three");
const context = { window: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "../js/visibility.js"), "utf8"),
  context,
);
const Visibility = context.window.EvercityVisibility;
function unitTests() {
  const v = new Visibility(T),
    camera = new T.PerspectiveCamera(74, 1.6, 0.09, 1200),
    mesh = new T.InstancedMesh(
      new T.BoxGeometry(1, 1, 1),
      new T.MeshBasicMaterial(),
      32,
    ),
    matrix = new T.Matrix4();
  for (let i = 0; i < 32; i++) {
    mesh.setMatrixAt(
      i,
      matrix.makeTranslation((i % 16) * 0.02, 0, i < 16 ? -10 : 10),
    );
    mesh.setColorAt(i, new T.Color(i / 32, 0.3, 0.8));
  }
  const original = mesh.instanceMatrix.array.slice(),
    colors = mesh.instanceColor.array.slice();
  v.register(mesh);
  v.prepare(camera, true);
  assert.equal(mesh.count, 16, "behind-camera instances removed");
  assert.deepEqual(
    mesh.instanceMatrix.array.slice(0, 256),
    original.slice(0, 256),
  );
  const version = mesh.instanceMatrix.version;
  const hits = new T.Raycaster(
    new T.Vector3(),
    new T.Vector3(0, 0, 1),
  ).intersectObject(mesh);
  assert(
    hits.length > 0 && hits.every((hit) => hit.instanceId >= 16),
    "raycast uses original hidden instances and stable IDs",
  );
  assert.equal(mesh.count, 16, "raycast restores draw count");
  assert.equal(
    mesh.instanceMatrix.version,
    version,
    "raycast causes no GPU upload",
  );
  v.prepare(camera, true);
  assert.equal(
    mesh.instanceMatrix.version,
    version,
    "stationary view does not upload",
  );
  camera.rotation.y = Math.PI;
  v.prepare(camera, true);
  assert.equal(mesh.count, 16, "180 degree turn resolves in same frame");
  assert.deepEqual(
    mesh.instanceMatrix.array.slice(0, 256),
    original.slice(256),
  );
  assert.deepEqual(mesh.instanceColor.array.slice(0, 48), colors.slice(48));
  v.prepare(camera, false);
  assert.equal(mesh.count, 32, "quality change restores count");
  assert.deepEqual(mesh.instanceMatrix.array, original);
  assert.deepEqual(mesh.instanceColor.array, colors);
  v.prepare(camera, true);
  mesh.castShadow = true;
  v.prepare(camera, true);
  assert.equal(mesh.count, 32, "off-camera shadow casters retained");
  mesh.castShadow = false;
  v.prepare(camera, true);
  assert.equal(mesh.count, 16, "caster toggle invalidates visibility cache");
  mesh.visible = false;
  v.prepare(camera, true);
  camera.rotation.y = 0;
  v.prepare(camera, true);
  mesh.visible = true;
  v.prepare(camera, true);
  assert.deepEqual(
    mesh.instanceMatrix.array.slice(0, 256),
    original.slice(0, 256),
  );
  camera.setViewOffset(1600, 1000, 1500, 0, 100, 1000);
  v.prepare(camera, true);
  assert.equal(mesh.count, 0, "projection/tile offset invalidates visibility");
  camera.clearViewOffset();
  v.prepare(camera, true);
  assert.equal(mesh.count, 16);
  v.restore();
  assert.deepEqual(
    mesh.instanceMatrix.array,
    original,
    "capture/reflection restore exact data",
  );
  v.setBuildings([{ x: 0, z: 0, w: 20, d: 20, floors: 3 }], 0.4, 5.6);
  v.eye.set(0, 2, 0);
  v.selectOccluders();
  const box = (...a) =>
    new T.Box3(new T.Vector3(...a.slice(0, 3)), new T.Vector3(...a.slice(3)));
  assert(
    v.occluded(box(-1, 1, -21, 1, 3, -19)),
    "back wall occludes fully hidden box",
  );
  assert(
    !v.occluded(box(-1, 1, 19, 1, 3, 21)),
    "open front entrance never occludes",
  );
  assert(
    !v.occluded(box(-1, 1, -11, 1, 3, -9)),
    "straddling wall is not culled",
  );
  assert(
    !v.occluded(box(18, 1, -21, 24, 3, -19)),
    "silhouette corners remain visible",
  );
  assert(
    v.occluded(box(-1, 9, -1, 1, 10, 1)),
    "solid floor hides upper-floor details",
  );
  v.eye.set(0, 8, 0);
  v.selectionEye.set(Infinity, Infinity, Infinity);
  v.selectOccluders();
  assert(
    !v.occluded(box(-1, 7, -21, 1, 9, -19)),
    "upper-floor windows remain transparent",
  );
  console.log(
    "PASS visibility units: buffers, cache, shadows, projection, windows, silhouettes, floors",
  );
}
unitTests();
if (!process.env.BROWSER_TEST) process.exit(0);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { PNG } = require(process.env.PNG_MODULE || "pngjs");
const out = path.resolve(__dirname, "../.artifacts/low-render");
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--disable-dev-shm-usage",
    ],
  });
  const results = [],
    errors = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 800, height: 500 },
      ignoreHTTPSErrors: true,
    });
    page.setDefaultTimeout(180000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && /WebGL|shader|THREE/.test(m.text()))
        errors.push(m.text());
    });
    if (process.env.THREE_SCRIPT)
      await page.route("**/three.min.js", (r) =>
        r.fulfill({
          path: process.env.THREE_SCRIPT,
          contentType: "application/javascript",
        }),
      );
    await page.addInitScript(() => {
      localStorage.setItem("evercity-quality-v1", "balanced");
      const raf = requestAnimationFrame;
      window.requestAnimationFrame = (cb) =>
        cb.name === "animate"
          ? ((window.testFrame = () => cb(performance.now())), 0)
          : raf(cb);
      for (const [name, target] of [
        ["EvercityStories", "testStories"],
        ["EvercityVisibility", "testVisibility"],
      ])
        Object.defineProperty(window, name, {
          configurable: true,
          set(Class) {
            Object.defineProperty(window, name, {
              configurable: true,
              value: class extends Class {
                constructor(...args) {
                  super(...args);
                  window[target] = this;
                }
              },
            });
          },
        });
    });
    await page.goto(
      (process.env.TEST_URL || "http://127.0.0.1:3000/") + "?test=1",
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForFunction(
      () => document.querySelector("#game").dataset.ready === "true",
    );
    await page.evaluate(() => {
      document.getElementById("adaptive-quality").checked = false;
      testFrame();
    });
    const compare = async (name) => {
      const pair = await page.evaluate(() => {
        const a = testStories.a,
          v = testVisibility;
        const shot = (enabled) => {
          v.enabled = enabled;
          const start = performance.now();
          v.prepare(a.camera, true);
          const visibilityMs = performance.now() - start;
          a.renderer.shadowMap.needsUpdate = false;
          a.renderer.render(a.scene, a.camera);
          return {
            image: a.renderer.domElement.toDataURL(),
            render: { ...a.renderer.info.render },
            visibilityMs,
            visibility: v.snapshot(),
            ratio: a.renderer.getPixelRatio(),
          };
        };
        const baseline = shot(false),
          low = shot(true);
        v.prepare(a.camera, true);
        return { baseline, low, cachedUploads: v.snapshot().uploads };
      });
      const images = {};
      for (const [label, sample] of Object.entries({
        baseline: pair.baseline,
        low: pair.low,
      })) {
        const bytes = Buffer.from(sample.image.split(",")[1], "base64");
        fs.writeFileSync(path.join(out, `${name}-${label}.png`), bytes);
        images[label] = PNG.sync.read(bytes);
        delete sample.image;
      }
      assert.equal(images.low.width, images.baseline.width);
      assert.equal(images.low.height, images.baseline.height);
      let different = 0,
        maxDelta = 0;
      for (let i = 0; i < images.low.data.length; i++) {
        const delta = Math.abs(images.low.data[i] - images.baseline.data[i]);
        if (delta) different++;
        maxDelta = Math.max(maxDelta, delta);
      }
      const result = { name, differentChannels: different, maxDelta, ...pair };
      results.push(result);
      console.log(JSON.stringify(result));
      assert.equal(
        different,
        0,
        name + ": identical framebuffer pixels required",
      );
      assert.equal(pair.low.ratio, pair.baseline.ratio);
      assert(
        pair.low.render.triangles <= pair.baseline.render.triangles,
        name + ": no extra triangles",
      );
      assert(
        pair.low.render.calls <= pair.baseline.render.calls,
        name + ": no extra draws",
      );
      assert.equal(pair.cachedUploads, 0);
    };
    await compare("street");
    await page.evaluate(() => {
      const p = testStories.a.player;
      evercity.debug.pose(p.x, p.z, p.yaw + Math.PI);
      testFrame();
    });
    await compare("street-turn");
    const buildings = await page.evaluate(() => evercity.debug.buildings());
    const cafe = buildings.find((b) => b.type === "cafe"),
      home = buildings.find((b) => b.type === "residential");
    for (const [name, b, floor, outside] of [
      ["cafe-entrance", cafe, 0, true],
      ["cafe-inside", cafe, 0, false],
      ["residence-window", home, 2, false],
      ["roof", home, home.floors, false],
    ]) {
      await page.evaluate(
        ({ b, floor, outside }) => {
          evercity.debug.load(b.id, floor);
          evercity.debug.pose(
            b.x,
            b.z + (outside ? b.d / 2 + 4 : 0),
            outside ? 0 : Math.PI,
          );
          testFrame();
        },
        { b, floor, outside },
      );
      await compare(name);
    }
    await page.evaluate((b) => {
      evercity.debug.load(b.id, 0);
      evercity.debug.pose(b.x + b.w / 2 + 2, b.z, Math.PI / 2);
      testFrame();
    }, home);
    await compare("wall-closeup");
    await page.evaluate(() => {
      const e = document.getElementById("time-select");
      e.value = "night";
      e.dispatchEvent(new Event("change"));
      testFrame();
    });
    await compare("night");
    await page.evaluate(() => {
      testStories.a.environment().setWeather("rain");
      testFrame();
    });
    await compare("rain");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => testFrame());
    await compare("portrait");
    for (const suite of [
      "selfTest",
      "visualSelfTest",
      "floorTest",
      "exteriorTest",
      "objectTest",
    ])
      assert(
        Object.values(await page.evaluate((s) => evercity[s](), suite)).every(
          (x) => x === true,
        ),
        suite,
      );
    assert.deepEqual(errors, []);
    assert(
      results.some(
        (r) => r.low.render.triangles < r.baseline.render.triangles * 0.8,
      ),
      "substantial GPU work reduction in at least one representative view",
    );
    console.log("PASS pixel-identical Low rendering and gameplay self-tests");
  } finally {
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ results, errors }, null, 2),
    );
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
