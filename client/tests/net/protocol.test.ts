import { describe, expect, it } from 'vitest';
import {
  buildClientHello,
  buildPing,
  parsePong,
  parseServerHello,
  parseSnapshotMessage,
  parseStateSnapshot,
  parseStateSnapshotDelta,
  PROTOCOL_VERSION,
  SNAPSHOT_MASK_POS_X,
  SNAPSHOT_MASK_POS_Y,
  SNAPSHOT_MASK_POS_Z,
  SNAPSHOT_MASK_VEL_X,
  SNAPSHOT_MASK_VEL_Y,
  SNAPSHOT_MASK_VEL_Z,
  SNAPSHOT_MASK_DASH_COOLDOWN
} from '../../src/net/protocol';

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
      protocolVersion: 2,
      connectionId: 'conn',
      serverTickRate: 60,
      snapshotRate: 20,
      snapshotKeyframeInterval: 5,
      motd: 'hi',
      clientId: 'client',
      connectionNonce: 'nonce'
    });

    const parsed = parseServerHello(payload);
    expect(parsed).toEqual({
      type: 'ServerHello',
      protocolVersion: 2,
      connectionId: 'conn',
      serverTickRate: 60,
      snapshotRate: 20,
      snapshotKeyframeInterval: 5,
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
    expect(parseServerHello(JSON.stringify({
      type: 'ServerHello',
      protocolVersion: 2,
      connectionId: 'conn',
      serverTickRate: 60,
      snapshotRate: 20,
      snapshotKeyframeInterval: 'bad'
    }))).toBeNull();
  });

  it('parses StateSnapshot payloads', () => {
    const payload = JSON.stringify({
      type: 'StateSnapshot',
      serverTick: 12,
      lastProcessedInputSeq: 7,
      posX: 1.25,
      posY: -3,
      posZ: 0.5,
      velX: 0.5,
      velY: -0.25,
      velZ: 0.1,
      dashCooldown: 0.4,
      clientId: 'client-1'
    });

    expect(parseStateSnapshot(payload)).toEqual({
      type: 'StateSnapshot',
      serverTick: 12,
      lastProcessedInputSeq: 7,
      posX: 1.25,
      posY: -3,
      posZ: 0.5,
      velX: 0.5,
      velY: -0.25,
      velZ: 0.1,
      dashCooldown: 0.4,
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
      posY: 0,
      posZ: 0,
      velX: 0,
      velY: 0,
      velZ: 0,
      dashCooldown: 0
    }))).toBeNull();
    expect(parseStateSnapshot(JSON.stringify({
      type: 'StateSnapshot',
      serverTick: 0,
      lastProcessedInputSeq: -2,
      posX: 0,
      posY: 0,
      posZ: 0,
      velX: 0,
      velY: 0,
      velZ: 0,
      dashCooldown: 0
    }))).toBeNull();
    expect(parseStateSnapshot(JSON.stringify({
      type: 'StateSnapshot',
      serverTick: 0,
      lastProcessedInputSeq: 0,
      posX: 'bad',
      posY: 0,
      posZ: 0,
      velX: 0,
      velY: 0,
      velZ: 0,
      dashCooldown: 0
    }))).toBeNull();
    expect(parseStateSnapshot(JSON.stringify({
      type: 'StateSnapshot',
      serverTick: 0,
      lastProcessedInputSeq: 0,
      posX: 0,
      posY: 0,
      posZ: 0,
      velX: 0,
      velY: 0,
      velZ: 0,
      dashCooldown: 0,
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
      posY: 0,
      posZ: 0,
      velX: 0,
      velY: 0,
      velZ: 0
    });
    expect(parseStateSnapshot(payload)).toBeNull();
  });

  it('parses StateSnapshotDelta payloads', () => {
    const fullMask =
      SNAPSHOT_MASK_POS_X |
      SNAPSHOT_MASK_POS_Y |
      SNAPSHOT_MASK_POS_Z |
      SNAPSHOT_MASK_VEL_X |
      SNAPSHOT_MASK_VEL_Y |
      SNAPSHOT_MASK_VEL_Z |
      SNAPSHOT_MASK_DASH_COOLDOWN;
    const payload = JSON.stringify({
      type: 'StateSnapshotDelta',
      serverTick: 10,
      baseTick: 8,
      lastProcessedInputSeq: 4,
      mask: fullMask,
      posX: 1.5,
      posY: -2.25,
      posZ: 0.5,
      velX: 0.75,
      velY: -0.5,
      velZ: 0.1,
      dashCooldown: 0.35,
      clientId: 'client-1'
    });

    expect(parseStateSnapshotDelta(payload)).toEqual({
      type: 'StateSnapshotDelta',
      serverTick: 10,
      baseTick: 8,
      lastProcessedInputSeq: 4,
      mask: fullMask,
      posX: 1.5,
      posY: -2.25,
      posZ: 0.5,
      velX: 0.75,
      velY: -0.5,
      velZ: 0.1,
      dashCooldown: 0.35,
      clientId: 'client-1'
    });
  });

  it('parses StateSnapshotDelta payloads with empty masks', () => {
    const payload = JSON.stringify({
      type: 'StateSnapshotDelta',
      serverTick: 10,
      baseTick: 10,
      lastProcessedInputSeq: 4,
      mask: 0
    });

    expect(parseStateSnapshotDelta(payload)).toEqual({
      type: 'StateSnapshotDelta',
      serverTick: 10,
      baseTick: 10,
      lastProcessedInputSeq: 4,
      mask: 0,
      clientId: undefined
    });
  });

  it('rejects invalid StateSnapshotDelta payloads', () => {
    expect(parseStateSnapshotDelta('nope')).toBeNull();
    expect(parseStateSnapshotDelta('null')).toBeNull();
    expect(parseStateSnapshotDelta(JSON.stringify([]))).toBeNull();
    expect(parseStateSnapshotDelta(JSON.stringify({ type: 'Other' }))).toBeNull();
    expect(parseStateSnapshotDelta(JSON.stringify({
      type: 'StateSnapshotDelta',
      serverTick: -1,
      baseTick: 0,
      lastProcessedInputSeq: 0,
      mask: 0
    }))).toBeNull();
    expect(parseStateSnapshotDelta(JSON.stringify({
      type: 'StateSnapshotDelta',
      serverTick: 1,
      baseTick: 2,
      lastProcessedInputSeq: 0,
      mask: 0
    }))).toBeNull();
    expect(parseStateSnapshotDelta(JSON.stringify({
      type: 'StateSnapshotDelta',
      serverTick: 1,
      baseTick: 1,
      lastProcessedInputSeq: -2,
      mask: 0
    }))).toBeNull();
    expect(parseStateSnapshotDelta(JSON.stringify({
      type: 'StateSnapshotDelta',
      serverTick: 1,
      baseTick: 1,
      lastProcessedInputSeq: 0,
      mask: 128
    }))).toBeNull();
    expect(parseStateSnapshotDelta(JSON.stringify({
      type: 'StateSnapshotDelta',
      serverTick: 1,
      baseTick: 1,
      lastProcessedInputSeq: 0,
      mask: SNAPSHOT_MASK_POS_X
    }))).toBeNull();
    expect(parseStateSnapshotDelta(JSON.stringify({
      type: 'StateSnapshotDelta',
      serverTick: 1,
      baseTick: 1,
      lastProcessedInputSeq: 0,
      mask: 0,
      posX: 1
    }))).toBeNull();
    expect(parseStateSnapshotDelta(JSON.stringify({
      type: 'StateSnapshotDelta',
      serverTick: 1,
      baseTick: 1,
      lastProcessedInputSeq: 0,
      mask: 0,
      clientId: ''
    }))).toBeNull();
    expect(parseStateSnapshotDelta(JSON.stringify({
      type: 'StateSnapshotDelta',
      serverTick: 1,
      baseTick: 1,
      lastProcessedInputSeq: 0,
      mask: SNAPSHOT_MASK_DASH_COOLDOWN,
      dashCooldown: -0.1
    }))).toBeNull();
  });

  it('parses snapshot messages for full and delta payloads', () => {
    const fullPayload = JSON.stringify({
      type: 'StateSnapshot',
      serverTick: 12,
      lastProcessedInputSeq: 7,
      posX: 1.25,
      posY: -3,
      posZ: 0.5,
      velX: 0.5,
      velY: -0.25,
      velZ: 0.1,
      dashCooldown: 0.4
    });
    const deltaPayload = JSON.stringify({
      type: 'StateSnapshotDelta',
      serverTick: 13,
      baseTick: 12,
      lastProcessedInputSeq: 8,
      mask: SNAPSHOT_MASK_POS_X,
      posX: 2.0
    });

    expect(parseSnapshotMessage(fullPayload)).toEqual(parseStateSnapshot(fullPayload));
    expect(parseSnapshotMessage(deltaPayload)).toEqual(parseStateSnapshotDelta(deltaPayload));
    expect(parseSnapshotMessage(JSON.stringify({ type: 'Other' }))).toBeNull();
    expect(parseSnapshotMessage('nope')).toBeNull();
  });
});
