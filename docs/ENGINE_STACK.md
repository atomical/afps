# Engine Stack

This document describes the runtime architecture for AFPS: browser client, shared deterministic sim, and authoritative C++ server.

---

## Overview

- **Client runtime:** Vite + TypeScript + Three.js for rendering, DOM overlays for UI, Web APIs for input/audio/network.
- **Shared sim core:** Deterministic C++ simulation used by the server and optionally by the client via WASM.
- **Server engine:** Fixed-timestep tick loop with combat, projectiles, and snapshot replication.

---

## Client Runtime (browser)

### Boot + lifecycle

- Entry point: `client/src/main.ts`.
- App creation: `client/src/bootstrap.ts` calls `createApp` from `client/src/app.ts`.
- A single `requestAnimationFrame` loop drives `app.renderFrame(deltaSeconds, nowMs)`.
- Resize handling updates camera aspect and renderer size.

### Rendering pipeline

- **Scene setup:** `createApp` initializes a Three.js `Scene`, `PerspectiveCamera`, and `WebGLRenderer`.
- **Color pipeline:** Renderer output is sRGB (`SRGBColorSpace`) with tone mapping disabled.
- **Toon shading:** `MeshToonMaterial` + 1D `DataTexture` ramp (nearest filtered, no mipmaps).
- **Lighting:** Warm ambient light + directional key light; sand-tone sky/ground palette.
- **Post-processing:** `EffectComposer` with `RenderPass` and multiple `OutlinePass` instances.
  - One outline pass per team; selection changes based on team id.
  - Hit flash temporarily overrides outline color/strength.
  - A separate viewmodel outline pass highlights first-person weapon meshes.

### World & environment assets

- **Retro Urban map loader:** `client/src/environment/retro_urban_map.ts`.
- **Assets:** GLB files under `client/public/assets/environments/cc0/kenney_city_kit_suburban_20/`.
- **Procedural map generation:** `client/src/environment/procedural_map.ts` deterministically generates roads, buildings, colliders, and pickup spawns from a seed.
- **Building colliders:** Procedural buildings use per-model collider profiles with optional multi-part AABBs (for composite assets such as house + attached prop), rotated per door-facing orientation.
- **Building traversal policy:** Procedural building colliders are solid from ground to roof profile height; players cannot enter buildings.
- **Seeded map sync:** `ServerHello.mapSeed` is applied in `main.ts` via `app.setMapSeed(...)`, so clients converge on the server map layout.
- **Legacy manifest fallback:** `map.json` placements remain supported for fallback/debug workflows.
- **Fallback placements:** Built-in layout used when manifest fetch fails.
- **Debug toggles:**
  - `VITE_DEBUG_RETRO_URBAN_BOUNDS` draws placement bounds.
  - `VITE_DEBUG_RETRO_URBAN_GRID` draws a grid helper.
  - `VITE_DEBUG_COLLIDERS` draws generated collider bounds.
  - `VITE_DEBUG_INTERIORS` highlights generated room/interior geometry.
  - `VITE_DEBUG_MAP_STATS` exports loading stats on `globalThis.__afpsMapStats`.

### Camera & viewmodel

- **Camera:** First-person-ish view; rotation order `YXZ`; pitch is clamped.
- **Weapon viewmodel:** `environment/weapon_viewmodel.ts` loads and attaches GLB weapons using offsets from weapon config.

### Input system

- **Sampler:** `client/src/input/sampler.ts` captures per-frame input and emits `InputCmd` per sim tick.
- **Pointer lock:** `client/src/input/pointer_lock.ts` drives relative mouse deltas.
- **Settings:** Audio sliders/mute are persisted in localStorage; keybinds are displayed read-only.

### Prediction + interpolation

- **Snapshot buffer:** `client/src/net/snapshot_buffer.ts` handles interpolation for rendering.
- **Prediction:** `client/src/net/prediction.ts` replays un-acked inputs after server snapshots.
- **Collision world:** prediction uses a multi-AABB collider set provided by the active map loader.
- **Tick alignment:** Client prediction uses server tick rate learned from `ServerHello`.

### Gameplay VFX

- **Projectile VFX:** Client-side predicted tracers/projectiles with TTL cleanup.
- **Hit feedback:** Outline flash on confirmed hits.
- **Pickups:** `client/src/pickups/manager.ts` renders pickup spawn/taken state from `GameEvent` FX.

### Audio

- **Web Audio API:** `client/src/audio/manager.ts` manages grouped gain nodes (master/sfx/ui/music).
- **Asset preload:** `createAudioManager().preload` fetches and decodes audio buffers.
- **Debug hooks:** `VITE_DEBUG_AUDIO` exposes playback helpers for manual testing.

### UI overlays

- **HUD:** Crosshair, top-left health bar, vitals/score/weapon/cooldowns, and hitmarkers.
- **Scoreboard:** Hold `P` to show player names + kills (sorted desc).
- **Name tags:** Player nameplates above remote avatars, toggle with `N`.
- **Settings:** Tabbed overlay with audio controls and read-only keyboard bindings.
- **Pre-join flow:** Character selection + nickname, stored in `afps.playerProfile`.

---

## Shared Simulation Stack

- **Core sim:** `shared/sim` contains deterministic C++ movement/physics.
- **Config + state:** `SimConfig` and `PlayerState` define movement constants and per-player state.
- **Abilities:** Config fields cover dash/grapple/shield/shockwave timings and tuning.
- **Collision world:** sim supports many AABB colliders with deterministic raycast/collision behavior shared across movement, grapple, and hitscan checks.
- **FlatBuffers schema:** `shared/schema/afps_protocol.fbs` is the network schema source of truth.

### WASM bridge

- **C ABI wrapper:** `shared/wasm/sim_wasm.cpp` exposes `sim_*` exports.
- **Build:** `shared/wasm/build.sh` produces `afps_sim.js` + `afps_sim.wasm`.
- **Client loader:** `client/src/sim/wasm.ts` + `client/src/sim/wasm_adapter.ts`.
- **Collider sync:** WASM exposes collider mutation entry points used by the client wrapper (`sim_clear_colliders` + `sim_add_aabb_collider`).
- **Parity:** Optional runtime parity check via `VITE_WASM_SIM_PARITY=1`.

---

## Server Engine

- **Tick loop:** `server/src/tick.cpp` runs a fixed 60 Hz tick with a snapshot cadence of 20 Hz.
- **Per-connection state:** Maps for last input, last input seq, player state, weapon state, pose history, and combat state.
- **Map world:** `server/src/map_world.cpp` deterministically generates collision colliders + pickup spawns from `--map-seed`.
- **Collider parity:** Server applies the same per-building collider profile strategy (including multi-part + door-side rotation) to keep authoritative movement/raycast aligned with client prediction.
- **Snapshots:** Full keyframes every N snapshots; deltas in between with field masks.
- **Combat:**
  - Hitscan uses lag-compensated pose history.
  - Hitscan and grapple validation raycast against the generated collision world.
  - Projectiles are simulated server-side with spawn/remove events.
- **Pickups:** Server-authoritative pickup collect/respawn state is emitted as `GameEvent` FX.
- **Config:** Snapshot keyframe interval is configurable via `--snapshot-keyframe-interval`.

---

## Related docs

- Gameplay features: `docs/GAMEPLAY_FEATURES.md`
- Rendering: `docs/RENDERING.md`, `docs/OUTLINES.md`
- WASM sim: `docs/WASM_SIM.md`
- Pre-join flow: `docs/prejoin.md`
- Network stack: `docs/NETWORK_STACK.md`
