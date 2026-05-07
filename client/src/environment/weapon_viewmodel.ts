import type { CameraLike, Object3DLike, SceneLike, Vector3Like } from '../types';
import { resolveWeaponModelSpec } from '../weapons/model_catalog';

const BASE_URL = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const NORMALIZED_BASE = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
const VIEWMODEL_YAW_OFFSET = 0;

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

const applyTransform = (
  object: { position: Vector3Like; rotation: { x: number; y: number; z: number }; scale?: Vector3Like },
  weaponId?: string
) => {
  const pose = resolveWeaponModelSpec(weaponId).viewmodel;
  object.position.set(...pose.position);
  object.rotation.x = pose.rotation[0];
  object.rotation.y = pose.rotation[1] + VIEWMODEL_YAW_OFFSET;
  object.rotation.z = pose.rotation[2];
  if (object.scale) {
    object.scale.set(pose.scale, pose.scale, pose.scale);
  }
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
    const spec = resolveWeaponModelSpec(weaponId);
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
        applyTransform(root, weaponId);
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
