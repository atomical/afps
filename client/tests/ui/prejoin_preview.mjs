import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const readPng = (buffer) => PNG.sync.read(buffer);

const computeAlphaBounds = (png, alphaThreshold = 10) => {
  let minY = png.height;
  let maxY = -1;
  let count = 0;
  const { width, height, data } = png;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha > alphaThreshold) {
        count += 1;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minY, maxY, count };
};

const run = async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => {
    window.__AFPS_PREJOIN_FREEZE__ = true;
  });

  const baseUrl = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5173/';
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  const canvas = page.locator('.prejoin-preview-canvas');
  await canvas.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const el = document.querySelector('.prejoin-preview-canvas');
    return el?.dataset.ready === 'true';
  });

  const box = await canvas.boundingBox();
  assert(box, 'Preview canvas bounding box not available');

  const buffer = await page.screenshot({ clip: box, omitBackground: true });
  const png = readPng(buffer);
  const { minY, maxY, count } = computeAlphaBounds(png);

  assert.ok(count > 500, 'Expected some rendered pixels in preview canvas');

  const topFrac = minY / png.height;
  const bottomFrac = maxY / png.height;

  assert.ok(topFrac < 0.25, 'Model should reach near the top of the canvas');
  assert.ok(bottomFrac > 0.85, 'Model should reach near the bottom of the canvas');

  await browser.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
