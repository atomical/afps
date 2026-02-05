import {
  buildClientHello as buildClientHelloMessage,
  decodeEnvelope,
  parseGameEventPayload,
  parsePlayerProfilePayload,
  parsePongPayload,
  parseServerHelloPayload,
  parseStateSnapshotDeltaPayload,
  parseStateSnapshotPayload,
  MessageType,
  PROTOCOL_VERSION,
  type GameEventBatch,
  type PlayerProfile,
  type PongMessage,
  type StateSnapshot
} from './protocol';
import { SnapshotDecoder } from './snapshot_decoder';
import type { ServerHello } from './protocol';
import type {
  CandidateResponse,
  DataChannelLike,
  Logger,
  PeerConnectionFactory,
  SignalingClient,
  TimerLike,
  WebRtcSession
} from './types';

interface WebRtcConnectOptions {
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
}

const RELIABLE_LABEL = 'afps_reliable';
const UNRELIABLE_LABEL = 'afps_unreliable';

const defaultLogger: Logger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message)
};

const defaultTimers: TimerLike = {
  setInterval: (callback, ms) => window.setInterval(callback, ms),
  clearInterval: (id) => window.clearInterval(id),
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
  clearTimeout: (id) => window.clearTimeout(id)
};

const waitForDataChannelOpen = (channel: DataChannelLike, timers: TimerLike, timeoutMs: number) =>
  new Promise<void>((resolve, reject) => {
    if (channel.readyState === 'open') {
      resolve();
      return;
    }
    let timeoutId = 0;
    const onOpen = () => {
      channel.onopen = null;
      if (timeoutId) {
        timers.clearTimeout(timeoutId);
      }
      resolve();
    };
    channel.onopen = onOpen;
    timeoutId = timers.setTimeout(() => {
      channel.onopen = null;
      reject(new Error('DataChannel open timeout'));
    }, timeoutMs);
  });

const startCandidatePolling = (
  timers: TimerLike,
  intervalMs: number,
  poll: () => Promise<void>
) => {
  let active = true;
  const tick = async () => {
    if (!active) {
      return;
    }
    try {
      await poll();
    } catch {
      // Swallow polling errors to avoid unhandled promise rejections.
    }
  };

  const intervalId = timers.setInterval(tick, intervalMs);
  return () => {
    active = false;
    timers.clearInterval(intervalId);
  };
};

const waitForChannelEvent = (
  channelPromise: Promise<DataChannelLike>,
  timers: TimerLike,
  timeoutMs: number
) =>
  new Promise<DataChannelLike>((resolve, reject) => {
    const timeoutId = timers.setTimeout(() => {
      timers.clearTimeout(timeoutId);
      reject(new Error('DataChannel not created'));
    }, timeoutMs);
    channelPromise
      .then((channel) => {
        timers.clearTimeout(timeoutId);
        resolve(channel);
      })
      .catch(reject);
  });

const waitForServerHello = (
  serverHelloPromise: Promise<ServerHello>,
  timers: TimerLike,
  timeoutMs: number
) =>
  new Promise<ServerHello>((resolve, reject) => {
    const timeoutId = timers.setTimeout(() => {
      timers.clearTimeout(timeoutId);
      reject(new Error('ServerHello timeout'));
    }, timeoutMs);

    serverHelloPromise
      .then((hello) => {
        timers.clearTimeout(timeoutId);
        resolve(hello);
      })
      .catch(reject);
  });

export const createWebRtcConnector = ({
  signaling,
  rtcFactory,
  logger = defaultLogger,
  pollIntervalMs = 500,
  connectTimeoutMs = 5000,
  timers = defaultTimers,
  buildClientHello = buildClientHelloMessage,
  onSnapshot,
  onPong,
  onGameEvent,
  onPlayerProfile
}: WebRtcConnectOptions) => {
  const connect = async (): Promise<WebRtcSession> => {
    const session = await signaling.createSession();
    logger.info(`signaling session created: ${session.sessionToken}`);

    const connection = await signaling.createConnection(session.sessionToken);
    logger.info(`signaling offer received: ${connection.connectionId}`);

    const peerConnection = rtcFactory.create({ iceServers: connection.iceServers });
    let reliableChannel: DataChannelLike | null = null;
    let unreliableChannel: DataChannelLike | null = null;
    let resolveReliable: ((channel: DataChannelLike) => void) | null = null;
    let resolveUnreliable: ((channel: DataChannelLike) => void) | null = null;
    const reliablePromise = new Promise<DataChannelLike>((resolve) => {
      resolveReliable = resolve;
    });
    const unreliablePromise = new Promise<DataChannelLike>((resolve) => {
      resolveUnreliable = resolve;
    });
    let resolveServerHello: ((hello: ServerHello) => void) | null = null;
    const serverHelloPromise = new Promise<ServerHello>((resolve) => {
      resolveServerHello = resolve;
    });
    const snapshotDecoder = new SnapshotDecoder();
    let clientMsgSeq = 0;
    let serverSeqAck = 0;
    const nextClientSeq = () => {
      clientMsgSeq += 1;
      return clientMsgSeq;
    };
    const noteServerSeq = (seq: number) => {
      if (seq > serverSeqAck) {
        serverSeqAck = seq;
      }
    };
    const getServerSeqAck = () => serverSeqAck;

    const handleMessage = (message: { data: string | ArrayBuffer | Uint8Array }) => {
      if (typeof message.data === 'string') {
        return;
      }
      const envelope = decodeEnvelope(message.data);
      if (!envelope) {
        return;
      }
      noteServerSeq(envelope.header.msgSeq);
      if (envelope.header.msgType === MessageType.ServerHello) {
        const serverHello = parseServerHelloPayload(envelope.payload);
        if (serverHello) {
          resolveServerHello?.(serverHello);
          resolveServerHello = null;
        }
        return;
      }
      if (envelope.header.msgType === MessageType.PlayerProfile) {
        const profile = parsePlayerProfilePayload(envelope.payload);
        if (profile) {
          onPlayerProfile?.(profile);
        }
      }
    };

    const handleSnapshot = (message: { data: string | ArrayBuffer | Uint8Array }) => {
      if (typeof message.data === 'string') {
        return;
      }
      const envelope = decodeEnvelope(message.data);
      if (!envelope) {
        return;
      }
      noteServerSeq(envelope.header.msgSeq);
      if (envelope.header.msgType === MessageType.StateSnapshot) {
        const snapshotMessage = parseStateSnapshotPayload(envelope.payload);
        if (snapshotMessage) {
          const snapshot = snapshotDecoder.apply(snapshotMessage);
          onSnapshot?.(snapshot);
        }
        return;
      }
      if (envelope.header.msgType === MessageType.StateSnapshotDelta) {
        const snapshotMessage = parseStateSnapshotDeltaPayload(envelope.payload);
        if (snapshotMessage) {
          const snapshot = snapshotDecoder.apply(snapshotMessage);
          if (snapshot) {
            onSnapshot?.(snapshot);
          }
        }
        return;
      }
      if (envelope.header.msgType === MessageType.GameEvent) {
        const gameEvent = parseGameEventPayload(envelope.payload);
        if (gameEvent) {
          onGameEvent?.(gameEvent);
        }
        return;
      }
      if (envelope.header.msgType === MessageType.Pong) {
        const pong = parsePongPayload(envelope.payload);
        if (pong) {
          onPong?.(pong);
        }
      }
    };

    let stopPolling: (() => void) | null = null;
    stopPolling = startCandidatePolling(timers, pollIntervalMs, async () => {
      try {
        const candidates = await signaling.fetchCandidates(session.sessionToken, connection.connectionId);
        for (const candidate of candidates.candidates) {
          await peerConnection.addIceCandidate({ candidate: candidate.candidate, sdpMid: candidate.sdpMid });
        }
      } catch (error) {
        const status =
          typeof error === 'object' && error !== null && 'status' in error ? (error as { status?: number }).status : undefined;
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`candidate poll failed: ${message}`);
        if (status === 400 || status === 404) {
          stopPolling?.();
        }
      }
    });

    const close = () => {
      stopPolling?.();
      if (reliableChannel) {
        reliableChannel.close();
        reliableChannel = null;
      }
      if (unreliableChannel) {
        unreliableChannel.close();
        unreliableChannel = null;
      }
      peerConnection.close();
    };

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }
      const candidate: CandidateResponse = {
        candidate: event.candidate.candidate ?? '',
        sdpMid: event.candidate.sdpMid ?? ''
      };
      if (!candidate.candidate || !candidate.sdpMid) {
        return;
      }
      void signaling.sendCandidate(session.sessionToken, connection.connectionId, candidate);
    };

    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;
      if (state === 'connected' || state === 'completed' || state === 'failed' || state === 'closed') {
        stopPolling?.();
      }
    };

    peerConnection.ondatachannel = (event) => {
      const channel = event.channel;
      if ('binaryType' in channel) {
        (channel as RTCDataChannel).binaryType = 'arraybuffer';
      }
      if (channel.label === RELIABLE_LABEL) {
        reliableChannel = channel;
        channel.onmessage = handleMessage;
        resolveReliable?.(channel);
        resolveReliable = null;
        return;
      }
      if (channel.label === UNRELIABLE_LABEL) {
        unreliableChannel = channel;
        channel.onmessage = handleSnapshot;
        resolveUnreliable?.(channel);
        resolveUnreliable = null;
        return;
      }
      logger.warn(`unknown datachannel label: ${channel.label}`);
    };

    try {
      await peerConnection.setRemoteDescription(connection.offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      const localAnswer = peerConnection.localDescription ?? answer;
      await signaling.sendAnswer(session.sessionToken, connection.connectionId, {
        type: localAnswer.type ?? 'answer',
        sdp: localAnswer.sdp ?? ''
      });

      const channel =
        reliableChannel ?? (await waitForChannelEvent(reliablePromise, timers, connectTimeoutMs));
      reliableChannel = channel;

      await waitForDataChannelOpen(channel, timers, connectTimeoutMs);
      channel.send(
        buildClientHello(
          session.sessionToken,
          connection.connectionId,
          'dev',
          undefined,
          nextClientSeq(),
          getServerSeqAck()
        )
      );

      const serverHello = await waitForServerHello(serverHelloPromise, timers, connectTimeoutMs);
      if (serverHello.protocolVersion !== PROTOCOL_VERSION) {
        throw new Error(`ServerHello protocol mismatch (${serverHello.protocolVersion})`);
      }
      if (serverHello.connectionId !== connection.connectionId) {
        throw new Error('ServerHello connection mismatch');
      }

      const unreliable = await waitForChannelEvent(unreliablePromise, timers, connectTimeoutMs);
      unreliableChannel = unreliable;
      await waitForDataChannelOpen(unreliable, timers, connectTimeoutMs);

      return {
        sessionToken: session.sessionToken,
        connectionId: connection.connectionId,
        serverHello,
        peerConnection,
        reliableChannel: channel,
        unreliableChannel: unreliable,
        nextClientMessageSeq: nextClientSeq,
        getServerSeqAck,
        close
      };
    } catch (error) {
      stopPolling();
      peerConnection.close();
      throw error;
    }
  };

  return { connect };
};

export const defaultPeerConnectionFactory: PeerConnectionFactory = {
  create: (configuration: RTCConfiguration) => new RTCPeerConnection(configuration)
};

export const __test = {
  waitForDataChannelOpen,
  startCandidatePolling,
  waitForChannelEvent,
  waitForServerHello,
  defaultLogger,
  defaultTimers
};
