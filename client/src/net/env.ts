export const getSignalingUrl = () => import.meta.env.VITE_SIGNALING_URL as string | undefined;
export const getSignalingAuthToken = () =>
  import.meta.env.VITE_SIGNALING_AUTH_TOKEN as string | undefined;
export const getWasmSimUrl = () => import.meta.env.VITE_WASM_SIM_URL as string | undefined;
export const getWasmSimParity = () => {
  const value = import.meta.env.VITE_WASM_SIM_PARITY;
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
};

const readEnvNumber = (value: unknown): number | undefined => {
  const text = typeof value === 'string' ? value : '';
  if (text.length === 0) {
    return undefined;
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
};

export const getLookSensitivity = () => {
  const value = readEnvNumber(import.meta.env.VITE_LOOK_SENSITIVITY);
  if (value === undefined || value <= 0) {
    return undefined;
  }
  return value;
};
