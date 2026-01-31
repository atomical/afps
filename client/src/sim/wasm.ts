import { SIM_CONFIG, type SimConfig } from './config';

export interface WasmInput {
  moveX: number;
  moveY: number;
  sprint: boolean;
}

export interface WasmSimState {
  x: number;
  y: number;
}

export interface WasmSimModule {
  _sim_create: () => number;
  _sim_destroy: (handle: number) => void;
  _sim_reset: (handle: number) => void;
  _sim_set_config: (handle: number, moveSpeed: number, sprintMultiplier: number) => void;
  _sim_set_state: (handle: number, x: number, y: number) => void;
  _sim_step: (handle: number, dt: number, moveX: number, moveY: number, sprint: number) => void;
  _sim_get_x: (handle: number) => number;
  _sim_get_y: (handle: number) => number;
}

export interface WasmSimInstance {
  step: (input: WasmInput, dt: number) => void;
  getState: () => WasmSimState;
  reset: () => void;
  setState: (x: number, y: number) => void;
  setConfig: (config: SimConfig) => void;
  dispose: () => void;
}

const toNumber = (value: number) => (Number.isFinite(value) ? value : 0);

export const createWasmSim = (module: WasmSimModule, config: SimConfig = SIM_CONFIG): WasmSimInstance => {
  const handle = module._sim_create();

  const setConfig = (next: SimConfig) => {
    module._sim_set_config(handle, toNumber(next.moveSpeed), toNumber(next.sprintMultiplier));
  };

  setConfig(config);

  const step = (input: WasmInput, dt: number) => {
    module._sim_step(
      handle,
      toNumber(dt),
      toNumber(input.moveX),
      toNumber(input.moveY),
      input.sprint ? 1 : 0
    );
  };

  const getState = (): WasmSimState => ({
    x: module._sim_get_x(handle),
    y: module._sim_get_y(handle)
  });

  const reset = () => {
    module._sim_reset(handle);
  };

  const setState = (x: number, y: number) => {
    module._sim_set_state(handle, toNumber(x), toNumber(y));
  };

  const dispose = () => {
    module._sim_destroy(handle);
  };

  return { step, getState, reset, setState, setConfig, dispose };
};

export type WasmModuleFactory = () => Promise<WasmSimModule>;

export const loadWasmSim = async (factory: WasmModuleFactory, config?: SimConfig) => {
  const module = await factory();
  return createWasmSim(module, config ?? SIM_CONFIG);
};

const resolveFactory = async (moduleUrl: string, importer: (url: string) => Promise<unknown>) => {
  const imported = await importer(moduleUrl);
  const candidate = (imported as { default?: unknown }).default ?? imported;
  if (typeof candidate !== 'function') {
    throw new Error(`WASM module did not export a factory at ${moduleUrl}`);
  }
  return candidate as WasmModuleFactory;
};

export const loadWasmSimFromUrl = async (
  moduleUrl: string,
  config?: SimConfig,
  importer: (url: string) => Promise<unknown> = (url) => import(/* @vite-ignore */ url)
) => {
  const factory = await resolveFactory(moduleUrl, importer);
  return loadWasmSim(factory, config);
};
