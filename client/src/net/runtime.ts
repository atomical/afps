import type { GameEvent, PlayerProfile, Pong, StateSnapshot } from './protocol';
import type { Logger, PeerConnectionFactory, SignalingClient, TimerLike, WebRtcSession } from './types';
import { createSignalingClient } from './signaling';
import { createWebRtcConnector, defaultPeerConnectionFactory } from './webrtc';

export interface NetworkRuntimeConfig {
  signalingUrl?: string;
  signalingAuthToken?: string;
  pollIntervalMs?: number;
  connectTimeoutMs?: number;
  logger?: Logger;
  buildClientHello?: (sessionToken: string, connectionId: string) => string;
  onSnapshot?: (snapshot: StateSnapshot) => void;
  onPong?: (pong: Pong) => void;
  onGameEvent?: (event: GameEvent) => void;
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
    buildClientHello?: (sessionToken: string, connectionId: string) => string;
    onSnapshot?: (snapshot: StateSnapshot) => void;
    onPong?: (pong: Pong) => void;
    onGameEvent?: (event: GameEvent) => void;
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
