'use strict';
// Static server required. PLAYWRIGHT_MODULE may point to an isolated Playwright install.
// THREE_SCRIPT optionally supplies the same Three.js version locally for offline/CDN-free tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_URL || 'http://127.0.0.1:3000/';
const artifacts = path.resolve(__dirname, '../.artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const allTrue = (name, result) => {
  assert(result && Object.keys(result).length, name + ': missing diagnostics');
  assert(Object.values(result).every(v => v === true), name + ': ' + JSON.stringify(result));
};
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
    page.setDefaultTimeout(180000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    if (process.env.THREE_SCRIPT) await page.route('**/three.min.js', route => route.fulfill({ path: process.env.THREE_SCRIPT, contentType: 'application/javascript' }));
    await page.addInitScript(() => {
      localStorage.setItem('evercity-quality-v1', 'balanced');
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = cb => cb.name === 'animate' ? (window.testFrame = () => cb(performance.now()), 0) : raf(cb);
    });
    await page.goto(base + '?test=1');
    await page.waitForFunction(() => document.querySelector('#game').dataset.ready === 'true');
    for (const suite of ['selfTest', 'visualSelfTest', 'floorTest', 'exteriorTest', 'objectTest']) {
      allTrue(suite, await page.evaluate(suite => evercity[suite](), suite));
    }
    allTrue('traffic', await page.evaluate(() => EvercityTraffic.selfTest()));
    const initial = await page.evaluate(() => evercity.objectSnapshot());
    assert.equal(initial.exterior.objectCount, 567);
    assert.equal(Object.keys(initial.exterior.objects).length, 16);
    assert(initial.ground > 400);
    console.log('PASS city diagnostics / object counts', JSON.stringify(initial));

    // Check AABBs against shells, other added props and the story characters.
    const spatial = await page.evaluate(() => {
      const buildings = evercity.debug.buildings(), props = evercity.debug.props();
      const overlaps = (a, b) => Math.abs(a.x-b.x) < (a.w+b.w)/2-.001 && Math.abs(a.z-b.z) < (a.d+b.d)/2-.001;
      const pairs = [];
      for (let i=0;i<props.length;i++) for (let j=i+1;j<props.length;j++) if(overlaps(props[i],props[j])) pairs.push([props[i],props[j]]);
      const cafe=buildings.find(b=>b.name==='COMMON GROUNDS'),museum=buildings.find(b=>b.name==='MUSEUM OF FORM');
      const characters=[{x:14,z:94,w:1.2,d:1.2},{x:cafe.x+5,z:cafe.z+cafe.d/2+5,w:1.2,d:1.2},{x:museum.x+5,z:museum.z+museum.d/2+5,w:1.2,d:1.2}];
      return { shells: props.filter(p => buildings.some(b => overlaps(p,b))), pairs, characters:props.filter(p=>characters.some(c=>overlaps(p,c))) };
    });
    assert.deepEqual(spatial, { shells: [], pairs: [], characters: [] });
    console.log('PASS no new prop/shell or prop/prop overlaps; paths, lanes and collisions');

    const buildings = await page.evaluate(() => evercity.debug.buildings());
    let floors = 0, units = 0;
    const variants = new Set();
    for (const b of buildings.filter(b => b.type === 'residential')) {
      // Every residential shell size, both units, all palette variants and top-floor lifecycle.
      for (const f of [...new Set([1, 2, b.floors-1])]) {
        const result = await page.evaluate(({id,f}) => {
          evercity.debug.load(id,f);
          return { paths:evercity.debug.paths(), units:evercity.debug.units(), batching:evercity.debug.batching(), floor:evercity.floorTest() };
        }, {id:b.id,f});
        allTrue(b.name + ' paths ' + f, result.paths);
        allTrue(b.name + ' floor ' + f, result.floor);
        assert(result.batching.components > 500);
        for(const unit of result.units){
          assert.equal(unit.objects.count, 19);
          assert.equal(Object.keys(unit.objects.categories).length,18);
          assert.equal(unit.objects.components,[115,110,113][unit.variant]);
          variants.add(unit.variant);units++;
        }
        floors++;
      }
    }
    assert.equal(variants.size,3);
    console.log(`PASS ${floors} residential floors / ${units} units / all three palettes`);

    for (const type of ['office','cafe','shop','gallery','hotel']) {
      const b = buildings.find(b => b.type === type);
      const result = await page.evaluate(({id}) => {
        evercity.debug.load(id,1);
        return {objects:evercity.objectSnapshot().interior, test:evercity.floorTest()};
      }, b);
      assert(result.objects[0].count > 0, type);
      allTrue(type, result.test);
    }
    const maple = buildings.find(b => b.name === 'MAPLE COURT');
    const interaction = await page.evaluate(id => { evercity.debug.load(id,3);return evercity.debug.interactions(); }, maple.id);
    allTrue('interactions', interaction);
    const resources = await page.evaluate(id => {
      const samples=[];
      for(let n=0;n<4;n++){
        evercity.debug.load(id,2);evercity.debug.load(id,3);
        samples.push(evercity.debug.resources());
      }
      return samples;
    }, maple.id);
    assert.deepEqual(resources[3],resources[1]);
    console.log('PASS commercial interiors, equipment and repeated floor unloading');

    // Render actual game frames for visual checks, with simulation RAF under test control.
    const shots = [
      {id:maple.id,f:3,x:maple.x-5.4,z:maple.z+maple.d/2-4,yaw:.48,pitch:-.1,name:'objects-apartment'},
      {id:maple.id,f:0,x:7,z:94,yaw:-.78,pitch:-.03,name:'objects-park'},
      {id:maple.id,f:0,x:maple.x-24.5,z:maple.z-12,yaw:0,pitch:-.06,name:'objects-street'}
    ];
    for(const shot of shots){
      await page.evaluate(s => {evercity.debug.load(s.id,s.f);evercity.debug.pose(s.x,s.z,s.yaw,s.pitch);window.testFrame();},shot);
      await page.screenshot({path:path.join(artifacts,shot.name+'.png')});
      console.log('PASS rendered '+shot.name);
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(() => window.testFrame());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(artifacts,'objects-mobile.png')});
    assert.deepEqual(errors,[]);
    console.log('PASS desktop/mobile rendering without JavaScript or shader errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e);process.exitCode=1; });
