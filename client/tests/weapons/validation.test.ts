import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WeaponDefinition } from '../../src/weapons/config';
import { WEAPON_DEFS } from '../../src/weapons/config';
import { generateWeaponSfx } from '../../src/weapons/sfx';
import {
  formatWeaponValidationErrors,
  validateWeaponDefinitions,
  validateWeaponSounds
} from '../../src/weapons/validation';

const collectSoundKeys = () => {
  const keys = new Set<string>();
  keys.add('casing:impact:1');
  keys.add('casing:impact:2');
  WEAPON_DEFS.forEach((weapon) => {
    keys.add(weapon.sounds.fire);
    keys.add(weapon.sounds.dryFire);
    keys.add(weapon.sounds.reload);
    if (weapon.sounds.fireVariant2) {
      keys.add(weapon.sounds.fireVariant2);
    }
    if (weapon.sounds.equip) {
      keys.add(weapon.sounds.equip);
    }
    if (weapon.sounds.casingImpact1) {
      keys.add(weapon.sounds.casingImpact1);
    }
    if (weapon.sounds.casingImpact2) {
      keys.add(weapon.sounds.casingImpact2);
    }
  });
  return Array.from(keys);
};

const createAudioStub = () => {
  const buffers = new Map<string, Float32Array>();
  return {
    state: { supported: true },
    createBuffer: (_channels: number, length: number) => {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
    registerBuffer: (key: string, buffer: { getChannelData?: (channel: number) => Float32Array }) => {
      const channel = buffer.getChannelData?.(0);
      if (channel) {
        buffers.set(key, channel);
      }
    },
    hasBuffer: (key: string) => buffers.has(key),
    getBuffers: () => buffers
  };
};

describe('weapon validation', () => {
  it('keeps weapon definitions complete', () => {
    const errors = validateWeaponDefinitions(WEAPON_DEFS);
    expect(errors).toEqual([]);
  });

  it('generates non-silent procedural SFX buffers', () => {
    const audio = createAudioStub();
    generateWeaponSfx(audio as unknown as Parameters<typeof generateWeaponSfx>[0], WEAPON_DEFS);
    const keys = collectSoundKeys();
    const buffers = audio.getBuffers();

    keys.forEach((key) => {
      expect(audio.hasBuffer(key)).toBe(true);
      const samples = buffers.get(key);
      expect(samples).toBeTruthy();
      const hasEnergy = samples?.some((value) => Math.abs(value) > 1e-4) ?? false;
      expect(hasEnergy).toBe(true);
    });
  });

  it('ships the casing mesh asset', () => {
    const casingPath = resolve(process.cwd(), 'public/assets/weapons/cc0/kenney_blaster_kit/bullet-foam.glb');
    expect(existsSync(casingPath)).toBe(true);
  });

  it('reports invalid weapon definitions', () => {
    const errors = validateWeaponDefinitions([]);
    expect(errors).toEqual(['no weapons configured']);

    const badWeapon = {
      id: '',
      displayName: '',
      maxAmmoInMag: 0,
      cooldownSeconds: 0,
      fireMode: 'BURST',
      reloadSeconds: 0,
      ejectShellsWhileFiring: true,
      sounds: { fire: '', dryFire: '', reload: '' }
    } as unknown as WeaponDefinition;

    const invalidErrors = validateWeaponDefinitions([badWeapon, null as unknown as WeaponDefinition]);
    expect(invalidErrors.some((entry) => entry.includes('missing id'))).toBe(true);
    expect(invalidErrors.some((entry) => entry.includes('invalid maxAmmoInMag'))).toBe(true);
    expect(invalidErrors.some((entry) => entry.includes('invalid cooldownSeconds'))).toBe(true);
    expect(invalidErrors.some((entry) => entry.includes('invalid fireMode'))).toBe(true);
    expect(invalidErrors.some((entry) => entry.includes('invalid reloadSeconds'))).toBe(true);
    expect(invalidErrors.some((entry) => entry.includes('missing fire sound'))).toBe(true);
    expect(invalidErrors.some((entry) => entry.includes('missing dryFire sound'))).toBe(true);
    expect(invalidErrors.some((entry) => entry.includes('missing reload sound'))).toBe(true);
    expect(invalidErrors.some((entry) => entry.includes('casingEject invalid'))).toBe(true);
    expect(invalidErrors.some((entry) => entry.includes('missing casing impact sounds'))).toBe(true);
    expect(invalidErrors.some((entry) => entry.includes('is not a valid definition'))).toBe(true);
  });

  it('validates audio buffers when supported', () => {
    const audio = {
      state: { supported: true },
      hasBuffer: (key: string) => key === 'present'
    };
    const weapon: WeaponDefinition = {
      ...WEAPON_DEFS[0],
      sounds: {
        fire: 'present',
        fireVariant2: 'missing_variant',
        dryFire: 'missing_dry',
        reload: 'missing_reload',
        equip: 'missing_equip',
        casingImpact1: 'missing_casing_1',
        casingImpact2: 'missing_casing_2'
      }
    };

    const errors = validateWeaponSounds([weapon], audio as unknown as Parameters<typeof validateWeaponSounds>[1]);
    expect(errors).toContain('missing audio buffer: missing_variant');
    expect(errors).toContain('missing audio buffer: missing_dry');
    expect(errors).toContain('missing audio buffer: missing_reload');
    expect(errors).toContain('missing audio buffer: missing_equip');
    expect(errors).toContain('missing audio buffer: missing_casing_1');
    expect(errors).toContain('missing audio buffer: missing_casing_2');
  });

  it('skips audio validation when unsupported', () => {
    const audio = {
      state: { supported: false },
      hasBuffer: () => false
    };
    const errors = validateWeaponSounds(WEAPON_DEFS, audio as unknown as Parameters<typeof validateWeaponSounds>[1]);
    expect(errors).toEqual([]);
  });

  it('formats validation errors for display', () => {
    expect(formatWeaponValidationErrors([])).toBe('');
    const formatted = formatWeaponValidationErrors(['bad 1', 'bad 2']);
    expect(formatted).toContain('Weapon validation failed');
    expect(formatted).toContain('bad 1');
    expect(formatted).toContain('bad 2');
  });
});
