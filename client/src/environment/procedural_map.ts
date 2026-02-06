import { SIM_CONFIG } from '../sim/config';
import type { AabbCollider } from '../world/collision';

export type DoorSide = 'north' | 'east' | 'south' | 'west';
export type PickupKind = 'health' | 'weapon';

export interface RetroMapPlacement {
  file: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  randomYaw?: boolean;
  kind?: 'road' | 'building' | 'prop';
  roadMask?: number;
  cellX?: number;
  cellY?: number;
  doorSide?: DoorSide;
}

export interface RetroMapRoad {
  cellX: number;
  cellY: number;
  mask: number;
  file: string;
  rotationY: number;
}

export interface RetroMapBuilding {
  cellX: number;
  cellY: number;
  doorSide: DoorSide;
  file: string;
  rotationY: number;
  position: [number, number, number];
}

export interface RetroMapPickupSpawn {
  id: number;
  kind: PickupKind;
  position: [number, number, number];
  radius: number;
  weaponSlot: number;
  amount: number;
  respawnSeconds: number;
}

export interface ProceduralRetroUrbanMap {
  seed: number;
  placements: RetroMapPlacement[];
  roads: RetroMapRoad[];
  buildings: RetroMapBuilding[];
  colliders: AabbCollider[];
  pickupSpawns: RetroMapPickupSpawn[];
  gridRadius: number;
  tileSize: number;
  mapScale: number;
}

export interface ProceduralMapOptions {
  seed?: number;
  arenaHalfSize?: number;
  tickRate?: number;
}

const TILE_SIZE = 4;
const MAP_SCALE = 2.5;
// Building GLB footprints are ~4.6m max at map scale; keep collision walls
// close to visual walls so impacts and movement contact feel grounded.
const ROOM_HALF = 2.35;
const WALL_THICKNESS = 0.24;
const WALL_HEIGHT = 3.4;
const DOOR_HALF_WIDTH = 0.7;
const DOOR_HEIGHT = 2.0;
const ROOF_THICKNESS = 0.2;
const PICKUP_HEIGHT = 0.2;
const PICKUP_RADIUS = 1.2;
const HALF_PI = Math.PI / 2;
const ROOF_SURFACE = 0;
const WALL_SURFACE = 1;

const ROAD_NORTH = 1 << 0;
const ROAD_EAST = 1 << 1;
const ROAD_SOUTH = 1 << 2;
const ROAD_WEST = 1 << 3;

const BUILDING_FILES = [
  'building-type-a.glb',
  'building-type-b.glb',
  'building-type-c.glb',
  'building-type-d.glb',
  'building-type-e.glb',
  'building-type-f.glb',
  'building-type-g.glb',
  'building-type-h.glb',
  'building-type-i.glb',
  'building-type-j.glb',
  'building-type-k.glb',
  'building-type-l.glb',
  'building-type-m.glb',
  'building-type-n.glb',
  'building-type-o.glb',
  'building-type-p.glb',
  'building-type-q.glb',
  'building-type-r.glb',
  'building-type-s.glb',
  'building-type-t.glb',
  'building-type-u.glb'
];

export interface BuildingColliderPart {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  maxZ: number;
}

export interface BuildingColliderProfile {
  parts: readonly BuildingColliderPart[];
  bounds: BuildingColliderPart;
}

const createColliderProfile = (parts: readonly BuildingColliderPart[]): BuildingColliderProfile => {
  const normalized = parts
    .map((part) => ({
      minX: Number.isFinite(part.minX) ? part.minX : -ROOM_HALF,
      maxX: Number.isFinite(part.maxX) ? part.maxX : ROOM_HALF,
      minY: Number.isFinite(part.minY) ? part.minY : -ROOM_HALF,
      maxY: Number.isFinite(part.maxY) ? part.maxY : ROOM_HALF,
      maxZ: Number.isFinite(part.maxZ) ? Math.max(0.4, part.maxZ) : WALL_HEIGHT
    }))
    .filter((part) => part.maxX > part.minX && part.maxY > part.minY);
  const fallback = normalized.length > 0
    ? normalized
    : [{ minX: -ROOM_HALF, maxX: ROOM_HALF, minY: -ROOM_HALF, maxY: ROOM_HALF, maxZ: WALL_HEIGHT }];
  const bounds = fallback.reduce(
    (acc, part) => ({
      minX: Math.min(acc.minX, part.minX),
      maxX: Math.max(acc.maxX, part.maxX),
      minY: Math.min(acc.minY, part.minY),
      maxY: Math.max(acc.maxY, part.maxY),
      maxZ: Math.max(acc.maxZ, part.maxZ)
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      maxZ: 0
    }
  );
  return { parts: fallback, bounds };
};

const BUILDING_COLLIDER_PROFILES = new Map<string, BuildingColliderProfile>([
  [
    'building-type-a.glb',
    createColliderProfile([{ minX: -1.625, maxX: 1.625, minY: -1.2852, maxY: 1.2852, maxZ: 2.0839 }])
  ],
  [
    'building-type-b.glb',
    createColliderProfile([
      { minX: -2.285, maxX: 2.285, minY: -1.205, maxY: 1.425, maxZ: 2.8438 },
      { minX: 1.08, maxX: 2.285, minY: -1.425, maxY: -0.94, maxZ: 2.007 }
    ])
  ],
  [
    'building-type-c.glb',
    createColliderProfile([{ minX: -1.608, maxX: 1.608, minY: -1.2852, maxY: 1.2852, maxZ: 2.5839 }])
  ],
  [
    'building-type-d.glb',
    createColliderProfile([{ minX: -2.1955, maxX: 2.1955, minY: -1.285, maxY: 1.285, maxZ: 3.0938 }])
  ],
  [
    'building-type-e.glb',
    createColliderProfile([{ minX: -1.625, maxX: 1.625, minY: -1.285, maxY: 1.285, maxZ: 2.8438 }])
  ],
  [
    'building-type-f.glb',
    createColliderProfile([{ minX: -1.785, maxX: 1.785, minY: -1.7574, maxY: 1.7574, maxZ: 2.8438 }])
  ],
  [
    'building-type-g.glb',
    createColliderProfile([
      { minX: -1.8125, maxX: 1.8125, minY: -1.1461, maxY: 1.4725, maxZ: 1.9205 },
      { minX: 0.4722, maxX: 1.8125, minY: -1.4725, maxY: -0.1322, maxZ: 1.9205 }
    ])
  ],
  [
    'building-type-h.glb',
    createColliderProfile([{ minX: -1.625, maxX: 1.625, minY: -1.145, maxY: 1.145, maxZ: 1.8437 }])
  ],
  [
    'building-type-i.glb',
    createColliderProfile([{ minX: -1.608, maxX: 1.608, minY: -1.285, maxY: 1.285, maxZ: 1.8437 }])
  ],
  [
    'building-type-j.glb',
    createColliderProfile([{ minX: -1.7125, maxX: 1.7125, minY: -1.145, maxY: 1.145, maxZ: 2.5938 }])
  ],
  [
    'building-type-k.glb',
    createColliderProfile([{ minX: -1.1512, maxX: 1.1512, minY: -1.275, maxY: 1.275, maxZ: 2.874 }])
  ],
  [
    'building-type-l.glb',
    createColliderProfile([{ minX: -1.292, maxX: 1.292, minY: -1.275, maxY: 1.275, maxZ: 2.623 }])
  ],
  [
    'building-type-m.glb',
    createColliderProfile([{ minX: -1.785, maxX: 1.785, minY: -1.785, maxY: 1.785, maxZ: 1.8437 }])
  ],
  [
    'building-type-n.glb',
    createColliderProfile([{ minX: -2.2303, maxX: 2.2303, minY: -1.7224, maxY: 1.7224, maxZ: 2.8438 }])
  ],
  [
    'building-type-o.glb',
    createColliderProfile([{ minX: -1.5875, maxX: 1.5875, minY: -1.285, maxY: 1.285, maxZ: 2.8438 }])
  ],
  [
    'building-type-p.glb',
    createColliderProfile([{ minX: -1.55, maxX: 1.55, minY: -1.2375, maxY: 1.2375, maxZ: 2.295 }])
  ],
  [
    'building-type-q.glb',
    createColliderProfile([{ minX: -1.55, maxX: 1.55, minY: -1.055, maxY: 1.159, maxZ: 2.295 }])
  ],
  [
    'building-type-r.glb',
    createColliderProfile([{ minX: -1.285, maxX: 1.285, minY: -1.275, maxY: 1.275, maxZ: 2.8529 }])
  ],
  [
    'building-type-s.glb',
    createColliderProfile([{ minX: -1.7575, maxX: 1.7575, minY: -1.358, maxY: 1.358, maxZ: 2.8438 }])
  ],
  [
    'building-type-t.glb',
    createColliderProfile([{ minX: -1.659, maxX: 1.625, minY: -1.758, maxY: 1.758, maxZ: 2.8908 }])
  ],
  [
    'building-type-u.glb',
    createColliderProfile([{ minX: -1.785, maxX: 1.785, minY: -1.3587, maxY: 1.3587, maxZ: 2.8438 }])
  ]
]);

const DEFAULT_BUILDING_COLLIDER_PROFILE = createColliderProfile([
  { minX: -ROOM_HALF, maxX: ROOM_HALF, minY: -ROOM_HALF, maxY: ROOM_HALF, maxZ: WALL_HEIGHT }
]);

export const getBuildingColliderProfile = (file: string): BuildingColliderProfile =>
  BUILDING_COLLIDER_PROFILES.get(file) ?? DEFAULT_BUILDING_COLLIDER_PROFILE;

const toCellKey = (x: number, y: number) => `${x}:${y}`;
const isRoadCell = (roads: Set<string>, x: number, y: number) => roads.has(toCellKey(x, y));

class XorShift32 {
  private state: number;

  constructor(seed: number) {
    const safeSeed = Number.isFinite(seed) ? Math.floor(seed) : 0;
    this.state = (safeSeed >>> 0) || 1;
  }

  nextU32() {
    let x = this.state >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    if (x === 0) {
      x = 1;
    }
    this.state = x;
    return this.state;
  }

  shuffle<T>(values: T[]) {
    for (let i = values.length - 1; i > 0; i -= 1) {
      const j = this.nextU32() % (i + 1);
      [values[i], values[j]] = [values[j], values[i]];
    }
  }
}

const isInside = (value: number, radius: number) => value >= -radius && value <= radius;

const hasAdjacentRoad = (roads: Set<string>, x: number, y: number) =>
  isRoadCell(roads, x + 1, y) ||
  isRoadCell(roads, x - 1, y) ||
  isRoadCell(roads, x, y + 1) ||
  isRoadCell(roads, x, y - 1);

const hashCell = (seed: number, cellX: number, cellY: number) => {
  const x = Math.imul(cellX + 97, 73856093) >>> 0;
  const y = Math.imul(cellY + 193, 19349663) >>> 0;
  return ((seed >>> 0) ^ x ^ y) >>> 0;
};

const distanceToRoadAlongDir = (
  roads: Set<string>,
  gridRadius: number,
  cellX: number,
  cellY: number,
  dirX: number,
  dirY: number
) => {
  const maxSteps = Math.max(1, gridRadius * 2);
  for (let step = 1; step <= maxSteps; step += 1) {
    const x = cellX + dirX * step;
    const y = cellY + dirY * step;
    if (!isInside(x, gridRadius) || !isInside(y, gridRadius)) {
      break;
    }
    if (isRoadCell(roads, x, y)) {
      return step;
    }
  }
  return Number.POSITIVE_INFINITY;
};

const resolveDoorSide = (roads: Set<string>, gridRadius: number, cellX: number, cellY: number, seed: number): DoorSide => {
  const candidates: Array<{ side: DoorSide; dist: number }> = [
    { side: 'north', dist: distanceToRoadAlongDir(roads, gridRadius, cellX, cellY, 0, 1) },
    { side: 'east', dist: distanceToRoadAlongDir(roads, gridRadius, cellX, cellY, 1, 0) },
    { side: 'south', dist: distanceToRoadAlongDir(roads, gridRadius, cellX, cellY, 0, -1) },
    { side: 'west', dist: distanceToRoadAlongDir(roads, gridRadius, cellX, cellY, -1, 0) }
  ];
  const bestDist = candidates.reduce((best, entry) => Math.min(best, entry.dist), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(bestDist)) {
    return 'south';
  }
  const best = candidates.filter((entry) => entry.dist === bestDist);
  if (best.length === 0) {
    return 'south';
  }
  const tie = hashCell(seed, cellX, cellY);
  return best[tie % best.length]?.side ?? 'south';
};

const roadMask = (roads: Set<string>, cellX: number, cellY: number) => {
  let mask = 0;
  if (isRoadCell(roads, cellX, cellY + 1)) mask |= ROAD_NORTH;
  if (isRoadCell(roads, cellX + 1, cellY)) mask |= ROAD_EAST;
  if (isRoadCell(roads, cellX, cellY - 1)) mask |= ROAD_SOUTH;
  if (isRoadCell(roads, cellX - 1, cellY)) mask |= ROAD_WEST;
  return mask;
};

const countBits = (mask: number) => {
  let bits = 0;
  let next = mask & 0b1111;
  while (next > 0) {
    bits += next & 1;
    next >>= 1;
  }
  return bits;
};

const resolveRoadAsset = (mask: number): { file: string; rotationY: number } => {
  if (mask === (ROAD_NORTH | ROAD_EAST | ROAD_SOUTH | ROAD_WEST)) {
    return { file: 'roads/road-crossroad.glb', rotationY: 0 };
  }

  const bits = countBits(mask);
  if (bits === 3) {
    const missing = [ROAD_NORTH, ROAD_EAST, ROAD_SOUTH, ROAD_WEST].find((bit) => (mask & bit) === 0) ?? ROAD_SOUTH;
    if (missing === ROAD_NORTH) return { file: 'roads/road-intersection.glb', rotationY: Math.PI };
    if (missing === ROAD_EAST) return { file: 'roads/road-intersection.glb', rotationY: -HALF_PI };
    if (missing === ROAD_SOUTH) return { file: 'roads/road-intersection.glb', rotationY: 0 };
    return { file: 'roads/road-intersection.glb', rotationY: HALF_PI };
  }

  if (bits === 2) {
    if (mask === (ROAD_NORTH | ROAD_SOUTH)) {
      return { file: 'roads/road-straight.glb', rotationY: 0 };
    }
    if (mask === (ROAD_EAST | ROAD_WEST)) {
      return { file: 'roads/road-straight.glb', rotationY: HALF_PI };
    }
    if (mask === (ROAD_NORTH | ROAD_EAST)) {
      return { file: 'roads/road-bend.glb', rotationY: 0 };
    }
    if (mask === (ROAD_EAST | ROAD_SOUTH)) {
      return { file: 'roads/road-bend.glb', rotationY: HALF_PI };
    }
    if (mask === (ROAD_SOUTH | ROAD_WEST)) {
      return { file: 'roads/road-bend.glb', rotationY: Math.PI };
    }
    if (mask === (ROAD_WEST | ROAD_NORTH)) {
      return { file: 'roads/road-bend.glb', rotationY: -HALF_PI };
    }
  }

  if (bits === 1) {
    if (mask === ROAD_NORTH) return { file: 'roads/road-end.glb', rotationY: Math.PI };
    if (mask === ROAD_EAST) return { file: 'roads/road-end.glb', rotationY: -HALF_PI };
    if (mask === ROAD_SOUTH) return { file: 'roads/road-end.glb', rotationY: 0 };
    if (mask === ROAD_WEST) return { file: 'roads/road-end.glb', rotationY: HALF_PI };
  }

  return { file: 'roads/road-square.glb', rotationY: 0 };
};

const resolveBuildingRotation = (doorSide: DoorSide) => {
  if (doorSide === 'south') return 0;
  if (doorSide === 'west') return HALF_PI;
  if (doorSide === 'north') return Math.PI;
  return -HALF_PI;
};

const rotatePointByDoorSide = (x: number, y: number, doorSide: DoorSide): [number, number] => {
  if (doorSide === 'west') {
    return [-y, x];
  }
  if (doorSide === 'north') {
    return [-x, -y];
  }
  if (doorSide === 'east') {
    return [y, -x];
  }
  return [x, y];
};

const rotatePartByDoorSide = (part: BuildingColliderPart, doorSide: DoorSide): BuildingColliderPart => {
  if (doorSide === 'south') {
    return { ...part };
  }
  const corners = [
    rotatePointByDoorSide(part.minX, part.minY, doorSide),
    rotatePointByDoorSide(part.minX, part.maxY, doorSide),
    rotatePointByDoorSide(part.maxX, part.minY, doorSide),
    rotatePointByDoorSide(part.maxX, part.maxY, doorSide)
  ];
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of corners) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    maxZ: part.maxZ
  };
};

const addCollider = (
  colliders: AabbCollider[],
  nextId: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
  surfaceType: number
) => {
  colliders.push({
    id: nextId,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    surfaceType
  });
  return nextId + 1;
};

const appendBuildingColliders = (colliders: AabbCollider[], nextId: number, building: RetroMapBuilding) => {
  const cx = building.cellX * TILE_SIZE * MAP_SCALE;
  const cy = building.cellY * TILE_SIZE * MAP_SCALE;
  const profile = getBuildingColliderProfile(building.file);
  let id = nextId;

  for (const rawPart of profile.parts) {
    const part = rotatePartByDoorSide(rawPart, building.doorSide);
    id = addCollider(
      colliders,
      id,
      cx + part.minX,
      cx + part.maxX,
      cy + part.minY,
      cy + part.maxY,
      0,
      part.maxZ,
      WALL_SURFACE
    );
  }
  return id;
};

const resolvePickupPosition = (building: RetroMapBuilding): [number, number, number] => {
  const cx = building.cellX * TILE_SIZE * MAP_SCALE;
  const cy = building.cellY * TILE_SIZE * MAP_SCALE;
  const bounds = rotatePartByDoorSide(getBuildingColliderProfile(building.file).bounds, building.doorSide);
  const offset = PICKUP_RADIUS + 0.35;
  let x = cx;
  let y = cy;
  if (building.doorSide === 'north') y += bounds.maxY + offset;
  else if (building.doorSide === 'east') x += bounds.maxX + offset;
  else if (building.doorSide === 'south') y += bounds.minY - offset;
  else x += bounds.minX - offset;
  return [x, y, PICKUP_HEIGHT];
};

export const generateProceduralRetroUrbanMap = (options: ProceduralMapOptions = {}): ProceduralRetroUrbanMap => {
  const seed = Number.isFinite(options.seed) ? (Math.floor(options.seed!) >>> 0) : 0;
  const arenaHalfSize =
    Number.isFinite(options.arenaHalfSize) && options.arenaHalfSize! > 0
      ? options.arenaHalfSize!
      : SIM_CONFIG.arenaHalfSize;
  const tickRate = Number.isFinite(options.tickRate) && options.tickRate! > 0 ? options.tickRate! : 60;

  let gridRadius = Math.floor(arenaHalfSize / (TILE_SIZE * MAP_SCALE));
  gridRadius = Math.max(2, Math.min(gridRadius, 12));

  const roads = new Set<string>();
  for (let i = -gridRadius; i <= gridRadius; i += 1) {
    roads.add(toCellKey(i, 0));
    roads.add(toCellKey(0, i));
    roads.add(toCellKey(i, -gridRadius));
    roads.add(toCellKey(i, gridRadius));
    roads.add(toCellKey(-gridRadius, i));
    roads.add(toCellKey(gridRadius, i));
  }

  const rng = new XorShift32(seed);
  const lineCandidates: number[] = [];
  for (let i = -gridRadius + 1; i <= gridRadius - 1; i += 1) {
    if (i !== 0) {
      lineCandidates.push(i);
    }
  }
  const extraLines = Math.min(2, lineCandidates.length);
  rng.shuffle(lineCandidates);
  for (let i = 0; i < extraLines; i += 1) {
    const x = lineCandidates[i]!;
    for (let y = -gridRadius; y <= gridRadius; y += 1) {
      roads.add(toCellKey(x, y));
    }
  }
  rng.shuffle(lineCandidates);
  for (let i = 0; i < extraLines; i += 1) {
    const y = lineCandidates[i]!;
    for (let x = -gridRadius; x <= gridRadius; x += 1) {
      roads.add(toCellKey(x, y));
    }
  }

  const roadEntries: RetroMapRoad[] = [];
  const placements: RetroMapPlacement[] = [];
  for (let y = -gridRadius; y <= gridRadius; y += 1) {
    for (let x = -gridRadius; x <= gridRadius; x += 1) {
      if (!isRoadCell(roads, x, y)) {
        continue;
      }
      const mask = roadMask(roads, x, y);
      const road = resolveRoadAsset(mask);
      roadEntries.push({
        cellX: x,
        cellY: y,
        mask,
        file: road.file,
        rotationY: road.rotationY
      });
      placements.push({
        file: road.file,
        kind: 'road',
        roadMask: mask,
        cellX: x,
        cellY: y,
        position: [x * TILE_SIZE, 0, y * TILE_SIZE],
        rotation: [0, road.rotationY, 0]
      });
    }
  }

  const buildings: RetroMapBuilding[] = [];
  for (let y = -gridRadius; y <= gridRadius; y += 1) {
    for (let x = -gridRadius; x <= gridRadius; x += 1) {
      if (isRoadCell(roads, x, y) || !hasAdjacentRoad(roads, x, y)) {
        continue;
      }
      const doorSide = resolveDoorSide(roads, gridRadius, x, y, seed);
      const buildingIndex = hashCell(seed, x, y) % BUILDING_FILES.length;
      const file = BUILDING_FILES[buildingIndex] ?? BUILDING_FILES[0]!;
      const rotationY = resolveBuildingRotation(doorSide);
      buildings.push({
        cellX: x,
        cellY: y,
        doorSide,
        file,
        rotationY,
        position: [x * TILE_SIZE, 0, y * TILE_SIZE]
      });
      placements.push({
        file,
        kind: 'building',
        cellX: x,
        cellY: y,
        doorSide,
        position: [x * TILE_SIZE, 0, y * TILE_SIZE],
        rotation: [0, rotationY, 0]
      });
    }
  }

  const colliders: AabbCollider[] = [];
  let nextColliderId = 1;
  for (const building of buildings) {
    nextColliderId = appendBuildingColliders(colliders, nextColliderId, building);
  }

  const pickupSpawns: RetroMapPickupSpawn[] = [];
  let pickupId = 1;
  let healthCount = 0;
  for (let i = 0; i < buildings.length && healthCount < 4; i += 1) {
    pickupSpawns.push({
      id: pickupId++,
      kind: 'health',
      position: resolvePickupPosition(buildings[i]!),
      radius: PICKUP_RADIUS,
      weaponSlot: 0,
      amount: 25,
      respawnSeconds: 10
    });
    healthCount += 1;
  }

  let weaponCount = 0;
  for (let i = 0; i < buildings.length && weaponCount < 2; i += 1) {
    const index = buildings.length - 1 - i;
    pickupSpawns.push({
      id: pickupId++,
      kind: 'weapon',
      position: resolvePickupPosition(buildings[index]!),
      radius: PICKUP_RADIUS,
      weaponSlot: weaponCount % 2,
      amount: 0,
      respawnSeconds: 15
    });
    weaponCount += 1;
  }

  const fallbackPositions: Array<[number, number, number]> = [
    [-6, -6, PICKUP_HEIGHT],
    [6, -6, PICKUP_HEIGHT],
    [-6, 6, PICKUP_HEIGHT],
    [6, 6, PICKUP_HEIGHT],
    [0, -8, PICKUP_HEIGHT],
    [0, 8, PICKUP_HEIGHT]
  ];

  for (let i = healthCount; i < 4; i += 1) {
    pickupSpawns.push({
      id: pickupId++,
      kind: 'health',
      position: fallbackPositions[i % fallbackPositions.length]!,
      radius: PICKUP_RADIUS,
      weaponSlot: 0,
      amount: 25,
      respawnSeconds: 10
    });
  }

  for (let i = weaponCount; i < 2; i += 1) {
    pickupSpawns.push({
      id: pickupId++,
      kind: 'weapon',
      position: fallbackPositions[(i + 4) % fallbackPositions.length]!,
      radius: PICKUP_RADIUS,
      weaponSlot: i % 2,
      amount: 0,
      respawnSeconds: 15
    });
  }

  const maybeTreeCells = buildings.filter((_entry, index) => index % 3 === 0).slice(0, 18);
  for (let i = 0; i < maybeTreeCells.length; i += 1) {
    const lot = maybeTreeCells[i]!;
    const file = i % 2 === 0 ? 'tree-large.glb' : 'tree-small.glb';
    const offsetX = i % 2 === 0 ? -TILE_SIZE * 0.25 : TILE_SIZE * 0.2;
    const offsetY = i % 3 === 0 ? TILE_SIZE * 0.25 : -TILE_SIZE * 0.2;
    placements.push({
      file,
      kind: 'prop',
      cellX: lot.cellX,
      cellY: lot.cellY,
      position: [lot.position[0] + offsetX, 0, lot.position[2] + offsetY],
      rotation: [0, ((i % 4) * HALF_PI) % (Math.PI * 2), 0],
      scale: 0.9
    });
  }

  const pickupTickQuant = Math.max(1, Math.round(tickRate));
  for (const pickup of pickupSpawns) {
    pickup.respawnSeconds = Math.max(1, Math.round(pickup.respawnSeconds * pickupTickQuant) / pickupTickQuant);
  }

  return {
    seed,
    placements,
    roads: roadEntries,
    buildings,
    colliders,
    pickupSpawns,
    gridRadius,
    tileSize: TILE_SIZE,
    mapScale: MAP_SCALE
  };
};

export const PROCEDURAL_MAP_CONSTANTS = {
  tileSize: TILE_SIZE,
  mapScale: MAP_SCALE,
  roomHalf: ROOM_HALF,
  wallThickness: WALL_THICKNESS,
  wallHeight: WALL_HEIGHT,
  doorHalfWidth: DOOR_HALF_WIDTH,
  doorHeight: DOOR_HEIGHT,
  roofThickness: ROOF_THICKNESS
};
