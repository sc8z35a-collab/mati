"use strict";
// Run only after approval. The gameplay loop is never patched or paused by this suite.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = (process.env.TEST_URL || "http://127.0.0.1:3000/").replace(
  /\/?$/,
  "/",
);
const artifacts = path.resolve(__dirname, "../.artifacts");
fs.mkdirSync(artifacts, { recursive: true });
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
      viewport: { width: 1280, height: 720 },
    });
    page.setDefaultTimeout(240000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (process.env.THREE_SCRIPT)
      await page.route("**/three.min.js", (r) =>
        r.fulfill({
          path: process.env.THREE_SCRIPT,
          contentType: "application/javascript",
        }),
      );
    await page.addInitScript(() => {
      localStorage.setItem("evercity-quality-v1", "balanced");
      if (!localStorage.getItem("evercity-stories-v3"))
        localStorage.setItem(
          "evercity-stories-v3",
          JSON.stringify({
            version: 3,
            active: "garden",
            progress: { garden: 1 },
            claimed: [],
            credits: 77,
            position: {
              x: 30,
              z: 108,
              yaw: 0.5,
              pitch: 0,
              floor: 0,
              bid: null,
            },
            time: "day",
            weather: "clear",
          }),
        );
    });
    await page.goto(base);
    await page.waitForFunction(
      () => document.querySelector("#game").dataset.ready === "true",
    );
    let state = await page.evaluate(() => evercity.getState());
    assert.equal(state.position.x, 30);
    assert.equal(state.position.z, 108);
    assert(await page.locator("#story-card").isVisible());
    assert(await page.locator(".minimap-panel").isVisible());
    await page.keyboard.press("m");
    assert(await page.locator("#map-dialog").isVisible());
    await page.locator("#map-dialog .close-dialog").click();
    await page.keyboard.press("j");
    assert.equal(await page.locator("#mission-list article").count(), 10);
    await page.locator("#journal-dialog .close-dialog").click();
    const before = await page.evaluate(() => evercity.getState().frames);
    // Wait for actual frames, rather than assuming a sleep corresponds to playable FPS.
    await page.waitForFunction(
      (start) => evercity.getState().frames >= start + 180,
      before,
      { timeout: 180000 },
    );
    state = await page.evaluate(() => evercity.getState());
    const timings = state.frameTimes.slice(-180).sort((a, b) => a - b);
    const perf = {
      viewport: [1280, 720],
      quality: state.exterior.quality,
      p50: timings[90],
      p95: timings[171],
      p99: timings[178],
      frames: state.frames,
      userAgent: await page.evaluate(() => navigator.userAgent),
    };
    fs.writeFileSync(
      path.join(artifacts, "performance.json"),
      JSON.stringify(perf, null, 2),
    );
    assert(timings.every(Number.isFinite));
    if (process.env.MAX_P95_MS)
      assert(
        perf.p95 <= Number(process.env.MAX_P95_MS),
        "real frame-time budget exceeded",
      );
    await page.screenshot({ path: path.join(artifacts, "city-desktop.png") });
    await page.goto(base + "?test=1&spot=maple&floor=2");
    await page.waitForFunction(
      () => document.querySelector("#game").dataset.ready === "true",
    );
    const doors = await page.evaluate(() => evercity.debug.balcony());
    assert.equal(doors.length, 2);
    const b = await page.evaluate(() =>
      evercity.debug.buildings().find((b) => b.name === "MAPLE COURT"),
    );
    const action = await page.evaluate(() =>
      evercity.residenceSnapshot().items.find((i) => i.kind === "balcony"),
    );
    assert(action);
    await page.evaluate(
      ({ b, door, id }) => {
        evercity.debug.pose(door.x, door.z - 2, Math.PI, 0);
        evercity.debug.use(id);
      },
      { b, door: doors[0], id: action.id },
    );
    await page.waitForFunction(() => evercity.debug.balcony()[0].amount > 0.95);
    await page.keyboard.down("w");
    await page.waitForFunction(
      (z) => evercity.getState().position.z > z + 0.65,
      doors[0].z,
    );
    await page.keyboard.up("w");
    assert.equal(
      await page.evaluate(({ x, z }) => evercity.debug.blocked(x, z), {
        x: doors[0].x,
        z: doors[0].z + 2.8,
      }),
      true,
      "balcony parapet remains solid",
    );
    await page.screenshot({ path: path.join(artifacts, "balcony.png") });
    await page.evaluate(() => {
      const button = document.getElementById("save-button");
      button.click();
    });
    const saved = await page.evaluate(
      () => JSON.parse(localStorage.getItem("evercity-stories-v3")).position,
    );
    await page.goto(base);
    await page.waitForFunction(
      () => document.querySelector("#game").dataset.ready === "true",
    );
    state = await page.evaluate(() => evercity.getState());
    assert.equal(state.floor, saved.floor);
    assert(Math.abs(state.position.x - saved.x) < 0.1);
    assert(Math.abs(state.position.z - saved.z) < 0.1);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: path.join(artifacts, "city-mobile.png") });
    assert.deepEqual(errors, []);
    console.log(
      "PASS guidance, ten missions, saved position, balcony traversal; frame-time report and screenshots recorded",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
