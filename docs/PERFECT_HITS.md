# Perfect Hits (Mesh-Authoritative)

## Goal

Prevent floating bullet decals and near-corner hit artifacts by making triangle surfaces authoritative for world-hit resolution.

## Root Cause Class

The old hybrid path could still select coarse building AABB hits in edge cases, then attempt to "snap" to mesh triangles. That left failure modes:

- `mesh_snap_rejected` (building hit dropped late)
- close-range/corner inconsistencies when ignore-collider retry logic did not have a mesh-instance mapping
- regressions when AABB fallback became dominant in a narrow branch

## New Strategy (Conclusive)

1. Building world hits are resolved from triangle BVH only.
2. AABB is broad-phase and non-building fallback only.
3. In `mesh_only` backend mode:
   - building AABB fallback is rejected
   - arena/floor fallback is still allowed (`collider_id <= 0`)
4. Near-muzzle retry now resolves `ignore_collider_id -> instance_id` before mesh trace, with a range-scan fallback if the direct lookup map misses.
5. Client world-hit decals keep using authoritative server `hitPos + normal * epsilon` and never reproject world hits.

## Runtime Controls

Server env var:

- `AFPS_WORLD_HIT_BACKEND=mesh_only|hybrid|aabb`

Default:

- `mesh_only`

Recommended for production/debug:

```bash
AFPS_STRICT_COLLISION_MESH=1 \
AFPS_WORLD_HIT_BACKEND=mesh_only \
AFPS_LOG_SHOTS=1 \
AFPS_SHOT_LOG_PATH=tmp/shot_debug.log \
./tools/run_dev.sh --static
```

Equivalent with explicit script flag:

```bash
AFPS_STRICT_COLLISION_MESH=1 \
AFPS_LOG_SHOTS=1 \
AFPS_SHOT_LOG_PATH=tmp/shot_debug.log \
./tools/run_dev.sh --static --world-hit-backend mesh_only
```

## What To Look For In Logs

`shot_debug` now includes:

- `world_hit_backend_mode`
- `world_hit_source`
- `world_final.backend`
- `world_final.instance_id`
- `world_final.prefab_id`
- `world_final.face_id`

Expected in robust mode:

- frequent `world_final.backend: "mesh_bvh"` for building hits
- no building-world-hit reliance on AABB fallback in `mesh_only`

## Files

- Server authoritative world-hit policy:
  - `server/src/tick.cpp`
- Collision mesh loading/validation:
  - `server/src/main.cpp`
  - `server/src/world_collision_mesh.cpp`
- Client authoritative world-hit decal placement:
  - `client/src/main.ts`

