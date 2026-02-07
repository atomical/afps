import type { AabbCollider } from '../world/collision';
import { sanitizeColliders } from '../world/collision';
import type { Object3DLike, SceneLike, Vector3Like } from '../types';
import {
  buildStaticWorldFromPlacements,
  generateProceduralRetroUrbanMap,
  PROCEDURAL_MAP_CONSTANTS,
  type DoorSide,
  type ProceduralGeneratorType,
  type ProceduralRetroUrbanMap,
  type RetroMapBuilding,
  type RetroMapPickupSpawn,
  type RetroMapPlacement
} from './procedural_map';

type Placement = RetroMapPlacement;

type LegacyManifest = {
  seed: number;
  placements: Placement[];
  colliders: AabbCollider[];
  pickupSpawns: RetroMapPickupSpawn[];
  debug?: unknown;
};

export interface LoadRetroUrbanMapOptions {
  seed?: number;
  procedural?: boolean;
  generator?: ProceduralGeneratorType;
  arenaHalfSize?: number;
  tickRate?: number;
}

export interface LoadedRetroUrbanMap {
  seed: number;
  colliders: AabbCollider[];
  pickupSpawns: RetroMapPickupSpawn[];
  placements: number;
  loaded: number;
  failed: number;
  dispose: () => void;
}

const ASSET_ROOT = '/assets/environments/cc0/kenney_city_kit_suburban_20/glb/';
const DEFAULT_MANIFEST_URL = '/assets/environments/cc0/kenney_city_kit_suburban_20/map.json';
const DEFAULT_YAW_CHOICES = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
const DEBUG_BOUNDS_FLAG = 'VITE_DEBUG_RETRO_URBAN_BOUNDS';
const DEBUG_GRID_FLAG = 'VITE_DEBUG_RETRO_URBAN_GRID';
const DEBUG_COLLIDERS_FLAG = 'VITE_DEBUG_COLLIDERS';
const DEBUG_INTERIORS_FLAG = 'VITE_DEBUG_INTERIORS';
const ENABLE_INTERIORS_FLAG = 'VITE_ENABLE_INTERIORS';
const PROCEDURAL_FLAG = 'VITE_PROCEDURAL_MAP';
const PROCEDURAL_GENERATOR_FLAG = 'VITE_PROCEDURAL_GENERATOR';
const MAP_SEED_FLAG = 'VITE_MAP_SEED';
const MAP_MANIFEST_URL_FLAG = 'VITE_MAP_MANIFEST_URL';
const DEBUG_ROAD_GRAPH_FLAG = 'VITE_DEBUG_ROAD_GRAPH';
const DEBUG_MAP_JSON_FLAG = 'VITE_DEBUG_MAP_JSON';
const DEBUG_BOUNDS_COLOR = 0x22ffcc;
const DEBUG_COLLIDER_COLOR = 0xff7755;
const DEBUG_ROAD_GRAPH_COLOR = 0x15c9a6;
const DEBUG_GRID_SIZE = 40;
const DEBUG_GRID_DIVISIONS = 10;
const DEBUG_GRID_COLOR_MAJOR = 0x335577;
const DEBUG_GRID_COLOR_MINOR = 0x223344;
const MAP_SCALE = PROCEDURAL_MAP_CONSTANTS.mapScale;

type GltfLike = {
  scene: Object3DLike;
};

const templateCache = new Map<string, Promise<GltfLike | null>>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const toBoolean = (value: unknown) => (typeof value === 'boolean' ? value : null);

const parseSeed = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value) >>> 0;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.floor(parsed) >>> 0;
};

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

const parseDoorSide = (value: unknown): DoorSide | undefined => {
  if (value === 'north' || value === 'east' || value === 'south' || value === 'west') {
    return value;
  }
  return undefined;
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
  const roadMask = toNumber(value.roadMask);
  const cellX = toNumber(value.cellX);
  const cellY = toNumber(value.cellY);
  const kind =
    value.kind === 'road' || value.kind === 'building' || value.kind === 'prop'
      ? value.kind
      : undefined;
  const doorSide = parseDoorSide(value.doorSide);

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
  if (roadMask !== null) {
    placement.roadMask = Math.floor(roadMask) & 0b1111;
  }
  if (cellX !== null) {
    placement.cellX = Math.floor(cellX);
  }
  if (cellY !== null) {
    placement.cellY = Math.floor(cellY);
  }
  if (kind) {
    placement.kind = kind;
  }
  if (doorSide) {
    placement.doorSide = doorSide;
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
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    if (state === 0) {
      state = 1;
    }
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
    const yaw = yawChoices[Math.min(Math.max(index, 0), yawChoices.length - 1)]!;
    return { ...placement, rotation: [0, yaw, 0] as [number, number, number] };
  });
};

const applyTransform = (
  object: {
    position: Vector3Like;
    rotation: { x: number; y: number; z: number };
    scale?: Vector3Like;
  },
  placement: Placement
) => {
  object.position.set(
    placement.position[0] * MAP_SCALE,
    placement.position[1] * MAP_SCALE,
    placement.position[2] * MAP_SCALE
  );
  if (placement.rotation) {
    const [rx, ry, rz] = placement.rotation;
    object.rotation.x = rx;
    object.rotation.y = ry;
    object.rotation.z = rz;
  }
  if (object.scale) {
    const scale = (placement.scale ?? 1) * MAP_SCALE;
    object.scale.set(scale, scale, scale);
  }
};

const markStaticSurface = (root: Object3DLike) => {
  type RuntimeObject = Object3DLike & {
    userData?: Record<string, unknown>;
    children?: RuntimeObject[];
    parent?: RuntimeObject | null;
    traverse?: (callback: (child: RuntimeObject) => void) => void;
  };
  const setFlag = (node: RuntimeObject | null | undefined) => {
    if (!node) {
      return;
    }
    if (!node.userData || typeof node.userData !== 'object') {
      node.userData = {};
    }
    node.userData.afpsStaticSurface = true;
  };
  const runtimeRoot = root as RuntimeObject;
  setFlag(runtimeRoot);
  if (typeof runtimeRoot.traverse === 'function') {
    runtimeRoot.traverse((child) => {
      setFlag(child);
    });
    return;
  }
  if (!Array.isArray(runtimeRoot.children)) {
    return;
  }
  for (const child of runtimeRoot.children) {
    setFlag(child);
  }
};

const cloneObject = (value: Object3DLike): Object3DLike => {
  const clone = (value as unknown as { clone?: (recursive?: boolean) => Object3DLike }).clone;
  if (typeof clone === 'function') {
    return clone.call(value, true);
  }
  const createVector = (source?: Vector3Like): Vector3Like => {
    const vector = {
      x: Number.isFinite(source?.x) ? source!.x : 0,
      y: Number.isFinite(source?.y) ? source!.y : 0,
      z: Number.isFinite(source?.z) ? source!.z : 0,
      set: (x: number, y: number, z: number) => {
        vector.x = x;
        vector.y = y;
        vector.z = z;
      }
    };
    return vector;
  };
  return {
    position: createVector(value.position),
    rotation: {
      x: Number.isFinite(value.rotation?.x) ? value.rotation.x : 0,
      y: Number.isFinite(value.rotation?.y) ? value.rotation.y : 0,
      z: Number.isFinite(value.rotation?.z) ? value.rotation.z : 0
    },
    scale: value.scale ? createVector(value.scale) : undefined,
    visible: value.visible,
    name: value.name,
    children: Array.isArray(value.children) ? [...value.children] : undefined
  };
};

const buildLegacyFallbackPlacements = (): Placement[] => {
  const placements: Placement[] = [];
  const tile = 4;

  for (let x = -2; x <= 2; x += 1) {
    placements.push({
      file: 'roads/road-straight.glb',
      position: [x * tile, 0, 0],
      rotation: [0, Math.PI / 2, 0]
    });
    if (x !== 0) {
      placements.push({ file: 'roads/road-straight.glb', position: [0, 0, x * tile] });
    }
  }

  placements.push(
    { file: 'roads/road-crossroad.glb', position: [0, 0, 0] },
    { file: 'roads/road-bend.glb', position: [-2 * tile, 0, 2 * tile] },
    {
      file: 'roads/road-bend.glb',
      position: [2 * tile, 0, 2 * tile],
      rotation: [0, Math.PI / 2, 0]
    },
    { file: 'roads/road-bend.glb', position: [2 * tile, 0, -2 * tile], rotation: [0, Math.PI, 0] },
    {
      file: 'roads/road-bend.glb',
      position: [-2 * tile, 0, -2 * tile],
      rotation: [0, -Math.PI / 2, 0]
    }
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

const loadLegacyManifest = async (tickRate: number): Promise<LegacyManifest> => {
  const fallback = buildLegacyFallbackPlacements();
  const manifestUrl = resolveManifestUrl();
  if (typeof fetch !== 'function') {
    return { seed: 0, placements: fallback, colliders: [], pickupSpawns: [] };
  }
  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      console.warn(`suburban manifest fetch failed: ${response.status}`);
      return { seed: 0, placements: fallback, colliders: [], pickupSpawns: [] };
    }
    const data = (await response.json()) as unknown;
    if (!isRecord(data)) {
      console.warn('suburban manifest invalid shape');
      return { seed: 0, placements: fallback, colliders: [], pickupSpawns: [] };
    }
    const placements = normalizePlacements(data.placements);
    if (!placements) {
      console.warn('suburban manifest invalid placements');
      return { seed: 0, placements: fallback, colliders: [], pickupSpawns: [] };
    }
    const seed = parseSeed(data.seed) ?? 0;
    const yawChoices = normalizeYawChoices(data.yawChoices) ?? DEFAULT_YAW_CHOICES;
    const normalizedPlacements = applyRandomYaw(placements, seed, yawChoices);
    const staticWorld = buildStaticWorldFromPlacements(normalizedPlacements, tickRate);
    return {
      seed,
      placements: normalizedPlacements,
      colliders: staticWorld.colliders,
      pickupSpawns: staticWorld.pickupSpawns
    };
  } catch (error) {
    console.warn('suburban manifest load failed', error);
    return { seed: 0, placements: fallback, colliders: [], pickupSpawns: [] };
  }
};

const shouldUseProcedural = (options: LoadRetroUrbanMapOptions) => {
  if (typeof options.procedural === 'boolean') {
    return options.procedural;
  }
  return (import.meta.env?.[PROCEDURAL_FLAG] ?? '') === 'true';
};

const resolveGenerator = (options: LoadRetroUrbanMapOptions): ProceduralGeneratorType => {
  if (options.generator === 'advanced' || options.generator === 'legacy') {
    return options.generator;
  }
  const env = (import.meta.env?.[PROCEDURAL_GENERATOR_FLAG] ?? '').trim().toLowerCase();
  return env === 'advanced' ? 'advanced' : 'legacy';
};

const resolveSeed = (options: LoadRetroUrbanMapOptions) => {
  if (Number.isFinite(options.seed)) {
    return Math.floor(options.seed!) >>> 0;
  }
  const envSeed = parseSeed(import.meta.env?.[MAP_SEED_FLAG]);
  return envSeed ?? 0;
};

const resolveManifestUrl = () => {
  const raw = (import.meta.env?.[MAP_MANIFEST_URL_FLAG] ?? '').trim();
  return raw.length > 0 ? raw : DEFAULT_MANIFEST_URL;
};

const isProceduralBuilding = (
  entry: Placement
): entry is Placement & { doorSide: DoorSide; cellX: number; cellY: number } =>
  entry.kind === 'building' &&
  !!entry.doorSide &&
  Number.isFinite(entry.cellX) &&
  Number.isFinite(entry.cellY);

const addInteriorMeshes = async (
  scene: SceneLike,
  placements: Placement[],
  added: Object3DLike[],
  debugInteriors: boolean
) => {
  const buildings: RetroMapBuilding[] = [];
  for (const placement of placements) {
    if (!isProceduralBuilding(placement)) {
      continue;
    }
    buildings.push({
      cellX: placement.cellX!,
      cellY: placement.cellY!,
      doorSide: placement.doorSide!,
      file: placement.file,
      rotationY: placement.rotation?.[1] ?? 0,
      position: placement.position
    });
  }
  if (buildings.length === 0) {
    return;
  }

  try {
    const three = await import('three');
    const roomHalf = PROCEDURAL_MAP_CONSTANTS.roomHalf;
    const wallThickness = PROCEDURAL_MAP_CONSTANTS.wallThickness;
    const wallHeight = PROCEDURAL_MAP_CONSTANTS.wallHeight;
    const doorHalfWidth = PROCEDURAL_MAP_CONSTANTS.doorHalfWidth;
    const doorHeight = PROCEDURAL_MAP_CONSTANTS.doorHeight;

    const floorColor = debugInteriors ? 0x3f6d3f : 0x4b4b47;
    const wallColor = debugInteriors ? 0x6f8f73 : 0x6c6a60;
    const ceilColor = debugInteriors ? 0x7a997e : 0x707070;
    const floorMaterial = new three.MeshStandardMaterial({ color: floorColor });
    const wallMaterial = new three.MeshStandardMaterial({ color: wallColor });
    const ceilMaterial = new three.MeshStandardMaterial({ color: ceilColor });

    const addBox = (
      minX: number,
      maxX: number,
      minY: number,
      maxY: number,
      minZ: number,
      maxZ: number,
      material: unknown
    ) => {
      const width = maxX - minX;
      const depth = maxY - minY;
      const height = maxZ - minZ;
      if (width <= 0 || depth <= 0 || height <= 0) {
        return;
      }
      const mesh = new three.Mesh(new three.BoxGeometry(width, height, depth), material as never);
      mesh.position.set((minX + maxX) * 0.5, (minZ + maxZ) * 0.5, (minY + maxY) * 0.5);
      scene.add(mesh as unknown as Object3DLike);
      added.push(mesh as unknown as Object3DLike);
    };

    for (const building of buildings) {
      const cx = building.cellX * PROCEDURAL_MAP_CONSTANTS.tileSize * MAP_SCALE;
      const cy = building.cellY * PROCEDURAL_MAP_CONSTANTS.tileSize * MAP_SCALE;
      const minX = cx - roomHalf;
      const maxX = cx + roomHalf;
      const minY = cy - roomHalf;
      const maxY = cy + roomHalf;

      addBox(minX, maxX, minY, maxY, 0, 0.08, floorMaterial);
      addBox(minX, maxX, minY, maxY, wallHeight - 0.08, wallHeight, ceilMaterial);

      const addNorth = (x0: number, x1: number, z0: number, z1: number) =>
        addBox(x0, x1, maxY - wallThickness, maxY, z0, z1, wallMaterial);
      const addSouth = (x0: number, x1: number, z0: number, z1: number) =>
        addBox(x0, x1, minY, minY + wallThickness, z0, z1, wallMaterial);
      const addEast = (y0: number, y1: number, z0: number, z1: number) =>
        addBox(maxX - wallThickness, maxX, y0, y1, z0, z1, wallMaterial);
      const addWest = (y0: number, y1: number, z0: number, z1: number) =>
        addBox(minX, minX + wallThickness, y0, y1, z0, z1, wallMaterial);

      if (building.doorSide === 'north') {
        addNorth(minX, cx - doorHalfWidth, 0, wallHeight);
        addNorth(cx + doorHalfWidth, maxX, 0, wallHeight);
        addNorth(cx - doorHalfWidth, cx + doorHalfWidth, doorHeight, wallHeight);
      } else {
        addNorth(minX, maxX, 0, wallHeight);
      }
      if (building.doorSide === 'south') {
        addSouth(minX, cx - doorHalfWidth, 0, wallHeight);
        addSouth(cx + doorHalfWidth, maxX, 0, wallHeight);
        addSouth(cx - doorHalfWidth, cx + doorHalfWidth, doorHeight, wallHeight);
      } else {
        addSouth(minX, maxX, 0, wallHeight);
      }
      if (building.doorSide === 'east') {
        addEast(minY, cy - doorHalfWidth, 0, wallHeight);
        addEast(cy + doorHalfWidth, maxY, 0, wallHeight);
        addEast(cy - doorHalfWidth, cy + doorHalfWidth, doorHeight, wallHeight);
      } else {
        addEast(minY, maxY, 0, wallHeight);
      }
      if (building.doorSide === 'west') {
        addWest(minY, cy - doorHalfWidth, 0, wallHeight);
        addWest(cy + doorHalfWidth, maxY, 0, wallHeight);
        addWest(cy - doorHalfWidth, cy + doorHalfWidth, doorHeight, wallHeight);
      } else {
        addWest(minY, maxY, 0, wallHeight);
      }
    }
  } catch (error) {
    console.warn('suburban interior generation skipped', error);
  }
};

const addColliderDebugMeshes = async (
  scene: SceneLike,
  colliders: AabbCollider[],
  added: Object3DLike[]
) => {
  if (colliders.length === 0) {
    return;
  }
  try {
    const three = await import('three');
    const materialCtor =
      (
        three as unknown as {
          MeshBasicMaterial?: new (params: { color: number; wireframe?: boolean }) => unknown;
        }
      ).MeshBasicMaterial ?? three.MeshStandardMaterial;
    for (const collider of colliders) {
      const width = collider.maxX - collider.minX;
      const depth = collider.maxY - collider.minY;
      const height = collider.maxZ - collider.minZ;
      if (!(width > 0 && depth > 0 && height > 0)) {
        continue;
      }
      const mesh = new three.Mesh(
        new three.BoxGeometry(width, height, depth),
        new materialCtor({ color: DEBUG_COLLIDER_COLOR, wireframe: true }) as never
      );
      mesh.position.set(
        (collider.minX + collider.maxX) * 0.5,
        (collider.minZ + collider.maxZ) * 0.5,
        (collider.minY + collider.maxY) * 0.5
      );
      scene.add(mesh as unknown as Object3DLike);
      added.push(mesh as unknown as Object3DLike);
    }
  } catch (error) {
    console.warn('suburban collider debug skipped', error);
  }
};

const getTemplate = (
  loader: {
    load: (
      url: string,
      onLoad: (gltf: GltfLike) => void,
      onProgress?: unknown,
      onError?: (error: unknown) => void
    ) => void;
  },
  url: string
) => {
  if (templateCache.has(url)) {
    return templateCache.get(url)!;
  }
  const pending = new Promise<GltfLike | null>((resolve) => {
    try {
      loader.load(
        url,
        (gltf) => resolve(gltf),
        undefined,
        () => resolve(null)
      );
    } catch {
      resolve(null);
    }
  });
  templateCache.set(url, pending);
  return pending;
};

const maybeSetMapStats = (stats: {
  total: number;
  loaded: number;
  failed: number;
  complete: boolean;
  seed: number;
}) => {
  (globalThis as unknown as { __afpsMapStats?: unknown }).__afpsMapStats = stats;
};

const maybeSetMapDebug = (debug: unknown) => {
  (globalThis as unknown as { __afpsMapDebug?: unknown }).__afpsMapDebug = debug;
};

const addRoadGraphDebug = async (scene: SceneLike, debugData: unknown, added: Object3DLike[]) => {
  if (!isRecord(debugData)) {
    return;
  }
  const graph = isRecord(debugData.graph) ? debugData.graph : null;
  const edges = graph && Array.isArray(graph.edges) ? graph.edges : null;
  const width = toNumber(debugData.width);
  const height = toNumber(debugData.height);
  if (!edges || width === null || height === null) {
    return;
  }

  try {
    const three = await import('three');
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const points: number[] = [];
    for (const edgeEntry of edges) {
      if (!isRecord(edgeEntry) || !Array.isArray(edgeEntry.cells) || edgeEntry.cells.length < 2) {
        continue;
      }
      for (let i = 1; i < edgeEntry.cells.length; i += 1) {
        const a = edgeEntry.cells[i - 1];
        const b = edgeEntry.cells[i];
        if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) {
          continue;
        }
        const ax = toNumber(a[0]);
        const ay = toNumber(a[1]);
        const bx = toNumber(b[0]);
        const by = toNumber(b[1]);
        if (ax === null || ay === null || bx === null || by === null) {
          continue;
        }
        points.push(
          (ax - centerX) * PROCEDURAL_MAP_CONSTANTS.tileSize * MAP_SCALE,
          0.12,
          (ay - centerY) * PROCEDURAL_MAP_CONSTANTS.tileSize * MAP_SCALE
        );
        points.push(
          (bx - centerX) * PROCEDURAL_MAP_CONSTANTS.tileSize * MAP_SCALE,
          0.12,
          (by - centerY) * PROCEDURAL_MAP_CONSTANTS.tileSize * MAP_SCALE
        );
      }
    }
    if (points.length < 6) {
      return;
    }
    const geometry = new three.BufferGeometry();
    geometry.setAttribute('position', new three.Float32BufferAttribute(points, 3));
    const material = new three.LineBasicMaterial({ color: DEBUG_ROAD_GRAPH_COLOR });
    const lines = new three.LineSegments(geometry, material);
    scene.add(lines as unknown as Object3DLike);
    added.push(lines as unknown as Object3DLike);
  } catch (error) {
    console.warn('suburban road-graph debug skipped', error);
  }
};

const toProceduralManifest = (data: ProceduralRetroUrbanMap): LegacyManifest => ({
  seed: data.seed,
  placements: data.placements,
  colliders: data.colliders,
  pickupSpawns: data.pickupSpawns,
  debug: data.debug
});

export const loadRetroUrbanMap = async (
  scene: SceneLike,
  options: LoadRetroUrbanMapOptions = {}
): Promise<LoadedRetroUrbanMap> => {
  const tickRate =
    Number.isFinite(options.tickRate) && options.tickRate! > 0 ? options.tickRate! : 60;
  const seed = resolveSeed(options);
  const procedural = shouldUseProcedural(options);
  const generator = resolveGenerator(options);
  const debugBounds = (import.meta.env?.[DEBUG_BOUNDS_FLAG] ?? '') === 'true';
  const debugGrid = (import.meta.env?.[DEBUG_GRID_FLAG] ?? '') === 'true';
  const debugColliders = (import.meta.env?.[DEBUG_COLLIDERS_FLAG] ?? '') === 'true';
  const debugInteriors = (import.meta.env?.[DEBUG_INTERIORS_FLAG] ?? '') === 'true';
  const debugRoadGraph = (import.meta.env?.[DEBUG_ROAD_GRAPH_FLAG] ?? '') === 'true';
  const debugMapJson = (import.meta.env?.[DEBUG_MAP_JSON_FLAG] ?? '') === 'true';
  const enableInteriors =
    debugInteriors || (import.meta.env?.[ENABLE_INTERIORS_FLAG] ?? '') === 'true';
  const added: Object3DLike[] = [];

  try {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const manifest = procedural
      ? toProceduralManifest(
          generateProceduralRetroUrbanMap({
            seed,
            generator,
            arenaHalfSize: options.arenaHalfSize,
            tickRate
          })
        )
      : await loadLegacyManifest(tickRate);

    maybeSetMapDebug(manifest.debug);
    if (
      procedural &&
      generator === 'advanced' &&
      isRecord(manifest.debug) &&
      isRecord(manifest.debug.stats)
    ) {
      const stats = manifest.debug.stats as { attempt?: unknown; score?: unknown };
      const attempt = toNumber(stats.attempt) ?? 0;
      const score = toNumber(stats.score) ?? 0;
      console.info(
        `[afps] advanced suburban map seed=${seed} attempt=${attempt} score=${score.toFixed(2)}`
      );
    }
    if (debugMapJson && manifest.debug !== undefined) {
      console.info('[afps] map debug json', JSON.stringify(manifest.debug));
    }

    let BoxHelper: null | (new (object: object, color: number) => object) = null;
    let GridHelper:
      | null
      | (new (size: number, divisions: number, color1: number, color2: number) => object) = null;
    if (debugBounds || debugGrid) {
      const three = await import('three');
      if (debugBounds) {
        BoxHelper = three.BoxHelper;
      }
      if (debugGrid) {
        GridHelper = three.GridHelper;
      }
    }

    if (GridHelper) {
      const grid = new GridHelper(
        DEBUG_GRID_SIZE,
        DEBUG_GRID_DIVISIONS,
        DEBUG_GRID_COLOR_MAJOR,
        DEBUG_GRID_COLOR_MINOR
      );
      scene.add(grid as unknown as Object3DLike);
      added.push(grid as unknown as Object3DLike);
    }

    const placementBuckets = new Map<string, Placement[]>();
    for (const placement of manifest.placements) {
      if (!placementBuckets.has(placement.file)) {
        placementBuckets.set(placement.file, []);
      }
      placementBuckets.get(placement.file)!.push(placement);
    }

    const stats = {
      total: manifest.placements.length,
      loaded: 0,
      failed: 0,
      complete: false,
      seed: manifest.seed
    };
    maybeSetMapStats(stats);

    const files = Array.from(placementBuckets.keys()).sort();
    for (const file of files) {
      const placements = placementBuckets.get(file) ?? [];
      const template = await getTemplate(loader, `${ASSET_ROOT}${file}`);
      if (!template?.scene) {
        stats.failed += placements.length;
        continue;
      }
      for (const placement of placements) {
        const root = cloneObject(template.scene);
        const instance = root as unknown as {
          position: Vector3Like;
          rotation: { x: number; y: number; z: number };
          scale?: Vector3Like;
        };
        applyTransform(instance, placement);
        markStaticSurface(root);
        scene.add(root);
        added.push(root);
        if (BoxHelper) {
          const helper = new BoxHelper(root as unknown as object, DEBUG_BOUNDS_COLOR);
          scene.add(helper as unknown as Object3DLike);
          added.push(helper as unknown as Object3DLike);
        }
        stats.loaded += 1;
      }
    }

    if (procedural && enableInteriors) {
      await addInteriorMeshes(scene, manifest.placements, added, debugInteriors);
    }

    if (procedural && debugRoadGraph && manifest.debug !== undefined) {
      await addRoadGraphDebug(scene, manifest.debug, added);
    }

    const colliders = sanitizeColliders(manifest.colliders);
    if (debugColliders) {
      await addColliderDebugMeshes(scene, colliders, added);
    }

    stats.complete = true;
    maybeSetMapStats(stats);

    const dispose = () => {
      if (!scene.remove) {
        return;
      }
      for (let i = added.length - 1; i >= 0; i -= 1) {
        scene.remove(added[i]!);
      }
      added.length = 0;
    };

    return {
      seed: manifest.seed >>> 0,
      colliders,
      pickupSpawns: manifest.pickupSpawns,
      placements: manifest.placements.length,
      loaded: stats.loaded,
      failed: stats.failed,
      dispose
    };
  } catch (error) {
    console.warn('suburban map load skipped', error);
    const stats = { total: 0, loaded: 0, failed: 0, complete: true, seed: seed >>> 0 };
    maybeSetMapStats(stats);
    maybeSetMapDebug(undefined);
    return {
      seed: seed >>> 0,
      colliders: [],
      pickupSpawns: [],
      placements: 0,
      loaded: 0,
      failed: 0,
      dispose: () => {}
    };
  }
};

export { generateProceduralRetroUrbanMap };
export type { RetroMapPickupSpawn };
export const __test = {
  clearCache: () => {
    templateCache.clear();
  }
};
