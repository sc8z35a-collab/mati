"use strict";
// Integration regression for detail plugins (js/detail-*.js).
// Boots the real game once (?test=1), then checks:
//  - every plugin registered, no hook failed, every selfTest value true
//  - existing exterior/object/visual self-tests still all true (no regressions in walkways)
//  - draw-call / triangle budgets (DETAIL_MAX_CALLS, DETAIL_MAX_TRIANGLES)
//  - no page errors in day / night / rain
// Env: TEST_URL, PLAYWRIGHT_MODULE, THREE_SCRIPT
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TEST_URL || "http://127.0.0.1:3000/";
const maxCalls = Number(process.env.DETAIL_MAX_CALLS || 2600);
const maxTriangles = Number(process.env.DETAIL_MAX_TRIANGLES || 3500000);
(async () => {
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"],
  });
  const failures = [];
  const fail = (m) => { failures.push(m); console.log("FAIL", m); };
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
    page.setDefaultTimeout(300000);
    page.on("pageerror", (e) => fail("pageerror: " + e.message));
    page.on("console", (m) => {
      const t = m.text();
      if (m.type() === "error" && !/ERR_FAILED|Failed to load resource/.test(t)) fail("console.error: " + t.slice(0, 300));
      if (/^EVERCITY [a-z -]*(tests|paths) \{/.test(t) && /:false/.test(t)) fail("selftest: " + t.slice(0, 400));
    });
    if (process.env.THREE_SCRIPT)
      await page.route("**/three.min.js", (r) => r.fulfill({ path: process.env.THREE_SCRIPT, contentType: "application/javascript" }));
    await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
    await page.addInitScript(() => localStorage.setItem("evercity-quality-v1", "balanced"));
    await page.goto(base + "?test=1");
    await page.waitForFunction(() => document.querySelector("#game").dataset.ready === "true" ||
      !document.querySelector("#recover-button").classList.contains("hidden"));
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({
      details: evercity.details(),
      objects: evercity.objectTest(),
      visual: evercity.visualSelfTest(),
      exterior: evercity.exteriorTest(),
      render: evercity.getState().render,
    }));
    const names = r.details.map((d) => d.name).sort().join(",");
    if (names !== "atmos,facade,street") fail("plugins registered: " + names);
    for (const d of r.details) if (d.failed) fail(`plugin ${d.name} hook failed: ${JSON.stringify(d.failed)}`);
    for (const k of ["objects", "visual", "exterior"])
      for (const [name, ok] of Object.entries(r[k])) if (ok !== true) fail(`${k}.${name} = ${ok}`);
    console.log("render", JSON.stringify(r.render), "plugins", JSON.stringify(r.details.map((d) => [d.name, d.stats])));
    if (r.render.calls > maxCalls) fail(`draw calls ${r.render.calls} > ${maxCalls}`);
    if (r.render.triangles > maxTriangles) fail(`triangles ${r.render.triangles} > ${maxTriangles}`);
    for (const [mode, weather] of [["night", "clear"], ["day", "rain"]]) {
      await page.evaluate(([mode, weather]) => {
        const t = document.getElementById("time-select");
        t.value = mode; t.onchange({ target: { value: mode } });
        document.getElementById("weather-select").value = weather;
        document.getElementById("weather-select").onchange({ target: { value: weather } });
      }, [mode, weather]);
      await page.waitForTimeout(2500);
      const after = await page.evaluate(() => evercity.details().filter((d) => d.failed).map((d) => d.name));
      if (after.length) fail(`${mode}/${weather}: failed plugins ${after}`);
    }
    // Upper floor: interior/floorLoaded hooks must survive a real floor load.
    await page.evaluate(() => evercity.debug.load("0:0", 3));
    await page.waitForTimeout(1500);
    const upper = await page.evaluate(() => evercity.details().filter((d) => d.failed).map((d) => d.name));
    if (upper.length) fail(`upper floor: failed plugins ${upper}`);
  } finally {
    await browser.close();
  }
  if (failures.length) { console.error(`DETAILS FAILED (${failures.length})`); process.exit(1); }
  console.log("DETAILS PASS");
})().catch((e) => { console.error(e); process.exit(1); });
