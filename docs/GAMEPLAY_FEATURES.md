# Gameplay Features

This document lists implemented gameplay features in AFPS as of the current codebase.

## Controls

- Movement:
  - Forward/back/strafe: `WASD` (also arrow keys)
  - Jump: `Space`
  - Sprint: `Shift`
  - Crouch: `C`
- Abilities:
  - Dash: `E`
  - Grapple: `Q`
  - Shield: `F`
  - Shockwave: `R`
- Combat:
  - Fire: left mouse
  - ADS: right mouse
  - Weapon slots: `1` / `2`
  - Cycle weapon: mouse wheel
- UI:
  - Scoreboard (hold): `P`
  - Nameplates toggle: `N`
  - Settings toggle: `Escape`
  - Debug overlay toggle + player coordinate log: `` ` `` (Backquote)

Sources: `client/src/input/sampler.ts`, `client/src/ui/settings.ts`, `client/src/main.ts`

## Movement and Stance

- Walk/sprint/jump movement is deterministic and server authoritative.
- Crouch reduces collision height and movement speed.
- If there is not enough headroom to stand, crouch is forced until space is clear.
- While the debug overlay is open, local input is forced into crouch for testing.

Key defaults from sim config:

- `moveSpeed`: `5`
- `sprintMultiplier`: `1.5`
- `crouchSpeedMultiplier`: `0.55`
- `jumpVelocity`: `7.5`
- `playerHeight`: `1.7`
- `crouchHeight`: `1.05`

Sources: `shared/sim/sim.h`, `client/src/sim/config.ts`, `client/src/main.ts`

## Abilities

### Dash

- Applies an impulse in movement direction (or current velocity direction if no input vector).
- Uses cooldown gating before dash can trigger again.
- Shown in HUD ability cooldown row.

Defaults:

- `dashImpulse`: `12`
- `dashCooldown`: `0.5s`

Sources: `shared/sim/sim.h`, `client/src/ui/hud.ts`, `client/src/sim/config.ts`

### Grapple

- Fires a ray from eye position in view direction.
- Attaches only when the ray hits valid world geometry within max range.
- While active, applies rope-like pull when stretched beyond rope length + slack.
- Releases on input release, line-of-sight break, excessive distance, or invalid anchor.
- Uses cooldown on release.

Defaults:

- `grappleMaxDistance`: `20`
- `grapplePullStrength`: `25`
- `grappleDamping`: `4`
- `grappleCooldown`: `1s`
- `grappleRopeSlack`: `0.5`

Sources: `shared/sim/sim.h`, `client/src/sim/config.ts`

### Shield

- Press to activate when off cooldown; shield has active duration.
- Releasing shield early ends it and applies cooldown.
- Incoming damage reduction applies only when shield is active and facing check passes.
- Shield status and cooldown are shown in HUD.

Defaults:

- `shieldDuration`: `2s`
- `shieldCooldown`: `5s`
- `shieldDamageMultiplier`: `0.4`

Sources: `shared/sim/sim.h`, `server/src/combat.cpp`, `server/src/tick.cpp`, `client/src/ui/hud.ts`, `client/src/sim/config.ts`

### Shockwave

- Edge-triggered ability (activates on press transition, not continuous hold).
- Emits radial impulse and optional radial damage from the player origin.
- Server resolves affected players and damage, then applies authoritative outcomes.
- Uses cooldown and is shown in HUD.

Defaults:

- `shockwaveRadius`: `6`
- `shockwaveImpulse`: `10`
- `shockwaveCooldown`: `6s`
- `shockwaveDamage`: `10`

Sources: `shared/sim/sim.h`, `server/src/tick.cpp`, `client/src/ui/hud.ts`, `client/src/sim/config.ts`

## Combat and Weapons

- Server-authoritative combat with lag-compensated hitscan and server-simulated projectiles.
- Weapon fire emits FX events used by clients for muzzle flash, tracer, impacts, decals, and casing ejection.
- ADS changes local input sensitivity and affects weapon behavior/pose.
- Projectile explosions support large grenade impact visuals.
- If the local player is directly hit by grenade impact, a full-screen explosion overlay is shown locally.

Sources: `server/src/tick.cpp`, `client/src/main.ts`, `client/src/app.ts`, `docs/WEAPONS_V2.md`

## Health, Kills, Death, Respawn

- Players have health and can be killed.
- Kills/deaths are tracked in server combat state.
- Dead players respawn after a timer.
- Server snapshots include health and kills for client HUD/scoreboard display.

Sources: `server/src/combat.cpp`, `server/src/tick.cpp`, `client/src/ui/hud.ts`, `client/src/ui/scoreboard.ts`

## Spawning

- Spawns are randomized within valid map bounds.
- Spawn selection rejects blocked/invalid points against world colliders.
- Fallback spawn logic exists if random sampling fails.

Sources: `server/src/tick.cpp`

## World, Map, and Collision

- Deterministic map generation from a seed for both server and client.
- Buildings use per-model collider profiles.
- Multi-part collider profiles are supported for composite assets.
- Collider orientation is adjusted by building/door orientation.
- Building colliders are solid to prevent entering houses.

Sources: `server/src/map_world.cpp`, `client/src/environment/procedural_map.ts`, `client/src/environment/retro_urban_map.ts`, `docs/ENGINE_STACK.md`

## Pickups

- Two pickup kinds:
  - Health pickups (restore health)
  - Weapon pickups (slot-based weapon/ammo interaction)
- Pickup state is server authoritative.
- Pickup spawn and take events are replicated to clients for rendering.
- Pickups respawn after configured tick-based timers.

Sources: `server/src/map_world.cpp`, `server/src/tick.cpp`, `client/src/pickups/manager.ts`

## Multiplayer UI

- HUD includes:
  - Top-left health bar
  - Health/ammo values
  - Score (kills/deaths)
  - Weapon and weapon cooldown
  - Dash/shield/shockwave cooldowns
  - Hitmarker feedback
- Scoreboard:
  - Visible while `P` is held
  - Rows sorted by kills descending, then name
- Nameplates:
  - Small labels above remote players
  - Toggle with `N`
- Settings:
  - Fixed-size, scrollable panel
  - Tabs for `Audio` and `Keyboard`
  - Keyboard section is read-only in this build

Sources: `client/src/ui/hud.ts`, `client/src/ui/scoreboard.ts`, `client/src/ui/settings.ts`, `client/src/players/remote_avatars.ts`, `client/src/style.css`

## Networking and Resilience

- Client-side prediction with server reconciliation.
- Snapshot interpolation and event queueing for smooth rendering.
- Reconnect flow:
  - Detects data channel/peer/ICE failure and stale server activity.
  - Pauses local control while reconnecting.
  - Shows reconnect notice centered on screen.
- World-hit decal-driving events are dual-path streamed:
  - Unreliable FX path for normal low-latency effects
  - Reliable path for consistency across clients

Sources: `client/src/main.ts`, `client/src/net/*`, `server/src/tick.cpp`, `docs/reliable_decal_streaming.md`

## Visual Effects Notes

- Bullet hole graphics on surfaces are decals.
- Decals are spawned for world hits and projected to static map geometry when possible.
- Sky decals fade out after a configured TTL (`3s` safeguard path).
- Duplicate FX events are deduplicated client-side to prevent double decals/impacts.

Sources: `client/src/main.ts`, `client/src/app.ts`, `docs/WEAPONS_V2.md`, `docs/reliable_decal_streaming.md`

## Current Non-Features

- Death-triggered weapon drops are not implemented at this time.

Source: `server/src/tick.cpp` (pickup and death flow), `server/src/map_world.cpp`
