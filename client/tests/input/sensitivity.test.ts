import { describe, expect, it } from 'vitest';
import { loadSensitivity, saveSensitivity } from '../../src/input/sensitivity';

const createStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    }
  } as Storage;
};

describe('look sensitivity storage', () => {
  it('loads sensitivity when present', () => {
    const storage = createStorage();
    storage.setItem('afps.look.sensitivity', '0.005');

    expect(loadSensitivity(storage)).toBeCloseTo(0.005);
  });

  it('returns undefined for invalid or missing values', () => {
    const storage = createStorage();
    expect(loadSensitivity(storage)).toBeUndefined();

    storage.setItem('afps.look.sensitivity', 'nope');
    expect(loadSensitivity(storage)).toBeUndefined();

    storage.setItem('afps.look.sensitivity', '-1');
    expect(loadSensitivity(storage)).toBeUndefined();

    expect(loadSensitivity(undefined)).toBeUndefined();
  });

  it('saves valid sensitivities', () => {
    const storage = createStorage();
    saveSensitivity(0.003, storage);

    expect(storage.getItem('afps.look.sensitivity')).toBe('0.003');

    saveSensitivity(-1, storage);
    expect(storage.getItem('afps.look.sensitivity')).toBe('0.003');

    expect(() => saveSensitivity(0.002, undefined)).not.toThrow();
  });
});
