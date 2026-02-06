import type { InputCmd } from './input_cmd';
import type { StateSnapshot } from './protocol';
import { SIM_CONFIG, type SimConfig, resolveEyeHeight } from '../sim/config';
import { sanitizeColliders, type AabbCollider } from '../world/collision';

export type PredictionInput = Pick<
  InputCmd,
  'moveX' | 'moveY' | 'sprint' | 'jump' | 'dash' | 'grapple' | 'shield' | 'shockwave'
> &
  Partial<Pick<InputCmd, 'viewYaw' | 'viewPitch'>>;

export interface PredictionSim {
  step: (input: PredictionInput, dt: number) => void;
  getState: () => {
    x: number;
    y: number;
    z: number;
    velX: number;
    velY: number;
    velZ: number;
    dashCooldown: number;
    shieldTimer: number;
    shieldCooldown: number;
    shieldActive: boolean;
    shockwaveCooldown: number;
  };
  setState: (x: number, y: number, z: number, velX: number, velY: number, velZ: number, dashCooldown: number) => void;
  reset: () => void;
  setConfig: (config: SimConfig) => void;
  setColliders?: (colliders: readonly AabbCollider[]) => void;
  __setShieldCooldown?: (value: number) => void;
  __setGrappleCooldown?: (value: number) => void;
}

export interface PredictedState {
  x: number;
  y: number;
  z: number;
  velX: number;
  velY: number;
  velZ: number;
  dashCooldown: number;
  lastProcessedInputSeq: number;
}

const DEFAULT_TICK_RATE = 60;
const MAX_HISTORY = 120;

const clampAxis = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, value));
};

const toNumber = (value: number) => (Number.isFinite(value) ? value : 0);

const WRAP_PI = Math.PI;
const MAX_PITCH = Math.PI / 2 - 0.01;
const RAY_EPSILON = 1e-8;
const DEFAULT_PLAYER_HEIGHT = 1.7;

type CollisionRaycastHit = {
  hit: boolean;
  t: number;
  nx: number;
  ny: number;
  nz: number;
  colliderId?: number;
  surfaceType?: number;
};

const wrapAngle = (angle: number) => {
  const safeAngle = Number.isFinite(angle) ? angle : 0;
  let wrapped = ((safeAngle + WRAP_PI) % (2 * WRAP_PI));
  if (wrapped < 0) {
    wrapped += 2 * WRAP_PI;
  }
  return wrapped - WRAP_PI;
};

const sanitizeViewAngles = (yaw: number, pitch: number) => {
  const safeYaw = wrapAngle(yaw);
  const safePitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, Number.isFinite(pitch) ? pitch : 0));
  return { yaw: safeYaw, pitch: safePitch };
};

const viewDirection = (yaw: number, pitch: number) => {
  const angles = sanitizeViewAngles(yaw, pitch);
  const cosPitch = Math.cos(angles.pitch);
  let x = Math.sin(angles.yaw) * cosPitch;
  let y = -Math.cos(angles.yaw) * cosPitch;
  let z = Math.sin(angles.pitch);
  const len = Math.hypot(x, y, z) || 1;
  x /= len;
  y /= len;
  z /= len;
  return { x, y, z };
};

const raycastAabb2D = (
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  best: CollisionRaycastHit
) => {
  if (!Number.isFinite(dirX) || !Number.isFinite(dirY)) {
    return;
  }

  const testPlaneX = (planeX: number, normalX: number) => {
    if (Math.abs(dirX) < RAY_EPSILON) {
      return;
    }
    const t = (planeX - originX) / dirX;
    if (!Number.isFinite(t) || t < 0 || t >= best.t) {
      return;
    }
    const hitY = originY + dirY * t;
    if (hitY < minY || hitY > maxY) {
      return;
    }
    best.hit = true;
    best.t = t;
    best.nx = normalX;
    best.ny = 0;
    best.nz = 0;
  };

  const testPlaneY = (planeY: number, normalY: number) => {
    if (Math.abs(dirY) < RAY_EPSILON) {
      return;
    }
    const t = (planeY - originY) / dirY;
    if (!Number.isFinite(t) || t < 0 || t >= best.t) {
      return;
    }
    const hitX = originX + dirX * t;
    if (hitX < minX || hitX > maxX) {
      return;
    }
    best.hit = true;
    best.t = t;
    best.nx = 0;
    best.ny = normalY;
    best.nz = 0;
  };

  testPlaneX(minX, -1);
  testPlaneX(maxX, 1);
  testPlaneY(minY, -1);
  testPlaneY(maxY, 1);
};

const raycastAabb3D = (
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  min: { x: number; y: number; z: number },
  max: { x: number; y: number; z: number }
) => {
  let tMin = Number.NEGATIVE_INFINITY;
  let tMax = Number.POSITIVE_INFINITY;
  let nearNx = 0;
  let nearNy = 0;
  let nearNz = 0;
  let farNx = 0;
  let farNy = 0;
  let farNz = 0;
  let nx = 0;
  let ny = 0;
  let nz = 0;

  const updateAxis = (
    originAxis: number,
    dirAxis: number,
    minAxis: number,
    maxAxis: number,
    axisX: number,
    axisY: number,
    axisZ: number
  ) => {
    if (Math.abs(dirAxis) < RAY_EPSILON) {
      return originAxis >= minAxis && originAxis <= maxAxis;
    }
    const inv = 1 / dirAxis;
    let t1 = (minAxis - originAxis) * inv;
    let t2 = (maxAxis - originAxis) * inv;
    let axisNearNx = -axisX;
    let axisNearNy = -axisY;
    let axisNearNz = -axisZ;
    let axisFarNx = axisX;
    let axisFarNy = axisY;
    let axisFarNz = axisZ;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      axisNearNx = axisX;
      axisNearNy = axisY;
      axisNearNz = axisZ;
      axisFarNx = -axisX;
      axisFarNy = -axisY;
      axisFarNz = -axisZ;
    }
    if (t1 > tMin) {
      tMin = t1;
      nearNx = axisNearNx;
      nearNy = axisNearNy;
      nearNz = axisNearNz;
    }
    if (t2 < tMax) {
      tMax = t2;
      farNx = axisFarNx;
      farNy = axisFarNy;
      farNz = axisFarNz;
    }
    return tMin <= tMax;
  };

  if (!updateAxis(origin.x, dir.x, min.x, max.x, 1, 0, 0)) {
    return null;
  }
  if (!updateAxis(origin.y, dir.y, min.y, max.y, 0, 1, 0)) {
    return null;
  }
  if (!updateAxis(origin.z, dir.z, min.z, max.z, 0, 0, 1)) {
    return null;
  }
  if (tMax < 0) {
    return null;
  }
  const entering = tMin >= 0;
  const t = entering ? tMin : tMax;
  if (!Number.isFinite(t) || t < 0) {
    return null;
  }
  if (entering) {
    nx = nearNx;
    ny = nearNy;
    nz = nearNz;
  } else {
    nx = farNx;
    ny = farNy;
    nz = farNz;
  }
  return { t, nx, ny, nz };
};

const raycastWorld = (
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  config: SimConfig,
  colliders: readonly AabbCollider[]
) => {
  const best: CollisionRaycastHit = { hit: false, t: Number.POSITIVE_INFINITY, nx: 0, ny: 0, nz: 0 };
  if (Math.abs(dir.x) < RAY_EPSILON && Math.abs(dir.y) < RAY_EPSILON && Math.abs(dir.z) < RAY_EPSILON) {
    return best;
  }
  if (Number.isFinite(config.arenaHalfSize) && config.arenaHalfSize > 0) {
    const half = Math.max(0, config.arenaHalfSize);
    const beforeT = best.t;
    raycastAabb2D(origin.x, origin.y, dir.x, dir.y, -half, half, -half, half, best);
    if (best.hit && best.t < beforeT) {
      best.colliderId = -1;
      best.surfaceType = 0;
    }

    const testPlaneZ = (planeZ: number, normalZ: number) => {
      if (Math.abs(dir.z) < RAY_EPSILON) {
        return;
      }
      const t = (planeZ - origin.z) / dir.z;
      if (!Number.isFinite(t) || t < 0 || t >= best.t) {
        return;
      }
      const hitX = origin.x + dir.x * t;
      const hitY = origin.y + dir.y * t;
      if (hitX < -half || hitX > half || hitY < -half || hitY > half) {
        return;
      }
      best.hit = true;
      best.t = t;
      best.nx = 0;
      best.ny = 0;
      best.nz = normalZ;
      best.colliderId = -1;
      best.surfaceType = normalZ > 0 ? 2 : 0;
    };

    const playerHeight = Math.max(0, config.playerHeight);
    const ceilingZ = Math.max(0, half - playerHeight);
    testPlaneZ(0, 1);
    testPlaneZ(ceilingZ, -1);
  }
  if (
    Number.isFinite(config.obstacleMinX) &&
    Number.isFinite(config.obstacleMaxX) &&
    Number.isFinite(config.obstacleMinY) &&
    Number.isFinite(config.obstacleMaxY) &&
    config.obstacleMinX < config.obstacleMaxX &&
    config.obstacleMinY < config.obstacleMaxY
  ) {
    const beforeT = best.t;
    raycastAabb2D(
      origin.x,
      origin.y,
      dir.x,
      dir.y,
      config.obstacleMinX,
      config.obstacleMaxX,
      config.obstacleMinY,
      config.obstacleMaxY,
      best
    );
    if (best.hit && best.t < beforeT) {
      best.colliderId = -2;
      best.surfaceType = 1;
    }
  }
  for (const collider of colliders) {
    const hit = raycastAabb3D(
      origin,
      dir,
      { x: collider.minX, y: collider.minY, z: collider.minZ },
      { x: collider.maxX, y: collider.maxY, z: collider.maxZ }
    );
    if (!hit || hit.t >= best.t) {
      continue;
    }
    best.hit = true;
    best.t = hit.t;
    best.nx = hit.nx;
    best.ny = hit.ny;
    best.nz = hit.nz;
    best.colliderId = collider.id;
    best.surfaceType = Number(collider.surfaceType) | 0;
  }
  return best;
};

export const createJsPredictionSim = (config: SimConfig = SIM_CONFIG): PredictionSim => {
  let state = {
    x: 0,
    y: 0,
    z: 0,
    velX: 0,
    velY: 0,
    velZ: 0,
    grounded: true,
    dashCooldown: 0,
    grappleCooldown: 0,
    grappleActive: false,
    grappleInput: false,
    grappleAnchorX: 0,
    grappleAnchorY: 0,
    grappleAnchorZ: 0,
    grappleAnchorNX: 0,
    grappleAnchorNY: 0,
    grappleAnchorNZ: 0,
    grappleLength: 0,
    shieldTimer: 0,
    shieldCooldown: 0,
    shieldActive: false,
    shieldInput: false,
    shockwaveCooldown: 0,
    shockwaveInput: false
  };
  const currentConfig = { ...SIM_CONFIG };
  let worldColliders: AabbCollider[] = [];
  const WALKABLE_NORMAL_Z = 0.7;

  const setConfig = (next: SimConfig) => {
    if (Number.isFinite(next.moveSpeed) && next.moveSpeed > 0) {
      currentConfig.moveSpeed = next.moveSpeed;
    }
    if (Number.isFinite(next.sprintMultiplier) && next.sprintMultiplier > 0) {
      currentConfig.sprintMultiplier = next.sprintMultiplier;
    }
    if (Number.isFinite(next.accel) && next.accel >= 0) {
      currentConfig.accel = next.accel;
    }
    if (Number.isFinite(next.friction) && next.friction >= 0) {
      currentConfig.friction = next.friction;
    }
    if (Number.isFinite(next.gravity) && next.gravity >= 0) {
      currentConfig.gravity = next.gravity;
    }
    if (Number.isFinite(next.jumpVelocity) && next.jumpVelocity >= 0) {
      currentConfig.jumpVelocity = next.jumpVelocity;
    }
    if (Number.isFinite(next.dashImpulse) && next.dashImpulse >= 0) {
      currentConfig.dashImpulse = next.dashImpulse;
    }
    if (Number.isFinite(next.dashCooldown) && next.dashCooldown >= 0) {
      currentConfig.dashCooldown = next.dashCooldown;
    }
    if (Number.isFinite(next.grappleMaxDistance) && next.grappleMaxDistance >= 0) {
      currentConfig.grappleMaxDistance = next.grappleMaxDistance;
    }
    if (Number.isFinite(next.grapplePullStrength) && next.grapplePullStrength >= 0) {
      currentConfig.grapplePullStrength = next.grapplePullStrength;
    }
    if (Number.isFinite(next.grappleDamping) && next.grappleDamping >= 0) {
      currentConfig.grappleDamping = next.grappleDamping;
    }
    if (Number.isFinite(next.grappleCooldown) && next.grappleCooldown >= 0) {
      currentConfig.grappleCooldown = next.grappleCooldown;
    }
    if (Number.isFinite(next.grappleMinAttachNormalY)) {
      currentConfig.grappleMinAttachNormalY = next.grappleMinAttachNormalY;
    }
    if (Number.isFinite(next.grappleRopeSlack) && next.grappleRopeSlack >= 0) {
      currentConfig.grappleRopeSlack = next.grappleRopeSlack;
    }
    if (Number.isFinite(next.shieldDuration) && next.shieldDuration >= 0) {
      currentConfig.shieldDuration = next.shieldDuration;
    }
    if (Number.isFinite(next.shieldCooldown) && next.shieldCooldown >= 0) {
      currentConfig.shieldCooldown = next.shieldCooldown;
    }
    if (Number.isFinite(next.shieldDamageMultiplier)) {
      currentConfig.shieldDamageMultiplier = next.shieldDamageMultiplier;
    }
    if (Number.isFinite(next.shockwaveRadius) && next.shockwaveRadius >= 0) {
      currentConfig.shockwaveRadius = next.shockwaveRadius;
    }
    if (Number.isFinite(next.shockwaveImpulse) && next.shockwaveImpulse >= 0) {
      currentConfig.shockwaveImpulse = next.shockwaveImpulse;
    }
    if (Number.isFinite(next.shockwaveCooldown) && next.shockwaveCooldown >= 0) {
      currentConfig.shockwaveCooldown = next.shockwaveCooldown;
    }
    if (Number.isFinite(next.shockwaveDamage) && next.shockwaveDamage >= 0) {
      currentConfig.shockwaveDamage = next.shockwaveDamage;
    }
    if (Number.isFinite(next.arenaHalfSize) && next.arenaHalfSize >= 0) {
      currentConfig.arenaHalfSize = next.arenaHalfSize;
    }
    if (Number.isFinite(next.playerRadius) && next.playerRadius >= 0) {
      currentConfig.playerRadius = next.playerRadius;
    }
    if (Number.isFinite(next.playerHeight) && next.playerHeight >= 0) {
      currentConfig.playerHeight = next.playerHeight;
    }
    currentConfig.obstacleMinX = next.obstacleMinX;
    currentConfig.obstacleMaxX = next.obstacleMaxX;
    currentConfig.obstacleMinY = next.obstacleMinY;
    currentConfig.obstacleMaxY = next.obstacleMaxY;
  };

  const setColliders = (colliders: readonly AabbCollider[]) => {
    worldColliders = sanitizeColliders(colliders);
  };

  const resolveAabbPenetration = (minX: number, maxX: number, minY: number, maxY: number) => {
    const left = state.x - minX;
    const right = maxX - state.x;
    const down = state.y - minY;
    const up = maxY - state.y;
    let minPen = left;
    let axis = 0;
    if (right < minPen) {
      minPen = right;
      axis = 1;
    }
    if (down < minPen) {
      minPen = down;
      axis = 2;
    }
    if (up < minPen) {
      axis = 3;
    }
    if (axis === 0) {
      state.x = minX;
      if (state.velX < 0) {
        state.velX = 0;
      }
    } else if (axis === 1) {
      state.x = maxX;
      if (state.velX > 0) {
        state.velX = 0;
      }
    } else if (axis === 2) {
      state.y = minY;
      if (state.velY < 0) {
        state.velY = 0;
      }
    } else {
      state.y = maxY;
      if (state.velY > 0) {
        state.velY = 0;
      }
    }
  };

  type ExpandedAabb2D = {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };

  const resolvePlayerHeightForCollision = () => {
    if (!Number.isFinite(currentConfig.playerHeight) || currentConfig.playerHeight <= 0) {
      return DEFAULT_PLAYER_HEIGHT;
    }
    return currentConfig.playerHeight;
  };

  const getExpandedColliders = (): ExpandedAabb2D[] => {
    const expanded: ExpandedAabb2D[] = [];
    const radius = Math.max(0, toNumber(currentConfig.playerRadius));
    const playerMinZ = state.z;
    const playerMaxZ = state.z + resolvePlayerHeightForCollision();
    for (const collider of worldColliders) {
      if (playerMaxZ <= collider.minZ || playerMinZ >= collider.maxZ) {
        continue;
      }
      expanded.push({
        minX: collider.minX - radius,
        maxX: collider.maxX + radius,
        minY: collider.minY - radius,
        maxY: collider.maxY + radius
      });
    }
    if (
      Number.isFinite(currentConfig.obstacleMinX) &&
      Number.isFinite(currentConfig.obstacleMaxX) &&
      Number.isFinite(currentConfig.obstacleMinY) &&
      Number.isFinite(currentConfig.obstacleMaxY) &&
      currentConfig.obstacleMinX < currentConfig.obstacleMaxX &&
      currentConfig.obstacleMinY < currentConfig.obstacleMaxY
    ) {
      expanded.push({
        minX: currentConfig.obstacleMinX - radius,
        maxX: currentConfig.obstacleMaxX + radius,
        minY: currentConfig.obstacleMinY - radius,
        maxY: currentConfig.obstacleMaxY + radius
      });
    }
    return expanded;
  };

  const sweepSegmentAabb = (
    startX: number,
    startY: number,
    deltaX: number,
    deltaY: number,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number
  ) => {
    let tEntry = 0;
    let tExit = 1;
    let normalX = 0;
    let normalY = 0;

    const updateAxis = (start: number, delta: number, min: number, max: number, axisX: boolean) => {
      if (delta === 0) {
        return !(start < min || start > max);
      }
      const inv = 1 / delta;
      const t1 = (min - start) * inv;
      const t2 = (max - start) * inv;
      const axisEntry = Math.min(t1, t2);
      const axisExit = Math.max(t1, t2);
      if (axisEntry > tEntry) {
        tEntry = axisEntry;
        if (axisX) {
          normalX = delta > 0 ? -1 : 1;
          normalY = 0;
        } else {
          normalX = 0;
          normalY = delta > 0 ? -1 : 1;
        }
      }
      if (axisExit < tExit) {
        tExit = axisExit;
      }
      return tEntry <= tExit;
    };

    if (!updateAxis(startX, deltaX, minX, maxX, true)) {
      return null;
    }
    if (!updateAxis(startY, deltaY, minY, maxY, false)) {
      return null;
    }
    return { t: Math.max(0, tEntry), normalX, normalY };
  };

  const getArenaBounds = () => {
    const halfSize = Math.max(0, toNumber(currentConfig.arenaHalfSize));
    if (halfSize <= 0) {
      return null;
    }
    const radius = Math.min(Math.max(0, currentConfig.playerRadius), halfSize);
    return { min: -halfSize + radius, max: halfSize - radius };
  };

  const resolveArenaPenetration = (minBound: number, maxBound: number) => {
    if (state.x < minBound) {
      state.x = minBound;
      if (state.velX < 0) {
        state.velX = 0;
      }
    } else if (state.x > maxBound) {
      state.x = maxBound;
      if (state.velX > 0) {
        state.velX = 0;
      }
    }
    if (state.y < minBound) {
      state.y = minBound;
      if (state.velY < 0) {
        state.velY = 0;
      }
    } else if (state.y > maxBound) {
      state.y = maxBound;
      if (state.velY > 0) {
        state.velY = 0;
      }
    }
  };

  type SweepHit = {
    hit: boolean;
    t: number;
    normalX: number;
    normalY: number;
    clampX: number;
    clampY: number;
    clampXValid: boolean;
    clampYValid: boolean;
  };

  const considerSweepHit = (
    best: SweepHit,
    t: number,
    normalX: number,
    normalY: number,
    clampX: number,
    clampXValid: boolean,
    clampY: number,
    clampYValid: boolean
  ) => {
    if (!best.hit || t < best.t) {
      best.hit = true;
      best.t = t;
      best.normalX = normalX;
      best.normalY = normalY;
      best.clampX = clampX;
      best.clampY = clampY;
      best.clampXValid = clampXValid;
      best.clampYValid = clampYValid;
    }
  };

  const sweepArenaBounds = (
    prevX: number,
    prevY: number,
    deltaX: number,
    deltaY: number,
    minBound: number,
    maxBound: number,
    best: SweepHit
  ) => {
    if (deltaX > 0 && prevX + deltaX > maxBound) {
      const t = (maxBound - prevX) / deltaX;
      considerSweepHit(best, t, -1, 0, maxBound, true, 0, false);
    } else if (deltaX < 0 && prevX + deltaX < minBound) {
      const t = (minBound - prevX) / deltaX;
      considerSweepHit(best, t, 1, 0, minBound, true, 0, false);
    }

    if (deltaY > 0 && prevY + deltaY > maxBound) {
      const t = (maxBound - prevY) / deltaY;
      considerSweepHit(best, t, 0, -1, 0, false, maxBound, true);
    } else if (deltaY < 0 && prevY + deltaY < minBound) {
      const t = (minBound - prevY) / deltaY;
      considerSweepHit(best, t, 0, 1, 0, false, minBound, true);
    }
  };

  const sweepAabb = (
    prevX: number,
    prevY: number,
    deltaX: number,
    deltaY: number,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    best: SweepHit
  ) => {
    const hit = sweepSegmentAabb(prevX, prevY, deltaX, deltaY, minX, maxX, minY, maxY);
    if (!hit) {
      return;
    }
    let clampXValid = false;
    let clampX = 0;
    if (hit.normalX < 0) {
      clampX = minX;
      clampXValid = true;
    } else if (hit.normalX > 0) {
      clampX = maxX;
      clampXValid = true;
    }
    let clampYValid = false;
    let clampY = 0;
    if (hit.normalY < 0) {
      clampY = minY;
      clampYValid = true;
    } else if (hit.normalY > 0) {
      clampY = maxY;
      clampYValid = true;
    }
    considerSweepHit(best, hit.t, hit.normalX, hit.normalY, clampX, clampXValid, clampY, clampYValid);
  };

  const advanceWithCollisions = (dt: number) => {
    const arena = getArenaBounds();
    let remaining = dt;

    for (let iteration = 0; iteration < 3 && remaining > 0; iteration += 1) {
      const expandedColliders = getExpandedColliders();
      if (arena) {
        if (state.x < arena.min || state.x > arena.max || state.y < arena.min || state.y > arena.max) {
          resolveArenaPenetration(arena.min, arena.max);
        }
      }

      for (const collider of expandedColliders) {
        if (state.x >= collider.minX && state.x <= collider.maxX && state.y >= collider.minY && state.y <= collider.maxY) {
          resolveAabbPenetration(collider.minX, collider.maxX, collider.minY, collider.maxY);
        }
      }

      const prevX = state.x;
      const prevY = state.y;
      const deltaX = state.velX * remaining;
      const deltaY = state.velY * remaining;
      if (deltaX === 0 && deltaY === 0) {
        break;
      }

      const best: SweepHit = {
        hit: false,
        t: 1,
        normalX: 0,
        normalY: 0,
        clampX: 0,
        clampY: 0,
        clampXValid: false,
        clampYValid: false
      };

      if (arena) {
        sweepArenaBounds(prevX, prevY, deltaX, deltaY, arena.min, arena.max, best);
      }
      for (const collider of expandedColliders) {
        const prevInside =
          prevX >= collider.minX && prevX <= collider.maxX && prevY >= collider.minY && prevY <= collider.maxY;
        if (!prevInside) {
          sweepAabb(prevX, prevY, deltaX, deltaY, collider.minX, collider.maxX, collider.minY, collider.maxY, best);
        }
      }

      if (!best.hit) {
        state.x = prevX + deltaX;
        state.y = prevY + deltaY;
        break;
      }

      state.x = prevX + deltaX * best.t;
      state.y = prevY + deltaY * best.t;
      if (best.clampXValid) {
        state.x = best.clampX;
      }
      if (best.clampYValid) {
        state.y = best.clampY;
      }

      if (best.normalX !== 0 && state.velX * best.normalX < 0) {
        state.velX = 0;
      }
      if (best.normalY !== 0 && state.velY * best.normalY < 0) {
        state.velY = 0;
      }

      remaining *= 1 - best.t;
    }

    for (const collider of getExpandedColliders()) {
      if (state.x >= collider.minX && state.x <= collider.maxX && state.y >= collider.minY && state.y <= collider.maxY) {
        resolveAabbPenetration(collider.minX, collider.maxX, collider.minY, collider.maxY);
      }
    }
    if (arena) {
      resolveArenaPenetration(arena.min, arena.max);
    }
  };

  const step = (input: PredictionInput, dt: number) => {
    if (!Number.isFinite(dt) || dt <= 0) {
      return;
    }
    const accel = Math.max(0, currentConfig.accel);
    const friction = Math.max(0, currentConfig.friction);
    let maxSpeed = Math.max(0, currentConfig.moveSpeed);
    const sprintMultiplier = currentConfig.sprintMultiplier;
    if (input.sprint) {
      maxSpeed *= sprintMultiplier;
    }

    let wishX = clampAxis(input.moveX);
    let wishY = clampAxis(input.moveY);
    let wishMag = Math.hypot(wishX, wishY);
    if (wishMag > 1) {
      wishX /= wishMag;
      wishY /= wishMag;
      wishMag = 1;
    }

    if (wishMag > 0 && maxSpeed > 0 && accel > 0) {
      const dirX = wishX / wishMag;
      const dirY = wishY / wishMag;
      state.velX += dirX * accel * dt;
      state.velY += dirY * accel * dt;
      const speed = Math.hypot(state.velX, state.velY);
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        state.velX *= scale;
        state.velY *= scale;
      }
    } else if (friction > 0) {
      const speed = Math.hypot(state.velX, state.velY);
      if (speed > 0) {
        const drop = friction * dt;
        const newSpeed = Math.max(0, speed - drop);
        const scale = newSpeed / speed;
        state.velX *= scale;
        state.velY *= scale;
      }
    }

    const dashCooldown = Math.max(0, currentConfig.dashCooldown);
    if (!Number.isFinite(state.dashCooldown) || state.dashCooldown < 0) {
      state.dashCooldown = 0;
    } else if (state.dashCooldown > 0) {
      state.dashCooldown = Math.max(0, state.dashCooldown - dt);
    }

    const dashImpulse = Math.max(0, currentConfig.dashImpulse);
    if (input.dash && dashImpulse > 0 && state.dashCooldown <= 0) {
      let dashDirX = 0;
      let dashDirY = 0;
      if (wishMag > 0) {
        dashDirX = wishX / wishMag;
        dashDirY = wishY / wishMag;
      } else {
        const speed = Math.hypot(state.velX, state.velY);
        if (speed > 0) {
          dashDirX = state.velX / speed;
          dashDirY = state.velY / speed;
        }
      }
      if (dashDirX !== 0 || dashDirY !== 0) {
        state.velX += dashDirX * dashImpulse;
        state.velY += dashDirY * dashImpulse;
        state.dashCooldown = dashCooldown;
      }
    }

    const grappleCooldown = Math.max(0, currentConfig.grappleCooldown);
    const safeGrappleCooldown = Number.isFinite(state.grappleCooldown) ? state.grappleCooldown : 0;
    state.grappleCooldown = Math.max(0, safeGrappleCooldown);
    if (state.grappleCooldown > 0) {
      state.grappleCooldown = Math.max(0, state.grappleCooldown - dt);
    }

    const grapplePressed = Boolean(input.grapple) && !state.grappleInput;
    const grappleReleased = !input.grapple && state.grappleInput;
    state.grappleInput = Boolean(input.grapple);

    const releaseGrapple = () => {
      state.grappleActive = false;
      state.grappleLength = 0;
      state.grappleAnchorX = 0;
      state.grappleAnchorY = 0;
      state.grappleAnchorZ = 0;
      state.grappleAnchorNX = 0;
      state.grappleAnchorNY = 0;
      state.grappleAnchorNZ = 0;
      state.grappleCooldown = grappleCooldown;
    };

    if (grapplePressed && state.grappleCooldown <= 0) {
      const maxDistance = Math.max(0, currentConfig.grappleMaxDistance);
      if (maxDistance > 0) {
        const dir = viewDirection(input.viewYaw ?? 0, input.viewPitch ?? 0);
        const eyeHeight = resolveEyeHeight(currentConfig);
        const origin = { x: state.x, y: state.y, z: state.z + eyeHeight };
        const hit = raycastWorld(origin, dir, currentConfig, worldColliders);
        if (hit.hit && hit.t >= 0 && hit.t <= maxDistance) {
          let anchorX = origin.x + dir.x * hit.t;
          let anchorY = origin.y + dir.y * hit.t;
          let anchorZ = origin.z + dir.z * hit.t;
          let ceilingZ = Number.POSITIVE_INFINITY;
          if (Number.isFinite(currentConfig.arenaHalfSize) && currentConfig.arenaHalfSize > 0) {
            const halfSize = Math.max(0, currentConfig.arenaHalfSize);
            const playerHeight = Math.max(0, currentConfig.playerHeight);
            ceilingZ = Math.max(0, halfSize - playerHeight);
          }
          anchorZ = Math.max(0, Math.min(anchorZ, ceilingZ));
          const dx = anchorX - origin.x;
          const dy = anchorY - origin.y;
          const dz = anchorZ - origin.z;
          const anchorDist = Math.hypot(dx, dy, dz);
          const minAttachNormal = Math.max(0, currentConfig.grappleMinAttachNormalY);
          const allowAttach = Math.abs(hit.nz) < 1e-6 || minAttachNormal <= 0 || Math.abs(hit.nz) >= minAttachNormal;
          if (allowAttach && Number.isFinite(anchorDist)) {
            state.grappleActive = true;
            state.grappleAnchorX = anchorX;
            state.grappleAnchorY = anchorY;
            state.grappleAnchorZ = anchorZ;
            state.grappleAnchorNX = hit.nx;
            state.grappleAnchorNY = hit.ny;
            state.grappleAnchorNZ = hit.nz;
            state.grappleLength = Math.max(0, anchorDist);
          }
        }
      }
    }

    const shieldCooldown = Math.max(0, currentConfig.shieldCooldown);
    const safeShieldCooldown = Number.isFinite(state.shieldCooldown) ? state.shieldCooldown : 0;
    state.shieldCooldown = Math.max(0, safeShieldCooldown);
    if (state.shieldCooldown > 0) {
      state.shieldCooldown = Math.max(0, state.shieldCooldown - dt);
    }

    const shieldDuration = Math.max(0, currentConfig.shieldDuration);
    if (!Number.isFinite(state.shieldTimer) || state.shieldTimer < 0) {
      state.shieldTimer = 0;
    }
    const shieldPressed = Boolean(input.shield) && !state.shieldInput;
    const shieldReleased = !input.shield && state.shieldInput;
    state.shieldInput = Boolean(input.shield);

    const releaseShield = () => {
      state.shieldActive = false;
      state.shieldTimer = 0;
      state.shieldCooldown = shieldCooldown;
    };

    if (shieldPressed && state.shieldCooldown <= 0 && shieldDuration > 0) {
      state.shieldActive = true;
      state.shieldTimer = shieldDuration;
    }

    if (state.shieldActive) {
      if (shieldReleased) {
        releaseShield();
      } else {
        state.shieldTimer = Math.max(0, state.shieldTimer - dt);
        if (state.shieldTimer <= 0) {
          releaseShield();
        }
      }
    }

    const shockwaveCooldown = Math.max(0, currentConfig.shockwaveCooldown);
    const rawShockwaveCooldown = Number.isFinite(state.shockwaveCooldown) ? state.shockwaveCooldown : 0;
    if (rawShockwaveCooldown <= 0) {
      state.shockwaveCooldown = 0;
    } else {
      state.shockwaveCooldown = Math.max(0, rawShockwaveCooldown - dt);
    }
    const shockwavePressed = Boolean(input.shockwave) && !state.shockwaveInput;
    state.shockwaveInput = Boolean(input.shockwave);
    const shockwaveRadius = Math.max(0, currentConfig.shockwaveRadius);
    const shockwaveImpulse = Math.max(0, currentConfig.shockwaveImpulse);
    const shockwaveDamage = Math.max(0, currentConfig.shockwaveDamage);
    const shockwaveReady = shockwaveRadius > 0 && (shockwaveImpulse > 0 || shockwaveDamage > 0);
    if (shockwavePressed && state.shockwaveCooldown <= 0 && shockwaveReady) {
      state.shockwaveCooldown = shockwaveCooldown;
    }

    if (state.grappleActive) {
      if (grappleReleased) {
        releaseGrapple();
      } else {
        const eyeHeight = resolveEyeHeight(currentConfig);
        const origin = { x: state.x, y: state.y, z: state.z + eyeHeight };
        const dx = state.grappleAnchorX - origin.x;
        const dy = state.grappleAnchorY - origin.y;
        const dz = state.grappleAnchorZ - origin.z;
        const dist = Math.hypot(dx, dy, dz);
        if (!Number.isFinite(dist) || dist <= 0) {
          releaseGrapple();
        } else {
          const maxDistance = Math.max(0, currentConfig.grappleMaxDistance);
          const ropeSlack = Math.max(0, currentConfig.grappleRopeSlack);
          if (maxDistance > 0 && dist > maxDistance + ropeSlack) {
            releaseGrapple();
          } else {
            const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
            const losHit = raycastWorld(origin, dir, currentConfig, worldColliders);
            if (!losHit.hit || losHit.t + 1e-4 < dist) {
              releaseGrapple();
            } else if (dist > state.grappleLength + ropeSlack) {
              const stretch = dist - state.grappleLength - ropeSlack;
              const pullStrength = Math.max(0, currentConfig.grapplePullStrength);
              const damping = Math.max(0, currentConfig.grappleDamping);
              const velAlong = state.velX * dir.x + state.velY * dir.y + state.velZ * dir.z;
              const accel = pullStrength * stretch - damping * velAlong;
              if (Number.isFinite(accel) && accel > 0) {
                state.velX += dir.x * accel * dt;
                state.velY += dir.y * accel * dt;
                state.velZ += dir.z * accel * dt;
              }
            }
          }
        }
      }
    }

    const jumpVelocity = Math.max(0, currentConfig.jumpVelocity);
    if (state.grounded) {
      if (input.jump && jumpVelocity > 0) {
        state.velZ = jumpVelocity;
        state.grounded = false;
      } else if (state.velZ < 0) {
        state.velZ = 0;
      }
    }

    const gravity = Math.max(0, currentConfig.gravity);
    if (!state.grounded && gravity > 0) {
      state.velZ -= gravity * dt;
    }

    advanceWithCollisions(dt);

    const playerHeight = Math.max(0, currentConfig.playerHeight);
    let ceilingZ = Number.POSITIVE_INFINITY;
    if (Number.isFinite(currentConfig.arenaHalfSize) && currentConfig.arenaHalfSize > 0) {
      const halfSize = Math.max(0, currentConfig.arenaHalfSize);
      ceilingZ = Math.max(0, halfSize - playerHeight);
    }

    state.z += state.velZ * dt;
    if (!Number.isFinite(state.z)) {
      state.z = 0;
      state.velZ = 0;
      state.grounded = true;
    } else if (state.z > ceilingZ) {
      state.z = ceilingZ;
      if (state.velZ > 0) {
        state.velZ = 0;
      }
    } else if (state.z <= 0) {
      state.z = 0;
      if (state.velZ < 0) {
        state.velZ = 0;
      }
      state.grounded = 1 >= WALKABLE_NORMAL_Z;
    } else {
      state.grounded = false;
    }
  };

  const setState = (x: number, y: number, z: number, velX: number, velY: number, velZ: number, dashCooldown: number) => {
    state.x = toNumber(x);
    state.y = toNumber(y);
    const safeZ = toNumber(z);
    const playerHeight = Math.max(0, currentConfig.playerHeight);
    let ceilingZ = Number.POSITIVE_INFINITY;
    if (Number.isFinite(currentConfig.arenaHalfSize) && currentConfig.arenaHalfSize > 0) {
      const halfSize = Math.max(0, currentConfig.arenaHalfSize);
      ceilingZ = Math.max(0, halfSize - playerHeight);
    }
    const clampedZ = Math.min(safeZ > 0 ? safeZ : 0, ceilingZ);
    state.z = clampedZ;
    state.velX = toNumber(velX);
    state.velY = toNumber(velY);
    state.velZ = toNumber(velZ);
    state.grounded = state.z <= 0;
    state.dashCooldown = Number.isFinite(dashCooldown) && dashCooldown > 0 ? dashCooldown : 0;
    state.shieldTimer = 0;
    state.shieldCooldown = 0;
    state.shieldActive = false;
    state.shieldInput = false;
    state.shockwaveCooldown = 0;
    state.shockwaveInput = false;
  };

  const getState = () => ({
    x: state.x,
    y: state.y,
    z: state.z,
    velX: state.velX,
    velY: state.velY,
    velZ: state.velZ,
    dashCooldown: state.dashCooldown,
    grappleActive: state.grappleActive,
    grappleAnchorZ: state.grappleAnchorZ,
    grappleLength: state.grappleLength,
    grappleCooldown: state.grappleCooldown,
    shieldTimer: state.shieldTimer,
    shieldCooldown: state.shieldCooldown,
    shieldActive: state.shieldActive,
    shockwaveCooldown: state.shockwaveCooldown
  });

  const reset = () => {
    state = {
      x: 0,
      y: 0,
      z: 0,
      velX: 0,
      velY: 0,
      velZ: 0,
      grounded: true,
      dashCooldown: 0,
      grappleCooldown: 0,
      grappleActive: false,
      grappleInput: false,
      grappleAnchorX: 0,
      grappleAnchorY: 0,
      grappleAnchorZ: 0,
      grappleAnchorNX: 0,
      grappleAnchorNY: 0,
      grappleAnchorNZ: 0,
      grappleLength: 0,
      shieldTimer: 0,
      shieldCooldown: 0,
      shieldActive: false,
      shieldInput: false,
      shockwaveCooldown: 0,
      shockwaveInput: false
    };
  };

  setConfig(config);

  const __setShieldCooldown = (value: number) => {
    state.shieldCooldown = value;
  };

  const __setGrappleCooldown = (value: number) => {
    state.grappleCooldown = value;
  };

  return { step, getState, setState, reset, setConfig, setColliders, __setShieldCooldown, __setGrappleCooldown };
};

export class ClientPrediction {
  private state: PredictedState = {
    x: 0,
    y: 0,
    z: 0,
    velX: 0,
    velY: 0,
    velZ: 0,
    dashCooldown: 0,
    lastProcessedInputSeq: -1
  };
  private tickRate = DEFAULT_TICK_RATE;
  private history: InputCmd[] = [];
  private lastInputSeq = 0;
  private active = false;
  private sim: PredictionSim;
  private simConfig: SimConfig = SIM_CONFIG;
  private colliders: AabbCollider[] = [];

  constructor(sim?: PredictionSim) {
    this.sim = sim ?? createJsPredictionSim(this.simConfig);
    this.sim.setConfig(this.simConfig);
    this.sim.setColliders?.(this.colliders);
  }

  setTickRate(tickRate: number) {
    if (Number.isFinite(tickRate) && tickRate > 0) {
      this.tickRate = tickRate;
    } else {
      this.tickRate = DEFAULT_TICK_RATE;
    }
  }

  isActive() {
    return this.active;
  }

  getState(): PredictedState {
    return { ...this.state };
  }

  getAbilityCooldowns() {
    const next = this.sim.getState();
    return {
      dash: next.dashCooldown,
      shockwave: next.shockwaveCooldown,
      shieldCooldown: next.shieldCooldown,
      shieldTimer: next.shieldTimer,
      shieldActive: next.shieldActive
    };
  }

  setSim(sim: PredictionSim) {
    this.sim = sim;
    this.sim.setConfig(this.simConfig);
    this.sim.setColliders?.(this.colliders);
    this.sim.setState(
      this.state.x,
      this.state.y,
      this.state.z,
      this.state.velX,
      this.state.velY,
      this.state.velZ,
      this.state.dashCooldown
    );
  }

  setColliders(colliders: readonly AabbCollider[]) {
    this.colliders = sanitizeColliders(colliders);
    this.sim.setColliders?.(this.colliders);
  }

  recordInput(cmd: InputCmd) {
    if (!Number.isFinite(cmd.inputSeq) || cmd.inputSeq <= this.lastInputSeq) {
      return;
    }
    this.active = true;
    this.lastInputSeq = cmd.inputSeq;
    this.history.push(cmd);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
    this.applyInput(cmd);
  }

  reconcile(snapshot: StateSnapshot) {
    this.sim.setState(
      snapshot.posX,
      snapshot.posY,
      snapshot.posZ,
      snapshot.velX,
      snapshot.velY,
      snapshot.velZ,
      snapshot.dashCooldown
    );
    this.state.lastProcessedInputSeq = snapshot.lastProcessedInputSeq;

    if (this.history.length > 0) {
      this.history = this.history.filter((entry) => entry.inputSeq > snapshot.lastProcessedInputSeq);
      for (const entry of this.history) {
        this.applyInput(entry);
      }
    }

    this.syncState();
  }

  private applyInput(cmd: InputCmd) {
    const dt = 1 / this.tickRate;
    this.sim.step(cmd, dt);
    this.syncState();
  }

  private syncState() {
    const next = this.sim.getState();
    this.state.x = next.x;
    this.state.y = next.y;
    this.state.z = next.z;
    this.state.velX = next.velX;
    this.state.velY = next.velY;
    this.state.velZ = next.velZ;
    this.state.dashCooldown = next.dashCooldown;
  }
}
