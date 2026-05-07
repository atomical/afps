# Weapon Mount Editor

The project includes a standalone web editor for tuning weapon attachment offsets on character rigs.

## Run

From `client/`:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5173/editor.html
```

You can also use:

```bash
npm run dev:editor
```

## What It Edits

The editor reads/writes:

```text
client/public/assets/characters/ultimate_modular_men/weapon_mounts.json
```

Runtime still reads `manifest.json` for character discovery/model paths. Mount data is overlaid from `weapon_mounts.json`.

## Workflow

1. Pick a character and weapon.
2. Choose `Default Mount` or `Per-Weapon Override`.
3. Move/rotate/scale with transform gizmo (`W` / `E` / `R`) or numeric inputs.
   Undo the last mount edit with `Ctrl+Z` / `Cmd+Z` (or the `Undo` button).
4. Optionally change the right-hand bone name.
5. Use `Save to File` (dev server only) or copy/download JSON and commit it to the repo.

`Save to File` posts to a Vite dev-only endpoint and writes directly to:

```text
client/public/assets/characters/ultimate_modular_men/weapon_mounts.json
```

## Format

```json
{
  "entries": [
    {
      "characterId": "adventurer",
      "handBone": "Wrist.R",
      "weaponOffset": {
        "position": [0.04, 0.02, -0.02],
        "rotation": [0.0, 1.57, 0.0],
        "scale": 1.0
      },
      "weaponOffsetsById": {
        "LMG_556": {
          "position": [0.045, 0.022, -0.018],
          "rotation": [0.01, 1.57, 0.0],
          "scale": 1.02
        }
      }
    }
  ]
}
```

`weaponOffsetsById` is optional. When present, that weapon id uses the override instead of `weaponOffset`.
