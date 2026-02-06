import { dequantizeI16 } from '../net/quantization';
import { PickupKind, type FxEvent } from '../net/protocol';
import type { Object3DLike, SceneLike, ThreeLike } from '../types';

const PICKUP_POS_STEP_METERS = 1 / 16;

type PickupEntry = {
  id: number;
  kind: PickupKind;
  root: Object3DLike;
  baseY: number;
  phase: number;
  active: boolean;
};

const toThreePosition = (x: number, y: number, z: number) => ({ x, y: z, z: y });

export interface PickupManager {
  applyFx: (event: FxEvent) => void;
  update: (deltaSeconds: number, nowMs: number) => void;
  dispose: () => void;
}

export const createPickupManager = ({
  three,
  scene
}: {
  three: ThreeLike;
  scene: SceneLike;
}): PickupManager => {
  const entries = new Map<number, PickupEntry>();

  const createVisual = (kind: PickupKind): Object3DLike => {
    const color = kind === PickupKind.Health ? 0x56d86d : 0xd8b456;
    const meshMaterial = new three.MeshToonMaterial({ color });
    const groupCtor = three.Object3D;

    if (groupCtor) {
      const group = new groupCtor();
      const core = new three.Mesh(new three.BoxGeometry(0.36, 0.36, 0.36), meshMaterial);
      group.add?.(core as unknown as Object3DLike);
      if (kind === PickupKind.Health) {
        const armA = new three.Mesh(new three.BoxGeometry(0.65, 0.18, 0.18), meshMaterial);
        const armB = new three.Mesh(new three.BoxGeometry(0.18, 0.65, 0.18), meshMaterial);
        group.add?.(armA as unknown as Object3DLike);
        group.add?.(armB as unknown as Object3DLike);
      } else {
        const top = new three.Mesh(new three.BoxGeometry(0.5, 0.12, 0.5), meshMaterial);
        top.position.set(0, 0.28, 0);
        group.add?.(top as unknown as Object3DLike);
      }
      return group as unknown as Object3DLike;
    }

    return new three.Mesh(new three.BoxGeometry(0.4, 0.4, 0.4), meshMaterial) as unknown as Object3DLike;
  };

  const upsertSpawn = (event: Extract<FxEvent, { type: 'PickupSpawnedFx' }>) => {
    const pickupId = event.pickupId >>> 0;
    const kind = event.kind === PickupKind.Weapon ? PickupKind.Weapon : PickupKind.Health;
    const simX = dequantizeI16(event.posXQ, PICKUP_POS_STEP_METERS);
    const simY = dequantizeI16(event.posYQ, PICKUP_POS_STEP_METERS);
    const simZ = dequantizeI16(event.posZQ, PICKUP_POS_STEP_METERS);
    const position = toThreePosition(simX, simY, simZ + 0.35);

    const existing = entries.get(pickupId);
    if (existing) {
      existing.kind = kind;
      existing.baseY = position.y;
      existing.active = true;
      existing.root.position.set(position.x, position.y, position.z);
      existing.root.visible = true;
      return;
    }

    const root = createVisual(kind);
    root.position.set(position.x, position.y, position.z);
    root.rotation.x = 0;
    root.rotation.y = 0;
    root.rotation.z = 0;
    root.visible = true;
    scene.add(root);
    entries.set(pickupId, {
      id: pickupId,
      kind,
      root,
      baseY: position.y,
      phase: (pickupId % 97) * 0.07,
      active: true
    });
  };

  const hidePickup = (event: Extract<FxEvent, { type: 'PickupTakenFx' }>) => {
    const pickupId = event.pickupId >>> 0;
    const entry = entries.get(pickupId);
    if (!entry) {
      return;
    }
    entry.active = false;
    entry.root.visible = false;
  };

  const applyFx = (event: FxEvent) => {
    if (event.type === 'PickupSpawnedFx') {
      upsertSpawn(event);
      return;
    }
    if (event.type === 'PickupTakenFx') {
      hidePickup(event);
    }
  };

  const update = (deltaSeconds: number, nowMs: number) => {
    if (!(deltaSeconds > 0) || entries.size === 0) {
      return;
    }
    const t = Number.isFinite(nowMs) ? nowMs * 0.002 : 0;
    for (const entry of entries.values()) {
      if (!entry.active) {
        continue;
      }
      entry.root.rotation.y += deltaSeconds * 1.3;
      entry.root.position.y = entry.baseY + Math.sin(t + entry.phase) * 0.12;
    }
  };

  const dispose = () => {
    if (!scene.remove) {
      entries.clear();
      return;
    }
    for (const entry of entries.values()) {
      scene.remove(entry.root);
    }
    entries.clear();
  };

  return {
    applyFx,
    update,
    dispose
  };
};
