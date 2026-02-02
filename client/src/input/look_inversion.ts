const INVERT_X_KEY = 'afps.look.invertX';
const INVERT_Y_KEY = 'afps.look.invertY';

const parseStoredBool = (raw: string | null): boolean | undefined => {
  if (raw === null) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true') {
    return true;
  }
  if (normalized === '0' || normalized === 'false') {
    return false;
  }
  return undefined;
};

export const loadInvertX = (storage?: Storage): boolean | undefined => {
  if (!storage) {
    return undefined;
  }
  return parseStoredBool(storage.getItem(INVERT_X_KEY));
};

export const loadInvertY = (storage?: Storage): boolean | undefined => {
  if (!storage) {
    return undefined;
  }
  return parseStoredBool(storage.getItem(INVERT_Y_KEY));
};

export const saveInvertX = (value: boolean, storage?: Storage) => {
  if (!storage) {
    return;
  }
  storage.setItem(INVERT_X_KEY, value ? 'true' : 'false');
};

export const saveInvertY = (value: boolean, storage?: Storage) => {
  if (!storage) {
    return;
  }
  storage.setItem(INVERT_Y_KEY, value ? 'true' : 'false');
};
