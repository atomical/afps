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
    const weapon = hud.element.querySelector('.hud-weapon');
    const cooldown = hud.element.querySelector('.hud-weapon-cooldown');
    const hitmarker = hud.element.querySelector('.hud-hitmarker');

    expect(lock?.textContent).toContain('Click to lock');
    expect(sensitivity?.textContent).toContain('--');
    expect(weapon?.textContent).toContain('Weapon 1');
    expect(cooldown?.textContent).toContain('--');
    expect(hitmarker?.classList.contains('is-active')).toBe(false);

    hud.setLockState('locked');
    expect(hud.element.dataset.lock).toBe('locked');
    expect(lock?.textContent).toContain('Locked');

    hud.setLockState('unsupported');
    expect(hud.element.dataset.lock).toBe('unsupported');
    expect(lock?.textContent).toContain('Unsupported');

    hud.setSensitivity(0.004);
    expect(sensitivity?.textContent).toContain('0.004');

    hud.setWeapon(1, 'Launcher');
    expect(weapon?.textContent).toContain('Weapon 2');
    expect(weapon?.textContent).toContain('Launcher');

    hud.setWeaponCooldown(0.5);
    expect(cooldown?.textContent).toContain('0.50');

    hud.setWeaponCooldown(0);
    expect(cooldown?.textContent).toContain('Ready');

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
