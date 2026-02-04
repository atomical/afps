# Codex Prompt — Weapons V2 (Vite + TypeScript + Three.js client, deterministic C++ sim server, WebRTC FlatBuffers protocol)

You are **OpenAI Codex** acting as a **principal multiplayer gameplay + rendering engineer**. You have full access to this repository.

Assume **Weapons V1 is already completed** (weapon settings registry for all weapons, server-authoritative fire, server-synced casing ejection using the Blaster Kit bullet mesh, procedural SFX generation for fire/reload/dry/casing impacts, pooling, and validation).

Now implement **Weapons V2** with the features discussed:

- **Muzzle flashes** (toon-friendly, OutlinePass-safe, pooled, server-synced timing)
- **Tracers / projectiles** (server-truth visual traces + impacts, optional ballistic visuals for launchers/plasma)
- **Server-synced gun pointing / aiming pose** (so other players see weapon aim up/down and track look)
- **Impact VFX + decals + surface types**
- **Recoil + bloom + ADS handling** (deterministic gameplay + client-only viewmodel feel; third-person recoil)
- **Third-person weapon animation states** (fire/reload/sprint/ADS) driven by snapshots/events
- **Near-miss “whiz”** FX targeted to the victim
- **Attachments (content multiplier)** that modify muzzle flash / tracer / recoil / sounds / spread
- **Energy weapon heat / overheat** mechanics + VFX/SFX coupling
- **Event batching + LOD + performance controls** suitable for `afps_unreliable` unordered best-effort channel

The repo’s engine/network stack is:

- Client: **Vite + TypeScript + Three.js**  
  - wiring: `client/src/main.ts`, `client/src/app.ts`
  - toon baseline: `MeshToonMaterial + 1D ramp`, `sRGB output`, **no tone mapping**
  - post: **OutlinePass** for silhouettes and hit flash (`docs/RENDERING.md`, `docs/OUTLINES.md`)
- Netcode: prediction/snapshots drive camera + render loop (not raw input)  
  - prediction: `client/src/net/prediction.ts` (`docs/NETCODE.md`)
  - snapshot decode: `client/src/net/snapshot_decoder.ts`
- Sim core: deterministic **C++** in `shared/sim` used by server (authoritative) and optionally client via WASM  
  - wasm ABI is minimal (create/reset/set_config/set_state/step + getters) (`docs/WASM_SIM.md`, `shared/wasm/*`, `client/src/sim/*`)
- Server: C++ fixed tick loop (`server/src/tick.cpp`, `server/src/tick.h`)
- Transport: WebRTC DataChannels via libdatachannel  
  - reliable ordered: `afps_reliable`  
  - unreliable unordered best-effort: `afps_unreliable` (`maxRetransmits=0`)
- All messages: fixed binary envelope `"AFPS" + protocol version (currently 4) + msgType + length + msgSeq + serverSeqAck` (little-endian)  
  - schema: `shared/schema/afps_protocol.fbs` (`docs/PROTOCOL.md`)
- Rates: server tick **60 Hz**, snapshot rate **20 Hz**, keyframe interval default 5 (`docs/NETCODE.md`)

---

## HARD REQUIREMENTS (do not violate)

1) **No placeholders in code or assets**
- No TODOs, no “fill later”, no stubbed methods, no empty textures, no missing references.
- Any default value must be real and chosen deliberately.
- All generated assets (audio/textures) must be real, audible/visible, and deterministic.

2) **Server authoritative gameplay**
- Hits, ammo, cooldown, heat, reload state, etc. remain deterministic in `shared/sim`.
- Clients may pre-play cosmetic feedback for local feel, but server truth must win.

3) **Networking constraints**
- Unreliable channel is unordered + drop-prone.
- Each message max payload is capped (see docs); additionally DataChannel cap is **4096 bytes** per message.
- Design V2 events to be **compact**, **drop-tolerant**, and **idempotent** where possible.
- Use deterministic seeds (`serverTick`, `shooterId`, `shotSeq`) to keep clients visually consistent.

4) **100% test coverage**
- Enforce **100% line + branch coverage** for:
  - C++ (`shared/sim`, server logic that builds events)
  - TypeScript client modules added/changed
- Include **UI tests** (Playwright or repo-standard UI framework) and make them run in CI.
- Add coverage gates in CI and fail builds that dip below 100%.

5) **Keep repo style and architecture**
- Match existing conventions, folder structure, and logging/error patterns.
- Update docs where relevant (`docs/PROTOCOL.md`, `docs/NETCODE.md`, rendering docs).

---

## OVERVIEW: What you must implement

### A) New server-synced cosmetic event model (tick-aligned)

Implement a robust system where the server emits **tick-stamped cosmetic events** that clients render in sync with interpolated snapshot time.

- The deterministic sim generates events during `step()`.
- The server collects events each tick and ships them to clients (primarily on `afps_unreliable`).
- Clients queue events by `serverTick` and consume them when render-time crosses that tick.

**Key behavior**
- If an event arrives late (its tick is already “in the past” relative to render interpolation):
  - If within a small grace window (e.g., <= 150ms), spawn immediately.
  - If too old, drop it silently (cosmetic only).
- Never block gameplay on missing cosmetic events.

### B) Muzzle flash VFX (toon-friendly + OutlinePass-safe)

On every server-approved shot:
- Spawn a short-lived muzzle flash at muzzle socket.
- Optional smoke accumulation for sustained fire.
- Exclude muzzle FX objects from OutlinePass selection/layers.

**Rendering constraints**
- Toon baseline, no tone mapping. Muzzle flashes should be **unlit** (MeshBasicMaterial or tiny shader).
- Use additive blending and disable depth-write.

**No external assets**
- Generate flash textures procedurally (Canvas2D or shader) OR build simple meshes (cone/cross-quads).
- Deterministic variants chosen from `shotSeq`.

### C) Tracers / projectiles

Implement server-truth visual traces:

**Hitscan tracer path**
- Server includes shot direction and hit distance (or endpoint) in events.
- Client reconstructs: muzzle origin from interpolated pose at `serverTick`, then draws a tracer beam to endpoint.
- Spawn impact VFX at endpoint when hit occurs.

**Ballistic visuals**
- For rockets/grenades/plasma: server sends spawn event (origin/velocity/seed/lifetime) and client simulates visuals locally.
- Server sends impact event; clients kill projectile visual + spawn explosion VFX.

### D) Server-synced gun pointing / aiming pose (third-person)

Remote players must see where others are aiming.

Implement one of these (prefer implementing both with an internal toggle, but do not leave incomplete):
1) **Snapshot fields**: add `lookPitch` (and optional `isADS`, `isReloading`, `isSprinting`) to `StateSnapshot` so pose is authoritative.
2) **AimPose event stream**: send compact `AimPose` events at 10–20 Hz to smooth upper-body/weapon aim without increasing snapshot size.

Remote rendering:
- Apply pitch to upper-body / weapon transform.
- Smooth with interpolation; clamp to avoid insane rotations.
- Add recoil overlay on `ShotFiredFx`.

### E) Impact VFX + decals + surface types

Add a surface system so impacts look different based on material.

- Sim raycast hit returns `surfaceTypeId` for world hits.
- Impacts spawn:
  - VFX (sparks/dust/splinters) in toon style
  - decal (projected quad or oriented quad) with deterministic lifetime and pooling

**No external assets**
- Generate decal textures procedurally (Canvas2D) using a small deterministic atlas (bullet holes, scorch marks).
- Ensure they look acceptable under toon + sRGB.

### F) Recoil, bloom/spread, ADS

Gameplay-side:
- Deterministic spread/bloom in sim, driven by weapon definition + current state (moving, jumping, ADS, heat).
- Spread must be reproducible on server and client sim parity checks.

Client-side feel (local-only):
- Viewmodel/weapon sway + inertia.
- Camera kick on fire.
- ADS transitions.

Third-person:
- Small recoil pose or weapon kick driven by server events.

### G) Near-miss whiz FX

When a shot passes near a victim:
- Server computes near-miss vs player capsule.
- Emit `NearMissFx` only to that victim (unreliable ok).
- Client plays a “whiz” sound and optional screen-edge effect; keep subtle.

### H) Attachments

Implement an attachment system that modifies weapon behavior and visuals:

- Muzzle: suppressor/compensator
- Optic: ADS FOV/reticle (client), ADS stability (sim)
- Mag: capacity and reload time
- Grip/stock: recoil recovery, sway

Networking:
- Loadout must be server-authoritative.
- Replicate loadout changes reliably or via snapshot state (choose best fit for repo).

### I) Heat / overheat (energy weapons)

For energy weapons (or any configured weapon):
- Heat accumulates while firing.
- Cooling over time.
- Overheat causes forced cooldown and unique FX.

Expose `heat` in snapshot state (or a heat event stream), so client can:
- modulate fire sound pitch
- modulate weapon emissive glow
- play venting effects on overheat

### J) Performance + LOD

Add guardrails to prevent FX spam:
- Pool everything (muzzle flashes, tracers, impacts, decals, projectiles).
- LOD by distance:
  - far players: no casings, no decals, fewer tracers, simpler impacts
- Ensure no event packet exceeds message size caps; implement batching and per-tick truncation rules.

---

## DETAILED IMPLEMENTATION SPEC

### 1) Protocol / Schema (FlatBuffers + envelope)

**Goal:** Add compact V2 GameEvents without breaking the transport constraints.

Steps:
1. Locate and update the FlatBuffers schema:
   - `shared/schema/afps_protocol.fbs`
2. Add/extend `GameEvent` union to include:
   - `ShotFiredFx`
   - `ShotTraceFx` (direction + hitDist + hitKind + optional surface)
   - `ShotImpactFx` (optional; can be merged with ShotTraceFx if endpoint is enough)
   - `AimPoseFx` (optional smoothing stream)
   - `ReloadFx` (for third-person audio/animation)
   - `NearMissFx` (targeted)
   - `OverheatFx` / `VentFx` (if needed)
   - `LoadoutChangedFx` (if you don’t put loadout in snapshot)

3. Quantization requirements (implement both encode and decode):
   - **Direction**: octahedral encoding to 2× int16 (or int8 if acceptable).
   - **Normal**: same encoding (optional).
   - **Hit distance**: uint16 fixed-point (define max range and step).
   - **Pitch**: int16 mapping -90..+90 degrees.
   - Keep events tiny.

4. Decide protocol version:
   - Prefer bumping protocol version (e.g. 4 → 5) so mismatched clients fail early in handshake.
   - Update `docs/PROTOCOL.md` accordingly and ensure `ClientHello/ServerHello` verify.

5. Regenerate schema outputs (C++ and TS) using repo-standard toolchain (find existing scripts/targets). Commit generated code if the repo commits it.

**Acceptance**
- Schema compiles.
- Message types decode on both client/server.
- Unit tests cover encode/decode and max-size constraints.

---

### 2) Deterministic sim event emission (`shared/sim`)

Modify the sim so it produces V2 events deterministically during `step()`:

**In the weapon firing code path**
- On server-approved shot:
  - existing V1 gameplay outcomes (ammo decrement, hit application)
  - produce V2 events:
    - `ShotFiredFx` always
    - `ShotTraceFx` if tracer should be shown (deterministic: `shotSeq % tracerEveryN == 0`)
    - `ReloadFx` when reload starts/ends (if used)
    - `OverheatFx` when crossing threshold

**Near-miss detection**
- For each shot segment, compute minimum distance to other players’ capsules.
- If within threshold but not hit, emit `NearMissFx` to that victim.

**Surface types**
- Raycast returns world hit with a surface/material id.
- If no classification exists today, implement a real default mapping (e.g., everything is `STONE`), but keep system extensible.

**Event buffer format**
- Sim should output an array/ring-buffer of events for the tick, with deterministic ordering.

**Acceptance**
- Parity checks (JS vs WASM vs native C++) still pass.
- Deterministic test: running the same input sequence yields identical event lists.

---

### 3) Server tick loop (`server/src/tick.cpp`)

Integrate sim events into network output:

- Collect sim events each tick.
- Batch into one (or few) `GameEvent` messages per tick.
- Send to each client on `afps_unreliable`, except:
  - rare critical events may use reliable if needed (e.g., explosion if you choose)

**Per-recipient LOD**
- Determine distance from recipient to shooter/impact and cull:
  - decals off beyond distance D
  - casing ejection off beyond distance E
  - tracer frequency reduced beyond distance T

**Size enforcement**
- Before sending, compute serialized payload size.
- If too large, drop lowest-priority cosmetics first in this order:
  1) decals
  2) smoke
  3) near-miss extras
  4) tracers (keep muzzle flash + core impacts if possible)
- Never exceed caps.

**Acceptance**
- No message exceeds caps.
- Abuse logging and monotonic sequencing remain correct.
- Server unit tests validate culling and sizing rules.

---

### 4) Client networking + event scheduling

Implement a robust client-side event queue:

Files likely involved:
- `client/src/net/*`
- `client/src/net/snapshot_decoder.ts`
- `client/src/net/prediction.ts`
- `client/src/app.ts` (render loop wiring)

**Event queue behavior**
- Decode `GameEvent` payloads into typed TS objects.
- Store by `serverTick` in a ring buffer keyed by tick modulo N.
- On each render frame:
  - determine render tick/time (based on interpolation timeline already used for snapshots)
  - drain events whose tick <= renderTick
  - spawn FX using the world transforms derived from the interpolated snapshot state at that tick

**Late events**
- If eventTick < renderTick:
  - if within grace window: spawn immediately but mark as late (for metrics)
  - else drop

**Local predicted pre-play**
- For local player only:
  - When predicted sim fires a shot, spawn local-only muzzle flash/recoil immediately.
  - When authoritative `ShotFiredFx` arrives with matching `(shooterId, shotSeq)`, dedupe and do not double-play.

**Metrics**
- Add HUD/debug counters for:
  - events received per second
  - late events
  - dropped events
  - pool usage (active vs free)
- Persist toggles in localStorage (use existing settings system).

---

### 5) Three.js VFX implementation (toon + OutlinePass)

Implement these pooled FX components:

#### 5.1 MuzzleFlashFx
- Geometry: sprite or small mesh.
- Material: additive unlit, depthWrite=false.
- Lifetime: 30–80ms.
- Variants: deterministic selection (shotSeq hash).
- Optional smoke: longer lived translucent quads.

#### 5.2 TracerFx
- Render a streak from muzzle to hit endpoint.
- Use a camera-facing quad (billboard) stretched to length.
- Lifetime: 40–120ms.
- Tracer frequency deterministic per weapon.

#### 5.3 ImpactFx
- World hit: spawn a short sprite burst + optional particles.
- Entity hit: optionally trigger OutlinePass hit flash (if your pipeline supports per-entity hit flash)
- Use surface type to pick sprite shape.

#### 5.4 DecalFx
- Oriented quad at hit point with normal (if available).
- DepthOffset / polygonOffset to prevent z-fighting.
- Cap max decals and lifetime.
- Deterministic texture selection from an atlas generated procedurally.

#### 5.5 ProjectileFx (optional)
- Visual-only projectile with trail.
- Spawn on `ProjectileSpawnFx` (server event), simulate locally; destroy on impact event.

**OutlinePass exclusions**
- Ensure all FX objects are excluded from outlines.
- If outline uses a selection list: never add FX meshes to it.
- If outline uses layers: put FX into a non-outlined layer.

**Color management**
- Respect sRGB output (no tone mapping). Ensure generated textures are treated correctly.

---

### 6) Gun pointing / aim pose rendering

Implement third-person aiming:

- Add player rig nodes if needed (e.g., `upperBodyPivot`, `weaponPivot`).
- Apply:
  - yaw from player orientation
  - pitch from snapshot/aim events
- Smooth:
  - interpolate pitch and yaw deltas
  - clamp pitch to [-85°, +85°] (or weapon-specific)
- Add recoil overlay:
  - on `ShotFiredFx`, apply quick +X degrees then decay.

If the model is skinned:
- Use bone rotations or simple IK if already present.
If not skinned:
- Use grouped transforms.

---

### 7) Attachments system

Add:
- Attachment definitions (data-driven):
  - id, slot, modifiers (cooldown? spread? recoil? sound filter? muzzle flash style?)
- Player loadout state:
  - server authoritative
  - replicated to clients

UI:
- Add a simple in-game UI panel (settings UI style) to:
  - view current attachments
  - cycle attachments in dev mode (behind a debug flag)
- Must have UI tests.

---

### 8) Heat / overheat

Sim:
- Add `heat` float per weapon (or per player+weapon) with deterministic update.
- Overheat threshold triggers forced cooldown and an overheat event.

Client:
- Heat affects:
  - energy weapon emissive intensity (visual)
  - fire sound pitch modulation (audio)
  - optional venting sprite on overheat

---

## TESTING & COVERAGE (100% REQUIRED)

### A) C++ tests
- Add/extend a C++ test harness (use repo’s existing framework; if none, add a well-supported one).
- Tests must cover:
  - event emission determinism (golden sequence tests)
  - encoding/quantization utilities
  - surface type selection
  - near-miss detection correctness
  - heat/overheat state transitions
  - server event batching + LOD + size enforcement

Coverage:
- Build with coverage flags (`-O0 -g --coverage` or compiler equivalent).
- Generate lcov reports.
- Enforce 100% line + branch coverage for modified/added C++ targets.

### B) TypeScript unit tests
Use repo-standard runner (prefer `vitest` + `c8` if not already used).

Cover:
- event queue ordering, late/drop behavior
- deterministic variant selection
- octahedral decode + endpoint reconstruction
- pooling correctness (no leaks, caps)
- decal atlas generator (deterministic pixels, non-empty)
- settings persistence in localStorage (mocked)

Enforce 100% line + branch coverage.

### C) UI tests (required)
Use Playwright (or repo’s UI test framework if already present).

UI test requirements:
- Launch client (Vite) in test mode.
- Verify settings panel toggles exist for:
  - muzzle flash on/off
  - tracers on/off
  - decals on/off
  - aim pose debug overlay
  - attachment debug UI (if dev flag enabled)
- Verify toggles persist via localStorage.
- Verify the debug HUD counters update when synthetic events are injected.

**Important:** You do not need real WebRTC connectivity for UI tests.  
Implement a test-only “FakeNet” injection path that can feed deterministic snapshots/events into the renderer so UI tests can validate behavior without flakey WebRTC.

### D) Integration tests (recommended, still must be covered)
- Spin up server in a test mode (headless) and one browser client using Playwright.
- Exercise:
  - connect handshake
  - fire weapon → receive events → spawn muzzle/tracer/impact
- Keep deterministic by using scripted inputs.

### E) CI
- Add/extend CI config to run:
  - C++ tests + coverage
  - TS tests + coverage
  - Playwright UI tests
- CI must fail if any coverage < 100%.

---

## DOCUMENTATION UPDATES
Update or add:
- `docs/PROTOCOL.md`: new events, quantization, size rules, protocol version.
- `docs/NETCODE.md`: event scheduling relative to snapshots/prediction.
- `docs/RENDERING.md` + `docs/OUTLINES.md`: FX layers/material rules for toon + OutlinePass.
- `docs/WEAPONS_V2.md`: how to add weapon FX/attachments/surface types.

---

## DELIVERABLES / ACCEPTANCE CRITERIA
You are done only when all are true:

- V2 FX visible for all weapons: muzzle flash + tracer (where configured) + impact + decals (where enabled/LOD allows).
- Remote players show weapon aim pitch and have smooth gun pointing.
- Attachments can be configured and replicated.
- Heat/overheat works for energy weapons and drives VFX/SFX.
- Events are tick-aligned, batched, capped, and tolerant of packet loss.
- No OutlinePass artifacts from FX objects.
- **100% test coverage** for C++ and TS, and UI tests are implemented and passing.
- Docs updated.

---

## PROGRESS CHECKLIST (fill these in as you implement)

### Repo discovery / planning
- [ ] Confirm current protocol version usage and decide bump strategy (4 → 5 if needed)
- [ ] Identify existing GameEvent structures and current weapon fire events (V1)
- [ ] Identify how player models/weapon nodes are structured for aiming transforms
- [ ] Identify existing test frameworks for C++ and TS
- [ ] Identify existing CI pipeline or add one

### Schema / Protocol
- [ ] Update `shared/schema/afps_protocol.fbs` with V2 events
- [ ] Regenerate FlatBuffers outputs (C++ + TS)
- [ ] Update envelope msgType mappings if needed
- [ ] Update `docs/PROTOCOL.md` (new events, quantization, size rules)
- [ ] Add protocol encode/decode unit tests
- [ ] Add message-size enforcement tests

### Sim (shared/sim)
- [ ] Implement deterministic `ShotFiredFx` emission
- [ ] Implement deterministic `ShotTraceFx` emission (oct dir + hitDistQ + hitKind)
- [ ] Add surface type id to world hits (default mapping is real)
- [ ] Implement near-miss detection + `NearMissFx`
- [ ] Implement heat/overheat state machine + events
- [ ] Extend player state with `lookPitch` and/or aim pose data
- [ ] Add sim determinism tests (golden sequences)
- [ ] Ensure JS/WASM/native parity checks still pass

### Server
- [ ] Collect sim events per tick in `server/src/tick.cpp`
- [ ] Batch events into `GameEvent` messages on `afps_unreliable`
- [ ] Implement per-recipient LOD/culling rules
- [ ] Enforce hard size caps with priority dropping
- [ ] Add server unit tests for batching/LOD/size enforcement
- [ ] Add coverage instrumentation for server targets

### Client netcode
- [ ] Decode new events in `client/src/net/*`
- [ ] Implement tick-indexed event queue + late/drop handling
- [ ] Render events aligned to snapshot interpolation timeline
- [ ] Implement local predicted pre-play + dedupe by `(shooterId, shotSeq)`
- [ ] Add HUD metrics counters (events in/out, late, dropped)
- [ ] Add TS unit tests for event queue behavior
- [ ] Add TS unit tests for deterministic variant selection & quantization

### Rendering / VFX
- [ ] Implement pooled `MuzzleFlashFx` (unlit additive, OutlinePass-safe)
- [ ] Implement pooled `TracerFx`
- [ ] Implement pooled `ImpactFx` with surface types
- [ ] Implement pooled `DecalFx` with deterministic procedural atlas
- [ ] Implement optional pooled `ProjectileFx` (launchers/plasma)
- [ ] Ensure FX objects are excluded from OutlinePass
- [ ] Add TS tests for pool behavior and texture generation non-emptiness

### Gun pointing / aim pose
- [ ] Add snapshot support for `lookPitch` (and flags) OR AimPose events (or both)
- [ ] Implement smooth third-person aim application (clamp + interpolate)
- [ ] Add recoil overlay on `ShotFiredFx`
- [ ] Add tests for aim interpolation/clamping logic

### Attachments
- [ ] Add attachment definitions + modifiers
- [ ] Add server-authoritative loadout state
- [ ] Replicate loadout to clients (snapshot or reliable event)
- [ ] Implement client-side visual changes (muzzle flash/sound filtering/etc.)
- [ ] Add UI panel for attachments (dev/debug)
- [ ] Add unit tests for modifier application
- [ ] Add UI tests for attachment UI

### Heat / overheat
- [ ] Implement heat accumulation/cooling in sim
- [ ] Implement overheat forced cooldown and event
- [ ] Drive client VFX/SFX from heat (emissive + pitch)
- [ ] Add unit tests for heat state transitions

### UI tests + coverage gates
- [ ] Add Playwright setup (or repo standard UI framework)
- [ ] Add FakeNet injection path for deterministic UI tests
- [ ] UI tests for settings toggles + persistence
- [ ] UI tests for debug HUD counters reacting to injected events
- [ ] Add CI steps to run C++ + TS + UI tests
- [ ] Enforce **100%** line + branch coverage thresholds in CI
- [ ] Upload coverage artifacts (lcov) if CI supports

### Docs
- [ ] `docs/NETCODE.md` updated for event scheduling + dedupe
- [ ] `docs/RENDERING.md` updated for additive unlit FX + layers
- [ ] `docs/OUTLINES.md` updated to exclude FX
- [ ] Add `docs/WEAPONS_V2.md` for adding weapons/FX/surfaces/attachments

---

## OUTPUT INSTRUCTIONS
- Implement the changes across the repo. Keep commits small and cohesive.
- Ensure `npm test` (or repo equivalent), C++ tests, and Playwright tests all pass.
- Do not leave dead code paths. Do not leave debug-only hacks enabled by default.
- Deliver with docs + tests + coverage gating completed.

**Now implement Weapons V2 exactly as specified above.**
