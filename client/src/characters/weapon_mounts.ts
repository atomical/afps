import type { WeaponOffset } from './catalog';

export interface WeaponMountEntry {
  characterId: string;
  handBone?: string;
  weaponOffset?: WeaponOffset;
  weaponOffsetsById?: Record<string, WeaponOffset>;
}

export interface WeaponMountCatalog {
  entries: WeaponMountEntry[];
  byCharacter: Record<string, WeaponMountEntry>;
}

const BASE_URL = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const NORMALIZED_BASE = BASE_URL.replace(/\/?$/, '/');
export const WEAPON_MOUNT_MANIFEST_URL = `${NORMALIZED_BASE}assets/characters/ultimate_modular_men/weapon_mounts.json`;

const EMPTY_MOUNT_CATALOG: WeaponMountCatalog = {
  entries: [],
  byCharacter: {}
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const toString = (value: unknown): string | null => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : null);

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
  const next: WeaponOffset = {};
  if (position) {
    next.position = position;
  }
  if (rotation) {
    next.rotation = rotation;
  }
  if (scale !== null && scale > 0) {
    next.scale = scale;
  }
  return Object.keys(next).length > 0 ? next : undefined;
};

const normalizePerWeaponOffsets = (value: unknown): Record<string, WeaponOffset> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const next: Record<string, WeaponOffset> = {};
  for (const [weaponId, offset] of Object.entries(value)) {
    const normalized = normalizeOffset(offset);
    if (normalized) {
      next[weaponId] = normalized;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
};

const normalizeEntry = (value: unknown): WeaponMountEntry | null => {
  if (!isRecord(value)) {
    return null;
  }
  const characterId = toString(value.characterId ?? value.id);
  if (!characterId) {
    return null;
  }
  const handBone = toString(value.handBone) ?? undefined;
  const weaponOffset = normalizeOffset(value.weaponOffset);
  const weaponOffsetsById = normalizePerWeaponOffsets(value.weaponOffsetsById);
  if (!handBone && !weaponOffset && !weaponOffsetsById) {
    return null;
  }
  return { characterId, handBone, weaponOffset, weaponOffsetsById };
};

const normalizeCatalog = (value: unknown): WeaponMountCatalog => {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    return EMPTY_MOUNT_CATALOG;
  }
  const entries = value.entries
    .map(normalizeEntry)
    .filter((entry): entry is WeaponMountEntry => Boolean(entry));
  if (entries.length === 0) {
    return EMPTY_MOUNT_CATALOG;
  }
  const byCharacter: Record<string, WeaponMountEntry> = {};
  for (const entry of entries) {
    byCharacter[entry.characterId] = entry;
  }
  return { entries, byCharacter };
};

const cloneOffset = (offset?: WeaponOffset): WeaponOffset | undefined => {
  if (!offset) {
    return undefined;
  }
  const next: WeaponOffset = {};
  if (offset.position) {
    next.position = [...offset.position];
  }
  if (offset.rotation) {
    next.rotation = [...offset.rotation];
  }
  if (typeof offset.scale === 'number' && Number.isFinite(offset.scale) && offset.scale > 0) {
    next.scale = offset.scale;
  }
  return Object.keys(next).length > 0 ? next : undefined;
};

export const loadWeaponMountCatalog = async (
  mountUrl = WEAPON_MOUNT_MANIFEST_URL
): Promise<WeaponMountCatalog> => {
  if (typeof fetch !== 'function') {
    return EMPTY_MOUNT_CATALOG;
  }
  try {
    const response = await fetch(mountUrl);
    if (!response.ok) {
      return EMPTY_MOUNT_CATALOG;
    }
    const data = (await response.json()) as unknown;
    return normalizeCatalog(data);
  } catch {
    return EMPTY_MOUNT_CATALOG;
  }
};

export const resolveWeaponMount = ({
  catalog,
  characterId,
  weaponId,
  fallbackHandBone,
  fallbackOffset
}: {
  catalog?: WeaponMountCatalog | null;
  characterId?: string | null;
  weaponId?: string | null;
  fallbackHandBone?: string;
  fallbackOffset?: WeaponOffset;
}) => {
  const entry =
    catalog && characterId && characterId.length > 0 ? catalog.byCharacter[characterId] : undefined;
  const handBone = entry?.handBone ?? fallbackHandBone;
  const perWeapon = weaponId ? entry?.weaponOffsetsById?.[weaponId] : undefined;
  const weaponOffset = cloneOffset(perWeapon ?? entry?.weaponOffset ?? fallbackOffset);
  return { handBone, weaponOffset };
};

export const serializeWeaponMountCatalog = (catalog: WeaponMountCatalog) => {
  const sortedEntries = [...catalog.entries]
    .sort((a, b) => a.characterId.localeCompare(b.characterId))
    .map((entry) => {
      const payload: {
        characterId: string;
        handBone?: string;
        weaponOffset?: WeaponOffset;
        weaponOffsetsById?: Record<string, WeaponOffset>;
      } = {
        characterId: entry.characterId
      };
      if (entry.handBone) {
        payload.handBone = entry.handBone;
      }
      if (entry.weaponOffset) {
        payload.weaponOffset = entry.weaponOffset;
      }
      if (entry.weaponOffsetsById) {
        const sorted: Record<string, WeaponOffset> = {};
        for (const weaponId of Object.keys(entry.weaponOffsetsById).sort((a, b) => a.localeCompare(b))) {
          sorted[weaponId] = entry.weaponOffsetsById[weaponId];
        }
        payload.weaponOffsetsById = sorted;
      }
      return payload;
    });
  return JSON.stringify({ entries: sortedEntries }, null, 2);
};

export const __test = {
  normalizeOffset,
  normalizeCatalog
};
