import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadWeaponMountCatalog,
  resolveWeaponMount,
  serializeWeaponMountCatalog
} from '../../src/characters/weapon_mounts';

describe('weapon mount catalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an empty catalog when fetch is unavailable', async () => {
    vi.stubGlobal('fetch', undefined as unknown as typeof fetch);
    const catalog = await loadWeaponMountCatalog('test://missing');
    expect(catalog.entries).toHaveLength(0);
    expect(catalog.byCharacter).toEqual({});
  });

  it('normalizes mount entries and resolves precedence', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        entries: [
          {
            characterId: 'alpha',
            handBone: 'Hand.R',
            weaponOffset: {
              position: [0.1, 0.2, 0.3],
              rotation: [0.4, 0.5, 0.6],
              scale: 1.2
            },
            weaponOffsetsById: {
              AR_556: {
                position: [0.7, 0.8, 0.9],
                rotation: [0.11, 0.22, 0.33],
                scale: 1.05
              },
              bad: {
                position: [1, 2],
                rotation: [1, 2, 3]
              }
            }
          },
          {
            id: 'bravo',
            handBone: 'Wrist.R',
            weaponOffset: {
              position: [0, 0, 0],
              rotation: [0, 0, 0],
              scale: -2
            }
          },
          { characterId: '' },
          null
        ]
      })
    });
    vi.stubGlobal('fetch', fetchMock);
    const catalog = await loadWeaponMountCatalog('test://catalog');

    expect(catalog.entries).toHaveLength(2);
    expect(catalog.byCharacter.alpha.handBone).toBe('Hand.R');
    expect(catalog.byCharacter.alpha.weaponOffsetsById?.AR_556).toMatchObject({
      position: [0.7, 0.8, 0.9]
    });
    expect(catalog.byCharacter.alpha.weaponOffsetsById?.bad).toEqual({
      rotation: [1, 2, 3]
    });
    expect(catalog.byCharacter.bravo.weaponOffset).toEqual({
      position: [0, 0, 0],
      rotation: [0, 0, 0]
    });

    const resolvedOverride = resolveWeaponMount({
      catalog,
      characterId: 'alpha',
      weaponId: 'AR_556'
    });
    expect(resolvedOverride.weaponOffset).toEqual({
      position: [0.7, 0.8, 0.9],
      rotation: [0.11, 0.22, 0.33],
      scale: 1.05
    });

    const resolvedDefault = resolveWeaponMount({
      catalog,
      characterId: 'alpha',
      weaponId: 'UNKNOWN'
    });
    expect(resolvedDefault.weaponOffset).toEqual({
      position: [0.1, 0.2, 0.3],
      rotation: [0.4, 0.5, 0.6],
      scale: 1.2
    });

    const fallback = resolveWeaponMount({
      catalog,
      characterId: 'missing',
      fallbackHandBone: 'RightHand',
      fallbackOffset: {
        position: [1, 1, 1],
        rotation: [0, 0, 0],
        scale: 1
      }
    });
    expect(fallback.handBone).toBe('RightHand');
    expect(fallback.weaponOffset).toEqual({
      position: [1, 1, 1],
      rotation: [0, 0, 0],
      scale: 1
    });
  });

  it('serializes entries deterministically', () => {
    const value = serializeWeaponMountCatalog({
      entries: [
        {
          characterId: 'zeta',
          handBone: 'Wrist.R',
          weaponOffset: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 }
        },
        {
          characterId: 'alpha',
          weaponOffsetsById: {
            B: { position: [1, 0, 0], rotation: [0, 0, 0], scale: 1 },
            A: { position: [0, 1, 0], rotation: [0, 0, 0], scale: 1 }
          }
        }
      ],
      byCharacter: {}
    });
    const parsed = JSON.parse(value) as { entries: Array<{ characterId: string; weaponOffsetsById?: Record<string, unknown> }> };
    expect(parsed.entries[0].characterId).toBe('alpha');
    expect(Object.keys(parsed.entries[0].weaponOffsetsById ?? {})).toEqual(['A', 'B']);
  });
});
