# Settings UI: Sensitivity + FX + Audio

This document describes the in-browser settings overlay for **look sensitivity**, **FX toggles**, **audio**, and **loadout attachments**, including persistence and runtime wiring. The feature is designed to be lightweight and resilient to invalid storage contents.

---

## Overview

The settings overlay provides:

- A slider to change look sensitivity at runtime.
- A toggle for the net stats overlay.
- FX toggles (muzzle flash, tracers, decals, aim debug).
- Attachment toggles (suppressor, compensator, optic, extended mag, grip).
- Audio sliders + mute.
- Persistent storage using `localStorage`.
- Live updates to the HUD, audio, and FX settings.

---

## UX Details

### Toggle

- **Key:** `~` (backquote)
- **Behavior:** toggles visibility of the debug overlays, including the settings panel
- **Implementation:** `window.addEventListener('keydown', ...)` in `client/src/main.ts`

### Sensitivity

- **Control:** range slider
- **Min:** `0.0005`
- **Max:** `0.01`
- **Step:** `0.0005`
- **Display:** 4 decimal places (e.g., `0.0040`)
- **Persistence:** saved in `localStorage` under `afps.look.sensitivity`

### Net Stats Toggle

- **Control:** checkbox
- **Label:** `Show net stats`
- **Persistence:** saved in `localStorage` under `afps.ui.showMetrics`
- **Behavior:** hides/shows the connection metrics line in the status overlay

### FX Toggles

- **Controls:** checkboxes for muzzle flash, tracers, decals, aim debug
- **Persistence:** saved in `localStorage` under `afps.fx.settings`
- **Behavior:** toggles cosmetic rendering only

### Attachments

- **Controls:** checkboxes for suppressor, compensator, optic, extended mag, grip
- **Persistence:** saved in `localStorage` under `afps.loadout.bits`
- **Behavior:** updates the loadout bitmask and syncs to the server

### Audio

- **Controls:** sliders for master, SFX, UI, music, plus mute
- **Persistence:** saved in `localStorage` under `afps.audio.settings`
- **Behavior:** updates audio manager volumes immediately

---

## Data Model

### Sensitivity Storage

- Storage key: `afps.look.sensitivity`
- Stored as a string, e.g. `"0.004"`
- Invalid or missing values fall back to defaults

### Net Stats Storage

- Storage key: `afps.ui.showMetrics`
- Stored as `"true"` / `"false"`
- Missing values default to `true`

### FX Settings Storage

- Storage key: `afps.fx.settings`
- Stored as JSON with boolean flags

### Loadout Storage

- Storage key: `afps.loadout.bits`
- Stored as a numeric bitmask string

### Audio Settings Storage

- Storage key: `afps.audio.settings`
- Stored as JSON with volume floats + `muted`

---

## Persistence Rules

### Sensitivity

- Load on startup using `loadSensitivity()`.
- Saved whenever the slider changes.
- `localStorage` value takes priority over `VITE_LOOK_SENSITIVITY`.

### Net Stats Toggle

- Load on startup using `loadMetricsVisibility()`.
- Save on checkbox change via `saveMetricsVisibility()`.

### FX Settings

- Load on startup using `loadFxSettings()`.
- Save on change via `saveFxSettings()`.

### Loadout Bits

- Load on startup using `loadLoadoutBits()`.
- Save on change via `saveLoadoutBits()`.

### Audio Settings

- Load on startup using `loadAudioSettings()`.
- Save on change via `saveAudioSettings()`.

---

## Integration Flow

### Startup

1. Load sensitivity, metrics, FX, audio, and loadout values from storage.
2. Create the settings overlay with loaded values.
3. Wire callbacks to update app/HUD/audio and persist changes.

### Runtime updates

- **Sensitivity change**:
  - `app.setLookSensitivity(value)`
  - `hud.setSensitivity(value)`
  - `saveSensitivity(value)`

- **Net stats toggle**:
  - `status.setMetricsVisible(visible)`
  - `saveMetricsVisibility(visible)`

- **FX settings**:
  - `saveFxSettings(next)`
  - `remoteAvatars.setAimDebugEnabled(next.aimDebug)`

- **Loadout bits**:
  - `saveLoadoutBits(nextBits)`
  - `sendLoadoutBits(nextBits)` (when connected)

- **Audio settings**:
  - `audio.setMuted(next.muted)`
  - `audio.setVolume('master' | 'sfx' | 'ui' | 'music', value)`
  - `saveAudioSettings(next)`

---

## Files & Responsibilities

### UI

- `client/src/ui/settings.ts`
  - Renders panel, slider, FX toggles, attachment toggles, audio controls.
  - Calls `onSensitivityChange`, `onShowMetricsChange`, `onFxSettingsChange`, `onAudioSettingsChange`, `onLoadoutBitsChange`.

### Storage

- `client/src/input/sensitivity.ts`
  - `loadSensitivity()`, `saveSensitivity()`
- `client/src/ui/metrics_settings.ts`
  - `loadMetricsVisibility()`, `saveMetricsVisibility()`
- `client/src/rendering/fx_settings.ts`
  - `loadFxSettings()`, `saveFxSettings()`
- `client/src/audio/settings.ts`
  - `loadAudioSettings()`, `saveAudioSettings()`
- `client/src/weapons/loadout.ts`
  - `loadLoadoutBits()`, `saveLoadoutBits()`

### Wiring

- `client/src/main.ts`
  - Loads saved values.
  - Creates the settings overlay.
  - Wires callbacks to app + HUD + audio + storage.

---

## Tests

- `client/tests/ui/settings.test.ts`
  - Slider updates
  - Toggle wiring
  - Audio slider wiring

- `client/tests/input/sensitivity.test.ts`
  - Save/load behavior

- `client/tests/ui/metrics_settings.test.ts`
  - Save/load behavior

- `client/tests/main.test.ts`
  - Settings callbacks wiring
  - Storage load/save integration

---

## Known Limitations

- Settings overlay is UI-only and does not change core keybindings.
