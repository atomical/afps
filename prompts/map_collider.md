You are Codex acting as a senior FPS/network/performance engineer. You have full read/write access to this repo. Implement the following THREE features end-to-end (client + server + shared sim/protocol as applicable), keeping the game deterministic, low-latency, and performant. Do not “prototype-only” this—wire it into real gameplay paths, update tests, and keep backward compatibility where reasonable.

Repo context (verify exact paths in-repo before coding):
- Client is TypeScript + Vite + Three.js under /client
- There is a deterministic sim used for prediction + server authority (JS + WASM + likely shared C++ core). In the client repo you’ll find:
  - /client/src/net/prediction.ts (JS prediction sim + collision/raycast today)
  - /client/src/sim/* (WASM wrapper + parity tests)
  - /client/src/environment/retro_urban_map.ts (loads Kenney Suburban map via map.json)
  - /client/public/assets/environments/cc0/kenney_city_kit_suburban_20/ (map.json + GLBs)
  - /client/src/net/fbs/... (FlatBuffers-generated TS)
- There are already Vitest + Playwright tests (run them and update them).

Non-negotiables:
- Keep the game server-authoritative. Clients can predict, but server decides.
- Don’t add large per-tick O(N) costs that scale with map size. If you must, add a broadphase (spatial hash/grid).
- Keep bandwidth low: prefer quantized ints for frequent events. Avoid bloating snapshots.
- Keep determinism: any procedural generation must be seed-driven with integer PRNG + stable iteration order.
- Update tests and add new tests for the new systems.
- Keep code style consistent (TS ESM). No new heavy deps unless justified.

Deliverables: THREE features

================================================================================
FEATURE 1 — ENTERABLE BUILDINGS + REAL WORLD COLLISION GEOMETRY (multi-collider)
================================================================================

Goal
- Buildings/houses should be enterable: players can move inside and hide.
- Collision/raycast must be based on REAL world geometry, not a single “obstacleMinX/MaxX” box.
- The SAME collision/raycast rules must be used for:
  - player movement collision resolution (client prediction + server sim)
  - grapple attach + grapple line-of-sight
  - hitscan/weapon raycasts (server authoritative; client can optionally use for visuals)

Design requirements
1) Introduce a “CollisionWorld” (or similar) that supports MANY colliders.
   - Minimum collider type: axis-aligned boxes (AABBs).
   - Colliders must have stable IDs and optional metadata (surface type, tag).
   - Colliders must be queryable efficiently (raycast + swept movement).
2) Building interiors:
   - For each building placement, create an interior “room volume” and wall colliders with a doorway gap.
   - Visual interior can be simple (procedural box room meshes + floor/ceiling) to avoid needing interior art.
   - Doorway should be on a plausible side (ideally facing a road; if unknown, pick deterministic side based on seed + placement coords).
3) Backward compatibility:
   - Existing configs that rely on arena bounds and the old single obstacle should still work.
   - BUT new maps should use the multi-collider system.

Implementation steps (concrete)
A) Define collision data types
- Create a new module (shared if possible) defining:
  - AabbCollider: { id: number; minX; minY; minZ; maxX; maxY; maxZ; surfaceType?: number; tags?: ... }
  - RaycastHit: { hit: boolean; t: number; nx: number; ny: number; nz: number; colliderId?: number; surfaceType?: number }
  - CollisionWorld interface:
    - raycast(origin, dir, maxDist) -> RaycastHit
    - sweepCapsuleOrCylinder(start, delta, radius, height) -> earliest hit
    - overlapsAabb / queryAabb (for pickups later)
- Put the shared logic where both client prediction and server can reuse it. If server is C++, implement equivalent C++ in /shared/sim or /server/src.

B) Update client-side prediction collision + raycast
- In /client/src/net/prediction.ts:
  - Replace the current obstacleMin/Max logic with a multi-collider world:
    - Keep arena bounds logic (outer boundary) as a “special collider” or separate.
    - Add support for N colliders from CollisionWorld.
  - Update:
    - advanceWithCollisions(dt) to sweep against colliders and resolve collisions without tunneling.
    - raycastWorld(origin, dir, config) to raycast against arena bounds + colliders.
  - Ensure grapple attach and LOS checks use the new raycast.
- Add a way to set/update the world colliders:
  - Either extend PredictionSim with setWorld(world) or setColliders(colliders)
  - Or keep an internal collision world object injected into createJsPredictionSim.
  - Do not shove colliders into SIM_CONFIG (movement constants). Colliders are map/world data.

C) Ensure WASM sim parity (important)
- The WASM ABI currently sets config with obstacleMin/Max etc.
- Add a new ABI surface for colliders:
  - Example: _sim_set_colliders(handle, ptr, count) where ptr points to a packed float/int array.
  - Or: incremental _sim_clear_colliders + _sim_add_aabb_collider(handle, id, minX, minY, minZ, maxX, maxY, maxZ, surfaceType).
- Update:
  - /client/src/sim/wasm.ts to call the new functions
  - /client/src/sim/wasm_adapter.ts to expose setWorld/setColliders at PredictionSim layer
  - Add/update parity tests so JS and WASM sims behave the same around colliders.

D) Map integration: generate colliders + interior volumes for buildings
- In /client/src/environment/retro_urban_map.ts (or a new helper):
  - Add a “prefab” table for buildings (based on filename patterns, e.g. building-type-a.glb, etc.) describing footprint size and approximate height.
  - When placing a building mesh:
    - Create interior meshes (floor + 4 walls + ceiling), with a doorway cutout.
    - Create collider AABBs for walls (not a single solid box), leaving a doorway opening.
  - IMPORTANT: Keep coordinate systems correct:
    - Three uses X,Z horizontal; sim uses X,Y horizontal (swap). Be explicit with conversions.
    - Respect MAP_SCALE used by the loader.
  - Add debug toggles:
    - VITE_DEBUG_COLLIDERS=true to render collider bounds (BoxHelper or line boxes)
    - VITE_DEBUG_INTERIORS=true to render interior volumes distinctly
- The loader should return (or otherwise expose) the generated colliders so the App/prediction can consume them.

E) Server integration (if server exists in this repo; inspect /server and /shared)
- Server must use the same colliders:
  - Load/generate colliders from the same map generator/data as the client (seed driven).
  - Apply collision to player movement in server sim (authoritative).
  - Use the same raycast for hitscan and grapple LOS/attach validation.
- If the server already has a sim core, hook CollisionWorld into that core.
- If the server does not yet have world collision at all, implement at minimum:
  - authoritative grapple attach validation via raycast
  - hitscan raycast against colliders to compute world hit and prevent shooting through buildings

Acceptance criteria for Feature 1
- You can move into at least 3 buildings through doorways and hide inside.
- You cannot walk through exterior walls.
- Grapple:
  - cannot grapple through walls (LOS must block)
  - can attach to building walls from outside
- Collisions must be stable under high speed (no tunneling). Add/adjust tests.

Tests to update/add
- Update prediction tests that currently assume a single obstacle AABB:
  - Replace with multiple colliders and assert collision resolution works.
- Add a test that a doorway opening actually allows passage:
  - Setup colliders for a “room” with a door gap; simulate moving through.
- Update/extend WASM parity tests if colliders are now supported.

================================================================================
FEATURE 2 — WEAPON DROPS + HEALTH PACKS (server-authoritative pickups + respawn)
================================================================================

Goal
- Add pickups to the game:
  1) Health packs (restore health up to max)
  2) Weapon drops (at least 2 weapon types from your existing weapon defs)
- Pickups must:
  - Spawn at fixed spawn points (from map data)
  - Be collectible by players (server authoritative)
  - Despawn on pickup and respawn after a timer
  - Replicate to all clients with low bandwidth and correct join behavior

Design requirements
- Use the existing message/event pipeline (FlatBuffers) for low-latency state replication.
- Avoid bloating StateSnapshot with large pickup lists every snapshot.
- New clients joining mid-match must get the correct current pickup states.

Implementation steps (concrete)
A) Define pickup data model (shared)
- PickupKind enum: HEALTH, WEAPON
- Pickup definition:
  - id (u32), kind, position, radius, active, respawnSeconds
  - if WEAPON: weaponId or weaponSlot, ammoAmount (or fill mag)
  - if HEALTH: healAmount
- Add configuration constants (respawn times, pickup radius, max health).

B) Protocol changes (FlatBuffers)
- Add new event(s) to protocol:
  - PickupSpawned: { pickupId, kind, posXQ, posYQ, posZQ, weaponSlot?, amount? }
  - PickupTaken:   { pickupId, takerClientId (or short id), serverTick }
- Decide where to put it:
  - Prefer: extend existing GameEvent/FxEvent union and batching system so it uses the same queue.
- Quantize positions:
  - Use int16 quantization with step 1/16 or 1/32 meters.
  - Add encode/decode helpers. Reuse existing quantization utilities patterns.
- Update:
  - TS generated types usage in /client/src/net/protocol.ts decode paths
  - Any server-side FBS codegen and message building

C) Server-side pickup simulation
- On server tick:
  - For each active pickup, query nearby players (broadphase recommended, but N is small initially).
  - If player overlaps (distance^2 <= radius^2 and vertical reasonable), collect:
    - HEALTH: player.health = min(maxHealth, health + healAmount)
    - WEAPON: set player weapon and ammo appropriately (choose a sane behavior consistent with current gameplay)
  - Mark pickup inactive; set respawnAtTick = nowTick + respawnSeconds*tickRate
  - Broadcast PickupTaken event (unreliable is fine; for correctness you can also use reliable for the state transition if you already have an event queue with tick ordering)
- Respawn:
  - When tick reaches respawnAtTick, mark active and broadcast PickupSpawned
- Join sync:
  - On client join/handshake completion, send a reliable “pickup state sync”:
    - simplest: send PickupSpawned for all currently active pickups
    - do NOT assume the client default state
  - Ensure late joiners see correct pickup visibility.

D) Client-side pickup rendering + audio + UX
- Create /client/src/pickups/ (or similar):
  - PickupManager that keeps a map pickupId -> Object3D
  - On PickupSpawned: create or show; on PickupTaken: hide
  - Add simple visuals:
    - HEALTH: rotating/bobbing cross or box (procedural mesh is OK)
    - WEAPON: a small floating weapon model or a generic “weapon crate”
  - Add SFX hooks (reuse existing audio system):
    - health pickup sound, weapon pickup sound
  - Optional but recommended: small HUD toast “+25 HP” / “Picked up Launcher”
- Ensure pickup objects are excluded from expensive passes if needed (outlines etc), and are framerate-cheap.

E) Map spawn points for pickups
- Extend map data (either map.json or your procedural generator output):
  - pickupSpawns: array of { id, kind, position, respawnSeconds, ... }
- Ensure at least:
  - 4 health packs
  - 2 weapon pickups
  - Some inside buildings (to encourage entering/hiding)
- Make spawn selection deterministic for procedural maps.

Acceptance criteria for Feature 2
- Running the game, you can pick up health and it increases your health (clamped).
- Health pack disappears immediately on pickup and respawns after timer.
- Weapon pickup changes weapon behavior (slot/id) and ammo in mag in a visible way.
- Other connected clients see the pickup disappear/respawn in sync.
- Late joiner sees correct current pickup states.

Tests to add/update
- Protocol encode/decode roundtrip tests for new pickup events.
- Server unit test (or sim test) verifying:
  - pickup collected -> inactive
  - respawn after N ticks
  - health clamp works
- Client unit test verifying PickupManager toggles visibility on events.

================================================================================
FEATURE 3 — PROCEDURAL / RANDOM MAP GENERATION WITH ALIGNED ROADS
================================================================================

Goal
- Replace or augment the current static map.json with procedural generation that:
  - Produces “nice” suburban/city maps
  - Guarantees road pieces line up and look normal
  - Places buildings, props, interiors, colliders, and pickup spawns deterministically
- It must be seed-driven so server + clients can generate the same map from a shared seed.

Design requirements
- Use the Kenney City Kit Suburban road tile pieces.
- Roads must be on a strict grid (the project already enforces 4m increments in tests—keep that).
- Road connectivity must be consistent:
  - Neighbor cells must agree on connections (N/E/S/W).
  - Choose correct tile model + rotation based on connection bitmask.
- The generator must output:
  - placements (GLB file + position + rotation + scale)
  - building metadata needed for interior doorway orientation (door side)
  - pickup spawns
  - optionally explicit colliders OR enough metadata to generate them reliably

Implementation steps (concrete)
A) Implement a deterministic PRNG
- Create a tiny seed PRNG (e.g., xorshift32) in shared code used by:
  - map generator
  - any random yaw selection
- Ensure integer-only determinism.
- Provide helpers: randInt(min,max), choice(array), shuffle(array)

B) Road grid + tile selection
- Decide map grid size from arenaHalfSize and tileSize=4 (or your existing tile units then MAP_SCALE).
- Generate a road occupancy graph deterministically:
  - Simple recommended approach:
    1) Start with an orthogonal backbone (a few main roads crossing the map)
    2) Add random branches with controlled dead-ends
    3) Ensure connectivity across the map (at least one path between major areas)
  - Or implement a WFC-lite constraint solver if you prefer.
- For each road cell, compute a 4-bit connection mask from neighbor road cells.
- Map mask -> asset + rotation:
  - Build a lookup table for your actual available road GLBs in /assets/.../glb/roads
  - If some tile types are missing, degrade gracefully (e.g., use straight or intersection variants) but keep alignment.
- Output placements:
  - position must be multiples of 4 (before MAP_SCALE)
  - rotation must be multiples of 90 degrees (or a small allowed set)

C) Building + lot placement
- For each non-road cell (or cluster of cells), place buildings/trees/fences:
  - Avoid overlapping footprints.
  - Keep buildings near roads.
  - Record door side facing the nearest road cell for that building.
- Use Kenney building-type-*.glb and props available.
- Reuse the building prefab footprint table from Feature 1 so interiors/colliders are coherent.

D) Seed synchronization (server authoritative)
- Server chooses a mapSeed per match (or per room).
- Send seed to client during handshake:
  - Prefer adding a field to ServerHello or a small reliable “MapInfo” message.
- Client uses the seed to generate the exact same manifest locally.
- IMPORTANT: joiners must use the same seed; don’t allow divergence.

E) Performance: asset caching + instancing (required)
Procedural maps will create many repeated assets. Fix the loader so it stays fast:
- In /client/src/environment/retro_urban_map.ts (or a new loader module):
  1) Add a GLTF load cache:
     - key: resolved URL
     - value: Promise<GLTF> or Promise<Object3D template>
     - load each unique GLB once per session
  2) Add InstancedMesh batching for repeated static meshes:
     - For assets where the GLB scene is a single Mesh with non-skinned geometry:
       - Create one InstancedMesh per unique (geometry, material) + per file
       - Add all transforms into instances
     - For complex GLBs (multiple meshes), fall back to cloning the cached template scene.
  3) Preserve existing debug modes and map stats:
     - __afpsMapStats.total should still reflect total placements
     - loaded should reflect successfully realized placements (instances + clones)
- Update unit tests that previously asserted loader.load is called once per placement:
  - With caching, it should be once per UNIQUE file.
  - Add a test verifying duplicates do not trigger extra loads.

F) Hook generator into runtime
- Provide a switch:
  - VITE_PROCEDURAL_MAP=true (or similar)
  - plus a seed override VITE_MAP_SEED=1234 for reproducibility
- If procedural is enabled:
  - Do not fetch map.json (or fetch only for legacy)
  - Generate manifest in memory and load it.

Acceptance criteria for Feature 3
- You can change the seed and get different maps.
- Roads are aligned (4m grid), and road pieces connect correctly (no mismatched edges).
- Buildings appear on lots, with plausible door orientation.
- Buildings are enterable (Feature 1) on procedural maps.
- Pickups spawn in reasonable places and work (Feature 2).
- Performance budgets still pass:
  - no huge TTI regression
  - frame time budget remains acceptable
  - map loads without failed assets

Tests to add/update
- Add generator tests:
  - “same seed -> same output”
  - “different seed -> different output”
  - “all road placements on grid”
  - “adjacent road tiles have matching connections”
  - “placements within arenaHalfSize”
- Update Playwright map sanity test if needed (but keep it passing).

================================================================================
FINAL CHECKLIST (do ALL)
================================================================================
1) Implement Feature 1, 2, 3 as above (wired into real gameplay).
2) Update or add tests:
   - vitest unit tests
   - Playwright tests if they fail due to changed behavior
3) Run:
   - cd client && npm test
   - cd client && npm run test:ui
   - cd client && npm run wasm:check (if WASM parity exists in repo)
4) Provide a summary in your final output:
   - What changed (high level)
   - Key files modified
   - How to enable procedural maps / debug collider rendering
   - Any limitations/follow-ups

Important: If you discover the repo doesn’t yet contain server/shared pieces in this checkout, still implement the full client side, and structure the shared interfaces in a way that the server can adopt without rewrites. In that case:
- keep protocol + event design ready for server
- add TODO stubs with clear signatures for server integration
- do not leave the client in a broken state

Now implement it.
