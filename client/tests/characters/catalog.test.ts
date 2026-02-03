import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCharacterCatalog, resolveCharacterEntry } from '../../src/characters/catalog';

const makeFetch = (payload: unknown, ok = true) =>
  vi.fn().mockResolvedValue({
    ok,
    json: async () => payload
  });

describe('character catalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back when fetch is unavailable or response is not ok', async () => {
    vi.stubGlobal('fetch', undefined as unknown as typeof fetch);
    const noFetch = await loadCharacterCatalog('test://missing');
    expect(noFetch.entries.length).toBe(4);
    expect(noFetch.defaultId).toBe('placeholder-a');

    const fetchMock = makeFetch({}, false);
    vi.stubGlobal('fetch', fetchMock);
    const badResponse = await loadCharacterCatalog('test://bad');
    expect(badResponse.entries.length).toBe(4);
    expect(badResponse.defaultId).toBe('placeholder-a');
  });

  it('falls back when manifest is invalid', async () => {
    const fetchMock = makeFetch({ entries: [] });
    vi.stubGlobal('fetch', fetchMock);
    const catalog = await loadCharacterCatalog('test://invalid');

    expect(catalog.entries.length).toBe(4);
    expect(catalog.defaultId).toBe('placeholder-a');
  });

  it('falls back when manifest shape is incorrect', async () => {
    const nonArray = makeFetch({ entries: 'nope' });
    vi.stubGlobal('fetch', nonArray);
    const badArray = await loadCharacterCatalog('test://bad-shape');
    expect(badArray.entries.length).toBe(4);

    const nonRecord = makeFetch(null);
    vi.stubGlobal('fetch', nonRecord);
    const badRecord = await loadCharacterCatalog('test://bad-record');
    expect(badRecord.entries.length).toBe(4);
  });

  it('falls back on fetch errors', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('boom'));
    vi.stubGlobal('fetch', fetchMock);
    const catalog = await loadCharacterCatalog('test://error');

    expect(catalog.entries.length).toBe(4);
    expect(catalog.defaultId).toBe('placeholder-a');
  });

  it('normalizes manifest entries and default ids', async () => {
    const fetchMock = makeFetch({
      defaultId: 'missing',
      entries: [
        {
          id: 'alpha',
          displayName: 'Alpha',
          modelUrl: '/alpha.glb',
          skinUrl: '/alpha.png',
          previewUrl: '/alpha_preview.png',
          handBone: 'Hand.R',
          weaponOffset: {
            position: [1, 2, 3],
            rotation: [0, 1, 2],
            scale: 1.5
          }
        },
        null,
        {
          id: '',
          displayName: 'Invalid',
          weaponOffset: { position: [1, 2], rotation: ['oops'], scale: -2 }
        },
        {
          id: 'bravo',
          displayName: '',
          weaponOffset: { position: [1, 2], rotation: [0, 'oops', 2], scale: -2 }
        },
        {
          id: 'charlie',
          weaponOffset: 'nope'
        }
      ]
    });
    vi.stubGlobal('fetch', fetchMock);
    const catalog = await loadCharacterCatalog('test://catalog');

    expect(catalog.defaultId).toBe('alpha');
    expect(catalog.entries[0]).toMatchObject({
      id: 'alpha',
      displayName: 'Alpha',
      modelUrl: '/alpha.glb',
      skinUrl: '/alpha.png',
      previewUrl: '/alpha_preview.png',
      handBone: 'Hand.R'
    });
    expect(catalog.entries[0].weaponOffset).toEqual({
      position: [1, 2, 3],
      rotation: [0, 1, 2],
      scale: 1.5
    });
    expect(catalog.entries[1].displayName).toBe('bravo');
    expect(catalog.entries[1].weaponOffset).toBeUndefined();
    expect(catalog.entries[2].id).toBe('charlie');
    expect(catalog.entries[2].weaponOffset).toBeUndefined();
  });

  it('resolves entries by id with default fallback', () => {
    const catalog = {
      defaultId: 'bravo',
      entries: [
        { id: 'alpha', displayName: 'Alpha' },
        { id: 'bravo', displayName: 'Bravo' }
      ]
    };

    expect(resolveCharacterEntry(catalog, 'alpha').id).toBe('alpha');
    expect(resolveCharacterEntry(catalog, 'missing').id).toBe('bravo');
    expect(resolveCharacterEntry(catalog, null).id).toBe('bravo');
  });
});
