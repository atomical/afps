import rawConfig from '../../../shared/weapons/config.json';

type WeaponKind = 'hitscan' | 'projectile';
export type FireMode = 'SEMI' | 'FULL_AUTO';

export interface CasingEjectConfig {
  localOffset: [number, number, number];
  localRotation: [number, number, number];
  velocityMin: [number, number, number];
  velocityMax: [number, number, number];
  angularVelocityMin: [number, number, number];
  angularVelocityMax: [number, number, number];
  lifetimeSeconds: number;
}

export interface WeaponSounds {
  fire: string;
  fireVariant2?: string;
  dryFire: string;
  reload: string;
  equip?: string;
  casingImpact1?: string;
  casingImpact2?: string;
}

export interface WeaponDefinition {
  id: string;
  displayName: string;
  kind: WeaponKind;
  damage: number;
  spreadDeg: number;
  range: number;
  projectileSpeed: number;
  explosionRadius: number;
  maxAmmoInMag: number;
  cooldownSeconds: number;
  fireMode: FireMode;
  ejectShellsWhileFiring: boolean;
  reloadSeconds: number;
  sfxProfile: string;
  casingEject: CasingEjectConfig;
  sounds: WeaponSounds;
}

export interface WeaponConfig {
  weapons: WeaponDefinition[];
  slots: string[];
  byId: Record<string, WeaponDefinition>;
}

const DEFAULT_WEAPON_DEFS: WeaponDefinition[] = [
  {
    id: 'rifle',
    displayName: 'Rifle',
    kind: 'hitscan',
    damage: 12,
    spreadDeg: 1.5,
    range: 60,
    projectileSpeed: 0,
    explosionRadius: 0,
    maxAmmoInMag: 30,
    cooldownSeconds: 0.125,
    fireMode: 'FULL_AUTO',
    ejectShellsWhileFiring: true,
    reloadSeconds: 0.95,
    sfxProfile: 'AR_556',
    casingEject: {
      localOffset: [0.16, 0.05, 0.12],
      localRotation: [0.0, 1.57, 0.0],
      velocityMin: [0.6, 1.1, -0.2],
      velocityMax: [1.3, 1.8, 0.25],
      angularVelocityMin: [-8.0, -4.0, -6.0],
      angularVelocityMax: [8.0, 4.0, 6.0],
      lifetimeSeconds: 2.6
    },
    sounds: {
      fire: 'weapon:rifle:fire:0',
      fireVariant2: 'weapon:rifle:fire:1',
      dryFire: 'weapon:rifle:dry',
      reload: 'weapon:rifle:reload',
      equip: 'weapon:rifle:equip',
      casingImpact1: 'casing:impact:1',
      casingImpact2: 'casing:impact:2'
    }
  },
  {
    id: 'launcher',
    displayName: 'Launcher',
    kind: 'projectile',
    damage: 80,
    spreadDeg: 0,
    range: 0,
    projectileSpeed: 22,
    explosionRadius: 4.5,
    maxAmmoInMag: 6,
    cooldownSeconds: 1.0,
    fireMode: 'SEMI',
    ejectShellsWhileFiring: false,
    reloadSeconds: 1.1,
    sfxProfile: 'GRENADE_LAUNCHER',
    casingEject: {
      localOffset: [0.18, 0.06, 0.14],
      localRotation: [0.0, 1.57, 0.0],
      velocityMin: [0.5, 0.9, -0.15],
      velocityMax: [1.1, 1.5, 0.2],
      angularVelocityMin: [-7.0, -3.5, -5.0],
      angularVelocityMax: [7.0, 3.5, 5.0],
      lifetimeSeconds: 2.8
    },
    sounds: {
      fire: 'weapon:launcher:fire:0',
      fireVariant2: 'weapon:launcher:fire:1',
      dryFire: 'weapon:launcher:dry',
      reload: 'weapon:launcher:reload',
      equip: 'weapon:launcher:equip',
      casingImpact1: 'casing:impact:1',
      casingImpact2: 'casing:impact:2'
    }
  }
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readString = (value: unknown) => (typeof value === 'string' ? value.trim() : null);

const readNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const readInt = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;

const readKind = (value: unknown): WeaponKind | null =>
  value === 'hitscan' || value === 'projectile' ? value : null;

const readFireMode = (value: unknown): FireMode | null =>
  value === 'SEMI' || value === 'FULL_AUTO' ? value : null;

const readVec3 = (value: unknown): [number, number, number] | null => {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }
  const x = readNumber(value[0]);
  const y = readNumber(value[1]);
  const z = readNumber(value[2]);
  if (x === null || y === null || z === null) {
    return null;
  }
  return [x, y, z];
};

const parseCasingEject = (value: unknown): CasingEjectConfig | null => {
  if (!isRecord(value)) {
    return null;
  }
  const localOffset = readVec3(value.localOffset);
  const localRotation = readVec3(value.localRotation);
  const velocityMin = readVec3(value.velocityMin);
  const velocityMax = readVec3(value.velocityMax);
  const angularVelocityMin = readVec3(value.angularVelocityMin);
  const angularVelocityMax = readVec3(value.angularVelocityMax);
  const lifetimeSeconds = readNumber(value.lifetimeSeconds);
  if (
    !localOffset ||
    !localRotation ||
    !velocityMin ||
    !velocityMax ||
    !angularVelocityMin ||
    !angularVelocityMax ||
    lifetimeSeconds === null ||
    lifetimeSeconds <= 0
  ) {
    return null;
  }
  return {
    localOffset,
    localRotation,
    velocityMin,
    velocityMax,
    angularVelocityMin,
    angularVelocityMax,
    lifetimeSeconds
  };
};

const parseSounds = (value: unknown): WeaponSounds | null => {
  if (!isRecord(value)) {
    return null;
  }
  const fire = readString(value.fire);
  const dryFire = readString(value.dryFire);
  const reload = readString(value.reload);
  if (!fire || !dryFire || !reload) {
    return null;
  }
  const fireVariant2 = readString(value.fireVariant2) ?? undefined;
  const equip = readString(value.equip) ?? undefined;
  const casingImpact1 = readString(value.casingImpact1) ?? undefined;
  const casingImpact2 = readString(value.casingImpact2) ?? undefined;
  return {
    fire,
    fireVariant2,
    dryFire,
    reload,
    equip,
    casingImpact1,
    casingImpact2
  };
};

const parseWeapon = (value: unknown): WeaponDefinition | null => {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value.id);
  const displayName = readString(value.displayName) ?? id;
  const kind = readKind(value.kind);
  const damage = readNumber(value.damage);
  const spreadDeg = readNumber(value.spreadDeg) ?? 0;
  const range = readNumber(value.range) ?? 0;
  const projectileSpeed = readNumber(value.projectileSpeed) ?? 0;
  const explosionRadius = readNumber(value.explosionRadius) ?? 0;
  const maxAmmoInMag = readInt(value.maxAmmoInMag);
  const cooldownSeconds = readNumber(value.cooldownSeconds);
  const fireMode = readFireMode(value.fireMode);
  const ejectShellsWhileFiring = Boolean(value.ejectShellsWhileFiring);
  const reloadSeconds = readNumber(value.reloadSeconds);
  const sfxProfile = readString(value.sfxProfile);
  const casingEject = parseCasingEject(value.casingEject);
  const sounds = parseSounds(value.sounds);

  if (
    !id ||
    !kind ||
    damage === null ||
    maxAmmoInMag === null ||
    cooldownSeconds === null ||
    !fireMode ||
    reloadSeconds === null ||
    !sfxProfile ||
    !casingEject ||
    !sounds
  ) {
    return null;
  }
  if (
    damage <= 0 ||
    spreadDeg < 0 ||
    range < 0 ||
    projectileSpeed < 0 ||
    explosionRadius < 0 ||
    maxAmmoInMag <= 0 ||
    cooldownSeconds <= 0 ||
    reloadSeconds <= 0
  ) {
    return null;
  }

  return {
    id,
    displayName,
    kind,
    damage,
    spreadDeg,
    range,
    projectileSpeed,
    explosionRadius,
    maxAmmoInMag,
    cooldownSeconds,
    fireMode,
    ejectShellsWhileFiring,
    reloadSeconds,
    sfxProfile,
    casingEject,
    sounds
  };
};

const buildConfig = (weapons: WeaponDefinition[], slots: string[]): WeaponConfig => {
  const byId: Record<string, WeaponDefinition> = {};
  weapons.forEach((weapon) => {
    byId[weapon.id] = weapon;
  });
  return { weapons, slots, byId };
};

export const parseWeaponConfig = (value: unknown): WeaponConfig => {
  if (!isRecord(value)) {
    return buildConfig([...DEFAULT_WEAPON_DEFS], ['rifle', 'launcher']);
  }
  const weapons = Array.isArray(value.weapons) ? value.weapons.map(parseWeapon).filter(Boolean) : [];
  if (weapons.length === 0) {
    return buildConfig([...DEFAULT_WEAPON_DEFS], ['rifle', 'launcher']);
  }
  const rawSlots = Array.isArray(value.slots) ? value.slots.map(readString).filter(Boolean) : [];
  const slotIds = (rawSlots.length ? rawSlots : weapons.map((weapon) => weapon.id)).map(String);
  const byId: Record<string, WeaponDefinition> = {};
  weapons.forEach((weapon) => {
    byId[weapon.id] = weapon;
  });
  const resolvedSlots = slotIds.filter((slotId) => Boolean(byId[slotId]));
  if (resolvedSlots.length === 0) {
    return buildConfig([...DEFAULT_WEAPON_DEFS], ['rifle', 'launcher']);
  }
  return { weapons: weapons as WeaponDefinition[], slots: resolvedSlots, byId };
};

export const WEAPON_CONFIG = parseWeaponConfig(rawConfig);
export const WEAPON_DEFS = WEAPON_CONFIG.slots.map((slot) => WEAPON_CONFIG.byId[slot]);
export const WEAPON_BY_ID = WEAPON_CONFIG.byId;
export const WEAPON_SLOTS = WEAPON_CONFIG.slots;
