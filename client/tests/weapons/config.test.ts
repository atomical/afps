import { describe, expect, it } from 'vitest';
import { parseWeaponConfig } from '../../src/weapons/config';

const getIds = (defs: { id: string }[]) => defs.map((def) => def.id);

describe('weapon config', () => {
  it('returns defaults for invalid payloads', () => {
    const defs = parseWeaponConfig(null);
    expect(getIds(defs)).toEqual(['rifle', 'launcher']);

    const empty = parseWeaponConfig({ weapons: [] });
    expect(getIds(empty)).toEqual(['rifle', 'launcher']);
  });

  it('parses valid weapons', () => {
    const defs = parseWeaponConfig({
      weapons: [
        {
          id: 'test',
          kind: 'hitscan',
          damage: 5,
          fireRate: 4,
          spreadDeg: 0.5,
          range: 30,
          projectileSpeed: 0,
          explosionRadius: 0
        }
      ]
    });

    expect(defs).toHaveLength(1);
    expect(defs[0]).toEqual({
      id: 'test',
      name: 'test',
      kind: 'hitscan',
      damage: 5,
      fireRate: 4,
      spreadDeg: 0.5,
      range: 30,
      projectileSpeed: 0,
      explosionRadius: 0
    });
  });

  it('uses provided weapon names and ignores non-array entries', () => {
    const defs = parseWeaponConfig({
      weapons: [
        {
          id: 'named',
          name: 'Custom',
          kind: 'hitscan',
          damage: 5,
          fireRate: 4,
          spreadDeg: 0,
          range: 10,
          projectileSpeed: 0,
          explosionRadius: 0
        }
      ]
    });

    expect(defs[0]?.name).toBe('Custom');

    const fallback = parseWeaponConfig({ weapons: 'bad' } as unknown as { weapons: unknown });
    expect(getIds(fallback)).toEqual(['rifle', 'launcher']);
  });

  it('rejects invalid weapon fields', () => {
    const defs = parseWeaponConfig({
      weapons: [
        null,
        { id: '', kind: 'hitscan', damage: 5, fireRate: 4 },
        { id: 'bad', kind: 'hitscan', damage: -1, fireRate: 4 },
        { id: 'bad2', kind: 'hitscan', damage: 1, fireRate: 0 },
        { id: 'bad3', kind: 'hitscan', damage: 1, fireRate: 4, spreadDeg: -1 },
        { id: 'bad4', kind: 'hitscan', damage: 1, fireRate: 4, range: -2 },
        { id: 'bad5', kind: 'projectile', damage: 1, fireRate: 4, projectileSpeed: -5 },
        { id: 'bad6', kind: 'projectile', damage: 1, fireRate: 4, projectileSpeed: 5, explosionRadius: -1 },
        { id: 'bad7', kind: 'laser', damage: 1, fireRate: 4 }
      ]
    });

    expect(getIds(defs)).toEqual(['rifle', 'launcher']);
  });
});
