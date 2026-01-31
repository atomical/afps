import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wasmDir = path.join(root, 'shared', 'wasm', 'dist');
const jsPath = path.join(wasmDir, 'afps_sim.js');
const wasmPath = path.join(wasmDir, 'afps_sim.wasm');
const configPath = path.join(root, 'shared', 'sim', 'config.json');

if (!fs.existsSync(jsPath) || !fs.existsSync(wasmPath)) {
  console.error('WASM build output missing. Run `cd client && npm run wasm:build` first.');
  process.exit(1);
}

if (!fs.existsSync(configPath)) {
  console.error('Missing shared sim config.json.');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const moveSpeed = Number(config.moveSpeed);
const sprintMultiplier = Number(config.sprintMultiplier);
if (!Number.isFinite(moveSpeed) || !Number.isFinite(sprintMultiplier)) {
  console.error('Invalid moveSpeed/sprintMultiplier in config.json.');
  process.exit(1);
}

const moduleImport = await import(pathToFileURL(jsPath).href);
const factory = moduleImport.default ?? moduleImport;
if (typeof factory !== 'function') {
  console.error('WASM module did not export a factory function.');
  process.exit(1);
}

const module = await factory({
  locateFile: (file) => path.join(wasmDir, file),
  noInitialRun: true
});

const handle = module._sim_create();
module._sim_set_config(handle, moveSpeed, sprintMultiplier);

const dt = 1 / 60;
for (let i = 0; i < 10; i += 1) {
  module._sim_step(handle, dt, 1, 0, 0);
}
for (let i = 0; i < 5; i += 1) {
  module._sim_step(handle, dt, 1, 0, 1);
}
for (let i = 0; i < 10; i += 1) {
  module._sim_step(handle, dt, 0, -1, 0);
}

const wasmX = module._sim_get_x(handle);
const wasmY = module._sim_get_y(handle);
module._sim_destroy(handle);

const expectedX = moveSpeed * dt * (10 + 5 * sprintMultiplier);
const expectedY = -moveSpeed * dt * 10;

const epsilon = 1e-6;
const deltaX = Math.abs(wasmX - expectedX);
const deltaY = Math.abs(wasmY - expectedY);

if (deltaX > epsilon || deltaY > epsilon) {
  console.error(
    `WASM parity mismatch. Expected (${expectedX.toFixed(6)}, ${expectedY.toFixed(6)}) ` +
      `got (${wasmX.toFixed(6)}, ${wasmY.toFixed(6)})`
  );
  process.exit(1);
}

console.log(`WASM parity check OK (dx=${deltaX.toExponential()}, dy=${deltaY.toExponential()}).`);
