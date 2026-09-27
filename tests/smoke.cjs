"use strict";
// Boots the real game with ?test=1 and fails on page errors or any false self-test.
// Env: TEST_URL (default http://127.0.0.1:3000/), PLAYWRIGHT_MODULE, THREE_SCRIPT, PAGE_QUERY, EVAL, INIT.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TEST_URL || "http://127.0.0.1:3000/";
(async () => {
  const b = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  let failed = false;
  try {
    const p = await b.newPage({ viewport: { width: 800, height: 500 } });
    p.setDefaultTimeout(300000);
    const logs = [];
    p.on("pageerror", (e) => { failed = true; logs.push("PAGEERROR " + e.message); });
    p.on("console", (m) => {
      const t = m.text();
      if (m.type() === "error" && !/ERR_FAILED|Failed to load resource/.test(t)) { failed = true; logs.push("error: " + t); }
      if (/^EVERCITY [a-z -]*(tests|paths) \{/.test(t)) {
        const bad = /:false/.test(t);
        if (bad) failed = true;
        logs.push((bad ? "FAIL " : "ok   ") + (bad ? t : t.slice(0, t.indexOf("{"))));
      }
    });
    if (process.env.THREE_SCRIPT)
      await p.route("**/three.min.js", (r) => r.fulfill({ path: process.env.THREE_SCRIPT, contentType: "application/javascript" }));
    await p.route("**/fonts.googleapis.com/**", (r) => r.abort());
    await p.addInitScript(() => localStorage.setItem("evercity-quality-v1", "balanced"));
    if (process.env.INIT) await p.addInitScript(process.env.INIT);
    await p.goto(base + (process.env.PAGE_QUERY || "?test=1"));
    await p.waitForFunction(() => document.querySelector("#game").dataset.ready === "true" ||
      !document.querySelector("#recover-button").classList.contains("hidden"));
    await p.waitForTimeout(Number(process.env.WAIT || 3000));
    if (process.env.EVAL) console.log("EVAL:", JSON.stringify(await p.evaluate(process.env.EVAL)));
    console.log(logs.join("\n"));
  } finally {
    await b.close();
  }
  if (failed) { console.error("SMOKE FAILED"); process.exit(1); }
  console.log("SMOKE PASS");
})().catch((e) => { console.error(e); process.exit(1); });
