import type { ServerHello } from './protocol';

export interface SessionResponse {
  sessionToken: string;
  expiresAt: string;
}

export interface OfferResponse {
  type: string;
  sdp: string;
}

export interface ConnectResponse {
  connectionId: string;
  offer: OfferResponse;
  iceServers: RTCIceServer[];
  expiresAt: string;
}

export interface CandidateResponse {
  candidate: string;
  sdpMid: string;
}

export interface CandidatesResponse {
  candidates: CandidateResponse[];
}

export interface SignalingClient {
  createSession: () => Promise<SessionResponse>;
  createConnection: (sessionToken: string) => Promise<ConnectResponse>;
  sendAnswer: (sessionToken: string, connectionId: string, answer: OfferResponse) => Promise<void>;
  sendCandidate: (sessionToken: string, connectionId: string, candidate: CandidateResponse) => Promise<void>;
  fetchCandidates: (sessionToken: string, connectionId: string) => Promise<CandidatesResponse>;
}

export interface FetchLike {
  (input: RequestInfo | URL, init?: RequestInit): Promise<ResponseLike>;
}

export interface ResponseLike {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

export interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface TimerLike {
  setInterval: (callback: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
}

export interface DataChannelLike {
  label: string;
  readyState: 'connecting' | 'open' | 'closing' | 'closed';
  onopen: (() => void) | null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null;
  send: (data: string | ArrayBuffer) => void;
  close: () => void;
}

export interface RtcPeerConnectionLike {
  localDescription: RTCSessionDescriptionInit | null;
  onicecandidate: ((event: { candidate: RTCIceCandidateInit | null }) => void) | null;
  ondatachannel: ((event: { channel: DataChannelLike }) => void) | null;
  setRemoteDescription: (description: RTCSessionDescriptionInit) => Promise<void>;
  createAnswer: () => Promise<RTCSessionDescriptionInit>;
  setLocalDescription: (description: RTCSessionDescriptionInit) => Promise<void>;
  addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
  close: () => void;
}

export interface PeerConnectionFactory {
  create: (configuration: RTCConfiguration) => RtcPeerConnectionLike;
}

export interface WebRtcSession {
  sessionToken: string;
  connectionId: string;
  serverHello: ServerHello;
  peerConnection: RtcPeerConnectionLike;
  reliableChannel: DataChannelLike;
  unreliableChannel: DataChannelLike;
  close: () => void;
}
