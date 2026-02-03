import { test, expect } from '@playwright/test';

test('pointer lock updates HUD state', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get() {
        return (document as { _plElement?: Element | null })._plElement ?? null;
      }
    });
    (HTMLElement.prototype as { requestPointerLock?: () => void }).requestPointerLock = function () {
      (document as { _plElement?: Element | null })._plElement = this;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
  });

  await page.goto('/');

  const nameInput = page.locator('.prejoin-input');
  await nameInput.fill('TestPilot');
  await page.waitForSelector('.prejoin-character');
  await page.click('.prejoin-character');
  await page.click('.prejoin-join');
  await page.waitForSelector('.prejoin-overlay', { state: 'detached' });

  const lockLabel = page.locator('.hud-lock');
  await expect(lockLabel).toContainText('Click to lock pointer');

  await page.click('canvas');
  await expect(lockLabel).toContainText('Pointer Locked');
});
