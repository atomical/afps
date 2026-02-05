import type {
  GameEventBatch,
  PlayerProfile,
  PongMessage,
  StateSnapshot
} from './protocol';
import type { Logger, PeerConnectionFactory, SignalingClient, TimerLike, WebRtcSession } from './types';
import { createSignalingClient } from './signaling';
import { createWebRtcConnector, defaultPeerConnectionFactory } from './webrtc';

export interface NetworkRuntimeConfig {
  signalingUrl?: string;
  signalingAuthToken?: string;
  pollIntervalMs?: number;
  connectTimeoutMs?: number;
  logger?: Logger;
  buildClientHello?: (
    sessionToken: string,
    connectionId: string,
    build?: string,
    profile?: { nickname?: string; characterId?: string },
    msgSeq?: number,
    serverSeqAck?: number
  ) => Uint8Array;
  onSnapshot?: (snapshot: StateSnapshot) => void;
  onPong?: (pong: PongMessage) => void;
  onGameEvent?: (event: GameEventBatch) => void;
  onPlayerProfile?: (profile: PlayerProfile) => void;
}

interface RuntimeDependencies {
  createSignalingClient?: (options: {
    baseUrl: string;
    fetcher?: typeof fetch;
    authToken?: string;
  }) => SignalingClient;
  createWebRtcConnector?: (options: {
    signaling: SignalingClient;
    rtcFactory: PeerConnectionFactory;
    logger?: Logger;
    pollIntervalMs?: number;
    connectTimeoutMs?: number;
    timers?: TimerLike;
    buildClientHello?: (
      sessionToken: string,
      connectionId: string,
      build?: string,
      profile?: { nickname?: string; characterId?: string },
      msgSeq?: number,
      serverSeqAck?: number
    ) => Uint8Array;
    onSnapshot?: (snapshot: StateSnapshot) => void;
    onPong?: (pong: PongMessage) => void;
    onGameEvent?: (event: GameEventBatch) => void;
    onPlayerProfile?: (profile: PlayerProfile) => void;
  }) => { connect: () => Promise<WebRtcSession> };
  fetcher?: typeof fetch;
  rtcFactory?: PeerConnectionFactory;
  timers?: TimerLike;
}

export const connectIfConfigured = async (
  config: NetworkRuntimeConfig,
  deps: RuntimeDependencies = {}
): Promise<WebRtcSession | null> => {
  if (!config.signalingUrl) {
    return null;
  }

  const createSignaling = deps.createSignalingClient ?? createSignalingClient;
  const createConnector = deps.createWebRtcConnector ?? createWebRtcConnector;
  const signaling = createSignaling({
    baseUrl: config.signalingUrl,
    fetcher: deps.fetcher,
    authToken: config.signalingAuthToken
  });
  const rtcFactory = deps.rtcFactory ?? defaultPeerConnectionFactory;
  const connector = createConnector({
    signaling,
    rtcFactory,
    logger: config.logger,
    pollIntervalMs: config.pollIntervalMs,
    connectTimeoutMs: config.connectTimeoutMs,
    timers: deps.timers,
    buildClientHello: config.buildClientHello,
    onSnapshot: config.onSnapshot,
    onPong: config.onPong,
    onGameEvent: config.onGameEvent,
    onPlayerProfile: config.onPlayerProfile
  });

  return connector.connect();
};
