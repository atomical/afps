import type {
  DataChannelLike,
  PeerConnectionFactory,
  RtcPeerConnectionLike,
  SignalingClient
} from '../../src/net/types';

export class FakeDataChannel implements DataChannelLike {
  label: string;
  readyState: 'connecting' | 'open' | 'closing' | 'closed' = 'connecting';
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
  sent: Array<string | ArrayBuffer> = [];
  closed = false;

  constructor(label = 'afps_reliable') {
    this.label = label;
  }

  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.readyState = 'closed';
  }

  open() {
    this.readyState = 'open';
    this.onopen?.();
  }

  emitMessage(data: string | ArrayBuffer) {
    this.onmessage?.({ data });
  }
}

export class FakePeerConnection implements RtcPeerConnectionLike {
  localDescription: RTCSessionDescriptionInit | null = null;
  onicecandidate: ((event: { candidate: RTCIceCandidateInit | null }) => void) | null = null;
  ondatachannel: ((event: { channel: DataChannelLike }) => void) | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  iceCandidates: RTCIceCandidateInit[] = [];
  closed = false;

  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
  }

  async createAnswer() {
    return { type: 'answer', sdp: 'v=0' };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    this.iceCandidates.push(candidate);
  }

  close() {
    this.closed = true;
  }

  emitIceCandidate(candidate: RTCIceCandidateInit | null) {
    this.onicecandidate?.({ candidate });
  }

  emitDataChannel(channel: DataChannelLike) {
    this.ondatachannel?.({ channel });
  }
}

export class FakePeerConnectionFactory implements PeerConnectionFactory {
  last: FakePeerConnection | null = null;

  create() {
    const pc = new FakePeerConnection();
    this.last = pc;
    return pc;
  }
}

export class FakeSignalingClient implements SignalingClient {
  sessionToken = 'session-1';
  connectionId = 'conn-1';
  offer = { type: 'offer', sdp: 'v=0' };
  iceServers: RTCIceServer[] = [];
  candidates: Array<{ candidate: string; sdpMid: string }> = [];

  createSessionCalls = 0;
  createConnectionCalls = 0;
  sendAnswerCalls: Array<{ sessionToken: string; connectionId: string; answer: { type: string; sdp: string } }> = [];
  sendCandidateCalls: Array<{ sessionToken: string; connectionId: string; candidate: { candidate: string; sdpMid: string } }> = [];
  fetchCandidatesCalls: Array<{ sessionToken: string; connectionId: string }> = [];

  async createSession() {
    this.createSessionCalls += 1;
    return { sessionToken: this.sessionToken, expiresAt: 'later' };
  }

  async createConnection(_sessionToken: string) {
    this.createConnectionCalls += 1;
    return {
      connectionId: this.connectionId,
      offer: this.offer,
      iceServers: this.iceServers,
      expiresAt: 'later'
    };
  }

  async sendAnswer(sessionToken: string, connectionId: string, answer: { type: string; sdp: string }) {
    this.sendAnswerCalls.push({ sessionToken, connectionId, answer });
  }

  async sendCandidate(sessionToken: string, connectionId: string, candidate: { candidate: string; sdpMid: string }) {
    this.sendCandidateCalls.push({ sessionToken, connectionId, candidate });
  }

  async fetchCandidates(sessionToken: string, connectionId: string) {
    this.fetchCandidatesCalls.push({ sessionToken, connectionId });
    return { candidates: this.candidates };
  }
}
