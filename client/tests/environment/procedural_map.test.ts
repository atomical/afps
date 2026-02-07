import { describe, expect, it } from 'vitest';
import {
  buildStaticWorldFromPlacements,
  generateProceduralRetroUrbanMap,
  getBuildingColliderProfile
} from '../../src/environment/procedural_map';

const ROAD_NORTH = 1 << 0;
const ROAD_EAST = 1 << 1;
const ROAD_SOUTH = 1 << 2;
const ROAD_WEST = 1 << 3;
type DoorSide = 'north' | 'east' | 'south' | 'west';

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

const rotatePartByDoorSide = (
  part: { minX: number; maxX: number; minY: number; maxY: number; maxZ: number },
  doorSide: DoorSide
) => {
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

describe('procedural retro urban map', () => {
  it('produces stable output for the same seed', () => {
    const a = generateProceduralRetroUrbanMap({ seed: 1234, arenaHalfSize: 30, tickRate: 60 });
    const b = generateProceduralRetroUrbanMap({ seed: 1234, arenaHalfSize: 30, tickRate: 60 });

    expect(JSON.stringify(a.placements)).toBe(JSON.stringify(b.placements));
    expect(JSON.stringify(a.colliders)).toBe(JSON.stringify(b.colliders));
    expect(JSON.stringify(a.pickupSpawns)).toBe(JSON.stringify(b.pickupSpawns));
  });

  it('changes output for different seeds', () => {
    const a = generateProceduralRetroUrbanMap({ seed: 1234, arenaHalfSize: 30, tickRate: 60 });
    const b = generateProceduralRetroUrbanMap({ seed: 5678, arenaHalfSize: 30, tickRate: 60 });

    expect(JSON.stringify(a.placements)).not.toBe(JSON.stringify(b.placements));
  });

  it('keeps all road placements on the 4m grid', () => {
    const map = generateProceduralRetroUrbanMap({ seed: 42, arenaHalfSize: 30 });
    const epsilon = 1e-6;
    for (const placement of map.placements) {
      if (placement.kind !== 'road') {
        continue;
      }
      const [x, y, z] = placement.position;
      expect(Math.abs(y)).toBeLessThanOrEqual(epsilon);
      expect(Math.abs(x / 4 - Math.round(x / 4))).toBeLessThanOrEqual(epsilon);
      expect(Math.abs(z / 4 - Math.round(z / 4))).toBeLessThanOrEqual(epsilon);
    }
  });

  it('keeps adjacent road masks consistent', () => {
    const map = generateProceduralRetroUrbanMap({ seed: 9, arenaHalfSize: 30 });
    const roadByCell = new Map<string, number>();
    for (const road of map.roads) {
      roadByCell.set(`${road.cellX}:${road.cellY}`, road.mask);
    }
    const hasRoad = (x: number, y: number) => roadByCell.has(`${x}:${y}`);
    const hasMask = (x: number, y: number, bit: number) =>
      ((roadByCell.get(`${x}:${y}`) ?? 0) & bit) !== 0;

    for (const road of map.roads) {
      const { cellX, cellY } = road;
      if (hasRoad(cellX, cellY + 1)) {
        expect(hasMask(cellX, cellY, ROAD_NORTH)).toBe(true);
        expect(hasMask(cellX, cellY + 1, ROAD_SOUTH)).toBe(true);
      }
      if (hasRoad(cellX + 1, cellY)) {
        expect(hasMask(cellX, cellY, ROAD_EAST)).toBe(true);
        expect(hasMask(cellX + 1, cellY, ROAD_WEST)).toBe(true);
      }
      if (hasRoad(cellX, cellY - 1)) {
        expect(hasMask(cellX, cellY, ROAD_SOUTH)).toBe(true);
        expect(hasMask(cellX, cellY - 1, ROAD_NORTH)).toBe(true);
      }
      if (hasRoad(cellX - 1, cellY)) {
        expect(hasMask(cellX, cellY, ROAD_WEST)).toBe(true);
        expect(hasMask(cellX - 1, cellY, ROAD_EAST)).toBe(true);
      }
    }
  });

  it('keeps placements inside arena bounds after map scale', () => {
    const arenaHalfSize = 30;
    const map = generateProceduralRetroUrbanMap({ seed: 42, arenaHalfSize });
    const scaledOutOfBounds = map.placements.filter((placement) => {
      const [x, , z] = placement.position;
      return (
        Math.abs(x * map.mapScale) > arenaHalfSize || Math.abs(z * map.mapScale) > arenaHalfSize
      );
    });
    expect(scaledOutOfBounds).toHaveLength(0);
  });

  it('generates baseline pickup mix', () => {
    const map = generateProceduralRetroUrbanMap({ seed: 42, arenaHalfSize: 30 });
    const health = map.pickupSpawns.filter((entry) => entry.kind === 'health');
    const weapon = map.pickupSpawns.filter((entry) => entry.kind === 'weapon');
    expect(health.length).toBeGreaterThanOrEqual(4);
    expect(weapon.length).toBeGreaterThanOrEqual(2);
  });

  it('supports advanced suburban generation mode', () => {
    const map = generateProceduralRetroUrbanMap({
      seed: 42,
      arenaHalfSize: 30,
      generator: 'advanced'
    });
    const debug = map.debug as
      | {
          generator?: string;
          validation?: {
            roadConnected?: boolean;
            orphanRoadTiles?: number;
            unassignedLandCells?: number;
          };
          stats?: { score?: number };
        }
      | undefined;

    expect(map.placements.length).toBeGreaterThan(0);
    expect(map.buildings.length).toBeGreaterThan(4);
    expect(debug?.generator).toBe('advanced');
    expect(debug?.validation?.roadConnected).toBe(true);
    expect(debug?.validation?.orphanRoadTiles).toBe(0);
    expect(debug?.validation?.unassignedLandCells).toBe(0);
    expect(debug?.stats?.score ?? 0).toBeGreaterThan(0.45);
  });

  it('matches generated colliders to each building profile', () => {
    const map = generateProceduralRetroUrbanMap({ seed: 42, arenaHalfSize: 30 });

    for (const building of map.buildings.slice(0, 8)) {
      const profile = getBuildingColliderProfile(building.file);
      const rotatedBounds = rotatePartByDoorSide(profile.bounds, building.doorSide);
      const cx = building.cellX * map.tileSize * map.mapScale;
      const cy = building.cellY * map.tileSize * map.mapScale;
      const neighborhood = map.colliders.filter(
        (collider) =>
          collider.maxX >= cx + rotatedBounds.minX - 0.3 &&
          collider.minX <= cx + rotatedBounds.maxX + 0.3 &&
          collider.maxY >= cy + rotatedBounds.minY - 0.3 &&
          collider.minY <= cy + rotatedBounds.maxY + 0.3
      );

      expect(neighborhood.length).toBeGreaterThan(0);
      for (const rawPart of profile.parts) {
        const part = rotatePartByDoorSide(rawPart, building.doorSide);
        const expectedMinX = cx + part.minX;
        const expectedMaxX = cx + part.maxX;
        const expectedMinY = cy + part.minY;
        const expectedMaxY = cy + part.maxY;
        const expectedMaxZ = part.maxZ;
        const found = neighborhood.some(
          (entry) =>
            Math.abs(entry.minX - expectedMinX) <= 1e-3 &&
            Math.abs(entry.maxX - expectedMaxX) <= 1e-3 &&
            Math.abs(entry.minY - expectedMinY) <= 1e-3 &&
            Math.abs(entry.maxY - expectedMaxY) <= 1e-3 &&
            Math.abs(entry.minZ - 0) <= 1e-3 &&
            Math.abs(entry.maxZ - expectedMaxZ) <= 1e-3
        );
        expect(found).toBe(true);
      }
    }
  });

  it('supports multi-part collider profiles for composite building assets', () => {
    const profile = getBuildingColliderProfile('building-type-b.glb');
    expect(profile.parts.length).toBeGreaterThan(1);
  });

  it('derives static colliders and pickups from manifest placements deterministically', () => {
    const placements = [
      { file: 'tree-large.glb', position: [0, 0, 0] as [number, number, number] },
      {
        file: 'building-type-a.glb',
        position: [4, 0, -8] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number]
      },
      {
        file: 'building-type-c.glb',
        position: [-8, 0, 4] as [number, number, number],
        rotation: [0, Math.PI / 2, 0] as [number, number, number]
      }
    ];

    const a = buildStaticWorldFromPlacements(placements, 60);
    const b = buildStaticWorldFromPlacements(placements, 60);

    expect(JSON.stringify(a.colliders)).toBe(JSON.stringify(b.colliders));
    expect(JSON.stringify(a.pickupSpawns)).toBe(JSON.stringify(b.pickupSpawns));
    expect(a.colliders.length).toBeGreaterThan(0);
    expect(a.pickupSpawns.length).toBeGreaterThanOrEqual(6);
  });
});
