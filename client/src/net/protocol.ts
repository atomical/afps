export const PROTOCOL_VERSION = 3;
export const SNAPSHOT_MASK_POS_X = 1 << 0;
export const SNAPSHOT_MASK_POS_Y = 1 << 1;
export const SNAPSHOT_MASK_POS_Z = 1 << 2;
export const SNAPSHOT_MASK_VEL_X = 1 << 3;
export const SNAPSHOT_MASK_VEL_Y = 1 << 4;
export const SNAPSHOT_MASK_VEL_Z = 1 << 5;
export const SNAPSHOT_MASK_DASH_COOLDOWN = 1 << 6;
export const SNAPSHOT_MASK_HEALTH = 1 << 7;
export const SNAPSHOT_MASK_KILLS = 1 << 8;
export const SNAPSHOT_MASK_DEATHS = 1 << 9;
export const SNAPSHOT_MASK_WEAPON_SLOT = 1 << 10;
const SNAPSHOT_MASK_ALL =
  SNAPSHOT_MASK_POS_X |
  SNAPSHOT_MASK_POS_Y |
  SNAPSHOT_MASK_POS_Z |
  SNAPSHOT_MASK_VEL_X |
  SNAPSHOT_MASK_VEL_Y |
  SNAPSHOT_MASK_VEL_Z |
  SNAPSHOT_MASK_DASH_COOLDOWN |
  SNAPSHOT_MASK_HEALTH |
  SNAPSHOT_MASK_KILLS |
  SNAPSHOT_MASK_DEATHS |
  SNAPSHOT_MASK_WEAPON_SLOT;

export interface ClientHello {
  type: 'ClientHello';
  protocolVersion: number;
  sessionToken: string;
  connectionId: string;
  build: string;
  nickname?: string;
  characterId?: string;
}

export interface ServerHello {
  type: 'ServerHello';
  protocolVersion: number;
  connectionId: string;
  serverTickRate: number;
  snapshotRate: number;
  snapshotKeyframeInterval?: number;
  motd?: string;
  clientId?: string;
  connectionNonce?: string;
}

export interface StateSnapshot {
  type: 'StateSnapshot';
  serverTick: number;
  lastProcessedInputSeq: number;
  posX: number;
  posY: number;
  posZ: number;
  velX: number;
  velY: number;
  velZ: number;
  weaponSlot: number;
  dashCooldown: number;
  health: number;
  kills: number;
  deaths: number;
  clientId?: string;
}

export interface StateSnapshotDelta {
  type: 'StateSnapshotDelta';
  serverTick: number;
  baseTick: number;
  lastProcessedInputSeq: number;
  mask: number;
  posX?: number;
  posY?: number;
  posZ?: number;
  velX?: number;
  velY?: number;
  velZ?: number;
  weaponSlot?: number;
  dashCooldown?: number;
  health?: number;
  kills?: number;
  deaths?: number;
  clientId?: string;
}

export interface Ping {
  type: 'Ping';
  clientTimeMs: number;
}

export interface Pong {
  type: 'Pong';
  clientTimeMs: number;
}

export interface PlayerProfile {
  type: 'PlayerProfile';
  clientId: string;
  nickname: string;
  characterId: string;
}

export type GameEventName = 'HitConfirmed' | 'ProjectileSpawn' | 'ProjectileRemove';

export interface HitConfirmedEvent {
  type: 'GameEvent';
  event: 'HitConfirmed';
  targetId?: string;
  damage?: number;
  killed?: boolean;
}

export interface ProjectileSpawnEvent {
  type: 'GameEvent';
  event: 'ProjectileSpawn';
  ownerId: string;
  projectileId?: number;
  posX: number;
  posY: number;
  posZ: number;
  velX: number;
  velY: number;
  velZ: number;
  ttl: number;
}

export interface ProjectileRemoveEvent {
  type: 'GameEvent';
  event: 'ProjectileRemove';
  ownerId?: string;
  projectileId: number;
}

export type GameEvent = HitConfirmedEvent | ProjectileSpawnEvent | ProjectileRemoveEvent;

export type SnapshotMessage = StateSnapshot | StateSnapshotDelta;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readString = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

const readNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const readInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;

const readBool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);

const parseJsonPayload = (message: string): Record<string, unknown> | null => {
  let payload: unknown;
  try {
    payload = JSON.parse(message);
  } catch {
    return null;
  }
  return isRecord(payload) ? payload : null;
};

const readMaskedNumber = (
  payload: Record<string, unknown>,
  key: string,
  mask: number,
  bit: number
): { ok: boolean; value?: number } => {
  if ((mask & bit) === 0) {
    if (key in payload) {
      return { ok: false };
    }
    return { ok: true };
  }
  const value = readNumber(payload[key]);
  if (value === null) {
    return { ok: false };
  }
  return { ok: true, value };
};

const readMaskedInt = (
  payload: Record<string, unknown>,
  key: string,
  mask: number,
  bit: number
): { ok: boolean; value?: number } => {
  if ((mask & bit) === 0) {
    if (key in payload) {
      return { ok: false };
    }
    return { ok: true };
  }
  const value = readInt(payload[key]);
  if (value === null) {
    return { ok: false };
  }
  return { ok: true, value };
};

export const buildClientHello = (
  sessionToken: string,
  connectionId: string,
  build = 'dev',
  profile?: { nickname?: string; characterId?: string }
) =>
  JSON.stringify({
    type: 'ClientHello',
    protocolVersion: PROTOCOL_VERSION,
    sessionToken,
    connectionId,
    build,
    ...(profile?.nickname ? { nickname: profile.nickname } : {}),
    ...(profile?.characterId ? { characterId: profile.characterId } : {})
  } satisfies ClientHello);

export const buildPing = (clientTimeMs: number) =>
  JSON.stringify({
    type: 'Ping',
    clientTimeMs: Number.isFinite(clientTimeMs) ? clientTimeMs : 0
  } satisfies Ping);

export const parseServerHello = (message: string): ServerHello | null => {
  let payload: unknown;
  try {
    payload = JSON.parse(message);
  } catch {
    return null;
  }
  if (!isRecord(payload)) {
    return null;
  }
  if (payload.type !== 'ServerHello') {
    return null;
  }

  const protocolVersion = readNumber(payload.protocolVersion);
  const connectionId = readString(payload.connectionId);
  const serverTickRate = readNumber(payload.serverTickRate);
  const snapshotRate = readNumber(payload.snapshotRate);

  if (!protocolVersion || !connectionId || !serverTickRate || !snapshotRate) {
    return null;
  }

  let snapshotKeyframeInterval: number | undefined;
  if ('snapshotKeyframeInterval' in payload) {
    const parsed = readInt(payload.snapshotKeyframeInterval);
    if (parsed === null || parsed < 0) {
      return null;
    }
    snapshotKeyframeInterval = parsed;
  }

  const motd = readString(payload.motd);
  const clientId = readString(payload.clientId);
  const connectionNonce = readString(payload.connectionNonce);

  return {
    type: 'ServerHello',
    protocolVersion,
    connectionId,
    serverTickRate,
    snapshotRate,
    snapshotKeyframeInterval,
    motd: motd ?? undefined,
    clientId: clientId ?? undefined,
    connectionNonce: connectionNonce ?? undefined
  };
};

export const parsePlayerProfile = (message: string): PlayerProfile | null => {
  const payload = parseJsonPayload(message);
  if (!payload || payload.type !== 'PlayerProfile') {
    return null;
  }
  const clientId = readString(payload.clientId);
  const nickname = readString(payload.nickname);
  const characterId = readString(payload.characterId);
  if (!clientId || !nickname || !characterId) {
    return null;
  }
  return {
    type: 'PlayerProfile',
    clientId,
    nickname,
    characterId
  };
};

export const parsePong = (message: string): Pong | null => {
  const payload = parseJsonPayload(message);
  if (!payload || payload.type !== 'Pong') {
    return null;
  }

  const clientTimeMs = readNumber(payload.clientTimeMs);
  if (clientTimeMs === null || clientTimeMs < 0) {
    return null;
  }

  return {
    type: 'Pong',
    clientTimeMs
  };
};

export const parseGameEvent = (message: string): GameEvent | null => {
  const payload = parseJsonPayload(message);
  if (!payload || payload.type !== 'GameEvent') {
    return null;
  }

  const eventName = readString(payload.event);
  if (eventName === 'HitConfirmed') {
    let targetId: string | undefined;
    if ('targetId' in payload) {
      const parsed = readString(payload.targetId);
      if (!parsed) {
        return null;
      }
      targetId = parsed;
    }

    let damage: number | undefined;
    if ('damage' in payload) {
      const parsed = readNumber(payload.damage);
      if (parsed === null || parsed < 0) {
        return null;
      }
      damage = parsed;
    }

    let killed: boolean | undefined;
    if ('killed' in payload) {
      const parsed = readBool(payload.killed);
      if (parsed === null) {
        return null;
      }
      killed = parsed;
    }

    return {
      type: 'GameEvent',
      event: eventName,
      targetId,
      damage,
      killed
    };
  }

  if (eventName === 'ProjectileSpawn') {
    const ownerId = readString(payload.ownerId);
    if (!ownerId) {
      return null;
    }
    const posX = readNumber(payload.posX);
    const posY = readNumber(payload.posY);
    const posZ = readNumber(payload.posZ);
    const velX = readNumber(payload.velX);
    const velY = readNumber(payload.velY);
    const velZ = readNumber(payload.velZ);
    const ttl = readNumber(payload.ttl);
    if (
      posX === null ||
      posY === null ||
      posZ === null ||
      velX === null ||
      velY === null ||
      velZ === null ||
      ttl === null ||
      ttl < 0
    ) {
      return null;
    }

    let projectileId: number | undefined;
    if ('projectileId' in payload) {
      const parsed = readInt(payload.projectileId);
      if (parsed === null || parsed < 0) {
        return null;
      }
      projectileId = parsed;
    }

    return {
      type: 'GameEvent',
      event: eventName,
      ownerId,
      projectileId,
      posX,
      posY,
      posZ,
      velX,
      velY,
      velZ,
      ttl
    };
  }

  if (eventName === 'ProjectileRemove') {
    const projectileId = readInt(payload.projectileId);
    if (projectileId === null || projectileId < 0) {
      return null;
    }
    let ownerId: string | undefined;
    if ('ownerId' in payload) {
      const parsed = readString(payload.ownerId);
      if (!parsed) {
        return null;
      }
      ownerId = parsed;
    }
    return {
      type: 'GameEvent',
      event: eventName,
      ownerId,
      projectileId
    };
  }

  return null;
};

const parseStateSnapshotPayload = (payload: Record<string, unknown>): StateSnapshot | null => {
  if (payload.type !== 'StateSnapshot') {
    return null;
  }

  const serverTick = readInt(payload.serverTick);
  const lastProcessedInputSeq = readInt(payload.lastProcessedInputSeq);
  const posX = readNumber(payload.posX);
  const posY = readNumber(payload.posY);
  const posZ = readNumber(payload.posZ);
  const velX = readNumber(payload.velX);
  const velY = readNumber(payload.velY);
  const velZ = readNumber(payload.velZ);
  const weaponSlot = readInt(payload.weaponSlot);
  const dashCooldown = readNumber(payload.dashCooldown);
  const health = readNumber(payload.health);
  const kills = readInt(payload.kills);
  const deaths = readInt(payload.deaths);

  if (serverTick === null || serverTick < 0) {
    return null;
  }
  if (lastProcessedInputSeq === null || lastProcessedInputSeq < -1) {
    return null;
  }
  if (
    posX === null ||
    posY === null ||
    posZ === null ||
    velX === null ||
    velY === null ||
    velZ === null ||
    weaponSlot === null ||
    dashCooldown === null ||
    health === null ||
    kills === null ||
    deaths === null ||
    dashCooldown < 0
  ) {
    return null;
  }
  if (health < 0 || kills < 0 || deaths < 0 || weaponSlot < 0) {
    return null;
  }

  let clientId: string | undefined;
  if ('clientId' in payload) {
    const parsed = readString(payload.clientId);
    if (!parsed) {
      return null;
    }
    clientId = parsed;
  }

  return {
    type: 'StateSnapshot',
    serverTick,
    lastProcessedInputSeq,
    posX,
    posY,
    posZ,
    velX,
    velY,
    velZ,
    weaponSlot,
    dashCooldown,
    health,
    kills,
    deaths,
    clientId
  };
};

const parseStateSnapshotDeltaPayload = (payload: Record<string, unknown>): StateSnapshotDelta | null => {
  if (payload.type !== 'StateSnapshotDelta') {
    return null;
  }

  const serverTick = readInt(payload.serverTick);
  const baseTick = readInt(payload.baseTick);
  const lastProcessedInputSeq = readInt(payload.lastProcessedInputSeq);
  const mask = readInt(payload.mask);

  if (serverTick === null || serverTick < 0) {
    return null;
  }
  if (baseTick === null || baseTick < 0 || baseTick > serverTick) {
    return null;
  }
  if (lastProcessedInputSeq === null || lastProcessedInputSeq < -1) {
    return null;
  }
  if (mask === null || mask < 0 || (mask & ~SNAPSHOT_MASK_ALL) !== 0) {
    return null;
  }

  const posX = readMaskedNumber(payload, 'posX', mask, SNAPSHOT_MASK_POS_X);
  const posY = readMaskedNumber(payload, 'posY', mask, SNAPSHOT_MASK_POS_Y);
  const posZ = readMaskedNumber(payload, 'posZ', mask, SNAPSHOT_MASK_POS_Z);
  const velX = readMaskedNumber(payload, 'velX', mask, SNAPSHOT_MASK_VEL_X);
  const velY = readMaskedNumber(payload, 'velY', mask, SNAPSHOT_MASK_VEL_Y);
  const velZ = readMaskedNumber(payload, 'velZ', mask, SNAPSHOT_MASK_VEL_Z);
  const weaponSlot = readMaskedInt(payload, 'weaponSlot', mask, SNAPSHOT_MASK_WEAPON_SLOT);
  const dashCooldown = readMaskedNumber(payload, 'dashCooldown', mask, SNAPSHOT_MASK_DASH_COOLDOWN);
  const health = readMaskedNumber(payload, 'health', mask, SNAPSHOT_MASK_HEALTH);
  const kills = readMaskedInt(payload, 'kills', mask, SNAPSHOT_MASK_KILLS);
  const deaths = readMaskedInt(payload, 'deaths', mask, SNAPSHOT_MASK_DEATHS);

  if (
    !posX.ok ||
    !posY.ok ||
    !posZ.ok ||
    !velX.ok ||
    !velY.ok ||
    !velZ.ok ||
    !weaponSlot.ok ||
    !dashCooldown.ok ||
    !health.ok ||
    !kills.ok ||
    !deaths.ok
  ) {
    return null;
  }
  if (weaponSlot.value !== undefined && weaponSlot.value < 0) {
    return null;
  }
  if (dashCooldown.value !== undefined && dashCooldown.value < 0) {
    return null;
  }
  if (health.value !== undefined && health.value < 0) {
    return null;
  }
  if (kills.value !== undefined && kills.value < 0) {
    return null;
  }
  if (deaths.value !== undefined && deaths.value < 0) {
    return null;
  }

  let clientId: string | undefined;
  if ('clientId' in payload) {
    const parsed = readString(payload.clientId);
    if (!parsed) {
      return null;
    }
    clientId = parsed;
  }

  const delta: StateSnapshotDelta = {
    type: 'StateSnapshotDelta',
    serverTick,
    baseTick,
    lastProcessedInputSeq,
    mask,
    clientId
  };

  if (posX.value !== undefined) {
    delta.posX = posX.value;
  }
  if (posY.value !== undefined) {
    delta.posY = posY.value;
  }
  if (posZ.value !== undefined) {
    delta.posZ = posZ.value;
  }
  if (velX.value !== undefined) {
    delta.velX = velX.value;
  }
  if (velY.value !== undefined) {
    delta.velY = velY.value;
  }
  if (velZ.value !== undefined) {
    delta.velZ = velZ.value;
  }
  if (weaponSlot.value !== undefined) {
    delta.weaponSlot = weaponSlot.value;
  }
  if (dashCooldown.value !== undefined) {
    delta.dashCooldown = dashCooldown.value;
  }
  if (health.value !== undefined) {
    delta.health = health.value;
  }
  if (kills.value !== undefined) {
    delta.kills = kills.value;
  }
  if (deaths.value !== undefined) {
    delta.deaths = deaths.value;
  }

  return delta;
};

export const parseStateSnapshot = (message: string): StateSnapshot | null => {
  const payload = parseJsonPayload(message);
  if (!payload) {
    return null;
  }
  return parseStateSnapshotPayload(payload);
};

export const parseStateSnapshotDelta = (message: string): StateSnapshotDelta | null => {
  const payload = parseJsonPayload(message);
  if (!payload) {
    return null;
  }
  return parseStateSnapshotDeltaPayload(payload);
};

export const parseSnapshotMessage = (message: string): SnapshotMessage | null => {
  const payload = parseJsonPayload(message);
  if (!payload) {
    return null;
  }
  if (payload.type === 'StateSnapshot') {
    return parseStateSnapshotPayload(payload);
  }
  if (payload.type === 'StateSnapshotDelta') {
    return parseStateSnapshotDeltaPayload(payload);
  }
  return null;
};
