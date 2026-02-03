import { test, expect } from '@playwright/test';

test('prejoin join button enables after selection', async ({ page }) => {
  await page.goto('/');

  const joinButton = page.locator('.prejoin-join');
  await expect(joinButton).toBeVisible();
  await expect(joinButton).toBeDisabled();

  const nameInput = page.locator('.prejoin-input');
  await expect(nameInput).toBeVisible();
  await nameInput.fill('TestPilot');

  const characters = page.locator('.prejoin-character');
  const count = await characters.count();
  expect(count).toBeGreaterThan(0);
  await characters.first().click();

  await expect(joinButton).toBeEnabled();
});
