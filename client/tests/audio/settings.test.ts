import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO_SETTINGS, loadAudioSettings, normalizeAudioSettings, saveAudioSettings } from '../../src/audio/settings';

const makeStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    }
  } as Storage;
};

describe('audio settings', () => {
  it('loads defaults when storage missing', () => {
    const settings = loadAudioSettings(null);
    expect(settings).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it('normalizes invalid values', () => {
    const settings = normalizeAudioSettings({
      master: 2,
      sfx: -1,
      ui: Number.NaN,
      music: 0.25,
      muted: true
    });
    expect(settings.master).toBe(1);
    expect(settings.sfx).toBe(0);
    expect(settings.ui).toBe(DEFAULT_AUDIO_SETTINGS.ui);
    expect(settings.music).toBeCloseTo(0.25);
    expect(settings.muted).toBe(true);
  });

  it('round-trips storage', () => {
    const storage = makeStorage();
    saveAudioSettings({ ...DEFAULT_AUDIO_SETTINGS, master: 0.5, muted: true }, storage);
    const loaded = loadAudioSettings(storage);
    expect(loaded.master).toBeCloseTo(0.5);
    expect(loaded.muted).toBe(true);
  });
});
