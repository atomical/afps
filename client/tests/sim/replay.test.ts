import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createJsPredictionSim } from '../../src/net/prediction';
import { SIM_CONFIG } from '../../src/sim/config';

const resolveReplayPath = () => {
  let path = '';
  try {
    const url = new URL('../../../shared/sim/replays/ability_replay.json', import.meta.url);
    if (url.protocol === 'file:') {
      path = fileURLToPath(url);
    }
  } catch {
    path = '';
  }
  if (!path) {
    const direct = resolve(process.cwd(), 'shared/sim/replays/ability_replay.json');
    if (existsSync(direct)) {
      path = direct;
    } else {
      path = resolve(process.cwd(), '..', 'shared/sim/replays/ability_replay.json');
    }
  }
  return path;
};

const replayPath = resolveReplayPath();

describe('sim replay', () => {
  it('matches the shared replay snapshot', () => {
    const replay = JSON.parse(readFileSync(replayPath, 'utf8')) as {
      dt: number;
      inputs: Array<Record<string, unknown>>;
      expected: Record<string, number>;
    };

    const sim = createJsPredictionSim(SIM_CONFIG);
    for (const input of replay.inputs) {
      sim.step(
        {
          moveX: Number(input.moveX ?? 0),
          moveY: Number(input.moveY ?? 0),
          sprint: Boolean(input.sprint),
          jump: Boolean(input.jump),
          dash: Boolean(input.dash),
          grapple: Boolean(input.grapple),
          shield: Boolean(input.shield),
          shockwave: Boolean(input.shockwave),
          viewYaw: Number(input.viewYaw ?? 0),
          viewPitch: Number(input.viewPitch ?? 0)
        },
        Number(replay.dt)
      );
    }

    const state = sim.getState();
    expect(state.x).toBeCloseTo(replay.expected.x, 5);
    expect(state.y).toBeCloseTo(replay.expected.y, 5);
    expect(state.z).toBeCloseTo(replay.expected.z, 5);
    expect(state.velX).toBeCloseTo(replay.expected.velX, 5);
    expect(state.velY).toBeCloseTo(replay.expected.velY, 5);
    expect(state.velZ).toBeCloseTo(replay.expected.velZ, 5);
    expect(state.dashCooldown).toBeCloseTo(replay.expected.dashCooldown, 5);
  });
});
