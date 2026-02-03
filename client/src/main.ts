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
import { buildClientHello, buildPing } from './net/protocol';
import type { GameEvent, PlayerProfile as NetPlayerProfile, Pong, StateSnapshot } from './net/protocol';
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
import { loadCharacterCatalog } from './characters/catalog';
import { createPrejoinOverlay } from './ui/prejoin';
import type { LocalPlayerProfile } from './profile/types';
import { loadProfile, saveProfile } from './profile/storage';
import { createRemoteAvatarManager } from './players/remote_avatars';

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
const remoteAvatars = createRemoteAvatarManager({ three, scene: app.state.scene });
let remotePruneInterval: number | null = null;
let localConnectionId: string | null = null;
let localAvatarActive = false;
let lastLocalAvatarSample: { x: number; y: number; z: number; time: number } | null = null;
const debugLocalAvatar = (import.meta.env?.VITE_DEBUG_LOCAL_AVATAR ?? '') === 'true';
const createLocalAvatarDebug = (doc: Document) => {
  const panel = doc.createElement('div');
  panel.id = 'local-avatar-debug';
  panel.style.position = 'fixed';
  panel.style.right = '12px';
  panel.style.bottom = '12px';
  panel.style.padding = '10px 12px';
  panel.style.background = 'rgba(10, 14, 20, 0.75)';
  panel.style.border = '1px solid rgba(255, 255, 255, 0.15)';
  panel.style.borderRadius = '10px';
  panel.style.color = '#e4ecf8';
  panel.style.font = '12px/1.4 system-ui, sans-serif';
  panel.style.zIndex = '40';
  panel.style.whiteSpace = 'pre';
  panel.textContent = 'local avatar debug';
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
  remoteAvatars.update(deltaSeconds);
});
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
  status.setState('idle', 'Awaiting pre-join');
  const storedProfile = loadProfile(window.localStorage);
  const playerProfiles = new Map<string, NetPlayerProfile>();
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
    let snapshotKeyframeInterval: number | null = null;

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
      const isLocalSnapshot =
        Boolean(localConnectionId) &&
        Boolean(snapshot.clientId) &&
        snapshot.clientId === localConnectionId;
      if (snapshot.clientId && !isLocalSnapshot) {
        remoteAvatars.upsertSnapshot(snapshot, now);
      }
      if (localConnectionId && snapshot.clientId && snapshot.clientId !== localConnectionId) {
        return;
      }
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

    return connectIfConfigured({
      signalingUrl,
      signalingAuthToken,
      logger,
      buildClientHello: (sessionToken, connectionId) =>
        buildClientHello(sessionToken, connectionId, 'dev', {
          nickname: profile.nickname,
          characterId: profile.characterId
        }),
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
          localAvatarDebug?.dispose();
          window.clearInterval(pingInterval);
          window.clearInterval(metricsInterval);
          if (remotePruneInterval !== null) {
            window.clearInterval(remotePruneInterval);
            remotePruneInterval = null;
          }
          remoteAvatars.dispose();
          window.removeEventListener('beforeunload', cleanup);
        };
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
        console.error('network bootstrap failed', error);
      });
  };

  void (async () => {
    const catalog = await loadCharacterCatalog();
    remoteAvatars.setCatalog(catalog);
    const prejoin = createPrejoinOverlay(document, {
      catalog,
      initialProfile: storedProfile ?? undefined,
      onSubmit: (profile) => saveProfile(window.localStorage, profile)
    });
    const profile = await prejoin.waitForSubmit();
    // Free the WebGL context used for the 3D preview so the main renderer stays stable.
    prejoin.dispose();
    await bootstrapNetwork(profile);
  })().catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    status.setState('error', detail);
    console.error('pre-join bootstrap failed', error);
  });
}
