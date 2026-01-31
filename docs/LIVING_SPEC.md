# Browser Multiplayer AFPS (Three.js + WebRTC + C++ Server)
**Living Spec + Implementation Playbook + Codex Prompt**

> **Time zone:** America/Chicago (CT)  
> **Rules:** This document is *the* source of truth. Keep it updated as you implement.  
> **How to use:** Paste this entire file into your Codex session *or* keep it in-repo at `docs/LIVING_SPEC.md` and always include it in your Codex context.

---

## Status Header (update every session)
- **Last updated:** `2026-01-31 13:43:12 CT`
- **Session author:** `codex`
- **Current milestone:** `M0`
- **Build status:** `client ✅` `server ✅` `e2e ❌`
- **Coverage gates met:** `client ✅` `server ❌` `mutation ❌` `fuzz ❌`
- **Netcode sanity:** `prediction ✅` `reconciliation ✅` `interpolation ✅`
- **Security sanity:** `https ✅` `auth ✅` `dtls ✅` `rate-limits ✅`
- **Known blockers:**  
  - `[ ] npm audit reports 6 vulnerabilities (5 moderate, 1 critical) in client deps`  

---

## Progress Log (append-only, timestamped)
> Add an entry for **every meaningful change**. Keep it short but concrete.  
> Format: `- [YYYY-MM-DD HH:mm:ss CT] (scope) summary (links: PR/commit/test run)`

- [2026-01-31 00:00:00 CT] (bootstrap) Initialized living spec template.
- [2026-01-31 07:51:00 CT] (scaffold) Added repo layout, client Three.js boot scene + tests, C++ HTTPS health server skeleton + tests, and runbooks/README.
- [2026-01-31 08:19:49 CT] (verification) Client tests/coverage pass; server build + ctest pass.
- [2026-01-31 08:33:44 CT] (decision) Selected libdatachannel for WebRTC transport.
- [2026-01-31 08:40:26 CT] (webrtc) Integrated libdatachannel via CMake, added RtcEchoPeer wrapper and loopback transport test.
- [2026-01-31 08:53:25 CT] (signaling) Added HTTPS signaling endpoints, in-memory session/connection store, JSON parsing, and tests.
- [2026-01-31 09:12:38 CT] (verification) Server build + ctest pass after signaling integration.
- [2026-01-31 09:13:03 CT] (verification) Client tests/coverage pass.
- [2026-01-31 09:14:05 CT] (verification) Server build + ctest pass after signaling pruning tweak.
- [2026-01-31 09:52:36 CT] (client-net) Added browser signaling/WebRTC connector, tests, and runtime config hook (VITE_SIGNALING_URL).
- [2026-01-31 09:53:37 CT] (docs) Added client signaling run command with env var.
- [2026-01-31 10:04:38 CT] (client-ui) Added connection status HUD and env helper; client tests/coverage remain at 100%.
- [2026-01-31 10:21:52 CT] (handshake) Added ClientHello/ServerHello protocol helpers, DataChannel handshake validation on client/server, and tests; client + server test runs green.
- [2026-01-31 10:34:27 CT] (datachannel) Added reliable/unreliable DataChannel labels, client waits for both channels, server creates both, and tests updated; client + server tests green.
- [2026-01-31 10:43:38 CT] (input) Added input sampler + InputCmd serialization + input sender modules on client, and server callbacks now report labeled channel messages; client + server tests green.
- [2026-01-31 10:47:10 CT] (input) Wired input sampler/sender into main to emit InputCmd over unreliable channel; client + server tests green.
- [2026-01-31 10:52:30 CT] (server-input) Server parses/queues InputCmd messages from unreliable channel after handshake; added parser tests and signaling test coverage.
- [2026-01-31 10:54:38 CT] (server-input) Added background drain loop in server main to log queued inputs.
- [2026-01-31 10:59:25 CT] (server-input) Added per-connection input rate limiting with tests.
- [2026-01-31 11:02:42 CT] (server-input) Added abuse handling for invalid/rate-limited inputs (close connection after threshold) and exposed config knobs.
- [2026-01-31 11:06:23 CT] (server-input) Added invalid-input close-path test and immediate connection removal on abuse.
- [2026-01-31 11:12:50 CT] (server-loop) Replaced input drain thread with fixed tick loop skeleton + deterministic tick accumulator tests; server build + ctest pass.
- [2026-01-31 11:22:15 CT] (auth) Required bearer token for /session, added auth helper/tests, wired client auth env var, and updated runbooks; client + server tests green.
- [2026-01-31 11:33:14 CT] (snapshot) Added minimal server-side tick sim + JSON StateSnapshot send, client snapshot parser + hook, and signaling helper for ready connections; client + server tests green.
- [2026-01-31 11:44:36 CT] (client-snapshot) Added snapshot buffer + interpolation, wired onSnapshot into app render, and expanded tests/coverage; client tests green.
- [2026-01-31 11:51:04 CT] (client-prediction) Added client prediction + reconciliation, wired inputs to render, and extended tests to preserve 100% coverage.
- [2026-01-31 12:00:24 CT] (net-metrics) Added Ping/Pong handling, RTT + snapshot age + drift overlay, and tests; client + server tests green.
- [2026-01-31 12:12:33 CT] (shared-sim) Added shared sim core/config + FlatBuffers schema draft, wired server tick to shared sim, and client prediction now reads shared config; tests added.
- [2026-01-31 12:22:12 CT] (client-look) Added pointer lock controller + camera look deltas wired from input sender; tests updated.
- [2026-01-31 12:26:48 CT] (client-sensitivity) Added env-configurable look sensitivity wiring; tests updated.
- [2026-01-31 12:31:18 CT] (hud) Added crosshair + pointer lock HUD panel with sensitivity display; tests updated.
- [2026-01-31 12:34:19 CT] (camera-follow) Camera now follows predicted/snapshot position for simple first-person view; tests updated.
- [2026-01-31 12:37:11 CT] (settings) Added settings overlay to adjust look sensitivity at runtime; tests updated.
- [2026-01-31 12:45:58 CT] (keybinds) Added keybind settings UI + persistence and sampler binding updates; tests updated.
- [2026-01-31 12:48:56 CT] (sensitivity-store) Added look sensitivity persistence (localStorage) and tests; settings now save to storage.
- [2026-01-31 12:52:57 CT] (docs) Added detailed settings UI documentation in docs/SETTINGS_UI.md.
- [2026-01-31 13:02:53 CT] (wasm-scaffold) Added WASM sim C API + build script and TS wrapper/tests (scaffold only).
- [2026-01-31 13:06:09 CT] (docs) Added WASM sim architecture/rationale documentation in docs/WASM_SIM.md.
- [2026-01-31 13:22:06 CT] (wasm-integration) Added sim_set_state to WASM ABI, client loader/adapter with VITE_WASM_SIM_URL toggle, prediction now supports WASM sim swap; docs/checklist updated and tests green.
- [2026-01-31 13:30:24 CT] (wasm-build) Added wasm sync script + npm script, updated README/WASM docs and runbook command for VITE_WASM_SIM_URL usage.
- [2026-01-31 13:32:35 CT] (shared-sim) Added golden input script test for deterministic movement in shared sim.
- [2026-01-31 13:33:09 CT] (verification) Server build + ctest pass after shared sim golden test.
- [2026-01-31 13:37:32 CT] (wasm-parity) Added optional JS-vs-WASM parity check on startup with env flag, plus tests and docs.
- [2026-01-31 13:38:37 CT] (verification) Client tests/coverage pass after WASM parity additions.
- [2026-01-31 13:40:42 CT] (wasm-parity) Added Node parity script + wasm build flag for node environment; documented npm run wasm:parity.
- [2026-01-31 13:41:40 CT] (wasm-parity) Added wasm:check npm script and runbook entry.
- [2026-01-31 13:43:12 CT] (ci) Added GitHub Actions workflow for client/server build + unit tests.

---

## Decision Log (append-only, timestamped)
> Record architectural decisions, tradeoffs, and “why”.

- [2026-01-31 08:19:49 CT] **Decision:** Use Vite + Three.js on client and cpp-httplib + OpenSSL for HTTPS health endpoint in M0.  
  **Context:** Needed fast browser boot with minimal scaffolding and a C++ HTTPS server skeleton.  
  **Alternatives considered:** Custom build tooling; Boost.Beast for HTTP.  
  **Why this:** Vite shortens iteration; cpp-httplib is single-header and easy to integrate with OpenSSL.  
  **Consequences:** Must vendor headers and keep an eye on upstream security updates.

- [2026-01-31 08:33:44 CT] **Decision:** Use libdatachannel for the C++ WebRTC DataChannel stack.  
  **Context:** Need secure DataChannels for browser-to-server gameplay with minimal integration overhead.  
  **Alternatives considered:** Google libwebrtc.  
  **Why this:** Smaller footprint and simpler build while meeting DataChannel requirements.  
  **Consequences:** If we add advanced media features later, we may need to reassess.

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
- [x] Sessions authenticated (JWT or opaque tokens) and short-lived.
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
- Session issuance requires `Authorization: Bearer <token>` (dev auth token).
- Implemented endpoints (dev): `POST /session`, `POST /webrtc/connect`, `POST /webrtc/answer`, `POST /webrtc/candidate`, `GET /webrtc/candidates`
- All requests:
- [x] authenticated
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

Implementation note (M0):
- Current handshake uses JSON strings on the reliable DataChannel.
- `ClientHello` fields: `type`, `protocolVersion`, `sessionToken`, `connectionId`, `build`.
- `ServerHello` fields: `type`, `protocolVersion`, `connectionId`, `clientId`, `serverTickRate`, `snapshotRate`, optional `motd`, `connectionNonce`.

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

Implementation note (M0):
- Current labels are `afps_reliable` and `afps_unreliable`.

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

Implementation note (M0):
- InputCmd is currently JSON-encoded on the client. Plan to move to FlatBuffers alongside other message types.
- Server currently parses InputCmd JSON and queues per connection (handshake required) in SignalingStore.
- StateSnapshot is currently JSON-encoded and sent on the unreliable channel at `snapshotRate`; client parses, buffers, and interpolates snapshots into the render loop.
- Ping/Pong are JSON-encoded on the unreliable channel and feed the net debug overlay (RTT, snapshot age, drift).
- SignalingStore enforces a per-connection input rate limiter (default 120 cmds/sec burst/refill).
- Excessive invalid or rate-limited inputs trigger connection closure (configurable thresholds).

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

Implementation note (M0):
- Client prediction/reconciliation is wired for the local player using shared XY movement constants (`shared/sim/config.json`), and the server tick now uses the shared sim core (`shared/sim/sim.h`); snapshots reset state and replay input history.

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
- [x] Implement pointer lock acquisition on click
- [x] Implement yaw/pitch camera controller with clamped pitch
- [x] Implement configurable look sensitivity
- [x] Implement input state aggregator that samples:
  - keys pressed (booleans)
  - mouse delta (per-frame, accumulated per tick)
  - wheel / weapon select
- [x] Convert to `InputCmd` per simulation tick
- [x] Serialize & send InputCmd over `dc_unreliable`

### Tests
- [x] Unit: input mapper produces correct InputCmd sequences
- [ ] Unit: sensitivity and pitch clamp
- [ ] Property: random input streams never produce NaN or invalid ranges
- [ ] E2E: headless browser can lock pointer (where supported) or simulate deltas

Implementation note (M0):
- Input sampler + InputCmd sender are wired in `main.ts` to emit InputCmd over `dc_unreliable`; they are not yet tied into a gameplay simulation loop.

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
- [x] Define baseline movement constants (moveSpeed, sprintMultiplier) in shared config
- [ ] Define advanced movement constants (accel, friction, gravity, jumpVel, etc.) in shared config
- [ ] Implement capsule-vs-world sweep + slide
- [ ] Implement ground detection with “walkable normal” threshold
- [ ] Implement dash (impulse + cooldown)
- [ ] Implement grapple:
  - raycast to hook point
  - while active: apply spring/pull force and optionally clamp max rope length
  - allow cancel
- [x] Scaffold WASM bindings (C API + TS wrapper)
- [x] Expose shared sim step() to TS via WASM bindings
- [x] Mirror same step() on server native build

### Tests
- [x] Unit: deterministic movement for known input script (golden test)
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
- [x] Implement UI components (crosshair + pointer lock hint + sensitivity + keybinds)
- [ ] Bind to state updates at render rate
- [x] Add settings menu (sensitivity)
- [x] Add settings menu (keybinds)

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
- [x] Choose library (libdatachannel)
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

Implementation note (M0):
- `main.cpp` runs a fixed-rate tick loop that drains inputs, advances the shared sim movement core, and emits JSON StateSnapshot messages on the unreliable channel at `snapshotRate`. Delta snapshots remain TODO.

Tests
- [x] Deterministic tick advancement in unit tests (no real sleeps)
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
- [x] Monorepo scaffolding (client/server/shared)
- [ ] Formatting + linting (TS + C++)
- [ ] CI pipeline:
  - [x] build client
  - [x] build server
  - [x] run unit tests
  - [ ] enforce coverage gates
  - [ ] run sanitizers
- [x] Web page boots with Three.js scene
- [x] C++ server boots and serves HTTPS health endpoint
- [x] Secure signaling stub (token issuance)
- [ ] WebRTC DataChannel connects in local environment (loopback)

## M1 — Local movement prototype (single player)
- [x] Pointer lock + camera
- [ ] Deterministic movement core (C++ + WASM)
- [ ] Collision with simple arena
- [x] HUD basic

## M2 — Multiplayer 1v1 (authoritative)
- [x] InputCmd sending
- [x] Server authoritative tick
- [x] Snapshot receive and interpolation
- [x] Prediction + reconciliation for local player
- [x] Ping + drift metrics
- [x] Minimal anti-abuse (rate limits, size limits)

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
- Client dev server: `cd client && npm install && npm run dev`
- Client dev server (with signaling): `cd client && VITE_SIGNALING_URL=https://localhost:8443 VITE_SIGNALING_AUTH_TOKEN=devtoken npm run dev`
- Client dev server (with WASM sim): `cd client && npm run wasm:build && VITE_WASM_SIM_URL=/wasm/afps_sim.js npm run dev`
- Client WASM parity check: `cd client && npm run wasm:check`
- Client tests: `cd client && npm test`
- Server build: `cd server && cmake -S . -B build && cmake --build build`
- Server tests: `cd server && ctest --test-dir build`
- E2E tests: `TBD`
- Coverage reports: `TBD`
- Fuzzers: `TBD`

## 11.2 Debugging netcode
- Net debug overlay shows ping, drift, snapshot age
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
