import type { App, AppDimensions, AppState, NetworkSnapshot, ThreeLike } from './types';
import type { InputCmd } from './net/input_cmd';
import { ClientPrediction, type PredictionSim } from './net/prediction';
import { SnapshotBuffer } from './net/snapshot_buffer';

export interface CreateAppOptions {
  three: ThreeLike;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  devicePixelRatio: number;
  lookSensitivity?: number;
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
  ambientIntensity: 0.4,
  keyLightIntensity: 0.9,
  snapshotRate: 20,
  tickRate: 60
};

export const createApp = ({
  three,
  canvas,
  width,
  height,
  devicePixelRatio,
  lookSensitivity: initialLookSensitivity
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

  const setLookSensitivity = (value: number) => {
    if (Number.isFinite(value) && value > 0) {
      lookSensitivity = value;
    }
  };

  const renderFrame = (deltaSeconds: number, nowMs?: number) => {
    const safeDelta = Math.max(0, deltaSeconds);
    state.cubeRotation += safeDelta * state.rotationSpeed;
    cube.rotation.x = state.cubeRotation;
    cube.rotation.y = state.cubeRotation * 0.8;
    let targetX: number | null = null;
    let targetY: number | null = null;
    if (prediction.isActive()) {
      const predicted = prediction.getState();
      targetX = predicted.x;
      targetY = predicted.y;
    } else {
      const snapshot = snapshotBuffer.sample(nowMs ?? performance.now());
      if (snapshot) {
        targetX = snapshot.posX;
        targetY = snapshot.posY;
      }
    }
    if (targetX !== null && targetY !== null) {
      cube.position.set(targetX, 0.5, targetY);
      camera.position.set(targetX, DEFAULTS.cameraHeight, targetY);
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
    setTickRate,
    setPredictionSim,
    applyLookDelta,
    setLookSensitivity,
    dispose
  };
};
