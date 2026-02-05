import {
  SNAPSHOT_MASK_POS_X,
  SNAPSHOT_MASK_POS_Y,
  SNAPSHOT_MASK_POS_Z,
  SNAPSHOT_MASK_VEL_X,
  SNAPSHOT_MASK_VEL_Y,
  SNAPSHOT_MASK_VEL_Z,
  SNAPSHOT_MASK_WEAPON_SLOT,
  SNAPSHOT_MASK_AMMO_IN_MAG,
  SNAPSHOT_MASK_DASH_COOLDOWN,
  SNAPSHOT_MASK_HEALTH,
  SNAPSHOT_MASK_KILLS,
  SNAPSHOT_MASK_DEATHS,
  SNAPSHOT_MASK_VIEW_YAW_Q,
  SNAPSHOT_MASK_VIEW_PITCH_Q,
  SNAPSHOT_MASK_PLAYER_FLAGS,
  SNAPSHOT_MASK_WEAPON_HEAT_Q,
  SNAPSHOT_MASK_LOADOUT_BITS,
  type SnapshotMessage,
  type StateSnapshot,
  type StateSnapshotDelta
} from './protocol';

export class SnapshotDecoder {
  private baseByClient: Map<string, StateSnapshot> = new Map();
  private readonly defaultKey = '__default__';

  reset() {
    this.baseByClient.clear();
  }

  apply(message: StateSnapshot): StateSnapshot;
  apply(message: StateSnapshotDelta): StateSnapshot | null;
  apply(message: SnapshotMessage): StateSnapshot | null {
    if (message.type === 'StateSnapshot') {
      const key = message.clientId ?? this.defaultKey;
      this.baseByClient.set(key, message);
      return message;
    }
    let key = message.clientId ?? this.defaultKey;
    let base = this.baseByClient.get(key);
    if (!base && !message.clientId && this.baseByClient.size === 1) {
      const [onlyKey, onlyBase] = this.baseByClient.entries().next().value as [string, StateSnapshot];
      key = onlyKey;
      base = onlyBase;
    }
    if (!base) {
      return null;
    }
    if (message.baseTick !== base.serverTick) {
      return null;
    }

    const mask = message.mask;
    return {
      type: 'StateSnapshot',
      serverTick: message.serverTick,
      lastProcessedInputSeq: message.lastProcessedInputSeq,
      posX: mask & SNAPSHOT_MASK_POS_X ? (message.posX ?? base.posX) : base.posX,
      posY: mask & SNAPSHOT_MASK_POS_Y ? (message.posY ?? base.posY) : base.posY,
      posZ: mask & SNAPSHOT_MASK_POS_Z ? (message.posZ ?? base.posZ) : base.posZ,
      velX: mask & SNAPSHOT_MASK_VEL_X ? (message.velX ?? base.velX) : base.velX,
      velY: mask & SNAPSHOT_MASK_VEL_Y ? (message.velY ?? base.velY) : base.velY,
      velZ: mask & SNAPSHOT_MASK_VEL_Z ? (message.velZ ?? base.velZ) : base.velZ,
      weaponSlot:
        mask & SNAPSHOT_MASK_WEAPON_SLOT ? (message.weaponSlot ?? base.weaponSlot) : base.weaponSlot,
      ammoInMag:
        mask & SNAPSHOT_MASK_AMMO_IN_MAG ? (message.ammoInMag ?? base.ammoInMag) : base.ammoInMag,
      dashCooldown: mask & SNAPSHOT_MASK_DASH_COOLDOWN ? (message.dashCooldown ?? base.dashCooldown) : base.dashCooldown,
      health: mask & SNAPSHOT_MASK_HEALTH ? (message.health ?? base.health) : base.health,
      kills: mask & SNAPSHOT_MASK_KILLS ? (message.kills ?? base.kills) : base.kills,
      deaths: mask & SNAPSHOT_MASK_DEATHS ? (message.deaths ?? base.deaths) : base.deaths,
      viewYawQ:
        mask & SNAPSHOT_MASK_VIEW_YAW_Q ? (message.viewYawQ ?? base.viewYawQ) : base.viewYawQ,
      viewPitchQ:
        mask & SNAPSHOT_MASK_VIEW_PITCH_Q ? (message.viewPitchQ ?? base.viewPitchQ) : base.viewPitchQ,
      playerFlags:
        mask & SNAPSHOT_MASK_PLAYER_FLAGS ? (message.playerFlags ?? base.playerFlags) : base.playerFlags,
      weaponHeatQ:
        mask & SNAPSHOT_MASK_WEAPON_HEAT_Q ? (message.weaponHeatQ ?? base.weaponHeatQ) : base.weaponHeatQ,
      loadoutBits:
        mask & SNAPSHOT_MASK_LOADOUT_BITS ? (message.loadoutBits ?? base.loadoutBits) : base.loadoutBits,
      clientId: message.clientId ?? base.clientId
    };
  }
}
