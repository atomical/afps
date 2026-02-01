import rawConfig from '../../../shared/sim/config.json';

export interface SimConfig {
  moveSpeed: number;
  sprintMultiplier: number;
  accel: number;
  friction: number;
  gravity: number;
  jumpVelocity: number;
  dashImpulse: number;
  dashCooldown: number;
  grappleMaxDistance: number;
  grapplePullStrength: number;
  grappleDamping: number;
  grappleCooldown: number;
  grappleMinAttachNormalY: number;
  grappleRopeSlack: number;
  arenaHalfSize: number;
  playerRadius: number;
  obstacleMinX: number;
  obstacleMaxX: number;
  obstacleMinY: number;
  obstacleMaxY: number;
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
  moveSpeed: 5,
  sprintMultiplier: 1.5,
  accel: 50,
  friction: 8,
  gravity: 30,
  jumpVelocity: 7.5,
  dashImpulse: 12,
  dashCooldown: 0.5,
  grappleMaxDistance: 20,
  grapplePullStrength: 25,
  grappleDamping: 4,
  grappleCooldown: 1,
  grappleMinAttachNormalY: 0.2,
  grappleRopeSlack: 0.5,
  arenaHalfSize: 50,
  playerRadius: 0.5,
  obstacleMinX: 0,
  obstacleMaxX: 0,
  obstacleMinY: 0,
  obstacleMaxY: 0
};

const readNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export const parseSimConfig = (value: unknown): SimConfig => {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_SIM_CONFIG;
  }
  const record = value as Record<string, unknown>;
  const moveSpeed = readNumber(record.moveSpeed) ?? DEFAULT_SIM_CONFIG.moveSpeed;
  const sprintMultiplier = readNumber(record.sprintMultiplier) ?? DEFAULT_SIM_CONFIG.sprintMultiplier;
  const accel = readNumber(record.accel) ?? DEFAULT_SIM_CONFIG.accel;
  const friction = readNumber(record.friction) ?? DEFAULT_SIM_CONFIG.friction;
  const gravity = readNumber(record.gravity) ?? DEFAULT_SIM_CONFIG.gravity;
  const jumpVelocity = readNumber(record.jumpVelocity) ?? DEFAULT_SIM_CONFIG.jumpVelocity;
  const dashImpulse = readNumber(record.dashImpulse) ?? DEFAULT_SIM_CONFIG.dashImpulse;
  const dashCooldown = readNumber(record.dashCooldown) ?? DEFAULT_SIM_CONFIG.dashCooldown;
  const grappleMaxDistance = readNumber(record.grappleMaxDistance) ?? DEFAULT_SIM_CONFIG.grappleMaxDistance;
  const grapplePullStrength = readNumber(record.grapplePullStrength) ?? DEFAULT_SIM_CONFIG.grapplePullStrength;
  const grappleDamping = readNumber(record.grappleDamping) ?? DEFAULT_SIM_CONFIG.grappleDamping;
  const grappleCooldown = readNumber(record.grappleCooldown) ?? DEFAULT_SIM_CONFIG.grappleCooldown;
  const grappleMinAttachNormalY =
    readNumber(record.grappleMinAttachNormalY) ?? DEFAULT_SIM_CONFIG.grappleMinAttachNormalY;
  const grappleRopeSlack = readNumber(record.grappleRopeSlack) ?? DEFAULT_SIM_CONFIG.grappleRopeSlack;
  const arenaHalfSize = readNumber(record.arenaHalfSize) ?? DEFAULT_SIM_CONFIG.arenaHalfSize;
  const playerRadius = readNumber(record.playerRadius) ?? DEFAULT_SIM_CONFIG.playerRadius;
  const obstacleMinX = readNumber(record.obstacleMinX) ?? DEFAULT_SIM_CONFIG.obstacleMinX;
  const obstacleMaxX = readNumber(record.obstacleMaxX) ?? DEFAULT_SIM_CONFIG.obstacleMaxX;
  const obstacleMinY = readNumber(record.obstacleMinY) ?? DEFAULT_SIM_CONFIG.obstacleMinY;
  const obstacleMaxY = readNumber(record.obstacleMaxY) ?? DEFAULT_SIM_CONFIG.obstacleMaxY;
  return {
    moveSpeed,
    sprintMultiplier,
    accel,
    friction,
    gravity,
    jumpVelocity,
    dashImpulse,
    dashCooldown,
    grappleMaxDistance,
    grapplePullStrength,
    grappleDamping,
    grappleCooldown,
    grappleMinAttachNormalY,
    grappleRopeSlack,
    arenaHalfSize,
    playerRadius,
    obstacleMinX,
    obstacleMaxX,
    obstacleMinY,
    obstacleMaxY
  };
};

export const SIM_CONFIG = parseSimConfig(rawConfig);
