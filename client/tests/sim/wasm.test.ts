import { describe, expect, it, vi } from 'vitest';
import { SIM_CONFIG } from '../../src/sim/config';
import { createWasmSim, loadWasmSim, loadWasmSimFromUrl, type WasmSimModule } from '../../src/sim/wasm';

describe('wasm sim wrapper', () => {
  const makeModule = (): WasmSimModule => ({
    _sim_create: vi.fn(() => 42),
    _sim_destroy: vi.fn(),
    _sim_reset: vi.fn(),
    _sim_set_config: vi.fn(),
    _sim_set_state: vi.fn(),
    _sim_step: vi.fn(),
    _sim_get_x: vi.fn(() => 1.5),
    _sim_get_y: vi.fn(() => -2.5)
  });

  it('creates sim and forwards steps', () => {
    const module = makeModule();
    const sim = createWasmSim(module, { moveSpeed: 7, sprintMultiplier: 2 });

    expect(module._sim_create).toHaveBeenCalledTimes(1);
    expect(module._sim_set_config).toHaveBeenCalledWith(42, 7, 2);

    sim.step({ moveX: 1, moveY: -1, sprint: true }, 0.016);
    expect(module._sim_step).toHaveBeenCalledWith(42, 0.016, 1, -1, 1);

    sim.step({ moveX: Number.NaN, moveY: Number.POSITIVE_INFINITY, sprint: false }, Number.NaN);
    expect(module._sim_step).toHaveBeenCalledWith(42, 0, 0, 0, 0);

    sim.setState(2, -3);
    expect(module._sim_set_state).toHaveBeenCalledWith(42, 2, -3);

    sim.setState(Number.NaN, Number.POSITIVE_INFINITY);
    expect(module._sim_set_state).toHaveBeenCalledWith(42, 0, 0);

    expect(sim.getState()).toEqual({ x: 1.5, y: -2.5 });

    sim.reset();
    expect(module._sim_reset).toHaveBeenCalledWith(42);

    sim.setConfig({ moveSpeed: 5, sprintMultiplier: 1.5 });
    expect(module._sim_set_config).toHaveBeenLastCalledWith(42, 5, 1.5);

    sim.dispose();
    expect(module._sim_destroy).toHaveBeenCalledWith(42);
  });

  it('loads sim via factory with default config', async () => {
    const module = makeModule();
    const factory = vi.fn(async () => module);

    const sim = await loadWasmSim(factory);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(module._sim_set_config).toHaveBeenCalledWith(42, SIM_CONFIG.moveSpeed, SIM_CONFIG.sprintMultiplier);

    sim.dispose();
  });

  it('loads sim from url via importer', async () => {
    const module = makeModule();
    const factory = vi.fn(async () => module);
    const importer = vi.fn(async () => ({ default: factory }));

    const sim = await loadWasmSimFromUrl('/wasm/afps_sim.js', undefined, importer);

    expect(importer).toHaveBeenCalledWith('/wasm/afps_sim.js');
    expect(factory).toHaveBeenCalledTimes(1);
    sim.dispose();
  });

  it('rejects when module does not export a factory', async () => {
    await expect(loadWasmSimFromUrl('/wasm/afps_sim.js', undefined, async () => ({}))).rejects.toThrow(
      'WASM module did not export a factory'
    );
  });
});
