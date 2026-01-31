export type HudLockState = 'locked' | 'unlocked' | 'unsupported';

export interface HudOverlay {
  element: HTMLDivElement;
  setLockState: (state: HudLockState) => void;
  setSensitivity: (value?: number) => void;
  dispose: () => void;
}

const lockLabel = (state: HudLockState) => {
  switch (state) {
    case 'locked':
      return 'Pointer Locked';
    case 'unsupported':
      return 'Pointer Lock Unsupported';
    case 'unlocked':
    default:
      return 'Click to lock pointer';
  }
};

const formatSensitivity = (value?: number) => {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    return '--';
  }
  return value.toFixed(3);
};

export const createHudOverlay = (doc: Document, containerId = 'app'): HudOverlay => {
  const host = doc.getElementById(containerId) ?? doc.body;
  const overlay = doc.createElement('div');
  overlay.className = 'hud-overlay';

  const crosshair = doc.createElement('div');
  crosshair.className = 'hud-crosshair';
  const crosshairHorizontal = doc.createElement('div');
  crosshairHorizontal.className = 'hud-crosshair-line hud-crosshair-horizontal';
  const crosshairVertical = doc.createElement('div');
  crosshairVertical.className = 'hud-crosshair-line hud-crosshair-vertical';
  crosshair.append(crosshairHorizontal, crosshairVertical);

  const info = doc.createElement('div');
  info.className = 'hud-info';

  const lock = doc.createElement('div');
  lock.className = 'hud-lock';

  const sensitivity = doc.createElement('div');
  sensitivity.className = 'hud-sensitivity';

  info.append(lock, sensitivity);
  overlay.append(crosshair, info);
  host.appendChild(overlay);

  const setLockState = (state: HudLockState) => {
    overlay.dataset.lock = state;
    lock.textContent = lockLabel(state);
  };

  const setSensitivity = (value?: number) => {
    sensitivity.textContent = `Sens ${formatSensitivity(value)}`;
  };

  const dispose = () => {
    overlay.remove();
  };

  setLockState('unlocked');
  setSensitivity();

  return { element: overlay, setLockState, setSensitivity, dispose };
};
