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
- **Manifest-driven placements:** `map.json` defines placements, rotations, scales, and optional seeded random yaw.
- **Fallback placements:** Built-in layout used when manifest fetch fails.
- **Debug toggles:**
  - `VITE_DEBUG_RETRO_URBAN_BOUNDS` draws placement bounds.
  - `VITE_DEBUG_RETRO_URBAN_GRID` draws a grid helper.
  - `VITE_DEBUG_MAP_STATS` exports loading stats on `globalThis.__afpsMapStats`.

### Camera & viewmodel

- **Camera:** First-person-ish view; rotation order `YXZ`; pitch is clamped.
- **Weapon viewmodel:** `environment/weapon_viewmodel.ts` loads and attaches GLB weapons using offsets from weapon config.

### Input system

- **Sampler:** `client/src/input/sampler.ts` captures per-frame input and emits `InputCmd` per sim tick.
- **Pointer lock:** `client/src/input/pointer_lock.ts` drives relative mouse deltas.
- **Settings:** Keybinds, sensitivity, and look inversion are persisted in localStorage.

### Prediction + interpolation

- **Snapshot buffer:** `client/src/net/snapshot_buffer.ts` handles interpolation for rendering.
- **Prediction:** `client/src/net/prediction.ts` replays un-acked inputs after server snapshots.
- **Tick alignment:** Client prediction uses server tick rate learned from `ServerHello`.

### Gameplay VFX

- **Projectile VFX:** Client-side predicted tracers/projectiles with TTL cleanup.
- **Hit feedback:** Outline flash on confirmed hits.

### Audio

- **Web Audio API:** `client/src/audio/manager.ts` manages grouped gain nodes (master/sfx/ui/music).
- **Asset preload:** `createAudioManager().preload` fetches and decodes audio buffers.
- **Debug hooks:** `VITE_DEBUG_AUDIO` exposes playback helpers for manual testing.

### UI overlays

- **HUD:** Crosshair, health, weapon slot, cooldowns, and net metrics.
- **Settings:** Input + metrics visibility overlay.
- **Pre-join flow:** Character selection + nickname, stored in `afps.playerProfile`.

---

## Shared Simulation Stack

- **Core sim:** `shared/sim` contains deterministic C++ movement/physics.
- **Config + state:** `SimConfig` and `PlayerState` define movement constants and per-player state.
- **Abilities:** Config fields cover dash/grapple/shield/shockwave timings and tuning.
- **Arena + obstacles:** Sim enforces arena bounds, player radius/height, and simple obstacle collisions.
- **FlatBuffers schema:** `shared/schema/afps_protocol.fbs` is the network schema source of truth.

### WASM bridge

- **C ABI wrapper:** `shared/wasm/sim_wasm.cpp` exposes `sim_*` exports.
- **Build:** `shared/wasm/build.sh` produces `afps_sim.js` + `afps_sim.wasm`.
- **Client loader:** `client/src/sim/wasm.ts` + `client/src/sim/wasm_adapter.ts`.
- **Parity:** Optional runtime parity check via `VITE_WASM_SIM_PARITY=1`.

---

## Server Engine

- **Tick loop:** `server/src/tick.cpp` runs a fixed 60 Hz tick with a snapshot cadence of 20 Hz.
- **Per-connection state:** Maps for last input, last input seq, player state, weapon state, pose history, and combat state.
- **Snapshots:** Full keyframes every N snapshots; deltas in between with field masks.
- **Combat:**
  - Hitscan uses lag-compensated pose history.
  - Projectiles are simulated server-side with spawn/remove events.
- **Config:** Snapshot keyframe interval is configurable via `--snapshot-keyframe-interval`.

---

## Related docs

- Rendering: `docs/RENDERING.md`, `docs/OUTLINES.md`
- WASM sim: `docs/WASM_SIM.md`
- Pre-join flow: `docs/prejoin.md`
- Network stack: `docs/NETWORK_STACK.md`
