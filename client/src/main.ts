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
import { createScoreboardOverlay } from './ui/scoreboard';
import { createSettingsOverlay } from './ui/settings';
import { loadMetricsVisibility, saveMetricsVisibility } from './ui/metrics_settings';
import { createAudioManager } from './audio/manager';
import { loadAudioSettings, saveAudioSettings } from './audio/settings';
import { loadWasmSimFromUrl } from './sim/wasm';
import { createWasmPredictionSim } from './sim/wasm_adapter';
import { runWasmParityCheck } from './sim/parity';
import { SIM_CONFIG, resolveEyeHeight, resolvePlayerHeight } from './sim/config';
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
import { createPickupManager } from './pickups/manager';

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
const FOOTSTEP_STRIDE = resolvePlayerHeight(SIM_CONFIG);
const RECONNECT_DELAY_MS = 1000;
const PROJECTILE_IMPACT_SIZE_DEFAULT = 0.5;
const PROJECTILE_IMPACT_TTL_DEFAULT = 0.16;
const GRENADE_PROJECTILE_IMPACT_SIZE = 1.35;
const GRENADE_PROJECTILE_IMPACT_TTL = 0.32;
const GRENADE_HIT_EXPLOSION_FRAME_STEP_MS = 50;
const KILL_FEED_ENTRY_TTL_MS = 5000;
const KILL_FEED_FADE_MS = 500;
const SKY_DECAL_FADE_SECONDS = 3;
const SKY_DECAL_HEIGHT_METERS = 8;
const SKY_DECAL_VERTICAL_DELTA_METERS = 1;
const AUTHORITATIVE_WORLD_HIT_SURFACE_OFFSET_METERS = 0.005;
const FX_DEDUP_TTL_TICKS = 600;
const FX_DEDUP_MAX_ENTRIES = 4096;
const GRENADE_HIT_EXPLOSION_FRAME_URLS = [
  new URL('../../tmp/Explosion/explosion00.png', import.meta.url).href,
  new URL('../../tmp/Explosion/explosion01.png', import.meta.url).href,
  new URL('../../tmp/Explosion/explosion02.png', import.meta.url).href,
  new URL('../../tmp/Explosion/explosion03.png', import.meta.url).href,
  new URL('../../tmp/Explosion/explosion04.png', import.meta.url).href,
  new URL('../../tmp/Explosion/explosion05.png', import.meta.url).href,
  new URL('../../tmp/Explosion/explosion06.png', import.meta.url).href,
  new URL('../../tmp/Explosion/explosion07.png', import.meta.url).href,
  new URL('../../tmp/Explosion/explosion08.png', import.meta.url).href
];

type Vec3 = { x: number; y: number; z: number };
type TraceWorldHitInput = {
  dir: Vec3;
  normal: Vec3;
  hitKind?: number;
  hitDistance: number;
  hitPos: Vec3;
  muzzlePos: Vec3 | null;
};
type TraceWorldHitResult = { position: Vec3; normal: Vec3 };
type ImpactWorldHitInput = { position: Vec3; normal: Vec3 };
type StaticSurfaceHitSource = 'mesh' | 'bounds';
type ProjectionTelemetryCandidate = {
  score: number;
  source: StaticSurfaceHitSource;
  objectName: string | null;
  objectUuid: string | null;
  position: Vec3;
  normal: Vec3;
  normalDot?: number;
};
type ProjectionTelemetryEvent = {
  mode: 'trace' | 'impact';
  status: 'projected' | 'no_candidates' | 'invalid_input';
  reason?: string;
  candidateCount: number;
  alignedCount?: number;
  requiredAlignment?: number;
  selected?: ProjectionTelemetryCandidate;
  input: {
    hitKind?: number;
    hitDistance?: number;
    hitPos?: Vec3;
    muzzlePos?: Vec3 | null;
    dir?: Vec3;
    position?: Vec3;
    normal: Vec3;
  };
  timestampMs: number;
};
type DecalDebugReport = import('./net/input_cmd').DecalDebugReport;

const dotVec = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

const normalizeVec = (v: Vec3): Vec3 => {
  const len = Math.hypot(v.x, v.y, v.z);
  if (!Number.isFinite(len) || len <= 1e-8) {
    return { x: 0, y: 0, z: -1 };
  }
  return { x: v.x / len, y: v.y / len, z: v.z / len };
};

const createGrenadeHitExplosionOverlay = (doc: Document, win: Window) => {
  const host = doc.getElementById('app') ?? doc.body;
  const overlay = doc.createElement('div');
  overlay.className = 'explosion-overlay';
  overlay.dataset.visible = 'false';
  const frame = doc.createElement('img');
  frame.className = 'explosion-overlay-frame';
  frame.alt = '';
  frame.decoding = 'async';
  frame.src = GRENADE_HIT_EXPLOSION_FRAME_URLS[0] ?? '';
  overlay.appendChild(frame);
  host.appendChild(overlay);

  let frameTimer: number | null = null;
  const clearFrameTimer = () => {
    if (frameTimer !== null) {
      win.clearTimeout(frameTimer);
      frameTimer = null;
    }
  };

  const trigger = () => {
    if (GRENADE_HIT_EXPLOSION_FRAME_URLS.length === 0) {
      return;
    }
    clearFrameTimer();
    overlay.dataset.visible = 'true';
    let frameIndex = 0;
    const advance = () => {
      frame.src = GRENADE_HIT_EXPLOSION_FRAME_URLS[frameIndex] ?? GRENADE_HIT_EXPLOSION_FRAME_URLS[0];
      frameIndex += 1;
      if (frameIndex >= GRENADE_HIT_EXPLOSION_FRAME_URLS.length) {
        overlay.dataset.visible = 'false';
        frameTimer = null;
        return;
      }
      frameTimer = win.setTimeout(advance, GRENADE_HIT_EXPLOSION_FRAME_STEP_MS);
    };
    advance();
  };

  return { trigger };
};

const createKillFeedOverlay = (doc: Document, win: Window) => {
  const host = doc.getElementById('app') ?? doc.body;
  const overlay = doc.createElement('div');
  overlay.className = 'kill-feed-overlay';
  overlay.dataset.shift = 'false';
  host.appendChild(overlay);

  const fadeTimers = new Map<HTMLElement, number>();
  const removeTimers = new Map<HTMLElement, number>();

  const clearEntryTimers = (entry: HTMLElement) => {
    const fadeTimer = fadeTimers.get(entry);
    if (fadeTimer !== undefined) {
      win.clearTimeout(fadeTimer);
      fadeTimers.delete(entry);
    }
    const removeTimer = removeTimers.get(entry);
    if (removeTimer !== undefined) {
      win.clearTimeout(removeTimer);
      removeTimers.delete(entry);
    }
  };

  const removeEntry = (entry: HTMLElement) => {
    clearEntryTimers(entry);
    entry.remove();
  };

  const push = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    const entry = doc.createElement('div');
    entry.className = 'kill-feed-entry';
    entry.textContent = trimmed;
    overlay.appendChild(entry);

    while (overlay.childElementCount > 6) {
      const oldest = overlay.firstElementChild as HTMLElement | null;
      if (!oldest) {
        break;
      }
      removeEntry(oldest);
    }

    const fadeDelay = Math.max(0, KILL_FEED_ENTRY_TTL_MS - KILL_FEED_FADE_MS);
    const fadeTimer = win.setTimeout(() => {
      entry.classList.add('is-fading');
      fadeTimers.delete(entry);
    }, fadeDelay);
    fadeTimers.set(entry, fadeTimer);

    const removeTimer = win.setTimeout(() => {
      removeEntry(entry);
    }, KILL_FEED_ENTRY_TTL_MS);
    removeTimers.set(entry, removeTimer);
  };

  const dispose = () => {
    for (const timer of fadeTimers.values()) {
      win.clearTimeout(timer);
    }
    for (const timer of removeTimers.values()) {
      win.clearTimeout(timer);
    }
    fadeTimers.clear();
    removeTimers.clear();
    overlay.remove();
  };

  return { element: overlay, push, dispose };
};

const isFiniteVec3 = (v: Vec3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

const createWorldSurfaceProjector = (
  getSceneAndCamera: () => { scene: THREE.Scene | null; camera: THREE.Camera | null },
  onProjectionTelemetry?: (event: ProjectionTelemetryEvent) => void
) => {
  type StaticSurfaceRaycastHit = TraceWorldHitResult & {
    distance: number;
    source: StaticSurfaceHitSource;
    objectName: string | null;
    objectUuid: string | null;
  };
  const raycaster = new THREE.Raycaster();
  const rayOrigin = new THREE.Vector3();
  const rayDir = new THREE.Vector3();
  const boxHitPoint = new THREE.Vector3();
  const boxWorld = new THREE.Box3();
  const boxWorldCenter = new THREE.Vector3();
  const axisNormal = new THREE.Vector3();
  const toHitVec = new THREE.Vector3();
  const WORLD_SURFACE_RAY_MAX_METERS = 160;
  const WORLD_SURFACE_RAY_EXTRA_METERS = 24;
  const WORLD_SURFACE_DIRECT_BACKTRACK_METERS = 0.35;
  const WORLD_SURFACE_SECONDARY_BACKTRACK_METERS = 1.1;
  const WORLD_SURFACE_DIRECT_MARGIN_METERS = 0.5;
  const WORLD_SURFACE_NORMAL_PROBE_OFFSET_METERS = 0.65;
  const WORLD_SURFACE_NORMAL_PROBE_RANGE_METERS = 5.0;
  const WORLD_SURFACE_IMPACT_PROBE_OFFSET_METERS = 0.65;
  const WORLD_SURFACE_IMPACT_PROBE_RANGE_METERS = 5.0;
  const emitProjectionTelemetry = (event: ProjectionTelemetryEvent) => {
    if (onProjectionTelemetry) {
      onProjectionTelemetry(event);
    }
  };

  const isStaticSurfaceObject = (object: THREE.Object3D | null | undefined) => {
    let current: THREE.Object3D | null = object ?? null;
    const visited = new Set<THREE.Object3D>();
    while (current) {
      if (visited.has(current)) {
        break;
      }
      visited.add(current);
      if ((current.userData as { afpsStaticSurface?: unknown } | undefined)?.afpsStaticSurface === true) {
        return true;
      }
      current = current.parent;
    }
    return false;
  };

  const toRayHit = (
    hit: THREE.Intersection,
    dir: Vec3
  ): StaticSurfaceRaycastHit | null => {
    const hitObject = hit.object as (THREE.Object3D & { isMesh?: boolean }) | null | undefined;
    if (!hitObject || hitObject.isMesh !== true) {
      return null;
    }
    if (!isStaticSurfaceObject(hitObject)) {
      return null;
    }
    if (!Number.isFinite(hit.distance) || hit.distance < 0) {
      return null;
    }
    const point = hit.point;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
      return null;
    }
    let normal = normalizeVec({ x: -dir.x, y: -dir.y, z: -dir.z });
    if (hit.face?.normal && hitObject.matrixWorld) {
      const worldNormal = hit.face.normal.clone().transformDirection(hitObject.matrixWorld);
      normal = normalizeVec({ x: worldNormal.x, y: worldNormal.y, z: worldNormal.z });
    }
    if (dotVec(normal, dir) > 0) {
      normal = { x: -normal.x, y: -normal.y, z: -normal.z };
    }
    return {
      position: { x: point.x, y: point.y, z: point.z },
      normal,
      distance: hit.distance,
      source: 'mesh',
      objectName: typeof hitObject.name === 'string' && hitObject.name.length > 0 ? hitObject.name : null,
      objectUuid: typeof hitObject.uuid === 'string' && hitObject.uuid.length > 0 ? hitObject.uuid : null
    };
  };

  const castIntersections = (origin: Vec3, dir: Vec3, far: number) => {
    if (!isFiniteVec3(origin) || !isFiniteVec3(dir) || !Number.isFinite(far) || far <= 0) {
      return [] as THREE.Intersection[];
    }
    const { scene, camera } = getSceneAndCamera();
    if (!scene) {
      return [] as THREE.Intersection[];
    }
    const sceneChildren = Array.isArray((scene as { children?: unknown }).children)
      ? ((scene as { children: THREE.Object3D[] }).children as THREE.Object3D[])
      : [];
    const staticRoots = sceneChildren.filter((child) => isStaticSurfaceObject(child));
    const primaryTargets = staticRoots.length > 0 ? staticRoots : sceneChildren;
    if (primaryTargets.length === 0) {
      return [] as THREE.Intersection[];
    }
    rayOrigin.set(origin.x, origin.y, origin.z);
    rayDir.set(dir.x, dir.y, dir.z);
    if (rayDir.lengthSq() <= 1e-8) {
      return [] as THREE.Intersection[];
    }
    rayDir.normalize();
    raycaster.near = 0;
    raycaster.far = far;
    if (camera && (camera as { isCamera?: boolean }).isCamera) {
      raycaster.camera = camera;
    } else {
      raycaster.camera = null;
    }
    raycaster.set(rayOrigin, rayDir);
    try {
      const primaryHits = raycaster.intersectObjects(primaryTargets, true);
      if (primaryHits.length > 0 || primaryTargets === sceneChildren) {
        return primaryHits;
      }
      return raycaster.intersectObjects(sceneChildren, true);
    } catch {
      return [] as THREE.Intersection[];
    }
  };

  const raycastStaticSurfaceBoundsFallback = (
    origin: Vec3,
    dir: Vec3,
    maxDistance: number
  ): StaticSurfaceRaycastHit | null => {
    const { scene } = getSceneAndCamera();
    if (!scene) {
      return null;
    }
    const sceneChildren = Array.isArray((scene as { children?: unknown }).children)
      ? ((scene as { children: THREE.Object3D[] }).children as THREE.Object3D[])
      : [];
    const staticRoots = sceneChildren.filter((child) => isStaticSurfaceObject(child));
    if (staticRoots.length === 0) {
      return null;
    }
    const safeDir = normalizeVec(dir);
    rayOrigin.set(origin.x, origin.y, origin.z);
    rayDir.set(safeDir.x, safeDir.y, safeDir.z);
    if (rayDir.lengthSq() <= 1e-8) {
      return null;
    }
    rayDir.normalize();
    const ray = raycaster.ray;
    ray.origin.copy(rayOrigin);
    ray.direction.copy(rayDir);
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestPosition: Vec3 | null = null;
    let bestNormal: Vec3 | null = null;
    let bestObjectName: string | null = null;
    let bestObjectUuid: string | null = null;
    const maxDistanceSq = maxDistance * maxDistance;
    const BOX_FACE_EPS = 1e-3;
    for (const root of staticRoots) {
      root.traverse((node) => {
        const mesh = node as THREE.Mesh | null;
        if (!mesh || mesh.isMesh !== true || !isStaticSurfaceObject(mesh)) {
          return;
        }
        const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
        if (!geometry) {
          return;
        }
        if (geometry.boundingBox === null) {
          geometry.computeBoundingBox();
        }
        const localBox = geometry.boundingBox;
        if (!localBox) {
          return;
        }
        boxWorld.copy(localBox).applyMatrix4(mesh.matrixWorld);
        const minX = boxWorld.min.x;
        const maxX = boxWorld.max.x;
        const minY = boxWorld.min.y;
        const maxY = boxWorld.max.y;
        const minZ = boxWorld.min.z;
        const maxZ = boxWorld.max.z;
        if (!(maxX > minX && maxY > minY && maxZ > minZ)) {
          return;
        }
        const hit = ray.intersectBox(boxWorld, boxHitPoint);
        if (!hit) {
          return;
        }
        toHitVec.subVectors(hit, ray.origin);
        const distanceSq = toHitVec.lengthSq();
        if (!Number.isFinite(distanceSq) || distanceSq > maxDistanceSq) {
          return;
        }
        const distance = Math.sqrt(distanceSq);
        if (!Number.isFinite(distance) || distance < 0 || distance >= bestDistance) {
          return;
        }
        axisNormal.set(0, 0, 0);
        const dxMin = Math.abs(hit.x - minX);
        const dxMax = Math.abs(hit.x - maxX);
        const dyMin = Math.abs(hit.y - minY);
        const dyMax = Math.abs(hit.y - maxY);
        const dzMin = Math.abs(hit.z - minZ);
        const dzMax = Math.abs(hit.z - maxZ);
        let axis = 'x';
        let sign = dxMin <= dxMax ? -1 : 1;
        let bestAxisDelta = Math.min(dxMin, dxMax);
        const yDelta = Math.min(dyMin, dyMax);
        if (yDelta < bestAxisDelta) {
          axis = 'y';
          sign = dyMin <= dyMax ? -1 : 1;
          bestAxisDelta = yDelta;
        }
        const zDelta = Math.min(dzMin, dzMax);
        if (zDelta < bestAxisDelta) {
          axis = 'z';
          sign = dzMin <= dzMax ? -1 : 1;
          bestAxisDelta = zDelta;
        }
        if (bestAxisDelta > BOX_FACE_EPS) {
          boxWorld.getCenter(boxWorldCenter);
          axisNormal.subVectors(hit, boxWorldCenter);
          if (Math.abs(axisNormal.x) >= Math.abs(axisNormal.y) && Math.abs(axisNormal.x) >= Math.abs(axisNormal.z)) {
            axis = 'x';
            sign = axisNormal.x >= 0 ? 1 : -1;
          } else if (Math.abs(axisNormal.y) >= Math.abs(axisNormal.x) && Math.abs(axisNormal.y) >= Math.abs(axisNormal.z)) {
            axis = 'y';
            sign = axisNormal.y >= 0 ? 1 : -1;
          } else {
            axis = 'z';
            sign = axisNormal.z >= 0 ? 1 : -1;
          }
        }
        if (axis === 'x') {
          axisNormal.set(sign, 0, 0);
        } else if (axis === 'y') {
          axisNormal.set(0, sign, 0);
        } else {
          axisNormal.set(0, 0, sign);
        }
        let normal = normalizeVec({ x: axisNormal.x, y: axisNormal.y, z: axisNormal.z });
        if (dotVec(normal, safeDir) > 0) {
          normal = { x: -normal.x, y: -normal.y, z: -normal.z };
        }
        bestDistance = distance;
        bestPosition = { x: hit.x, y: hit.y, z: hit.z };
        bestNormal = normal;
        bestObjectName = typeof mesh.name === 'string' && mesh.name.length > 0 ? mesh.name : null;
        bestObjectUuid = typeof mesh.uuid === 'string' && mesh.uuid.length > 0 ? mesh.uuid : null;
      });
    }
    if (bestPosition && bestNormal) {
      return {
        position: bestPosition,
        normal: bestNormal,
        distance: bestDistance,
        source: 'bounds',
        objectName: bestObjectName,
        objectUuid: bestObjectUuid
      };
    }
    return null;
  };

  const raycastStaticSurfaceDetailed = (
    origin: Vec3,
    dir: Vec3,
    maxDistance = WORLD_SURFACE_RAY_MAX_METERS
  ): StaticSurfaceRaycastHit | null => {
    const safeDir = normalizeVec(dir);
    const hits = castIntersections(origin, safeDir, maxDistance);
    for (const hit of hits) {
      const parsed = toRayHit(hit, safeDir);
      if (parsed) {
        return parsed;
      }
    }
    return raycastStaticSurfaceBoundsFallback(origin, safeDir, maxDistance);
  };
  const raycastStaticSurface = (
    origin: Vec3,
    dir: Vec3,
    maxDistance = WORLD_SURFACE_RAY_MAX_METERS
  ): (TraceWorldHitResult & { distance: number }) | null => {
    const hit = raycastStaticSurfaceDetailed(origin, dir, maxDistance);
    if (!hit) {
      return null;
    }
    return {
      position: hit.position,
      normal: hit.normal,
      distance: hit.distance
    };
  };

  const projectTraceWorldHit = (trace: TraceWorldHitInput): TraceWorldHitResult | null => {
    if (!trace.muzzlePos || !isFiniteVec3(trace.muzzlePos)) {
      emitProjectionTelemetry({
        mode: 'trace',
        status: 'invalid_input',
        reason: 'missing_muzzle_pos',
        candidateCount: 0,
        input: {
          hitKind: trace.hitKind,
          hitDistance: trace.hitDistance,
          hitPos: trace.hitPos,
          muzzlePos: trace.muzzlePos,
          dir: trace.dir,
          normal: trace.normal
        },
        timestampMs: Date.now()
      });
      return null;
    }
    const muzzle = trace.muzzlePos;
    const dir = normalizeVec(trace.dir);
    const maxDistance =
      Number.isFinite(trace.hitDistance) && trace.hitDistance > 0
        ? Math.min(WORLD_SURFACE_RAY_MAX_METERS, trace.hitDistance + WORLD_SURFACE_RAY_EXTRA_METERS)
        : WORLD_SURFACE_RAY_MAX_METERS;
    if (!Number.isFinite(maxDistance) || maxDistance <= 0) {
      emitProjectionTelemetry({
        mode: 'trace',
        status: 'invalid_input',
        reason: 'invalid_max_distance',
        candidateCount: 0,
        input: {
          hitKind: trace.hitKind,
          hitDistance: trace.hitDistance,
          hitPos: trace.hitPos,
          muzzlePos: trace.muzzlePos,
          dir: trace.dir,
          normal: trace.normal
        },
        timestampMs: Date.now()
      });
      return null;
    }

    const directCandidates: Array<ProjectionTelemetryCandidate> = [];
    const hasServerHit = Math.floor(trace.hitKind ?? 0) === 1;
    const serverNormalRaw = normalizeVec(trace.normal);
    const serverNormalLen = Math.hypot(trace.normal.x, trace.normal.y, trace.normal.z);
    const useServerNormal = hasServerHit && Number.isFinite(serverNormalLen) && serverNormalLen > 0.3;
    const addDirectCandidate = (origin: Vec3, rayDir: Vec3, far: number) => {
      const hit = raycastStaticSurfaceDetailed(origin, rayDir, far);
      if (!hit) {
        return;
      }
      const toHit = {
        x: hit.position.x - muzzle.x,
        y: hit.position.y - muzzle.y,
        z: hit.position.z - muzzle.z
      };
      const along = dotVec(toHit, dir);
      if (
        !Number.isFinite(along) ||
        along < -(WORLD_SURFACE_DIRECT_BACKTRACK_METERS + WORLD_SURFACE_DIRECT_MARGIN_METERS) ||
        along > maxDistance + WORLD_SURFACE_DIRECT_MARGIN_METERS
      ) {
        return;
      }
      const hasServerDepth = Number.isFinite(trace.hitDistance) && trace.hitDistance > 0;
      const depthError = hasServerDepth ? Math.abs(along - trace.hitDistance) : 0;
      const depthWeight = hasServerHit ? 1.0 : 0.08;
      const behindPenalty = along < 0 ? Math.abs(along) * 12 : 0;
      let normalPenalty = 0;
      if (useServerNormal) {
        const dot = Math.max(-1, Math.min(1, dotVec(hit.normal, serverNormalRaw)));
        // For authoritative world hits, reject projection candidates with flipped/out-of-plane normals.
        normalPenalty = (1 - dot) * 2.0;
      }
      const score = Math.max(0, along) + depthError * depthWeight + behindPenalty + normalPenalty;
      directCandidates.push({
        score,
        position: hit.position,
        normal: hit.normal,
        source: hit.source,
        objectName: hit.objectName,
        objectUuid: hit.objectUuid
      });
    };

    addDirectCandidate(muzzle, dir, maxDistance);
    addDirectCandidate(
      {
        x: muzzle.x - dir.x * WORLD_SURFACE_DIRECT_BACKTRACK_METERS,
        y: muzzle.y - dir.y * WORLD_SURFACE_DIRECT_BACKTRACK_METERS,
        z: muzzle.z - dir.z * WORLD_SURFACE_DIRECT_BACKTRACK_METERS
      },
      dir,
      maxDistance + WORLD_SURFACE_DIRECT_BACKTRACK_METERS
    );
    addDirectCandidate(
      {
        x: muzzle.x - dir.x * WORLD_SURFACE_SECONDARY_BACKTRACK_METERS,
        y: muzzle.y - dir.y * WORLD_SURFACE_SECONDARY_BACKTRACK_METERS,
        z: muzzle.z - dir.z * WORLD_SURFACE_SECONDARY_BACKTRACK_METERS
      },
      dir,
      maxDistance + WORLD_SURFACE_SECONDARY_BACKTRACK_METERS
    );
    if (isFiniteVec3(trace.hitPos)) {
      const snapProbeRange = 1.4;
      const snapProbeOffset = 0.45;
      addDirectCandidate(
        {
          x: trace.hitPos.x + dir.x * snapProbeOffset,
          y: trace.hitPos.y + dir.y * snapProbeOffset,
          z: trace.hitPos.z + dir.z * snapProbeOffset
        },
        { x: -dir.x, y: -dir.y, z: -dir.z },
        snapProbeRange
      );
      addDirectCandidate(
        {
          x: trace.hitPos.x - dir.x * snapProbeOffset,
          y: trace.hitPos.y - dir.y * snapProbeOffset,
          z: trace.hitPos.z - dir.z * snapProbeOffset
        },
        dir,
        snapProbeRange
      );
      if (useServerNormal) {
        const probeNormal = serverNormalRaw;
        const probeFar = WORLD_SURFACE_NORMAL_PROBE_RANGE_METERS;
        const probeOffset = WORLD_SURFACE_NORMAL_PROBE_OFFSET_METERS;
        addDirectCandidate(
          {
            x: trace.hitPos.x + probeNormal.x * probeOffset,
            y: trace.hitPos.y + probeNormal.y * probeOffset,
            z: trace.hitPos.z + probeNormal.z * probeOffset
          },
          { x: -probeNormal.x, y: -probeNormal.y, z: -probeNormal.z },
          probeFar
        );
        addDirectCandidate(
          {
            x: trace.hitPos.x - probeNormal.x * probeOffset,
            y: trace.hitPos.y - probeNormal.y * probeOffset,
            z: trace.hitPos.z - probeNormal.z * probeOffset
          },
          { x: probeNormal.x, y: probeNormal.y, z: probeNormal.z },
          probeFar
        );
      }
    }

    if (directCandidates.length > 0) {
      directCandidates.sort((a, b) => a.score - b.score);
      const best = directCandidates[0]!;
      emitProjectionTelemetry({
        mode: 'trace',
        status: 'projected',
        candidateCount: directCandidates.length,
        selected: best,
        input: {
          hitKind: trace.hitKind,
          hitDistance: trace.hitDistance,
          hitPos: trace.hitPos,
          muzzlePos: trace.muzzlePos,
          dir: trace.dir,
          normal: trace.normal
        },
        timestampMs: Date.now()
      });
      return {
        position: best.position,
        normal: best.normal
      };
    }
    emitProjectionTelemetry({
      mode: 'trace',
      status: 'no_candidates',
      reason: 'no_surface_hit',
      candidateCount: 0,
      input: {
        hitKind: trace.hitKind,
        hitDistance: trace.hitDistance,
        hitPos: trace.hitPos,
        muzzlePos: trace.muzzlePos,
        dir: trace.dir,
        normal: trace.normal
      },
      timestampMs: Date.now()
    });
    return null;
  };

  const projectImpactWorldHit = (impact: ImpactWorldHitInput): TraceWorldHitResult | null => {
    if (!isFiniteVec3(impact.position) || !isFiniteVec3(impact.normal)) {
      emitProjectionTelemetry({
        mode: 'impact',
        status: 'invalid_input',
        reason: 'invalid_impact_input',
        candidateCount: 0,
        input: {
          position: impact.position,
          normal: impact.normal
        },
        timestampMs: Date.now()
      });
      return null;
    }
    const inputNormal = normalizeVec(impact.normal);
    const inputNormalLen = Math.hypot(impact.normal.x, impact.normal.y, impact.normal.z);
    if (!Number.isFinite(inputNormalLen) || inputNormalLen <= 1e-8) {
      emitProjectionTelemetry({
        mode: 'impact',
        status: 'invalid_input',
        reason: 'invalid_impact_normal',
        candidateCount: 0,
        input: {
          position: impact.position,
          normal: impact.normal
        },
        timestampMs: Date.now()
      });
      return null;
    }

    const candidates: Array<ProjectionTelemetryCandidate> = [];
    const addCandidate = (origin: Vec3, rayDir: Vec3, range: number, extraPenalty = 0) => {
      const hit = raycastStaticSurfaceDetailed(origin, rayDir, range);
      if (!hit) {
        return;
      }
      const dx = hit.position.x - impact.position.x;
      const dy = hit.position.y - impact.position.y;
      const dz = hit.position.z - impact.position.z;
      const distanceFromHint = Math.hypot(dx, dy, dz);
      const normalDot = Math.max(-1, Math.min(1, dotVec(hit.normal, inputNormal)));
      const normalPenalty = (1 - normalDot) * 2.4;
      const normalYGap = Math.abs(hit.normal.y) - Math.abs(inputNormal.y);
      const upFacingMismatchPenalty = normalYGap > 0.3 ? normalYGap * 2.4 : 0;
      const score = distanceFromHint + normalPenalty + upFacingMismatchPenalty + extraPenalty;
      candidates.push({
        score,
        position: hit.position,
        normal: hit.normal,
        normalDot,
        source: hit.source,
        objectName: hit.objectName,
        objectUuid: hit.objectUuid
      });
    };

    const probeOffset = WORLD_SURFACE_IMPACT_PROBE_OFFSET_METERS;
    const probeRange = WORLD_SURFACE_IMPACT_PROBE_RANGE_METERS;
    const verticalOffsets = [0, -0.4, -0.9, -1.4, -2.0, -2.6, 0.45];
    for (const yOffset of verticalOffsets) {
      const shifted = {
        x: impact.position.x,
        y: impact.position.y + yOffset,
        z: impact.position.z
      };
      const heightPenalty = Math.abs(yOffset) * 0.06;
      addCandidate(
        {
          x: shifted.x + inputNormal.x * probeOffset,
          y: shifted.y + inputNormal.y * probeOffset,
          z: shifted.z + inputNormal.z * probeOffset
        },
        { x: -inputNormal.x, y: -inputNormal.y, z: -inputNormal.z },
        probeRange + Math.abs(yOffset) * 0.45,
        heightPenalty
      );
      addCandidate(
        {
          x: shifted.x - inputNormal.x * probeOffset,
          y: shifted.y - inputNormal.y * probeOffset,
          z: shifted.z - inputNormal.z * probeOffset
        },
        { x: inputNormal.x, y: inputNormal.y, z: inputNormal.z },
        probeRange + Math.abs(yOffset) * 0.45,
        heightPenalty
      );
      addCandidate(
        shifted,
        { x: -inputNormal.x, y: -inputNormal.y, z: -inputNormal.z },
        probeRange + Math.abs(yOffset) * 0.45,
        heightPenalty
      );
    }

    const slantedProbeDirs = [0.4, 0.9, 1.6]
      .map((down) => normalizeVec({ x: -inputNormal.x, y: -down, z: -inputNormal.z }))
      .filter((dir) => isFiniteVec3(dir));
    for (const rayDir of slantedProbeDirs) {
      addCandidate(impact.position, rayDir, probeRange + 2.5, 0.1);
      addCandidate(
        {
          x: impact.position.x + inputNormal.x * probeOffset,
          y: impact.position.y + inputNormal.y * probeOffset,
          z: impact.position.z + inputNormal.z * probeOffset
        },
        rayDir,
        probeRange + 2.5,
        0.1
      );
    }

    const tangent = normalizeVec({ x: -inputNormal.z, y: 0, z: inputNormal.x });
    const angledProbeDirs = [-0.65, -0.35, 0.35, 0.65]
      .map((blend) =>
        normalizeVec({
          x: -inputNormal.x + tangent.x * blend,
          y: -Math.abs(inputNormal.y) * 0.2,
          z: -inputNormal.z + tangent.z * blend
        })
      )
      .filter((dir) => isFiniteVec3(dir));
    for (const rayDir of angledProbeDirs) {
      addCandidate(impact.position, rayDir, probeRange + 2.0, 0.08);
      addCandidate(
        {
          x: impact.position.x + inputNormal.x * probeOffset,
          y: impact.position.y + inputNormal.y * probeOffset,
          z: impact.position.z + inputNormal.z * probeOffset
        },
        rayDir,
        probeRange + 2.0,
        0.08
      );
      addCandidate(
        {
          x: impact.position.x - inputNormal.x * probeOffset,
          y: impact.position.y - inputNormal.y * probeOffset,
          z: impact.position.z - inputNormal.z * probeOffset
        },
        rayDir,
        probeRange + 2.0,
        0.08
      );
    }

    if (candidates.length === 0) {
      emitProjectionTelemetry({
        mode: 'impact',
        status: 'no_candidates',
        reason: 'no_surface_hit',
        candidateCount: 0,
        input: {
          position: impact.position,
          normal: impact.normal
        },
        timestampMs: Date.now()
      });
      return null;
    }
    const requiredAlignment = Math.abs(inputNormal.y) < 0.4 ? 0.6 : 0.45;
    const aligned = candidates.filter((candidate) => (candidate.normalDot ?? -1) >= requiredAlignment);
    const scored = aligned.length > 0 ? aligned : candidates;
    scored.sort((a, b) => a.score - b.score);
    const best = scored[0]!;
    emitProjectionTelemetry({
      mode: 'impact',
      status: 'projected',
      candidateCount: candidates.length,
      alignedCount: aligned.length,
      requiredAlignment,
      selected: best,
      input: {
        position: impact.position,
        normal: impact.normal
      },
      timestampMs: Date.now()
    });
    return { position: best.position, normal: best.normal };
  };

  return {
    projectTraceWorldHit,
    projectImpactWorldHit,
    raycastStaticSurface
  };
};

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
const PROJECTION_TELEMETRY_HISTORY_LIMIT = 120;
const projectionTelemetryHistory: ProjectionTelemetryEvent[] = [];
let projectionTelemetryEnabled = false;
let projectionTelemetryDebugOverlayEnabled = false;
const isProjectionTelemetryEnabled = () => projectionTelemetryEnabled || projectionTelemetryDebugOverlayEnabled;
if (typeof window !== 'undefined') {
  const query = new URLSearchParams(window.location.search);
  projectionTelemetryEnabled =
    query.get('projectionDebug') === '1' || localStorageRef.getItem('afps.debug.projection') === '1';
}
const recordProjectionTelemetry = (event: ProjectionTelemetryEvent) => {
  projectionTelemetryHistory.push(event);
  if (projectionTelemetryHistory.length > PROJECTION_TELEMETRY_HISTORY_LIMIT) {
    projectionTelemetryHistory.splice(0, projectionTelemetryHistory.length - PROJECTION_TELEMETRY_HISTORY_LIMIT);
  }
  if (isProjectionTelemetryEnabled()) {
    console.debug(`[afps] projection ${event.mode}`, event);
  }
};
if (typeof window !== 'undefined') {
  (
    window as unknown as {
      __afpsProjectionTelemetry?: {
        enabled: () => boolean;
        setEnabled: (enabled: boolean) => void;
        getLast: () => ProjectionTelemetryEvent | null;
        getHistory: () => ProjectionTelemetryEvent[];
        clear: () => void;
      };
    }
  ).__afpsProjectionTelemetry = {
    enabled: () => isProjectionTelemetryEnabled(),
    setEnabled: (enabled: boolean) => {
      projectionTelemetryEnabled = enabled === true;
      localStorageRef.setItem('afps.debug.projection', projectionTelemetryEnabled ? '1' : '0');
    },
    getLast: () => projectionTelemetryHistory[projectionTelemetryHistory.length - 1] ?? null,
    getHistory: () => projectionTelemetryHistory.slice(),
    clear: () => {
      projectionTelemetryHistory.length = 0;
    }
  };
}

const savedSensitivity = loadSensitivity(localStorageRef);
const lookSensitivity = savedSensitivity ?? getLookSensitivity();
const savedMetricsVisible = loadMetricsVisibility(localStorageRef);
let metricsVisible = savedMetricsVisible;
const savedAudioSettings = loadAudioSettings(localStorageRef);
const savedFxSettings = loadFxSettings(localStorageRef);
let fxSettings = { ...savedFxSettings, decals: true };
if (savedFxSettings.decals !== fxSettings.decals) {
  saveFxSettings(fxSettings, localStorageRef);
}
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
const worldSurfaceProjector = createWorldSurfaceProjector(() => {
  const scene = app.state.scene as THREE.Scene;
  const camera = (app.state.camera as unknown as THREE.Camera | null) ?? null;
  return { scene, camera };
}, recordProjectionTelemetry);
(window as unknown as { __afpsWorldSurface?: unknown }).__afpsWorldSurface = {
  projectTraceWorldHit: (trace: TraceWorldHitInput) => worldSurfaceProjector.projectTraceWorldHit(trace),
  projectImpactWorldHit: (impact: ImpactWorldHitInput) => worldSurfaceProjector.projectImpactWorldHit(impact),
  raycastStaticSurface: (origin: Vec3, dir: Vec3, maxDistance?: number) =>
    worldSurfaceProjector.raycastStaticSurface(origin, dir, maxDistance),
  getPlayerPose: () => app.getPlayerPose()
};
let nameplatesVisible = true;
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
remoteAvatars.setNameplatesVisible(nameplatesVisible);
const pickupManager = createPickupManager({ three, scene: app.state.scene });
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
const playerProfiles = new Map<string, NetPlayerProfile>();
const lastSnapshots = new Map<string, StateSnapshot>();
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
  const fallbackHeight = resolveEyeHeight(SIM_CONFIG);
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
  if (reconnecting) {
    return;
  }
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
  pickupManager.update(safeDelta, nowMs);
  casingPool.update(safeDelta);
  const cameraPos = app.state.camera?.position;
  if (cameraPos) {
    const cosPitch = Math.cos(viewAngles.pitch);
    const forward = {
      x: Math.sin(viewAngles.yaw) * cosPitch,
      y: -Math.sin(viewAngles.pitch),
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
    if (footstepDistance >= FOOTSTEP_STRIDE && nowMs - lastFootstepAt > 180) {
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
const grenadeHitExplosionOverlay = createGrenadeHitExplosionOverlay(document, window);
const killFeedOverlay = createKillFeedOverlay(document, window);
const hud = createHudOverlay(document);
const hudStore = createHudStore(hud);
const scoreboard = createScoreboardOverlay(document);
const resolvePlayerDisplayName = (id: string) => {
  const profile = playerProfiles.get(id);
  const nickname = profile?.nickname?.trim();
  if (nickname) {
    return nickname;
  }
  return id.length > 10 ? `${id.slice(0, 10)}...` : id;
};
const buildScoreboardRows = () => {
  const ids = new Set<string>();
  for (const id of playerProfiles.keys()) {
    ids.add(id);
  }
  for (const id of lastSnapshots.keys()) {
    ids.add(id);
  }
  if (localConnectionId) {
    ids.add(localConnectionId);
  }
  return Array.from(ids).map((id) => {
    const snapshot = lastSnapshots.get(id);
    return {
      id,
      name: resolvePlayerDisplayName(id),
      kills: snapshot?.kills ?? 0,
      isLocal: localConnectionId === id
    };
  });
};
const refreshScoreboard = () => {
  scoreboard.setRows(buildScoreboardRows());
};
refreshScoreboard();
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
const isGrenadeLauncherWeapon = (weapon: (typeof WEAPON_DEFS)[number] | null) =>
  Boolean(
    weapon &&
      (weapon.id === 'GRENADE_LAUNCHER' || weapon.id === 'launcher' || weapon.sfxProfile === 'GRENADE_LAUNCHER')
  );
const GRENADE_EXPLOSION_RADIUS_FALLBACK =
  WEAPON_DEFS.find((weapon) => isGrenadeLauncherWeapon(weapon))?.explosionRadius ?? 4.5;
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
    // App look pitch is positive when aiming downward.
    y: -Math.sin(angles.pitch),
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
    const enforced = { ...next, decals: true };
    fxSettings = enforced;
    saveFxSettings(enforced, localStorageRef);
    remoteAvatars.setAimDebugEnabled(enforced.aimDebug);
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
let scoreboardVisible = false;
const logPlayerCoords = () => {
  const pose = app.getPlayerPose();
  const x = Number.isFinite(pose.posX) ? pose.posX : 0;
  const y = Number.isFinite(pose.posY) ? pose.posY : 0;
  const z = Number.isFinite(pose.posZ) ? pose.posZ : 0;
  console.log('[afps] player coords', {
    x: Number(x.toFixed(3)),
    y: Number(y.toFixed(3)),
    z: Number(z.toFixed(3))
  });
};
const refreshStatusVisibility = () => {
  status.setVisible(debugOverlaysVisible || reconnecting);
  status.setMetricsVisible(debugOverlaysVisible || metricsVisible);
  status.element.dataset.reconnect = reconnecting ? 'true' : 'false';
  status.element.dataset.debug = debugOverlaysVisible ? 'true' : 'false';
};
const setDebugOverlaysVisible = (visible: boolean) => {
  const wasVisible = debugOverlaysVisible;
  debugOverlaysVisible = visible;
  projectionTelemetryDebugOverlayEnabled = visible;
  sampler?.reset?.();
  refreshStatusVisibility();
  hud.element.dataset.debug = visible ? 'true' : 'false';
  killFeedOverlay.element.dataset.shift = visible ? 'true' : 'false';
  localAvatarDebug?.setVisible?.(visible);
  if (visible && !wasVisible) {
    logPlayerCoords();
  }
};
setDebugOverlaysVisible(false);

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyP') {
    if (!event.repeat) {
      scoreboardVisible = true;
      refreshScoreboard();
      scoreboard.setVisible(true);
    }
    return;
  }
  if (event.code === 'KeyN') {
    if (!event.repeat) {
      nameplatesVisible = !nameplatesVisible;
      remoteAvatars.setNameplatesVisible(nameplatesVisible);
    }
    return;
  }
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

window.addEventListener('keyup', (event) => {
  if (event.code !== 'KeyP') {
    return;
  }
  scoreboardVisible = false;
  scoreboard.setVisible(false);
});

window.addEventListener('blur', () => {
  if (!scoreboardVisible) {
    return;
  }
  scoreboardVisible = false;
  scoreboard.setVisible(false);
});

if (!signalingUrl) {
  status.setState('disabled', 'Set VITE_SIGNALING_URL');
} else if (!signalingAuthToken) {
  status.setState('disabled', 'Set VITE_SIGNALING_AUTH_TOKEN');
} else {
  status.setState('idle', 'Awaiting pre-join');
  const storedProfile = loadProfile(localStorageRef);
  const queueReconnectAttempt = () => {
    if (reconnectTimer !== null) {
      return;
    }
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      if (!activeProfile) {
        reconnecting = false;
        refreshStatusVisibility();
        refreshHudLockState();
        return;
      }
      void bootstrapNetwork(activeProfile);
    }, RECONNECT_DELAY_MS);
  };
  const scheduleReconnect = (reason: string) => {
    if (!activeProfile) {
      return;
    }
    if (!reconnecting) {
      reconnecting = true;
      sampler?.reset?.();
      lastFire = false;
      adsTarget = 0;
      if (typeof document.exitPointerLock === 'function') {
        document.exitPointerLock();
      }
      if (activeSession) {
        activeSession.close();
        activeSession = null;
      }
      if (activeCleanup) {
        activeCleanup();
        activeCleanup = null;
      }
    }
    status.setState('connecting', `Reconnecting: ${reason}`);
    refreshStatusVisibility();
    refreshHudLockState();
    queueReconnectAttempt();
  };
  const handlePlayerProfile = (profile: NetPlayerProfile) => {
    playerProfiles.set(profile.clientId, profile);
    remoteAvatars.setProfile(profile);
    refreshScoreboard();
  };

  const bootstrapNetwork = async (profile: LocalPlayerProfile) => {
    status.setState('connecting', reconnecting ? `Reconnecting to ${signalingUrl}` : signalingUrl);
    refreshStatusVisibility();
    playerProfiles.clear();
    lastSnapshots.clear();
    localConnectionId = null;
    remoteAvatars.setLocalClientId(null);
    refreshScoreboard();
    remotePruneInterval = window.setInterval(() => remoteAvatars.prune(window.performance.now()), 2000);
    let lastSnapshotAt = 0;
    let lastRttMs = 0;
    let lastPredictionError = 0;
    let lastServerActivityAt = window.performance.now();
    let snapshotKeyframeInterval: number | null = null;
    let lastEventSampleAt = 0;
    let lastEventReceived = 0;
    let lastEventRateText = '--';
    const projectileWeaponSlotById = new Map<number, number>();
    const seenShotTraceByKey = new Map<string, number>();
    const seenProjectileImpactById = new Map<number, number>();
    const pendingDecalDebugReports: DecalDebugReport[] = [];
    const MAX_PENDING_DECAL_DEBUG_REPORTS = 64;
    const pruneSeenFx = (serverTick: number) => {
      if (!Number.isFinite(serverTick) || serverTick < 0) {
        return;
      }
      const minTick = serverTick - FX_DEDUP_TTL_TICKS;
      for (const [key, tick] of seenShotTraceByKey.entries()) {
        if (tick < minTick) {
          seenShotTraceByKey.delete(key);
        }
      }
      for (const [key, tick] of seenProjectileImpactById.entries()) {
        if (tick < minTick) {
          seenProjectileImpactById.delete(key);
        }
      }
      while (seenShotTraceByKey.size > FX_DEDUP_MAX_ENTRIES) {
        const first = seenShotTraceByKey.keys().next().value as string | undefined;
        if (first === undefined) {
          break;
        }
        seenShotTraceByKey.delete(first);
      }
      while (seenProjectileImpactById.size > FX_DEDUP_MAX_ENTRIES) {
        const first = seenProjectileImpactById.keys().next().value as number | undefined;
        if (first === undefined) {
          break;
        }
        seenProjectileImpactById.delete(first);
      }
    };
    const enqueueDecalDebugReport = (report: DecalDebugReport) => {
      pendingDecalDebugReports.push(report);
      if (pendingDecalDebugReports.length > MAX_PENDING_DECAL_DEBUG_REPORTS) {
        pendingDecalDebugReports.splice(0, pendingDecalDebugReports.length - MAX_PENDING_DECAL_DEBUG_REPORTS);
      }
    };
    const measureDecalVisibility = (position: Vec3) => {
      const camera = app.state.camera as unknown as THREE.Camera | null;
      if (!camera) {
        return { inFrustum: false, distance: -1 };
      }
      const cameraPos = (camera as unknown as { position?: Vec3 }).position;
      const distance =
        cameraPos &&
        Number.isFinite(cameraPos.x) &&
        Number.isFinite(cameraPos.y) &&
        Number.isFinite(cameraPos.z)
          ? Math.hypot(position.x - cameraPos.x, position.y - cameraPos.y, position.z - cameraPos.z)
          : -1;
      try {
        const matrix4Ctor = (three as unknown as { Matrix4?: typeof THREE.Matrix4 }).Matrix4;
        const frustumCtor = (three as unknown as { Frustum?: typeof THREE.Frustum }).Frustum;
        const vector3Ctor = (three as unknown as { Vector3?: typeof THREE.Vector3 }).Vector3;
        if (!matrix4Ctor || !frustumCtor || !vector3Ctor) {
          return { inFrustum: false, distance };
        }
        (camera as unknown as { updateMatrixWorld?: (force?: boolean) => void }).updateMatrixWorld?.(true);
        const projectionMatrix = (camera as unknown as { projectionMatrix?: THREE.Matrix4 }).projectionMatrix;
        const matrixWorldInverse = (camera as unknown as { matrixWorldInverse?: THREE.Matrix4 }).matrixWorldInverse;
        if (!projectionMatrix || !matrixWorldInverse) {
          return { inFrustum: false, distance };
        }
        const proj = new matrix4Ctor().multiplyMatrices(projectionMatrix, matrixWorldInverse);
        const frustum = new frustumCtor().setFromProjectionMatrix(proj);
        const point = new vector3Ctor(position.x, position.y, position.z);
        return { inFrustum: frustum.containsPoint(point), distance };
      } catch {
        return { inFrustum: false, distance };
      }
    };

    const updateMetrics = () => {
      const now = window.performance.now();
      const snapshotAge = lastSnapshotAt > 0 ? Math.max(0, now - lastSnapshotAt) : null;
      const pingText = lastRttMs > 0 ? `${Math.round(lastRttMs)}ms` : '--';
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
        `ping ${pingText} · snap ${snapshotText} · drift ${driftText} · kf ${keyframeText} · ev ${eventRateText} · late ${lateText} · drop ${dropText} · ${poolText}`
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
        refreshScoreboard();
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
    const SHOT_TRACE_POS_STEP_METERS = 0.01;
    const PROJECTILE_POS_STEP_METERS = 0.01;
    const PROJECTILE_VEL_STEP_METERS_PER_SECOND = 0.01;
    const PROJECTILE_TTL_STEP_SECONDS = 0.01;
    const PLAYER_EYE_HEIGHT = resolveEyeHeight(SIM_CONFIG);
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

const shouldDebugFx = () =>
  Boolean((window as unknown as { __afpsDebugFx?: unknown }).__afpsDebugFx);

const debugFxLog = (...args: unknown[]) => {
  if (!shouldDebugFx()) {
    return;
  }
  console.log('[afps][fx]', ...args);
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
      const isLocalShooter = Boolean(localConnectionId) && clientId === localConnectionId;
      if (isLocalShooter) {
        const cameraPos = app.state.camera?.position;
        if (cameraPos && Number.isFinite(cameraPos.x) && Number.isFinite(cameraPos.y) && Number.isFinite(cameraPos.z)) {
          return swapYZ({ x: cameraPos.x, y: cameraPos.y, z: cameraPos.z });
        }
      }
      const snapshot = lastSnapshots.get(clientId);
      if (snapshot) {
        return { x: snapshot.posX, y: snapshot.posY, z: snapshot.posZ + PLAYER_EYE_HEIGHT };
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
    const resolveMuzzlePosFromTraceServer = (
      dirServer: { x: number; y: number; z: number },
      hitPosServer: { x: number; y: number; z: number },
      hitDistance: number
    ) => {
      if (!Number.isFinite(hitDistance) || hitDistance < 0) {
        return null;
      }
      const originServer = {
        x: hitPosServer.x - dirServer.x * hitDistance,
        y: hitPosServer.y - dirServer.y * hitDistance,
        z: hitPosServer.z - dirServer.z * hitDistance
      };
      if (!Number.isFinite(originServer.x) || !Number.isFinite(originServer.y) || !Number.isFinite(originServer.z)) {
        return null;
      }
      return swapYZ({
        x: originServer.x + dirServer.x * MUZZLE_FORWARD_OFFSET,
        y: originServer.y + dirServer.y * MUZZLE_FORWARD_OFFSET,
        z: originServer.z + dirServer.z * MUZZLE_FORWARD_OFFSET
      });
    };
    const projectTraceWorldHit = worldSurfaceProjector.projectTraceWorldHit;
    const projectImpactWorldHit = worldSurfaceProjector.projectImpactWorldHit;

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
      pruneSeenFx(batch.serverTick);
      const traceByShot = new Map<
        string,
        {
          dirServer: { x: number; y: number; z: number };
          dir: { x: number; y: number; z: number };
          hitPos: { x: number; y: number; z: number };
          normal: { x: number; y: number; z: number };
          hitDistance: number;
          hitKind: number;
          surfaceType: number;
          showTracer: boolean;
          muzzlePos: { x: number; y: number; z: number } | null;
        }
      >();
      const projectedWorldHitByShot = new Map<string, TraceWorldHitResult>();
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
          const hitPosServer = {
            x: dequantizeI16(event.hitPosXQ, SHOT_TRACE_POS_STEP_METERS),
            y: dequantizeI16(event.hitPosYQ, SHOT_TRACE_POS_STEP_METERS),
            z: dequantizeI16(event.hitPosZQ, SHOT_TRACE_POS_STEP_METERS)
          };
          const hitDistance = dequantizeU16(event.hitDistQ, HIT_DISTANCE_STEP_METERS);
          const muzzlePos =
            resolveMuzzlePosFromTraceServer(dirServer, hitPosServer, hitDistance) ??
            resolveMuzzlePos(event.shooterId, dirServer);
          const traceKey = `${event.shooterId}:${event.shotSeq}`;
          const traceData = {
            dirServer,
            dir: swapYZ(dirServer),
            hitPos: swapYZ(hitPosServer),
            normal: swapYZ(normalServer),
            hitDistance,
            hitKind: event.hitKind,
            surfaceType: event.surfaceType,
            showTracer: event.showTracer,
            muzzlePos
          };
          traceByShot.set(traceKey, traceData);
          // Only project authoritative misses. World hits already carry a
          // server-resolved surface point and normal.
          if (traceData.hitKind === 0) {
            const projected = projectTraceWorldHit(traceData);
            if (projected) {
              projectedWorldHitByShot.set(traceKey, projected);
            }
          }
        } else if (event.type === 'ProjectileSpawnFx') {
          projectileWeaponSlotById.set(event.projectileId, resolveWeaponSlot(event.weaponSlot));
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
          case 'KillFeedFx': {
            const killer = resolvePlayerDisplayName(event.killerId);
            const victim = resolvePlayerDisplayName(event.victimId);
            killFeedOverlay.push(`${killer} eliminated ${victim}`);
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
            if (seenProjectileImpactById.has(event.projectileId)) {
              debugFxLog('projectile-impact-duplicate', { projectileId: event.projectileId });
              projectileWeaponSlotById.delete(event.projectileId);
              app.removeProjectileVfx(event.projectileId);
              break;
            }
            seenProjectileImpactById.set(event.projectileId, batch.serverTick);
            const impactPosServer = {
              x: dequantizeI16(event.posXQ, PROJECTILE_POS_STEP_METERS),
              y: dequantizeI16(event.posYQ, PROJECTILE_POS_STEP_METERS),
              z: dequantizeI16(event.posZQ, PROJECTILE_POS_STEP_METERS)
            };
            const impactPos = swapYZ(impactPosServer);
            const normal = swapYZ(decodeOct16(event.normalOctX, event.normalOctY));
            const projectileWeaponSlot = projectileWeaponSlotById.get(event.projectileId);
            const projectileWeapon =
              projectileWeaponSlot !== undefined ? resolveWeaponForSlot(projectileWeaponSlot) : null;
            const isGrenadeExplosion = isGrenadeLauncherWeapon(projectileWeapon);
            const hitLocalPlayer = Boolean(localConnectionId) && Boolean(event.targetId) && event.targetId === localConnectionId;
            const cameraPos = app.state.camera?.position;
            const localCameraPos =
              cameraPos &&
              Number.isFinite(cameraPos.x) &&
              Number.isFinite(cameraPos.y) &&
              Number.isFinite(cameraPos.z)
                ? { x: cameraPos.x, y: cameraPos.y, z: cameraPos.z }
                : null;
            const localExplosionDistanceSq =
              localCameraPos !== null
                ? (impactPos.x - localCameraPos.x) * (impactPos.x - localCameraPos.x) +
                  (impactPos.y - localCameraPos.y) * (impactPos.y - localCameraPos.y) +
                  (impactPos.z - localCameraPos.z) * (impactPos.z - localCameraPos.z)
                : Number.POSITIVE_INFINITY;
            const explosionRadius = Math.max(
              0.5,
              Number.isFinite(projectileWeapon?.explosionRadius) ? (projectileWeapon?.explosionRadius ?? 0) : 0,
              GRENADE_EXPLOSION_RADIUS_FALLBACK
            );
            const localNearExplosion = localExplosionDistanceSq <= (explosionRadius + 0.35) * (explosionRadius + 0.35);
            // Spawn FX can be dropped on the unreliable stream, leaving projectileWeapon unknown.
            // In that case treat near impacts as likely grenade impacts (current projectile weapon set is grenade-only).
            const likelyGrenadeImpact = isGrenadeExplosion || projectileWeaponSlot === undefined;
            audio.playPositional('impact', impactPos, { group: 'sfx', volume: 0.5 });
            app.spawnImpactVfx({
              position: impactPos,
              normal,
              surfaceType: event.surfaceType,
              seed: event.projectileId >>> 0,
              size: isGrenadeExplosion ? GRENADE_PROJECTILE_IMPACT_SIZE : PROJECTILE_IMPACT_SIZE_DEFAULT,
              ttl: isGrenadeExplosion ? GRENADE_PROJECTILE_IMPACT_TTL : PROJECTILE_IMPACT_TTL_DEFAULT
            });
            if (fxSettings.decals && event.hitWorld) {
              const projectedImpact = projectImpactWorldHit({ position: impactPos, normal });
              const decalPos = projectedImpact?.position ?? impactPos;
              const decalNormal = projectedImpact?.normal ?? normal;
              app.spawnDecalVfx({
                position: decalPos,
                normal: decalNormal,
                surfaceType: event.surfaceType,
                seed: event.projectileId >>> 0
              });
            }
            if (hitLocalPlayer || (likelyGrenadeImpact && localNearExplosion)) {
              grenadeHitExplosionOverlay.trigger();
            }
            projectileWeaponSlotById.delete(event.projectileId);
            app.removeProjectileVfx(event.projectileId);
            break;
          }
          case 'ProjectileRemoveFx': {
            projectileWeaponSlotById.delete(event.projectileId);
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
            if (weapon.kind === 'hitscan' && !trace) {
              debugFxLog('shot-fired-without-trace', {
                shooterId: event.shooterId,
                shotSeq: event.shotSeq,
                weaponId: weapon.id
              });
            }
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
                let hitDistance = trace.hitDistance > 0 ? trace.hitDistance : weapon.range;
                if (trace.hitKind === 0) {
                  const projectedHit = projectedWorldHitByShot.get(traceKey);
                  if (projectedHit && trace.muzzlePos) {
                    const dx = projectedHit.position.x - trace.muzzlePos.x;
                    const dy = projectedHit.position.y - trace.muzzlePos.y;
                    const dz = projectedHit.position.z - trace.muzzlePos.z;
                    const projectedDistance = Math.hypot(dx, dy, dz);
                    if (Number.isFinite(projectedDistance) && projectedDistance > 0) {
                      hitDistance = projectedDistance;
                    }
                  }
                }
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
            const isLocalShot = Boolean(localConnectionId) && event.shooterId === localConnectionId;
            if (seenShotTraceByKey.has(traceKey)) {
              debugFxLog('shot-trace-duplicate', { traceKey, shooterId: event.shooterId, shotSeq: event.shotSeq });
              break;
            }
            seenShotTraceByKey.set(traceKey, batch.serverTick);
            const trace = traceByShot.get(traceKey);
            if (!trace) {
              debugFxLog('shot-trace-missing', { traceKey, shooterId: event.shooterId, shotSeq: event.shotSeq });
              break;
            }
            if (trace.hitKind === 0) {
              debugFxLog('shot-trace-no-hit', {
                traceKey,
                shooterId: event.shooterId,
                shotSeq: event.shotSeq,
                reason: 'authoritative_none'
              });
              if (debugOverlaysVisible && isLocalShot) {
                const visibility = measureDecalVisibility(trace.hitPos);
                enqueueDecalDebugReport({
                  serverTick: batch.serverTick,
                  shotSeq: event.shotSeq,
                  hitKind: trace.hitKind,
                  surfaceType: trace.surfaceType,
                  authoritativeWorldHit: false,
                  usedProjectedHit: false,
                  usedImpactProjection: false,
                  decalSpawned: false,
                  decalInFrustum: visibility.inFrustum,
                  decalDistance: visibility.distance,
                  decalPositionX: trace.hitPos.x,
                  decalPositionY: trace.hitPos.y,
                  decalPositionZ: trace.hitPos.z,
                  decalNormalX: trace.normal.x,
                  decalNormalY: trace.normal.y,
                  decalNormalZ: trace.normal.z,
                  traceHitPositionX: trace.hitPos.x,
                  traceHitPositionY: trace.hitPos.y,
                  traceHitPositionZ: trace.hitPos.z,
                  traceHitNormalX: trace.normal.x,
                  traceHitNormalY: trace.normal.y,
                  traceHitNormalZ: trace.normal.z
                });
              }
              break;
            }
            const isAuthoritativeWorldHit = trace.hitKind === 1;
            const projectedWorldHit =
              !isAuthoritativeWorldHit && trace.hitKind !== 2
                ? (projectedWorldHitByShot.get(traceKey) ?? projectTraceWorldHit(trace))
                : null;
            const seed = (hashString(event.shooterId) ^ (event.shotSeq >>> 0)) >>> 0;
            const fallbackImpactPos = trace.hitPos;
            const traceImpactPos = projectedWorldHit?.position ?? fallbackImpactPos;
            const traceImpactNormal = projectedWorldHit?.normal ?? trace.normal;
            const projectedImpact =
              !isAuthoritativeWorldHit && trace.hitKind === 1
                ? projectImpactWorldHit({
                    position: traceImpactPos,
                    normal: traceImpactNormal
                  })
                : null;
            const authoritativeNormal = normalizeVec(trace.normal);
            const impactNormal = isAuthoritativeWorldHit
              ? authoritativeNormal
              : (projectedImpact?.normal ?? traceImpactNormal);
            const impactPos = isAuthoritativeWorldHit
              ? {
                  x: trace.hitPos.x + impactNormal.x * AUTHORITATIVE_WORLD_HIT_SURFACE_OFFSET_METERS,
                  y: trace.hitPos.y + impactNormal.y * AUTHORITATIVE_WORLD_HIT_SURFACE_OFFSET_METERS,
                  z: trace.hitPos.z + impactNormal.z * AUTHORITATIVE_WORLD_HIT_SURFACE_OFFSET_METERS
                }
              : (projectedImpact?.position ?? traceImpactPos);
            debugFxLog('shot-trace-impact', {
              traceKey,
              shooterId: event.shooterId,
              shotSeq: event.shotSeq,
              hitKind: trace.hitKind,
              surfaceType: trace.surfaceType,
              authoritativeWorldHit: isAuthoritativeWorldHit,
              usedProjectedHit: projectedWorldHit !== null,
              usedImpactProjection: projectedImpact !== null
            });
            app.spawnImpactVfx({
              position: impactPos,
              normal: impactNormal,
              surfaceType: trace.surfaceType,
              seed
            });
            let decalSpawned = false;
            if (fxSettings.decals && trace.hitKind === 1) {
              decalSpawned = true;
              let decalTtl: number | undefined;
              if (!isAuthoritativeWorldHit && !projectedWorldHit && !projectedImpact) {
                const firedDownward = trace.dir.y < -0.05;
                const aboveSkyHeight = impactPos.y > SKY_DECAL_HEIGHT_METERS;
                const aboveMuzzleByMargin =
                  trace.muzzlePos !== null ? impactPos.y > trace.muzzlePos.y + SKY_DECAL_VERTICAL_DELTA_METERS : false;
                if (aboveSkyHeight || (firedDownward && aboveMuzzleByMargin)) {
                  decalTtl = SKY_DECAL_FADE_SECONDS;
                }
              }
              app.spawnDecalVfx({
                position: impactPos,
                normal: impactNormal,
                surfaceType: trace.surfaceType,
                seed,
                ttl: decalTtl
              });
              debugFxLog('shot-trace-decal', {
                traceKey,
                shooterId: event.shooterId,
                shotSeq: event.shotSeq,
                surfaceType: trace.surfaceType,
                decalTtl: decalTtl ?? null
              });
            }
            if (debugOverlaysVisible && isLocalShot) {
              const visibility = measureDecalVisibility(impactPos);
              enqueueDecalDebugReport({
                serverTick: batch.serverTick,
                shotSeq: event.shotSeq,
                hitKind: trace.hitKind,
                surfaceType: trace.surfaceType,
                authoritativeWorldHit: isAuthoritativeWorldHit,
                usedProjectedHit: projectedWorldHit !== null,
                usedImpactProjection: projectedImpact !== null,
                decalSpawned,
                decalInFrustum: visibility.inFrustum,
                decalDistance: visibility.distance,
                decalPositionX: impactPos.x,
                decalPositionY: impactPos.y,
                decalPositionZ: impactPos.z,
                decalNormalX: impactNormal.x,
                decalNormalY: impactNormal.y,
                decalNormalZ: impactNormal.z,
                traceHitPositionX: trace.hitPos.x,
                traceHitPositionY: trace.hitPos.y,
                traceHitPositionZ: trace.hitPos.z,
                traceHitNormalX: trace.normal.x,
                traceHitNormalY: trace.normal.y,
                traceHitNormalZ: trace.normal.z
              });
            }
            break;
          }
          case 'PickupSpawnedFx': {
            pickupManager.applyFx(event);
            break;
          }
          case 'PickupTakenFx': {
            pickupManager.applyFx(event);
            if (localConnectionId && event.takerId === localConnectionId) {
              audio.play('uiClick', { group: 'ui', volume: 0.6 });
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
      if (shouldDebugFx()) {
        const counts = new Map<string, number>();
        for (const event of batch.events) {
          counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
        }
        debugFxLog('batch', { serverTick: batch.serverTick, counts: Object.fromEntries(counts.entries()) });
      }
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
        refreshScoreboard();
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
        refreshStatusVisibility();
        refreshHudLockState();
        app.setSnapshotRate(session.serverHello.snapshotRate);
        app.setTickRate(session.serverHello.serverTickRate);
        app.setMapSeed(session.serverHello.mapSeed ?? 0);
        queue.setTickRate(session.serverHello.serverTickRate);
        snapshotKeyframeInterval = session.serverHello.snapshotKeyframeInterval ?? null;
        updateMetrics();
        hudStore.dispatch({ type: 'weaponCooldown', value: app.getWeaponCooldown(currentWeaponSlot) });
        hudStore.dispatch({ type: 'abilityCooldowns', value: app.getAbilityCooldowns() });

        sendLoadoutBits = (bits: number) => {
          const channel = session.unreliableChannel;
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
              cmd.debugDecalReport = undefined;
              cmd.moveX = 0;
              cmd.moveY = 0;
              cmd.lookDeltaX = 0;
              cmd.lookDeltaY = 0;
              cmd.jump = false;
              cmd.fire = false;
              cmd.ads = false;
              cmd.sprint = false;
              cmd.crouch = false;
              cmd.dash = false;
              cmd.grapple = false;
              cmd.shield = false;
              cmd.shockwave = false;
              return;
            }
            cmd.debugDecalReport =
              debugOverlaysVisible && pendingDecalDebugReports.length > 0
                ? pendingDecalDebugReports.shift()
                : undefined;
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
                  const playerPose = app.getPlayerPose();
                  const debugEnabled = debugOverlaysVisible;
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
                        dirZ: dirServer.z,
                        debugEnabled,
                        debugPlayerPosX: debugEnabled && Number.isFinite(playerPose.posX) ? playerPose.posX : 0,
                        debugPlayerPosY: debugEnabled && Number.isFinite(playerPose.posY) ? playerPose.posY : 0,
                        debugPlayerPosZ: debugEnabled && Number.isFinite(playerPose.posZ) ? playerPose.posZ : 0,
                        debugViewYaw: debugEnabled && Number.isFinite(angles.yaw) ? angles.yaw : 0,
                        debugViewPitch: debugEnabled && Number.isFinite(angles.pitch) ? angles.pitch : 0,
                        debugProjectionTelemetryEnabled: debugEnabled ? isProjectionTelemetryEnabled() : false
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
          if (session.unreliableChannel.readyState !== 'open') {
            scheduleReconnect('data channel closed');
            return;
          }
          const peerState = session.peerConnection as
            | { connectionState?: string; iceConnectionState?: string }
            | undefined;
          const connectionState = peerState?.connectionState;
          const iceState = peerState?.iceConnectionState;
          if (connectionState === 'failed' || connectionState === 'disconnected' || connectionState === 'closed') {
            scheduleReconnect(`peer ${connectionState}`);
            return;
          }
          if (iceState === 'failed' || iceState === 'disconnected' || iceState === 'closed') {
            scheduleReconnect(`ice ${iceState}`);
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
        if (reconnecting) {
          scheduleReconnect(`network error (${detail})`);
        } else {
          status.setState('error', detail);
          refreshStatusVisibility();
          reconnecting = false;
          refreshHudLockState();
        }
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
