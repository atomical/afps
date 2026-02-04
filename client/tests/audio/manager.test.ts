import { describe, expect, it, vi } from 'vitest';
import { createAudioManager } from '../../src/audio/manager';
import { DEFAULT_AUDIO_SETTINGS } from '../../src/audio/settings';

class FakeAudioParam {
  value = 0;
}

class FakeNode {
  connections: FakeNode[] = [];
  connect(node: FakeNode) {
    this.connections.push(node);
  }
}

class FakeGainNode extends FakeNode {
  gain = new FakeAudioParam();
}

class FakeBufferSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  started = false;
  start() {
    this.started = true;
  }
}

class FakePannerNode extends FakeNode {
  positionX = new FakeAudioParam();
  positionY = new FakeAudioParam();
  positionZ = new FakeAudioParam();
}

class FakeListener {
  positionX = new FakeAudioParam();
  positionY = new FakeAudioParam();
  positionZ = new FakeAudioParam();
  forwardX = new FakeAudioParam();
  forwardY = new FakeAudioParam();
  forwardZ = new FakeAudioParam();
  upX = new FakeAudioParam();
  upY = new FakeAudioParam();
  upZ = new FakeAudioParam();
}

const makeContext = () => {
  const context = {
    state: 'suspended' as const,
    currentTime: 0,
    sampleRate: 44100,
    destination: new FakeNode(),
    listener: new FakeListener(),
    createGain: () => new FakeGainNode(),
    createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
    createBufferSource: () => new FakeBufferSource(),
    createPanner: () => new FakePannerNode(),
    decodeAudioData: vi.fn(async () => ({ decoded: true })),
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    close: vi.fn(async () => {
      context.state = 'closed';
    })
  };
  return context;
};

describe('audio manager', () => {
  it('loads buffers and plays sounds', async () => {
    const context = makeContext();
    const fetcher = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8)
    }));
    const audio = createAudioManager({ context, fetcher, settings: DEFAULT_AUDIO_SETTINGS });

    const buffer = await audio.load('fire', '/fire.wav');
    expect(buffer).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(audio.play('fire')).toBe(true);
    expect(audio.playPositional('fire', { x: 1, y: 2, z: 3 })).toBe(true);
  });

  it('caches inflight loads', async () => {
    const context = makeContext();
    const fetcher = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(4)
    }));
    const audio = createAudioManager({ context, fetcher });

    await Promise.all([audio.load('impact', '/impact.wav'), audio.load('impact', '/impact.wav')]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('updates volumes and mute state', () => {
    const context = makeContext();
    const audio = createAudioManager({ context });

    audio.setVolume('master', 0.6);
    audio.setVolume('sfx', 0.2);
    audio.setMuted(true);
    const settings = audio.getSettings();
    expect(settings.master).toBeCloseTo(0.6);
    expect(settings.sfx).toBeCloseTo(0.2);
    expect(settings.muted).toBe(true);
  });

  it('resumes audio context when requested', async () => {
    const context = makeContext();
    const audio = createAudioManager({ context });

    await audio.resume();
    expect(context.state).toBe('running');
  });

  it('tracks registered buffers', () => {
    const context = makeContext();
    const audio = createAudioManager({ context });
    expect(audio.hasBuffer('impact')).toBe(false);
    audio.registerBuffer('impact', { getChannelData: () => new Float32Array(1) });
    expect(audio.hasBuffer('impact')).toBe(true);
  });
});
