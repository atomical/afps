import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
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
    _sim_get_y: vi.fn(() => -2.5),
    _sim_get_z: vi.fn(() => 0.75),
    _sim_get_vx: vi.fn(() => 0.25),
    _sim_get_vy: vi.fn(() => -0.75),
    _sim_get_vz: vi.fn(() => 1.25),
    _sim_get_dash_cooldown: vi.fn(() => 0.25)
  });

  it('creates sim and forwards steps', () => {
    const module = makeModule();
    const sim = createWasmSim(module, {
      moveSpeed: 7,
      sprintMultiplier: 2,
      accel: 40,
      friction: 6,
      gravity: 20,
      jumpVelocity: 9,
      dashImpulse: 11,
      dashCooldown: 0.4,
      grappleMaxDistance: 18,
      grapplePullStrength: 30,
      grappleDamping: 3.5,
      grappleCooldown: 1.25,
      grappleMinAttachNormalY: 0.35,
      grappleRopeSlack: 0.75,
      arenaHalfSize: 30,
      playerRadius: 0.4,
      obstacleMinX: -1,
      obstacleMaxX: 1,
      obstacleMinY: -0.5,
      obstacleMaxY: 0.5
    });

    expect(module._sim_create).toHaveBeenCalledTimes(1);
    expect(module._sim_set_config).toHaveBeenCalledWith(
      42,
      7,
      2,
      40,
      6,
      20,
      9,
      11,
      0.4,
      18,
      30,
      3.5,
      1.25,
      0.35,
      0.75,
      30,
      0.4,
      -1,
      1,
      -0.5,
      0.5
    );

    sim.step({ moveX: 1, moveY: -1, sprint: true, jump: true, dash: true }, 0.016);
    expect(module._sim_step).toHaveBeenCalledWith(42, 0.016, 1, -1, 1, 1, 1);

    sim.step({ moveX: Number.NaN, moveY: Number.POSITIVE_INFINITY, sprint: false, jump: false, dash: false }, Number.NaN);
    expect(module._sim_step).toHaveBeenCalledWith(42, 0, 0, 0, 0, 0, 0);

    sim.setState(2, -3, 1, 0.5, -1, 2, 0.2);
    expect(module._sim_set_state).toHaveBeenCalledWith(42, 2, -3, 1, 0.5, -1, 2, 0.2);

    sim.setState(
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NaN,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NaN,
      Number.NaN
    );
    expect(module._sim_set_state).toHaveBeenCalledWith(42, 0, 0, 0, 0, 0, 0, 0);

    expect(sim.getState()).toEqual({
      x: 1.5,
      y: -2.5,
      z: 0.75,
      velX: 0.25,
      velY: -0.75,
      velZ: 1.25,
      dashCooldown: 0.25
    });

    sim.reset();
    expect(module._sim_reset).toHaveBeenCalledWith(42);

    sim.setConfig({
      moveSpeed: 5,
      sprintMultiplier: 1.5,
      accel: SIM_CONFIG.accel,
      friction: SIM_CONFIG.friction,
      gravity: SIM_CONFIG.gravity,
      jumpVelocity: SIM_CONFIG.jumpVelocity,
      dashImpulse: SIM_CONFIG.dashImpulse,
      dashCooldown: SIM_CONFIG.dashCooldown,
      grappleMaxDistance: SIM_CONFIG.grappleMaxDistance,
      grapplePullStrength: SIM_CONFIG.grapplePullStrength,
      grappleDamping: SIM_CONFIG.grappleDamping,
      grappleCooldown: SIM_CONFIG.grappleCooldown,
      grappleMinAttachNormalY: SIM_CONFIG.grappleMinAttachNormalY,
      grappleRopeSlack: SIM_CONFIG.grappleRopeSlack,
      arenaHalfSize: SIM_CONFIG.arenaHalfSize,
      playerRadius: SIM_CONFIG.playerRadius,
      obstacleMinX: SIM_CONFIG.obstacleMinX,
      obstacleMaxX: SIM_CONFIG.obstacleMaxX,
      obstacleMinY: SIM_CONFIG.obstacleMinY,
      obstacleMaxY: SIM_CONFIG.obstacleMaxY
    });
    expect(module._sim_set_config).toHaveBeenLastCalledWith(
      42,
      5,
      1.5,
      SIM_CONFIG.accel,
      SIM_CONFIG.friction,
      SIM_CONFIG.gravity,
      SIM_CONFIG.jumpVelocity,
      SIM_CONFIG.dashImpulse,
      SIM_CONFIG.dashCooldown,
      SIM_CONFIG.grappleMaxDistance,
      SIM_CONFIG.grapplePullStrength,
      SIM_CONFIG.grappleDamping,
      SIM_CONFIG.grappleCooldown,
      SIM_CONFIG.grappleMinAttachNormalY,
      SIM_CONFIG.grappleRopeSlack,
      SIM_CONFIG.arenaHalfSize,
      SIM_CONFIG.playerRadius,
      SIM_CONFIG.obstacleMinX,
      SIM_CONFIG.obstacleMaxX,
      SIM_CONFIG.obstacleMinY,
      SIM_CONFIG.obstacleMaxY
    );

    sim.dispose();
    expect(module._sim_destroy).toHaveBeenCalledWith(42);
  });

  it('loads sim via factory with default config', async () => {
    const module = makeModule();
    const factory = vi.fn(async () => module);

    const sim = await loadWasmSim(factory);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(module._sim_set_config).toHaveBeenCalledWith(
      42,
      SIM_CONFIG.moveSpeed,
      SIM_CONFIG.sprintMultiplier,
      SIM_CONFIG.accel,
      SIM_CONFIG.friction,
      SIM_CONFIG.gravity,
      SIM_CONFIG.jumpVelocity,
      SIM_CONFIG.dashImpulse,
      SIM_CONFIG.dashCooldown,
      SIM_CONFIG.grappleMaxDistance,
      SIM_CONFIG.grapplePullStrength,
      SIM_CONFIG.grappleDamping,
      SIM_CONFIG.grappleCooldown,
      SIM_CONFIG.grappleMinAttachNormalY,
      SIM_CONFIG.grappleRopeSlack,
      SIM_CONFIG.arenaHalfSize,
      SIM_CONFIG.playerRadius,
      SIM_CONFIG.obstacleMinX,
      SIM_CONFIG.obstacleMaxX,
      SIM_CONFIG.obstacleMinY,
      SIM_CONFIG.obstacleMaxY
    );

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

  it('loads sim from url via default importer', async () => {
    const moduleUrl = pathToFileURL(resolve(process.cwd(), 'tests/fixtures/wasm_stub.js')).href;

    const sim = await loadWasmSimFromUrl(moduleUrl);

    expect(sim.getState()).toEqual({ x: 0, y: 0, z: 0, velX: 0, velY: 0, velZ: 0, dashCooldown: 0 });
    sim.dispose();
  });

  it('rejects when module does not export a factory', async () => {
    await expect(loadWasmSimFromUrl('/wasm/afps_sim.js', undefined, async () => ({}))).rejects.toThrow(
      'WASM module did not export a factory'
    );
  });
});
