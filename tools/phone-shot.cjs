// Landscape-phone capture for EVERCITY (target: high-end Android, full screen, landscape only).
// Usage: Q='?test=1' STEPS='[{"eval":"..","wait":500,"shot":"name"}]' node tools/phone-shot.cjs
// Env: VP=915x412 (CSS px), DPR=1, PORT=3100, OUT=.artifacts, WAIT=1500, LOG=1 (info logs)
const path = require("path");
const fs = require("fs");
const ROOT = path.resolve(__dirname, "..");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(ROOT, ".tools/node_modules/playwright"));
(async () => {
  const b = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const [w, h] = (process.env.VP || "915x412").split("x").map(Number);
  const ctx = await b.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: Number(process.env.DPR || 1),
    hasTouch: true,
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(300000);
  const out = path.join(ROOT, process.env.OUT || ".artifacts");
  fs.mkdirSync(out, { recursive: true });
  p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  p.on("console", (m) => {
    const t = m.text();
    if (["error", "warning"].includes(m.type()) && !/GL Driver|deprecated|ERR_FAILED|GPU stall/.test(t))
      console.log(m.type(), t.slice(0, 400));
    if (process.env.LOG && m.type() === "info") console.log("info", t.slice(0, 400));
  });
  await p.route("**/three.min.js", (r) => r.fulfill({ path: path.join(ROOT, ".tools/three.min.js"), contentType: "application/javascript" }));
  await p.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await p.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await p.addInitScript(() => {
    if (!localStorage.getItem("evercity-quality-v1")) localStorage.setItem("evercity-quality-v1", "balanced");
  });
  if (process.env.INIT) await p.addInitScript(process.env.INIT);
  const t0 = Date.now();
  await p.goto(`http://127.0.0.1:${process.env.PORT || 3100}/` + (process.env.Q || ""));
  await p.waitForFunction(
    () => document.querySelector("#game")?.dataset.ready === "true" || !document.querySelector("#recover-button")?.classList.contains("hidden"),
  );
  console.log("ready in", Date.now() - t0, "ms");
  await p.waitForTimeout(Number(process.env.WAIT || 1500));
  for (const s of JSON.parse(process.env.STEPS || '[{"shot":"phone"}]')) {
    if (s.eval) {
      const r = await p.evaluate(s.eval);
      if (r !== undefined) console.log("EVAL", JSON.stringify(r).slice(0, 3000));
    }
    if (s.tap) await p.touchscreen.tap(s.tap[0], s.tap[1]);
    if (s.key) await p.keyboard.press(s.key);
    if (s.click) await p.click(s.click);
    if (s.wait) await p.waitForTimeout(s.wait);
    if (s.shot) {
      await p.screenshot({ path: path.join(out, s.shot + ".png") });
      console.log("shot", path.join(out, s.shot + ".png"));
    }
  }
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
