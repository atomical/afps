export type FxSettings = {
  muzzleFlash: boolean;
  tracers: boolean;
  decals: boolean;
  aimDebug: boolean;
};

export const DEFAULT_FX_SETTINGS: FxSettings = {
  muzzleFlash: true,
  tracers: true,
  decals: true,
  aimDebug: false
};

const STORAGE_KEY = 'afps.fx.settings';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const normalizeFxSettings = (value: unknown): FxSettings => {
  if (!isRecord(value)) {
    return { ...DEFAULT_FX_SETTINGS };
  }

  const readBool = (key: keyof FxSettings) => {
    const raw = value[key];
    return typeof raw === 'boolean' ? raw : DEFAULT_FX_SETTINGS[key];
  };

  return {
    muzzleFlash: readBool('muzzleFlash'),
    tracers: readBool('tracers'),
    decals: readBool('decals'),
    aimDebug: readBool('aimDebug')
  };
};

export const loadFxSettings = (storage?: Storage): FxSettings => {
  if (!storage) {
    return { ...DEFAULT_FX_SETTINGS };
  }
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_FX_SETTINGS };
  }
  try {
    return normalizeFxSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_FX_SETTINGS };
  }
};

export const saveFxSettings = (settings: FxSettings, storage?: Storage) => {
  if (!storage) {
    return;
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(normalizeFxSettings(settings)));
};

