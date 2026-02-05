import type { AudioManager } from '../audio/manager';
import type { Object3DLike, SceneLike, ThreeLike } from '../types';

type Vec3 = { x: number; y: number; z: number };

export interface CasingSpawnPayload {
  position: Vec3;
  rotation: Vec3;
  velocity: Vec3;
  angularVelocity: Vec3;
  lifetimeSeconds: number;
  seed?: number;
}

export interface CasingPool {
  ready: Promise<boolean>;
  spawn: (payload: CasingSpawnPayload) => void;
  update: (deltaSeconds: number) => void;
  dispose: () => void;
}

const resolveBaseUrl = (env?: { BASE_URL?: string }) => env?.BASE_URL ?? '/';
const BASE_URL = resolveBaseUrl((import.meta as { env?: { BASE_URL?: string } }).env);
const NORMALIZED_BASE = BASE_URL.replace(/\/?$/, '/');
const CASING_MODEL_URLS = [
  `${NORMALIZED_BASE}assets/weapons/cc0/kenney_blaster_kit/bullet-foam.glb`,
  `${NORMALIZED_BASE}assets/weapons/cc0/kenney_blaster_kit/Models/GLB%20format/bullet-foam.glb`
];
const CASING_SCALE = 0.08;
const GRAVITY = -9.8;
const GROUND_Y = -0.02;
const MAX_POOL = 64;
const MAX_IMPACTS = 4;
const IMPACT_COOLDOWN = 0.08;

type CasingInstance = {
  mesh: Object3DLike;
  velocity: Vec3;
  angularVelocity: Vec3;
  ttl: number;
  impacts: number;
  impactCooldown: number;
  seed: number;
};

const cloneObject = (base: Object3DLike) => {
  if ('clone' in (base as { clone?: (deep?: boolean) => Object3DLike })) {
    const cloneFn = (base as { clone?: (deep?: boolean) => Object3DLike }).clone;
    if (cloneFn) {
      return cloneFn.call(base, true);
    }
  }
  return base;
};

const loadCasingModel = async (three: ThreeLike): Promise<Object3DLike | null> => {
  try {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    return await new Promise<Object3DLike | null>((resolve) => {
      const onLoad = (gltf: { scene?: Object3DLike }) => {
        const root = (gltf.scene ?? null) as Object3DLike | null;
        resolve(root);
      };
      const tryLoad = (index: number) => {
        const url = CASING_MODEL_URLS[index];
        loader.load(url, onLoad, undefined, () => {
          const next = index + 1;
          if (next < CASING_MODEL_URLS.length) {
            tryLoad(next);
            return;
          }
          resolve(null);
        });
      };
      tryLoad(0);
    });
  } catch {
    return null;
  }
};

export const createCasingPool = ({
  three,
  scene,
  audio,
  impactSounds
}: {
  three: ThreeLike;
  scene: SceneLike;
  audio: AudioManager;
  impactSounds: string[];
}): CasingPool => {
  const pool: CasingInstance[] = [];
  const active: CasingInstance[] = [];
  let baseModel: Object3DLike | null = null;
  const ready = loadCasingModel(three).then((model) => {
    if (!model) {
      return false;
    }
    baseModel = model;
    if (baseModel.scale?.set) {
      baseModel.scale.set(CASING_SCALE, CASING_SCALE, CASING_SCALE);
    }
    return true;
  });

  const getInstance = (): CasingInstance | null => {
    if (!baseModel) {
      return null;
    }
    if (pool.length > 0) {
      return pool.pop()!;
    }
    if (active.length >= MAX_POOL) {
      const recycled = active.shift()!;
      scene.remove?.(recycled.mesh);
      return recycled;
    }
    const mesh = cloneObject(baseModel);
    if (mesh.scale?.set) {
      mesh.scale.set(CASING_SCALE, CASING_SCALE, CASING_SCALE);
    }
    return {
      mesh,
      velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      ttl: 0,
      impacts: 0,
      impactCooldown: 0,
      seed: 0
    };
  };

  const spawn = (payload: CasingSpawnPayload) => {
    const instance = getInstance();
    if (!instance) {
      return;
    }
    instance.velocity = { ...payload.velocity };
    instance.angularVelocity = { ...payload.angularVelocity };
    instance.ttl = payload.lifetimeSeconds;
    instance.impacts = 0;
    instance.impactCooldown = 0;
    instance.seed = payload.seed ?? 0;
    instance.mesh.position.set(payload.position.x, payload.position.y, payload.position.z);
    instance.mesh.rotation.x = payload.rotation.x;
    instance.mesh.rotation.y = payload.rotation.y;
    instance.mesh.rotation.z = payload.rotation.z;
    scene.add(instance.mesh);
    active.push(instance);
  };

  const playImpact = (instance: CasingInstance) => {
    if (!impactSounds.length) {
      return;
    }
    const index = impactSounds.length === 1 ? 0 : (instance.seed + instance.impacts) % impactSounds.length;
    const key = impactSounds[index];
    audio.playPositional(key, {
      x: instance.mesh.position.x,
      y: instance.mesh.position.y,
      z: instance.mesh.position.z
    });
  };

  const update = (deltaSeconds: number) => {
    if (active.length === 0) {
      return;
    }
    for (let i = active.length - 1; i >= 0; i -= 1) {
      const casing = active[i];
      casing.ttl -= deltaSeconds;
      if (casing.ttl <= 0) {
        scene.remove?.(casing.mesh);
        active.splice(i, 1);
        pool.push(casing);
        continue;
      }

      casing.velocity.y += GRAVITY * deltaSeconds;
      casing.mesh.position.x += casing.velocity.x * deltaSeconds;
      casing.mesh.position.y += casing.velocity.y * deltaSeconds;
      casing.mesh.position.z += casing.velocity.z * deltaSeconds;

      casing.mesh.rotation.x += casing.angularVelocity.x * deltaSeconds;
      casing.mesh.rotation.y += casing.angularVelocity.y * deltaSeconds;
      casing.mesh.rotation.z += casing.angularVelocity.z * deltaSeconds;

      casing.velocity.x *= 1 - 0.25 * deltaSeconds;
      casing.velocity.z *= 1 - 0.25 * deltaSeconds;

      if (casing.mesh.position.y <= GROUND_Y) {
        casing.mesh.position.y = GROUND_Y;
        if (casing.velocity.y < 0) {
          casing.velocity.y *= -0.35;
          casing.velocity.x *= 0.6;
          casing.velocity.z *= 0.6;
          if (casing.impactCooldown <= 0 && casing.impacts < MAX_IMPACTS) {
            playImpact(casing);
            casing.impacts += 1;
            casing.impactCooldown = IMPACT_COOLDOWN;
          }
        }
      }

      if (casing.impactCooldown > 0) {
        casing.impactCooldown = Math.max(0, casing.impactCooldown - deltaSeconds);
      }
    }
  };

  const dispose = () => {
    active.forEach((casing) => scene.remove?.(casing.mesh));
    active.length = 0;
    pool.length = 0;
  };

  return { ready, spawn, update, dispose };
};

export const __test = { resolveBaseUrl };
