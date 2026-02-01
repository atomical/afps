# Rendering Plan (M0/M1)

This document describes the current rendering setup and the planned toon + outline pipeline.

---

## Current state (M0)

- Single Three.js scene with a cube and basic lighting.
- Camera is first-person-ish and follows the predicted position.
- No post-processing yet; standard `MeshStandardMaterial`.

---

## Goals

- Stylized, readable visuals that reinforce hit feedback and player silhouettes.
- Consistent tonemapping/gamma across devices.
- Minimal GPU overhead in the baseline scene.

---

## Toon shading plan

### Approach

- Start with a custom `MeshToonMaterial` or a small shader variant that:
  - Quantizes N·L into 2–4 bands.
  - Adds a soft rim light term for readability.
- Keep roughness/metalness low to avoid noisy highlights.

### Pipeline steps

1. Choose toon material strategy (built-in vs. custom shader).
2. Lock tonemapping + gamma settings in renderer.
3. Add material presets for:
   - player mesh
   - weapon/arms
   - environment props

---

## Outlines plan

### Approach (recommended)

- Use `EffectComposer` + `OutlinePass` as a first pass.
- If performance is insufficient, migrate to a single-pass screen-space edge shader.

### Tuning

- Start with depth-based outlines only to avoid noisy normal edges.
- Calibrate thickness against target resolution and device pixel ratio.
- Reserve color accents for hit flash or team identification.

---

## Lighting & tone

- One strong key light + low ambient fill.
- Clamp exposure to avoid blown highlights.
- Ensure physically-correct lights + sRGB output are consistent with material choices.

---

## Testing & validation

- Shader compile sanity checks in CI (headless WebGL if possible).
- Snapshot tests for material configuration.
- Performance smoke test with baseline scene and budgeted frame time.

---

## Known gaps

- No post-processing chain wired yet.
- No asset pipeline (models/textures) defined yet.
- No GPU budget targets set.
