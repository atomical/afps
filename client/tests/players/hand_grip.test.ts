import { describe, expect, it } from 'vitest';
import { __test, resolveGripPose, resolveGripProfile } from '../../src/players/hand_grip';

describe('hand grip profiles', () => {
  it('uses explicit profile mappings for built-in weapons', () => {
    expect(resolveGripProfile('PISTOL_9MM')).toBe('pistol');
    expect(resolveGripProfile('AR_556')).toBe('rifle');
    expect(resolveGripProfile('ROCKET_LAUNCHER')).toBe('launcher');
  });

  it('infers profile for unknown downloaded weapon ids', () => {
    expect(__test.inferGripProfile('PROTO_HANDGUN')).toBe('pistol');
    expect(__test.inferGripProfile('XM9_BAZOOKA')).toBe('launcher');
    expect(__test.inferGripProfile('FUTURE_BATTLE_RIFLE')).toBe('rifle');
  });

  it('includes trigger pull deltas for index finger bones', () => {
    const pistolPose = resolveGripPose('PISTOL_45');
    const triggerBone = pistolPose.find((entry) => entry.bone === 'Index2.R');
    expect(triggerBone?.triggerPullRotation).toEqual([0.12, 0, 0]);
  });
});
