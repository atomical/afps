import type { WeaponDefinition } from './config';
import { WEAPON_DEFS } from './config';

type DebugTarget = {
  afpsDebug?: Record<string, unknown>;
};

export const exposeWeaponDebug = (
  target: DebugTarget | null,
  weapons: WeaponDefinition[] = WEAPON_DEFS
) => {
  if (!target) {
    return null;
  }
  const debug = (target.afpsDebug ?? {}) as Record<string, unknown>;
  debug.weapons = weapons;
  debug.listWeapons = () =>
    weapons.map((weapon) => ({
      id: weapon.id,
      displayName: weapon.displayName,
      maxAmmoInMag: weapon.maxAmmoInMag,
      cooldownSeconds: weapon.cooldownSeconds,
      fireMode: weapon.fireMode,
      ejectShellsWhileFiring: weapon.ejectShellsWhileFiring,
      reloadSeconds: weapon.reloadSeconds,
      sfxProfile: weapon.sfxProfile
    }));
  debug.printWeapons = () => {
    const rows = (debug.listWeapons as () => unknown)();
    if (Array.isArray(rows) && typeof console !== 'undefined' && console.table) {
      console.table(rows);
    } else if (typeof console !== 'undefined') {
      console.log(rows);
    }
    return rows;
  };
  target.afpsDebug = debug;
  return debug;
};
