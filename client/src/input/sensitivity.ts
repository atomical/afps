const STORAGE_KEY = 'afps.look.sensitivity';

export const loadSensitivity = (storage?: Storage): number | undefined => {
  if (!storage) {
    return undefined;
  }
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
};

export const saveSensitivity = (value: number, storage?: Storage) => {
  if (!storage) {
    return;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return;
  }
  storage.setItem(STORAGE_KEY, String(value));
};
