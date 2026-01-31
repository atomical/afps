import { beforeEach, describe, expect, it, vi } from 'vitest';

const startAppMock = vi.fn();
const connectMock = vi.fn();
const createInputSamplerMock = vi.fn();
const createInputSenderMock = vi.fn();
const appInstance = {
  ingestSnapshot: vi.fn(),
  setSnapshotRate: vi.fn(),
  recordInput: vi.fn(),
  setTickRate: vi.fn(),
  setPredictionSim: vi.fn(),
  applyLookDelta: vi.fn(),
  setLookSensitivity: vi.fn(),
  state: { cube: { rotation: { x: 0 } } }
};
const inputSenderInstance = {
  start: vi.fn(),
  stop: vi.fn(),
  sendOnce: vi.fn()
};
const samplerInstance = {
  sample: vi.fn(),
  setBindings: vi.fn(),
  dispose: vi.fn()
};
const statusMock = {
  element: document.createElement('div'),
  setState: vi.fn(),
  setDetail: vi.fn(),
  setMetrics: vi.fn(),
  dispose: vi.fn()
};
const hudMock = {
  element: document.createElement('div'),
  setLockState: vi.fn(),
  setSensitivity: vi.fn(),
  dispose: vi.fn()
};
const settingsMock = {
  element: document.createElement('div'),
  isVisible: vi.fn(),
  setVisible: vi.fn(),
  toggle: vi.fn(),
  setSensitivity: vi.fn(),
  dispose: vi.fn()
};
const defaultBindings = {
  forward: ['KeyW'],
  backward: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  jump: ['Space'],
  sprint: ['ShiftLeft']
};
const pointerLockMock = {
  supported: false,
  request: vi.fn(),
  isLocked: vi.fn().mockReturnValue(false),
  dispose: vi.fn()
};

vi.mock('../src/bootstrap', () => ({
  startApp: startAppMock
}));

vi.mock('../src/net/runtime', () => ({
  connectIfConfigured: connectMock
}));

const envMock = {
  getSignalingUrl: vi.fn(),
  getSignalingAuthToken: vi.fn(),
  getLookSensitivity: vi.fn(),
  getWasmSimUrl: vi.fn(),
  getWasmSimParity: vi.fn()
};

vi.mock('../src/net/env', () => envMock);

vi.mock('../src/ui/status', () => ({
  createStatusOverlay: () => statusMock
}));

vi.mock('../src/ui/hud', () => ({
  createHudOverlay: () => hudMock
}));

const wasmLoaderMock = vi.fn();
const wasmAdapterMock = vi.fn();
const wasmParityMock = vi.fn();

vi.mock('../src/sim/wasm', () => ({
  loadWasmSimFromUrl: (...args: unknown[]) => wasmLoaderMock(...args)
}));

vi.mock('../src/sim/wasm_adapter', () => ({
  createWasmPredictionSim: (...args: unknown[]) => wasmAdapterMock(...args)
}));

vi.mock('../src/sim/parity', () => ({
  runWasmParityCheck: (...args: unknown[]) => wasmParityMock(...args)
}));

let settingsOptions:
  | {
      onSensitivityChange?: (value: number) => void;
      onBindingsChange?: (bindings: Record<string, string[]>) => void;
      initialBindings?: Record<string, string[]>;
    }
  | undefined;
vi.mock('../src/ui/settings', () => ({
  createSettingsOverlay: (_doc: Document, options?: { onSensitivityChange?: (value: number) => void }) => {
    settingsOptions = options;
    return settingsMock;
  }
}));

vi.mock('../src/input/sampler', () => ({
  createInputSampler: (...args: unknown[]) => createInputSamplerMock(...args)
}));

vi.mock('../src/net/input_sender', () => ({
  createInputSender: (...args: unknown[]) => createInputSenderMock(...args)
}));

const bindingsMock = {
  loadBindings: vi.fn(),
  saveBindings: vi.fn()
};

vi.mock('../src/input/bindings', () => bindingsMock);

const sensitivityMock = {
  loadSensitivity: vi.fn(),
  saveSensitivity: vi.fn()
};

vi.mock('../src/input/sensitivity', () => sensitivityMock);

vi.mock('../src/input/pointer_lock', () => ({
  createPointerLockController: (options: { onChange?: (locked: boolean) => void }) => {
    options?.onChange?.(false);
    return pointerLockMock;
  }
}));

describe('main entry', () => {
  beforeEach(() => {
    startAppMock.mockReset();
    connectMock.mockReset();
    appInstance.ingestSnapshot.mockReset();
    appInstance.setSnapshotRate.mockReset();
    appInstance.recordInput.mockReset();
    appInstance.setTickRate.mockReset();
    appInstance.setPredictionSim.mockReset();
    appInstance.applyLookDelta.mockReset();
    appInstance.setLookSensitivity.mockReset();
    statusMock.setState.mockReset();
    statusMock.setDetail.mockReset();
    statusMock.setMetrics.mockReset();
    statusMock.dispose.mockReset();
    hudMock.setLockState.mockReset();
    hudMock.setSensitivity.mockReset();
    hudMock.dispose.mockReset();
    settingsMock.isVisible.mockReset();
    settingsMock.setVisible.mockReset();
    settingsMock.toggle.mockReset();
    settingsMock.setSensitivity.mockReset();
    settingsMock.dispose.mockReset();
    settingsOptions = undefined;
    envMock.getLookSensitivity.mockReset();
    envMock.getWasmSimUrl.mockReset();
    envMock.getWasmSimParity.mockReset();
    createInputSamplerMock.mockReset();
    createInputSenderMock.mockReset();
    inputSenderInstance.start.mockReset();
    inputSenderInstance.stop.mockReset();
    inputSenderInstance.sendOnce.mockReset();
    pointerLockMock.supported = false;
    pointerLockMock.request.mockReset();
    pointerLockMock.isLocked.mockReset();
    pointerLockMock.isLocked.mockReturnValue(false);
    pointerLockMock.dispose.mockReset();
    samplerInstance.sample.mockReset();
    samplerInstance.setBindings.mockReset();
    samplerInstance.dispose.mockReset();
    createInputSamplerMock.mockReturnValue(samplerInstance);
    createInputSenderMock.mockReturnValue(inputSenderInstance);
    startAppMock.mockReturnValue({
      app: appInstance,
      stop: vi.fn(),
      canvas: document.createElement('canvas')
    });
    envMock.getLookSensitivity.mockReturnValue(undefined);
    envMock.getWasmSimUrl.mockReturnValue(undefined);
    envMock.getWasmSimParity.mockReturnValue(false);
    bindingsMock.loadBindings.mockReset();
    bindingsMock.saveBindings.mockReset();
    bindingsMock.loadBindings.mockReturnValue(defaultBindings);
    sensitivityMock.loadSensitivity.mockReset();
    sensitivityMock.saveSensitivity.mockReset();
    sensitivityMock.loadSensitivity.mockReturnValue(undefined);
    wasmLoaderMock.mockReset();
    wasmAdapterMock.mockReset();
    wasmParityMock.mockReset();
    vi.resetModules();
  });

  it('starts the app with global document/window', async () => {
    envMock.getSignalingUrl.mockReturnValue(undefined);
    envMock.getSignalingAuthToken.mockReturnValue(undefined);
    await import('../src/main');

    expect(startAppMock).toHaveBeenCalledTimes(1);
    const args = startAppMock.mock.calls[0][0];
    expect(args.three.Scene).toBeTypeOf('function');
    expect(args.document).toBe(document);
    expect(args.window).toBe(window);
    expect(bindingsMock.loadBindings).toHaveBeenCalledWith(window.localStorage);
    expect(sensitivityMock.loadSensitivity).toHaveBeenCalledWith(window.localStorage);
    expect(settingsOptions?.initialBindings).toEqual(defaultBindings);
    expect(connectMock).not.toHaveBeenCalled();
    expect(statusMock.setState).toHaveBeenCalledWith('disabled', 'Set VITE_SIGNALING_URL');
    expect(hudMock.setSensitivity).toHaveBeenCalledWith(undefined);
    expect(hudMock.setLockState).toHaveBeenCalled();
    expect(createInputSamplerMock).not.toHaveBeenCalled();
  });

  it('passes look sensitivity into bootstrap', async () => {
    envMock.getSignalingUrl.mockReturnValue(undefined);
    envMock.getSignalingAuthToken.mockReturnValue(undefined);
    envMock.getLookSensitivity.mockReturnValue(0.004);

    await import('../src/main');

    const args = startAppMock.mock.calls[0][0];
    expect(args.lookSensitivity).toBe(0.004);
  });

  it('prefers stored sensitivity over env', async () => {
    envMock.getSignalingUrl.mockReturnValue(undefined);
    envMock.getSignalingAuthToken.mockReturnValue(undefined);
    envMock.getLookSensitivity.mockReturnValue(0.004);
    sensitivityMock.loadSensitivity.mockReturnValue(0.006);

    await import('../src/main');

    const args = startAppMock.mock.calls[0][0];
    expect(args.lookSensitivity).toBe(0.006);
  });

  it('sets locked HUD state when pointer lock is supported', async () => {
    pointerLockMock.supported = true;
    pointerLockMock.isLocked.mockReturnValue(true);
    envMock.getSignalingUrl.mockReturnValue(undefined);
    envMock.getSignalingAuthToken.mockReturnValue(undefined);

    await import('../src/main');

    expect(hudMock.setLockState).toHaveBeenCalledWith('locked');
  });

  it('requires auth token before connecting', async () => {
    envMock.getSignalingUrl.mockReturnValue('https://example.test');
    envMock.getSignalingAuthToken.mockReturnValue(undefined);

    await import('../src/main');

    expect(statusMock.setState).toHaveBeenCalledWith('disabled', 'Set VITE_SIGNALING_AUTH_TOKEN');
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('logs errors when network bootstrap fails', async () => {
    envMock.getSignalingUrl.mockReturnValue('https://example.test');
    envMock.getSignalingAuthToken.mockReturnValue('token');
    connectMock.mockRejectedValue(new Error('boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../src/main');

    expect(errorSpy).toHaveBeenCalled();
    expect(statusMock.setState).toHaveBeenCalledWith('error', 'boom');
    errorSpy.mockRestore();
  });

  it('skips setup when connect resolves null', async () => {
    envMock.getSignalingUrl.mockReturnValue('https://example.test');
    envMock.getSignalingAuthToken.mockReturnValue('token');
    connectMock.mockResolvedValue(null);

    await import('../src/main');

    expect(statusMock.setState).toHaveBeenCalledWith('connecting', 'https://example.test');
    expect(createInputSamplerMock).not.toHaveBeenCalled();
  });

  it('skips ping send when channel not open', async () => {
    const sendPing = vi.fn();
    connectMock.mockResolvedValue({
      connectionId: 'conn',
      serverHello: { serverTickRate: 60, snapshotRate: 20 },
      unreliableChannel: { label: 'afps_unreliable', readyState: 'connecting', send: sendPing }
    });
    envMock.getSignalingUrl.mockReturnValue('https://example.test');
    envMock.getSignalingAuthToken.mockReturnValue('token');

    await import('../src/main');

    expect(sendPing).not.toHaveBeenCalled();
  });

  it('handles non-error rejections', async () => {
    envMock.getSignalingUrl.mockReturnValue('https://example.test');
    envMock.getSignalingAuthToken.mockReturnValue('token');
    connectMock.mockRejectedValue('bad');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../src/main');

    expect(statusMock.setState).toHaveBeenCalledWith('error', 'bad');
    errorSpy.mockRestore();
  });

  it('sets connecting and connected states when signaling url present', async () => {
    const snapshot = { type: 'StateSnapshot', serverTick: 1, lastProcessedInputSeq: 1, posX: 1, posY: 2 };
    const sendPing = vi.fn();
    connectMock.mockImplementation(async (config: { onSnapshot?: (snapshot: typeof snapshot) => void; onPong?: (pong: { clientTimeMs: number }) => void }) => {
      config.onSnapshot?.(snapshot);
      config.onPong?.({ clientTimeMs: 5 });
      return {
        connectionId: 'conn',
        serverHello: { serverTickRate: 60, snapshotRate: 20 },
        unreliableChannel: { label: 'afps_unreliable', readyState: 'open', send: sendPing }
      };
    });
    envMock.getSignalingUrl.mockReturnValue('https://example.test');
    envMock.getSignalingAuthToken.mockReturnValue('token');

    await import('../src/main');

    expect(statusMock.setState).toHaveBeenCalledWith('connecting', 'https://example.test');
    expect(connectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signalingUrl: 'https://example.test',
        signalingAuthToken: 'token',
        onSnapshot: expect.any(Function)
      })
    );
    expect(statusMock.setState).toHaveBeenCalledWith('connected', 'conn conn');
    expect(appInstance.setSnapshotRate).toHaveBeenCalledWith(20);
    expect(appInstance.setTickRate).toHaveBeenCalledWith(60);
    expect(appInstance.ingestSnapshot).toHaveBeenCalledWith(snapshot, expect.any(Number));
    expect(sendPing).toHaveBeenCalled();
    expect(createInputSamplerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        target: window,
        bindings: expect.any(Object)
      })
    );
    const senderArgs = createInputSenderMock.mock.calls[0]?.[0] as { onSend?: (cmd: unknown) => void };
    expect(senderArgs?.onSend).toEqual(expect.any(Function));
    const cmd = { type: 'InputCmd', inputSeq: 1, moveX: 0, moveY: 0, lookDeltaX: 0, lookDeltaY: 0, jump: false, fire: false, sprint: false };
    senderArgs.onSend?.(cmd);
    expect(appInstance.recordInput).toHaveBeenCalledWith(cmd);
    expect(appInstance.applyLookDelta).toHaveBeenCalledWith(0, 0);
    expect(inputSenderInstance.start).toHaveBeenCalled();

    window.dispatchEvent(new Event('beforeunload'));
    expect(inputSenderInstance.stop).toHaveBeenCalled();
    expect(samplerInstance.dispose).toHaveBeenCalled();
  });

  it('updates sensitivity from settings overlay', async () => {
    envMock.getSignalingUrl.mockReturnValue(undefined);
    envMock.getSignalingAuthToken.mockReturnValue(undefined);

    await import('../src/main');

    expect(settingsOptions?.onSensitivityChange).toBeTypeOf('function');
    settingsOptions?.onSensitivityChange?.(0.005);
    expect(appInstance.setLookSensitivity).toHaveBeenCalledWith(0.005);
    expect(hudMock.setSensitivity).toHaveBeenCalledWith(0.005);
    expect(sensitivityMock.saveSensitivity).toHaveBeenCalledWith(0.005, window.localStorage);
  });

  it('persists bindings updates and refreshes sampler', async () => {
    connectMock.mockResolvedValue({
      connectionId: 'conn',
      serverHello: { serverTickRate: 60, snapshotRate: 20 },
      unreliableChannel: { label: 'afps_unreliable', readyState: 'open', send: vi.fn() }
    });
    envMock.getSignalingUrl.mockReturnValue('https://example.test');
    envMock.getSignalingAuthToken.mockReturnValue('token');

    await import('../src/main');

    const updated = {
      forward: ['KeyI'],
      backward: ['KeyK'],
      left: ['KeyJ'],
      right: ['KeyL'],
      jump: ['KeyU'],
      sprint: ['KeyO']
    };
    settingsOptions?.onBindingsChange?.(updated);

    expect(bindingsMock.saveBindings).toHaveBeenCalledWith(updated, window.localStorage);
    expect(samplerInstance.setBindings).toHaveBeenCalledWith(updated);
  });

  it('toggles settings on O key', async () => {
    envMock.getSignalingUrl.mockReturnValue(undefined);
    envMock.getSignalingAuthToken.mockReturnValue(undefined);

    await import('../src/main');

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyO' }));
    expect(settingsMock.toggle).toHaveBeenCalled();
  });

  it('loads wasm sim when url is configured', async () => {
    envMock.getSignalingUrl.mockReturnValue(undefined);
    envMock.getSignalingAuthToken.mockReturnValue(undefined);
    envMock.getWasmSimUrl.mockReturnValue('/wasm/afps_sim.js');

    const sim = { dispose: vi.fn() };
    const predictionSim = { step: vi.fn(), getState: vi.fn(), setState: vi.fn(), reset: vi.fn(), setConfig: vi.fn() };
    wasmLoaderMock.mockResolvedValue(sim);
    wasmAdapterMock.mockReturnValue(predictionSim);
    wasmParityMock.mockReturnValue({ ok: true, deltaX: 0, deltaY: 0, js: { x: 0, y: 0 }, wasm: { x: 0, y: 0 } });

    await import('../src/main');
    await Promise.resolve();

    expect(wasmLoaderMock).toHaveBeenCalledWith('/wasm/afps_sim.js');
    expect(wasmAdapterMock).toHaveBeenCalledWith(sim);
    expect(appInstance.setPredictionSim).toHaveBeenCalledWith(predictionSim);
    expect(statusMock.setDetail).toHaveBeenCalledWith('WASM sim loaded');

    window.dispatchEvent(new Event('beforeunload'));
    expect(sim.dispose).toHaveBeenCalled();
  });

  it('warns when wasm sim fails to load', async () => {
    envMock.getSignalingUrl.mockReturnValue(undefined);
    envMock.getSignalingAuthToken.mockReturnValue(undefined);
    envMock.getWasmSimUrl.mockReturnValue('/wasm/afps_sim.js');

    wasmLoaderMock.mockRejectedValue(new Error('missing'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await import('../src/main');
    await Promise.resolve();

    expect(statusMock.setDetail).toHaveBeenCalledWith(expect.stringContaining('warn: wasm sim failed'));
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('runs wasm parity check when enabled', async () => {
    envMock.getSignalingUrl.mockReturnValue(undefined);
    envMock.getSignalingAuthToken.mockReturnValue(undefined);
    envMock.getWasmSimUrl.mockReturnValue('/wasm/afps_sim.js');
    envMock.getWasmSimParity.mockReturnValue(true);

    const sim = { dispose: vi.fn() };
    const predictionSim = { step: vi.fn(), getState: vi.fn(), setState: vi.fn(), reset: vi.fn(), setConfig: vi.fn() };
    wasmLoaderMock.mockResolvedValue(sim);
    wasmAdapterMock.mockReturnValue(predictionSim);
    wasmParityMock.mockReturnValue({ ok: true, deltaX: 0, deltaY: 0, js: { x: 0, y: 0 }, wasm: { x: 0, y: 0 } });

    await import('../src/main');
    await Promise.resolve();

    expect(wasmParityMock).toHaveBeenCalledWith(sim);
  });

  it('warns when wasm parity check fails', async () => {
    envMock.getSignalingUrl.mockReturnValue(undefined);
    envMock.getSignalingAuthToken.mockReturnValue(undefined);
    envMock.getWasmSimUrl.mockReturnValue('/wasm/afps_sim.js');
    envMock.getWasmSimParity.mockReturnValue(true);

    const sim = { dispose: vi.fn() };
    const predictionSim = { step: vi.fn(), getState: vi.fn(), setState: vi.fn(), reset: vi.fn(), setConfig: vi.fn() };
    wasmLoaderMock.mockResolvedValue(sim);
    wasmAdapterMock.mockReturnValue(predictionSim);
    wasmParityMock.mockReturnValue({ ok: false, deltaX: 0.1, deltaY: 0.2, js: { x: 0, y: 0 }, wasm: { x: 1, y: 1 } });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await import('../src/main');
    await Promise.resolve();

    expect(statusMock.setDetail).toHaveBeenCalledWith(expect.stringContaining('parity mismatch'));
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
