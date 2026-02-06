#include "sim/sim.h"

#include <cmath>

extern "C" {

struct WasmSimState {
  afps::sim::PlayerState player;
  afps::sim::SimConfig config;
  afps::sim::CollisionWorld world;
};

WasmSimState *sim_create() {
  return new WasmSimState{afps::sim::PlayerState{}, afps::sim::kDefaultSimConfig};
}

void sim_destroy(WasmSimState *state) {
  delete state;
}

void sim_reset(WasmSimState *state) {
  if (!state) {
    return;
  }
  state->player = afps::sim::PlayerState{};
}

void sim_clear_colliders(WasmSimState *state) {
  if (!state) {
    return;
  }
  afps::sim::ClearColliders(state->world);
}

void sim_add_aabb_collider(WasmSimState *state, int id, double min_x, double min_y, double min_z, double max_x,
                           double max_y, double max_z, int surface_type) {
  if (!state) {
    return;
  }
  afps::sim::AabbCollider collider;
  collider.id = id;
  collider.min_x = min_x;
  collider.min_y = min_y;
  collider.min_z = min_z;
  collider.max_x = max_x;
  collider.max_y = max_y;
  collider.max_z = max_z;
  if (surface_type >= 0 && surface_type <= 255) {
    collider.surface_type = static_cast<uint8_t>(surface_type);
  }
  afps::sim::AddAabbCollider(state->world, collider);
}

void sim_set_config(WasmSimState *state, double move_speed, double sprint_multiplier, double accel,
                    double friction, double gravity, double jump_velocity, double dash_impulse,
                    double dash_cooldown, double grapple_max_distance, double grapple_pull_strength,
                    double grapple_damping, double grapple_cooldown, double grapple_min_attach_normal_y,
                    double grapple_rope_slack, double shield_duration, double shield_cooldown,
                    double shield_damage_multiplier, double shockwave_radius, double shockwave_impulse,
                    double shockwave_cooldown, double shockwave_damage, double arena_half_size,
                    double player_radius, double player_height, double obstacle_min_x,
                    double obstacle_max_x, double obstacle_min_y, double obstacle_max_y) {
  if (!state) {
    return;
  }
  if (std::isfinite(move_speed) && move_speed > 0.0) {
    state->config.move_speed = move_speed;
  }
  if (std::isfinite(sprint_multiplier) && sprint_multiplier > 0.0) {
    state->config.sprint_multiplier = sprint_multiplier;
  }
  if (std::isfinite(accel) && accel >= 0.0) {
    state->config.accel = accel;
  }
  if (std::isfinite(friction) && friction >= 0.0) {
    state->config.friction = friction;
  }
  if (std::isfinite(gravity) && gravity >= 0.0) {
    state->config.gravity = gravity;
  }
  if (std::isfinite(jump_velocity) && jump_velocity >= 0.0) {
    state->config.jump_velocity = jump_velocity;
  }
  if (std::isfinite(dash_impulse) && dash_impulse >= 0.0) {
    state->config.dash_impulse = dash_impulse;
  }
  if (std::isfinite(dash_cooldown) && dash_cooldown >= 0.0) {
    state->config.dash_cooldown = dash_cooldown;
  }
  if (std::isfinite(grapple_max_distance) && grapple_max_distance >= 0.0) {
    state->config.grapple_max_distance = grapple_max_distance;
  }
  if (std::isfinite(grapple_pull_strength) && grapple_pull_strength >= 0.0) {
    state->config.grapple_pull_strength = grapple_pull_strength;
  }
  if (std::isfinite(grapple_damping) && grapple_damping >= 0.0) {
    state->config.grapple_damping = grapple_damping;
  }
  if (std::isfinite(grapple_cooldown) && grapple_cooldown >= 0.0) {
    state->config.grapple_cooldown = grapple_cooldown;
  }
  if (std::isfinite(grapple_min_attach_normal_y)) {
    state->config.grapple_min_attach_normal_y = grapple_min_attach_normal_y;
  }
  if (std::isfinite(grapple_rope_slack) && grapple_rope_slack >= 0.0) {
    state->config.grapple_rope_slack = grapple_rope_slack;
  }
  if (std::isfinite(shield_duration) && shield_duration >= 0.0) {
    state->config.shield_duration = shield_duration;
  }
  if (std::isfinite(shield_cooldown) && shield_cooldown >= 0.0) {
    state->config.shield_cooldown = shield_cooldown;
  }
  if (std::isfinite(shield_damage_multiplier)) {
    state->config.shield_damage_multiplier = shield_damage_multiplier;
  }
  if (std::isfinite(shockwave_radius) && shockwave_radius >= 0.0) {
    state->config.shockwave_radius = shockwave_radius;
  }
  if (std::isfinite(shockwave_impulse) && shockwave_impulse >= 0.0) {
    state->config.shockwave_impulse = shockwave_impulse;
  }
  if (std::isfinite(shockwave_cooldown) && shockwave_cooldown >= 0.0) {
    state->config.shockwave_cooldown = shockwave_cooldown;
  }
  if (std::isfinite(shockwave_damage) && shockwave_damage >= 0.0) {
    state->config.shockwave_damage = shockwave_damage;
  }
  if (std::isfinite(arena_half_size) && arena_half_size >= 0.0) {
    state->config.arena_half_size = arena_half_size;
  }
  if (std::isfinite(player_radius) && player_radius >= 0.0) {
    state->config.player_radius = player_radius;
  }
  if (std::isfinite(player_height) && player_height >= 0.0) {
    state->config.player_height = player_height;
  }
  if (std::isfinite(obstacle_min_x)) {
    state->config.obstacle_min_x = obstacle_min_x;
  }
  if (std::isfinite(obstacle_max_x)) {
    state->config.obstacle_max_x = obstacle_max_x;
  }
  if (std::isfinite(obstacle_min_y)) {
    state->config.obstacle_min_y = obstacle_min_y;
  }
  if (std::isfinite(obstacle_max_y)) {
    state->config.obstacle_max_y = obstacle_max_y;
  }
}

void sim_set_state(WasmSimState *state, double x, double y, double z, double vel_x, double vel_y, double vel_z,
                   double dash_cooldown) {
  if (!state) {
    return;
  }
  state->player.x = std::isfinite(x) ? x : 0.0;
  state->player.y = std::isfinite(y) ? y : 0.0;
  state->player.z = std::isfinite(z) && z > 0.0 ? z : 0.0;
  state->player.vel_x = std::isfinite(vel_x) ? vel_x : 0.0;
  state->player.vel_y = std::isfinite(vel_y) ? vel_y : 0.0;
  state->player.vel_z = std::isfinite(vel_z) ? vel_z : 0.0;
  state->player.grounded = state->player.z <= 0.0;
  state->player.dash_cooldown =
      (std::isfinite(dash_cooldown) && dash_cooldown > 0.0) ? dash_cooldown : 0.0;
  state->player.shield_timer = 0.0;
  state->player.shield_cooldown = 0.0;
  state->player.shield_active = false;
  state->player.shield_input = false;
  state->player.shockwave_cooldown = 0.0;
  state->player.shockwave_input = false;
  state->player.shockwave_triggered = false;
}

void sim_step(WasmSimState *state,
              double dt,
              double move_x,
              double move_y,
              int sprint,
              int jump,
              int dash,
              int grapple,
              int shield,
              int shockwave,
              double view_yaw,
              double view_pitch) {
  if (!state) {
    return;
  }
  const auto input =
      afps::sim::MakeInput(move_x, move_y, sprint != 0, jump != 0, dash != 0, grapple != 0, shield != 0,
                           shockwave != 0, view_yaw, view_pitch);
  afps::sim::StepPlayer(state->player, input, state->config, dt, &state->world);
}

double sim_get_x(WasmSimState *state) {
  if (!state) {
    return 0.0;
  }
  return state->player.x;
}

double sim_get_y(WasmSimState *state) {
  if (!state) {
    return 0.0;
  }
  return state->player.y;
}

double sim_get_vx(WasmSimState *state) {
  if (!state) {
    return 0.0;
  }
  return state->player.vel_x;
}

double sim_get_vy(WasmSimState *state) {
  if (!state) {
    return 0.0;
  }
  return state->player.vel_y;
}

double sim_get_z(WasmSimState *state) {
  if (!state) {
    return 0.0;
  }
  return state->player.z;
}

double sim_get_vz(WasmSimState *state) {
  if (!state) {
    return 0.0;
  }
  return state->player.vel_z;
}

double sim_get_dash_cooldown(WasmSimState *state) {
  if (!state) {
    return 0.0;
  }
  return state->player.dash_cooldown;
}

double sim_get_shield_cooldown(WasmSimState *state) {
  if (!state) {
    return 0.0;
  }
  return state->player.shield_cooldown;
}

double sim_get_shield_timer(WasmSimState *state) {
  if (!state) {
    return 0.0;
  }
  return state->player.shield_timer;
}

double sim_get_shockwave_cooldown(WasmSimState *state) {
  if (!state) {
    return 0.0;
  }
  return state->player.shockwave_cooldown;
}

}  // extern "C"
