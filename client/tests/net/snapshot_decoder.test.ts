import { describe, expect, it } from 'vitest';
import { SnapshotDecoder } from '../../src/net/snapshot_decoder';
import {
  SNAPSHOT_MASK_POS_X,
  SNAPSHOT_MASK_VEL_Y,
  type StateSnapshot,
  type StateSnapshotDelta
} from '../../src/net/protocol';

describe('SnapshotDecoder', () => {
  const baseSnapshot: StateSnapshot = {
    type: 'StateSnapshot',
    serverTick: 5,
    lastProcessedInputSeq: 2,
    posX: 1.25,
    posY: -2,
    posZ: 0.5,
    velX: 0.1,
    velY: -0.2,
    velZ: 0.05,
    dashCooldown: 0.4,
    clientId: 'client-1'
  };

  it('returns null for delta snapshots without a base', () => {
    const decoder = new SnapshotDecoder();
    const delta: StateSnapshotDelta = {
      type: 'StateSnapshotDelta',
      serverTick: 6,
      baseTick: 5,
      lastProcessedInputSeq: 3,
      mask: SNAPSHOT_MASK_POS_X,
      posX: 2.5
    };

    expect(decoder.apply(delta)).toBeNull();
  });

  it('clears the cached keyframe on reset', () => {
    const decoder = new SnapshotDecoder();
    decoder.apply(baseSnapshot);
    decoder.reset();

    const delta: StateSnapshotDelta = {
      type: 'StateSnapshotDelta',
      serverTick: 6,
      baseTick: 5,
      lastProcessedInputSeq: 3,
      mask: SNAPSHOT_MASK_POS_X,
      posX: 2.0
    };

    expect(decoder.apply(delta)).toBeNull();
  });

  it('reconstructs delta snapshots from the last keyframe', () => {
    const decoder = new SnapshotDecoder();
    expect(decoder.apply(baseSnapshot)).toEqual(baseSnapshot);

    const delta: StateSnapshotDelta = {
      type: 'StateSnapshotDelta',
      serverTick: 6,
      baseTick: 5,
      lastProcessedInputSeq: 3,
      mask: SNAPSHOT_MASK_POS_X | SNAPSHOT_MASK_VEL_Y,
      posX: 2.5,
      velY: 1.0
    };

    expect(decoder.apply(delta)).toEqual({
      type: 'StateSnapshot',
      serverTick: 6,
      lastProcessedInputSeq: 3,
      posX: 2.5,
      posY: -2,
      posZ: 0.5,
      velX: 0.1,
      velY: 1.0,
      velZ: 0.05,
      dashCooldown: 0.4,
      clientId: 'client-1'
    });
  });

  it('ignores delta snapshots with mismatched base ticks', () => {
    const decoder = new SnapshotDecoder();
    decoder.apply(baseSnapshot);

    const delta: StateSnapshotDelta = {
      type: 'StateSnapshotDelta',
      serverTick: 6,
      baseTick: 1,
      lastProcessedInputSeq: 3,
      mask: SNAPSHOT_MASK_POS_X,
      posX: 2.0
    };

    expect(decoder.apply(delta)).toBeNull();
  });
});
