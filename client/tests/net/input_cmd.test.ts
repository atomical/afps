import { describe, expect, it } from 'vitest';
import { buildInputCmd } from '../../src/net/input_cmd';
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
      ads: false,
      sprint: true,
      dash: true,
      grapple: true,
      shield: true,
      shockwave: true,
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
      ads: false,
      sprint: true,
      dash: true,
      grapple: true,
      shield: true,
      shockwave: true
    });
  });

  it('normalizes non-finite axis values', () => {
    const cmd = buildInputCmd(1, {
      moveX: Number.NaN,
      moveY: Number.POSITIVE_INFINITY,
      lookDeltaX: 0,
      lookDeltaY: 0,
      jump: false,
      fire: false,
      ads: false,
      sprint: false,
      dash: false,
      grapple: false,
      shield: false,
      shockwave: false,
      weaponSlot: 2
    });

    expect(cmd.moveX).toBe(0);
    expect(cmd.moveY).toBe(0);
  });

  it('clamps weapon slots to non-negative integers', () => {
    const cmd = buildInputCmd(1, {
      moveX: 0,
      moveY: 0,
      lookDeltaX: 0,
      lookDeltaY: 0,
      jump: false,
      fire: false,
      ads: false,
      sprint: false,
      dash: false,
      grapple: false,
      shield: false,
      shockwave: false,
      weaponSlot: Number.NaN
    });

    expect(cmd.weaponSlot).toBe(0);
  });
});
