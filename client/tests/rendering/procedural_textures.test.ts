import { describe, expect, it } from 'vitest';
import {
  __test,
  generateDecalTexture,
  generateImpactTexture,
  generateMuzzleFlashTexture,
  hashString
} from '../../src/rendering/procedural_textures';

const hasNonZeroAlpha = (data: Uint8Array) => {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) {
      return true;
    }
  }
  return false;
};

describe('procedural_textures', () => {
  it('hashString is deterministic', () => {
    expect(hashString('rifle')).toBe(hashString('rifle'));
    expect(hashString('rifle')).not.toBe(hashString('launcher'));
  });

  it('generates deterministic muzzle flash textures with visible alpha', () => {
    const a = generateMuzzleFlashTexture({ size: 32, seed: 123 });
    const b = generateMuzzleFlashTexture({ size: 32, seed: 123 });
    const c = generateMuzzleFlashTexture({ size: 32, seed: 124 });

    expect(a.width).toBe(32);
    expect(a.height).toBe(32);
    expect(a.data).toHaveLength(32 * 32 * 4);
    expect(hasNonZeroAlpha(a.data)).toBe(true);
    expect(a.data).toEqual(b.data);
    expect(a.data).not.toEqual(c.data);
  });

  it('generates deterministic impact textures with visible alpha', () => {
    const a = generateImpactTexture({ size: 32, seed: 222 });
    const b = generateImpactTexture({ size: 32, seed: 222 });
    const c = generateImpactTexture({ size: 32, seed: 223 });

    expect(a.width).toBe(32);
    expect(a.height).toBe(32);
    expect(hasNonZeroAlpha(a.data)).toBe(true);
    expect(a.data).toEqual(b.data);
    expect(a.data).not.toEqual(c.data);
  });

  it('uses default sizes and seeds for muzzle and impact textures', () => {
    const defaultMuzzle = generateMuzzleFlashTexture({ size: Number.NaN });
    expect(defaultMuzzle.width).toBe(64);
    expect(defaultMuzzle.height).toBe(64);

    const muzzleSeedDefault = generateMuzzleFlashTexture({ size: 32 });
    const muzzleSeedDefaultAgain = generateMuzzleFlashTexture({ size: 32 });
    expect(muzzleSeedDefault.data).toEqual(muzzleSeedDefaultAgain.data);

    const defaultImpact = generateImpactTexture({ size: Number.NaN });
    expect(defaultImpact.width).toBe(64);
    expect(defaultImpact.height).toBe(64);

    const impactSeedDefault = generateImpactTexture({ size: 32 });
    const impactSeedDefaultAgain = generateImpactTexture({ size: 32 });
    expect(impactSeedDefault.data).toEqual(impactSeedDefaultAgain.data);
  });

  it('generates deterministic decal textures per kind', () => {
    const bullet = generateDecalTexture('bullet', { size: 32, seed: 9 });
    const bulletAgain = generateDecalTexture('bullet', { size: 32, seed: 9 });
    const scorch = generateDecalTexture('scorch', { size: 32, seed: 9 });
    const dust = generateDecalTexture('dust', { size: 32, seed: 9 });
    const energy = generateDecalTexture('energy', { size: 32, seed: 9 });

    expect(hasNonZeroAlpha(bullet.data)).toBe(true);
    expect(bullet.data).toEqual(bulletAgain.data);
    expect(bullet.data).not.toEqual(scorch.data);
    expect(scorch.data).not.toEqual(dust.data);
    expect(dust.data).not.toEqual(energy.data);
  });

  it('handles unexpected decal kinds with fallback output', () => {
    const mystery = generateDecalTexture('mystery' as unknown as 'bullet', { size: 16, seed: 4 });
    expect(mystery.width).toBe(16);
    expect(mystery.height).toBe(16);
  });

  it('clamps decal sizes and uses default seeds', () => {
    const defaultSized = generateDecalTexture('bullet', { size: Number.NaN });
    expect(defaultSized.width).toBe(64);
    expect(defaultSized.height).toBe(64);

    const minSized = generateDecalTexture('bullet', { size: 4 });
    expect(minSized.width).toBe(16);
    expect(minSized.height).toBe(16);

    const defaultSeed = generateDecalTexture('bullet', { size: 32 });
    expect(defaultSeed.width).toBe(32);
    expect(defaultSeed.height).toBe(32);
  });

  it('exposes stable test helpers for blending math', () => {
    const { alphaBlend, writePixel, toByte } = __test;
    const data = new Uint8Array(4 * 4);

    const empty = new Uint8Array(4);
    alphaBlend(empty, 1, 0, 0, 10, 20, 30, 0);
    expect(Array.from(empty)).toEqual([0, 0, 0, 0]);

    writePixel(data, 1, 0, 0, 1, 2, 3, 4);
    expect(Array.from(data.slice(0, 4))).toEqual([1, 2, 3, 4]);

    alphaBlend(data, 1, 0, 0, 10, 20, 30, 0);
    expect(Array.from(data.slice(0, 4))).toEqual([1, 2, 3, 4]);

    alphaBlend(data, 1, 0, 0, 200, 100, 50, 255);
    expect(Array.from(data.slice(0, 4))).toEqual([200, 100, 50, 255]);

    expect(toByte(-5)).toBe(0);
    expect(toByte(300)).toBe(255);
  });
});
