import {
  buildClientHello as buildClientHelloMessage,
  parsePong,
  parseServerHello,
  parseStateSnapshot,
  PROTOCOL_VERSION,
  type Pong,
  type StateSnapshot
} from './protocol';
import type { ServerHello } from './protocol';
import type {
  CandidateResponse,
  DataChannelLike,
  Logger,
  PeerConnectionFactory,
  RtcPeerConnectionLike,
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
  buildClientHello?: (sessionToken: string, connectionId: string) => string;
  onSnapshot?: (snapshot: StateSnapshot) => void;
  onPong?: (pong: Pong) => void;
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
    await poll();
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
  onPong
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

    const handleMessage = (message: { data: string | ArrayBuffer }) => {
      if (typeof message.data !== 'string') {
        return;
      }
      const serverHello = parseServerHello(message.data);
      if (serverHello) {
        resolveServerHello?.(serverHello);
        resolveServerHello = null;
        return;
      }
      logger.info(`dc: ${message.data}`);
    };

    const handleSnapshot = (message: { data: string | ArrayBuffer }) => {
      if (typeof message.data !== 'string') {
        return;
      }
      const snapshot = parseStateSnapshot(message.data);
      if (snapshot) {
        onSnapshot?.(snapshot);
        return;
      }
      const pong = parsePong(message.data);
      if (pong) {
        onPong?.(pong);
      }
    };

    const stopPolling = startCandidatePolling(timers, pollIntervalMs, async () => {
      const candidates = await signaling.fetchCandidates(session.sessionToken, connection.connectionId);
      for (const candidate of candidates.candidates) {
        await peerConnection.addIceCandidate({ candidate: candidate.candidate, sdpMid: candidate.sdpMid });
      }
    });

    const close = () => {
      stopPolling();
      if (reliableChannel) {
        reliableChannel.close();
      }
      if (unreliableChannel) {
        unreliableChannel.close();
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

    peerConnection.ondatachannel = (event) => {
      const channel = event.channel;
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
      const clientHello = buildClientHello(session.sessionToken, connection.connectionId);
      if (clientHello) {
        channel.send(clientHello);
      }

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
