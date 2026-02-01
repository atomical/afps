import { describe, expect, it, vi } from 'vitest';
import { ClientPrediction, createJsPredictionSim } from '../../src/net/prediction';
import { SIM_CONFIG } from '../../src/sim/config';
import type { InputCmd } from '../../src/net/input_cmd';
import type { StateSnapshot } from '../../src/net/protocol';

const makeInput = (seq: number, moveX = 0, moveY = 0, sprint = false, jump = false, dash = false): InputCmd => ({
  type: 'InputCmd',
  inputSeq: seq,
  moveX,
  moveY,
  lookDeltaX: 0,
  lookDeltaY: 0,
  viewYaw: 0,
  viewPitch: 0,
  weaponSlot: 0,
  jump,
  fire: false,
  sprint,
  dash
});

const makeSnapshot = (
  lastProcessedInputSeq: number,
  posX: number,
  posY: number,
  posZ = 0,
  velX = 0,
  velY = 0,
  velZ = 0,
  dashCooldown = 0,
  health = 100,
  kills = 0,
  deaths = 0
): StateSnapshot => ({
  type: 'StateSnapshot',
  serverTick: 1,
  lastProcessedInputSeq,
  posX,
  posY,
  posZ,
  velX,
  velY,
  velZ,
  dashCooldown,
  health,
  kills,
  deaths
});

const createRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
};

const computeLinearDistance = (ticks: number, sprint = false) => {
  const dt = 1 / 60;
  const accelStep = SIM_CONFIG.accel * dt;
  let maxSpeed = SIM_CONFIG.moveSpeed * (sprint ? SIM_CONFIG.sprintMultiplier : 1);
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0 || !Number.isFinite(accelStep) || accelStep <= 0) {
    return 0;
  }
  let distance = 0;
  let velocity = 0;
  for (let i = 0; i < ticks; i += 1) {
    velocity += accelStep;
    if (velocity > maxSpeed) {
      velocity = maxSpeed;
    }
    distance += velocity * dt;
  }
  return distance;
};

describe('ClientPrediction', () => {
  it('applies inputs immediately', () => {
    const prediction = new ClientPrediction();
    prediction.setTickRate(60);

    prediction.recordInput(makeInput(1, 1, 0));

    const state = prediction.getState();
    expect(state.x).toBeCloseTo(SIM_CONFIG.accel * (1 / 60) * (1 / 60));
    expect(state.y).toBeCloseTo(0);
    expect(prediction.isActive()).toBe(true);
  });

  it('applies sprint multiplier', () => {
    const normal = new ClientPrediction();
    const sprint = new ClientPrediction();
    normal.setTickRate(60);
    sprint.setTickRate(60);

    for (let i = 1; i <= 10; i += 1) {
      normal.recordInput(makeInput(i, 1, 0, false));
      sprint.recordInput(makeInput(i, 1, 0, true));
    }

    expect(sprint.getState().x).toBeGreaterThan(normal.getState().x);
  });

  it('steps with default config and updates position', () => {
    const sim = createJsPredictionSim();
    sim.step({ moveX: 1, moveY: 0, sprint: false, jump: false, dash: false }, 1 / 60);

    const state = sim.getState();
    expect(state.x).toBeGreaterThan(0);
    expect(state.y).toBeCloseTo(0);
  });

  it('reaches expected jump height', () => {
    const sim = createJsPredictionSim();
    let maxZ = 0;

    for (let i = 0; i < 120; i += 1) {
      sim.step({ moveX: 0, moveY: 0, sprint: false, jump: i === 0, dash: false }, 1 / 60);
      const state = sim.getState();
      maxZ = Math.max(maxZ, state.z);
      if (i > 0 && state.z <= 0 && state.velZ === 0) {
        break;
      }
    }

    expect(maxZ).toBeCloseTo(0.875, 6);
    const state = sim.getState();
    expect(state.z).toBeCloseTo(0);
    expect(state.velZ).toBeCloseTo(0);
  });

  it('clamps downward velocity while grounded', () => {
    const sim = createJsPredictionSim();
    sim.setState(0, 0, 0, 0, 0, -2, 0);

    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1 / 60);

    const state = sim.getState();
    expect(state.z).toBeCloseTo(0);
    expect(state.velZ).toBeCloseTo(0);
  });

  it('resets non-finite vertical state', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      accel: 0,
      friction: 0,
      moveSpeed: 0
    });
    sim.setState(0, 0, 0, 0, 0, 1e308, 0);

    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1e308);

    const state = sim.getState();
    expect(state.z).toBe(0);
    expect(state.velZ).toBe(0);
  });

  it('applies friction when idle', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      accel: 0,
      friction: 5,
      moveSpeed: 0
    });
    sim.setState(0, 0, 0, 1, 0, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);

    const state = sim.getState();
    expect(state.velX).toBeCloseTo(0);
    expect(state.velY).toBeCloseTo(0);
  });

  it('reconciles and replays unacked inputs', () => {
    const prediction = new ClientPrediction();
    prediction.setTickRate(60);

    prediction.recordInput(makeInput(1, 1, 0));
    prediction.recordInput(makeInput(2, 1, 0));

    prediction.reconcile(makeSnapshot(1, 10, 0, 0, 0));

    const state = prediction.getState();
    expect(state.x).toBeCloseTo(10 + SIM_CONFIG.accel * (1 / 60) * (1 / 60));
    expect(state.lastProcessedInputSeq).toBe(1);
  });

  it('ignores out-of-order inputs', () => {
    const prediction = new ClientPrediction();

    prediction.recordInput(makeInput(2, 1, 0));
    prediction.recordInput(makeInput(1, 1, 0));

    const state = prediction.getState();
    expect(state.x).toBeGreaterThan(0);
  });

  it('defaults tick rate when invalid', () => {
    const prediction = new ClientPrediction();
    prediction.setTickRate(0);
    prediction.recordInput(makeInput(1, 1, 0));

    const state = prediction.getState();
    expect(state.x).toBeCloseTo(SIM_CONFIG.accel * (1 / 60) * (1 / 60));
  });

  it('drops oldest inputs when history exceeds cap', () => {
    const prediction = new ClientPrediction();
    prediction.setTickRate(60);

    for (let i = 1; i <= 121; i += 1) {
      prediction.recordInput(makeInput(i, 1, 0));
    }

    prediction.reconcile(makeSnapshot(0, 0, 0, 0, 0));

    const state = prediction.getState();
    expect(state.x).toBeCloseTo(computeLinearDistance(120));
  });

  it('clamps invalid axes to zero', () => {
    const prediction = new ClientPrediction();
    prediction.setTickRate(60);

    prediction.recordInput(makeInput(1, Number.NaN, Number.POSITIVE_INFINITY));

    const state = prediction.getState();
    expect(state.x).toBeCloseTo(0);
    expect(state.y).toBeCloseTo(0);
  });

  it('clamps and decays dash cooldown', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      dashImpulse: 0,
      dashCooldown: 0.5
    });

    sim.setState(0, 0, 0, 0, 0, 0, 0.2);
    const originalIsFinite = Number.isFinite;
    const isFiniteSpy = vi.spyOn(Number, 'isFinite').mockImplementation((value) => {
      if (value === 0.2) {
        return false;
      }
      return originalIsFinite(value);
    });
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 0.1);
    isFiniteSpy.mockRestore();
    expect(sim.getState().dashCooldown).toBe(0);

    sim.setState(0, 0, 0, 0, 0, 0, 0.4);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 0.1);
    expect(sim.getState().dashCooldown).toBeCloseTo(0.3);
  });

  it('applies dash impulse in the input direction', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      dashImpulse: 5,
      dashCooldown: 0.25
    });
    sim.setState(0, 0, 0, 0, 0, 0, 0);
    sim.step({ moveX: 1, moveY: 0, sprint: false, jump: false, dash: true }, 1 / 60);

    const state = sim.getState();
    expect(state.velX).toBeCloseTo(5);
    expect(state.velY).toBeCloseTo(0);
    expect(state.dashCooldown).toBeCloseTo(0.25);
  });

  it('dashes along existing velocity when no input is provided', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      dashImpulse: 3,
      dashCooldown: 0.5
    });
    sim.setState(0, 0, 0, 2, 0, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: true }, 1 / 60);

    const state = sim.getState();
    expect(state.velX).toBeCloseTo(5);
    expect(state.dashCooldown).toBeCloseTo(0.5);
  });

  it('ignores steps when tick rate is invalid', () => {
    const prediction = new ClientPrediction();
    const internal = prediction as unknown as { tickRate: number };
    internal.tickRate = 0;

    prediction.recordInput(makeInput(1, 1, 0));

    const state = prediction.getState();
    expect(state.x).toBeCloseTo(0);
  });

  it('clamps prediction state to arena bounds', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      arenaHalfSize: 1,
      playerRadius: 0.2
    });
    sim.setState(0.6, 0, 0, 1, -2, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);

    expect(sim.getState()).toEqual({ x: 0.8, y: -0.8, z: 0, velX: 0, velY: 0, velZ: 0, dashCooldown: 0 });
  });

  it('preserves tangential velocity when sliding along arena walls', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      arenaHalfSize: 1,
      playerRadius: 0.2
    });
    sim.setState(0.7, 0, 0, 1, 0.5, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);

    const state = sim.getState();
    expect(state.x).toBeCloseTo(0.8);
    expect(state.y).toBeCloseTo(0.5);
    expect(state.velX).toBeCloseTo(0);
    expect(state.velY).toBeCloseTo(0.5);
  });

  it('preserves tangential velocity when sliding along arena floor', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      arenaHalfSize: 1,
      playerRadius: 0.2
    });
    sim.setState(0.1, -0.7, 0, 0.4, -1, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);

    const state = sim.getState();
    expect(state.y).toBeCloseTo(-0.8);
    expect(state.x).toBeCloseTo(0.5);
    expect(state.velY).toBeCloseTo(0);
    expect(state.velX).toBeCloseTo(0.4);
  });

  it('keeps state finite and within arena bounds under random inputs', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      arenaHalfSize: 1,
      playerRadius: 0.2
    });
    const rand = createRng(0x1234abcd);
    const bound = 1 - 0.2;

    for (let i = 0; i < 500; i += 1) {
      const moveX = rand() * 2 - 1;
      const moveY = rand() * 2 - 1;
      const sprint = rand() > 0.5;
      sim.step({ moveX, moveY, sprint, jump: false, dash: false }, 1 / 60);

      const state = sim.getState();
      expect(Number.isFinite(state.x)).toBe(true);
      expect(Number.isFinite(state.y)).toBe(true);
      expect(Number.isFinite(state.velX)).toBe(true);
      expect(Number.isFinite(state.velY)).toBe(true);
      expect(state.x).toBeGreaterThanOrEqual(-bound - 1e-6);
      expect(state.x).toBeLessThanOrEqual(bound + 1e-6);
      expect(state.y).toBeGreaterThanOrEqual(-bound - 1e-6);
      expect(state.y).toBeLessThanOrEqual(bound + 1e-6);
    }
  });

  it('resolves obstacle collisions and preserves tangential velocity', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      obstacleMinX: -0.5,
      obstacleMaxX: 0.5,
      obstacleMinY: -0.25,
      obstacleMaxY: 0.25,
      playerRadius: 0.1
    });
    sim.setState(0.55, 0, 0, 0.02, 0.05, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);

    const state = sim.getState();
    expect(state.x).toBeCloseTo(0.6);
    expect(state.y).toBeCloseTo(0.05);
    expect(state.velX).toBeCloseTo(0);
    expect(state.velY).toBeCloseTo(0.05);
  });

  it('skips obstacle resolution when outside the obstacle', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      arenaHalfSize: 0,
      obstacleMinX: -0.5,
      obstacleMaxX: 0.5,
      obstacleMinY: -0.25,
      obstacleMaxY: 0.25,
      playerRadius: 0.1
    });
    sim.setState(2, 2, 0, 0.1, 0.1, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);

    const state = sim.getState();
    expect(state.x).toBeCloseTo(2.1);
    expect(state.y).toBeCloseTo(2.1);
  });

  it('resolves obstacle collisions on the left side', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      obstacleMinX: -0.5,
      obstacleMaxX: 0.5,
      obstacleMinY: -0.25,
      obstacleMaxY: 0.25,
      playerRadius: 0.1
    });
    sim.setState(-0.55, 0, 0, -0.02, 0, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);

    const state = sim.getState();
    expect(state.x).toBeCloseTo(-0.6);
    expect(state.velX).toBeCloseTo(0);
  });

  it('resolves obstacle collisions on the bottom and top sides', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      obstacleMinX: -0.5,
      obstacleMaxX: 0.5,
      obstacleMinY: -0.25,
      obstacleMaxY: 0.25,
      playerRadius: 0.1
    });
    sim.setState(0, -0.32, 0, 0, -0.02, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);
    let state = sim.getState();
    expect(state.y).toBeCloseTo(-0.35);
    expect(state.velY).toBeCloseTo(0);

    sim.setState(0, 0.32, 0, 0, 0.02, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);
    state = sim.getState();
    expect(state.y).toBeCloseTo(0.35);
    expect(state.velY).toBeCloseTo(0);
  });

  it('sweeps into obstacle from the right side', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      obstacleMinX: -0.5,
      obstacleMaxX: 0.5,
      obstacleMinY: -0.25,
      obstacleMaxY: 0.25,
      playerRadius: 0.1
    });
    sim.setState(2, 0, 0, -4, 0, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);

    const state = sim.getState();
    expect(state.x).toBeCloseTo(0.6);
    expect(state.velX).toBeCloseTo(0);
  });

  it('sweeps into obstacle from below and above', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      obstacleMinX: -0.5,
      obstacleMaxX: 0.5,
      obstacleMinY: -0.25,
      obstacleMaxY: 0.25,
      playerRadius: 0.1
    });
    sim.setState(0, -2, 0, 0, 3, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);
    let state = sim.getState();
    expect(state.y).toBeCloseTo(-0.35);
    expect(state.velY).toBeCloseTo(0);

    sim.setState(0, 2, 0, 0, -3, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);
    state = sim.getState();
    expect(state.y).toBeCloseTo(0.35);
    expect(state.velY).toBeCloseTo(0);
  });

  it('ignores invalid obstacle configuration', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      arenaHalfSize: 0,
      obstacleMinX: Number.NaN,
      obstacleMaxX: 0.5,
      obstacleMinY: 0.25,
      obstacleMaxY: -0.25
    });
    sim.setState(1.2, -1.2, 0, 0.1, -0.1, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);

    const state = sim.getState();
    expect(state.x).toBeCloseTo(1.3);
    expect(state.y).toBeCloseTo(-1.3);
  });

  it('ignores non-finite obstacle bounds on X', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      arenaHalfSize: 0,
      obstacleMinX: Number.NaN,
      obstacleMaxX: 0.5,
      obstacleMinY: -0.25,
      obstacleMaxY: 0.25,
      playerRadius: 0.1
    });
    sim.setState(0, 0, 0, 1, 0, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);

    const state = sim.getState();
    expect(state.x).toBeCloseTo(1);
  });

  it('ignores non-finite obstacle bounds on Y', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      arenaHalfSize: 0,
      obstacleMinX: -0.5,
      obstacleMaxX: 0.5,
      obstacleMinY: Number.NaN,
      obstacleMaxY: 0.25,
      playerRadius: 0.1
    });
    sim.setState(0, 0, 0, 0, 1, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);

    const state = sim.getState();
    expect(state.y).toBeCloseTo(1);
  });

  it('clamps starting positions outside arena bounds', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      arenaHalfSize: 1,
      playerRadius: 0.1
    });
    sim.setState(-2, -2, 0, -1, -1, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);
    let state = sim.getState();
    expect(state.x).toBeCloseTo(-0.9);
    expect(state.y).toBeCloseTo(-0.9);
    expect(state.velX).toBeCloseTo(0);
    expect(state.velY).toBeCloseTo(0);

    sim.setState(2, 2, 0, 1, 1, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);
    state = sim.getState();
    expect(state.x).toBeCloseTo(0.9);
    expect(state.y).toBeCloseTo(0.9);
    expect(state.velX).toBeCloseTo(0);
    expect(state.velY).toBeCloseTo(0);
  });

  it('skips obstacle sweep when outside the obstacle Y range', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      obstacleMinX: -0.5,
      obstacleMaxX: 0.5,
      obstacleMinY: -0.25,
      obstacleMaxY: 0.25,
      playerRadius: 0.1
    });
    sim.setState(-2, 2, 0, 4, 0, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);

    const state = sim.getState();
    expect(state.x).toBeCloseTo(2);
    expect(state.y).toBeCloseTo(2);
  });

  it('skips obstacle sweep when segment is too short to reach the obstacle', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      obstacleMinX: -0.5,
      obstacleMaxX: 0.5,
      obstacleMinY: -0.25,
      obstacleMaxY: 0.25,
      playerRadius: 0.1
    });
    sim.setState(2, 0, 0, -0.1, 0, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);

    const state = sim.getState();
    expect(state.x).toBeCloseTo(1.9);
    expect(state.y).toBeCloseTo(0);
    expect(state.velX).toBeCloseTo(-0.1);
  });

  it('sweeps into arena bounds on positive axes', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      arenaHalfSize: 1,
      playerRadius: 0.1
    });
    sim.setState(0.8, 0.8, 0, 2, 3, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);

    const state = sim.getState();
    expect(state.x).toBeCloseTo(0.9);
    expect(state.y).toBeCloseTo(0.9);
    expect(state.velX).toBeCloseTo(0);
    expect(state.velY).toBeCloseTo(0);
  });

  it('prevents tunneling through obstacle at high speed', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      obstacleMinX: -0.5,
      obstacleMaxX: 0.5,
      obstacleMinY: -0.25,
      obstacleMaxY: 0.25,
      playerRadius: 0.1
    });
    const expandedMinX = -0.5 - 0.1;
    sim.setState(-2, 0, 0, 6, 0.2, 0, 0);
    sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);

    const state = sim.getState();
    expect(state.x).toBeLessThanOrEqual(expandedMinX + 1e-6);
    expect(state.y).toBeGreaterThan(0);
  });

  it('prevents tunneling through obstacle under randomized traversal', () => {
    const sim = createJsPredictionSim({
      ...SIM_CONFIG,
      moveSpeed: 0,
      accel: 0,
      friction: 0,
      obstacleMinX: -0.5,
      obstacleMaxX: 0.5,
      obstacleMinY: -0.25,
      obstacleMaxY: 0.25,
      playerRadius: 0.1
    });
    const expandedMinX = -0.5 - 0.1;
    const minY = -0.25 - 0.1;
    const maxY = 0.25 + 0.1;
    const rand = createRng(0x91e10da5);

    for (let i = 0; i < 200; i += 1) {
      const startY = minY + (maxY - minY) * rand();
      const velX = 2 + 10 * rand();
      sim.setState(-2, startY, 0, velX, 0, 0, 0);
      sim.step({ moveX: 0, moveY: 0, sprint: false, jump: false, dash: false }, 1);

      const state = sim.getState();
      expect(state.x).toBeLessThanOrEqual(expandedMinX + 1e-6);
    }
  });

  it('resets the default sim state', () => {
    const prediction = new ClientPrediction();
    prediction.recordInput(makeInput(1, 1, 0));

    const internal = prediction as unknown as {
      sim: {
        reset: () => void;
        getState: () => { x: number; y: number; z: number; velX: number; velY: number; velZ: number; dashCooldown: number };
      };
    };
    internal.sim.reset();

    expect(internal.sim.getState()).toEqual({ x: 0, y: 0, z: 0, velX: 0, velY: 0, velZ: 0, dashCooldown: 0 });
  });

  it('seeds replacement sim with current state', () => {
    const prediction = new ClientPrediction();
    prediction.setTickRate(60);

    prediction.recordInput(makeInput(1, 1, 0));
    const seededState = prediction.getState();

    const sim = {
      step: vi.fn(),
      getState: vi.fn(() => ({ x: 10, y: 5, z: 2, velX: 1, velY: -1, velZ: 0.5, dashCooldown: 0.2 })),
      setState: vi.fn(),
      reset: vi.fn(),
      setConfig: vi.fn()
    };

    prediction.setSim(sim);

    expect(sim.setConfig).toHaveBeenCalledWith(SIM_CONFIG);
    expect(sim.setState).toHaveBeenCalledWith(
      seededState.x,
      seededState.y,
      seededState.z,
      seededState.velX,
      seededState.velY,
      seededState.velZ,
      seededState.dashCooldown
    );

    prediction.recordInput(makeInput(2, 1, 0));
    expect(sim.step).toHaveBeenCalled();
    const state = prediction.getState();
    expect(state.x).toBe(10);
    expect(state.y).toBe(5);
    expect(state.z).toBe(2);
    expect(state.velX).toBe(1);
    expect(state.velY).toBe(-1);
    expect(state.velZ).toBe(0.5);
  });
});
