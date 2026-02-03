import { describe, expect, it } from 'vitest';
import * as flatbuffers from 'flatbuffers';
import {
  buildClientHello,
  buildPing,
  decodeEnvelope,
  encodeEnvelope,
  parseGameEvent,
  parseGameEventPayload,
  parsePlayerProfilePayload,
  parsePlayerProfile,
  parsePongPayload,
  parsePong,
  parseProtocolError,
  parseErrorPayload,
  parseServerHello,
  parseServerHelloPayload,
  parseSnapshotMessage,
  parseStateSnapshot,
  parseStateSnapshotPayload,
  parseStateSnapshotDelta,
  parseStateSnapshotDeltaPayload,
  MessageType,
  PROTOCOL_VERSION,
  __test,
  SNAPSHOT_MASK_POS_X,
  SNAPSHOT_MASK_POS_Y,
  SNAPSHOT_MASK_POS_Z,
  SNAPSHOT_MASK_VEL_X,
  SNAPSHOT_MASK_VEL_Y,
  SNAPSHOT_MASK_VEL_Z,
  SNAPSHOT_MASK_DASH_COOLDOWN,
  SNAPSHOT_MASK_HEALTH,
  SNAPSHOT_MASK_KILLS,
  SNAPSHOT_MASK_DEATHS,
  SNAPSHOT_MASK_WEAPON_SLOT
} from '../../src/net/protocol';
import { ClientHello } from '../../src/net/fbs/afps/protocol/client-hello';
import { Error as ErrorMessage } from '../../src/net/fbs/afps/protocol/error';
import { GameEvent } from '../../src/net/fbs/afps/protocol/game-event';
import { GameEventType } from '../../src/net/fbs/afps/protocol/game-event-type';
import { PlayerProfile } from '../../src/net/fbs/afps/protocol/player-profile';
import { Pong } from '../../src/net/fbs/afps/protocol/pong';
import { ServerHello } from '../../src/net/fbs/afps/protocol/server-hello';
import { StateSnapshot } from '../../src/net/fbs/afps/protocol/state-snapshot';
import { StateSnapshotDelta } from '../../src/net/fbs/afps/protocol/state-snapshot-delta';

describe('protocol helpers', () => {
  it('builds ClientHello envelope', () => {
    const payload = buildClientHello('session', 'conn', 'build-1', { nickname: 'Ada', characterId: 'casual-a' }, 1, 0);
    const decoded = decodeEnvelope(payload);
    expect(decoded?.header.msgType).toBe(MessageType.ClientHello);
    expect(decoded?.header.protocolVersion).toBe(PROTOCOL_VERSION);

    const bb = new flatbuffers.ByteBuffer(decoded!.payload);
    const message = ClientHello.getRootAsClientHello(bb);
    expect(message.protocolVersion()).toBe(PROTOCOL_VERSION);
    expect(message.sessionToken()).toBe('session');
    expect(message.connectionId()).toBe('conn');
    expect(message.build()).toBe('build-1');
    expect(message.nickname()).toBe('Ada');
    expect(message.characterId()).toBe('casual-a');
  });

  it('parses ServerHello envelope', () => {
    const builder = new flatbuffers.Builder(256);
    const connectionId = builder.createString('conn');
    const clientId = builder.createString('client');
    const motd = builder.createString('hi');
    const nonce = builder.createString('nonce');
    const offset = ServerHello.createServerHello(
      builder,
      PROTOCOL_VERSION,
      connectionId,
      clientId,
      60,
      20,
      5,
      motd,
      nonce
    );
    builder.finish(offset);
    const envelope = encodeEnvelope(MessageType.ServerHello, builder.asUint8Array(), 2, 1);

    const parsed = parseServerHello(envelope);
    expect(parsed).toEqual({
      type: 'ServerHello',
      protocolVersion: PROTOCOL_VERSION,
      connectionId: 'conn',
      serverTickRate: 60,
      snapshotRate: 20,
      snapshotKeyframeInterval: 5,
      motd: 'hi',
      clientId: 'client',
      connectionNonce: 'nonce'
    });
  });

  it('returns null for invalid ServerHello envelopes', () => {
    expect(parseServerHello(new Uint8Array([1, 2, 3]).buffer)).toBeNull();
    const builder = new flatbuffers.Builder(128);
    const offset = Pong.createPong(builder, 1.0);
    builder.finish(offset);
    const envelope = encodeEnvelope(MessageType.Pong, builder.asUint8Array(), 1, 0);
    expect(parseServerHello(envelope)).toBeNull();
  });

  it('parses PlayerProfile envelopes', () => {
    const builder = new flatbuffers.Builder(128);
    const clientId = builder.createString('client-1');
    const nickname = builder.createString('Ada');
    const characterId = builder.createString('casual-a');
    const offset = PlayerProfile.createPlayerProfile(builder, clientId, nickname, characterId);
    builder.finish(offset);
    const envelope = encodeEnvelope(MessageType.PlayerProfile, builder.asUint8Array(), 2, 0);

    expect(parsePlayerProfile(envelope)).toEqual({
      type: 'PlayerProfile',
      clientId: 'client-1',
      nickname: 'Ada',
      characterId: 'casual-a'
    });
  });

  it('parses StateSnapshot envelopes', () => {
    const builder = new flatbuffers.Builder(256);
    const clientId = builder.createString('client-1');
    const offset = StateSnapshot.createStateSnapshot(
      builder,
      12,
      7,
      clientId,
      1.25,
      -3,
      0.5,
      0.5,
      -0.25,
      0.1,
      1,
      0.4,
      75,
      2,
      1
    );
    builder.finish(offset);
    const envelope = encodeEnvelope(MessageType.StateSnapshot, builder.asUint8Array(), 3, 0);

    expect(parseStateSnapshot(envelope)).toEqual({
      type: 'StateSnapshot',
      serverTick: 12,
      lastProcessedInputSeq: 7,
      posX: 1.25,
      posY: -3,
      posZ: 0.5,
      velX: 0.5,
      velY: -0.25,
      velZ: 0.1,
      weaponSlot: 1,
      dashCooldown: 0.4,
      health: 75,
      kills: 2,
      deaths: 1,
      clientId: 'client-1'
    });
  });

  it('parses StateSnapshotDelta envelopes', () => {
    const builder = new flatbuffers.Builder(256);
    const clientId = builder.createString('client-1');
    const mask =
      SNAPSHOT_MASK_POS_X |
      SNAPSHOT_MASK_VEL_Y |
      SNAPSHOT_MASK_DASH_COOLDOWN |
      SNAPSHOT_MASK_HEALTH |
      SNAPSHOT_MASK_KILLS |
      SNAPSHOT_MASK_DEATHS;
    const offset = StateSnapshotDelta.createStateSnapshotDelta(
      builder,
      45,
      40,
      9,
      mask,
      clientId,
      1.75,
      0,
      0,
      0,
      -0.5,
      0,
      0,
      0.25,
      50,
      3,
      2
    );
    builder.finish(offset);
    const envelope = encodeEnvelope(MessageType.StateSnapshotDelta, builder.asUint8Array(), 4, 0);

    expect(parseStateSnapshotDelta(envelope)).toEqual({
      type: 'StateSnapshotDelta',
      serverTick: 45,
      baseTick: 40,
      lastProcessedInputSeq: 9,
      mask,
      posX: 1.75,
      velY: -0.5,
      dashCooldown: 0.25,
      health: 50,
      kills: 3,
      deaths: 2,
      clientId: 'client-1'
    });
  });

  it('parses all masked delta fields', () => {
    const builder = new flatbuffers.Builder(256);
    const clientId = builder.createString('client-1');
    const mask =
      SNAPSHOT_MASK_POS_X |
      SNAPSHOT_MASK_POS_Y |
      SNAPSHOT_MASK_POS_Z |
      SNAPSHOT_MASK_VEL_X |
      SNAPSHOT_MASK_VEL_Y |
      SNAPSHOT_MASK_VEL_Z |
      SNAPSHOT_MASK_WEAPON_SLOT |
      SNAPSHOT_MASK_DASH_COOLDOWN |
      SNAPSHOT_MASK_HEALTH |
      SNAPSHOT_MASK_KILLS |
      SNAPSHOT_MASK_DEATHS;
    const offset = StateSnapshotDelta.createStateSnapshotDelta(
      builder,
      50,
      45,
      10,
      mask,
      clientId,
      1,
      2,
      3,
      4,
      5,
      6,
      2,
      0.5,
      80,
      4,
      2
    );
    builder.finish(offset);
    const parsed = parseStateSnapshotDeltaPayload(builder.asUint8Array());
    expect(parsed).toEqual({
      type: 'StateSnapshotDelta',
      serverTick: 50,
      baseTick: 45,
      lastProcessedInputSeq: 10,
      mask,
      posX: 1,
      posY: 2,
      posZ: 3,
      velX: 4,
      velY: 5,
      velZ: 6,
      weaponSlot: 2,
      dashCooldown: 0.5,
      health: 80,
      kills: 4,
      deaths: 2,
      clientId: 'client-1'
    });
  });

  it('parses GameEvent envelopes', () => {
    const builder = new flatbuffers.Builder(256);
    const ownerId = builder.createString('owner-1');
    const offset = GameEvent.createGameEvent(
      builder,
      GameEventType.ProjectileSpawn,
      0,
      ownerId,
      9,
      0,
      false,
      1,
      2,
      3,
      4,
      5,
      6,
      0.5
    );
    builder.finish(offset);
    const envelope = encodeEnvelope(MessageType.GameEvent, builder.asUint8Array(), 5, 0);

    expect(parseGameEvent(envelope)).toEqual({
      type: 'GameEvent',
      event: 'ProjectileSpawn',
      ownerId: 'owner-1',
      projectileId: 9,
      posX: 1,
      posY: 2,
      posZ: 3,
      velX: 4,
      velY: 5,
      velZ: 6,
      ttl: 0.5
    });
  });

  it('parses hit confirmations without target ids', () => {
    const builder = new flatbuffers.Builder(128);
    const emptyTarget = builder.createString('');
    const offset = GameEvent.createGameEvent(
      builder,
      GameEventType.HitConfirmed,
      0,
      emptyTarget,
      0,
      4,
      false,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    );
    builder.finish(offset);
    const message = parseGameEventPayload(builder.asUint8Array());
    expect(message).toEqual({
      type: 'GameEvent',
      event: 'HitConfirmed',
      targetId: undefined,
      damage: 4,
      killed: false
    });
  });

  it('parses projectile events with optional ids', () => {
    const builder = new flatbuffers.Builder(256);
    const ownerId = builder.createString('owner-2');
    const offset = GameEvent.createGameEvent(
      builder,
      GameEventType.ProjectileSpawn,
      0,
      ownerId,
      0,
      0,
      false,
      1,
      2,
      3,
      4,
      5,
      6,
      1
    );
    builder.finish(offset);
    const payload = parseGameEventPayload(builder.asUint8Array());
    expect(payload).toEqual({
      type: 'GameEvent',
      event: 'ProjectileSpawn',
      ownerId: 'owner-2',
      projectileId: undefined,
      posX: 1,
      posY: 2,
      posZ: 3,
      velX: 4,
      velY: 5,
      velZ: 6,
      ttl: 1
    });

    const removeBuilder = new flatbuffers.Builder(64);
    const removeOwner = removeBuilder.createString('owner-2');
    const removeOffset = GameEvent.createGameEvent(
      removeBuilder,
      GameEventType.ProjectileRemove,
      0,
      removeOwner,
      99,
      0,
      false,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    );
    removeBuilder.finish(removeOffset);
    expect(parseGameEventPayload(removeBuilder.asUint8Array())).toEqual({
      type: 'GameEvent',
      event: 'ProjectileRemove',
      ownerId: 'owner-2',
      projectileId: 99
    });
  });

  it('rejects projectile removals without ids and owner names', () => {
    const builder = new flatbuffers.Builder(64);
    const offset = GameEvent.createGameEvent(
      builder,
      GameEventType.ProjectileRemove,
      0,
      0,
      0,
      0,
      false,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    );
    builder.finish(offset);
    expect(parseGameEventPayload(builder.asUint8Array())).toBeNull();

    const emptyOwnerBuilder = new flatbuffers.Builder(64);
    const emptyOwner = emptyOwnerBuilder.createString('');
    const emptyOffset = GameEvent.createGameEvent(
      emptyOwnerBuilder,
      GameEventType.ProjectileRemove,
      0,
      emptyOwner,
      7,
      0,
      false,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    );
    emptyOwnerBuilder.finish(emptyOffset);
    expect(parseGameEventPayload(emptyOwnerBuilder.asUint8Array())).toEqual({
      type: 'GameEvent',
      event: 'ProjectileRemove',
      ownerId: undefined,
      projectileId: 7
    });
  });

  it('returns null for unknown game event types', () => {
    const builder = new flatbuffers.Builder(64);
    const offset = GameEvent.createGameEvent(
      builder,
      999 as GameEventType,
      0,
      0,
      0,
      0,
      false,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    );
    builder.finish(offset);
    expect(parseGameEventPayload(builder.asUint8Array())).toBeNull();
  });

  it('parses pong envelopes', () => {
    const pong = buildPing(123.5, 1, 0);
    const decoded = decodeEnvelope(pong);
    expect(decoded?.header.msgType).toBe(MessageType.Ping);

    const builder = new flatbuffers.Builder(64);
    const offset = Pong.createPong(builder, 5.5);
    builder.finish(offset);
    const envelope = encodeEnvelope(MessageType.Pong, builder.asUint8Array(), 6, 0);

    expect(parsePong(envelope)).toEqual({ type: 'Pong', clientTimeMs: 5.5 });
  });

  it('clamps non-finite ping times', () => {
    const envelope = buildPing(Number.NaN, 2, 0);
    const decoded = decodeEnvelope(envelope);
    expect(decoded).not.toBeNull();
    if (!decoded) {
      return;
    }
    const bb = new flatbuffers.ByteBuffer(decoded.payload);
    const message = Pong.getRootAsPong(bb);
    expect(message.clientTimeMs()).toBe(0);
  });

  it('parseSnapshotMessage reads snapshot or delta', () => {
    const builder = new flatbuffers.Builder(128);
    const clientId = builder.createString('client-1');
    const offset = StateSnapshot.createStateSnapshot(
      builder,
      1,
      0,
      clientId,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      100,
      0,
      0
    );
    builder.finish(offset);
    const envelope = encodeEnvelope(MessageType.StateSnapshot, builder.asUint8Array(), 7, 0);
    const snapshot = parseSnapshotMessage(envelope);
    expect(snapshot?.type).toBe('StateSnapshot');

    const builderDelta = new flatbuffers.Builder(128);
    const deltaClientId = builderDelta.createString('client-1');
    const deltaOffset = StateSnapshotDelta.createStateSnapshotDelta(
      builderDelta,
      2,
      1,
      0,
      SNAPSHOT_MASK_POS_X,
      deltaClientId,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    );
    builderDelta.finish(deltaOffset);
    const envelopeDelta = encodeEnvelope(MessageType.StateSnapshotDelta, builderDelta.asUint8Array(), 8, 0);
    const delta = parseSnapshotMessage(envelopeDelta);
    expect(delta?.type).toBe('StateSnapshotDelta');
  });

  it('parses snapshots without client ids', () => {
    const builder = new flatbuffers.Builder(128);
    const offset = StateSnapshot.createStateSnapshot(
      builder,
      2,
      0,
      0,
      1,
      2,
      3,
      0,
      0,
      0,
      0,
      0,
      100,
      0,
      0
    );
    builder.finish(offset);
    const snapshot = parseStateSnapshotPayload(builder.asUint8Array());
    expect(snapshot?.clientId).toBeUndefined();
  });

  it('decodeEnvelope rejects malformed headers', () => {
    expect(decodeEnvelope(new Uint8Array([0x41, 0x46]))).toBeNull();

    const valid = buildPing(1, 1, 0);
    const wrongMagic = valid.slice();
    wrongMagic[0] = 0x00;
    expect(decodeEnvelope(wrongMagic)).toBeNull();

    const invalidType = valid.slice();
    const view = new DataView(invalidType.buffer, invalidType.byteOffset, invalidType.byteLength);
    view.setUint16(6, 0xffff, true);
    expect(decodeEnvelope(invalidType)).toBeNull();

    const badLength = valid.slice();
    const lengthView = new DataView(badLength.buffer, badLength.byteOffset, badLength.byteLength);
    lengthView.setUint32(8, 0, true);
    expect(decodeEnvelope(badLength)).toBeNull();
  });

  it('returns null for unsupported snapshot messages', () => {
    const ping = buildPing(1, 1, 0);
    expect(parseSnapshotMessage(ping)).toBeNull();
    expect(parseSnapshotMessage(new Uint8Array([1, 2, 3]).buffer)).toBeNull();
    expect(parseStateSnapshot(ping)).toBeNull();
    expect(parseStateSnapshotDelta(ping)).toBeNull();
  });

  it('returns null for non-game and non-error envelopes', () => {
    const ping = buildPing(1, 1, 0);
    expect(parseGameEvent(ping)).toBeNull();
    expect(parseProtocolError(ping)).toBeNull();
    expect(parsePlayerProfile(ping)).toBeNull();
    expect(parsePong(ping)).toBeNull();
  });

  it('rejects invalid protocol payloads', () => {
    const helloBuilder = new flatbuffers.Builder(128);
    const connectionId = helloBuilder.createString('');
    const clientId = helloBuilder.createString('client');
    const helloOffset = ServerHello.createServerHello(
      helloBuilder,
      0,
      connectionId,
      clientId,
      60,
      20,
      0,
      0,
      0
    );
    helloBuilder.finish(helloOffset);
    expect(parseServerHelloPayload(helloBuilder.asUint8Array())).toBeNull();

    const profileBuilder = new flatbuffers.Builder(128);
    const profileClient = profileBuilder.createString('client');
    const emptyNickname = profileBuilder.createString('');
    const profileChar = profileBuilder.createString('char');
    const profileOffset = PlayerProfile.createPlayerProfile(profileBuilder, profileClient, emptyNickname, profileChar);
    profileBuilder.finish(profileOffset);
    expect(parsePlayerProfilePayload(profileBuilder.asUint8Array())).toBeNull();

    const pongBuilder = new flatbuffers.Builder(64);
    const pongOffset = Pong.createPong(pongBuilder, Number.NaN);
    pongBuilder.finish(pongOffset);
    expect(parsePongPayload(pongBuilder.asUint8Array())).toBeNull();

    const snapshotBuilder = new flatbuffers.Builder(256);
    const snapshotClient = snapshotBuilder.createString('client');
    const snapshotOffset = StateSnapshot.createStateSnapshot(
      snapshotBuilder,
      -1,
      0,
      snapshotClient,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      100,
      0,
      0
    );
    snapshotBuilder.finish(snapshotOffset);
    expect(parseStateSnapshotPayload(snapshotBuilder.asUint8Array())).toBeNull();

    const nonFiniteSnapshotBuilder = new flatbuffers.Builder(256);
    const nonFiniteClient = nonFiniteSnapshotBuilder.createString('client');
    const nonFiniteSnapshotOffset = StateSnapshot.createStateSnapshot(
      nonFiniteSnapshotBuilder,
      1,
      0,
      nonFiniteClient,
      Number.NaN,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      100,
      0,
      0
    );
    nonFiniteSnapshotBuilder.finish(nonFiniteSnapshotOffset);
    expect(parseStateSnapshotPayload(nonFiniteSnapshotBuilder.asUint8Array())).toBeNull();

    const deltaBuilder = new flatbuffers.Builder(256);
    const deltaClient = deltaBuilder.createString('client');
    const invalidMask = __test.SNAPSHOT_MASK_ALL | (1 << 20);
    const deltaOffset = StateSnapshotDelta.createStateSnapshotDelta(
      deltaBuilder,
      2,
      1,
      0,
      invalidMask,
      deltaClient,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    );
    deltaBuilder.finish(deltaOffset);
    expect(parseStateSnapshotDeltaPayload(deltaBuilder.asUint8Array())).toBeNull();

    const badDeltaBuilder = new flatbuffers.Builder(128);
    const badDeltaOffset = StateSnapshotDelta.createStateSnapshotDelta(
      badDeltaBuilder,
      -1,
      0,
      0,
      SNAPSHOT_MASK_POS_X,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    );
    badDeltaBuilder.finish(badDeltaOffset);
    expect(parseStateSnapshotDeltaPayload(badDeltaBuilder.asUint8Array())).toBeNull();

    const nonFiniteDeltaBuilder = new flatbuffers.Builder(128);
    const nonFiniteOffset = StateSnapshotDelta.createStateSnapshotDelta(
      nonFiniteDeltaBuilder,
      2,
      1,
      0,
      SNAPSHOT_MASK_POS_X,
      0,
      Number.NaN,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    );
    nonFiniteDeltaBuilder.finish(nonFiniteOffset);
    expect(parseStateSnapshotDeltaPayload(nonFiniteDeltaBuilder.asUint8Array())).toBeNull();

    const eventBuilder = new flatbuffers.Builder(128);
    const hitOffset = GameEvent.createGameEvent(
      eventBuilder,
      GameEventType.HitConfirmed,
      0,
      0,
      0,
      Number.NaN,
      false,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    );
    eventBuilder.finish(hitOffset);
    expect(parseGameEventPayload(eventBuilder.asUint8Array())).toBeNull();

    const spawnBuilder = new flatbuffers.Builder(128);
    const spawnOffset = GameEvent.createGameEvent(
      spawnBuilder,
      GameEventType.ProjectileSpawn,
      0,
      0,
      0,
      0,
      false,
      1,
      2,
      3,
      4,
      5,
      6,
      1
    );
    spawnBuilder.finish(spawnOffset);
    expect(parseGameEventPayload(spawnBuilder.asUint8Array())).toBeNull();

    const nonFiniteSpawnBuilder = new flatbuffers.Builder(128);
    const ownerId = nonFiniteSpawnBuilder.createString('owner');
    const nonFiniteSpawnOffset = GameEvent.createGameEvent(
      nonFiniteSpawnBuilder,
      GameEventType.ProjectileSpawn,
      0,
      ownerId,
      9,
      0,
      false,
      Number.NaN,
      2,
      3,
      4,
      5,
      6,
      1
    );
    nonFiniteSpawnBuilder.finish(nonFiniteSpawnOffset);
    expect(parseGameEventPayload(nonFiniteSpawnBuilder.asUint8Array())).toBeNull();

    const errorBuilder = new flatbuffers.Builder(64);
    const errorOffset = ErrorMessage.createError(errorBuilder, 0, 0);
    errorBuilder.finish(errorOffset);
    expect(parseErrorPayload(errorBuilder.asUint8Array())).toBeNull();
  });

  it('parses protocol error payloads', () => {
    const builder = new flatbuffers.Builder(64);
    const code = builder.createString('oops');
    const message = builder.createString('bad');
    const offset = ErrorMessage.createError(builder, code, message);
    builder.finish(offset);
    const envelope = encodeEnvelope(MessageType.Error, builder.asUint8Array(), 9, 0);

    expect(parseProtocolError(envelope)).toEqual({ type: 'Error', code: 'oops', message: 'bad' });
  });
});
