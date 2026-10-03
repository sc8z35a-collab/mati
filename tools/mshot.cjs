// Mobile-landscape screenshot harness (target: landscape fullscreen Android phone).
// PORT=3107 VP=915x412 Q='?spot=atlas' QUALITY=hdr-ultra TIME=golden STEPS='[...]' node tools/mshot.cjs
const PW = process.env.PW || __dirname + "/../node_modules/playwright";
const { chromium } = require(PW);
const fs = require("fs");
const OUT = process.env.OUT || __dirname + "/../.artifacts/shots";
const THREE_JS = process.env.THREE_JS || __dirname + "/../.artifacts/three.min.js";
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"],
  });
  const [w, h] = (process.env.VP || "915x412").split("x").map(Number);
  const p = await b.newPage({
    viewport: { width: w, height: h },
    deviceScaleFactor: Number(process.env.DPR || 1),
    hasTouch: true,
    isMobile: true,
  });
  p.setDefaultTimeout(400000);
  const cdp = await p.context().newCDPSession(p);
  const snap = async (n) => {
    const r = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 88 });
    fs.writeFileSync(`${OUT}/${n}.jpg`, Buffer.from(r.data, "base64"));
    console.log("shot", n);
  };
  p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  p.on("console", (m) => {
    const t = m.text();
    if (["error", "warning"].includes(m.type()) && !/GL Driver|deprecated|ERR_FAILED|GPU stall|swiftshader/i.test(t))
      console.log(m.type(), t.slice(0, 400));
    if (/EVERCITY gfx/.test(t)) console.log(t.slice(0, 600));
  });
  if (fs.existsSync(THREE_JS))
    await p.route("**/three.min.js", (r) => r.fulfill({ path: THREE_JS, contentType: "application/javascript" }));
  await p.route("**/fonts.googleapis.com/**", (r) => r.abort());
  const quality = process.env.QUALITY || "hdr-ultra";
  await p.addInitScript((q) => {
    localStorage.setItem("evercity-quality-v1", q);
  }, quality);
  if (process.env.INIT) await p.addInitScript(process.env.INIT);
  await p.goto(`http://127.0.0.1:${process.env.PORT || 3107}/${process.env.Q || ""}`);
  await p.waitForFunction(
    () => document.querySelector("#game").dataset.ready === "true" || !document.querySelector("#recover-button").classList.contains("hidden"),
  );
  const pick = async (id, v) =>
    p.evaluate(([id, v]) => { const s = document.getElementById(id); s.value = v; s.dispatchEvent(new Event("change")); }, [id, v]);
  if (process.env.TIME) await pick("time-select", process.env.TIME);
  if (process.env.WEATHER) await pick("weather-select", process.env.WEATHER);
  await p.waitForTimeout(Number(process.env.WAIT || 2500));
  for (const s of JSON.parse(process.env.STEPS || '[{"shot":"shot"}]')) {
    if (s.eval) {
      const r = await p.evaluate(s.eval);
      if (r !== undefined) console.log("EVAL", JSON.stringify(r).slice(0, 1500));
    }
    if (s.time) await pick("time-select", s.time);
    if (s.weather) await pick("weather-select", s.weather);
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
