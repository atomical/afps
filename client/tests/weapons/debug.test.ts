import { describe, expect, it, vi } from 'vitest';
import { WEAPON_DEFS } from '../../src/weapons/config';
import { exposeWeaponDebug } from '../../src/weapons/debug';

describe('exposeWeaponDebug', () => {
  it('returns null when no target is provided', () => {
    expect(exposeWeaponDebug(null)).toBeNull();
  });

  it('prints weapons using console.table when available', () => {
    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});
    const target: { afpsDebug?: Record<string, unknown> } = {};
    const debug = exposeWeaponDebug(target, WEAPON_DEFS);

    const list = (debug?.listWeapons as () => Array<{ id: string }>)();
    expect(list[0]?.id).toBe(WEAPON_DEFS[0].id);

    const rows = (debug?.printWeapons as () => unknown)();
    expect(tableSpy).toHaveBeenCalledWith(rows);
    tableSpy.mockRestore();
  });

  it('falls back to console.log when console.table is unavailable', () => {
    const originalTable = console.table;
    (console as unknown as { table?: typeof console.table }).table = undefined;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const target: { afpsDebug?: Record<string, unknown> } = {};
    const debug = exposeWeaponDebug(target, WEAPON_DEFS);
    const rows = (debug?.printWeapons as () => unknown)();

    expect(logSpy).toHaveBeenCalledWith(rows);

    logSpy.mockRestore();
    (console as unknown as { table?: typeof console.table }).table = originalTable;
  });
});
