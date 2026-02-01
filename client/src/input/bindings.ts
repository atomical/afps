import { DEFAULT_BINDINGS, type InputBindings } from './sampler';

const STORAGE_KEY = 'afps.input.bindings';

const sanitizeList = (value: unknown, fallback: string[]) => {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const filtered = value.filter((entry) => typeof entry === 'string' && entry.length > 0) as string[];
  if (filtered.length === 0) {
    return [...fallback];
  }
  return Array.from(new Set(filtered));
};

export const normalizeBindings = (value: unknown): InputBindings => {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_BINDINGS };
  }
  const record = value as Record<string, unknown>;
  return {
    forward: sanitizeList(record.forward, DEFAULT_BINDINGS.forward),
    backward: sanitizeList(record.backward, DEFAULT_BINDINGS.backward),
    left: sanitizeList(record.left, DEFAULT_BINDINGS.left),
    right: sanitizeList(record.right, DEFAULT_BINDINGS.right),
    jump: sanitizeList(record.jump, DEFAULT_BINDINGS.jump),
    sprint: sanitizeList(record.sprint, DEFAULT_BINDINGS.sprint),
    dash: sanitizeList(record.dash, DEFAULT_BINDINGS.dash),
    grapple: sanitizeList(record.grapple, DEFAULT_BINDINGS.grapple),
    shield: sanitizeList(record.shield, DEFAULT_BINDINGS.shield),
    shockwave: sanitizeList(record.shockwave, DEFAULT_BINDINGS.shockwave),
    weaponSlot1: sanitizeList(record.weaponSlot1, DEFAULT_BINDINGS.weaponSlot1),
    weaponSlot2: sanitizeList(record.weaponSlot2, DEFAULT_BINDINGS.weaponSlot2)
  };
};

export const loadBindings = (storage?: Storage): InputBindings => {
  if (!storage) {
    return { ...DEFAULT_BINDINGS };
  }
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_BINDINGS };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeBindings(parsed);
  } catch {
    return { ...DEFAULT_BINDINGS };
  }
};

export const saveBindings = (bindings: InputBindings, storage?: Storage) => {
  if (!storage) {
    return;
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(bindings));
};

export const setPrimaryBinding = (
  bindings: InputBindings,
  action: keyof InputBindings,
  code: string
): InputBindings => {
  const next = { ...bindings };
  next[action] = [code];
  return next;
};

export const getPrimaryBinding = (bindings: InputBindings, action: keyof InputBindings) =>
  bindings[action]?.[0] ?? '';
