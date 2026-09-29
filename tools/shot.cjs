// VP=WxH Q=?query STEPS='[{"eval":"..","key":"KeyM","wait":500,"shot":"name"}]' node shot.cjs
const { chromium } = require("/tmp/pw/node_modules/playwright");
const fs = require("fs");
(async () => {
  const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const [w, h] = (process.env.VP || "960x540").split("x").map(Number);
  const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: !!process.env.TOUCH, isMobile: !!process.env.TOUCH });
  p.setDefaultTimeout(300000);
  const cdp = await p.context().newCDPSession(p);
  const snap = async (n) => { const r = await cdp.send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync("/tmp/shots/" + n + ".png", Buffer.from(r.data, "base64")); console.log("shot", n); };
  p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  p.on("console", (m) => { const t = m.text(); if (["error", "warning"].includes(m.type()) && !/GL Driver|deprecated|ERR_FAILED/.test(t)) console.log(m.type(), t.slice(0, 300)); });
  await p.route("**/three.min.js", (r) => r.fulfill({ path: "/tmp/pw/three.min.js", contentType: "application/javascript" }));
  await p.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await p.addInitScript(() => { if (!localStorage.getItem("evercity-quality-v1")) localStorage.setItem("evercity-quality-v1", "balanced"); });
  if (process.env.INIT) await p.addInitScript(process.env.INIT);
  await p.goto("http://127.0.0.1:3000/" + (process.env.Q || ""));
  await p.waitForFunction(() => document.querySelector("#game").dataset.ready === "true" || !document.querySelector("#recover-button").classList.contains("hidden"));
  await p.waitForTimeout(Number(process.env.WAIT || 1500));
  for (const s of JSON.parse(process.env.STEPS || '[{"shot":"shot"}]')) {
    if (s.eval) { const r = await p.evaluate(s.eval); if (r !== undefined) console.log("EVAL", JSON.stringify(r)); }
    if (s.key) await p.keyboard.press(s.key);
    if (s.click) await p.click(s.click);
    if (s.wait) await p.waitForTimeout(s.wait);
    if (s.shot) await snap(s.shot);
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
