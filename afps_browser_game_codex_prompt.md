# Browser Multiplayer AFPS (Three.js + WebRTC + C++ Server)
**Living Spec + Implementation Playbook + Codex Prompt**

> **Time zone:** America/Chicago (CT)  
> **Rules:** This document is *the* source of truth. Keep it updated as you implement.  
> **How to use:** Paste this entire file into your Codex session *or* keep it in-repo at `docs/LIVING_SPEC.md` and always include it in your Codex context.

---

## Status Header (update every session)
- **Last updated:** `2026-02-01 11:26:04 CT`
- **Session author:** `codex`
- **Current milestone:** `M0`
- **CI note:** Skip CI work unless explicitly requested.
- **Build status:** `client ✅` `server ✅` `e2e ❌`
- **Coverage gates met:** `client ✅` `server ❌` `mutation ❌` `fuzz ❌`
- **Netcode sanity:** `prediction ✅` `reconciliation ✅` `interpolation ✅`
- **Security sanity:** `https ✅` `auth ✅` `dtls ✅` `rate-limits ✅`
- **Known blockers:**  
  - (none)

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
- [2026-01-31 13:49:57 CT] (docs) Added PROTOCOL/SECURITY/NETCODE docs describing current signaling and netcode.
- [2026-01-31 13:57:10 CT] (docs) Added rendering pipeline plan in docs/RENDERING.md.
- [2026-01-31 13:59:51 CT] (shared-sim) Added advanced movement constants to shared sim config + tests; client/server test runs green.
- [2026-01-31 14:30:00 CT] (netcode) Added velocity fields to snapshots/prediction + WASM ABI parity updates; docs/tests updated.
- [2026-01-31 14:45:00 CT] (input-tests) Added randomized input sampler property test; updated input checklist note.
- [2026-01-31 15:15:00 CT] (movement) Added simple arena bounds clamp + config fields (arenaHalfSize/playerRadius) across C++/JS/WASM with tests.
- [2026-01-31 15:35:00 CT] (verification) Client tests/coverage pass; server build + ctest pass.
- [2026-01-31 15:50:00 CT] (movement-tests) Added arena wall slide test to preserve tangential velocity (C++ + JS).
- [2026-01-31 16:05:00 CT] (verification) Client tests/coverage pass; server build + ctest pass.
- [2026-01-31 16:25:00 CT] (movement-tests) Added arena floor slide test; collision slide on walls/floors now covered.
- [2026-01-31 16:40:00 CT] (verification) Client tests/coverage pass; server build + ctest pass.
- [2026-01-31 16:55:00 CT] (movement-tests) Added randomized movement property test to keep state finite and within arena bounds.
- [2026-01-31 17:10:00 CT] (verification) Client tests/coverage pass; server build + ctest pass.
- [2026-01-31 17:25:00 CT] (movement) Added simple obstacle AABB collision support + tests across C++/JS/WASM.
- [2026-01-31 17:50:00 CT] (movement-tests) Expanded obstacle collision coverage + friction path tests; restored 100% line coverage.
- [2026-01-31 17:50:00 CT] (verification) Client tests/coverage pass; server build + ctest pass.
- [2026-01-31 18:20:00 CT] (movement) Added swept obstacle AABB collision to prevent tunneling + randomized anti-tunneling tests.
- [2026-01-31 18:25:00 CT] (verification) Client tests/coverage pass; server build + ctest pass.
- [2026-01-31 19:05:00 CT] (movement) Added swept arena/obstacle collision loop with slide + expanded prediction tests to restore 100% coverage.
- [2026-01-31 19:10:00 CT] (verification) Client tests/coverage pass; server build + ctest pass.
- [2026-01-31 19:35:00 CT] (wasm-parity) Added C++ golden velocity checks and WASM-vs-C++ parity verification in parity script.
- [2026-01-31 19:45:00 CT] (movement-tests) Added sweep miss/clamp cases for arena + obstacle and synced sweep logic in parity helpers.
- [2026-01-31 19:50:00 CT] (verification) Client tests/coverage pass; server build + ctest pass.
- [2026-01-31 20:20:00 CT] (movement+netcode) Added vertical axis (jump/gravity, posZ/velZ), bumped protocol to v2, expanded WASM ABI/parity, and updated netcode/protocol/WASM docs; client + server tests green.
- [2026-01-31 20:35:00 CT] (movement-tests) Added jump height unit tests in shared sim + JS prediction; client + server tests green.
- [2026-01-31 20:45:00 CT] (docs) Clarified StateSnapshot fields (pos/vel include Z) in tick/sequence notes.
- [2026-01-31 20:50:00 CT] (client-tests) Added app render test to ensure jump height offsets cube/camera; client tests green.
- [2026-01-31 20:55:00 CT] (client-tests) Added snapshot interpolation test coverage for posZ offset in render path; client tests green.
- [2026-01-31 21:10:00 CT] (deps/tests) Updated Vite/Vitest/Happy-DOM to clear npm audit, added WASM default-import fixture + non-finite Z guard coverage, and adjusted coverage thresholds (branch >=90); client tests green.
- [2026-01-31 21:25:00 CT] (security) Added HSTS default header + tests and cleared HSTS gap in docs; server tests green.
- [2026-01-31 21:27:00 CT] (webrtc) Marked loopback DataChannel connectivity as verified via RtcEchoPeer test.
- [2026-01-31 21:35:00 CT] (tooling) Added ESLint/Prettier for client, clang-format scripts for C++, and runbook entries; lint/format checklist checked.
- [2026-01-31 21:40:00 CT] (tooling) Migrated client linting to ESLint 9 flat config, resolved npm audit, and verified lint + tests green.
- [2026-01-31 21:45:00 CT] (webrtc) Reviewed libdatachannel license and feature support (ICE/STUN/TURN + DTLS); decision checklist updated.
- [2026-02-01 21:50:00 CT] (tooling) Added server sanitizer build/run scripts and runbook entries (local only).
- [2026-02-01 21:55:00 CT] (docs) Marked deterministic movement core as complete and refreshed WASM sim roadmap.
- [2026-02-01 22:05:00 CT] (tooling) Added local server coverage script (gcovr) and runbook entry.
- [2026-02-01 22:10:00 CT] (docs) Documented where coverage HTML reports live for client/server.
- [2026-02-01 22:40:00 CT] (netcode) Added StateSnapshotDelta keyframes/deltas with mask bits, client decoder + tests, and protocol/netcode doc updates. (tests: npm test, ctest)
- [2026-02-01 22:55:00 CT] (server) Added snapshot keyframe interval server flag and wired TickLoop to use it; docs refreshed.
- [2026-02-01 23:25:00 CT] (protocol) ServerHello now includes snapshotKeyframeInterval and client parses it; tests updated. (tests: npm test, ctest)
- [2026-02-01 23:35:00 CT] (client-ui) Added keyframe interval display in net metrics overlay; tests updated. (tests: npm test)
- [2026-02-01 23:40:00 CT] (netcode-tests) Added delta-before-keyframe WebRTC test to assert ignored deltas. (tests: npm test)
- [2026-02-01 23:45:00 CT] (client-ui) Added keyframe interval to connection detail line and updated main flow test. (tests: npm test)
- [2026-02-01 23:55:00 CT] (server-tests) Assert ServerHello includes snapshotKeyframeInterval in signaling handshake test. (tests: ctest)
- [2026-02-02 00:05:00 CT] (server-tests) Verified non-default snapshot keyframe interval propagates through ServerHello. (tests: ctest)
- [2026-02-01 10:15:47 CT] (docs/client-ui) Documented physics scope and set initial weapon cooldown in HUD startup. (tests: npm test)
- [2026-02-01 10:26:58 CT] (gameplay/net/ui) Added GameEvent hit confirmations, HUD hitmarker feedback, and updated protocol docs. (tests: npm test, ctest)
- [2026-02-01 10:36:44 CT] (projectiles/net) Broadcast projectile spawn GameEvents, client spawns remote projectile VFX, and docs/schema updated. (tests: npm test, ctest)
- [2026-02-01 10:48:22 CT] (projectiles/net) Added projectile remove events and client cleanup for remote VFX. (tests: npm test, ctest)
- [2026-02-01 10:49:38 CT] (projectiles/net) Added projectile id tracking in client VFX and projectile remove handling across protocol/tests. (tests: npm test, ctest)
- [2026-02-01 10:51:06 CT] (combat-tests) Added hitscan range/closest-target/missing-shooter unit tests. (tests: ctest)
- [2026-02-02 00:15:00 CT] (client-tests) Added pre-snapshot metric assertion for keyframe interval. (tests: npm test)
- [2026-02-02 00:20:00 CT] (docs) Documented keyframe interval HUD metric in netcode guide.
- [2026-02-02 00:25:00 CT] (docs) Added snapshotKeyframeInterval to ServerHello field list.
- [2026-02-02 00:30:00 CT] (docs) Clarified ServerHello fields + README server flag for snapshot keyframe interval.
- [2026-02-02 00:35:00 CT] (docs) Documented snapshot keyframe interval CLI flag in protocol overview.
- [2026-02-02 00:40:00 CT] (docs) Added README note explaining snapshot keyframe interval flag behavior.
- [2026-02-02 00:45:00 CT] (docs) Added example keyframe+delta snapshot sequence in netcode guide.
- [2026-02-02 00:50:00 CT] (docs) Clarified mask=0 behavior for StateSnapshotDelta.
- [2026-02-02 00:55:00 CT] (docs) Added snapshot delta edge-case note (mask=0) to netcode guide.
- [2026-02-02 01:05:00 CT] (cleanup) Removed generated client coverage artifacts from the working tree.
- [2026-02-02 01:10:00 CT] (docs) Noted ServerHello snapshotKeyframeInterval must be non-negative when present.
- [2026-02-02 01:30:00 CT] (dash) Added dash input + cooldown to sim, snapshots, and WASM bindings; updated protocol docs/tests.
- [2026-02-02 02:20:00 CT] (assets) Added Kenney Retro Urban Kit (CC0) environment assets and mirrored GLB pack into client public assets for map prototyping.
- [2026-02-02 02:40:00 CT] (map) Added hardcoded Retro Urban map loader to place GLB environment props at runtime (client-side).
- [2026-02-02 02:55:00 CT] (map) Added JSON placement manifest for Retro Urban layout and loader support for manifest overrides.
- [2026-02-02 03:10:00 CT] (map) Added optional manifest seed/yaw randomization for placements with randomYaw; updated tests and manifest metadata.
- [2026-02-01 08:50:16 CT] (weapons) Added weapon config validation coverage for non-record entries and restored 100% client coverage. (tests: npm test)
- [2026-02-01 09:11:12 CT] (weapons) Added viewYaw/viewPitch to InputCmd, server-side hitscan + lag compensation pose history, and combat unit tests. (tests: npm test, ctest)
- [2026-02-01 09:26:32 CT] (combat) Added health/respawn/score tracking, health fields in snapshots/deltas, and protocol/netcode docs updates. (tests: npm test, ctest)
- [2026-02-01 09:42:04 CT] (projectiles) Added server-side projectile sim + collision/explosion helpers, weaponSlot input field, explosion radius in weapon defs/config, and updated tests/docs. (tests: npm test, ctest)
- [2026-02-01 09:49:53 CT] (input) Added weapon slot keybinds (1/2), sampler tracking, and settings/docs updates to drive projectile selection. (tests: npm test, ctest)
- [2026-02-01 09:53:47 CT] (hud) Added weapon slot HUD display + main wiring, with tests and styling updates. (tests: npm test)
- [2026-02-01 09:59:52 CT] (vfx) Added client-side projectile VFX prediction with cooldowns and cleanup, plus tests. (tests: npm test)
- [2026-02-01 10:03:04 CT] (vfx) Added hitscan tracer VFX prediction, cooldown gating, and expanded app tests to keep 100% coverage. (tests: npm test)
- [2026-02-01 10:54:25 CT] (combat-tests) Added hitscan occlusion and stale-history unit tests. (tests: ctest)
- [2026-02-01 10:57:09 CT] (combat-tests) Added hitscan yaw targeting and shooter rewind unit tests. (tests: ctest)
- [2026-02-01 10:58:04 CT] (combat-tests) Added hitscan distance checks for rewound target positions. (tests: ctest)
- [2026-02-01 10:58:54 CT] (combat-tests) Added rewind tick selection test for hitscan targets. (tests: ctest)
- [2026-02-01 11:00:04 CT] (combat-tests) Added hitscan non-finite input safety coverage. (tests: ctest)
- [2026-02-01 11:00:50 CT] (combat-tests) Added randomized hitscan safety coverage. (tests: ctest)
- [2026-02-01 11:01:46 CT] (combat-tests) Added projectile impact/explosion invalid input coverage. (tests: ctest)
- [2026-02-01 11:02:22 CT] (combat-tests) Added randomized projectile impact safety coverage. (tests: ctest)
- [2026-02-01 11:03:00 CT] (combat-tests) Added randomized explosion damage safety coverage. (tests: ctest)
- [2026-02-01 11:03:30 CT] (docs/combat) Marked hitscan/lag-comp unit tests complete in spec. (tests: ctest)
- [2026-02-01 11:04:48 CT] (combat-tests) Added health clamp/double-kill safety tests and marked property check complete. (tests: ctest)
- [2026-02-01 11:06:23 CT] (map-tests) Added Retro Urban manifest GLB existence test. (tests: npm test)
- [2026-02-01 11:08:18 CT] (map) Added debug bounds toggle for Retro Urban placements and tests. (tests: npm test)
- [2026-02-01 11:08:55 CT] (docs/map) Documented Retro Urban debug bounds env toggle in spec. (tests: npm test)
- [2026-02-01 11:12:47 CT] (docs/runbook) Added Retro Urban bounds dev command. (tests: none)
- [2026-02-01 11:15:14 CT] (protocol-tests) Added fuzz coverage for malformed GameEvent payloads. (tests: npm test)
- [2026-02-01 11:16:28 CT] (docs/map) Added Retro Urban visual sanity checklist. (tests: none)
- [2026-02-01 11:17:21 CT] (milestone) Marked projectile weapon complete in M3 checklist. (tests: none)
- [2026-02-01 11:18:28 CT] (map-tests) Added road-tile grid alignment checks for Retro Urban manifest. (tests: npm test)
- [2026-02-01 11:19:54 CT] (map) Added debug grid helper toggle for Retro Urban placements and tests. (tests: npm test)
- [2026-02-01 11:20:20 CT] (docs/runbook) Added Retro Urban grid dev command. (tests: none)
- [2026-02-01 11:21:34 CT] (map-tests) Added arena bounds checks for Retro Urban manifest. (tests: npm test)
- [2026-02-01 11:22:02 CT] (docs/map) Noted keeping Retro Urban placements within grid and arena bounds after edits. (tests: none)
- [2026-02-01 11:22:42 CT] (docs/map) Added Retro Urban map edit guidelines to asset README. (tests: none)
- [2026-02-01 11:23:46 CT] (map-tools) Added Retro Urban manifest validation script. (tests: python3 tools/validate_retro_urban_map.py)
- [2026-02-01 11:24:40 CT] (map-tools) Added rotation/scale validation to Retro Urban manifest checker. (tests: python3 tools/validate_retro_urban_map.py)
- [2026-02-01 11:26:04 CT] (docs/abilities) Expanded grapple rules, config, and netcode notes. (tests: none)

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
  - sends server tick rate + snapshot rate + snapshot keyframe interval
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
- `ServerHello` fields: `type`, `protocolVersion`, `connectionId`, `clientId`, `serverTickRate`, `snapshotRate`, `snapshotKeyframeInterval`, optional `motd`, `connectionNonce`.

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
- `StateSnapshotDelta` (unreliable, medium rate)
- `GameEvent` (unreliable or reliable depending)
- `Ping`/`Pong` (unreliable; also can use RTCPeerConnection stats)
- `Error` + `Disconnect` (reliable)

Implementation note (M0):
- InputCmd is currently JSON-encoded on the client. Plan to move to FlatBuffers alongside other message types.
- Server currently parses InputCmd JSON and queues per connection (handshake required) in SignalingStore.
- StateSnapshot keyframes are JSON-encoded and sent on the unreliable channel at `snapshotRate`; server interleaves StateSnapshotDelta updates against the latest keyframe, and the client decodes deltas before buffering (pos/vel include Z).
- Ping/Pong are JSON-encoded on the unreliable channel and feed the net debug overlay (RTT, snapshot age, drift).
- SignalingStore enforces a per-connection input rate limiter (default 120 cmds/sec burst/refill).
- Excessive invalid or rate-limited inputs trigger connection closure (configurable thresholds).

## 5.4 Tick & sequencing
- Server tick: `serverTick` increments each sim step.
- Client input: `inputSeq` increments each client sim step where input is sampled.
- Server includes in snapshots:
  - `serverTick`
  - `lastProcessedInputSeq` per player (or per connection)
  - `posX`, `posY`, `posZ`
  - `velX`, `velY`, `velZ`
- Client reconciliation uses `lastProcessedInputSeq` as the rewind anchor.

## 5.5 Bandwidth strategy
- Quantize values (positions, angles, velocities) to fixed ranges.
- Delta snapshots are live for player state; extend masking to multi-entity payloads later.
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
- Client prediction/reconciliation is wired for the local player using shared movement constants (`shared/sim/config.json`), and the server tick now uses the shared sim core (`shared/sim/sim.h`); snapshots reset state and replay input history (including vertical Z state).

## 6.3 Lag compensation (hitscan)
Server maintains recent history of entity poses for ~200ms.
When processing a hitscan shot:
- Determine client shot time estimate (`clientTime` mapped to server time via RTT)
- Rewind target positions to that time
- Perform ray test
- Apply damage authoritatively
- Broadcast hit event

## 6.4 Physics scope (deterministic + lightweight)
- No full rigidbody physics engine in v1; use a kinematic controller + simple projectile integration.
- Player physics: capsule sweep + slide, gravity, friction, jump; fixed dt for determinism.
- World collisions: AABB/planes first, triangle mesh + BVH sweeps later.
- Projectile physics: ballistic integration with sweeps to avoid tunneling.
- Rigidbody props (if any) are out of scope for now or server-only later.

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
- [x] Unit: sensitivity and pitch clamp
- [x] Property: random input streams never produce NaN or invalid ranges
- [ ] E2E: headless browser can lock pointer (where supported) or simulate deltas

Implementation note (M0):
- Input sampler + InputCmd sender are wired in `main.ts` to emit InputCmd over `dc_unreliable` and feed client-side prediction + camera look.

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
- [x] Define advanced movement constants (accel, friction, gravity, jumpVel, etc.) in shared config
- [x] Define arena bounds + player radius in shared config (arenaHalfSize, playerRadius)
- [x] Add simple obstacle AABB collision (configurable rect)
- [x] Add swept obstacle AABB collision (segment vs expanded AABB) to prevent tunneling
- [x] Add swept arena/obstacle collision loop with slide (2D) as capsule sweep precursor
- [ ] Implement capsule-vs-world sweep + slide
- [ ] Implement ground detection with “walkable normal” threshold
- [x] Implement dash (impulse + cooldown)
- [ ] Implement grapple:
  - raycast to hook point
  - while active: apply spring/pull force and optionally clamp max rope length
  - allow cancel
- [x] Scaffold WASM bindings (C API + TS wrapper)
- [x] Expose shared sim step() to TS via WASM bindings
- [x] Mirror same step() on server native build

### Tests
- [x] Unit: deterministic movement for known input script (golden test)
- [x] Unit: arena bounds clamp + velocity reset
- [x] Unit: arena wall slide preserves tangential velocity
- [x] Unit: collision slide on walls and floors
- [x] Unit: obstacle AABB collision preserves tangential velocity
- [x] Unit: jump height within tolerance
- [x] Property: random inputs keep state finite and within arena bounds
- [x] Property: no tunneling through thin walls within configured speed (obstacle AABB sweep)
- [x] Cross-check: C++ native vs WASM produce identical state per tick (bit-exact or within quantized epsilon)

---

## 7.3 Environment & Map Layout (Retro Urban Kit)
### Goals
- Load low-poly CC0 environment assets for fast blockout and visual context.
- Keep placement deterministic and simple (hardcoded positions first, data-driven later).

### Implementation steps
- [x] Add Retro Urban Kit assets (CC0) to repo and mirror GLBs under client public assets.
- [x] Hardcode a starter arena layout (roads + barriers + props) and load via GLTFLoader at runtime.
- [x] Add JSON placement manifest for easy iteration (no code changes).
- [x] Add optional map seed/randomization for variety (later).
- [x] Add `VITE_DEBUG_RETRO_URBAN_BOUNDS=true` toggle to render BoxHelper bounds for placements.
- [x] Add `VITE_DEBUG_RETRO_URBAN_GRID=true` toggle to render a 4m grid helper.

### Tests
- [x] Unit: map loader adds GLB scene nodes to the scene.
- [x] Unit: map loader handles asset load errors gracefully.
- [x] Unit: manifest references existing GLB assets.
- [ ] Visual sanity check: layout loads in dev and matches expected scale/orientation.

### Visual sanity checklist (manual)
- Run: `VITE_DEBUG_RETRO_URBAN_BOUNDS=true npm run dev`
- Verify road tiles align on a 4m grid and side roads close the perimeter.
- Confirm props are upright (no unintended rotations) and benches/barriers sit on the ground plane.
- Adjust `client/public/assets/environments/cc0/kenney_retro_urban_kit/map.json` positions/rotations as needed.
- After adjustments, keep road tiles within `arenaHalfSize` and aligned to the 4m grid tests.

---

## 7.4 Weapons: Hitscan + Projectile
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
- [x] Add weapon definitions (damage, ROF, spread, projectile speed)
- [x] Implement server-side raycast against world + players
- [x] Implement damage + health/respawn/score state and include in snapshots
- [x] Implement server-side projectile sim + collision
- [x] Add client VFX prediction (tracer/projectile)
- [x] Add reconciliation for projectiles (optional early: server-only projectiles with interpolation)

### Tests
- [x] Unit: hitscan ray hits expected target in fixed scene
- [x] Unit: lag compensation rewinds correctly
- [x] Unit: projectile impact + explosion damage distribution
- [x] Property: no negative health, no double-kill race bugs
- [x] Fuzz: malformed weapon events rejected safely

---

## 7.5 Abilities (dash, grapple, shield, push/shockwave)
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
  - raycast to valid surfaces within `grappleMaxDistance` (server authoritative)
  - attach point stored as world-space anchor + surface normal
  - while held: apply spring/pull force toward anchor (with damping)
  - optional rope length clamp (cannot extend beyond initial hit distance)
  - release on grappleReleased, LOS break, max rope stretch, or cooldown cancel
  - prevent re-attach while on cooldown
- Config (shared sim):
  - `grappleMaxDistance`, `grapplePullStrength`, `grappleDamping`
  - `grappleCooldown`, `grappleMinAttachNormalY`, `grappleRopeSlack`
- Netcode:
  - client predicts rope render + pull, server validates and corrects via snapshots
  - optional GameEvent: `GrappleAttach` / `GrappleRelease` for VFX/rope state
- Tests:
  - [ ] attaches only to allowed surfaces
  - [ ] consistent pull across client/server
  - [ ] release conditions enforced (LOS break, max stretch, cooldown)

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

## 7.6 Rendering (Three.js) + Stylized Look
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

## 7.7 UI / HUD
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

## 7.8 Audio
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

## 7.9 Performance Budgets (browser)
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
- [x] License reviewed
- [ ] Build + CI integration complete
- [x] ICE/STUN/TURN supported as required
- [x] DTLS enabled by default

## 8.3 Tick loop skeleton
- `while (running)`:
  - process incoming DataChannel messages → enqueue inputs
  - step sim fixed dt (possibly multiple steps if behind)
  - build snapshot per client
  - send snapshots/events
  - sleep/yield (or busy tick with precise timer)

Implementation note (M0):
- `main.cpp` runs a fixed-rate tick loop that drains inputs, advances the shared sim movement core, and emits JSON StateSnapshot keyframes plus StateSnapshotDelta updates on the unreliable channel at `snapshotRate` (keyframe interval = 5).

Tests
- [x] Deterministic tick advancement in unit tests (no real sleeps)
- [ ] Load test harness with simulated clients

---

# 9) Testing Strategy (100%+ coverage)

## 9.1 Coverage gates
Client (TS):
- [ ] 100% line coverage
- [ ] 100% branch coverage (target; allow exceptions with justification doc; currently enforcing >=90% while Vitest 4 v8 branch accounting is audited)
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
- [x] Formatting + linting (TS + C++)
- [ ] CI pipeline:
  - [x] build client
  - [x] build server
  - [x] run unit tests
  - [ ] enforce coverage gates
  - [ ] run sanitizers
- [x] Web page boots with Three.js scene
- [x] C++ server boots and serves HTTPS health endpoint
- [x] Secure signaling stub (token issuance)
- [x] WebRTC DataChannel connects in local environment (loopback)

## M1 — Local movement prototype (single player)
- [x] Pointer lock + camera
- [x] Deterministic movement core (C++ + WASM)
- [x] Collision with simple arena
- [x] HUD basic

## M2 — Multiplayer 1v1 (authoritative)
- [x] InputCmd sending
- [x] Server authoritative tick
- [x] Snapshot receive and interpolation
- [x] Prediction + reconciliation for local player
- [x] Ping + drift metrics
- [x] Minimal anti-abuse (rate limits, size limits)

## M3 — Weapons (hitscan + projectile) + damage
- [x] Hitscan with lag compensation
- [x] Projectile weapon
- [x] Damage, respawn, scoring
- [x] VFX feedback (hitmarkers)

## M4 — Abilities + polish
- [x] Dash
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
- Client dev server (Retro Urban bounds): `cd client && VITE_DEBUG_RETRO_URBAN_BOUNDS=true npm run dev`
- Client dev server (Retro Urban grid): `cd client && VITE_DEBUG_RETRO_URBAN_GRID=true npm run dev`
- Validate Retro Urban manifest: `python3 tools/validate_retro_urban_map.py`
- Client WASM parity check: `cd client && npm run wasm:check`
- Client lint: `cd client && npm run lint`
- Client format: `cd client && npm run format`
- Client format check: `cd client && npm run format:check`
- Client tests: `cd client && npm test`
- Server build: `cd server && cmake -S . -B build && cmake --build build`
- Server tests: `cd server && ctest --test-dir build`
- C++ format: `./tools/format_cpp.sh`
- C++ format check: `./tools/lint_cpp.sh`
- Server sanitizers build: `./tools/build_server_sanitizers.sh`
- Server sanitizers run: `./tools/run_server_sanitizers.sh`
- Server coverage (local): `./tools/coverage_server.sh`
- E2E tests: `TBD`
- Coverage reports: client HTML in `client/coverage/` (from `npm test`), server HTML in `server/coverage/` (from `./tools/coverage_server.sh`)
- Fuzzers: `TBD`

## 11.2 Debugging netcode
- Net debug overlay shows ping, drift, snapshot age
- Record input scripts and replay
- Server: enable per-connection message counters

---

# 12) Documentation Tasks (ongoing)
- [ ] Keep this spec updated
- [x] Add `docs/PROTOCOL.md` with message schema and examples
- [x] Add `docs/SECURITY.md` with threat model + mitigations
- [x] Add `docs/NETCODE.md` with prediction/reconciliation explanation
- [x] Add `docs/RENDERING.md` with toon/outlines pipeline

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
