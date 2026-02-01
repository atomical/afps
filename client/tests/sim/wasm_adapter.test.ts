import { describe, expect, it, vi } from 'vitest';
import { createWasmPredictionSim } from '../../src/sim/wasm_adapter';

const makeSim = () => ({
  step: vi.fn(),
  getState: vi.fn(() => ({ x: 1, y: -2, z: 0.5, velX: 0.5, velY: -0.5, velZ: 1, dashCooldown: 0.25 })),
  setState: vi.fn(),
  reset: vi.fn(),
  setConfig: vi.fn(),
  dispose: vi.fn()
});

describe('createWasmPredictionSim', () => {
  it('adapts wasm sim to prediction interface', () => {
    const sim = makeSim();
  const adapter = createWasmPredictionSim(sim);

  adapter.setConfig({
    moveSpeed: 5,
    sprintMultiplier: 2,
    accel: 50,
    friction: 8,
    gravity: 30,
    jumpVelocity: 7.5,
    dashImpulse: 12,
    dashCooldown: 0.5,
    grappleMaxDistance: 20,
    grapplePullStrength: 25,
    grappleDamping: 4,
    grappleCooldown: 1,
    grappleMinAttachNormalY: 0.2,
    grappleRopeSlack: 0.5,
    arenaHalfSize: 25,
    playerRadius: 0.5,
    obstacleMinX: -1,
    obstacleMaxX: 1,
    obstacleMinY: -1,
    obstacleMaxY: 1
  });
  adapter.setState(3, 4, 2, 1, -1, 0.25, 0.15);
  adapter.step({ moveX: 1, moveY: -1, sprint: true, jump: true, dash: true }, 0.016);

  expect(sim.setConfig).toHaveBeenCalledWith({
    moveSpeed: 5,
    sprintMultiplier: 2,
    accel: 50,
    friction: 8,
    gravity: 30,
    jumpVelocity: 7.5,
    dashImpulse: 12,
    dashCooldown: 0.5,
    grappleMaxDistance: 20,
    grapplePullStrength: 25,
    grappleDamping: 4,
    grappleCooldown: 1,
    grappleMinAttachNormalY: 0.2,
    grappleRopeSlack: 0.5,
    arenaHalfSize: 25,
    playerRadius: 0.5,
    obstacleMinX: -1,
    obstacleMaxX: 1,
    obstacleMinY: -1,
    obstacleMaxY: 1
  });
  expect(sim.setState).toHaveBeenCalledWith(3, 4, 2, 1, -1, 0.25, 0.15);
  expect(sim.step).toHaveBeenCalledWith({ moveX: 1, moveY: -1, sprint: true, jump: true, dash: true }, 0.016);
  expect(adapter.getState()).toEqual({ x: 1, y: -2, z: 0.5, velX: 0.5, velY: -0.5, velZ: 1, dashCooldown: 0.25 });

    adapter.reset();
    expect(sim.reset).toHaveBeenCalled();
  });
});
