import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(testDir, '..', '..');
const assetRoot = path.join(clientRoot, 'public', 'assets', 'environments', 'cc0', 'kenney_retro_urban_kit');
const manifestPath = path.join(assetRoot, 'map.json');
const glbRoot = path.join(assetRoot, 'glb');
const sharedConfigPath = path.resolve(clientRoot, '..', 'shared', 'sim', 'config.json');

describe('retro urban manifest', () => {
  it('references existing GLB assets', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      placements?: { file?: string }[];
    };
    expect(Array.isArray(manifest.placements)).toBe(true);
    const missing: string[] = [];
    for (const placement of manifest.placements ?? []) {
      const file = typeof placement.file === 'string' ? placement.file : '';
      if (!file) {
        continue;
      }
      const assetPath = path.join(glbRoot, file);
      if (!existsSync(assetPath)) {
        missing.push(file);
      }
    }
    expect(missing, `Missing Retro Urban GLBs: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('keeps road tiles aligned on the 4m grid', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      placements?: { file?: string; position?: [number, number, number] }[];
    };
    const placements = manifest.placements ?? [];
    const epsilon = 1e-6;
    const offGrid: string[] = [];
    for (const placement of placements) {
      if (!placement.file || !placement.file.startsWith('road-asphalt')) {
        continue;
      }
      const [x, y, z] = placement.position ?? [NaN, NaN, NaN];
      const onGrid = (value: number) => Math.abs(value / 4 - Math.round(value / 4)) <= epsilon;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        offGrid.push(`${placement.file}@invalid`);
        continue;
      }
      if (Math.abs(y) > epsilon || !onGrid(x) || !onGrid(z)) {
        offGrid.push(`${placement.file}@${x},${y},${z}`);
      }
    }
    expect(offGrid, `Road tiles off grid: ${offGrid.join('; ')}`).toHaveLength(0);
  });

  it('keeps placements within arena bounds', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      placements?: { file?: string; position?: [number, number, number] }[];
    };
    const config = JSON.parse(readFileSync(sharedConfigPath, 'utf8')) as {
      arenaHalfSize?: number;
    };
    const halfSize = typeof config.arenaHalfSize === 'number' ? config.arenaHalfSize : 50;
    const placements = manifest.placements ?? [];
    const outOfBounds: string[] = [];
    for (const placement of placements) {
      if (!placement.file || !placement.position) {
        continue;
      }
      const [x, _y, z] = placement.position;
      if (!Number.isFinite(x) || !Number.isFinite(z)) {
        outOfBounds.push(`${placement.file}@invalid`);
        continue;
      }
      if (Math.abs(x) > halfSize || Math.abs(z) > halfSize) {
        outOfBounds.push(`${placement.file}@${x},${z}`);
      }
    }
    expect(outOfBounds, `Placements outside arenaHalfSize=${halfSize}: ${outOfBounds.join('; ')}`).toHaveLength(0);
  });
});
