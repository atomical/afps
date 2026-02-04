import type { AudioSettings } from './settings';
import { DEFAULT_AUDIO_SETTINGS, normalizeAudioSettings } from './settings';

export type AudioGroup = 'master' | 'sfx' | 'ui' | 'music';

export interface AudioParamLike {
  value: number;
}

export interface AudioNodeLike {
  connect: (destinationNode: AudioNodeLike) => void;
}

export interface GainNodeLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface AudioBufferLike {
  getChannelData?: (channel: number) => Float32Array;
  length?: number;
  sampleRate?: number;
}

export interface AudioBufferSourceLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  start: (when?: number) => void;
  stop?: (when?: number) => void;
}

export interface PannerNodeLike extends AudioNodeLike {
  positionX?: AudioParamLike;
  positionY?: AudioParamLike;
  positionZ?: AudioParamLike;
  orientationX?: AudioParamLike;
  orientationY?: AudioParamLike;
  orientationZ?: AudioParamLike;
  refDistance?: number;
  maxDistance?: number;
  distanceModel?: string;
  panningModel?: string;
  setPosition?: (x: number, y: number, z: number) => void;
  setOrientation?: (x: number, y: number, z: number) => void;
}

export interface AudioListenerLike {
  positionX?: AudioParamLike;
  positionY?: AudioParamLike;
  positionZ?: AudioParamLike;
  forwardX?: AudioParamLike;
  forwardY?: AudioParamLike;
  forwardZ?: AudioParamLike;
  upX?: AudioParamLike;
  upY?: AudioParamLike;
  upZ?: AudioParamLike;
  setPosition?: (x: number, y: number, z: number) => void;
  setOrientation?: (x: number, y: number, z: number, upX: number, upY: number, upZ: number) => void;
}

export interface AudioContextLike {
  state: 'suspended' | 'running' | 'closed';
  currentTime: number;
  sampleRate: number;
  destination: AudioNodeLike;
  listener: AudioListenerLike;
  createGain: () => GainNodeLike;
  createBufferSource: () => AudioBufferSourceLike;
  createPanner: () => PannerNodeLike;
  createBuffer: (channels: number, length: number, sampleRate: number) => AudioBufferLike;
  decodeAudioData: (data: ArrayBuffer) => Promise<AudioBufferLike>;
  resume: () => Promise<void>;
  close: () => Promise<void>;
}

export interface AudioManagerOptions {
  context?: AudioContextLike | null;
  fetcher?: typeof fetch;
  settings?: AudioSettings;
}

export interface AudioState {
  supported: boolean;
  status: 'inactive' | 'suspended' | 'running' | 'closed';
  settings: AudioSettings;
}

export interface AudioManager {
  state: AudioState;
  resume: () => Promise<void>;
  setMuted: (muted: boolean) => void;
  setVolume: (group: AudioGroup, value: number) => void;
  getSettings: () => AudioSettings;
  createBuffer: (channels: number, length: number, sampleRate?: number) => AudioBufferLike | null;
  registerBuffer: (key: string, buffer: AudioBufferLike) => void;
  hasBuffer: (key: string) => boolean;
  load: (key: string, url: string) => Promise<AudioBufferLike | null>;
  preload: (entries: Record<string, string>) => Promise<Record<string, AudioBufferLike | null>>;
  play: (key: string, options?: { group?: AudioGroup; volume?: number }) => boolean;
  playPositional: (
    key: string,
    position: { x: number; y: number; z: number },
    options?: { group?: AudioGroup; volume?: number }
  ) => boolean;
  setListenerPosition: (
    position: { x: number; y: number; z: number },
    forward?: { x: number; y: number; z: number }
  ) => void;
  dispose: () => Promise<void>;
}

const resolveContext = (): AudioContextLike | null => {
  const AnyAudioContext = (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
  const LegacyAudioContext = (globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
    .webkitAudioContext;
  const ContextCtor = AnyAudioContext ?? LegacyAudioContext;
  if (!ContextCtor) {
    return null;
  }
  return new ContextCtor();
};

const clampVolume = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
};

export const createAudioManager = (options: AudioManagerOptions = {}): AudioManager => {
  const context = options.context ?? resolveContext();
  const fetcher = options.fetcher ?? fetch;
  if (!context) {
    const idleSettings = normalizeAudioSettings(options.settings);
    return {
      state: { supported: false, status: 'inactive', settings: idleSettings },
      resume: async () => {},
      setMuted: () => {},
      setVolume: () => {},
      getSettings: () => idleSettings,
      createBuffer: () => null,
      registerBuffer: () => {},
      hasBuffer: () => false,
      load: async () => null,
      preload: async () => ({}),
      play: () => false,
      playPositional: () => false,
      setListenerPosition: () => {},
      dispose: async () => {}
    };
  }

  const masterGain = context.createGain();
  const sfxGain = context.createGain();
  const uiGain = context.createGain();
  const musicGain = context.createGain();

  sfxGain.connect(masterGain);
  uiGain.connect(masterGain);
  musicGain.connect(masterGain);
  masterGain.connect(context.destination);

  let settings = normalizeAudioSettings(options.settings ?? DEFAULT_AUDIO_SETTINGS);
  const applySettings = () => {
    const master = settings.muted ? 0 : clampVolume(settings.master, DEFAULT_AUDIO_SETTINGS.master);
    masterGain.gain.value = master;
    sfxGain.gain.value = clampVolume(settings.sfx, DEFAULT_AUDIO_SETTINGS.sfx);
    uiGain.gain.value = clampVolume(settings.ui, DEFAULT_AUDIO_SETTINGS.ui);
    musicGain.gain.value = clampVolume(settings.music, DEFAULT_AUDIO_SETTINGS.music);
  };

  applySettings();

  const buffers = new Map<string, AudioBufferLike>();
  const inflight = new Map<string, Promise<AudioBufferLike | null>>();

  const load = async (key: string, url: string) => {
    if (buffers.has(key)) {
      return buffers.get(key) ?? null;
    }
    if (inflight.has(key)) {
      return inflight.get(key) ?? null;
    }
    const promise = fetcher(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`audio_fetch_failed:${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        buffers.set(key, buffer);
        return buffer;
      })
      .catch(() => null)
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, promise);
    return promise;
  };

  const preload = async (entries: Record<string, string>) => {
    const results: Record<string, AudioBufferLike | null> = {};
    await Promise.all(
      Object.entries(entries).map(async ([key, url]) => {
        results[key] = await load(key, url);
      })
    );
    return results;
  };

  const hasBuffer = (key: string) => buffers.has(key);

  const resolveGroupGain = (group?: AudioGroup) => {
    switch (group) {
      case 'ui':
        return uiGain;
      case 'music':
        return musicGain;
      case 'sfx':
      default:
        return sfxGain;
    }
  };

  const playBuffer = (
    buffer: AudioBufferLike,
    groupGain: GainNodeLike,
    volume: number | undefined,
    panner?: PannerNodeLike
  ) => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = false;

    let output: AudioNodeLike = source;
    if (panner) {
      output.connect(panner);
      output = panner;
    }

    if (Number.isFinite(volume) && volume !== undefined && volume >= 0) {
      const gainNode = context.createGain();
      gainNode.gain.value = clampVolume(volume, 1);
      output.connect(gainNode);
      gainNode.connect(groupGain);
    } else {
      output.connect(groupGain);
    }
    source.start();
  };

  const play = (key: string, options?: { group?: AudioGroup; volume?: number }) => {
    const buffer = buffers.get(key);
    if (!buffer) {
      return false;
    }
    playBuffer(buffer, resolveGroupGain(options?.group), options?.volume, undefined);
    return true;
  };

  const configurePanner = (panner: PannerNodeLike, position: { x: number; y: number; z: number }) => {
    if (panner.positionX && panner.positionY && panner.positionZ) {
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = position.z;
    } else if (panner.setPosition) {
      panner.setPosition(position.x, position.y, position.z);
    }
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 40;
  };

  const playPositional = (
    key: string,
    position: { x: number; y: number; z: number },
    options?: { group?: AudioGroup; volume?: number }
  ) => {
    const buffer = buffers.get(key);
    if (!buffer) {
      return false;
    }
    const panner = context.createPanner();
    configurePanner(panner, position);
    playBuffer(buffer, resolveGroupGain(options?.group), options?.volume, panner);
    return true;
  };

  const setListenerPosition = (
    position: { x: number; y: number; z: number },
    forward?: { x: number; y: number; z: number }
  ) => {
    const listener = context.listener;
    if (listener.positionX && listener.positionY && listener.positionZ) {
      listener.positionX.value = position.x;
      listener.positionY.value = position.y;
      listener.positionZ.value = position.z;
    } else if (listener.setPosition) {
      listener.setPosition(position.x, position.y, position.z);
    }
    if (forward) {
      if (
        listener.forwardX &&
        listener.forwardY &&
        listener.forwardZ &&
        listener.upX &&
        listener.upY &&
        listener.upZ
      ) {
        listener.forwardX.value = forward.x;
        listener.forwardY.value = forward.y;
        listener.forwardZ.value = forward.z;
        listener.upX.value = 0;
        listener.upY.value = 0;
        listener.upZ.value = 1;
      } else if (listener.setOrientation) {
        listener.setOrientation(forward.x, forward.y, forward.z, 0, 0, 1);
      }
    }
  };

  const state: AudioState = {
    supported: true,
    status: context.state === 'closed' ? 'closed' : context.state === 'running' ? 'running' : 'suspended',
    settings: { ...settings }
  };

  const resume = async () => {
    if (context.state === 'suspended') {
      await context.resume();
    }
    state.status = context.state === 'running' ? 'running' : state.status;
  };

  const setMuted = (muted: boolean) => {
    settings = { ...settings, muted: Boolean(muted) };
    applySettings();
    state.settings = { ...settings };
  };

  const setVolume = (group: AudioGroup, value: number) => {
    const safeValue = clampVolume(value, 1);
    settings = { ...settings, [group]: safeValue };
    applySettings();
    state.settings = { ...settings };
  };

  const getSettings = () => ({ ...settings });

  const createBuffer = (channels: number, length: number, sampleRate = context.sampleRate) => {
    if (!Number.isFinite(length) || length <= 0) {
      return null;
    }
    const safeChannels = Math.max(1, Math.floor(channels));
    const safeSampleRate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : context.sampleRate;
    return context.createBuffer(safeChannels, Math.floor(length), safeSampleRate);
  };

  const registerBuffer = (key: string, buffer: AudioBufferLike) => {
    if (!key || !buffer) {
      return;
    }
    buffers.set(key, buffer);
  };

  const dispose = async () => {
    if (context.state !== 'closed') {
      await context.close();
    }
    state.status = 'closed';
  };

  return {
    state,
    resume: async () => {
      await resume();
    },
    setMuted,
    setVolume,
    getSettings,
    createBuffer,
    registerBuffer,
    hasBuffer,
    load,
    preload,
    play,
    playPositional,
    setListenerPosition,
    dispose
  };
};
