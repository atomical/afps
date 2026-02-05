import type { App, AppDimensions, AppState, NetworkSnapshot, Object3DLike, ThreeLike } from './types';
import type { InputCmd } from './net/input_cmd';
import { ClientPrediction, type PredictionSim } from './net/prediction';
import { SnapshotBuffer } from './net/snapshot_buffer';
import { loadRetroUrbanMap } from './environment/retro_urban_map';
import { attachWeaponViewmodel, loadWeaponViewmodel } from './environment/weapon_viewmodel';
import { WEAPON_DEFS } from './weapons/config';
import { generateDecalTexture, generateImpactTexture, generateMuzzleFlashTexture, hashString } from './rendering/procedural_textures';

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
  muzzleFlashSize: 0.34,
  muzzleFlashTtl: 0.06,
  impactSize: 0.32,
  impactTtl: 0.12,
  decalSize: 0.26,
  decalTtlMin: 6,
  decalTtlMax: 12,
  maxTracers: 36,
  maxMuzzleFlashes: 28,
  maxImpacts: 30,
  maxDecals: 90,
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
  viewmodelOutlineStrength: 2.6,
  viewmodelOutlineThickness: 1.4,
  viewmodelOutlineColor: 0x0f0f0f,
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

type TimedMeshVfx = {
  mesh: AppState['cube'];
  ttl: number;
  seed: number;
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
  camera.rotation.order = 'YXZ';

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
  const viewmodelOutlineColor = new three.Color(DEFAULTS.viewmodelOutlineColor);
  const outlineTeamCount = Math.max(1, outlineTeamVisibleColors.length);
  let outlineTeamIndex = 0;
  let outlineFlashUntil = 0;
  let outlineFlashTeamIndex = 0;
  let outlineFlashActive = false;
  let viewmodelOutlinePass: ReturnType<NonNullable<typeof three.OutlinePass>> | null = null;

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

  const getOutlineTeamColor = (colors: typeof outlineTeamVisibleColors, index: number) => colors[index];

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

  const applyViewmodelOutline = (pass: ReturnType<NonNullable<typeof three.OutlinePass>>) => {
    pass.edgeStrength = DEFAULTS.viewmodelOutlineStrength;
    pass.edgeThickness = DEFAULTS.viewmodelOutlineThickness;
    pass.edgeGlow = DEFAULTS.outlineGlow;
    pass.visibleEdgeColor = viewmodelOutlineColor;
    pass.hiddenEdgeColor = viewmodelOutlineColor;
  };

  const refreshOutlineSelection = () => {
    const cubeSelection = cube.visible === false ? [] : [cube];
    outlinePasses.forEach((pass, index) => {
      pass.selectedObjects = index === outlineTeamIndex ? cubeSelection : [];
    });
  };

  const refreshViewmodelOutline = () => {
    if (!viewmodelOutlinePass) {
      return;
    }
    viewmodelOutlinePass.selectedObjects = weaponViewmodelRoot ? [weaponViewmodelRoot] : [];
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
    applyOutlineBase(pass, outlineFlashTeamIndex);
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
      applyOutlineBase(pass, outlineFlashTeamIndex);
      outlineFlashActive = false;
    }
    outlineTeamIndex = next;
    refreshOutlineSelection();
  };

  const setLocalProxyVisible = (visible: boolean) => {
    const next = visible !== false;
    cube.visible = next;
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
    const rawDuration = options?.durationMs;
    const durationMs =
      Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : DEFAULTS.outlineFlashDurationMs;
    const team = clampOutlineTeam(options?.team ?? outlineTeamIndex);
    const flashStrength = options?.killed ? DEFAULTS.outlineFlashStrength * 1.2 : DEFAULTS.outlineFlashStrength;
    const flashThickness = options?.killed ? DEFAULTS.outlineFlashThickness * 1.1 : DEFAULTS.outlineFlashThickness;

    outlineFlashTeamIndex = team;
    outlineFlashUntil = now + durationMs;
    outlineFlashActive = true;
    const pass = outlinePasses[team];
    applyOutlineFlash(pass, flashStrength, flashThickness);
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
    const viewPass = new three.OutlinePass(new three.Vector2(width, height), scene, camera);
    viewPass.selectedObjects = [];
    viewPass.edgeGlow = DEFAULTS.outlineGlow;
    viewPass.downSampleRatio = DEFAULTS.outlineDownSampleRatio;
    viewPass.pulsePeriod = 0;
    applyViewmodelOutline(viewPass);
    viewmodelOutlinePass = viewPass;
    composer.addPass(viewPass);
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
  const tracerGeometry = new three.BoxGeometry(DEFAULTS.tracerThickness, DEFAULTS.tracerThickness, 1);
  const projectiles: ProjectileVfx[] = [];
  const projectileIndex = new Map<number, ProjectileVfx>();
  const tracers: TracerVfx[] = [];
  const freeTracers: TracerVfx[] = [];
  const muzzleFlashes: TimedMeshVfx[] = [];
  const freeMuzzleFlashes: TimedMeshVfx[] = [];
  const impacts: TimedMeshVfx[] = [];
  const freeImpacts: TimedMeshVfx[] = [];
  const decals: TimedMeshVfx[] = [];
  const freeDecals: TimedMeshVfx[] = [];
  const fireCooldowns = new Map<number, number>();

  const createRandom = (seed: number) => {
    let state = seed >>> 0;
    return () => {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const lerp = (min: number, max: number, t: number) => min + (max - min) * t;

  const makeDataTexture = (pixels: { data: Uint8Array; width: number; height: number }) => {
    const texture = new three.DataTexture(pixels.data, pixels.width, pixels.height);
    texture.minFilter = three.NearestFilter;
    texture.magFilter = three.NearestFilter;
    texture.generateMipmaps = false;
    (texture as unknown as { colorSpace?: unknown }).colorSpace = three.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  };

  const makeDecalMaterial = (color: number, map?: unknown) => {
    const BasicCtor = (three as unknown as { MeshBasicMaterial?: new (params: { color: number }) => unknown })
      .MeshBasicMaterial;
    const material = BasicCtor ? new BasicCtor({ color }) : new three.MeshToonMaterial({ color, gradientMap: toonRamp });
    (material as unknown as { map?: unknown }).map = map;
    (material as unknown as { transparent?: boolean }).transparent = true;
    (material as unknown as { depthWrite?: boolean }).depthWrite = false;
    (material as unknown as { depthTest?: boolean }).depthTest = true;
    (material as unknown as { opacity?: number }).opacity = 0.95;
    (material as unknown as { polygonOffset?: boolean }).polygonOffset = true;
    (material as unknown as { polygonOffsetFactor?: number }).polygonOffsetFactor = -1;
    (material as unknown as { polygonOffsetUnits?: number }).polygonOffsetUnits = -1;
    const DoubleSide = (three as unknown as { DoubleSide?: unknown }).DoubleSide;
    if (DoubleSide !== undefined) {
      (material as unknown as { side?: unknown }).side = DoubleSide;
    }
    return material;
  };

  const muzzleFlashTextures = [
    makeDataTexture(generateMuzzleFlashTexture({ seed: 0xabc001 })),
    makeDataTexture(generateMuzzleFlashTexture({ seed: 0xabc002 })),
    makeDataTexture(generateMuzzleFlashTexture({ seed: 0xabc003 })),
    makeDataTexture(generateMuzzleFlashTexture({ seed: 0xabc004 }))
  ];
  const impactTextures = [
    makeDataTexture(generateImpactTexture({ seed: 0x110001 })),
    makeDataTexture(generateImpactTexture({ seed: 0x110002 }))
  ];
  const decalTextures = {
    bullet: [
      makeDataTexture(generateDecalTexture('bullet', { seed: 0x220001 })),
      makeDataTexture(generateDecalTexture('bullet', { seed: 0x220002 }))
    ],
    scorch: [
      makeDataTexture(generateDecalTexture('scorch', { seed: 0x230001 })),
      makeDataTexture(generateDecalTexture('scorch', { seed: 0x230002 }))
    ],
    dust: [
      makeDataTexture(generateDecalTexture('dust', { seed: 0x240001 })),
      makeDataTexture(generateDecalTexture('dust', { seed: 0x240002 }))
    ],
    energy: [
      makeDataTexture(generateDecalTexture('energy', { seed: 0x250001 })),
      makeDataTexture(generateDecalTexture('energy', { seed: 0x250002 }))
    ]
  };

  const makeVfxMaterial = (color: number, map?: unknown) => {
    const BasicCtor = (three as unknown as { MeshBasicMaterial?: new (params: { color: number }) => unknown })
      .MeshBasicMaterial;
    const material = BasicCtor ? new BasicCtor({ color }) : new three.MeshToonMaterial({ color, gradientMap: toonRamp });
    (material as unknown as { map?: unknown }).map = map;
    (material as unknown as { transparent?: boolean }).transparent = true;
    (material as unknown as { depthWrite?: boolean }).depthWrite = false;
    (material as unknown as { depthTest?: boolean }).depthTest = true;
    (material as unknown as { opacity?: number }).opacity = 1;
    const blending = (three as unknown as { AdditiveBlending?: unknown }).AdditiveBlending;
    if (blending !== undefined) {
      (material as unknown as { blending?: unknown }).blending = blending;
    }
    const DoubleSide = (three as unknown as { DoubleSide?: unknown }).DoubleSide;
    if (DoubleSide !== undefined) {
      (material as unknown as { side?: unknown }).side = DoubleSide;
    }
    return material;
  };

  const muzzleFlashMaterials = muzzleFlashTextures.map((texture) => makeVfxMaterial(0xffffff, texture));
  const impactMaterialsBySurface = {
    stone: impactTextures.map((texture) => makeVfxMaterial(0xffffff, texture)),
    metal: impactTextures.map((texture) => makeVfxMaterial(0xffd27d, texture)),
    dirt: impactTextures.map((texture) => makeVfxMaterial(0xd2a776, texture)),
    energy: impactTextures.map((texture) => makeVfxMaterial(0x6bd6ff, texture))
  };
  const decalMaterialsByKind = {
    bullet: decalTextures.bullet.map((texture) => makeDecalMaterial(0xffffff, texture)),
    scorch: decalTextures.scorch.map((texture) => makeDecalMaterial(0xffffff, texture)),
    dust: decalTextures.dust.map((texture) => makeDecalMaterial(0xffffff, texture)),
    energy: decalTextures.energy.map((texture) => makeDecalMaterial(0xffffff, texture))
  };

  const muzzleFlashGeometry = new three.PlaneGeometry(1, 1);
  const impactGeometry = new three.PlaneGeometry(1, 1);
  const decalGeometry = new three.PlaneGeometry(1, 1);

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
    mesh.visible = false;
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
      refreshViewmodelOutline();
    });
  };

  refreshViewmodelOutline();

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
  let lastRenderTick: number | null = null;
  let lastPlayerPose = {
    posX: cube.position.x,
    posY: cube.position.z,
    posZ: cube.position.y - 0.5,
    velX: 0,
    velY: 0,
    velZ: 0
  };
  const resolvePlayerPose = (nowMs: number) => {
    const timeline = snapshotBuffer.sampleWithRenderTick(nowMs);
    if (timeline) {
      lastRenderTick = timeline.renderTick;
    }
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
    const snapshot = timeline?.snapshot ?? null;
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

  const normalizeDirection = (dir: { x: number; y: number; z: number }) => {
    const x = Number.isFinite(dir.x) ? dir.x : 0;
    const y = Number.isFinite(dir.y) ? dir.y : 0;
    const z = Number.isFinite(dir.z) ? dir.z : -1;
    const len = Math.hypot(x, y, z);
    if (!Number.isFinite(len) || len <= 1e-6) {
      return { x: 0, y: 0, z: -1 };
    }
    return { x: x / len, y: y / len, z: z / len };
  };

  const directionToAngles = (dir: { x: number; y: number; z: number }) => {
    const safe = normalizeDirection(dir);
    const yaw = Math.atan2(safe.x, -safe.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, safe.y)));
    return { yaw, pitch };
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
    const needsAdd = freeTracers.length > 0 || tracers.length < DEFAULTS.maxTracers;
    const tracer =
      freeTracers.pop() ??
      (tracers.length < DEFAULTS.maxTracers
        ? { mesh: new three.Mesh(tracerGeometry, tracerMaterial), ttl: 0 }
        : tracers.shift()!);
    const mesh = tracer.mesh;
    if (needsAdd) {
      scene.add(mesh);
    }
    mesh.rotation.y = yaw;
    mesh.rotation.x = pitch;
    mesh.scale.set(1, 1, safeLength);
    mesh.position.set(
      origin.x + dir.x * safeLength * 0.5,
      origin.y + dir.y * safeLength * 0.5,
      origin.z + dir.z * safeLength * 0.5
    );
    tracer.ttl = DEFAULTS.tracerTtl;
    tracers.push(tracer);
  };

  const resolveSurfaceKey = (surfaceType: number): keyof typeof impactMaterialsBySurface => {
    switch (surfaceType) {
      case 1:
        return 'metal';
      case 2:
        return 'dirt';
      case 3:
        return 'energy';
      case 0:
      default:
        return 'stone';
    }
  };

  const resolveDecalKind = (surfaceType: number): keyof typeof decalMaterialsByKind => {
    switch (surfaceType) {
      case 2:
        return 'dust';
      case 3:
        return 'energy';
      case 0:
      case 1:
      default:
        return 'bullet';
    }
  };

  const spawnMuzzleFlashVfx = (payload: {
    position: { x: number; y: number; z: number };
    dir: { x: number; y: number; z: number };
    seed: number;
    size?: number;
    ttl?: number;
  }) => {
    const position = payload.position;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
      return;
    }
    const safeDir = normalizeDirection(payload.dir);
    const seed = Number.isFinite(payload.seed) ? (payload.seed >>> 0) : 0;
    const rand = createRandom(seed);
    const size = Number.isFinite(payload.size) && payload.size > 0 ? (payload.size as number) : DEFAULTS.muzzleFlashSize;
    const ttl = Number.isFinite(payload.ttl) && payload.ttl > 0 ? (payload.ttl as number) : DEFAULTS.muzzleFlashTtl;
    const materialIndex = Math.floor(rand() * muzzleFlashMaterials.length) % muzzleFlashMaterials.length;
    const needsAdd = freeMuzzleFlashes.length > 0 || muzzleFlashes.length < DEFAULTS.maxMuzzleFlashes;
    const vfx =
      freeMuzzleFlashes.pop() ??
      (muzzleFlashes.length < DEFAULTS.maxMuzzleFlashes
        ? { mesh: new three.Mesh(muzzleFlashGeometry, muzzleFlashMaterials[materialIndex] as unknown as never), ttl: 0, seed }
        : muzzleFlashes.shift()!);
    const mesh = vfx.mesh;
    (mesh as unknown as { material?: unknown }).material = muzzleFlashMaterials[materialIndex] as unknown;
    if (mesh.scale) {
      const jitter = 0.85 + rand() * 0.3;
      mesh.scale.set(size * jitter, size * jitter, 1);
    }
    const angles = directionToAngles({ x: -safeDir.x, y: -safeDir.y, z: -safeDir.z });
    mesh.rotation.y = angles.yaw;
    mesh.rotation.x = angles.pitch;
    mesh.rotation.z = rand() * Math.PI * 2;
    const forwardOffset = 0.05 + 0.05 * rand();
    mesh.position.set(position.x + safeDir.x * forwardOffset, position.y + safeDir.y * forwardOffset, position.z + safeDir.z * forwardOffset);
    if (needsAdd) {
      scene.add(mesh);
    }
    vfx.ttl = ttl;
    vfx.seed = seed;
    muzzleFlashes.push(vfx);
  };

  const spawnImpactVfx = (payload: {
    position: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    surfaceType: number;
    seed: number;
    size?: number;
    ttl?: number;
  }) => {
    const position = payload.position;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
      return;
    }
    const safeNormal = normalizeDirection(payload.normal);
    const surfaceKey = resolveSurfaceKey(payload.surfaceType);
    const materials = impactMaterialsBySurface[surfaceKey];
    const seed = Number.isFinite(payload.seed) ? (payload.seed >>> 0) : 0;
    const rand = createRandom(seed);
    const size = Number.isFinite(payload.size) && payload.size > 0 ? (payload.size as number) : DEFAULTS.impactSize;
    const ttl = Number.isFinite(payload.ttl) && payload.ttl > 0 ? (payload.ttl as number) : DEFAULTS.impactTtl;
    const materialIndex = Math.floor(rand() * materials.length) % materials.length;
    const needsAdd = freeImpacts.length > 0 || impacts.length < DEFAULTS.maxImpacts;
    const vfx =
      freeImpacts.pop() ??
      (impacts.length < DEFAULTS.maxImpacts
        ? { mesh: new three.Mesh(impactGeometry, materials[materialIndex] as unknown as never), ttl: 0, seed }
        : impacts.shift()!);
    const mesh = vfx.mesh;
    (mesh as unknown as { material?: unknown }).material = materials[materialIndex] as unknown;
    if (mesh.scale) {
      const jitter = 0.8 + rand() * 0.4;
      mesh.scale.set(size * jitter, size * jitter, 1);
    }
    const angles = directionToAngles({ x: -safeNormal.x, y: -safeNormal.y, z: -safeNormal.z });
    mesh.rotation.y = angles.yaw;
    mesh.rotation.x = angles.pitch;
    mesh.rotation.z = rand() * Math.PI * 2;
    const offset = 0.02;
    mesh.position.set(
      position.x + safeNormal.x * offset,
      position.y + safeNormal.y * offset,
      position.z + safeNormal.z * offset
    );
    if (needsAdd) {
      scene.add(mesh);
    }
    vfx.ttl = ttl;
    vfx.seed = seed;
    impacts.push(vfx);
  };

  const spawnDecalVfx = (payload: {
    position: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    surfaceType: number;
    seed: number;
    size?: number;
    ttl?: number;
  }) => {
    const position = payload.position;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
      return;
    }
    const safeNormal = normalizeDirection(payload.normal);
    const kind = resolveDecalKind(payload.surfaceType);
    const materials = decalMaterialsByKind[kind];
    const seed = Number.isFinite(payload.seed) ? (payload.seed >>> 0) : 0;
    const rand = createRandom(seed ^ hashString(kind));
    const size = Number.isFinite(payload.size) && payload.size > 0 ? (payload.size as number) : DEFAULTS.decalSize;
    const ttl =
      Number.isFinite(payload.ttl) && payload.ttl > 0
        ? (payload.ttl as number)
        : lerp(DEFAULTS.decalTtlMin, DEFAULTS.decalTtlMax, rand());
    const materialIndex = Math.floor(rand() * materials.length) % materials.length;
    const needsAdd = freeDecals.length > 0 || decals.length < DEFAULTS.maxDecals;
    const vfx =
      freeDecals.pop() ??
      (decals.length < DEFAULTS.maxDecals
        ? { mesh: new three.Mesh(decalGeometry, materials[materialIndex] as unknown as never), ttl: 0, seed }
        : decals.shift()!);
    const mesh = vfx.mesh;
    (mesh as unknown as { material?: unknown }).material = materials[materialIndex] as unknown;
    if (mesh.scale) {
      const jitter = 0.9 + rand() * 0.25;
      mesh.scale.set(size * jitter, size * jitter, 1);
    }
    const angles = directionToAngles({ x: -safeNormal.x, y: -safeNormal.y, z: -safeNormal.z });
    mesh.rotation.y = angles.yaw;
    mesh.rotation.x = angles.pitch;
    mesh.rotation.z = rand() * Math.PI * 2;
    const offset = 0.01;
    mesh.position.set(
      position.x + safeNormal.x * offset,
      position.y + safeNormal.y * offset,
      position.z + safeNormal.z * offset
    );
    if (needsAdd) {
      scene.add(mesh);
    }
    vfx.ttl = ttl;
    vfx.seed = seed;
    decals.push(vfx);
  };

  const getFxPoolStats = () => ({
    tracers: { active: tracers.length, free: freeTracers.length, max: DEFAULTS.maxTracers },
    muzzleFlashes: { active: muzzleFlashes.length, free: freeMuzzleFlashes.length, max: DEFAULTS.maxMuzzleFlashes },
    impacts: { active: impacts.length, free: freeImpacts.length, max: DEFAULTS.maxImpacts },
    decals: { active: decals.length, free: freeDecals.length, max: DEFAULTS.maxDecals }
  });

  const ingestSnapshot = (snapshot: NetworkSnapshot, nowMs: number) => {
    snapshotBuffer.push(snapshot, nowMs);
    prediction.reconcile(snapshot);
  };

  const setSnapshotRate = (snapshotRate: number) => {
    snapshotBuffer.setSnapshotRate(snapshotRate);
  };

  const recordInput = (cmd: InputCmd) => {
    prediction.recordInput(cmd);
  };

  const recordWeaponFired = (slot: number, cooldownSeconds: number) => {
    if (!Number.isFinite(cooldownSeconds) || cooldownSeconds <= 0) {
      return;
    }
    const safeSlot = clampWeaponSlot(slot);
    const current = fireCooldowns.get(safeSlot) ?? 0;
    fireCooldowns.set(safeSlot, Math.max(current, cooldownSeconds));
  };

  const getWeaponCooldown = (slot: number) => fireCooldowns.get(clampWeaponSlot(slot)) ?? 0;
  const getAbilityCooldowns = () => prediction.getAbilityCooldowns();

  const spawnProjectileVfx = (payload: {
    origin: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    ttl?: number;
    projectileId?: number;
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
    projectiles.splice(projectiles.indexOf(projectile), 1);
  };

  const spawnTracerVfx = (payload: {
    origin: { x: number; y: number; z: number };
    dir: { x: number; y: number; z: number };
    length?: number;
  }) => {
    if (
      !Number.isFinite(payload.origin.x) ||
      !Number.isFinite(payload.origin.y) ||
      !Number.isFinite(payload.origin.z)
    ) {
      return;
    }
    const safeDir = {
      x: Number.isFinite(payload.dir.x) ? payload.dir.x : 0,
      y: Number.isFinite(payload.dir.y) ? payload.dir.y : 0,
      z: Number.isFinite(payload.dir.z) ? payload.dir.z : -1
    };
    const angles = directionToAngles(safeDir);
    spawnTracer(payload.origin, safeDir, angles.yaw, angles.pitch, payload.length ?? DEFAULTS.tracerLength);
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
    lookPitch += safeY * lookSensitivity;
    lookPitch = Math.max(-DEFAULTS.maxPitch, Math.min(DEFAULTS.maxPitch, lookPitch));
    camera.rotation.y = -lookYaw;
    camera.rotation.x = -lookPitch;
  };

  const getLookAngles = () => ({
    yaw: lookYaw,
    pitch: lookPitch
  });

  const getPlayerPose = () => ({ ...lastPlayerPose });
  const getRenderTick = () => lastRenderTick;

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
          freeTracers.push(tracer);
          tracers.splice(i, 1);
        }
      }
    }
    if (muzzleFlashes.length > 0 && safeDelta > 0) {
      for (let i = muzzleFlashes.length - 1; i >= 0; i -= 1) {
        const vfx = muzzleFlashes[i];
        vfx.ttl -= safeDelta;
        if (vfx.ttl <= 0) {
          scene.remove?.(vfx.mesh);
          freeMuzzleFlashes.push(vfx);
          muzzleFlashes.splice(i, 1);
        }
      }
    }
    if (impacts.length > 0 && safeDelta > 0) {
      for (let i = impacts.length - 1; i >= 0; i -= 1) {
        const vfx = impacts[i];
        vfx.ttl -= safeDelta;
        if (vfx.ttl <= 0) {
          scene.remove?.(vfx.mesh);
          freeImpacts.push(vfx);
          impacts.splice(i, 1);
        }
      }
    }
    if (decals.length > 0 && safeDelta > 0) {
      for (let i = decals.length - 1; i >= 0; i -= 1) {
        const vfx = decals[i];
        vfx.ttl -= safeDelta;
        if (vfx.ttl <= 0) {
          scene.remove?.(vfx.mesh);
          freeDecals.push(vfx);
          decals.splice(i, 1);
        }
      }
    }
    state.cubeRotation += safeDelta * state.rotationSpeed;
    cube.rotation.x = state.cubeRotation;
    cube.rotation.y = state.cubeRotation * 0.8;
    const pose = resolvePlayerPose(now);
    lastPlayerPose = pose;
    const height = pose.posZ ?? 0;
    cube.position.set(pose.posX, 0.5 + height, pose.posY);
    camera.position.set(pose.posX, DEFAULTS.cameraHeight + height, pose.posY);
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
    viewmodelOutlinePass?.setSize?.(nextWidth, nextHeight);
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
    recordWeaponFired,
    spawnProjectileVfx,
    removeProjectileVfx,
    spawnTracerVfx,
    spawnMuzzleFlashVfx,
    spawnImpactVfx,
    spawnDecalVfx,
    getFxPoolStats,
    getWeaponCooldown,
    getAbilityCooldowns,
    getRenderTick,
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
