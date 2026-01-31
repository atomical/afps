import { describe, expect, it } from 'vitest';
import { buildClientHello, buildPing, parsePong, parseServerHello, parseStateSnapshot, PROTOCOL_VERSION } from '../../src/net/protocol';

describe('protocol helpers', () => {
  it('builds ClientHello payload', () => {
    const payload = buildClientHello('session', 'conn', 'build-1');
    const parsed = JSON.parse(payload) as Record<string, unknown>;

    expect(parsed.type).toBe('ClientHello');
    expect(parsed.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(parsed.sessionToken).toBe('session');
    expect(parsed.connectionId).toBe('conn');
    expect(parsed.build).toBe('build-1');
  });

  it('parses ServerHello payload', () => {
    const payload = JSON.stringify({
      type: 'ServerHello',
      protocolVersion: 1,
      connectionId: 'conn',
      serverTickRate: 60,
      snapshotRate: 20,
      motd: 'hi',
      clientId: 'client',
      connectionNonce: 'nonce'
    });

    const parsed = parseServerHello(payload);
    expect(parsed).toEqual({
      type: 'ServerHello',
      protocolVersion: 1,
      connectionId: 'conn',
      serverTickRate: 60,
      snapshotRate: 20,
      motd: 'hi',
      clientId: 'client',
      connectionNonce: 'nonce'
    });
  });

  it('returns null for invalid ServerHello payloads', () => {
    expect(parseServerHello('nope')).toBeNull();
    expect(parseServerHello('null')).toBeNull();
    expect(parseServerHello(JSON.stringify([]))).toBeNull();
    expect(parseServerHello(JSON.stringify({ type: 'Other' }))).toBeNull();
    expect(parseServerHello(JSON.stringify({
      type: 'ServerHello',
      protocolVersion: 1,
      connectionId: 'conn',
      serverTickRate: 60
    }))).toBeNull();
  });

  it('parses StateSnapshot payloads', () => {
    const payload = JSON.stringify({
      type: 'StateSnapshot',
      serverTick: 12,
      lastProcessedInputSeq: 7,
      posX: 1.25,
      posY: -3,
      clientId: 'client-1'
    });

    expect(parseStateSnapshot(payload)).toEqual({
      type: 'StateSnapshot',
      serverTick: 12,
      lastProcessedInputSeq: 7,
      posX: 1.25,
      posY: -3,
      clientId: 'client-1'
    });
  });

  it('rejects invalid StateSnapshot payloads', () => {
    expect(parseStateSnapshot('nope')).toBeNull();
    expect(parseStateSnapshot('null')).toBeNull();
    expect(parseStateSnapshot(JSON.stringify([]))).toBeNull();
    expect(parseStateSnapshot(JSON.stringify({ type: 'Other' }))).toBeNull();
    expect(parseStateSnapshot(JSON.stringify({
      type: 'StateSnapshot',
      serverTick: -1,
      lastProcessedInputSeq: 0,
      posX: 0,
      posY: 0
    }))).toBeNull();
    expect(parseStateSnapshot(JSON.stringify({
      type: 'StateSnapshot',
      serverTick: 0,
      lastProcessedInputSeq: -2,
      posX: 0,
      posY: 0
    }))).toBeNull();
    expect(parseStateSnapshot(JSON.stringify({
      type: 'StateSnapshot',
      serverTick: 0,
      lastProcessedInputSeq: 0,
      posX: 'bad',
      posY: 0
    }))).toBeNull();
    expect(parseStateSnapshot(JSON.stringify({
      type: 'StateSnapshot',
      serverTick: 0,
      lastProcessedInputSeq: 0,
      posX: 0,
      posY: 0,
      clientId: ''
    }))).toBeNull();
  });

  it('builds and parses ping/pong payloads', () => {
    const ping = JSON.parse(buildPing(12.5)) as Record<string, unknown>;
    expect(ping.type).toBe('Ping');
    expect(ping.clientTimeMs).toBe(12.5);

    const fallbackPing = JSON.parse(buildPing(Number.NaN)) as Record<string, unknown>;
    expect(fallbackPing.clientTimeMs).toBe(0);

    const pongPayload = JSON.stringify({ type: 'Pong', clientTimeMs: 44 });
    expect(parsePong(pongPayload)).toEqual({ type: 'Pong', clientTimeMs: 44 });
  });

  it('rejects invalid pong payloads', () => {
    expect(parsePong('nope')).toBeNull();
    expect(parsePong('null')).toBeNull();
    expect(parsePong(JSON.stringify({ type: 'Pong', clientTimeMs: -1 }))).toBeNull();
    expect(parsePong(JSON.stringify({ type: 'Other', clientTimeMs: 1 }))).toBeNull();
  });

  it('rejects non-integer snapshot ticks', () => {
    const payload = JSON.stringify({
      type: 'StateSnapshot',
      serverTick: 1.5,
      lastProcessedInputSeq: 0,
      posX: 0,
      posY: 0
    });
    expect(parseStateSnapshot(payload)).toBeNull();
  });
});
