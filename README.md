# AFPS Browser Game

Living spec: `docs/LIVING_SPEC.md`.

## Docs

- Engine stack overview: `docs/ENGINE_STACK.md`
- Network stack overview: `docs/NETWORK_STACK.md`
- Protocol reference: `docs/PROTOCOL.md`
- Netcode flow: `docs/NETCODE.md`
- Advanced suburban map generation: `docs/ADVANCED_SUBURBAN_GENERATOR.md`

## Controls

- `WASD` / arrow keys: movement
- `Space`: jump
- `C`: crouch
- Mouse left/right: fire / ADS
- `1` / `2` (or mouse wheel): weapon select
- `Escape`: settings (audio + keyboard tabs)
- `P` (hold): scoreboard overlay (player + kills)
- `N`: toggle player name tags
- `` ` `` (backquote): toggle debug overlays and print local coords

## Client

```bash
cd client
npm install
npm run dev
```

To auto-connect to the signaling server, set:

```bash
VITE_SIGNALING_URL=http://localhost:8443 VITE_SIGNALING_AUTH_TOKEN=devtoken npm run dev
```

Optional map/debug flags:

```bash
VITE_PROCEDURAL_MAP=true \
VITE_PROCEDURAL_GENERATOR=advanced \
VITE_DEBUG_COLLIDERS=true \
VITE_DEBUG_INTERIORS=true \
VITE_DEBUG_ROAD_GRAPH=true \
npm run dev
```

For static map manifests (including generated advanced maps), override the manifest URL:

```bash
VITE_PROCEDURAL_MAP=false \
VITE_MAP_MANIFEST_URL=/assets/environments/generated/advanced_map.json \
npm run dev
```

To run server + client together (HTTP signaling, default):

```bash
./tools/run_dev.sh
```

Map mode/seed with `run_dev.sh`:

```bash
# Procedural map (default), shared seed on server+client:
./tools/run_dev.sh --procedural --map-seed 1337

# Advanced suburban (parity-safe): generates a static manifest and uses it on client+server:
./tools/run_dev.sh --advanced-generator --map-seed 1337

# Procedural + legacy generator:
./tools/run_dev.sh --procedural --legacy-generator --map-seed 1337

# Static client map manifest:
./tools/run_dev.sh --static
```

Map parity matrix check (legacy, static manifest, advanced-generator manifest):

```bash
node tools/check_map_parity.mjs
```

CI also runs this as a dedicated required job (`map-parity`) in `.github/workflows/ci.yml`.

Full test suite:

```bash
# strict (default): coverage threshold failures fail the suite
./tools/run_all_tests.sh

# optional: if coverage gate fails, rerun client unit tests without coverage
CLIENT_COVERAGE_MODE=optional ./tools/run_all_tests.sh

# off: skip coverage-gated unit run and execute unit tests without coverage
CLIENT_COVERAGE_MODE=off ./tools/run_all_tests.sh
```

To enable the WASM sim (requires Emscripten):

```bash
cd client
npm run wasm:build
VITE_WASM_SIM_URL=/wasm/afps_sim.js npm run dev
```

Optional parity check on startup:

```bash
VITE_WASM_SIM_PARITY=1 VITE_WASM_SIM_URL=/wasm/afps_sim.js npm run dev
```

Offline parity check against the built WASM module:

```bash
cd client
npm run wasm:check
```

## Server

```bash
cd server
cmake -S . -B build
cmake --build build
./build/afps_server --http --auth-token devtoken --host 0.0.0.0 --port 8443 --snapshot-keyframe-interval 5
```

Set a deterministic procedural map seed:

```bash
./build/afps_server --http --auth-token devtoken --map-seed 1337
```

`--snapshot-keyframe-interval` controls how often full `StateSnapshot` keyframes are sent (0 = always full).

To run HTTPS locally (optional):

```bash
cd server
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=localhost"
./build/afps_server --cert certs/cert.pem --key certs/key.pem --auth-token devtoken --host 0.0.0.0 --port 8443 --snapshot-keyframe-interval 5
```

TURN (coturn) setup and TURN REST credentials:

```bash
./build/afps_server --auth-token devtoken --ice turn:turn.example.com:3478 --turn-secret supersecret
```

See `docs/TURN.md` for the full coturn recipe.

Load test harness:

```bash
./server/build/afps_server_loadtest --clients 64 --ticks 600
```
