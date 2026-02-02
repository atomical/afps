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
import { buildPing } from './net/protocol';
import type { GameEvent, Pong, StateSnapshot } from './net/protocol';
import { createStatusOverlay } from './ui/status';
import { createInputSampler } from './input/sampler';
import { loadBindings, saveBindings } from './input/bindings';
import { loadSensitivity, saveSensitivity } from './input/sensitivity';
import { loadInvertX, loadInvertY, saveInvertX, saveInvertY } from './input/look_inversion';
import { createInputSender } from './net/input_sender';
import { createPointerLockController } from './input/pointer_lock';
import { createHudOverlay } from './ui/hud';
import { createSettingsOverlay } from './ui/settings';
import { loadMetricsVisibility, saveMetricsVisibility } from './ui/metrics_settings';
import { loadWasmSimFromUrl } from './sim/wasm';
import { createWasmPredictionSim } from './sim/wasm_adapter';
import { runWasmParityCheck } from './sim/parity';
import { WEAPON_DEFS } from './weapons/config';

const three = {
  ...THREE,
  EffectComposer,
  RenderPass,
  OutlinePass,
  Vector2: THREE.Vector2
};

const savedSensitivity = loadSensitivity(window.localStorage);
const lookSensitivity = savedSensitivity ?? getLookSensitivity();
const savedInvertX = loadInvertX(window.localStorage);
const savedInvertY = loadInvertY(window.localStorage);
let invertLookX = savedInvertX ?? false;
let invertLookY = savedInvertY ?? false;
const savedMetricsVisible = loadMetricsVisibility(window.localStorage);
let metricsVisible = savedMetricsVisible;
let currentBindings = loadBindings(window.localStorage);
const { app, canvas } = startApp({ three, document, window, lookSensitivity, loadEnvironment: true });
const status = createStatusOverlay(document);
status.setMetricsVisible(metricsVisible);
const hud = createHudOverlay(document);
const resolveWeaponSlot = (slot: number) => {
  const maxSlot = Math.max(0, WEAPON_DEFS.length - 1);
  if (!Number.isFinite(slot)) {
    return 0;
  }
  return Math.min(maxSlot, Math.max(0, Math.floor(slot)));
};
const resolveWeaponLabel = (slot: number) => WEAPON_DEFS[slot]?.name ?? '--';
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
let currentWeaponSlot = 0;
let sampler: ReturnType<typeof createInputSampler> | null = null;
const settings = createSettingsOverlay(document, {
  initialSensitivity: lookSensitivity,
  initialBindings: currentBindings,
  initialShowMetrics: metricsVisible,
  initialInvertLookX: invertLookX,
  initialInvertLookY: invertLookY,
  onSensitivityChange: (value) => {
    app.setLookSensitivity(value);
    hud.setSensitivity(value);
    saveSensitivity(value, window.localStorage);
  },
  onInvertLookXChange: (value) => {
    invertLookX = value;
    saveInvertX(value, window.localStorage);
  },
  onInvertLookYChange: (value) => {
    invertLookY = value;
    saveInvertY(value, window.localStorage);
  },
  onBindingsChange: (bindings) => {
    currentBindings = bindings;
    saveBindings(bindings, window.localStorage);
    sampler?.setBindings(bindings);
  },
  onShowMetricsChange: (visible) => {
    metricsVisible = visible;
    status.setMetricsVisible(visible);
    saveMetricsVisibility(visible, window.localStorage);
  }
});
settings.setLookInversion(invertLookX, invertLookY);
const pointerLock = createPointerLockController({
  document,
  element: canvas,
  onChange: (locked) => {
    hud.setLockState(locked ? 'locked' : 'unlocked');
  }
});
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

hud.setSensitivity(lookSensitivity);
hud.setVitals({ ammo: Infinity });
hud.setWeapon(currentWeaponSlot, resolveWeaponLabel(currentWeaponSlot));
hud.setWeaponCooldown(app.getWeaponCooldown(currentWeaponSlot));
hud.setAbilityCooldowns(app.getAbilityCooldowns());
if (pointerLock.supported) {
  hud.setLockState(pointerLock.isLocked() ? 'locked' : 'unlocked');
} else {
  hud.setLockState('unsupported');
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyO') {
    settings.toggle();
  }
});

if (!signalingUrl) {
  status.setState('disabled', 'Set VITE_SIGNALING_URL');
} else if (!signalingAuthToken) {
  status.setState('disabled', 'Set VITE_SIGNALING_AUTH_TOKEN');
} else {
  status.setState('connecting', signalingUrl);
  let lastSnapshotAt = 0;
  let lastRttMs = 0;
  let lastPredictionError = 0;
  let snapshotKeyframeInterval: number | null = null;
  let localConnectionId: string | null = null;
  const updateMetrics = () => {
    const now = window.performance.now();
    const snapshotAge = lastSnapshotAt > 0 ? Math.max(0, now - lastSnapshotAt) : null;
    const rttText = lastRttMs > 0 ? `${Math.round(lastRttMs)}ms` : '--';
    const snapshotText = snapshotAge !== null ? `${Math.round(snapshotAge)}ms` : '--';
    const driftText = lastPredictionError > 0 ? lastPredictionError.toFixed(2) : '0.00';
    const keyframeText = snapshotKeyframeInterval !== null ? `${snapshotKeyframeInterval}` : '--';
    status.setMetrics?.(`rtt ${rttText} · snap ${snapshotText} · drift ${driftText} · kf ${keyframeText}`);
  };

  const onSnapshot = (snapshot: StateSnapshot) => {
    const now = window.performance.now();
    lastSnapshotAt = now;
    lastPredictionError = app.ingestSnapshot(snapshot, now);
    updateMetrics();
    hud.setVitals({ health: snapshot.health, ammo: Infinity });
    hud.setScore({ kills: snapshot.kills, deaths: snapshot.deaths });
  };

  const onGameEvent = (event: GameEvent) => {
    if (event.event === 'HitConfirmed') {
      hud.triggerHitmarker(event.killed);
      app.triggerOutlineFlash({ killed: event.killed });
      return;
    }
    if (event.event === 'ProjectileSpawn') {
      if (localConnectionId && event.ownerId === localConnectionId) {
        return;
      }
      app.spawnProjectileVfx({
        origin: { x: event.posX, y: event.posY, z: event.posZ },
        velocity: { x: event.velX, y: event.velY, z: event.velZ },
        ttl: event.ttl,
        projectileId: event.projectileId
      });
      return;
    }
    if (event.event === 'ProjectileRemove') {
      app.removeProjectileVfx(event.projectileId);
    }
  };

  const onPong = (pong: Pong) => {
    const now = window.performance.now();
    if (Number.isFinite(pong.clientTimeMs)) {
      lastRttMs = Math.max(0, now - pong.clientTimeMs);
      updateMetrics();
    }
  };

  void connectIfConfigured({
    signalingUrl,
    signalingAuthToken,
    logger,
    onSnapshot,
    onPong,
    onGameEvent
  })
    .then((session) => {
      if (!session) {
        return;
      }
      localConnectionId = session.connectionId;
      app.setOutlineTeam(resolveTeamIndex(localConnectionId));
      const keyframeDetail =
        session.serverHello.snapshotKeyframeInterval !== undefined
          ? ` (kf ${session.serverHello.snapshotKeyframeInterval})`
          : '';
      status.setState('connected', `conn ${session.connectionId}${keyframeDetail}`);
      app.setSnapshotRate(session.serverHello.snapshotRate);
      app.setTickRate(session.serverHello.serverTickRate);
      snapshotKeyframeInterval = session.serverHello.snapshotKeyframeInterval ?? null;
      updateMetrics();
      hud.setWeaponCooldown(app.getWeaponCooldown(currentWeaponSlot));
      hud.setAbilityCooldowns(app.getAbilityCooldowns());

        sampler = createInputSampler({ target: window, bindings: currentBindings });
        const sender = createInputSender({
          channel: session.unreliableChannel,
          sampler,
          tickRate: session.serverHello.serverTickRate,
          logger,
          onSend: (cmd) => {
            const lookX = invertLookX ? -cmd.lookDeltaX : cmd.lookDeltaX;
            const lookY = invertLookY ? -cmd.lookDeltaY : cmd.lookDeltaY;
            cmd.lookDeltaX = lookX;
            cmd.lookDeltaY = lookY;
            if (shouldApplyLook()) {
              app.applyLookDelta(lookX, lookY);
            }
            const angles = app.getLookAngles();
            cmd.viewYaw = angles.yaw;
            cmd.viewPitch = angles.pitch;
            applyMovementYaw(cmd, cmd.viewYaw);
            const nextSlot = resolveWeaponSlot(cmd.weaponSlot);
            cmd.weaponSlot = nextSlot;
            if (nextSlot !== currentWeaponSlot) {
              currentWeaponSlot = nextSlot;
              hud.setWeapon(currentWeaponSlot, resolveWeaponLabel(currentWeaponSlot));
              app.setWeaponViewmodel(WEAPON_DEFS[currentWeaponSlot]?.id);
            }
            hud.setWeaponCooldown(app.getWeaponCooldown(currentWeaponSlot));
            app.recordInput(cmd);
            hud.setAbilityCooldowns(app.getAbilityCooldowns());
          }
        });
      sender.start();

      const sendPing = () => {
        if (session.unreliableChannel.readyState !== 'open') {
          return;
        }
        const now = window.performance.now();
        session.unreliableChannel.send(buildPing(now));
      };
      sendPing();
      const pingInterval = window.setInterval(sendPing, 1000);
      const metricsInterval = window.setInterval(updateMetrics, 250);

      const cleanup = () => {
        sender.stop();
        sampler?.dispose();
        sampler = null;
        window.clearInterval(pingInterval);
        window.clearInterval(metricsInterval);
        window.removeEventListener('beforeunload', cleanup);
      };
      window.addEventListener('beforeunload', cleanup);
    })
    .catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      status.setState('error', detail);
      console.error('network bootstrap failed', error);
    });
}
