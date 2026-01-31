import { describe, expect, it } from 'vitest';
import { SnapshotBuffer } from '../../src/net/snapshot_buffer';
import type { StateSnapshot } from '../../src/net/protocol';

const makeSnapshot = (serverTick: number, posX: number, posY: number): StateSnapshot => ({
  type: 'StateSnapshot',
  serverTick,
  lastProcessedInputSeq: serverTick,
  posX,
  posY
});

describe('SnapshotBuffer', () => {
  it('returns null with no snapshots', () => {
    const buffer = new SnapshotBuffer(10);
    expect(buffer.sample(0)).toBeNull();
  });

  it('returns the latest snapshot when only one is available', () => {
    const buffer = new SnapshotBuffer(10);
    const snapshot = makeSnapshot(1, 2, 3);
    buffer.push(snapshot, 100);

    expect(buffer.sample(200)).toEqual(snapshot);
  });

  it('interpolates between snapshots', () => {
    const buffer = new SnapshotBuffer(10);
    buffer.push(makeSnapshot(1, 0, 0), 0);
    buffer.push(makeSnapshot(2, 10, 0), 100);

    const sample = buffer.sample(250);
    expect(sample).not.toBeNull();
    expect(sample?.posX).toBeCloseTo(5);
    expect(sample?.serverTick).toBe(2);
  });

  it('drops out-of-order snapshots', () => {
    const buffer = new SnapshotBuffer(10);
    buffer.push(makeSnapshot(5, 1, 1), 0);
    buffer.push(makeSnapshot(4, 9, 9), 10);

    const sample = buffer.sample(250);
    expect(sample?.serverTick).toBe(5);
    expect(sample?.posX).toBe(1);
  });

  it('clamps invalid snapshot rate', () => {
    const buffer = new SnapshotBuffer(0);
    buffer.push(makeSnapshot(1, 0, 0), 0);
    buffer.push(makeSnapshot(2, 10, 0), 50);

    const sample = buffer.sample(150);
    expect(sample?.serverTick).toBe(2);
  });

  it('drops oldest snapshots when buffer grows', () => {
    const buffer = new SnapshotBuffer(10);
    for (let i = 0; i < 7; i += 1) {
      buffer.push(makeSnapshot(i, i, 0), i * 10);
    }

    const sample = buffer.sample(1000);
    expect(sample?.serverTick).toBe(6);
  });

  it('returns newest snapshot when timestamps match', () => {
    const buffer = new SnapshotBuffer(10);
    buffer.push(makeSnapshot(1, 1, 1), 100);
    buffer.push(makeSnapshot(2, 5, 5), 100);

    const sample = buffer.sample(250);
    expect(sample?.serverTick).toBe(2);
    expect(sample?.posX).toBe(5);
  });

  it('clears buffered snapshots', () => {
    const buffer = new SnapshotBuffer(10);
    buffer.push(makeSnapshot(1, 1, 1), 0);
    buffer.clear();

    expect(buffer.sample(100)).toBeNull();
  });
});
