import type { App, AppDimensions, AppState, NetworkSnapshot, Object3DLike, ThreeLike } from './types';
import type { InputCmd } from './net/input_cmd';
import { ClientPrediction, type PredictionSim } from './net/prediction';
import { SnapshotBuffer } from './net/snapshot_buffer';
import { loadRetroUrbanMap } from './environment/retro_urban_map';
import { attachWeaponViewmodel, loadWeaponViewmodel } from './environment/weapon_viewmodel';
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
  background: 0x86bff0,
  groundColor: 0xe2c38a,
  groundSize: 220,
  groundOffsetY: -0.02,
  cubeColor: 0x4cc3ff,
  projectileColor: 0xf2d9a1,
  projectileSize: 0.12,
  projectileTtl: 1.2,
  tracerColor: 0xffd27d,
  tracerThickness: 0.03,
  tracerTtl: 0.08,
  tracerLength: 24,
  ambientColor: 0xfff2d8,
  ambientIntensity: 0.55,
  keyLightColor: 0xfff7df,
  keyLightIntensity: 1.15,
  toonBands: 4,
  outlinesEnabled: true,
  outlineStrength: 1.2,
  outlineThickness: 0.6,
  outlineGlow: 0,
  outlineDownSampleRatio: 2,
  outlineTeamColors: [0x4cc3ff, 0xff6b6b],
  outlineTeamHiddenColors: [0x0f1624, 0x1a0b0b],
  outlineFlashColor: 0xfff1b8,
  outlineFlashHiddenColor: 0x2a1a0d,
  outlineFlashStrength: 2.0,
  outlineFlashThickness: 1.0,
  outlineFlashDurationMs: 140,
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
  camera.position.set(0, DEFAULTS.cameraHeight, 0);
  if (camera.rotation) {
    camera.rotation.order = 'YXZ';
  }

  const renderer = new three.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(width, height);
  renderer.outputColorSpace = three.SRGBColorSpace;
  renderer.toneMapping = three.NoToneMapping;

  const rampBands = Math.max(2, Math.round(DEFAULTS.toonBands));
  const rampData = new Uint8Array(rampBands * 4);
  for (let i = 0; i < rampBands; i += 1) {
    const shade = Math.round((i / (rampBands - 1)) * 255);
    const offset = i * 4;
    rampData[offset] = shade;
    rampData[offset + 1] = shade;
    rampData[offset + 2] = shade;
    rampData[offset + 3] = 255;
  }
  const toonRamp = new three.DataTexture(rampData, rampBands, 1);
  toonRamp.minFilter = three.NearestFilter;
  toonRamp.magFilter = three.NearestFilter;
  toonRamp.generateMipmaps = false;
  toonRamp.needsUpdate = true;

  const groundGeometry = new three.PlaneGeometry(DEFAULTS.groundSize, DEFAULTS.groundSize);
  const groundMaterial = new three.MeshToonMaterial({ color: DEFAULTS.groundColor, gradientMap: toonRamp });
  const ground = new three.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, DEFAULTS.groundOffsetY, 0);
  scene.add(ground);

  const supportsOutlines = Boolean(
    DEFAULTS.outlinesEnabled && three.EffectComposer && three.RenderPass && three.OutlinePass && three.Vector2
  );
  let composer: ReturnType<NonNullable<typeof three.EffectComposer>> | null = null;
  const outlinePasses: Array<ReturnType<NonNullable<typeof three.OutlinePass>>> = [];
  const outlineTeamVisibleColors = DEFAULTS.outlineTeamColors.map((color) => new three.Color(color));
  const outlineTeamHiddenColors = DEFAULTS.outlineTeamHiddenColors.map((color) => new three.Color(color));
  const outlineFlashVisibleColor = new three.Color(DEFAULTS.outlineFlashColor);
  const outlineFlashHiddenColor = new three.Color(DEFAULTS.outlineFlashHiddenColor);
  const outlineTeamCount = Math.max(1, outlineTeamVisibleColors.length);
  let outlineTeamIndex = 0;
  let outlineFlashUntil = 0;
  let outlineFlashTeamIndex = 0;
  let outlineFlashActive = false;

  const geometry = new three.BoxGeometry(DEFAULTS.cubeSize, DEFAULTS.cubeSize, DEFAULTS.cubeSize);
  const material = new three.MeshToonMaterial({ color: DEFAULTS.cubeColor, gradientMap: toonRamp });
  const cube = new three.Mesh(geometry, material);
  cube.position.set(0, 0.5, 0);
  scene.add(cube);

  const ambient = new three.AmbientLight(DEFAULTS.ambientColor, DEFAULTS.ambientIntensity);
  scene.add(ambient);

  const keyLight = new three.DirectionalLight(DEFAULTS.keyLightColor, DEFAULTS.keyLightIntensity);
  keyLight.position.set(4, 6, 2);
  scene.add(keyLight);

  const clampOutlineTeam = (team: number) => {
    if (!Number.isFinite(team)) {
      return 0;
    }
    return Math.max(0, Math.min(outlineTeamCount - 1, Math.floor(team)));
  };

  const getOutlineTeamColor = (colors: typeof outlineTeamVisibleColors, index: number) =>
    colors[index] ?? colors[0];

  const applyOutlineBase = (pass: ReturnType<NonNullable<typeof three.OutlinePass>>, team: number) => {
    pass.edgeStrength = DEFAULTS.outlineStrength;
    pass.edgeThickness = DEFAULTS.outlineThickness;
    pass.edgeGlow = DEFAULTS.outlineGlow;
    pass.visibleEdgeColor = getOutlineTeamColor(outlineTeamVisibleColors, team);
    pass.hiddenEdgeColor = getOutlineTeamColor(outlineTeamHiddenColors, team);
  };

  const applyOutlineFlash = (
    pass: ReturnType<NonNullable<typeof three.OutlinePass>>,
    flashStrength: number,
    flashThickness: number
  ) => {
    pass.edgeStrength = flashStrength;
    pass.edgeThickness = flashThickness;
    pass.edgeGlow = DEFAULTS.outlineGlow;
    pass.visibleEdgeColor = outlineFlashVisibleColor;
    pass.hiddenEdgeColor = outlineFlashHiddenColor;
  };

  const refreshOutlineSelection = () => {
    const cubeSelection = cube.visible === false ? [] : [cube];
    outlinePasses.forEach((pass, index) => {
      pass.selectedObjects = index === outlineTeamIndex ? cubeSelection : [];
    });
  };

  const refreshOutlineFlash = (nowMs: number) => {
    if (!outlineFlashActive) {
      return;
    }
    if (nowMs <= outlineFlashUntil) {
      return;
    }
    outlineFlashActive = false;
    const pass = outlinePasses[outlineFlashTeamIndex];
    if (pass) {
      applyOutlineBase(pass, outlineFlashTeamIndex);
    }
  };

  const setOutlineTeam = (team: number) => {
    if (outlinePasses.length === 0) {
      outlineTeamIndex = clampOutlineTeam(team);
      return;
    }
    const next = clampOutlineTeam(team);
    if (next === outlineTeamIndex) {
      return;
    }
    if (outlineFlashActive && outlineFlashTeamIndex === outlineTeamIndex) {
      const pass = outlinePasses[outlineFlashTeamIndex];
      if (pass) {
        applyOutlineBase(pass, outlineFlashTeamIndex);
      }
      outlineFlashActive = false;
    }
    outlineTeamIndex = next;
    refreshOutlineSelection();
  };

  const setLocalProxyVisible = (visible: boolean) => {
    const next = visible !== false;
    if (cube.visible !== undefined) {
      cube.visible = next;
    }
    refreshOutlineSelection();
  };

  const triggerOutlineFlash = (options?: {
    killed?: boolean;
    team?: number;
    nowMs?: number;
    durationMs?: number;
  }) => {
    if (outlinePasses.length === 0) {
      return;
    }
    const now = options?.nowMs ?? performance.now();
    const durationMs =
      Number.isFinite(options?.durationMs) && (options?.durationMs ?? 0) > 0
        ? (options?.durationMs as number)
        : DEFAULTS.outlineFlashDurationMs;
    const team = clampOutlineTeam(options?.team ?? outlineTeamIndex);
    const flashStrength = options?.killed ? DEFAULTS.outlineFlashStrength * 1.2 : DEFAULTS.outlineFlashStrength;
    const flashThickness = options?.killed ? DEFAULTS.outlineFlashThickness * 1.1 : DEFAULTS.outlineFlashThickness;

    outlineFlashTeamIndex = team;
    outlineFlashUntil = now + durationMs;
    outlineFlashActive = true;
    const pass = outlinePasses[team];
    if (pass) {
      applyOutlineFlash(pass, flashStrength, flashThickness);
    }
  };

  if (supportsOutlines && three.EffectComposer && three.RenderPass && three.OutlinePass && three.Vector2) {
    composer = new three.EffectComposer(renderer);
    const renderPass = new three.RenderPass(scene, camera);
    composer.addPass(renderPass);
    for (let i = 0; i < outlineTeamCount; i += 1) {
      const pass = new three.OutlinePass(new three.Vector2(width, height), scene, camera);
      pass.selectedObjects = [];
      pass.edgeStrength = DEFAULTS.outlineStrength;
      pass.edgeThickness = DEFAULTS.outlineThickness;
      pass.edgeGlow = DEFAULTS.outlineGlow;
      pass.downSampleRatio = DEFAULTS.outlineDownSampleRatio;
      pass.pulsePeriod = 0;
      applyOutlineBase(pass, i);
      outlinePasses.push(pass);
      composer.addPass(pass);
    }
    refreshOutlineSelection();
  }

  const projectileGeometry = new three.BoxGeometry(
    DEFAULTS.projectileSize,
    DEFAULTS.projectileSize,
    DEFAULTS.projectileSize
  );
  const projectileMaterial = new three.MeshToonMaterial({
    color: DEFAULTS.projectileColor,
    gradientMap: toonRamp
  });
  const tracerMaterial = new three.MeshToonMaterial({ color: DEFAULTS.tracerColor, gradientMap: toonRamp });
  const projectiles: ProjectileVfx[] = [];
  const projectileIndex = new Map<number, ProjectileVfx>();
  const tracers: TracerVfx[] = [];
  const fireCooldowns = new Map<number, number>();

  if (loadEnvironment) {
    void loadRetroUrbanMap(scene);
  }

  let weaponViewmodelRoot: Object3DLike | null = null;
  let weaponViewmodelParent: Object3DLike | null = null;
  let weaponViewmodelToken = 0;
  const createFallbackViewmodel = () => {
    const geometry = new three.BoxGeometry(0.32, 0.18, 0.8);
    const material = new three.MeshToonMaterial({ color: 0x2f2f2f, gradientMap: toonRamp });
    const mesh = new three.Mesh(geometry, material);
    mesh.position.set(0.4, -0.34, -0.85);
    mesh.rotation.y = Math.PI;
    return mesh as unknown as Object3DLike;
  };
  const setWeaponViewmodel = (weaponId?: string) => {
    if (!loadEnvironment) {
      return;
    }
    const token = weaponViewmodelToken + 1;
    weaponViewmodelToken = token;
    void Promise.resolve(loadWeaponViewmodel({ scene, camera, weaponId, attach: false })).then((root) => {
      if (token !== weaponViewmodelToken) {
        return;
      }
      const nextRoot = root ?? createFallbackViewmodel();
      if (weaponViewmodelRoot && weaponViewmodelParent?.remove) {
        weaponViewmodelParent.remove(weaponViewmodelRoot);
      }
      weaponViewmodelParent = attachWeaponViewmodel(scene, camera, nextRoot);
      weaponViewmodelRoot = nextRoot;
    });
  };

  if (loadEnvironment) {
    setWeaponViewmodel(WEAPON_DEFS[0]?.id);
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

  let beforeRenderHook: ((deltaSeconds: number, nowMs: number) => void) | null = null;
  const setBeforeRender = (hook: ((deltaSeconds: number, nowMs: number) => void) | null) => {
    beforeRenderHook = hook;
  };

  const snapshotBuffer = new SnapshotBuffer(DEFAULTS.snapshotRate);
  const prediction = new ClientPrediction();
  prediction.setTickRate(DEFAULTS.tickRate);
  let lastPlayerPose = {
    posX: cube.position.x,
    posY: cube.position.z,
    posZ: cube.position.y - 0.5,
    velX: 0,
    velY: 0,
    velZ: 0
  };
  const resolvePlayerPose = (nowMs: number) => {
    if (prediction.isActive()) {
      const predicted = prediction.getState();
      return {
        posX: predicted.x,
        posY: predicted.y,
        posZ: predicted.z,
        velX: predicted.velX,
        velY: predicted.velY,
        velZ: predicted.velZ
      };
    }
    const snapshot = snapshotBuffer.sample(nowMs);
    if (snapshot) {
      return {
        posX: snapshot.posX,
        posY: snapshot.posY,
        posZ: snapshot.posZ,
        velX: snapshot.velX,
        velY: snapshot.velY,
        velZ: snapshot.velZ
      };
    }
    const fallbackX = Number.isFinite(cube.position.x) ? cube.position.x : 0;
    const fallbackY = Number.isFinite(cube.position.z) ? cube.position.z : 0;
    const fallbackZ = Number.isFinite(cube.position.y) ? cube.position.y - 0.5 : 0;
    return {
      posX: fallbackX,
      posY: fallbackY,
      posZ: fallbackZ,
      velX: 0,
      velY: 0,
      velZ: 0
    };
  };
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
  const getAbilityCooldowns = () => prediction.getAbilityCooldowns();

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

  const wrapAngle = (value: number) => {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const twoPi = Math.PI * 2;
    let wrapped = (value + Math.PI) % twoPi;
    if (wrapped < 0) {
      wrapped += twoPi;
    }
    return wrapped - Math.PI;
  };

  const applyLookDelta = (deltaX: number, deltaY: number) => {
    const safeX = Number.isFinite(deltaX) ? deltaX : 0;
    const safeY = Number.isFinite(deltaY) ? deltaY : 0;
    lookYaw = wrapAngle(lookYaw + safeX * lookSensitivity);
    lookPitch -= safeY * lookSensitivity;
    lookPitch = Math.max(-DEFAULTS.maxPitch, Math.min(DEFAULTS.maxPitch, lookPitch));
    camera.rotation.y = -lookYaw;
    camera.rotation.x = -lookPitch;
  };

  const getLookAngles = () => ({
    yaw: Number.isFinite(lookYaw) ? lookYaw : 0,
    pitch: Number.isFinite(lookPitch) ? lookPitch : 0
  });

  const getPlayerPose = () => ({ ...lastPlayerPose });

  const setLookSensitivity = (value: number) => {
    if (Number.isFinite(value) && value > 0) {
      lookSensitivity = value;
    }
  };

  const renderFrame = (deltaSeconds: number, nowMs?: number) => {
    const now = nowMs ?? performance.now();
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
    const pose = resolvePlayerPose(now);
    if (pose) {
      lastPlayerPose = pose;
      const height = pose.posZ ?? 0;
      cube.position.set(pose.posX, 0.5 + height, pose.posY);
      camera.position.set(pose.posX, DEFAULTS.cameraHeight + height, pose.posY);
    }
    beforeRenderHook?.(safeDelta, now);
    refreshOutlineFlash(now);
    if (composer) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  };

  const resize = (nextWidth: number, nextHeight: number, nextDpr: number) => {
    state.dimensions = { width: nextWidth, height: nextHeight, dpr: nextDpr };
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(nextDpr);
    renderer.setSize(nextWidth, nextHeight);
    composer?.setSize?.(nextWidth, nextHeight);
    outlinePasses.forEach((pass) => pass.setSize?.(nextWidth, nextHeight));
  };

  const dispose = () => {
    if (weaponViewmodelRoot && weaponViewmodelParent?.remove) {
      weaponViewmodelParent.remove(weaponViewmodelRoot);
    }
    renderer.dispose?.();
  };

  return {
    state,
    renderFrame,
    resize,
    setBeforeRender,
    getPlayerPose,
    ingestSnapshot,
    setSnapshotRate,
    recordInput,
    spawnProjectileVfx,
    removeProjectileVfx,
    getWeaponCooldown,
    getAbilityCooldowns,
    setWeaponViewmodel,
    setTickRate,
    setPredictionSim,
    applyLookDelta,
    getLookAngles,
    setLookSensitivity,
    setLocalProxyVisible,
    setOutlineTeam,
    triggerOutlineFlash,
    dispose
  };
};
