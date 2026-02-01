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
- `_sim_set_config` (handle, moveSpeed, sprintMultiplier, accel, friction, gravity, jumpVelocity, dashImpulse, dashCooldown, grappleMaxDistance, grapplePullStrength, grappleDamping, grappleCooldown, grappleMinAttachNormalY, grappleRopeSlack, arenaHalfSize, playerRadius, obstacleMinX, obstacleMaxX, obstacleMinY, obstacleMaxY)
- `_sim_set_state` (handle, x, y, z, velX, velY, velZ, dashCooldown)
- `_sim_step` (handle, dt, moveX, moveY, sprint, jump, dash)
- `_sim_get_x`
- `_sim_get_y`
- `_sim_get_z`
- `_sim_get_vx`
- `_sim_get_vy`
- `_sim_get_vz`
- `_sim_get_dash_cooldown`

These are consumed by the client wrapper in `client/src/sim/wasm.ts`.
