import type { PredictionSim } from '../net/prediction';
import type { WasmSimInstance } from './wasm';

export const createWasmPredictionSim = (sim: WasmSimInstance): PredictionSim => ({
  step: (input, dt) => {
    sim.step({ moveX: input.moveX, moveY: input.moveY, sprint: input.sprint }, dt);
  },
  getState: () => sim.getState(),
  setState: (x, y) => sim.setState(x, y),
  reset: () => sim.reset(),
  setConfig: (config) => sim.setConfig(config)
});
