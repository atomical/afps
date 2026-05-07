import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterCatalog, WeaponOffset } from '../characters/catalog';
import { loadCharacterCatalog, resolveCharacterEntry } from '../characters/catalog';
import type { WeaponMountCatalog, WeaponMountEntry } from '../characters/weapon_mounts';
import { loadWeaponMountCatalog, resolveWeaponMount, serializeWeaponMountCatalog } from '../characters/weapon_mounts';
import { WEAPON_DEFS } from '../weapons/config';
import { resolveWeaponModelSpec } from '../weapons/model_catalog';

type AnimationState = 'idle' | 'run' | 'jump';
type EditScope = 'default' | 'weapon';
interface UndoSnapshot {
  mounts: WeaponMountCatalog;
  characterId: string;
  weaponId: string;
  scope: EditScope;
}

const BASE_URL = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const NORMALIZED_BASE = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
const SAVE_MOUNTS_ENDPOINT = `${NORMALIZED_BASE}__afps/editor/save-weapon-mounts`;
const MAX_UNDO_HISTORY = 100;
const HAND_DEFAULT_OFFSET: Required<WeaponOffset> = {
  position: [0.08, 0.02, 0],
  rotation: [0, 0, 0],
  scale: 1
};
const ROOT_DEFAULT_OFFSET: Required<WeaponOffset> = {
  position: [0.35, 0.4, 0.15],
  rotation: [0, 0, 0],
  scale: 1
};

const mountCatalogEmpty = (): WeaponMountCatalog => ({ entries: [], byCharacter: {} });

const cloneOffset = (offset?: WeaponOffset): WeaponOffset | undefined => {
  if (!offset) {
    return undefined;
  }
  const next: WeaponOffset = {};
  if (offset.position) {
    next.position = [...offset.position];
  }
  if (offset.rotation) {
    next.rotation = [...offset.rotation];
  }
  if (typeof offset.scale === 'number' && Number.isFinite(offset.scale) && offset.scale > 0) {
    next.scale = offset.scale;
  }
  return Object.keys(next).length > 0 ? next : undefined;
};

const cloneOffsetsByWeaponId = (value?: Record<string, WeaponOffset>) => {
  if (!value) {
    return undefined;
  }
  const next: Record<string, WeaponOffset> = {};
  for (const [weaponId, offset] of Object.entries(value)) {
    const cloned = cloneOffset(offset);
    if (cloned) {
      next[weaponId] = cloned;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
};

const cloneMountCatalog = (catalog: WeaponMountCatalog): WeaponMountCatalog => {
  const entries = catalog.entries.map((entry) => ({
    characterId: entry.characterId,
    handBone: entry.handBone,
    weaponOffset: cloneOffset(entry.weaponOffset),
    weaponOffsetsById: cloneOffsetsByWeaponId(entry.weaponOffsetsById)
  }));
  const byCharacter: Record<string, WeaponMountEntry> = {};
  for (const entry of entries) {
    byCharacter[entry.characterId] = entry;
  }
  return { entries, byCharacter };
};

const createDefaultOffset = (): Required<WeaponOffset> => ({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1
});

const normalizeBoneName = (value?: string | null) =>
  (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const findHandBone = (root: THREE.Object3D, hint?: string) => {
  const desired = normalizeBoneName(hint);
  const candidates: THREE.Object3D[] = [];
  root.traverse((node) => {
    const name = normalizeBoneName(node.name);
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
  });
  return candidates[0] ?? null;
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

const normalizeClipName = (clip: THREE.AnimationClip) => clip.name.toLowerCase();

const selectAnimationClip = (clips: THREE.AnimationClip[], state: AnimationState) => {
  const keywords =
    state === 'run' ? ['run', 'walk'] : state === 'jump' ? ['jump'] : ['idle', 'stand'];
  const match = clips.find((clip) => keywords.some((keyword) => normalizeClipName(clip).includes(keyword)));
  return match ?? clips[0] ?? null;
};

const applySkinTexture = async (
  root: THREE.Object3D,
  skinUrl: string | undefined,
  textureLoader: THREE.TextureLoader
) => {
  if (!skinUrl) {
    return;
  }
  const texture = await new Promise<THREE.Texture | null>((resolve) => {
    textureLoader.load(
      skinUrl,
      (value) => resolve(value),
      undefined,
      () => resolve(null)
    );
  });
  if (!texture) {
    return;
  }
  texture.colorSpace = THREE.SRGBColorSpace;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.material) {
      return;
    }
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => {
        if ('map' in material) {
          material.map = texture;
          material.needsUpdate = true;
        }
      });
      return;
    }
    if ('map' in mesh.material) {
      mesh.material.map = texture;
      mesh.material.needsUpdate = true;
    }
  });
};

const centerAndScaleCharacter = (root: THREE.Object3D) => {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const height = Number.isFinite(size.y) && size.y > 0 ? size.y : 1;
  const targetHeight = 1.8;
  const scalar = targetHeight / height;
  root.scale.setScalar(scalar);
  const scaled = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  scaled.getCenter(center);
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= scaled.min.y;
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

  return [...candidates];
};

const resolveFallbackWeaponModelUrl = (url: string) => {
  if (url.includes('/Models/')) {
    return null;
  }
  return url.replace('/kenney_blaster_kit/', '/kenney_blaster_kit/Models/GLB%20format/');
};

const makeUi = () => {
  const host = document.getElementById('editor-app') ?? document.body;
  host.innerHTML = `
    <div class="editor-shell">
      <aside class="panel panel-left">
        <h1>Weapon Mount Editor</h1>
        <p class="subtle">Tune hand attachment offsets on character rigs and export <code>weapon_mounts.json</code>.</p>

        <label class="field">
          <span>Character</span>
          <select id="character-select"></select>
        </label>

        <label class="field">
          <span>Weapon</span>
          <select id="weapon-select"></select>
        </label>

        <label class="field">
          <span>Edit Scope</span>
          <select id="scope-select">
            <option value="default">Default Mount</option>
            <option value="weapon">Per-Weapon Override</option>
          </select>
        </label>

        <label class="field">
          <span>Right Hand Bone</span>
          <div class="row">
            <input id="hand-bone-input" type="text" placeholder="Wrist.R" />
            <button id="auto-bone-button" type="button">Auto</button>
          </div>
        </label>

        <label class="field">
          <span>Animation Preview</span>
          <select id="animation-select">
            <option value="idle">Idle</option>
            <option value="run">Run</option>
            <option value="jump">Jump</option>
          </select>
        </label>

        <div class="field">
          <span>Transform</span>
          <div class="row">
            <button id="mode-translate" type="button">Move (W)</button>
            <button id="mode-rotate" type="button">Rotate (E)</button>
            <button id="mode-scale" type="button">Scale (R)</button>
          </div>
        </div>

        <div class="field-grid">
          <label class="field"><span>Pos X</span><input id="pos-x" type="number" step="0.001" /></label>
          <label class="field"><span>Pos Y</span><input id="pos-y" type="number" step="0.001" /></label>
          <label class="field"><span>Pos Z</span><input id="pos-z" type="number" step="0.001" /></label>
          <label class="field"><span>Rot X</span><input id="rot-x" type="number" step="0.01" /></label>
          <label class="field"><span>Rot Y</span><input id="rot-y" type="number" step="0.01" /></label>
          <label class="field"><span>Rot Z</span><input id="rot-z" type="number" step="0.01" /></label>
          <label class="field"><span>Scale</span><input id="scale" type="number" step="0.01" min="0.01" /></label>
        </div>

        <div class="row">
          <button id="reset-offset" type="button">Reset Offset</button>
          <button id="remove-override" type="button">Remove Override</button>
          <button id="undo-change" type="button" title="Undo (Ctrl/Cmd+Z)">Undo</button>
        </div>
        <p id="status-text" class="status"></p>
      </aside>

      <main class="viewport-wrap">
        <canvas id="viewport"></canvas>
      </main>

      <aside class="panel panel-right">
        <h2>Export</h2>
        <div class="row">
          <button id="save-file" type="button">Save to File</button>
          <button id="copy-json" type="button">Copy JSON</button>
          <button id="download-json" type="button">Download</button>
        </div>
        <textarea id="json-output" spellcheck="false" readonly></textarea>
      </aside>
    </div>
  `;
};

const main = async () => {
  makeUi();

  const viewport = document.getElementById('viewport') as HTMLCanvasElement;
  const characterSelect = document.getElementById('character-select') as HTMLSelectElement;
  const weaponSelect = document.getElementById('weapon-select') as HTMLSelectElement;
  const scopeSelect = document.getElementById('scope-select') as HTMLSelectElement;
  const handBoneInput = document.getElementById('hand-bone-input') as HTMLInputElement;
  const animationSelect = document.getElementById('animation-select') as HTMLSelectElement;
  const modeTranslate = document.getElementById('mode-translate') as HTMLButtonElement;
  const modeRotate = document.getElementById('mode-rotate') as HTMLButtonElement;
  const modeScale = document.getElementById('mode-scale') as HTMLButtonElement;
  const autoBoneButton = document.getElementById('auto-bone-button') as HTMLButtonElement;
  const resetOffsetButton = document.getElementById('reset-offset') as HTMLButtonElement;
  const removeOverrideButton = document.getElementById('remove-override') as HTMLButtonElement;
  const undoButton = document.getElementById('undo-change') as HTMLButtonElement;
  const statusText = document.getElementById('status-text') as HTMLParagraphElement;
  const jsonOutput = document.getElementById('json-output') as HTMLTextAreaElement;
  const saveFileButton = document.getElementById('save-file') as HTMLButtonElement;
  const copyJsonButton = document.getElementById('copy-json') as HTMLButtonElement;
  const downloadJsonButton = document.getElementById('download-json') as HTMLButtonElement;
  const posX = document.getElementById('pos-x') as HTMLInputElement;
  const posY = document.getElementById('pos-y') as HTMLInputElement;
  const posZ = document.getElementById('pos-z') as HTMLInputElement;
  const rotX = document.getElementById('rot-x') as HTMLInputElement;
  const rotY = document.getElementById('rot-y') as HTMLInputElement;
  const rotZ = document.getElementById('rot-z') as HTMLInputElement;
  const scale = document.getElementById('scale') as HTMLInputElement;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10141e);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(2.3, 1.9, 2.7);

  const renderer = new THREE.WebGLRenderer({
    canvas: viewport,
    antialias: true,
    alpha: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 1, 0);
  orbit.update();
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;

  const transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.setSpace('local');
  scene.add(transformControls);
  transformControls.addEventListener('dragging-changed', (event) => {
    orbit.enabled = !event.value;
  });

  const hemi = new THREE.HemisphereLight(0xb6c8ff, 0x10131a, 0.9);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(2, 3, 1.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9ac6ff, 0.3);
  rim.position.set(-2, 1.5, -2.5);
  scene.add(rim);
  scene.add(new THREE.GridHelper(6, 24, 0x3457a5, 0x273550));

  const loader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();
  const modelCache = new Map<string, Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] } | null>>();
  const animationCache = new Map<string, Promise<THREE.AnimationClip[]>>();

  let catalog: CharacterCatalog = {
    defaultId: '',
    entries: []
  };
  let mounts: WeaponMountCatalog = mountCatalogEmpty();
  let selectedAnimation: AnimationState = 'idle';
  let selectedCharacterRoot: THREE.Object3D | null = null;
  let selectedWeaponRoot: THREE.Object3D | null = null;
  let selectedHandBone: THREE.Object3D | null = null;
  let mountAnchor: THREE.Object3D | null = null;
  let offsetNode: THREE.Object3D | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let activeAction: THREE.AnimationAction | null = null;
  let lastFrameMs = performance.now();
  let currentCharacterToken = 0;
  let currentWeaponToken = 0;
  let undoStack: UndoSnapshot[] = [];
  let dragStartSnapshot: UndoSnapshot | null = null;
  let dragStartState = '';

  const setStatus = (value: string) => {
    statusText.textContent = value;
  };

  const loadGltf = async (url: string) => {
    let promise = modelCache.get(url);
    if (!promise) {
      promise = new Promise((resolve) => {
        loader.load(
          url,
          (gltf) => {
            resolve({
              scene: gltf.scene,
              animations: gltf.animations ?? []
            });
          },
          undefined,
          () => resolve(null)
        );
      });
      modelCache.set(url, promise);
    }
    return promise;
  };

  const loadAnimations = async (urls: string[]) => {
    const clips: THREE.AnimationClip[] = [];
    for (const url of urls) {
      let promise = animationCache.get(url);
      if (!promise) {
        promise = loadGltf(url).then((gltf) => gltf?.animations ?? []);
        animationCache.set(url, promise);
      }
      const next = await promise;
      if (next.length > 0) {
        clips.push(...next);
      }
    }
    return clips;
  };

  const cloneModel = async (url: string) => {
    const candidates = resolveModelUrlCandidates(url);
    for (const candidate of candidates) {
      const gltf = await loadGltf(candidate);
      if (gltf?.scene) {
        const root = skeletonClone(gltf.scene);
        return { root, animations: gltf.animations };
      }
    }
    return null;
  };

  const cloneWeaponModel = async (url: string) => {
    const candidates = resolveModelUrlCandidates(url);
    for (const candidate of candidates) {
      const primary = await loadGltf(candidate);
      if (primary?.scene) {
        return primary.scene.clone(true);
      }
      const fallback = resolveFallbackWeaponModelUrl(candidate);
      if (!fallback || fallback === candidate) {
        continue;
      }
      const secondary = await loadGltf(fallback);
      if (secondary?.scene) {
        return secondary.scene.clone(true);
      }
    }
    return null;
  };

  const renderJson = () => {
    jsonOutput.value = serializeWeaponMountCatalog(mounts);
  };

  const ensureMountEntry = (characterId: string) => {
    const existing = mounts.byCharacter[characterId];
    if (existing) {
      return existing;
    }
    const fallback = resolveCharacterEntry(catalog, characterId);
    const created: WeaponMountEntry = {
      characterId,
      handBone: fallback.handBone,
      weaponOffset: cloneOffset(fallback.weaponOffset) ?? createDefaultOffset()
    };
    mounts.entries.push(created);
    mounts.byCharacter[characterId] = created;
    return created;
  };

  const getEditScope = (): EditScope =>
    scopeSelect.value === 'weapon' ? 'weapon' : 'default';

  const ensureOffsetRef = (entry: WeaponMountEntry, weaponId: string, scope: EditScope) => {
    if (scope === 'weapon') {
      entry.weaponOffsetsById = entry.weaponOffsetsById ?? {};
      if (!entry.weaponOffsetsById[weaponId]) {
        entry.weaponOffsetsById[weaponId] =
          cloneOffset(entry.weaponOffset) ?? createDefaultOffset();
      }
      return entry.weaponOffsetsById[weaponId];
    }
    if (!entry.weaponOffset) {
      entry.weaponOffset = createDefaultOffset();
    }
    return entry.weaponOffset;
  };

  const getCurrentCharacterId = () => characterSelect.value || catalog.defaultId;
  const getCurrentWeaponId = () => weaponSelect.value || WEAPON_DEFS[0]?.id || 'rifle';

  const getCurrentMountEntry = () => ensureMountEntry(getCurrentCharacterId());

  const getCurrentResolvedOffset = () => {
    const entry = getCurrentMountEntry();
    const scope = getEditScope();
    const weaponId = getCurrentWeaponId();
    const character = resolveCharacterEntry(catalog, getCurrentCharacterId());
    if (scope === 'weapon') {
      return (
        cloneOffset(entry.weaponOffsetsById?.[weaponId]) ??
        cloneOffset(entry.weaponOffset) ??
        cloneOffset(character.weaponOffset) ??
        createDefaultOffset()
      );
    }
    return (
      cloneOffset(entry.weaponOffset) ??
      cloneOffset(character.weaponOffset) ??
      createDefaultOffset()
    );
  };

  const hasOption = (select: HTMLSelectElement, value: string) =>
    Array.from(select.options).some((option) => option.value === value);

  const updateUndoButtonState = () => {
    undoButton.disabled = undoStack.length === 0;
  };

  const captureUndoSnapshot = (): UndoSnapshot => ({
    mounts: cloneMountCatalog(mounts),
    characterId: getCurrentCharacterId(),
    weaponId: getCurrentWeaponId(),
    scope: getEditScope()
  });

  const pushUndoSnapshot = (snapshot: UndoSnapshot) => {
    undoStack.push(snapshot);
    if (undoStack.length > MAX_UNDO_HISTORY) {
      undoStack.shift();
    }
    updateUndoButtonState();
  };

  const runUndoableMutation = (mutate: () => void) => {
    const before = serializeWeaponMountCatalog(mounts);
    const snapshot = captureUndoSnapshot();
    mutate();
    const after = serializeWeaponMountCatalog(mounts);
    if (after !== before) {
      pushUndoSnapshot(snapshot);
    }
  };

  const applyOffsetNode = (offset: WeaponOffset) => {
    if (!offsetNode) {
      return;
    }
    const nextPosition = offset.position ?? [0, 0, 0];
    const nextRotation = offset.rotation ?? [0, 0, 0];
    const nextScale = offset.scale ?? 1;
    offsetNode.position.set(nextPosition[0], nextPosition[1], nextPosition[2]);
    offsetNode.rotation.set(nextRotation[0], nextRotation[1], nextRotation[2]);
    offsetNode.scale.set(nextScale, nextScale, nextScale);
  };

  const updateTransformInputs = () => {
    if (!offsetNode) {
      return;
    }
    posX.value = offsetNode.position.x.toFixed(4);
    posY.value = offsetNode.position.y.toFixed(4);
    posZ.value = offsetNode.position.z.toFixed(4);
    rotX.value = offsetNode.rotation.x.toFixed(4);
    rotY.value = offsetNode.rotation.y.toFixed(4);
    rotZ.value = offsetNode.rotation.z.toFixed(4);
    scale.value = offsetNode.scale.x.toFixed(4);
  };

  const syncOffsetFromNode = () => {
    if (!offsetNode) {
      return;
    }
    const entry = getCurrentMountEntry();
    const target = ensureOffsetRef(entry, getCurrentWeaponId(), getEditScope());
    const uniform = Math.max(0.01, Number.isFinite(offsetNode.scale.x) ? offsetNode.scale.x : 1);
    offsetNode.scale.set(uniform, uniform, uniform);
    target.position = [offsetNode.position.x, offsetNode.position.y, offsetNode.position.z];
    target.rotation = [offsetNode.rotation.x, offsetNode.rotation.y, offsetNode.rotation.z];
    target.scale = uniform;
    updateTransformInputs();
    renderJson();
  };

  const applyMountBase = (hasHandBone: boolean) => {
    if (!mountAnchor) {
      return;
    }
    const base = hasHandBone ? HAND_DEFAULT_OFFSET : ROOT_DEFAULT_OFFSET;
    mountAnchor.position.set(base.position[0], base.position[1], base.position[2]);
    mountAnchor.rotation.set(base.rotation[0], base.rotation[1], base.rotation[2]);
  };

  const attachWeaponToCharacter = () => {
    if (!selectedCharacterRoot || !selectedWeaponRoot) {
      return;
    }
    if (mountAnchor?.parent) {
      mountAnchor.parent.remove(mountAnchor);
    }
    mountAnchor = new THREE.Object3D();
    offsetNode = new THREE.Object3D();
    mountAnchor.add(offsetNode);
    offsetNode.add(selectedWeaponRoot);

    const entry = getCurrentMountEntry();
    const handHint = entry.handBone || undefined;
    selectedHandBone = findHandBone(selectedCharacterRoot, handHint);
    const parent = selectedHandBone ?? selectedCharacterRoot;
    parent.add(mountAnchor);
    applyMountBase(Boolean(selectedHandBone));
    applyOffsetNode(getCurrentResolvedOffset());
    updateTransformInputs();
    transformControls.attach(offsetNode);

    const resolvedName = selectedHandBone?.name?.trim();
    if (resolvedName) {
      setStatus(`Attached to ${resolvedName}`);
    } else {
      setStatus('Hand bone not found, using model root fallback');
    }
  };

  const loadCharacter = async () => {
    const token = ++currentCharacterToken;
    const entry = resolveCharacterEntry(catalog, getCurrentCharacterId());
    if (selectedCharacterRoot) {
      scene.remove(selectedCharacterRoot);
      selectedCharacterRoot = null;
      selectedHandBone = null;
    }
    if (!entry.modelUrl) {
      const placeholder = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.24, 1.25, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x88a1bf, roughness: 0.4, metalness: 0.12 })
      );
      placeholder.position.y = 0.95;
      selectedCharacterRoot = placeholder;
      scene.add(placeholder);
      attachWeaponToCharacter();
      return;
    }

    const loaded = await cloneModel(entry.modelUrl);
    if (!loaded || token !== currentCharacterToken) {
      setStatus(`Unable to load character model: ${entry.modelUrl}`);
      return;
    }
    await applySkinTexture(loaded.root, entry.skinUrl, textureLoader);
    centerAndScaleCharacter(loaded.root);
    scene.add(loaded.root);
    selectedCharacterRoot = loaded.root;

    const mergedAnimations = [...loaded.animations];
    if (mergedAnimations.length < 3) {
      const extra = await loadAnimations(buildAnimationUrls(entry.modelUrl));
      if (token !== currentCharacterToken) {
        return;
      }
      const seen = new Set(mergedAnimations.map((clip) => normalizeClipName(clip)));
      for (const clip of extra) {
        const key = normalizeClipName(clip);
        if (!seen.has(key)) {
          seen.add(key);
          mergedAnimations.push(clip);
        }
      }
    }
    mixer = null;
    activeAction = null;
    if (mergedAnimations.length > 0) {
      mixer = new THREE.AnimationMixer(loaded.root);
      const clip = selectAnimationClip(mergedAnimations, selectedAnimation);
      if (clip) {
        activeAction = mixer.clipAction(clip);
        activeAction.play();
      }
    }
    attachWeaponToCharacter();
  };

  const loadWeapon = async () => {
    const token = ++currentWeaponToken;
    const weaponId = getCurrentWeaponId();
    const spec = resolveWeaponModelSpec(weaponId);
    if (selectedWeaponRoot && selectedWeaponRoot.parent) {
      selectedWeaponRoot.parent.remove(selectedWeaponRoot);
      selectedWeaponRoot = null;
    }
    const weapon = await cloneWeaponModel(spec.file);
    if (token !== currentWeaponToken) {
      return;
    }
    if (weapon) {
      const container = new THREE.Object3D();
      container.add(weapon);
      container.scale.set(spec.worldScale, spec.worldScale, spec.worldScale);
      selectedWeaponRoot = container;
    } else {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x2f3f59, roughness: 0.25, metalness: 0.7 })
      );
      selectedWeaponRoot = mesh;
      setStatus(`Unable to load weapon model: ${spec.file}`);
    }
    attachWeaponToCharacter();
  };

  const updateAnimationState = async () => {
    selectedAnimation = (animationSelect.value as AnimationState) ?? 'idle';
    if (!mixer || !selectedCharacterRoot) {
      return;
    }
    const entry = resolveCharacterEntry(catalog, getCurrentCharacterId());
    if (!entry.modelUrl) {
      return;
    }
    const loaded = await cloneModel(entry.modelUrl);
    if (!loaded) {
      return;
    }
    const clips = loaded.animations.length > 0 ? loaded.animations : await loadAnimations(buildAnimationUrls(entry.modelUrl));
    const next = selectAnimationClip(clips, selectedAnimation);
    if (!next) {
      return;
    }
    activeAction?.fadeOut(0.12);
    const action = mixer.clipAction(next);
    action.reset();
    action.fadeIn(0.12);
    action.play();
    activeAction = action;
  };

  const refreshFromState = () => {
    const entry = getCurrentMountEntry();
    handBoneInput.value = entry.handBone ?? '';
    updateTransformInputs();
    renderJson();
  };

  const applyUndoSnapshot = async (snapshot: UndoSnapshot) => {
    const previousCharacterId = getCurrentCharacterId();
    const previousWeaponId = getCurrentWeaponId();
    mounts = cloneMountCatalog(snapshot.mounts);
    if (hasOption(characterSelect, snapshot.characterId)) {
      characterSelect.value = snapshot.characterId;
    }
    if (hasOption(weaponSelect, snapshot.weaponId)) {
      weaponSelect.value = snapshot.weaponId;
    }
    scopeSelect.value = snapshot.scope;
    refreshFromState();
    const nextCharacterId = getCurrentCharacterId();
    const nextWeaponId = getCurrentWeaponId();
    if (previousCharacterId !== nextCharacterId) {
      await loadCharacter();
      await loadWeapon();
    } else if (previousWeaponId !== nextWeaponId) {
      await loadWeapon();
    } else {
      attachWeaponToCharacter();
    }
    setStatus('Undid last mount edit');
  };

  const undoLastChange = async () => {
    const snapshot = undoStack.pop();
    updateUndoButtonState();
    if (!snapshot) {
      setStatus('Nothing to undo');
      return;
    }
    await applyUndoSnapshot(snapshot);
  };

  const isEditableTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    if (target.isContentEditable) {
      return true;
    }
    if (target instanceof HTMLTextAreaElement) {
      return !target.readOnly && !target.disabled;
    }
    if (target instanceof HTMLInputElement) {
      return !target.readOnly && !target.disabled;
    }
    if (target instanceof HTMLSelectElement) {
      return !target.disabled;
    }
    return false;
  };

  const setTransformMode = (mode: 'translate' | 'rotate' | 'scale') => {
    transformControls.setMode(mode);
    modeTranslate.dataset.active = mode === 'translate' ? 'true' : 'false';
    modeRotate.dataset.active = mode === 'rotate' ? 'true' : 'false';
    modeScale.dataset.active = mode === 'scale' ? 'true' : 'false';
  };

  const onNumericInput = () => {
    if (!offsetNode) {
      return;
    }
    runUndoableMutation(() => {
      const parse = (value: string, fallback = 0) => {
        const n = Number.parseFloat(value);
        return Number.isFinite(n) ? n : fallback;
      };
      offsetNode.position.set(parse(posX.value), parse(posY.value), parse(posZ.value));
      offsetNode.rotation.set(parse(rotX.value), parse(rotY.value), parse(rotZ.value));
      const uniform = Math.max(0.01, parse(scale.value, 1));
      offsetNode.scale.set(uniform, uniform, uniform);
      syncOffsetFromNode();
    });
  };

  const populateSelectors = () => {
    characterSelect.replaceChildren();
    catalog.entries.forEach((entry) => {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = entry.displayName;
      characterSelect.append(option);
    });
    characterSelect.value = catalog.defaultId;

    weaponSelect.replaceChildren();
    WEAPON_DEFS.forEach((weapon) => {
      const option = document.createElement('option');
      option.value = weapon.id;
      option.textContent = `${weapon.displayName} (${weapon.id})`;
      weaponSelect.append(option);
    });
    if (WEAPON_DEFS[0]) {
      weaponSelect.value = WEAPON_DEFS[0].id;
    }
  };

  const seedMountCatalog = () => {
    const seeded = mountCatalogEmpty();
    catalog.entries.forEach((entry) => {
      const merged = resolveWeaponMount({
        catalog: mounts,
        characterId: entry.id,
        fallbackHandBone: entry.handBone,
        fallbackOffset: entry.weaponOffset
      });
      const nextEntry: WeaponMountEntry = {
        characterId: entry.id,
        handBone: merged.handBone,
        weaponOffset: merged.weaponOffset ?? createDefaultOffset()
      };
      const existing = mounts.byCharacter[entry.id];
      if (existing?.weaponOffsetsById) {
        nextEntry.weaponOffsetsById = { ...existing.weaponOffsetsById };
      }
      seeded.entries.push(nextEntry);
      seeded.byCharacter[entry.id] = nextEntry;
    });
    mounts = seeded;
  };

  transformControls.addEventListener('objectChange', () => {
    syncOffsetFromNode();
  });
  transformControls.addEventListener('mouseDown', () => {
    if (!offsetNode) {
      return;
    }
    dragStartSnapshot = captureUndoSnapshot();
    dragStartState = serializeWeaponMountCatalog(mounts);
  });
  transformControls.addEventListener('mouseUp', () => {
    if (!dragStartSnapshot) {
      return;
    }
    const after = serializeWeaponMountCatalog(mounts);
    if (after !== dragStartState) {
      pushUndoSnapshot(dragStartSnapshot);
    }
    dragStartSnapshot = null;
    dragStartState = '';
  });

  characterSelect.addEventListener('change', async () => {
    refreshFromState();
    await loadCharacter();
    await loadWeapon();
  });

  weaponSelect.addEventListener('change', async () => {
    if (getEditScope() === 'weapon') {
      runUndoableMutation(() => {
        ensureOffsetRef(getCurrentMountEntry(), getCurrentWeaponId(), 'weapon');
      });
    }
    refreshFromState();
    await loadWeapon();
  });

  scopeSelect.addEventListener('change', () => {
    runUndoableMutation(() => {
      const scope = getEditScope();
      if (scope === 'weapon') {
        ensureOffsetRef(getCurrentMountEntry(), getCurrentWeaponId(), scope);
      }
      applyOffsetNode(getCurrentResolvedOffset());
      syncOffsetFromNode();
    });
  });

  handBoneInput.addEventListener('change', () => {
    runUndoableMutation(() => {
      const entry = getCurrentMountEntry();
      const value = handBoneInput.value.trim();
      entry.handBone = value.length > 0 ? value : undefined;
      renderJson();
    });
    void loadCharacter().then(() => loadWeapon());
  });

  animationSelect.addEventListener('change', () => {
    void updateAnimationState();
  });

  modeTranslate.addEventListener('click', () => setTransformMode('translate'));
  modeRotate.addEventListener('click', () => setTransformMode('rotate'));
  modeScale.addEventListener('click', () => setTransformMode('scale'));

  autoBoneButton.addEventListener('click', () => {
    if (!selectedCharacterRoot) {
      return;
    }
    runUndoableMutation(() => {
      const entry = getCurrentMountEntry();
      const detected = findHandBone(selectedCharacterRoot, entry.handBone);
      if (detected?.name) {
        entry.handBone = detected.name;
        handBoneInput.value = detected.name;
        renderJson();
        attachWeaponToCharacter();
      }
    });
  });

  resetOffsetButton.addEventListener('click', () => {
    runUndoableMutation(() => {
      const entry = getCurrentMountEntry();
      const target = ensureOffsetRef(entry, getCurrentWeaponId(), getEditScope());
      target.position = [0, 0, 0];
      target.rotation = [0, 0, 0];
      target.scale = 1;
      applyOffsetNode(target);
      syncOffsetFromNode();
    });
  });

  removeOverrideButton.addEventListener('click', () => {
    runUndoableMutation(() => {
      if (getEditScope() !== 'weapon') {
        return;
      }
      const entry = getCurrentMountEntry();
      const weaponId = getCurrentWeaponId();
      if (entry.weaponOffsetsById && weaponId in entry.weaponOffsetsById) {
        delete entry.weaponOffsetsById[weaponId];
        if (Object.keys(entry.weaponOffsetsById).length === 0) {
          delete entry.weaponOffsetsById;
        }
        applyOffsetNode(getCurrentResolvedOffset());
        syncOffsetFromNode();
      }
    });
  });

  [posX, posY, posZ, rotX, rotY, rotZ, scale].forEach((element) => {
    element.addEventListener('change', onNumericInput);
  });
  undoButton.addEventListener('click', () => {
    void undoLastChange();
  });

  saveFileButton.addEventListener('click', async () => {
    try {
      const response = await fetch(SAVE_MOUNTS_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: jsonOutput.value
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setStatus('Saved weapon_mounts.json in client/public assets');
    } catch {
      setStatus('Save failed. Run via `npm run dev` so the editor save endpoint is available');
    }
  });

  copyJsonButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(jsonOutput.value);
      setStatus('JSON copied to clipboard');
    } catch {
      setStatus('Clipboard unavailable; copy from the panel manually');
    }
  });

  downloadJsonButton.addEventListener('click', () => {
    const blob = new Blob([jsonOutput.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'weapon_mounts.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('Downloaded weapon_mounts.json');
  });

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    const isUndoShortcut = (event.metaKey || event.ctrlKey) && !event.altKey && key === 'z';
    if (isUndoShortcut) {
      if (!isEditableTarget(event.target)) {
        event.preventDefault();
        void undoLastChange();
      }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) {
      return;
    }
    if (key === 'w') {
      setTransformMode('translate');
    } else if (key === 'e') {
      setTransformMode('rotate');
    } else if (key === 'r') {
      setTransformMode('scale');
    }
  });

  const resize = () => {
    const rect = viewport.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const animate = (nowMs: number) => {
    const dt = Math.min(0.05, (nowMs - lastFrameMs) / 1000);
    lastFrameMs = nowMs;
    mixer?.update(dt);
    orbit.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);

  catalog = await loadCharacterCatalog();
  mounts = await loadWeaponMountCatalog();
  if (catalog.entries.length === 0) {
    setStatus('No characters available. Check manifest and asset paths.');
    return;
  }
  populateSelectors();
  seedMountCatalog();
  undoStack = [];
  updateUndoButtonState();
  setTransformMode('translate');
  refreshFromState();
  await loadCharacter();
  await loadWeapon();
};

void main();
