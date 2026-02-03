import type {
  CandidateResponse,
  CandidatesResponse,
  ConnectResponse,
  FetchLike,
  OfferResponse,
  ResponseLike,
  SessionResponse,
  SignalingClient
} from './types';

interface SignalingClientOptions {
  baseUrl: string;
  fetcher?: FetchLike;
  authToken?: string;
}

class SignalingClientError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'SignalingClientError';
    this.status = status;
  }
}

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '');

const buildUrl = (baseUrl: string, path: string) =>
  `${normalizeBaseUrl(baseUrl)}${path.startsWith('/') ? '' : '/'}${path}`;

const ensureString = (value: unknown, field: string) => {
  if (typeof value !== 'string') {
    throw new SignalingClientError(`Invalid field: ${field}`);
  }
  if (!value.trim()) {
    throw new SignalingClientError(`Empty field: ${field}`);
  }
  return value;
};

const ensureArray = (value: unknown, field: string) => {
  if (!Array.isArray(value)) {
    throw new SignalingClientError(`Invalid field: ${field}`);
  }
  return value;
};

const parseSessionResponse = (payload: unknown): SessionResponse => {
  if (!payload || typeof payload !== 'object') {
    throw new SignalingClientError('Invalid session response');
  }
  const data = payload as Record<string, unknown>;
  return {
    sessionToken: ensureString(data.sessionToken, 'sessionToken'),
    expiresAt: ensureString(data.expiresAt, 'expiresAt')
  };
};

const parseOfferResponse = (payload: unknown): OfferResponse => {
  if (!payload || typeof payload !== 'object') {
    throw new SignalingClientError('Invalid offer response');
  }
  const data = payload as Record<string, unknown>;
  return {
    type: ensureString(data.type, 'offer.type'),
    sdp: ensureString(data.sdp, 'offer.sdp')
  };
};

const parseIceServers = (payload: unknown): RTCIceServer[] => {
  if (payload === undefined) {
    return [];
  }
  const entries = ensureArray(payload, 'iceServers');
  return entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new SignalingClientError(`Invalid field: iceServers[${index}]`);
    }
    const record = entry as Record<string, unknown>;
    const urls = record.urls;
    const username = record.username;
    const credential = record.credential;
    if (username !== undefined && typeof username !== 'string') {
      throw new SignalingClientError(`Invalid field: iceServers[${index}].username`);
    }
    if (credential !== undefined && typeof credential !== 'string') {
      throw new SignalingClientError(`Invalid field: iceServers[${index}].credential`);
    }
    const extras: Partial<RTCIceServer> = {};
    if (username && username.trim()) {
      extras.username = username;
    }
    if (credential && credential.trim()) {
      extras.credential = credential;
    }
    if (typeof urls === 'string') {
      return { urls, ...extras };
    }
    if (Array.isArray(urls)) {
      const sanitized = urls.map((url, urlIndex) => ensureString(url, `iceServers[${index}].urls[${urlIndex}]`));
      return { urls: sanitized, ...extras };
    }
    throw new SignalingClientError(`Invalid field: iceServers[${index}].urls`);
  });
};

const parseConnectResponse = (payload: unknown): ConnectResponse => {
  if (!payload || typeof payload !== 'object') {
    throw new SignalingClientError('Invalid connect response');
  }
  const data = payload as Record<string, unknown>;
  return {
    connectionId: ensureString(data.connectionId, 'connectionId'),
    offer: parseOfferResponse(data.offer),
    iceServers: parseIceServers(data.iceServers),
    expiresAt: ensureString(data.expiresAt, 'expiresAt')
  };
};

const parseCandidatesResponse = (payload: unknown): CandidatesResponse => {
  if (!payload || typeof payload !== 'object') {
    throw new SignalingClientError('Invalid candidates response');
  }
  const data = payload as Record<string, unknown>;
  const candidates = ensureArray(data.candidates, 'candidates');
  return {
    candidates: candidates.map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new SignalingClientError(`Invalid field: candidates[${index}]`);
      }
      const record = entry as Record<string, unknown>;
      return {
        candidate: ensureString(record.candidate, `candidates[${index}].candidate`),
        sdpMid: ensureString(record.sdpMid ?? record.mid, `candidates[${index}].sdpMid`)
      };
    })
  };
};

const toJson = (value: unknown) => JSON.stringify(value);

const readJson = async (response: ResponseLike) => {
  try {
    return await response.json();
  } catch {
    const text = await response.text();
    throw new SignalingClientError(`Invalid JSON response: ${text}`);
  }
};

const requestJson = async <T>(fetcher: FetchLike, url: string, init: RequestInit, parser: (payload: unknown) => T) => {
  const response = await fetcher(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new SignalingClientError(`Request failed: ${response.status} ${text}`, response.status);
  }
  const payload = await readJson(response);
  return parser(payload);
};

const requestOk = async (fetcher: FetchLike, url: string, init: RequestInit) => {
  const response = await fetcher(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new SignalingClientError(`Request failed: ${response.status} ${text}`, response.status);
  }
};

const buildQuery = (params: Record<string, string>) =>
  Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

const buildAuthHeader = (authToken?: string) => {
  if (!authToken) {
    return undefined;
  }
  const token = authToken.trim();
  if (!token) {
    return undefined;
  }
  return { Authorization: `Bearer ${token}` };
};

export const createSignalingClient = ({
  baseUrl,
  fetcher = fetch,
  authToken
}: SignalingClientOptions): SignalingClient => {
  const sessionUrl = buildUrl(baseUrl, '/session');
  const connectUrl = buildUrl(baseUrl, '/webrtc/connect');
  const answerUrl = buildUrl(baseUrl, '/webrtc/answer');
  const candidateUrl = buildUrl(baseUrl, '/webrtc/candidate');
  const candidatesUrl = buildUrl(baseUrl, '/webrtc/candidates');
  const sessionHeaders = buildAuthHeader(authToken);

  return {
    async createSession() {
      return requestJson(
        fetcher,
        sessionUrl,
        { method: 'POST', headers: sessionHeaders },
        parseSessionResponse
      );
    },

    async createConnection(sessionToken: string) {
      return requestJson(
        fetcher,
        connectUrl,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: toJson({ sessionToken })
        },
        parseConnectResponse
      );
    },

    async sendAnswer(sessionToken: string, connectionId: string, answer: OfferResponse) {
      await requestOk(fetcher, answerUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: toJson({ sessionToken, connectionId, answer })
      });
    },

    async sendCandidate(sessionToken: string, connectionId: string, candidate: CandidateResponse) {
      await requestOk(fetcher, candidateUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: toJson({ sessionToken, connectionId, candidate: candidate.candidate, sdpMid: candidate.sdpMid })
      });
    },

    async fetchCandidates(sessionToken: string, connectionId: string) {
      const query = buildQuery({ sessionToken, connectionId });
      const url = `${candidatesUrl}?${query}`;
      return requestJson(fetcher, url, { method: 'GET' }, parseCandidatesResponse);
    }
  };
};

export const __test = {
  parseSessionResponse,
  parseConnectResponse,
  parseCandidatesResponse,
  parseIceServers,
  normalizeBaseUrl,
  buildUrl,
  SignalingClientError,
  buildAuthHeader
};
