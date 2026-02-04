import { describe, expect, it, vi } from 'vitest';
import type { WeaponDefinition } from '../../src/weapons/config';
import { generateWeaponSfx } from '../../src/weapons/sfx';

const BASE_CASING = {
  localOffset: [0, 0, 0] as [number, number, number],
  localRotation: [0, 0, 0] as [number, number, number],
  velocityMin: [0, 0, 0] as [number, number, number],
  velocityMax: [0, 0, 0] as [number, number, number],
  angularVelocityMin: [0, 0, 0] as [number, number, number],
  angularVelocityMax: [0, 0, 0] as [number, number, number],
  lifetimeSeconds: 1
};

const makeWeapon = ({
  id,
  profile,
  reloadSeconds = 0.9,
  sounds
}: {
  id: string;
  profile: string;
  reloadSeconds?: number;
  sounds: Partial<WeaponDefinition['sounds']>;
}): WeaponDefinition => ({
  id,
  displayName: id,
  kind: 'hitscan',
  damage: 10,
  spreadDeg: 0,
  range: 10,
  projectileSpeed: 0,
  explosionRadius: 0,
  maxAmmoInMag: 5,
  cooldownSeconds: 0.2,
  fireMode: 'SEMI',
  ejectShellsWhileFiring: false,
  reloadSeconds,
  sfxProfile: profile,
  casingEject: BASE_CASING,
  sounds: {
    fire: sounds.fire ?? `${id}:fire`,
    fireVariant2: sounds.fireVariant2,
    dryFire: sounds.dryFire ?? `${id}:dry`,
    reload: sounds.reload ?? `${id}:reload`,
    equip: sounds.equip,
    casingImpact1: sounds.casingImpact1,
    casingImpact2: sounds.casingImpact2
  }
});

const createAudioStub = (returnNull = false) => {
  const buffers = new Map<string, Float32Array>();
  return {
    state: { supported: true },
    createBuffer: (_channels: number, length: number) => {
      if (returnNull) {
        return null;
      }
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
    registerBuffer: (key: string, buffer: { getChannelData?: (channel: number) => Float32Array }) => {
      const channel = buffer.getChannelData?.(0);
      if (channel) {
        buffers.set(key, channel);
      }
    },
    hasBuffer: (key: string) => buffers.has(key),
    getBuffers: () => buffers
  };
};

describe('generateWeaponSfx', () => {
  it('covers all profile branches and handles duplicate keys', () => {
    const audio = createAudioStub();
    const weapons: WeaponDefinition[] = [
      makeWeapon({
        id: 'shotgun',
        profile: 'SHOTGUN_PUMP',
        sounds: {
          fire: 'shared:fire',
          fireVariant2: 'shotgun:fire:1',
          equip: 'shotgun:equip'
        }
      }),
      makeWeapon({
        id: 'sniper',
        profile: 'SNIPER_BOLT',
        sounds: { fire: 'sniper:fire', dryFire: 'sniper:dry', reload: 'sniper:reload' }
      }),
      makeWeapon({
        id: 'energy',
        profile: 'ENERGY_RIFLE',
        sounds: { fire: 'energy:fire', dryFire: 'energy:dry', reload: 'energy:reload', equip: 'energy:equip' }
      }),
      makeWeapon({
        id: 'rocket',
        profile: 'ROCKET_LAUNCHER',
        sounds: { fire: 'rocket:fire', dryFire: 'rocket:dry', reload: 'rocket:reload' }
      }),
      makeWeapon({
        id: 'fallback',
        profile: 'UNKNOWN_PROFILE',
        reloadSeconds: 0,
        sounds: { fire: 'shared:fire', dryFire: 'shared:dry', reload: 'shared:reload' }
      }),
      makeWeapon({
        id: 'empty',
        profile: 'AR_556',
        sounds: { fire: '', dryFire: 'empty:dry', reload: 'empty:reload' }
      }),
      makeWeapon({
        id: 'mini',
        profile: 'PISTOL_9MM',
        reloadSeconds: 0.01,
        sounds: { fire: 'mini:fire', dryFire: 'mini:dry', reload: 'mini:reload' }
      })
    ];

    generateWeaponSfx(audio as unknown as Parameters<typeof generateWeaponSfx>[0], weapons);

    expect(audio.hasBuffer('shared:fire')).toBe(true);
    expect(audio.hasBuffer('shotgun:fire:1')).toBe(true);
    expect(audio.hasBuffer('energy:reload')).toBe(true);
    expect(audio.hasBuffer('empty:dry')).toBe(true);
    expect(audio.hasBuffer('')).toBe(false);
    expect(audio.getBuffers().size).toBeGreaterThan(0);
    for (const [key, buffer] of audio.getBuffers().entries()) {
      const hasSignal = buffer.some((sample) => Math.abs(sample) > 1e-6);
      expect(hasSignal, `${key} should not be silent`).toBe(true);
    }
  });

  it('skips registration when buffers cannot be created', () => {
    const audio = createAudioStub(true);
    const weapons = [
      makeWeapon({ id: 'rifle', profile: 'AR_556', sounds: { fire: 'rifle:fire', dryFire: 'rifle:dry', reload: 'rifle:reload' } })
    ];

    generateWeaponSfx(audio as unknown as Parameters<typeof generateWeaponSfx>[0], weapons);

    expect(audio.getBuffers().size).toBe(0);
  });

  it('rejects silent buffers via overrides', () => {
    const audio = createAudioStub();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    generateWeaponSfx(
      audio as unknown as Parameters<typeof generateWeaponSfx>[0],
      [makeWeapon({ id: 'rifle', profile: 'AR_556', sounds: { fire: 'rifle:fire', dryFire: 'rifle:dry', reload: 'rifle:reload' } })],
      { sampleOverrides: { 'casing:impact:1': new Float32Array(128) } }
    );

    expect(audio.hasBuffer('casing:impact:1')).toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
