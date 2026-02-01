import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wasmDir = path.join(root, 'shared', 'wasm', 'dist');
const jsPath = path.join(wasmDir, 'afps_sim.js');
const wasmPath = path.join(wasmDir, 'afps_sim.wasm');
const configPath = path.join(root, 'shared', 'sim', 'config.json');

if (!fs.existsSync(jsPath) || !fs.existsSync(wasmPath)) {
  console.error('WASM build output missing. Run `cd client && npm run wasm:build` first.');
  process.exit(1);
}

if (!fs.existsSync(configPath)) {
  console.error('Missing shared sim config.json.');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const moveSpeed = Number(config.moveSpeed);
const sprintMultiplier = Number(config.sprintMultiplier);
const accel = Number(config.accel);
const friction = Number(config.friction);
const gravity = Number(config.gravity);
const jumpVelocity = Number(config.jumpVelocity);
const dashImpulse = Number(config.dashImpulse);
const dashCooldown = Number(config.dashCooldown);
const arenaHalfSize = Number(config.arenaHalfSize);
const playerRadius = Number(config.playerRadius);
const obstacleMinX = Number(config.obstacleMinX);
const obstacleMaxX = Number(config.obstacleMaxX);
const obstacleMinY = Number(config.obstacleMinY);
const obstacleMaxY = Number(config.obstacleMaxY);
if (
  !Number.isFinite(moveSpeed) ||
  !Number.isFinite(sprintMultiplier) ||
  !Number.isFinite(accel) ||
  !Number.isFinite(friction) ||
  !Number.isFinite(gravity) ||
  !Number.isFinite(jumpVelocity) ||
  !Number.isFinite(dashImpulse) ||
  !Number.isFinite(dashCooldown) ||
  !Number.isFinite(arenaHalfSize) ||
  !Number.isFinite(playerRadius) ||
  !Number.isFinite(obstacleMinX) ||
  !Number.isFinite(obstacleMaxX) ||
  !Number.isFinite(obstacleMinY) ||
  !Number.isFinite(obstacleMaxY)
) {
  console.error('Invalid movement values in config.json.');
  process.exit(1);
}

const moduleImport = await import(pathToFileURL(jsPath).href);
const factory = moduleImport.default ?? moduleImport;
if (typeof factory !== 'function') {
  console.error('WASM module did not export a factory function.');
  process.exit(1);
}

const module = await factory({
  locateFile: (file) => path.join(wasmDir, file),
  noInitialRun: true
});

const handle = module._sim_create();
module._sim_set_config(
  handle,
  moveSpeed,
  sprintMultiplier,
  accel,
  friction,
  gravity,
  jumpVelocity,
  dashImpulse,
  dashCooldown,
  arenaHalfSize,
  playerRadius,
  obstacleMinX,
  obstacleMaxX,
  obstacleMinY,
  obstacleMaxY
);

const dt = 1 / 60;
const simulate = () => {
  let x = 0;
  let y = 0;
  let z = 0;
  let velX = 0;
  let velY = 0;
  let velZ = 0;
  let grounded = true;
  let dashCooldownRemaining = 0;
  const safeHalfSize = Math.max(0, arenaHalfSize);
  const safeRadius = Math.min(Math.max(0, playerRadius), safeHalfSize);
  const arena = safeHalfSize > 0 ? { min: -safeHalfSize + safeRadius, max: safeHalfSize - safeRadius } : null;
  const obstacle =
    obstacleMinX < obstacleMaxX && obstacleMinY < obstacleMaxY
      ? {
          minX: obstacleMinX - Math.max(0, playerRadius),
          maxX: obstacleMaxX + Math.max(0, playerRadius),
          minY: obstacleMinY - Math.max(0, playerRadius),
          maxY: obstacleMaxY + Math.max(0, playerRadius)
        }
      : null;

  const resolveArenaPenetration = (minBound, maxBound) => {
    if (x < minBound) {
      x = minBound;
      if (velX < 0) {
        velX = 0;
      }
    } else if (x > maxBound) {
      x = maxBound;
      if (velX > 0) {
        velX = 0;
      }
    }
    if (y < minBound) {
      y = minBound;
      if (velY < 0) {
        velY = 0;
      }
    } else if (y > maxBound) {
      y = maxBound;
      if (velY > 0) {
        velY = 0;
      }
    }
  };

  const resolveObstaclePenetration = (minX, maxX, minY, maxY) => {
    const left = x - minX;
    const right = maxX - x;
    const down = y - minY;
    const up = maxY - y;
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
      x = minX;
      if (velX < 0) {
        velX = 0;
      }
    } else if (axis === 1) {
      x = maxX;
      if (velX > 0) {
        velX = 0;
      }
    } else if (axis === 2) {
      y = minY;
      if (velY < 0) {
        velY = 0;
      }
    } else {
      y = maxY;
      if (velY > 0) {
        velY = 0;
      }
    }
  };

  const considerSweepHit = (best, t, normalX, normalY, clampX, clampXValid, clampY, clampYValid) => {
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

  const sweepSegmentAabb = (startX, startY, deltaX, deltaY, minX, maxX, minY, maxY) => {
    let tEntry = 0;
    let tExit = 1;
    let normalX = 0;
    let normalY = 0;
    const updateAxis = (start, delta, min, max, axisX) => {
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

  const sweepArenaBounds = (prevX, prevY, deltaX, deltaY, minBound, maxBound, best) => {
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

  const sweepObstacleBounds = (prevX, prevY, deltaX, deltaY, minX, maxX, minY, maxY, best) => {
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

  const advanceWithCollisions = (dtStep) => {
    let remaining = dtStep;
    for (let iteration = 0; iteration < 3 && remaining > 0; iteration += 1) {
      if (arena) {
        if (x < arena.min || x > arena.max || y < arena.min || y > arena.max) {
          resolveArenaPenetration(arena.min, arena.max);
        }
      }
      if (obstacle) {
        if (x >= obstacle.minX && x <= obstacle.maxX && y >= obstacle.minY && y <= obstacle.maxY) {
          resolveObstaclePenetration(obstacle.minX, obstacle.maxX, obstacle.minY, obstacle.maxY);
        }
      }

      const prevX = x;
      const prevY = y;
      const deltaX = velX * remaining;
      const deltaY = velY * remaining;
      if (deltaX === 0 && deltaY === 0) {
        break;
      }

      const best = {
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
        x = prevX + deltaX;
        y = prevY + deltaY;
        break;
      }

      x = prevX + deltaX * best.t;
      y = prevY + deltaY * best.t;
      if (best.clampXValid) {
        x = best.clampX;
      }
      if (best.clampYValid) {
        y = best.clampY;
      }

      if (best.normalX !== 0 && velX * best.normalX < 0) {
        velX = 0;
      }
      if (best.normalY !== 0 && velY * best.normalY < 0) {
        velY = 0;
      }

      remaining *= 1 - best.t;
    }

    if (obstacle) {
      if (x >= obstacle.minX && x <= obstacle.maxX && y >= obstacle.minY && y <= obstacle.maxY) {
        resolveObstaclePenetration(obstacle.minX, obstacle.maxX, obstacle.minY, obstacle.maxY);
      }
    }
    if (arena) {
      resolveArenaPenetration(arena.min, arena.max);
    }
  };
  const step = (moveX, moveY, sprint, jump, dash) => {
    const safeAccel = Math.max(0, accel);
    const safeFriction = Math.max(0, friction);
    let maxSpeed = Math.max(0, moveSpeed);
    const sprintMul = sprintMultiplier > 0 ? sprintMultiplier : 1;
    if (sprint) {
      maxSpeed *= sprintMul;
    }
    let wishX = Math.max(-1, Math.min(1, moveX));
    let wishY = Math.max(-1, Math.min(1, moveY));
    let wishMag = Math.hypot(wishX, wishY);
    if (wishMag > 1) {
      wishX /= wishMag;
      wishY /= wishMag;
      wishMag = 1;
    }
    if (wishMag > 0 && maxSpeed > 0 && safeAccel > 0) {
      const dirX = wishX / wishMag;
      const dirY = wishY / wishMag;
      velX += dirX * safeAccel * dt;
      velY += dirY * safeAccel * dt;
      const speed = Math.hypot(velX, velY);
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        velX *= scale;
        velY *= scale;
      }
    } else if (safeFriction > 0) {
      const speed = Math.hypot(velX, velY);
      if (speed > 0) {
        const drop = safeFriction * dt;
        const newSpeed = Math.max(0, speed - drop);
        const scale = newSpeed / speed;
        velX *= scale;
        velY *= scale;
      }
    }

    const safeDashCooldown = Math.max(0, dashCooldown);
    if (!Number.isFinite(dashCooldownRemaining) || dashCooldownRemaining < 0) {
      dashCooldownRemaining = 0;
    } else if (dashCooldownRemaining > 0) {
      dashCooldownRemaining = Math.max(0, dashCooldownRemaining - dt);
    }

    const safeDashImpulse = Math.max(0, dashImpulse);
    if (dash && safeDashImpulse > 0 && dashCooldownRemaining <= 0) {
      let dashDirX = 0;
      let dashDirY = 0;
      if (wishMag > 0) {
        dashDirX = wishX / wishMag;
        dashDirY = wishY / wishMag;
      } else {
        const speed = Math.hypot(velX, velY);
        if (speed > 0) {
          dashDirX = velX / speed;
          dashDirY = velY / speed;
        }
      }
      if (dashDirX !== 0 || dashDirY !== 0) {
        velX += dashDirX * safeDashImpulse;
        velY += dashDirY * safeDashImpulse;
        dashCooldownRemaining = safeDashCooldown;
      }
    }

    const safeJumpVelocity = Math.max(0, jumpVelocity);
    if (grounded) {
      if (jump && safeJumpVelocity > 0) {
        velZ = safeJumpVelocity;
        grounded = false;
      } else if (velZ < 0) {
        velZ = 0;
      }
    }

    const safeGravity = Math.max(0, gravity);
    if (!grounded && safeGravity > 0) {
      velZ -= safeGravity * dt;
    }
    advanceWithCollisions(dt);

    z += velZ * dt;
    if (!Number.isFinite(z)) {
      z = 0;
      velZ = 0;
      grounded = true;
    } else if (z <= 0) {
      z = 0;
      if (velZ < 0) {
        velZ = 0;
      }
      grounded = true;
    } else {
      grounded = false;
    }
  };
  for (let i = 0; i < 10; i += 1) step(1, 0, false, false, false);
  for (let i = 0; i < 5; i += 1) step(1, 0, true, false, false);
  for (let i = 0; i < 10; i += 1) step(0, -1, false, i === 0, false);
  return { x, y, z, velX, velY, velZ };
};

for (let i = 0; i < 10; i += 1) {
  module._sim_step(handle, dt, 1, 0, 0, 0, 0);
}
for (let i = 0; i < 5; i += 1) {
  module._sim_step(handle, dt, 1, 0, 1, 0, 0);
}
for (let i = 0; i < 10; i += 1) {
  module._sim_step(handle, dt, 0, -1, 0, i === 0 ? 1 : 0, 0);
}

const wasmX = module._sim_get_x(handle);
const wasmY = module._sim_get_y(handle);
const wasmZ = module._sim_get_z(handle);
const wasmVx = module._sim_get_vx(handle);
const wasmVy = module._sim_get_vy(handle);
const wasmVz = module._sim_get_vz(handle);
module._sim_destroy(handle);

const expected = simulate();
const expectedX = expected.x;
const expectedY = expected.y;
const expectedZ = expected.z;
const expectedVx = expected.velX;
const expectedVy = expected.velY;
const expectedVz = expected.velZ;

const cppGolden = {
  x: 1.808673303244431,
  y: -0.509745584867058,
  z: 0.7916666666666666,
  velX: 2.049335142362279,
  velY: -4.560726419582628,
  velZ: 2.5
};

const epsilon = 1e-6;
const deltaX = Math.abs(wasmX - expectedX);
const deltaY = Math.abs(wasmY - expectedY);
const deltaZ = Math.abs(wasmZ - expectedZ);
const deltaVx = Math.abs(wasmVx - expectedVx);
const deltaVy = Math.abs(wasmVy - expectedVy);
const deltaVz = Math.abs(wasmVz - expectedVz);

if (deltaX > epsilon || deltaY > epsilon || deltaZ > epsilon || deltaVx > epsilon || deltaVy > epsilon || deltaVz > epsilon) {
  console.error(
    `WASM parity mismatch. Expected (${expectedX.toFixed(6)}, ${expectedY.toFixed(6)}, ${expectedZ.toFixed(6)}, ` +
      `${expectedVx.toFixed(6)}, ${expectedVy.toFixed(6)}, ${expectedVz.toFixed(6)}) got (${wasmX.toFixed(6)}, ` +
      `${wasmY.toFixed(6)}, ${wasmZ.toFixed(6)}, ${wasmVx.toFixed(6)}, ${wasmVy.toFixed(6)}, ${wasmVz.toFixed(6)})`
  );
  process.exit(1);
}

const cppDeltaX = Math.abs(wasmX - cppGolden.x);
const cppDeltaY = Math.abs(wasmY - cppGolden.y);
const cppDeltaZ = Math.abs(wasmZ - cppGolden.z);
const cppDeltaVx = Math.abs(wasmVx - cppGolden.velX);
const cppDeltaVy = Math.abs(wasmVy - cppGolden.velY);
const cppDeltaVz = Math.abs(wasmVz - cppGolden.velZ);
if (cppDeltaX > epsilon || cppDeltaY > epsilon || cppDeltaZ > epsilon || cppDeltaVx > epsilon || cppDeltaVy > epsilon || cppDeltaVz > epsilon) {
  console.error(
    `WASM vs C++ golden mismatch. Expected (${cppGolden.x.toFixed(6)}, ${cppGolden.y.toFixed(6)}, ` +
      `${cppGolden.z.toFixed(6)}, ${cppGolden.velX.toFixed(6)}, ${cppGolden.velY.toFixed(6)}, ` +
      `${cppGolden.velZ.toFixed(6)}) got (${wasmX.toFixed(6)}, ${wasmY.toFixed(6)}, ${wasmZ.toFixed(6)}, ` +
      `${wasmVx.toFixed(6)}, ${wasmVy.toFixed(6)}, ${wasmVz.toFixed(6)})`
  );
  process.exit(1);
}

console.log(
  `WASM parity check OK (dx=${deltaX.toExponential()}, dy=${deltaY.toExponential()}, dz=${deltaZ.toExponential()}, ` +
    `dvx=${deltaVx.toExponential()}, dvy=${deltaVy.toExponential()}, dvz=${deltaVz.toExponential()}).`
);
