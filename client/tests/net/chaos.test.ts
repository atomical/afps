import { describe, expect, it } from 'vitest';
import { SnapshotBuffer } from '../../src/net/snapshot_buffer';

const mulberry32 = (seed: number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let result = Math.imul(t ^ (t >>> 15), 1 | t);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

describe('snapshot chaos handling', () => {
  it('handles loss, reorder, and jitter without invalid samples', () => {
    const buffer = new SnapshotBuffer(20);
    const rng = mulberry32(42);
    let serverTick = 0;
    let nowMs = 0;
    const events: Array<{ time: number; snapshot: ReturnType<typeof makeSnapshot> }> = [];

    for (let i = 0; i < 80; i += 1) {
      serverTick += 1;
      nowMs += 50 + rng() * 20;
      const drop = rng() < 0.15;
      if (drop) {
        continue;
      }
      const jitter = (rng() - 0.5) * 40;
      events.push({ time: nowMs + jitter, snapshot: makeSnapshot(serverTick) });
    }

    events.sort((a, b) => a.time - b.time);
    for (const event of events) {
      buffer.push(event.snapshot, event.time);
    }

    let lastTick = -1;
    const start = events.length > 0 ? events[0].time : 0;
    const end = events.length > 0 ? events[events.length - 1].time + 200 : 200;
    for (let t = start; t <= end; t += 30) {
      const sample = buffer.sample(t);
      if (!sample) {
        continue;
      }
      expect(Number.isFinite(sample.posX)).toBe(true);
      expect(Number.isFinite(sample.posY)).toBe(true);
      expect(Number.isFinite(sample.posZ)).toBe(true);
      expect(sample.serverTick).toBeGreaterThanOrEqual(lastTick);
      lastTick = sample.serverTick;
    }
  });
});

const makeSnapshot = (serverTick: number) => ({
  type: 'StateSnapshot' as const,
  serverTick,
  lastProcessedInputSeq: serverTick,
  posX: serverTick * 0.1,
  posY: serverTick * -0.05,
  posZ: 0,
  velX: 0.1,
  velY: -0.05,
  velZ: 0,
  weaponSlot: 0,
  dashCooldown: 0,
  health: 100,
  kills: 0,
  deaths: 0,
  clientId: 'chaos'
});
