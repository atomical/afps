import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ClientPrediction } from '../src/net/prediction';
import { SnapshotBuffer } from '../src/net/snapshot_buffer';

const PERF_ENABLED = process.env.PERF_CHECK === '1';
const perfIt = PERF_ENABLED ? it : it.skip;

type BudgetEntry = {
  iterations: number;
  budgetMs: number;
};

const loadBudgets = (): Record<string, BudgetEntry> => {
  let path = '';
  try {
    const url = new URL('../perf/budgets.json', import.meta.url);
    if (url.protocol === 'file:') {
      path = fileURLToPath(url);
    }
  } catch {
    path = '';
  }
  if (!path) {
    path = resolve(process.cwd(), 'perf/budgets.json');
  }
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as Record<string, BudgetEntry>;
};

const scaleBudget = (budgetMs: number) => {
  const scale = Number(process.env.PERF_BUDGET_SCALE ?? 1);
  if (!Number.isFinite(scale) || scale <= 0) {
    return budgetMs;
  }
  return budgetMs * scale;
};

const measure = (fn: () => void) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

describe('perf budgets', () => {
  const budgets = loadBudgets();

  perfIt('records input prediction within budget', () => {
    const budget = budgets.predictionRecordInput;
    expect(budget).toBeTruthy();

    const prediction = new ClientPrediction();
    const elapsed = measure(() => {
      for (let i = 1; i <= budget.iterations; i += 1) {
        prediction.recordInput({
          inputSeq: i,
          moveX: 1,
          moveY: 0,
          lookDeltaX: 0,
          lookDeltaY: 0,
          viewYaw: 0,
          viewPitch: 0,
          weaponSlot: 0,
          jump: false,
          fire: false,
          sprint: false,
          dash: false,
          grapple: false,
          shield: false,
          shockwave: false
        });
      }
    });

    expect(elapsed).toBeLessThanOrEqual(scaleBudget(budget.budgetMs));
  });

  perfIt('samples snapshot buffer within budget', () => {
    const budget = budgets.snapshotBufferSample;
    expect(budget).toBeTruthy();

    const buffer = new SnapshotBuffer(20);
    let nowMs = 1000;
    const elapsed = measure(() => {
      for (let i = 0; i < budget.iterations; i += 1) {
        buffer.push(
          {
            type: 'StateSnapshot',
            serverTick: i,
            lastProcessedInputSeq: i,
            posX: i,
            posY: i,
            posZ: 0,
            velX: 0,
            velY: 0,
            velZ: 0,
            weaponSlot: 0,
            ammoInMag: 30,
            dashCooldown: 0,
            health: 100,
            kills: 0,
            deaths: 0,
            clientId: 'perf'
          },
          nowMs
        );
        buffer.sample(nowMs);
        nowMs += 50;
      }
    });

    expect(elapsed).toBeLessThanOrEqual(scaleBudget(budget.budgetMs));
  });
});
