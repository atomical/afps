export const LOADOUT_BITS = {
  suppressor: 1 << 0,
  compensator: 1 << 1,
  optic: 1 << 2,
  extendedMag: 1 << 3,
  grip: 1 << 4
} as const;

export const ALL_LOADOUT_BITS =
  LOADOUT_BITS.suppressor |
  LOADOUT_BITS.compensator |
  LOADOUT_BITS.optic |
  LOADOUT_BITS.extendedMag |
  LOADOUT_BITS.grip;

const STORAGE_KEY = 'afps.loadout.bits';

export const normalizeLoadoutBits = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  const clamped = Math.max(0, Math.floor(value));
  return (clamped >>> 0) & ALL_LOADOUT_BITS;
};

export const loadLoadoutBits = (storage?: Storage) => {
  if (!storage || typeof storage.getItem !== 'function') {
    return 0;
  }
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return 0;
  }
  const parsed = Number(raw);
  return normalizeLoadoutBits(parsed);
};

export const saveLoadoutBits = (value: number, storage?: Storage) => {
  if (!storage || typeof storage.setItem !== 'function') {
    return;
  }
  storage.setItem(STORAGE_KEY, String(normalizeLoadoutBits(value)));
};

export const hasLoadoutBit = (bits: number, bit: number) => (bits & bit) !== 0;
