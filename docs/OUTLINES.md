# Outline Approaches (Options + Tradeoffs)

This document captures the outline rendering options for the stylized look
and their tradeoffs in a browser FPS context.

---

## Option 1: Post-process edge detection (depth + normals)

**Approach**
- Render depth + normal buffers, then run a screen-space edge filter.

**Pros**
- Global coverage: outlines apply to all geometry in one pass.
- Uniform thickness control (consistent across the scene).
- Easy to extend for silhouettes, team colors, or hit flash.

**Cons**
- Requires post-processing and extra buffers (higher GPU cost).
- Can produce noisy edges on dense geometry without careful thresholds.
- More sensitive to resolution scaling; can shimmer at low resolutions.

**Notes**
- Best for broad environment outlines if budget allows.
- Needs tuning to avoid outlining small surface details.

---

## Option 2: Three.js OutlinePass (selective)

**Approach**
- Use EffectComposer + OutlinePass on a selected set of meshes.

**Pros**
- Quick to integrate and iterate.
- Selective: outline only important meshes (players/weapons).
- Straightforward to set per-object colors (team IDs, hit flash).

**Cons**
- Still a multi-pass render; cost scales with resolution.
- Requires managing the selection list every frame.
- Can miss fine detail at distance or appear soft/blurred.

**Notes**
- Good first implementation for player + weapon outlines.
- Works well as a stopgap before custom edge shaders.

---

## Option 3: Inverted hull (per-mesh)

**Approach**
- Duplicate mesh with flipped normals and expand along vertex normals.
- Render the hull in a solid outline color behind the original mesh.

**Pros**
- No post-processing cost (very cheap at runtime).
- Crisp, stable outlines that track the mesh precisely.
- Great for hero assets (hands, weapons, player mesh).

**Cons**
- Requires per-asset setup (extra meshes or shader variants).
- Breaks if scaling/LOD changes are not handled carefully.
- Not suitable for outlining the entire environment without extra work.

**Notes**
- Best for weapon/arms where crisp edges matter most.
- Use with care if models are dynamically scaled.

---

## Comparison summary

| Option | Coverage | Setup cost | Runtime cost | Best use case |
| --- | --- | --- | --- | --- |
| Post-process (depth+normal) | Global | Medium | High | Environment-wide silhouettes |
| OutlinePass (selective) | Selected meshes | Low | Medium | Players/weapons, fast iteration |
| Inverted hull | Per-asset | High | Low | Weapons/arms, hero meshes |

---

## Recommendation (baseline)

- Start with **OutlinePass (selective)** on player + weapon for quick iteration.
- Add **inverted hull** for weapon/arms if the outline needs to be crisper.
- Only adopt **depth+normal post-process** if the art direction demands
  scene-wide silhouettes and the perf budget allows it.
