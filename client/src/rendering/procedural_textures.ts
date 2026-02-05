export type TexturePixels = {
  data: Uint8Array;
  width: number;
  height: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const writePixel = (
  data: Uint8Array,
  width: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number
) => {
  const idx = (y * width + x) * 4;
  data[idx] = r & 0xff;
  data[idx + 1] = g & 0xff;
  data[idx + 2] = b & 0xff;
  data[idx + 3] = a & 0xff;
};

const alphaBlend = (
  data: Uint8Array,
  width: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number
) => {
  const idx = (y * width + x) * 4;
  const dstA = data[idx + 3] / 255;
  const srcA = (a & 0xff) / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 1e-6) {
    return;
  }
  const dstR = data[idx] / 255;
  const dstG = data[idx + 1] / 255;
  const dstB = data[idx + 2] / 255;
  const srcR = (r & 0xff) / 255;
  const srcG = (g & 0xff) / 255;
  const srcB = (b & 0xff) / 255;
  const outR = (srcR * srcA + dstR * dstA * (1 - srcA)) / outA;
  const outG = (srcG * srcA + dstG * dstA * (1 - srcA)) / outA;
  const outB = (srcB * srcA + dstB * dstA * (1 - srcA)) / outA;
  data[idx] = Math.round(clamp01(outR) * 255);
  data[idx + 1] = Math.round(clamp01(outG) * 255);
  data[idx + 2] = Math.round(clamp01(outB) * 255);
  data[idx + 3] = Math.round(clamp01(outA) * 255);
};

const fill = (data: Uint8Array, r: number, g: number, b: number, a: number) => {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r & 0xff;
    data[i + 1] = g & 0xff;
    data[i + 2] = b & 0xff;
    data[i + 3] = a & 0xff;
  }
};

const toByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const radial = (dx: number, dy: number) => Math.sqrt(dx * dx + dy * dy);

export const generateMuzzleFlashTexture = (options: { size?: number; seed?: number } = {}): TexturePixels => {
  const size = Number.isFinite(options.size) ? Math.max(8, Math.floor(options.size)) : 64;
  const seed = (options.seed ?? 0x9e3779b9) >>> 0;
  const rand = mulberry32(seed);
  const data = new Uint8Array(size * size * 4);
  fill(data, 0, 0, 0, 0);

  const spikes = 6 + Math.floor(rand() * 6);
  const twist = rand() * Math.PI * 2;
  const warm = 0.7 + rand() * 0.25;
  const baseR = 1.0;
  const baseG = 0.9 * warm;
  const baseB = 0.4 * warm;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size * 2 - 1;
      const ny = (y + 0.5) / size * 2 - 1;
      const r = radial(nx, ny);
      if (r > 1.05) {
        continue;
      }
      const theta = Math.atan2(ny, nx);
      const spike = 0.65 + 0.35 * Math.sin(theta * spikes + twist);
      const core = Math.pow(clamp01(1 - r), 1.8);
      const halo = Math.pow(clamp01(1 - r), 0.6) * 0.25;
      const intensity = clamp01(core * spike + halo);
      if (intensity <= 0.001) {
        continue;
      }
      const alpha = intensity * (0.92 - 0.2 * rand());
      const tint = 0.85 + 0.15 * spike;
      const outR = toByte(255 * baseR * tint);
      const outG = toByte(255 * baseG * tint);
      const outB = toByte(255 * baseB * tint);
      const outA = toByte(255 * alpha);
      writePixel(data, size, x, y, outR, outG, outB, outA);
    }
  }

  // Add a subtle noisy fringe so it doesn't look like a perfect disc.
  const fringeSeed = (seed ^ 0xa1b2c3d4) >>> 0;
  const fringeRand = mulberry32(fringeSeed);
  for (let i = 0; i < 140; i += 1) {
    const fx = Math.floor(fringeRand() * size);
    const fy = Math.floor(fringeRand() * size);
    const nx = (fx + 0.5) / size * 2 - 1;
    const ny = (fy + 0.5) / size * 2 - 1;
    const r = radial(nx, ny);
    if (r < 0.75 || r > 1.05) {
      continue;
    }
    const a = toByte(40 + fringeRand() * 60);
    alphaBlend(data, size, fx, fy, 255, 245, 170, a);
  }

  return { data, width: size, height: size };
};

export const generateImpactTexture = (options: { size?: number; seed?: number } = {}): TexturePixels => {
  const size = Number.isFinite(options.size) ? Math.max(8, Math.floor(options.size)) : 64;
  const seed = (options.seed ?? 0x12345678) >>> 0;
  const rand = mulberry32(seed);
  const data = new Uint8Array(size * size * 4);
  fill(data, 0, 0, 0, 0);

  const rays = 10 + Math.floor(rand() * 10);
  const twist = rand() * Math.PI * 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size * 2 - 1;
      const ny = (y + 0.5) / size * 2 - 1;
      const r = radial(nx, ny);
      if (r > 1.02) {
        continue;
      }
      const theta = Math.atan2(ny, nx);
      const ray = 0.6 + 0.4 * Math.abs(Math.sin(theta * rays + twist));
      const core = Math.pow(clamp01(1 - r), 2.2);
      const intensity = clamp01(core * ray);
      if (intensity <= 0.001) {
        continue;
      }
      const alpha = intensity * (0.85 - 0.1 * rand());
      const outA = toByte(255 * alpha);
      writePixel(data, size, x, y, 255, 255, 255, outA);
    }
  }

  return { data, width: size, height: size };
};

export type DecalKind = 'bullet' | 'scorch' | 'dust' | 'energy';

export const generateDecalTexture = (
  kind: DecalKind,
  options: { size?: number; seed?: number } = {}
): TexturePixels => {
  const size = Number.isFinite(options.size) ? Math.max(16, Math.floor(options.size)) : 64;
  const seed = (options.seed ?? 0xdeadbeef) >>> 0;
  const rand = mulberry32(seed ^ hashString(kind));
  const data = new Uint8Array(size * size * 4);
  fill(data, 0, 0, 0, 0);

  const center = (size - 1) / 2;
  const radius = center * (0.75 + 0.1 * rand());
  const crackCount = 5 + Math.floor(rand() * 6);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > radius * 1.2) {
        continue;
      }
      const theta = Math.atan2(dy, dx);
      const ring = Math.abs(r - radius * 0.55) / (radius * 0.12);
      const ringMask = clamp01(1 - ring);

      let alpha = 0;
      let color = { r: 20, g: 20, b: 20 };

      if (kind === 'bullet') {
        const soot = Math.pow(clamp01(1 - r / radius), 0.8);
        alpha = 0.25 * soot + 0.45 * ringMask;
        color = { r: 15, g: 15, b: 15 };
      } else if (kind === 'scorch') {
        const falloff = Math.pow(clamp01(1 - r / radius), 1.2);
        alpha = 0.35 * falloff + 0.35 * ringMask;
        color = { r: 35, g: 22, b: 12 };
      } else if (kind === 'dust') {
        const falloff = Math.pow(clamp01(1 - r / radius), 0.9);
        alpha = 0.3 * falloff + 0.25 * ringMask;
        color = { r: 70, g: 60, b: 45 };
      } else if (kind === 'energy') {
        const falloff = Math.pow(clamp01(1 - r / radius), 1.4);
        alpha = 0.4 * falloff + 0.25 * ringMask;
        color = { r: 40, g: 80, b: 160 };
      }

      // Add cracks as angular noise lines.
      const crackBand = Math.abs(Math.sin(theta * crackCount + rand() * 0.8)) * 0.9;
      const crackMask = clamp01(1 - crackBand);
      alpha += crackMask * clamp01(1 - r / radius) * 0.25;

      // Grain noise.
      alpha *= 0.85 + 0.25 * rand();
      if (alpha <= 0.002) {
        continue;
      }

      const outA = toByte(255 * clamp01(alpha));
      writePixel(data, size, x, y, color.r, color.g, color.b, outA);
    }
  }

  return { data, width: size, height: size };
};

export const __test = { mulberry32, alphaBlend, writePixel, toByte };
