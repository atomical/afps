import { describe, expect, it, vi } from 'vitest';
import { createWasmPredictionSim } from '../../src/sim/wasm_adapter';

const makeSim = () => ({
  step: vi.fn(),
  getState: vi.fn(() => ({ x: 1, y: -2 })),
  setState: vi.fn(),
  reset: vi.fn(),
  setConfig: vi.fn(),
  dispose: vi.fn()
});

describe('createWasmPredictionSim', () => {
  it('adapts wasm sim to prediction interface', () => {
    const sim = makeSim();
    const adapter = createWasmPredictionSim(sim);

    adapter.setConfig({ moveSpeed: 5, sprintMultiplier: 2 });
    adapter.setState(3, 4);
    adapter.step({ moveX: 1, moveY: -1, sprint: true }, 0.016);

    expect(sim.setConfig).toHaveBeenCalledWith({ moveSpeed: 5, sprintMultiplier: 2 });
    expect(sim.setState).toHaveBeenCalledWith(3, 4);
    expect(sim.step).toHaveBeenCalledWith({ moveX: 1, moveY: -1, sprint: true }, 0.016);
    expect(adapter.getState()).toEqual({ x: 1, y: -2 });

    adapter.reset();
    expect(sim.reset).toHaveBeenCalled();
  });
});
