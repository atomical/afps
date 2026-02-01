import { SIM_CONFIG, type SimConfig } from './config';
import { createJsPredictionSim, type PredictionInput } from '../net/prediction';
import type { WasmSimInstance } from './wasm';

export interface ParityCheckResult {
  ok: boolean;
  deltaX: number;
  deltaY: number;
  deltaZ: number;
  deltaVx: number;
  deltaVy: number;
  deltaVz: number;
  deltaDashCooldown: number;
  js: { x: number; y: number; z: number; velX: number; velY: number; velZ: number; dashCooldown: number };
  wasm: { x: number; y: number; z: number; velX: number; velY: number; velZ: number; dashCooldown: number };
}

const DEFAULT_DT = 1 / 60;
const DEFAULT_EPSILON = 1e-6;

const buildDefaultScript = (): PredictionInput[] => {
  const script: PredictionInput[] = [];
  for (let i = 0; i < 10; i += 1) {
    script.push({
      moveX: 1,
      moveY: 0,
      sprint: false,
      jump: false,
      dash: false,
      grapple: false,
      shield: false,
      shockwave: false
    });
  }
  for (let i = 0; i < 5; i += 1) {
    script.push({
      moveX: 1,
      moveY: 0,
      sprint: true,
      jump: false,
      dash: false,
      grapple: false,
      shield: false,
      shockwave: false
    });
  }
  for (let i = 0; i < 10; i += 1) {
    script.push({
      moveX: 0,
      moveY: -1,
      sprint: false,
      jump: i === 0,
      dash: false,
      grapple: false,
      shield: false,
      shockwave: false
    });
  }
  return script;
};

export const runWasmParityCheck = (
  sim: WasmSimInstance,
  config: SimConfig = SIM_CONFIG,
  options?: {
    script?: PredictionInput[];
    dt?: number;
    epsilon?: number;
  }
): ParityCheckResult => {
  const script = options?.script ?? buildDefaultScript();
  const dt = options?.dt ?? DEFAULT_DT;
  const epsilon = options?.epsilon ?? DEFAULT_EPSILON;

  const jsSim = createJsPredictionSim(config);
  sim.setConfig(config);
  sim.reset();

  for (const input of script) {
    jsSim.step(input, dt);
    sim.step(input, dt);
  }

  const js = jsSim.getState();
  const wasm = sim.getState();
  const deltaX = Math.abs(js.x - wasm.x);
  const deltaY = Math.abs(js.y - wasm.y);
  const deltaZ = Math.abs(js.z - wasm.z);
  const deltaVx = Math.abs(js.velX - wasm.velX);
  const deltaVy = Math.abs(js.velY - wasm.velY);
  const deltaVz = Math.abs(js.velZ - wasm.velZ);
  const deltaDashCooldown = Math.abs(js.dashCooldown - wasm.dashCooldown);
  const ok =
    deltaX <= epsilon &&
    deltaY <= epsilon &&
    deltaZ <= epsilon &&
    deltaVx <= epsilon &&
    deltaVy <= epsilon &&
    deltaVz <= epsilon &&
    deltaDashCooldown <= epsilon;

  sim.reset();
  sim.setConfig(config);

  return { ok, deltaX, deltaY, deltaZ, deltaVx, deltaVy, deltaVz, deltaDashCooldown, js, wasm };
};
