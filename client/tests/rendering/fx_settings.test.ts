import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FX_SETTINGS,
  loadFxSettings,
  normalizeFxSettings,
  saveFxSettings
} from '../../src/rendering/fx_settings';

const createStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    }
  } as Storage;
};

describe('fx_settings', () => {
  it('normalizes settings objects', () => {
    expect(normalizeFxSettings(null)).toEqual(DEFAULT_FX_SETTINGS);
    expect(normalizeFxSettings({})).toEqual(DEFAULT_FX_SETTINGS);
    expect(normalizeFxSettings({ muzzleFlash: false })).toEqual({
      ...DEFAULT_FX_SETTINGS,
      muzzleFlash: false
    });
    expect(normalizeFxSettings({ tracers: false, decals: false, aimDebug: true })).toEqual({
      ...DEFAULT_FX_SETTINGS,
      tracers: false,
      decals: false,
      aimDebug: true
    });
    expect(normalizeFxSettings({ muzzleFlash: 'nope' })).toEqual(DEFAULT_FX_SETTINGS);
  });

  it('loads defaults when storage is missing', () => {
    expect(loadFxSettings()).toEqual(DEFAULT_FX_SETTINGS);
  });

  it('loads defaults when storage key is missing', () => {
    expect(loadFxSettings(createStorage())).toEqual(DEFAULT_FX_SETTINGS);
  });

  it('round-trips settings via storage', () => {
    const storage = createStorage();

    const custom = {
      muzzleFlash: false,
      tracers: true,
      decals: false,
      aimDebug: true
    };
    saveFxSettings(custom, storage);
    expect(loadFxSettings(storage)).toEqual(custom);
  });

  it('does nothing when saving without storage', () => {
    expect(() =>
      saveFxSettings({
        muzzleFlash: false,
        tracers: false,
        decals: false,
        aimDebug: false
      })
    ).not.toThrow();
  });

  it('falls back to defaults on invalid json', () => {
    const storage = createStorage({ 'afps.fx.settings': '{' });
    expect(loadFxSettings(storage)).toEqual(DEFAULT_FX_SETTINGS);
  });
});
