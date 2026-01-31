import { describe, expect, it, vi } from 'vitest';
import { ClientPrediction } from '../../src/net/prediction';
import { SIM_CONFIG } from '../../src/sim/config';
import type { InputCmd } from '../../src/net/input_cmd';
import type { StateSnapshot } from '../../src/net/protocol';

const makeInput = (seq: number, moveX = 0, moveY = 0, sprint = false): InputCmd => ({
  type: 'InputCmd',
  inputSeq: seq,
  moveX,
  moveY,
  lookDeltaX: 0,
  lookDeltaY: 0,
  jump: false,
  fire: false,
  sprint
});

const makeSnapshot = (lastProcessedInputSeq: number, posX: number, posY: number): StateSnapshot => ({
  type: 'StateSnapshot',
  serverTick: 1,
  lastProcessedInputSeq,
  posX,
  posY
});

describe('ClientPrediction', () => {
  it('applies inputs immediately', () => {
    const prediction = new ClientPrediction();
    prediction.setTickRate(60);

    prediction.recordInput(makeInput(1, 1, 0));

    const state = prediction.getState();
    expect(state.x).toBeCloseTo(SIM_CONFIG.moveSpeed / 60);
    expect(state.y).toBeCloseTo(0);
    expect(prediction.isActive()).toBe(true);
  });

  it('applies sprint multiplier', () => {
    const prediction = new ClientPrediction();
    prediction.setTickRate(60);

    prediction.recordInput(makeInput(1, 1, 0, true));

    const state = prediction.getState();
    expect(state.x).toBeCloseTo((SIM_CONFIG.moveSpeed * SIM_CONFIG.sprintMultiplier) / 60);
  });

  it('reconciles and replays unacked inputs', () => {
    const prediction = new ClientPrediction();
    prediction.setTickRate(60);

    prediction.recordInput(makeInput(1, 1, 0));
    prediction.recordInput(makeInput(2, 1, 0));

    prediction.reconcile(makeSnapshot(1, 10, 0));

    const state = prediction.getState();
    expect(state.x).toBeCloseTo(10 + SIM_CONFIG.moveSpeed / 60);
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
    expect(state.x).toBeCloseTo(SIM_CONFIG.moveSpeed / 60);
  });

  it('drops oldest inputs when history exceeds cap', () => {
    const prediction = new ClientPrediction();
    prediction.setTickRate(60);

    for (let i = 1; i <= 121; i += 1) {
      prediction.recordInput(makeInput(i, 1, 0));
    }

    prediction.reconcile(makeSnapshot(0, 0, 0));

    const state = prediction.getState();
    expect(state.x).toBeCloseTo((120 * SIM_CONFIG.moveSpeed) / 60);
  });

  it('clamps invalid axes to zero', () => {
    const prediction = new ClientPrediction();
    prediction.setTickRate(60);

    prediction.recordInput(makeInput(1, Number.NaN, Number.POSITIVE_INFINITY));

    const state = prediction.getState();
    expect(state.x).toBeCloseTo(0);
    expect(state.y).toBeCloseTo(0);
  });

  it('ignores steps when tick rate is invalid', () => {
    const prediction = new ClientPrediction();
    const internal = prediction as unknown as { tickRate: number };
    internal.tickRate = 0;

    prediction.recordInput(makeInput(1, 1, 0));

    const state = prediction.getState();
    expect(state.x).toBeCloseTo(0);
  });

  it('resets the default sim state', () => {
    const prediction = new ClientPrediction();
    prediction.recordInput(makeInput(1, 1, 0));

    const internal = prediction as unknown as { sim: { reset: () => void; getState: () => { x: number; y: number } } };
    internal.sim.reset();

    expect(internal.sim.getState()).toEqual({ x: 0, y: 0 });
  });

  it('seeds replacement sim with current state', () => {
    const prediction = new ClientPrediction();
    prediction.setTickRate(60);

    prediction.recordInput(makeInput(1, 1, 0));
    const seededState = prediction.getState();

    const sim = {
      step: vi.fn(),
      getState: vi.fn(() => ({ x: 10, y: 5 })),
      setState: vi.fn(),
      reset: vi.fn(),
      setConfig: vi.fn()
    };

    prediction.setSim(sim);

    expect(sim.setConfig).toHaveBeenCalledWith(SIM_CONFIG);
    expect(sim.setState).toHaveBeenCalledWith(seededState.x, seededState.y);

    prediction.recordInput(makeInput(2, 1, 0));
    expect(sim.step).toHaveBeenCalled();
    const state = prediction.getState();
    expect(state.x).toBe(10);
    expect(state.y).toBe(5);
  });
});
