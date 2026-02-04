import { describe, expect, it } from 'vitest';
import { parseWeaponConfig } from '../../src/weapons/config';

describe('weapon config', () => {
  it('returns defaults for invalid payloads', () => {
    const config = parseWeaponConfig(null);
    expect(config.slots).toEqual(['rifle', 'launcher']);
    expect(config.weapons.map((weapon) => weapon.id)).toEqual(['rifle', 'launcher']);

    const empty = parseWeaponConfig({ weapons: [] });
    expect(empty.slots).toEqual(['rifle', 'launcher']);
  });

  it('parses valid weapons and slots', () => {
    const config = parseWeaponConfig({
      slots: ['test'],
      weapons: [
        {
          id: 'test',
          displayName: 'Test Blaster',
          kind: 'hitscan',
          damage: 5,
          spreadDeg: 0.5,
          range: 30,
          projectileSpeed: 0,
          explosionRadius: 0,
          maxAmmoInMag: 8,
          cooldownSeconds: 0.2,
          fireMode: 'SEMI',
          ejectShellsWhileFiring: true,
          reloadSeconds: 0.7,
          sfxProfile: 'PISTOL_9MM',
          casingEject: {
            localOffset: [0.1, 0.1, 0.1],
            localRotation: [0, 0, 0],
            velocityMin: [0.2, 0.3, 0.1],
            velocityMax: [0.4, 0.6, 0.3],
            angularVelocityMin: [0, 0, 0],
            angularVelocityMax: [1, 1, 1],
            lifetimeSeconds: 2
          },
          sounds: {
            fire: 'weapon:test:fire',
            dryFire: 'weapon:test:dry',
            reload: 'weapon:test:reload'
          }
        }
      ]
    });

    expect(config.slots).toEqual(['test']);
    expect(config.weapons).toHaveLength(1);
    expect(config.weapons[0]).toEqual(
      expect.objectContaining({
        id: 'test',
        displayName: 'Test Blaster',
        kind: 'hitscan',
        maxAmmoInMag: 8,
        cooldownSeconds: 0.2,
        fireMode: 'SEMI',
        ejectShellsWhileFiring: true,
        reloadSeconds: 0.7,
        sfxProfile: 'PISTOL_9MM'
      })
    );
  });

  it('rejects invalid weapon fields', () => {
    const config = parseWeaponConfig({
      weapons: [
        null,
        { id: '', kind: 'hitscan', damage: 5, cooldownSeconds: 0.2 },
        { id: 'bad', kind: 'hitscan', damage: -1, cooldownSeconds: 0.2 },
        { id: 'bad2', kind: 'hitscan', damage: 1, cooldownSeconds: 0 },
        { id: 'bad3', kind: 'hitscan', damage: 1, cooldownSeconds: 0.2, spreadDeg: -1 },
        { id: 'bad4', kind: 'hitscan', damage: 1, cooldownSeconds: 0.2, range: -2 },
        { id: 'bad5', kind: 'projectile', damage: 1, cooldownSeconds: 0.2, projectileSpeed: -5 },
        { id: 'bad6', kind: 'projectile', damage: 1, cooldownSeconds: 0.2, projectileSpeed: 5, explosionRadius: -1 },
        { id: 'bad7', kind: 'laser', damage: 1, cooldownSeconds: 0.2 },
        {
          id: 'bad8',
          displayName: 'Bad Vec',
          kind: 'hitscan',
          damage: 5,
          spreadDeg: 0.5,
          range: 30,
          projectileSpeed: 0,
          explosionRadius: 0,
          maxAmmoInMag: 8,
          cooldownSeconds: 0.2,
          fireMode: 'SEMI',
          ejectShellsWhileFiring: true,
          reloadSeconds: 0.7,
          sfxProfile: 'PISTOL_9MM',
          casingEject: {
            localOffset: [0.1, 0.1],
            localRotation: [0, 0, 0],
            velocityMin: [0.2, 0.3, 0.1],
            velocityMax: [0.4, 0.6, 0.3],
            angularVelocityMin: [0, 0, 0],
            angularVelocityMax: [1, 1, 1],
            lifetimeSeconds: 2
          },
          sounds: {
            fire: 'weapon:test:fire',
            dryFire: 'weapon:test:dry',
            reload: 'weapon:test:reload'
          }
        },
        {
          id: 'bad9',
          displayName: 'Bad Vec Number',
          kind: 'hitscan',
          damage: 5,
          spreadDeg: 0.5,
          range: 30,
          projectileSpeed: 0,
          explosionRadius: 0,
          maxAmmoInMag: 8,
          cooldownSeconds: 0.2,
          fireMode: 'SEMI',
          ejectShellsWhileFiring: true,
          reloadSeconds: 0.7,
          sfxProfile: 'PISTOL_9MM',
          casingEject: {
            localOffset: [0.1, 'bad', 0.1],
            localRotation: [0, 0, 0],
            velocityMin: [0.2, 0.3, 0.1],
            velocityMax: [0.4, 0.6, 0.3],
            angularVelocityMin: [0, 0, 0],
            angularVelocityMax: [1, 1, 1],
            lifetimeSeconds: 2
          },
          sounds: {
            fire: 'weapon:test:fire',
            dryFire: 'weapon:test:dry',
            reload: 'weapon:test:reload'
          }
        },
        {
          id: 'bad10',
          displayName: 'Bad Lifetime',
          kind: 'hitscan',
          damage: 5,
          spreadDeg: 0.5,
          range: 30,
          projectileSpeed: 0,
          explosionRadius: 0,
          maxAmmoInMag: 8,
          cooldownSeconds: 0.2,
          fireMode: 'SEMI',
          ejectShellsWhileFiring: true,
          reloadSeconds: 0.7,
          sfxProfile: 'PISTOL_9MM',
          casingEject: {
            localOffset: [0.1, 0.1, 0.1],
            localRotation: [0, 0, 0],
            velocityMin: [0.2, 0.3, 0.1],
            velocityMax: [0.4, 0.6, 0.3],
            angularVelocityMin: [0, 0, 0],
            angularVelocityMax: [1, 1, 1],
            lifetimeSeconds: 0
          },
          sounds: {
            fire: 'weapon:test:fire',
            dryFire: 'weapon:test:dry',
            reload: 'weapon:test:reload'
          }
        }
      ]
    } as unknown as { weapons: unknown });

    expect(config.weapons.map((weapon) => weapon.id)).toEqual(['rifle', 'launcher']);
  });

  it('rejects invalid casing vector fields', () => {
    const baseWeapon = {
      id: 'case',
      displayName: 'Case',
      kind: 'hitscan',
      damage: 5,
      spreadDeg: 0.5,
      range: 30,
      projectileSpeed: 0,
      explosionRadius: 0,
      maxAmmoInMag: 8,
      cooldownSeconds: 0.2,
      fireMode: 'SEMI',
      ejectShellsWhileFiring: true,
      reloadSeconds: 0.7,
      sfxProfile: 'PISTOL_9MM',
      casingEject: {
        localOffset: [0.1, 0.1, 0.1],
        localRotation: [0, 0, 0],
        velocityMin: [0.2, 0.3, 0.1],
        velocityMax: [0.4, 0.6, 0.3],
        angularVelocityMin: [0, 0, 0],
        angularVelocityMax: [1, 1, 1],
        lifetimeSeconds: 2
      },
      sounds: {
        fire: 'weapon:test:fire',
        dryFire: 'weapon:test:dry',
        reload: 'weapon:test:reload'
      }
    };

    const invalidOffset = parseWeaponConfig({
      weapons: [
        {
          ...baseWeapon,
          id: 'bad-offset',
          casingEject: { ...baseWeapon.casingEject, localOffset: [0.1, 0.1] }
        }
      ]
    });
    expect(invalidOffset.weapons.map((weapon) => weapon.id)).toEqual(['rifle', 'launcher']);

    const invalidValues = parseWeaponConfig({
      weapons: [
        {
          ...baseWeapon,
          id: 'bad-values',
          casingEject: { ...baseWeapon.casingEject, localOffset: [0.1, 'bad', 0.1] }
        }
      ]
    });
    expect(invalidValues.weapons.map((weapon) => weapon.id)).toEqual(['rifle', 'launcher']);

    const invalidLifetime = parseWeaponConfig({
      weapons: [
        {
          ...baseWeapon,
          id: 'bad-lifetime',
          casingEject: { ...baseWeapon.casingEject, lifetimeSeconds: 0 }
        }
      ]
    });
    expect(invalidLifetime.weapons.map((weapon) => weapon.id)).toEqual(['rifle', 'launcher']);
  });

  it('rejects weapons with incomplete sounds', () => {
    const config = parseWeaponConfig({
      weapons: [
        {
          id: 'silent',
          displayName: 'Silent',
          kind: 'hitscan',
          damage: 5,
          spreadDeg: 0.5,
          range: 30,
          projectileSpeed: 0,
          explosionRadius: 0,
          maxAmmoInMag: 8,
          cooldownSeconds: 0.2,
          fireMode: 'SEMI',
          ejectShellsWhileFiring: true,
          reloadSeconds: 0.7,
          sfxProfile: 'PISTOL_9MM',
          casingEject: {
            localOffset: [0.1, 0.1, 0.1],
            localRotation: [0, 0, 0],
            velocityMin: [0.2, 0.3, 0.1],
            velocityMax: [0.4, 0.6, 0.3],
            angularVelocityMin: [0, 0, 0],
            angularVelocityMax: [1, 1, 1],
            lifetimeSeconds: 2
          },
          sounds: {
            fire: '',
            dryFire: 'weapon:test:dry',
            reload: 'weapon:test:reload'
          }
        }
      ]
    });

    expect(config.weapons.map((weapon) => weapon.id)).toEqual(['rifle', 'launcher']);
  });

  it('falls back when numeric weapon values are invalid', () => {
    const config = parseWeaponConfig({
      weapons: [
        {
          id: 'bad-values',
          displayName: 'Bad Values',
          kind: 'hitscan',
          damage: 0,
          spreadDeg: 0.1,
          range: 10,
          projectileSpeed: 0,
          explosionRadius: 0,
          maxAmmoInMag: 8,
          cooldownSeconds: 0.2,
          fireMode: 'SEMI',
          ejectShellsWhileFiring: false,
          reloadSeconds: 0.7,
          sfxProfile: 'PISTOL_9MM',
          casingEject: {
            localOffset: [0.1, 0.1, 0.1],
            localRotation: [0, 0, 0],
            velocityMin: [0.2, 0.3, 0.1],
            velocityMax: [0.4, 0.6, 0.3],
            angularVelocityMin: [0, 0, 0],
            angularVelocityMax: [1, 1, 1],
            lifetimeSeconds: 2
          },
          sounds: {
            fire: 'weapon:test:fire',
            dryFire: 'weapon:test:dry',
            reload: 'weapon:test:reload'
          }
        }
      ]
    });

    expect(config.weapons.map((weapon) => weapon.id)).toEqual(['rifle', 'launcher']);
  });

  it('falls back when resolved slots are empty', () => {
    const config = parseWeaponConfig({
      slots: ['missing'],
      weapons: [
        {
          id: 'test',
          displayName: 'Test Blaster',
          kind: 'hitscan',
          damage: 5,
          spreadDeg: 0.5,
          range: 30,
          projectileSpeed: 0,
          explosionRadius: 0,
          maxAmmoInMag: 8,
          cooldownSeconds: 0.2,
          fireMode: 'SEMI',
          ejectShellsWhileFiring: true,
          reloadSeconds: 0.7,
          sfxProfile: 'PISTOL_9MM',
          casingEject: {
            localOffset: [0.1, 0.1, 0.1],
            localRotation: [0, 0, 0],
            velocityMin: [0.2, 0.3, 0.1],
            velocityMax: [0.4, 0.6, 0.3],
            angularVelocityMin: [0, 0, 0],
            angularVelocityMax: [1, 1, 1],
            lifetimeSeconds: 2
          },
          sounds: {
            fire: 'weapon:test:fire',
            dryFire: 'weapon:test:dry',
            reload: 'weapon:test:reload'
          }
        }
      ]
    });

    expect(config.slots).toEqual(['rifle', 'launcher']);
  });

  it('uses weapon ids as slots when none are provided', () => {
    const config = parseWeaponConfig({
      weapons: [
        {
          id: 'solo',
          kind: 'hitscan',
          damage: 5,
          spreadDeg: 0.5,
          range: 30,
          projectileSpeed: 0,
          explosionRadius: 0,
          maxAmmoInMag: 8,
          cooldownSeconds: 0.2,
          fireMode: 'SEMI',
          ejectShellsWhileFiring: true,
          reloadSeconds: 0.7,
          sfxProfile: 'PISTOL_9MM',
          casingEject: {
            localOffset: [0.1, 0.1, 0.1],
            localRotation: [0, 0, 0],
            velocityMin: [0.2, 0.3, 0.1],
            velocityMax: [0.4, 0.6, 0.3],
            angularVelocityMin: [0, 0, 0],
            angularVelocityMax: [1, 1, 1],
            lifetimeSeconds: 2
          },
          sounds: {
            fire: 'weapon:test:fire',
            dryFire: 'weapon:test:dry',
            reload: 'weapon:test:reload'
          }
        }
      ]
    });

    expect(config.slots).toEqual(['solo']);
    expect(config.weapons[0].displayName).toBe('solo');
  });

  it('derives slots from weapon ids when slots are empty', () => {
    const config = parseWeaponConfig({
      slots: [],
      weapons: [
        {
          id: 'alpha',
          displayName: 'Alpha',
          kind: 'hitscan',
          damage: 5,
          spreadDeg: 0.5,
          range: 30,
          projectileSpeed: 0,
          explosionRadius: 0,
          maxAmmoInMag: 8,
          cooldownSeconds: 0.2,
          fireMode: 'SEMI',
          ejectShellsWhileFiring: true,
          reloadSeconds: 0.7,
          sfxProfile: 'PISTOL_9MM',
          casingEject: {
            localOffset: [0.1, 0.1, 0.1],
            localRotation: [0, 0, 0],
            velocityMin: [0.2, 0.3, 0.1],
            velocityMax: [0.4, 0.6, 0.3],
            angularVelocityMin: [0, 0, 0],
            angularVelocityMax: [1, 1, 1],
            lifetimeSeconds: 2
          },
          sounds: {
            fire: 'weapon:test:fire',
            dryFire: 'weapon:test:dry',
            reload: 'weapon:test:reload'
          }
        }
      ]
    });

    expect(config.slots).toEqual(['alpha']);
  });

  it('falls back when weapons is not an array', () => {
    const config = parseWeaponConfig({ weapons: 'nope' });
    expect(config.slots).toEqual(['rifle', 'launcher']);
  });
});
