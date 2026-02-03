# Pre-Join Flow + Character Catalog

This project now includes a pre-join flow that requires a nickname + character selection before a player enters a match. Selections are stored locally and sent to the server during the handshake.

## Player Profile Persistence

Client-side storage key:

- `afps.playerProfile`

Stored shape:

```json
{
  "nickname": "PilotName",
  "characterId": "casual-male-a"
}
```

## Character Catalog Manifest

The character selector is driven by a manifest file that lives in the public assets tree:

```
client/public/assets/characters/ultimate_modular_men/manifest.json
```

If the manifest is missing or invalid, the UI falls back to placeholders so the game can still boot.

You can regenerate the manifest automatically from the asset folder with:

```
python3 tools/generate_character_manifest.py
```

### Manifest Schema

```json
{
  "defaultId": "casual-male-a",
  "entries": [
    {
      "id": "casual-male-a",
      "displayName": "Casual Male A",
      "modelUrl": "/assets/characters/ultimate_modular_men/models/Adventurer.glb",
      "handBone": "RightHand",
      "weaponOffset": {
        "position": [0.03, 0.01, -0.02],
        "rotation": [0.0, 1.57, 0.0],
        "scale": 1.0
      }
    }
  ]
}
```

Fields:
- `id` (string, required): Stable key used in network replication.
- `displayName` (string, optional): Friendly label used in the pre-join UI.
- `modelUrl` (string, optional): Path to the rigged model asset (GLB/GLTF preferred).
- `skinUrl` (string, optional): Path to a texture/skin to apply to the rig.
- `previewUrl` (string, optional): UI preview image.
- `handBone` (string, optional): Overrides the default right-hand bone lookup.
- `weaponOffset` (object, optional): Local offsets to align the weapon in the hand.

## Expected Asset Layout (Kenney Animated Characters 1)

Suggested structure (not enforced, but matches the manifest paths above):

```
client/public/assets/characters/ultimate_modular_men/
  manifest.json
  models/
    characterMedium.glb
  animations/
    idle.glb
    run.glb
    jump.glb
  skins/
    casualMaleA.png
    casualFemaleA.png
  previews/
    casualMaleA.png
```

Adjust `modelUrl`, `skinUrl`, and `previewUrl` to match the actual filenames you add.

## Server Validation

Nickname rules (server-authoritative):
- Trimmed length 3–16 characters.
- Allowed characters: letters, numbers, space, `_`, `-`.
- Invalid values are replaced with a safe default like `Player0001`.

Character id rules:
- Trimmed length 1–32 characters.
- Allowed characters: letters, numbers, `_`, `-`.
- Invalid values fall back to `default`.
- If the server is configured with a character manifest allowlist (or detects the default manifest on disk), any unknown id also falls back to `default`.
