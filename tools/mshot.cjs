// Landscape-phone screenshot probe (low memory). Usage:
//   PORT=3217 Q='?spot=atlas' STEPS='[{"wait":800,"shot":"a"}]' node tools/mshot.cjs
// Env: VP=915x412 (landscape phone default) DPR=1 TOUCH=1 QUALITY=balanced OUT=/tmp/lsx-shots
const path = require("path");
const { chromium } = require(path.join(__dirname, "../.tools/node_modules/playwright"));
const fs = require("fs");
const OUT = process.env.OUT || "/tmp/lsx-shots";
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--disable-dev-shm-usage",
      "--renderer-process-limit=1",
      "--js-flags=--max-old-space-size=320",
    ],
  });
  const [w, h] = (process.env.VP || "915x412").split("x").map(Number);
  const touch = process.env.TOUCH !== "0";
  const p = await b.newPage({
    viewport: { width: w, height: h },
    deviceScaleFactor: Number(process.env.DPR || 1),
    hasTouch: touch,
    isMobile: touch,
  });
  p.setDefaultTimeout(240000);
  const snap = async (n) => {
    await p.screenshot({ path: `${OUT}/${n}.png` });
    console.log("shot", `${OUT}/${n}.png`);
  };
  p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  p.on("console", (m) => {
    const t = m.text();
    if (["error", "warning"].includes(m.type()) && !/GL Driver|deprecated|ERR_FAILED|fonts/.test(t))
      console.log(m.type(), t.slice(0, 400));
    if (process.env.LOG && m.type() === "info") console.log("info", t.slice(0, 600));
  });
  const three = path.join(__dirname, "../.tools/three.min.js");
  if (fs.existsSync(three))
    await p.route("**/three.min.js", (r) => r.fulfill({ path: three, contentType: "application/javascript" }));
  await p.route("**/fonts.googleapis.com/**", (r) => r.abort());
  const q = process.env.QUALITY || "balanced";
  await p.addInitScript((q) => {
    if (!localStorage.getItem("evercity-quality-v1")) localStorage.setItem("evercity-quality-v1", q);
  }, q);
  if (process.env.INIT) await p.addInitScript(process.env.INIT);
  await p.goto(`http://127.0.0.1:${process.env.PORT || 3217}/${process.env.PAGE || ""}${process.env.Q || ""}`);
  await p.waitForFunction(
    () =>
      document.querySelector("#game")?.dataset.ready === "true" ||
      !document.querySelector("#recover-button")?.classList.contains("hidden"),
  );
  await p.waitForTimeout(Number(process.env.WAIT || 1200));
  for (const s of JSON.parse(process.env.STEPS || '[{"shot":"shot"}]')) {
    if (s.eval) {
      const r = await p.evaluate(s.eval);
      if (r !== undefined) console.log("EVAL", JSON.stringify(r).slice(0, 3000));
    }
    if (s.key) await p.keyboard.press(s.key);
    if (s.down) await p.keyboard.down(s.down);
    if (s.up) await p.keyboard.up(s.up);
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
