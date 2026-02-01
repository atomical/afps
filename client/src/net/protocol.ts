export const PROTOCOL_VERSION = 2;
export const SNAPSHOT_MASK_POS_X = 1 << 0;
export const SNAPSHOT_MASK_POS_Y = 1 << 1;
export const SNAPSHOT_MASK_POS_Z = 1 << 2;
export const SNAPSHOT_MASK_VEL_X = 1 << 3;
export const SNAPSHOT_MASK_VEL_Y = 1 << 4;
export const SNAPSHOT_MASK_VEL_Z = 1 << 5;
export const SNAPSHOT_MASK_DASH_COOLDOWN = 1 << 6;
const SNAPSHOT_MASK_ALL =
  SNAPSHOT_MASK_POS_X |
  SNAPSHOT_MASK_POS_Y |
  SNAPSHOT_MASK_POS_Z |
  SNAPSHOT_MASK_VEL_X |
  SNAPSHOT_MASK_VEL_Y |
  SNAPSHOT_MASK_VEL_Z |
  SNAPSHOT_MASK_DASH_COOLDOWN;

export interface ClientHello {
  type: 'ClientHello';
  protocolVersion: number;
  sessionToken: string;
  connectionId: string;
  build: string;
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
  dashCooldown: number;
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
  dashCooldown?: number;
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

export type SnapshotMessage = StateSnapshot | StateSnapshotDelta;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readString = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

const readNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const readInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;

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

export const buildClientHello = (sessionToken: string, connectionId: string, build = 'dev') =>
  JSON.stringify({
    type: 'ClientHello',
    protocolVersion: PROTOCOL_VERSION,
    sessionToken,
    connectionId,
    build
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
  const dashCooldown = readNumber(payload.dashCooldown);

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
    dashCooldown === null ||
    dashCooldown < 0
  ) {
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
    dashCooldown,
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
  const dashCooldown = readMaskedNumber(payload, 'dashCooldown', mask, SNAPSHOT_MASK_DASH_COOLDOWN);

  if (!posX.ok || !posY.ok || !posZ.ok || !velX.ok || !velY.ok || !velZ.ok || !dashCooldown.ok) {
    return null;
  }
  if (dashCooldown.value !== undefined && dashCooldown.value < 0) {
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
  if (dashCooldown.value !== undefined) {
    delta.dashCooldown = dashCooldown.value;
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
