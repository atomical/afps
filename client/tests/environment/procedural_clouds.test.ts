import { describe, expect, it } from 'vitest';
import { createProceduralCloudLayer } from '../../src/environment/procedural_clouds';
import { createFakeThree, FakeScene } from '../fakeThree';

describe('procedural_clouds', () => {
  it('creates deterministic cloud placement for a given seed', () => {
    const three = createFakeThree();
    const sceneA = new three.Scene() as unknown as FakeScene;
    const sceneB = new three.Scene() as unknown as FakeScene;

    const layerA = createProceduralCloudLayer({
      three,
      scene: sceneA,
      seed: 1337,
      arenaHalfSize: 30
    });
    const layerB = createProceduralCloudLayer({
      three,
      scene: sceneB,
      seed: 1337,
      arenaHalfSize: 30
    });

    expect(layerA).not.toBeNull();
    expect(layerB).not.toBeNull();
    expect(sceneA.children.length).toBeGreaterThan(0);
    expect(sceneA.children.length).toBe(sceneB.children.length);

    const a = sceneA.children[0]!;
    const b = sceneB.children[0]!;
    expect(a.position.x).toBeCloseTo(b.position.x, 6);
    expect(a.position.y).toBeCloseTo(b.position.y, 6);
    expect(a.position.z).toBeCloseTo(b.position.z, 6);

    layerA?.dispose();
    layerB?.dispose();
  });

  it('updates cloud motion and cleans up scene children on dispose', () => {
    const three = createFakeThree();
    const scene = new three.Scene() as unknown as FakeScene;
    const layer = createProceduralCloudLayer({
      three,
      scene,
      seed: 7,
      arenaHalfSize: 24
    });

    expect(layer).not.toBeNull();
    const first = scene.children[0]!;
    const start = { x: first.position.x, y: first.position.y, z: first.position.z };

    layer?.update(0.5, { x: 0, y: 0, z: 0 });

    const moved =
      first.position.x !== start.x || first.position.y !== start.y || first.position.z !== start.z;
    expect(moved).toBe(true);

    layer?.dispose();
    expect(scene.children.length).toBe(0);
  });
});
