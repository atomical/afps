import { describe, expect, it } from 'vitest';
import { ALL_LOADOUT_BITS, LOADOUT_BITS, loadLoadoutBits, normalizeLoadoutBits, saveLoadoutBits } from '../../src/weapons/loadout';

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

describe('loadout bits', () => {
  it('normalizes invalid values', () => {
    expect(normalizeLoadoutBits('bad')).toBe(0);
    expect(normalizeLoadoutBits(-5)).toBe(0);
    expect(normalizeLoadoutBits(Number.NaN)).toBe(0);
  });

  it('masks unknown bits', () => {
    const value = ALL_LOADOUT_BITS | (1 << 12);
    expect(normalizeLoadoutBits(value)).toBe(ALL_LOADOUT_BITS);
  });

  it('loads and saves via storage', () => {
    const storage = new MemoryStorage();
    saveLoadoutBits(LOADOUT_BITS.suppressor | LOADOUT_BITS.grip, storage as unknown as Storage);
    expect(loadLoadoutBits(storage as unknown as Storage)).toBe(LOADOUT_BITS.suppressor | LOADOUT_BITS.grip);
  });

  it('handles missing storage gracefully', () => {
    expect(loadLoadoutBits()).toBe(0);
    expect(loadLoadoutBits({} as Storage)).toBe(0);
    expect(() => saveLoadoutBits(LOADOUT_BITS.optic, undefined)).not.toThrow();
    expect(() => saveLoadoutBits(LOADOUT_BITS.optic, {} as Storage)).not.toThrow();
  });
});
