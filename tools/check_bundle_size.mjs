import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const distDir = join(rootDir, 'client', 'dist');
const budgetsPath = join(rootDir, 'client', 'perf', 'budgets.json');

const raw = readFileSync(budgetsPath, 'utf8');
const budgets = JSON.parse(raw);
const maxMb = Number(budgets?.bundleSize?.maxMb ?? 5);
const scale = Number(process.env.PERF_BUDGET_SCALE ?? 1);
const scaledMaxMb = Number.isFinite(scale) && scale > 0 ? maxMb * scale : maxMb;

const walk = (dir) => {
  let total = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      total += walk(full);
    } else if (stats.isFile()) {
      total += stats.size;
    }
  }
  return total;
};

const bytes = walk(distDir);
const mb = bytes / (1024 * 1024);
if (mb > scaledMaxMb) {
  console.error(`Bundle size ${mb.toFixed(2)} MB exceeds budget ${scaledMaxMb.toFixed(2)} MB`);
  process.exit(1);
}
console.log(`Bundle size ${mb.toFixed(2)} MB within budget ${scaledMaxMb.toFixed(2)} MB`);
