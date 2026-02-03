import * as flatbuffers from 'flatbuffers';
import { ClientHello } from './fbs/afps/protocol/client-hello';
import { Error as ProtocolError } from './fbs/afps/protocol/error';
import { GameEvent as GameEventFbs } from './fbs/afps/protocol/game-event';
import { GameEventType } from './fbs/afps/protocol/game-event-type';
import { InputCmdT } from './fbs/afps/protocol/input-cmd';
import { Ping } from './fbs/afps/protocol/ping';
import { PlayerProfile as PlayerProfileFbs } from './fbs/afps/protocol/player-profile';
import { Pong } from './fbs/afps/protocol/pong';
import { ServerHello as ServerHelloFbs } from './fbs/afps/protocol/server-hello';
import { StateSnapshot as StateSnapshotFbs } from './fbs/afps/protocol/state-snapshot';
import { StateSnapshotDelta as StateSnapshotDeltaFbs } from './fbs/afps/protocol/state-snapshot-delta';
import { MessageType } from './fbs/afps/protocol/message-type';
import type { InputCmd } from './input_cmd';

export const PROTOCOL_VERSION = 4;
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

const MAGIC = new Uint8Array([0x41, 0x46, 0x50, 0x53]);
const HEADER_BYTES = 20;

export interface MessageHeader {
  protocolVersion: number;
  msgType: MessageType;
  payloadBytes: number;
  msgSeq: number;
  serverSeqAck: number;
}

export interface DecodedEnvelope {
  header: MessageHeader;
  payload: Uint8Array;
}

export interface ClientHelloMessage {
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

export interface PingMessage {
  type: 'Ping';
  clientTimeMs: number;
}

export interface PongMessage {
  type: 'Pong';
  clientTimeMs: number;
}

export interface PlayerProfile {
  type: 'PlayerProfile';
  clientId: string;
  nickname: string;
  characterId: string;
}

export interface ProtocolErrorMessage {
  type: 'Error';
  code: string;
  message: string;
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

const isFiniteNumber = (value: number) => Number.isFinite(value);

const toUint8Array = (data: ArrayBuffer | Uint8Array) =>
  data instanceof Uint8Array ? data : new Uint8Array(data);

const isMessageType = (value: number): value is MessageType =>
  value >= MessageType.ClientHello && value <= MessageType.Disconnect;

export const decodeEnvelope = (data: ArrayBuffer | Uint8Array): DecodedEnvelope | null => {
  const bytes = toUint8Array(data);
  if (bytes.byteLength < HEADER_BYTES) {
    return null;
  }
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (bytes[i] !== MAGIC[i]) {
      return null;
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const protocolVersion = view.getUint16(4, true);
  const msgType = view.getUint16(6, true);
  const payloadBytes = view.getUint32(8, true);
  const msgSeq = view.getUint32(12, true);
  const serverSeqAck = view.getUint32(16, true);
  if (!isMessageType(msgType)) {
    return null;
  }
  if (payloadBytes + HEADER_BYTES !== bytes.byteLength) {
    return null;
  }
  return {
    header: {
      protocolVersion,
      msgType,
      payloadBytes,
      msgSeq,
      serverSeqAck
    },
    payload: bytes.slice(HEADER_BYTES)
  };
};

export const encodeEnvelope = (
  msgType: MessageType,
  payload: Uint8Array,
  msgSeq: number,
  serverSeqAck: number,
  protocolVersion = PROTOCOL_VERSION
) => {
  const payloadBytes = payload.byteLength;
  const buffer = new Uint8Array(HEADER_BYTES + payloadBytes);
  buffer.set(MAGIC, 0);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  view.setUint16(4, protocolVersion, true);
  view.setUint16(6, msgType, true);
  view.setUint32(8, payloadBytes, true);
  view.setUint32(12, msgSeq >>> 0, true);
  view.setUint32(16, serverSeqAck >>> 0, true);
  if (payloadBytes > 0) {
    buffer.set(payload, HEADER_BYTES);
  }
  return buffer;
};

export const buildClientHello = (
  sessionToken: string,
  connectionId: string,
  build = 'dev',
  profile?: { nickname?: string; characterId?: string },
  msgSeq = 1,
  serverSeqAck = 0
) => {
  const builder = new flatbuffers.Builder(256);
  const sessionTokenOffset = builder.createString(sessionToken);
  const connectionIdOffset = builder.createString(connectionId);
  const buildOffset = builder.createString(build);
  const nicknameOffset = profile?.nickname ? builder.createString(profile.nickname) : 0;
  const characterIdOffset = profile?.characterId ? builder.createString(profile.characterId) : 0;
  const payload = ClientHello.createClientHello(
    builder,
    PROTOCOL_VERSION,
    sessionTokenOffset,
    connectionIdOffset,
    buildOffset,
    nicknameOffset,
    characterIdOffset
  );
  builder.finish(payload);
  return encodeEnvelope(MessageType.ClientHello, builder.asUint8Array(), msgSeq, serverSeqAck);
};

export const encodeInputCmd = (cmd: InputCmd, msgSeq = 1, serverSeqAck = 0) => {
  const builder = new flatbuffers.Builder(256);
  const payload = new InputCmdT(
    cmd.inputSeq,
    cmd.moveX,
    cmd.moveY,
    cmd.lookDeltaX,
    cmd.lookDeltaY,
    cmd.viewYaw,
    cmd.viewPitch,
    cmd.weaponSlot,
    cmd.jump,
    cmd.fire,
    cmd.sprint,
    cmd.dash,
    cmd.grapple,
    cmd.shield,
    cmd.shockwave
  ).pack(builder);
  builder.finish(payload);
  return encodeEnvelope(MessageType.InputCmd, builder.asUint8Array(), msgSeq, serverSeqAck);
};

export const buildPing = (clientTimeMs: number, msgSeq = 1, serverSeqAck = 0) => {
  const builder = new flatbuffers.Builder(64);
  const payload = Ping.createPing(builder, Number.isFinite(clientTimeMs) ? clientTimeMs : 0);
  builder.finish(payload);
  return encodeEnvelope(MessageType.Ping, builder.asUint8Array(), msgSeq, serverSeqAck);
};

export const parseServerHelloPayload = (payload: Uint8Array): ServerHello | null => {
  const bb = new flatbuffers.ByteBuffer(payload);
  const message = ServerHelloFbs.getRootAsServerHello(bb);
  const protocolVersion = message.protocolVersion();
  const connectionId = message.connectionId();
  const serverTickRate = message.serverTickRate();
  const snapshotRate = message.snapshotRate();
  if (!protocolVersion || !connectionId || !serverTickRate || !snapshotRate) {
    return null;
  }
  const snapshotKeyframeInterval = message.snapshotKeyframeInterval();
  const motd = message.motd();
  const clientId = message.clientId();
  const connectionNonce = message.connectionNonce();
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

export const parsePlayerProfilePayload = (payload: Uint8Array): PlayerProfile | null => {
  const bb = new flatbuffers.ByteBuffer(payload);
  const message = PlayerProfileFbs.getRootAsPlayerProfile(bb);
  const clientId = message.clientId();
  const nickname = message.nickname();
  const characterId = message.characterId();
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

export const parsePongPayload = (payload: Uint8Array): PongMessage | null => {
  const bb = new flatbuffers.ByteBuffer(payload);
  const message = Pong.getRootAsPong(bb);
  const clientTimeMs = message.clientTimeMs();
  if (!isFiniteNumber(clientTimeMs)) {
    return null;
  }
  return { type: 'Pong', clientTimeMs };
};

export const parseStateSnapshotPayload = (payload: Uint8Array): StateSnapshot | null => {
  const bb = new flatbuffers.ByteBuffer(payload);
  const message = StateSnapshotFbs.getRootAsStateSnapshot(bb);
  const serverTick = message.serverTick();
  const lastProcessedInputSeq = message.lastProcessedInputSeq();
  if (serverTick < 0 || lastProcessedInputSeq < -1) {
    return null;
  }
  const posX = message.posX();
  const posY = message.posY();
  const posZ = message.posZ();
  const velX = message.velX();
  const velY = message.velY();
  const velZ = message.velZ();
  const dashCooldown = message.dashCooldown();
  const health = message.health();
  if (![posX, posY, posZ, velX, velY, velZ, dashCooldown, health].every(isFiniteNumber)) {
    return null;
  }
  const snapshot: StateSnapshot = {
    type: 'StateSnapshot',
    serverTick,
    lastProcessedInputSeq,
    posX,
    posY,
    posZ,
    velX,
    velY,
    velZ,
    weaponSlot: message.weaponSlot(),
    dashCooldown,
    health,
    kills: message.kills(),
    deaths: message.deaths()
  };
  const clientId = message.clientId();
  if (clientId && clientId.length > 0) {
    snapshot.clientId = clientId;
  }
  return snapshot;
};

export const parseStateSnapshotDeltaPayload = (payload: Uint8Array): StateSnapshotDelta | null => {
  const bb = new flatbuffers.ByteBuffer(payload);
  const message = StateSnapshotDeltaFbs.getRootAsStateSnapshotDelta(bb);
  const serverTick = message.serverTick();
  const baseTick = message.baseTick();
  const lastProcessedInputSeq = message.lastProcessedInputSeq();
  const mask = message.mask();
  if (serverTick < 0 || baseTick < 0 || lastProcessedInputSeq < -1) {
    return null;
  }
  if ((mask | SNAPSHOT_MASK_ALL) !== SNAPSHOT_MASK_ALL) {
    return null;
  }
  const snapshot: StateSnapshotDelta = {
    type: 'StateSnapshotDelta',
    serverTick,
    baseTick,
    lastProcessedInputSeq,
    mask
  };
  const clientId = message.clientId();
  if (clientId && clientId.length > 0) {
    snapshot.clientId = clientId;
  }
  if (mask & SNAPSHOT_MASK_POS_X) snapshot.posX = message.posX();
  if (mask & SNAPSHOT_MASK_POS_Y) snapshot.posY = message.posY();
  if (mask & SNAPSHOT_MASK_POS_Z) snapshot.posZ = message.posZ();
  if (mask & SNAPSHOT_MASK_VEL_X) snapshot.velX = message.velX();
  if (mask & SNAPSHOT_MASK_VEL_Y) snapshot.velY = message.velY();
  if (mask & SNAPSHOT_MASK_VEL_Z) snapshot.velZ = message.velZ();
  if (mask & SNAPSHOT_MASK_WEAPON_SLOT) snapshot.weaponSlot = message.weaponSlot();
  if (mask & SNAPSHOT_MASK_DASH_COOLDOWN) snapshot.dashCooldown = message.dashCooldown();
  if (mask & SNAPSHOT_MASK_HEALTH) snapshot.health = message.health();
  if (mask & SNAPSHOT_MASK_KILLS) snapshot.kills = message.kills();
  if (mask & SNAPSHOT_MASK_DEATHS) snapshot.deaths = message.deaths();

  const numericValues = [
    snapshot.posX,
    snapshot.posY,
    snapshot.posZ,
    snapshot.velX,
    snapshot.velY,
    snapshot.velZ,
    snapshot.dashCooldown,
    snapshot.health
  ].filter((value) => typeof value === 'number') as number[];
  if (!numericValues.every(isFiniteNumber)) {
    return null;
  }
  return snapshot;
};

export const parseGameEventPayload = (payload: Uint8Array): GameEvent | null => {
  const bb = new flatbuffers.ByteBuffer(payload);
  const message = GameEventFbs.getRootAsGameEvent(bb);
  const eventType = message.eventType();
  switch (eventType) {
    case GameEventType.HitConfirmed: {
      const damage = message.damage();
      const killed = message.killed();
      if (!isFiniteNumber(damage)) {
        return null;
      }
      const targetId = message.targetId() ?? undefined;
      return {
        type: 'GameEvent',
        event: 'HitConfirmed',
        targetId: targetId && targetId.length > 0 ? targetId : undefined,
        damage,
        killed
      };
    }
    case GameEventType.ProjectileSpawn: {
      const ownerId = message.ownerId();
      const posX = message.posX();
      const posY = message.posY();
      const posZ = message.posZ();
      const velX = message.velX();
      const velY = message.velY();
      const velZ = message.velZ();
      const ttl = message.ttl();
      if (!ownerId || !ownerId.length) {
        return null;
      }
      if (![posX, posY, posZ, velX, velY, velZ, ttl].every(isFiniteNumber)) {
        return null;
      }
      return {
        type: 'GameEvent',
        event: 'ProjectileSpawn',
        ownerId,
        projectileId: message.projectileId() || undefined,
        posX,
        posY,
        posZ,
        velX,
        velY,
        velZ,
        ttl
      };
    }
    case GameEventType.ProjectileRemove: {
      const projectileId = message.projectileId();
      if (projectileId <= 0) {
        return null;
      }
      const ownerId = message.ownerId() ?? undefined;
      return {
        type: 'GameEvent',
        event: 'ProjectileRemove',
        ownerId: ownerId && ownerId.length > 0 ? ownerId : undefined,
        projectileId
      };
    }
    default:
      return null;
  }
};

export const parseErrorPayload = (payload: Uint8Array): ProtocolErrorMessage | null => {
  const bb = new flatbuffers.ByteBuffer(payload);
  const message = ProtocolError.getRootAsError(bb);
  const code = message.code();
  const detail = message.message();
  if (!code || !detail) {
    return null;
  }
  return { type: 'Error', code, message: detail };
};

export const parseServerHello = (data: ArrayBuffer | Uint8Array): ServerHello | null => {
  const envelope = decodeEnvelope(data);
  if (!envelope || envelope.header.msgType !== MessageType.ServerHello) {
    return null;
  }
  return parseServerHelloPayload(envelope.payload);
};

export const parsePlayerProfile = (data: ArrayBuffer | Uint8Array): PlayerProfile | null => {
  const envelope = decodeEnvelope(data);
  if (!envelope || envelope.header.msgType !== MessageType.PlayerProfile) {
    return null;
  }
  return parsePlayerProfilePayload(envelope.payload);
};

export const parsePong = (data: ArrayBuffer | Uint8Array): PongMessage | null => {
  const envelope = decodeEnvelope(data);
  if (!envelope || envelope.header.msgType !== MessageType.Pong) {
    return null;
  }
  return parsePongPayload(envelope.payload);
};

export const parseStateSnapshot = (data: ArrayBuffer | Uint8Array): StateSnapshot | null => {
  const envelope = decodeEnvelope(data);
  if (!envelope || envelope.header.msgType !== MessageType.StateSnapshot) {
    return null;
  }
  return parseStateSnapshotPayload(envelope.payload);
};

export const parseStateSnapshotDelta = (data: ArrayBuffer | Uint8Array): StateSnapshotDelta | null => {
  const envelope = decodeEnvelope(data);
  if (!envelope || envelope.header.msgType !== MessageType.StateSnapshotDelta) {
    return null;
  }
  return parseStateSnapshotDeltaPayload(envelope.payload);
};

export const parseSnapshotMessage = (data: ArrayBuffer | Uint8Array): SnapshotMessage | null => {
  const envelope = decodeEnvelope(data);
  if (!envelope) {
    return null;
  }
  if (envelope.header.msgType === MessageType.StateSnapshot) {
    return parseStateSnapshotPayload(envelope.payload);
  }
  if (envelope.header.msgType === MessageType.StateSnapshotDelta) {
    return parseStateSnapshotDeltaPayload(envelope.payload);
  }
  return null;
};

export const parseGameEvent = (data: ArrayBuffer | Uint8Array): GameEvent | null => {
  const envelope = decodeEnvelope(data);
  if (!envelope || envelope.header.msgType !== MessageType.GameEvent) {
    return null;
  }
  return parseGameEventPayload(envelope.payload);
};

export const parseProtocolError = (data: ArrayBuffer | Uint8Array): ProtocolErrorMessage | null => {
  const envelope = decodeEnvelope(data);
  if (!envelope || envelope.header.msgType !== MessageType.Error) {
    return null;
  }
  return parseErrorPayload(envelope.payload);
};

export const __test = {
  SNAPSHOT_MASK_ALL,
  HEADER_BYTES,
  MAGIC
};

export { MessageType, GameEventType };
