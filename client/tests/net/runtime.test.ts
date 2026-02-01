import { describe, expect, it, vi } from 'vitest';
import { connectIfConfigured } from '../../src/net/runtime';
import type { PeerConnectionFactory, ResponseLike, SignalingClient, WebRtcSession } from '../../src/net/types';
import { FakeDataChannel, FakePeerConnection, FakePeerConnectionFactory } from './fakes';

const createDeps = () => {
  const signaling: SignalingClient = {
    createSession: async () => ({ sessionToken: 'token', expiresAt: 'later' }),
    createConnection: async () => ({
      connectionId: 'conn',
      offer: { type: 'offer', sdp: 'v=0' },
      iceServers: [],
      expiresAt: 'later'
    }),
    sendAnswer: async () => {},
    sendCandidate: async () => {},
    fetchCandidates: async () => ({ candidates: [] })
  };

  let created = false;
  let lastOptions: { baseUrl: string; authToken?: string } | null = null;
  const createSignalingClient = (options: { baseUrl: string; authToken?: string; fetcher?: typeof fetch }) => {
    created = true;
    lastOptions = options;
    return signaling;
  };

  const connectResult: WebRtcSession = {
    sessionToken: 'token',
    connectionId: 'conn',
    serverHello: {
      type: 'ServerHello',
      protocolVersion: 2,
      connectionId: 'conn',
      serverTickRate: 60,
      snapshotRate: 20
    },
    peerConnection: {
      localDescription: null,
      onicecandidate: null,
      ondatachannel: null,
      setRemoteDescription: async () => {},
      createAnswer: async () => ({ type: 'answer', sdp: 'v=0' }),
      setLocalDescription: async () => {},
      addIceCandidate: async () => {},
      close: () => {}
    },
    reliableChannel: {
      label: 'afps_reliable',
      readyState: 'open',
      onopen: null,
      onmessage: null,
      send: () => {},
      close: () => {}
    },
    unreliableChannel: {
      label: 'afps_unreliable',
      readyState: 'open',
      onopen: null,
      onmessage: null,
      send: () => {},
      close: () => {}
    },
    close: () => {}
  };

  let connectorCalled = false;
  let lastConnectorOptions: {
    signaling: SignalingClient;
    rtcFactory: PeerConnectionFactory;
    logger?: { info: (message: string) => void; warn: (message: string) => void; error: (message: string) => void };
    pollIntervalMs?: number;
    connectTimeoutMs?: number;
    timers?: unknown;
    onSnapshot?: unknown;
    onPong?: unknown;
    onGameEvent?: unknown;
  } | null = null;
  const createWebRtcConnector = (options: {
    signaling: SignalingClient;
    rtcFactory: PeerConnectionFactory;
    logger?: { info: (message: string) => void; warn: (message: string) => void; error: (message: string) => void };
    pollIntervalMs?: number;
    connectTimeoutMs?: number;
    timers?: unknown;
    onSnapshot?: unknown;
    onPong?: unknown;
    onGameEvent?: unknown;
  }) => {
    connectorCalled = true;
    lastConnectorOptions = options;
    return { connect: async () => connectResult };
  };

  const rtcFactory: PeerConnectionFactory = {
    create: () => connectResult.peerConnection
  };

  return {
    signaling,
    createSignalingClient,
    createWebRtcConnector,
    rtcFactory,
    get created() {
      return created;
    },
    get connectorCalled() {
      return connectorCalled;
    },
    get lastConnectorOptions() {
      return lastConnectorOptions;
    },
    get lastOptions() {
      return lastOptions;
    }
  };
};

class FakeResponse implements ResponseLike {
  ok: boolean;
  status: number;
  private payload: unknown;
  private textPayload: string;

  constructor(ok: boolean, status: number, payload: unknown, textPayload = '') {
    this.ok = ok;
    this.status = status;
    this.payload = payload;
    this.textPayload = textPayload || JSON.stringify(payload);
  }

  async json() {
    return this.payload;
  }

  async text() {
    return this.textPayload;
  }
}

describe('connectIfConfigured', () => {
  it('returns null when no signaling url', async () => {
    const deps = createDeps();
    const result = await connectIfConfigured({}, deps);

    expect(result).toBeNull();
    expect(deps.created).toBe(false);
  });

  it('creates signaling client and connector when configured', async () => {
    const deps = createDeps();
    const result = await connectIfConfigured(
      { signalingUrl: 'https://example.test', signalingAuthToken: 'secret' },
      deps
    );

    expect(result?.connectionId).toBe('conn');
    expect(deps.created).toBe(true);
    expect(deps.lastOptions?.authToken).toBe('secret');
    expect(deps.connectorCalled).toBe(true);
  });

  it('passes snapshot handler to connector', async () => {
    const deps = createDeps();
    const onSnapshot = vi.fn();

    await connectIfConfigured(
      { signalingUrl: 'https://example.test', signalingAuthToken: 'secret', onSnapshot },
      deps
    );

    expect(deps.lastConnectorOptions?.onSnapshot).toBe(onSnapshot);
  });

  it('passes pong handler to connector', async () => {
    const deps = createDeps();
    const onPong = vi.fn();

    await connectIfConfigured(
      { signalingUrl: 'https://example.test', signalingAuthToken: 'secret', onPong },
      deps
    );

    expect(deps.lastConnectorOptions?.onPong).toBe(onPong);
  });

  it('passes game event handler to connector', async () => {
    const deps = createDeps();
    const onGameEvent = vi.fn();

    await connectIfConfigured(
      { signalingUrl: 'https://example.test', signalingAuthToken: 'secret', onGameEvent },
      deps
    );

    expect(deps.lastConnectorOptions?.onGameEvent).toBe(onGameEvent);
  });

  it('uses default factories when not provided', async () => {
    const rtcFactory = new FakePeerConnectionFactory();
    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith('/session')) {
        return new FakeResponse(true, 200, { sessionToken: 'token', expiresAt: 'soon' });
      }
      if (url.endsWith('/webrtc/connect')) {
        return new FakeResponse(true, 200, {
          connectionId: 'conn',
          offer: { type: 'offer', sdp: 'v=0' },
          iceServers: [],
          expiresAt: 'soon'
        });
      }
      if (url.endsWith('/webrtc/answer')) {
        return new FakeResponse(true, 200, { status: 'ok' });
      }
      if (url.includes('/webrtc/candidates')) {
        return new FakeResponse(true, 200, { candidates: [] });
      }
      return new FakeResponse(false, 500, { error: 'unexpected' }, 'unexpected');
    });

    const timers = {
      setInterval: () => 1,
      clearInterval: () => {},
      setTimeout: (callback: () => void, ms: number) => window.setTimeout(callback, ms),
      clearTimeout: (id: number) => window.clearTimeout(id)
    };

    const connectPromise = connectIfConfigured(
      { signalingUrl: 'https://example.test', logger: { info: () => {}, warn: () => {}, error: () => {} } },
      { fetcher, rtcFactory, timers }
    );

    for (let i = 0; i < 5 && !rtcFactory.last; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const pc = rtcFactory.last;
    if (!pc) {
      throw new Error('peer not created');
    }
    pc.emitDataChannel(reliable);
    pc.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    reliable.emitMessage(
      JSON.stringify({
        type: 'ServerHello',
        protocolVersion: 2,
        connectionId: 'conn',
        serverTickRate: 60,
        snapshotRate: 20
      })
    );

    const session = await connectPromise;
    expect(session?.connectionId).toBe('conn');
    session?.close();
  });

  it('falls back to global RTCPeerConnection when rtcFactory is missing', async () => {
    class GlobalPeerConnection extends FakePeerConnection {
      static last: GlobalPeerConnection | null = null;

      constructor(_config?: RTCConfiguration) {
        super();
        GlobalPeerConnection.last = this;
      }
    }

    const original = globalThis.RTCPeerConnection;
    (globalThis as unknown as { RTCPeerConnection?: typeof RTCPeerConnection }).RTCPeerConnection =
      GlobalPeerConnection as unknown as typeof RTCPeerConnection;

    const reliable = new FakeDataChannel('afps_reliable');
    const unreliable = new FakeDataChannel('afps_unreliable');
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith('/session')) {
        return new FakeResponse(true, 200, { sessionToken: 'token', expiresAt: 'soon' });
      }
      if (url.endsWith('/webrtc/connect')) {
        return new FakeResponse(true, 200, {
          connectionId: 'conn',
          offer: { type: 'offer', sdp: 'v=0' },
          iceServers: [],
          expiresAt: 'soon'
        });
      }
      if (url.endsWith('/webrtc/answer')) {
        return new FakeResponse(true, 200, { status: 'ok' });
      }
      if (url.includes('/webrtc/candidates')) {
        return new FakeResponse(true, 200, { candidates: [] });
      }
      return new FakeResponse(false, 500, { error: 'unexpected' }, 'unexpected');
    });

    const timers = {
      setInterval: () => 1,
      clearInterval: () => {},
      setTimeout: (callback: () => void, ms: number) => window.setTimeout(callback, ms),
      clearTimeout: (id: number) => window.clearTimeout(id)
    };

    const connectPromise = connectIfConfigured(
      { signalingUrl: 'https://example.test', logger: { info: () => {}, warn: () => {}, error: () => {} } },
      { fetcher, timers }
    );

    for (let i = 0; i < 5 && !GlobalPeerConnection.last; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (!GlobalPeerConnection.last) {
      throw new Error('peer not created');
    }

    GlobalPeerConnection.last.emitDataChannel(reliable);
    GlobalPeerConnection.last.emitDataChannel(unreliable);
    reliable.open();
    unreliable.open();
    reliable.emitMessage(
      JSON.stringify({
        type: 'ServerHello',
        protocolVersion: 2,
        connectionId: 'conn',
        serverTickRate: 60,
        snapshotRate: 20
      })
    );

    const session = await connectPromise;
    expect(session?.connectionId).toBe('conn');
    session?.close();

    (globalThis as unknown as { RTCPeerConnection?: typeof RTCPeerConnection }).RTCPeerConnection = original;
  });
});
