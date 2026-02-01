import { describe, expect, it } from 'vitest';
import { buildInputCmd, serializeInputCmd } from '../../src/net/input_cmd';
import type { InputSample } from '../../src/input/sampler';

describe('input cmd', () => {
  it('builds and clamps input cmd values', () => {
    const sample: InputSample = {
      moveX: 2,
      moveY: -3,
      lookDeltaX: Number.NaN,
      lookDeltaY: Number.POSITIVE_INFINITY,
      jump: true,
      fire: false,
      sprint: true,
      dash: true,
      weaponSlot: 1
    };

    const cmd = buildInputCmd(-5, sample);

    expect(cmd).toEqual({
      type: 'InputCmd',
      inputSeq: 0,
      moveX: 1,
      moveY: -1,
      lookDeltaX: 0,
      lookDeltaY: 0,
      viewYaw: 0,
      viewPitch: 0,
      weaponSlot: 1,
      jump: true,
      fire: false,
      sprint: true,
      dash: true
    });
  });

  it('serializes input cmd to json', () => {
    const cmd = buildInputCmd(3, {
      moveX: 0,
      moveY: 1,
      lookDeltaX: 4,
      lookDeltaY: -2,
      jump: false,
      fire: true,
      sprint: false,
      dash: false,
      weaponSlot: 0
    });

    const json = serializeInputCmd(cmd);
    expect(JSON.parse(json)).toEqual(cmd);
  });

  it('normalizes non-finite axis values', () => {
    const cmd = buildInputCmd(1, {
      moveX: Number.NaN,
      moveY: Number.POSITIVE_INFINITY,
      lookDeltaX: 0,
      lookDeltaY: 0,
      jump: false,
      fire: false,
      sprint: false,
      dash: false,
      weaponSlot: 2
    });

    expect(cmd.moveX).toBe(0);
    expect(cmd.moveY).toBe(0);
  });
});
