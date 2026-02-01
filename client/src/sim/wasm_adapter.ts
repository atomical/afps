import type { PredictionSim } from '../net/prediction';
import type { WasmSimInstance } from './wasm';

export const createWasmPredictionSim = (sim: WasmSimInstance): PredictionSim => ({
  step: (input, dt) => {
    sim.step(
      {
        moveX: input.moveX,
        moveY: input.moveY,
        sprint: input.sprint,
        jump: input.jump,
        dash: input.dash,
        grapple: input.grapple,
        shield: input.shield,
        shockwave: input.shockwave,
        viewYaw: input.viewYaw ?? 0,
        viewPitch: input.viewPitch ?? 0
      },
      dt
    );
  },
  getState: () => {
    const state = sim.getState();
    const shieldTimer = Number.isFinite(state.shieldTimer) ? state.shieldTimer : 0;
    return {
      ...state,
      shieldTimer,
      shieldCooldown: Number.isFinite(state.shieldCooldown) ? state.shieldCooldown : 0,
      shieldActive: shieldTimer > 0
    };
  },
  setState: (x, y, z, velX, velY, velZ, dashCooldown) => sim.setState(x, y, z, velX, velY, velZ, dashCooldown),
  reset: () => sim.reset(),
  setConfig: (config) => sim.setConfig(config)
});
