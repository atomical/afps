import type { Object3DLike, SceneLike, ThreeLike } from '../types';

export interface ProceduralCloudLayer {
  update: (deltaSeconds: number, cameraPosition?: { x: number; y: number; z: number }) => void;
  dispose: () => void;
}

export interface ProceduralCloudLayerOptions {
  three: ThreeLike;
  scene: SceneLike;
  seed: number;
  arenaHalfSize: number;
}

type CloudCard = {
  mesh: Object3DLike;
  baseY: number;
  bobAmplitude: number;
  bobRate: number;
  bobPhase: number;
  driftX: number;
  driftZ: number;
  wrapRadius: number;
};

const CLOUD_TEXTURE_SIZE = 64;
const CLOUD_ALTITUDE_BASE = 22;
const CLOUD_ALTITUDE_RANGE = 18;
const CLOUD_AREA_SCALE = 1.6;
const CLOUD_COUNT_MIN = 20;
const CLOUD_COUNT_MAX = 84;
const CLOUD_CARD_MIN = 3;
const CLOUD_CARD_MAX = 6;
const CLOUD_DRIFT_MIN = 0.7;
const CLOUD_DRIFT_MAX = 2.0;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const createRng = (seed: number) => {
  let state = (Math.floor(seed) >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    if (state === 0) {
      state = 1;
    }
    return state / 0xffffffff;
  };
};

const hash2 = (x: number, y: number, seed: number) => {
  let n = (x * 374761393 + y * 668265263 + seed * 362437) >>> 0;
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
};

const smoothstep = (value: number) => value * value * (3 - 2 * value);

const valueNoise2 = (x: number, y: number, seed: number) => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x1, y0, seed);
  const v01 = hash2(x0, y1, seed);
  const v11 = hash2(x1, y1, seed);
  const vx0 = lerp(v00, v10, tx);
  const vx1 = lerp(v01, v11, tx);
  return lerp(vx0, vx1, ty);
};

const fbm2 = (x: number, y: number, seed: number) => {
  let frequency = 1;
  let amplitude = 1;
  let sum = 0;
  let maxAmp = 0;
  for (let i = 0; i < 4; i += 1) {
    sum += valueNoise2(x * frequency, y * frequency, seed + i * 101) * amplitude;
    maxAmp += amplitude;
    frequency *= 2;
    amplitude *= 0.5;
  }
  return maxAmp > 0 ? sum / maxAmp : 0;
};

const buildCloudTexture = (seed: number) => {
  const size = CLOUD_TEXTURE_SIZE;
  const pixels = new Uint8Array(size * size * 4);
  const center = (size - 1) * 0.5;
  const invCenter = center > 0 ? 1 / center : 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x - center) * invCenter;
      const ny = (y - center) * invCenter;
      const radius = Math.sqrt(nx * nx + ny * ny);
      const edge = clamp01(1 - radius);
      const n = fbm2(nx * 3.25 + 9.7, ny * 3.25 - 4.3, seed >>> 0);
      const alpha = clamp01(Math.pow(edge, 1.4) * (0.55 + n * 0.55));
      const offset = (y * size + x) * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  return { data: pixels, width: size, height: size };
};

const createCloudMaterial = (three: ThreeLike, color: number, opacity: number, map: unknown) => {
  const BasicCtor = (
    three as unknown as {
      MeshBasicMaterial?: new (params: Record<string, unknown>) => unknown;
    }
  ).MeshBasicMaterial;
  const material = BasicCtor ? new BasicCtor({ color }) : new three.MeshToonMaterial({ color });
  const runtime = material as {
    map?: unknown;
    transparent?: boolean;
    depthWrite?: boolean;
    depthTest?: boolean;
    opacity?: number;
    side?: unknown;
    alphaTest?: number;
  };
  runtime.map = map;
  runtime.transparent = true;
  runtime.depthWrite = false;
  runtime.depthTest = true;
  runtime.opacity = opacity;
  runtime.alphaTest = 0.1;
  const DoubleSide = (three as unknown as { DoubleSide?: unknown }).DoubleSide;
  if (DoubleSide !== undefined) {
    runtime.side = DoubleSide;
  }
  return material;
};

// Adapted from the mesh-cluster + billboard ideas in:
// https://github.com/CK42BB/procedural-clouds-threejs
export const createProceduralCloudLayer = ({
  three,
  scene,
  seed,
  arenaHalfSize
}: ProceduralCloudLayerOptions): ProceduralCloudLayer | null => {
  if (!scene?.add || !three?.PlaneGeometry || !three?.Mesh || !three?.DataTexture) {
    return null;
  }

  const rand = createRng(seed ^ 0x9e3779b9);
  const cloudTexturePixels = buildCloudTexture(seed ^ 0x85ebca6b);
  const cloudTexture = new three.DataTexture(cloudTexturePixels.data, cloudTexturePixels.width, cloudTexturePixels.height);
  cloudTexture.minFilter = three.NearestFilter;
  cloudTexture.magFilter = three.NearestFilter;
  cloudTexture.generateMipmaps = false;
  (cloudTexture as unknown as { colorSpace?: unknown }).colorSpace = three.SRGBColorSpace;
  cloudTexture.needsUpdate = true;

  const materials = [
    createCloudMaterial(three, 0xf7fbff, 0.56, cloudTexture),
    createCloudMaterial(three, 0xf1f7ff, 0.52, cloudTexture),
    createCloudMaterial(three, 0xecf4ff, 0.5, cloudTexture)
  ];
  const geometry = new three.PlaneGeometry(1, 1);

  const maxCloudRadius = Math.max(85, Number.isFinite(arenaHalfSize) ? arenaHalfSize * CLOUD_AREA_SCALE : 120);
  const cloudCount = Math.max(
    CLOUD_COUNT_MIN,
    Math.min(CLOUD_COUNT_MAX, Math.round(maxCloudRadius * 0.5))
  );

  const cards: CloudCard[] = [];
  for (let i = 0; i < cloudCount; i += 1) {
    const centerX = lerp(-maxCloudRadius, maxCloudRadius, rand());
    const centerZ = lerp(-maxCloudRadius, maxCloudRadius, rand());
    const baseY = CLOUD_ALTITUDE_BASE + rand() * CLOUD_ALTITUDE_RANGE;
    const driftAngle = rand() * Math.PI * 2;
    const driftSpeed = lerp(CLOUD_DRIFT_MIN, CLOUD_DRIFT_MAX, rand());
    const driftX = Math.cos(driftAngle) * driftSpeed;
    const driftZ = Math.sin(driftAngle) * driftSpeed;
    const cardCount = CLOUD_CARD_MIN + Math.floor(rand() * (CLOUD_CARD_MAX - CLOUD_CARD_MIN + 1));
    const cloudRadius = lerp(4.5, 13.5, rand());

    for (let cardIndex = 0; cardIndex < cardCount; cardIndex += 1) {
      const material = materials[Math.floor(rand() * materials.length)]!;
      const mesh = new three.Mesh(geometry, material as never) as unknown as Object3DLike;
      const angle = rand() * Math.PI * 2;
      const radius = Math.sqrt(rand()) * cloudRadius;
      const cardSize = lerp(5.5, 15.5, rand());
      mesh.position.set(
        centerX + Math.cos(angle) * radius,
        baseY + (rand() - 0.5) * 2.4,
        centerZ + Math.sin(angle) * radius
      );
      mesh.rotation.y = rand() * Math.PI * 2;
      mesh.rotation.x = (rand() - 0.5) * 0.2;
      if (mesh.scale) {
        mesh.scale.set(cardSize, cardSize * lerp(0.48, 0.75, rand()), 1);
      }
      scene.add(mesh);
      cards.push({
        mesh,
        baseY: mesh.position.y,
        bobAmplitude: lerp(0.06, 0.42, rand()),
        bobRate: lerp(0.08, 0.24, rand()),
        bobPhase: rand() * Math.PI * 2,
        driftX,
        driftZ,
        wrapRadius: maxCloudRadius * 1.15
      });
    }
  }

  let elapsedSeconds = 0;
  let disposed = false;
  const update = (deltaSeconds: number, cameraPosition?: { x: number; y: number; z: number }) => {
    if (disposed) {
      return;
    }
    const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? Math.min(deltaSeconds, 0.1) : 0;
    if (dt <= 0) {
      return;
    }
    elapsedSeconds += dt;
    const anchorX =
      cameraPosition && Number.isFinite(cameraPosition.x)
        ? cameraPosition.x
        : 0;
    const anchorZ =
      cameraPosition && Number.isFinite(cameraPosition.z)
        ? cameraPosition.z
        : 0;
    for (const card of cards) {
      const pos = card.mesh.position;
      pos.x += card.driftX * dt;
      pos.z += card.driftZ * dt;
      const minX = anchorX - card.wrapRadius;
      const maxX = anchorX + card.wrapRadius;
      const minZ = anchorZ - card.wrapRadius;
      const maxZ = anchorZ + card.wrapRadius;
      if (pos.x < minX) {
        pos.x += card.wrapRadius * 2;
      } else if (pos.x > maxX) {
        pos.x -= card.wrapRadius * 2;
      }
      if (pos.z < minZ) {
        pos.z += card.wrapRadius * 2;
      } else if (pos.z > maxZ) {
        pos.z -= card.wrapRadius * 2;
      }
      pos.y = card.baseY + Math.sin(elapsedSeconds * card.bobRate + card.bobPhase) * card.bobAmplitude;
    }
  };

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    for (const card of cards) {
      scene.remove?.(card.mesh);
    }
    cards.length = 0;
    (geometry as unknown as { dispose?: () => void }).dispose?.();
    for (const material of materials) {
      (material as unknown as { dispose?: () => void }).dispose?.();
    }
    (cloudTexture as unknown as { dispose?: () => void }).dispose?.();
  };

  return { update, dispose };
};
