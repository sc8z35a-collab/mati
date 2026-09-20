"use strict";
// Static server required. PLAYWRIGHT_MODULE may point to an isolated Playwright install.
// THREE_SCRIPT optionally supplies the same Three.js version locally for offline/CDN-free tests.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TEST_URL || "http://127.0.0.1:3000/";
const artifacts = path.resolve(__dirname, "../.artifacts");
fs.mkdirSync(artifacts, { recursive: true });
const allTrue = (name, result) => {
  assert(result && Object.keys(result).length, name + ": missing diagnostics");
  assert(
    Object.values(result).every((v) => v === true),
    name + ": " + JSON.stringify(result),
  );
};
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--disable-dev-shm-usage",
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 640, height: 400 },
    });
    page.setDefaultTimeout(180000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    if (process.env.THREE_SCRIPT)
      await page.route("**/three.min.js", (route) =>
        route.fulfill({
          path: process.env.THREE_SCRIPT,
          contentType: "application/javascript",
        }),
      );
    await page.addInitScript(() => {
      localStorage.setItem("evercity-quality-v1", "balanced");
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = (cb) =>
        cb.name === "animate"
          ? ((window.testFrame = () => cb(performance.now())), 0)
          : raf(cb);
    });
    await page.goto(base + "?test=1");
    await page.waitForFunction(
      () => document.querySelector("#game").dataset.ready === "true",
    );
    for (const suite of [
      "selfTest",
      "visualSelfTest",
      "floorTest",
      "exteriorTest",
      "objectTest",
    ]) {
      allTrue(suite, await page.evaluate((suite) => evercity[suite](), suite));
    }
    allTrue("traffic", await page.evaluate(() => EvercityTraffic.selfTest()));
    const initial = await page.evaluate(() => evercity.objectSnapshot());
    assert.equal(initial.exterior.objectCount, 1620);
    assert.equal(Object.keys(initial.exterior.objects).length, 37);
    const exteriorBuildings = await page.evaluate(() =>
      evercity.debug.buildings(),
    );
    const typeCount = (...types) =>
      exteriorBuildings.filter((b) => types.includes(b.type)).length;
    for (const [kind, count] of Object.entries({
      "climbing-planter": typeCount("residential", "hotel"),
      "coffee-cart": typeCount("cafe"),
      "sculpture-plinth": typeCount("gallery"),
      "parcel-locker": typeCount("office", "shop"),
      "herb-garden": 5,
      "community-bookcase": 76,
      "utility-cabinet": 76,
      "sorting-station": 76,
      "pet-care-station": 76,
      "street-clock": 76,
      "cargo-bicycle": 76,
      "ceramic-flower-planter": 152,
      "side-street-bench": 76,
      "garden-lantern": 162,
      "plant-nursery": typeCount("residential", "hotel"),
      "bakery-display": typeCount("cafe", "shop"),
      "art-print-display": typeCount("gallery", "office"),
      "pollinator-bed": 20,
      "garden-lounger": 10,
      "insect-hotel": 10,
      "viewing-scope": 10,
    }))
      assert.equal(initial.exterior.objects[kind], count, kind);
    assert.equal(
      initial.exterior.propColliders,
      initial.exterior.objectCount - exteriorBuildings.length,
    );
    assert(initial.ground > 400);
    console.log(
      "PASS city diagnostics / object counts",
      JSON.stringify(initial),
    );

    // Check AABBs against shells, other added props and the story characters.
    const spatial = await page.evaluate(() => {
      const buildings = evercity.debug.buildings(),
        props = evercity.debug.props();
      const overlaps = (a, b) =>
        Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 0.001 &&
        Math.abs(a.z - b.z) < (a.d + b.d) / 2 - 0.001;
      const pairs = [];
      for (let i = 0; i < props.length; i++)
        for (let j = i + 1; j < props.length; j++)
          if (overlaps(props[i], props[j])) pairs.push([props[i], props[j]]);
      const cafe = buildings.find((b) => b.name === "COMMON GROUNDS"),
        museum = buildings.find((b) => b.name === "MUSEUM OF FORM");
      const characters = [
        { x: 14, z: 94, w: 1.2, d: 1.2 },
        { x: cafe.x + 5, z: cafe.z + cafe.d / 2 + 5, w: 1.2, d: 1.2 },
        { x: museum.x + 5, z: museum.z + museum.d / 2 + 5, w: 1.2, d: 1.2 },
      ];
      return {
        shells: props.filter((p) => buildings.some((b) => overlaps(p, b))),
        pairs,
        characters: props.filter((p) => characters.some((c) => overlaps(p, c))),
      };
    });
    assert.deepEqual(spatial, { shells: [], pairs: [], characters: [] });
    console.log(
      "PASS no new prop/shell or prop/prop overlaps; paths, lanes and collisions",
    );

    const buildings = await page.evaluate(() => evercity.debug.buildings());
    let floors = 0,
      units = 0;
    const variants = new Set();
    for (const b of buildings.filter((b) => b.type === "residential")) {
      // Every residential shell size, both units, all palette variants and top-floor lifecycle.
      for (const f of [...new Set([1, 2, b.floors - 1])]) {
        const result = await page.evaluate(
          ({ id, f }) => {
            evercity.debug.load(id, f);
            return {
              paths: evercity.debug.paths(),
              units: evercity.debug.units(),
              batching: evercity.debug.batching(),
              floor: evercity.floorTest(),
            };
          },
          { id: b.id, f },
        );
        allTrue(b.name + " paths " + f, result.paths);
        allTrue(b.name + " floor " + f, result.floor);
        assert(result.batching.components > 500);
        for (const unit of result.units) {
          assert.equal(unit.objects.count, 19);
          assert.equal(Object.keys(unit.objects.categories).length, 18);
          assert.equal(unit.objects.components, [115, 110, 113][unit.variant]);
          variants.add(unit.variant);
          units++;
        }
        floors++;
      }
    }
    assert.equal(variants.size, 3);
    console.log(
      `PASS ${floors} residential floors / ${units} units / all three palettes`,
    );

    for (const type of ["office", "cafe", "shop", "gallery", "hotel"]) {
      const b = buildings.find((b) => b.type === type);
      const result = await page.evaluate(({ id }) => {
        evercity.debug.load(id, 1);
        return {
          objects: evercity.objectSnapshot().interior,
          test: evercity.floorTest(),
        };
      }, b);
      assert(result.objects[0].count > 0, type);
      allTrue(type, result.test);
    }
    const maple = buildings.find((b) => b.name === "MAPLE COURT");
    const interaction = await page.evaluate((id) => {
      evercity.debug.load(id, 3);
      return evercity.debug.interactions();
    }, maple.id);
    allTrue("interactions", interaction);
    const resources = await page.evaluate((id) => {
      const samples = [];
      for (let n = 0; n < 4; n++) {
        evercity.debug.load(id, 2);
        evercity.debug.load(id, 3);
        samples.push(evercity.debug.resources());
      }
      return samples;
    }, maple.id);
    assert.deepEqual(resources[3], resources[1]);
    console.log(
      "PASS commercial interiors, equipment and repeated floor unloading",
    );

    // Render actual game frames for visual checks, with simulation RAF under test control.
    const cafe = buildings.find((b) => b.name === "COMMON GROUNDS");
    const gallery = buildings.find((b) => b.name === "MUSEUM OF FORM");
    const shots = [
      {
        id: cafe.id,
        f: 0,
        x: cafe.x - 7.2,
        z: cafe.z + 28,
        yaw: 0,
        pitch: -0.1,
        name: "exterior-coffee-cart",
      },
      {
        id: gallery.id,
        f: 0,
        x: gallery.x - 7.2,
        z: gallery.z + 29,
        yaw: 0,
        pitch: 0.04,
        name: "exterior-sculpture",
      },
      {
        id: maple.id,
        f: 0,
        x: maple.x - 7.2,
        z: maple.z + 28,
        yaw: 0,
        pitch: 0,
        name: "exterior-climbing-planter",
      },
      {
        id: maple.id,
        f: 3,
        x: maple.x - 5.4,
        z: maple.z + maple.d / 2 - 4,
        yaw: 0.48,
        pitch: -0.1,
        name: "objects-apartment",
      },
      {
        id: maple.id,
        f: 0,
        x: 7,
        z: 94,
        yaw: -0.78,
        pitch: -0.03,
        name: "objects-park",
      },
      {
        id: maple.id,
        f: 0,
        x: maple.x - 24.5,
        z: maple.z - 12,
        yaw: 0,
        pitch: -0.06,
        name: "objects-street",
      },
    ];
    for (const shot of shots) {
      await page.evaluate((s) => {
        evercity.debug.load(s.id, s.f);
        evercity.debug.pose(s.x, s.z, s.yaw, s.pitch);
        window.testFrame();
      }, shot);
      await page.screenshot({ path: path.join(artifacts, shot.name + ".png") });
      console.log("PASS rendered " + shot.name);
    }
    // Review unobstructed, actual game renders, not generated concept images.
    // Keep a controlled RAF so SwiftShader does not run a costly continuous loop.
    await page.setViewportSize({ width: 1120, height: 700 });
    const cleanView = await page.addStyleTag({
      content: "#game > :not(#world) { visibility: hidden !important; }",
    });
    const detailShots = [
      ["bookcase", maple, -24.5, -16.5, 0, -0.02],
      ["cargo-cycle", maple, -19.3, -20.2, 0.16, -0.14],
      ["street-clock", maple, -3, -18.2, 0.23, 0.2],
      ["ceramic-planter", maple, 18.9, 28, 0.38, -0.13],
      ["nursery", maple, 26, -13.5, 0.38, 0.04],
      ["bakery", cafe, 25.8, -13.6, 0.38, 0.04],
      ["art-display", gallery, 25.8, -13.6, 0.38, 0.04],
      ["service-street", maple, -27, 2, -0.1, -0.02],
      ["rest-bench", maple, 26, 16, 0.45, -0.1],
      ["residential-frontage", maple, -18, 31, -0.62, 0.13],
      ["cafe-frontage", cafe, 18, 31, 0.56, 0.12],
      ["gallery-frontage", gallery, -18, 31, -0.56, 0.13],
      ["garden-flowers", null, 6.6, 89, -0.28, -0.04],
      ["garden-lounger", null, -24, 66, -0.15, -0.13],
      ["garden-habitat", null, -24, 53.5, 0, 0.02],
      ["garden-promenade", null, 2, 98, -0.46, 0.03],
    ];
    for (const [name, b, dx, dz, yaw, pitch] of detailShots) {
      await page.evaluate(
        (s) => {
          evercity.debug.load(s.id, 0);
          evercity.debug.pose(s.x, s.z, s.yaw, s.pitch);
          window.testFrame();
        },
        {
          id: (b || maple).id,
          x: (b?.x || 0) + dx,
          z: (b?.z || 0) + dz,
          yaw,
          pitch,
        },
      );
      await page.screenshot({
        path: path.join(artifacts, "review-" + name + ".png"),
      });
      console.log("PASS visual review " + name);
    }
    // HIGH daytime and night frames exercise shared textures, shadows and emission.
    await page.evaluate(() => {
      // Settle the real environment blend in one controlled test frame.
      // Without this, a paused-RAF "night" screenshot is still mostly daylight.
      const blend = EvercityEnvironment.prototype.blend;
      EvercityEnvironment.prototype.blend = function () {
        blend.call(this, 60);
      };
    });
    await page.selectOption("#quality-select", "high", { force: true });
    for (const mode of ["day", "night"]) {
      await page.selectOption("#time-select", mode, { force: true });
      await page.evaluate((b) => {
        evercity.debug.load(b.id, 0);
        evercity.debug.pose(b.x - 24.5, b.z + 9.5, 0, -0.01);
        window.testFrame();
      }, maple);
      await page.screenshot({
        path: path.join(artifacts, "review-high-" + mode + ".png"),
      });
      console.log("PASS HIGH visual review " + mode);
    }
    await page.selectOption("#quality-select", "balanced", { force: true });
    await page.selectOption("#time-select", "golden", { force: true });
    await cleanView.evaluate((element) => element.remove());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.testFrame());
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: path.join(artifacts, "objects-mobile.png") });
    assert.deepEqual(errors, []);
    console.log(
      "PASS desktop/mobile rendering without JavaScript or shader errors",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
