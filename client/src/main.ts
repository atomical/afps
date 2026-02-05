import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { startApp } from './bootstrap';
import { connectIfConfigured } from './net/runtime';
import {
  getLookSensitivity,
  getSignalingAuthToken,
  getSignalingUrl,
  getWasmSimParity,
  getWasmSimUrl
} from './net/env';
import { buildClientHello, buildPing, encodeFireWeaponRequest, encodeSetLoadoutRequest } from './net/protocol';
import type {
  GameEventBatch,
  PlayerProfile as NetPlayerProfile,
  PongMessage,
  StateSnapshot
} from './net/protocol';
import { createStatusOverlay } from './ui/status';
import { createInputSampler } from './input/sampler';
import { loadSensitivity, saveSensitivity } from './input/sensitivity';
import { createInputSender } from './net/input_sender';
import { createPointerLockController } from './input/pointer_lock';
import { createHudOverlay } from './ui/hud';
import { createHudStore } from './ui/hud_state';
import { createSettingsOverlay } from './ui/settings';
import { loadMetricsVisibility, saveMetricsVisibility } from './ui/metrics_settings';
import { createAudioManager } from './audio/manager';
import { loadAudioSettings, saveAudioSettings } from './audio/settings';
import { loadWasmSimFromUrl } from './sim/wasm';
import { createWasmPredictionSim } from './sim/wasm_adapter';
import { runWasmParityCheck } from './sim/parity';
import { WEAPON_CONFIG, WEAPON_DEFS } from './weapons/config';
import { LOADOUT_BITS, hasLoadoutBit, loadLoadoutBits, saveLoadoutBits } from './weapons/loadout';
import { exposeWeaponDebug } from './weapons/debug';
import { generateWeaponSfx } from './weapons/sfx';
import {
  formatWeaponValidationErrors,
  validateWeaponDefinitions,
  validateWeaponSounds
} from './weapons/validation';
import { createCasingPool } from './weapons/casing_pool';
import { loadCharacterCatalog } from './characters/catalog';
import { createPrejoinOverlay } from './ui/prejoin';
import type { LocalPlayerProfile } from './profile/types';
import { loadProfile, saveProfile } from './profile/storage';
import { createRemoteAvatarManager } from './players/remote_avatars';
import { decodeOct16, decodePitchQ, decodeUnitU16, decodeYawQ, dequantizeI16, dequantizeU16 } from './net/quantization';
import { GameEventQueue } from './net/event_queue';
import { loadFxSettings, saveFxSettings } from './rendering/fx_settings';
import type { WebRtcSession } from './net/types';

const three = {
  ...THREE,
  Object3D: THREE.Object3D,
  EffectComposer,
  RenderPass,
  OutlinePass,
  Vector2: THREE.Vector2
};

const BASE_URL = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const NORMALIZED_BASE = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
const AUDIO_ROOT = `${NORMALIZED_BASE}assets/audio/`;
const AUDIO_ASSETS = {
  impact: `${AUDIO_ROOT}impact.wav`,
  footstep: `${AUDIO_ROOT}footstep.wav`,
  uiClick: `${AUDIO_ROOT}ui_click.wav`
};
const ADS_BLEND_SPEED = 8;
const ADS_SENSITIVITY_MULTIPLIER = 0.55;
const ADS_FOV_MULTIPLIER = 0.78;
const ADS_OPTIC_FOV_MULTIPLIER = 0.68;
const RECOIL_RECOVERY_SPEED = 10;
const RECOIL_RECOVERY_MIN = 4;
const SERVER_STALE_TIMEOUT_MS = 4000;
const SERVER_STALE_POLL_INTERVAL_MS = 500;
const RECONNECT_DELAY_MS = 1000;

const createMemoryStorage = (): Storage => {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
    clear: () => {
      entries.clear();
    },
    key: (index) => Array.from(entries.keys())[index] ?? null,
    get length() {
      return entries.size;
    }
  };
};

const ensureStorage = (storage?: Storage) => {
  if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
    return storage;
  }
  const memoryStorage = createMemoryStorage();
  if (storage && typeof storage === 'object') {
    try {
      Object.assign(storage, memoryStorage);
    } catch {}
  }
  if (typeof window !== 'undefined') {
    try {
      Object.defineProperty(window, 'localStorage', { value: memoryStorage, configurable: true });
    } catch {}
  }
  return memoryStorage;
};

const localStorageRef =
  typeof window !== 'undefined' ? ensureStorage(window.localStorage) : ensureStorage(undefined);

const savedSensitivity = loadSensitivity(localStorageRef);
const lookSensitivity = savedSensitivity ?? getLookSensitivity();
const savedMetricsVisible = loadMetricsVisibility(localStorageRef);
let metricsVisible = savedMetricsVisible;
const savedAudioSettings = loadAudioSettings(localStorageRef);
const savedFxSettings = loadFxSettings(localStorageRef);
let fxSettings = savedFxSettings;
let localLoadoutBits = loadLoadoutBits(localStorageRef);
const audio = createAudioManager({ settings: savedAudioSettings });
void audio.preload({
  impact: AUDIO_ASSETS.impact,
  footstep: AUDIO_ASSETS.footstep,
  uiClick: AUDIO_ASSETS.uiClick
});
const isTestMode = (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test';
const shouldValidateWeapons = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV) && !isTestMode;
if (shouldValidateWeapons) {
  exposeWeaponDebug(
    typeof window !== 'undefined' ? (window as unknown as { afpsDebug?: Record<string, unknown> }) : null,
    WEAPON_CONFIG.weapons
  );
  const definitionErrors = validateWeaponDefinitions(WEAPON_CONFIG.weapons);
  if (definitionErrors.length > 0) {
    const message = formatWeaponValidationErrors(definitionErrors);
    console.error(message);
    throw new Error(message);
  }
}
generateWeaponSfx(audio, WEAPON_CONFIG.weapons);
if (shouldValidateWeapons) {
  const soundErrors = validateWeaponSounds(WEAPON_CONFIG.weapons, audio);
  if (soundErrors.length > 0) {
    const message = formatWeaponValidationErrors(soundErrors);
    console.error(message);
    throw new Error(message);
  }
}
const { app, canvas } = startApp({ three, document, window, lookSensitivity, loadEnvironment: true });
const baseFov = app.state.camera?.fov ?? 70;
const debugAudio = (import.meta.env?.VITE_DEBUG_AUDIO ?? '') === 'true';
if (debugAudio) {
  (window as unknown as { __afpsAudio?: unknown }).__afpsAudio = {
    play: (key: keyof typeof AUDIO_ASSETS) => audio.play(key, { group: 'sfx' }),
    preload: () =>
      audio.preload({
        impact: AUDIO_ASSETS.impact,
        footstep: AUDIO_ASSETS.footstep,
        uiClick: AUDIO_ASSETS.uiClick
      }),
    state: () => audio.state,
    settings: () => audio.getSettings()
  };
}
const remoteAvatars = createRemoteAvatarManager({ three, scene: app.state.scene });
remoteAvatars.setAimDebugEnabled(fxSettings.aimDebug);
const casingPool = createCasingPool({
  three,
  scene: app.state.scene,
  audio,
  impactSounds: ['casing:impact:1', 'casing:impact:2']
});
if (shouldValidateWeapons) {
  void casingPool.ready.then((ready) => {
    if (!ready) {
      const message = 'Weapon validation failed: casing model failed to load.';
      console.error(message);
      throw new Error(message);
    }
  });
} else {
  void casingPool.ready;
}
let remotePruneInterval: number | null = null;
let localConnectionId: string | null = null;
let localAvatarActive = false;
let lastLocalAvatarSample: { x: number; y: number; z: number; time: number } | null = null;
let gameEventQueue: GameEventQueue | null = null;
let processQueuedEventBatch: ((batch: GameEventBatch) => void) | null = null;
const debugLocalAvatar = (import.meta.env?.VITE_DEBUG_LOCAL_AVATAR ?? '') === 'true';
const createLocalAvatarDebug = (doc: Document) => {
  const panel = doc.createElement('div');
  panel.id = 'local-avatar-debug';
  panel.style.position = 'fixed';
  panel.style.right = '12px';
  panel.style.top = '12px';
  panel.style.padding = '10px 12px';
  panel.style.background = 'rgba(10, 14, 20, 0.75)';
  panel.style.border = '1px solid rgba(255, 255, 255, 0.15)';
  panel.style.borderRadius = '10px';
  panel.style.color = '#e4ecf8';
  panel.style.font = '12px/1.4 system-ui, sans-serif';
  panel.style.zIndex = '40';
  panel.style.whiteSpace = 'pre';
  panel.textContent = 'local avatar debug';
  panel.dataset.visible = 'false';
  panel.style.display = 'none';
  doc.body.appendChild(panel);
  const format = (value: number | null | undefined) =>
    Number.isFinite(value) ? value!.toFixed(2) : '--';
  return {
    set: (data: {
      camera?: { x: number; y: number; z: number } | null;
      cube?: { x: number; y: number; z: number } | null;
      pose?: { x: number; y: number; z: number } | null;
      avatar?: { x: number; y: number; z: number } | null;
      renderRoot?: { x: number; y: number; z: number } | null;
      boundsCenter?: { x: number; y: number; z: number } | null;
      centerDelta?: { x: number; y: number; z: number } | null;
      others?: string | null;
    }) => {
      panel.textContent =
        `camera  x:${format(data.camera?.x)} y:${format(data.camera?.y)} z:${format(data.camera?.z)}\n` +
        `cube    x:${format(data.cube?.x)} y:${format(data.cube?.y)} z:${format(data.cube?.z)}\n` +
        `pose    x:${format(data.pose?.x)} y:${format(data.pose?.y)} z:${format(data.pose?.z)}\n` +
        `avatar  x:${format(data.avatar?.x)} y:${format(data.avatar?.y)} z:${format(data.avatar?.z)}\n` +
        `render  x:${format(data.renderRoot?.x)} y:${format(data.renderRoot?.y)} z:${format(data.renderRoot?.z)}\n` +
        `bboxCtr x:${format(data.boundsCenter?.x)} y:${format(data.boundsCenter?.y)} z:${format(data.boundsCenter?.z)}\n` +
        `ctrDlt x:${format(data.centerDelta?.x)} y:${format(data.centerDelta?.y)} z:${format(data.centerDelta?.z)}\n` +
        `others  ${data.others ?? 'none'}`;
    },
    setVisible: (visible: boolean) => {
      panel.dataset.visible = visible ? 'true' : 'false';
      panel.style.display = visible ? 'block' : 'none';
    },
    dispose: () => panel.remove()
  };
};
const localAvatarDebug = debugLocalAvatar ? createLocalAvatarDebug(document) : null;
const updateLocalAvatar = (nowMs: number) => {
  if (!localAvatarActive || !localConnectionId) {
    return;
  }
  const pose = app.getPlayerPose();
  const cameraPos = app.state.camera?.position;
  const cubePos = app.state.cube?.position;
  const cameraX = Number.isFinite(cameraPos?.x) ? cameraPos!.x : null;
  const cameraY = Number.isFinite(cameraPos?.y) ? cameraPos!.y : null;
  const cameraZ = Number.isFinite(cameraPos?.z) ? cameraPos!.z : null;
  const cubeX = Number.isFinite(cubePos?.x) ? cubePos!.x : null;
  const cubeY = Number.isFinite(cubePos?.y) ? cubePos!.y : null;
  const cubeZ = Number.isFinite(cubePos?.z) ? cubePos!.z : null;
  const fallbackHeight = 1.6;
  let posX = Number.isFinite(pose.posX) ? pose.posX : 0;
  let posY = Number.isFinite(pose.posY) ? pose.posY : 0;
  let posZ = Number.isFinite(pose.posZ) ? pose.posZ : 0;
  if (cubeX !== null && cubeZ !== null) {
    posX = cubeX;
    posY = cubeZ;
    if (cubeY !== null) {
      posZ = cubeY - 0.5;
    }
  } else if (cameraX !== null && cameraZ !== null) {
    posX = cameraX;
    posY = cameraZ;
    if (cameraY !== null) {
      posZ = cameraY - fallbackHeight;
    }
  }
  let velX = Number.isFinite(pose.velX) ? pose.velX : 0;
  let velY = Number.isFinite(pose.velY) ? pose.velY : 0;
  let velZ = Number.isFinite(pose.velZ) ? pose.velZ : 0;
  if (lastLocalAvatarSample) {
    const dt = Math.max(0.001, (nowMs - lastLocalAvatarSample.time) / 1000);
    if (!Number.isFinite(velX)) {
      velX = (posX - lastLocalAvatarSample.x) / dt;
    }
    if (!Number.isFinite(velY)) {
      velY = (posY - lastLocalAvatarSample.y) / dt;
    }
    if (!Number.isFinite(velZ)) {
      velZ = (posZ - lastLocalAvatarSample.z) / dt;
    }
  }
  lastLocalAvatarSample = { x: posX, y: posY, z: posZ, time: nowMs };
  remoteAvatars.upsertSnapshot(
    {
      type: 'StateSnapshot',
      serverTick: 0,
      lastProcessedInputSeq: 0,
      posX,
      posY,
      posZ,
      velX,
      velY,
      velZ,
      weaponSlot: currentWeaponSlot,
      ammoInMag: WEAPON_DEFS[currentWeaponSlot]?.maxAmmoInMag ?? 0,
      dashCooldown: 0,
      health: 100,
      kills: 0,
      deaths: 0,
      clientId: localConnectionId
    },
    nowMs
  );
  if (localAvatarDebug) {
    const renderInfo = remoteAvatars.getDebugInfo(localConnectionId);
    const others = remoteAvatars
      .listAvatars()
      .filter((avatar) => avatar.id !== localConnectionId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((avatar) => {
        const pos = avatar.position;
        const x = pos ? pos.x.toFixed(1) : '--';
        const z = pos ? pos.z.toFixed(1) : '--';
        return `${avatar.id.slice(0, 6)}@${x},${z}`;
      })
      .join(' ');
    localAvatarDebug.set({
      camera: cameraPos ? { x: cameraPos.x, y: cameraPos.y, z: cameraPos.z } : null,
      cube: cubePos ? { x: cubePos.x, y: cubePos.y, z: cubePos.z } : null,
      pose: { x: pose.posX, y: pose.posY, z: pose.posZ },
      avatar: { x: posX, y: posY, z: posZ },
      renderRoot: renderInfo?.root ?? null,
      boundsCenter: renderInfo?.boundsCenter ?? null,
      centerDelta: renderInfo?.centerDelta ?? null,
      others: others.length > 0 ? others : 'none'
    });
  }
};
app.setBeforeRender((deltaSeconds, nowMs) => {
  updateLocalAvatar(nowMs);
  const safeDelta = Math.max(0, deltaSeconds);
  if (safeDelta > 0) {
    const blend = 1 - Math.exp(-ADS_BLEND_SPEED * safeDelta);
    adsBlend += (adsTarget - adsBlend) * blend;
    adsBlend = Math.max(0, Math.min(1, adsBlend));
    recoilRecovery = resolveRecoilRecovery(localLoadoutBits, adsBlend);
    const decay = Math.exp(-recoilRecovery * safeDelta);
    recoilPitch *= decay;
    recoilYaw *= decay;
    if (Math.abs(recoilPitch) < 1e-4) {
      recoilPitch = 0;
    }
    if (Math.abs(recoilYaw) < 1e-4) {
      recoilYaw = 0;
    }
  }
  const baseAngles = app.getLookAngles();
  const viewAngles = { yaw: baseAngles.yaw + recoilYaw, pitch: baseAngles.pitch + recoilPitch };
  const cameraRef = app.state.camera;
  if (cameraRef?.rotation) {
    cameraRef.rotation.y = -viewAngles.yaw;
    cameraRef.rotation.x = -viewAngles.pitch;
  }
  if (cameraRef && typeof cameraRef.fov === 'number') {
    const targetFov = baseFov * (1 - adsBlend * (1 - resolveAdsFovMultiplier(localLoadoutBits)));
    if (Math.abs(cameraRef.fov - targetFov) > 0.01) {
      cameraRef.fov = targetFov;
      cameraRef.updateProjectionMatrix();
    }
  }
  if (gameEventQueue && processQueuedEventBatch) {
    const due = gameEventQueue.drain(app.getRenderTick());
    for (const batch of due) {
      processQueuedEventBatch(batch);
    }
  }
  remoteAvatars.update(safeDelta);
  casingPool.update(safeDelta);
  const cameraPos = app.state.camera?.position;
  if (cameraPos) {
    const cosPitch = Math.cos(viewAngles.pitch);
    const forward = {
      x: Math.sin(viewAngles.yaw) * cosPitch,
      y: Math.sin(viewAngles.pitch),
      z: -Math.cos(viewAngles.yaw) * cosPitch
    };
    audio.setListenerPosition({ x: cameraPos.x, y: cameraPos.y, z: cameraPos.z }, forward);
  }
  const pose = app.getPlayerPose();
  const horizontalSpeed = Math.hypot(pose.velX, pose.velY);
  if (pose.posZ <= 0.05 && horizontalSpeed > 0.2) {
    if (lastFootstepPos) {
      const dx = pose.posX - lastFootstepPos.x;
      const dy = pose.posY - lastFootstepPos.y;
      footstepDistance += Math.hypot(dx, dy);
    }
    if (footstepDistance >= 1.6 && nowMs - lastFootstepAt > 180) {
      audio.play('footstep', { group: 'sfx', volume: 0.6 });
      footstepDistance = 0;
      lastFootstepAt = nowMs;
    }
    lastFootstepPos = { x: pose.posX, y: pose.posY };
  } else {
    lastFootstepPos = null;
    footstepDistance = 0;
  }
});
const status = createStatusOverlay(document);
status.setMetricsVisible(metricsVisible);
const hud = createHudOverlay(document);
const hudStore = createHudStore(hud);
const debugHud = (import.meta.env?.VITE_DEBUG_HUD ?? '') === 'true';
if (debugHud) {
  (window as unknown as { __afpsHud?: unknown }).__afpsHud = {
    dispatch: hudStore.dispatch,
    getState: hudStore.getState
  };
}
const resolveWeaponSlot = (slot: number) => {
  const maxSlot = Math.max(0, WEAPON_DEFS.length - 1);
  if (!Number.isFinite(slot)) {
    return 0;
  }
  return Math.min(maxSlot, Math.max(0, Math.floor(slot)));
};
const resolveWeaponLabel = (slot: number) => WEAPON_DEFS[slot]?.displayName ?? '--';
const resolveTeamIndex = (connectionId: string | null) => {
  if (!connectionId) {
    return 0;
  }
  let hash = 0;
  for (let i = 0; i < connectionId.length; i += 1) {
    hash = (hash + connectionId.charCodeAt(i)) % 2;
  }
  return hash;
};
const swapYZ = (vec: { x: number; y: number; z: number }) => ({ x: vec.x, y: vec.z, z: vec.y });
const anglesToDirection = (angles: { yaw: number; pitch: number }) => {
  const cosPitch = Math.cos(angles.pitch);
  return {
    x: Math.sin(angles.yaw) * cosPitch,
    y: Math.sin(angles.pitch),
    z: -Math.cos(angles.yaw) * cosPitch
  };
};
const resolveAdsFovMultiplier = (bits: number) =>
  hasLoadoutBit(bits, LOADOUT_BITS.optic) ? ADS_OPTIC_FOV_MULTIPLIER : ADS_FOV_MULTIPLIER;
const resolveRecoilRecovery = (bits: number, adsAmount: number) => {
  let speed = RECOIL_RECOVERY_SPEED;
  if (hasLoadoutBit(bits, LOADOUT_BITS.compensator)) {
    speed *= 1.25;
  }
  if (hasLoadoutBit(bits, LOADOUT_BITS.grip)) {
    speed *= 1.2;
  }
  speed *= 1 + Math.max(0, Math.min(1, adsAmount)) * 0.1;
  return Math.max(RECOIL_RECOVERY_MIN, speed);
};
let currentWeaponSlot = 0;
let sampler: ReturnType<typeof createInputSampler> | null = null;
let lastFire = false;
let adsTarget = 0;
let adsBlend = 0;
let recoilPitch = 0;
let recoilYaw = 0;
let recoilRecovery = 0;
let sendLoadoutBits: ((bits: number) => void) | null = null;
let footstepDistance = 0;
let lastFootstepAt = 0;
let lastFootstepPos: { x: number; y: number } | null = null;
let reconnecting = false;
let reconnectTimer: number | null = null;
let activeSession: WebRtcSession | null = null;
let activeCleanup: (() => void) | null = null;
let activeProfile: LocalPlayerProfile | null = null;
const settings = createSettingsOverlay(document, {
  initialSensitivity: lookSensitivity,
  initialShowMetrics: metricsVisible,
  initialAudioSettings: savedAudioSettings,
  initialFxSettings: fxSettings,
  initialLoadoutBits: localLoadoutBits,
  onSensitivityChange: (value) => {
    app.setLookSensitivity(value);
    hudStore.dispatch({ type: 'sensitivity', value });
    saveSensitivity(value, localStorageRef);
  },
  onShowMetricsChange: (visible) => {
    metricsVisible = visible;
    status.setMetricsVisible(visible);
    saveMetricsVisibility(visible, localStorageRef);
  },
  onAudioSettingsChange: (next) => {
    audio.setMuted(next.muted);
    audio.setVolume('master', next.master);
    audio.setVolume('sfx', next.sfx);
    audio.setVolume('ui', next.ui);
    audio.setVolume('music', next.music);
    saveAudioSettings(next, localStorageRef);
  },
  onFxSettingsChange: (next) => {
    fxSettings = next;
    saveFxSettings(next, localStorageRef);
    remoteAvatars.setAimDebugEnabled(next.aimDebug);
  },
  onLoadoutBitsChange: (nextBits) => {
    localLoadoutBits = nextBits;
    saveLoadoutBits(nextBits, localStorageRef);
    sendLoadoutBits?.(nextBits);
  }
});
settings.setAudioSettings(savedAudioSettings);
let settingsVisible = false;
const setSettingsVisible = (visible: boolean) => {
  settingsVisible = visible;
  settings.setVisible(visible);
  if (visible && typeof document.exitPointerLock === 'function') {
    document.exitPointerLock();
  }
};
setSettingsVisible(false);
const pointerLock = createPointerLockController({
  document,
  element: canvas,
  onChange: (locked) => {
    if (reconnecting) {
      hudStore.dispatch({ type: 'lock', state: 'reconnecting' });
    } else {
      hudStore.dispatch({ type: 'lock', state: locked ? 'locked' : 'unlocked' });
    }
    if (locked) {
      setSettingsVisible(false);
    }
    if (locked) {
      void audio.resume();
    }
  }
});
canvas.addEventListener('click', () => {
  void audio.resume();
});
const refreshHudLockState = (lockedOverride?: boolean) => {
  if (reconnecting) {
    hudStore.dispatch({ type: 'lock', state: 'reconnecting' });
    return;
  }
  if (!pointerLock.supported) {
    hudStore.dispatch({ type: 'lock', state: 'unsupported' });
    return;
  }
  const locked = lockedOverride ?? pointerLock.isLocked();
  hudStore.dispatch({ type: 'lock', state: locked ? 'locked' : 'unlocked' });
};
const signalingUrl = getSignalingUrl();
const signalingAuthToken = getSignalingAuthToken();
const logger = {
  info: (message: string) => status.setDetail(message),
  warn: (message: string) => status.setDetail(`warn: ${message}`),
  error: (message: string) => status.setDetail(`error: ${message}`)
};
const shouldApplyLook = () => !pointerLock.supported || pointerLock.isLocked();
const applyMovementYaw = (cmd: { moveX: number; moveY: number }, yaw: number) => {
  const safeYaw = Number.isFinite(yaw) ? yaw : 0;
  const cosYaw = Math.cos(safeYaw);
  const sinYaw = Math.sin(safeYaw);
  const localX = Number.isFinite(cmd.moveX) ? cmd.moveX : 0;
  const localY = Number.isFinite(cmd.moveY) ? cmd.moveY : 0;
  let worldX = localX * cosYaw + localY * sinYaw;
  let worldY = localX * sinYaw - localY * cosYaw;
  const length = Math.hypot(worldX, worldY);
  if (length > 1) {
    worldX /= length;
    worldY /= length;
  }
  cmd.moveX = Math.max(-1, Math.min(1, worldX));
  cmd.moveY = Math.max(-1, Math.min(1, worldY));
};

const wasmSimUrl = getWasmSimUrl();
const wasmParityEnabled = getWasmSimParity();
if (wasmSimUrl) {
  void loadWasmSimFromUrl(wasmSimUrl)
    .then((sim) => {
      let detail = 'WASM sim loaded';
      if (wasmParityEnabled) {
        const result = runWasmParityCheck(sim);
        if (!result.ok) {
          detail = `warn: wasm parity mismatch (dx=${result.deltaX.toFixed(6)}, dy=${result.deltaY.toFixed(
            6
          )}, dz=${result.deltaZ.toFixed(6)}, dvx=${result.deltaVx.toFixed(6)}, dvy=${result.deltaVy.toFixed(
            6
          )}, dvz=${result.deltaVz.toFixed(6)})`;
          console.warn('wasm parity mismatch', result);
        }
      }
      app.setPredictionSim(createWasmPredictionSim(sim));
      status.setDetail(detail);
      window.addEventListener(
        'beforeunload',
        () => sim.dispose(),
        {
          once: true
        }
      );
    })
    .catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      status.setDetail(`warn: wasm sim failed (${detail})`);
      console.warn('wasm sim load failed', error);
    });
}

hudStore.dispatch({ type: 'sensitivity', value: lookSensitivity });
hudStore.dispatch({
  type: 'vitals',
  value: { ammo: WEAPON_DEFS[currentWeaponSlot]?.maxAmmoInMag }
});
hudStore.dispatch({ type: 'weapon', slot: currentWeaponSlot, name: resolveWeaponLabel(currentWeaponSlot) });
hudStore.dispatch({ type: 'weaponCooldown', value: app.getWeaponCooldown(currentWeaponSlot) });
hudStore.dispatch({ type: 'abilityCooldowns', value: app.getAbilityCooldowns() });
refreshHudLockState(pointerLock.supported ? pointerLock.isLocked() : undefined);

let debugOverlaysVisible = false;
const setDebugOverlaysVisible = (visible: boolean) => {
  debugOverlaysVisible = visible;
  status.setVisible(visible);
  localAvatarDebug?.setVisible?.(visible);
};
setDebugOverlaysVisible(false);

window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') {
    if (!event.repeat) {
      setSettingsVisible(!settingsVisible);
    }
    return;
  }
  if (event.code === 'Backquote') {
    if (!event.repeat) {
      setDebugOverlaysVisible(!debugOverlaysVisible);
    }
  }
});

if (!signalingUrl) {
  status.setState('disabled', 'Set VITE_SIGNALING_URL');
} else if (!signalingAuthToken) {
  status.setState('disabled', 'Set VITE_SIGNALING_AUTH_TOKEN');
} else {
  status.setState('idle', 'Awaiting pre-join');
  const storedProfile = loadProfile(localStorageRef);
  const playerProfiles = new Map<string, NetPlayerProfile>();
  const lastSnapshots = new Map<string, StateSnapshot>();
  const scheduleReconnect = (reason: string) => {
    if (reconnecting || !activeProfile) {
      return;
    }
    reconnecting = true;
    status.setState('connecting', `Reconnecting: ${reason}`);
    refreshHudLockState();
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (activeCleanup) {
      activeCleanup();
      activeCleanup = null;
    }
    if (activeSession) {
      activeSession.close();
      activeSession = null;
    }
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      if (!activeProfile) {
        reconnecting = false;
        refreshHudLockState();
        return;
      }
      void bootstrapNetwork(activeProfile);
    }, RECONNECT_DELAY_MS);
  };
  const handlePlayerProfile = (profile: NetPlayerProfile) => {
    playerProfiles.set(profile.clientId, profile);
    remoteAvatars.setProfile(profile);
  };

  const bootstrapNetwork = async (profile: LocalPlayerProfile) => {
    status.setState('connecting', signalingUrl);
    remotePruneInterval = window.setInterval(() => remoteAvatars.prune(window.performance.now()), 2000);
    let lastSnapshotAt = 0;
    let lastRttMs = 0;
    let lastPredictionError = 0;
    let lastServerActivityAt = window.performance.now();
    let snapshotKeyframeInterval: number | null = null;
    let lastEventSampleAt = 0;
    let lastEventReceived = 0;
    let lastEventRateText = '--';

    const updateMetrics = () => {
      const now = window.performance.now();
      const snapshotAge = lastSnapshotAt > 0 ? Math.max(0, now - lastSnapshotAt) : null;
      const rttText = lastRttMs > 0 ? `${Math.round(lastRttMs)}ms` : '--';
      const snapshotText = snapshotAge !== null ? `${Math.round(snapshotAge)}ms` : '--';
      const driftText = lastPredictionError > 0 ? lastPredictionError.toFixed(2) : '0.00';
      const keyframeText = snapshotKeyframeInterval !== null ? `${snapshotKeyframeInterval}` : '--';
      let eventRateText = lastEventRateText;
      let lateText = '--';
      let dropText = '--';
      const eventStats = gameEventQueue?.getStats();
      if (eventStats) {
        lateText = `${eventStats.lateEvents}`;
        dropText = `${eventStats.droppedEvents}`;
        if (lastEventSampleAt <= 0) {
          lastEventSampleAt = now;
          lastEventReceived = eventStats.receivedEvents;
          lastEventRateText = '0/s';
        } else {
          const deltaMs = now - lastEventSampleAt;
          if (deltaMs >= 200) {
            const deltaEvents = eventStats.receivedEvents - lastEventReceived;
            const ratePerSec = deltaMs > 0 ? deltaEvents / (deltaMs / 1000) : 0;
            lastEventRateText = `${Math.max(0, Math.round(ratePerSec))}/s`;
            lastEventSampleAt = now;
            lastEventReceived = eventStats.receivedEvents;
          }
        }
        eventRateText = lastEventRateText;
      } else {
        lastEventSampleAt = 0;
        lastEventReceived = 0;
        lastEventRateText = '--';
        eventRateText = lastEventRateText;
      }
      const poolStats = app.getFxPoolStats();
      const poolText = `pool m ${poolStats.muzzleFlashes.active}/${poolStats.muzzleFlashes.free} t ${poolStats.tracers.active}/${poolStats.tracers.free} i ${poolStats.impacts.active}/${poolStats.impacts.free} d ${poolStats.decals.active}/${poolStats.decals.free}`;
      status.setMetrics?.(
        `rtt ${rttText} · snap ${snapshotText} · drift ${driftText} · kf ${keyframeText} · ev ${eventRateText} · late ${lateText} · drop ${dropText} · ${poolText}`
      );
    };

    const onSnapshot = (snapshot: StateSnapshot) => {
      const now = window.performance.now();
      lastServerActivityAt = now;
      const isLocalSnapshot =
        Boolean(localConnectionId) &&
        Boolean(snapshot.clientId) &&
        snapshot.clientId === localConnectionId;
      if (snapshot.clientId) {
        lastSnapshots.set(snapshot.clientId, snapshot);
      }
      if (snapshot.clientId && !isLocalSnapshot) {
        remoteAvatars.upsertSnapshot(snapshot, now);
      }
      if (localConnectionId && snapshot.clientId && snapshot.clientId !== localConnectionId) {
        return;
      }
      lastSnapshotAt = now;
      lastPredictionError = app.ingestSnapshot(snapshot, now);
      updateMetrics();
      hudStore.dispatch({ type: 'vitals', value: { health: snapshot.health, ammo: snapshot.ammoInMag } });
      hudStore.dispatch({ type: 'score', value: { kills: snapshot.kills, deaths: snapshot.deaths } });
    };

    const HIT_DISTANCE_STEP_METERS = 0.01;
    const PROJECTILE_POS_STEP_METERS = 0.01;
    const PROJECTILE_VEL_STEP_METERS_PER_SECOND = 0.01;
    const PROJECTILE_TTL_STEP_SECONDS = 0.01;
    const PLAYER_EYE_HEIGHT = 1.6;
    const MUZZLE_FORWARD_OFFSET = 0.2;

    const resolveWeaponForSlot = (weaponSlot: number) => WEAPON_DEFS[resolveWeaponSlot(weaponSlot)] ?? null;
    const resolveFireSound = (weapon: typeof WEAPON_DEFS[number], shotSeq: number) => {
      if (weapon.sounds.fireVariant2) {
        return shotSeq % 2 === 0 ? weapon.sounds.fire : weapon.sounds.fireVariant2;
      }
      return weapon.sounds.fire;
    };
    const resolveRecoilKick = (
      weapon: typeof WEAPON_DEFS[number],
      loadoutBits: number,
      adsAmount: number,
      shotSeq: number
    ) => {
      const cooldown = Math.max(0.05, weapon.cooldownSeconds);
      const rateFactor = Math.min(1.4, Math.max(0.6, 0.18 / cooldown));
      let pitchKick = 0.007 + weapon.damage * 0.00045;
      if (weapon.kind === 'projectile') {
        pitchKick *= 1.5;
      }
      if (weapon.fireMode === 'SEMI') {
        pitchKick *= 1.1;
      }
      pitchKick *= rateFactor;
      pitchKick *= 1 - Math.max(0, Math.min(1, adsAmount)) * 0.25;
      if (hasLoadoutBit(loadoutBits, LOADOUT_BITS.compensator)) {
        pitchKick *= 0.75;
      }
      if (hasLoadoutBit(loadoutBits, LOADOUT_BITS.grip)) {
        pitchKick *= 0.85;
      }
      if (hasLoadoutBit(loadoutBits, LOADOUT_BITS.suppressor)) {
        pitchKick *= 0.95;
      }
      pitchKick = Math.min(pitchKick, 0.08);
      let yawKick = pitchKick * 0.35;
      if (hasLoadoutBit(loadoutBits, LOADOUT_BITS.grip)) {
        yawKick *= 0.8;
      }
      const yawSign = shotSeq % 2 === 0 ? 1 : -1;
      return { pitch: pitchKick, yaw: yawKick * yawSign };
    };

    const resolveSnapshotPosition = (clientId?: string | null) => {
      if (!clientId) {
        return null;
      }
      const snapshot = lastSnapshots.get(clientId);
      if (!snapshot) {
        return null;
      }
      return swapYZ({ x: snapshot.posX, y: snapshot.posY, z: snapshot.posZ });
    };

    const resolveLoadoutBits = (clientId: string) => {
      if (localConnectionId && clientId === localConnectionId) {
        return localLoadoutBits;
      }
      const snapshot = lastSnapshots.get(clientId);
      return snapshot?.loadoutBits ?? 0;
    };

    const resolveWeaponHeat = (clientId: string) => {
      const snapshot = lastSnapshots.get(clientId);
      if (!snapshot) {
        return 0;
      }
      return decodeUnitU16(snapshot.weaponHeatQ);
    };

    const resolveSnapshotAim = (clientId: string) => {
      const snapshot = lastSnapshots.get(clientId);
      if (!snapshot) {
        return null;
      }
      const yaw = decodeYawQ(snapshot.viewYawQ);
      const pitch = decodePitchQ(snapshot.viewPitchQ);
      const dir = anglesToDirection({ yaw, pitch });
      const origin = swapYZ({
        x: snapshot.posX,
        y: snapshot.posY,
        z: snapshot.posZ + PLAYER_EYE_HEIGHT
      });
      const muzzle = {
        x: origin.x + dir.x * MUZZLE_FORWARD_OFFSET,
        y: origin.y + dir.y * MUZZLE_FORWARD_OFFSET,
        z: origin.z + dir.z * MUZZLE_FORWARD_OFFSET
      };
      return { dir, origin, muzzle };
    };

    const hashString = (value: string) => {
      let hash = 2166136261;
      for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    };

    const createRandom = (seed: number) => {
      let state = seed >>> 0;
      return () => {
        state += 0x6d2b79f5;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };

    const cross = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => ({
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    });

    const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
      a.x * b.x + a.y * b.y + a.z * b.z;

    const normalize = (v: { x: number; y: number; z: number }) => {
      const len = Math.hypot(v.x, v.y, v.z);
      if (!Number.isFinite(len) || len <= 1e-8) {
        return { x: 0, y: 0, z: -1 };
      }
      return { x: v.x / len, y: v.y / len, z: v.z / len };
    };

    const makeOrthonormalBasis = (forward: { x: number; y: number; z: number }) => {
      const fwd = normalize(forward);
      const up = { x: 0, y: 1, z: 0 };
      let right = cross(up, fwd);
      if (dot(right, right) < 1e-6) {
        right = cross({ x: 0, y: 0, z: 1 }, fwd);
      }
      right = normalize(right);
      const trueUp = normalize(cross(fwd, right));
      return { forward: fwd, right, up: trueUp };
    };

    const resolveOriginServer = (clientId: string) => {
      const snapshot = lastSnapshots.get(clientId);
      if (snapshot) {
        return { x: snapshot.posX, y: snapshot.posY, z: snapshot.posZ + PLAYER_EYE_HEIGHT };
      }
      if (localConnectionId && clientId === localConnectionId) {
        const cameraPos = app.state.camera?.position;
        if (cameraPos && Number.isFinite(cameraPos.x) && Number.isFinite(cameraPos.y) && Number.isFinite(cameraPos.z)) {
          return swapYZ({ x: cameraPos.x, y: cameraPos.y, z: cameraPos.z });
        }
      }
      return null;
    };

    const resolveMuzzlePos = (clientId: string, dirServer: { x: number; y: number; z: number }) => {
      const originServer = resolveOriginServer(clientId);
      if (!originServer) {
        return null;
      }
      const muzzleServer = {
        x: originServer.x + dirServer.x * MUZZLE_FORWARD_OFFSET,
        y: originServer.y + dirServer.y * MUZZLE_FORWARD_OFFSET,
        z: originServer.z + dirServer.z * MUZZLE_FORWARD_OFFSET
      };
      return swapYZ(muzzleServer);
    };

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const sampleRange = (rand: () => number, min: [number, number, number], max: [number, number, number]) => ({
      x: lerp(min[0], max[0], rand()),
      y: lerp(min[1], max[1], rand()),
      z: lerp(min[2], max[2], rand())
    });

    const transformLocalToWorld = (
      basis: { right: { x: number; y: number; z: number }; up: { x: number; y: number; z: number }; forward: { x: number; y: number; z: number } },
      local: { x: number; y: number; z: number }
    ) => ({
      x: basis.right.x * local.x + basis.up.x * local.y + basis.forward.x * local.z,
      y: basis.right.y * local.x + basis.up.y * local.y + basis.forward.y * local.z,
      z: basis.right.z * local.x + basis.up.z * local.y + basis.forward.z * local.z
    });

    const spawnCasingFromShot = (
      weapon: typeof WEAPON_DEFS[number],
      muzzlePos: { x: number; y: number; z: number },
      dir: { x: number; y: number; z: number },
      shooterId: string,
      shotSeq: number
    ) => {
      if (!weapon.ejectShellsWhileFiring) {
        return;
      }
      const seed = (hashString(shooterId) ^ (shotSeq >>> 0)) >>> 0;
      const rand = createRandom(seed);
      const basis = makeOrthonormalBasis(dir);
      const localOffset = {
        x: weapon.casingEject.localOffset[0],
        y: weapon.casingEject.localOffset[1],
        z: weapon.casingEject.localOffset[2]
      };
      const offsetWorld = transformLocalToWorld(basis, localOffset);
      const velocityLocal = sampleRange(rand, weapon.casingEject.velocityMin, weapon.casingEject.velocityMax);
      const velocityWorld = transformLocalToWorld(basis, velocityLocal);
      const angularVelocity = sampleRange(
        rand,
        weapon.casingEject.angularVelocityMin,
        weapon.casingEject.angularVelocityMax
      );
      const rotation = {
        x: weapon.casingEject.localRotation[0],
        y: weapon.casingEject.localRotation[1],
        z: weapon.casingEject.localRotation[2]
      };
      casingPool.spawn({
        position: {
          x: muzzlePos.x + offsetWorld.x,
          y: muzzlePos.y + offsetWorld.y,
          z: muzzlePos.z + offsetWorld.z
        },
        rotation,
        velocity: velocityWorld,
        angularVelocity,
        lifetimeSeconds: weapon.casingEject.lifetimeSeconds,
        seed
      });
    };

    const processGameEventBatch = (batch: GameEventBatch) => {
      const traceByShot = new Map<
        string,
        {
          dirServer: { x: number; y: number; z: number };
          dir: { x: number; y: number; z: number };
          normal: { x: number; y: number; z: number };
          hitDistance: number;
          hitKind: number;
          surfaceType: number;
          showTracer: boolean;
          muzzlePos: { x: number; y: number; z: number } | null;
        }
      >();
      const projectileMuzzleByShot = new Map<
        string,
        {
          muzzlePos: { x: number; y: number; z: number };
          dir: { x: number; y: number; z: number };
        }
      >();

      for (const event of batch.events) {
        if (event.type === 'ShotTraceFx') {
          const dirServer = decodeOct16(event.dirOctX, event.dirOctY);
          const normalServer = decodeOct16(event.normalOctX, event.normalOctY);
          const muzzlePos = resolveMuzzlePos(event.shooterId, dirServer);
          traceByShot.set(`${event.shooterId}:${event.shotSeq}`, {
            dirServer,
            dir: swapYZ(dirServer),
            normal: swapYZ(normalServer),
            hitDistance: dequantizeU16(event.hitDistQ, HIT_DISTANCE_STEP_METERS),
            hitKind: event.hitKind,
            surfaceType: event.surfaceType,
            showTracer: event.showTracer,
            muzzlePos
          });
        } else if (event.type === 'ProjectileSpawnFx') {
          const originServer = {
            x: dequantizeI16(event.posXQ, PROJECTILE_POS_STEP_METERS),
            y: dequantizeI16(event.posYQ, PROJECTILE_POS_STEP_METERS),
            z: dequantizeI16(event.posZQ, PROJECTILE_POS_STEP_METERS)
          };
          const velocityServer = {
            x: dequantizeI16(event.velXQ, PROJECTILE_VEL_STEP_METERS_PER_SECOND),
            y: dequantizeI16(event.velYQ, PROJECTILE_VEL_STEP_METERS_PER_SECOND),
            z: dequantizeI16(event.velZQ, PROJECTILE_VEL_STEP_METERS_PER_SECOND)
          };
          const velocity = swapYZ(velocityServer);
          projectileMuzzleByShot.set(`${event.shooterId}:${event.shotSeq}`, {
            muzzlePos: swapYZ(originServer),
            dir: normalize(velocity)
          });
        }
      }

      const advance = (
        origin: { x: number; y: number; z: number },
        dir: { x: number; y: number; z: number },
        distance: number
      ) => ({
        x: origin.x + dir.x * distance,
        y: origin.y + dir.y * distance,
        z: origin.z + dir.z * distance
      });

      for (const event of batch.events) {
        switch (event.type) {
          case 'HitConfirmedFx': {
            hudStore.dispatch({ type: 'hitmarker', killed: event.killed });
            app.triggerOutlineFlash({ killed: event.killed });
            audio.play('impact', { group: 'sfx', volume: 0.8 });
            break;
          }
          case 'ProjectileSpawnFx': {
            const originServer = {
              x: dequantizeI16(event.posXQ, PROJECTILE_POS_STEP_METERS),
              y: dequantizeI16(event.posYQ, PROJECTILE_POS_STEP_METERS),
              z: dequantizeI16(event.posZQ, PROJECTILE_POS_STEP_METERS)
            };
            const velocityServer = {
              x: dequantizeI16(event.velXQ, PROJECTILE_VEL_STEP_METERS_PER_SECOND),
              y: dequantizeI16(event.velYQ, PROJECTILE_VEL_STEP_METERS_PER_SECOND),
              z: dequantizeI16(event.velZQ, PROJECTILE_VEL_STEP_METERS_PER_SECOND)
            };
            app.spawnProjectileVfx({
              origin: swapYZ(originServer),
              velocity: swapYZ(velocityServer),
              ttl: dequantizeU16(event.ttlQ, PROJECTILE_TTL_STEP_SECONDS),
              projectileId: event.projectileId
            });
            break;
          }
          case 'ProjectileImpactFx': {
            const impactPosServer = {
              x: dequantizeI16(event.posXQ, PROJECTILE_POS_STEP_METERS),
              y: dequantizeI16(event.posYQ, PROJECTILE_POS_STEP_METERS),
              z: dequantizeI16(event.posZQ, PROJECTILE_POS_STEP_METERS)
            };
            const impactPos = swapYZ(impactPosServer);
            const normal = swapYZ(decodeOct16(event.normalOctX, event.normalOctY));
            audio.playPositional('impact', impactPos, { group: 'sfx', volume: 0.5 });
            app.spawnImpactVfx({
              position: impactPos,
              normal,
              surfaceType: event.surfaceType,
              seed: event.projectileId >>> 0,
              size: 0.5,
              ttl: 0.16
            });
            if (fxSettings.decals && event.hitWorld) {
              app.spawnDecalVfx({
                position: impactPos,
                normal,
                surfaceType: event.surfaceType,
                seed: event.projectileId >>> 0
              });
            }
            app.removeProjectileVfx(event.projectileId);
            break;
          }
          case 'ProjectileRemoveFx': {
            app.removeProjectileVfx(event.projectileId);
            break;
          }
          case 'ReloadFx': {
            const weapon = resolveWeaponForSlot(event.weaponSlot);
            if (!weapon) {
              break;
            }
            const position = resolveSnapshotPosition(event.shooterId);
            if (position) {
              audio.playPositional(weapon.sounds.reload, position, { group: 'sfx', volume: 0.65 });
            } else {
              audio.play(weapon.sounds.reload, { group: 'sfx', volume: 0.65 });
            }
            break;
          }
          case 'NearMissFx': {
            const strength = Number.isFinite(event.strength) ? Math.max(0, Math.min(255, Math.floor(event.strength))) : 0;
            const volume = 0.15 + 0.25 * (strength / 255);
            audio.play(event.shotSeq % 2 === 0 ? 'fx:whiz:1' : 'fx:whiz:2', { group: 'sfx', volume });
            break;
          }
          case 'OverheatFx': {
            if (!resolveWeaponForSlot(event.weaponSlot)) {
              break;
            }
            const aim = resolveSnapshotAim(event.shooterId);
            const muzzlePos = aim?.muzzle ?? resolveSnapshotPosition(event.shooterId);
            const dir = aim?.dir ?? { x: 0, y: 0, z: -1 };
            if (muzzlePos) {
              audio.playPositional('fx:overheat', muzzlePos, { group: 'sfx', volume: 0.65 });
              if (fxSettings.muzzleFlash) {
                app.spawnImpactVfx({
                  position: muzzlePos,
                  normal: dir,
                  surfaceType: 3,
                  seed: (hashString(event.shooterId) ^ (event.weaponSlot >>> 0)) >>> 0,
                  size: 0.7,
                  ttl: 0.22
                });
              }
            } else {
              audio.play('fx:overheat', { group: 'sfx', volume: 0.65 });
            }
            break;
          }
          case 'VentFx': {
            if (!resolveWeaponForSlot(event.weaponSlot)) {
              break;
            }
            const aim = resolveSnapshotAim(event.shooterId);
            const muzzlePos = aim?.muzzle ?? resolveSnapshotPosition(event.shooterId);
            const dir = aim?.dir ?? { x: 0, y: 0, z: -1 };
            if (muzzlePos) {
              audio.playPositional('fx:vent', muzzlePos, { group: 'sfx', volume: 0.6 });
              app.spawnImpactVfx({
                position: muzzlePos,
                normal: dir,
                surfaceType: 3,
                seed: (hashString(event.shooterId) ^ (event.weaponSlot >>> 0) ^ 0x9e3779b9) >>> 0,
                size: 0.6,
                ttl: 0.2
              });
            } else {
              audio.play('fx:vent', { group: 'sfx', volume: 0.6 });
            }
            break;
          }
          case 'ShotFiredFx': {
            const weapon = resolveWeaponForSlot(event.weaponSlot);
            if (!weapon) {
              break;
            }
            const shooterLoadout = resolveLoadoutBits(event.shooterId);
            const hasSuppressor = hasLoadoutBit(shooterLoadout, LOADOUT_BITS.suppressor);
            const hasCompensator = hasLoadoutBit(shooterLoadout, LOADOUT_BITS.compensator);
            const hasOptic = hasLoadoutBit(shooterLoadout, LOADOUT_BITS.optic);
            const isEnergy = weapon.id.startsWith('ENERGY') || weapon.sfxProfile.startsWith('ENERGY');
            const heatAmount = isEnergy ? resolveWeaponHeat(event.shooterId) : 0;
            const traceKey = `${event.shooterId}:${event.shotSeq}`;
            const trace = traceByShot.get(traceKey) ?? null;
            const projectileMuzzle = projectileMuzzleByShot.get(traceKey) ?? null;
            const snapshotAim = resolveSnapshotAim(event.shooterId);
            const dir = trace?.dir ?? projectileMuzzle?.dir ?? snapshotAim?.dir ?? null;
            const muzzlePos =
              trace?.muzzlePos ??
              projectileMuzzle?.muzzlePos ??
              (snapshotAim?.origin && dir ? advance(snapshotAim.origin, dir, MUZZLE_FORWARD_OFFSET) : snapshotAim?.muzzle) ??
              resolveSnapshotPosition(event.shooterId);
            if (event.dryFire) {
              if (muzzlePos) {
                audio.playPositional(weapon.sounds.dryFire, muzzlePos, { group: 'sfx', volume: 0.55 });
              } else {
                audio.play(weapon.sounds.dryFire, { group: 'sfx', volume: 0.55 });
              }
            } else {
              const fireKey = resolveFireSound(weapon, event.shotSeq);
              const baseVolume = hasSuppressor ? 0.6 : hasCompensator ? 0.95 : 0.85;
              const playbackRate = isEnergy ? 0.95 + heatAmount * 0.25 : 1;
              if (muzzlePos) {
                audio.playPositional(fireKey, muzzlePos, {
                  group: 'sfx',
                  volume: baseVolume,
                  playbackRate
                });
              } else {
                audio.play(fireKey, { group: 'sfx', volume: baseVolume, playbackRate });
              }
              if (fxSettings.muzzleFlash && muzzlePos && dir) {
                const seed = (hashString(event.shooterId) ^ (event.shotSeq >>> 0)) >>> 0;
                let size = weapon.kind === 'projectile' ? 0.42 : 0.34;
                if (hasSuppressor) {
                  size *= 0.6;
                }
                if (hasCompensator) {
                  size *= 1.15;
                }
                if (hasOptic) {
                  size *= 0.95;
                }
                app.spawnMuzzleFlashVfx({ position: muzzlePos, dir, seed, size });
              }
              if (weapon.kind === 'hitscan' && trace && trace.showTracer && muzzlePos && fxSettings.tracers) {
                const hitDistance = trace.hitDistance > 0 ? trace.hitDistance : weapon.range;
                let length = Math.max(0, hitDistance - MUZZLE_FORWARD_OFFSET);
                if (hasSuppressor) {
                  length *= 0.7;
                } else if (hasCompensator) {
                  length *= 1.1;
                }
                app.spawnTracerVfx({
                  origin: muzzlePos,
                  dir: trace.dir,
                  length
                });
              }
              if (dir && muzzlePos) {
                spawnCasingFromShot(weapon, muzzlePos, dir, event.shooterId, event.shotSeq);
              }
              remoteAvatars.pulseWeaponRecoil(event.shooterId, event.shotSeq, shooterLoadout);
            }
            if (localConnectionId && event.shooterId === localConnectionId) {
              app.recordWeaponFired(event.weaponSlot, weapon.cooldownSeconds);
              hudStore.dispatch({ type: 'weaponCooldown', value: app.getWeaponCooldown(currentWeaponSlot) });
            }
            break;
          }
          case 'ShotTraceFx': {
            const traceKey = `${event.shooterId}:${event.shotSeq}`;
            const trace = traceByShot.get(traceKey);
            if (!trace || !trace.muzzlePos) {
              break;
            }
            if (trace.hitKind === 0) {
              break;
            }
            const hitDistance = trace.hitDistance > 0 ? trace.hitDistance : resolveWeaponForSlot(event.weaponSlot)?.range ?? 0;
            const length = Math.max(0, hitDistance - MUZZLE_FORWARD_OFFSET);
            const hitPos = advance(trace.muzzlePos, trace.dir, length);
            const seed = (hashString(event.shooterId) ^ (event.shotSeq >>> 0)) >>> 0;
            app.spawnImpactVfx({
              position: hitPos,
              normal: trace.normal,
              surfaceType: trace.surfaceType,
              seed
            });
            if (fxSettings.decals && trace.hitKind === 1) {
              app.spawnDecalVfx({
                position: hitPos,
                normal: trace.normal,
                surfaceType: trace.surfaceType,
                seed
              });
            }
            break;
          }
          default: {
            const exhaustiveCheck: never = event;
            void exhaustiveCheck;
          }
        }
      }
    };

    const queue = new GameEventQueue();
    gameEventQueue = queue;
    processQueuedEventBatch = processGameEventBatch;

    const onGameEvent = (batch: GameEventBatch) => {
      const now = window.performance.now();
      lastServerActivityAt = now;
      const immediate = queue.push(batch, now, app.getRenderTick());
      for (const dueBatch of immediate) {
        processGameEventBatch(dueBatch);
      }
    };

    const onPong = (pong: PongMessage) => {
      const now = window.performance.now();
      lastServerActivityAt = now;
      if (Number.isFinite(pong.clientTimeMs)) {
        lastRttMs = Math.max(0, now - pong.clientTimeMs);
        updateMetrics();
      }
    };

    return connectIfConfigured({
      signalingUrl,
      signalingAuthToken,
      logger,
      buildClientHello: (sessionToken, connectionId, build, overrideProfile, msgSeq, serverSeqAck) =>
        buildClientHello(
          sessionToken,
          connectionId,
          build ?? 'dev',
          {
            nickname: overrideProfile?.nickname ?? profile.nickname,
            characterId: overrideProfile?.characterId ?? profile.characterId
          },
          msgSeq,
          serverSeqAck
        ),
      onSnapshot,
      onPong,
      onGameEvent,
      onPlayerProfile: handlePlayerProfile
    })
      .then((session) => {
        if (!session) {
          return;
        }
        localConnectionId = session.connectionId;
        remoteAvatars.setLocalClientId(localConnectionId);
        app.setOutlineTeam(resolveTeamIndex(localConnectionId));
        handlePlayerProfile({
          type: 'PlayerProfile',
          clientId: localConnectionId,
          nickname: profile.nickname,
          characterId: profile.characterId
        });
        localAvatarActive = debugLocalAvatar;
        lastLocalAvatarSample = null;
        app.setLocalProxyVisible(false);
        const keyframeDetail =
          session.serverHello.snapshotKeyframeInterval !== undefined
            ? ` (kf ${session.serverHello.snapshotKeyframeInterval})`
            : '';
        status.setState('connected', `conn ${session.connectionId}${keyframeDetail}`);
        reconnecting = false;
        if (reconnectTimer !== null) {
          window.clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        refreshHudLockState();
        app.setSnapshotRate(session.serverHello.snapshotRate);
        app.setTickRate(session.serverHello.serverTickRate);
        queue.setTickRate(session.serverHello.serverTickRate);
        snapshotKeyframeInterval = session.serverHello.snapshotKeyframeInterval ?? null;
        updateMetrics();
        hudStore.dispatch({ type: 'weaponCooldown', value: app.getWeaponCooldown(currentWeaponSlot) });
        hudStore.dispatch({ type: 'abilityCooldowns', value: app.getAbilityCooldowns() });

        sendLoadoutBits = (bits: number) => {
          const channel = session.reliableChannel;
          if (!channel || channel.readyState !== 'open') {
            return;
          }
          channel.send(encodeSetLoadoutRequest(bits, session.nextClientMessageSeq(), session.getServerSeqAck()));
        };
        sendLoadoutBits(localLoadoutBits);

        sampler = createInputSampler({ target: window, weaponSlots: WEAPON_DEFS.length });
        const lastFireTimes = new Map<number, number>();
        let clientShotSeq = 0;
        activeSession = session;
        const sender = createInputSender({
          channel: session.unreliableChannel,
          sampler,
          nextMessageSeq: session.nextClientMessageSeq,
          getServerSeqAck: session.getServerSeqAck,
          tickRate: session.serverHello.serverTickRate,
          logger,
          onSend: (cmd) => {
            if (reconnecting) {
              cmd.moveX = 0;
              cmd.moveY = 0;
              cmd.lookDeltaX = 0;
              cmd.lookDeltaY = 0;
              cmd.jump = false;
              cmd.fire = false;
              cmd.ads = false;
              cmd.sprint = false;
              cmd.dash = false;
              cmd.grapple = false;
              cmd.shield = false;
              cmd.shockwave = false;
              return;
            }
            const lookX = cmd.lookDeltaX;
            const lookY = cmd.lookDeltaY;
            adsTarget = cmd.ads ? 1 : 0;
            const adsSensitivity = 1 - adsBlend * (1 - ADS_SENSITIVITY_MULTIPLIER);
            const scaledLookX = lookX * adsSensitivity;
            const scaledLookY = lookY * adsSensitivity;
            cmd.lookDeltaX = scaledLookX;
            cmd.lookDeltaY = scaledLookY;
            if (shouldApplyLook()) {
              app.applyLookDelta(scaledLookX, scaledLookY);
            }
            const angles = app.getLookAngles();
            cmd.viewYaw = angles.yaw;
            cmd.viewPitch = angles.pitch;
            applyMovementYaw(cmd, cmd.viewYaw);
            const firePressed = cmd.fire && !lastFire;
            const fireHeld = cmd.fire;
            lastFire = cmd.fire;
            const nextSlot = resolveWeaponSlot(cmd.weaponSlot);
            cmd.weaponSlot = nextSlot;
            if (nextSlot !== currentWeaponSlot) {
              currentWeaponSlot = nextSlot;
              hudStore.dispatch({
                type: 'weapon',
                slot: currentWeaponSlot,
                name: resolveWeaponLabel(currentWeaponSlot)
              });
              const equipped = WEAPON_DEFS[currentWeaponSlot];
              app.setWeaponViewmodel(equipped?.id);
              if (equipped?.sounds.equip) {
                audio.play(equipped.sounds.equip, { group: 'sfx', volume: 0.6 });
              }
            }
            const weapon = WEAPON_DEFS[currentWeaponSlot];
            if (weapon) {
              const shouldFire =
                weapon.fireMode === 'FULL_AUTO' ? fireHeld : firePressed;
              if (shouldFire) {
                const now = window.performance.now();
                const cooldownMs = weapon.cooldownSeconds * 1000;
                const lastAt = lastFireTimes.get(currentWeaponSlot) ?? -Infinity;
                if (now - lastAt >= cooldownMs) {
                  lastFireTimes.set(currentWeaponSlot, now);
                  clientShotSeq += 1;
                  const cameraPos = app.state.camera?.position ?? { x: 0, y: 0, z: 0 };
                  const originServer = swapYZ({
                    x: cameraPos.x,
                    y: cameraPos.y,
                    z: cameraPos.z
                  });
                  const dirThree = anglesToDirection(angles);
                  const dirServer = swapYZ(dirThree);
                  session.unreliableChannel.send(
                    encodeFireWeaponRequest(
                      {
                        type: 'FireWeaponRequest',
                        clientShotSeq,
                        weaponId: weapon.id,
                        weaponSlot: currentWeaponSlot,
                        originX: originServer.x,
                        originY: originServer.y,
                        originZ: originServer.z,
                        dirX: dirServer.x,
                        dirY: dirServer.y,
                        dirZ: dirServer.z
                      },
                      session.nextClientMessageSeq(),
                      session.getServerSeqAck()
                    )
                  );
                  const kick = resolveRecoilKick(weapon, localLoadoutBits, adsBlend, clientShotSeq);
                  recoilPitch = Math.min(recoilPitch + kick.pitch, 0.6);
                  recoilYaw = Math.max(-0.6, Math.min(0.6, recoilYaw + kick.yaw));
                }
              }
            }
            hudStore.dispatch({ type: 'weaponCooldown', value: app.getWeaponCooldown(currentWeaponSlot) });
            app.recordInput(cmd);
            hudStore.dispatch({ type: 'abilityCooldowns', value: app.getAbilityCooldowns() });
          }
        });
        sender.start();

        lastServerActivityAt = window.performance.now();
        const staleInterval = window.setInterval(() => {
          if (reconnecting) {
            return;
          }
          const now = window.performance.now();
          if (now - lastServerActivityAt > SERVER_STALE_TIMEOUT_MS) {
            scheduleReconnect('server unresponsive');
          }
        }, SERVER_STALE_POLL_INTERVAL_MS);

        const sendPing = () => {
          if (session.unreliableChannel.readyState !== 'open') {
            return;
          }
          const now = window.performance.now();
          session.unreliableChannel.send(buildPing(now, session.nextClientMessageSeq(), session.getServerSeqAck()));
        };
        sendPing();
        const pingInterval = window.setInterval(sendPing, 1000);
        const metricsInterval = window.setInterval(updateMetrics, 250);

        const cleanup = () => {
          sender.stop();
          sampler?.dispose();
          sampler = null;
          localAvatarDebug?.dispose();
          queue.clear();
          if (gameEventQueue === queue) {
            gameEventQueue = null;
            processQueuedEventBatch = null;
          }
          window.clearInterval(pingInterval);
          window.clearInterval(metricsInterval);
          window.clearInterval(staleInterval);
          if (remotePruneInterval !== null) {
            window.clearInterval(remotePruneInterval);
            remotePruneInterval = null;
          }
          sendLoadoutBits = null;
          remoteAvatars.dispose();
          casingPool.dispose();
          if (activeSession === session) {
            activeSession = null;
          }
          if (activeCleanup === cleanup) {
            activeCleanup = null;
          }
          window.removeEventListener('beforeunload', cleanup);
        };
        activeCleanup = cleanup;
        window.addEventListener('beforeunload', cleanup);
      })
      .catch((error: unknown) => {
        if (remotePruneInterval !== null) {
          window.clearInterval(remotePruneInterval);
          remotePruneInterval = null;
        }
        remoteAvatars.dispose();
        const detail = error instanceof Error ? error.message : String(error);
        status.setState('error', detail);
        reconnecting = false;
        refreshHudLockState();
        console.error('network bootstrap failed', error);
      });
  };

  void (async () => {
    const catalog = await loadCharacterCatalog();
    remoteAvatars.setCatalog(catalog);
    const prejoin = createPrejoinOverlay(document, {
      catalog,
      initialProfile: storedProfile ?? undefined,
      onSubmit: (profile) => saveProfile(localStorageRef, profile)
    });
    const profile = await prejoin.waitForSubmit();
    activeProfile = profile;
    // Free the WebGL context used for the 3D preview so the main renderer stays stable.
    prejoin.dispose();
    await bootstrapNetwork(profile);
  })().catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    status.setState('error', detail);
    console.error('pre-join bootstrap failed', error);
  });
}

const markReady = () => {
  const win = window as unknown as { __afpsReady?: number };
  if (typeof win.__afpsReady === 'number') {
    return;
  }
  const now = window.performance.now();
  win.__afpsReady = now;
  window.performance.mark?.('afps-ready');
};

markReady();
