import { describe, expect, it, vi } from 'vitest';
import { createHudStore, DEFAULT_HUD_STATE, reduceHudState } from '../../src/ui/hud_state';

const makeHud = () => ({
  element: document.createElement('div'),
  setLockState: vi.fn(),
  setSensitivity: vi.fn(),
  setVitals: vi.fn(),
  setScore: vi.fn(),
  setWeapon: vi.fn(),
  setWeaponCooldown: vi.fn(),
  setAbilityCooldowns: vi.fn(),
  triggerHitmarker: vi.fn(),
  dispose: vi.fn()
});

describe('hud state reducers', () => {
  it('reduces state updates', () => {
    const state = reduceHudState(DEFAULT_HUD_STATE, { type: 'lock', state: 'locked' });
    expect(state.lockState).toBe('locked');
    const withVitals = reduceHudState(state, { type: 'vitals', value: { health: 80, ammo: 30 } });
    expect(withVitals.vitals?.health).toBe(80);
  });

  it('dispatches updates to the overlay', () => {
    const hud = makeHud();
    const store = createHudStore(hud);

    store.dispatch({ type: 'sensitivity', value: 0.003 });
    store.dispatch({ type: 'weapon', slot: 1, name: 'Launcher' });
    store.dispatch({ type: 'hitmarker', killed: true });

    expect(hud.setSensitivity).toHaveBeenCalledWith(0.003);
    expect(hud.setWeapon).toHaveBeenCalledWith(1, 'Launcher');
    expect(hud.triggerHitmarker).toHaveBeenCalledWith(true);
  });
});
