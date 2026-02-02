import { describe, expect, it, vi } from 'vitest';
import { createWebRtcConnector } from '../../src/net/webrtc';
import { SNAPSHOT_MASK_POS_X, SNAPSHOT_MASK_VEL_Y } from '../../src/net/protocol';
import { FakeDataChannel, FakePeerConnection, FakePeerConnectionFactory, FakeSignalingClient } from './fakes';

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
    reliable.emitMessage(
      JSON.stringify({
        type: 'ServerHello',
        protocolVersion: 2,
        connectionId: signaling.connectionId,
        serverTickRate: 60,
        snapshotRate: 20
      })
    );

    const session = await connectPromise;

    expect(signaling.createSessionCalls).toBe(1);
    expect(signaling.sendAnswerCalls).toHaveLength(1);
    const sent = reliable.sent.find((entry) => typeof entry === 'string') as string | undefined;
    expect(sent).toBeDefined();
    const parsed = JSON.parse(sent ?? '{}') as Record<string, unknown>;
    expect(parsed.type).toBe('ClientHello');
    expect(parsed.sessionToken).toBe(signaling.sessionToken);
    expect(parsed.connectionId).toBe(signaling.connectionId);
    expect(session.serverHello.connectionId).toBe(signaling.connectionId);
    reliable.emitMessage('pong');
    session.close();
    const fetchCount = signaling.fetchCandidatesCalls.length;
    vi.advanceTimersByTime(500);
    expect(signaling.fetchCandidatesCalls.length).toBe(fetchCount);
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
    reliable.emitMessage(
      JSON.stringify({
        type: 'ServerHello',
        protocolVersion: 2,
        connectionId: signaling.connectionId,
        serverTickRate: 60,
        snapshotRate: 20
      })
    );

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
      dashCooldown: 0,
      health: 100,
      kills: 0,
      deaths: 0
    };
    unreliable.emitMessage(JSON.stringify(snapshot));

    const delta = {
      type: 'StateSnapshotDelta',
      serverTick: 6,
      baseTick: 5,
      lastProcessedInputSeq: 3,
      mask: SNAPSHOT_MASK_POS_X | SNAPSHOT_MASK_VEL_Y,
      posX: 2.25,
      velY: -0.5
    };
    unreliable.emitMessage(JSON.stringify(delta));

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
      dashCooldown: 0,
      health: 100,
      kills: 0,
      deaths: 0,
      clientId: undefined
    });
    session.close();
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
    reliable.emitMessage(
      JSON.stringify({
        type: 'ServerHello',
        protocolVersion: 2,
        connectionId: signaling.connectionId,
        serverTickRate: 60,
        snapshotRate: 20
      })
    );

    const session = await connectPromise;
    expect(session.connectionId).toBe(signaling.connectionId);

    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(fetchCandidatesMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('candidate poll failed'));

    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(fetchCandidatesMock).toHaveBeenCalledTimes(1);

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
    reliable.emitMessage(
      JSON.stringify({
        type: 'ServerHello',
        protocolVersion: 2,
        connectionId: signaling.connectionId,
        serverTickRate: 60,
        snapshotRate: 20
      })
    );

    await connectPromise;

    vi.advanceTimersByTime(100);
    await Promise.resolve();
    const initialPolls = signaling.fetchCandidatesCalls.length;
    pc.setIceConnectionState('connected');

    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(signaling.fetchCandidatesCalls.length).toBe(initialPolls);
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
    reliable.emitMessage(
      JSON.stringify({
        type: 'ServerHello',
        protocolVersion: 2,
        connectionId: signaling.connectionId,
        serverTickRate: 60,
        snapshotRate: 20
      })
    );

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
    unreliable.emitMessage(JSON.stringify(delta));
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
      dashCooldown: 0,
      health: 100,
      kills: 0,
      deaths: 0
    };
    unreliable.emitMessage(JSON.stringify(snapshot));
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
    reliable.emitMessage(
      JSON.stringify({
        type: 'ServerHello',
        protocolVersion: 2,
        connectionId: signaling.connectionId,
        serverTickRate: 60,
        snapshotRate: 20
      })
    );

    const session = await connectPromise;

    unreliable.emitMessage(
      JSON.stringify({
        type: 'GameEvent',
        event: 'HitConfirmed',
        damage: 5.5,
        killed: true
      })
    );

    expect(onGameEvent).toHaveBeenCalledWith({
      type: 'GameEvent',
      event: 'HitConfirmed',
      damage: 5.5,
      killed: true
    });
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
    reliable.emitMessage(
      JSON.stringify({
        type: 'ServerHello',
        protocolVersion: 2,
        connectionId: signaling.connectionId,
        serverTickRate: 60,
        snapshotRate: 20
      })
    );

    const session = await connectPromise;

    unreliable.emitMessage(JSON.stringify({ type: 'Pong', clientTimeMs: 22 }));
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
    reliable.emitMessage(
      JSON.stringify({
        type: 'ServerHello',
        protocolVersion: 2,
        connectionId: signaling.connectionId,
        serverTickRate: 60,
        snapshotRate: 20
      })
    );

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
    reliable.emitMessage(
      JSON.stringify({
        type: 'ServerHello',
        protocolVersion: 2,
        connectionId: signaling.connectionId,
        serverTickRate: 60,
        snapshotRate: 20
      })
    );

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
    reliable.emitMessage(
      JSON.stringify({
        type: 'ServerHello',
        protocolVersion: 2,
        connectionId: signaling.connectionId,
        serverTickRate: 60,
        snapshotRate: 20
      })
    );
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
    reliable.emitMessage(
      JSON.stringify({
        type: 'ServerHello',
        protocolVersion: 1,
        connectionId: signaling.connectionId,
        serverTickRate: 60,
        snapshotRate: 20
      })
    );

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
    reliable.emitMessage(
      JSON.stringify({
        type: 'ServerHello',
        protocolVersion: 2,
        connectionId: 'other',
        serverTickRate: 60,
        snapshotRate: 20
      })
    );

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
    reliable.emitMessage(
      JSON.stringify({
        type: 'ServerHello',
        protocolVersion: 2,
        connectionId: signaling.connectionId,
        serverTickRate: 60,
        snapshotRate: 20
      })
    );

    const session = await connectPromise;

    expect(signaling.sendAnswerCalls[0].answer).toEqual({ type: 'answer', sdp: '' });
    session.close();
    vi.useRealTimers();
  });
});
