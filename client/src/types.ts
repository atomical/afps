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
}

export interface Object3DLike {
  position: Vector3Like;
  rotation: EulerLike;
  add?: (child: Object3DLike) => void;
}

export interface ColorLike {
  value?: number;
}

export interface SceneLike extends Object3DLike {
  add: (child: Object3DLike) => void;
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
}

export interface GeometryLike {
  readonly type?: string;
}

export interface MaterialLike {
  readonly type?: string;
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
  MeshStandardMaterial: new (params: { color: number }) => MaterialLike;
  Mesh: new (geometry: GeometryLike, material: MaterialLike) => MeshLike;
  Color: new (hex: number) => ColorLike;
  DirectionalLight: new (color: number, intensity: number) => LightLike;
  AmbientLight: new (color: number, intensity: number) => LightLike;
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
  dashCooldown: number;
  clientId?: string;
}

export interface App {
  state: AppState;
  renderFrame: (deltaSeconds: number, nowMs?: number) => void;
  resize: (width: number, height: number, dpr: number) => void;
  ingestSnapshot: (snapshot: NetworkSnapshot, nowMs: number) => void;
  setSnapshotRate: (snapshotRate: number) => void;
  recordInput: (cmd: {
    inputSeq: number;
    moveX: number;
    moveY: number;
    lookDeltaX: number;
    lookDeltaY: number;
    jump: boolean;
    fire: boolean;
    sprint: boolean;
    dash: boolean;
  }) => void;
  setTickRate: (tickRate: number) => void;
  setPredictionSim: (sim: PredictionSim) => void;
  applyLookDelta: (deltaX: number, deltaY: number) => void;
  setLookSensitivity: (value: number) => void;
  dispose: () => void;
}
