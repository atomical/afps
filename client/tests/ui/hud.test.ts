import { describe, expect, it } from 'vitest';
import { createHudOverlay } from '../../src/ui/hud';

describe('hud overlay', () => {
  it('creates overlay elements and updates state', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const hud = createHudOverlay(document);

    expect(hud.element.className).toContain('hud-overlay');
    expect(document.querySelector('#app')?.firstElementChild).toBe(hud.element);

    const lock = hud.element.querySelector('.hud-lock');
    const sensitivity = hud.element.querySelector('.hud-sensitivity');

    expect(lock?.textContent).toContain('Click to lock');
    expect(sensitivity?.textContent).toContain('--');

    hud.setLockState('locked');
    expect(hud.element.dataset.lock).toBe('locked');
    expect(lock?.textContent).toContain('Locked');

    hud.setLockState('unsupported');
    expect(hud.element.dataset.lock).toBe('unsupported');
    expect(lock?.textContent).toContain('Unsupported');

    hud.setSensitivity(0.004);
    expect(sensitivity?.textContent).toContain('0.004');

    hud.dispose();
    expect(document.querySelector('.hud-overlay')).toBeNull();
  });

  it('falls back to body when container is missing', () => {
    document.body.innerHTML = '';
    const hud = createHudOverlay(document, 'missing');

    expect(document.body.contains(hud.element)).toBe(true);

    hud.dispose();
  });
});
