export const PROTOCOL_VERSION = 1;

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readString = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

const readNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const readInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;

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

  const motd = readString(payload.motd);
  const clientId = readString(payload.clientId);
  const connectionNonce = readString(payload.connectionNonce);

  return {
    type: 'ServerHello',
    protocolVersion,
    connectionId,
    serverTickRate,
    snapshotRate,
    motd: motd ?? undefined,
    clientId: clientId ?? undefined,
    connectionNonce: connectionNonce ?? undefined
  };
};

export const parsePong = (message: string): Pong | null => {
  let payload: unknown;
  try {
    payload = JSON.parse(message);
  } catch {
    return null;
  }
  if (!isRecord(payload)) {
    return null;
  }
  if (payload.type !== 'Pong') {
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

export const parseStateSnapshot = (message: string): StateSnapshot | null => {
  let payload: unknown;
  try {
    payload = JSON.parse(message);
  } catch {
    return null;
  }
  if (!isRecord(payload)) {
    return null;
  }
  if (payload.type !== 'StateSnapshot') {
    return null;
  }

  const serverTick = readInt(payload.serverTick);
  const lastProcessedInputSeq = readInt(payload.lastProcessedInputSeq);
  const posX = readNumber(payload.posX);
  const posY = readNumber(payload.posY);

  if (serverTick === null || serverTick < 0) {
    return null;
  }
  if (lastProcessedInputSeq === null || lastProcessedInputSeq < -1) {
    return null;
  }
  if (posX === null || posY === null) {
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
    clientId
  };
};
