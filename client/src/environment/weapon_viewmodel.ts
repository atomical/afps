import type { CameraLike, Object3DLike, SceneLike, Vector3Like } from '../types';

type ViewmodelSpec = {
  file: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
};

const BASE_URL = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const NORMALIZED_BASE = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
const VIEWMODEL_ROOT = `${NORMALIZED_BASE}assets/weapons/cc0/kenney_blaster_kit/`;
const DEFAULT_VIEWMODEL: ViewmodelSpec = {
  file: `${VIEWMODEL_ROOT}blaster-a.glb`,
  position: [0.38, -0.32, -0.65],
  rotation: [0.04, Math.PI + 0.12, 0],
  scale: 0.55
};

const resolveModelUrlCandidates = (url: string) => {
  const candidates = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (value && value.length > 0) {
      candidates.add(value);
    }
  };

  add(url);
  if (url.startsWith('./')) {
    add(url.slice(1));
  }
  if (url.startsWith('/')) {
    add(`.${url}`);
  }

  if (NORMALIZED_BASE.startsWith('/') && NORMALIZED_BASE !== '/' && url.startsWith(NORMALIZED_BASE)) {
    add(`/${url.slice(NORMALIZED_BASE.length)}`);
  }

  return Array.from(candidates);
};

const VIEWMODELS_BY_ID: Record<string, ViewmodelSpec> = {
  rifle: {
    file: `${VIEWMODEL_ROOT}blaster-d.glb`,
    position: [0.4, -0.34, -0.72],
    rotation: [0.05, Math.PI + 0.1, 0],
    scale: 0.6
  },
  AR_556: {
    file: `${VIEWMODEL_ROOT}blaster-d.glb`,
    position: [0.4, -0.34, -0.72],
    rotation: [0.05, Math.PI + 0.1, 0],
    scale: 0.6
  },
  launcher: {
    file: `${VIEWMODEL_ROOT}blaster-f.glb`,
    position: [0.4, -0.36, -0.72],
    rotation: [0.06, Math.PI + 0.08, 0],
    scale: 0.6
  },
  PISTOL_9MM: DEFAULT_VIEWMODEL,
  PISTOL_45: {
    ...DEFAULT_VIEWMODEL,
    file: `${VIEWMODEL_ROOT}blaster-b.glb`
  },
  REVOLVER_357: {
    ...DEFAULT_VIEWMODEL,
    file: `${VIEWMODEL_ROOT}blaster-b.glb`,
    scale: 0.58
  },
  SMG_9MM: {
    file: `${VIEWMODEL_ROOT}blaster-c.glb`,
    position: [0.4, -0.34, -0.72],
    rotation: [0.05, Math.PI + 0.1, 0],
    scale: 0.6
  },
  CARBINE_762: {
    file: `${VIEWMODEL_ROOT}blaster-e.glb`,
    position: [0.4, -0.35, -0.74],
    rotation: [0.05, Math.PI + 0.1, 0],
    scale: 0.62
  },
  DMR_762: {
    file: `${VIEWMODEL_ROOT}blaster-e.glb`,
    position: [0.4, -0.35, -0.74],
    rotation: [0.05, Math.PI + 0.1, 0],
    scale: 0.64
  },
  LMG_556: {
    file: `${VIEWMODEL_ROOT}blaster-h.glb`,
    position: [0.42, -0.38, -0.78],
    rotation: [0.06, Math.PI + 0.08, 0],
    scale: 0.7
  },
  SHOTGUN_PUMP: {
    file: `${VIEWMODEL_ROOT}blaster-g.glb`,
    position: [0.41, -0.36, -0.76],
    rotation: [0.06, Math.PI + 0.08, 0],
    scale: 0.66
  },
  SHOTGUN_AUTO: {
    file: `${VIEWMODEL_ROOT}blaster-g.glb`,
    position: [0.41, -0.36, -0.76],
    rotation: [0.06, Math.PI + 0.08, 0],
    scale: 0.66
  },
  SNIPER_BOLT: {
    file: `${VIEWMODEL_ROOT}blaster-g.glb`,
    position: [0.42, -0.37, -0.78],
    rotation: [0.06, Math.PI + 0.08, 0],
    scale: 0.68
  },
  GRENADE_LAUNCHER: {
    file: `${VIEWMODEL_ROOT}blaster-f.glb`,
    position: [0.4, -0.36, -0.72],
    rotation: [0.06, Math.PI + 0.08, 0],
    scale: 0.6
  },
  ROCKET_LAUNCHER: {
    file: `${VIEWMODEL_ROOT}blaster-f.glb`,
    position: [0.4, -0.36, -0.72],
    rotation: [0.06, Math.PI + 0.08, 0],
    scale: 0.6
  },
  ENERGY_RIFLE: {
    file: `${VIEWMODEL_ROOT}blaster-a.glb`,
    position: [0.4, -0.34, -0.72],
    rotation: [0.05, Math.PI + 0.1, 0],
    scale: 0.6
  }
};

const applyTransform = (
  object: { position: Vector3Like; rotation: { x: number; y: number; z: number }; scale?: Vector3Like },
  spec: ViewmodelSpec
) => {
  object.position.set(...spec.position);
  object.rotation.x = spec.rotation[0];
  object.rotation.y = spec.rotation[1];
  object.rotation.z = spec.rotation[2];
  if (object.scale) {
    object.scale.set(spec.scale, spec.scale, spec.scale);
  }
};

const resolveSpec = (weaponId?: string) => {
  if (weaponId && VIEWMODELS_BY_ID[weaponId]) {
    return VIEWMODELS_BY_ID[weaponId];
  }
  return DEFAULT_VIEWMODEL;
};

export const attachWeaponViewmodel = (scene: SceneLike, camera: CameraLike, root: Object3DLike) => {
  scene.add(camera);
  if (camera.add) {
    camera.add(root);
    return camera as Object3DLike;
  }
  scene.add(root);
  return scene as Object3DLike;
};

export const loadWeaponViewmodel = async ({
  scene,
  camera,
  weaponId,
  attach = true
}: {
  scene: SceneLike;
  camera: CameraLike;
  weaponId?: string;
  attach?: boolean;
}) => {
  try {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const spec = resolveSpec(weaponId);
    const urls = resolveModelUrlCandidates(spec.file);
    return await new Promise<Object3DLike | null>((resolve) => {
      let lastError: unknown = null;
      const onLoad = (gltf: { scene?: unknown }) => {
        const root = (gltf.scene ?? null) as {
          position: Vector3Like;
          rotation: { x: number; y: number; z: number };
          scale?: Vector3Like;
        } | null;
        if (!root) {
          resolve(null);
          return;
        }
        applyTransform(root, spec);
        if (attach) {
          attachWeaponViewmodel(scene, camera, root as unknown as Object3DLike);
        }
        resolve(root as unknown as Object3DLike);
      };
      const tryLoad = (index: number) => {
        const url = urls[index];
        loader.load(
          url,
          onLoad,
          undefined,
          (error) => {
            lastError = error;
            const next = index + 1;
            if (next < urls.length) {
              tryLoad(next);
              return;
            }
            console.warn(`weapon viewmodel failed: ${spec.file}`, lastError);
            resolve(null);
          }
        );
      };
      tryLoad(0);
    });
  } catch (error) {
    console.warn('weapon viewmodel load skipped', error);
    return null;
  }
};
