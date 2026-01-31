import './style.css';
import * as THREE from 'three';
import { startApp } from './bootstrap';
import { connectIfConfigured } from './net/runtime';
import {
  getLookSensitivity,
  getSignalingAuthToken,
  getSignalingUrl,
  getWasmSimParity,
  getWasmSimUrl
} from './net/env';
import { buildPing } from './net/protocol';
import type { Pong, StateSnapshot } from './net/protocol';
import { createStatusOverlay } from './ui/status';
import { createInputSampler } from './input/sampler';
import { loadBindings, saveBindings } from './input/bindings';
import { loadSensitivity, saveSensitivity } from './input/sensitivity';
import { createInputSender } from './net/input_sender';
import { createPointerLockController } from './input/pointer_lock';
import { createHudOverlay } from './ui/hud';
import { createSettingsOverlay } from './ui/settings';
import { loadWasmSimFromUrl } from './sim/wasm';
import { createWasmPredictionSim } from './sim/wasm_adapter';
import { runWasmParityCheck } from './sim/parity';

const savedSensitivity = loadSensitivity(window.localStorage);
const lookSensitivity = savedSensitivity ?? getLookSensitivity();
let currentBindings = loadBindings(window.localStorage);
const { app, canvas } = startApp({ three: THREE, document, window, lookSensitivity });
const status = createStatusOverlay(document);
const hud = createHudOverlay(document);
let sampler: ReturnType<typeof createInputSampler> | null = null;
const settings = createSettingsOverlay(document, {
  initialSensitivity: lookSensitivity,
  initialBindings: currentBindings,
  onSensitivityChange: (value) => {
    app.setLookSensitivity(value);
    hud.setSensitivity(value);
    saveSensitivity(value, window.localStorage);
  },
  onBindingsChange: (bindings) => {
    currentBindings = bindings;
    saveBindings(bindings, window.localStorage);
    sampler?.setBindings(bindings);
  }
});
const pointerLock = createPointerLockController({
  document,
  element: canvas,
  onChange: (locked) => {
    hud.setLockState(locked ? 'locked' : 'unlocked');
  }
});
const signalingUrl = getSignalingUrl();
const signalingAuthToken = getSignalingAuthToken();
const logger = {
  info: (message: string) => status.setDetail(message),
  warn: (message: string) => status.setDetail(`warn: ${message}`),
  error: (message: string) => status.setDetail(`error: ${message}`)
};
const shouldApplyLook = () => !pointerLock.supported || pointerLock.isLocked();

const wasmSimUrl = getWasmSimUrl();
const wasmParityEnabled = getWasmSimParity();
if (wasmSimUrl) {
  void loadWasmSimFromUrl(wasmSimUrl)
    .then((sim) => {
      let detail = 'WASM sim loaded';
      if (wasmParityEnabled) {
        const result = runWasmParityCheck(sim);
        if (!result.ok) {
          detail = `warn: wasm parity mismatch (dx=${result.deltaX.toFixed(6)}, dy=${result.deltaY.toFixed(6)})`;
          console.warn('wasm parity mismatch', result);
        }
      }
      app.setPredictionSim(createWasmPredictionSim(sim));
      status.setDetail(detail);
      window.addEventListener(
        'beforeunload',
        () => sim.dispose(),
        {
          once: true
        }
      );
    })
    .catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      status.setDetail(`warn: wasm sim failed (${detail})`);
      console.warn('wasm sim load failed', error);
    });
}

hud.setSensitivity(lookSensitivity);
if (pointerLock.supported) {
  hud.setLockState(pointerLock.isLocked() ? 'locked' : 'unlocked');
} else {
  hud.setLockState('unsupported');
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyO') {
    settings.toggle();
  }
});

if (!signalingUrl) {
  status.setState('disabled', 'Set VITE_SIGNALING_URL');
} else if (!signalingAuthToken) {
  status.setState('disabled', 'Set VITE_SIGNALING_AUTH_TOKEN');
} else {
  status.setState('connecting', signalingUrl);
  let lastSnapshotAt = 0;
  let lastRttMs = 0;
  let lastPredictionError = 0;
  const updateMetrics = () => {
    const now = window.performance.now();
    const snapshotAge = lastSnapshotAt > 0 ? Math.max(0, now - lastSnapshotAt) : null;
    const rttText = lastRttMs > 0 ? `${Math.round(lastRttMs)}ms` : '--';
    const snapshotText = snapshotAge !== null ? `${Math.round(snapshotAge)}ms` : '--';
    const driftText = lastPredictionError > 0 ? lastPredictionError.toFixed(2) : '0.00';
    status.setMetrics?.(`rtt ${rttText} · snap ${snapshotText} · drift ${driftText}`);
  };

  const onSnapshot = (snapshot: StateSnapshot) => {
    const now = window.performance.now();
    lastSnapshotAt = now;
    lastPredictionError = app.ingestSnapshot(snapshot, now);
    updateMetrics();
  };

  const onPong = (pong: Pong) => {
    const now = window.performance.now();
    if (Number.isFinite(pong.clientTimeMs)) {
      lastRttMs = Math.max(0, now - pong.clientTimeMs);
      updateMetrics();
    }
  };

  void connectIfConfigured({
    signalingUrl,
    signalingAuthToken,
    logger,
    onSnapshot,
    onPong
  })
    .then((session) => {
      if (!session) {
        return;
      }
      status.setState('connected', `conn ${session.connectionId}`);
      app.setSnapshotRate(session.serverHello.snapshotRate);
      app.setTickRate(session.serverHello.serverTickRate);

      sampler = createInputSampler({ target: window, bindings: currentBindings });
      const sender = createInputSender({
        channel: session.unreliableChannel,
        sampler,
        tickRate: session.serverHello.serverTickRate,
        logger,
        onSend: (cmd) => {
          app.recordInput(cmd);
          if (shouldApplyLook()) {
            app.applyLookDelta(cmd.lookDeltaX, cmd.lookDeltaY);
          }
        }
      });
      sender.start();

      const sendPing = () => {
        if (session.unreliableChannel.readyState !== 'open') {
          return;
        }
        const now = window.performance.now();
        session.unreliableChannel.send(buildPing(now));
      };
      sendPing();
      const pingInterval = window.setInterval(sendPing, 1000);
      const metricsInterval = window.setInterval(updateMetrics, 250);

      const cleanup = () => {
        sender.stop();
        sampler?.dispose();
        sampler = null;
        window.clearInterval(pingInterval);
        window.clearInterval(metricsInterval);
        window.removeEventListener('beforeunload', cleanup);
      };
      window.addEventListener('beforeunload', cleanup);
    })
    .catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      status.setState('error', detail);
      console.error('network bootstrap failed', error);
    });
}
