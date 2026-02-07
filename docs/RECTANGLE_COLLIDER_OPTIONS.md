# Rectangle Collider Options

This document lists rectangle-based collider strategies for AFPS, with tradeoffs for movement blocking, hitscan/decal accuracy, and client/server parity.

## Current Baseline

- Collider shape: axis-aligned 3D boxes (`AABB`).
- Runtime storage: `CollisionWorld.colliders`.
- Authoritative world hitscan raycast: hybrid AABB + mesh/BVH.
- Movement blocking raycast/sweep: AABB.
- Main code paths:
  - `shared/sim/sim.h`
  - `server/src/map_world.cpp`
  - `server/src/tick.cpp`
  - `client/src/environment/procedural_map.ts`

## Runtime Today

- Player movement and collision response remain AABB-based.
- Authoritative hitscan world hit uses:
  - AABB broadphase/fallback.
  - Mesh/BVH narrow-phase for final building surface hit point/normal.
  - AABB building hit -> mesh snap pass; if no nearby triangle is found, the server rejects that building AABB hit to avoid mid-air decals.
- Near-muzzle corner retry supports ignoring either:
  - `ignore_collider_id` (AABB), or
  - mapped mesh `instance_id` (mesh/BVH path).

## Option 1: Single AABB Per Building

- Description: one rectangle prism per building footprint.
- Pros:
  - simplest authoring and fastest runtime.
  - lowest memory.
- Cons:
  - weak fit for irregular prefabs.
  - decals/hits often feel offset at corners and overhangs.
  - easier to get stuck/clip near protrusions.
- Fit quality: low.
- Multiplayer determinism: high (if both sides use same map/collider source).

## Option 2: Compound AABB (Multiple Rectangles Per Building)

- Description: each building uses 2..N rectangle parts for tighter blocking.
- Pros:
  - large quality jump vs single box.
  - still very fast; keeps simple broadphase.
  - works with existing `CollisionWorld` and raycast code.
- Cons:
  - manual profile authoring per prefab.
  - still approximate on diagonals/curves.
- Fit quality: medium-high.
- Multiplayer determinism: high.
- Status in repo: implemented for many building prefabs.

## Option 3: Rotated Profiles by Building Facing (Still AABB World)

- Description: rotate local profile parts by door/facing before inserting world AABBs.
- Pros:
  - keeps one profile source for multiple orientations.
  - better alignment than static orientation profiles.
- Cons:
  - after rotation, world-axis boxing still inflates some shapes.
- Fit quality: medium-high.
- Multiplayer determinism: high.
- Status in repo: implemented.

## Option 4: Dense Compound AABB (Per-Floor / Facade Segmentation)

- Description: increase rectangle count to model floor split, wing offsets, porch gaps.
- Pros:
  - best possible fit while staying AABB-only.
  - improves close-range facade hit reliability.
- Cons:
  - higher authoring overhead.
  - higher collider count increases raycast and movement cost.
- Fit quality: high.
- Multiplayer determinism: high.
- Recommended use: problematic prefabs only, not all prefabs.

## Option 5: Runtime Auto-Fitted AABB Sets from Mesh Bounds

- Description: derive rectangle parts from mesh or mesh-part bounds at load/build time.
- Pros:
  - reduces manual metadata work.
  - can scale to large asset sets.
- Cons:
  - bounds-driven fit may include empty space.
  - requires deterministic extraction pipeline for server/client parity.
- Fit quality: medium (varies by asset topology).
- Multiplayer determinism: medium-high if extraction is offline and versioned.

## Option 6: OBB (Oriented Rectangle Prism)

- Description: rectangles can rotate in world space (not axis-aligned).
- Pros:
  - tighter fit for angled assets with fewer primitives.
  - still rectangle-based collision.
- Cons:
  - requires new sweep/raycast support beyond current AABB-only sim.
  - more math and testing surface.
- Fit quality: high.
- Multiplayer determinism: high after full server/client implementation.
- Status in repo: not implemented.

## Option 7: Hybrid (AABB For Movement, Mesh/BVH For Decal Placement)

- Description: keep rectangle colliders for movement/broadphase, but use mesh/BVH for authoritative world-hit surface resolution.
- Pros:
  - preserves deterministic movement and broadphase simplicity.
  - improves close-range corner shots and facade-aligned impacts.
  - improves server authoritative hit points for synced decals.
- Cons:
  - requires prefab triangle registry and BVH build pipeline.
  - still needs AABB fallback handling for non-building geometry.
- Fit quality for decals/hits: high.
- Multiplayer determinism for gameplay: high.
- Status in repo: implemented for authoritative hitscan world-hit resolution.

## Option 8: Full Mesh Collision For Movement (Not Recommended Now)

- Description: replace movement collision with triangle mesh collision.
- Pros:
  - best geometric fidelity.
- Cons:
  - highest CPU cost and implementation risk.
  - larger determinism/testing surface.
  - unnecessary for current gameplay goals.
- Fit quality: highest.
- Multiplayer determinism: medium-high after heavy validation.
- Status in repo: not implemented.

## Recommended Path

- Short term:
  - keep compound AABB for movement collision and spawn blocking.
  - keep authoritative hitscan on hybrid AABB + mesh/BVH path.
  - keep triangle registry complete for all building prefabs.
- Medium term:
  - add focused dense compound AABB profiles only for movement snag hotspots.
  - continue improving mesh-instance retry/ignore telemetry and tests.
- Long term:
  - consider OBB or full mesh movement only if AABB movement quality becomes unacceptable.

## Decision Matrix

| Option | Runtime Cost | Authoring Cost | Fit Quality | Netcode Risk |
|---|---:|---:|---:|---:|
| Single AABB | 1 | 1 | 1 | 1 |
| Compound AABB | 2 | 3 | 3 | 1 |
| Rotated Profiles | 2 | 3 | 3 | 1 |
| Dense Compound AABB | 3 | 4 | 4 | 1 |
| Auto-Fitted AABB | 2 | 2 | 2-3 | 2 |
| OBB | 3-4 | 4 | 4 | 3 |
| Hybrid AABB + Mesh/BVH Hit | 2-3 | 3 | 4 | 2 |
| Full Mesh Movement | 4 | 4 | 5 | 4 |

Scale: `1` = lowest, `5` = highest.
