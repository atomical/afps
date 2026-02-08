# Shooting Around Corners

This document describes the authoritative server-side firing update that reduces false world blocks when peeking corners.

## Problem

With rectangle (`AABB`) world colliders, shots can be blocked by the nearest building collider close to the shooter, even when the player is aiming around the corner.

## Solution

The server now uses a dual-trace decision for hitscan world blocking:

1. `Trace A (intent)`:
- Origin: eye/camera origin from rewound shooter pose.
- Direction: authoritative spread-applied shot direction.
- Purpose: compute intended world impact distance.

2. `Trace B (obstruction)`:
- Origin: muzzle origin (`eye + dir * muzzle_offset`).
- Direction: same shot direction.
- Max distance: intended distance from Trace A (or weapon range if Trace A misses).
- Purpose: detect real obstruction between muzzle and intended target.

3. Near-muzzle grace:
- If Trace B blocks within `kShotNearMuzzleGraceMeters`:
- Retry Trace B once while ignoring the first blocking surface and applying a `min_t` floor.
- For AABB hits this uses `ignore_collider_id`; for mesh/BVH hits this uses mapped `instance_id` ignore.
- If retry reaches intended distance, the near block is treated as corner self-occlusion noise and ignored.
- Otherwise the shot is blocked by the retry hit.

## Current tuning (server constants)

In `server/src/tick.cpp`:

- `kShotMuzzleOffsetMeters = 0.2`
- `kShotNearMuzzleGraceMeters = 0.22`
- `kShotRetraceEpsilonMeters = 0.02`

These are conservative defaults for AABB-heavy maps.

## Shared raycast support

`shared/sim/sim.h` now supports raycast options:

- `min_t`
- `max_t`
- `ignore_collider_id`

These options are used by the dual-trace retrace path and are also available to other systems.

## Server shot debug logging

Structured per-shot server telemetry is emitted when:

- the client fires while debug overlay is active (`Backquote`), or
- `AFPS_LOG_SHOTS=1` (environment variable, logs all hitscan shots)

Optional file path:
- `AFPS_SHOT_LOG_PATH=/absolute/or/relative/path.log` (optional, defaults to `tmp/shot_debug.log`)

When enabled, the server emits JSON lines with `event:"shot_debug"` on every hitscan shot, including:

- shooter id, `shot_seq`, weapon id/slot, server tick, rewind tick
- client debug payload from fire request (when debug overlay is active):
  - player coordinates
  - view yaw/pitch
  - projection-telemetry enabled flag
- eye origin, muzzle origin, shot direction
- player-hit candidate result
- eye world hit, muzzle probe hit, retry hit, and final world hit
- source decision (`world_hit_source`: `eye`, `muzzle_block`, `muzzle_retry`, `eye_near_muzzle_suppressed`, `arena_side_ignored`)
- backend policy (`world_hit_backend_mode`: `mesh_only|hybrid|aabb`)
- final authoritative hit outcome (`kind`, target id, distance, position, normal, surface)

This is intended for correlation with client projection telemetry (`window.__afpsProjectionTelemetry`) when decals appear in the wrong place.

When the client debug overlay is active (Backquote), fired shot requests now include a debug block so server logs show client-reported coordinates side-by-side with authoritative server hit resolution.

## Guarantees and limits

- Gameplay remains server-authoritative.
- Movement collision stays AABB-based.
- Hits that resolve only against the invisible arena side boundary are treated as no-world-hit for shot impacts/decals to avoid floating decals.
- This change reduces false near-corner blocks but does not make AABB geometry visually exact.
- For decal accuracy and facade detail, mesh/BVH visual projection is still recommended on the client.

## Related files

- `server/src/tick.cpp`
- `shared/sim/sim.h`
- `server/tests/test_shared_sim.cpp`
