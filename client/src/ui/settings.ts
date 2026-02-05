import type { AudioSettings } from '../audio/settings';
import { DEFAULT_AUDIO_SETTINGS, normalizeAudioSettings } from '../audio/settings';
import type { InputBindings } from '../input/sampler';
import { getPrimaryBinding, normalizeBindings, setPrimaryBinding } from '../input/bindings';
import type { FxSettings } from '../rendering/fx_settings';
import { DEFAULT_FX_SETTINGS, normalizeFxSettings } from '../rendering/fx_settings';
import { LOADOUT_BITS, normalizeLoadoutBits } from '../weapons/loadout';

export interface SettingsOverlay {
  element: HTMLDivElement;
  isVisible: () => boolean;
  setVisible: (visible: boolean) => void;
  toggle: () => void;
  setSensitivity: (value: number) => void;
  setLookInversion: (invertX: boolean, invertY: boolean) => void;
  setMetricsVisible: (visible: boolean) => void;
  setAudioSettings: (settings: AudioSettings) => void;
  dispose: () => void;
}

export interface SettingsOptions {
  initialSensitivity?: number;
  onSensitivityChange?: (value: number) => void;
  initialInvertLookX?: boolean;
  initialInvertLookY?: boolean;
  onInvertLookXChange?: (value: boolean) => void;
  onInvertLookYChange?: (value: boolean) => void;
  initialBindings?: InputBindings;
  onBindingsChange?: (bindings: InputBindings) => void;
  initialShowMetrics?: boolean;
  onShowMetricsChange?: (visible: boolean) => void;
  initialAudioSettings?: AudioSettings;
  onAudioSettingsChange?: (settings: AudioSettings) => void;
  initialFxSettings?: FxSettings;
  onFxSettingsChange?: (settings: FxSettings) => void;
  initialLoadoutBits?: number;
  onLoadoutBitsChange?: (bits: number) => void;
}

const DEFAULT_SENSITIVITY = 0.002;
const MIN_SENSITIVITY = 0.0005;
const MAX_SENSITIVITY = 0.01;
const STEP_SENSITIVITY = 0.0005;

const clampSensitivity = (value: number) =>
  Math.min(MAX_SENSITIVITY, Math.max(MIN_SENSITIVITY, value));

const formatSensitivity = (value: number) => value.toFixed(4);

const AUDIO_RANGE = {
  min: 0,
  max: 1,
  step: 0.05
};

export const createSettingsOverlay = (
  doc: Document,
  {
    initialSensitivity,
    onSensitivityChange,
    initialInvertLookX,
    initialInvertLookY,
    onInvertLookXChange,
    onInvertLookYChange,
    initialBindings,
    onBindingsChange,
    initialShowMetrics,
    onShowMetricsChange,
    initialAudioSettings,
    onAudioSettingsChange,
    initialFxSettings,
    onFxSettingsChange,
    initialLoadoutBits,
    onLoadoutBitsChange
  }: SettingsOptions = {},
  containerId = 'app'
): SettingsOverlay => {
  const host = doc.getElementById(containerId) ?? doc.body;
  const overlay = doc.createElement('div');
  overlay.className = 'settings-overlay';
  overlay.dataset.visible = 'false';

  const panel = doc.createElement('div');
  panel.className = 'settings-panel';

  const title = doc.createElement('div');
  title.className = 'settings-title';
  title.textContent = 'Settings';

  const hint = doc.createElement('div');
  hint.className = 'settings-hint';
  hint.textContent = 'Press O to toggle';

  const group = doc.createElement('div');
  group.className = 'settings-group';

  const label = doc.createElement('label');
  label.className = 'settings-label';
  label.textContent = 'Look Sensitivity';

  const valueText = doc.createElement('span');
  valueText.className = 'settings-value';

  const input = doc.createElement('input');
  input.type = 'range';
  input.min = String(MIN_SENSITIVITY);
  input.max = String(MAX_SENSITIVITY);
  input.step = String(STEP_SENSITIVITY);

  label.append(valueText);
  group.append(label, input);

  const bindingsGroup = doc.createElement('div');
  bindingsGroup.className = 'settings-group settings-bindings';

  const audioGroup = doc.createElement('div');
  audioGroup.className = 'settings-group settings-audio';

  const metricsGroup = doc.createElement('div');
  metricsGroup.className = 'settings-group settings-toggles';

  const invertXRow = doc.createElement('label');
  invertXRow.className = 'settings-toggle';
  const invertXToggle = doc.createElement('input');
  invertXToggle.type = 'checkbox';
  const invertXLabel = doc.createElement('span');
  invertXLabel.textContent = 'Invert mouse X';
  invertXRow.append(invertXToggle, invertXLabel);

  const invertYRow = doc.createElement('label');
  invertYRow.className = 'settings-toggle';
  const invertYToggle = doc.createElement('input');
  invertYToggle.type = 'checkbox';
  const invertYLabel = doc.createElement('span');
  invertYLabel.textContent = 'Invert mouse Y';
  invertYRow.append(invertYToggle, invertYLabel);

  const metricsRow = doc.createElement('label');
  metricsRow.className = 'settings-toggle';
  const metricsToggle = doc.createElement('input');
  metricsToggle.type = 'checkbox';
  const metricsLabel = doc.createElement('span');
  metricsLabel.textContent = 'Show net stats';
  metricsRow.append(metricsToggle, metricsLabel);
  metricsGroup.append(invertXRow, invertYRow, metricsRow);

  const fxGroup = doc.createElement('div');
  fxGroup.className = 'settings-group settings-toggles settings-fx';

  const fxTitle = doc.createElement('div');
  fxTitle.className = 'settings-subtitle';
  fxTitle.textContent = 'Effects';

  const muzzleFlashRow = doc.createElement('label');
  muzzleFlashRow.className = 'settings-toggle';
  const muzzleFlashToggle = doc.createElement('input');
  muzzleFlashToggle.type = 'checkbox';
  const muzzleFlashLabel = doc.createElement('span');
  muzzleFlashLabel.textContent = 'Muzzle flash';
  muzzleFlashRow.append(muzzleFlashToggle, muzzleFlashLabel);

  const tracersRow = doc.createElement('label');
  tracersRow.className = 'settings-toggle';
  const tracersToggle = doc.createElement('input');
  tracersToggle.type = 'checkbox';
  const tracersLabel = doc.createElement('span');
  tracersLabel.textContent = 'Tracers';
  tracersRow.append(tracersToggle, tracersLabel);

  const decalsRow = doc.createElement('label');
  decalsRow.className = 'settings-toggle';
  const decalsToggle = doc.createElement('input');
  decalsToggle.type = 'checkbox';
  const decalsLabel = doc.createElement('span');
  decalsLabel.textContent = 'Decals';
  decalsRow.append(decalsToggle, decalsLabel);

  const aimDebugRow = doc.createElement('label');
  aimDebugRow.className = 'settings-toggle';
  const aimDebugToggle = doc.createElement('input');
  aimDebugToggle.type = 'checkbox';
  const aimDebugLabel = doc.createElement('span');
  aimDebugLabel.textContent = 'Aim debug';
  aimDebugRow.append(aimDebugToggle, aimDebugLabel);

  fxGroup.append(fxTitle, muzzleFlashRow, tracersRow, decalsRow, aimDebugRow);

  const attachmentsGroup = doc.createElement('div');
  attachmentsGroup.className = 'settings-group settings-toggles settings-attachments';

  const attachmentsTitle = doc.createElement('div');
  attachmentsTitle.className = 'settings-subtitle';
  attachmentsTitle.textContent = 'Attachments';

  const suppressorRow = doc.createElement('label');
  suppressorRow.className = 'settings-toggle';
  const suppressorToggle = doc.createElement('input');
  suppressorToggle.type = 'checkbox';
  const suppressorLabel = doc.createElement('span');
  suppressorLabel.textContent = 'Suppressor';
  suppressorRow.append(suppressorToggle, suppressorLabel);

  const compensatorRow = doc.createElement('label');
  compensatorRow.className = 'settings-toggle';
  const compensatorToggle = doc.createElement('input');
  compensatorToggle.type = 'checkbox';
  const compensatorLabel = doc.createElement('span');
  compensatorLabel.textContent = 'Compensator';
  compensatorRow.append(compensatorToggle, compensatorLabel);

  const opticRow = doc.createElement('label');
  opticRow.className = 'settings-toggle';
  const opticToggle = doc.createElement('input');
  opticToggle.type = 'checkbox';
  const opticLabel = doc.createElement('span');
  opticLabel.textContent = 'Optic';
  opticRow.append(opticToggle, opticLabel);

  const extendedMagRow = doc.createElement('label');
  extendedMagRow.className = 'settings-toggle';
  const extendedMagToggle = doc.createElement('input');
  extendedMagToggle.type = 'checkbox';
  const extendedMagLabel = doc.createElement('span');
  extendedMagLabel.textContent = 'Extended mag';
  extendedMagRow.append(extendedMagToggle, extendedMagLabel);

  const gripRow = doc.createElement('label');
  gripRow.className = 'settings-toggle';
  const gripToggle = doc.createElement('input');
  gripToggle.type = 'checkbox';
  const gripLabel = doc.createElement('span');
  gripLabel.textContent = 'Grip';
  gripRow.append(gripToggle, gripLabel);

  attachmentsGroup.append(
    attachmentsTitle,
    suppressorRow,
    compensatorRow,
    opticRow,
    extendedMagRow,
    gripRow
  );

  const audioTitle = doc.createElement('div');
  audioTitle.className = 'settings-subtitle';
  audioTitle.textContent = 'Audio';

  const audioList = doc.createElement('div');
  audioList.className = 'settings-audio-list';

  const makeAudioRow = (labelText: string) => {
    const row = doc.createElement('label');
    row.className = 'settings-audio-row';
    const labelEl = doc.createElement('span');
    labelEl.textContent = labelText;
    const valueEl = doc.createElement('span');
    valueEl.className = 'settings-audio-value';
    row.append(labelEl, valueEl);
    return { row, valueEl };
  };

  const masterRow = makeAudioRow('Master');
  const sfxRow = makeAudioRow('SFX');
  const uiRow = makeAudioRow('UI');
  const musicRow = makeAudioRow('Music');

  const masterSlider = doc.createElement('input');
  masterSlider.type = 'range';
  masterSlider.min = String(AUDIO_RANGE.min);
  masterSlider.max = String(AUDIO_RANGE.max);
  masterSlider.step = String(AUDIO_RANGE.step);

  const sfxSlider = masterSlider.cloneNode() as HTMLInputElement;
  const uiSlider = masterSlider.cloneNode() as HTMLInputElement;
  const musicSlider = masterSlider.cloneNode() as HTMLInputElement;

  const muteRow = doc.createElement('label');
  muteRow.className = 'settings-toggle';
  const muteToggle = doc.createElement('input');
  muteToggle.type = 'checkbox';
  const muteLabel = doc.createElement('span');
  muteLabel.textContent = 'Mute all';
  muteRow.append(muteToggle, muteLabel);

  const appendAudioControl = (row: HTMLElement, slider: HTMLInputElement) => {
    const wrapper = doc.createElement('div');
    wrapper.className = 'settings-audio-control';
    wrapper.append(row, slider);
    audioList.append(wrapper);
  };

  appendAudioControl(masterRow.row, masterSlider);
  appendAudioControl(sfxRow.row, sfxSlider);
  appendAudioControl(uiRow.row, uiSlider);
  appendAudioControl(musicRow.row, musicSlider);
  audioGroup.append(audioTitle, audioList, muteRow);

  const bindingsTitle = doc.createElement('div');
  bindingsTitle.className = 'settings-subtitle';
  bindingsTitle.textContent = 'Keybinds';

  const bindingsList = doc.createElement('div');
  bindingsList.className = 'settings-bindings-list';

  bindingsGroup.append(bindingsTitle, bindingsList);

  panel.append(title, hint, group, metricsGroup, fxGroup, attachmentsGroup, audioGroup, bindingsGroup);
  overlay.append(panel);
  host.appendChild(overlay);

  let bindings = normalizeBindings(initialBindings);
  let captureAction: keyof InputBindings | null = null;
  const bindingButtons = new Map<keyof InputBindings, HTMLButtonElement>();
  const actionLabels: Array<[keyof InputBindings, string]> = [
    ['forward', 'Forward'],
    ['backward', 'Backward'],
    ['left', 'Left'],
    ['right', 'Right'],
    ['jump', 'Jump'],
    ['sprint', 'Sprint'],
    ['dash', 'Dash'],
    ['grapple', 'Grapple'],
    ['shield', 'Shield'],
    ['shockwave', 'Shockwave'],
    ['weaponSlot1', 'Weapon 1'],
    ['weaponSlot2', 'Weapon 2']
  ];

  const formatBindingLabel = (code: string) => (code.length > 0 ? code.replace('Key', '') : '--');

  const updateBindingRow = (action: keyof InputBindings) => {
    const button = bindingButtons.get(action) as HTMLButtonElement;
    if (captureAction === action) {
      button.textContent = 'Press a key...';
      return;
    }
    button.textContent = formatBindingLabel(getPrimaryBinding(bindings, action));
  };

  for (const [action, labelText] of actionLabels) {
    const row = doc.createElement('div');
    row.className = 'settings-binding-row';

    const labelEl = doc.createElement('div');
    labelEl.className = 'settings-binding-label';
    labelEl.textContent = labelText;

    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'settings-binding-button';
    button.addEventListener('click', () => {
      captureAction = action;
      updateBindingRow(action);
      button.focus();
    });

    bindingButtons.set(action, button);
    updateBindingRow(action);
    row.append(labelEl, button);
    bindingsList.append(row);
  }

  const handleKeydown = (event: KeyboardEvent) => {
    if (!captureAction) {
      return;
    }
    if (event.code === 'Escape') {
      captureAction = null;
      for (const action of bindingButtons.keys()) {
        updateBindingRow(action);
      }
      return;
    }
    event.preventDefault();
    const action = captureAction;
    captureAction = null;
    bindings = setPrimaryBinding(bindings, action, event.code);
    updateBindingRow(action);
    onBindingsChange?.(bindings);
  };

  doc.addEventListener('keydown', handleKeydown);

  const setSensitivity = (value: number) => {
    const safeValue = clampSensitivity(Number.isFinite(value) ? value : DEFAULT_SENSITIVITY);
    input.value = String(safeValue);
    valueText.textContent = formatSensitivity(safeValue);
  };

  const getSensitivity = () => Number(input.value);

  input.addEventListener('input', () => {
    const next = clampSensitivity(getSensitivity());
    setSensitivity(next);
    onSensitivityChange?.(next);
  });

  const setLookInversion = (invertX: boolean, invertY: boolean) => {
    invertXToggle.checked = invertX;
    invertYToggle.checked = invertY;
  };

  invertXToggle.addEventListener('change', () => {
    onInvertLookXChange?.(invertXToggle.checked);
  });

  invertYToggle.addEventListener('change', () => {
    onInvertLookYChange?.(invertYToggle.checked);
  });

  const setMetricsVisible = (visible: boolean) => {
    metricsToggle.checked = visible;
  };

  metricsToggle.addEventListener('change', () => {
    onShowMetricsChange?.(metricsToggle.checked);
  });

  let fxSettings = normalizeFxSettings(initialFxSettings ?? DEFAULT_FX_SETTINGS);

  const setFxSettings = (settings: FxSettings) => {
    fxSettings = normalizeFxSettings(settings);
    muzzleFlashToggle.checked = fxSettings.muzzleFlash;
    tracersToggle.checked = fxSettings.tracers;
    decalsToggle.checked = fxSettings.decals;
    aimDebugToggle.checked = fxSettings.aimDebug;
  };

  const emitFxSettings = () => {
    fxSettings = {
      muzzleFlash: muzzleFlashToggle.checked,
      tracers: tracersToggle.checked,
      decals: decalsToggle.checked,
      aimDebug: aimDebugToggle.checked
    };
    onFxSettingsChange?.(fxSettings);
  };

  muzzleFlashToggle.addEventListener('change', emitFxSettings);
  tracersToggle.addEventListener('change', emitFxSettings);
  decalsToggle.addEventListener('change', emitFxSettings);
  aimDebugToggle.addEventListener('change', emitFxSettings);

  let loadoutBits = normalizeLoadoutBits(initialLoadoutBits ?? 0);

  const setLoadoutBits = (value: number) => {
    loadoutBits = normalizeLoadoutBits(value);
    suppressorToggle.checked = (loadoutBits & LOADOUT_BITS.suppressor) !== 0;
    compensatorToggle.checked = (loadoutBits & LOADOUT_BITS.compensator) !== 0;
    opticToggle.checked = (loadoutBits & LOADOUT_BITS.optic) !== 0;
    extendedMagToggle.checked = (loadoutBits & LOADOUT_BITS.extendedMag) !== 0;
    gripToggle.checked = (loadoutBits & LOADOUT_BITS.grip) !== 0;
  };

  const emitLoadoutBits = (nextBits: number) => {
    const normalized = normalizeLoadoutBits(nextBits);
    if (normalized === loadoutBits) {
      return;
    }
    loadoutBits = normalized;
    onLoadoutBitsChange?.(loadoutBits);
  };

  suppressorToggle.addEventListener('change', () => {
    emitLoadoutBits(
      suppressorToggle.checked ? loadoutBits | LOADOUT_BITS.suppressor : loadoutBits & ~LOADOUT_BITS.suppressor
    );
  });

  compensatorToggle.addEventListener('change', () => {
    emitLoadoutBits(
      compensatorToggle.checked ? loadoutBits | LOADOUT_BITS.compensator : loadoutBits & ~LOADOUT_BITS.compensator
    );
  });

  opticToggle.addEventListener('change', () => {
    emitLoadoutBits(opticToggle.checked ? loadoutBits | LOADOUT_BITS.optic : loadoutBits & ~LOADOUT_BITS.optic);
  });

  extendedMagToggle.addEventListener('change', () => {
    emitLoadoutBits(
      extendedMagToggle.checked ? loadoutBits | LOADOUT_BITS.extendedMag : loadoutBits & ~LOADOUT_BITS.extendedMag
    );
  });

  gripToggle.addEventListener('change', () => {
    emitLoadoutBits(gripToggle.checked ? loadoutBits | LOADOUT_BITS.grip : loadoutBits & ~LOADOUT_BITS.grip);
  });

  let audioSettings = normalizeAudioSettings(initialAudioSettings ?? DEFAULT_AUDIO_SETTINGS);
  const formatAudioValue = (value: number) => `${Math.round(value * 100)}%`;

  const setAudioSettings = (value: AudioSettings) => {
    audioSettings = normalizeAudioSettings(value);
    masterSlider.value = String(audioSettings.master);
    sfxSlider.value = String(audioSettings.sfx);
    uiSlider.value = String(audioSettings.ui);
    musicSlider.value = String(audioSettings.music);
    masterRow.valueEl.textContent = formatAudioValue(audioSettings.master);
    sfxRow.valueEl.textContent = formatAudioValue(audioSettings.sfx);
    uiRow.valueEl.textContent = formatAudioValue(audioSettings.ui);
    musicRow.valueEl.textContent = formatAudioValue(audioSettings.music);
    muteToggle.checked = audioSettings.muted;
  };

  const updateAudio = (patch: Partial<AudioSettings>) => {
    audioSettings = normalizeAudioSettings({ ...audioSettings, ...patch });
    setAudioSettings(audioSettings);
    onAudioSettingsChange?.(audioSettings);
  };

  const handleAudioInput = (slider: HTMLInputElement, key: keyof AudioSettings) => {
    slider.addEventListener('input', () => {
      updateAudio({ [key]: Number(slider.value) } as Partial<AudioSettings>);
    });
  };

  handleAudioInput(masterSlider, 'master');
  handleAudioInput(sfxSlider, 'sfx');
  handleAudioInput(uiSlider, 'ui');
  handleAudioInput(musicSlider, 'music');
  muteToggle.addEventListener('change', () => {
    updateAudio({ muted: muteToggle.checked });
  });

  const isVisible = () => overlay.dataset.visible === 'true';

  const setVisible = (visible: boolean) => {
    overlay.dataset.visible = visible ? 'true' : 'false';
  };

  const toggle = () => {
    setVisible(!isVisible());
  };

  setSensitivity(
    Number.isFinite(initialSensitivity) && (initialSensitivity ?? 0) > 0
      ? initialSensitivity
      : DEFAULT_SENSITIVITY
  );
  setLookInversion(Boolean(initialInvertLookX), Boolean(initialInvertLookY));
  setMetricsVisible(initialShowMetrics ?? true);
  setFxSettings(fxSettings);
  setLoadoutBits(loadoutBits);
  setAudioSettings(audioSettings);

  const dispose = () => {
    doc.removeEventListener('keydown', handleKeydown);
    overlay.remove();
  };

  return {
    element: overlay,
    isVisible,
    setVisible,
    toggle,
    setSensitivity,
    setLookInversion,
    setMetricsVisible,
    setAudioSettings,
    dispose
  };
};
