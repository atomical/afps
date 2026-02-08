# World Collision Meshes (Building Triangles + BVH)

This document describes the new mesh-collider data path used for world-hit debugging and decal-trace triage.

## Why this exists

Rectangle/compound AABB colliders are fast and stable for movement, but they can over-approximate building shapes. That mismatch can make a shot look like it should clear a wall corner while the coarse collider still reports a hit. The mesh path adds per-building triangle geometry so we can compare coarse AABB hits against real building surfaces.

## Current runtime behavior

- Movement + blocking collisions are still AABB-based (`afps::sim::CollisionWorld`).
- Authoritative hitscan world-hit resolution is backend-policy driven (`AFPS_WORLD_HIT_BACKEND`):
  - `mesh_only` (default): triangle/BVH authoritative for buildings, AABB fallback only for non-building world bounds (`collider_id <= 0`).
  - `hybrid`: prefer mesh/BVH when available, but allow AABB fallback for misses.
  - `aabb`: disable mesh/BVH world-hit resolution.
- Near-muzzle retry resolves ignored collider IDs to mesh instance IDs before retracing.
- Server shot debug logging also records a shadow detailed trace (`world_shadow`) for comparison.
- On server boot, registry validation auto-runs `tools/build_collision_meshes.mjs` if the file is missing/invalid or any prefab lacks explicit `triangles`.

## Data artifact

Collision mesh registry file:

- `shared/data/collision_meshes_v1.json`

Structure per prefab:

- `id`: prefab id (for example `building-type-c.glb`)
- `triangleCount`: triangle count for quick stats
- `surfaceType`: mapped to existing server surface FX
- `bounds.min/max`: local-space AABB in simulation coordinates
- `triangles`: local-space triangle list (`[[v0],[v1],[v2]]`)

The current generated dataset includes all `building-type-a..u.glb` prefabs.

## Coordinate convention

OBJ source assets are authored Y-up. Simulation space is Z-up.

Conversion used by the generator:

- `sim_x = obj_x * 2.5`
- `sim_y = obj_z * 2.5`
- `sim_z = obj_y * 2.5`

Scale `2.5` matches existing map placement scale (`kMapScale`) so mesh bounds align with placed building transforms.

## Generator tool

Script:

- `tools/build_collision_meshes.mjs`

Run:

```bash
node tools/build_collision_meshes.mjs
```

What it does:

1. Parses `building-type-a..u.obj` from `assets/environments/cc0/kenney_city_kit_suburban_20/Models/OBJ format/`.
2. Triangulates polygon faces (fan triangulation).
3. Converts vertices to simulation coordinates with map scale.
4. Drops degenerate triangles.
5. Computes local bounds and writes `shared/data/collision_meshes_v1.json`.

## Server integration points

- Registry loading + validation:
  - `server/src/main.cpp`
  - `server/src/world_collision_mesh.cpp`
- Static mesh instance transform export from map generation:
  - `server/src/map_world.cpp`
  - `server/src/map_world.h`
- Shot shadow detailed raycast + shot log output:
  - `server/src/tick.cpp`
  - `server/src/tick.h`

## Shot debug logging fields

Enable logging:

```bash
AFPS_WORLD_HIT_BACKEND=mesh_only AFPS_LOG_SHOTS=1 AFPS_SHOT_LOG_PATH=tmp/shot_debug.log ./tools/run_dev.sh
```

Per-shot JSON now includes:

- `world_hit_backend_mode`
- `world_shadow_checked`
- `world_shadow.hit`
- `world_shadow.distance`
- `world_shadow.instance_id`
- `world_shadow.prefab_id`
- `world_shadow.face_id`
- `world_shadow.position`
- `world_shadow.normal`
- `world_hit_source`

Use this to diagnose mid-air decals:

1. If authoritative world hit is true but `world_shadow.hit=false`, coarse collider likely overreached.
2. If both hit but positions differ significantly, compare `world_shadow.position` against player aim and building facade.
3. If `world_shadow.hit=true` and aligns visually, decal placement bug is likely client projection/render logic, not map collision data.

## Validation and tests

Coverage and parity checks are in:

- `server/tests/test_world_collision_mesh.cpp`

Key assertions:

- Bundled registry loads successfully.
- Registry covers prefabs used by both legacy and static map generation paths.
- Triangle payload is present and non-trivial across prefabs.

## Operational notes

- Override registry path with `AFPS_COLLISION_MESH_PATH`.
- Set `AFPS_STRICT_COLLISION_MESH=1` to fail fast when registry loading/parity validation fails at startup.
- Keep registry and map prefab ids in sync; startup validation checks this before serving.
- Auto-build requires `node` in PATH on the server host.

## Server run command (recommended)

```bash
AFPS_STRICT_COLLISION_MESH=1 \
AFPS_WORLD_HIT_BACKEND=mesh_only \
./server/build/afps_server --http --auth-token devtoken --host 0.0.0.0 --port 8443 --snapshot-keyframe-interval 5
```

With shot trace logging:

```bash
AFPS_STRICT_COLLISION_MESH=1 \
AFPS_WORLD_HIT_BACKEND=mesh_only \
AFPS_LOG_SHOTS=1 \
AFPS_SHOT_LOG_PATH=tmp/shot_debug.log \
./server/build/afps_server --http --auth-token devtoken --host 0.0.0.0 --port 8443 --snapshot-keyframe-interval 5
```
