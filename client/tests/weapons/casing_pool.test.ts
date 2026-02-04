import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCasingPool } from '../../src/weapons/casing_pool';

let loadMock: ReturnType<typeof vi.fn>;
let shouldThrow = false;

const GLTFLoader = vi.fn(function MockGLTFLoader(this: { load?: typeof loadMock }) {
  if (shouldThrow) {
    throw new Error('boom');
  }
  this.load = loadMock;
});

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader
}));

const makeVector = () => ({
  x: 0,
  y: 0,
  z: 0,
  set(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
});

const makeMesh = () => ({
  position: makeVector(),
  rotation: { x: 0, y: 0, z: 0 },
  scale: { set: vi.fn() }
});

const makeScene = () => ({
  add: vi.fn(),
  remove: vi.fn()
});

const makePayload = () => ({
  position: { x: 0, y: 0.02, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  velocity: { x: 0.1, y: -0.4, z: 0 },
  angularVelocity: { x: 0, y: 0, z: 0 },
  lifetimeSeconds: 0.2,
  seed: 2
});

describe('createCasingPool', () => {
  beforeEach(() => {
    loadMock = vi.fn();
    shouldThrow = false;
    GLTFLoader.mockClear();
  });

  it('resolves not ready when the loader throws', async () => {
    shouldThrow = true;
    const scene = makeScene();
    const audio = { playPositional: vi.fn() };
    const pool = createCasingPool({
      three: {} as unknown as Parameters<typeof createCasingPool>[0]['three'],
      scene: scene as unknown as Parameters<typeof createCasingPool>[0]['scene'],
      audio: audio as unknown as Parameters<typeof createCasingPool>[0]['audio'],
      impactSounds: []
    });

    const ready = await pool.ready;
    expect(ready).toBe(false);

    pool.spawn(makePayload());
    expect(scene.add).not.toHaveBeenCalled();
  });

  it('resolves not ready when the loader reports an error', async () => {
    loadMock.mockImplementation(
      (_file: string, _onLoad: unknown, _onProgress: unknown, onError: (error: Error) => void) => {
        onError(new Error('bad'));
      }
    );
    const pool = createCasingPool({
      three: {} as unknown as Parameters<typeof createCasingPool>[0]['three'],
      scene: makeScene() as unknown as Parameters<typeof createCasingPool>[0]['scene'],
      audio: { playPositional: vi.fn() } as unknown as Parameters<typeof createCasingPool>[0]['audio'],
      impactSounds: ['impact']
    });

    const ready = await pool.ready;
    expect(ready).toBe(false);
  });

  it('falls back to the archive casing model path when needed', async () => {
    const baseModel = makeMesh();
    (baseModel as unknown as { clone?: () => unknown }).clone = () => makeMesh();

    let calls = 0;
    loadMock.mockImplementation(
      (file: string, onLoad: (gltf: { scene: unknown }) => void, _onProgress: unknown, onError: (error: Error) => void) => {
        if (calls === 0) {
          calls += 1;
          onError(new Error('missing'));
          return;
        }
        onLoad({ scene: baseModel });
        expect(file).toContain('Models/GLB%20format');
      }
    );

    const pool = createCasingPool({
      three: {} as unknown as Parameters<typeof createCasingPool>[0]['three'],
      scene: makeScene() as unknown as Parameters<typeof createCasingPool>[0]['scene'],
      audio: { playPositional: vi.fn() } as unknown as Parameters<typeof createCasingPool>[0]['audio'],
      impactSounds: []
    });

    const ready = await pool.ready;
    expect(ready).toBe(true);
    expect(loadMock).toHaveBeenCalledTimes(2);
  });

  it('spawns, bounces, and reuses pooled casings', async () => {
    const baseModel = makeMesh();
    const cloneSpy = vi.fn(() => makeMesh());
    (baseModel as unknown as { clone?: () => unknown }).clone = cloneSpy;
    loadMock.mockImplementation((_file: string, onLoad: (gltf: { scene: unknown }) => void) => {
      onLoad({ scene: baseModel });
    });
    const scene = makeScene();
    const audio = { playPositional: vi.fn() };
    const pool = createCasingPool({
      three: {} as unknown as Parameters<typeof createCasingPool>[0]['three'],
      scene: scene as unknown as Parameters<typeof createCasingPool>[0]['scene'],
      audio: audio as unknown as Parameters<typeof createCasingPool>[0]['audio'],
      impactSounds: ['impact']
    });

    const ready = await pool.ready;
    expect(ready).toBe(true);

    pool.update(0.1);
    pool.spawn(makePayload());
    const firstMesh = scene.add.mock.calls[0][0];
    pool.update(0.05);
    expect(audio.playPositional).toHaveBeenCalledTimes(1);
    pool.update(0.01);
    expect(audio.playPositional).toHaveBeenCalledTimes(1);
    pool.update(0.2);
    expect(scene.remove).toHaveBeenCalledWith(firstMesh);

    pool.spawn(makePayload());
    const secondMesh = scene.add.mock.calls[1][0];
    expect(secondMesh).toBe(firstMesh);
    expect(cloneSpy).toHaveBeenCalledTimes(1);
    pool.dispose();
  });

  it('skips impact sounds when none are configured', async () => {
    const baseModel = makeMesh();
    (baseModel as unknown as { clone?: () => unknown }).clone = () => makeMesh();
    loadMock.mockImplementation((_file: string, onLoad: (gltf: { scene: unknown }) => void) => {
      onLoad({ scene: baseModel });
    });
    const scene = makeScene();
    const audio = { playPositional: vi.fn() };
    const pool = createCasingPool({
      three: {} as unknown as Parameters<typeof createCasingPool>[0]['three'],
      scene: scene as unknown as Parameters<typeof createCasingPool>[0]['scene'],
      audio: audio as unknown as Parameters<typeof createCasingPool>[0]['audio'],
      impactSounds: []
    });

    await pool.ready;
    pool.spawn({
      ...makePayload(),
      position: { x: 0, y: -0.03, z: 0 },
      velocity: { x: 0, y: 5, z: 0 }
    });
    pool.spawn(makePayload());
    pool.update(0.1);

    expect(audio.playPositional).not.toHaveBeenCalled();
  });

  it('selects impact sounds and recycles when pool is full', async () => {
    const baseModel = makeMesh();
    loadMock.mockImplementation((_file: string, onLoad: (gltf: { scene: unknown }) => void) => {
      onLoad({ scene: baseModel });
    });
    const scene = makeScene();
    const audio = { playPositional: vi.fn() };
    const pool = createCasingPool({
      three: {} as unknown as Parameters<typeof createCasingPool>[0]['three'],
      scene: scene as unknown as Parameters<typeof createCasingPool>[0]['scene'],
      audio: audio as unknown as Parameters<typeof createCasingPool>[0]['audio'],
      impactSounds: ['impact-a', 'impact-b']
    });

    await pool.ready;
    for (let i = 0; i < 65; i += 1) {
      pool.spawn({
        ...makePayload(),
        position: { x: 0, y: -0.03, z: 0 },
        seed: i
      });
    }
    expect(scene.remove.mock.calls.length).toBeGreaterThan(0);

    pool.update(0.1);
    const keys = audio.playPositional.mock.calls.map((call) => call[0]);
    expect(keys.some((key) => key === 'impact-a' || key === 'impact-b')).toBe(true);
  });
});
