import type { DoorSide, RetroMapBuilding, RetroMapPlacement, RetroMapRoad } from './procedural_map';

export enum CellRoad {
  Empty = 0,
  RoadGround = 1,
  RoadElevated = 2
}

export enum CellLand {
  Unassigned = 0,
  Lot = 1,
  Building = 2,
  Yard = 3,
  Park = 4,
  Fence = 5,
  Tree = 6,
  Prop = 7,
  Reserved = 8
}

export type RoadHierarchy = 'highway' | 'arterial' | 'collector' | 'local';

export interface RoadNode {
  id: number;
  x: number;
  y: number;
}

export interface RoadEdge {
  id: number;
  fromNodeId: number;
  toNodeId: number;
  hierarchy: RoadHierarchy;
  layer: 'ground' | 'elevated';
  cells: Array<[number, number]>;
  culdesac: boolean;
}

export interface RoadGraph {
  nodes: RoadNode[];
  edges: RoadEdge[];
}

export interface RoadPieceMetadata {
  id: string;
  file: string;
  type: 'straight' | 'corner' | 't' | 'cross' | 'end' | 'culdesac' | 'bridge';
  connectionsMask: number;
  hierarchy: ReadonlyArray<RoadHierarchy>;
  layer: 'ground' | 'elevated';
  footprintW: number;
  footprintH: number;
}

export interface BuildingAssetMetadata {
  file: string;
  footprintW: number;
  footprintH: number;
  tags: string[];
  allowedRotations: Array<0 | 90 | 180 | 270>;
  frontDirection: DoorSide;
}

export interface PropAssetMetadata {
  file: string;
  tags: string[];
  placement: 'yard' | 'park' | 'boundary' | 'roadside';
  allowedRotations: Array<0 | 90 | 180 | 270>;
  yOffset?: number;
}

export interface AssetRegistry {
  roadPieces: RoadPieceMetadata[];
  buildingAssets: BuildingAssetMetadata[];
  props: PropAssetMetadata[];
}

export interface MapGenConfig {
  width: number;
  height: number;
  targetRoadCoverage: number;
  targetBuildingCoverage: number;
  parkProbability: number;
  backyardFillStyle: 'trees' | 'fenced yards' | 'mixed';
  enableHighwayOverpass: boolean;
  highwayCount: 0 | 1;
  arterialSpacingRange: [number, number];
  collectorSpacingRange: [number, number];
  localStreetMaxLength: number;
  intersectionMinSpacing: number;
  maxTurnsPerArterialPath: number;
  culdesacRate: number;
  forbidDeadEndsOnArterialsCollectors: boolean;
  blockAreaMin: number;
  blockAreaMax: number;
  blockAspectRatioRange: [number, number];
  blockSubdivisionThresholdArea: number;
  lotFrontageRange: [number, number];
  lotDepthRange: [number, number];
  cornerLotChance: number;
  drivewayChance: number;
  ensureHousesFaceRoad: boolean;
  minUniqueHousePrefabsUsed: number;
  avoidSamePrefabAdjacent: boolean;
  maxRepeatsInRadius: number;
  maxGenerationAttempts: number;
  minimumScoreToAccept: number;
  seed: number;
}

export interface BlockRegion {
  id: number;
  cells: number[];
  area: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  aspectRatio: number;
}

export interface LotPlan {
  id: number;
  blockId: number;
  cells: number[];
  frontageCells: number[];
  front: DoorSide;
  isCorner: boolean;
}

export interface BuildingPlacement {
  file: string;
  cellX: number;
  cellY: number;
  doorSide: DoorSide;
  rotationY: number;
  lotId: number;
  occupiedCells: number[];
}

export interface DecorationPlacement {
  file: string;
  cellX: number;
  cellY: number;
  rotationY: number;
  scale: number;
  yOffset: number;
  kind: 'prop';
}

export interface ValidationMetrics {
  roadConnected: boolean;
  orphanRoadTiles: number;
  overlaps: number;
  unassignedLandCells: number;
  roadCoverage: number;
  buildingCoverage: number;
  blocksTooSmall: number;
  blocksAspectViolations: number;
  closeIntersectionPairs: number;
  uniqueBuildingsUsed: number;
  connectivityScore: number;
  intersectionSpacingScore: number;
  blockQualityScore: number;
  densityScore: number;
  varietyScore: number;
  weirdnessPenalty: number;
  score: number;
  isValid: boolean;
}

export interface AdvancedGeneratorStats {
  attempt: number;
  attempts: number;
  seed: number;
  score: number;
  metrics: ValidationMetrics;
}

export interface AdvancedSuburbanMapResult {
  seed: number;
  config: MapGenConfig;
  graph: RoadGraph;
  width: number;
  height: number;
  roadGround: Uint8Array;
  roadElevated: Uint8Array;
  land: Uint8Array;
  roadCellsCuldesac: Set<number>;
  roads: RetroMapRoad[];
  buildings: RetroMapBuilding[];
  placements: RetroMapPlacement[];
  buildingPlacements: BuildingPlacement[];
  decorations: DecorationPlacement[];
  blocks: BlockRegion[];
  lots: LotPlan[];
  validation: ValidationMetrics;
  stats: AdvancedGeneratorStats;
  debug: {
    seed: number;
    attempt: number;
    score: number;
    graph: RoadGraph;
    width: number;
    height: number;
    roadGround: number[];
    roadElevated: number[];
    land: number[];
    placements: Array<{
      file: string;
      position: [number, number, number];
      rotation?: [number, number, number];
    }>;
    metrics: ValidationMetrics;
  };
}

const ROAD_NORTH = 1 << 0;
const ROAD_EAST = 1 << 1;
const ROAD_SOUTH = 1 << 2;
const ROAD_WEST = 1 << 3;

const HALF_PI = Math.PI / 2;

const HIERARCHY_RANK: Record<RoadHierarchy, number> = {
  highway: 4,
  arterial: 3,
  collector: 2,
  local: 1
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const toDoorRotation = (doorSide: DoorSide) => {
  if (doorSide === 'south') return 0;
  if (doorSide === 'west') return HALF_PI;
  if (doorSide === 'north') return Math.PI;
  return -HALF_PI;
};

const inBounds = (width: number, height: number, x: number, y: number) =>
  x >= 0 && y >= 0 && x < width && y < height;

const toIndex = (width: number, x: number, y: number) => y * width + x;
const fromIndex = (width: number, index: number): [number, number] => [
  index % width,
  Math.floor(index / width)
];

class DeterministicRng {
  private state: number;

  constructor(seed: number) {
    const safe = Number.isFinite(seed) ? Math.floor(seed) >>> 0 : 1;
    this.state = safe === 0 ? 1 : safe;
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
    return x;
  }

  nextFloat() {
    return this.nextU32() / 0xffffffff;
  }

  int(minInclusive: number, maxInclusive: number) {
    if (maxInclusive <= minInclusive) {
      return minInclusive;
    }
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + (this.nextU32() % span);
  }

  chance(probability: number) {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return this.nextFloat() < probability;
  }

  pick<T>(values: readonly T[]): T {
    const index = this.int(0, Math.max(0, values.length - 1));
    return values[index]!;
  }

  shuffle<T>(values: T[]) {
    for (let i = values.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      [values[i], values[j]] = [values[j]!, values[i]!];
    }
  }
}

const makeDefaultAssetRegistry = (): AssetRegistry => {
  const buildingFiles = 'abcdefghijklmnopqrstu'
    .split('')
    .map((suffix) => `building-type-${suffix}.glb`);
  const buildingAssets = buildingFiles.map<BuildingAssetMetadata>((file, index) => {
    const wide = index % 5 === 0 ? 2 : 1;
    const deep = index % 7 === 0 ? 2 : 1;
    const tags = ['house_small'];
    if (wide > 1 || deep > 1) {
      tags.push('house_large');
    }
    return {
      file,
      footprintW: wide,
      footprintH: deep,
      tags,
      allowedRotations: [0, 90, 180, 270],
      frontDirection: 'south'
    };
  });

  const allRoadHierarchies: ReadonlyArray<RoadHierarchy> = [
    'highway',
    'arterial',
    'collector',
    'local'
  ];
  const roadPieces: RoadPieceMetadata[] = [
    {
      id: 'straight-ground',
      file: 'roads/road-straight.glb',
      type: 'straight',
      connectionsMask: ROAD_NORTH | ROAD_SOUTH,
      hierarchy: allRoadHierarchies,
      layer: 'ground',
      footprintW: 1,
      footprintH: 1
    },
    {
      id: 'corner-ground',
      file: 'roads/road-bend.glb',
      type: 'corner',
      connectionsMask: ROAD_NORTH | ROAD_EAST,
      hierarchy: allRoadHierarchies,
      layer: 'ground',
      footprintW: 1,
      footprintH: 1
    },
    {
      id: 't-ground',
      file: 'roads/road-intersection.glb',
      type: 't',
      connectionsMask: ROAD_NORTH | ROAD_EAST | ROAD_WEST,
      hierarchy: allRoadHierarchies,
      layer: 'ground',
      footprintW: 1,
      footprintH: 1
    },
    {
      id: 'cross-ground',
      file: 'roads/road-crossroad.glb',
      type: 'cross',
      connectionsMask: ROAD_NORTH | ROAD_EAST | ROAD_SOUTH | ROAD_WEST,
      hierarchy: allRoadHierarchies,
      layer: 'ground',
      footprintW: 1,
      footprintH: 1
    },
    {
      id: 'cross-major',
      file: 'roads/road-crossroad-line.glb',
      type: 'cross',
      connectionsMask: ROAD_NORTH | ROAD_EAST | ROAD_SOUTH | ROAD_WEST,
      hierarchy: ['arterial', 'highway'],
      layer: 'ground',
      footprintW: 1,
      footprintH: 1
    },
    {
      id: 'end-ground',
      file: 'roads/road-end.glb',
      type: 'end',
      connectionsMask: ROAD_NORTH,
      hierarchy: allRoadHierarchies,
      layer: 'ground',
      footprintW: 1,
      footprintH: 1
    },
    {
      id: 'culdesac-ground',
      file: 'roads/road-end-round.glb',
      type: 'culdesac',
      connectionsMask: ROAD_NORTH,
      hierarchy: ['local'],
      layer: 'ground',
      footprintW: 1,
      footprintH: 1
    },
    {
      id: 'bridge',
      file: 'roads/road-bridge.glb',
      type: 'bridge',
      connectionsMask: ROAD_NORTH | ROAD_SOUTH,
      hierarchy: ['highway'],
      layer: 'elevated',
      footprintW: 1,
      footprintH: 1
    }
  ];

  const props: PropAssetMetadata[] = [
    {
      file: 'tree-large.glb',
      tags: ['tree'],
      placement: 'yard',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'tree-small.glb',
      tags: ['tree'],
      placement: 'yard',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'fence-low.glb',
      tags: ['fence'],
      placement: 'boundary',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'fence.glb',
      tags: ['fence'],
      placement: 'boundary',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'planter.glb',
      tags: ['planter'],
      placement: 'yard',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'path-short.glb',
      tags: ['path'],
      placement: 'yard',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'path-long.glb',
      tags: ['path'],
      placement: 'yard',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'path-stones-short.glb',
      tags: ['path'],
      placement: 'park',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'path-stones-long.glb',
      tags: ['path'],
      placement: 'park',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'path-stones-messy.glb',
      tags: ['path'],
      placement: 'park',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'fence-1x2.glb',
      tags: ['fence'],
      placement: 'boundary',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'fence-1x3.glb',
      tags: ['fence'],
      placement: 'boundary',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'fence-1x4.glb',
      tags: ['fence'],
      placement: 'boundary',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'fence-2x2.glb',
      tags: ['fence'],
      placement: 'boundary',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'fence-2x3.glb',
      tags: ['fence'],
      placement: 'boundary',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'fence-3x2.glb',
      tags: ['fence'],
      placement: 'boundary',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'fence-3x3.glb',
      tags: ['fence'],
      placement: 'boundary',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'driveway-short.glb',
      tags: ['driveway'],
      placement: 'yard',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'driveway-long.glb',
      tags: ['driveway'],
      placement: 'yard',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'roads/light-square.glb',
      tags: ['streetlight'],
      placement: 'roadside',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'roads/light-square-double.glb',
      tags: ['streetlight'],
      placement: 'roadside',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'roads/light-curved.glb',
      tags: ['streetlight'],
      placement: 'roadside',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'roads/sign-highway.glb',
      tags: ['sign'],
      placement: 'roadside',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'roads/sign-highway-wide.glb',
      tags: ['sign'],
      placement: 'roadside',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'roads/sign-highway-detailed.glb',
      tags: ['sign'],
      placement: 'roadside',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'roads/construction-cone.glb',
      tags: ['construction'],
      placement: 'roadside',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'roads/construction-barrier.glb',
      tags: ['construction'],
      placement: 'roadside',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    },
    {
      file: 'roads/construction-light.glb',
      tags: ['construction'],
      placement: 'roadside',
      allowedRotations: [0, 90, 180, 270],
      yOffset: 0
    }
  ];

  return { roadPieces, buildingAssets, props };
};

export const DEFAULT_ASSET_REGISTRY = makeDefaultAssetRegistry();

export const DEFAULT_ADVANCED_SUBURBAN_CONFIG: MapGenConfig = {
  width: 24,
  height: 24,
  targetRoadCoverage: 0.24,
  targetBuildingCoverage: 0.58,
  parkProbability: 0.05,
  backyardFillStyle: 'mixed',
  enableHighwayOverpass: true,
  highwayCount: 1,
  arterialSpacingRange: [8, 12],
  collectorSpacingRange: [5, 8],
  localStreetMaxLength: 10,
  intersectionMinSpacing: 4,
  maxTurnsPerArterialPath: 2,
  culdesacRate: 0.08,
  forbidDeadEndsOnArterialsCollectors: true,
  blockAreaMin: 16,
  blockAreaMax: 180,
  blockAspectRatioRange: [0.35, 2.8],
  blockSubdivisionThresholdArea: 90,
  lotFrontageRange: [2, 4],
  lotDepthRange: [2, 4],
  cornerLotChance: 0.2,
  drivewayChance: 0.2,
  ensureHousesFaceRoad: true,
  minUniqueHousePrefabsUsed: 8,
  avoidSamePrefabAdjacent: true,
  maxRepeatsInRadius: 2,
  maxGenerationAttempts: 20,
  minimumScoreToAccept: 0.75,
  seed: 0
};

export const mergeAdvancedSuburbanConfig = (
  partial: Partial<MapGenConfig> | undefined,
  fallbackSeed: number,
  widthOverride?: number,
  heightOverride?: number
): MapGenConfig => {
  const merged: MapGenConfig = {
    ...DEFAULT_ADVANCED_SUBURBAN_CONFIG,
    seed: fallbackSeed >>> 0,
    ...(partial ?? {})
  };
  merged.width = Math.max(
    12,
    Math.min(128, Math.floor(widthOverride ?? partial?.width ?? merged.width))
  );
  merged.height = Math.max(
    12,
    Math.min(128, Math.floor(heightOverride ?? partial?.height ?? merged.height))
  );
  const seedFromPartial = partial?.seed;
  merged.seed = Number.isFinite(seedFromPartial)
    ? Math.floor(seedFromPartial) >>> 0
    : fallbackSeed >>> 0;
  merged.targetRoadCoverage = clamp01(merged.targetRoadCoverage);
  merged.targetBuildingCoverage = clamp01(merged.targetBuildingCoverage);
  merged.parkProbability = clamp01(merged.parkProbability);
  merged.cornerLotChance = clamp01(merged.cornerLotChance);
  merged.drivewayChance = clamp01(merged.drivewayChance);
  merged.culdesacRate = clamp01(merged.culdesacRate);
  merged.minimumScoreToAccept = clamp01(merged.minimumScoreToAccept);
  merged.maxGenerationAttempts = Math.max(
    1,
    Math.min(64, Math.floor(merged.maxGenerationAttempts))
  );
  merged.highwayCount = merged.enableHighwayOverpass && merged.highwayCount > 0 ? 1 : 0;
  if (merged.arterialSpacingRange[0] > merged.arterialSpacingRange[1]) {
    merged.arterialSpacingRange = [merged.arterialSpacingRange[1], merged.arterialSpacingRange[0]];
  }
  if (merged.collectorSpacingRange[0] > merged.collectorSpacingRange[1]) {
    merged.collectorSpacingRange = [
      merged.collectorSpacingRange[1],
      merged.collectorSpacingRange[0]
    ];
  }
  if (merged.lotFrontageRange[0] > merged.lotFrontageRange[1]) {
    merged.lotFrontageRange = [merged.lotFrontageRange[1], merged.lotFrontageRange[0]];
  }
  if (merged.lotDepthRange[0] > merged.lotDepthRange[1]) {
    merged.lotDepthRange = [merged.lotDepthRange[1], merged.lotDepthRange[0]];
  }

  // Scale spacing ranges to fit smaller maps so we still get dense, connected neighborhoods.
  const minDim = Math.max(8, Math.min(merged.width, merged.height));
  const arterialMax = Math.max(4, Math.floor(minDim * 0.55));
  const collectorMax = Math.max(3, Math.floor(minDim * 0.38));
  const clampRange = (range: [number, number], minValue: number, maxValue: number): [number, number] => {
    const low = Math.max(minValue, Math.min(maxValue, Math.floor(range[0])));
    const high = Math.max(low, Math.min(maxValue, Math.floor(range[1])));
    return [low, high];
  };
  merged.arterialSpacingRange = clampRange(merged.arterialSpacingRange, 4, arterialMax);
  merged.collectorSpacingRange = clampRange(merged.collectorSpacingRange, 3, collectorMax);
  if (merged.collectorSpacingRange[0] >= merged.arterialSpacingRange[0]) {
    merged.collectorSpacingRange = [
      Math.max(3, merged.arterialSpacingRange[0] - 2),
      Math.max(3, merged.arterialSpacingRange[0] - 1)
    ];
  }
  return merged;
};

const neighbors4 = (
  width: number,
  height: number,
  x: number,
  y: number
): Array<{ x: number; y: number; bit: number; opposite: number; side: DoorSide }> => {
  const out: Array<{ x: number; y: number; bit: number; opposite: number; side: DoorSide }> = [];
  if (y + 1 < height)
    out.push({ x, y: y + 1, bit: ROAD_NORTH, opposite: ROAD_SOUTH, side: 'north' });
  if (x + 1 < width) out.push({ x: x + 1, y, bit: ROAD_EAST, opposite: ROAD_WEST, side: 'east' });
  if (y - 1 >= 0) out.push({ x, y: y - 1, bit: ROAD_SOUTH, opposite: ROAD_NORTH, side: 'south' });
  if (x - 1 >= 0) out.push({ x: x - 1, y, bit: ROAD_WEST, opposite: ROAD_EAST, side: 'west' });
  return out;
};

class RoadNetworkBuilder {
  private nodeIdByKey = new Map<string, number>();
  private nodes: RoadNode[] = [];
  private edges: RoadEdge[] = [];
  private nextNodeId = 1;
  private nextEdgeId = 1;

  constructor(
    private readonly config: MapGenConfig,
    private readonly rng: DeterministicRng
  ) {}

  private nodeKey(x: number, y: number) {
    return `${x}:${y}`;
  }

  private getOrCreateNode(x: number, y: number) {
    const key = this.nodeKey(x, y);
    const existing = this.nodeIdByKey.get(key);
    if (existing) {
      return existing;
    }
    const nodeId = this.nextNodeId++;
    this.nodeIdByKey.set(key, nodeId);
    this.nodes.push({ id: nodeId, x, y });
    return nodeId;
  }

  private addStraightEdge(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    hierarchy: RoadHierarchy,
    layer: 'ground' | 'elevated',
    culdesac = false
  ) {
    if (x0 !== x1 && y0 !== y1) {
      return;
    }
    const fromNodeId = this.getOrCreateNode(x0, y0);
    const toNodeId = this.getOrCreateNode(x1, y1);
    const cells: Array<[number, number]> = [];
    if (x0 === x1) {
      const step = y1 >= y0 ? 1 : -1;
      for (let y = y0; y !== y1 + step; y += step) {
        cells.push([x0, y]);
      }
    } else {
      const step = x1 >= x0 ? 1 : -1;
      for (let x = x0; x !== x1 + step; x += step) {
        cells.push([x, y0]);
      }
    }
    if (cells.length < 2) {
      return;
    }
    this.edges.push({
      id: this.nextEdgeId++,
      fromNodeId,
      toNodeId,
      hierarchy,
      layer,
      cells,
      culdesac
    });
  }

  private createJitteredLines(
    length: number,
    spacingRange: [number, number],
    margin: number,
    minSpacing: number
  ) {
    const [minSpacingRaw, maxSpacingRaw] = spacingRange;
    const minStep = Math.max(3, Math.floor(minSpacingRaw));
    const maxStep = Math.max(minStep, Math.floor(maxSpacingRaw));
    const lines: number[] = [];

    let cursor = margin + this.rng.int(0, Math.max(0, minStep - 1));
    while (cursor < length - margin) {
      const jitter = this.rng.int(-2, 2);
      const line = Math.max(margin, Math.min(length - margin - 1, cursor + jitter));
      if (lines.length === 0 || line - lines[lines.length - 1]! >= minSpacing) {
        lines.push(line);
      }
      cursor += this.rng.int(minStep, maxStep);
    }

    if (!lines.includes(margin)) {
      lines.unshift(margin);
    }
    if (!lines.includes(length - margin - 1)) {
      lines.push(length - margin - 1);
    }

    const unique = Array.from(new Set(lines)).sort((a, b) => a - b);
    const filtered: number[] = [];
    for (const line of unique) {
      if (filtered.length === 0 || line - filtered[filtered.length - 1]! >= minSpacing) {
        filtered.push(line);
      }
    }

    if (filtered.length < 2) {
      return [margin, Math.max(margin + minSpacing, length - margin - 1)].filter(
        (entry, idx, arr) => idx === 0 || entry !== arr[idx - 1]
      );
    }

    return filtered;
  }

  private mergeTaggedLines(arterials: number[], collectors: number[]): Array<{ pos: number; hierarchy: RoadHierarchy }> {
    const arterialSet = new Set(arterials);
    const merged = Array.from(new Set([...arterials, ...collectors])).sort((a, b) => a - b);
    const minGap = Math.max(2, this.config.intersectionMinSpacing - 1);
    const filtered: Array<{ pos: number; hierarchy: RoadHierarchy }> = [];
    for (const pos of merged) {
      const hierarchy: RoadHierarchy = arterialSet.has(pos) ? 'arterial' : 'collector';
      if (filtered.length === 0) {
        filtered.push({ pos, hierarchy });
        continue;
      }
      const last = filtered[filtered.length - 1]!;
      if (pos - last.pos < minGap) {
        if (hierarchy === 'arterial' && last.hierarchy !== 'arterial') {
          filtered[filtered.length - 1] = { pos, hierarchy };
        }
        continue;
      }
      filtered.push({ pos, hierarchy });
    }

    if (!filtered.some((line) => line.hierarchy === 'arterial') && filtered.length > 0) {
      const centerIndex = Math.floor(filtered.length / 2);
      filtered[centerIndex] = { ...filtered[centerIndex]!, hierarchy: 'arterial' };
    }

    return filtered;
  }

  private addGridSkeleton(
    verticalLines: Array<{ pos: number; hierarchy: RoadHierarchy }>,
    horizontalLines: Array<{ pos: number; hierarchy: RoadHierarchy }>
  ) {
    const verticalPositions = verticalLines.map((entry) => entry.pos).sort((a, b) => a - b);
    const horizontalPositions = horizontalLines.map((entry) => entry.pos).sort((a, b) => a - b);

    for (const vertical of verticalLines) {
      const x = vertical.pos;
      for (let hi = 0; hi < horizontalPositions.length - 1; hi += 1) {
        const y0 = horizontalPositions[hi]!;
        const y1 = horizontalPositions[hi + 1]!;
        this.addStraightEdge(x, y0, x, y1, vertical.hierarchy, 'ground');
      }
    }

    for (const horizontal of horizontalLines) {
      const y = horizontal.pos;
      for (let vi = 0; vi < verticalPositions.length - 1; vi += 1) {
        const x0 = verticalPositions[vi]!;
        const x1 = verticalPositions[vi + 1]!;
        this.addStraightEdge(x0, y, x1, y, horizontal.hierarchy, 'ground');
      }
    }
  }

  private addLocalSubdivisions(verticalLines: number[], horizontalLines: number[]) {
    let localCuts = 0;
    for (let xi = 0; xi < verticalLines.length - 1; xi += 1) {
      const left = verticalLines[xi]!;
      const right = verticalLines[xi + 1]!;
      const gapX = right - left - 1;
      if (gapX < this.config.intersectionMinSpacing * 2) {
        continue;
      }
      for (let yi = 0; yi < horizontalLines.length - 1; yi += 1) {
        const bottom = horizontalLines[yi]!;
        const top = horizontalLines[yi + 1]!;
        const gapY = top - bottom - 1;
        const area = Math.max(0, gapX) * Math.max(0, gapY);
        if (area < this.config.blockSubdivisionThresholdArea) {
          continue;
        }
        const cutVertical = gapX >= gapY;
        if (cutVertical && gapX > this.config.intersectionMinSpacing * 2) {
          const minX = left + this.config.intersectionMinSpacing;
          const maxX = right - this.config.intersectionMinSpacing;
          if (minX <= maxX) {
            const x = this.rng.int(minX, maxX);
            this.addStraightEdge(x, bottom, x, top, 'local', 'ground');
            localCuts += 1;
          }
        } else if (gapY > this.config.intersectionMinSpacing * 2) {
          const minY = bottom + this.config.intersectionMinSpacing;
          const maxY = top - this.config.intersectionMinSpacing;
          if (minY <= maxY) {
            const y = this.rng.int(minY, maxY);
            this.addStraightEdge(left, y, right, y, 'local', 'ground');
            localCuts += 1;
          }
        }
        if (localCuts > Math.max(4, Math.floor((this.config.width + this.config.height) / 10))) {
          return;
        }
      }
    }
  }

  private estimateOccupiedGround() {
    const occupied = new Set<string>();
    for (const edge of this.edges) {
      if (edge.layer !== 'ground') {
        continue;
      }
      for (const [x, y] of edge.cells) {
        occupied.add(`${x}:${y}`);
      }
    }
    return occupied;
  }

  private addCuldesacs() {
    if (this.config.culdesacRate <= 0) {
      return;
    }

    const occupied = this.estimateOccupiedGround();
    const incidentByNode = new Map<number, RoadEdge[]>();
    for (const edge of this.edges) {
      if (!incidentByNode.has(edge.fromNodeId)) incidentByNode.set(edge.fromNodeId, []);
      if (!incidentByNode.has(edge.toNodeId)) incidentByNode.set(edge.toNodeId, []);
      incidentByNode.get(edge.fromNodeId)!.push(edge);
      incidentByNode.get(edge.toNodeId)!.push(edge);
    }

    const nodes = [...this.nodes];
    this.rng.shuffle(nodes);
    const minLength = 2;
    const maxLength = Math.max(minLength, Math.floor(this.config.localStreetMaxLength));

    for (const node of nodes) {
      if (!this.rng.chance(this.config.culdesacRate)) {
        continue;
      }
      const incident = incidentByNode.get(node.id) ?? [];
      if (incident.length < 2) {
        continue;
      }

      const usedDirs = new Set<string>();
      for (const edge of incident) {
        const cells = edge.cells;
        const first = edge.fromNodeId === node.id ? cells[1] : cells[cells.length - 2];
        if (!first) continue;
        const dx = first[0] - node.x;
        const dy = first[1] - node.y;
        usedDirs.add(`${Math.sign(dx)}:${Math.sign(dy)}`);
      }

      const dirs = (
        [
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0]
        ] as Array<[number, number]>
      ).filter((entry) => !usedDirs.has(`${entry[0]}:${entry[1]}`));

      if (dirs.length === 0) {
        continue;
      }

      this.rng.shuffle(dirs);
      let placed = false;
      for (const [dx, dy] of dirs) {
        const length = this.rng.int(minLength, maxLength);
        const x1 = node.x + dx * length;
        const y1 = node.y + dy * length;
        if (!inBounds(this.config.width, this.config.height, x1, y1)) {
          continue;
        }
        let blocked = false;
        for (let step = 1; step <= length; step += 1) {
          const x = node.x + dx * step;
          const y = node.y + dy * step;
          if (occupied.has(`${x}:${y}`)) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          continue;
        }
        this.addStraightEdge(node.x, node.y, x1, y1, 'local', 'ground', true);
        for (let step = 1; step <= length; step += 1) {
          occupied.add(`${node.x + dx * step}:${node.y + dy * step}`);
        }
        placed = true;
        break;
      }

      if (placed && this.edges.length > this.config.width * 4) {
        break;
      }
    }
  }

  private addHighwayOverpass() {
    if (!this.config.enableHighwayOverpass || this.config.highwayCount < 1) {
      return;
    }

    const margin = 2;
    const y = this.rng.int(margin, Math.max(margin, this.config.height - margin - 1));
    const x0 = margin;
    const x1 = this.config.width - margin - 1;
    this.addStraightEdge(x0, y, x1, y, 'highway', 'elevated');

    const rampCount = 2;
    for (let i = 0; i < rampCount; i += 1) {
      const rampX = Math.floor(((i + 1) * (x1 - x0)) / (rampCount + 1)) + x0;
      const targetY = i % 2 === 0 ? Math.max(1, y - 4) : Math.min(this.config.height - 2, y + 4);
      this.addStraightEdge(rampX, y, rampX, targetY, 'collector', 'ground');
    }
  }

  private ensureConnected() {
    const adjacency = new Map<number, Set<number>>();
    for (const node of this.nodes) {
      adjacency.set(node.id, new Set<number>());
    }
    for (const edge of this.edges) {
      adjacency.get(edge.fromNodeId)?.add(edge.toNodeId);
      adjacency.get(edge.toNodeId)?.add(edge.fromNodeId);
    }

    const components: number[][] = [];
    const visited = new Set<number>();
    for (const node of this.nodes) {
      if (visited.has(node.id)) continue;
      const stack = [node.id];
      const component: number[] = [];
      visited.add(node.id);
      while (stack.length > 0) {
        const current = stack.pop()!;
        component.push(current);
        const next = adjacency.get(current);
        if (!next) continue;
        for (const child of next) {
          if (visited.has(child)) continue;
          visited.add(child);
          stack.push(child);
        }
      }
      components.push(component);
    }

    if (components.length <= 1) {
      return;
    }

    const nodeById = new Map(this.nodes.map((node) => [node.id, node] as const));
    const root = components[0]!;

    for (let i = 1; i < components.length; i += 1) {
      const next = components[i]!;
      let bestA: RoadNode | null = null;
      let bestB: RoadNode | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const aId of root) {
        const a = nodeById.get(aId);
        if (!a) continue;
        for (const bId of next) {
          const b = nodeById.get(bId);
          if (!b) continue;
          const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
          if (dist < bestDist) {
            bestDist = dist;
            bestA = a;
            bestB = b;
          }
        }
      }

      if (!bestA || !bestB) {
        continue;
      }

      if (bestA.x !== bestB.x) {
        this.addStraightEdge(bestA.x, bestA.y, bestB.x, bestA.y, 'collector', 'ground');
      }
      if (bestA.y !== bestB.y) {
        this.addStraightEdge(bestB.x, bestA.y, bestB.x, bestB.y, 'collector', 'ground');
      }
      root.push(...next);
    }
  }

  build() {
    const margin = 1;
    const arterialVerticalLines = this.createJitteredLines(
      this.config.width,
      this.config.arterialSpacingRange,
      margin,
      Math.max(2, this.config.intersectionMinSpacing)
    );
    const arterialHorizontalLines = this.createJitteredLines(
      this.config.height,
      this.config.arterialSpacingRange,
      margin,
      Math.max(2, this.config.intersectionMinSpacing)
    );
    const collectorVerticalLines = this.createJitteredLines(
      this.config.width,
      this.config.collectorSpacingRange,
      margin,
      Math.max(2, this.config.intersectionMinSpacing - 1)
    );
    const collectorHorizontalLines = this.createJitteredLines(
      this.config.height,
      this.config.collectorSpacingRange,
      margin,
      Math.max(2, this.config.intersectionMinSpacing - 1)
    );

    const verticalLines = this.mergeTaggedLines(arterialVerticalLines, collectorVerticalLines);
    const horizontalLines = this.mergeTaggedLines(arterialHorizontalLines, collectorHorizontalLines);
    this.addGridSkeleton(verticalLines, horizontalLines);
    this.addLocalSubdivisions(
      verticalLines.map((entry) => entry.pos).sort((a, b) => a - b),
      horizontalLines.map((entry) => entry.pos).sort((a, b) => a - b)
    );
    this.addCuldesacs();
    this.addHighwayOverpass();
    this.ensureConnected();

    return {
      nodes: this.nodes,
      edges: this.edges
    } satisfies RoadGraph;
  }
}

interface RasterizedRoads {
  roadGround: Uint8Array;
  roadElevated: Uint8Array;
  hierarchyByGroundCell: Int16Array;
  culdesacCells: Set<number>;
}

class RoadRasterizer {
  constructor(
    private readonly width: number,
    private readonly height: number
  ) {}

  rasterize(graph: RoadGraph) {
    const roadGround = new Uint8Array(this.width * this.height);
    const roadElevated = new Uint8Array(this.width * this.height);
    const hierarchyByGroundCell = new Int16Array(this.width * this.height);
    const culdesacCells = new Set<number>();

    for (const edge of graph.edges) {
      const rank = HIERARCHY_RANK[edge.hierarchy];
      for (let i = 0; i < edge.cells.length; i += 1) {
        const [x, y] = edge.cells[i]!;
        if (!inBounds(this.width, this.height, x, y)) {
          continue;
        }
        const index = toIndex(this.width, x, y);
        if (edge.layer === 'elevated') {
          roadElevated[index] = CellRoad.RoadElevated;
        } else {
          roadGround[index] = CellRoad.RoadGround;
          if (rank > hierarchyByGroundCell[index]) {
            hierarchyByGroundCell[index] = rank;
          }
        }
      }
      if (edge.culdesac) {
        const tail = edge.cells[edge.cells.length - 1];
        if (tail) {
          const tailIndex = toIndex(this.width, tail[0], tail[1]);
          culdesacCells.add(tailIndex);
        }
      }
    }

    return {
      roadGround,
      roadElevated,
      hierarchyByGroundCell,
      culdesacCells
    } satisfies RasterizedRoads;
  }
}

const computeRoadMask = (grid: Uint8Array, width: number, height: number, x: number, y: number) => {
  let mask = 0;
  if (y + 1 < height && grid[toIndex(width, x, y + 1)] !== CellRoad.Empty) mask |= ROAD_NORTH;
  if (x + 1 < width && grid[toIndex(width, x + 1, y)] !== CellRoad.Empty) mask |= ROAD_EAST;
  if (y - 1 >= 0 && grid[toIndex(width, x, y - 1)] !== CellRoad.Empty) mask |= ROAD_SOUTH;
  if (x - 1 >= 0 && grid[toIndex(width, x - 1, y)] !== CellRoad.Empty) mask |= ROAD_WEST;
  return mask;
};

const countBits = (value: number) => {
  let bits = 0;
  let next = value & 0b1111;
  while (next > 0) {
    bits += next & 1;
    next >>= 1;
  }
  return bits;
};

const resolveRoadPieceType = (
  mask: number
): { type: 'invalid' | 'end' | 'straight' | 'corner' | 't' | 'cross'; rotationY: number } => {
  if (mask === 0b1111) {
    return { type: 'cross', rotationY: 0 };
  }
  const bits = countBits(mask);
  if (bits === 3) {
    const missing =
      [ROAD_NORTH, ROAD_EAST, ROAD_SOUTH, ROAD_WEST].find((bit) => (mask & bit) === 0) ??
      ROAD_SOUTH;
    if (missing === ROAD_NORTH) return { type: 't', rotationY: Math.PI };
    if (missing === ROAD_EAST) return { type: 't', rotationY: -HALF_PI };
    if (missing === ROAD_SOUTH) return { type: 't', rotationY: 0 };
    return { type: 't', rotationY: HALF_PI };
  }
  if (bits === 2) {
    if (mask === (ROAD_NORTH | ROAD_SOUTH)) {
      return { type: 'straight', rotationY: 0 };
    }
    if (mask === (ROAD_EAST | ROAD_WEST)) {
      return { type: 'straight', rotationY: HALF_PI };
    }
    if (mask === (ROAD_NORTH | ROAD_EAST)) {
      return { type: 'corner', rotationY: 0 };
    }
    if (mask === (ROAD_EAST | ROAD_SOUTH)) {
      return { type: 'corner', rotationY: HALF_PI };
    }
    if (mask === (ROAD_SOUTH | ROAD_WEST)) {
      return { type: 'corner', rotationY: Math.PI };
    }
    if (mask === (ROAD_WEST | ROAD_NORTH)) {
      return { type: 'corner', rotationY: -HALF_PI };
    }
  }
  if (bits === 1) {
    if (mask === ROAD_NORTH) return { type: 'end', rotationY: Math.PI };
    if (mask === ROAD_EAST) return { type: 'end', rotationY: -HALF_PI };
    if (mask === ROAD_SOUTH) return { type: 'end', rotationY: 0 };
    if (mask === ROAD_WEST) return { type: 'end', rotationY: HALF_PI };
  }
  return { type: 'invalid', rotationY: 0 };
};

interface RoadPrefabResolution {
  roads: RetroMapRoad[];
  placements: RetroMapPlacement[];
  roadMaskByCell: Int16Array;
  intersectionIndices: number[];
}

class RoadPrefabResolver {
  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly centerX: number,
    private readonly centerY: number,
    private readonly tileSize: number,
    private readonly registry: AssetRegistry,
    private readonly rng: DeterministicRng
  ) {}

  private selectFile(
    pieceType: 'end' | 'straight' | 'corner' | 't' | 'cross',
    hierarchyRank: number,
    layer: 'ground' | 'elevated',
    culdesac: boolean
  ) {
    if (layer === 'elevated') {
      const elevatedChoices = ['roads/road-bridge.glb', 'roads/road-slant-high.glb', 'roads/road-slant-flat-high.glb'];
      return elevatedChoices[this.rng.int(0, elevatedChoices.length - 1)]!;
    }
    if (culdesac && pieceType === 'end') {
      const culdesacChoices = ['roads/road-end-round.glb', 'roads/road-end.glb'];
      return culdesacChoices[this.rng.int(0, culdesacChoices.length - 1)]!;
    }
    const hierarchy =
      hierarchyRank >= HIERARCHY_RANK.arterial
        ? 'arterial'
        : hierarchyRank >= HIERARCHY_RANK.collector
          ? 'collector'
          : 'local';

    const stylisticVariants: Record<RoadHierarchy, Record<'end' | 'straight' | 'corner' | 't' | 'cross', string[]>> = {
      local: {
        end: ['roads/road-end.glb', 'roads/road-end-round.glb'],
        straight: ['roads/road-straight.glb', 'roads/road-straight-half.glb', 'roads/road-crossing.glb'],
        corner: ['roads/road-bend.glb', 'roads/road-bend-sidewalk.glb'],
        t: ['roads/road-intersection.glb', 'roads/road-intersection-path.glb'],
        cross: ['roads/road-crossroad.glb', 'roads/road-crossroad-path.glb']
      },
      collector: {
        end: ['roads/road-end.glb', 'roads/road-end-round.glb'],
        straight: ['roads/road-straight.glb', 'roads/road-straight-half.glb', 'roads/road-side.glb'],
        corner: ['roads/road-bend.glb', 'roads/road-bend-square.glb', 'roads/road-curve.glb'],
        t: ['roads/road-intersection.glb', 'roads/road-intersection-line.glb'],
        cross: ['roads/road-crossroad.glb', 'roads/road-crossroad-line.glb']
      },
      arterial: {
        end: ['roads/road-end.glb'],
        straight: ['roads/road-straight.glb', 'roads/road-straight-barrier-half.glb', 'roads/road-straight-barrier.glb'],
        corner: ['roads/road-curve.glb', 'roads/road-curve-pavement.glb', 'roads/road-bend.glb'],
        t: ['roads/road-intersection-line.glb', 'roads/road-intersection.glb'],
        cross: ['roads/road-crossroad-line.glb', 'roads/road-crossroad.glb']
      },
      highway: {
        end: ['roads/road-end.glb'],
        straight: ['roads/road-straight-barrier.glb', 'roads/road-straight.glb'],
        corner: ['roads/road-curve-barrier.glb', 'roads/road-curve.glb'],
        t: ['roads/road-intersection-line.glb'],
        cross: ['roads/road-crossroad-line.glb']
      }
    };

    const variantChoices = stylisticVariants[hierarchy][pieceType];
    if (variantChoices.length > 0) {
      return variantChoices[this.rng.int(0, variantChoices.length - 1)]!;
    }

    const candidates = this.registry.roadPieces.filter(
      (entry) =>
        entry.type === pieceType && entry.layer === layer && entry.hierarchy.includes(hierarchy)
    );
    if (candidates.length === 0) {
      if (pieceType === 'straight') return 'roads/road-straight.glb';
      if (pieceType === 'corner') return 'roads/road-bend.glb';
      if (pieceType === 't') return 'roads/road-intersection.glb';
      if (pieceType === 'cross')
        return hierarchy === 'arterial'
          ? 'roads/road-crossroad-line.glb'
          : 'roads/road-crossroad.glb';
      return 'roads/road-end.glb';
    }
    return candidates[0]!.file;
  }

  resolve(rasterized: RasterizedRoads): RoadPrefabResolution {
    const roads: RetroMapRoad[] = [];
    const placements: RetroMapPlacement[] = [];
    const roadMaskByCell = new Int16Array(this.width * this.height);
    const intersectionIndices: number[] = [];

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = toIndex(this.width, x, y);

        if (rasterized.roadGround[index] !== CellRoad.Empty) {
          const mask = computeRoadMask(rasterized.roadGround, this.width, this.height, x, y);
          roadMaskByCell[index] = mask;
          const piece = resolveRoadPieceType(mask);
          if (piece.type !== 'invalid') {
            const hierarchyRank = rasterized.hierarchyByGroundCell[index] || HIERARCHY_RANK.local;
            const culdesac = rasterized.culdesacCells.has(index);
            const file = this.selectFile(piece.type, hierarchyRank, 'ground', culdesac);
            const cellX = x - this.centerX;
            const cellY = y - this.centerY;
            roads.push({ cellX, cellY, mask, file, rotationY: piece.rotationY });
            placements.push({
              file,
              kind: 'road',
              roadMask: mask,
              cellX,
              cellY,
              position: [cellX * this.tileSize, 0, cellY * this.tileSize],
              rotation: [0, piece.rotationY, 0]
            });
            if (countBits(mask) >= 3) {
              intersectionIndices.push(index);
            }
          }
        }

        if (rasterized.roadElevated[index] !== CellRoad.Empty) {
          const mask = computeRoadMask(rasterized.roadElevated, this.width, this.height, x, y);
          const piece = resolveRoadPieceType(mask);
          if (piece.type !== 'invalid') {
            const file = this.selectFile(piece.type, HIERARCHY_RANK.highway, 'elevated', false);
            const cellX = x - this.centerX;
            const cellY = y - this.centerY;
            placements.push({
              file,
              kind: 'road',
              roadMask: mask,
              cellX,
              cellY,
              position: [cellX * this.tileSize, 1.2, cellY * this.tileSize],
              rotation: [0, piece.rotationY, 0]
            });
          }
        }
      }
    }

    return { roads, placements, roadMaskByCell, intersectionIndices };
  }
}

class BlockExtractor {
  constructor(
    private readonly width: number,
    private readonly height: number
  ) {}

  extract(roadGround: Uint8Array) {
    const blocks: BlockRegion[] = [];
    const visited = new Uint8Array(this.width * this.height);
    let nextBlockId = 1;

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = toIndex(this.width, x, y);
        if (visited[index] !== 0 || roadGround[index] !== CellRoad.Empty) {
          continue;
        }
        const queue = [index];
        visited[index] = 1;
        const cells: number[] = [];
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;

        while (queue.length > 0) {
          const current = queue.pop()!;
          const [cx, cy] = fromIndex(this.width, current);
          cells.push(current);
          minX = Math.min(minX, cx);
          maxX = Math.max(maxX, cx);
          minY = Math.min(minY, cy);
          maxY = Math.max(maxY, cy);

          for (const next of neighbors4(this.width, this.height, cx, cy)) {
            const neighborIndex = toIndex(this.width, next.x, next.y);
            if (visited[neighborIndex] !== 0 || roadGround[neighborIndex] !== CellRoad.Empty) {
              continue;
            }
            visited[neighborIndex] = 1;
            queue.push(neighborIndex);
          }
        }

        const blockWidth = maxX - minX + 1;
        const blockHeight = maxY - minY + 1;
        const aspectRatio =
          blockWidth >= blockHeight
            ? blockWidth / Math.max(1, blockHeight)
            : blockHeight / Math.max(1, blockWidth);

        blocks.push({
          id: nextBlockId++,
          cells,
          area: cells.length,
          minX,
          maxX,
          minY,
          maxY,
          aspectRatio
        });
      }
    }

    return blocks;
  }
}

class LotPlanner {
  constructor(
    private readonly config: MapGenConfig,
    private readonly width: number,
    private readonly height: number,
    private readonly rng: DeterministicRng
  ) {}

  private resolveFrontDirection(roadGround: Uint8Array, x: number, y: number): DoorSide | null {
    const n = y + 1 < this.height && roadGround[toIndex(this.width, x, y + 1)] !== CellRoad.Empty;
    const e = x + 1 < this.width && roadGround[toIndex(this.width, x + 1, y)] !== CellRoad.Empty;
    const s = y - 1 >= 0 && roadGround[toIndex(this.width, x, y - 1)] !== CellRoad.Empty;
    const w = x - 1 >= 0 && roadGround[toIndex(this.width, x - 1, y)] !== CellRoad.Empty;
    if (n) return 'north';
    if (e) return 'east';
    if (s) return 'south';
    if (w) return 'west';
    return null;
  }

  private depthStep(front: DoorSide): [number, number] {
    if (front === 'north') return [0, -1];
    if (front === 'south') return [0, 1];
    if (front === 'east') return [-1, 0];
    return [1, 0];
  }

  private tangentStep(front: DoorSide): [number, number] {
    if (front === 'north' || front === 'south') return [1, 0];
    return [0, 1];
  }

  private collectRunsForDirection(
    block: BlockRegion,
    blockSet: Set<number>,
    roadGround: Uint8Array,
    front: DoorSide,
    claimedFrontage: Set<number>
  ) {
    const buckets = new Map<
      number,
      Array<{ tangent: number; index: number; x: number; y: number }>
    >();

    for (const index of block.cells) {
      if (claimedFrontage.has(index)) {
        continue;
      }
      const [x, y] = fromIndex(this.width, index);
      const resolved = this.resolveFrontDirection(roadGround, x, y);
      if (resolved !== front) {
        continue;
      }
      const line = front === 'north' || front === 'south' ? y : x;
      const tangent = front === 'north' || front === 'south' ? x : y;
      if (!buckets.has(line)) {
        buckets.set(line, []);
      }
      buckets.get(line)!.push({ tangent, index, x, y });
    }

    const runs: Array<Array<{ index: number; x: number; y: number }>> = [];
    for (const entries of buckets.values()) {
      entries.sort((a, b) => a.tangent - b.tangent);
      let current: Array<{ index: number; x: number; y: number }> = [];
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i]!;
        if (current.length === 0) {
          current.push(entry);
          continue;
        }
        const prev = entries[i - 1]!;
        if (entry.tangent === prev.tangent + 1) {
          current.push(entry);
        } else {
          if (current.length > 0) {
            runs.push(current);
          }
          current = [entry];
        }
      }
      if (current.length > 0) {
        runs.push(current);
      }
    }

    // Keep only runs that still face roads and belong to this block.
    return runs
      .map((run) => run.filter((entry) => blockSet.has(entry.index)))
      .filter((run) => run.length > 0);
  }

  plan(blocks: BlockRegion[], roadGround: Uint8Array) {
    const land = new Uint8Array(this.width * this.height);
    const lots: LotPlan[] = [];
    const lotByCell = new Int32Array(this.width * this.height);
    let nextLotId = 1;

    for (const block of blocks) {
      const blockSet = new Set(block.cells);

      if (this.rng.chance(this.config.parkProbability)) {
        for (const index of block.cells) {
          land[index] = CellLand.Park;
        }
        continue;
      }

      for (const index of block.cells) {
        land[index] = CellLand.Yard;
      }

      const claimedFrontage = new Set<number>();
      const dirs: DoorSide[] = ['north', 'east', 'south', 'west'];

      for (const front of dirs) {
        const runs = this.collectRunsForDirection(
          block,
          blockSet,
          roadGround,
          front,
          claimedFrontage
        );
        for (const run of runs) {
          let cursor = 0;
          while (cursor < run.length) {
            const frontageLength = this.rng.int(
              this.config.lotFrontageRange[0],
              this.config.lotFrontageRange[1]
            );
            const lotFrontCells = run.slice(cursor, Math.min(run.length, cursor + frontageLength));
            cursor += frontageLength;
            if (lotFrontCells.length === 0) {
              continue;
            }

            const depth = this.rng.int(this.config.lotDepthRange[0], this.config.lotDepthRange[1]);
            const [dx, dy] = this.depthStep(front);
            const [tx, ty] = this.tangentStep(front);

            const lotCellsSet = new Set<number>();
            for (const frontCell of lotFrontCells) {
              for (let depthStep = 0; depthStep < depth; depthStep += 1) {
                const nx = frontCell.x + dx * depthStep;
                const ny = frontCell.y + dy * depthStep;
                if (!inBounds(this.width, this.height, nx, ny)) {
                  continue;
                }
                const nIndex = toIndex(this.width, nx, ny);
                if (!blockSet.has(nIndex)) {
                  continue;
                }
                lotCellsSet.add(nIndex);
              }

              if (this.rng.chance(this.config.cornerLotChance)) {
                const cx = frontCell.x + tx;
                const cy = frontCell.y + ty;
                if (inBounds(this.width, this.height, cx, cy)) {
                  const cIndex = toIndex(this.width, cx, cy);
                  if (blockSet.has(cIndex)) {
                    lotCellsSet.add(cIndex);
                  }
                }
              }
            }

            if (lotCellsSet.size < 2) {
              continue;
            }

            const lotCells = Array.from(lotCellsSet.values());
            for (const entry of lotCells) {
              land[entry] = CellLand.Lot;
              lotByCell[entry] = nextLotId;
            }
            for (const frontage of lotFrontCells) {
              claimedFrontage.add(frontage.index);
            }

            lots.push({
              id: nextLotId,
              blockId: block.id,
              cells: lotCells,
              frontageCells: lotFrontCells.map((entry) => entry.index),
              front,
              isCorner: lotFrontCells.length > 0 && this.rng.chance(this.config.cornerLotChance)
            });
            nextLotId += 1;
          }
        }
      }
    }

    for (let i = 0; i < land.length; i += 1) {
      if (roadGround[i] !== CellRoad.Empty) {
        land[i] = CellLand.Reserved;
      } else if (land[i] === CellLand.Unassigned) {
        land[i] = CellLand.Yard;
      }
    }

    return { land, lots, lotByCell };
  }
}

class BuildingPlacer {
  constructor(
    private readonly config: MapGenConfig,
    private readonly width: number,
    private readonly height: number,
    private readonly centerX: number,
    private readonly centerY: number,
    private readonly tileSize: number,
    private readonly registry: AssetRegistry,
    private readonly rng: DeterministicRng
  ) {}

  private chooseAsset(
    lot: LotPlan,
    existing: BuildingPlacement[],
    occupied: Uint8Array,
    lotCellSet: Set<number>
  ): { asset: BuildingAssetMetadata; occupiedCells: number[]; anchor: [number, number] } | null {
    const assetCandidates = [...this.registry.buildingAssets];
    this.rng.shuffle(assetCandidates);

    const frontCells = [...lot.frontageCells];
    this.rng.shuffle(frontCells);

    const repeatsInRadius = (file: string, cx: number, cy: number, radius: number) => {
      let count = 0;
      for (const entry of existing) {
        if (entry.file !== file) continue;
        const dx = entry.cellX - cx;
        const dy = entry.cellY - cy;
        if (dx * dx + dy * dy <= radius * radius) {
          count += 1;
        }
      }
      return count;
    };

    for (const frontIndex of frontCells) {
      const [fx, fy] = fromIndex(this.width, frontIndex);
      for (const asset of assetCandidates) {
        const width = Math.max(1, asset.footprintW);
        const depth = Math.max(1, asset.footprintH);
        const occupancy: number[] = [];
        let valid = true;

        const depthDir =
          lot.front === 'north'
            ? [0, -1]
            : lot.front === 'south'
              ? [0, 1]
              : lot.front === 'east'
                ? [-1, 0]
                : [1, 0];
        const widthDir = lot.front === 'north' || lot.front === 'south' ? [1, 0] : [0, 1];

        for (let dw = 0; dw < width; dw += 1) {
          for (let dd = 0; dd < depth; dd += 1) {
            const x = fx + widthDir[0] * dw + depthDir[0] * dd;
            const y = fy + widthDir[1] * dw + depthDir[1] * dd;
            if (!inBounds(this.width, this.height, x, y)) {
              valid = false;
              break;
            }
            const index = toIndex(this.width, x, y);
            if (!lotCellSet.has(index) || occupied[index] !== 0) {
              valid = false;
              break;
            }
            occupancy.push(index);
          }
          if (!valid) {
            break;
          }
        }

        if (!valid || occupancy.length === 0) {
          continue;
        }

        const worldCellX = fx - this.centerX;
        const worldCellY = fy - this.centerY;

        if (this.config.avoidSamePrefabAdjacent) {
          const adjacentSame = existing.some((entry) => {
            if (entry.file !== asset.file) return false;
            const dx = Math.abs(entry.cellX - worldCellX);
            const dy = Math.abs(entry.cellY - worldCellY);
            return dx + dy <= 1;
          });
          if (adjacentSame) {
            continue;
          }
        }

        const repeats = repeatsInRadius(asset.file, worldCellX, worldCellY, 6);
        if (repeats > this.config.maxRepeatsInRadius) {
          continue;
        }

        return {
          asset,
          occupiedCells: occupancy,
          anchor: [fx, fy]
        };
      }
    }

    return null;
  }

  place(lots: LotPlan[], land: Uint8Array, roadGround: Uint8Array) {
    const occupied = new Uint8Array(this.width * this.height);
    const placements: BuildingPlacement[] = [];

    const sortedLots = [...lots].sort((a, b) => b.cells.length - a.cells.length);
    for (const lot of sortedLots) {
      const lotCellSet = new Set(lot.cells);
      const picked = this.chooseAsset(lot, placements, occupied, lotCellSet);
      if (!picked) {
        continue;
      }

      const [anchorX, anchorY] = picked.anchor;
      for (const cell of picked.occupiedCells) {
        if (roadGround[cell] !== CellRoad.Empty) {
          continue;
        }
        occupied[cell] = 1;
        land[cell] = CellLand.Building;
      }

      const cellX = anchorX - this.centerX;
      const cellY = anchorY - this.centerY;
      placements.push({
        file: picked.asset.file,
        cellX,
        cellY,
        doorSide: lot.front,
        rotationY: toDoorRotation(lot.front),
        lotId: lot.id,
        occupiedCells: [...picked.occupiedCells]
      });
    }

    // Backfill if we miss minimum house variety/coverage by placing compact homes on remaining frontage lots.
    if (placements.length < 8) {
      const fallbackAsset = this.registry.buildingAssets[0];
      if (fallbackAsset) {
        for (const lot of sortedLots) {
          if (placements.length >= 8) {
            break;
          }
          const frontIndex = lot.frontageCells[0];
          if (frontIndex === undefined) {
            continue;
          }
          const [fx, fy] = fromIndex(this.width, frontIndex);
          const index = toIndex(this.width, fx, fy);
          if (occupied[index] !== 0 || roadGround[index] !== CellRoad.Empty) {
            continue;
          }
          occupied[index] = 1;
          land[index] = CellLand.Building;
          placements.push({
            file: fallbackAsset.file,
            cellX: fx - this.centerX,
            cellY: fy - this.centerY,
            doorSide: lot.front,
            rotationY: toDoorRotation(lot.front),
            lotId: lot.id,
            occupiedCells: [index]
          });
        }
      }
    }

    // Fill sparse frontage with compact houses until a minimum coverage target is reached.
    const nonRoadCells = roadGround.reduce(
      (acc, entry) => acc + (entry === CellRoad.Empty ? 1 : 0),
      0
    );
    const minCoverage = Math.max(0.42, this.config.targetBuildingCoverage * 0.72);
    const targetBuildingCells = Math.floor(nonRoadCells * minCoverage);
    let currentBuildingCells = land.reduce(
      (acc, entry) => acc + (entry === CellLand.Building ? 1 : 0),
      0
    );

    if (currentBuildingCells < targetBuildingCells && this.registry.buildingAssets.length > 0) {
      const infillCandidates: Array<{ lot: LotPlan; index: number }> = [];
      for (const lot of sortedLots) {
        for (const frontage of lot.frontageCells) {
          infillCandidates.push({ lot, index: frontage });
        }
      }
      this.rng.shuffle(infillCandidates);

      for (const candidate of infillCandidates) {
        if (currentBuildingCells >= targetBuildingCells) {
          break;
        }
        const index = candidate.index;
        if (occupied[index] !== 0 || roadGround[index] !== CellRoad.Empty) {
          continue;
        }
        const [fx, fy] = fromIndex(this.width, index);
        const randomAsset =
          this.registry.buildingAssets[this.rng.int(0, this.registry.buildingAssets.length - 1)]!;
        occupied[index] = 1;
        land[index] = CellLand.Building;
        placements.push({
          file: randomAsset.file,
          cellX: fx - this.centerX,
          cellY: fy - this.centerY,
          doorSide: candidate.lot.front,
          rotationY: toDoorRotation(candidate.lot.front),
          lotId: candidate.lot.id,
          occupiedCells: [index]
        });
        currentBuildingCells += 1;
      }
    }

    const buildings: RetroMapBuilding[] = placements.map((entry) => ({
      file: entry.file,
      cellX: entry.cellX,
      cellY: entry.cellY,
      doorSide: entry.doorSide,
      rotationY: entry.rotationY,
      position: [entry.cellX * this.tileSize, 0, entry.cellY * this.tileSize]
    }));

    const placementEntries: RetroMapPlacement[] = placements.map((entry) => ({
      file: entry.file,
      kind: 'building',
      cellX: entry.cellX,
      cellY: entry.cellY,
      doorSide: entry.doorSide,
      position: [entry.cellX * this.tileSize, 0, entry.cellY * this.tileSize],
      rotation: [0, entry.rotationY, 0]
    }));

    return {
      buildings,
      placements: placementEntries,
      buildingPlacements: placements
    };
  }
}

class Decorator {
  constructor(
    private readonly config: MapGenConfig,
    private readonly width: number,
    private readonly height: number,
    private readonly centerX: number,
    private readonly centerY: number,
    private readonly tileSize: number,
    private readonly registry: AssetRegistry,
    private readonly rng: DeterministicRng
  ) {}

  private resolveTreeAsset() {
    const treeAssets = this.registry.props.filter((entry) => entry.tags.includes('tree'));
    if (treeAssets.length === 0) {
      return 'tree-small.glb';
    }
    return this.rng.pick(treeAssets).file;
  }

  private resolvePropYOffset(file: string) {
    const meta = this.registry.props.find((entry) => entry.file === file);
    return Number.isFinite(meta?.yOffset) ? (meta!.yOffset as number) : 0;
  }

  private pickPropByTag(tag: string, fallback: string) {
    const candidates = this.registry.props.filter((entry) => entry.tags.includes(tag));
    if (candidates.length === 0) {
      return fallback;
    }
    return this.rng.pick(candidates).file;
  }

  private placeProp(
    placements: DecorationPlacement[],
    file: string,
    cellX: number,
    cellY: number,
    scale = 1
  ) {
    placements.push({
      file,
      cellX,
      cellY,
      rotationY: this.rng.int(0, 3) * HALF_PI,
      scale,
      yOffset: this.resolvePropYOffset(file),
      kind: 'prop'
    });
  }

  decorate(
    roadGround: Uint8Array,
    land: Uint8Array,
    roadMaskByCell: Int16Array,
    hierarchyByGroundCell: Int16Array,
    lotByCell: Int32Array
  ) {
    const placements: DecorationPlacement[] = [];
    const decorated = new Set<number>();

    const yardTreeChance =
      this.config.backyardFillStyle === 'trees'
        ? 0.62
        : this.config.backyardFillStyle === 'fenced yards'
          ? 0.34
          : 0.5;

    const placeByIndex = (file: string, index: number, scale = 1) => {
      const [x, y] = fromIndex(this.width, index);
      if (decorated.has(index)) {
        return;
      }
      if (roadGround[index] !== CellRoad.Empty || land[index] === CellLand.Building) {
        return;
      }
      this.placeProp(placements, file, x - this.centerX, y - this.centerY, scale);
      decorated.add(index);
    };

    for (let index = 0; index < land.length; index += 1) {
      const [x, y] = fromIndex(this.width, index);

      if (land[index] === CellLand.Park) {
        if (this.rng.chance(0.72)) {
          placeByIndex(this.resolveTreeAsset(), index, 0.9);
          land[index] = CellLand.Tree;
        } else if (this.rng.chance(0.42)) {
          placeByIndex(this.pickPropByTag('path', 'path-stones-short.glb'), index, 1);
          land[index] = CellLand.Prop;
        } else if (this.rng.chance(0.25)) {
          placeByIndex('planter.glb', index, 1);
          land[index] = CellLand.Prop;
        }
      }

      if (land[index] === CellLand.Yard && this.rng.chance(yardTreeChance)) {
        const usePlanter = this.rng.chance(0.22);
        const useDriveway = !usePlanter && this.rng.chance(this.config.drivewayChance * 0.45);
        const file = usePlanter
          ? 'planter.glb'
          : useDriveway
            ? this.pickPropByTag('driveway', 'driveway-short.glb')
            : this.resolveTreeAsset();
        placeByIndex(file, index, usePlanter ? 1 : 0.9);
        land[index] = usePlanter || useDriveway ? CellLand.Prop : CellLand.Tree;
      }

      if (land[index] === CellLand.Yard && this.rng.chance(0.26)) {
        placeByIndex(this.pickPropByTag('path', 'path-short.glb'), index, 1);
        land[index] = CellLand.Prop;
      }

      if (land[index] === CellLand.Lot && this.rng.chance(0.45)) {
        const hasBoundary = neighbors4(this.width, this.height, x, y).some((next) => {
          const neighborIndex = toIndex(this.width, next.x, next.y);
          return (
            lotByCell[neighborIndex] !== lotByCell[index] &&
            roadGround[neighborIndex] === CellRoad.Empty
          );
        });
        if (hasBoundary) {
          const file = this.pickPropByTag('fence', this.rng.chance(0.5) ? 'fence-low.glb' : 'fence.glb');
          placeByIndex(file, index, 1);
          land[index] = CellLand.Fence;
        }
      }

      if (roadGround[index] !== CellRoad.Empty) {
        const mask = roadMaskByCell[index] ?? 0;
        const degree = countBits(mask);
        const hierarchy = hierarchyByGroundCell[index] ?? HIERARCHY_RANK.local;
        if (degree < 2) {
          continue;
        }

        const roadsideCandidates: number[] = [];
        for (const next of neighbors4(this.width, this.height, x, y)) {
          const neighborIndex = toIndex(this.width, next.x, next.y);
          if (roadGround[neighborIndex] !== CellRoad.Empty) {
            continue;
          }
          if (land[neighborIndex] === CellLand.Building) {
            continue;
          }
          roadsideCandidates.push(neighborIndex);
        }
        if (roadsideCandidates.length === 0) {
          continue;
        }

        const shouldPlace = degree >= 3 ? this.rng.chance(0.32) : this.rng.chance(0.12);
        if (!shouldPlace) {
          continue;
        }

        const targetIndex = this.rng.pick(roadsideCandidates);
        if (decorated.has(targetIndex)) {
          continue;
        }

        let file = this.pickPropByTag('streetlight', 'roads/light-square.glb');
        if (hierarchy >= HIERARCHY_RANK.arterial && this.rng.chance(0.45)) {
          file = this.pickPropByTag('sign', 'roads/sign-highway.glb');
        } else if (this.rng.chance(0.08)) {
          file = this.pickPropByTag('construction', 'roads/construction-cone.glb');
        }

        placeByIndex(file, targetIndex, 1);
        if (land[targetIndex] === CellLand.Yard || land[targetIndex] === CellLand.Lot) {
          land[targetIndex] = CellLand.Prop;
        }
      }
    }

    const mapPlacements: RetroMapPlacement[] = placements.map((entry) => ({
      file: entry.file,
      kind: 'prop',
      cellX: entry.cellX,
      cellY: entry.cellY,
      position: [entry.cellX * this.tileSize, entry.yOffset, entry.cellY * this.tileSize],
      rotation: [0, entry.rotationY, 0],
      scale: entry.scale
    }));

    return { decorations: placements, placements: mapPlacements };
  }
}

class ValidatorScorer {
  constructor(
    private readonly config: MapGenConfig,
    private readonly width: number,
    private readonly height: number
  ) {}

  private isRoadConnected(roadGround: Uint8Array) {
    let start = -1;
    for (let i = 0; i < roadGround.length; i += 1) {
      if (roadGround[i] !== CellRoad.Empty) {
        start = i;
        break;
      }
    }
    if (start < 0) {
      return true;
    }

    const visited = new Uint8Array(roadGround.length);
    const queue = [start];
    visited[start] = 1;
    let count = 0;

    while (queue.length > 0) {
      const index = queue.pop()!;
      count += 1;
      const [x, y] = fromIndex(this.width, index);
      for (const next of neighbors4(this.width, this.height, x, y)) {
        const nIndex = toIndex(this.width, next.x, next.y);
        if (visited[nIndex] !== 0 || roadGround[nIndex] === CellRoad.Empty) {
          continue;
        }
        visited[nIndex] = 1;
        queue.push(nIndex);
      }
    }

    const totalRoad = roadGround.reduce(
      (acc, entry) => acc + (entry !== CellRoad.Empty ? 1 : 0),
      0
    );
    return count === totalRoad;
  }

  private countOrphans(roadGround: Uint8Array) {
    let orphanCount = 0;
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = toIndex(this.width, x, y);
        if (roadGround[index] === CellRoad.Empty) {
          continue;
        }
        const mask = computeRoadMask(roadGround, this.width, this.height, x, y);
        const degree = countBits(mask);
        if (degree === 0) {
          orphanCount += 1;
        }
      }
    }
    return orphanCount;
  }

  private countCloseIntersections(roadGround: Uint8Array) {
    const intersections: Array<[number, number]> = [];
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = toIndex(this.width, x, y);
        if (roadGround[index] === CellRoad.Empty) continue;
        const degree = countBits(computeRoadMask(roadGround, this.width, this.height, x, y));
        if (degree >= 3) intersections.push([x, y]);
      }
    }

    let closePairs = 0;
    for (let i = 0; i < intersections.length; i += 1) {
      const a = intersections[i]!;
      for (let j = i + 1; j < intersections.length; j += 1) {
        const b = intersections[j]!;
        if (a[0] !== b[0] && a[1] !== b[1]) {
          continue;
        }
        const dist = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
        if (dist < this.config.intersectionMinSpacing) {
          closePairs += 1;
        }
      }
    }
    return closePairs;
  }

  score(
    roadGround: Uint8Array,
    land: Uint8Array,
    blocks: BlockRegion[],
    buildings: BuildingPlacement[],
    _culdesacCells: Set<number>
  ): ValidationMetrics {
    const roadConnected = this.isRoadConnected(roadGround);
    const orphanRoadTiles = this.countOrphans(roadGround);

    let overlaps = 0;
    const occupied = new Set<number>();
    for (const building of buildings) {
      for (const index of building.occupiedCells) {
        if (roadGround[index] !== CellRoad.Empty) {
          overlaps += 1;
        }
        if (occupied.has(index)) {
          overlaps += 1;
        }
        occupied.add(index);
      }
    }

    let unassignedLandCells = 0;
    for (let i = 0; i < land.length; i += 1) {
      if (roadGround[i] !== CellRoad.Empty) {
        continue;
      }
      if (land[i] === CellLand.Unassigned) {
        unassignedLandCells += 1;
      }
    }

    const roadCells = roadGround.reduce(
      (acc, entry) => acc + (entry !== CellRoad.Empty ? 1 : 0),
      0
    );
    const nonRoadCells = roadGround.length - roadCells;
    const buildingCells = land.reduce(
      (acc, entry) => acc + (entry === CellLand.Building ? 1 : 0),
      0
    );

    const roadCoverage = roadCells / Math.max(1, roadGround.length);
    const buildingCoverage = buildingCells / Math.max(1, nonRoadCells);

    const blocksTooSmall = blocks.filter((block) => block.area < this.config.blockAreaMin).length;
    const blocksAspectViolations = blocks.filter(
      (block) =>
        block.aspectRatio < this.config.blockAspectRatioRange[0] ||
        block.aspectRatio > this.config.blockAspectRatioRange[1]
    ).length;

    const closeIntersectionPairs = this.countCloseIntersections(roadGround);

    const uniqueBuildingsUsed = new Set(buildings.map((entry) => entry.file)).size;

    const connectivityScore = roadConnected ? 1 : 0;
    const intersectionSpacingScore =
      1 - clamp01(closeIntersectionPairs / Math.max(1, roadCells * 0.08));
    const blockQualityScore =
      1 - clamp01((blocksTooSmall + blocksAspectViolations) / Math.max(1, blocks.length));

    const roadDelta = Math.abs(roadCoverage - this.config.targetRoadCoverage);
    const buildingDelta = Math.abs(buildingCoverage - this.config.targetBuildingCoverage);
    const densityScore = clamp01(
      1 - roadDelta * 2.2 - buildingDelta * 1.8 - unassignedLandCells / Math.max(1, nonRoadCells)
    );

    const targetUnique = Math.max(1, this.config.minUniqueHousePrefabsUsed);
    const varietyScore = clamp01(uniqueBuildingsUsed / targetUnique);

    const tinyStubsPenalty = orphanRoadTiles / Math.max(1, roadCells);
    const sliverPenalty =
      blocks.filter(
        (block) => Math.min(block.maxX - block.minX + 1, block.maxY - block.minY + 1) <= 1
      ).length / Math.max(1, blocks.length);
    const weirdnessPenalty = clamp01(tinyStubsPenalty * 0.7 + sliverPenalty * 0.3);

    const weightedScore = clamp01(
      connectivityScore * 0.24 +
        intersectionSpacingScore * 0.14 +
        blockQualityScore * 0.2 +
        densityScore * 0.24 +
        varietyScore * 0.14 -
        weirdnessPenalty * 0.1
    );

    const isValid =
      roadConnected && orphanRoadTiles === 0 && overlaps === 0 && unassignedLandCells === 0;

    return {
      roadConnected,
      orphanRoadTiles,
      overlaps,
      unassignedLandCells,
      roadCoverage,
      buildingCoverage,
      blocksTooSmall,
      blocksAspectViolations,
      closeIntersectionPairs,
      uniqueBuildingsUsed,
      connectivityScore,
      intersectionSpacingScore,
      blockQualityScore,
      densityScore,
      varietyScore,
      weirdnessPenalty,
      score: weightedScore,
      isValid
    };
  }
}

interface GenerationPassResult {
  graph: RoadGraph;
  roadGround: Uint8Array;
  roadElevated: Uint8Array;
  hierarchyByGroundCell: Int16Array;
  culdesacCells: Set<number>;
  roads: RetroMapRoad[];
  roadPlacements: RetroMapPlacement[];
  roadMaskByCell: Int16Array;
  blocks: BlockRegion[];
  lots: LotPlan[];
  lotByCell: Int32Array;
  land: Uint8Array;
  buildings: RetroMapBuilding[];
  buildingPlacements: BuildingPlacement[];
  buildingPlacementEntries: RetroMapPlacement[];
  decorations: DecorationPlacement[];
  decorationPlacements: RetroMapPlacement[];
  validation: ValidationMetrics;
}

const generateOne = (
  config: MapGenConfig,
  seed: number,
  tileSize: number,
  assetRegistry: AssetRegistry
): GenerationPassResult => {
  const rng = new DeterministicRng(seed);
  const centerX = Math.floor(config.width / 2);
  const centerY = Math.floor(config.height / 2);

  const network = new RoadNetworkBuilder(config, rng).build();
  const rasterized = new RoadRasterizer(config.width, config.height).rasterize(network);
  const roadResolver = new RoadPrefabResolver(
    config.width,
    config.height,
    centerX,
    centerY,
    tileSize,
    assetRegistry,
    rng
  );
  const resolvedRoads = roadResolver.resolve(rasterized);

  const blocks = new BlockExtractor(config.width, config.height).extract(rasterized.roadGround);
  const lotsResult = new LotPlanner(config, config.width, config.height, rng).plan(
    blocks,
    rasterized.roadGround
  );

  const placedBuildings = new BuildingPlacer(
    config,
    config.width,
    config.height,
    centerX,
    centerY,
    tileSize,
    assetRegistry,
    rng
  ).place(lotsResult.lots, lotsResult.land, rasterized.roadGround);

  const decorated = new Decorator(
    config,
    config.width,
    config.height,
    centerX,
    centerY,
    tileSize,
    assetRegistry,
    rng
  ).decorate(
    rasterized.roadGround,
    lotsResult.land,
    resolvedRoads.roadMaskByCell,
    rasterized.hierarchyByGroundCell,
    lotsResult.lotByCell
  );

  const validation = new ValidatorScorer(config, config.width, config.height).score(
    rasterized.roadGround,
    lotsResult.land,
    blocks,
    placedBuildings.buildingPlacements,
    rasterized.culdesacCells
  );

  return {
    graph: network,
    roadGround: rasterized.roadGround,
    roadElevated: rasterized.roadElevated,
    hierarchyByGroundCell: rasterized.hierarchyByGroundCell,
    culdesacCells: rasterized.culdesacCells,
    roads: resolvedRoads.roads,
    roadPlacements: resolvedRoads.placements,
    roadMaskByCell: resolvedRoads.roadMaskByCell,
    blocks,
    lots: lotsResult.lots,
    lotByCell: lotsResult.lotByCell,
    land: lotsResult.land,
    buildings: placedBuildings.buildings,
    buildingPlacements: placedBuildings.buildingPlacements,
    buildingPlacementEntries: placedBuildings.placements,
    decorations: decorated.decorations,
    decorationPlacements: decorated.placements,
    validation
  };
};

export const generateAdvancedSuburbanMap = (
  seed: number,
  config: MapGenConfig,
  assetRegistry: AssetRegistry = DEFAULT_ASSET_REGISTRY,
  tileSize = 4
): AdvancedSuburbanMapResult => {
  const safeSeed = Number.isFinite(seed) ? Math.floor(seed) >>> 0 : 0;
  const mergedConfig = mergeAdvancedSuburbanConfig(config, safeSeed);

  let best: GenerationPassResult | null = null;
  let bestAttempt = 1;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let attempt = 1; attempt <= mergedConfig.maxGenerationAttempts; attempt += 1) {
    const attemptSeed = (safeSeed + Math.imul(attempt, 0x9e3779b1)) >>> 0;
    const candidate = generateOne(mergedConfig, attemptSeed, tileSize, assetRegistry);
    const score = candidate.validation.score;
    if (score > bestScore || best === null) {
      best = candidate;
      bestScore = score;
      bestAttempt = attempt;
    }
    if (candidate.validation.isValid && score >= mergedConfig.minimumScoreToAccept) {
      best = candidate;
      bestScore = score;
      bestAttempt = attempt;
      break;
    }
  }

  const resolved = best ?? generateOne(mergedConfig, safeSeed, tileSize, assetRegistry);
  const placements = [
    ...resolved.roadPlacements,
    ...resolved.buildingPlacementEntries,
    ...resolved.decorationPlacements
  ];

  const debugPlacements = placements.map((entry) => ({
    file: entry.file,
    position: entry.position,
    rotation: entry.rotation
  }));

  return {
    seed: safeSeed,
    config: mergedConfig,
    graph: resolved.graph,
    width: mergedConfig.width,
    height: mergedConfig.height,
    roadGround: resolved.roadGround,
    roadElevated: resolved.roadElevated,
    land: resolved.land,
    roadCellsCuldesac: resolved.culdesacCells,
    roads: resolved.roads,
    buildings: resolved.buildings,
    placements,
    buildingPlacements: resolved.buildingPlacements,
    decorations: resolved.decorations,
    blocks: resolved.blocks,
    lots: resolved.lots,
    validation: resolved.validation,
    stats: {
      attempt: bestAttempt,
      attempts: mergedConfig.maxGenerationAttempts,
      seed: safeSeed,
      score: bestScore,
      metrics: resolved.validation
    },
    debug: {
      seed: safeSeed,
      attempt: bestAttempt,
      score: bestScore,
      graph: resolved.graph,
      width: mergedConfig.width,
      height: mergedConfig.height,
      roadGround: Array.from(resolved.roadGround),
      roadElevated: Array.from(resolved.roadElevated),
      land: Array.from(resolved.land),
      placements: debugPlacements,
      metrics: resolved.validation
    }
  };
};
