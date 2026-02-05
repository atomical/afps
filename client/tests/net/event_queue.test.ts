import { describe, expect, it } from 'vitest';
import { GameEventQueue } from '../../src/net/event_queue';
import type { GameEventBatch } from '../../src/net/protocol';

const makeBatch = (serverTick: number, events = 1): GameEventBatch => ({
  type: 'GameEventBatch',
  serverTick,
  events: Array.from({ length: events }, (_, index) => ({
    type: 'VentFx',
    shooterId: `shooter-${serverTick}-${index}`,
    weaponSlot: 0
  }))
});

describe('GameEventQueue', () => {
  it('clamps invalid server ticks to zero', () => {
    const queue = new GameEventQueue();
    queue.push(makeBatch(Number.NaN), 0, null);
    const drained = queue.drain(0);
    expect(drained).toHaveLength(1);
    expect(drained[0]?.serverTick).toBe(Number.NaN);
  });

  it('defaults invalid constructor options', () => {
    const queue = new GameEventQueue({
      tickRate: Number.NaN,
      graceMs: -5,
      maxBufferedTicks: 0
    });
    queue.drain(10);

    const late = queue.push(makeBatch(1), 0, 10);
    expect(late).toHaveLength(1);
  });

  it('enqueues batches and drains them in tick order', () => {
    const queue = new GameEventQueue({ tickRate: 10, graceMs: 200 });

    expect(queue.getStats()).toEqual(
      expect.objectContaining({ receivedBatches: 0, drainedBatches: 0, droppedBatches: 0 })
    );

    const immediate = queue.push(makeBatch(2, 2), 1000, null);
    queue.push(makeBatch(1), 900, null);
    queue.push(makeBatch(1), 950, null);
    expect(immediate).toEqual([]);

    // Draining with a non-number does nothing.
    expect(queue.drain(null)).toEqual([]);

    const drained = queue.drain(2.9);
    expect(drained.map((batch) => batch.serverTick)).toEqual([1, 1, 2]);

    const stats = queue.getStats();
    expect(stats.receivedBatches).toBe(3);
    expect(stats.receivedEvents).toBe(4);
    expect(stats.enqueuedBatches).toBe(3);
    expect(stats.enqueuedEvents).toBe(4);
    expect(stats.drainedBatches).toBe(3);
    expect(stats.drainedEvents).toBe(4);

    // Returned stats are cloned.
    stats.receivedBatches = 0;
    expect(queue.getStats().receivedBatches).toBe(3);
  });

  it('spawns late events within grace and drops events that are too old', () => {
    const queue = new GameEventQueue({ tickRate: 20, graceMs: 150 });
    queue.drain(10);

    const withinGrace = queue.push(makeBatch(10), 0, 10.8);
    expect(withinGrace).toHaveLength(1);

    const tooOld = queue.push(makeBatch(0, 2), 0, 20);
    expect(tooOld).toEqual([]);

    const stats = queue.getStats();
    expect(stats.lateBatches).toBe(1);
    expect(stats.lateEvents).toBe(1);
    expect(stats.droppedBatches).toBe(1);
    expect(stats.droppedEvents).toBe(2);
  });

  it('uses last drained tick when render tick is missing for late batches', () => {
    const queue = new GameEventQueue({ tickRate: 20, graceMs: 150 });
    queue.drain(10);

    const withinGrace = queue.push(makeBatch(10), 0, null);
    expect(withinGrace).toHaveLength(1);
  });

  it('drops queued ticks that fall outside the grace window when draining', () => {
    const queue = new GameEventQueue({ tickRate: 60, graceMs: 150 });
    // Drain a small baseline so lastDrainedTick is established.
    queue.drain(0);

    queue.push(makeBatch(1), 0, 0);
    queue.push(makeBatch(2), 0, 0);
    queue.push(makeBatch(3), 0, 0);

    const drained = queue.drain(20);
    expect(drained).toEqual([]);
    const stats = queue.getStats();
    expect(stats.droppedBatches).toBe(3);
    expect(stats.drainedBatches).toBe(0);
  });

  it('prunes buffered ticks based on the current render tick', () => {
    const queue = new GameEventQueue({ maxBufferedTicks: 1 });
    queue.push(makeBatch(0), 0, 10);

    expect(queue.drain(0)).toEqual([]);
    expect(queue.getStats()).toEqual(
      expect.objectContaining({ enqueuedBatches: 1, droppedBatches: 1 })
    );
  });

  it('skips pruning when no render tick is available', () => {
    const queue = new GameEventQueue({ maxBufferedTicks: 1 });
    queue.push(makeBatch(1), 0, null);

    expect(queue.getStats().droppedBatches).toBe(0);
  });

  it('clears the queue when render tick moves backwards', () => {
    const queue = new GameEventQueue();
    // Establish the initial render tick.
    expect(queue.drain(5)).toEqual([]);
    queue.push(makeBatch(6), 0, 6);
    expect(queue.drain(6)).toHaveLength(1);
    queue.push(makeBatch(7), 0, 7);

    // Tick went backwards; queue is cleared and will not emit the old batch.
    const drained = queue.drain(2);
    expect(drained).toEqual([]);
    const afterClear = queue.push(makeBatch(3), 0, 2);
    expect(afterClear).toEqual([]);
    expect(queue.drain(3)).toHaveLength(1);
  });

  it('ignores invalid tickRate updates', () => {
    const queue = new GameEventQueue({ tickRate: 10 });
    queue.setTickRate(Number.NaN);
    queue.setTickRate(0);

    queue.push(makeBatch(1), 0, null);
    expect(queue.drain(1)).toHaveLength(1);
  });

  it('recomputes grace ticks when tick rate changes', () => {
    const queue = new GameEventQueue({ tickRate: 60, graceMs: 150 });
    queue.drain(10);

    queue.setTickRate(10);

    // Now the grace window is small enough that this becomes too old.
    const lateImmediate = queue.push(makeBatch(7), 0, 10);
    expect(lateImmediate).toEqual([]);
    expect(queue.getStats().droppedBatches).toBe(1);
  });

  it('does nothing when draining the same tick twice', () => {
    const queue = new GameEventQueue();
    queue.drain(5);
    expect(queue.drain(5)).toEqual([]);
  });
});
