export type HudLockState = 'locked' | 'unlocked' | 'unsupported';

export interface HudOverlay {
  element: HTMLDivElement;
  setLockState: (state: HudLockState) => void;
  setSensitivity: (value?: number) => void;
  setWeapon: (slot?: number, name?: string) => void;
  setWeaponCooldown: (value?: number) => void;
  triggerHitmarker: (killed?: boolean) => void;
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
  const win = doc.defaultView ?? window;

  const crosshair = doc.createElement('div');
  crosshair.className = 'hud-crosshair';
  const crosshairHorizontal = doc.createElement('div');
  crosshairHorizontal.className = 'hud-crosshair-line hud-crosshair-horizontal';
  const crosshairVertical = doc.createElement('div');
  crosshairVertical.className = 'hud-crosshair-line hud-crosshair-vertical';
  crosshair.append(crosshairHorizontal, crosshairVertical);

  const hitmarker = doc.createElement('div');
  hitmarker.className = 'hud-hitmarker';

  const info = doc.createElement('div');
  info.className = 'hud-info';

  const lock = doc.createElement('div');
  lock.className = 'hud-lock';

  const sensitivity = doc.createElement('div');
  sensitivity.className = 'hud-sensitivity';

  const weapon = doc.createElement('div');
  weapon.className = 'hud-weapon';
  const weaponCooldown = doc.createElement('div');
  weaponCooldown.className = 'hud-weapon-cooldown';

  info.append(lock, sensitivity, weapon, weaponCooldown);
  overlay.append(crosshair, hitmarker, info);
  host.appendChild(overlay);

  const setLockState = (state: HudLockState) => {
    overlay.dataset.lock = state;
    lock.textContent = lockLabel(state);
  };

  const setSensitivity = (value?: number) => {
    sensitivity.textContent = `Sens ${formatSensitivity(value)}`;
  };

  const setWeapon = (slot?: number, name?: string) => {
    const safeSlot = Number.isFinite(slot) && (slot ?? 0) >= 0 ? Math.floor(slot ?? 0) : 0;
    const label = name && name.length > 0 ? name : '--';
    weapon.textContent = `Weapon ${safeSlot + 1}: ${label}`;
  };

  const setWeaponCooldown = (value?: number) => {
    if (!Number.isFinite(value) || value === undefined) {
      weaponCooldown.textContent = 'Cooldown: --';
      return;
    }
    if (value <= 0) {
      weaponCooldown.textContent = 'Cooldown: Ready';
      return;
    }
    weaponCooldown.textContent = `Cooldown: ${value.toFixed(2)}s`;
  };

  let hitmarkerTimeout = 0;
  const triggerHitmarker = (killed?: boolean) => {
    if (hitmarkerTimeout) {
      win.clearTimeout(hitmarkerTimeout);
    }
    hitmarker.classList.add('is-active');
    hitmarker.classList.toggle('is-kill', Boolean(killed));
    hitmarkerTimeout = win.setTimeout(() => {
      hitmarker.classList.remove('is-active', 'is-kill');
      hitmarkerTimeout = 0;
    }, 120);
  };

  const dispose = () => {
    if (hitmarkerTimeout) {
      win.clearTimeout(hitmarkerTimeout);
    }
    overlay.remove();
  };

  setLockState('unlocked');
  setSensitivity();
  setWeapon();
  setWeaponCooldown();

  return { element: overlay, setLockState, setSensitivity, setWeapon, setWeaponCooldown, triggerHitmarker, dispose };
};
