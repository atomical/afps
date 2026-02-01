import type { Object3DLike, SceneLike, Vector3Like } from '../types';

type Placement = {
  file: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
};

const ASSET_ROOT = '/assets/environments/cc0/kenney_retro_urban_kit/glb/';

const applyTransform = (
  object: { position: Vector3Like; rotation: { x: number; y: number; z: number }; scale?: Vector3Like },
  placement: Placement
) => {
  object.position.set(...placement.position);
  if (placement.rotation) {
    const [rx, ry, rz] = placement.rotation;
    object.rotation.x = rx;
    object.rotation.y = ry;
    object.rotation.z = rz;
  }
  if (placement.scale && object.scale) {
    object.scale.set(placement.scale, placement.scale, placement.scale);
  }
};

const buildPlacements = (): Placement[] => {
  const placements: Placement[] = [];
  const tile = 4;

  for (let x = -1; x <= 1; x += 1) {
    for (let z = -1; z <= 1; z += 1) {
      placements.push({
        file: 'road-asphalt-center.glb',
        position: [x * tile, 0, z * tile]
      });
    }
  }

  placements.push(
    { file: 'road-asphalt-side.glb', position: [-2 * tile, 0, 0], rotation: [0, Math.PI / 2, 0] },
    { file: 'road-asphalt-side.glb', position: [2 * tile, 0, 0], rotation: [0, -Math.PI / 2, 0] },
    { file: 'road-asphalt-side.glb', position: [0, 0, -2 * tile] },
    { file: 'road-asphalt-side.glb', position: [0, 0, 2 * tile], rotation: [0, Math.PI, 0] }
  );

  placements.push(
    { file: 'wall-a-low.glb', position: [-2 * tile, 0, -2 * tile], rotation: [0, Math.PI / 2, 0] },
    { file: 'wall-a-low.glb', position: [2 * tile, 0, -2 * tile], rotation: [0, -Math.PI / 2, 0] },
    { file: 'wall-a-low.glb', position: [-2 * tile, 0, 2 * tile], rotation: [0, Math.PI / 2, 0] },
    { file: 'wall-a-low.glb', position: [2 * tile, 0, 2 * tile], rotation: [0, -Math.PI / 2, 0] }
  );

  placements.push(
    { file: 'detail-bench.glb', position: [-3, 0, -3], rotation: [0, Math.PI / 2, 0] },
    { file: 'detail-dumpster-closed.glb', position: [3, 0, -3], rotation: [0, -Math.PI / 4, 0] },
    { file: 'detail-barrier-type-a.glb', position: [-1, 0, 3], rotation: [0, Math.PI, 0] },
    { file: 'detail-barrier-type-b.glb', position: [1, 0, 3], rotation: [0, Math.PI, 0] },
    { file: 'detail-light-single.glb', position: [-3.5, 0, 1.5] },
    { file: 'detail-light-traffic.glb', position: [3.5, 0, 1.5], rotation: [0, Math.PI / 2, 0] },
    { file: 'pallet.glb', position: [-1.5, 0, -1.5], rotation: [0, Math.PI / 3, 0] },
    { file: 'detail-block.glb', position: [1.5, 0, -1.5], scale: 1 }
  );

  return placements;
};

export const loadRetroUrbanMap = async (scene: SceneLike) => {
  try {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const placements = buildPlacements();

    for (const placement of placements) {
      loader.load(
        `${ASSET_ROOT}${placement.file}`,
        (gltf) => {
          const root = gltf.scene as unknown as {
            position: Vector3Like;
            rotation: { x: number; y: number; z: number };
            scale?: Vector3Like;
          };
          applyTransform(root, placement);
          scene.add(root as unknown as Object3DLike);
        },
        undefined,
        (error) => {
          console.warn(`retro urban asset failed: ${placement.file}`, error);
        }
      );
    }
  } catch (error) {
    console.warn('retro urban map load skipped', error);
  }
};
