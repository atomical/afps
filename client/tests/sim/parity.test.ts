import { describe, expect, it } from 'vitest';
import { SIM_CONFIG } from '../../src/sim/config';
import { runWasmParityCheck } from '../../src/sim/parity';
import type { WasmSimInstance } from '../../src/sim/wasm';

type Config = { moveSpeed: number; sprintMultiplier: number };

const clampAxis = (value: number) => Math.max(-1, Math.min(1, value));

const createFakeWasmSim = (speedScale = 1): WasmSimInstance => {
  let state = { x: 0, y: 0 };
  let config: Config = { ...SIM_CONFIG };

  return {
    step: (input, dt) => {
      if (!Number.isFinite(dt) || dt <= 0) {
        return;
      }
      const moveX = clampAxis(Number.isFinite(input.moveX) ? input.moveX : 0);
      const moveY = clampAxis(Number.isFinite(input.moveY) ? input.moveY : 0);
      let speed = config.moveSpeed * speedScale;
      if (input.sprint) {
        speed *= config.sprintMultiplier;
      }
      state.x += moveX * speed * dt;
      state.y += moveY * speed * dt;
    },
    getState: () => ({ ...state }),
    reset: () => {
      state = { x: 0, y: 0 };
    },
    setConfig: (next) => {
      config = { ...next };
    },
    setState: (x, y) => {
      state = { x, y };
    },
    dispose: () => {}
  };
};

describe('runWasmParityCheck', () => {
  it('reports parity when sims match and resets state', () => {
    const sim = createFakeWasmSim(1);
    const result = runWasmParityCheck(sim);

    expect(result.ok).toBe(true);
    expect(result.deltaX).toBeCloseTo(0);
    expect(result.deltaY).toBeCloseTo(0);
    expect(sim.getState()).toEqual({ x: 0, y: 0 });
  });

  it('reports mismatch when sims diverge', () => {
    const sim = createFakeWasmSim(1.1);
    const result = runWasmParityCheck(sim, SIM_CONFIG, { epsilon: 1e-8 });

    expect(result.ok).toBe(false);
    expect(result.deltaX).toBeGreaterThan(0);
  });
});
