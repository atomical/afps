import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const run = async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const baseUrl = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5173/';
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  const joinButton = page.locator('.prejoin-join');
  await joinButton.waitFor({ state: 'visible' });

  const isVisible = await joinButton.isVisible();
  assert.ok(isVisible, 'Join button should be visible on pre-join screen');

  const nameInput = page.locator('.prejoin-input');
  await nameInput.waitFor({ state: 'visible' });
  await nameInput.fill('TestPilot');

  const characters = page.locator('.prejoin-character');
  const count = await characters.count();
  assert.ok(count > 0, 'Expected at least one character option');
  await characters.first().click();

  await page.waitForFunction(() => {
    const btn = document.querySelector('.prejoin-join');
    return btn && !btn.disabled;
  });

  await browser.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
