import type { AbilityCooldowns } from '../types';
import type { HudLockState, HudOverlay } from './hud';

export interface HudState {
  lockState: HudLockState;
  sensitivity?: number;
  vitals?: { health?: number; ammo?: number };
  score?: { kills?: number; deaths?: number };
  weapon?: { slot?: number; name?: string };
  weaponCooldown?: number;
  abilityCooldowns?: AbilityCooldowns;
}

export type HudAction =
  | { type: 'lock'; state: HudLockState }
  | { type: 'sensitivity'; value?: number }
  | { type: 'vitals'; value?: { health?: number; ammo?: number } }
  | { type: 'score'; value?: { kills?: number; deaths?: number } }
  | { type: 'weapon'; slot?: number; name?: string }
  | { type: 'weaponCooldown'; value?: number }
  | { type: 'abilityCooldowns'; value?: AbilityCooldowns }
  | { type: 'hitmarker'; killed?: boolean };

export const DEFAULT_HUD_STATE: HudState = {
  lockState: 'unlocked',
  sensitivity: undefined,
  vitals: undefined,
  score: undefined,
  weapon: undefined,
  weaponCooldown: undefined,
  abilityCooldowns: undefined
};

export const reduceHudState = (state: HudState, action: HudAction): HudState => {
  switch (action.type) {
    case 'lock':
      return { ...state, lockState: action.state };
    case 'sensitivity':
      return { ...state, sensitivity: action.value };
    case 'vitals':
      return { ...state, vitals: action.value };
    case 'score':
      return { ...state, score: action.value };
    case 'weapon':
      return { ...state, weapon: { slot: action.slot, name: action.name } };
    case 'weaponCooldown':
      return { ...state, weaponCooldown: action.value };
    case 'abilityCooldowns':
      return { ...state, abilityCooldowns: action.value };
    case 'hitmarker':
      return state;
    default:
      return state;
  }
};

export const applyHudState = (hud: HudOverlay, state: HudState) => {
  hud.setLockState(state.lockState);
  hud.setSensitivity(state.sensitivity);
  hud.setVitals(state.vitals);
  hud.setScore(state.score);
  hud.setWeapon(state.weapon?.slot, state.weapon?.name);
  hud.setWeaponCooldown(state.weaponCooldown);
  hud.setAbilityCooldowns(state.abilityCooldowns);
};

export const createHudStore = (hud: HudOverlay, initialState?: HudState) => {
  let state = { ...DEFAULT_HUD_STATE, ...initialState };
  applyHudState(hud, state);

  const dispatch = (action: HudAction) => {
    if (action.type === 'hitmarker') {
      hud.triggerHitmarker(action.killed);
      return;
    }
    state = reduceHudState(state, action);
    applyHudState(hud, state);
  };

  const getState = () => ({ ...state });

  const setState = (next: HudState) => {
    state = { ...next };
    applyHudState(hud, state);
  };

  return { dispatch, getState, setState };
};
