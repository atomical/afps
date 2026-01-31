# WASM Sim: Architecture, Rationale, and Integration Plan

This document describes why we use a WebAssembly (WASM) simulation core, how the bindings are structured, and how the client will integrate it for deterministic prediction.

---

## Why WASM?

### Goals

- **Determinism:** Client prediction must match the authoritative server sim.
- **Parity:** Using the same C++ code on both sides reduces drift.
- **Testability:** We can cross‑check C++ native vs. WASM outputs.
- **Performance:** The sim core is lightweight and runs fast in WASM.

### What this avoids

- Divergent JS vs. C++ float math and edge‑case handling.
- “Fix‑in‑one‑place” problems (logic duplicated in TS + C++).

---

## High‑Level Architecture

```
/shared/sim          (C++ deterministic sim core)
/shared/wasm         (C ABI wrapper + build script)
/client/src/sim      (TS wrapper + loader)
```

- **C++ core** remains the source of truth.
- **C ABI wrapper** exposes a tiny API to JS.
- **TS wrapper** manages module loading, state handles, and input marshaling.

---

## ABI Contract

The WASM module exports the following C functions:

- `sim_create() -> handle`
- `sim_destroy(handle)`
- `sim_reset(handle)`
- `sim_set_config(handle, moveSpeed, sprintMultiplier)`
- `sim_set_state(handle, x, y)`
- `sim_step(handle, dt, moveX, moveY, sprint)`
- `sim_get_x(handle)`
- `sim_get_y(handle)`

The TS wrapper assumes these exact symbols and signatures.

---

## C++ Wrapper

File: `shared/wasm/sim_wasm.cpp`

Key responsibilities:

- Holds a `WasmSimState` struct with `PlayerState` + `SimConfig`.
- Sanitizes inputs (finite values, positive config).
- Bridges the C++ sim functions into C ABI exports.

---

## Build Process

File: `shared/wasm/build.sh`

```bash
./build.sh
```

Outputs:

- `shared/wasm/dist/afps_sim.js`
- `shared/wasm/dist/afps_sim.wasm`

The JS module is built with `MODULARIZE=1` and `EXPORT_ES6=1` and must be loaded by the client wrapper.

### Serving the module in the client

To copy the build output into the Vite public folder:

```bash
cd client
npm run wasm:build
```

This uses `tools/wasm_sync.sh` to run the Emscripten build and copy the outputs to `client/public/wasm`.

### Offline parity check

After building, you can run a Node-based parity check against the WASM output:

```bash
cd client
npm run wasm:check
```

---

## TS Wrapper

File: `client/src/sim/wasm.ts`

The wrapper provides:

- `createWasmSim(module, config)`
- `loadWasmSim(factory, config)`

It converts JS inputs to numeric types, manages the native handle, and exposes:

- `step(input, dt)`
- `getState()`
- `reset()`
- `setConfig()`
- `dispose()`

---

## Integration Plan (Client)

### Current state

- The client prediction path can swap to the WASM sim via `VITE_WASM_SIM_URL`.
- JS prediction remains the default fallback if the module is unset or fails to load.

### Next steps

1. **Add parity tests**: native C++ vs. WASM per tick.
2. **Add golden scripts**: deterministic input → output hash.
3. **Expand ABI** as movement features grow (jump, dash, collision).

### Client toggle

Set `VITE_WASM_SIM_URL` to the generated `afps_sim.js` module (served next to `afps_sim.wasm`) to enable the WASM sim at runtime.

Optional: set `VITE_WASM_SIM_PARITY=1` to run a quick JS-vs-WASM parity check on startup and log any mismatch.

---

## Integration Plan (Server)

- Server already uses the shared C++ sim core for movement.
- As the sim expands, both server and client will be running the exact same logic.

---

## Testing Strategy

- Unit tests verify the TS wrapper calls and sanitization.
- Add a **parity test**: identical input script run in native C++ vs. WASM, with outputs compared per tick.
- Add a **golden test**: known input script → output hash.

---

## Risks & Mitigations

- **WASM load failures:** wrap init in robust error handling and fall back to JS sim.
- **ABI drift:** keep the ABI stable and document all exported symbols.
- **Precision drift:** confirm bit‑exact or quantized parity in tests.

---

## Files at a Glance

- `shared/sim/sim.h` – deterministic sim core
- `shared/wasm/sim_wasm.cpp` – C ABI wrapper
- `shared/wasm/build.sh` – build script
- `shared/wasm/README.md` – build instructions
- `client/src/sim/wasm.ts` – TS wrapper
- `client/tests/sim/wasm.test.ts` – wrapper tests
