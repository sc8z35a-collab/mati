// Headless capture for visual work on a landscape phone viewport.
//   PORT=3100 OUT=/tmp/hy/shots VP=915x412 TOUCH=1 Q='?test=1' QUALITY=hdr-ultra \
//   STEPS='[{"eval":"evercity.debug.pose(30,108,0.28,0.05)","wait":600,"shot":"start"}]' node tools/hyper-shot.cjs
// Uses CDP Page.captureScreenshot (Playwright screenshot can hang on busy WebGL pages).
const PW = process.env.PLAYWRIGHT_MODULE || require("path").join(__dirname, "../.hy/node_modules/playwright");
const { chromium } = require(PW);
const fs = require("fs");
(async () => {
  const out = process.env.OUT || require("path").join(__dirname, "../.hy/shots");
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"],
  });
  const [w, h] = (process.env.VP || "915x412").split("x").map(Number);
  const touch = process.env.TOUCH !== "0";
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: Number(process.env.DPR || 1), hasTouch: touch, isMobile: touch });
  p.setDefaultTimeout(400000);
  const cdp = await p.context().newCDPSession(p);
  const snap = async (n) => {
    const r = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(out + "/" + n + ".png", Buffer.from(r.data, "base64"));
    console.log("shot", n);
  };
  p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  p.on("console", (m) => {
    const t = m.text();
    if (["error", "warning"].includes(m.type()) && !/GL Driver|deprecated|ERR_FAILED|GPU stall/.test(t)) console.log(m.type(), t.slice(0, 400));
    else if (process.env.LOG && /EVERCITY/.test(t)) console.log("log", t.slice(0, 600));
  });
  await p.route("**/three.min.js", (r) => r.fulfill({ path: process.env.THREE_SCRIPT || require("path").join(__dirname, "../.hy/three.min.js"), contentType: "application/javascript" }));
  await p.route("**/fonts.googleapis.com/**", (r) => r.abort());
  const quality = process.env.QUALITY || "high";
  await p.addInitScript(`localStorage.setItem("evercity-quality-v1", ${JSON.stringify(quality)});localStorage.setItem("evercity-hud","true");`);
  if (process.env.INIT) await p.addInitScript(process.env.INIT);
  const t0 = Date.now();
  await p.goto(`http://127.0.0.1:${process.env.PORT || 3100}/` + (process.env.Q || ""));
  await p.waitForFunction(() => document.querySelector("#game").dataset.ready === "true" || !document.querySelector("#recover-button").classList.contains("hidden"));
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
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
