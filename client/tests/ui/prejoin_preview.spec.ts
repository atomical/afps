import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

const readPng = (buffer: Buffer) => PNG.sync.read(buffer);

const computeAlphaBounds = (png: PNG, alphaThreshold = 10) => {
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

test('prejoin preview shows full body in frame', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__AFPS_PREJOIN_FREEZE__ = true;
  });

  await page.goto('/');

  const canvas = page.locator('.prejoin-preview-canvas');
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => {
    const canvasEl = document.querySelector<HTMLCanvasElement>('.prejoin-preview-canvas');
    return canvasEl?.dataset.ready === 'true';
  });

  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Preview canvas bounding box not available');
  }

  const buffer = await page.screenshot({
    clip: box,
    omitBackground: true
  });

  const png = readPng(buffer);
  const { minY, maxY, count } = computeAlphaBounds(png);

  expect(count, 'expected some rendered pixels in preview canvas').toBeGreaterThan(500);

  const topFrac = minY / png.height;
  const bottomFrac = maxY / png.height;

  expect(topFrac, 'model should reach near the top of the canvas').toBeLessThan(0.25);
  expect(bottomFrac, 'model should reach near the bottom of the canvas').toBeGreaterThan(0.85);
});
