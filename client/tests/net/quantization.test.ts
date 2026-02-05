import { describe, expect, it } from 'vitest';
import {
  __test,
  decodeOct16,
  decodePitchQ,
  decodeUnitU16,
  decodeYawQ,
  dequantizeI16,
  dequantizeU16
} from '../../src/net/quantization';

describe('quantization helpers', () => {
  it('dequantizes unsigned 16-bit fixed point values', () => {
    expect(dequantizeU16(Number.NaN, 0.01)).toBe(0);
    expect(dequantizeU16(123, Number.NaN)).toBe(0);
    expect(dequantizeU16(123, 0)).toBe(0);
    expect(dequantizeU16(123, -1)).toBe(0);

    expect(dequantizeU16(-10, 0.5)).toBe(0);
    expect(dequantizeU16(12.9, 0.1)).toBeCloseTo(1.2);
    expect(dequantizeU16(70000, 0.5)).toBeCloseTo(65535 * 0.5);
  });

  it('dequantizes signed 16-bit fixed point values', () => {
    expect(dequantizeI16(Number.NaN, 0.01)).toBe(0);
    expect(dequantizeI16(123, Number.NaN)).toBe(0);
    expect(dequantizeI16(123, 0)).toBe(0);

    expect(dequantizeI16(-40000, 0.1)).toBeCloseTo(-32768 * 0.1);
    expect(dequantizeI16(40000, 0.1)).toBeCloseTo(32767 * 0.1);
    expect(dequantizeI16(-123.7, 0.5)).toBeCloseTo(-124 * 0.5);
  });

  it('decodes normalized unsigned units', () => {
    expect(decodeUnitU16(Number.NaN)).toBe(0);
    expect(decodeUnitU16(-10)).toBe(0);
    expect(decodeUnitU16(0)).toBe(0);
    expect(decodeUnitU16(65535)).toBe(1);
    expect(decodeUnitU16(32767.9)).toBeCloseTo(32767 / 65535);
  });

  it('decodes quantized yaw/pitch angles', () => {
    expect(decodeYawQ(Number.NaN)).toBe(0);
    expect(decodePitchQ(Number.NaN)).toBe(0);

    expect(decodeYawQ(0)).toBeCloseTo(0);
    expect(decodeYawQ(__test.INT16_MAX)).toBeCloseTo(Math.PI);
    expect(decodeYawQ(-__test.INT16_MAX)).toBeCloseTo(-Math.PI);
    expect(decodeYawQ(1234567)).toBeCloseTo(Math.PI);

    expect(decodePitchQ(0)).toBeCloseTo(0);
    expect(decodePitchQ(__test.INT16_MAX)).toBeCloseTo(__test.MAX_PITCH_RAD);
    expect(decodePitchQ(-__test.INT16_MAX)).toBeCloseTo(-__test.MAX_PITCH_RAD);
  });

  it('decodes octahedral unit vectors', () => {
    expect(decodeOct16(Number.NaN, 0)).toEqual({ x: 0, y: 0, z: 1 });
    expect(decodeOct16(0, Number.NaN)).toEqual({ x: 0, y: 0, z: 1 });

    const forward = decodeOct16(0, 0);
    expect(forward.x).toBeCloseTo(0);
    expect(forward.y).toBeCloseTo(0);
    expect(forward.z).toBeCloseTo(1);

    const right = decodeOct16(__test.INT16_MAX, 0);
    expect(right.x).toBeCloseTo(1);
    expect(right.y).toBeCloseTo(0);
    expect(right.z).toBeCloseTo(0);

    const wrappedPositive = decodeOct16(__test.INT16_MAX, __test.INT16_MAX);
    expect(wrappedPositive.z).toBeGreaterThan(0.99);

    const wrappedNegative = decodeOct16(-__test.INT16_MAX, __test.INT16_MAX);
    expect(wrappedNegative.z).toBeGreaterThan(0.99);
  });

  it('normalizes vectors defensively', () => {
    expect(__test.normalize({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
    expect(__test.normalize({ x: Number.NaN, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
    expect(__test.normalize({ x: 0, y: 0, z: 1e-13 })).toEqual({ x: 0, y: 0, z: 1 });
    expect(__test.normalize({ x: 0, y: 0, z: 2 })).toEqual({ x: 0, y: 0, z: 1 });
  });
});

