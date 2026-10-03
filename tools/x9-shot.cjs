// Memory-safe headless capture for the shared 985MB sandbox.
//   VP=915x412 TOUCH=1 Q='?test=1' STEPS='[{"eval":"..","wait":400,"shot":"name"}]' node tools/x9-shot.cjs
// Waits for the team Chromium lock (/tmp/pw/.chromium.lock via flock in x9-shot.sh) - run through that wrapper.
// Uses CDP Page.captureScreenshot (page.screenshot() can hang on busy WebGL pages).
const pw = process.env.PLAYWRIGHT_MODULE || "/tmp/pw/node_modules/playwright";
const { chromium } = require(pw);
const fs = require("fs");
const out = process.env.OUT || "/tmp/x9shots";
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-dev-shm-usage", "--js-flags=--max-old-space-size=320"],
  });
  const [w, h] = (process.env.VP || "915x412").split("x").map(Number);
  const touch = process.env.TOUCH !== "0";
  const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: Number(process.env.DPR || 1) });
  p.setDefaultTimeout(400000);
  const cdp = await p.context().newCDPSession(p);
  const snap = async (n) => {
    const r = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(`${out}/${n}.png`, Buffer.from(r.data, "base64"));
    console.log("shot", `${out}/${n}.png`);
  };
  p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  p.on("console", (m) => {
    const t = m.text();
    if (["error", "warning"].includes(m.type()) && !/GL Driver|deprecated|ERR_FAILED|GPU stall/.test(t)) console.log(m.type(), t.slice(0, 400));
    else if (process.env.LOG && /EVERCITY/.test(t)) console.log("log", t.slice(0, 600));
  });
  await p.route("**/three.min.js", (r) => r.fulfill({ path: "/tmp/pw/three.min.js", contentType: "application/javascript" }));
  await p.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await p.route("**/fonts.gstatic.com/**", (r) => r.abort());
  const quality = process.env.QUALITY || "balanced";
  await p.addInitScript(`localStorage.setItem("evercity-quality-v1", ${JSON.stringify(quality)});`);
  if (process.env.INIT) await p.addInitScript(process.env.INIT);
  const port = process.env.PORT || 3109;
  await p.goto(`http://127.0.0.1:${port}/` + (process.env.Q || ""));
  await p.waitForFunction(() => document.querySelector("#game").dataset.ready === "true" || !document.querySelector("#recover-button").classList.contains("hidden"));
  await p.waitForTimeout(Number(process.env.WAIT || 1500));
  for (const s of JSON.parse(process.env.STEPS || '[{"shot":"shot"}]')) {
    if (s.eval) {
      const r = await p.evaluate(s.eval);
      if (r !== undefined) console.log("EVAL", JSON.stringify(r).slice(0, 3000));
    }
    if (s.key) await p.keyboard.press(s.key);
    if (s.click) await p.click(s.click);
    if (s.tap) await p.touchscreen.tap(s.tap[0], s.tap[1]);
    if (s.wait) await p.waitForTimeout(s.wait);
    if (s.shot) await snap(s.shot);
  }
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
