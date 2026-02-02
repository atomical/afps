# Rendering Plan (M0/M1)

This document describes the current rendering setup and the planned toon + outline pipeline.

---

## Current state (M0)

- Single Three.js scene with a cube and basic lighting.
- Camera is first-person-ish and follows the predicted position.
- No post-processing yet.
- Base toon material in place using `MeshToonMaterial` + a small gradient ramp texture.
- Renderer output color space is set to sRGB and tone mapping is disabled for consistent bands.
- OutlinePass is wired for the cube as a baseline silhouette.
- OutlinePass starts with reduced edge strength/thickness and a 2x downsample ratio to reduce noise.
- Outline colors are assigned per team (one OutlinePass per team), with a short hit-flash on confirm.
- Background is a sand tone with warm ambient + key light for a sunny-day feel.

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
- Client perf budgets live in `client/perf/budgets.json` and are enforced via `npm run perf:check`.
- Use `PERF_BUDGET_SCALE=1.5` to relax budgets on slower machines.

---

## Known gaps

- No additional post-processing beyond outlines.
- No asset pipeline (models/textures) defined yet.
- GPU budget targets should be refined once we have a representative scene.
