import { describe, expect, it } from 'vitest';
import * as flatbuffers from 'flatbuffers';
import {
  buildClientHello,
  buildPing,
  decodeEnvelope,
  encodeEnvelope,
  encodeFireWeaponRequest,
  encodeSetLoadoutRequest,
  parseErrorPayload,
  parseGameEvent,
  parseGameEventPayload,
  parsePlayerProfile,
  parsePlayerProfilePayload,
  parsePong,
  parsePongPayload,
  parseProtocolError,
  parseServerHello,
  parseServerHelloPayload,
  parseSnapshotMessage,
  parseStateSnapshot,
  parseStateSnapshotDelta,
  parseStateSnapshotDeltaPayload,
  parseStateSnapshotPayload,
  MessageType,
  PROTOCOL_VERSION,
  SNAPSHOT_MASK_AMMO_IN_MAG,
  SNAPSHOT_MASK_DASH_COOLDOWN,
  SNAPSHOT_MASK_DEATHS,
  SNAPSHOT_MASK_HEALTH,
  SNAPSHOT_MASK_KILLS,
  SNAPSHOT_MASK_LOADOUT_BITS,
  SNAPSHOT_MASK_PLAYER_FLAGS,
  SNAPSHOT_MASK_POS_X,
  SNAPSHOT_MASK_POS_Y,
  SNAPSHOT_MASK_POS_Z,
  SNAPSHOT_MASK_VEL_X,
  SNAPSHOT_MASK_VEL_Y,
  SNAPSHOT_MASK_VEL_Z,
  SNAPSHOT_MASK_VIEW_PITCH_Q,
  SNAPSHOT_MASK_VIEW_YAW_Q,
  SNAPSHOT_MASK_WEAPON_HEAT_Q,
  SNAPSHOT_MASK_WEAPON_SLOT
} from '../../src/net/protocol';
import { ClientHello } from '../../src/net/fbs/afps/protocol/client-hello';
import { Error as ErrorMessage } from '../../src/net/fbs/afps/protocol/error';
import { FireWeaponRequest } from '../../src/net/fbs/afps/protocol/fire-weapon-request';
import { FxEvent } from '../../src/net/fbs/afps/protocol/fx-event';
import { GameEventT } from '../../src/net/fbs/afps/protocol/game-event';
import { HitConfirmedFxT } from '../../src/net/fbs/afps/protocol/hit-confirmed-fx';
import { HitKind } from '../../src/net/fbs/afps/protocol/hit-kind';
import { NearMissFxT } from '../../src/net/fbs/afps/protocol/near-miss-fx';
import { OverheatFxT } from '../../src/net/fbs/afps/protocol/overheat-fx';
import { PlayerProfile } from '../../src/net/fbs/afps/protocol/player-profile';
import { Pong } from '../../src/net/fbs/afps/protocol/pong';
import { ProjectileImpactFxT } from '../../src/net/fbs/afps/protocol/projectile-impact-fx';
import { ProjectileRemoveFxT } from '../../src/net/fbs/afps/protocol/projectile-remove-fx';
import { ProjectileSpawnFxT } from '../../src/net/fbs/afps/protocol/projectile-spawn-fx';
import { ReloadFxT } from '../../src/net/fbs/afps/protocol/reload-fx';
import { ServerHello } from '../../src/net/fbs/afps/protocol/server-hello';
import { SetLoadoutRequest } from '../../src/net/fbs/afps/protocol/set-loadout-request';
import { ShotFiredFxT } from '../../src/net/fbs/afps/protocol/shot-fired-fx';
import { ShotTraceFxT } from '../../src/net/fbs/afps/protocol/shot-trace-fx';
import { StateSnapshot } from '../../src/net/fbs/afps/protocol/state-snapshot';
import { StateSnapshotDelta } from '../../src/net/fbs/afps/protocol/state-snapshot-delta';
import { SurfaceType } from '../../src/net/fbs/afps/protocol/surface-type';
import { VentFxT } from '../../src/net/fbs/afps/protocol/vent-fx';

const buildSnapshotPayload = (
  overrides: Partial<{
    serverTick: number;
    lastProcessedInputSeq: number;
    clientId: string;
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
  }> = {}
) => {
  const builder = new flatbuffers.Builder(256);
  const clientId = builder.createString(overrides.clientId ?? 'client-1');
  const offset = StateSnapshot.createStateSnapshot(
    builder,
    overrides.serverTick ?? 12,
    overrides.lastProcessedInputSeq ?? 7,
    clientId,
    overrides.posX ?? 1.25,
    overrides.posY ?? -3,
    overrides.posZ ?? 0.5,
    overrides.velX ?? 0.5,
    overrides.velY ?? -0.25,
    overrides.velZ ?? 0.1,
    overrides.weaponSlot ?? 1,
    overrides.ammoInMag ?? 24,
    overrides.dashCooldown ?? 0.4,
    overrides.health ?? 75,
    overrides.kills ?? 2,
    overrides.deaths ?? 1,
    overrides.viewYawQ ?? 123,
    overrides.viewPitchQ ?? -321,
    overrides.playerFlags ?? 7,
    overrides.weaponHeatQ ?? 900,
    overrides.loadoutBits ?? 0
  );
  builder.finish(offset);
  return builder.asUint8Array();
};

const buildDeltaPayload = (
  overrides: Partial<{
    serverTick: number;
    baseTick: number;
    lastProcessedInputSeq: number;
    mask: number;
    clientId: string;
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
  }>
) => {
  const builder = new flatbuffers.Builder(256);
  const clientId = builder.createString(overrides?.clientId ?? 'client-1');
  const offset = StateSnapshotDelta.createStateSnapshotDelta(
    builder,
    overrides?.serverTick ?? 45,
    overrides?.baseTick ?? 40,
    overrides?.lastProcessedInputSeq ?? 9,
    overrides?.mask ?? SNAPSHOT_MASK_POS_X,
    clientId,
    overrides?.posX ?? 0,
    overrides?.posY ?? 0,
    overrides?.posZ ?? 0,
    overrides?.velX ?? 0,
    overrides?.velY ?? 0,
    overrides?.velZ ?? 0,
    overrides?.weaponSlot ?? 0,
    overrides?.ammoInMag ?? 0,
    overrides?.dashCooldown ?? 0,
    overrides?.health ?? 0,
    overrides?.kills ?? 0,
    overrides?.deaths ?? 0,
    overrides?.viewYawQ ?? 0,
    overrides?.viewPitchQ ?? 0,
    overrides?.playerFlags ?? 0,
    overrides?.weaponHeatQ ?? 0,
    overrides?.loadoutBits ?? 0
  );
  builder.finish(offset);
  return builder.asUint8Array();
};

const buildGameEventPayload = () => {
  const builder = new flatbuffers.Builder(512);

  const types: FxEvent[] = [
    FxEvent.NONE,
    250 as FxEvent,
    FxEvent.ShotFiredFx,
    FxEvent.ShotTraceFx,
    FxEvent.ReloadFx,
    FxEvent.NearMissFx,
    FxEvent.OverheatFx,
    FxEvent.VentFx,
    FxEvent.HitConfirmedFx,
    FxEvent.ProjectileSpawnFx,
    FxEvent.ProjectileImpactFx,
    FxEvent.ProjectileImpactFx,
    FxEvent.ProjectileRemoveFx
  ];

  const events = [
    new ShotFiredFxT('ignored', 0, 0, false),
    new ShotFiredFxT('ignored', 0, 0, false),
    new ShotFiredFxT('shooter-1', 1, 42, false),
    new ShotTraceFxT(
      'shooter-1',
      1,
      42,
      123,
      -321,
      77,
      HitKind.World,
      SurfaceType.Metal,
      5,
      6,
      true
    ),
    new ReloadFxT('shooter-1', 1),
    new NearMissFxT('shooter-2', 7, 200),
    new OverheatFxT('shooter-3', 0, 999),
    new VentFxT('shooter-3', 0),
    new HitConfirmedFxT('target-1', 5.5, true),
    new ProjectileSpawnFxT('shooter-4', 0, 9, 33, 1, 2, 3, 4, 5, 6, 50),
    new ProjectileImpactFxT(33, true, '', 10, 11, 12, -123, 456, SurfaceType.Stone),
    new ProjectileImpactFxT(34, false, 'target-2', 20, 21, 22, 222, -333, SurfaceType.Dirt),
    new ProjectileRemoveFxT(33)
  ];

  const payload = new GameEventT(123, types, events as never).pack(builder);
  builder.finish(payload);
  return builder.asUint8Array();
};

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

  it('parses ServerHello payloads with optional fields missing', () => {
    const builder = new flatbuffers.Builder(256);
    const connectionId = builder.createString('conn');
    const offset = ServerHello.createServerHello(
      builder,
      PROTOCOL_VERSION,
      connectionId,
      0,
      60,
      20,
      0,
      0,
      0
    );
    builder.finish(offset);

    expect(parseServerHelloPayload(builder.asUint8Array())).toEqual({
      type: 'ServerHello',
      protocolVersion: PROTOCOL_VERSION,
      connectionId: 'conn',
      serverTickRate: 60,
      snapshotRate: 20,
      snapshotKeyframeInterval: 0,
      motd: undefined,
      clientId: undefined,
      connectionNonce: undefined
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
    const payload = buildSnapshotPayload({
      serverTick: 12,
      lastProcessedInputSeq: 7,
      clientId: 'client-1',
      viewYawQ: 444,
      viewPitchQ: -555,
      playerFlags: 3,
      weaponHeatQ: 250,
      loadoutBits: 123
    });
    const envelope = encodeEnvelope(MessageType.StateSnapshot, payload, 3, 0);

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
      ammoInMag: 24,
      dashCooldown: 0.4,
      health: 75,
      kills: 2,
      deaths: 1,
      viewYawQ: 444,
      viewPitchQ: -555,
      playerFlags: 3,
      weaponHeatQ: 250,
      loadoutBits: 123,
      clientId: 'client-1'
    });
  });

  it('parses StateSnapshotDelta envelopes', () => {
    const mask =
      SNAPSHOT_MASK_POS_X |
      SNAPSHOT_MASK_VEL_Y |
      SNAPSHOT_MASK_AMMO_IN_MAG |
      SNAPSHOT_MASK_DASH_COOLDOWN |
      SNAPSHOT_MASK_HEALTH |
      SNAPSHOT_MASK_KILLS |
      SNAPSHOT_MASK_DEATHS;
    const payload = buildDeltaPayload({
      serverTick: 45,
      baseTick: 40,
      lastProcessedInputSeq: 9,
      mask,
      clientId: 'client-1',
      posX: 1.75,
      velY: -0.5,
      ammoInMag: 19,
      dashCooldown: 0.25,
      health: 50,
      kills: 3,
      deaths: 2
    });
    const envelope = encodeEnvelope(MessageType.StateSnapshotDelta, payload, 4, 0);

    expect(parseStateSnapshotDelta(envelope)).toEqual({
      type: 'StateSnapshotDelta',
      serverTick: 45,
      baseTick: 40,
      lastProcessedInputSeq: 9,
      mask,
      posX: 1.75,
      velY: -0.5,
      ammoInMag: 19,
      dashCooldown: 0.25,
      health: 50,
      kills: 3,
      deaths: 2,
      clientId: 'client-1'
    });
  });

  it('parses all masked delta fields', () => {
    const mask =
      SNAPSHOT_MASK_POS_X |
      SNAPSHOT_MASK_POS_Y |
      SNAPSHOT_MASK_POS_Z |
      SNAPSHOT_MASK_VEL_X |
      SNAPSHOT_MASK_VEL_Y |
      SNAPSHOT_MASK_VEL_Z |
      SNAPSHOT_MASK_WEAPON_SLOT |
      SNAPSHOT_MASK_AMMO_IN_MAG |
      SNAPSHOT_MASK_DASH_COOLDOWN |
      SNAPSHOT_MASK_HEALTH |
      SNAPSHOT_MASK_KILLS |
      SNAPSHOT_MASK_DEATHS |
      SNAPSHOT_MASK_VIEW_YAW_Q |
      SNAPSHOT_MASK_VIEW_PITCH_Q |
      SNAPSHOT_MASK_PLAYER_FLAGS |
      SNAPSHOT_MASK_WEAPON_HEAT_Q |
      SNAPSHOT_MASK_LOADOUT_BITS;

    const payload = buildDeltaPayload({
      serverTick: 50,
      baseTick: 45,
      lastProcessedInputSeq: 10,
      mask,
      clientId: 'client-1',
      posX: 1,
      posY: 2,
      posZ: 3,
      velX: 4,
      velY: 5,
      velZ: 6,
      weaponSlot: 2,
      ammoInMag: 21,
      dashCooldown: 0.5,
      health: 80,
      kills: 4,
      deaths: 2,
      viewYawQ: 777,
      viewPitchQ: -888,
      playerFlags: 5,
      weaponHeatQ: 123,
      loadoutBits: 9
    });

    const parsed = parseStateSnapshotDeltaPayload(payload);
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
      ammoInMag: 21,
      dashCooldown: 0.5,
      health: 80,
      kills: 4,
      deaths: 2,
      viewYawQ: 777,
      viewPitchQ: -888,
      playerFlags: 5,
      weaponHeatQ: 123,
      loadoutBits: 9,
      clientId: 'client-1'
    });
  });

  it('parses delta payloads with no optional fields set', () => {
    const payload = buildDeltaPayload({
      serverTick: 51,
      baseTick: 50,
      lastProcessedInputSeq: 0,
      mask: 0,
      clientId: ''
    });

    expect(parseStateSnapshotDeltaPayload(payload)).toEqual({
      type: 'StateSnapshotDelta',
      serverTick: 51,
      baseTick: 50,
      lastProcessedInputSeq: 0,
      mask: 0
    });
  });

  it('parses GameEvent envelopes', () => {
    const payload = buildGameEventPayload();
    const envelope = encodeEnvelope(MessageType.GameEvent, payload, 5, 0);

    expect(parseGameEvent(envelope)).toEqual({
      type: 'GameEventBatch',
      serverTick: 123,
      events: [
        {
          type: 'ShotFiredFx',
          shooterId: 'shooter-1',
          weaponSlot: 1,
          shotSeq: 42,
          dryFire: false
        },
        {
          type: 'ShotTraceFx',
          shooterId: 'shooter-1',
          weaponSlot: 1,
          shotSeq: 42,
          dirOctX: 123,
          dirOctY: -321,
          hitDistQ: 77,
          hitKind: HitKind.World,
          surfaceType: SurfaceType.Metal,
          normalOctX: 5,
          normalOctY: 6,
          showTracer: true
        },
        { type: 'ReloadFx', shooterId: 'shooter-1', weaponSlot: 1 },
        { type: 'NearMissFx', shooterId: 'shooter-2', shotSeq: 7, strength: 200 },
        { type: 'OverheatFx', shooterId: 'shooter-3', weaponSlot: 0, heatQ: 999 },
        { type: 'VentFx', shooterId: 'shooter-3', weaponSlot: 0 },
        { type: 'HitConfirmedFx', targetId: 'target-1', damage: 5.5, killed: true },
        {
          type: 'ProjectileSpawnFx',
          shooterId: 'shooter-4',
          weaponSlot: 0,
          shotSeq: 9,
          projectileId: 33,
          posXQ: 1,
          posYQ: 2,
          posZQ: 3,
          velXQ: 4,
          velYQ: 5,
          velZQ: 6,
          ttlQ: 50
        },
        {
          type: 'ProjectileImpactFx',
          projectileId: 33,
          hitWorld: true,
          targetId: undefined,
          posXQ: 10,
          posYQ: 11,
          posZQ: 12,
          normalOctX: -123,
          normalOctY: 456,
          surfaceType: SurfaceType.Stone
        },
        {
          type: 'ProjectileImpactFx',
          projectileId: 34,
          hitWorld: false,
          targetId: 'target-2',
          posXQ: 20,
          posYQ: 21,
          posZQ: 22,
          normalOctX: 222,
          normalOctY: -333,
          surfaceType: SurfaceType.Dirt
        },
        { type: 'ProjectileRemoveFx', projectileId: 33 }
      ]
    });
  });

  it('parses projectile impacts with missing target ids', () => {
    const builder = new flatbuffers.Builder(128);
    const payload = new GameEventT(
      1,
      [FxEvent.ProjectileImpactFx],
      [new ProjectileImpactFxT(1, true, null as unknown as string, 1, 2, 3, 4, 5, SurfaceType.Stone)] as never
    ).pack(builder);
    builder.finish(payload);

    const parsed = parseGameEventPayload(builder.asUint8Array());
    expect(parsed?.events[0]).toEqual(
      expect.objectContaining({
        type: 'ProjectileImpactFx',
        targetId: undefined
      })
    );
  });

  it('parses pong envelopes', () => {
    const ping = buildPing(123.5, 1, 0);
    const decoded = decodeEnvelope(ping);
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
    const snapshotEnvelope = encodeEnvelope(MessageType.StateSnapshot, buildSnapshotPayload({ serverTick: 1 }), 7, 0);
    expect(parseSnapshotMessage(snapshotEnvelope)?.type).toBe('StateSnapshot');

    const deltaEnvelope = encodeEnvelope(
      MessageType.StateSnapshotDelta,
      buildDeltaPayload({ serverTick: 2, baseTick: 1, mask: SNAPSHOT_MASK_POS_X, posX: 1 }),
      8,
      0
    );
    expect(parseSnapshotMessage(deltaEnvelope)?.type).toBe('StateSnapshotDelta');
  });

  it('parses snapshots without client ids', () => {
    const snapshot = parseStateSnapshotPayload(buildSnapshotPayload({ clientId: '' }));
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
    const helloOffset = ServerHello.createServerHello(helloBuilder, 0, connectionId, clientId, 60, 20, 0, 0, 0);
    helloBuilder.finish(helloOffset);
    expect(parseServerHelloPayload(helloBuilder.asUint8Array())).toBeNull();

    const profileBuilder = new flatbuffers.Builder(128);
    const profileClient = profileBuilder.createString('client');
    const emptyNickname = profileBuilder.createString('');
    const profileChar = profileBuilder.createString('char');
    const profileOffset = PlayerProfile.createPlayerProfile(profileBuilder, profileClient, emptyNickname, profileChar);
    profileBuilder.finish(profileOffset);
    expect(parsePlayerProfilePayload(profileBuilder.asUint8Array())).toBeNull();

    const profileValidBuilder = new flatbuffers.Builder(128);
    const validClient = profileValidBuilder.createString('client-123');
    const validNickname = profileValidBuilder.createString('Player');
    const validChar = profileValidBuilder.createString('char-abc');
    const validProfileOffset = PlayerProfile.createPlayerProfile(
      profileValidBuilder,
      validClient,
      validNickname,
      validChar
    );
    profileValidBuilder.finish(validProfileOffset);
    expect(parsePlayerProfilePayload(profileValidBuilder.asUint8Array())).toEqual({
      type: 'PlayerProfile',
      clientId: 'client-123',
      nickname: 'Player',
      characterId: 'char-abc'
    });

    const pongBuilder = new flatbuffers.Builder(64);
    const pongOffset = Pong.createPong(pongBuilder, Number.NaN);
    pongBuilder.finish(pongOffset);
    expect(parsePongPayload(pongBuilder.asUint8Array())).toBeNull();

    expect(parseStateSnapshotPayload(buildSnapshotPayload({ serverTick: -1 }))).toBeNull();
    expect(parseStateSnapshotPayload(buildSnapshotPayload({ posX: Number.NaN }))).toBeNull();

    const invalidDelta = parseStateSnapshotDeltaPayload(
      buildDeltaPayload({
        serverTick: 1,
        baseTick: 0,
        mask: 1 << 30
      })
    );
    expect(invalidDelta).toBeNull();

    expect(
      parseStateSnapshotDeltaPayload(
        buildDeltaPayload({
          serverTick: -1,
          baseTick: 0,
          lastProcessedInputSeq: 0,
          mask: 0
        })
      )
    ).toBeNull();

    expect(
      parseStateSnapshotDeltaPayload(
        buildDeltaPayload({
          serverTick: 1,
          baseTick: -1,
          lastProcessedInputSeq: 0,
          mask: 0
        })
      )
    ).toBeNull();

    expect(
      parseStateSnapshotDeltaPayload(
        buildDeltaPayload({
          serverTick: 1,
          baseTick: 0,
          lastProcessedInputSeq: -2,
          mask: 0
        })
      )
    ).toBeNull();

    expect(
      parseStateSnapshotDeltaPayload(
        buildDeltaPayload({
          serverTick: 1,
          baseTick: 0,
          mask: SNAPSHOT_MASK_POS_X,
          posX: Number.NaN
        })
      )
    ).toBeNull();

    const eventBadTickBuilder = new flatbuffers.Builder(128);
    const badTickPayload = new GameEventT( -1, [FxEvent.ShotFiredFx], [new ShotFiredFxT('shooter', 0, 1, false)] as never).pack(eventBadTickBuilder);
    eventBadTickBuilder.finish(badTickPayload);
    expect(parseGameEventPayload(eventBadTickBuilder.asUint8Array())).toBeNull();

    const badEventBuilder = new flatbuffers.Builder(128);
    const badEventPayload = new GameEventT(
      0,
      [FxEvent.ShotFiredFx],
      [new ShotFiredFxT('', 0, 1, false)] as never
    ).pack(badEventBuilder);
    badEventBuilder.finish(badEventPayload);
    expect(parseGameEventPayload(badEventBuilder.asUint8Array())).toBeNull();

    const badDamageBuilder = new flatbuffers.Builder(128);
    const badDamagePayload = new GameEventT(
      0,
      [FxEvent.HitConfirmedFx],
      [new HitConfirmedFxT('target', Number.NaN, false)] as never
    ).pack(badDamageBuilder);
    badDamageBuilder.finish(badDamagePayload);
    expect(parseGameEventPayload(badDamageBuilder.asUint8Array())).toBeNull();

    const badTraceBuilder = new flatbuffers.Builder(128);
    const badTracePayload = new GameEventT(
      0,
      [FxEvent.ShotTraceFx],
      [new ShotTraceFxT(null, 0, 0, 0, 0, 0, HitKind.None, SurfaceType.Stone, 0, 0, false)] as never
    ).pack(badTraceBuilder);
    badTraceBuilder.finish(badTracePayload);
    expect(parseGameEventPayload(badTraceBuilder.asUint8Array())).toBeNull();

    const badReloadBuilder = new flatbuffers.Builder(128);
    const badReloadPayload = new GameEventT(0, [FxEvent.ReloadFx], [new ReloadFxT(null, 0)] as never).pack(
      badReloadBuilder
    );
    badReloadBuilder.finish(badReloadPayload);
    expect(parseGameEventPayload(badReloadBuilder.asUint8Array())).toBeNull();

    const badNearMissBuilder = new flatbuffers.Builder(128);
    const badNearMissPayload = new GameEventT(0, [FxEvent.NearMissFx], [new NearMissFxT(null, 0, 0)] as never).pack(
      badNearMissBuilder
    );
    badNearMissBuilder.finish(badNearMissPayload);
    expect(parseGameEventPayload(badNearMissBuilder.asUint8Array())).toBeNull();

    const badOverheatBuilder = new flatbuffers.Builder(128);
    const badOverheatPayload = new GameEventT(0, [FxEvent.OverheatFx], [new OverheatFxT(null, 0, 0)] as never).pack(
      badOverheatBuilder
    );
    badOverheatBuilder.finish(badOverheatPayload);
    expect(parseGameEventPayload(badOverheatBuilder.asUint8Array())).toBeNull();

    const badVentBuilder = new flatbuffers.Builder(128);
    const badVentPayload = new GameEventT(0, [FxEvent.VentFx], [new VentFxT(null, 0)] as never).pack(badVentBuilder);
    badVentBuilder.finish(badVentPayload);
    expect(parseGameEventPayload(badVentBuilder.asUint8Array())).toBeNull();

    const badProjectileBuilder = new flatbuffers.Builder(256);
    const badProjectilePayload = new GameEventT(
      0,
      [FxEvent.ProjectileSpawnFx],
      [new ProjectileSpawnFxT(null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)] as never
    ).pack(badProjectileBuilder);
    badProjectileBuilder.finish(badProjectilePayload);
    expect(parseGameEventPayload(badProjectileBuilder.asUint8Array())).toBeNull();

    const errorBuilder = new flatbuffers.Builder(64);
    const errorOffset = ErrorMessage.createError(errorBuilder, 0, 0);
    errorBuilder.finish(errorOffset);
    expect(parseErrorPayload(errorBuilder.asUint8Array())).toBeNull();
  });

  it('builds FireWeaponRequest envelopes', () => {
    const envelope = encodeFireWeaponRequest(
      {
        type: 'FireWeaponRequest',
        clientShotSeq: 7,
        weaponId: 'rifle',
        weaponSlot: 1,
        originX: 1,
        originY: 2,
        originZ: 3,
        dirX: 0.1,
        dirY: 0.2,
        dirZ: 0.3
      },
      12,
      3
    );
    const decoded = decodeEnvelope(envelope);
    expect(decoded?.header.msgType).toBe(MessageType.FireWeaponRequest);
    const message = FireWeaponRequest.getRootAsFireWeaponRequest(new flatbuffers.ByteBuffer(decoded!.payload));
    expect(message.clientShotSeq()).toBe(7);
    expect(message.weaponId()).toBe('rifle');
    expect(message.weaponSlot()).toBe(1);
    expect(message.originX()).toBeCloseTo(1);
    expect(message.originY()).toBeCloseTo(2);
    expect(message.originZ()).toBeCloseTo(3);
  });

  it('builds FireWeaponRequest envelopes without weapon ids', () => {
    const envelope = encodeFireWeaponRequest(
      {
        type: 'FireWeaponRequest',
        clientShotSeq: 9,
        weaponSlot: 0,
        originX: 0,
        originY: 0,
        originZ: 0,
        dirX: 1,
        dirY: 0,
        dirZ: 0
      },
      1,
      0
    );

    const decoded = decodeEnvelope(envelope);
    const message = FireWeaponRequest.getRootAsFireWeaponRequest(new flatbuffers.ByteBuffer(decoded!.payload));
    expect(message.weaponId()).toBeNull();
  });

  it('builds SetLoadoutRequest envelopes', () => {
    const envelope = encodeSetLoadoutRequest(0xdeadbeef, 9, 7);
    const decoded = decodeEnvelope(envelope);
    expect(decoded?.header.msgType).toBe(MessageType.SetLoadoutRequest);

    const message = SetLoadoutRequest.getRootAsSetLoadoutRequest(new flatbuffers.ByteBuffer(decoded!.payload));
    expect(message.loadoutBits()).toBe(0xdeadbeef);
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
