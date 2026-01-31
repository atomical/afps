# WASM Sim Build

This folder contains the C API bindings used to compile the shared sim core to WebAssembly.

## Build (Emscripten)

1. Install Emscripten and activate its environment.
2. Run the build script:

```bash
./build.sh
```

Outputs:

- `dist/afps_sim.js`
- `dist/afps_sim.wasm`

The generated JS module must export the following functions:

- `_sim_create`
- `_sim_destroy`
- `_sim_reset`
- `_sim_set_config`
- `_sim_set_state`
- `_sim_step`
- `_sim_get_x`
- `_sim_get_y`

These are consumed by the client wrapper in `client/src/sim/wasm.ts`.
