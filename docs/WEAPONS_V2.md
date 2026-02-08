# Weapons V2 — FX Events, Surfaces, and Client VFX

Weapons V2 adds a **server-tick-aligned cosmetic FX layer** on top of the existing server-authoritative weapons/sim.

At a high level:
- The server remains authoritative for ammo/cooldowns/hits/overheat.
- The server emits compact, drop-tolerant **FX events** on the unreliable channel.
- The client renders VFX (muzzle flashes, tracers, impacts, decals, projectiles) from those events.

## Where Things Live

- Schema + event definitions: `shared/schema/afps_protocol.fbs`
- Server event emission + batching + caps: `server/src/tick.cpp`
- Client event scheduling: `client/src/net/event_queue.ts`
- Client event consumption + spawning: `client/src/main.ts`
- Client pooled VFX implementation: `client/src/app.ts`
- FX toggles persisted in localStorage: `client/src/rendering/fx_settings.ts` + UI in `client/src/ui/settings.ts`

## FX Events (What the Client Should Render)

### `ShotFiredFx`
Emitted for every server-approved trigger pull (including dry fire).

Client responsibilities:
- Play fire/dry-fire SFX at the shooter muzzle (best-effort).
- Spawn muzzle flash VFX when `dryFire == false` and `fxSettings.muzzleFlash == true`.
- Spawn hitscan tracer VFX only when paired `ShotTraceFx.showTracer == true` and `fxSettings.tracers == true`.
- Spawn deterministic casing ejection for weapons with `ejectShellsWhileFiring == true`.

Server note:
- The authoritative shot direction is taken from each `FireWeaponRequest` direction vector (validated finite + normalized) so fire timing stays aligned with the client’s exact shot frame, instead of relying only on the last queued input-view sample.
- Client fire direction must be derived from the rendered camera forward; in this codebase `lookPitch` is positive when aiming downward, so vertical direction uses `-sin(pitch)` when building `FireWeaponRequest.dir_*`.

### `ShotTraceFx` (hitscan only)
Emitted for hitscan weapons with:
- `dirOct*`: server view direction (oct-encoded).
- `hitDistQ`: distance **from the shooter eye origin** (not muzzle).
- `hitKind`: `None | World | Player`.
- `surfaceType`: `Stone | Metal | Dirt | Energy`.
- `normalOct*`: hit normal (oct-encoded).
- `hitPos*Q`: authoritative world hit point (signed int16 quantized at `0.01m`).

Client responsibilities:
- Compute muzzle position as `eyeOrigin + dir * 0.2` (same constant as server).
- Compute tracer length as `max(0, hitDistance - 0.2)` when drawing from muzzle.
- Spawn impact VFX at `hitPos*Q` when `hitKind != None`.
- Spawn decals at `hitPos*Q` only when `hitKind == World` and `fxSettings.decals == true`.
- For authoritative `hitKind == World`, use server `hitPos` and `normal` directly (plus tiny normal offset) and skip client reprojection.
- Surface projection helpers are only for debug/miss visualization paths.

Debug aid:
- `window.__afpsWorldSurface` exposes `projectTraceWorldHit`, `raycastStaticSurface`, and `getPlayerPose` for browser/UI diagnostics.

### `ProjectileSpawnFx` / `ProjectileImpactFx` / `ProjectileRemoveFx`
Emitted for projectile weapons.

Client responsibilities:
- Spawn a projectile visual (best-effort) from `ProjectileSpawnFx` (origin/velocity/ttl/projectileId).
- Remove the projectile visual on `ProjectileImpactFx` / `ProjectileRemoveFx`.
- Spawn impact VFX (and optional decals for `hitWorld == true`) from `ProjectileImpactFx`.

### `NearMissFx`
Sent only to the victim when a hitscan segment passes close by.

Client responsibilities:
- Play a short “whiz” SFX (non-positional) with volume scaled by `strength`.

### `OverheatFx` / `VentFx`
Emitted when an energy weapon reaches full heat and vents.

Client responsibilities:
- Play overheat/vent SFX (positional at muzzle when possible).
- Spawn an energy-ish burst at the muzzle (best-effort, pooled).

## Surface Types (World + Player Hits)

Surface types are defined in `shared/schema/afps_protocol.fbs`:

```text
Stone = 0
Metal = 1
Dirt  = 2
Energy = 3
```

### Server mapping (world)
The server decides world surface type in:
- `ResolveWorldHitscan(...)` for hitscan impacts
- `ResolveWorldSurfaceAt(...)` for projectile impacts

Update these if you add new world geometry/materials and want different impact VFX.

### Client mapping (VFX materials)
The client maps `surfaceType` → VFX materials in `client/src/app.ts`:
- `resolveSurfaceKey(surfaceType)` for impact sprites
- `resolveDecalKind(surfaceType)` for decal sprites

If you add a new `SurfaceType`:
1. Update the enum in `shared/schema/afps_protocol.fbs` and regenerate FlatBuffers outputs.
2. Update the server world resolvers to emit the new surface id.
3. Update `client/src/app.ts` mappings to pick an appropriate impact/decal look.

## Notes on Performance / Drop-Tolerance

- FX events are cosmetic: the server may drop lower-priority FX under size caps.
- The client schedules FX by `serverTick` using `GameEventQueue` and will drop events that arrive too late.
- All client FX should be pooled (`client/src/app.ts`) to avoid per-event allocations.
