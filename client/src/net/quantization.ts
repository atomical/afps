export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const INT16_MAX = 32767;
const MAX_PITCH_RAD = Math.PI / 2 - 0.01;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const signNotZero = (value: number) => (value < 0 ? -1 : 1);

const normalize = (vec: Vec3): Vec3 => {
  const length = Math.hypot(vec.x, vec.y, vec.z);
  if (!Number.isFinite(length) || length <= 1e-12) {
    return { x: 0, y: 0, z: 1 };
  }
  return { x: vec.x / length, y: vec.y / length, z: vec.z / length };
};

export const dequantizeU16 = (value: number, step: number) => {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
    return 0;
  }
  const clamped = clamp(Math.floor(value), 0, 0xffff);
  return clamped * step;
};

export const dequantizeI16 = (value: number, step: number) => {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
    return 0;
  }
  const clamped = clamp(Math.floor(value), -0x8000, 0x7fff);
  return clamped * step;
};

export const decodeUnitU16 = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const clamped = clamp(Math.floor(value), 0, 0xffff);
  return clamped / 65535;
};

export const decodeYawQ = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const clamped = clamp(Math.floor(value), -INT16_MAX, INT16_MAX);
  return (clamped / INT16_MAX) * Math.PI;
};

export const decodePitchQ = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const clamped = clamp(Math.floor(value), -INT16_MAX, INT16_MAX);
  return (clamped / INT16_MAX) * MAX_PITCH_RAD;
};

export const decodeOct16 = (octX: number, octY: number): Vec3 => {
  if (!Number.isFinite(octX) || !Number.isFinite(octY)) {
    return { x: 0, y: 0, z: 1 };
  }
  let x = clamp(Math.round(octX), -INT16_MAX, INT16_MAX) / INT16_MAX;
  let y = clamp(Math.round(octY), -INT16_MAX, INT16_MAX) / INT16_MAX;
  let z = 1 - Math.abs(x) - Math.abs(y);
  if (z < 0) {
    const ox = x;
    const oy = y;
    x = (1 - Math.abs(oy)) * signNotZero(ox);
    y = (1 - Math.abs(ox)) * signNotZero(oy);
    z = 1 - Math.abs(x) - Math.abs(y);
  }
  return normalize({ x, y, z });
};

export const __test = { normalize, INT16_MAX, MAX_PITCH_RAD };

