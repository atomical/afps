import { describe, expect, it } from 'vitest';
import { SIM_CONFIG } from '../../src/sim/config';
import { runWasmParityCheck } from '../../src/sim/parity';
import type { WasmSimInstance } from '../../src/sim/wasm';

type Config = {
  moveSpeed: number;
  sprintMultiplier: number;
  accel: number;
  friction: number;
  gravity: number;
  jumpVelocity: number;
  dashImpulse: number;
  dashCooldown: number;
  arenaHalfSize: number;
  playerRadius: number;
  playerHeight: number;
  obstacleMinX: number;
  obstacleMaxX: number;
  obstacleMinY: number;
  obstacleMaxY: number;
};

const clampAxis = (value: number) => Math.max(-1, Math.min(1, value));

const createFakeWasmSim = (speedScale = 1): WasmSimInstance => {
  let state = { x: 0, y: 0, z: 0, velX: 0, velY: 0, velZ: 0, grounded: true, dashCooldown: 0 };
  let config: Config = {
    ...SIM_CONFIG,
    accel: SIM_CONFIG.accel,
    friction: SIM_CONFIG.friction,
    arenaHalfSize: SIM_CONFIG.arenaHalfSize,
    playerRadius: SIM_CONFIG.playerRadius,
    playerHeight: SIM_CONFIG.playerHeight,
    obstacleMinX: SIM_CONFIG.obstacleMinX,
    obstacleMaxX: SIM_CONFIG.obstacleMaxX,
    obstacleMinY: SIM_CONFIG.obstacleMinY,
    obstacleMaxY: SIM_CONFIG.obstacleMaxY
  };

  const getArenaBounds = () => {
    const halfSize = Math.max(0, config.arenaHalfSize);
    if (halfSize <= 0) {
      return null;
    }
    const radius = Math.min(Math.max(0, config.playerRadius), halfSize);
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

  const getObstacleBounds = () => {
    if (
      !Number.isFinite(config.obstacleMinX) ||
      !Number.isFinite(config.obstacleMaxX) ||
      !Number.isFinite(config.obstacleMinY) ||
      !Number.isFinite(config.obstacleMaxY)
    ) {
      return null;
    }
    if (config.obstacleMinX >= config.obstacleMaxX || config.obstacleMinY >= config.obstacleMaxY) {
      return null;
    }
    const radius = Math.max(0, config.playerRadius);
    return {
      minX: config.obstacleMinX - radius,
      maxX: config.obstacleMaxX + radius,
      minY: config.obstacleMinY - radius,
      maxY: config.obstacleMaxY + radius
    };
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

  const sweepObstacleBounds = (
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

  const resolveObstaclePenetration = (minX: number, maxX: number, minY: number, maxY: number) => {
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

  const advanceWithCollisions = (dt: number) => {
    const arena = getArenaBounds();
    const obstacle = getObstacleBounds();
    let remaining = dt;

    for (let iteration = 0; iteration < 3 && remaining > 0; iteration += 1) {
      if (arena) {
        if (state.x < arena.min || state.x > arena.max || state.y < arena.min || state.y > arena.max) {
          resolveArenaPenetration(arena.min, arena.max);
        }
      }
      if (obstacle) {
        if (state.x >= obstacle.minX && state.x <= obstacle.maxX && state.y >= obstacle.minY && state.y <= obstacle.maxY) {
          resolveObstaclePenetration(obstacle.minX, obstacle.maxX, obstacle.minY, obstacle.maxY);
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
      if (obstacle) {
        const prevInside =
          prevX >= obstacle.minX && prevX <= obstacle.maxX && prevY >= obstacle.minY && prevY <= obstacle.maxY;
        if (!prevInside) {
          sweepObstacleBounds(prevX, prevY, deltaX, deltaY, obstacle.minX, obstacle.maxX, obstacle.minY, obstacle.maxY, best);
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

    if (obstacle) {
      if (state.x >= obstacle.minX && state.x <= obstacle.maxX && state.y >= obstacle.minY && state.y <= obstacle.maxY) {
        resolveObstaclePenetration(obstacle.minX, obstacle.maxX, obstacle.minY, obstacle.maxY);
      }
    }
    if (arena) {
      resolveArenaPenetration(arena.min, arena.max);
    }
  };

  return {
    step: (input, dt) => {
      if (!Number.isFinite(dt) || dt <= 0) {
        return;
      }
      const accel = Math.max(0, config.accel);
      const friction = Math.max(0, config.friction);
      let maxSpeed = Math.max(0, config.moveSpeed) * speedScale;
      const sprintMultiplier =
        Number.isFinite(config.sprintMultiplier) && config.sprintMultiplier > 0
          ? config.sprintMultiplier
          : 1;
      if (input.sprint) {
        maxSpeed *= sprintMultiplier;
      }
      let wishX = clampAxis(Number.isFinite(input.moveX) ? input.moveX : 0);
      let wishY = clampAxis(Number.isFinite(input.moveY) ? input.moveY : 0);
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
      const dashCooldown = Math.max(0, config.dashCooldown);
      if (!Number.isFinite(state.dashCooldown) || state.dashCooldown < 0) {
        state.dashCooldown = 0;
      } else if (state.dashCooldown > 0) {
        state.dashCooldown = Math.max(0, state.dashCooldown - dt);
      }

      const dashImpulse = Math.max(0, config.dashImpulse) * speedScale;
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

      const jumpVelocity = Math.max(0, config.jumpVelocity);
      if (state.grounded) {
        if (input.jump && jumpVelocity > 0) {
          state.velZ = jumpVelocity;
          state.grounded = false;
        } else if (state.velZ < 0) {
          state.velZ = 0;
        }
      }
      const gravity = Math.max(0, config.gravity);
      if (!state.grounded && gravity > 0) {
        state.velZ -= gravity * dt;
      }
      advanceWithCollisions(dt);
      const playerHeight = Number.isFinite(config.playerHeight) && config.playerHeight >= 0 ? config.playerHeight : 0;
      let ceilingZ = Number.POSITIVE_INFINITY;
      if (Number.isFinite(config.arenaHalfSize) && config.arenaHalfSize > 0) {
        const halfSize = Math.max(0, config.arenaHalfSize);
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
        state.grounded = 1 >= 0.7;
      } else {
        state.grounded = false;
      }
    },
    getState: () => ({
      x: state.x,
      y: state.y,
      z: state.z,
      velX: state.velX,
      velY: state.velY,
      velZ: state.velZ,
      dashCooldown: state.dashCooldown,
      shieldCooldown: 0,
      shieldTimer: 0,
      shockwaveCooldown: 0
    }),
    reset: () => {
      state = { x: 0, y: 0, z: 0, velX: 0, velY: 0, velZ: 0, grounded: true, dashCooldown: 0 };
    },
    setConfig: (next) => {
      config = {
        ...next,
        accel: (next as typeof SIM_CONFIG).accel,
        friction: (next as typeof SIM_CONFIG).friction,
        arenaHalfSize: (next as typeof SIM_CONFIG).arenaHalfSize,
        playerRadius: (next as typeof SIM_CONFIG).playerRadius,
        playerHeight: (next as typeof SIM_CONFIG).playerHeight,
        obstacleMinX: (next as typeof SIM_CONFIG).obstacleMinX,
        obstacleMaxX: (next as typeof SIM_CONFIG).obstacleMaxX,
        obstacleMinY: (next as typeof SIM_CONFIG).obstacleMinY,
        obstacleMaxY: (next as typeof SIM_CONFIG).obstacleMaxY
      };
    },
    setState: (x, y, z, velX, velY, velZ, dashCooldown) => {
      state = { x, y, z, velX, velY, velZ, grounded: z <= 0, dashCooldown: dashCooldown ?? 0 };
    },
    dispose: () => {}
  };
};

describe('runWasmParityCheck', () => {
  it('reports parity when sims match and resets state', () => {
    const sim = createFakeWasmSim(1);
    const result = runWasmParityCheck(sim);

    expect(result.ok).toBe(true);
    expect(result.deltaX).toBeCloseTo(0);
    expect(result.deltaY).toBeCloseTo(0);
    expect(result.deltaZ).toBeCloseTo(0);
    expect(result.deltaVx).toBeCloseTo(0);
    expect(result.deltaVy).toBeCloseTo(0);
    expect(result.deltaVz).toBeCloseTo(0);
    expect(sim.getState()).toEqual({
      x: 0,
      y: 0,
      z: 0,
      velX: 0,
      velY: 0,
      velZ: 0,
      dashCooldown: 0,
      shieldCooldown: 0,
      shieldTimer: 0,
      shockwaveCooldown: 0
    });
  });

  it('reports mismatch when sims diverge', () => {
    const sim = createFakeWasmSim(1.1);
    const result = runWasmParityCheck(sim, SIM_CONFIG, { epsilon: 1e-8 });

    expect(result.ok).toBe(false);
    expect(result.deltaX).toBeGreaterThan(0);
  });
});
