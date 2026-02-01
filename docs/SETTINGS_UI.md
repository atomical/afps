# Settings UI: Sensitivity + Keybinds

This document describes the in-browser settings overlay for **look sensitivity** and **keybinds**, including persistence and runtime wiring. The feature is designed to be lightweight, keyboard-friendly, and resilient to invalid storage contents.

---

## Overview

The settings overlay provides:

- A slider to change look sensitivity at runtime.
- A simple keybind editor (single binding per action).
- A toggle for the net stats overlay.
- Persistent storage using `localStorage`.
- Live updates to the input sampler and HUD.

The overlay is toggled with **`O`**. It sits above the canvas and does not block the core HUD or status overlay when hidden.

---

## UX Details

### Toggle

- **Key:** `O`
- **Behavior:** toggles visibility of the panel
- **Implementation:** `window.addEventListener('keydown', ...)` in `client/src/main.ts`

### Sensitivity

- **Control:** range slider
- **Min:** `0.0005`
- **Max:** `0.01`
- **Step:** `0.0005`
- **Display:** 4 decimal places (e.g., `0.0040`)
- **Persistence:** saved in `localStorage` under `afps.look.sensitivity`

### Keybinds

- **Actions:** `forward`, `backward`, `left`, `right`, `jump`, `sprint`, `dash`, `grapple`, `shield`, `shockwave`, `weaponSlot1`, `weaponSlot2`
- **Behavior:**
  - Click a button to start capture.
  - Press a key to assign the binding.
  - `Escape` cancels capture without changes.
- **Persistence:** stored in `localStorage` under `afps.input.bindings` as JSON.

### Net Stats Toggle

- **Control:** checkbox
- **Label:** `Show net stats`
- **Persistence:** saved in `localStorage` under `afps.ui.showMetrics`
- **Behavior:** hides/shows the connection metrics line in the status overlay.

---

## Data Model

### Bindings Shape

```json
{
  "forward": ["KeyW", "ArrowUp"],
  "backward": ["KeyS", "ArrowDown"],
  "left": ["KeyA", "ArrowLeft"],
  "right": ["KeyD", "ArrowRight"],
  "jump": ["Space"],
  "sprint": ["ShiftLeft", "ShiftRight"],
  "dash": ["KeyE"],
  "grapple": ["KeyQ"],
  "shield": ["KeyF"],
  "shockwave": ["KeyR"],
  "weaponSlot1": ["Digit1"],
  "weaponSlot2": ["Digit2"]
}
```

- The UI currently uses **only the primary binding** (`[0]`) when rendering.
- The sampler supports lists, but the settings UI edits a single value per action.

### Sensitivity Storage

- Storage key: `afps.look.sensitivity`
- Stored as a string, e.g. `"0.004"`
- Invalid or missing values fall back to defaults.

### Net Stats Storage

- Storage key: `afps.ui.showMetrics`
- Stored as `"true"` / `"false"`
- Missing values default to `true`.

---

## Persistence Rules

### Bindings

- Load on startup using `loadBindings()`.
- Normalize using `normalizeBindings()` (dedupe, fallback if invalid).
- Save on update via `saveBindings()`.

### Sensitivity

- Load on startup using `loadSensitivity()`.
- Saved whenever the slider changes.
- `localStorage` value takes priority over `VITE_LOOK_SENSITIVITY`.

### Net Stats Toggle

- Load on startup using `loadMetricsVisibility()`.
- Save on checkbox change via `saveMetricsVisibility()`.

---

## Integration Flow

### Startup

1. Load bindings from storage.
2. Load sensitivity from storage (fallback to env).
3. Create the settings overlay with loaded values.
4. Create input sampler using loaded bindings.

### Runtime updates

- **Sensitivity change**:
  - `app.setLookSensitivity(value)`
  - `hud.setSensitivity(value)`
  - `saveSensitivity(value)`

- **Bindings change**:
  - `saveBindings(bindings)`
  - `sampler.setBindings(bindings)`

---

## Files & Responsibilities

### UI

- `client/src/ui/settings.ts`
  - Renders panel, slider, and keybind rows.
  - Captures key presses for rebinding.
  - Calls `onSensitivityChange` and `onBindingsChange` callbacks.

### Storage

- `client/src/input/bindings.ts`
  - `normalizeBindings()`, `loadBindings()`, `saveBindings()`
  - `setPrimaryBinding()`, `getPrimaryBinding()`

- `client/src/input/sensitivity.ts`
  - `loadSensitivity()`, `saveSensitivity()`
- `client/src/ui/metrics_settings.ts`
  - `loadMetricsVisibility()`, `saveMetricsVisibility()`

### Wiring

- `client/src/main.ts`
  - Loads saved values.
  - Creates sampler and settings overlay.
  - Wires callbacks to app + HUD + storage.

---

## Tests

- `client/tests/ui/settings.test.ts`
  - Slider updates
  - Key capture workflow (including Escape)

- `client/tests/input/bindings.test.ts`
  - Normalization
  - Save/load behavior

- `client/tests/input/sensitivity.test.ts`
  - Save/load behavior

- `client/tests/main.test.ts`
  - Settings callbacks wiring
  - Storage load/save integration
- `client/tests/ui/metrics_settings.test.ts`
  - Save/load behavior

---

## Known Limitations

- Only one binding per action (secondary bindings are not exposed in the UI).
- No conflict detection (same key can be assigned to multiple actions).
- Mouse buttons and wheel are not supported in binding capture.
- Bindings UI is not disabled while pointer lock is active.

---

## Future Improvements

- Secondary keybind slots per action.
- Conflict detection + warning UI.
- Mouse button rebinding (e.g., fire/alt fire).
- Expose keybind for toggling net stats without opening settings.
- Expose per-axis sensitivity or acceleration.
