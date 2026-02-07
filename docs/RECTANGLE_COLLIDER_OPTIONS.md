# Rectangle Collider Options

This document lists rectangle-based collider strategies for AFPS, with tradeoffs for movement blocking, hitscan/decal accuracy, and client/server parity.

## Current Baseline

- Collider shape: axis-aligned 3D boxes (`AABB`).
- Runtime storage: `CollisionWorld.colliders`.
- Authoritative raycast: `RaycastWorld(...)`.
- Main code paths:
  - `shared/sim/sim.h`
  - `server/src/map_world.cpp`
  - `client/src/environment/procedural_map.ts`

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

- Description: keep rectangle colliders authoritative for gameplay, but use visual mesh raycasts for decal projection.
- Pros:
  - preserves deterministic movement/combat.
  - improves decal placement without replacing collision core.
- Cons:
  - can still diverge when authoritative world says miss (`hitKind=None`).
  - requires careful fallback behavior and sync policy.
- Fit quality for decals: high.
- Multiplayer determinism for gameplay: high.
- Status in repo: partially implemented on client projection side.

## Recommended Path

- Short term:
  - standardize on compound AABB profiles for all building prefabs used in multiplayer maps.
  - ensure server and client consume the same map generator output and collider metadata.
  - use server-side dual-trace corner handling for hitscan (eye intent + muzzle obstruction + near-muzzle grace) to reduce false corner blocks with rectangle colliders.
- Medium term:
  - add dense compound profiles only for prefabs with known decal/movement issues.
  - keep hybrid mesh projection as visual fallback, not as authority.
- Long term:
  - consider OBB support only if compound AABB maintenance cost becomes too high.

## Decision Matrix

| Option | Runtime Cost | Authoring Cost | Fit Quality | Netcode Risk |
|---|---:|---:|---:|---:|
| Single AABB | 1 | 1 | 1 | 1 |
| Compound AABB | 2 | 3 | 3 | 1 |
| Rotated Profiles | 2 | 3 | 3 | 1 |
| Dense Compound AABB | 3 | 4 | 4 | 1 |
| Auto-Fitted AABB | 2 | 2 | 2-3 | 2 |
| OBB | 3-4 | 4 | 4 | 3 |
| Hybrid AABB + Mesh Decal | 2-3 | 3 | 4 (visual) | 2 |

Scale: `1` = lowest, `4` = highest.
