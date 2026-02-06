import type { AudioSettings } from '../audio/settings';
import { DEFAULT_AUDIO_SETTINGS, normalizeAudioSettings } from '../audio/settings';
import type { FxSettings } from '../rendering/fx_settings';

export interface SettingsOverlay {
  element: HTMLDivElement;
  isVisible: () => boolean;
  setVisible: (visible: boolean) => void;
  toggle: () => void;
  setSensitivity: (value: number) => void;
  setMetricsVisible: (visible: boolean) => void;
  setAudioSettings: (settings: AudioSettings) => void;
  dispose: () => void;
}

export interface SettingsOptions {
  initialSensitivity?: number;
  onSensitivityChange?: (value: number) => void;
  initialShowMetrics?: boolean;
  onShowMetricsChange?: (visible: boolean) => void;
  initialAudioSettings?: AudioSettings;
  onAudioSettingsChange?: (settings: AudioSettings) => void;
  initialFxSettings?: FxSettings;
  onFxSettingsChange?: (settings: FxSettings) => void;
  initialLoadoutBits?: number;
  onLoadoutBitsChange?: (bits: number) => void;
}

const AUDIO_RANGE = {
  min: 0,
  max: 1,
  step: 0.05
};

const KEYBOARD_ROWS: Array<{ action: string; keys: string }> = [
  { action: 'Move Forward', keys: 'W / ArrowUp' },
  { action: 'Move Backward', keys: 'S / ArrowDown' },
  { action: 'Move Left', keys: 'A / ArrowLeft' },
  { action: 'Move Right', keys: 'D / ArrowRight' },
  { action: 'Jump', keys: 'Space' },
  { action: 'Sprint', keys: 'ShiftLeft / ShiftRight' },
  { action: 'Crouch', keys: 'C' },
  { action: 'Dash', keys: 'E' },
  { action: 'Grapple', keys: 'Q' },
  { action: 'Shield', keys: 'F' },
  { action: 'Shockwave', keys: 'R' },
  { action: 'Weapon 1', keys: '1 / Numpad1' },
  { action: 'Weapon 2', keys: '2 / Numpad2' },
  { action: 'Cycle Weapons', keys: 'Mouse Wheel' },
  { action: 'Fire', keys: 'Mouse Left' },
  { action: 'Aim Down Sights', keys: 'Mouse Right' },
  { action: 'Scoreboard', keys: 'Hold P' },
  { action: 'Toggle Name Tags', keys: 'N' },
  { action: 'Toggle Settings', keys: 'Escape' },
  { action: 'Toggle Debug', keys: '` (Backquote)' }
];

type SettingsTab = 'audio' | 'keyboard';

export const createSettingsOverlay = (
  doc: Document,
  {
    initialAudioSettings,
    onAudioSettingsChange
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

  const tabs = doc.createElement('div');
  tabs.className = 'settings-tabs';

  const audioTabButton = doc.createElement('button');
  audioTabButton.type = 'button';
  audioTabButton.className = 'settings-tab';
  audioTabButton.textContent = 'Audio';

  const keyboardTabButton = doc.createElement('button');
  keyboardTabButton.type = 'button';
  keyboardTabButton.className = 'settings-tab';
  keyboardTabButton.textContent = 'Keyboard';

  tabs.append(audioTabButton, keyboardTabButton);

  const content = doc.createElement('div');
  content.className = 'settings-content';

  const audioSection = doc.createElement('section');
  audioSection.className = 'settings-section';
  audioSection.dataset.tab = 'audio';

  const audioTitle = doc.createElement('div');
  audioTitle.className = 'settings-subtitle';
  audioTitle.textContent = 'Sound';

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
  audioSection.append(audioTitle, audioList, muteRow);

  const keyboardSection = doc.createElement('section');
  keyboardSection.className = 'settings-section';
  keyboardSection.dataset.tab = 'keyboard';

  const keyboardTitle = doc.createElement('div');
  keyboardTitle.className = 'settings-subtitle';
  keyboardTitle.textContent = 'Keyboard (Read Only)';

  const keyboardHint = doc.createElement('div');
  keyboardHint.className = 'settings-hint';
  keyboardHint.textContent = 'Controls are fixed in this build.';

  const keyboardList = doc.createElement('div');
  keyboardList.className = 'settings-keyboard-list';
  for (const binding of KEYBOARD_ROWS) {
    const row = doc.createElement('div');
    row.className = 'settings-keyboard-row';
    const action = doc.createElement('span');
    action.className = 'settings-keyboard-action';
    action.textContent = binding.action;
    const keys = doc.createElement('span');
    keys.className = 'settings-keyboard-keys';
    keys.textContent = binding.keys;
    row.append(action, keys);
    keyboardList.append(row);
  }
  keyboardSection.append(keyboardTitle, keyboardHint, keyboardList);

  content.append(audioSection, keyboardSection);
  panel.append(title, tabs, content);
  overlay.append(panel);
  host.appendChild(overlay);

  const setTab = (tab: SettingsTab) => {
    audioTabButton.dataset.active = tab === 'audio' ? 'true' : 'false';
    keyboardTabButton.dataset.active = tab === 'keyboard' ? 'true' : 'false';
    audioSection.dataset.active = tab === 'audio' ? 'true' : 'false';
    keyboardSection.dataset.active = tab === 'keyboard' ? 'true' : 'false';
    audioSection.hidden = tab !== 'audio';
    keyboardSection.hidden = tab !== 'keyboard';
  };

  audioTabButton.addEventListener('click', () => setTab('audio'));
  keyboardTabButton.addEventListener('click', () => setTab('keyboard'));

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

  const setSensitivity = (_value: number) => {
    // Sensitivity is intentionally no longer configurable from settings.
  };

  const setMetricsVisible = (_visible: boolean) => {
    // Metrics visibility is intentionally no longer configurable from settings.
  };

  setTab('audio');
  setAudioSettings(audioSettings);

  const dispose = () => {
    overlay.remove();
  };

  return {
    element: overlay,
    isVisible,
    setVisible,
    toggle,
    setSensitivity,
    setMetricsVisible,
    setAudioSettings,
    dispose
  };
};
