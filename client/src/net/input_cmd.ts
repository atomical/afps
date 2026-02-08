import type { InputSample } from '../input/sampler';

export interface DecalDebugReport {
  serverTick: number;
  shotSeq: number;
  hitKind: number;
  surfaceType: number;
  authoritativeWorldHit: boolean;
  usedProjectedHit: boolean;
  usedImpactProjection: boolean;
  decalSpawned: boolean;
  decalInFrustum: boolean;
  decalDistance: number;
  decalPositionX: number;
  decalPositionY: number;
  decalPositionZ: number;
  decalNormalX: number;
  decalNormalY: number;
  decalNormalZ: number;
  traceHitPositionX: number;
  traceHitPositionY: number;
  traceHitPositionZ: number;
  traceHitNormalX: number;
  traceHitNormalY: number;
  traceHitNormalZ: number;
}

export interface InputCmd {
  type: 'InputCmd';
  inputSeq: number;
  moveX: number;
  moveY: number;
  lookDeltaX: number;
  lookDeltaY: number;
  viewYaw: number;
  viewPitch: number;
  weaponSlot: number;
  jump: boolean;
  fire: boolean;
  ads: boolean;
  sprint: boolean;
  crouch: boolean;
  dash: boolean;
  grapple: boolean;
  shield: boolean;
  shockwave: boolean;
  debugDecalReport?: DecalDebugReport;
}

const clampAxis = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, value));
};

const safeNumber = (value: number) => (Number.isFinite(value) ? value : 0);
const safeSlot = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);

export const buildInputCmd = (inputSeq: number, sample: InputSample): InputCmd => ({
  type: 'InputCmd',
  inputSeq: Math.max(0, Math.floor(safeNumber(inputSeq))),
  moveX: clampAxis(sample.moveX),
  moveY: clampAxis(sample.moveY),
  lookDeltaX: safeNumber(sample.lookDeltaX),
  lookDeltaY: safeNumber(sample.lookDeltaY),
  viewYaw: 0,
  viewPitch: 0,
  weaponSlot: safeSlot(sample.weaponSlot),
  jump: Boolean(sample.jump),
  fire: Boolean(sample.fire),
  ads: Boolean(sample.ads),
  sprint: Boolean(sample.sprint),
  crouch: Boolean(sample.crouch),
  dash: Boolean(sample.dash),
  grapple: Boolean(sample.grapple),
  shield: Boolean(sample.shield),
  shockwave: Boolean(sample.shockwave)
});
