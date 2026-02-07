import * as flatbuffers from 'flatbuffers';
import { ClientHello } from './fbs/afps/protocol/client-hello';
import { Error as ProtocolError } from './fbs/afps/protocol/error';
import { FireWeaponRequestT } from './fbs/afps/protocol/fire-weapon-request';
import { GameEvent as GameEventFbs } from './fbs/afps/protocol/game-event';
import { FxEvent as FxEventType, unionListToFxEvent } from './fbs/afps/protocol/fx-event';
import { HitConfirmedFx } from './fbs/afps/protocol/hit-confirmed-fx';
import { HitKind } from './fbs/afps/protocol/hit-kind';
import { InputCmdT } from './fbs/afps/protocol/input-cmd';
import { KillFeedFx } from './fbs/afps/protocol/kill-feed-fx';
import { NearMissFx } from './fbs/afps/protocol/near-miss-fx';
import { OverheatFx } from './fbs/afps/protocol/overheat-fx';
import { Ping } from './fbs/afps/protocol/ping';
import { PickupKind } from './fbs/afps/protocol/pickup-kind';
import { PickupSpawnedFx } from './fbs/afps/protocol/pickup-spawned-fx';
import { PickupTakenFx } from './fbs/afps/protocol/pickup-taken-fx';
import { PlayerProfile as PlayerProfileFbs } from './fbs/afps/protocol/player-profile';
import { Pong } from './fbs/afps/protocol/pong';
import { ProjectileImpactFx } from './fbs/afps/protocol/projectile-impact-fx';
import { ProjectileRemoveFx } from './fbs/afps/protocol/projectile-remove-fx';
import { ProjectileSpawnFx } from './fbs/afps/protocol/projectile-spawn-fx';
import { ReloadFx } from './fbs/afps/protocol/reload-fx';
import { ServerHello as ServerHelloFbs } from './fbs/afps/protocol/server-hello';
import { SetLoadoutRequestT } from './fbs/afps/protocol/set-loadout-request';
import { ShotFiredFx } from './fbs/afps/protocol/shot-fired-fx';
import { ShotTraceFx } from './fbs/afps/protocol/shot-trace-fx';
import { StateSnapshot as StateSnapshotFbs } from './fbs/afps/protocol/state-snapshot';
import { StateSnapshotDelta as StateSnapshotDeltaFbs } from './fbs/afps/protocol/state-snapshot-delta';
import { SurfaceType } from './fbs/afps/protocol/surface-type';
import { VentFx } from './fbs/afps/protocol/vent-fx';
import { MessageType } from './fbs/afps/protocol/message-type';
import type { InputCmd } from './input_cmd';

export const PROTOCOL_VERSION = 7;
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
export const SNAPSHOT_MASK_AMMO_IN_MAG = 1 << 11;
export const SNAPSHOT_MASK_VIEW_YAW_Q = 1 << 12;
export const SNAPSHOT_MASK_VIEW_PITCH_Q = 1 << 13;
export const SNAPSHOT_MASK_PLAYER_FLAGS = 1 << 14;
export const SNAPSHOT_MASK_WEAPON_HEAT_Q = 1 << 15;
export const SNAPSHOT_MASK_LOADOUT_BITS = 1 << 16;
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
  SNAPSHOT_MASK_WEAPON_SLOT |
  SNAPSHOT_MASK_AMMO_IN_MAG |
  SNAPSHOT_MASK_VIEW_YAW_Q |
  SNAPSHOT_MASK_VIEW_PITCH_Q |
  SNAPSHOT_MASK_PLAYER_FLAGS |
  SNAPSHOT_MASK_WEAPON_HEAT_Q |
  SNAPSHOT_MASK_LOADOUT_BITS;

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
  mapSeed?: number;
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
  ammoInMag: number;
  dashCooldown: number;
  health: number;
  kills: number;
  deaths: number;
  viewYawQ: number;
  viewPitchQ: number;
  playerFlags: number;
  weaponHeatQ: number;
  loadoutBits: number;
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
  ammoInMag?: number;
  dashCooldown?: number;
  health?: number;
  kills?: number;
  deaths?: number;
  viewYawQ?: number;
  viewPitchQ?: number;
  playerFlags?: number;
  weaponHeatQ?: number;
  loadoutBits?: number;
  clientId?: string;
}

export interface FireWeaponRequestMessage {
  type: 'FireWeaponRequest';
  clientShotSeq: number;
  weaponId?: string;
  weaponSlot: number;
  originX: number;
  originY: number;
  originZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
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

export type FxEvent =
  | {
      type: 'ShotFiredFx';
      shooterId: string;
      weaponSlot: number;
      shotSeq: number;
      dryFire: boolean;
    }
  | {
      type: 'ShotTraceFx';
      shooterId: string;
      weaponSlot: number;
      shotSeq: number;
      dirOctX: number;
      dirOctY: number;
      hitDistQ: number;
      hitKind: HitKind;
      surfaceType: SurfaceType;
      normalOctX: number;
      normalOctY: number;
      showTracer: boolean;
      hitPosXQ: number;
      hitPosYQ: number;
      hitPosZQ: number;
    }
  | {
      type: 'ReloadFx';
      shooterId: string;
      weaponSlot: number;
    }
  | {
      type: 'NearMissFx';
      shooterId: string;
      shotSeq: number;
      strength: number;
    }
  | {
      type: 'OverheatFx';
      shooterId: string;
      weaponSlot: number;
      heatQ: number;
    }
  | {
      type: 'VentFx';
      shooterId: string;
      weaponSlot: number;
    }
  | {
      type: 'HitConfirmedFx';
      targetId: string;
      damage: number;
      killed: boolean;
    }
  | {
      type: 'KillFeedFx';
      killerId: string;
      victimId: string;
    }
  | {
      type: 'ProjectileSpawnFx';
      shooterId: string;
      weaponSlot: number;
      shotSeq: number;
      projectileId: number;
      posXQ: number;
      posYQ: number;
      posZQ: number;
      velXQ: number;
      velYQ: number;
      velZQ: number;
      ttlQ: number;
    }
  | {
      type: 'ProjectileImpactFx';
      projectileId: number;
      hitWorld: boolean;
      targetId?: string;
      posXQ: number;
      posYQ: number;
      posZQ: number;
      normalOctX: number;
      normalOctY: number;
      surfaceType: SurfaceType;
    }
  | {
      type: 'ProjectileRemoveFx';
      projectileId: number;
    }
  | {
      type: 'PickupSpawnedFx';
      pickupId: number;
      kind: PickupKind;
      posXQ: number;
      posYQ: number;
      posZQ: number;
      weaponSlot: number;
      amount: number;
    }
  | {
      type: 'PickupTakenFx';
      pickupId: number;
      takerId?: string;
      serverTick: number;
    };

export interface GameEventBatch {
  type: 'GameEventBatch';
  serverTick: number;
  events: FxEvent[];
}

export type SnapshotMessage = StateSnapshot | StateSnapshotDelta;

const isFiniteNumber = (value: number) => Number.isFinite(value);

const toUint8Array = (data: ArrayBuffer | Uint8Array) =>
  data instanceof Uint8Array ? data : new Uint8Array(data);

const isMessageType = (value: number): value is MessageType =>
  value >= MessageType.ClientHello && value <= MessageType.SetLoadoutRequest;

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
    cmd.ads,
    cmd.sprint,
    cmd.dash,
    cmd.grapple,
    cmd.shield,
    cmd.shockwave,
    cmd.crouch
  ).pack(builder);
  builder.finish(payload);
  return encodeEnvelope(MessageType.InputCmd, builder.asUint8Array(), msgSeq, serverSeqAck);
};

export const encodeSetLoadoutRequest = (loadoutBits: number, msgSeq = 1, serverSeqAck = 0) => {
  const builder = new flatbuffers.Builder(64);
  const payload = new SetLoadoutRequestT(loadoutBits >>> 0).pack(builder);
  builder.finish(payload);
  return encodeEnvelope(MessageType.SetLoadoutRequest, builder.asUint8Array(), msgSeq, serverSeqAck);
};

export const encodeFireWeaponRequest = (
  request: FireWeaponRequestMessage,
  msgSeq = 1,
  serverSeqAck = 0
) => {
  const builder = new flatbuffers.Builder(256);
  const payload = new FireWeaponRequestT(
    request.clientShotSeq,
    request.weaponId ?? null,
    request.weaponSlot,
    request.originX,
    request.originY,
    request.originZ,
    request.dirX,
    request.dirY,
    request.dirZ
  ).pack(builder);
  builder.finish(payload);
  return encodeEnvelope(MessageType.FireWeaponRequest, builder.asUint8Array(), msgSeq, serverSeqAck);
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
  const mapSeed = message.mapSeed() >>> 0;
  return {
    type: 'ServerHello',
    protocolVersion,
    connectionId,
    serverTickRate,
    snapshotRate,
    snapshotKeyframeInterval,
    motd: motd ?? undefined,
    clientId: clientId ?? undefined,
    connectionNonce: connectionNonce ?? undefined,
    mapSeed
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
  const ammoInMag = message.ammoInMag();
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
    ammoInMag,
    dashCooldown,
    health,
    kills: message.kills(),
    deaths: message.deaths(),
    viewYawQ: message.viewYawQ(),
    viewPitchQ: message.viewPitchQ(),
    playerFlags: message.playerFlags(),
    weaponHeatQ: message.weaponHeatQ(),
    loadoutBits: message.loadoutBits()
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
  if (mask & SNAPSHOT_MASK_AMMO_IN_MAG) snapshot.ammoInMag = message.ammoInMag();
  if (mask & SNAPSHOT_MASK_DASH_COOLDOWN) snapshot.dashCooldown = message.dashCooldown();
  if (mask & SNAPSHOT_MASK_HEALTH) snapshot.health = message.health();
  if (mask & SNAPSHOT_MASK_KILLS) snapshot.kills = message.kills();
  if (mask & SNAPSHOT_MASK_DEATHS) snapshot.deaths = message.deaths();
  if (mask & SNAPSHOT_MASK_VIEW_YAW_Q) snapshot.viewYawQ = message.viewYawQ();
  if (mask & SNAPSHOT_MASK_VIEW_PITCH_Q) snapshot.viewPitchQ = message.viewPitchQ();
  if (mask & SNAPSHOT_MASK_PLAYER_FLAGS) snapshot.playerFlags = message.playerFlags();
  if (mask & SNAPSHOT_MASK_WEAPON_HEAT_Q) snapshot.weaponHeatQ = message.weaponHeatQ();
  if (mask & SNAPSHOT_MASK_LOADOUT_BITS) snapshot.loadoutBits = message.loadoutBits();

  const numericValues = [
    snapshot.posX,
    snapshot.posY,
    snapshot.posZ,
    snapshot.velX,
    snapshot.velY,
    snapshot.velZ,
    snapshot.ammoInMag,
    snapshot.dashCooldown,
    snapshot.health,
    snapshot.viewYawQ,
    snapshot.viewPitchQ,
    snapshot.playerFlags,
    snapshot.weaponHeatQ,
    snapshot.loadoutBits
  ].filter((value) => typeof value === 'number') as number[];
  if (!numericValues.every(isFiniteNumber)) {
    return null;
  }
  return snapshot;
};

export const parseGameEventPayload = (payload: Uint8Array): GameEventBatch | null => {
  const bb = new flatbuffers.ByteBuffer(payload);
  const message = GameEventFbs.getRootAsGameEvent(bb);
  const serverTick = message.serverTick();
  if (!Number.isFinite(serverTick) || serverTick < 0) {
    return null;
  }
  const events: FxEvent[] = [];
  const accessor = message.events.bind(message);
  for (let i = 0; i < message.eventsTypeLength(); i += 1) {
    const type = message.eventsType(i);
    if (type === null || type === FxEventType.NONE) {
      continue;
    }
    const event = unionListToFxEvent(type, accessor, i);
    if (!event) {
      continue;
    }
    switch (type) {
      case FxEventType.ShotFiredFx: {
        const typed = event as ShotFiredFx;
        const shooterId = typed.shooterId();
        if (!shooterId) {
          return null;
        }
        events.push({
          type: 'ShotFiredFx',
          shooterId,
          weaponSlot: typed.weaponSlot(),
          shotSeq: typed.shotSeq(),
          dryFire: typed.dryFire()
        });
        break;
      }
      case FxEventType.ShotTraceFx: {
        const typed = event as ShotTraceFx;
        const shooterId = typed.shooterId();
        if (!shooterId) {
          return null;
        }
        events.push({
          type: 'ShotTraceFx',
          shooterId,
          weaponSlot: typed.weaponSlot(),
          shotSeq: typed.shotSeq(),
          dirOctX: typed.dirOctX(),
          dirOctY: typed.dirOctY(),
          hitDistQ: typed.hitDistQ(),
          hitKind: typed.hitKind(),
          surfaceType: typed.surfaceType(),
          normalOctX: typed.normalOctX(),
          normalOctY: typed.normalOctY(),
          showTracer: typed.showTracer(),
          hitPosXQ: typed.hitPosXQ(),
          hitPosYQ: typed.hitPosYQ(),
          hitPosZQ: typed.hitPosZQ()
        });
        break;
      }
      case FxEventType.ReloadFx: {
        const typed = event as ReloadFx;
        const shooterId = typed.shooterId();
        if (!shooterId) {
          return null;
        }
        events.push({
          type: 'ReloadFx',
          shooterId,
          weaponSlot: typed.weaponSlot()
        });
        break;
      }
      case FxEventType.NearMissFx: {
        const typed = event as NearMissFx;
        const shooterId = typed.shooterId();
        if (!shooterId) {
          return null;
        }
        events.push({
          type: 'NearMissFx',
          shooterId,
          shotSeq: typed.shotSeq(),
          strength: typed.strength()
        });
        break;
      }
      case FxEventType.OverheatFx: {
        const typed = event as OverheatFx;
        const shooterId = typed.shooterId();
        if (!shooterId) {
          return null;
        }
        events.push({
          type: 'OverheatFx',
          shooterId,
          weaponSlot: typed.weaponSlot(),
          heatQ: typed.heatQ()
        });
        break;
      }
      case FxEventType.VentFx: {
        const typed = event as VentFx;
        const shooterId = typed.shooterId();
        if (!shooterId) {
          return null;
        }
        events.push({
          type: 'VentFx',
          shooterId,
          weaponSlot: typed.weaponSlot()
        });
        break;
      }
      case FxEventType.HitConfirmedFx: {
        const typed = event as HitConfirmedFx;
        const targetId = typed.targetId();
        const damage = typed.damage();
        if (!targetId || !isFiniteNumber(damage)) {
          return null;
        }
        events.push({
          type: 'HitConfirmedFx',
          targetId,
          damage,
          killed: typed.killed()
        });
        break;
      }
      case FxEventType.KillFeedFx: {
        const typed = event as KillFeedFx;
        const killerId = typed.killerId();
        const victimId = typed.victimId();
        if (!killerId || !victimId) {
          return null;
        }
        events.push({
          type: 'KillFeedFx',
          killerId,
          victimId
        });
        break;
      }
      case FxEventType.ProjectileSpawnFx: {
        const typed = event as ProjectileSpawnFx;
        const shooterId = typed.shooterId();
        if (!shooterId) {
          return null;
        }
        events.push({
          type: 'ProjectileSpawnFx',
          shooterId,
          weaponSlot: typed.weaponSlot(),
          shotSeq: typed.shotSeq(),
          projectileId: typed.projectileId(),
          posXQ: typed.posXQ(),
          posYQ: typed.posYQ(),
          posZQ: typed.posZQ(),
          velXQ: typed.velXQ(),
          velYQ: typed.velYQ(),
          velZQ: typed.velZQ(),
          ttlQ: typed.ttlQ()
        });
        break;
      }
      case FxEventType.ProjectileImpactFx: {
        const typed = event as ProjectileImpactFx;
        const targetId = typed.targetId() ?? undefined;
        events.push({
          type: 'ProjectileImpactFx',
          projectileId: typed.projectileId(),
          hitWorld: typed.hitWorld(),
          targetId: targetId && targetId.length > 0 ? targetId : undefined,
          posXQ: typed.posXQ(),
          posYQ: typed.posYQ(),
          posZQ: typed.posZQ(),
          normalOctX: typed.normalOctX(),
          normalOctY: typed.normalOctY(),
          surfaceType: typed.surfaceType()
        });
        break;
      }
      case FxEventType.ProjectileRemoveFx: {
        const typed = event as ProjectileRemoveFx;
        events.push({
          type: 'ProjectileRemoveFx',
          projectileId: typed.projectileId()
        });
        break;
      }
      case FxEventType.PickupSpawnedFx: {
        const typed = event as PickupSpawnedFx;
        events.push({
          type: 'PickupSpawnedFx',
          pickupId: typed.pickupId() >>> 0,
          kind: typed.kind(),
          posXQ: typed.posXQ(),
          posYQ: typed.posYQ(),
          posZQ: typed.posZQ(),
          weaponSlot: typed.weaponSlot(),
          amount: typed.amount()
        });
        break;
      }
      case FxEventType.PickupTakenFx: {
        const typed = event as PickupTakenFx;
        const takerId = typed.takerId() ?? undefined;
        events.push({
          type: 'PickupTakenFx',
          pickupId: typed.pickupId() >>> 0,
          takerId: takerId && takerId.length > 0 ? takerId : undefined,
          serverTick: typed.serverTick()
        });
        break;
      }
    }
  }
  return { type: 'GameEventBatch', serverTick, events };
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

export const parseGameEvent = (data: ArrayBuffer | Uint8Array): GameEventBatch | null => {
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

export { MessageType, FxEventType, HitKind, SurfaceType, PickupKind };
