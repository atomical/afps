export interface WeaponOffset {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}

export interface CharacterEntry {
  id: string;
  displayName: string;
  modelUrl?: string;
  skinUrl?: string;
  previewUrl?: string;
  handBone?: string;
  weaponOffset?: WeaponOffset;
}

export interface CharacterCatalog {
  entries: CharacterEntry[];
  defaultId: string;
}

const BASE_URL = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const NORMALIZED_BASE = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
const MANIFEST_URL = `${NORMALIZED_BASE}assets/characters/ultimate_modular_men/manifest.json`;

const FALLBACK_CATALOG: CharacterCatalog = {
  defaultId: 'placeholder-a',
  entries: [
    { id: 'placeholder-a', displayName: 'Placeholder Alpha' },
    { id: 'placeholder-b', displayName: 'Placeholder Bravo' },
    { id: 'placeholder-c', displayName: 'Placeholder Charlie' },
    { id: 'placeholder-d', displayName: 'Placeholder Delta' }
  ]
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const toString = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

const toVec3 = (value: unknown): [number, number, number] | null => {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }
  const x = toNumber(value[0]);
  const y = toNumber(value[1]);
  const z = toNumber(value[2]);
  if (x === null || y === null || z === null) {
    return null;
  }
  return [x, y, z];
};

const normalizeOffset = (value: unknown): WeaponOffset | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const position = toVec3(value.position);
  const rotation = toVec3(value.rotation);
  const scale = toNumber(value.scale);
  const offset: WeaponOffset = {};
  if (position) {
    offset.position = position;
  }
  if (rotation) {
    offset.rotation = rotation;
  }
  if (scale !== null && scale > 0) {
    offset.scale = scale;
  }
  return Object.keys(offset).length > 0 ? offset : undefined;
};

const normalizeEntry = (value: unknown): CharacterEntry | null => {
  if (!isRecord(value)) {
    return null;
  }
  const id = toString(value.id);
  if (!id) {
    return null;
  }
  const displayName = toString(value.displayName) ?? id;
  const entry: CharacterEntry = {
    id,
    displayName,
    modelUrl: toString(value.modelUrl) ?? undefined,
    skinUrl: toString(value.skinUrl) ?? undefined,
    previewUrl: toString(value.previewUrl) ?? undefined,
    handBone: toString(value.handBone) ?? undefined,
    weaponOffset: normalizeOffset(value.weaponOffset)
  };
  return entry;
};

const normalizeCatalog = (value: unknown): CharacterCatalog | null => {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    return null;
  }
  const entries = value.entries.map(normalizeEntry).filter(Boolean) as CharacterEntry[];
  if (entries.length === 0) {
    return null;
  }
  const defaultId = toString(value.defaultId) ?? entries[0].id;
  const resolvedDefault = entries.some((entry) => entry.id === defaultId) ? defaultId : entries[0].id;
  return { entries, defaultId: resolvedDefault };
};

export const loadCharacterCatalog = async (manifestUrl = MANIFEST_URL): Promise<CharacterCatalog> => {
  if (typeof fetch !== 'function') {
    return FALLBACK_CATALOG;
  }
  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      return FALLBACK_CATALOG;
    }
    const data = (await response.json()) as unknown;
    const catalog = normalizeCatalog(data);
    return catalog ?? FALLBACK_CATALOG;
  } catch {
    return FALLBACK_CATALOG;
  }
};

export const resolveCharacterEntry = (catalog: CharacterCatalog, id?: string | null): CharacterEntry => {
  if (id) {
    const match = catalog.entries.find((entry) => entry.id === id);
    if (match) {
      return match;
    }
  }
  const fallback = catalog.entries.find((entry) => entry.id === catalog.defaultId);
  return fallback ?? catalog.entries[0];
};
