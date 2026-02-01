import { describe, expect, it, vi } from 'vitest';
import { createHudOverlay } from '../../src/ui/hud';

describe('hud overlay', () => {
  it('creates overlay elements and updates state', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="app"></div>';
    const hud = createHudOverlay(document);

    expect(hud.element.className).toContain('hud-overlay');
    expect(document.querySelector('#app')?.firstElementChild).toBe(hud.element);

    const lock = hud.element.querySelector('.hud-lock');
    const sensitivity = hud.element.querySelector('.hud-sensitivity');
    const health = hud.element.querySelector('.hud-health');
    const ammo = hud.element.querySelector('.hud-ammo');
    const score = hud.element.querySelector('.hud-score');
    const weapon = hud.element.querySelector('.hud-weapon');
    const cooldown = hud.element.querySelector('.hud-weapon-cooldown');
    const abilities = hud.element.querySelector('.hud-abilities');
    const dashCooldown = hud.element.querySelector('.hud-ability-dash');
    const shieldCooldown = hud.element.querySelector('.hud-ability-shield');
    const shockwaveCooldown = hud.element.querySelector('.hud-ability-shockwave');
    const hitmarker = hud.element.querySelector('.hud-hitmarker');

    expect(lock?.textContent).toContain('Click to lock');
    expect(sensitivity?.textContent).toContain('--');
    expect(health?.textContent).toContain('--');
    expect(ammo?.textContent).toContain('--');
    expect(score?.textContent).toContain('--');
    expect(weapon?.textContent).toContain('Weapon 1');
    expect(cooldown?.textContent).toContain('--');
    expect(abilities).not.toBeNull();
    expect(dashCooldown?.textContent).toContain('Dash');
    expect(dashCooldown?.textContent).toContain('--');
    expect(shieldCooldown?.textContent).toContain('Shield');
    expect(shieldCooldown?.textContent).toContain('--');
    expect(shockwaveCooldown?.textContent).toContain('Shockwave');
    expect(shockwaveCooldown?.textContent).toContain('--');
    expect(hitmarker?.classList.contains('is-active')).toBe(false);

    hud.setLockState('locked');
    expect(hud.element.dataset.lock).toBe('locked');
    expect(lock?.textContent).toContain('Locked');

    hud.setLockState('unsupported');
    expect(hud.element.dataset.lock).toBe('unsupported');
    expect(lock?.textContent).toContain('Unsupported');

    hud.setSensitivity(0.004);
    expect(sensitivity?.textContent).toContain('0.004');

    hud.setVitals({ health: 88, ammo: Infinity });
    expect(health?.textContent).toContain('88');
    expect(ammo?.textContent).toContain('INF');

    hud.setScore({ kills: 2, deaths: 1 });
    expect(score?.textContent).toContain('2');
    expect(score?.textContent).toContain('1');

    hud.setWeapon(1, 'Launcher');
    expect(weapon?.textContent).toContain('Weapon 2');
    expect(weapon?.textContent).toContain('Launcher');

    hud.setWeaponCooldown(0.5);
    expect(cooldown?.textContent).toContain('0.50');

    hud.setWeaponCooldown(0);
    expect(cooldown?.textContent).toContain('Ready');

    hud.setAbilityCooldowns({ dash: 1.25, shockwave: 0, shieldCooldown: 0.5 });
    expect(dashCooldown?.textContent).toContain('1.25');
    expect(shieldCooldown?.textContent).toContain('0.50');
    expect(shockwaveCooldown?.textContent).toContain('Ready');

    hud.setAbilityCooldowns({ shieldActive: true, shieldTimer: 0.2 });
    expect(shieldCooldown?.textContent).toContain('Active');

    hud.triggerHitmarker(true);
    expect(hitmarker?.classList.contains('is-active')).toBe(true);
    expect(hitmarker?.classList.contains('is-kill')).toBe(true);
    hud.triggerHitmarker(false);
    vi.advanceTimersByTime(150);
    expect(hitmarker?.classList.contains('is-active')).toBe(false);
    hud.triggerHitmarker(true);

    hud.dispose();
    expect(document.querySelector('.hud-overlay')).toBeNull();
    vi.useRealTimers();
  });

  it('falls back to body when container is missing', () => {
    document.body.innerHTML = '';
    const hud = createHudOverlay(document, 'missing');

    expect(document.body.contains(hud.element)).toBe(true);

    hud.dispose();
  });
});
