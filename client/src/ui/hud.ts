export type HudLockState = 'locked' | 'unlocked' | 'unsupported' | 'reconnecting';

export interface HudOverlay {
  element: HTMLDivElement;
  setLockState: (state: HudLockState) => void;
  setSensitivity: (value?: number) => void;
  setVitals: (vitals?: { health?: number; ammo?: number }) => void;
  setScore: (score?: { kills?: number; deaths?: number }) => void;
  setWeapon: (slot?: number, name?: string) => void;
  setWeaponCooldown: (value?: number) => void;
  setAbilityCooldowns: (cooldowns?: {
    dash?: number;
    shockwave?: number;
    shieldCooldown?: number;
    shieldTimer?: number;
    shieldActive?: boolean;
  }) => void;
  triggerHitmarker: (killed?: boolean) => void;
  dispose: () => void;
}

const lockLabel = (state: HudLockState) => {
  switch (state) {
    case 'locked':
      return 'Pointer Locked';
    case 'reconnecting':
      return 'Reconnecting...';
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

const formatStat = (value?: number, fallback = '--') => {
  if (!Number.isFinite(value) || value === undefined) {
    return fallback;
  }
  return `${Math.max(0, value)}`;
};

const formatAmmo = (value?: number) => {
  if (value === Infinity) {
    return 'INF';
  }
  return formatStat(value);
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

  const healthBar = doc.createElement('div');
  healthBar.className = 'hud-healthbar';
  const healthBarLabel = doc.createElement('div');
  healthBarLabel.className = 'hud-healthbar-label';
  const healthBarTrack = doc.createElement('div');
  healthBarTrack.className = 'hud-healthbar-track';
  const healthBarFill = doc.createElement('div');
  healthBarFill.className = 'hud-healthbar-fill';
  healthBarTrack.append(healthBarFill);
  healthBar.append(healthBarLabel, healthBarTrack);

  const info = doc.createElement('div');
  info.className = 'hud-info';

  const lock = doc.createElement('div');
  lock.className = 'hud-lock';

  const sensitivity = doc.createElement('div');
  sensitivity.className = 'hud-sensitivity';

  const vitals = doc.createElement('div');
  vitals.className = 'hud-vitals';
  const health = doc.createElement('div');
  health.className = 'hud-health';
  const ammo = doc.createElement('div');
  ammo.className = 'hud-ammo';
  vitals.append(health, ammo);

  const score = doc.createElement('div');
  score.className = 'hud-score';

  const weapon = doc.createElement('div');
  weapon.className = 'hud-weapon';
  const weaponCooldown = doc.createElement('div');
  weaponCooldown.className = 'hud-weapon-cooldown';
  const abilities = doc.createElement('div');
  abilities.className = 'hud-abilities';
  const dashCooldown = doc.createElement('div');
  dashCooldown.className = 'hud-ability hud-ability-dash';
  const shieldCooldown = doc.createElement('div');
  shieldCooldown.className = 'hud-ability hud-ability-shield';
  const shockwaveCooldown = doc.createElement('div');
  shockwaveCooldown.className = 'hud-ability hud-ability-shockwave';
  abilities.append(dashCooldown, shieldCooldown, shockwaveCooldown);

  info.append(lock, sensitivity, vitals, score, weapon, weaponCooldown, abilities);
  overlay.append(crosshair, hitmarker, healthBar, info);
  host.appendChild(overlay);

  const setLockState = (state: HudLockState) => {
    overlay.dataset.lock = state;
    lock.textContent = lockLabel(state);
  };

  const setSensitivity = (value?: number) => {
    sensitivity.textContent = `Sens ${formatSensitivity(value)}`;
  };

  const setVitals = (vitalsValue?: { health?: number; ammo?: number }) => {
    const healthValue =
      Number.isFinite(vitalsValue?.health) && vitalsValue?.health !== undefined
        ? Math.max(0, Math.min(100, vitalsValue.health))
        : null;
    health.textContent = `Health: ${formatStat(vitalsValue?.health)}`;
    ammo.textContent = `Ammo: ${formatAmmo(vitalsValue?.ammo)}`;
    healthBarLabel.textContent = `Health ${healthValue === null ? '--' : Math.round(healthValue)}`;
    healthBarFill.style.width = `${healthValue === null ? 0 : healthValue}%`;
  };

  const setScore = (scoreValue?: { kills?: number; deaths?: number }) => {
    const kills = formatStat(scoreValue?.kills, '--');
    const deaths = formatStat(scoreValue?.deaths, '--');
    score.textContent = `Score: ${kills} / ${deaths}`;
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

  const formatCooldown = (value?: number) => {
    if (!Number.isFinite(value) || value === undefined) {
      return '--';
    }
    if (value <= 0) {
      return 'Ready';
    }
    return `${value.toFixed(2)}s`;
  };

  const formatShield = (cooldowns?: {
    shieldCooldown?: number;
    shieldTimer?: number;
    shieldActive?: boolean;
  }) => {
    if (cooldowns?.shieldActive) {
      const timer = Number.isFinite(cooldowns.shieldTimer)
        ? Math.max(0, cooldowns.shieldTimer ?? 0).toFixed(2)
        : '--';
      return `Active ${timer}s`;
    }
    return formatCooldown(cooldowns?.shieldCooldown);
  };

  const setAbilityCooldowns = (cooldowns?: {
    dash?: number;
    shockwave?: number;
    shieldCooldown?: number;
    shieldTimer?: number;
    shieldActive?: boolean;
  }) => {
    dashCooldown.textContent = `Dash: ${formatCooldown(cooldowns?.dash)}`;
    shieldCooldown.textContent = `Shield: ${formatShield(cooldowns)}`;
    shockwaveCooldown.textContent = `Shockwave: ${formatCooldown(cooldowns?.shockwave)}`;
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
  setVitals();
  setScore();
  setWeapon();
  setWeaponCooldown();
  setAbilityCooldowns();

  return {
    element: overlay,
    setLockState,
    setSensitivity,
    setVitals,
    setScore,
    setWeapon,
    setWeaponCooldown,
    setAbilityCooldowns,
    triggerHitmarker,
    dispose
  };
};
