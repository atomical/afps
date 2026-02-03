export interface AudioSettings {
  master: number;
  sfx: number;
  ui: number;
  music: number;
  muted: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  master: 0.8,
  sfx: 0.9,
  ui: 0.7,
  music: 0.5,
  muted: false
};

const STORAGE_KEY = 'afps_audio_settings_v1';

const clampVolume = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
};

export const normalizeAudioSettings = (value?: Partial<AudioSettings> | null): AudioSettings => {
  return {
    master: clampVolume(value?.master ?? DEFAULT_AUDIO_SETTINGS.master, DEFAULT_AUDIO_SETTINGS.master),
    sfx: clampVolume(value?.sfx ?? DEFAULT_AUDIO_SETTINGS.sfx, DEFAULT_AUDIO_SETTINGS.sfx),
    ui: clampVolume(value?.ui ?? DEFAULT_AUDIO_SETTINGS.ui, DEFAULT_AUDIO_SETTINGS.ui),
    music: clampVolume(value?.music ?? DEFAULT_AUDIO_SETTINGS.music, DEFAULT_AUDIO_SETTINGS.music),
    muted: Boolean(value?.muted ?? DEFAULT_AUDIO_SETTINGS.muted)
  };
};

export const loadAudioSettings = (storage?: Storage | null): AudioSettings => {
  if (!storage) {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return normalizeAudioSettings(parsed);
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
};

export const saveAudioSettings = (settings: AudioSettings, storage?: Storage | null) => {
  if (!storage) {
    return;
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(settings));
};
