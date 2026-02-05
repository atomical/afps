import type { GameEventBatch } from './protocol';

export interface GameEventQueueStats {
  receivedBatches: number;
  receivedEvents: number;
  enqueuedBatches: number;
  enqueuedEvents: number;
  drainedBatches: number;
  drainedEvents: number;
  lateBatches: number;
  lateEvents: number;
  droppedBatches: number;
  droppedEvents: number;
}

export interface GameEventQueueOptions {
  tickRate?: number;
  graceMs?: number;
  maxBufferedTicks?: number;
}

type QueuedBatch = {
  batch: GameEventBatch;
  receivedAtMs: number;
};

const DEFAULT_TICK_RATE = 60;
const DEFAULT_GRACE_MS = 150;
const DEFAULT_MAX_BUFFERED_TICKS = 180;

const clampInt = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
};

const isFiniteNumber = (value: number) => Number.isFinite(value);

const cloneStats = (stats: GameEventQueueStats): GameEventQueueStats => ({ ...stats });

export class GameEventQueue {
  private tickRate = DEFAULT_TICK_RATE;
  private graceMs = DEFAULT_GRACE_MS;
  private graceTicks = 0;
  private maxBufferedTicks = DEFAULT_MAX_BUFFERED_TICKS;
  private byTick = new Map<number, QueuedBatch[]>();
  private lastDrainedTick: number | null = null;
  private stats: GameEventQueueStats = {
    receivedBatches: 0,
    receivedEvents: 0,
    enqueuedBatches: 0,
    enqueuedEvents: 0,
    drainedBatches: 0,
    drainedEvents: 0,
    lateBatches: 0,
    lateEvents: 0,
    droppedBatches: 0,
    droppedEvents: 0
  };

  constructor(options: GameEventQueueOptions = {}) {
    if (isFiniteNumber(options.tickRate) && options.tickRate > 0) {
      this.tickRate = Math.floor(options.tickRate);
    }
    if (isFiniteNumber(options.graceMs) && options.graceMs >= 0) {
      this.graceMs = options.graceMs;
    }
    if (isFiniteNumber(options.maxBufferedTicks) && options.maxBufferedTicks > 0) {
      this.maxBufferedTicks = Math.floor(options.maxBufferedTicks);
    }
    this.recomputeGraceTicks();
  }

  setTickRate(tickRate: number) {
    if (!isFiniteNumber(tickRate) || tickRate <= 0) {
      return;
    }
    this.tickRate = Math.floor(tickRate);
    this.recomputeGraceTicks();
  }

  getStats(): GameEventQueueStats {
    return cloneStats(this.stats);
  }

  clear() {
    this.byTick.clear();
    this.lastDrainedTick = null;
  }

  push(batch: GameEventBatch, receivedAtMs: number, renderTick: number | null) {
    const tick = clampInt(batch.serverTick, 0, Number.MAX_SAFE_INTEGER);
    this.stats.receivedBatches += 1;
    this.stats.receivedEvents += batch.events.length;

    if (this.lastDrainedTick !== null && tick <= this.lastDrainedTick) {
      const referenceTick =
        typeof renderTick === 'number' && Number.isFinite(renderTick) ? Math.floor(renderTick) : this.lastDrainedTick;
      const lateByTicks = referenceTick - tick;
      if (lateByTicks <= this.graceTicks) {
        this.stats.lateBatches += 1;
        this.stats.lateEvents += batch.events.length;
        return [batch];
      }
      this.stats.droppedBatches += 1;
      this.stats.droppedEvents += batch.events.length;
      return [];
    }

    const entry: QueuedBatch = { batch, receivedAtMs };
    const list = this.byTick.get(tick);
    if (list) {
      list.push(entry);
    } else {
      this.byTick.set(tick, [entry]);
    }
    this.stats.enqueuedBatches += 1;
    this.stats.enqueuedEvents += batch.events.length;

    this.prune(renderTick);
    return [];
  }

  drain(renderTick: number | null) {
    if (typeof renderTick !== 'number' || !Number.isFinite(renderTick)) {
      return [];
    }
    const targetTick = clampInt(renderTick, 0, Number.MAX_SAFE_INTEGER);

    if (this.lastDrainedTick !== null && targetTick < this.lastDrainedTick) {
      this.clear();
    }

    if (this.lastDrainedTick === null) {
      this.lastDrainedTick = targetTick - this.graceTicks - 1;
    }

    if (targetTick <= this.lastDrainedTick) {
      return [];
    }

    const minAllowedTick = targetTick - this.graceTicks;
    const startTick = this.lastDrainedTick + 1;
    if (startTick < minAllowedTick) {
      this.dropQueuedOlderThan(minAllowedTick);
      this.lastDrainedTick = minAllowedTick - 1;
    }

    const due: GameEventBatch[] = [];
    for (let tick = this.lastDrainedTick + 1; tick <= targetTick; tick += 1) {
      const queued = this.byTick.get(tick);
      if (queued) {
        for (const entry of queued) {
          due.push(entry.batch);
          this.stats.drainedBatches += 1;
          this.stats.drainedEvents += entry.batch.events.length;
        }
        this.byTick.delete(tick);
      }
    }
    this.lastDrainedTick = targetTick;
    this.prune(renderTick);
    return due;
  }

  private recomputeGraceTicks() {
    const tickSeconds = 1 / Math.max(1, this.tickRate);
    const graceSeconds = this.graceMs / 1000;
    this.graceTicks = Math.max(0, Math.ceil(graceSeconds / tickSeconds));
  }

  private dropQueuedOlderThan(minTick: number) {
    for (const [tick, entries] of this.byTick.entries()) {
      if (tick >= minTick) {
        continue;
      }
      this.byTick.delete(tick);
      this.stats.droppedBatches += entries.length;
      for (const entry of entries) {
        this.stats.droppedEvents += entry.batch.events.length;
      }
    }
  }

  private prune(renderTick: number | null) {
    const renderAnchor =
      typeof renderTick === 'number' && Number.isFinite(renderTick) ? Math.floor(renderTick) : null;
    const anchorTick = this.lastDrainedTick ?? renderAnchor;
    if (anchorTick === null) {
      return;
    }
    const minTick = anchorTick - this.maxBufferedTicks;
    this.dropQueuedOlderThan(minTick);
  }
}
