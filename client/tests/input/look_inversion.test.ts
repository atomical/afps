import { describe, expect, it, vi } from 'vitest';
import { loadInvertX, loadInvertY, saveInvertX, saveInvertY } from '../../src/input/look_inversion';

const createStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => {
      data.set(key, value);
    }
  } as Storage;
};

describe('look inversion storage', () => {
  it('loads undefined when storage is missing or empty', () => {
    expect(loadInvertX()).toBeUndefined();
    expect(loadInvertY()).toBeUndefined();
    const storage = createStorage();
    expect(loadInvertX(storage)).toBeUndefined();
    expect(loadInvertY(storage)).toBeUndefined();
  });

  it('parses stored inversion values', () => {
    const storage = createStorage();
    storage.setItem('afps.look.invertX', 'true');
    storage.setItem('afps.look.invertY', '0');
    expect(loadInvertX(storage)).toBe(true);
    expect(loadInvertY(storage)).toBe(false);

    storage.setItem('afps.look.invertX', '1');
    storage.setItem('afps.look.invertY', 'false');
    expect(loadInvertX(storage)).toBe(true);
    expect(loadInvertY(storage)).toBe(false);
  });

  it('persists inversion toggles', () => {
    const storage = createStorage();
    const setItem = vi.fn();
    const spyStorage = {
      getItem: storage.getItem,
      setItem
    } as Storage;
    saveInvertX(true, spyStorage);
    saveInvertY(false, spyStorage);
    expect(setItem).toHaveBeenCalledWith('afps.look.invertX', 'true');
    expect(setItem).toHaveBeenCalledWith('afps.look.invertY', 'false');
  });

  it('ignores unknown values and missing storage when saving', () => {
    const storage = createStorage();
    storage.setItem('afps.look.invertX', 'maybe');
    expect(loadInvertX(storage)).toBeUndefined();
    saveInvertX(true);
    saveInvertY(false);
  });
});
