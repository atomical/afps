import {
  SNAPSHOT_MASK_POS_X,
  SNAPSHOT_MASK_POS_Y,
  SNAPSHOT_MASK_POS_Z,
  SNAPSHOT_MASK_VEL_X,
  SNAPSHOT_MASK_VEL_Y,
  SNAPSHOT_MASK_VEL_Z,
  SNAPSHOT_MASK_DASH_COOLDOWN,
  SNAPSHOT_MASK_HEALTH,
  SNAPSHOT_MASK_KILLS,
  SNAPSHOT_MASK_DEATHS,
  type SnapshotMessage,
  type StateSnapshot
} from './protocol';

export class SnapshotDecoder {
  private base: StateSnapshot | null = null;

  reset() {
    this.base = null;
  }

  apply(message: SnapshotMessage): StateSnapshot | null {
    if (message.type === 'StateSnapshot') {
      this.base = message;
      return message;
    }
    if (!this.base) {
      return null;
    }
    if (message.baseTick !== this.base.serverTick) {
      return null;
    }

    const mask = message.mask;
    return {
      type: 'StateSnapshot',
      serverTick: message.serverTick,
      lastProcessedInputSeq: message.lastProcessedInputSeq,
      posX: mask & SNAPSHOT_MASK_POS_X ? (message.posX ?? this.base.posX) : this.base.posX,
      posY: mask & SNAPSHOT_MASK_POS_Y ? (message.posY ?? this.base.posY) : this.base.posY,
      posZ: mask & SNAPSHOT_MASK_POS_Z ? (message.posZ ?? this.base.posZ) : this.base.posZ,
      velX: mask & SNAPSHOT_MASK_VEL_X ? (message.velX ?? this.base.velX) : this.base.velX,
      velY: mask & SNAPSHOT_MASK_VEL_Y ? (message.velY ?? this.base.velY) : this.base.velY,
      velZ: mask & SNAPSHOT_MASK_VEL_Z ? (message.velZ ?? this.base.velZ) : this.base.velZ,
      dashCooldown: mask & SNAPSHOT_MASK_DASH_COOLDOWN ? (message.dashCooldown ?? this.base.dashCooldown) : this.base.dashCooldown,
      health: mask & SNAPSHOT_MASK_HEALTH ? (message.health ?? this.base.health) : this.base.health,
      kills: mask & SNAPSHOT_MASK_KILLS ? (message.kills ?? this.base.kills) : this.base.kills,
      deaths: mask & SNAPSHOT_MASK_DEATHS ? (message.deaths ?? this.base.deaths) : this.base.deaths,
      clientId: message.clientId ?? this.base.clientId
    };
  }
}
