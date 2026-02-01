export default async function createWasmStub() {
  let state = { x: 0, y: 0, z: 0, velX: 0, velY: 0, velZ: 0, dashCooldown: 0 };

  return {
    _sim_create: () => 1,
    _sim_destroy: () => {},
    _sim_reset: () => {
      state = { x: 0, y: 0, z: 0, velX: 0, velY: 0, velZ: 0, dashCooldown: 0 };
    },
    _sim_set_config: () => {},
    _sim_set_state: (_handle, x, y, z, velX, velY, velZ, dashCooldown) => {
      state = { x, y, z, velX, velY, velZ, dashCooldown };
    },
    _sim_step: () => {},
    _sim_get_x: () => state.x,
    _sim_get_y: () => state.y,
    _sim_get_z: () => state.z,
    _sim_get_vx: () => state.velX,
    _sim_get_vy: () => state.velY,
    _sim_get_vz: () => state.velZ,
    _sim_get_dash_cooldown: () => state.dashCooldown
  };
}
