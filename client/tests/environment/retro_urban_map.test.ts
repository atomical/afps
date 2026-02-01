import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRetroUrbanMap } from '../../src/environment/retro_urban_map';

let mode: 'ok' | 'error' | 'throw' = 'ok';
let loadCalls: string[] = [];
let loadedObjects: ReturnType<typeof makeObject3D>[] = [];
let boxHelpers: unknown[] = [];
let gridHelpers: unknown[] = [];
const env = import.meta.env as Record<string, string | undefined>;
const originalDebug = env.VITE_DEBUG_RETRO_URBAN_BOUNDS;
const originalGrid = env.VITE_DEBUG_RETRO_URBAN_GRID;

const makeScene = () => {
  const added: unknown[] = [];
  return {
    added,
    scene: {
      add: (child: unknown) => {
        added.push(child);
      }
    }
  };
};

const makeObject3D = () => ({
  position: { set: vi.fn() },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { set: vi.fn() }
});

class MockLoader {
  load(
    url: string,
    onLoad: (value: { scene: ReturnType<typeof makeObject3D> }) => void,
    _onProgress: unknown,
    onError?: (err: Error) => void
  ) {
    loadCalls.push(url);
    if (mode === 'throw') {
      throw new Error('loader failed');
    }
    if (mode === 'error') {
      onError?.(new Error('boom'));
      return;
    }
    const obj = makeObject3D();
    loadedObjects.push(obj);
    onLoad({ scene: obj });
  }
}

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: MockLoader
}));

class MockBoxHelper {
  constructor(_obj: unknown, _color: number) {
    boxHelpers.push({ obj: _obj, color: _color });
  }
}

class MockGridHelper {
  constructor(_size: number, _divisions: number, _color1: number, _color2: number) {
    gridHelpers.push({ size: _size, divisions: _divisions });
  }
}

vi.mock('three', () => ({
  BoxHelper: MockBoxHelper,
  GridHelper: MockGridHelper
}));

describe('retro urban map loader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    loadCalls = [];
    loadedObjects = [];
    boxHelpers = [];
    gridHelpers = [];
    env.VITE_DEBUG_RETRO_URBAN_BOUNDS = originalDebug;
    env.VITE_DEBUG_RETRO_URBAN_GRID = originalGrid;
  });

  it('loads assets and adds them to the scene', async () => {
    mode = 'ok';
    const placements = [
      { file: 'road-asphalt-center.glb', position: [0, 0, 0] },
      { file: 'detail-bench.glb', position: [1, 0, 1], randomYaw: true },
      { file: 'detail-bench.glb', position: [2, 0, 1], rotation: [0, 0.25, 0], scale: 1 }
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 1, seed: 7, yawChoices: [1], placements })
    });
    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { scene, added } = makeScene();

    await loadRetroUrbanMap(scene);

    expect(fetchMock).toHaveBeenCalled();
    expect(loadCalls).toHaveLength(placements.length);
    expect(added.length).toBe(placements.length);
    expect(loadedObjects[1].rotation.y).toBe(1);
    expect(loadedObjects.some((obj) => obj.scale.set.mock.calls.length > 0)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('adds debug bounds when enabled', async () => {
    mode = 'ok';
    env.VITE_DEBUG_RETRO_URBAN_BOUNDS = 'true';
    const placements = [
      { file: 'road-asphalt-center.glb', position: [0, 0, 0] },
      { file: 'detail-bench.glb', position: [1, 0, 1] }
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 1, placements })
    });
    vi.stubGlobal('fetch', fetchMock);
    const { scene, added } = makeScene();

    await loadRetroUrbanMap(scene);

    expect(added.length).toBe(placements.length * 2);
    expect(boxHelpers).toHaveLength(placements.length);
  });

  it('adds debug grid when enabled', async () => {
    mode = 'ok';
    env.VITE_DEBUG_RETRO_URBAN_GRID = 'true';
    const placements = [{ file: 'road-asphalt-center.glb', position: [0, 0, 0] }];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 1, placements })
    });
    vi.stubGlobal('fetch', fetchMock);
    const { scene, added } = makeScene();

    await loadRetroUrbanMap(scene);

    expect(added.length).toBe(placements.length + 1);
    expect(gridHelpers).toHaveLength(1);
  });

  it('filters invalid placements and handles loader failures gracefully', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 1,
        placements: [
          null,
          { file: '', position: [0, 0, 0] },
          { file: 'broken.glb', position: [0, 0] },
          { file: 'broken.glb', position: [0, 'x', 0] },
          { file: 'valid-a.glb', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
          { file: 'valid-b.glb', position: [1, 0, 1], scale: -2 }
        ]
      })
    });
    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { scene } = makeScene();

    mode = 'error';
    await loadRetroUrbanMap(scene);
    expect(loadCalls).toHaveLength(2);
    mode = 'ok';
    const badFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', badFetch);
    await loadRetroUrbanMap(scene);
    mode = 'throw';
    await loadRetroUrbanMap(scene);

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('falls back when manifest is missing or invalid', async () => {
    mode = 'ok';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { scene } = makeScene();

    vi.stubGlobal('fetch', undefined as unknown as typeof fetch);
    await loadRetroUrbanMap(scene);

    const invalidShape = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => 'nope'
    });
    vi.stubGlobal('fetch', invalidShape);
    await loadRetroUrbanMap(scene);

    const invalidPlacementsType = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 1, placements: 'nope' })
    });
    vi.stubGlobal('fetch', invalidPlacementsType);
    await loadRetroUrbanMap(scene);

    const invalidYawChoices = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 1, seed: 3, yawChoices: [], placements: [{ file: 'valid.glb', position: [0, 0, 0], randomYaw: true }] })
    });
    vi.stubGlobal('fetch', invalidYawChoices);
    await loadRetroUrbanMap(scene);
    expect(loadedObjects.length).toBeGreaterThan(0);

    const invalidPlacements = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 1, placements: [{ file: '', position: [0, 0, 0] }] })
    });
    vi.stubGlobal('fetch', invalidPlacements);
    await loadRetroUrbanMap(scene);

    const throwsFetch = vi.fn().mockRejectedValue(new Error('fetch fail'));
    vi.stubGlobal('fetch', throwsFetch);
    await loadRetroUrbanMap(scene);

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
