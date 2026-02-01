import type { InputBindings } from '../input/sampler';
import { getPrimaryBinding, normalizeBindings, setPrimaryBinding } from '../input/bindings';

export interface SettingsOverlay {
  element: HTMLDivElement;
  isVisible: () => boolean;
  setVisible: (visible: boolean) => void;
  toggle: () => void;
  setSensitivity: (value: number) => void;
  dispose: () => void;
}

export interface SettingsOptions {
  initialSensitivity?: number;
  onSensitivityChange?: (value: number) => void;
  initialBindings?: InputBindings;
  onBindingsChange?: (bindings: InputBindings) => void;
}

const DEFAULT_SENSITIVITY = 0.002;
const MIN_SENSITIVITY = 0.0005;
const MAX_SENSITIVITY = 0.01;
const STEP_SENSITIVITY = 0.0005;

const clampSensitivity = (value: number) =>
  Math.min(MAX_SENSITIVITY, Math.max(MIN_SENSITIVITY, value));

const formatSensitivity = (value: number) => value.toFixed(4);

export const createSettingsOverlay = (
  doc: Document,
  { initialSensitivity, onSensitivityChange, initialBindings, onBindingsChange }: SettingsOptions = {},
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

  const bindingsTitle = doc.createElement('div');
  bindingsTitle.className = 'settings-subtitle';
  bindingsTitle.textContent = 'Keybinds';

  const bindingsList = doc.createElement('div');
  bindingsList.className = 'settings-bindings-list';

  bindingsGroup.append(bindingsTitle, bindingsList);

  panel.append(title, hint, group, bindingsGroup);
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
    ['dash', 'Dash']
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

  const dispose = () => {
    doc.removeEventListener('keydown', handleKeydown);
    overlay.remove();
  };

  return { element: overlay, isVisible, setVisible, toggle, setSensitivity, dispose };
};
