import type { App, AppDimensions, AppState, NetworkSnapshot, ThreeLike } from './types';
import type { InputCmd } from './net/input_cmd';
import { ClientPrediction, type PredictionSim } from './net/prediction';
import { SnapshotBuffer } from './net/snapshot_buffer';
import { loadRetroUrbanMap } from './environment/retro_urban_map';
import { WEAPON_DEFS } from './weapons/config';

export interface CreateAppOptions {
  three: ThreeLike;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  devicePixelRatio: number;
  lookSensitivity?: number;
  loadEnvironment?: boolean;
}

const DEFAULTS = {
  fov: 70,
  near: 0.1,
  far: 100,
  cubeSize: 1,
  rotationSpeed: 1.25,
  lookSensitivity: 0.002,
  maxPitch: Math.PI / 2 - 0.01,
  cameraHeight: 1.6,
  background: 0x0b0d12,
  cubeColor: 0x4cc3ff,
  projectileColor: 0xf2d9a1,
  projectileSize: 0.12,
  projectileTtl: 1.2,
  tracerColor: 0xffd27d,
  tracerThickness: 0.03,
  tracerTtl: 0.08,
  tracerLength: 24,
  ambientIntensity: 0.4,
  keyLightIntensity: 0.9,
  snapshotRate: 20,
  tickRate: 60
};

type ProjectileVfx = {
  id?: number;
  mesh: AppState['cube'];
  velocity: { x: number; y: number; z: number };
  ttl: number;
};

type TracerVfx = {
  mesh: AppState['cube'];
  ttl: number;
};

export const createApp = ({
  three,
  canvas,
  width,
  height,
  devicePixelRatio,
  lookSensitivity: initialLookSensitivity,
  loadEnvironment = false
}: CreateAppOptions): App => {
  const dimensions: AppDimensions = { width, height, dpr: devicePixelRatio };

  const scene = new three.Scene();
  scene.background = new three.Color(DEFAULTS.background);

  const camera = new three.PerspectiveCamera(DEFAULTS.fov, width / height, DEFAULTS.near, DEFAULTS.far);
  camera.position.set(0, 1, 3);

  const renderer = new three.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(width, height);

  const geometry = new three.BoxGeometry(DEFAULTS.cubeSize, DEFAULTS.cubeSize, DEFAULTS.cubeSize);
  const material = new three.MeshStandardMaterial({ color: DEFAULTS.cubeColor });
  const cube = new three.Mesh(geometry, material);
  cube.position.set(0, 0.5, 0);
  scene.add(cube);

  const ambient = new three.AmbientLight(0xffffff, DEFAULTS.ambientIntensity);
  scene.add(ambient);

  const keyLight = new three.DirectionalLight(0xffffff, DEFAULTS.keyLightIntensity);
  keyLight.position.set(2, 4, 3);
  scene.add(keyLight);

  const projectileGeometry = new three.BoxGeometry(
    DEFAULTS.projectileSize,
    DEFAULTS.projectileSize,
    DEFAULTS.projectileSize
  );
  const projectileMaterial = new three.MeshStandardMaterial({ color: DEFAULTS.projectileColor });
  const tracerMaterial = new three.MeshStandardMaterial({ color: DEFAULTS.tracerColor });
  const projectiles: ProjectileVfx[] = [];
  const projectileIndex = new Map<number, ProjectileVfx>();
  const tracers: TracerVfx[] = [];
  const fireCooldowns = new Map<number, number>();

  if (loadEnvironment) {
    void loadRetroUrbanMap(scene);
  }

  const state: AppState = {
    dimensions,
    rotationSpeed: DEFAULTS.rotationSpeed,
    cubeRotation: 0,
    scene,
    camera,
    renderer,
    cube
  };

  const snapshotBuffer = new SnapshotBuffer(DEFAULTS.snapshotRate);
  const prediction = new ClientPrediction();
  prediction.setTickRate(DEFAULTS.tickRate);
  let lookYaw = 0;
  let lookPitch = 0;
  let lookSensitivity = DEFAULTS.lookSensitivity;
  if (Number.isFinite(initialLookSensitivity) && initialLookSensitivity > 0) {
    lookSensitivity = initialLookSensitivity;
  }

  const clampWeaponSlot = (slot: number) => {
    const maxSlot = Math.max(0, WEAPON_DEFS.length - 1);
    if (!Number.isFinite(slot)) {
      return 0;
    }
    return Math.min(maxSlot, Math.max(0, Math.floor(slot)));
  };

  const getWeaponDef = (slot: number) => WEAPON_DEFS[clampWeaponSlot(slot)];

  const computeDirection = (yaw: number, pitch: number) => {
    const safeYaw = Number.isFinite(yaw) ? yaw : 0;
    const safePitch = Number.isFinite(pitch) ? pitch : 0;
    const cosPitch = Math.cos(safePitch);
    let x = Math.sin(safeYaw) * cosPitch;
    let y = Math.sin(safePitch);
    let z = -Math.cos(safeYaw) * cosPitch;
    const len = Math.hypot(x, y, z) || 1;
    x /= len;
    y /= len;
    z /= len;
    return { x, y, z };
  };

  const spawnProjectile = (
    origin: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    speed: number
  ) => {
    const velocity = { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed };
    spawnProjectileWithVelocity(origin, velocity, DEFAULTS.projectileTtl);
  };

  const removeProjectile = (projectile: ProjectileVfx) => {
    scene.remove?.(projectile.mesh);
    if (projectile.id !== undefined) {
      projectileIndex.delete(projectile.id);
    }
  };

  const spawnProjectileWithVelocity = (
    origin: { x: number; y: number; z: number },
    velocity: { x: number; y: number; z: number },
    ttl: number,
    projectileId?: number
  ) => {
    if (
      !Number.isFinite(origin.x) ||
      !Number.isFinite(origin.y) ||
      !Number.isFinite(origin.z) ||
      !Number.isFinite(velocity.x) ||
      !Number.isFinite(velocity.y) ||
      !Number.isFinite(velocity.z)
    ) {
      return;
    }
    if (projectileId !== undefined && (!Number.isFinite(projectileId) || projectileId < 0)) {
      return;
    }
    const safeTtl = Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULTS.projectileTtl;
    if (projectileId !== undefined) {
      const existing = projectileIndex.get(projectileId);
      if (existing) {
        removeProjectile(existing);
      }
    }
    const mesh = new three.Mesh(projectileGeometry, projectileMaterial);
    mesh.position.set(origin.x, origin.y, origin.z);
    scene.add(mesh);
    const projectile: ProjectileVfx = {
      id: projectileId,
      mesh,
      velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
      ttl: safeTtl
    };
    projectiles.push(projectile);
    if (projectileId !== undefined) {
      projectileIndex.set(projectileId, projectile);
    }
  };

  const spawnTracer = (
    origin: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    yaw: number,
    pitch: number,
    length: number
  ) => {
    const safeLength = Number.isFinite(length) && length > 0 ? length : DEFAULTS.tracerLength;
    const tracerGeometry = new three.BoxGeometry(
      DEFAULTS.tracerThickness,
      DEFAULTS.tracerThickness,
      safeLength
    );
    const mesh = new three.Mesh(tracerGeometry, tracerMaterial);
    mesh.rotation.y = Number.isFinite(yaw) ? yaw : 0;
    mesh.rotation.x = Number.isFinite(pitch) ? pitch : 0;
    mesh.position.set(
      origin.x + dir.x * safeLength * 0.5,
      origin.y + dir.y * safeLength * 0.5,
      origin.z + dir.z * safeLength * 0.5
    );
    scene.add(mesh);
    tracers.push({ mesh, ttl: DEFAULTS.tracerTtl });
  };

  const ingestSnapshot = (snapshot: NetworkSnapshot, nowMs: number) => {
    snapshotBuffer.push(snapshot, nowMs);
    prediction.reconcile(snapshot);
  };

  const setSnapshotRate = (snapshotRate: number) => {
    snapshotBuffer.setSnapshotRate(snapshotRate);
  };

  const recordInput = (cmd: InputCmd) => {
    prediction.recordInput(cmd);
    if (!cmd.fire) {
      return;
    }
    const weapon = getWeaponDef(cmd.weaponSlot);
    if (!weapon) {
      return;
    }
    const fireRate = weapon.fireRate;
    if (!Number.isFinite(fireRate) || fireRate <= 0) {
      return;
    }
    const slot = clampWeaponSlot(cmd.weaponSlot);
    const cooldown = fireCooldowns.get(slot) ?? 0;
    if (cooldown > 0) {
      return;
    }
    const dir = computeDirection(cmd.viewYaw, cmd.viewPitch);
    const origin = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    if (weapon.kind === 'projectile') {
      const speed = weapon.projectileSpeed;
      if (!Number.isFinite(speed) || speed <= 0) {
        return;
      }
      spawnProjectile(origin, dir, speed);
    } else {
      spawnTracer(origin, dir, cmd.viewYaw, cmd.viewPitch, weapon.range);
    }
    fireCooldowns.set(slot, 1 / fireRate);
  };

  const getWeaponCooldown = (slot: number) => fireCooldowns.get(clampWeaponSlot(slot)) ?? 0;

  const spawnProjectileVfx = (payload: {
    origin: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    ttl?: number;
  }) => {
    spawnProjectileWithVelocity(
      payload.origin,
      payload.velocity,
      payload.ttl ?? DEFAULTS.projectileTtl,
      payload.projectileId
    );
  };

  const removeProjectileVfx = (projectileId: number) => {
    if (!Number.isFinite(projectileId) || projectileId < 0) {
      return;
    }
    const projectile = projectileIndex.get(projectileId);
    if (!projectile) {
      return;
    }
    removeProjectile(projectile);
    const index = projectiles.indexOf(projectile);
    if (index >= 0) {
      projectiles.splice(index, 1);
    }
  };

  const setTickRate = (tickRate: number) => {
    prediction.setTickRate(tickRate);
  };

  const setPredictionSim = (sim: PredictionSim) => {
    prediction.setSim(sim);
  };

  const applyLookDelta = (deltaX: number, deltaY: number) => {
    const safeX = Number.isFinite(deltaX) ? deltaX : 0;
    const safeY = Number.isFinite(deltaY) ? deltaY : 0;
    lookYaw += safeX * lookSensitivity;
    lookPitch -= safeY * lookSensitivity;
    lookPitch = Math.max(-DEFAULTS.maxPitch, Math.min(DEFAULTS.maxPitch, lookPitch));
    camera.rotation.y = lookYaw;
    camera.rotation.x = lookPitch;
  };

  const getLookAngles = () => ({
    yaw: Number.isFinite(lookYaw) ? lookYaw : 0,
    pitch: Number.isFinite(lookPitch) ? lookPitch : 0
  });

  const setLookSensitivity = (value: number) => {
    if (Number.isFinite(value) && value > 0) {
      lookSensitivity = value;
    }
  };

  const renderFrame = (deltaSeconds: number, nowMs?: number) => {
    const safeDelta = Math.max(0, deltaSeconds);
    if (safeDelta > 0) {
      for (const [slot, cooldown] of fireCooldowns.entries()) {
        if (cooldown <= 0) {
          continue;
        }
        const next = Math.max(0, cooldown - safeDelta);
        fireCooldowns.set(slot, next);
      }
    }
    if (projectiles.length > 0 && safeDelta > 0) {
      for (let i = projectiles.length - 1; i >= 0; i -= 1) {
        const projectile = projectiles[i];
        projectile.ttl -= safeDelta;
        if (projectile.ttl <= 0) {
          removeProjectile(projectile);
          projectiles.splice(i, 1);
          continue;
        }
        projectile.mesh.position.set(
          projectile.mesh.position.x + projectile.velocity.x * safeDelta,
          projectile.mesh.position.y + projectile.velocity.y * safeDelta,
          projectile.mesh.position.z + projectile.velocity.z * safeDelta
        );
      }
    }
    if (tracers.length > 0 && safeDelta > 0) {
      for (let i = tracers.length - 1; i >= 0; i -= 1) {
        const tracer = tracers[i];
        tracer.ttl -= safeDelta;
        if (tracer.ttl <= 0) {
          scene.remove?.(tracer.mesh);
          tracers.splice(i, 1);
        }
      }
    }
    state.cubeRotation += safeDelta * state.rotationSpeed;
    cube.rotation.x = state.cubeRotation;
    cube.rotation.y = state.cubeRotation * 0.8;
    let targetX: number | null = null;
    let targetY: number | null = null;
    let targetZ: number | null = null;
    if (prediction.isActive()) {
      const predicted = prediction.getState();
      targetX = predicted.x;
      targetY = predicted.y;
      targetZ = predicted.z;
    } else {
      const snapshot = snapshotBuffer.sample(nowMs ?? performance.now());
      if (snapshot) {
        targetX = snapshot.posX;
        targetY = snapshot.posY;
        targetZ = snapshot.posZ;
      }
    }
    if (targetX !== null && targetY !== null) {
      const height = targetZ ?? 0;
      cube.position.set(targetX, 0.5 + height, targetY);
      camera.position.set(targetX, DEFAULTS.cameraHeight + height, targetY);
    }
    renderer.render(scene, camera);
  };

  const resize = (nextWidth: number, nextHeight: number, nextDpr: number) => {
    state.dimensions = { width: nextWidth, height: nextHeight, dpr: nextDpr };
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(nextDpr);
    renderer.setSize(nextWidth, nextHeight);
  };

  const dispose = () => {
    renderer.dispose?.();
  };

  return {
    state,
    renderFrame,
    resize,
    ingestSnapshot,
    setSnapshotRate,
    recordInput,
    spawnProjectileVfx,
    removeProjectileVfx,
    getWeaponCooldown,
    setTickRate,
    setPredictionSim,
    applyLookDelta,
    getLookAngles,
    setLookSensitivity,
    dispose
  };
};
