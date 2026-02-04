import { beforeEach, describe, expect, it, vi } from 'vitest';

const startAppMock = vi.fn();
const connectMock = vi.fn();
const createInputSamplerMock = vi.fn();
const createInputSenderMock = vi.fn();
const sceneMock = {
  add: vi.fn(),
  remove: vi.fn(),
  position: { x: 0, y: 0, z: 0, set: vi.fn() },
  rotation: { x: 0, y: 0, z: 0 }
};
const appInstance = {
  ingestSnapshot: vi.fn(),
  setSnapshotRate: vi.fn(),
  setBeforeRender: vi.fn(),
  recordInput: vi.fn(),
  recordWeaponFired: vi.fn(),
  spawnProjectileVfx: vi.fn(),
  removeProjectileVfx: vi.fn(),
  spawnTracerVfx: vi.fn(),
  getWeaponCooldown: vi.fn().mockReturnValue(0),
  getAbilityCooldowns: vi.fn().mockReturnValue({
    dash: 0,
    shockwave: 0,
    shieldCooldown: 0,
    shieldTimer: 0,
    shieldActive: false
  }),
  setWeaponViewmodel: vi.fn(),
  setTickRate: vi.fn(),
  setPredictionSim: vi.fn(),
  applyLookDelta: vi.fn(),
  getLookAngles: vi.fn().mockReturnValue({ yaw: 0, pitch: 0 }),
  setLookSensitivity: vi.fn(),
  setLocalProxyVisible: vi.fn(),
  setOutlineTeam: vi.fn(),
  triggerOutlineFlash: vi.fn(),
  state: {
    cube: { rotation: { x: 0 } },
    scene: sceneMock,
    camera: { position: { x: 0, y: 0, z: 0 } }
  }
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
  setMetricsVisible: vi.fn(),
  dispose: vi.fn()
};
const hudMock = {
  element: document.createElement('div'),
  setLockState: vi.fn(),
  setSensitivity: vi.fn(),
  setVitals: vi.fn(),
  setScore: vi.fn(),
  setWeapon: vi.fn(),
  setWeaponCooldown: vi.fn(),
  setAbilityCooldowns: vi.fn(),
  triggerHitmarker: vi.fn(),
  dispose: vi.fn()
};
const settingsMock = {
  element: document.createElement('div'),
  isVisible: vi.fn(),
  setVisible: vi.fn(),
  toggle: vi.fn(),
  setSensitivity: vi.fn(),
  setLookInversion: vi.fn(),
  setMetricsVisible: vi.fn(),
  setAudioSettings: vi.fn(),
  dispose: vi.fn()
};
const defaultBindings = {
  forward: ['KeyW'],
  backward: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  jump: ['Space'],
  sprint: ['ShiftLeft'],
  dash: ['KeyE'],
  grapple: ['KeyQ'],
  shield: ['KeyF'],
  shockwave: ['KeyR'],
  weaponSlot1: ['Digit1'],
  weaponSlot2: ['Digit2']
};
const pointerLockMock = {
  supported: false,
  request: vi.fn(),
  isLocked: vi.fn().mockReturnValue(false),
  dispose: vi.fn()
};
const loadCatalogMock = vi.fn();
const prejoinOverlayMock = {
  element: document.createElement('div'),
  waitForSubmit: vi.fn(),
  setVisible: vi.fn(),
  dispose: vi.fn()
};
const profileStorageMock = {
  loadProfile: vi.fn(),
  saveProfile: vi.fn()
};

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

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

vi.mock('../src/characters/catalog', () => ({
  loadCharacterCatalog: (...args: unknown[]) => loadCatalogMock(...args),
  resolveCharacterEntry: (catalog: { entries: Array<{ id: string }> }, id?: string | null) => {
    const match = id ? catalog.entries.find((entry) => entry.id === id) : undefined;
    return match ?? catalog.entries[0];
  }
}));

vi.mock('../src/ui/prejoin', () => ({
  createPrejoinOverlay: () => prejoinOverlayMock
}));

vi.mock('../src/profile/storage', () => ({
  loadProfile: (...args: unknown[]) => profileStorageMock.loadProfile(...args),
  saveProfile: (...args: unknown[]) => profileStorageMock.saveProfile(...args)
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
      initialInvertLookX?: boolean;
      initialInvertLookY?: boolean;
      onInvertLookXChange?: (value: boolean) => void;
      onInvertLookYChange?: (value: boolean) => void;
      onShowMetricsChange?: (visible: boolean) => void;
      initialShowMetrics?: boolean;
      initialAudioSettings?: Record<string, number | boolean>;
      onAudioSettingsChange?: (settings: Record<string, number | boolean>) => void;
    }
  | undefined;
vi.mock('../src/ui/settings', () => ({
  createSettingsOverlay: (_doc: Document, options?: typeof settingsOptions) => {
    settingsOptions = options;
    return settingsMock;
  }
}));

const audioManagerMock = {
  state: {
    supported: true,
    status: 'suspended',
    settings: { master: 0.5, sfx: 0.5, ui: 0.5, music: 0.5, muted: false }
  },
  resume: vi.fn(),
  setMuted: vi.fn(),
  setVolume: vi.fn(),
  getSettings: vi.fn().mockReturnValue({ master: 0.5, sfx: 0.5, ui: 0.5, music: 0.5, muted: false }),
  createBuffer: vi.fn().mockReturnValue({
    getChannelData: () => new Float32Array(1)
  }),
  registerBuffer: vi.fn(),
  hasBuffer: vi.fn().mockReturnValue(true),
  load: vi.fn(),
  preload: vi.fn(),
  play: vi.fn().mockReturnValue(true),
  playPositional: vi.fn().mockReturnValue(true),
  setListenerPosition: vi.fn(),
  dispose: vi.fn()
};

const audioSettingsMock = {
  loadAudioSettings: vi.fn().mockReturnValue({ master: 0.5, sfx: 0.5, ui: 0.5, music: 0.5, muted: false }),
  saveAudioSettings: vi.fn()
};

vi.mock('../src/audio/manager', () => ({
  createAudioManager: () => audioManagerMock
}));

const casingPoolMock = {
  ready: Promise.resolve(true),
  spawn: vi.fn(),
  update: vi.fn(),
  dispose: vi.fn()
};

vi.mock('../src/weapons/sfx', () => ({
  generateWeaponSfx: vi.fn()
}));

vi.mock('../src/weapons/casing_pool', () => ({
  createCasingPool: () => casingPoolMock
}));

vi.mock('../src/audio/settings', () => ({
  loadAudioSettings: (...args: unknown[]) => audioSettingsMock.loadAudioSettings(...args),
  saveAudioSettings: (...args: unknown[]) => audioSettingsMock.saveAudioSettings(...args)
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

const lookInversionMock = {
  loadInvertX: vi.fn(),
  loadInvertY: vi.fn(),
  saveInvertX: vi.fn(),
  saveInvertY: vi.fn()
};

vi.mock('../src/input/look_inversion', () => lookInversionMock);

const metricsSettingsMock = {
  loadMetricsVisibility: vi.fn(),
  saveMetricsVisibility: vi.fn()
};

vi.mock('../src/ui/metrics_settings', () => metricsSettingsMock);

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
    appInstance.recordWeaponFired.mockReset();
    appInstance.setTickRate.mockReset();
    appInstance.setPredictionSim.mockReset();
    appInstance.applyLookDelta.mockReset();
    appInstance.getLookAngles.mockReset();
    appInstance.getLookAngles.mockReturnValue({ yaw: 0, pitch: 0 });
    appInstance.setLookSensitivity.mockReset();
    appInstance.setOutlineTeam.mockReset();
    appInstance.triggerOutlineFlash.mockReset();
    sceneMock.add.mockReset();
    sceneMock.remove.mockReset();
    statusMock.setState.mockReset();
    statusMock.setDetail.mockReset();
    statusMock.setMetrics.mockReset();
    statusMock.setMetricsVisible.mockReset();
    statusMock.dispose.mockReset();
    hudMock.setLockState.mockReset();
    hudMock.setSensitivity.mockReset();
    hudMock.setVitals.mockReset();
    hudMock.setScore.mockReset();
    hudMock.setWeapon.mockReset();
    hudMock.setWeaponCooldown.mockReset();
    hudMock.setAbilityCooldowns.mockReset();
    hudMock.triggerHitmarker.mockReset();
    hudMock.dispose.mockReset();
    appInstance.spawnProjectileVfx.mockReset();
    appInstance.removeProjectileVfx.mockReset();
    appInstance.spawnTracerVfx.mockReset();
    casingPoolMock.spawn.mockReset();
    casingPoolMock.update.mockReset();
    casingPoolMock.dispose.mockReset();
    settingsMock.isVisible.mockReset();
    settingsMock.setVisible.mockReset();
    settingsMock.toggle.mockReset();
    settingsMock.setSensitivity.mockReset();
    settingsMock.setLookInversion.mockReset();
    settingsMock.setMetricsVisible.mockReset();
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
    lookInversionMock.loadInvertX.mockReset();
    lookInversionMock.loadInvertY.mockReset();
    lookInversionMock.saveInvertX.mockReset();
    lookInversionMock.saveInvertY.mockReset();
    lookInversionMock.loadInvertX.mockReturnValue(undefined);
    lookInversionMock.loadInvertY.mockReturnValue(undefined);
    metricsSettingsMock.loadMetricsVisibility.mockReset();
    metricsSettingsMock.saveMetricsVisibility.mockReset();
    metricsSettingsMock.loadMetricsVisibility.mockReturnValue(true);
    loadCatalogMock.mockReset();
    prejoinOverlayMock.waitForSubmit.mockReset();
    prejoinOverlayMock.setVisible.mockReset();
    prejoinOverlayMock.dispose.mockReset();
    profileStorageMock.loadProfile.mockReset();
    profileStorageMock.saveProfile.mockReset();
    wasmLoaderMock.mockReset();
    wasmAdapterMock.mockReset();
    wasmParityMock.mockReset();
    loadCatalogMock.mockResolvedValue({
      defaultId: 'placeholder-a',
      entries: [{ id: 'placeholder-a', displayName: 'Placeholder Alpha' }]
    });
    prejoinOverlayMock.waitForSubmit.mockResolvedValue({
      nickname: 'TestPilot',
      characterId: 'placeholder-a'
    });
    profileStorageMock.loadProfile.mockReturnValue(null);
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
    expect(lookInversionMock.loadInvertX).toHaveBeenCalledWith(window.localStorage);
    expect(lookInversionMock.loadInvertY).toHaveBeenCalledWith(window.localStorage);
    expect(metricsSettingsMock.loadMetricsVisibility).toHaveBeenCalledWith(window.localStorage);
    expect(audioSettingsMock.loadAudioSettings).toHaveBeenCalledWith(window.localStorage);
    expect(settingsOptions?.initialBindings).toEqual(defaultBindings);
    expect(settingsOptions?.initialShowMetrics).toBe(true);
    expect(settingsOptions?.initialInvertLookX).toBe(false);
    expect(settingsOptions?.initialInvertLookY).toBe(false);
    expect(settingsOptions?.initialAudioSettings).toEqual({
      master: 0.5,
      sfx: 0.5,
      ui: 0.5,
      music: 0.5,
      muted: false
    });
    expect(connectMock).not.toHaveBeenCalled();
    expect(statusMock.setState).toHaveBeenCalledWith('disabled', 'Set VITE_SIGNALING_URL');
    expect(statusMock.setMetricsVisible).toHaveBeenCalledWith(true);
    expect(hudMock.setSensitivity).toHaveBeenCalledWith(undefined);
    expect(hudMock.setVitals).toHaveBeenCalledWith({ ammo: 30 });
    expect(hudMock.setWeapon).toHaveBeenCalledWith(0, expect.any(String));
    expect(hudMock.setWeaponCooldown).toHaveBeenCalledWith(0);
    expect(hudMock.setAbilityCooldowns).toHaveBeenCalledWith({
      dash: 0,
      shockwave: 0,
      shieldCooldown: 0,
      shieldTimer: 0,
      shieldActive: false
    });
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

  it('routes logger messages to status detail', async () => {
    envMock.getSignalingUrl.mockReturnValue('https://example.test');
    envMock.getSignalingAuthToken.mockReturnValue('token');
    connectMock.mockImplementation(async (config: { logger?: { info: (message: string) => void; warn: (message: string) => void; error: (message: string) => void } }) => {
      config.logger?.info('hello');
      config.logger?.warn('caution');
      config.logger?.error('boom');
      return null;
    });

    await import('../src/main');
    await flushPromises();

    expect(statusMock.setDetail).toHaveBeenCalledWith('hello');
    expect(statusMock.setDetail).toHaveBeenCalledWith('warn: caution');
    expect(statusMock.setDetail).toHaveBeenCalledWith('error: boom');
  });

  it('logs errors when network bootstrap fails', async () => {
    envMock.getSignalingUrl.mockReturnValue('https://example.test');
    envMock.getSignalingAuthToken.mockReturnValue('token');
    connectMock.mockRejectedValue(new Error('boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../src/main');
    await flushPromises();

    expect(errorSpy).toHaveBeenCalled();
    expect(statusMock.setState).toHaveBeenCalledWith('error', 'boom');
    errorSpy.mockRestore();
  });

  it('skips setup when connect resolves null', async () => {
    envMock.getSignalingUrl.mockReturnValue('https://example.test');
    envMock.getSignalingAuthToken.mockReturnValue('token');
    connectMock.mockResolvedValue(null);

    await import('../src/main');
    await flushPromises();

    expect(statusMock.setState).toHaveBeenCalledWith('connecting', 'https://example.test');
    expect(createInputSamplerMock).not.toHaveBeenCalled();
  });

  it('skips ping send when channel not open', async () => {
    const sendPing = vi.fn();
    connectMock.mockResolvedValue({
      connectionId: '',
      serverHello: { serverTickRate: 60, snapshotRate: 20 },
      unreliableChannel: { label: 'afps_unreliable', readyState: 'connecting', send: sendPing },
      nextClientMessageSeq: () => 1,
      getServerSeqAck: () => 0
    });
    envMock.getSignalingUrl.mockReturnValue('https://example.test');
    envMock.getSignalingAuthToken.mockReturnValue('token');

    await import('../src/main');
    await flushPromises();

    expect(sendPing).not.toHaveBeenCalled();
    expect(appInstance.setOutlineTeam).toHaveBeenCalledWith(0);
  });

  it('handles non-error rejections', async () => {
    envMock.getSignalingUrl.mockReturnValue('https://example.test');
    envMock.getSignalingAuthToken.mockReturnValue('token');
    connectMock.mockRejectedValue('bad');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../src/main');
    await flushPromises();

    expect(statusMock.setState).toHaveBeenCalledWith('error', 'bad');
    errorSpy.mockRestore();
  });

  it('sets connecting and connected states when signaling url present', async () => {
    const snapshot = {
      type: 'StateSnapshot',
      serverTick: 1,
      lastProcessedInputSeq: 1,
      posX: 1,
      posY: 2,
      posZ: 0,
      velX: 0,
      velY: 0,
      velZ: 0,
      weaponSlot: 0,
      ammoInMag: 12,
      dashCooldown: 0,
      health: 100,
      kills: 0,
      deaths: 0
    };
    const sendPing = vi.fn();
    connectMock.mockImplementation(async (config: { onSnapshot?: (snapshot: typeof snapshot) => void; onPong?: (pong: { clientTimeMs: number }) => void; onGameEvent?: (event: { type: string; event: string }) => void }) => {
      config.onSnapshot?.(snapshot);
      config.onPong?.({ clientTimeMs: 5 });
      config.onGameEvent?.({ type: 'GameEvent', event: 'HitConfirmed', killed: true });
      config.onGameEvent?.({
        type: 'GameEvent',
        event: 'ProjectileSpawn',
        ownerId: 'other',
        posX: 1,
        posY: 2,
        posZ: 3,
        velX: 4,
        velY: 5,
        velZ: 6,
        ttl: 0.5,
        projectileId: 7
      });
      config.onGameEvent?.({
        type: 'GameEvent',
        event: 'ProjectileSpawn',
        ownerId: 'conn',
        posX: 9,
        posY: 9,
        posZ: 9,
        velX: 1,
        velY: 1,
        velZ: 1,
        ttl: 1,
        projectileId: 8
      });
      config.onGameEvent?.({
        type: 'GameEvent',
        event: 'ProjectileRemove',
        projectileId: 7
      });
      return {
        connectionId: 'conn',
        serverHello: { serverTickRate: 60, snapshotRate: 20, snapshotKeyframeInterval: 5 },
        unreliableChannel: { label: 'afps_unreliable', readyState: 'open', send: sendPing },
        nextClientMessageSeq: () => 1,
        getServerSeqAck: () => 0
      };
    });
    envMock.getSignalingUrl.mockReturnValue('https://example.test');
    envMock.getSignalingAuthToken.mockReturnValue('token');

    await import('../src/main');
    await flushPromises();

    expect(statusMock.setState).toHaveBeenCalledWith('connecting', 'https://example.test');
    expect(connectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signalingUrl: 'https://example.test',
        signalingAuthToken: 'token',
        onSnapshot: expect.any(Function),
        onGameEvent: expect.any(Function)
      })
    );
    expect(statusMock.setState).toHaveBeenCalledWith('connected', 'conn conn (kf 5)');
    expect(appInstance.setSnapshotRate).toHaveBeenCalledWith(20);
    expect(appInstance.setTickRate).toHaveBeenCalledWith(60);
    expect(appInstance.ingestSnapshot).toHaveBeenCalledWith(snapshot, expect.any(Number));
    expect(hudMock.setVitals).toHaveBeenCalledWith({ health: 100, ammo: 12 });
    expect(hudMock.setScore).toHaveBeenCalledWith({ kills: 0, deaths: 0 });
    expect(hudMock.triggerHitmarker).toHaveBeenCalledWith(true);
    expect(appInstance.triggerOutlineFlash).toHaveBeenCalledWith({ killed: true });
    expect(appInstance.spawnProjectileVfx).toHaveBeenCalledWith({
      origin: { x: 1, y: 3, z: 2 },
      velocity: { x: 4, y: 6, z: 5 },
      ttl: 0.5,
      projectileId: 7
    });
    expect(appInstance.spawnProjectileVfx).toHaveBeenCalledTimes(2);
    expect(appInstance.removeProjectileVfx).toHaveBeenCalledWith(7);
    const onGameEvent = connectMock.mock.calls[0]?.[0]?.onGameEvent as
      | ((event: { type: string; event: string; ownerId: string; posX: number; posY: number; posZ: number; velX: number; velY: number; velZ: number; ttl: number }) => void)
      | undefined;
    onGameEvent?.({
      type: 'GameEvent',
      event: 'ProjectileSpawn',
      ownerId: 'conn',
      posX: 0,
      posY: 0,
      posZ: 0,
      velX: 0,
      velY: 0,
      velZ: 0,
      ttl: 1
    });
    expect(appInstance.spawnProjectileVfx).toHaveBeenCalledTimes(3);
    expect(sendPing).toHaveBeenCalled();
    expect(createInputSamplerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        target: window,
        bindings: expect.any(Object)
      })
    );
    const senderArgs = createInputSenderMock.mock.calls[0]?.[0] as { onSend?: (cmd: unknown) => void };
    expect(senderArgs?.onSend).toEqual(expect.any(Function));
    const cmd = {
      type: 'InputCmd',
      inputSeq: 1,
      moveX: 1,
      moveY: 1,
      lookDeltaX: 0,
      lookDeltaY: 0,
      viewYaw: 0,
      viewPitch: 0,
      weaponSlot: Number.NaN,
      jump: false,
      fire: false,
      sprint: false,
      dash: false,
      grapple: false,
      shield: false,
      shockwave: false
    };
    senderArgs.onSend?.(cmd);
    expect(appInstance.recordInput).toHaveBeenCalledWith(cmd);
    expect(appInstance.applyLookDelta).toHaveBeenCalledWith(0, 0);
    const nextCmd = { ...cmd, weaponSlot: 1 };
    senderArgs.onSend?.(nextCmd);
    expect(hudMock.setWeapon).toHaveBeenCalledWith(1, expect.any(String));
    expect(inputSenderInstance.start).toHaveBeenCalled();
    expect(statusMock.setMetrics).toHaveBeenCalledWith(expect.stringContaining('kf 5'));

    window.dispatchEvent(new Event('beforeunload'));
    expect(inputSenderInstance.stop).toHaveBeenCalled();
    expect(samplerInstance.dispose).toHaveBeenCalled();
  });

  it('shows keyframe interval in metrics before snapshots arrive', async () => {
    connectMock.mockResolvedValue({
      connectionId: 'conn',
      serverHello: { serverTickRate: 60, snapshotRate: 20, snapshotKeyframeInterval: 7 },
      unreliableChannel: { label: 'afps_unreliable', readyState: 'open', send: vi.fn() },
      nextClientMessageSeq: () => 1,
      getServerSeqAck: () => 0
    });
    envMock.getSignalingUrl.mockReturnValue('https://example.test');
    envMock.getSignalingAuthToken.mockReturnValue('token');

    await import('../src/main');
    await flushPromises();

    expect(statusMock.setMetrics).toHaveBeenCalledWith(expect.stringContaining('kf 7'));
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

  it('updates look inversion from settings overlay', async () => {
    envMock.getSignalingUrl.mockReturnValue(undefined);
    envMock.getSignalingAuthToken.mockReturnValue(undefined);

    await import('../src/main');

    expect(settingsOptions?.onInvertLookXChange).toBeTypeOf('function');
    settingsOptions?.onInvertLookXChange?.(true);
    expect(lookInversionMock.saveInvertX).toHaveBeenCalledWith(true, window.localStorage);

    expect(settingsOptions?.onInvertLookYChange).toBeTypeOf('function');
    settingsOptions?.onInvertLookYChange?.(true);
    expect(lookInversionMock.saveInvertY).toHaveBeenCalledWith(true, window.localStorage);
  });

  it('updates metrics visibility from settings overlay', async () => {
    envMock.getSignalingUrl.mockReturnValue(undefined);
    envMock.getSignalingAuthToken.mockReturnValue(undefined);

    await import('../src/main');

    expect(settingsOptions?.onShowMetricsChange).toBeTypeOf('function');
    settingsOptions?.onShowMetricsChange?.(false);
    expect(statusMock.setMetricsVisible).toHaveBeenCalledWith(false);
    expect(metricsSettingsMock.saveMetricsVisibility).toHaveBeenCalledWith(false, window.localStorage);
  });

  it('updates audio settings from settings overlay', async () => {
    envMock.getSignalingUrl.mockReturnValue(undefined);
    envMock.getSignalingAuthToken.mockReturnValue(undefined);

    await import('../src/main');

    expect(settingsOptions?.onAudioSettingsChange).toBeTypeOf('function');
    settingsOptions?.onAudioSettingsChange?.({
      master: 0.4,
      sfx: 0.3,
      ui: 0.2,
      music: 0.1,
      muted: true
    });
    expect(audioManagerMock.setMuted).toHaveBeenCalledWith(true);
    expect(audioManagerMock.setVolume).toHaveBeenCalledWith('master', 0.4);
    expect(audioManagerMock.setVolume).toHaveBeenCalledWith('sfx', 0.3);
    expect(audioManagerMock.setVolume).toHaveBeenCalledWith('ui', 0.2);
    expect(audioManagerMock.setVolume).toHaveBeenCalledWith('music', 0.1);
    expect(audioSettingsMock.saveAudioSettings).toHaveBeenCalled();
  });

  it('persists bindings updates and refreshes sampler', async () => {
    connectMock.mockResolvedValue({
      connectionId: 'conn',
      serverHello: { serverTickRate: 60, snapshotRate: 20 },
      unreliableChannel: { label: 'afps_unreliable', readyState: 'open', send: vi.fn() },
      nextClientMessageSeq: () => 1,
      getServerSeqAck: () => 0
    });
    envMock.getSignalingUrl.mockReturnValue('https://example.test');
    envMock.getSignalingAuthToken.mockReturnValue('token');

    await import('../src/main');
    await flushPromises();

    const updated = {
      forward: ['KeyI'],
      backward: ['KeyK'],
      left: ['KeyJ'],
      right: ['KeyL'],
      jump: ['KeyU'],
      sprint: ['KeyO'],
      dash: ['KeyP'],
      grapple: ['KeyG'],
      shield: ['KeyH'],
      shockwave: ['KeyR']
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
    const predictionSim = {
      step: vi.fn(),
      getState: vi.fn(() => ({
        x: 0,
        y: 0,
        z: 0,
        velX: 0,
        velY: 0,
        velZ: 0,
        dashCooldown: 0,
        shieldTimer: 0,
        shieldCooldown: 0,
        shieldActive: false,
        shockwaveCooldown: 0
      })),
      setState: vi.fn(),
      reset: vi.fn(),
      setConfig: vi.fn()
    };
    wasmLoaderMock.mockResolvedValue(sim);
    wasmAdapterMock.mockReturnValue(predictionSim);
    wasmParityMock.mockReturnValue({
      ok: true,
      deltaX: 0,
      deltaY: 0,
      deltaZ: 0,
      deltaVx: 0,
      deltaVy: 0,
      deltaVz: 0,
      deltaDashCooldown: 0,
      js: { x: 0, y: 0, z: 0, velX: 0, velY: 0, velZ: 0, dashCooldown: 0 },
      wasm: { x: 0, y: 0, z: 0, velX: 0, velY: 0, velZ: 0, dashCooldown: 0 }
    });

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
    const predictionSim = {
      step: vi.fn(),
      getState: vi.fn(() => ({
        x: 0,
        y: 0,
        z: 0,
        velX: 0,
        velY: 0,
        velZ: 0,
        dashCooldown: 0,
        shieldTimer: 0,
        shieldCooldown: 0,
        shieldActive: false,
        shockwaveCooldown: 0
      })),
      setState: vi.fn(),
      reset: vi.fn(),
      setConfig: vi.fn()
    };
    wasmLoaderMock.mockResolvedValue(sim);
    wasmAdapterMock.mockReturnValue(predictionSim);
    wasmParityMock.mockReturnValue({
      ok: true,
      deltaX: 0,
      deltaY: 0,
      deltaZ: 0,
      deltaVx: 0,
      deltaVy: 0,
      deltaVz: 0,
      deltaDashCooldown: 0,
      js: { x: 0, y: 0, z: 0, velX: 0, velY: 0, velZ: 0, dashCooldown: 0 },
      wasm: { x: 0, y: 0, z: 0, velX: 0, velY: 0, velZ: 0, dashCooldown: 0 }
    });

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
    const predictionSim = {
      step: vi.fn(),
      getState: vi.fn(() => ({
        x: 0,
        y: 0,
        z: 0,
        velX: 0,
        velY: 0,
        velZ: 0,
        dashCooldown: 0,
        shieldTimer: 0,
        shieldCooldown: 0,
        shieldActive: false,
        shockwaveCooldown: 0
      })),
      setState: vi.fn(),
      reset: vi.fn(),
      setConfig: vi.fn()
    };
    wasmLoaderMock.mockResolvedValue(sim);
    wasmAdapterMock.mockReturnValue(predictionSim);
    wasmParityMock.mockReturnValue({
      ok: false,
      deltaX: 0.1,
      deltaY: 0.2,
      deltaZ: 0.3,
      deltaVx: 0.05,
      deltaVy: 0.15,
      deltaVz: 0.25,
      deltaDashCooldown: 0.05,
      js: { x: 0, y: 0, z: 0, velX: 0, velY: 0, velZ: 0, dashCooldown: 0 },
      wasm: { x: 1, y: 1, z: 1, velX: 0.1, velY: 0.2, velZ: 0.3, dashCooldown: 0.1 }
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await import('../src/main');
    await Promise.resolve();

    expect(statusMock.setDetail).toHaveBeenCalledWith(expect.stringContaining('parity mismatch'));
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
