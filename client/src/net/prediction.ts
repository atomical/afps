import type { InputCmd } from './input_cmd';
import type { StateSnapshot } from './protocol';
import { SIM_CONFIG, type SimConfig } from '../sim/config';

export type PredictionInput = Pick<InputCmd, 'moveX' | 'moveY' | 'sprint' | 'jump' | 'dash'>;

export interface PredictionSim {
  step: (input: PredictionInput, dt: number) => void;
  getState: () => { x: number; y: number; z: number; velX: number; velY: number; velZ: number; dashCooldown: number };
  setState: (x: number, y: number, z: number, velX: number, velY: number, velZ: number, dashCooldown: number) => void;
  reset: () => void;
  setConfig: (config: SimConfig) => void;
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

export const createJsPredictionSim = (config: SimConfig = SIM_CONFIG): PredictionSim => {
  let state = { x: 0, y: 0, z: 0, velX: 0, velY: 0, velZ: 0, grounded: true, dashCooldown: 0 };
  const currentConfig = { ...SIM_CONFIG };

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
    if (Number.isFinite(next.arenaHalfSize) && next.arenaHalfSize >= 0) {
      currentConfig.arenaHalfSize = next.arenaHalfSize;
    }
    if (Number.isFinite(next.playerRadius) && next.playerRadius >= 0) {
      currentConfig.playerRadius = next.playerRadius;
    }
    currentConfig.obstacleMinX = next.obstacleMinX;
    currentConfig.obstacleMaxX = next.obstacleMaxX;
    currentConfig.obstacleMinY = next.obstacleMinY;
    currentConfig.obstacleMaxY = next.obstacleMaxY;
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
    const halfSize = Number.isFinite(currentConfig.arenaHalfSize) ? Math.max(0, currentConfig.arenaHalfSize) : 0;
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

  const getObstacleBounds = () => {
    if (!Number.isFinite(currentConfig.obstacleMinX) || !Number.isFinite(currentConfig.obstacleMaxX)) {
      return null;
    }
    if (!Number.isFinite(currentConfig.obstacleMinY) || !Number.isFinite(currentConfig.obstacleMaxY)) {
      return null;
    }
    if (currentConfig.obstacleMinX >= currentConfig.obstacleMaxX || currentConfig.obstacleMinY >= currentConfig.obstacleMaxY) {
      return null;
    }
    const radius = Number.isFinite(currentConfig.playerRadius) ? Math.max(0, currentConfig.playerRadius) : 0;
    return {
      minX: currentConfig.obstacleMinX - radius,
      maxX: currentConfig.obstacleMaxX + radius,
      minY: currentConfig.obstacleMinY - radius,
      maxY: currentConfig.obstacleMaxY + radius
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

    state.z += state.velZ * dt;
    if (!Number.isFinite(state.z)) {
      state.z = 0;
      state.velZ = 0;
      state.grounded = true;
    } else if (state.z <= 0) {
      state.z = 0;
      if (state.velZ < 0) {
        state.velZ = 0;
      }
      state.grounded = true;
    } else {
      state.grounded = false;
    }
  };

  const setState = (x: number, y: number, z: number, velX: number, velY: number, velZ: number, dashCooldown: number) => {
    state.x = toNumber(x);
    state.y = toNumber(y);
    const safeZ = toNumber(z);
    state.z = safeZ > 0 ? safeZ : 0;
    state.velX = toNumber(velX);
    state.velY = toNumber(velY);
    state.velZ = toNumber(velZ);
    state.grounded = state.z <= 0;
    state.dashCooldown = Number.isFinite(dashCooldown) && dashCooldown > 0 ? dashCooldown : 0;
  };

  const getState = () => ({
    x: state.x,
    y: state.y,
    z: state.z,
    velX: state.velX,
    velY: state.velY,
    velZ: state.velZ,
    dashCooldown: state.dashCooldown
  });

  const reset = () => {
    state = { x: 0, y: 0, z: 0, velX: 0, velY: 0, velZ: 0, grounded: true, dashCooldown: 0 };
  };

  setConfig(config);

  return { step, getState, setState, reset, setConfig };
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

  constructor(sim?: PredictionSim) {
    this.sim = sim ?? createJsPredictionSim(this.simConfig);
    this.sim.setConfig(this.simConfig);
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

  setSim(sim: PredictionSim) {
    this.sim = sim;
    this.sim.setConfig(this.simConfig);
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
