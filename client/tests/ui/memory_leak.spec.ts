import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

type Budgets = {
  memoryLeak?: { maxDeltaMb: number; sampleDurationMs?: number };
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

test('memory usage stays within budget', async ({ page }) => {
  const budgets = loadBudgets();
  const maxDeltaMb = scaleBudget(budgets.memoryLeak?.maxDeltaMb ?? 25);
  const durationMs = budgets.memoryLeak?.sampleDurationMs ?? 2000;

  await page.goto('/');
  await page.waitForTimeout(500);

  const result = await page.evaluate(async (duration: number) => {
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    if (!memory) {
      return null;
    }
    const start = memory.usedJSHeapSize;
    const startTime = performance.now();
    while (performance.now() - startTime < duration) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    const end = memory.usedJSHeapSize;
    return { start, end };
  }, durationMs);

  if (!result) {
    test.skip(true, 'performance.memory not available');
    return;
  }

  const deltaMb = (result.end - result.start) / (1024 * 1024);
  expect(deltaMb).toBeLessThanOrEqual(maxDeltaMb);
});
