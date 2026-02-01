import { describe, expect, it, vi } from 'vitest';
import { loadRetroUrbanMap } from '../../src/environment/retro_urban_map';

let mode: 'ok' | 'error' | 'throw' = 'ok';

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
    if (mode === 'throw') {
      throw new Error('loader failed');
    }
    if (mode === 'error') {
      onError?.(new Error('boom'));
      return;
    }
    onLoad({ scene: makeObject3D() });
  }
}

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: MockLoader
}));

describe('retro urban map loader', () => {
  it('loads assets and adds them to the scene', async () => {
    mode = 'ok';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { scene, added } = makeScene();

    await loadRetroUrbanMap(scene);

    expect(added.length).toBeGreaterThan(0);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('handles loader failures gracefully', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { scene } = makeScene();

    mode = 'error';
    await loadRetroUrbanMap(scene);
    mode = 'throw';
    await loadRetroUrbanMap(scene);

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
