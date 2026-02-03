import type { LocalPlayerProfile } from './types';

const STORAGE_KEY = 'afps.playerProfile';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const loadProfile = (storage: Storage): LocalPlayerProfile | null => {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }
    const nickname = typeof parsed.nickname === 'string' ? parsed.nickname : '';
    const characterId = typeof parsed.characterId === 'string' ? parsed.characterId : '';
    if (!nickname && !characterId) {
      return null;
    }
    return { nickname, characterId };
  } catch {
    return null;
  }
};

export const saveProfile = (storage: Storage, profile: LocalPlayerProfile) => {
  storage.setItem(STORAGE_KEY, JSON.stringify(profile));
};
