# Kenney Retro Urban Kit (CC0)

Source: https://opengameart.org/content/retro-urban-kit
License: CC0 1.0 Universal (see `LICENSE.txt`).

GLB assets live under `glb/` with shared textures in `glb/Textures/`.
Starter layout: `map.json` (placements + optional `seed`/`yawChoices` for random yaw).

## Editing guidelines for map.json
- Keep road tiles aligned on the 4m grid (`x`/`z` multiples of 4).
- Keep placements within the shared `arenaHalfSize` bounds.
- Use `VITE_DEBUG_RETRO_URBAN_BOUNDS=true` to visualize placement bounds.
- Use `VITE_DEBUG_RETRO_URBAN_GRID=true` to visualize the 4m grid.
