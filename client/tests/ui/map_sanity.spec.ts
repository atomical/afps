import { test, expect } from '@playwright/test';

test('retro urban map loads all placements', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as { __afpsMapStats?: unknown }).__afpsMapStats !== undefined);
  await page.waitForFunction(() => {
    const stats = (window as { __afpsMapStats?: { complete?: boolean } }).__afpsMapStats;
    return Boolean(stats?.complete);
  });

  const stats = await page.evaluate(() => {
    return (window as { __afpsMapStats?: { total?: number; loaded?: number; failed?: number } }).__afpsMapStats;
  });
  expect(stats?.total).toBeGreaterThan(0);
  expect(stats?.loaded).toBeGreaterThan(0);
  expect(stats?.failed).toBe(0);
});
