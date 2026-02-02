import type { Object3DLike, SceneLike, Vector3Like } from '../types';

type Placement = {
  file: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  randomYaw?: boolean;
};

const ASSET_ROOT = '/assets/environments/cc0/kenney_city_kit_suburban_20/glb/';
const MANIFEST_URL = '/assets/environments/cc0/kenney_city_kit_suburban_20/map.json';
const DEFAULT_YAW_CHOICES = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
const DEBUG_BOUNDS_FLAG = 'VITE_DEBUG_RETRO_URBAN_BOUNDS';
const DEBUG_GRID_FLAG = 'VITE_DEBUG_RETRO_URBAN_GRID';
const DEBUG_BOUNDS_COLOR = 0x22ffcc;
const DEBUG_GRID_SIZE = 40;
const DEBUG_GRID_DIVISIONS = 10;
const DEBUG_GRID_COLOR_MAJOR = 0x335577;
const DEBUG_GRID_COLOR_MINOR = 0x223344;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const toBoolean = (value: unknown) => (typeof value === 'boolean' ? value : null);

const toVec3 = (value: unknown): [number, number, number] | null => {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }
  const x = toNumber(value[0]);
  const y = toNumber(value[1]);
  const z = toNumber(value[2]);
  if (x === null || y === null || z === null) {
    return null;
  }
  return [x, y, z];
};

const parsePlacement = (value: unknown): Placement | null => {
  if (!isRecord(value)) {
    return null;
  }
  const file = typeof value.file === 'string' ? value.file : '';
  if (file.length === 0) {
    return null;
  }
  const position = toVec3(value.position);
  if (!position) {
    return null;
  }
  const rotation = toVec3(value.rotation);
  const scale = toNumber(value.scale);
  const randomYaw = toBoolean(value.randomYaw);
  const placement: Placement = { file, position };
  if (rotation) {
    placement.rotation = rotation;
  }
  if (scale !== null && scale > 0) {
    placement.scale = scale;
  }
  if (randomYaw !== null) {
    placement.randomYaw = randomYaw;
  }
  return placement;
};

const normalizePlacements = (value: unknown): Placement[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const parsed = value.map(parsePlacement).filter(Boolean) as Placement[];
  if (parsed.length === 0 && value.length > 0) {
    return null;
  }
  return parsed;
};

const normalizeYawChoices = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const filtered = value.map(toNumber).filter((entry): entry is number => entry !== null);
  return filtered.length > 0 ? filtered : null;
};

const createRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
};

const applyRandomYaw = (placements: Placement[], seed: number, yawChoices: number[]) => {
  const rand = createRng(seed);
  return placements.map((placement) => {
    if (!placement.randomYaw || placement.rotation) {
      return placement;
    }
    const index = Math.floor(rand() * yawChoices.length);
    const yaw = yawChoices[Math.min(Math.max(index, 0), yawChoices.length - 1)];
    return { ...placement, rotation: [0, yaw, 0] };
  });
};

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

  for (let x = -2; x <= 2; x += 1) {
    placements.push({ file: 'roads/road-straight.glb', position: [x * tile, 0, 0], rotation: [0, Math.PI / 2, 0] });
    if (x !== 0) {
      placements.push({ file: 'roads/road-straight.glb', position: [0, 0, x * tile] });
    }
  }

  placements.push(
    { file: 'roads/road-crossroad.glb', position: [0, 0, 0] },
    { file: 'roads/road-bend.glb', position: [-2 * tile, 0, 2 * tile] },
    { file: 'roads/road-bend.glb', position: [2 * tile, 0, 2 * tile], rotation: [0, Math.PI / 2, 0] },
    { file: 'roads/road-bend.glb', position: [2 * tile, 0, -2 * tile], rotation: [0, Math.PI, 0] },
    { file: 'roads/road-bend.glb', position: [-2 * tile, 0, -2 * tile], rotation: [0, -Math.PI / 2, 0] }
  );

  placements.push(
    { file: 'building-type-a.glb', position: [-1 * tile, 0, -1 * tile], randomYaw: true },
    { file: 'building-type-b.glb', position: [1 * tile, 0, -1 * tile], randomYaw: true },
    { file: 'building-type-c.glb', position: [-1 * tile, 0, 1 * tile], randomYaw: true },
    { file: 'building-type-d.glb', position: [1 * tile, 0, 1 * tile], randomYaw: true }
  );

  placements.push(
    { file: 'tree-large.glb', position: [-1.5 * tile, 0, 1.5 * tile] },
    { file: 'tree-small.glb', position: [1.5 * tile, 0, -1.5 * tile] },
    { file: 'planter.glb', position: [-0.5 * tile, 0, 0.5 * tile] }
  );

  return placements;
};

const loadManifestPlacements = async (): Promise<Placement[]> => {
  const fallback = buildPlacements();
  if (typeof fetch !== 'function') {
    return fallback;
  }
  try {
    const response = await fetch(MANIFEST_URL);
    if (!response.ok) {
      console.warn(`suburban manifest fetch failed: ${response.status}`);
      return fallback;
    }
    const data = (await response.json()) as unknown;
    if (!isRecord(data)) {
      console.warn('suburban manifest invalid shape');
      return fallback;
    }
    const placements = normalizePlacements(data.placements);
    if (!placements) {
      console.warn('suburban manifest invalid placements');
      return fallback;
    }
    const seed = toNumber(data.seed) ?? 0;
    const yawChoices = normalizeYawChoices(data.yawChoices) ?? DEFAULT_YAW_CHOICES;
    return applyRandomYaw(placements, seed, yawChoices);
  } catch (error) {
    console.warn('suburban manifest load failed', error);
    return fallback;
  }
};

export const loadRetroUrbanMap = async (scene: SceneLike) => {
  try {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const debugBounds = (import.meta.env?.[DEBUG_BOUNDS_FLAG] ?? '') === 'true';
    const debugGrid = (import.meta.env?.[DEBUG_GRID_FLAG] ?? '') === 'true';
    let BoxHelper: null | (new (object: object, color: number) => object) = null;
    let GridHelper: null | (new (size: number, divisions: number, color1: number, color2: number) => object) = null;
    if (debugBounds || debugGrid) {
      const three = await import('three');
      if (debugBounds) {
        BoxHelper = three.BoxHelper;
      }
      if (debugGrid) {
        GridHelper = three.GridHelper;
      }
    }
    const loader = new GLTFLoader();
    const placements = await loadManifestPlacements();

    if (GridHelper) {
      const grid = new GridHelper(
        DEBUG_GRID_SIZE,
        DEBUG_GRID_DIVISIONS,
        DEBUG_GRID_COLOR_MAJOR,
        DEBUG_GRID_COLOR_MINOR
      );
      scene.add(grid as unknown as Object3DLike);
    }

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
          if (BoxHelper) {
            const helper = new BoxHelper(root as unknown as object, DEBUG_BOUNDS_COLOR);
            scene.add(helper as unknown as Object3DLike);
          }
        },
        undefined,
        (error) => {
          console.warn(`suburban asset failed: ${placement.file}`, error);
        }
      );
    }
  } catch (error) {
    console.warn('suburban map load skipped', error);
  }
};
