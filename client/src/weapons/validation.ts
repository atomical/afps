import type { AudioManager } from '../audio/manager';
import type { WeaponDefinition } from './config';

const isPositiveNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0;

const isNonEmptyString = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

const collectSoundKeys = (weapon: WeaponDefinition) => {
  const keys = [
    weapon.sounds.fire,
    weapon.sounds.dryFire,
    weapon.sounds.reload,
    weapon.sounds.fireVariant2,
    weapon.sounds.equip,
    weapon.sounds.casingImpact1,
    weapon.sounds.casingImpact2
  ];
  return keys.filter((key): key is string => Boolean(key));
};

export const validateWeaponDefinitions = (weapons: WeaponDefinition[]) => {
  const errors: string[] = [];
  if (!Array.isArray(weapons) || weapons.length === 0) {
    errors.push('no weapons configured');
    return errors;
  }

  weapons.forEach((weapon, index) => {
    const label = weapon?.id ? `weapon:${weapon.id}` : `weapon@${index}`;
    if (!weapon || typeof weapon !== 'object') {
      errors.push(`${label} is not a valid definition`);
      return;
    }
    if (!isNonEmptyString(weapon.id)) {
      errors.push(`${label} missing id`);
    }
    if (!isNonEmptyString(weapon.displayName)) {
      errors.push(`${label} missing displayName`);
    }
    if (!isPositiveNumber(weapon.maxAmmoInMag)) {
      errors.push(`${label} invalid maxAmmoInMag`);
    }
    if (!isPositiveNumber(weapon.cooldownSeconds)) {
      errors.push(`${label} invalid cooldownSeconds`);
    }
    if (weapon.fireMode !== 'SEMI' && weapon.fireMode !== 'FULL_AUTO') {
      errors.push(`${label} invalid fireMode`);
    }
    if (!isPositiveNumber(weapon.reloadSeconds)) {
      errors.push(`${label} invalid reloadSeconds`);
    }
    if (!weapon.sounds || !isNonEmptyString(weapon.sounds.fire)) {
      errors.push(`${label} missing fire sound`);
    }
    if (!weapon.sounds || !isNonEmptyString(weapon.sounds.dryFire)) {
      errors.push(`${label} missing dryFire sound`);
    }
    if (!weapon.sounds || !isNonEmptyString(weapon.sounds.reload)) {
      errors.push(`${label} missing reload sound`);
    }
    if (weapon.ejectShellsWhileFiring) {
      if (!weapon.casingEject || !isPositiveNumber(weapon.casingEject.lifetimeSeconds)) {
        errors.push(`${label} casingEject invalid`);
      }
      if (!weapon.sounds?.casingImpact1 && !weapon.sounds?.casingImpact2) {
        errors.push(`${label} missing casing impact sounds`);
      }
    }
  });

  return errors;
};

export const validateWeaponSounds = (weapons: WeaponDefinition[], audio: AudioManager) => {
  const errors: string[] = [];
  if (!audio?.hasBuffer || !audio.state.supported) {
    return errors;
  }
  const missing = new Set<string>();
  weapons.forEach((weapon) => {
    collectSoundKeys(weapon).forEach((key) => {
      if (!audio.hasBuffer(key)) {
        missing.add(key);
      }
    });
  });
  missing.forEach((key) => errors.push(`missing audio buffer: ${key}`));
  return errors;
};

export const formatWeaponValidationErrors = (errors: string[]) => {
  if (errors.length === 0) {
    return '';
  }
  return `Weapon validation failed:\n- ${errors.join('\n- ')}`;
};
