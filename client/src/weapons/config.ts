import rawConfig from '../../../shared/weapons/config.json';

type WeaponKind = 'hitscan' | 'projectile';

export interface WeaponDefinition {
  id: string;
  name: string;
  kind: WeaponKind;
  damage: number;
  fireRate: number;
  spreadDeg: number;
  range: number;
  projectileSpeed: number;
  explosionRadius: number;
}

const DEFAULT_WEAPON_DEFS: WeaponDefinition[] = [
  {
    id: 'rifle',
    name: 'Rifle',
    kind: 'hitscan',
    damage: 12,
    fireRate: 8,
    spreadDeg: 1.5,
    range: 60,
    projectileSpeed: 0,
    explosionRadius: 0
  },
  {
    id: 'launcher',
    name: 'Launcher',
    kind: 'projectile',
    damage: 80,
    fireRate: 1,
    spreadDeg: 0,
    range: 0,
    projectileSpeed: 22,
    explosionRadius: 4.5
  }
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readString = (value: unknown) => (typeof value === 'string' ? value : null);

const readNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const readKind = (value: unknown): WeaponKind | null =>
  value === 'hitscan' || value === 'projectile' ? value : null;

const parseWeapon = (value: unknown): WeaponDefinition | null => {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value.id);
  const name = readString(value.name) ?? id;
  const kind = readKind(value.kind);
  const damage = readNumber(value.damage);
  const fireRate = readNumber(value.fireRate);
  const spreadDeg = readNumber(value.spreadDeg) ?? 0;
  const range = readNumber(value.range) ?? 0;
  const projectileSpeed = readNumber(value.projectileSpeed) ?? 0;
  const explosionRadius = readNumber(value.explosionRadius) ?? 0;

  if (!id || !kind || damage === null || fireRate === null) {
    return null;
  }
  if (damage <= 0 || fireRate <= 0 || spreadDeg < 0 || range < 0 || projectileSpeed < 0 ||
      explosionRadius < 0) {
    return null;
  }

  return {
    id,
    name: name ?? id,
    kind,
    damage,
    fireRate,
    spreadDeg,
    range,
    projectileSpeed,
    explosionRadius
  };
};

export const parseWeaponConfig = (value: unknown): WeaponDefinition[] => {
  if (!isRecord(value)) {
    return DEFAULT_WEAPON_DEFS.map((weapon) => ({ ...weapon }));
  }
  const weapons = Array.isArray(value.weapons) ? value.weapons.map(parseWeapon).filter(Boolean) : [];
  if (weapons.length === 0) {
    return DEFAULT_WEAPON_DEFS.map((weapon) => ({ ...weapon }));
  }
  return weapons as WeaponDefinition[];
};

export const WEAPON_DEFS = parseWeaponConfig(rawConfig);
