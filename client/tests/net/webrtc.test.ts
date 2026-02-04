import { describe, expect, it, vi } from 'vitest';
import * as flatbuffers from 'flatbuffers';
import { createWebRtcConnector } from '../../src/net/webrtc';
import {
  decodeEnvelope,
  encodeEnvelope,
  MessageType,
  PROTOCOL_VERSION,
  SNAPSHOT_MASK_POS_X,
  SNAPSHOT_MASK_VEL_Y,
  SNAPSHOT_MASK_AMMO_IN_MAG
} from '../../src/net/protocol';
import { FakeDataChannel, FakePeerConnection, FakePeerConnectionFactory, FakeSignalingClient } from './fakes';
import { ClientHello } from '../../src/net/fbs/afps/protocol/client-hello';
import { GameEvent } from '../../src/net/fbs/afps/protocol/game-event';
import { GameEventType } from '../../src/net/fbs/afps/protocol/game-event-type';
import { PlayerProfile } from '../../src/net/fbs/afps/protocol/player-profile';
import { Pong } from '../../src/net/fbs/afps/protocol/pong';
import { ServerHello } from '../../src/net/fbs/afps/protocol/server-hello';
import { StateSnapshot } from '../../src/net/fbs/afps/protocol/state-snapshot';
import { StateSnapshotDelta } from '../../src/net/fbs/afps/protocol/state-snapshot-delta';
import { WeaponFiredEvent as WeaponFiredEventFbs } from '../../src/net/fbs/afps/protocol/weapon-fired-event';
import { WeaponReloadEvent as WeaponReloadEventFbs } from '../../src/net/fbs/afps/protocol/weapon-reload-event';

const createTimers = () => ({
  setInterval: (callback: () => void, ms: number) => window.setInterval(callback, ms),
  clearInterval: (id: number) => window.clearInterval(id),
  setTimeout: (callback: () => void, ms: number) => window.setTimeout(callback, ms),
  clearTimeout: (id: number) => window.clearTimeout(id)
});

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {}
};

const waitForPeer = async (factory: FakePeerConnectionFactory) => {
  for (let i = 0; i < 5 && !factory.last; i += 1) {
    await Promise.resolve();
  }
  if (!factory.last) {
    throw new Error('peer not created');
  }
  return factory.last;
};

const buildServerHello = (
  connectionId: string,
  overrides: Partial<{
    protocolVersion: number;
    serverTickRate: number;
    snapshotRate: number;
    snapshotKeyframeInterval: number;
    msgSeq: number;
  }> = {}
) => {
  const builder = new flatbuffers.Builder(256);
  const connectionOffset = builder.createString(connectionId);
  const clientOffset = builder.createString(connectionId);
  const offset = ServerHello.createServerHello(
    builder,
    overrides.protocolVersion ?? PROTOCOL_VERSION,
    connectionOffset,
    clientOffset,
    overrides.serverTickRate ?? 60,
    overrides.snapshotRate ?? 20,
    overrides.snapshotKeyframeInterval ?? 5,
    0,
    0
  );
  builder.finish(offset);
  return encodeEnvelope(MessageType.ServerHello, builder.asUint8Array(), overrides.msgSeq ?? 1, 0);
};

const buildStateSnapshot = (snapshot: {
  serverTick: number;
  lastProcessedInputSeq: number;
  posX: number;
  posY: number;
  posZ: number;
  velX: number;
  velY: number;
  velZ: number;
  weaponSlot: number;
  ammoInMag?: number;
  dashCooldown: number;
  health: number;
  kills: number;
  deaths: number;
  clientId?: string;
}, msgSeq = 2) => {
  const builder = new flatbuffers.Builder(256);
  const clientId = builder.createString(snapshot.clientId ?? '');
  const offset = StateSnapshot.createStateSnapshot(
    builder,
    snapshot.serverTick,
    snapshot.lastProcessedInputSeq,
    clientId,
    snapshot.posX,
    snapshot.posY,
    snapshot.posZ,
    snapshot.velX,
    snapshot.velY,
    snapshot.velZ,
    snapshot.weaponSlot,
    snapshot.ammoInMag ?? 0,
    snapshot.dashCooldown,
    snapshot.health,
    snapshot.kills,
    snapshot.deaths
  );
  builder.finish(offset);
  return encodeEnvelope(MessageType.StateSnapshot, builder.asUint8Array(), msgSeq, 0);
};

const buildStateSnapshotDelta = (delta: {
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
  clientId?: string;
}, msgSeq = 3) => {
  const builder = new flatbuffers.Builder(256);
  const clientId = builder.createString(delta.clientId ?? '');
  const offset = StateSnapshotDelta.createStateSnapshotDelta(
    builder,
    delta.serverTick,
    delta.baseTick,
    delta.lastProcessedInputSeq,
    delta.mask,
    clientId,
    delta.posX ?? 0,
    delta.posY ?? 0,
    delta.posZ ?? 0,
    delta.velX ?? 0,
    delta.velY ?? 0,
    delta.velZ ?? 0,
    delta.weaponSlot ?? 0,
    delta.ammoInMag ?? 0,
    delta.dashCooldown ?? 0,
    delta.health ?? 0,
    delta.kills ?? 0,
    delta.deaths ?? 0
  );
  builder.finish(offset);
  return encodeEnvelope(MessageType.StateSnapshotDelta, builder.asUint8Array(), msgSeq, 0);
};

const buildPlayerProfile = (profile: { clientId: string; nickname: string; characterId: string }, msgSeq = 2) => {
  const builder = new flatbuffers.Builder(128);
  const clientId = builder.createString(profile.clientId);
  const nickname = builder.createString(profile.nickname);
  const characterId = builder.createString(profile.characterId);
  const offset = PlayerProfile.createPlayerProfile(builder, clientId, nickname, characterId);
  builder.finish(offset);
  return encodeEnvelope(MessageType.PlayerProfile, builder.asUint8Array(), msgSeq, 0);
};

const buildGameEventProjectileSpawn = (msgSeq = 4) => {
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
  return encodeEnvelope(MessageType.GameEvent, builder.asUint8Array(), msgSeq, 0);
};

const buildGameEventHitConfirmed = (msgSeq = 6) => {
  const builder = new flatbuffers.Builder(128);
  const offset = GameEvent.createGameEvent(
    builder,
    GameEventType.HitConfirmed,
    0,
    0,
    0,
    5.5,
    true,
    0,
    0,
    0,
    0,
    0,
    0,
    0
  );
  builder.finish(offset);
  return encodeEnvelope(MessageType.GameEvent, builder.asUint8Array(), msgSeq, 0);
};

const buildPong = (clientTimeMs: number, msgSeq = 5) => {
  const builder = new flatbuffers.Builder(64);
  const offset = Pong.createPong(builder, clientTimeMs);
  builder.finish(offset);
  return encodeEnvelope(MessageType.Pong, builder.asUint8Array(), msgSeq, 0);
};

const buildWeaponFiredEvent = (msgSeq = 7) => {
  const builder = new flatbuffers.Builder(256);
  const shooter = builder.createString('shooter');
  const weapon = builder.createString('rifle');
  const offset = WeaponFiredEventFbs.createWeaponFiredEvent(
    builder,
    shooter,
    weapon,
    0,
    10,
    2,
    1,
    2,
    3,
    0.1,
    0.2,
    0.3,
    false,
    false,
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
    0,
    0
  );
  builder.finish(offset);
  return encodeEnvelope(MessageType.WeaponFiredEvent, builder.asUint8Array(), msgSeq, 0);
};

const buildWeaponReloadEvent = (msgSeq = 8) => {
  const builder = new flatbuffers.Builder(128);
  const shooter = builder.createString('shooter');
  const weapon = builder.createString('rifle');
  const offset = WeaponReloadEventFbs.createWeaponReloadEvent(builder, shooter, weapon, 0, 10, 0.9);
  builder.finish(offset);
  return encodeEnvelope(MessageType.WeaponReloadEvent, builder.asUint8Array(), msgSeq, 0);
};

describe('webrtc connector', () => {
  it('connects and sends ClientHello', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const rtcFactory = new FakePeerConnectionFactory();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: silentLogger,
      pollIntervalMs: 100,
      connectTimeoutMs: 1000,
      timers: createTimers()
    });

    const connectPromise = connector.connect();
    const pc = await waitForPeer(rtcFactory);

    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    await Promise.resolve();
    reliable.emitMessage(new ArrayBuffer(4));
    reliable.emitMessage(buildServerHello(signaling.connectionId));

    const session = await connectPromise;

    expect(signaling.createSessionCalls).toBe(1);
    expect(signaling.sendAnswerCalls).toHaveLength(1);
    const sent = reliable.sent.find((entry) => entry instanceof Uint8Array) as Uint8Array | undefined;
    expect(sent).toBeDefined();
    const envelope = decodeEnvelope(sent!);
    expect(envelope?.header.msgType).toBe(MessageType.ClientHello);
    const client = ClientHello.getRootAsClientHello(new flatbuffers.ByteBuffer(envelope!.payload));
    expect(client.sessionToken()).toBe(signaling.sessionToken);
    expect(client.connectionId()).toBe(signaling.connectionId);
    expect(session.serverHello.connectionId).toBe(signaling.connectionId);
    reliable.emitMessage(buildPong(1));
    session.close();
    const fetchCount = signaling.fetchCandidatesCalls.length;
    vi.advanceTimersByTime(500);
    expect(signaling.fetchCandidatesCalls.length).toBe(fetchCount);
    vi.useRealTimers();
  });

  it('ignores string data messages on both channels', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const rtcFactory = new FakePeerConnectionFactory();
    const onPlayerProfile = vi.fn();
    const onSnapshot = vi.fn();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: silentLogger,
      pollIntervalMs: 100,
      connectTimeoutMs: 1000,
      timers: createTimers(),
      onPlayerProfile,
      onSnapshot
    });

    const connectPromise = connector.connect();
    const pc = await waitForPeer(rtcFactory);

    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    await Promise.resolve();
    reliable.emitMessage(buildServerHello(signaling.connectionId));

    const session = await connectPromise;

    reliable.emitMessage('hello');
    unreliable.emitMessage('world');

    expect(onPlayerProfile).not.toHaveBeenCalled();
    expect(onSnapshot).not.toHaveBeenCalled();

    session.close();
    vi.useRealTimers();
  });

  it('forwards state snapshots from unreliable channel', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const rtcFactory = new FakePeerConnectionFactory();
    const onSnapshot = vi.fn();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: silentLogger,
      pollIntervalMs: 100,
      connectTimeoutMs: 1000,
      timers: createTimers(),
      onSnapshot
    });

    const connectPromise = connector.connect();
    const pc = await waitForPeer(rtcFactory);

    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    await Promise.resolve();
    reliable.emitMessage(buildServerHello(signaling.connectionId));

    const session = await connectPromise;

    unreliable.emitMessage(new ArrayBuffer(4));

    const snapshot = {
      type: 'StateSnapshot',
      serverTick: 5,
      lastProcessedInputSeq: 2,
      posX: 1.5,
      posY: -2,
      posZ: 0.5,
      velX: 0,
      velY: 0,
      velZ: 0,
      weaponSlot: 0,
      ammoInMag: 30,
      dashCooldown: 0,
      health: 100,
      kills: 0,
      deaths: 0
    };
    unreliable.emitMessage(buildStateSnapshot(snapshot));

    const delta = {
      type: 'StateSnapshotDelta',
      serverTick: 6,
      baseTick: 5,
      lastProcessedInputSeq: 3,
      mask: SNAPSHOT_MASK_POS_X | SNAPSHOT_MASK_VEL_Y,
      posX: 2.25,
      velY: -0.5
    };
    unreliable.emitMessage(buildStateSnapshotDelta(delta));

    expect(onSnapshot).toHaveBeenCalledTimes(2);
    expect(onSnapshot).toHaveBeenNthCalledWith(1, snapshot);
    expect(onSnapshot).toHaveBeenNthCalledWith(2, {
      type: 'StateSnapshot',
      serverTick: 6,
      lastProcessedInputSeq: 3,
      posX: 2.25,
      posY: -2,
      posZ: 0.5,
      velX: 0,
      velY: -0.5,
      velZ: 0,
      weaponSlot: 0,
      ammoInMag: 30,
      dashCooldown: 0,
      health: 100,
      kills: 0,
      deaths: 0,
      clientId: undefined
    });
    session.close();
    vi.useRealTimers();
  });

  it('forwards player profiles from reliable channel', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const rtcFactory = new FakePeerConnectionFactory();
    const onPlayerProfile = vi.fn();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: silentLogger,
      pollIntervalMs: 100,
      connectTimeoutMs: 1000,
      timers: createTimers(),
      onPlayerProfile
    });

    const connectPromise = connector.connect();
    const pc = await waitForPeer(rtcFactory);

    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    await Promise.resolve();
    reliable.emitMessage(buildServerHello(signaling.connectionId));

    await connectPromise;

    reliable.emitMessage(buildPlayerProfile({ clientId: 'client-1', nickname: 'Ada', characterId: 'casual-a' }));

    expect(onPlayerProfile).toHaveBeenCalledWith({
      type: 'PlayerProfile',
      clientId: 'client-1',
      nickname: 'Ada',
      characterId: 'casual-a'
    });
    vi.useRealTimers();
  });

  it('stops candidate polling on connection-not-found errors', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const fetchError = Object.assign(new Error('Request failed: 400 connection_not_found'), { status: 400 });
    const fetchCandidatesMock = vi.fn().mockRejectedValue(fetchError);
    signaling.fetchCandidates = fetchCandidatesMock;
    const warn = vi.fn();
    const rtcFactory = new FakePeerConnectionFactory();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: { ...silentLogger, warn },
      pollIntervalMs: 100,
      connectTimeoutMs: 1000,
      timers: createTimers()
    });

    const connectPromise = connector.connect();
    const pc = await waitForPeer(rtcFactory);

    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    await Promise.resolve();
    reliable.emitMessage(buildServerHello(signaling.connectionId));

    const session = await connectPromise;
    expect(session.connectionId).toBe(signaling.connectionId);

    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(fetchCandidatesMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('candidate poll failed'));

    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(fetchCandidatesMock).toHaveBeenCalledTimes(1);

    session.close();
    vi.useRealTimers();
  });

  it('stops candidate polling on 404 errors', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const fetchError = { status: 404 };
    const fetchCandidatesMock = vi.fn().mockRejectedValue(fetchError);
    signaling.fetchCandidates = fetchCandidatesMock;
    const warn = vi.fn();
    const rtcFactory = new FakePeerConnectionFactory();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: { ...silentLogger, warn },
      pollIntervalMs: 100,
      connectTimeoutMs: 1000,
      timers: createTimers()
    });

    const connectPromise = connector.connect();
    const pc = await waitForPeer(rtcFactory);

    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    await Promise.resolve();
    reliable.emitMessage(buildServerHello(signaling.connectionId));

    const session = await connectPromise;

    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(fetchCandidatesMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('candidate poll failed'));

    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(fetchCandidatesMock).toHaveBeenCalledTimes(1);
    session.close();
    vi.useRealTimers();
  });

  it('continues polling on non-status errors', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const fetchCandidatesMock = vi.fn().mockRejectedValue('boom');
    signaling.fetchCandidates = fetchCandidatesMock;
    const warn = vi.fn();
    const rtcFactory = new FakePeerConnectionFactory();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: { ...silentLogger, warn },
      pollIntervalMs: 100,
      connectTimeoutMs: 1000,
      timers: createTimers()
    });

    const connectPromise = connector.connect();
    const pc = await waitForPeer(rtcFactory);

    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    await Promise.resolve();
    reliable.emitMessage(buildServerHello(signaling.connectionId));

    const session = await connectPromise;

    vi.advanceTimersByTime(100);
    await Promise.resolve();
    vi.advanceTimersByTime(100);
    await Promise.resolve();

    expect(fetchCandidatesMock.mock.calls.length).toBeGreaterThan(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('candidate poll failed'));
    session.close();
    vi.useRealTimers();
  });

  it('stops candidate polling when ICE reaches a terminal state', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const rtcFactory = new FakePeerConnectionFactory();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: silentLogger,
      pollIntervalMs: 100,
      connectTimeoutMs: 1000,
      timers: createTimers()
    });

    const connectPromise = connector.connect();
    const pc = await waitForPeer(rtcFactory);

    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    await Promise.resolve();
    reliable.emitMessage(buildServerHello(signaling.connectionId));

    const session = await connectPromise;

    vi.advanceTimersByTime(100);
    await Promise.resolve();
    const initialPolls = signaling.fetchCandidatesCalls.length;
    pc.setIceConnectionState('checking');
    pc.setIceConnectionState('connected');
    pc.setIceConnectionState('completed');
    pc.setIceConnectionState('failed');
    pc.setIceConnectionState('closed');

    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(signaling.fetchCandidatesCalls.length).toBe(initialPolls);
    session.close();
    vi.useRealTimers();
  });

  it('logs unknown datachannel labels', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const warn = vi.fn();
    const rtcFactory = new FakePeerConnectionFactory();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: { ...silentLogger, warn },
      pollIntervalMs: 100,
      connectTimeoutMs: 1000,
      timers: createTimers()
    });

    const connectPromise = connector.connect();
    const pc = await waitForPeer(rtcFactory);

    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    await Promise.resolve();
    reliable.emitMessage(buildServerHello(signaling.connectionId));

    const session = await connectPromise;

    const unknown = new FakeDataChannel('mystery');
    pc.emitDataChannel(unknown);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown datachannel label'));
    session.close();
    vi.useRealTimers();
  });

  it('ignores delta snapshots until a keyframe arrives', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const rtcFactory = new FakePeerConnectionFactory();
    const onSnapshot = vi.fn();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: silentLogger,
      pollIntervalMs: 100,
      connectTimeoutMs: 1000,
      timers: createTimers(),
      onSnapshot
    });

    const connectPromise = connector.connect();
    const pc = await waitForPeer(rtcFactory);

    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    await Promise.resolve();
    reliable.emitMessage(buildServerHello(signaling.connectionId));

    const session = await connectPromise;

    const delta = {
      type: 'StateSnapshotDelta',
      serverTick: 6,
      baseTick: 5,
      lastProcessedInputSeq: 3,
      mask: SNAPSHOT_MASK_POS_X | SNAPSHOT_MASK_VEL_Y,
      posX: 2.25,
      velY: -0.5
    };
    unreliable.emitMessage(buildStateSnapshotDelta(delta));
    expect(onSnapshot).not.toHaveBeenCalled();

    const snapshot = {
      type: 'StateSnapshot',
      serverTick: 5,
      lastProcessedInputSeq: 2,
      posX: 1.5,
      posY: -2,
      posZ: 0.5,
      velX: 0,
      velY: 0,
      velZ: 0,
      weaponSlot: 0,
      ammoInMag: 30,
      dashCooldown: 0,
      health: 100,
      kills: 0,
      deaths: 0
    };
    unreliable.emitMessage(buildStateSnapshot(snapshot));
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);

    session.close();
    vi.useRealTimers();
  });

  it('forwards game events from unreliable channel', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const rtcFactory = new FakePeerConnectionFactory();
    const onGameEvent = vi.fn();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: silentLogger,
      pollIntervalMs: 100,
      connectTimeoutMs: 1000,
      timers: createTimers(),
      onGameEvent
    });

    const connectPromise = connector.connect();
    const pc = await waitForPeer(rtcFactory);

    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    await Promise.resolve();
    reliable.emitMessage(buildServerHello(signaling.connectionId));

    const session = await connectPromise;

    unreliable.emitMessage(buildGameEventHitConfirmed());

    expect(onGameEvent).toHaveBeenCalledWith({
      type: 'GameEvent',
      event: 'HitConfirmed',
      damage: 5.5,
      killed: true
    });
    session.close();
    vi.useRealTimers();
  });

  it('forwards weapon events from unreliable channel', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const rtcFactory = new FakePeerConnectionFactory();
    const onWeaponFired = vi.fn();
    const onWeaponReload = vi.fn();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: silentLogger,
      pollIntervalMs: 100,
      connectTimeoutMs: 1000,
      timers: createTimers(),
      onWeaponFired,
      onWeaponReload
    });

    const connectPromise = connector.connect();
    const pc = await waitForPeer(rtcFactory);

    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    await Promise.resolve();
    reliable.emitMessage(buildServerHello(signaling.connectionId));

    const session = await connectPromise;

    unreliable.emitMessage(buildWeaponFiredEvent());
    unreliable.emitMessage(buildWeaponReloadEvent());

    expect(onWeaponFired).toHaveBeenCalledWith(expect.objectContaining({ type: 'WeaponFiredEvent', weaponId: 'rifle' }));
    expect(onWeaponReload).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'WeaponReloadEvent', weaponId: 'rifle' })
    );

    session.close();
    vi.useRealTimers();
  });

  it('forwards pong messages from unreliable channel', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const rtcFactory = new FakePeerConnectionFactory();
    const onPong = vi.fn();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: silentLogger,
      pollIntervalMs: 100,
      connectTimeoutMs: 1000,
      timers: createTimers(),
      onPong
    });

    const connectPromise = connector.connect();
    const pc = await waitForPeer(rtcFactory);

    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    await Promise.resolve();
    reliable.emitMessage(buildServerHello(signaling.connectionId));

    const session = await connectPromise;

    unreliable.emitMessage(buildPong(22));
    expect(onPong).toHaveBeenCalledWith({ type: 'Pong', clientTimeMs: 22 });
    session.close();
    vi.useRealTimers();
  });

  it('warns on unknown datachannel labels', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const rtcFactory = new FakePeerConnectionFactory();
    const warnSpy = vi.fn();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: { info: () => {}, warn: warnSpy, error: () => {} },
      pollIntervalMs: 100,
      connectTimeoutMs: 1000,
      timers: createTimers()
    });

    const connectPromise = connector.connect();
    const pc = await waitForPeer(rtcFactory);

    const unknown = new FakeDataChannel('mystery');
    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    pc.emitDataChannel(unknown);
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    await Promise.resolve();
    reliable.emitMessage(buildServerHello(signaling.connectionId));

    await connectPromise;
    expect(warnSpy).toHaveBeenCalledWith('unknown datachannel label: mystery');
    vi.useRealTimers();
  });

  it('waits for late unreliable channels', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const rtcFactory = new FakePeerConnectionFactory();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: silentLogger,
      pollIntervalMs: 100,
      connectTimeoutMs: 1000,
      timers: createTimers()
    });

    const connectPromise = connector.connect();
    const pc = await waitForPeer(rtcFactory);

    const reliable = new FakeDataChannel('afps_reliable');
    pc.emitDataChannel(reliable);
    reliable.open();
    await Promise.resolve();
    reliable.emitMessage(buildServerHello(signaling.connectionId));

    await Promise.resolve();

    const unreliable = new FakeDataChannel('afps_unreliable');
    pc.emitDataChannel(unreliable);
    unreliable.open();

    const session = await connectPromise;
    expect(session.unreliableChannel).toBe(unreliable);
    session.close();
    vi.useRealTimers();
  });

  it('sends local ice candidates and polls remote candidates', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    signaling.candidates = [{ candidate: 'remote', sdpMid: '0' }];
    const rtcFactory = new FakePeerConnectionFactory();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: silentLogger,
      pollIntervalMs: 50,
      connectTimeoutMs: 1000,
      timers: createTimers()
    });

    const connectPromise = connector.connect();
    const pc = await waitForPeer(rtcFactory);

    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    await Promise.resolve();
    reliable.emitMessage(buildServerHello(signaling.connectionId));
    await connectPromise;

    pc.emitIceCandidate({ candidate: 'local', sdpMid: '0' });
    pc.emitIceCandidate({} as RTCIceCandidateInit);
    pc.emitIceCandidate(null);
    pc.emitIceCandidate({ candidate: '', sdpMid: '' });
    await vi.advanceTimersByTimeAsync(60);

    expect(signaling.sendCandidateCalls).toHaveLength(1);
    expect(pc?.iceCandidates).toHaveLength(1);
    vi.useRealTimers();
  });

  it('rejects when ServerHello protocol mismatches', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const rtcFactory = new FakePeerConnectionFactory();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: silentLogger,
      pollIntervalMs: 100,
      connectTimeoutMs: 1000,
      timers: createTimers()
    });

    const connectPromise = connector.connect();
    const pc = await waitForPeer(rtcFactory);

    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    await Promise.resolve();
    reliable.emitMessage(buildServerHello(signaling.connectionId, { protocolVersion: 1 }));

    await expect(connectPromise).rejects.toThrow('ServerHello protocol mismatch (1)');
    vi.useRealTimers();
  });

  it('rejects when ServerHello connection id mismatches', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const rtcFactory = new FakePeerConnectionFactory();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: silentLogger,
      pollIntervalMs: 100,
      connectTimeoutMs: 1000,
      timers: createTimers()
    });

    const connectPromise = connector.connect();
    const pc = await waitForPeer(rtcFactory);

    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    await Promise.resolve();
    reliable.emitMessage(buildServerHello('other'));

    await expect(connectPromise).rejects.toThrow('ServerHello connection mismatch');
    vi.useRealTimers();
  });

  it('times out when datachannel never opens', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const rtcFactory = new FakePeerConnectionFactory();
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: silentLogger,
      pollIntervalMs: 100,
      connectTimeoutMs: 10,
      timers: createTimers()
    });

    const connectPromise = connector.connect();
    const rejection = expect(connectPromise).rejects.toThrow('DataChannel not created');
    await waitForPeer(rtcFactory);
    await vi.advanceTimersByTimeAsync(20);

    await rejection;
    vi.useRealTimers();
  });

  it('falls back to answer defaults when local description missing', async () => {
    vi.useFakeTimers();
    const signaling = new FakeSignalingClient();
    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');

    class LoosePeerConnection extends FakePeerConnection {
      async createAnswer() {
        return {} as RTCSessionDescriptionInit;
      }

      async setLocalDescription(_description: RTCSessionDescriptionInit) {
        // intentionally leave localDescription null
      }
    }

    const pc = new LoosePeerConnection();
    const rtcFactory = { create: () => pc };
    const connector = createWebRtcConnector({
      signaling,
      rtcFactory,
      logger: silentLogger,
      pollIntervalMs: 100,
      connectTimeoutMs: 1000,
      timers: createTimers()
    });

    const connectPromise = connector.connect();
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    reliable.emitMessage(buildServerHello(signaling.connectionId));

    const session = await connectPromise;

    expect(signaling.sendAnswerCalls[0].answer).toEqual({ type: 'answer', sdp: '' });
    session.close();
    vi.useRealTimers();
  });
});
