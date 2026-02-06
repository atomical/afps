import { describe, expect, it, vi } from 'vitest';
import { PickupKind, type FxEvent } from '../../src/net/protocol';
import { createPickupManager } from '../../src/pickups/manager';
import { FakeScene, createFakeThree } from '../fakeThree';

describe('PickupManager', () => {
  it('spawns, hides, respawns, and disposes pickup visuals', () => {
    const three = createFakeThree();
    const scene = new FakeScene();
    const manager = createPickupManager({ three, scene });

    const spawn: FxEvent = {
      type: 'PickupSpawnedFx',
      pickupId: 7,
      kind: PickupKind.Health,
      posXQ: 16,
      posYQ: -32,
      posZQ: 8,
      weaponSlot: 0,
      amount: 25
    };

    manager.applyFx(spawn);
    expect(scene.children).toHaveLength(1);
    const root = scene.children[0]!;
    expect(root.visible).toBe(true);
    expect(root.position.x).toBeCloseTo(1);
    expect(root.position.z).toBeCloseTo(-2);

    manager.applyFx({ type: 'PickupTakenFx', pickupId: 7, takerId: 'c-1', serverTick: 100 });
    expect(root.visible).toBe(false);

    manager.applyFx({ ...spawn, posXQ: 32, posYQ: 16, kind: PickupKind.Weapon });
    expect(scene.children).toHaveLength(1);
    expect(root.visible).toBe(true);
    expect(root.position.x).toBeCloseTo(2);
    expect(root.position.z).toBeCloseTo(1);

    const beforeRotation = root.rotation.y;
    manager.update(1 / 60, 1000);
    expect(root.rotation.y).toBeGreaterThan(beforeRotation);

    manager.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('handles unknown take events and disposal without scene.remove', () => {
    const three = createFakeThree();
    const scene = {
      add: vi.fn(),
      children: [] as unknown[]
    } as unknown as FakeScene;
    const manager = createPickupManager({ three, scene });

    manager.applyFx({ type: 'PickupTakenFx', pickupId: 999, takerId: undefined, serverTick: 7 });
    manager.applyFx({
      type: 'PickupSpawnedFx',
      pickupId: 11,
      kind: PickupKind.Weapon,
      posXQ: 0,
      posYQ: 0,
      posZQ: 0,
      weaponSlot: 1,
      amount: 10
    });
    const spawnedRoot = scene.add.mock.calls[0]?.[0] as { rotation: { y: number } } | undefined;
    expect(spawnedRoot).toBeDefined();
    if (!spawnedRoot) {
      return;
    }
    manager.applyFx({ type: 'PickupTakenFx', pickupId: 11, takerId: 'c-2', serverTick: 8 });
    const beforeRotation = spawnedRoot.rotation.y;
    manager.update(1 / 60, 1500);
    expect(spawnedRoot.rotation.y).toBe(beforeRotation);

    manager.dispose();

    manager.applyFx({
      type: 'PickupSpawnedFx',
      pickupId: 11,
      kind: PickupKind.Health,
      posXQ: 16,
      posYQ: 16,
      posZQ: 0,
      weaponSlot: 0,
      amount: 25
    });
    expect(scene.add).toHaveBeenCalledTimes(2);
  });
});
