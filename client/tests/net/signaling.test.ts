import { describe, expect, it, vi } from 'vitest';
import { createSignalingClient, __test } from '../../src/net/signaling';
import type { FetchLike, ResponseLike } from '../../src/net/types';

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
    if (this.payload instanceof Error) {
      throw this.payload;
    }
    return this.payload;
  }

  async text() {
    return this.textPayload;
  }
}

const createFetch = (responses: ResponseLike[]): FetchLike => {
  const fetcher = vi.fn(async () => responses.shift() as ResponseLike) as FetchLike;
  return fetcher;
};

describe('signaling client', () => {
  it('creates sessions and connections', async () => {
    const fetcher = createFetch([
      new FakeResponse(true, 200, { sessionToken: 'token', expiresAt: 'soon' }),
      new FakeResponse(true, 200, {
        connectionId: 'conn',
        offer: { type: 'offer', sdp: 'v=0' },
        iceServers: [{ urls: ['stun:example.com'] }],
        expiresAt: 'soon'
      }),
      new FakeResponse(true, 200, { status: 'ok' }),
      new FakeResponse(true, 200, { status: 'ok' }),
      new FakeResponse(true, 200, { candidates: [{ candidate: 'cand', sdpMid: '0' }] })
    ]);

    const client = createSignalingClient({ baseUrl: 'https://example.test', fetcher, authToken: 'secret' });

    const session = await client.createSession();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test/session',
      expect.objectContaining({
        headers: { Authorization: 'Bearer secret' }
      })
    );
    const connection = await client.createConnection(session.sessionToken);
    await client.sendAnswer(session.sessionToken, connection.connectionId, connection.offer);
    await client.sendCandidate(session.sessionToken, connection.connectionId, {
      candidate: 'cand',
      sdpMid: '0'
    });
    const candidates = await client.fetchCandidates(session.sessionToken, connection.connectionId);

    expect(session.sessionToken).toBe('token');
    expect(connection.iceServers[0].urls).toEqual(['stun:example.com']);
    expect(candidates.candidates).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it('parses ice servers from string urls', () => {
    const parsed = __test.parseConnectResponse({
      connectionId: 'id',
      offer: { type: 'offer', sdp: 'v=0' },
      iceServers: [{ urls: 'stun:stun.example.com:3478' }],
      expiresAt: 'soon'
    });

    expect(parsed.iceServers[0].urls).toBe('stun:stun.example.com:3478');
  });

  it('parses ice server credentials', () => {
    const parsed = __test.parseConnectResponse({
      connectionId: 'id',
      offer: { type: 'offer', sdp: 'v=0' },
      iceServers: [{ urls: 'turn:turn.example.com:3478', username: 'user', credential: 'pass' }],
      expiresAt: 'soon'
    });

    expect(parsed.iceServers[0].urls).toBe('turn:turn.example.com:3478');
    expect(parsed.iceServers[0].username).toBe('user');
    expect(parsed.iceServers[0].credential).toBe('pass');
  });

  it('rejects invalid responses', async () => {
    const fetcher = createFetch([
      new FakeResponse(false, 500, { error: 'bad' }, 'boom')
    ]);
    const client = createSignalingClient({ baseUrl: 'https://example.test', fetcher });

    await expect(client.createSession()).rejects.toThrow('Request failed');
  });

  it('validates candidate payloads', () => {
    expect(() => __test.parseCandidatesResponse({ candidates: [{ candidate: 'c', sdpMid: '' }] })).toThrow(
      'Empty field'
    );
  });

  it('rejects malformed candidate arrays', () => {
    expect(() => __test.parseCandidatesResponse(null)).toThrow('Invalid candidates response');
    expect(() => __test.parseCandidatesResponse({ candidates: ['bad'] })).toThrow('Invalid field');
    expect(() => __test.parseCandidatesResponse({ candidates: 'bad' })).toThrow('Invalid field: candidates');
  });

  it('handles invalid json payloads', async () => {
    const fetcher = createFetch([
      new FakeResponse(true, 200, new Error('bad json'), 'not json')
    ]);
    const client = createSignalingClient({ baseUrl: 'https://example.test', fetcher });

    await expect(client.createSession()).rejects.toThrow('Invalid JSON response');
  });

  it('normalizes base urls', () => {
    expect(__test.buildUrl('https://example.test/', '/session')).toBe('https://example.test/session');
    expect(__test.buildUrl('https://example.test///', 'session')).toBe('https://example.test/session');
  });

  it('builds auth headers only when token provided', () => {
    expect(__test.buildAuthHeader()).toBeUndefined();
    expect(__test.buildAuthHeader('')).toBeUndefined();
    expect(__test.buildAuthHeader('  ')).toBeUndefined();
    expect(__test.buildAuthHeader('token')).toEqual({ Authorization: 'Bearer token' });
  });

  it('supports candidate mid fallback and missing ice servers', () => {
    const candidates = __test.parseCandidatesResponse({ candidates: [{ candidate: 'c', mid: '1' }] });
    expect(candidates.candidates[0].sdpMid).toBe('1');

    const parsed = __test.parseConnectResponse({
      connectionId: 'id',
      offer: { type: 'offer', sdp: 'v=0' },
      expiresAt: 'soon'
    });
    expect(parsed.iceServers).toEqual([]);
  });

  it('rejects invalid offers and connect payloads', () => {
    expect(() => __test.parseConnectResponse(null)).toThrow('Invalid connect response');
    expect(() =>
      __test.parseConnectResponse({
        connectionId: 'id',
        offer: 'bad',
        iceServers: [],
        expiresAt: 'soon'
      })
    ).toThrow('Invalid offer response');
  });

  it('rejects invalid session payloads', () => {
    expect(() => __test.parseSessionResponse('bad')).toThrow('Invalid session response');
    expect(() => __test.parseSessionResponse({ sessionToken: 1, expiresAt: 'x' })).toThrow('Invalid field');
  });

  it('rejects malformed ice servers', () => {
    expect(() =>
      __test.parseConnectResponse({
        connectionId: 'id',
        offer: { type: 'offer', sdp: 'v=0' },
        iceServers: ['bad'],
        expiresAt: 'soon'
      })
    ).toThrow('Invalid field: iceServers[0]');

    expect(() =>
      __test.parseConnectResponse({
        connectionId: 'id',
        offer: { type: 'offer', sdp: 'v=0' },
        iceServers: [{ urls: 123 }],
        expiresAt: 'soon'
      })
    ).toThrow('Invalid field: iceServers[0].urls');

    expect(() =>
      __test.parseConnectResponse({
        connectionId: 'id',
        offer: { type: 'offer', sdp: 'v=0' },
        iceServers: [{ urls: ['stun:example.com'], username: 123 }],
        expiresAt: 'soon'
      })
    ).toThrow('Invalid field: iceServers[0].username');

    expect(() =>
      __test.parseConnectResponse({
        connectionId: 'id',
        offer: { type: 'offer', sdp: 'v=0' },
        iceServers: [{ urls: ['stun:example.com'], credential: 123 }],
        expiresAt: 'soon'
      })
    ).toThrow('Invalid field: iceServers[0].credential');
  });

  it('fails requestOk on non-200', async () => {
    const fetcher = createFetch([
      new FakeResponse(true, 200, { sessionToken: 'token', expiresAt: 'soon' }),
      new FakeResponse(true, 200, {
        connectionId: 'conn',
        offer: { type: 'offer', sdp: 'v=0' },
        iceServers: [{ urls: ['stun:example.com'] }],
        expiresAt: 'soon'
      }),
      new FakeResponse(false, 500, { error: 'bad' }, 'boom')
    ]);

    const client = createSignalingClient({ baseUrl: 'https://example.test', fetcher });
    const session = await client.createSession();
    const connection = await client.createConnection(session.sessionToken);

    await expect(client.sendAnswer(session.sessionToken, connection.connectionId, connection.offer)).rejects.toThrow(
      'Request failed'
    );
  });
});
