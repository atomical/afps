import { afterEach, describe, expect, it } from 'vitest';
import {
  getLookSensitivity,
  getSignalingAuthToken,
  getSignalingUrl,
  getWasmSimParity,
  getWasmSimUrl
} from '../../src/net/env';

const env = import.meta.env as Record<string, string | undefined>;
const originalLook = env.VITE_LOOK_SENSITIVITY;
const originalWasm = env.VITE_WASM_SIM_URL;
const originalParity = env.VITE_WASM_SIM_PARITY;

afterEach(() => {
  env.VITE_LOOK_SENSITIVITY = originalLook;
  env.VITE_WASM_SIM_URL = originalWasm;
  env.VITE_WASM_SIM_PARITY = originalParity;
});

describe('env', () => {
  it('reads signaling url from import.meta.env', () => {
    expect(getSignalingUrl()).toBe(import.meta.env.VITE_SIGNALING_URL);
  });

  it('reads signaling auth token from import.meta.env', () => {
    expect(getSignalingAuthToken()).toBe(import.meta.env.VITE_SIGNALING_AUTH_TOKEN);
  });

  it('parses look sensitivity from env', () => {
    env.VITE_LOOK_SENSITIVITY = '0.004';
    expect(getLookSensitivity()).toBeCloseTo(0.004);
  });

  it('returns undefined for invalid look sensitivity', () => {
    env.VITE_LOOK_SENSITIVITY = 'nope';
    expect(getLookSensitivity()).toBeUndefined();
  });

  it('returns undefined when look sensitivity is unset', () => {
    env.VITE_LOOK_SENSITIVITY = '';
    expect(getLookSensitivity()).toBeUndefined();
  });

  it('reads wasm sim url from env', () => {
    env.VITE_WASM_SIM_URL = 'https://example.test/afps_sim.js';
    expect(getWasmSimUrl()).toBe('https://example.test/afps_sim.js');
  });

  it('parses wasm sim parity flag', () => {
    env.VITE_WASM_SIM_PARITY = '1';
    expect(getWasmSimParity()).toBe(true);
    env.VITE_WASM_SIM_PARITY = 'true';
    expect(getWasmSimParity()).toBe(true);
    env.VITE_WASM_SIM_PARITY = '0';
    expect(getWasmSimParity()).toBe(false);
    delete env.VITE_WASM_SIM_PARITY;
    expect(getWasmSimParity()).toBe(false);
  });
});
