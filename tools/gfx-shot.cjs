// Landscape-phone visual capture for graphics work.
//   PORT=3107 VP=844x390 QUALITY=high Q='?test=1' STEPS='[{"eval":"...","wait":500,"shot":"name"}]' node tools/gfx-shot.cjs
// Uses CDP screenshots (page.screenshot() can hang on busy WebGL pages) and a flock'd
// Chromium (see tools/gfx-run.sh) so only one browser runs at a time in the 1 GB sandbox.
const path = require("path");
const fs = require("fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/tmp/pw/node_modules/playwright");
const OUT = process.env.OUT || "/tmp/shots";
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
      "--disable-dev-shm-usage", "--js-flags=--max-old-space-size=384"],
  });
  const [w, h] = (process.env.VP || "844x390").split("x").map(Number);
  const p = await b.newPage({
    viewport: { width: w, height: h },
    deviceScaleFactor: Number(process.env.DPR || 1),
    hasTouch: process.env.TOUCH !== "0",
    isMobile: process.env.TOUCH !== "0",
  });
  p.setDefaultTimeout(400000);
  const cdp = await p.context().newCDPSession(p);
  const snap = async (n) => {
    const r = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, n + ".png"), Buffer.from(r.data, "base64"));
    console.log("shot", n);
  };
  p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  p.on("console", (m) => {
    const t = m.text();
    if (/EVERCITY .*tests/.test(t) && /false/.test(t)) console.log("TESTFAIL", t.slice(0, 600));
    if (["error", "warning"].includes(m.type()) && !/GL Driver|deprecated|ERR_FAILED|GPU stall/.test(t))
      console.log(m.type(), t.slice(0, 400));
    if (process.env.LOG && /EVERCITY/.test(t)) console.log("LOG", t.slice(0, 500));
  });
  await p.route("**/three.min.js", (r) => r.fulfill({ path: "/tmp/pw/three.min.js", contentType: "application/javascript" }));
  await p.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await p.route("**/fonts.gstatic.com/**", (r) => r.abort());
  const quality = process.env.QUALITY || "high";
  await p.addInitScript((q) => {
    localStorage.setItem("evercity-quality-v1", q);
    localStorage.setItem("evercity-hud", "true");
  }, quality);
  if (process.env.INIT) await p.addInitScript(process.env.INIT);
  const t0 = Date.now();
  await p.goto(`http://127.0.0.1:${process.env.PORT || 3107}/` + (process.env.Q || "?test=1"));
  await p.waitForFunction(() => document.querySelector("#game").dataset.ready === "true" ||
    !document.querySelector("#recover-button").classList.contains("hidden"));
  console.log("ready in", ((Date.now() - t0) / 1000).toFixed(1), "s");
  await p.waitForTimeout(Number(process.env.WAIT || 1500));
  for (const s of JSON.parse(process.env.STEPS || '[{"shot":"shot"}]')) {
    if (s.eval) {
      const r = await p.evaluate(s.eval);
      if (r !== undefined) console.log("EVAL", JSON.stringify(r).slice(0, 1500));
    }
    if (s.key) await p.keyboard.press(s.key);
    if (s.click) await p.click(s.click);
    if (s.wait) await p.waitForTimeout(s.wait);
    if (s.shot) await snap(s.shot);
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
