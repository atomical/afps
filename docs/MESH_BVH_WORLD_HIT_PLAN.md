# Mesh/BVH World-Hit Plan

This plan implements option `1` as a production path: keep AABB colliders for movement/gameplay broadphase, then add mesh/BVH narrow-phase for authoritative world shot hits and decal placement.

## Scope

- In scope:
  - Authoritative world-hit precision improvements for hitscan/projectile impact points.
  - Decal placement parity across clients from server-authoritative world hits.
  - Corner-firing behavior improvements without introducing non-deterministic gameplay.
  - Detailed logging/telemetry for triage of floating decals.
- Out of scope:
  - Replacing movement collision with mesh collision.
  - Full physics engine integration.
  - Dynamic/destructible geometry.

## Implementation Status (Current)

- Completed:
  - `CollisionMeshRegistry` loader with per-prefab triangle support and BVH build.
  - Map world export of deterministic static mesh instance transforms.
  - Server startup parity validation against map-used prefab ids.
  - Server startup auto-build of collision mesh registry when missing/invalid/non-triangle.
  - Shot debug shadow detailed world-hit trace (`world_shadow`) logged in per-shot JSON.
  - Hitscan authoritative world-hit path switched to hybrid AABB+mesh, with mesh used for building surface hit points/normals.
  - OBJ extraction pipeline for all suburban building prefabs via `tools/build_collision_meshes.mjs`.
  - Bundled registry populated with real triangles for `building-type-a..u.glb`.
- Not yet switched:
  - Client decal anchoring still requires follow-up work to consume detailed authoritative metadata.

## Current Baseline (as of this plan)

- World collision authority is AABB-based in `shared/sim/sim.h` via `RaycastWorld(...)` and `CollisionWorld.colliders`.
- Building collider profiles are authored as compound AABBs in:
  - `server/src/map_world.cpp`
  - `client/src/environment/procedural_map.ts`
- Client decal projection uses scene raycasts plus fallback bounding-box raycasts in `client/src/main.ts` (`createWorldSurfaceProjector`).
- Server shot-debug logs exist in `server/src/tick.cpp` behind:
  - `AFPS_LOG_SHOTS=1`
  - `AFPS_SHOT_LOG_PATH=...`

## Problem Statement

AABB colliders are sufficient for movement and coarse hit blocking, but they over-approximate visual geometry at corners, roof transitions, and recessed facades. This creates two classes of defects:

1. Authoritative world hit can be physically valid for AABB but visually detached from the rendered facade.
2. Client-side projection fallback can recover to the wrong surface, causing floating or roof-shifted decals.

For corner shots, over-broad near-muzzle AABB contact can also over-block intended shots.

## Target Outcome

1. Server authoritative `HitKind::World` points land on actual renderable building surfaces (or deterministic simplified collision meshes), not coarse AABB shells.
2. Client decals use authoritative surface anchors and stop relying on heuristic reprojection for primary path.
3. Static and procedural maps both achieve parity for all building prefabs in use.
4. Corner-firing reliability improves while preserving anti-wallbang behavior.

## Architecture

### Hybrid Collision Model

- Keep current AABB `CollisionWorld` as:
  - movement collision source
  - spawn blocking source
  - broadphase candidate source for world-hit rays
- Add collision mesh narrow-phase as:
  - authoritative world-hit refinement for shots
  - optional client local debug/reprojection support

### New Runtime Components

- `CollisionMeshRegistry` (client + server):
  - maps prefab id (for example `building-type-c.glb`) to triangle mesh payload.
  - stores per-prefab local-space BVH.
- `WorldCollisionInstanceIndex` (client + server):
  - one entry per placed static mesh instance with deterministic transform.
  - includes world AABB for broadphase and pointer to prefab BVH.
- `RaycastWorldDetailed(...)`:
  - broadphase: intersect ray with existing world AABB candidates.
  - narrow-phase: triangle/BVH raycast on candidate instances.
  - returns nearest valid hit with position, normal, distance, collider/instance identifiers.

### Determinism Model

- Authoritative hit resolution remains server-side.
- Client uses authoritative hit payload for decal spawn.
- Any client-side mesh raycast is diagnostic or fallback only.
- Instance ordering for tie-breaks is deterministic (stable sort by `instanceId`, then distance epsilon).

## Data + Asset Pipeline

### Collision Mesh Asset Format (`v1`)

Create a generated artifact, committed to repo, for deterministic parity:

- Suggested path:
  - `shared/data/collision_meshes_v1.json` (initial)
  - optional future binary upgrade `shared/data/collision_meshes_v1.bin`
- Record shape:
  - `version`
  - `sourceAssetPack`
  - `mapScale`
  - `coordConvention`
  - `prefabs[]` entries:
    - `id` (for example `building-type-a.glb`)
    - `triangles` (local-space vertices)
    - `bounds` (local AABB)
    - `surfaceType`
    - `triangleCount`

### Mesh Extraction Tool

Add generator tool:

- `tools/build_collision_meshes.mjs` (Node + built-in modules only).
- Input:
  - Kenney suburban building OBJ files from existing assets tree.
  - optional manual overrides for excluding decorative submeshes.
- Output:
  - normalized triangle soup in prefab local space.
  - welded/cleaned triangles.
  - deduplicated vertices.

### Authoring Constraints

- Every building prefab currently selectable by map generators must have a collision mesh entry.
- If a prefab is missing:
  - hard fail in CI map-parity tests (not silent fallback).
- Rotation/scaling:
  - apply world transform at instance level.
  - preserve existing map scale (`MAP_SCALE`) parity between client/server.

## Server Implementation Plan

### Phase S1: Core Types + Loader

- Add `server/src/world_collision_mesh.h/.cpp`:
  - mesh data structs
  - BVH node structs
  - loader for `shared/data/collision_meshes_v1.json`
- Add deterministic startup validation:
  - verify all map-used building ids exist in registry.
  - log loaded prefab count and checksum.

### Phase S2: Instance Index Build

- During map world generation in `server/src/map_world.cpp`:
  - keep existing AABB colliders.
  - additionally emit deterministic static mesh instances (prefab id + transform + instanceId).
- Add `WorldCollisionInstanceIndex` build during server boot/map build.

### Phase S3: Detailed Raycast Path

- In `server/src/tick.cpp`, integrate:
  - `ResolveWorldHitscanDetailed(...)` used for shot world-hit resolution.
  - broadphase filter using existing AABB ray hits and nearby instance AABBs.
  - narrow-phase BVH intersection for final exact surface hit.
- Keep existing dual-trace corner logic, but switch traces to detailed world-hit API:
  - eye intent trace
  - muzzle obstruction trace
  - near-muzzle grace retrace

### Phase S4: Projectile Impact Parity

- Use the same detailed world-hit helper for projectile world impacts (where applicable).
- Ensure `ProjectileImpactFx` uses detailed surface normal when `hit_world=true`.

### Phase S5: Logging

Extend shot JSON in `server/src/tick.cpp` with detailed fields:

- `world_final.hit_backend`: `"aabb" | "mesh_bvh"`
- `world_final.instance_id`
- `world_final.prefab_id`
- `world_final.triangle_id`
- `world_final.barycentric` (`u,v,w`)
- `world_final.distance_aabb` vs `distance_detailed` (if both evaluated)

Keep existing env flags:

- `AFPS_LOG_SHOTS=1`
- `AFPS_SHOT_LOG_PATH=tmp/shot_debug.log`

## Client Implementation Plan

### Phase C1: Scene Surface Index

- Extract projector code from `client/src/main.ts` into:
  - `client/src/world/world_surface_projector.ts`
- Build static-surface registry at map load:
  - mesh uuid -> instance metadata (prefab id, transform, instanceId)

### Phase C2: BVH Narrow-Phase Support

- Build client-side `CollisionMeshRegistry` and `WorldCollisionInstanceIndex` from same data file.
- Use BVH narrow-phase for debug-only cross-checks and optional fallback.
- Keep existing raycaster path as backup until parity proven.

### Phase C3: Decal Spawn Source of Truth

- For `ShotTraceFx` world hits:
  - primary decal position/normal = server authoritative `hitPos + normal`.
  - skip heuristic projection unless explicit fallback condition triggers.
- For fallback conditions (for example malformed payload), run projector and annotate telemetry with fallback reason.

### Phase C4: Telemetry

Extend `window.__afpsProjectionTelemetry` records with:

- `authoritativeSource`: `"server_world_hit" | "fallback_projection"`
- `serverDetailedMeta` (`instanceId`, `prefabId`, `triangleId` when present)
- `fallbackReason`

## Protocol Updates

### Minimal Required

Current hit payload already carries quantized world position and normal. Keep this path.

### Optional Stronger Anchoring (recommended)

Extend `ShotTraceFx` and `ProjectileImpactFx` with optional fields:

- `world_instance_id` (u32)
- `world_triangle_id` (u32)
- `world_bary_u_q`, `world_bary_v_q` (quantized)

Rationale:

- Enables exact client-side reconstruction if needed.
- Improves debugging when position/normal seem inconsistent.

Compatibility:

- Treat fields as optional/default zero.
- Older clients continue using position/normal.

## Corner-Firing Behavior

Keep and refine existing policy from `docs/SHOOTING_AROUND_CORNERS.md`:

- maintain dual-trace + near-muzzle grace architecture.
- replace AABB-only world traces with detailed narrow-phase where available.
- keep anti-wallbang behavior by requiring real obstruction along muzzle->target span.

Tuning knobs (server constants/env):

- `kShotMuzzleOffsetMeters`
- `kShotNearMuzzleGraceMeters`
- `kShotRetraceEpsilonMeters`
- new optional: `kDetailedTraceEpsilonMeters`

## Feature Flags + Rollout

### Runtime Flags

- Server:
  - `AFPS_WORLD_HIT_BACKEND=aabb|hybrid|mesh_only`
  - default: `hybrid`
- Client:
  - `VITE_WORLD_SURFACE_BACKEND=raycaster|hybrid`
  - default: `hybrid` after parity signoff

### Rollout Stages

1. Stage A: logging only, no behavior changes (`aabb` authoritative, detailed shadow-run metrics).
2. Stage B: hybrid authoritative on canary seeds/maps.
3. Stage C: default hybrid for static + procedural maps.
4. Stage D: remove legacy projection heuristics that are no longer needed.

## Validation and Test Plan

### Unit Tests

- `shared/sim` or server unit tests:
  - BVH raycast hit correctness on known triangles.
  - deterministic tie-break behavior.
- map/prefab tests:
  - every active building prefab resolves to mesh metadata.

### Integration Tests (Server)

- deterministic shot traces against known map fixtures:
  - facade hit at first-floor point-blank no longer resolves to roof.
  - corner shot with muzzle grace behaves correctly.

### Client Tests

- `client/tests/main.test.ts`:
  - world-hit FX path prefers authoritative point and bypasses projection fallback.
- `client/tests/ui/decal_projection.spec.ts`:
  - add cases validating first-floor close-range wall impact for problematic prefabs.
  - validate no sky decal when authoritative hit is world facade.

### Cross-Mode Parity Tests

- static generator + advanced generator parity checks:
  - all placed building prefab ids have mesh metadata.
  - transform parity between server and client instance index.

### Performance Tests

- target budgets (initial, tune after profiling):
  - 128x128 map equivalent static set: detailed world trace p95 <= 0.25 ms/shot on dev machine.
  - no measurable regression in tick loop at current player counts.

## Operational Debugging Workflow

When a floating decal is reported:

1. Run with logging:
   - `AFPS_LOG_SHOTS=1 AFPS_SHOT_LOG_PATH=tmp/shot_debug.log ./tools/run_dev.sh`
2. Reproduce with debug overlay.
3. Inspect last entries for:
   - `world_final.hit_backend`
   - `world_final.prefab_id`, `instance_id`, `triangle_id`
   - `world_hit_source`
   - fallback usage on client telemetry
4. Classify issue:
   - metadata gap
   - transform/parity mismatch
   - fallback path bug
   - quantization/normal mismatch

## Risks and Mitigations

- Risk: mesh metadata drift from actual GLBs.
  - Mitigation: generated file checksum + CI validation script.
- Risk: server perf regression with many instances.
  - Mitigation: AABB broadphase + per-instance BVH + early-exit nearest hit.
- Risk: client/server parity mismatch in transforms.
  - Mitigation: shared transform derivation helpers and parity tests on prefab-instance hashes.
- Risk: protocol churn.
  - Mitigation: optional fields only, backward-compatible decode.

## Deliverables Checklist

- Code:
  - collision mesh registry and BVH on server/client
  - detailed world-hit integration in shot + projectile paths
  - fallback policy simplification for decals
- Tooling:
  - collision mesh extraction/build script
- Logging:
  - extended shot debug JSON with detailed metadata
- Tests:
  - unit, integration, UI, parity, perf sanity
- Docs:
  - this plan
  - update `docs/WEAPONS.md`
  - update `docs/NETCODE.md`
  - update `docs/RECTANGLE_COLLIDER_OPTIONS.md`
  - update `README.md` debug section

## Execution Order (recommended)

1. Build mesh metadata pipeline and commit generated artifact.
2. Implement server detailed raycast shadow mode + telemetry.
3. Validate on reproducible seeds and problematic prefabs.
4. Flip server authoritative world-hit to hybrid backend.
5. Simplify client decal path to trust authoritative world hits.
6. Tighten tests and remove obsolete projection heuristics.
