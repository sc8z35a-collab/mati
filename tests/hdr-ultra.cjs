'use strict';
// Run against a static server: PLAYWRIGHT_MODULE=/path/to/playwright node tests/hdr-ultra.cjs
// Add FULL_CITY_4K=1 to exercise the full 8192px-shadow / 4K GPU export (very demanding).
// TEST_GPU_MAX_TEXTURE_SIZE=4096 explicitly emulates a lower hardware texture limit.
// This tests the existing hardware-limit path; it never changes production presets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, '.artifacts');
const base = (process.env.TEST_URL || 'http://127.0.0.1:3000/').replace(/\/?$/, '/');
fs.mkdirSync(artifacts, { recursive: true });
const textureLimit = Number(process.env.TEST_GPU_MAX_TEXTURE_SIZE) || 0;
assert([0, 2048, 4096, 8192].includes(textureLimit));
if (textureLimit) console.log('TEST GPU texture-limit emulation:', textureLimit);

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
    downloadsPath: artifacts,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 }, acceptDownloads: true });
    page.setDefaultTimeout(480000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
      if (message.text().startsWith('PHOTO PROGRESS')) console.log(message.text());
    });
    // One manual game frame at a time: software WebGL cannot maintain an interactive FPS.
    // Photo RAF yields and all real rendering code remain intact.
    await page.addInitScript(textureLimit => {
      if (textureLimit) {
        for (const type of [WebGLRenderingContext, WebGL2RenderingContext]) {
          const get = type.prototype.getParameter;
          type.prototype.getParameter = function (name) {
            const actual = get.call(this, name);
            return name === this.MAX_TEXTURE_SIZE ? Math.min(actual, textureLimit) : actual;
          };
        }
      }
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = callback => callback.name === 'animate'
        ? (window.testFrame = () => callback(performance.now()), 0) : raf(callback);
      if (!localStorage.getItem('evercity-quality-v1')) localStorage.setItem('evercity-quality-v1', 'balanced');
    }, textureLimit);
    await page.goto(base + '?camera=1&test=1');
    await page.waitForFunction(() => document.querySelector('#game')?.dataset.ready === 'true');
    for (const suite of ['selfTest', 'visualSelfTest', 'floorTest', 'exteriorTest']) {
      const result = await page.evaluate(name => window.evercity[name](), suite);
      assert(Object.values(result).every(Boolean), JSON.stringify({ suite, result }));
    }
    console.log('PASS existing city, floor, visual and exterior diagnostics');
    const quality = value => page.evaluate(value => {
      const select = document.querySelector('#quality-select');
      select.value = value; select.dispatchEvent(new Event('change'));
    }, value);
    for (const [value, size, ao] of [['hdr-ultra', 8192, 64], ['ultra', 4096, 16], ['high', 2048, 8], ['balanced', 1024, 8]]) {
      await quality(value);
      const state = await page.evaluate(() => evercity.getState());
      assert.equal(state.lighting.quality, value);
      assert.equal(state.lighting.shadowSize, Math.min(size, textureLimit || Infinity));
      assert.equal(state.hdr.aoSamples, ao);
      if (value === 'hdr-ultra') {
        assert.deepEqual(state.lighting.pcssSamples, [32, 64]);
        assert.equal(state.exterior.visibleBatches, state.exterior.batches);
        assert.equal(state.lighting.localShadowSize, 2048);
      }
    }
    console.log('PASS all four quality presets and ULTRA detail/shadow settings');

    // Abort after GPU allocation but before the first sample. Also try duplicate shutter presses.
    await page.evaluate(() => {
      window.originalCapture = EvercityHDR.prototype.capture;
      window.captureCalls = 0;
      EvercityHDR.prototype.capture = function (scene, mode, options) {
        window.captureCalls++;
        return window.originalCapture.call(this, scene, mode, { ...options, progress: (text, value) => {
          options.progress(text, value);
          if (value === 0) document.querySelector('#capture-cancel').click();
        }});
      };
      document.querySelector('#shutter-button').click();
      document.querySelector('#shutter-button').click();
    });
    await page.waitForFunction(() => document.querySelector('#photo-status').textContent.includes('中止しました'));
    assert.equal(await page.evaluate(() => window.captureCalls), 1);
    assert.equal(await page.evaluate(() => evercity.getState().capturing), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('evercity-quality-v1')), 'balanced');
    assert.equal(await page.evaluate(() => evercity.getState().hdr.quality), 'balanced');
    assert.equal(await page.locator('#shutter-button').isEnabled(), true);
    await page.evaluate(() => { EvercityHDR.prototype.capture = window.originalCapture; });
    console.log('PASS cancellation, double-click guard and quality restoration');

    if (process.env.FULL_CITY_4K === '1') {
      const frozen = await page.evaluate(() => evercity.getState().position);
      await page.evaluate(() => {
        const capture = EvercityHDR.prototype.capture;
        EvercityHDR.prototype.capture = function (scene, mode, options) {
          return capture.call(this, scene, mode, { ...options, progress: (text, value) => {
            options.progress(text, value);
            if (text.includes('1/8')) console.log('PHOTO PROGRESS', text);
            // Deliberately request a gameplay frame while each photo sample is in flight.
            window.testFrame();
          }});
        };
        document.querySelector('#shutter-button').click();
      });
      await page.waitForFunction(() => document.querySelector('#photo-result-dialog').open || document.querySelector('#photo-status').textContent);
      assert.equal(await page.locator('#photo-status').textContent(), '');
      await page.waitForFunction(() => document.querySelector('#photo-result-image').naturalWidth === 3840);
      assert.deepEqual(await page.locator('#photo-result-image').evaluate(img => [img.naturalWidth, img.naturalHeight]), [3840, 2160]);
      assert.deepEqual(await page.evaluate(() => evercity.getState().position), frozen);
      const downloadPromise = page.waitForEvent('download');
      await page.locator('#photo-download').click();
      const download = await downloadPromise;
      assert.match(download.suggestedFilename(), /hdr-ultra-3840x2160.*\.png$/);
      await download.saveAs(path.join(artifacts, 'city-hdr-ultra-4k.png'));
      const png = fs.readFileSync(path.join(artifacts, 'city-hdr-ultra-4k.png'));
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.equal(png.readUInt32BE(16), 3840); assert.equal(png.readUInt32BE(20), 2160);
      assert.equal(await page.evaluate(() => evercity.getState().hdr.quality), 'balanced');
      await page.screenshot({ path: path.join(artifacts, 'photo-result.png') });
      await page.locator('#photo-result-dialog .close-dialog').first().click();
      console.log('PASS full city 4K PNG, frozen simulation, original download and state restoration');
    }

    // Normal capture also re-renders, keeps old JPEG compatibility, and handles encoder failures.
    await page.selectOption('#photo-quality', 'current');
    await page.locator('#shutter-button').click();
    await page.waitForFunction(() => document.querySelector('#photo-result-dialog').open);
    assert.match(await page.locator('#photo-result-meta').textContent(), /640 × 360 \/ JPG/);
    await page.locator('#photo-result-dialog .close-dialog').first().click();
    await page.evaluate(() => {
      window.originalToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback) { callback(null); };
      document.querySelector('#shutter-button').click();
    });
    await page.waitForFunction(() => document.querySelector('#photo-status').textContent.includes('失敗'));
    assert.equal(await page.evaluate(() => evercity.getState().capturing), false);
    assert.equal(await page.locator('#shutter-button').isEnabled(), true);
    await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.originalToBlob; });
    console.log('PASS normal JPEG re-render and encoder-failure recovery');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#game')?.dataset.ready === 'true');
    await page.locator('#photo-album-button').click();
    await page.waitForFunction(() => document.querySelectorAll('#album-grid article').length > 0);
    assert.equal(await page.locator('#album-grid article').count(), process.env.FULL_CITY_4K === '1' ? 2 : 1);
    assert.equal(await page.locator('#album-grid a[download$=".jpg"]').count(), 1);
    if (process.env.FULL_CITY_4K === '1') assert.equal(await page.locator('#album-grid a[download$=".png"]').count(), 1);
    await page.locator('#album-dialog .close-dialog').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.selectOption('#photo-quality', 'hdr-ultra');
    const frame = await page.locator('.photo-grid').boundingBox();
    assert(Math.abs(frame.width / frame.height - 16 / 9) < .001);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(artifacts, 'mobile-photo-controls.png') });
    console.log('PASS persistent original album and mobile 16:9 framing');
    assert.deepEqual(errors, []);
    console.log('PASS no JavaScript or WebGL shader errors');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
