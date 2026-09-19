"use strict";
// Real app loop. Full 4K is required by default; no silent skip or paused RAF.
// Requires a running server, WebGL browser and prior user approval.
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
    const context = await browser.newContext({
      viewport: { width: 960, height: 600 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(480000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (process.env.THREE_SCRIPT)
      await page.route("**/three.min.js", (route) =>
        route.fulfill({
          path: process.env.THREE_SCRIPT,
          contentType: "application/javascript",
        }),
      );
    await page.addInitScript(() =>
      localStorage.setItem("evercity-quality-v1", "balanced"),
    );
    await page.goto(base + "?test=1&camera=1");
    await page.waitForFunction(
      () => document.querySelector("#game").dataset.ready === "true",
    );
    const quality = (id, value) => page.selectOption(id, value);
    // The photo frame and 3D projection must agree for portrait, square and landscape.
    for (const aspect of [
      "1.7777777777777777",
      "1.3333333333333333",
      "1",
      "0.5625",
    ]) {
      await quality("#photo-aspect", aspect);
      const frame = await page.locator(".photo-grid").boundingBox();
      assert(Math.abs(frame.width / frame.height - Number(aspect)) < 0.003);
    }
    await quality("#photo-aspect", "1.7777777777777777");
    await quality("#photo-resolution", "3840");
    async function capture(qualityValue, filename) {
      await quality("#photo-quality", qualityValue);
      await page.locator("#shutter-button").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#photo-result-dialog").open ||
          document.querySelector("#photo-status").textContent,
      );
      assert.equal(await page.locator("#photo-status").textContent(), "");
      await page.waitForFunction(
        () =>
          document.querySelector("#photo-result-image").naturalWidth === 3840,
      );
      assert.deepEqual(
        await page
          .locator("#photo-result-image")
          .evaluate((i) => [i.naturalWidth, i.naturalHeight]),
        [3840, 2160],
      );
      const pending = page.waitForEvent("download");
      await page.locator("#photo-download").click();
      const download = await pending;
      await download.saveAs(path.join(artifacts, filename));
      const png = fs.readFileSync(path.join(artifacts, filename));
      assert.equal(png.readUInt32BE(16), 3840);
      assert.equal(png.readUInt32BE(20), 2160);
      const state = await page.evaluate(() => evercity.getState());
      assert.equal(state.capturing, false);
      assert.equal(state.hdr.quality, "balanced");
      await page.locator("#photo-result-dialog .close-dialog").first().click();
    }
    await capture("balanced", "city-balanced-4k.png");
    const supported = await page.evaluate(
      () => evercity.getState().hdr.supported,
    );
    assert(
      supported,
      "HDR unavailable on this GPU: full HDR verification is BLOCKED, not passed",
    );
    await capture("hdr-ultra", "city-hdr-ultra-4k.png");
    // Interrupt at a render boundary and ensure all state is restored.
    await page.evaluate(() => {
      const original = EvercityHDR.prototype.capture;
      EvercityHDR.prototype.capture = async function (scene, mode, options) {
        try {
          return await original.call(this, scene, mode, {
            ...options,
            progress: (text, value) => {
              options.progress(text, value);
              document.getElementById("capture-cancel").click();
            },
          });
        } finally {
          EvercityHDR.prototype.capture = original;
        }
      };
      document.getElementById("shutter-button").click();
      document.getElementById("shutter-button").click();
    });
    await page.waitForFunction(() =>
      document.querySelector("#photo-status").textContent.includes("中止"),
    );
    assert.equal(
      await page.evaluate(() => evercity.getState().capturing),
      false,
    );
    // Alpha-cutout foliage must not become a solid wall in the framing ray.
    const framing = await page.evaluate(() => {
      const camera = new THREE.PerspectiveCamera(74, 1.6, 0.1, 100);
      camera.position.set(0, 0, 0);
      camera.updateMatrixWorld();
      const scene = new THREE.Scene(),
        target = { x: 0, y: 0, z: -10 },
        photo = EvercityPhotography.camera(camera, 16 / 9);
      const clear = EvercityPhotography.framed(THREE, photo, target, scene);
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(3, 3, 1),
        new THREE.MeshBasicMaterial(),
      );
      wall.position.z = -5;
      scene.add(wall);
      const blocked = !EvercityPhotography.framed(THREE, photo, target, scene);
      return {
        clear,
        blocked,
        outside: !EvercityPhotography.framed(
          THREE,
          photo,
          { x: 9, y: 0, z: -3 },
          new THREE.Scene(),
        ),
      };
    });
    assert(Object.values(framing).every(Boolean), JSON.stringify(framing));
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector("#game").dataset.ready === "true",
    );
    await page.locator("#photo-album-button").click();
    await page.waitForFunction(
      () => document.querySelectorAll("#album-grid article").length === 2,
    );
    const preview = await page.evaluate(() => evercity.debug.album());
    assert(preview.every((p) => p.thumbnail && !p.blob));
    await page.screenshot({ path: path.join(artifacts, "album.png") });
    await page.locator("#album-dialog .close-dialog").click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: path.join(artifacts, "camera-mobile.png") });
    assert.deepEqual(errors, []);
    console.log(
      "PASS actual 4K light/HDR export, projection, occlusion, cancellation, persistence and mobile bounds",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
