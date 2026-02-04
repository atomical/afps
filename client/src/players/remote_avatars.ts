import type { NetworkSnapshot, Object3DLike, SceneLike, ThreeLike, DataTextureLike } from '../types';
import type { CharacterCatalog, WeaponOffset } from '../characters/catalog';
import { resolveCharacterEntry } from '../characters/catalog';
import { WEAPON_DEFS } from '../weapons/config';
import type { PlayerProfile } from '../net/protocol';

type AnimationActionLike = {
  play: () => void;
  reset?: () => void;
  fadeIn?: (duration: number) => AnimationActionLike;
  fadeOut?: (duration: number) => AnimationActionLike;
  setEffectiveWeight?: (weight: number) => AnimationActionLike;
  setLoop?: (mode: unknown, reps: number) => AnimationActionLike;
  clampWhenFinished?: boolean;
};

type AnimationMixerLike = {
  update: (deltaSeconds: number) => void;
  clipAction: (clip: unknown) => AnimationActionLike;
};

type RemoteAvatar = {
  id: string;
  root: Object3DLike;
  weapon: Object3DLike;
  weaponParent: Object3DLike;
  weaponOffset?: WeaponOffset;
  characterId?: string;
  handBone?: string;
  weaponModelKey?: string;
  weaponLoadToken?: number;
  weaponLoadFailures?: number;
  // Tracks the currently applied GLB model URL (not just the desired one).
  modelUrl?: string;
  // Tracks which characterId/skin the currently loaded model represents.
  modelCharacterId?: string;
  modelLoading?: boolean;
  velocity?: { x: number; y: number; z: number };
  height?: number;
  lastJumpMs?: number;
  mixer?: AnimationMixerLike;
  idleAction?: AnimationActionLike;
  runAction?: AnimationActionLike;
  jumpAction?: AnimationActionLike;
  activeAction?: AnimationActionLike;
  activeState?: 'idle' | 'run' | 'jump';
  nameplate?: {
    sprite: Object3DLike;
    texture: DataTextureLike;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  };
  groundOffsetY?: number;
  weaponSlot: number;
  lastSeenMs: number;
};

export interface RemoteAvatarManager {
  upsertSnapshot: (snapshot: NetworkSnapshot, nowMs?: number) => void;
  setLocalClientId: (clientId: string | null) => void;
  setProfile: (profile: PlayerProfile) => void;
  setCatalog: (catalog: CharacterCatalog) => void;
  update: (deltaSeconds: number) => void;
  prune: (nowMs?: number) => void;
  listAvatars: () => Array<{
    id: string;
    position?: { x: number; y: number; z: number };
    lastSeenMs: number;
    modelUrl?: string;
    characterId?: string;
  }>;
  getDebugInfo: (clientId: string) => {
    root?: { x: number; y: number; z: number };
    boundsCenter?: { x: number; y: number; z: number };
    boundsSize?: { x: number; y: number; z: number };
    centerDelta?: { x: number; y: number; z: number };
    groundOffsetY?: number;
  } | null;
  dispose: () => void;
}

const BODY_HEIGHT = 1.6;
const BODY_HALF = BODY_HEIGHT / 2;
const STALE_MS = 8000;
const NAMEPLATE_WIDTH = 256;
const NAMEPLATE_HEIGHT = 64;
const NAMEPLATE_SCALE = { x: 1.6, y: 0.4 };
const NAMEPLATE_OFFSET_Y = BODY_HEIGHT + 0.45;
const HAND_DEFAULT_OFFSET: WeaponOffset = {
  position: [0.08, 0.02, 0],
  rotation: [0, Math.PI / 2, 0],
  scale: 1
};
const BASE_URL = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const NORMALIZED_BASE = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
const WEAPON_MODEL_ROOT = `${NORMALIZED_BASE}assets/weapons/cc0/kenney_blaster_kit/`;
const DEFAULT_WEAPON_MODEL = {
  file: `${WEAPON_MODEL_ROOT}blaster-a.glb`,
  scale: 0.6
};
const WEAPON_MODELS_BY_ID: Record<string, { file: string; scale: number }> = {
  rifle: {
    file: `${WEAPON_MODEL_ROOT}blaster-d.glb`,
    scale: 0.62
  },
  AR_556: {
    file: `${WEAPON_MODEL_ROOT}blaster-d.glb`,
    scale: 0.62
  },
  launcher: {
    file: `${WEAPON_MODEL_ROOT}blaster-f.glb`,
    scale: 0.6
  },
  PISTOL_9MM: {
    file: `${WEAPON_MODEL_ROOT}blaster-a.glb`,
    scale: 0.58
  },
  PISTOL_45: {
    file: `${WEAPON_MODEL_ROOT}blaster-b.glb`,
    scale: 0.58
  },
  REVOLVER_357: {
    file: `${WEAPON_MODEL_ROOT}blaster-b.glb`,
    scale: 0.6
  },
  SMG_9MM: {
    file: `${WEAPON_MODEL_ROOT}blaster-c.glb`,
    scale: 0.62
  },
  CARBINE_762: {
    file: `${WEAPON_MODEL_ROOT}blaster-e.glb`,
    scale: 0.64
  },
  DMR_762: {
    file: `${WEAPON_MODEL_ROOT}blaster-e.glb`,
    scale: 0.66
  },
  LMG_556: {
    file: `${WEAPON_MODEL_ROOT}blaster-h.glb`,
    scale: 0.7
  },
  SHOTGUN_PUMP: {
    file: `${WEAPON_MODEL_ROOT}blaster-g.glb`,
    scale: 0.66
  },
  SHOTGUN_AUTO: {
    file: `${WEAPON_MODEL_ROOT}blaster-g.glb`,
    scale: 0.66
  },
  SNIPER_BOLT: {
    file: `${WEAPON_MODEL_ROOT}blaster-g.glb`,
    scale: 0.68
  },
  GRENADE_LAUNCHER: {
    file: `${WEAPON_MODEL_ROOT}blaster-f.glb`,
    scale: 0.6
  },
  ROCKET_LAUNCHER: {
    file: `${WEAPON_MODEL_ROOT}blaster-f.glb`,
    scale: 0.6
  },
  ENERGY_RIFLE: {
    file: `${WEAPON_MODEL_ROOT}blaster-a.glb`,
    scale: 0.62
  }
};

const weaponScaleForSlot = (slot: number) => {
  if (slot === 1) {
    return { length: 0.9, thickness: 0.12 };
  }
  return { length: 0.7, thickness: 0.1 };
};

export const createRemoteAvatarManager = ({
  three,
  scene
}: {
  three: ThreeLike;
  scene: SceneLike;
}): RemoteAvatarManager => {
  const avatars = new Map<string, RemoteAvatar>();
  const profiles = new Map<string, PlayerProfile>();
  let catalog: CharacterCatalog | null = null;
  let localClientId: string | null = null;
  const bodyGeometry = new three.BoxGeometry(0.6, BODY_HEIGHT, 0.4);
  const bodyMaterial = new three.MeshToonMaterial({ color: 0x6d6d6d });
  const weaponMaterial = new three.MeshToonMaterial({ color: 0x2b2b2b });
  const canRenderNameplate = Boolean(three.Sprite && three.SpriteMaterial && three.CanvasTexture);
  const modelCache = new Map<string, Promise<{ root: Object3DLike; animations: unknown[] } | null>>();
  const animationCache = new Map<string, Promise<unknown[]>>();
  const weaponModelCache = new Map<string, Promise<Object3DLike | null>>();
  const weaponModelFailures = new Set<string>();
  let gltfLoaderPromise: Promise<{ load: Function } | null> | null = null;
  let skeletonClonePromise: Promise<((root: Object3DLike) => Object3DLike) | null> | null = null;

  const getGltfLoader = async () => {
    if (!gltfLoaderPromise) {
      gltfLoaderPromise = import('three/examples/jsm/loaders/GLTFLoader.js')
        .then(({ GLTFLoader }) => new GLTFLoader() as unknown as { load: Function })
        .catch(() => null);
    }
    return gltfLoaderPromise;
  };

  const getSkeletonClone = async () => {
    if (!skeletonClonePromise) {
      skeletonClonePromise = import('three/examples/jsm/utils/SkeletonUtils.js')
        .then((mod: unknown) => {
          const fn = (mod as { clone?: (root: Object3DLike) => Object3DLike }).clone;
          return typeof fn === 'function' ? fn : null;
        })
        .catch(() => null);
    }
    return skeletonClonePromise;
  };

  const loadGltf = async (url: string): Promise<{ root: Object3DLike; animations: unknown[] } | null> => {
    const loader = await getGltfLoader();
    if (!loader) {
      return null;
    }
    return new Promise((resolve) => {
      loader.load(
        url,
        (gltf: { scene?: unknown; animations?: unknown[] }) => {
          resolve({
            root: (gltf.scene ?? {}) as Object3DLike,
            animations: Array.isArray(gltf.animations) ? gltf.animations : []
          });
        },
        undefined,
        () => resolve(null)
      );
    });
  };

  const resolveModelUrlCandidates = (url: string) => {
    const candidates = new Set<string>();
    const add = (value: string | null | undefined) => {
      if (value && value.length > 0) {
        candidates.add(value);
      }
    };

    add(url);
    if (url.startsWith('./')) {
      add(url.slice(1));
    }
    if (url.startsWith('/')) {
      add(`.${url}`);
    }

    if (NORMALIZED_BASE.startsWith('/') && NORMALIZED_BASE !== '/' && url.startsWith(NORMALIZED_BASE)) {
      add(`/${url.slice(NORMALIZED_BASE.length)}`);
    }

    return Array.from(candidates);
  };

  const resolveFallbackModelUrl = (url: string) => {
    if (url.includes('/Models/')) {
      return null;
    }
    // Support both Vite `public/assets/...` layouts and the raw Kenney archive layout checked into `assets/`.
    return url.replace(
      '/kenney_blaster_kit/',
      '/kenney_blaster_kit/Models/GLB%20format/'
    );
  };

  const loadModelRoot = async (url: string) => {
    const candidates = resolveModelUrlCandidates(url);
    for (const candidate of candidates) {
      const primary = await loadGltf(candidate);
      if (primary?.root) {
        return primary.root;
      }
      const fallback = resolveFallbackModelUrl(candidate);
      if (!fallback || fallback === candidate) {
        continue;
      }
      const secondary = await loadGltf(fallback);
      if (secondary?.root) {
        return secondary.root;
      }
    }
    return null;
  };

  const resolveWeaponModelSpec = (slot: number) => {
    const weaponId = WEAPON_DEFS[slot]?.id;
    if (weaponId && WEAPON_MODELS_BY_ID[weaponId]) {
      return WEAPON_MODELS_BY_ID[weaponId];
    }
    return DEFAULT_WEAPON_MODEL;
  };

  const cloneObject = (base: Object3DLike) => {
    if ('clone' in (base as { clone?: (deep?: boolean) => Object3DLike })) {
      const cloneFn = (base as { clone?: (deep?: boolean) => Object3DLike }).clone;
      if (cloneFn) {
        return cloneFn.call(base, true);
      }
    }
    return base;
  };

  const loadWeaponModel = async (slot: number) => {
    const spec = resolveWeaponModelSpec(slot);
    let promise = weaponModelCache.get(spec.file);
    if (!promise) {
      promise = loadModelRoot(spec.file)
        .then((root) => {
          if (!root) {
            weaponModelCache.delete(spec.file);
          }
          return root;
        });
      weaponModelCache.set(spec.file, promise);
    }
    const base = await promise;
    if (!base) {
      if (!weaponModelFailures.has(spec.file)) {
        weaponModelFailures.add(spec.file);
        console.warn(`weapon model failed: ${spec.file}`);
      }
      return null;
    }
    let instance = cloneObject(base);
    let root: Object3DLike = instance;
    const containerCtor =
      three.Object3D ??
      (three as unknown as { Group?: new () => Object3DLike }).Group;
    if (containerCtor) {
      const container = new containerCtor() as unknown as Object3DLike;
      container.add?.(instance);
      root = container;
    }
    if (root.scale?.set) {
      root.scale.set(spec.scale, spec.scale, spec.scale);
      (root as unknown as { __afpsBaseScale?: { x: number; y: number; z: number } }).__afpsBaseScale = {
        x: spec.scale,
        y: spec.scale,
        z: spec.scale
      };
    }
    return { root, key: spec.file };
  };

  const buildAnimationUrls = (modelUrl: string) => {
    const normalized = modelUrl.replace(/\\/g, '/');
    const marker = '/models/';
    let base = normalized;
    const idx = normalized.lastIndexOf(marker);
    if (idx >= 0) {
      base = normalized.slice(0, idx) + '/animations/';
    } else {
      const slash = normalized.lastIndexOf('/');
      base = slash >= 0 ? normalized.slice(0, slash + 1) : '';
    }
    if (!base.endsWith('/')) {
      base += '/';
    }
    return [`${base}idle.glb`, `${base}run.glb`, `${base}jump.glb`];
  };

  const mergeClips = (base: unknown[], extra: unknown[]) => {
    if (extra.length === 0) {
      return base;
    }
    const seen = new Set(
      base
        .map((clip) => (clip as { name?: string }).name?.toLowerCase())
        .filter((name): name is string => Boolean(name))
    );
    const merged = [...base];
    for (const clip of extra) {
      const name = (clip as { name?: string }).name?.toLowerCase();
      if (name && seen.has(name)) {
        continue;
      }
      merged.push(clip);
      if (name) {
        seen.add(name);
      }
    }
    return merged;
  };

  const loadAnimationClips = async (urls: string[]) => {
    const clips: unknown[] = [];
    for (const url of urls) {
      let promise = animationCache.get(url);
      if (!promise) {
        promise = loadGltf(url).then((gltf) => (gltf ? gltf.animations : []));
        animationCache.set(url, promise);
      }
      const next = await promise;
      if (next.length) {
        clips.push(...next);
      }
    }
    return clips;
  };

  const drawNameplate = (ctx: CanvasRenderingContext2D, label: string) => {
    ctx.clearRect(0, 0, NAMEPLATE_WIDTH, NAMEPLATE_HEIGHT);
    ctx.fillStyle = 'rgba(8, 12, 18, 0.72)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 3;
    const radius = 14;
    ctx.beginPath();
    ctx.moveTo(radius, 2);
    ctx.lineTo(NAMEPLATE_WIDTH - radius, 2);
    ctx.quadraticCurveTo(NAMEPLATE_WIDTH - 2, 2, NAMEPLATE_WIDTH - 2, radius);
    ctx.lineTo(NAMEPLATE_WIDTH - 2, NAMEPLATE_HEIGHT - radius);
    ctx.quadraticCurveTo(NAMEPLATE_WIDTH - 2, NAMEPLATE_HEIGHT - 2, NAMEPLATE_WIDTH - radius, NAMEPLATE_HEIGHT - 2);
    ctx.lineTo(radius, NAMEPLATE_HEIGHT - 2);
    ctx.quadraticCurveTo(2, NAMEPLATE_HEIGHT - 2, 2, NAMEPLATE_HEIGHT - radius);
    ctx.lineTo(2, radius);
    ctx.quadraticCurveTo(2, 2, radius, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(245, 245, 245, 0.95)';
    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, NAMEPLATE_WIDTH / 2, NAMEPLATE_HEIGHT / 2);
  };

  const createNameplate = (label: string) => {
    if (!canRenderNameplate || !three.Sprite || !three.SpriteMaterial || !three.CanvasTexture) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = NAMEPLATE_WIDTH;
    canvas.height = NAMEPLATE_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    drawNameplate(ctx, label);
    const texture = new three.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new three.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    const sprite = new three.Sprite(material) as unknown as Object3DLike;
    sprite.position.set(0, NAMEPLATE_OFFSET_Y, 0);
    if (sprite.scale) {
      sprite.scale.set(NAMEPLATE_SCALE.x, NAMEPLATE_SCALE.y, 1);
    }
    return { sprite, texture, canvas, ctx };
  };

  const updateNameplateLabel = (avatar: RemoteAvatar, label: string) => {
    if (!avatar.nameplate) {
      return;
    }
    drawNameplate(avatar.nameplate.ctx, label);
    avatar.nameplate.texture.needsUpdate = true;
  };

  const applyWeaponOffset = (weapon: Object3DLike, offset?: WeaponOffset) => {
    if (offset?.position) {
      weapon.position.set(
        (weapon.position.x ?? 0) + offset.position[0],
        (weapon.position.y ?? 0) + offset.position[1],
        (weapon.position.z ?? 0) + offset.position[2]
      );
    }
    if (offset?.rotation) {
      weapon.rotation.x += offset.rotation[0];
      weapon.rotation.y += offset.rotation[1];
      weapon.rotation.z += offset.rotation[2];
    }
    if (weapon.scale && offset?.scale && offset.scale > 0) {
      const tagged = weapon as unknown as { __afpsBaseScale?: { x: number; y: number; z: number } };
      if (!tagged.__afpsBaseScale) {
        tagged.__afpsBaseScale = {
          x: weapon.scale.x ?? 1,
          y: weapon.scale.y ?? 1,
          z: weapon.scale.z ?? 1
        };
      }
      weapon.scale.set(
        tagged.__afpsBaseScale.x * offset.scale,
        tagged.__afpsBaseScale.y * offset.scale,
        tagged.__afpsBaseScale.z * offset.scale
      );
    }
  };

  const applyDefaultWeaponTransform = (weapon: Object3DLike) => {
    weapon.position.set(0.35, 0.4, 0.15);
    weapon.rotation.x = 0;
    weapon.rotation.y = Math.PI;
    weapon.rotation.z = 0;
  };

  const applyHandWeaponTransform = (weapon: Object3DLike) => {
    weapon.position.set(HAND_DEFAULT_OFFSET.position?.[0] ?? 0, HAND_DEFAULT_OFFSET.position?.[1] ?? 0, HAND_DEFAULT_OFFSET.position?.[2] ?? 0);
    if (HAND_DEFAULT_OFFSET.rotation) {
      weapon.rotation.x = HAND_DEFAULT_OFFSET.rotation[0];
      weapon.rotation.y = HAND_DEFAULT_OFFSET.rotation[1];
      weapon.rotation.z = HAND_DEFAULT_OFFSET.rotation[2];
    }
  };

  const createWeaponMesh = (slot: number, offset?: WeaponOffset) => {
    const containerCtor =
      three.Object3D ??
      (three as unknown as { Group?: new () => Object3DLike }).Group;
    if (containerCtor) {
      const placeholder = new containerCtor() as unknown as Object3DLike;
      applyDefaultWeaponTransform(placeholder);
      applyWeaponOffset(placeholder, offset);
      return placeholder;
    }
    const { length, thickness } = weaponScaleForSlot(slot);
    const geometry = new three.BoxGeometry(thickness, thickness, length);
    const mesh = new three.Mesh(geometry, weaponMaterial);
    // Prefer an invisible placeholder over a visible box so missing models are obvious.
    mesh.visible = false;
    applyDefaultWeaponTransform(mesh);
    applyWeaponOffset(mesh, offset);
    return mesh as unknown as Object3DLike;
  };

  const normalizeName = (value?: string) => (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const findHandBone = (root: Object3DLike, hint?: string) => {
    const desired = normalizeName(hint);
    const candidates: Object3DLike[] = [];
    const visit = (node: Object3DLike) => {
      const name = normalizeName(node.name);
      if (!name) {
        return;
      }
      if (desired && name === desired) {
        candidates.unshift(node);
        return;
      }
      const isRightSide = name.includes('right') || name.endsWith('r');
      if (!isRightSide) {
        return;
      }
      if (name.includes('hand')) {
        candidates.push(node);
        return;
      }
      if (name.includes('wrist')) {
        candidates.push(node);
      }
    };
    if (root.traverse) {
      root.traverse((child) => visit(child));
    } else if (root.children) {
      const stack = [...root.children];
      while (stack.length > 0) {
        const node = stack.shift();
        if (!node) {
          continue;
        }
        visit(node);
        if (node.children) {
          stack.push(...node.children);
        }
      }
    }
    return candidates[0] ?? null;
  };

  const attachWeapon = (root: Object3DLike, weapon: Object3DLike, offset?: WeaponOffset, handHint?: string) => {
    const hand = findHandBone(root, handHint);
    const parent = hand ?? root;
    parent.add?.(weapon);
    if (hand) {
      applyHandWeaponTransform(weapon);
    } else {
      applyDefaultWeaponTransform(weapon);
    }
    if (weapon.scale?.set) {
      const base = (weapon as unknown as { __afpsBaseScale?: { x: number; y: number; z: number } }).__afpsBaseScale;
      if (base) {
        weapon.scale.set(base.x, base.y, base.z);
      }
    }
    applyWeaponOffset(weapon, offset);
    return parent;
  };

  const computeGroundOffset = (root: Object3DLike) => {
    if (three.Box3 && three.Vector3) {
      const box = new three.Box3().setFromObject(root);
      const minY = box.min?.y ?? 0;
      if (Number.isFinite(minY)) {
        // Box3 bounds are in world space; subtract the root's current world Y so the
        // computed offset is stable even if the root is already positioned.
        const rootY = root.position?.y ?? 0;
        return Number.isFinite(rootY) ? rootY - minY : -minY;
      }
    }
    return BODY_HALF;
  };

  const applyVisibility = (avatar: RemoteAvatar) => {
    if (avatar.root?.visible === undefined) {
      return;
    }
    // Hide the local client's third-person avatar so it doesn't clip the first-person camera.
    avatar.root.visible = !(localClientId && avatar.id === localClientId);
  };

  const detachWeapon = (avatar: RemoteAvatar) => {
    avatar.weaponParent?.remove?.(avatar.weapon);
  };

  const loadRiggedModel = async (url: string, skinUrl?: string) => {
    if (!modelCache.has(url)) {
      const loaderPromise = loadGltf(url);
      modelCache.set(url, loaderPromise);
    }
    const base = await modelCache.get(url)!;
    if (!base) {
      return null;
    }
    let instance: Object3DLike | null = null;
    const skeletonClone = await getSkeletonClone();
    if (skeletonClone) {
      try {
        instance = skeletonClone(base.root);
      } catch {
        instance = null;
      }
    }
    if (!instance && 'clone' in (base.root as unknown as { clone?: (deep?: boolean) => Object3DLike })) {
      const cloneFn = (base.root as unknown as { clone?: (deep?: boolean) => Object3DLike }).clone;
      if (cloneFn) {
        instance = cloneFn.call(base.root, true);
      }
    }
    if (!instance) {
      // As a last resort, fall back to a shallow clone to avoid mutating the cached root.
      instance = (base.root as unknown as { clone?: (deep?: boolean) => Object3DLike }).clone?.call(base.root, false) ?? base.root;
    }
    let root: Object3DLike = instance;
    if (three.Object3D) {
      const container = new three.Object3D() as unknown as Object3DLike;
      container.add?.(instance);
      root = container;
    }
    if (skinUrl && three.TextureLoader) {
      const loader = new three.TextureLoader();
      loader.load(
        skinUrl,
        (texture) => {
            const applyTexture = (node: Object3DLike) => {
              const anyNode = node as unknown as { material?: { map?: DataTextureLike; needsUpdate?: boolean } };
              if (anyNode.material) {
                anyNode.material.map = texture;
                anyNode.material.needsUpdate = true;
              }
            };
          if (instance.traverse) {
            instance.traverse((child) => applyTexture(child));
          } else if (instance.children) {
            const stack = [...instance.children];
            while (stack.length > 0) {
              const node = stack.shift();
              if (!node) {
                continue;
              }
              applyTexture(node);
              if (node.children) {
                stack.push(...node.children);
              }
            }
          } else {
            applyTexture(instance);
          }
        },
        undefined,
        () => {
          // ignore texture load failures
        }
      );
    }

    if (three.Box3 && three.Vector3) {
      const box = new three.Box3().setFromObject(instance);
      const size = new three.Vector3();
      box.getSize(size);
      const height = Number.isFinite(size.y) && size.y > 0 ? size.y : 0;
      if (height > 0 && instance.scale?.set) {
        const scale = BODY_HEIGHT / height;
        instance.scale.set(scale, scale, scale);
      }
      const scaledBox = new three.Box3().setFromObject(instance);
      const center = new three.Vector3();
      scaledBox.getCenter(center);
      instance.position.x -= center.x;
      instance.position.z -= center.z;
      instance.position.y -= scaledBox.min.y;
    }
    let animations = base.animations;
    if (animations.length < 3) {
      const extra = await loadAnimationClips(buildAnimationUrls(url));
      animations = mergeClips(animations, extra);
    }
    return { root, animations };
  };

  const selectClip = (animations: unknown[], keywords: string[]) => {
    const lowered = keywords.map((keyword) => keyword.toLowerCase());
    const matched = animations.find((clip) => {
      const name = (clip as { name?: string }).name?.toLowerCase() ?? '';
      return lowered.some((keyword) => name.includes(keyword));
    });
    return matched ?? animations[0];
  };

  const setupAnimations = (avatar: RemoteAvatar, model: { root: Object3DLike; animations: unknown[] }) => {
    avatar.mixer = undefined;
    avatar.idleAction = undefined;
    avatar.runAction = undefined;
    avatar.jumpAction = undefined;
    avatar.activeAction = undefined;
    avatar.activeState = undefined;

    if (!three.AnimationMixer || model.animations.length === 0) {
      return;
    }
    const mixer = new three.AnimationMixer(model.root) as unknown as AnimationMixerLike;
    const idleClip = selectClip(model.animations, ['idle', 'stand']);
    const runClip = selectClip(model.animations, ['run', 'walk']);
    const jumpClip = selectClip(model.animations, ['jump']);
    const idleAction = idleClip ? mixer.clipAction(idleClip) : undefined;
    const runAction = runClip ? mixer.clipAction(runClip) : undefined;
    const jumpAction = jumpClip ? mixer.clipAction(jumpClip) : undefined;
    if (idleAction) {
      idleAction.play();
    }
    avatar.mixer = mixer;
    avatar.idleAction = idleAction;
    avatar.runAction = runAction;
    avatar.jumpAction = jumpAction;
    avatar.activeAction = idleAction;
    avatar.activeState = idleAction ? 'idle' : undefined;
  };

  const setAnimationState = (avatar: RemoteAvatar, state: 'idle' | 'run' | 'jump') => {
    if (avatar.activeState === state) {
      return;
    }
    const nextAction =
      state === 'run' ? avatar.runAction : state === 'jump' ? avatar.jumpAction : avatar.idleAction;
    if (!nextAction) {
      return;
    }
    avatar.activeAction?.fadeOut?.(0.2);
    nextAction.reset?.();
    nextAction.fadeIn?.(0.2);
    nextAction.play();
    avatar.activeAction = nextAction;
    avatar.activeState = state;
  };

  const requestWeaponModel = async (avatar: RemoteAvatar, slot: number) => {
    const token = (avatar.weaponLoadToken ?? 0) + 1;
    avatar.weaponLoadToken = token;
    const loaded = await loadWeaponModel(slot);
    const current = avatars.get(avatar.id);
    if (!loaded || !current || current.weaponLoadToken !== token) {
      if (current && current.weaponLoadToken === token && !loaded) {
        const failures = (current.weaponLoadFailures ?? 0) + 1;
        current.weaponLoadFailures = failures;
        if (failures < 3) {
          window.setTimeout(() => {
            const retry = avatars.get(current.id);
            if (!retry || retry.weaponSlot !== slot) {
              return;
            }
            void requestWeaponModel(retry, slot);
          }, 1500);
        }
      }
      return;
    }
    current.weaponLoadFailures = 0;
    if (current.weaponModelKey === loaded.key) {
      return;
    }
    current.weaponModelKey = loaded.key;
    detachWeapon(current);
    const parent = attachWeapon(current.root, loaded.root, current.weaponOffset, current.handBone);
    current.weapon = loaded.root;
    current.weaponParent = parent;
  };

  const createAvatar = (
    id: string,
    slot: number,
    nowMs: number,
    offset?: WeaponOffset,
    characterId?: string,
    handHint?: string
  ): RemoteAvatar => {
    const body = new three.Mesh(bodyGeometry, bodyMaterial) as unknown as Object3DLike;
    const weapon = createWeaponMesh(slot, offset);
    const weaponParent = attachWeapon(body, weapon, offset, handHint);
    const profile = profiles.get(id);
    const label = profile?.nickname ?? id;
    const nameplate = createNameplate(label);
    if (nameplate) {
      body.add?.(nameplate.sprite);
    }
    scene.add(body);
    const avatar: RemoteAvatar = {
      id,
      root: body,
      weapon,
      weaponParent,
      weaponOffset: offset,
      characterId,
      handBone: handHint,
      modelUrl: undefined,
      modelCharacterId: undefined,
      nameplate: nameplate ?? undefined,
      groundOffsetY: computeGroundOffset(body),
      weaponSlot: slot,
      lastSeenMs: nowMs
    };
    applyVisibility(avatar);
    avatars.set(id, avatar);
    void requestWeaponModel(avatar, slot);
    return avatar;
  };

  const updateWeapon = (avatar: RemoteAvatar, slot: number) => {
    if (avatar.weaponSlot === slot) {
      return;
    }
    detachWeapon(avatar);
    const nextWeapon = createWeaponMesh(slot, avatar.weaponOffset);
    const parent = attachWeapon(avatar.root, nextWeapon, avatar.weaponOffset, avatar.handBone);
    avatar.weapon = nextWeapon;
    avatar.weaponParent = parent;
    avatar.weaponSlot = slot;
    void requestWeaponModel(avatar, slot);
  };

  const upsertSnapshot = (snapshot: NetworkSnapshot, nowMs = performance.now()) => {
    if (!snapshot.clientId) {
      return;
    }
    const slot = Number.isFinite(snapshot.weaponSlot) ? Math.max(0, Math.floor(snapshot.weaponSlot)) : 0;
    const profile = profiles.get(snapshot.clientId);
    const entry = catalog && profile ? resolveCharacterEntry(catalog, profile.characterId) : null;
    const desiredCharacterId = profile?.characterId;
    const desiredModelUrl = entry?.modelUrl;
    const avatar =
      avatars.get(snapshot.clientId) ??
      createAvatar(snapshot.clientId, slot, nowMs, entry?.weaponOffset, desiredCharacterId, entry?.handBone);
    avatar.lastSeenMs = nowMs;
    avatar.velocity = { x: snapshot.velX, y: snapshot.velY, z: snapshot.velZ };
    avatar.height = snapshot.posZ;
    updateWeapon(avatar, slot);
    const groundOffset = avatar.groundOffsetY ?? BODY_HALF;
    avatar.root.position.set(snapshot.posX, groundOffset + snapshot.posZ, snapshot.posY);
    if (desiredModelUrl && desiredCharacterId && avatar.characterId === desiredCharacterId) {
      const needsModel =
        avatar.modelUrl !== desiredModelUrl || avatar.modelCharacterId !== desiredCharacterId;
      if (!avatar.modelLoading && needsModel) {
        avatar.modelLoading = true;
        void (async () => {
          const model = await loadRiggedModel(desiredModelUrl, entry?.skinUrl);
          const current = avatars.get(snapshot.clientId);
          if (!model || !current || current.characterId !== desiredCharacterId) {
            if (current) {
              current.modelLoading = false;
            }
            return;
          }
          const prevPosition = {
            x: current.root.position?.x ?? 0,
            y: current.root.position?.y ?? 0,
            z: current.root.position?.z ?? 0
          };
          scene.remove?.(current.root);
          const weapon = current.weapon;
          const nameplate = current.nameplate;
          const handHint = entry.handBone;
          detachWeapon(current);
          const weaponParent = attachWeapon(model.root, weapon, current.weaponOffset, handHint);
          if (nameplate) {
            model.root.add?.(nameplate.sprite);
          }
          model.root.position?.set?.(prevPosition.x, prevPosition.y, prevPosition.z);
          current.root = model.root;
          current.weaponParent = weaponParent;
          current.groundOffsetY = computeGroundOffset(model.root);
          setupAnimations(current, model);
          current.modelLoading = false;
          current.modelUrl = desiredModelUrl;
          current.modelCharacterId = desiredCharacterId;
          applyVisibility(current);
          scene.add(model.root);
        })();
      }
    }
  };

  const setLocalClientId = (clientId: string | null) => {
    localClientId = clientId;
    for (const avatar of avatars.values()) {
      applyVisibility(avatar);
    }
  };

  const setProfile = (profile: PlayerProfile) => {
    profiles.set(profile.clientId, profile);
    const avatar = avatars.get(profile.clientId);
    const entry = catalog ? resolveCharacterEntry(catalog, profile.characterId) : null;
    if (avatar) {
      avatar.characterId = profile.characterId;
      avatar.handBone = entry?.handBone;
      avatar.weaponOffset = entry?.weaponOffset;
      detachWeapon(avatar);
      avatar.weaponParent = attachWeapon(avatar.root, avatar.weapon, avatar.weaponOffset, avatar.handBone);
      if (!avatar.weaponModelKey) {
        void requestWeaponModel(avatar, avatar.weaponSlot);
      }
      if (!avatar.nameplate) {
        const nameplate = createNameplate(profile.nickname);
        if (nameplate) {
          avatar.nameplate = nameplate;
          avatar.root.add?.(nameplate.sprite);
        }
      } else {
        updateNameplateLabel(avatar, profile.nickname);
      }
    }
  };

  const setCatalog = (next: CharacterCatalog) => {
    catalog = next;
    for (const avatar of avatars.values()) {
      const profile = profiles.get(avatar.id);
      if (!profile) {
        continue;
      }
      const entry = resolveCharacterEntry(next, profile.characterId);
      avatar.weaponOffset = entry.weaponOffset;
      avatar.handBone = entry.handBone;
      detachWeapon(avatar);
      avatar.weaponParent = attachWeapon(avatar.root, avatar.weapon, avatar.weaponOffset, avatar.handBone);
      if (!avatar.weaponModelKey) {
        void requestWeaponModel(avatar, avatar.weaponSlot);
      }
      const desiredCharacterId = profile.characterId;
      const desiredModelUrl = entry.modelUrl;
      const needsModel =
        Boolean(desiredModelUrl) &&
        (avatar.modelUrl !== desiredModelUrl || avatar.modelCharacterId !== desiredCharacterId);
      if (desiredModelUrl && !avatar.modelLoading && needsModel) {
        avatar.modelLoading = true;
        void (async () => {
          const model = await loadRiggedModel(desiredModelUrl, entry.skinUrl);
          if (!model) {
            avatar.modelLoading = false;
            return;
          }
          const current = avatars.get(avatar.id);
          if (!current || current.characterId !== profile.characterId) {
            if (current) {
              current.modelLoading = false;
            }
            return;
          }
          const prevPosition = {
            x: current.root.position?.x ?? 0,
            y: current.root.position?.y ?? 0,
            z: current.root.position?.z ?? 0
          };
          scene.remove?.(current.root);
          const weapon = current.weapon;
          const nameplate = current.nameplate;
          const handHint = entry.handBone;
          detachWeapon(current);
          const weaponParent = attachWeapon(model.root, weapon, current.weaponOffset, handHint);
          if (nameplate) {
            model.root.add?.(nameplate.sprite);
          }
          model.root.position?.set?.(prevPosition.x, prevPosition.y, prevPosition.z);
          current.root = model.root;
          current.weaponParent = weaponParent;
          current.groundOffsetY = computeGroundOffset(model.root);
          setupAnimations(current, model);
          current.modelLoading = false;
          current.modelUrl = desiredModelUrl;
          current.modelCharacterId = desiredCharacterId;
          applyVisibility(current);
          scene.add(model.root);
        })();
      }
    }
  };

  const update = (deltaSeconds: number) => {
    const nowMs = performance.now();
    for (const avatar of avatars.values()) {
      if (avatar.mixer) {
        avatar.mixer.update(deltaSeconds);
        const velocity = avatar.velocity;
        const speed = velocity ? Math.hypot(velocity.x, velocity.y) : 0;
        const verticalMotion =
          (velocity ? Math.abs(velocity.z) : 0) > 0.55 || (avatar.height ?? 0) > 0.35;
        const jumpCooldownMs = 350;
        if (verticalMotion && avatar.jumpAction) {
          if (!avatar.lastJumpMs || nowMs - avatar.lastJumpMs > jumpCooldownMs) {
            avatar.lastJumpMs = nowMs;
          }
        }
        if (avatar.lastJumpMs && nowMs - avatar.lastJumpMs < 250 && avatar.jumpAction) {
          setAnimationState(avatar, 'jump');
        } else if (speed > 0.2) {
          setAnimationState(avatar, 'run');
        } else {
          setAnimationState(avatar, 'idle');
        }
      }
    }
  };

  const prune = (nowMs = performance.now()) => {
    for (const [id, avatar] of avatars.entries()) {
      if (nowMs - avatar.lastSeenMs <= STALE_MS) {
        continue;
      }
      scene.remove?.(avatar.root);
      avatars.delete(id);
      profiles.delete(id);
    }
  };

  const getDebugInfo = (clientId: string) => {
    const avatar = avatars.get(clientId);
    if (!avatar) {
      return null;
    }
    const rootPos = avatar.root.position
      ? { x: avatar.root.position.x, y: avatar.root.position.y, z: avatar.root.position.z }
      : undefined;
    let boundsCenter: { x: number; y: number; z: number } | undefined;
    let boundsSize: { x: number; y: number; z: number } | undefined;
    let centerDelta: { x: number; y: number; z: number } | undefined;
    if (three.Box3 && three.Vector3) {
      const box = new three.Box3().setFromObject(avatar.root);
      const center = new three.Vector3();
      const size = new three.Vector3();
      box.getCenter(center);
      box.getSize(size);
      boundsCenter = { x: center.x, y: center.y, z: center.z };
      boundsSize = { x: size.x, y: size.y, z: size.z };
      if (rootPos) {
        centerDelta = { x: center.x - rootPos.x, y: center.y - rootPos.y, z: center.z - rootPos.z };
      }
    }
    return {
      root: rootPos,
      boundsCenter,
      boundsSize,
      centerDelta,
      groundOffsetY: avatar.groundOffsetY
    };
  };

  const listAvatars = () => {
    return Array.from(avatars.values()).map((avatar) => ({
      id: avatar.id,
      position: avatar.root.position
        ? { x: avatar.root.position.x, y: avatar.root.position.y, z: avatar.root.position.z }
        : undefined,
      lastSeenMs: avatar.lastSeenMs,
      modelUrl: avatar.modelUrl,
      characterId: avatar.characterId
    }));
  };

  const dispose = () => {
    for (const avatar of avatars.values()) {
      scene.remove?.(avatar.root);
    }
    avatars.clear();
    profiles.clear();
  };

  return {
    upsertSnapshot,
    setLocalClientId,
    setProfile,
    setCatalog,
    update,
    prune,
    listAvatars,
    getDebugInfo,
    dispose
  };
};
