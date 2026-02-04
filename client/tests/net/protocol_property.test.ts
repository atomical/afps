import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { decodeEnvelope, encodeEnvelope, MessageType } from '../../src/net/protocol';

const MESSAGE_TYPES = [
  MessageType.ClientHello,
  MessageType.ServerHello,
  MessageType.JoinRequest,
  MessageType.JoinAccept,
  MessageType.InputCmd,
  MessageType.StateSnapshot,
  MessageType.StateSnapshotDelta,
  MessageType.GameEvent,
  MessageType.Ping,
  MessageType.Pong,
  MessageType.Error,
  MessageType.Disconnect,
  MessageType.PlayerProfile,
  MessageType.FireWeaponRequest,
  MessageType.WeaponFiredEvent,
  MessageType.WeaponReloadEvent
];

describe('protocol envelope properties', () => {
  it('roundtrips header fields and payload bytes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...MESSAGE_TYPES),
        fc.uint8Array({ maxLength: 512 }),
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.integer({ min: 0, max: 0xffffffff }),
        (msgType, payload, msgSeq, serverSeqAck) => {
          const encoded = encodeEnvelope(msgType, payload, msgSeq, serverSeqAck);
          const decoded = decodeEnvelope(encoded);
          expect(decoded).not.toBeNull();
          if (!decoded) {
            return;
          }
          expect(decoded.header.msgType).toBe(msgType);
          expect(decoded.header.msgSeq).toBe(msgSeq >>> 0);
          expect(decoded.header.serverSeqAck).toBe(serverSeqAck >>> 0);
          expect(Array.from(decoded.payload)).toEqual(Array.from(payload));
        }
      ),
      { numRuns: 200 }
    );
  });

  it('never throws on arbitrary bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 1024 }), (bytes) => {
        expect(() => decodeEnvelope(bytes)).not.toThrow();
      }),
      { numRuns: 200 }
    );
  });
});
