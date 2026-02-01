import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../../src/input/sampler';
import {
  getPrimaryBinding,
  loadBindings,
  normalizeBindings,
  saveBindings,
  setPrimaryBinding
} from '../../src/input/bindings';

const createStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    }
  } as Storage;
};

describe('input bindings', () => {
  it('normalizes invalid payloads', () => {
    expect(normalizeBindings(null)).toEqual(DEFAULT_BINDINGS);
    expect(normalizeBindings({ forward: [] }).forward).toEqual(DEFAULT_BINDINGS.forward);
    expect(normalizeBindings({ forward: ['KeyQ', 'KeyQ'] }).forward).toEqual(['KeyQ']);
    expect(normalizeBindings({ dash: [] }).dash).toEqual(DEFAULT_BINDINGS.dash);
  });

  it('loads defaults when storage empty or invalid', () => {
    const storage = createStorage();
    expect(loadBindings(storage)).toEqual(DEFAULT_BINDINGS);

    storage.setItem('afps.input.bindings', 'not-json');
    expect(loadBindings(storage)).toEqual(DEFAULT_BINDINGS);

    expect(loadBindings(undefined)).toEqual(DEFAULT_BINDINGS);
  });

  it('saves and loads bindings', () => {
    const storage = createStorage();
    const updated = setPrimaryBinding(DEFAULT_BINDINGS, 'forward', 'KeyI');
    saveBindings(updated, storage);

    const loaded = loadBindings(storage);
    expect(loaded.forward).toEqual(['KeyI']);

    expect(() => saveBindings(updated, undefined)).not.toThrow();
  });

  it('returns primary binding per action', () => {
    const updated = setPrimaryBinding(DEFAULT_BINDINGS, 'jump', 'KeyU');
    expect(getPrimaryBinding(updated, 'jump')).toBe('KeyU');
  });
});
