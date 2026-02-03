import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

type Budgets = {
  tti?: { maxMs: number };
  frameTime?: { maxMs: number; sampleFrames?: number };
};

const loadBudgets = (): Budgets => {
  const path = fileURLToPath(new URL('../../perf/budgets.json', import.meta.url));
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as Budgets;
};

const scaleBudget = (value: number) => {
  const scale = Number(process.env.PERF_BUDGET_SCALE ?? 1);
  if (!Number.isFinite(scale) || scale <= 0) {
    return value;
  }
  return value * scale;
};

test('time-to-interactive meets budget', async ({ page }) => {
  const budgets = loadBudgets();
  const maxMs = scaleBudget(budgets.tti?.maxMs ?? 3000);

  await page.goto('/');
  await page.waitForFunction(() => typeof (window as { __afpsReady?: number }).__afpsReady === 'number');

  const ready = await page.evaluate(() => (window as { __afpsReady?: number }).__afpsReady ?? 0);
  expect(ready).toBeGreaterThan(0);
  expect(ready).toBeLessThanOrEqual(maxMs);
});

test('frame time stays within budget', async ({ page }) => {
  const budgets = loadBudgets();
  const maxMs = scaleBudget(budgets.frameTime?.maxMs ?? 16.6);
  const sampleFrames = budgets.frameTime?.sampleFrames ?? 120;
  const jitterMs = 0.5;

  await page.goto('/');
  await page.waitForTimeout(500);

  const result = await page.evaluate(async (frames: number) => {
    const samples: number[] = [];
    let last = performance.now();
    for (let i = 0; i < frames; i += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const now = performance.now();
      samples.push(now - last);
      last = now;
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? avg;
    return { avg, p95 };
  }, sampleFrames);

  expect(result.avg).toBeLessThanOrEqual(maxMs + jitterMs);
  expect(result.p95).toBeLessThanOrEqual(maxMs * 1.25);
});
