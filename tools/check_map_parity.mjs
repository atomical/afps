import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = path.join(rootDir, 'client');

const result = spawnSync('npx', ['vitest', 'run', 'tests/environment/map_parity_matrix.test.ts'], {
  cwd: clientDir,
  stdio: 'inherit',
  env: process.env
});

process.exit(result.status ?? 1);
