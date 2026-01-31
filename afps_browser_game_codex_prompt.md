# Browser Multiplayer AFPS (Three.js + WebRTC + C++ Server)
**Living Spec + Implementation Playbook + Codex Prompt**

> **Time zone:** America/Chicago (CT)  
> **Rules:** This document is *the* source of truth. Keep it updated as you implement.  
> **How to use:** Paste this entire file into your Codex session *or* keep it in-repo at `docs/LIVING_SPEC.md` and always include it in your Codex context.

---

## Status Header (update every session)
- **Last updated:** `[YYYY-MM-DD HH:mm:ss CT]`
- **Session author:** `[name/handle]`
- **Current milestone:** `[M0/M1/M2…]`
- **Build status:** `client ✅/❌` `server ✅/❌` `e2e ✅/❌`
- **Coverage gates met:** `client ✅/❌` `server ✅/❌` `mutation ✅/❌` `fuzz ✅/❌`
- **Netcode sanity:** `prediction ✅/❌` `reconciliation ✅/❌` `interpolation ✅/❌`
- **Security sanity:** `https ✅/❌` `auth ✅/❌` `dtls ✅/❌` `rate-limits ✅/❌`
- **Known blockers:**  
  - `[ ] (none)`  
  - `[ ] …`

---

## Progress Log (append-only, timestamped)
> Add an entry for **every meaningful change**. Keep it short but concrete.  
> Format: `- [YYYY-MM-DD HH:mm:ss CT] (scope) summary (links: PR/commit/test run)`

- [2026-01-31 00:00:00 CT] (bootstrap) Initialized living spec template.

---

## Decision Log (append-only, timestamped)
> Record architectural decisions, tradeoffs, and “why”.

- [YYYY-MM-DD HH:mm:ss CT] **Decision:** …  
  **Context:** …  
  **Alternatives considered:** …  
  **Why this:** …  
  **Consequences:** …

---

## Codex Operating Instructions (read this first)
You are **Codex**, acting as a senior game/network engineer and test engineer. Your output must be **production-quality** and **test-first**.

### Non-negotiables
- **Browser client:** TypeScript + Three.js + Web APIs (Pointer Lock, Web Audio, WebRTC).
- **Transport:** WebRTC **DataChannels** (must be secure) between client and **authoritative C++ server**.
- **Security:** HTTPS for all web + signaling; strict input validation; rate limiting; replay & abuse resistance.
- **Quality:** **100% test coverage (and beyond)** for client and server:
  - 100% line coverage is the *floor*.
  - Target 100% branch coverage where practical.
  - Add **mutation testing**, **property-based testing**, and **fuzzing** for critical parsers and network surfaces.
- **No “TODO: later”** in shipping code paths. If something is stubbed, it must be feature-flagged and tested.
- **Every feature includes docs + tests + telemetry hooks**.

### Definition of Done (DoD)
A task is “done” only when:
- [ ] Implemented in client/server as applicable
- [ ] Unit tests added (and passing)
- [ ] Integration tests added (and passing)
- [ ] Coverage gates remain at 100%+
- [ ] Fuzz/property tests cover parsers & serializers
- [ ] Documentation updated in this file
- [ ] Security review checklist updated
- [ ] Performance budget unchanged or improved (or explicitly approved)

### Output expectations for Codex
When you implement a feature, always produce:
1. **Plan** (bulleted, ordered)
2. **Code changes** (with file paths)
3. **Tests** (unit + integration)
4. **How to run** (commands)
5. **Docs update** (edit this file’s relevant section)
6. **Risks & mitigations**

---

# 1) Product Definition

## 1.1 Elevator pitch
A fast, skill-based, **arena FPS** in the browser with:
- High-speed movement (air control, dash, grapple)
- Responsive gunplay (hitscan + projectile)
- 1v1 duel baseline, expandable to small matches
- Stylized visuals (toon shading + outlines)
- **Server-authoritative multiplayer** with client prediction

## 1.2 Goals
- **Feel**: crisp input, minimal latency feel via prediction & reconciliation.
- **Fair**: server-authoritative; clients can’t cheat by sending state.
- **Secure**: modern transport security + robust abuse controls.
- **Fast iteration**: deterministic simulation core and tight test loops.
- **Stable**: reproducible tests with deterministic tick simulation.

## 1.3 Non-goals (initially)
- [ ] Massive player counts (start with 1v1 / small)
- [ ] Voice chat / media streams
- [ ] User-generated content pipelines
- [ ] Ranked ladder / complex matchmaking (later milestone)

---

# 2) Architecture Overview

## 2.1 High-level diagram
```
+-------------------+                  +-------------------------+
| Browser Client    |  HTTPS (TLS)     | Signaling / Web Server  |
| TypeScript        |<---------------->| (C++ HTTPS endpoint)    |
| Three.js Renderer |                  | Auth + session issuance |
| WebRTC DataChan   |                  +-------------------------+
|                   |
|  WebRTC (DTLS/SCTP DataChannel)  <---->  C++ Game Server
|  ICE/STUN/TURN                       (Authoritative Simulation)
+-------------------+                  +-------------------------+
```
**Note:** Signaling can be part of the game server process or a separate C++ service, but it must be HTTPS and share auth/session state.

## 2.2 Threading & tick model
### Server
- Fixed simulation tick: **60 or 120 Hz** (choose and document)
- Snapshot broadcast: **20–30 Hz** (tunable)
- Maintain **history buffer** for lag compensation (hitscan) and debugging replays.

### Client
- Render loop: `requestAnimationFrame`
- Local simulation/prediction tick: fixed (match server tick if possible)
- Input sampling: per-frame, packaged per tick

## 2.3 Determinism strategy (recommended)
To make prediction/reconciliation reliable across JS and C++:
- Implement **movement + weapon ballistics core** in **shared C++** compiled to:
  - native for server
  - **WASM** for client (via Emscripten)
- The TS client calls into WASM for deterministic step() updates.
- Three.js is *render-only*; authoritative state lives in shared sim data.

✅ This reduces “JS float drift” and makes test comparisons exact.

---

# 3) Repo Layout (recommended)
```
/client
  /src
  /tests
/shared
  /sim          (C++ deterministic sim core)
  /schema       (FlatBuffers/Protobuf schemas)
  /wasm         (Emscripten build + TS bindings)
/server
  /src
  /tests
  /third_party  (webrtc transport lib, etc.)
/tools
/docs
  LIVING_SPEC.md (this file)
```

---

# 4) Security Model (WebRTC DataChannels “must be secure”)

## 4.1 Threat model (minimum)
- **Network attacker**: tries MITM signaling, inject messages, replay old packets.
- **Malicious client**: sends malformed/oversized messages, spams inputs, attempts speed hacks.
- **Abuse**: connection floods, resource exhaustion, TURN abuse.
- **Privacy**: protect account/session tokens and avoid leaking PII.

## 4.2 Security invariants
- [ ] All web + signaling endpoints are **HTTPS** with HSTS.
- [ ] Sessions authenticated (JWT or opaque tokens) and short-lived.
- [ ] WebRTC uses **DTLS** (built-in) and rejects insecure configs.
- [ ] DataChannel messages are **validated, bounded, versioned**.
- [ ] Server never trusts client state; only accepts **inputs**.
- [ ] Rate limits per IP + per session + per connection.
- [ ] TURN credentials are time-limited (TURN REST).
- [ ] Observability: audit logs for auth + connection lifecycle + abuse events.

## 4.3 Signaling design (secure)
### Requirements
- HTTPS endpoint(s) for:
  - Create session / login (if applicable)
  - Obtain WebRTC offer/answer exchange
  - ICE candidate exchange (or trickle via HTTPS)
- All requests:
  - [ ] authenticated
  - [ ] CSRF protected (if cookies used)
  - [ ] size-limited
  - [ ] rate-limited
  - [ ] structured logging w/ request IDs

### Recommended: “Server-driven offer” pattern
1. Client requests a session: `POST /session` → returns `sessionToken`.
2. Client requests to connect: `POST /webrtc/connect` with token.
3. Server returns SDP **offer** + ICE servers list.
4. Client creates RTCPeerConnection, sets remote offer, creates **answer**.
5. Client POSTs answer back: `POST /webrtc/answer`.
6. Trickle ICE candidates via HTTPS (or include in answer once gathered).
7. DataChannels open → start game-level handshake.

✅ Benefits: simpler auth and server control.

## 4.4 Game-level handshake (mandatory)
Even though DTLS provides encryption, do a game handshake to bind identity and enforce protocol versioning:
- Client sends `ClientHello` on **reliable** channel:
  - protocol version
  - build hash
  - session token (or token-derived proof)
  - client capabilities (tick rate, input device flags)
- Server responds `ServerHello`:
  - assigns `clientId/playerId`
  - sends server tick rate + snapshot rate
  - returns accepted protocol version
  - optional “motd”, ruleset hash
- Server closes connection if:
  - invalid token / expired
  - wrong protocol version
  - message violates size limits
  - too many attempts

## 4.5 Anti-replay & abuse control
- Use per-connection random `connectionNonce` established in ServerHello.
- Every client message includes:
  - monotonically increasing `msgSeq`
  - last received `serverSeqAck`
  - HMAC is not required (DTLS integrity), but sequence checks are.
- Hard caps:
  - max messages/sec
  - max bytes/sec
  - max per-message size
- Disconnect with reason codes; log + metrics.

---

# 5) Networking & Protocol (WebRTC DataChannels)

## 5.1 DataChannel setup
Create **two** DataChannels:
1. `dc_reliable`: ordered + reliable (default)
2. `dc_unreliable`: unordered + unreliable (`maxRetransmits: 0`)

Routing rule:
- Reliable: handshake, join/leave, chat, settings, match state, errors
- Unreliable: input commands, state snapshots, transient events (impacts)

## 5.2 Serialization & versioning
### Recommended
- Use **FlatBuffers** for binary messages (C++ + TS codegen).
- Each message starts with:
  - magic `"AFPS"` (4 bytes)
  - `u16 protocolVersion`
  - `u16 msgType`
  - `u32 payloadBytes`
  - payload (FlatBuffer root)

### Version policy
- Increment protocolVersion for any breaking change.
- Server supports `N` and `N-1` for smooth deployments (optional later).
- Tests enforce backward compatibility for supported versions.

## 5.3 Message types (initial)
- `ClientHello` (reliable)
- `ServerHello` (reliable)
- `JoinRequest` / `JoinAccept` (reliable)
- `InputCmd` (unreliable, high rate)
- `StateSnapshot` (unreliable, medium rate)
- `GameEvent` (unreliable or reliable depending)
- `Ping`/`Pong` (unreliable; also can use RTCPeerConnection stats)
- `Error` + `Disconnect` (reliable)

## 5.4 Tick & sequencing
- Server tick: `serverTick` increments each sim step.
- Client input: `inputSeq` increments each client sim step where input is sampled.
- Server includes in snapshots:
  - `serverTick`
  - `lastProcessedInputSeq` per player (or per connection)
- Client reconciliation uses `lastProcessedInputSeq` as the rewind anchor.

## 5.5 Bandwidth strategy
- Quantize values (positions, angles, velocities) to fixed ranges.
- Use delta snapshots for entities.
- Cap snapshot size; prioritize:
  - local player full precision
  - nearby enemies higher precision
  - far objects lower precision or culled

---

# 6) Simulation: Server-Authoritative with Client Prediction

## 6.1 Authoritative rules
- Client sends **inputs only** (movement keys, view angles, fire, ability triggers).
- Server simulates:
  - movement, collisions
  - weapons + damage
  - abilities
- Server sends snapshots + events.
- Client renders predicted local state and interpolated remote state.

## 6.2 Client prediction & reconciliation algorithm
1. Maintain `inputHistory[inputSeq] = InputCmd`.
2. Each tick:
   - sample input → push history → apply to local predicted sim
   - send InputCmd (unreliable)
3. On snapshot receive:
   - set authoritative state for local player at `lastProcessedInputSeq`
   - rewind local predicted state to that authoritative state
   - replay all inputs from `lastProcessedInputSeq+1 … currentInputSeq`
4. If error > threshold:
   - snap or aggressively converge (configurable)
5. For other players:
   - buffer snapshots and render interpolated “presentation state”

## 6.3 Lag compensation (hitscan)
Server maintains recent history of entity poses for ~200ms.
When processing a hitscan shot:
- Determine client shot time estimate (`clientTime` mapped to server time via RTT)
- Rewind target positions to that time
- Perform ray test
- Apply damage authoritatively
- Broadcast hit event

---

# 7) Feature Implementation Docs (detailed)

## 7.1 FPS Controls (Pointer Lock + input)
### Requirements
- Mouse look via Pointer Lock API
- Configurable sensitivity
- Keybinds: WASD, jump, crouch, dash, grapple, shoot, alt, reload, switch weapon
- Input sampling independent of render framerate

### Implementation steps
- [ ] Implement pointer lock acquisition on click
- [ ] Implement yaw/pitch camera controller with clamped pitch
- [ ] Implement input state aggregator that samples:
  - keys pressed (booleans)
  - mouse delta (per-frame, accumulated per tick)
  - wheel / weapon select
- [ ] Convert to `InputCmd` per simulation tick
- [ ] Serialize & send InputCmd over `dc_unreliable`

### Tests
- [ ] Unit: input mapper produces correct InputCmd sequences
- [ ] Unit: sensitivity and pitch clamp
- [ ] Property: random input streams never produce NaN or invalid ranges
- [ ] E2E: headless browser can lock pointer (where supported) or simulate deltas

---

## 7.2 Movement & Character Controller (AFPS feel)
### Target feel
- Snappy acceleration
- Air control (tunable)
- Jump with consistent height
- Dash impulse (cooldown)
- Grapple pull (rope-like or direct)

### Core model (shared sim C++ → WASM)
Represent player as:
- capsule collider (radius, height)
- position, velocity
- grounded state
- wishDir from inputs
- viewYaw/viewPitch used only for wishDir computation

### Movement loop per tick (high level)
1. Compute wish direction from inputs + yaw
2. Apply acceleration:
   - if grounded: ground accel + friction
   - if air: air accel + air control
3. Apply gravity when not grounded
4. Integrate velocity → proposed position
5. Resolve collisions (sweep capsule vs world)
6. Update grounded based on contact normals
7. Apply abilities (dash/grapple) as impulses or constraints

### Collision strategy (start simple)
Phase 1: use simple colliders (AABBs/planes) for arenas so both client+server match easily.
Phase 2: add static triangle mesh + BVH sweeps.

### Implementation steps
- [ ] Define movement constants (accel, friction, gravity, jumpVel, etc.) in shared config
- [ ] Implement capsule-vs-world sweep + slide
- [ ] Implement ground detection with “walkable normal” threshold
- [ ] Implement dash (impulse + cooldown)
- [ ] Implement grapple:
  - raycast to hook point
  - while active: apply spring/pull force and optionally clamp max rope length
  - allow cancel
- [ ] Expose shared sim step() to TS via WASM bindings
- [ ] Mirror same step() on server native build

### Tests
- [ ] Unit: deterministic movement for known input script (golden test)
- [ ] Unit: collision slide on walls and floors
- [ ] Unit: jump height within tolerance
- [ ] Property: no NaNs, no tunneling through thin walls within configured speed
- [ ] Cross-check: C++ native vs WASM produce identical state per tick (bit-exact or within quantized epsilon)

---

## 7.3 Weapons: Hitscan + Projectile
### Common rules
- Server authoritative on damage
- Client can predict muzzle flash, recoil, tracer
- Server emits `GameEvent::ShotFired`, `HitConfirmed`, `DamageDealt`, `Death`

### Hitscan weapon
- Client sends input “fire pressed” with view angles per tick
- Server performs raycast with lag compensation
- Server applies damage, knockback, and hit markers events

**Lag compensation requirements**
- Maintain `poseHistory[serverTick]` for each player
- Map client fire tick → estimated server tick
- Rewind targets, raycast, restore

### Projectile weapon (rocket/plasma)
- Server spawns projectile entity with:
  - position, velocity
  - ownerId
  - ttl
- Server simulates projectile movement/collisions
- On impact: explosion radius damage (LOS optional)

### Implementation steps
- [ ] Add weapon definitions (damage, ROF, spread, projectile speed)
- [ ] Implement server-side raycast against world + players
- [ ] Implement server-side projectile sim + collision
- [ ] Add client VFX prediction (tracer/projectile)
- [ ] Add reconciliation for projectiles (optional early: server-only projectiles with interpolation)

### Tests
- [ ] Unit: hitscan ray hits expected target in fixed scene
- [ ] Unit: lag compensation rewinds correctly
- [ ] Unit: projectile impact + explosion damage distribution
- [ ] Property: no negative health, no double-kill race bugs
- [ ] Fuzz: malformed weapon events rejected safely

---

## 7.4 Abilities (dash, grapple, shield, push/shockwave)
> Implement one at a time; each ability must have a crisp spec and cooldown rules.

### Dash
- Inputs: dashPressed
- Rules:
  - cooldown
  - impulse along wishDir
  - optional air dash count
- Tests:
  - [ ] cooldown enforced
  - [ ] dash distance within range

### Grapple
- Inputs: grapplePressed, grappleHeld, grappleReleased
- Rules:
  - raycast to valid surfaces
  - attach point stored
  - pull force while held
  - break if distance > max or LOS lost
- Tests:
  - [ ] attaches only to allowed surfaces
  - [ ] consistent pull across client/server

### Shield
- Inputs: shieldPressed/held
- Rules:
  - duration + cooldown
  - reduces incoming damage or blocks from direction
  - server authoritative damage calc
- Tests:
  - [ ] damage reduction math
  - [ ] directionality (if used)

### Push / Shockwave
- Inputs: abilityPressed
- Rules:
  - radial impulse + optional small damage
  - cooldown
  - server clamps max impulse
- Tests:
  - [ ] applies impulse to nearby players only
  - [ ] LOS rules (if required)

---

## 7.5 Rendering (Three.js) + Stylized Look
### Goals
- Clean readability at high speed
- Toon shading + outlines
- Low-poly assets, minimal textures

### Toon shading
Options:
1. Custom ShaderMaterial with stepped lighting (“ramp”)
2. Use MeshToonMaterial + custom gradient map
3. Hybrid: toon material + baked AO

Implementation steps
- [ ] Choose toon approach (Decision Log)
- [ ] Implement base toon material pipeline
- [ ] Ensure consistent gamma/tonemapping
- [ ] Add simple directional light + ambient
- [ ] Add weapon/hand material with stronger outlines

### Outlines
Options:
1. Post-process edge detection using depth+normal
2. Three.js OutlinePass (selective)
3. Inverted hull for specific meshes (weapon/hands)

Implementation steps
- [ ] Choose outline approach (Decision Log)
- [ ] Implement via EffectComposer
- [ ] Tune thresholds to avoid noisy edges
- [ ] Add “hit flash” or team outline as needed

### Tests
- [ ] Snapshot tests for shader compilation (headless WebGL where possible)
- [ ] Render sanity checks: no shader compile errors in CI
- [ ] Performance test: frame time budget under baseline scene

---

## 7.6 UI / HUD
### Requirements
- Crosshair, hitmarker, damage numbers (optional)
- Health/armor/ammo
- Ability cooldowns
- Scoreboard for 1v1
- Net stats (ping, packet loss, tick drift) toggleable

Implementation approach
- HTML/CSS overlay (recommended for speed)
- Minimal canvas for crosshair if needed

Implementation steps
- [ ] Define HUD state model (derived from sim + net)
- [ ] Implement UI components
- [ ] Bind to state updates at render rate
- [ ] Add settings menu (sensitivity, keybinds)

### Tests
- [ ] Unit: UI state reducers
- [ ] E2E: HUD elements appear with simulated state changes

---

## 7.7 Audio
### Requirements
- Weapon fire sounds, impacts, footsteps
- Spatial audio for opponents
- Volume sliders + mute
- Low latency

Implementation steps
- [ ] Web Audio graph setup
- [ ] Asset loading + caching
- [ ] Positional audio per entity
- [ ] Mix groups (SFX, UI, Music)

Tests
- [ ] Unit: audio manager state machine
- [ ] E2E: play triggers do not throw; assets load

---

## 7.8 Performance Budgets (browser)
### Budgets (set and enforce)
- [ ] Initial download size: `< X MB` (set)
- [ ] Time-to-interactive: `< Y s` on mid-tier machine
- [ ] Frame time: `< 16.6ms` at 60fps baseline scene
- [ ] Snapshot bandwidth: `< Z kbps` per client target

Implementation practices
- Use glTF + compression
- Reduce draw calls (instancing/merge)
- Limit transparent particles
- Bake lighting where possible

Tests
- [ ] Automated perf smoke (CI) with budget thresholds
- [ ] Memory leak checks (long-run test)

---

# 8) Server (C++) Implementation Plan

## 8.1 Components
- **HTTPS signaling** endpoints
- **WebRTC DataChannel transport**
- **Match/room manager** (1v1 first)
- **Simulation loop** (authoritative)
- **Snapshot builder** + delta compression
- **Lag compensation** history
- **Telemetry** (logs, metrics, tracing)
- **Security** (auth, rate limits, validation)

## 8.2 WebRTC stack choices (record decision)
- Option A: Google libwebrtc (heavy, full-featured)
- Option B: `libdatachannel` (focused, simpler integration)
- Option C: Custom (not recommended)

Decision checklist
- [ ] Choose library
- [ ] License reviewed
- [ ] Build + CI integration complete
- [ ] ICE/STUN/TURN supported as required
- [ ] DTLS enabled by default

## 8.3 Tick loop skeleton
- `while (running)`:
  - process incoming DataChannel messages → enqueue inputs
  - step sim fixed dt (possibly multiple steps if behind)
  - build snapshot per client
  - send snapshots/events
  - sleep/yield (or busy tick with precise timer)

Tests
- [ ] Deterministic tick advancement in unit tests (no real sleeps)
- [ ] Load test harness with simulated clients

---

# 9) Testing Strategy (100%+ coverage)

## 9.1 Coverage gates
Client (TS):
- [ ] 100% line coverage
- [ ] 100% branch coverage (target; allow exceptions with justification doc)
- [ ] Mutation testing threshold: `>= X%`

Server (C++):
- [ ] 100% line coverage
- [ ] High branch coverage
- [ ] Sanitizers (ASan/UBSan) in CI
- [ ] Fuzzing for protocol decode paths

## 9.2 Test layers
1. **Unit tests**: math, sim step, serialization, validation
2. **Integration tests**:
   - C++ server + headless browser client (Playwright) over WebRTC
3. **Property tests**:
   - random input scripts preserve invariants
4. **Fuzz tests**:
   - DataChannel message parser and schema decode
5. **Replay/golden tests**:
   - run input script → deterministic output snapshot hashes

## 9.3 Invariants (examples)
- Position finite; velocity finite
- Health in [0, max]
- Cooldowns never negative
- inputSeq monotonic per client
- snapshot ticks monotonic
- No message accepted > max bytes
- No entity count > configured cap

---

# 10) Milestones & Checklists

## M0 — Skeleton & CI green
- [ ] Monorepo scaffolding (client/server/shared)
- [ ] Formatting + linting (TS + C++)
- [ ] CI pipeline:
  - [ ] build client
  - [ ] build server
  - [ ] run unit tests
  - [ ] enforce coverage gates
  - [ ] run sanitizers
- [ ] Web page boots with Three.js scene
- [ ] C++ server boots and serves HTTPS health endpoint
- [ ] Secure signaling stub (token issuance)
- [ ] WebRTC DataChannel connects in local environment (loopback)

## M1 — Local movement prototype (single player)
- [ ] Pointer lock + camera
- [ ] Deterministic movement core (C++ + WASM)
- [ ] Collision with simple arena
- [ ] HUD basic

## M2 — Multiplayer 1v1 (authoritative)
- [ ] InputCmd sending
- [ ] Server authoritative tick
- [ ] Snapshot receive and interpolation
- [ ] Prediction + reconciliation for local player
- [ ] Ping + drift metrics
- [ ] Minimal anti-abuse (rate limits, size limits)

## M3 — Weapons (hitscan + projectile) + damage
- [ ] Hitscan with lag compensation
- [ ] Projectile weapon
- [ ] Damage, respawn, scoring
- [ ] VFX feedback (hitmarkers)

## M4 — Abilities + polish
- [ ] Dash
- [ ] Grapple
- [ ] Shield
- [ ] Shockwave/push
- [ ] UI polish + settings

## M5 — Stylized rendering + perf budgets
- [ ] Toon shading
- [ ] Outlines
- [ ] Performance tests and budgets enforced

---

# 11) Runbooks

## 11.1 Dev commands (fill in)
- Client dev server: `[command]`
- Client tests: `[command]`
- Server build: `[command]`
- Server tests: `[command]`
- E2E tests: `[command]`
- Coverage reports: `[command]`
- Fuzzers: `[command]`

## 11.2 Debugging netcode
- Enable net debug overlay (ping, tick drift, snapshot age)
- Record input scripts and replay
- Server: enable per-connection message counters

---

# 12) Documentation Tasks (ongoing)
- [ ] Keep this spec updated
- [ ] Add `docs/PROTOCOL.md` with message schema and examples
- [ ] Add `docs/SECURITY.md` with threat model + mitigations
- [ ] Add `docs/NETCODE.md` with prediction/reconciliation explanation
- [ ] Add `docs/RENDERING.md` with toon/outlines pipeline

---

# Appendix A — Protocol Schema Checklist (FlatBuffers)
- [ ] Define `.fbs` for all message types
- [ ] Generate C++ + TS bindings in CI
- [ ] Add schema version constant
- [ ] Add fuzz target that mutates binary payloads and ensures safe reject

---

# Appendix B — Secure TURN Setup Checklist
- [ ] Deploy TURN server (coturn)
- [ ] Configure TURN REST credentials (time-limited)
- [ ] Ensure TLS for TURN where appropriate
- [ ] Rate limit allocations
- [ ] Monitor bandwidth + abuse alarms

---

# Appendix C — “Beyond 100% coverage” ideas
- [ ] Mutation testing (TS: Stryker; C++: Mull or equivalent)
- [ ] Property-based testing (TS: fast-check; C++: RapidCheck)
- [ ] Fuzzing (libFuzzer/AFL) for message parsers
- [ ] Deterministic replays in CI
- [ ] Chaos tests: packet loss, reordering, burst jitter simulations

---

> End of living spec. Keep shipping.
