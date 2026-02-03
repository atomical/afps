import type { PredictionSim } from './net/prediction';

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
  set: (x: number, y: number, z: number) => void;
}

export interface EulerLike {
  x: number;
  y: number;
  z: number;
  order?: string;
}

export interface Vector2Like {
  x: number;
  y: number;
  set: (x: number, y: number) => void;
}

export interface Object3DLike {
  position: Vector3Like;
  rotation: EulerLike;
  scale?: Vector3Like;
  visible?: boolean;
  name?: string;
  children?: Object3DLike[];
  traverse?: (callback: (child: Object3DLike) => void) => void;
  add?: (child: Object3DLike) => void;
  remove?: (child: Object3DLike) => void;
}

export interface ColorLike {
  value?: number;
}

export interface SceneLike extends Object3DLike {
  add: (child: Object3DLike) => void;
  remove?: (child: Object3DLike) => void;
  background?: ColorLike | null;
}

export interface CameraLike extends Object3DLike {
  aspect: number;
  updateProjectionMatrix: () => void;
}

export interface RendererLike {
  setSize: (width: number, height: number) => void;
  setPixelRatio: (ratio: number) => void;
  render: (scene: SceneLike, camera: CameraLike) => void;
  dispose?: () => void;
  outputColorSpace?: unknown;
  toneMapping?: unknown;
}

export interface GeometryLike {
  readonly type?: string;
}

export interface MaterialLike {
  readonly type?: string;
}

export interface DataTextureLike {
  minFilter?: unknown;
  magFilter?: unknown;
  generateMipmaps?: boolean;
  needsUpdate?: boolean;
}

export interface EffectComposerLike {
  addPass: (pass: unknown) => void;
  render: () => void;
  setSize?: (width: number, height: number) => void;
}

export interface OutlinePassLike {
  selectedObjects: Object3DLike[];
  edgeStrength?: number;
  edgeThickness?: number;
  edgeGlow?: number;
  pulsePeriod?: number;
  downSampleRatio?: number;
  visibleEdgeColor?: ColorLike;
  hiddenEdgeColor?: ColorLike;
  setSize?: (width: number, height: number) => void;
}

export interface MeshLike extends Object3DLike {
  geometry?: GeometryLike;
  material?: MaterialLike;
}

export interface LightLike extends Object3DLike {
  intensity?: number;
}

export interface ThreeLike {
  Scene: new () => SceneLike;
  PerspectiveCamera: new (fov: number, aspect: number, near: number, far: number) => CameraLike;
  WebGLRenderer: new (options: { canvas: HTMLCanvasElement; antialias: boolean }) => RendererLike;
  BoxGeometry: new (width: number, height: number, depth: number) => GeometryLike;
  PlaneGeometry: new (width: number, height: number) => GeometryLike;
  MeshStandardMaterial: new (params: { color: number }) => MaterialLike;
  MeshToonMaterial: new (params: { color: number; gradientMap?: DataTextureLike }) => MaterialLike;
  Mesh: new (geometry: GeometryLike, material: MaterialLike) => MeshLike;
  TextureLoader?: new () => { load: (url: string, onLoad: (texture: DataTextureLike) => void, onProgress?: unknown, onError?: (error: unknown) => void) => void };
  AnimationMixer?: new (root: Object3DLike) => unknown;
  CanvasTexture?: new (canvas: HTMLCanvasElement) => DataTextureLike;
  SpriteMaterial?: new (params: {
    map?: DataTextureLike;
    transparent?: boolean;
    depthTest?: boolean;
    depthWrite?: boolean;
  }) => MaterialLike;
  Sprite?: new (material: MaterialLike) => Object3DLike;
  Color: new (hex: number) => ColorLike;
  DirectionalLight: new (color: number, intensity: number) => LightLike;
  AmbientLight: new (color: number, intensity: number) => LightLike;
  DataTexture: new (data: Uint8Array, width: number, height: number) => DataTextureLike;
  NearestFilter: unknown;
  SRGBColorSpace: unknown;
  NoToneMapping: unknown;
  Vector2?: new (x: number, y: number) => Vector2Like;
  EffectComposer?: new (renderer: RendererLike) => EffectComposerLike;
  RenderPass?: new (scene: SceneLike, camera: CameraLike) => unknown;
  OutlinePass?: new (resolution: Vector2Like, scene: SceneLike, camera: CameraLike) => OutlinePassLike;
}

export interface AppDimensions {
  width: number;
  height: number;
  dpr: number;
}

export interface AppState {
  dimensions: AppDimensions;
  rotationSpeed: number;
  cubeRotation: number;
  scene: SceneLike;
  camera: CameraLike;
  renderer: RendererLike;
  cube: MeshLike;
}

export interface NetworkSnapshot {
  type: 'StateSnapshot';
  serverTick: number;
  lastProcessedInputSeq: number;
  posX: number;
  posY: number;
  posZ: number;
  velX: number;
  velY: number;
  velZ: number;
  weaponSlot: number;
  dashCooldown: number;
  health: number;
  kills: number;
  deaths: number;
  clientId?: string;
}

export interface AbilityCooldowns {
  dash: number;
  shockwave: number;
  shieldCooldown: number;
  shieldTimer: number;
  shieldActive: boolean;
}

export interface App {
  state: AppState;
  renderFrame: (deltaSeconds: number, nowMs?: number) => void;
  resize: (width: number, height: number, dpr: number) => void;
  setBeforeRender: (hook: ((deltaSeconds: number, nowMs: number) => void) | null) => void;
  getPlayerPose: () => {
    posX: number;
    posY: number;
    posZ: number;
    velX: number;
    velY: number;
    velZ: number;
  };
  ingestSnapshot: (snapshot: NetworkSnapshot, nowMs: number) => void;
  setSnapshotRate: (snapshotRate: number) => void;
  recordInput: (cmd: {
    inputSeq: number;
    moveX: number;
    moveY: number;
    lookDeltaX: number;
    lookDeltaY: number;
    viewYaw: number;
    viewPitch: number;
    weaponSlot: number;
    jump: boolean;
    fire: boolean;
    sprint: boolean;
    dash: boolean;
    grapple: boolean;
    shield: boolean;
    shockwave: boolean;
  }) => void;
  spawnProjectileVfx: (payload: {
    origin: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    ttl?: number;
    projectileId?: number;
  }) => void;
  removeProjectileVfx: (projectileId: number) => void;
  getWeaponCooldown: (slot: number) => number;
  getAbilityCooldowns: () => AbilityCooldowns;
  setWeaponViewmodel: (weaponId?: string) => void;
  setTickRate: (tickRate: number) => void;
  setPredictionSim: (sim: PredictionSim) => void;
  applyLookDelta: (deltaX: number, deltaY: number) => void;
  getLookAngles: () => { yaw: number; pitch: number };
  setLookSensitivity: (value: number) => void;
  setLocalProxyVisible: (visible: boolean) => void;
  setOutlineTeam: (team: number) => void;
  triggerOutlineFlash: (options?: {
    killed?: boolean;
    team?: number;
    nowMs?: number;
    durationMs?: number;
  }) => void;
  dispose: () => void;
}
