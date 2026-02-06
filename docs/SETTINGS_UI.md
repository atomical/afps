# Settings UI: Audio + Keyboard

The settings window now has two tabs:

- `Audio`: master, SFX, UI, music, and mute controls.
- `Keyboard`: read-only list of key bindings.

No gameplay preferences (sensitivity, net stats, FX toggles, or attachments) are editable in settings.

## Toggle

- Key: `Escape`
- Behavior: opens/closes the settings panel and releases pointer lock.

## Tabs

### Audio

- Sliders: `Master`, `SFX`, `UI`, `Music`
- Toggle: `Mute all`
- Persistence key: `afps.audio.settings`
- Runtime wiring in `client/src/main.ts`:
  - `audio.setMuted(...)`
  - `audio.setVolume('master' | 'sfx' | 'ui' | 'music', ...)`
  - `saveAudioSettings(...)`

### Keyboard

- Shows fixed bindings for movement, combat actions, UI toggles, and debug keys.
- Includes crouch (`C`) in the movement/action list.
- Bindings are display-only in this build.

## Files

- UI component: `client/src/ui/settings.ts`
- Styles: `client/src/style.css`
- Audio storage helpers: `client/src/audio/settings.ts`
- Main wiring: `client/src/main.ts`

## Tests

- `client/tests/ui/settings.test.ts`
- `client/tests/main.test.ts`
