// F=script.js Q=?test=1 node probe.cjs  -> evaluates the file's expression in the running game (no screenshot).
const { chromium } = require("/tmp/pw/node_modules/playwright");
(async () => {
  const b = await chromium.launch({ args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: Number(process.env.W || 320), height: Number(process.env.H || 200) } });
  p.setDefaultTimeout(300000);
  p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await p.route("**/three.min.js", (r) => r.fulfill({ path: "/tmp/pw/three.min.js", contentType: "application/javascript" }));
  await p.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await p.addInitScript(() => localStorage.setItem("evercity-quality-v1", "balanced"));
  if (process.env.INIT) await p.addInitScript(process.env.INIT);
  await p.goto("http://127.0.0.1:3000/" + (process.env.Q ?? "?test=1"));
  await p.waitForFunction(() => document.querySelector("#game").dataset.ready === "true");
  await p.waitForTimeout(Number(process.env.WAIT || 500));
  console.log(JSON.stringify(await p.evaluate(require("fs").readFileSync(process.env.F, "utf8")), null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
