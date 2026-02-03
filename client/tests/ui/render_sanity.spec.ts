import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

test('renders scene without shader errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  await page.goto('/');
  await page.waitForTimeout(800);

  const screenshot = await page.screenshot();
  const png = PNG.sync.read(screenshot);
  let minLum = 255;
  let maxLum = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const shaderErrors = errors.filter((text) => text.toLowerCase().includes('webgl') || text.toLowerCase().includes('shader'));
  expect(shaderErrors).toEqual([]);
  expect(maxLum - minLum).toBeGreaterThan(5);
});
