import { test, expect } from '@playwright/test';

test('audio debug hooks preload and play', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as { __afpsAudio?: unknown }).__afpsAudio !== undefined);

  const played = await page.evaluate(async () => {
    const audio = (window as { __afpsAudio?: { preload: () => Promise<void>; play: (key: string) => boolean } })
      .__afpsAudio;
    await audio?.preload();
    return audio?.play('weaponFire') ?? false;
  });

  expect(played).toBe(true);
});
