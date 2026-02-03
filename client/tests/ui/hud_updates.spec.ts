import { test, expect } from '@playwright/test';

test('HUD elements update when debug state changes', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as { __afpsHud?: unknown }).__afpsHud !== undefined);

  await page.evaluate(() => {
    const hud = (window as { __afpsHud?: { dispatch: (action: unknown) => void } }).__afpsHud;
    hud?.dispatch({ type: 'vitals', value: { health: 75, ammo: 50 } });
    hud?.dispatch({ type: 'score', value: { kills: 2, deaths: 1 } });
    hud?.dispatch({ type: 'weapon', slot: 1, name: 'Launcher' });
    hud?.dispatch({ type: 'weaponCooldown', value: 1.2 });
    hud?.dispatch({ type: 'abilityCooldowns', value: { dash: 0.5, shockwave: 0, shieldCooldown: 2, shieldTimer: 0, shieldActive: false } });
  });

  await expect(page.locator('.hud-health')).toContainText('75');
  await expect(page.locator('.hud-ammo')).toContainText('50');
  await expect(page.locator('.hud-score')).toContainText('2 / 1');
  await expect(page.locator('.hud-weapon')).toContainText('Weapon 2');
  await expect(page.locator('.hud-weapon')).toContainText('Launcher');
  await expect(page.locator('.hud-weapon-cooldown')).toContainText('1.20s');
  await expect(page.locator('.hud-ability-dash')).toContainText('0.50s');
});
