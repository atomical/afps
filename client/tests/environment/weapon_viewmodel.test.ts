import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWeaponViewmodel } from '../../src/environment/weapon_viewmodel';

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
  set: vi.fn()
});

const makeScene = () => ({
  add: vi.fn(),
  position: makeVector(),
  rotation: { x: 0, y: 0, z: 0 }
});

const makeCamera = () => ({
  add: vi.fn(),
  position: makeVector(),
  rotation: { x: 0, y: 0, z: 0 }
});

describe('loadWeaponViewmodel', () => {
  beforeEach(() => {
    loadMock = vi.fn();
    shouldThrow = false;
    GLTFLoader.mockClear();
  });

  it('attaches a launcher viewmodel to the camera', async () => {
    const scene = makeScene();
    const camera = makeCamera();
    const positionSet = vi.fn();
    const scaleSet = vi.fn();
    const root = {
      position: { x: 0, y: 0, z: 0, set: positionSet },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { set: scaleSet }
    };

    loadMock.mockImplementation((file: string, onLoad: (gltf: { scene: typeof root }) => void) => {
      onLoad({ scene: root });
    });

    await loadWeaponViewmodel({ scene: scene as unknown as any, camera: camera as unknown as any, weaponId: 'launcher' });

    expect(loadMock).toHaveBeenCalled();
    expect(loadMock.mock.calls[0][0]).toContain('blaster-f.glb');
    expect(positionSet).toHaveBeenCalledWith(0.4, -0.36, -0.72);
    expect(root.rotation.x).toBeCloseTo(0.06);
    expect(root.rotation.y).toBeCloseTo(0.08);
    expect(scaleSet).toHaveBeenCalledWith(0.6, 0.6, 0.6);
    expect(scene.add).toHaveBeenCalledWith(camera);
    expect(camera.add).toHaveBeenCalledWith(root);
  });

  it('falls back to the default viewmodel when the id is unknown', async () => {
    const scene = makeScene();
    const camera = { position: makeVector(), rotation: { x: 0, y: 0, z: 0 } };
    const root = {
      position: { x: 0, y: 0, z: 0, set: vi.fn() },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { set: vi.fn() }
    };

    loadMock.mockImplementation((file: string, onLoad: (gltf: { scene: typeof root }) => void) => {
      onLoad({ scene: root });
    });

    await loadWeaponViewmodel({ scene: scene as unknown as any, camera: camera as unknown as any, weaponId: 'unknown' });

    expect(loadMock.mock.calls[0][0]).toContain('blaster-a.glb');
    expect(scene.add).toHaveBeenCalledWith(camera);
    expect(scene.add).toHaveBeenCalledWith(root);
  });

  it('warns when the loader reports an error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scene = makeScene();
    const camera = makeCamera();

    loadMock.mockImplementation(
      (_file: string, _onLoad: unknown, _onProgress: unknown, onError: (error: Error) => void) => {
        onError(new Error('bad'));
      }
    );

    await loadWeaponViewmodel({ scene: scene as unknown as any, camera: camera as unknown as any, weaponId: 'rifle' });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('weapon viewmodel failed'), expect.any(Error));
    warn.mockRestore();
  });

  it('warns when the loader cannot be created', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scene = makeScene();
    const camera = makeCamera();
    shouldThrow = true;

    await loadWeaponViewmodel({ scene: scene as unknown as any, camera: camera as unknown as any, weaponId: 'rifle' });

    expect(warn).toHaveBeenCalledWith('weapon viewmodel load skipped', expect.any(Error));
    warn.mockRestore();
  });
});
