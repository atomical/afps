# AFPS Browser Game

Living spec: `docs/LIVING_SPEC.md`.

## Client

```bash
cd client
npm install
npm run dev
```

To auto-connect to the HTTPS signaling server, set:

```bash
VITE_SIGNALING_URL=https://localhost:8443 VITE_SIGNALING_AUTH_TOKEN=devtoken npm run dev
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
cd certs
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
cd ..
./build/afps_server --cert certs/cert.pem --key certs/key.pem --auth-token devtoken --host 0.0.0.0 --port 8443 --snapshot-keyframe-interval 5
```

`--snapshot-keyframe-interval` controls how often full `StateSnapshot` keyframes are sent (0 = always full).
