import type { CameraLike, Object3DLike, SceneLike, Vector3Like } from '../types';

type ViewmodelSpec = {
  file: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
};

const VIEWMODEL_ROOT = '/assets/weapons/cc0/kenney_blaster_kit/';
const DEFAULT_VIEWMODEL: ViewmodelSpec = {
  file: `${VIEWMODEL_ROOT}blaster-a.glb`,
  position: [0.38, -0.32, -0.65],
  rotation: [0.04, Math.PI + 0.12, 0],
  scale: 0.55
};

const VIEWMODELS_BY_ID: Record<string, ViewmodelSpec> = {
  rifle: DEFAULT_VIEWMODEL,
  launcher: {
    file: `${VIEWMODEL_ROOT}blaster-f.glb`,
    position: [0.4, -0.36, -0.72],
    rotation: [0.06, Math.PI + 0.08, 0],
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
    return await new Promise<Object3DLike | null>((resolve) => {
      loader.load(
        spec.file,
        (gltf) => {
          const root = gltf.scene as unknown as {
            position: Vector3Like;
            rotation: { x: number; y: number; z: number };
            scale?: Vector3Like;
          };
          applyTransform(root, spec);
          if (attach) {
            attachWeaponViewmodel(scene, camera, root as unknown as Object3DLike);
          }
          resolve(root as unknown as Object3DLike);
        },
        undefined,
        (error) => {
          console.warn(`weapon viewmodel failed: ${spec.file}`, error);
          resolve(null);
        }
      );
    });
  } catch (error) {
    console.warn('weapon viewmodel load skipped', error);
    return null;
  }
};
