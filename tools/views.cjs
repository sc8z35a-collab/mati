// Standard comparison viewpoints shared by all agents.
// Usage: SET=street|facade|atmos|all TAG=before OUT=/tmp/shots node tools/views.cjs
// One browser boot, many shots (a boot costs ~60-100 s on SwiftShader).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/tmp/pw/node_modules/playwright");
const fs = require("fs");
const VIEWS = {
  street: [
    ["start", 30, 108, 0.28, 0.05],
    ["curb", 12, 100, -0.9, -0.32],
    ["crossing", 36, 92, 0, -0.18],
    ["sidewalk", -46, 98, 1.57, -0.12],
  ],
  facade: [
    ["cafe", 72, 120, 0.15, 0.12],
    ["tower", 6, 30, 0.2, 0.42],
    ["residence", -144, 100, 0.0, 0.3],
    ["roofline", 36, 36, 2.4, 0.25],
  ],
  atmos: [
    ["sky", 0, 110, 0.6, 0.55],
    ["park", 0, 96, 0, -0.05],
    ["waterfront", 20, -330, 3.14, 0.05],
  ],
};
const set = process.env.SET || "all";
const list = set === "all" ? Object.values(VIEWS).flat() : VIEWS[set];
const times = (process.env.TIMES || "golden").split(",");
const out = process.env.OUT || "/tmp/shots";
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"] });
  const [w, h] = (process.env.VP || "960x540").split("x").map(Number);
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.setDefaultTimeout(300000);
  // page.screenshot() waits for stable frames and can hang on a busy SwiftShader
  // WebGL page; raw CDP capture returns immediately (same as tools/shot.cjs).
  const cdp = await p.context().newCDPSession(p);
  const errors = [];
  p.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|Failed to load/.test(m.text())) errors.push(m.text().slice(0, 300)); });
  await p.route("**/three.min.js", (r) => r.fulfill({ path: process.env.THREE_SCRIPT || "/tmp/pw/three.min.js", contentType: "application/javascript" }));
  await p.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await p.addInitScript((q) => { localStorage.setItem("evercity-quality-v1", q); localStorage.setItem("evercity-hud", "false"); }, process.env.QUALITY || "balanced");
  await p.goto((process.env.TEST_URL || "http://127.0.0.1:3000/") + "?test=1" + (process.env.EXTRA || ""));
  await p.waitForFunction(() => document.querySelector("#game").dataset.ready === "true");
  await p.waitForTimeout(1200);
  for (const t of times) {
    await p.evaluate((mode) => { const s = document.getElementById("time-select"); s.value = mode; s.onchange({ target: { value: mode } }); }, t);
    await p.waitForTimeout(t === "golden" ? 200 : 6000); // light blends over a few seconds
    for (const [name, x, z, yaw, pitch] of list) {
      await p.evaluate(([x, z, yaw, pitch]) => evercity.debug.pose(x, z, yaw, pitch), [x, z, yaw, pitch]);
      await p.waitForTimeout(Number(process.env.SETTLE || 700));
      const file = `${out}/${process.env.TAG || "view"}_${t}_${name}.png`;
      const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
      console.log("shot", file);
    }
  }
  const state = await p.evaluate(() => ({ render: evercity.getState().render, details: evercity.details() }));
  console.log("STATE", JSON.stringify(state));
  if (errors.length) console.log("ERRORS\n" + errors.join("\n"));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
