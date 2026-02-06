import { SIM_CONFIG, type SimConfig, resolveEyeHeight } from './config';
import { sanitizeColliders, type AabbCollider } from '../world/collision';

export interface WasmInput {
  moveX: number;
  moveY: number;
  sprint: boolean;
  jump: boolean;
  dash: boolean;
  grapple: boolean;
  shield: boolean;
  shockwave: boolean;
  crouch?: boolean;
  viewYaw?: number;
  viewPitch?: number;
}

export interface WasmSimState {
  x: number;
  y: number;
  z: number;
  velX: number;
  velY: number;
  velZ: number;
  dashCooldown: number;
  crouched: boolean;
  eyeHeight: number;
  shieldCooldown: number;
  shieldTimer: number;
  shockwaveCooldown: number;
}

export interface WasmSimModule {
  _sim_create: () => number;
  _sim_destroy: (handle: number) => void;
  _sim_reset: (handle: number) => void;
  _sim_set_config: (
    handle: number,
    moveSpeed: number,
    sprintMultiplier: number,
    crouchSpeedMultiplier: number,
    accel: number,
    friction: number,
    gravity: number,
    jumpVelocity: number,
    dashImpulse: number,
    dashCooldown: number,
    grappleMaxDistance: number,
    grapplePullStrength: number,
    grappleDamping: number,
    grappleCooldown: number,
    grappleMinAttachNormalY: number,
    grappleRopeSlack: number,
    shieldDuration: number,
    shieldCooldown: number,
    shieldDamageMultiplier: number,
    shockwaveRadius: number,
    shockwaveImpulse: number,
    shockwaveCooldown: number,
    shockwaveDamage: number,
    arenaHalfSize: number,
    playerRadius: number,
    playerHeight: number,
    crouchHeight: number,
    obstacleMinX: number,
    obstacleMaxX: number,
    obstacleMinY: number,
    obstacleMaxY: number
  ) => void;
  _sim_set_state: (
    handle: number,
    x: number,
    y: number,
    z: number,
    velX: number,
    velY: number,
    velZ: number,
    dashCooldown: number,
    crouched: number
  ) => void;
  _sim_clear_colliders: (handle: number) => void;
  _sim_add_aabb_collider: (
    handle: number,
    id: number,
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    surfaceType: number
  ) => void;
  _sim_step: (
    handle: number,
    dt: number,
    moveX: number,
    moveY: number,
    sprint: number,
    jump: number,
    dash: number,
    grapple: number,
    shield: number,
    shockwave: number,
    crouch: number,
    viewYaw: number,
    viewPitch: number
  ) => void;
  _sim_get_x: (handle: number) => number;
  _sim_get_y: (handle: number) => number;
  _sim_get_z: (handle: number) => number;
  _sim_get_vx: (handle: number) => number;
  _sim_get_vy: (handle: number) => number;
  _sim_get_vz: (handle: number) => number;
  _sim_get_dash_cooldown: (handle: number) => number;
  _sim_get_crouched: (handle: number) => number;
  _sim_get_shield_cooldown: (handle: number) => number;
  _sim_get_shield_timer: (handle: number) => number;
  _sim_get_shockwave_cooldown: (handle: number) => number;
}

export interface WasmSimInstance {
  step: (input: WasmInput, dt: number) => void;
  getState: () => WasmSimState;
  reset: () => void;
  setState: (
    x: number,
    y: number,
    z: number,
    velX: number,
    velY: number,
    velZ: number,
    dashCooldown: number,
    crouched?: boolean
  ) => void;
  setConfig: (config: SimConfig) => void;
  setColliders: (colliders: readonly AabbCollider[]) => void;
  dispose: () => void;
}

const toNumber = (value: number) => (Number.isFinite(value) ? value : 0);

export const createWasmSim = (module: WasmSimModule, config: SimConfig = SIM_CONFIG): WasmSimInstance => {
  const handle = module._sim_create();
  let currentConfig = { ...config };

  const setConfig = (next: SimConfig) => {
    currentConfig = { ...next };
    module._sim_set_config(
      handle,
      toNumber(next.moveSpeed),
      toNumber(next.sprintMultiplier),
      toNumber(next.crouchSpeedMultiplier),
      toNumber(next.accel),
      toNumber(next.friction),
      toNumber(next.gravity),
      toNumber(next.jumpVelocity),
      toNumber(next.dashImpulse),
      toNumber(next.dashCooldown),
      toNumber(next.grappleMaxDistance),
      toNumber(next.grapplePullStrength),
      toNumber(next.grappleDamping),
      toNumber(next.grappleCooldown),
      toNumber(next.grappleMinAttachNormalY),
      toNumber(next.grappleRopeSlack),
      toNumber(next.shieldDuration),
      toNumber(next.shieldCooldown),
      toNumber(next.shieldDamageMultiplier),
      toNumber(next.shockwaveRadius),
      toNumber(next.shockwaveImpulse),
      toNumber(next.shockwaveCooldown),
      toNumber(next.shockwaveDamage),
      toNumber(next.arenaHalfSize),
      toNumber(next.playerRadius),
      toNumber(next.playerHeight),
      toNumber(next.crouchHeight),
      toNumber(next.obstacleMinX),
      toNumber(next.obstacleMaxX),
      toNumber(next.obstacleMinY),
      toNumber(next.obstacleMaxY)
    );
  };

  setConfig(config);

  const step = (input: WasmInput, dt: number) => {
    module._sim_step(
      handle,
      toNumber(dt),
      toNumber(input.moveX),
      toNumber(input.moveY),
      input.sprint ? 1 : 0,
      input.jump ? 1 : 0,
      input.dash ? 1 : 0,
      input.grapple ? 1 : 0,
      input.shield ? 1 : 0,
      input.shockwave ? 1 : 0,
      input.crouch ? 1 : 0,
      toNumber(input.viewYaw ?? 0),
      toNumber(input.viewPitch ?? 0)
    );
  };

  const getState = (): WasmSimState => {
    const crouched = module._sim_get_crouched(handle) !== 0;
    return {
      x: module._sim_get_x(handle),
      y: module._sim_get_y(handle),
      z: module._sim_get_z(handle),
      velX: module._sim_get_vx(handle),
      velY: module._sim_get_vy(handle),
      velZ: module._sim_get_vz(handle),
      dashCooldown: module._sim_get_dash_cooldown(handle),
      crouched,
      eyeHeight: resolveEyeHeight(currentConfig, 1.6, crouched),
      shieldCooldown: module._sim_get_shield_cooldown(handle),
      shieldTimer: module._sim_get_shield_timer(handle),
      shockwaveCooldown: module._sim_get_shockwave_cooldown(handle)
    };
  };

  const reset = () => {
    module._sim_reset(handle);
  };

  const setState = (
    x: number,
    y: number,
    z: number,
    velX: number,
    velY: number,
    velZ: number,
    dashCooldown: number,
    crouched = false
  ) => {
    module._sim_set_state(
      handle,
      toNumber(x),
      toNumber(y),
      toNumber(z),
      toNumber(velX),
      toNumber(velY),
      toNumber(velZ),
      toNumber(dashCooldown),
      crouched ? 1 : 0
    );
  };

  const setColliders = (colliders: readonly AabbCollider[]) => {
    module._sim_clear_colliders(handle);
    const sanitized = sanitizeColliders(colliders);
    for (const collider of sanitized) {
      module._sim_add_aabb_collider(
        handle,
        collider.id,
        collider.minX,
        collider.minY,
        collider.minZ,
        collider.maxX,
        collider.maxY,
        collider.maxZ,
        Number.isFinite(collider.surfaceType) ? Math.floor(collider.surfaceType!) : 0
      );
    }
  };

  const dispose = () => {
    module._sim_destroy(handle);
  };

  return { step, getState, reset, setState, setConfig, setColliders, dispose };
};

export type WasmModuleFactory = () => Promise<WasmSimModule>;

export const loadWasmSim = async (factory: WasmModuleFactory, config?: SimConfig) => {
  const module = await factory();
  return createWasmSim(module, config ?? SIM_CONFIG);
};

const resolveFactory = async (moduleUrl: string, importer: (url: string) => Promise<unknown>) => {
  const imported = await importer(moduleUrl);
  const candidate = (imported as { default?: unknown }).default ?? imported;
  if (typeof candidate !== 'function') {
    throw new Error(`WASM module did not export a factory at ${moduleUrl}`);
  }
  return candidate as WasmModuleFactory;
};

const defaultImporter = (url: string) => import(/* @vite-ignore */ url);

export const loadWasmSimFromUrl = async (
  moduleUrl: string,
  config?: SimConfig,
  importer: (url: string) => Promise<unknown> = defaultImporter
) => {
  const factory = await resolveFactory(moduleUrl, importer);
  return loadWasmSim(factory, config);
};
