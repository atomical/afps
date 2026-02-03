import { describe, expect, it } from 'vitest';
import { loadProfile, saveProfile } from '../../src/profile/storage';

const createStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    }
  } as Storage;
};

describe('profile storage', () => {
  it('loads profiles from storage when valid', () => {
    const storage = createStorage();
    expect(loadProfile(storage)).toBeNull();

    storage.setItem('afps.playerProfile', 'not json');
    expect(loadProfile(storage)).toBeNull();

    storage.setItem('afps.playerProfile', JSON.stringify('nope'));
    expect(loadProfile(storage)).toBeNull();

    storage.setItem('afps.playerProfile', JSON.stringify({ nickname: '', characterId: '' }));
    expect(loadProfile(storage)).toBeNull();

    storage.setItem('afps.playerProfile', JSON.stringify({ nickname: 'Ada' }));
    expect(loadProfile(storage)).toEqual({ nickname: 'Ada', characterId: '' });

    storage.setItem('afps.playerProfile', JSON.stringify({ characterId: 'alpha' }));
    expect(loadProfile(storage)).toEqual({ nickname: '', characterId: 'alpha' });
  });

  it('saves profiles to storage', () => {
    const storage = createStorage();
    saveProfile(storage, { nickname: 'Ada', characterId: 'alpha' });

    const saved = storage.getItem('afps.playerProfile');
    expect(saved).toBe(JSON.stringify({ nickname: 'Ada', characterId: 'alpha' }));
  });
});
