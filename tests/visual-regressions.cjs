"use strict";
// AUDIT=1 records baseline failures without failing the run. No performance claims:
// only the simulation RAF is controlled, while real WebGL and browser layout render.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TEST_URL || "http://127.0.0.1:3000/";
const out = path.resolve(
  __dirname,
  "../.artifacts",
  process.env.AUDIT ? "before" : "after",
);
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
      viewport: { width: 640, height: 400 },
      hasTouch: true,
      ignoreHTTPSErrors: true,
    });
    page.setDefaultTimeout(180000);
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
      const raf = requestAnimationFrame;
      window.requestAnimationFrame = (cb) =>
        cb.name === "animate"
          ? ((window.testFrame = () => cb(performance.now())), 0)
          : raf(cb);
      // Inspect the real controller without shipping any new production test hook.
      Object.defineProperty(window, "EvercityStories", {
        configurable: true,
        set(Class) {
          Object.defineProperty(window, "EvercityStories", {
            writable: true,
            configurable: true,
            value: class extends Class {
              constructor(...args) {
                super(...args);
                window.visualStories = this;
              }
            },
          });
        },
      });
      window.rect = (selector) => {
        const e =
          typeof selector === "string"
            ? document.querySelector(selector)
            : selector;
        const b = e.getBoundingClientRect();
        return {
          x: b.x,
          y: b.y,
          w: b.width,
          h: b.height,
          right: b.right,
          bottom: b.bottom,
        };
      };
      window.overlap = (a, b) => {
        a = rect(a);
        b = rect(b);
        return (
          a.w > 0 &&
          b.w > 0 &&
          a.x < b.right &&
          b.x < a.right &&
          a.y < b.bottom &&
          b.y < a.bottom
        );
      };
    });
    await page.goto(base + "?test=1", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelector("#game").dataset.ready === "true",
    );
    await page.waitForTimeout(800);
    const shot = async (name) => {
      await page.screenshot({ path: path.join(out, name + ".png") });
    };
    const check = async (id, label, fn) => {
      const detail = await page.evaluate(fn),
        pass = detail === true;
      results.push({ id, label, pass, detail });
      console.log(
        `${pass ? "PASS" : "FAIL"} ${id} ${label}`,
        pass ? "" : JSON.stringify(detail),
      );
    };
    const close = () =>
      page.evaluate(() =>
        document.querySelectorAll("dialog[open]").forEach((d) => d.close()),
      );
    const click = (id) =>
      page.evaluate((id) => document.getElementById(id).click(), id);
    const size = async (width, height) => {
      await page.setViewportSize({ width, height });
      // Optional lower WebGL framebuffer resolution on memory-limited software GPUs.
      // CSS pixels, UI geometry, camera aspect and assertions remain unchanged.
      if (process.env.VISUAL_RENDER_SCALE)
        await page.evaluate(
          (scale) => visualStories.a.renderer.setPixelRatio(scale),
          Number(process.env.VISUAL_RENDER_SCALE),
        );
      await page.evaluate(() => testFrame());
    };
    for (const [width, height] of [
      [1280, 800],
      [768, 1024],
      [390, 844],
      [320, 568],
      [844, 390],
    ]) {
      await size(width, height);
      for (const [name, id] of [
        ["hud", null],
        ["menu", "menu-button"],
        ["settings", "settings-button"],
        ["map", "map-button"],
        ["journal", "journal-button"],
        ["photo", "camera-button"],
      ]) {
        await close();
        if (id) await click(id);
        await shot(`${width}-${name}`);
        if (name === "photo") await click("camera-close");
      }
    }
    await check(
      "V01",
      "Landscape quest and minimap must not overlap",
      () => !overlap(".story-card", ".minimap-panel"),
    );
    await check(
      "V02",
      "Minimap must preserve world geometry aspect ratio",
      () => {
        const e = document.getElementById("minimap"),
          b = rect(e);
        return (
          Math.abs(b.w / b.h - e.width / e.height) < 0.02 || {
            rendered: b.w / b.h,
            intrinsic: e.width / e.height,
          }
        );
      },
    );
    await check("V03", "Map expand touch target must be at least 44px", () => {
      const b = rect("#map-button");
      return (b.w >= 44 && b.h >= 44) || b;
    });
    await click("settings-button");
    await check(
      "V04",
      "Dialog dismiss touch target must be at least 44px",
      () => {
        const b = rect("#settings-dialog .dialog-heading button");
        return (b.w >= 44 && b.h >= 44) || b;
      },
    );
    await size(320, 568);
    await check(
      "V05",
      "Graphics quality label must not collapse into a vertical column",
      () => {
        const label = document.getElementById("quality-select").parentElement,
          r = document.createRange();
        r.selectNode(label.firstChild);
        const b = r.getBoundingClientRect();
        // Measure wrapping, not a font-dependent arbitrary minimum width.
        return (
          b.height <= parseFloat(getComputedStyle(label).fontSize) * 1.7 || {
            width: b.width,
            height: b.height,
          }
        );
      },
    );
    await click("camera-button");
    await check(
      "V06",
      "Opening camera from settings must dismiss settings overlay",
      () => !document.querySelector("dialog[open]"),
    );
    await shot("camera-from-settings");
    await close();
    await check(
      "V07",
      "Walking control must not cover camera album button",
      () =>
        getComputedStyle(document.getElementById("run-button")).display ===
        "none",
    );
    await check(
      "V08",
      "Camera hint must not overlap settings",
      () => !overlap("#photo-hint", ".photo-options"),
    );
    await check(
      "V09",
      "Camera settings must not obscure the center subject by default",
      () => {
        const b = rect(".photo-options");
        return (
          !b.w ||
          !(
            b.x < innerWidth / 2 &&
            b.right > innerWidth / 2 &&
            b.y < innerHeight / 2 &&
            b.bottom > innerHeight / 2
          )
        );
      },
    );
    // New settings toggle is optional in baseline; evaluate identical expanded content.
    await page.evaluate(() =>
      document.getElementById("photo-options-toggle")?.click(),
    );
    await page.selectOption("#photo-quality", "hdr-ultra");
    await check(
      "V10",
      "Selected photo quality text must fit its control",
      () => {
        const e = document.getElementById("photo-quality"),
          ctx = document.createElement("canvas").getContext("2d");
        ctx.font = getComputedStyle(e).font;
        const textWidth = ctx.measureText(
          e.selectedOptions[0].textContent.trim(),
        ).width;
        return (
          textWidth <= e.clientWidth - 28 || {
            textWidth,
            available: e.clientWidth - 28,
          }
        );
      },
    );
    await shot("camera-expanded");
    await click("camera-close");
    await click("journal-button");
    await check(
      "V11",
      "Journal counts must match ten stories and six residents",
      () =>
        document.querySelector(".journal-summary > span").textContent.trim() ===
        `${visualStories.missions.length} STORIES · ${visualStories.people.length} RESIDENTS`,
    );
    await close();
    await click("settings-button");
    await click("save-button");
    await check(
      "V12",
      "Save feedback must be visible inside the modal top layer",
      () => {
        const modal = document.querySelector("dialog[open]"),
          toast = document.getElementById("toast");
        return (
          modal.contains(toast) ||
          !!modal.querySelector(".dialog-feedback:not(:empty)")
        );
      },
    );
    await shot("modal-feedback");
    await close();
    await click("album-button");
    await page.waitForFunction(
      () =>
        !document
          .getElementById("album-grid")
          .textContent.includes("読み込んで"),
    );
    await check(
      "V13",
      "Empty album message must use the full grid width",
      () => {
        const list = document.getElementById("album-grid"),
          p = list.querySelector("p");
        if (!p) return false;
        const style = getComputedStyle(p);
        return (
          rect(p).w +
            parseFloat(style.marginLeft) +
            parseFloat(style.marginRight) >=
          list.clientWidth - 2
        );
      },
    );
    await check(
      "V14",
      "Album description must not claim a 24-original storage limit",
      () =>
        !document
          .querySelector("#album-dialog > p")
          .textContent.includes("最大24枚"),
    );
    await check(
      "V15",
      "Album description must not claim every 4K image is landscape",
      () =>
        !document
          .querySelector("#album-dialog > p")
          .textContent.includes("4K写真は3840×2160"),
    );
    await shot("album-empty");
    await close();
    // Render a clearly labelled portrait fixture through the real capture/save pipeline.
    await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 180;
      c.height = 320;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#82e3c9";
      ctx.fillRect(0, 0, 180, 320);
      ctx.fillStyle = "#11272a";
      ctx.fillRect(0, 80, 180, 160);
      ctx.fillStyle = "white";
      ctx.font = "16px sans-serif";
      ctx.fillText("PORTRAIT TEST", 20, 155);
      const blob = await new Promise((resolve) => c.toBlob(resolve));
      const original = visualStories.a.capturePhoto;
      visualStories.a.capturePhoto = async () => ({
        blob,
        width: 180,
        height: 320,
        format: "png",
        quality: "BALANCED",
      });
      await visualStories.capture();
      visualStories.a.capturePhoto = original;
    });
    await close();
    await click("album-button");
    await page.waitForSelector("#album-grid article");
    await check(
      "V16",
      "Portrait thumbnails must retain the entire composition",
      () =>
        getComputedStyle(document.querySelector("#album-grid img"))
          .objectFit === "contain",
    );
    await check(
      "V17",
      "Outdoor photo must not be labelled as first floor",
      () =>
        !document
          .querySelector("#album-grid article p")
          .textContent.includes("/ 1F /"),
    );
    await shot("album-portrait");
    await page.locator("#album-grid article button").first().click();
    // Loading the original is asynchronous IndexedDB work, not part of click().
    await page.waitForSelector("#photo-result-dialog[open]");
    await check(
      "V18",
      "Photo result opened from album must offer album return",
      () =>
        [...document.querySelectorAll("#photo-result-dialog button")].some(
          (b) => b.textContent.includes("アルバムに戻る"),
        ),
    );
    await shot("album-result");
    await close();
    const maple = await page.evaluate(() =>
      evercity.debug.buildings().find((b) => b.name === "MAPLE COURT"),
    );
    await page.evaluate((b) => {
      evercity.debug.load(b.id, 2);
      evercity.debug.pose(b.x - 5.4, b.z + b.d / 2 - 4, 0.48, -0.1);
      testFrame();
    }, maple);
    await size(1280, 800);
    await click("residence-panel");
    await check(
      "V19",
      "Desktop equipment must remain alongside the floor plan",
      () => rect("#residence-equipment").x > rect("#residence-map").right,
    );
    await check(
      "V20",
      "Equipment heading count must match visible equipment rows",
      () =>
        Number(
          document
            .querySelector(".equipment-heading")
            .textContent.match(/\d+/)?.[0],
        ) === document.querySelectorAll("#residence-equipment article").length,
    );
    await check(
      "V21",
      "Balcony door must be included in its apartment equipment guide",
      () =>
        [...document.querySelectorAll("#residence-equipment article")].some(
          (e) =>
            e.querySelector("strong").textContent.includes("バルコニー") &&
            e.querySelector("p").textContent.trim().length > 0,
        ),
    );
    await shot("residence-desktop");
    await size(390, 844);
    await shot("residence-mobile");
    await close();
    await size(1280, 800);
    await page.evaluate((b) => {
      evercity.debug.load(b.id, b.floors);
      testFrame();
    }, maple);
    await page.waitForTimeout(220);
    await page.evaluate(() => testFrame());
    await check(
      "V22",
      "Rooftop minimap floor label must be RF",
      () => document.getElementById("coordinates").textContent === "RF",
    );
    await shot("rooftop");
    await size(390, 844);
    await page.evaluate(() => {
      const w = document.getElementById("world");
      // Native pointer capture needs an active pointer. Ignore only that method for this geometry probe.
      const original = w.setPointerCapture;
      w.setPointerCapture = () => {};
      w.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerType: "touch",
          pointerId: 99,
          clientX: 5,
          clientY: innerHeight - 5,
          bubbles: true,
        }),
      );
      w.setPointerCapture = original;
    });
    await check(
      "V23",
      "Edge-touch joystick must remain fully inside the viewport",
      () => {
        const b = rect("#joystick");
        return (
          (b.x >= 0 &&
            b.y >= 0 &&
            b.right <= innerWidth &&
            b.bottom <= innerHeight) ||
          b
        );
      },
    );
    await shot("joystick-edge");
    await check(
      "V24",
      "Camera crop dimensions must use the dynamic viewport",
      () => {
        const style = document.documentElement.style;
        return (
          style.getPropertyValue("--photo-width").includes("dvh") &&
          style.getPropertyValue("--photo-height").includes("dvh")
        );
      },
    );
    results.push({
      id: "runtime",
      label: "No JavaScript exceptions",
      pass: !errors.length,
      detail: errors,
    });
  } finally {
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify(results, null, 2),
    );
    await browser.close();
  }
  const failed = results.filter((r) => !r.pass);
  console.log(
    `${results.length - failed.length}/${results.length} passed; ${failed.length} failures; screenshots: ${out}`,
  );
  if (failed.length && !process.env.AUDIT) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
