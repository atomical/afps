import type { PredictionSim } from '../net/prediction';
import type { WasmSimInstance } from './wasm';

export const createWasmPredictionSim = (sim: WasmSimInstance): PredictionSim => ({
  step: (input, dt) => {
    sim.step({ moveX: input.moveX, moveY: input.moveY, sprint: input.sprint, jump: input.jump, dash: input.dash }, dt);
  },
  getState: () => sim.getState(),
  setState: (x, y, z, velX, velY, velZ, dashCooldown) => sim.setState(x, y, z, velX, velY, velZ, dashCooldown),
  reset: () => sim.reset(),
  setConfig: (config) => sim.setConfig(config)
});
