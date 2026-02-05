import { describe, expect, it } from 'vitest';
import { SnapshotDecoder } from '../../src/net/snapshot_decoder';
import {
  SNAPSHOT_MASK_POS_X,
  SNAPSHOT_MASK_POS_Y,
  SNAPSHOT_MASK_POS_Z,
  SNAPSHOT_MASK_VEL_X,
  SNAPSHOT_MASK_VEL_Y,
  SNAPSHOT_MASK_VEL_Z,
  SNAPSHOT_MASK_WEAPON_SLOT,
  SNAPSHOT_MASK_AMMO_IN_MAG,
  SNAPSHOT_MASK_DASH_COOLDOWN,
  SNAPSHOT_MASK_HEALTH,
  SNAPSHOT_MASK_KILLS,
  SNAPSHOT_MASK_DEATHS,
  SNAPSHOT_MASK_VIEW_YAW_Q,
  SNAPSHOT_MASK_VIEW_PITCH_Q,
  SNAPSHOT_MASK_PLAYER_FLAGS,
  SNAPSHOT_MASK_WEAPON_HEAT_Q,
  SNAPSHOT_MASK_LOADOUT_BITS,
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
    weaponSlot: 1,
    ammoInMag: 30,
    dashCooldown: 0.4,
    health: 90,
    kills: 1,
    deaths: 0,
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
      weaponSlot: 1,
      ammoInMag: 30,
      dashCooldown: 0.4,
      health: 90,
      kills: 1,
      deaths: 0,
      clientId: 'client-1'
    });
  });

  it('falls back to the only cached keyframe when clientId is missing', () => {
    const decoder = new SnapshotDecoder();
    decoder.apply(baseSnapshot);

    const delta: StateSnapshotDelta = {
      type: 'StateSnapshotDelta',
      serverTick: 6,
      baseTick: 5,
      lastProcessedInputSeq: 3,
      mask: SNAPSHOT_MASK_POS_X,
      posX: 3.5
    };

    expect(decoder.apply(delta)).toEqual({
      type: 'StateSnapshot',
      serverTick: 6,
      lastProcessedInputSeq: 3,
      posX: 3.5,
      posY: -2,
      posZ: 0.5,
      velX: 0.1,
      velY: -0.2,
      velZ: 0.05,
      weaponSlot: 1,
      ammoInMag: 30,
      dashCooldown: 0.4,
      health: 90,
      kills: 1,
      deaths: 0,
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

  it('applies all masked fields in delta snapshots', () => {
    const decoder = new SnapshotDecoder();
    decoder.apply(baseSnapshot);

    const delta: StateSnapshotDelta = {
      type: 'StateSnapshotDelta',
      serverTick: 7,
      baseTick: 5,
      lastProcessedInputSeq: 4,
      mask:
        SNAPSHOT_MASK_POS_X |
        SNAPSHOT_MASK_POS_Y |
        SNAPSHOT_MASK_POS_Z |
        SNAPSHOT_MASK_VEL_X |
        SNAPSHOT_MASK_VEL_Y |
        SNAPSHOT_MASK_VEL_Z |
        SNAPSHOT_MASK_WEAPON_SLOT |
        SNAPSHOT_MASK_AMMO_IN_MAG |
        SNAPSHOT_MASK_DASH_COOLDOWN |
        SNAPSHOT_MASK_HEALTH |
        SNAPSHOT_MASK_KILLS |
        SNAPSHOT_MASK_DEATHS,
      posX: 9,
      posY: -3,
      posZ: 2,
      velX: 1,
      velY: -1,
      velZ: 0.4,
      weaponSlot: 2,
      ammoInMag: 12,
      dashCooldown: 1.5,
      health: 72,
      kills: 3,
      deaths: 1,
      clientId: 'client-1'
    };

    expect(decoder.apply(delta)).toEqual({
      type: 'StateSnapshot',
      serverTick: 7,
      lastProcessedInputSeq: 4,
      posX: 9,
      posY: -3,
      posZ: 2,
      velX: 1,
      velY: -1,
      velZ: 0.4,
      weaponSlot: 2,
      ammoInMag: 12,
      dashCooldown: 1.5,
      health: 72,
      kills: 3,
      deaths: 1,
      clientId: 'client-1'
    });
  });

  it('falls back to base values when masked fields are missing', () => {
    const decoder = new SnapshotDecoder();
    decoder.apply(baseSnapshot);

    const delta: StateSnapshotDelta = {
      type: 'StateSnapshotDelta',
      serverTick: 8,
      baseTick: 5,
      lastProcessedInputSeq: 5,
      mask:
        SNAPSHOT_MASK_POS_X |
        SNAPSHOT_MASK_POS_Y |
        SNAPSHOT_MASK_POS_Z |
        SNAPSHOT_MASK_VEL_X |
        SNAPSHOT_MASK_VEL_Y |
        SNAPSHOT_MASK_VEL_Z |
        SNAPSHOT_MASK_WEAPON_SLOT |
        SNAPSHOT_MASK_AMMO_IN_MAG |
        SNAPSHOT_MASK_DASH_COOLDOWN |
        SNAPSHOT_MASK_HEALTH |
        SNAPSHOT_MASK_KILLS |
        SNAPSHOT_MASK_DEATHS
    };

    expect(decoder.apply(delta)).toEqual({
      type: 'StateSnapshot',
      serverTick: 8,
      lastProcessedInputSeq: 5,
      posX: 1.25,
      posY: -2,
      posZ: 0.5,
      velX: 0.1,
      velY: -0.2,
      velZ: 0.05,
      weaponSlot: 1,
      ammoInMag: 30,
      dashCooldown: 0.4,
      health: 90,
      kills: 1,
      deaths: 0,
      clientId: 'client-1'
    });
  });

  it('applies view and loadout fields in delta snapshots', () => {
    const decoder = new SnapshotDecoder();
    decoder.apply(baseSnapshot);

    const delta: StateSnapshotDelta = {
      type: 'StateSnapshotDelta',
      serverTick: 9,
      baseTick: 5,
      lastProcessedInputSeq: 6,
      mask:
        SNAPSHOT_MASK_VIEW_YAW_Q |
        SNAPSHOT_MASK_VIEW_PITCH_Q |
        SNAPSHOT_MASK_PLAYER_FLAGS |
        SNAPSHOT_MASK_WEAPON_HEAT_Q |
        SNAPSHOT_MASK_LOADOUT_BITS,
      viewYawQ: 123,
      viewPitchQ: -456,
      playerFlags: 7,
      weaponHeatQ: 321,
      loadoutBits: 9,
      clientId: 'client-1'
    };

    expect(decoder.apply(delta)).toEqual({
      type: 'StateSnapshot',
      serverTick: 9,
      lastProcessedInputSeq: 6,
      posX: 1.25,
      posY: -2,
      posZ: 0.5,
      velX: 0.1,
      velY: -0.2,
      velZ: 0.05,
      weaponSlot: 1,
      ammoInMag: 30,
      dashCooldown: 0.4,
      health: 90,
      kills: 1,
      deaths: 0,
      viewYawQ: 123,
      viewPitchQ: -456,
      playerFlags: 7,
      weaponHeatQ: 321,
      loadoutBits: 9,
      clientId: 'client-1'
    });
  });

  it('falls back to base view/loadout values when masked fields are missing', () => {
    const decoder = new SnapshotDecoder();
    const baseWithView: StateSnapshot = {
      ...baseSnapshot,
      viewYawQ: 10,
      viewPitchQ: -20,
      playerFlags: 3,
      weaponHeatQ: 7,
      loadoutBits: 5
    };
    decoder.apply(baseWithView);

    const delta: StateSnapshotDelta = {
      type: 'StateSnapshotDelta',
      serverTick: 11,
      baseTick: 5,
      lastProcessedInputSeq: 8,
      mask:
        SNAPSHOT_MASK_VIEW_YAW_Q |
        SNAPSHOT_MASK_VIEW_PITCH_Q |
        SNAPSHOT_MASK_PLAYER_FLAGS |
        SNAPSHOT_MASK_WEAPON_HEAT_Q |
        SNAPSHOT_MASK_LOADOUT_BITS
    };

    expect(decoder.apply(delta)).toEqual({
      type: 'StateSnapshot',
      serverTick: 11,
      lastProcessedInputSeq: 8,
      posX: 1.25,
      posY: -2,
      posZ: 0.5,
      velX: 0.1,
      velY: -0.2,
      velZ: 0.05,
      weaponSlot: 1,
      ammoInMag: 30,
      dashCooldown: 0.4,
      health: 90,
      kills: 1,
      deaths: 0,
      viewYawQ: 10,
      viewPitchQ: -20,
      playerFlags: 3,
      weaponHeatQ: 7,
      loadoutBits: 5,
      clientId: 'client-1'
    });
  });

  it('retains base positions when masks exclude them', () => {
    const decoder = new SnapshotDecoder();
    decoder.apply(baseSnapshot);

    const delta: StateSnapshotDelta = {
      type: 'StateSnapshotDelta',
      serverTick: 10,
      baseTick: 5,
      lastProcessedInputSeq: 7,
      mask: SNAPSHOT_MASK_VEL_Y,
      velY: 2.5
    };

    expect(decoder.apply(delta)).toEqual({
      type: 'StateSnapshot',
      serverTick: 10,
      lastProcessedInputSeq: 7,
      posX: 1.25,
      posY: -2,
      posZ: 0.5,
      velX: 0.1,
      velY: 2.5,
      velZ: 0.05,
      weaponSlot: 1,
      ammoInMag: 30,
      dashCooldown: 0.4,
      health: 90,
      kills: 1,
      deaths: 0,
      clientId: 'client-1'
    });
  });
});
