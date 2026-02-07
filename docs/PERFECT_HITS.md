# Perfect Hits: Authoritative Decal Placement

## Goal

Stop bullet impacts/decals from appearing in mid-air or on the wrong surface (especially around corners).

## Root Cause

The client previously took server `ShotTraceFx` world-hit data and then re-ran local projection:

- `projectTraceWorldHit(...)`
- `projectImpactWorldHit(...)`

That local reprojection could snap to a different surface than the server-selected hit (or miss the intended wall), which created decal drift and occasional "air decals".

## Final Strategy

For authoritative world hits (`ShotTraceFx.hitKind == world`):

1. Use server `hitPos` directly.
2. Use server `normal` directly.
3. Apply a tiny normal offset (`0.005m`) to avoid z-fighting.
4. Do **not** run client reprojection for that hit.

For authoritative misses (`ShotTraceFx.hitKind == none`), existing client projection fallback stays available for visualization helpers.

For server world-hit resolution on building colliders:

5. If the selected world hit is an AABB building collider, the server now re-traces against the owning building mesh instance (`BVH`) within a small distance window.
6. If mesh snap succeeds, server replaces the world hit with the triangle hit (position + normal).
7. If mesh snap fails, server rejects the building AABB hit (`world_hit_source=\"mesh_snap_rejected\"`) to prevent mid-air decals from coarse rectangle-only contacts.

## Implementation

### Client runtime (`client/src/main.ts`)

- Added:
  - `AUTHORITATIVE_WORLD_HIT_SURFACE_OFFSET_METERS = 0.005`
- Changed event preprocessing:
  - Projection cache is now computed only for miss traces (`hitKind == 0`).
- Changed `ShotTraceFx` handling:
  - If `hitKind == 1` (world):
    - Impact/decal position = `trace.hitPos + normalize(trace.normal) * 0.005`
    - Impact/decal normal = `normalize(trace.normal)`
    - Skip `projectTraceWorldHit` and `projectImpactWorldHit`.
  - Sky-fade fallback logic no longer applies to authoritative world hits.

### Regression test (`client/tests/main.test.ts`)

Added test:

- `uses authoritative world hit coordinates for decals without client reprojection`

What it validates:

1. Injects a fake raycast result far away from server hit data.
2. Sends a world-hit `ShotTraceFx`.
3. Asserts spawned impact/decal positions remain near authoritative server hit coordinates (within tolerance), proving client reprojection is bypassed for world hits.

### Server runtime (`server/src/tick.cpp`)

- Added `TrySnapAabbWorldHitToMesh(...)`:
  - Maps `collider_id -> instance_id`.
  - Re-runs mesh/BVH hitscan against only that instance.
  - Uses `kShotMeshSnapMaxDeltaMeters = 0.35` as the allowed AABB-to-mesh correction window.
- Integrated into authoritative hitscan flow:
  - Runs after muzzle/near-corner selection and before final hit-kind resolution.
  - Converts AABB building hits to mesh hits when possible.
  - Drops unsnappable building AABB hits to avoid false floating impacts.

## Why this is conclusive

- The server is the single source of truth for world-hit resolution.
- Building hits now require a nearby triangle surface on the authoritative server path.
- Client-side mesh/raycast disagreement can no longer move world-hit decals to a different surface.
- Around-corner artifacts from local reprojection are eliminated for hitscan world hits.

## Operational notes

- Keep shot logging enabled when diagnosing:

```bash
AFPS_LOG_SHOTS=1 AFPS_SHOT_LOG_PATH=tmp/shot_debug.log ./tools/run_dev.sh --static
```

For strict mesh validation + shot logs while debugging corner shots:

```bash
AFPS_STRICT_COLLISION_MESH=1 \
AFPS_LOG_SHOTS=1 \
AFPS_SHOT_LOG_PATH=tmp/shot_debug.log \
./tools/run_dev.sh --static
```

- Recommended strict startup while iterating on collision meshes:

```bash
AFPS_STRICT_COLLISION_MESH=1 ./tools/run_dev.sh --static
```
