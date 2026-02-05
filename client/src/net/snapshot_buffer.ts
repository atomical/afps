import type { StateSnapshot } from './protocol';

interface BufferedSnapshot {
  snapshot: StateSnapshot;
  receivedAtMs: number;
}

export interface SnapshotBufferSample {
  snapshot: StateSnapshot;
  renderTick: number;
}

export class SnapshotBuffer {
  private buffer: BufferedSnapshot[] = [];
  private interpolationDelayMs = 100;
  private maxBufferSize = 6;

  constructor(snapshotRate = 20) {
    this.setSnapshotRate(snapshotRate);
  }

  setSnapshotRate(snapshotRate: number) {
    const safeRate = snapshotRate > 0 ? snapshotRate : 20;
    const intervalMs = 1000 / safeRate;
    this.interpolationDelayMs = intervalMs * 2;
  }

  push(snapshot: StateSnapshot, nowMs: number) {
    const last = this.buffer[this.buffer.length - 1];
    if (last && snapshot.serverTick < last.snapshot.serverTick) {
      return;
    }
    this.buffer.push({ snapshot, receivedAtMs: nowMs });
    while (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  sampleWithRenderTick(nowMs: number): SnapshotBufferSample | null {
    if (this.buffer.length === 0) {
      return null;
    }

    const targetMs = nowMs - this.interpolationDelayMs;
    while (this.buffer.length >= 2 && this.buffer[1].receivedAtMs <= targetMs) {
      this.buffer.shift();
    }

    if (this.buffer.length === 1) {
      const snapshot = this.buffer[0].snapshot;
      return {
        snapshot,
        renderTick: snapshot.serverTick
      };
    }

    const [older, newer] = this.buffer;
    const spanMs = newer.receivedAtMs - older.receivedAtMs;
    if (spanMs <= 0) {
      const snapshot = newer.snapshot;
      return {
        snapshot,
        renderTick: snapshot.serverTick
      };
    }

    const alpha = Math.min(1, Math.max(0, (targetMs - older.receivedAtMs) / spanMs));
    const tickDelta = newer.snapshot.serverTick - older.snapshot.serverTick;
    const renderTick = older.snapshot.serverTick + (Number.isFinite(tickDelta) ? tickDelta : 0) * alpha;
    return {
      snapshot: {
        type: 'StateSnapshot',
        serverTick: newer.snapshot.serverTick,
        lastProcessedInputSeq: newer.snapshot.lastProcessedInputSeq,
        posX: older.snapshot.posX + (newer.snapshot.posX - older.snapshot.posX) * alpha,
        posY: older.snapshot.posY + (newer.snapshot.posY - older.snapshot.posY) * alpha,
        posZ: older.snapshot.posZ + (newer.snapshot.posZ - older.snapshot.posZ) * alpha,
        velX: older.snapshot.velX + (newer.snapshot.velX - older.snapshot.velX) * alpha,
        velY: older.snapshot.velY + (newer.snapshot.velY - older.snapshot.velY) * alpha,
        velZ: older.snapshot.velZ + (newer.snapshot.velZ - older.snapshot.velZ) * alpha,
        weaponSlot: newer.snapshot.weaponSlot,
        ammoInMag: newer.snapshot.ammoInMag,
        dashCooldown:
          older.snapshot.dashCooldown + (newer.snapshot.dashCooldown - older.snapshot.dashCooldown) * alpha,
        health: newer.snapshot.health,
        kills: newer.snapshot.kills,
        deaths: newer.snapshot.deaths,
        viewYawQ: newer.snapshot.viewYawQ,
        viewPitchQ: newer.snapshot.viewPitchQ,
        playerFlags: newer.snapshot.playerFlags,
        weaponHeatQ: newer.snapshot.weaponHeatQ,
        loadoutBits: newer.snapshot.loadoutBits,
        clientId: newer.snapshot.clientId
      },
      renderTick
    };
  }

  sample(nowMs: number): StateSnapshot | null {
    return this.sampleWithRenderTick(nowMs)?.snapshot ?? null;
  }

  clear() {
    this.buffer = [];
  }
}
