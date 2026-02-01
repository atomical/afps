# Rendering Plan (M0/M1)

This document describes the current rendering setup and the planned toon + outline pipeline.

---

## Current state (M0)

- Single Three.js scene with a cube and basic lighting.
- Camera is first-person-ish and follows the predicted position.
- No post-processing yet.
- Base toon material in place using `MeshToonMaterial` + a small gradient ramp texture.
- Renderer output color space is set to sRGB and tone mapping is disabled for consistent bands.

---

## Goals

- Stylized, readable visuals that reinforce hit feedback and player silhouettes.
- Consistent tonemapping/gamma across devices.
- Minimal GPU overhead in the baseline scene.

---

## Toon shading plan

### Approach

- Use `MeshToonMaterial` with a custom 1D gradient map:
  - Quantize N·L into 4 bands via a `DataTexture` ramp.
  - Keep it small (4x1), disable mipmaps, and use nearest filtering for crisp steps.
- Defer rim lighting until outline pass is settled.

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
- See `docs/OUTLINES.md` for a full tradeoff comparison.

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
