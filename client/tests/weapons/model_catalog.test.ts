import { describe, expect, it } from 'vitest';
import { resolveWeaponModelSpec } from '../../src/weapons/model_catalog';

describe('weapon model catalog', () => {
  it('returns a stable default spec for unknown ids', () => {
    const spec = resolveWeaponModelSpec('UNKNOWN_WEAPON');
    expect(spec.file).toContain('blaster-a.glb');
    expect(spec.worldScale).toBeCloseTo(0.6);
    expect(spec.viewmodel.scale).toBeCloseTo(0.55);
  });

  it('resolves shared ids used by gameplay and legacy tests', () => {
    const rifle = resolveWeaponModelSpec('AR_556');
    expect(rifle.file).toContain('blaster-d.glb');
    expect(rifle.worldScale).toBeCloseTo(0.62);

    const legacyRifle = resolveWeaponModelSpec('rifle');
    expect(legacyRifle.file).toContain('blaster-d.glb');

    const launcher = resolveWeaponModelSpec('launcher');
    expect(launcher.file).toContain('blaster-f.glb');
    expect(launcher.viewmodel.rotation[0]).toBeCloseTo(0.06);
  });
});
