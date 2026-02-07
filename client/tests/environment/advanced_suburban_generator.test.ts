import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ADVANCED_SUBURBAN_CONFIG,
  generateAdvancedSuburbanMap,
  mergeAdvancedSuburbanConfig
} from '../../src/environment/advanced_suburban_generator';

describe('advanced suburban generator', () => {
  it('is deterministic for the same seed and config', () => {
    const config = mergeAdvancedSuburbanConfig(
      {
        ...DEFAULT_ADVANCED_SUBURBAN_CONFIG,
        width: 28,
        height: 28,
        seed: 1234,
        maxGenerationAttempts: 6,
        minimumScoreToAccept: 0.65
      },
      1234
    );

    const a = generateAdvancedSuburbanMap(1234, config);
    const b = generateAdvancedSuburbanMap(1234, config);

    expect(JSON.stringify(a.debug)).toBe(JSON.stringify(b.debug));
    expect(JSON.stringify(a.placements)).toBe(JSON.stringify(b.placements));
  });

  it('keeps roads connected and land assigned across multiple seeds', () => {
    const seeds = [1, 42, 1337, 9001];

    for (const seed of seeds) {
      const config = mergeAdvancedSuburbanConfig(
        {
          ...DEFAULT_ADVANCED_SUBURBAN_CONFIG,
          width: 32,
          height: 32,
          seed,
          maxGenerationAttempts: 8,
          minimumScoreToAccept: 0.65,
          enableHighwayOverpass: true
        },
        seed
      );

      const result = generateAdvancedSuburbanMap(seed, config);

      expect(result.validation.roadConnected).toBe(true);
      expect(result.validation.orphanRoadTiles).toBe(0);
      expect(result.validation.overlaps).toBe(0);
      expect(result.validation.unassignedLandCells).toBe(0);
      expect(result.validation.buildingCoverage).toBeGreaterThan(0.34);
      expect(result.buildings.length).toBeGreaterThan(30);
      expect(result.roads.length).toBeGreaterThan(20);
    }
  });

  it('maintains minimum prefab variety and sane intersection spacing', () => {
    const seed = 77;
    const config = mergeAdvancedSuburbanConfig(
      {
        ...DEFAULT_ADVANCED_SUBURBAN_CONFIG,
        width: 34,
        height: 34,
        seed,
        maxGenerationAttempts: 10,
        minimumScoreToAccept: 0.6,
        minUniqueHousePrefabsUsed: 8
      },
      seed
    );

    const result = generateAdvancedSuburbanMap(seed, config);

    expect(result.validation.uniqueBuildingsUsed).toBeGreaterThanOrEqual(8);
    expect(result.validation.closeIntersectionPairs).toBeLessThanOrEqual(16);
    expect(result.validation.score).toBeGreaterThan(0.5);
  });

  it('completes large-map generation under a performance sanity budget', () => {
    const seed = 2026;
    const config = mergeAdvancedSuburbanConfig(
      {
        ...DEFAULT_ADVANCED_SUBURBAN_CONFIG,
        width: 128,
        height: 128,
        seed,
        maxGenerationAttempts: 2,
        minimumScoreToAccept: 0.45,
        enableHighwayOverpass: false
      },
      seed
    );

    const start = performance.now();
    const result = generateAdvancedSuburbanMap(seed, config);
    const elapsedMs = performance.now() - start;

    expect(result.validation.roadConnected).toBe(true);
    expect(result.validation.unassignedLandCells).toBe(0);
    expect(elapsedMs).toBeLessThan(2000);
  });
});
