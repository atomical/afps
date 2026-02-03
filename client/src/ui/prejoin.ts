import type { CharacterCatalog, CharacterEntry } from '../characters/catalog';
import { resolveCharacterEntry } from '../characters/catalog';
import type { LocalPlayerProfile } from '../profile/types';
import { validateNickname } from '../profile/validation';

export interface PrejoinOverlay {
  element: HTMLDivElement;
  waitForSubmit: () => Promise<LocalPlayerProfile>;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

export interface PrejoinOptions {
  catalog: CharacterCatalog;
  initialProfile?: Partial<LocalPlayerProfile>;
  onSubmit?: (profile: LocalPlayerProfile) => void;
}

export const createPrejoinOverlay = (
  doc: Document,
  { catalog, initialProfile, onSubmit }: PrejoinOptions,
  containerId = 'app'
): PrejoinOverlay => {
  const host = doc.getElementById(containerId) ?? doc.body;
  const overlay = doc.createElement('div');
  overlay.className = 'prejoin-overlay';
  overlay.dataset.visible = 'true';

  const panel = doc.createElement('div');
  panel.className = 'prejoin-panel';

  const header = doc.createElement('div');
  header.className = 'prejoin-header';
  const headerText = doc.createElement('div');
  headerText.className = 'prejoin-header-text';
  const title = doc.createElement('div');
  title.className = 'prejoin-title';
  title.textContent = 'Pre-Join Loadout';

  const subtitle = doc.createElement('div');
  subtitle.className = 'prejoin-subtitle';
  subtitle.textContent = 'Choose a callsign and character.';

  const nameGroup = doc.createElement('div');
  nameGroup.className = 'prejoin-group';
  const nameLabel = doc.createElement('label');
  nameLabel.className = 'prejoin-label';
  nameLabel.textContent = 'Nickname';
  const nameInput = doc.createElement('input');
  nameInput.className = 'prejoin-input';
  nameInput.type = 'text';
  nameInput.maxLength = 24;
  nameInput.placeholder = 'Pilot name';
  nameInput.value = initialProfile?.nickname ?? '';
  const nameHint = doc.createElement('div');
  nameHint.className = 'prejoin-hint';
  nameHint.textContent = '3-16 chars · letters/numbers/space/_/-';
  nameGroup.append(nameLabel, nameInput, nameHint);

  const rosterGroup = doc.createElement('div');
  rosterGroup.className = 'prejoin-group';
  const rosterLabel = doc.createElement('div');
  rosterLabel.className = 'prejoin-label';
  rosterLabel.textContent = 'Character';
  const roster = doc.createElement('div');
  roster.className = 'prejoin-roster';
  rosterGroup.append(rosterLabel, roster);

  const preview = doc.createElement('div');
  preview.className = 'prejoin-preview';
  const previewTitle = doc.createElement('div');
  previewTitle.className = 'prejoin-preview-title';
  const previewImage = doc.createElement('div');
  previewImage.className = 'prejoin-preview-image';
  const previewCanvas = doc.createElement('canvas');
  previewCanvas.className = 'prejoin-preview-canvas';
  const previewFallback = doc.createElement('div');
  previewFallback.className = 'prejoin-preview-fallback';
  previewFallback.style.display = 'none';
  const previewMeta = doc.createElement('div');
  previewMeta.className = 'prejoin-preview-meta';
  previewImage.append(previewCanvas, previewFallback);
  preview.append(previewTitle, previewImage, previewMeta);

  const joinButton = doc.createElement('button');
  joinButton.type = 'button';
  joinButton.className = 'prejoin-join';
  joinButton.textContent = 'Join Match';
  joinButton.disabled = true;
  headerText.append(title, subtitle);
  header.append(headerText, joinButton);

  const footer = doc.createElement('div');
  footer.className = 'prejoin-footer';
  const errorText = doc.createElement('div');
  errorText.className = 'prejoin-error';
  footer.append(errorText);

  panel.append(header, nameGroup, rosterGroup, preview, footer);
  overlay.append(panel);
  host.appendChild(overlay);

  let selectedId = initialProfile?.characterId ?? catalog.defaultId;
  let resolvedSelection: CharacterEntry = resolveCharacterEntry(catalog, selectedId);

  const canRenderPreview =
    typeof window !== 'undefined' && typeof window.WebGLRenderingContext !== 'undefined';
  let preview3dDisabled = false;
  let previewRenderer: {
    setEntry: (entry: CharacterEntry) => void;
    dispose: () => void;
  } | null = null;
  let previewInit: Promise<void> | null = null;
  let previewToken = 0;

  const ensurePreviewRenderer = () => {
    if (!canRenderPreview || previewRenderer || previewInit) {
      return;
    }
    previewInit = (async () => {
      try {
        const three = await import('three');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');

        const renderer = new three.WebGLRenderer({
          canvas: previewCanvas,
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance'
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);

        const scene = new three.Scene();
        const camera = new three.PerspectiveCamera(32, 1, 0.1, 50);
        camera.position.set(0, 1.35, 2.6);
        scene.add(new three.AmbientLight(0xffffff, 0.7));
        const key = new three.DirectionalLight(0xffffff, 0.9);
        key.position.set(2.2, 3.2, 2.1);
        scene.add(key);
        const fill = new three.DirectionalLight(0xffffff, 0.35);
        fill.position.set(-2.2, 1.3, -1.6);
        scene.add(fill);

        const loader = new GLTFLoader();
        const textureLoader = new three.TextureLoader();
        const modelCache = new Map<string, Promise<{ scene: unknown; animations: unknown[] } | null>>();
        const animationCache = new Map<string, Promise<unknown[]>>();
        let modelRoot: any = null;
        let mixer: any = null;
        let activeAction: any = null;
        let rafId = 0;
        let lastFrame = performance.now();

        const resize = () => {
          const rect = previewImage.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) {
            return;
          }
          renderer.setSize(rect.width, rect.height, false);
          camera.aspect = rect.width / rect.height;
          camera.updateProjectionMatrix();
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

        const loadGltf = (url: string) => {
          if (!modelCache.has(url)) {
            const promise = new Promise<{ scene: unknown; animations: unknown[] } | null>((resolve) => {
              loader.load(
                url,
                (gltf: { scene?: unknown; animations?: unknown[] }) => {
                  resolve({ scene: gltf.scene ?? {}, animations: gltf.animations ?? [] });
                },
                undefined,
                () => resolve(null)
              );
            });
            modelCache.set(url, promise);
          }
          return modelCache.get(url)!;
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

        const normalizeClipName = (clip: unknown) =>
          (clip as { name?: string }).name?.toLowerCase() ?? '';

        const selectClip = (clips: unknown[], keywords: string[]) => {
          const lowered = keywords.map((keyword) => keyword.toLowerCase());
          return clips.find((clip) =>
            lowered.some((keyword) => normalizeClipName(clip).includes(keyword))
          );
        };

        const setModel = async (entry: CharacterEntry, token: number) => {
          if (!entry.modelUrl) {
            return;
          }
          previewCanvas.dataset.ready = 'false';
          const gltf = await loadGltf(entry.modelUrl);
          if (!gltf || token !== previewToken) {
            if (token === previewToken) {
              if (entry.previewUrl) {
                previewCanvas.style.display = 'none';
                previewImage.style.backgroundImage = `url(${entry.previewUrl})`;
                previewFallback.textContent = '';
                previewFallback.style.display = 'none';
              } else {
                previewCanvas.style.display = 'none';
                previewImage.style.backgroundImage = '';
                previewFallback.textContent = 'Preview unavailable';
                previewFallback.style.display = 'block';
              }
            }
            return;
          }

          if (modelRoot) {
            scene.remove(modelRoot);
            modelRoot = null;
          }
          mixer = null;
          activeAction = null;

          const root: any = gltf.scene;
          if (entry.skinUrl) {
            textureLoader.load(
              entry.skinUrl,
              (texture) => {
                (texture as { colorSpace?: unknown }).colorSpace =
                  (three as any).SRGBColorSpace ?? texture.colorSpace;
                const applyTexture = (node: any) => {
                  const mat = node.material;
                  if (Array.isArray(mat)) {
                    mat.forEach((m) => {
                      if (m) {
                        m.map = texture;
                        m.needsUpdate = true;
                      }
                    });
                  } else if (mat) {
                    mat.map = texture;
                    mat.needsUpdate = true;
                  }
                };
                if (root.traverse) {
                  root.traverse((child: any) => applyTexture(child));
                } else {
                  applyTexture(root);
                }
              },
              undefined,
              () => {
                // ignore texture failures
              }
            );
          }

          const box = new three.Box3().setFromObject(root);
          const size = new three.Vector3();
          const center = new three.Vector3();
          box.getSize(size);
          box.getCenter(center);
          root.position.x -= center.x;
          root.position.z -= center.z;
          root.position.y -= center.y;
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = maxDim > 0 ? 1.6 / maxDim : 1;
          if (root.scale?.set) {
            root.scale.set(scale, scale, scale);
          }

          const framedBox = new three.Box3().setFromObject(root);
          const framedSize = new three.Vector3();
          const framedCenter = new three.Vector3();
          framedBox.getSize(framedSize);
          framedBox.getCenter(framedCenter);
          root.position.y -= framedBox.min.y;
          framedBox.translate(new three.Vector3(0, -framedBox.min.y, 0));

          const sphere = new three.Sphere();
          framedBox.getBoundingSphere(sphere);
          const fov = three.MathUtils.degToRad(camera.fov);
          const distance = sphere.radius > 0 ? sphere.radius / Math.sin(fov / 2) : 2.5;
          const padding = 1.15;
          camera.position.set(sphere.center.x, sphere.center.y, sphere.center.z + distance * padding);
          camera.near = Math.max(0.01, distance - sphere.radius * 2.5);
          camera.far = distance + sphere.radius * 2.5;
          camera.lookAt(sphere.center);
          camera.updateProjectionMatrix();

          const animations = Array.isArray(gltf.animations) ? gltf.animations : [];
          let merged = animations;
          if (animations.length < 3) {
            const extras = await loadAnimationClips(buildAnimationUrls(entry.modelUrl));
            if (extras.length) {
              const seen = new Set(animations.map((clip) => normalizeClipName(clip)).filter(Boolean));
              merged = [...animations];
              extras.forEach((clip) => {
                const name = normalizeClipName(clip);
                if (name && seen.has(name)) {
                  return;
                }
                merged.push(clip);
                if (name) {
                  seen.add(name);
                }
              });
            }
          }

          if (merged.length && three.AnimationMixer) {
            mixer = new three.AnimationMixer(root);
            const idleClip = selectClip(merged, ['idle', 'stand']) ?? merged[0];
            if (idleClip) {
              activeAction = mixer.clipAction(idleClip);
              activeAction.play();
            }
          }

          modelRoot = root;
          scene.add(root);
          previewCanvas.dataset.ready = 'true';
        };

        const render = (time: number) => {
          const freeze = (window as any).__AFPS_PREJOIN_FREEZE__ === true;
          const dt = Math.min(0.1, (time - lastFrame) / 1000);
          lastFrame = time;
          if (modelRoot && !freeze) {
            modelRoot.rotation.y += dt * 0.6;
          }
          if (mixer && !freeze) {
            mixer.update(dt);
          }
          renderer.render(scene, camera);
          rafId = window.requestAnimationFrame(render);
        };

        resize();
        rafId = window.requestAnimationFrame(render);
        if (typeof ResizeObserver !== 'undefined') {
          const observer = new ResizeObserver(() => resize());
          observer.observe(previewImage);
          const dispose = () => observer.disconnect();
          (render as unknown as { dispose?: () => void }).dispose = dispose;
        } else {
          window.addEventListener('resize', resize);
        }

        previewRenderer = {
          setEntry: (entry) => {
            previewToken += 1;
            const token = previewToken;
            void setModel(entry, token);
          },
          dispose: () => {
            if (rafId) {
              window.cancelAnimationFrame(rafId);
            }
            const disposeObserver = (render as unknown as { dispose?: () => void }).dispose;
            if (disposeObserver) {
              disposeObserver();
            } else {
              window.removeEventListener('resize', resize);
            }
            renderer.dispose();
            previewCanvas.remove();
          }
        };
      } catch {
        preview3dDisabled = true;
      }
    })();
  };

  const updatePreview = (entry: CharacterEntry) => {
    previewTitle.textContent = entry.displayName;
    previewMeta.textContent = entry.id;
    const hasModel = Boolean(entry.modelUrl && canRenderPreview && !preview3dDisabled);
    if (hasModel) {
      previewImage.style.backgroundImage = '';
      previewFallback.textContent = 'Loading preview...';
      previewFallback.style.display = 'block';
      previewCanvas.style.display = 'block';
      previewCanvas.dataset.ready = 'false';
      ensurePreviewRenderer();
      previewInit?.then(() => {
        if (previewRenderer) {
          previewRenderer.setEntry(entry);
          previewFallback.textContent = '';
          previewFallback.style.display = 'none';
        } else if (entry.previewUrl) {
          previewCanvas.style.display = 'none';
          previewImage.style.backgroundImage = `url(${entry.previewUrl})`;
          previewFallback.textContent = '';
          previewFallback.style.display = 'none';
        } else {
          previewCanvas.style.display = 'none';
          previewFallback.textContent = 'Preview unavailable';
          previewFallback.style.display = 'block';
        }
      });
    } else if (entry.previewUrl) {
      previewCanvas.style.display = 'none';
      previewCanvas.dataset.ready = 'false';
      previewImage.style.backgroundImage = `url(${entry.previewUrl})`;
      previewFallback.textContent = '';
      previewFallback.style.display = 'none';
    } else {
      previewCanvas.style.display = 'none';
      previewCanvas.dataset.ready = 'false';
      previewImage.style.backgroundImage = '';
      previewFallback.textContent = 'Preview unavailable';
      previewFallback.style.display = 'block';
    }
  };

  const updateJoinState = () => {
    const validation = validateNickname(nameInput.value);
    const hasSelection = Boolean(selectedId);
    joinButton.disabled = !(validation.ok && hasSelection);
    errorText.textContent = validation.ok ? '' : validation.reason ?? '';
  };

  const updateRosterMaxHeight = () => {
    const footerRect = footer.getBoundingClientRect();
    const rosterRect = roster.getBoundingClientRect();
    if (!footerRect.height || !rosterRect.height) {
      return;
    }
    const available = footerRect.top - rosterRect.top - 12;
    if (available > 0) {
      roster.style.maxHeight = `${Math.max(140, available)}px`;
      roster.style.overflowY = 'auto';
    }
  };

  const scheduleRosterMaxHeight = () => {
    window.requestAnimationFrame(updateRosterMaxHeight);
  };

  const renderRoster = () => {
    roster.innerHTML = '';
    catalog.entries.forEach((entry) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'prejoin-character';
      button.dataset.selected = entry.id === selectedId ? 'true' : 'false';
      const label = doc.createElement('span');
      label.className = 'prejoin-character-label';
      label.textContent = entry.displayName;
      button.append(label);
      button.addEventListener('click', () => {
        selectedId = entry.id;
        resolvedSelection = entry;
        updatePreview(entry);
        renderRoster();
        updateJoinState();
      });
      roster.appendChild(button);
    });
    scheduleRosterMaxHeight();
  };

  updatePreview(resolvedSelection);
  renderRoster();
  updateJoinState();
  scheduleRosterMaxHeight();

  const onResize = () => scheduleRosterMaxHeight();
  window.addEventListener('resize', onResize);
  let rosterObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    rosterObserver = new ResizeObserver(() => scheduleRosterMaxHeight());
    rosterObserver.observe(panel);
  }

  nameInput.addEventListener('input', () => {
    updateJoinState();
  });

  let resolveSubmit: ((profile: LocalPlayerProfile) => void) | null = null;
  const submitPromise = new Promise<LocalPlayerProfile>((resolve) => {
    resolveSubmit = resolve;
  });

  joinButton.addEventListener('click', () => {
    const validation = validateNickname(nameInput.value);
    if (!validation.ok || !selectedId) {
      updateJoinState();
      return;
    }
    const profile = { nickname: validation.value, characterId: selectedId };
    onSubmit?.(profile);
    resolveSubmit?.(profile);
    resolveSubmit = null;
    overlay.dataset.visible = 'false';
  });

  const setVisible = (visible: boolean) => {
    overlay.dataset.visible = visible ? 'true' : 'false';
    if (visible) {
      scheduleRosterMaxHeight();
    }
  };

  const dispose = () => {
    previewRenderer?.dispose();
    window.removeEventListener('resize', onResize);
    rosterObserver?.disconnect();
    overlay.remove();
  };

  return { element: overlay, waitForSubmit: () => submitPromise, setVisible, dispose };
};
