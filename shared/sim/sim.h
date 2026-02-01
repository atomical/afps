#pragma once

#include <algorithm>
#include <cmath>

namespace afps::sim {

struct SimConfig {
  double move_speed;
  double sprint_multiplier;
  double accel;
  double friction;
  double gravity;
  double jump_velocity;
  double dash_impulse;
  double dash_cooldown;
  double arena_half_size;
  double player_radius;
  double obstacle_min_x;
  double obstacle_max_x;
  double obstacle_min_y;
  double obstacle_max_y;
};

struct SimInput {
  double move_x = 0.0;
  double move_y = 0.0;
  bool sprint = false;
  bool jump = false;
  bool dash = false;
};

struct PlayerState {
  double x = 0.0;
  double y = 0.0;
  double z = 0.0;
  double vel_x = 0.0;
  double vel_y = 0.0;
  double vel_z = 0.0;
  bool grounded = true;
  double dash_cooldown = 0.0;
};

inline constexpr SimConfig kDefaultSimConfig{
    5.0,
    1.5,
    50.0,
    8.0,
    30.0,
    7.5,
    12.0,
    0.5,
    50.0,
    0.5,
    0.0,
    0.0,
    0.0,
    0.0};
// Keep defaults in sync with shared/sim/config.json.

inline double ClampAxis(double value) {
  if (!std::isfinite(value)) {
    return 0.0;
  }
  return std::max(-1.0, std::min(1.0, value));
}

inline SimInput MakeInput(double move_x, double move_y, bool sprint, bool jump, bool dash) {
  return {ClampAxis(move_x), ClampAxis(move_y), sprint, jump, dash};
}

inline bool GetArenaBounds(const SimConfig &config, double &min_bound, double &max_bound) {
  const double half_size =
      std::isfinite(config.arena_half_size) ? std::max(0.0, config.arena_half_size) : 0.0;
  if (half_size <= 0.0) {
    return false;
  }
  const double radius = std::isfinite(config.player_radius)
                            ? std::min(std::max(0.0, config.player_radius), half_size)
                            : 0.0;
  min_bound = -half_size + radius;
  max_bound = half_size - radius;
  return true;
}

inline void ResolveArenaPenetration(PlayerState &state, double min_bound, double max_bound) {
  if (state.x < min_bound) {
    state.x = min_bound;
    if (state.vel_x < 0.0) {
      state.vel_x = 0.0;
    }
  } else if (state.x > max_bound) {
    state.x = max_bound;
    if (state.vel_x > 0.0) {
      state.vel_x = 0.0;
    }
  }

  if (state.y < min_bound) {
    state.y = min_bound;
    if (state.vel_y < 0.0) {
      state.vel_y = 0.0;
    }
  } else if (state.y > max_bound) {
    state.y = max_bound;
    if (state.vel_y > 0.0) {
      state.vel_y = 0.0;
    }
  }
}

inline bool GetExpandedObstacleAabb(const SimConfig &config, double &min_x, double &max_x, double &min_y,
                                    double &max_y) {
  if (!std::isfinite(config.obstacle_min_x) || !std::isfinite(config.obstacle_max_x) ||
      !std::isfinite(config.obstacle_min_y) || !std::isfinite(config.obstacle_max_y)) {
    return false;
  }
  if (config.obstacle_min_x >= config.obstacle_max_x || config.obstacle_min_y >= config.obstacle_max_y) {
    return false;
  }
  const double radius = std::isfinite(config.player_radius) ? std::max(0.0, config.player_radius) : 0.0;
  min_x = config.obstacle_min_x - radius;
  max_x = config.obstacle_max_x + radius;
  min_y = config.obstacle_min_y - radius;
  max_y = config.obstacle_max_y + radius;
  return true;
}

inline void ResolveObstaclePenetration(PlayerState &state, double min_x, double max_x, double min_y, double max_y) {
  const double left = state.x - min_x;
  const double right = max_x - state.x;
  const double down = state.y - min_y;
  const double up = max_y - state.y;

  double min_pen = left;
  int axis = 0;  // 0 = left, 1 = right, 2 = down, 3 = up
  if (right < min_pen) {
    min_pen = right;
    axis = 1;
  }
  if (down < min_pen) {
    min_pen = down;
    axis = 2;
  }
  if (up < min_pen) {
    axis = 3;
  }

  switch (axis) {
    case 0:
      state.x = min_x;
      if (state.vel_x < 0.0) {
        state.vel_x = 0.0;
      }
      break;
    case 1:
      state.x = max_x;
      if (state.vel_x > 0.0) {
        state.vel_x = 0.0;
      }
      break;
    case 2:
      state.y = min_y;
      if (state.vel_y < 0.0) {
        state.vel_y = 0.0;
      }
      break;
    case 3:
    default:
      state.y = max_y;
      if (state.vel_y > 0.0) {
        state.vel_y = 0.0;
      }
      break;
  }
}

inline bool SweepSegmentAabb(double start_x, double start_y, double delta_x, double delta_y, double min_x,
                             double max_x, double min_y, double max_y, double &hit_t, double &normal_x,
                             double &normal_y) {
  double t_entry = 0.0;
  double t_exit = 1.0;
  normal_x = 0.0;
  normal_y = 0.0;

  auto update_axis = [&](double start, double delta, double min, double max, bool axis_x) -> bool {
    if (delta == 0.0) {
      if (start < min || start > max) {
        return false;
      }
      return true;
    }
    const double inv = 1.0 / delta;
    const double t1 = (min - start) * inv;
    const double t2 = (max - start) * inv;
    const double axis_entry = std::min(t1, t2);
    const double axis_exit = std::max(t1, t2);
    if (axis_entry > t_entry) {
      t_entry = axis_entry;
      if (axis_x) {
        normal_x = delta > 0.0 ? -1.0 : 1.0;
        normal_y = 0.0;
      } else {
        normal_x = 0.0;
        normal_y = delta > 0.0 ? -1.0 : 1.0;
      }
    }
    if (axis_exit < t_exit) {
      t_exit = axis_exit;
    }
    if (t_entry > t_exit) {
      return false;
    }
    return true;
  };

  if (!update_axis(start_x, delta_x, min_x, max_x, true)) {
    return false;
  }
  if (!update_axis(start_y, delta_y, min_y, max_y, false)) {
    return false;
  }
  hit_t = std::max(0.0, t_entry);
  return true;
}

struct SweepHit {
  bool hit = false;
  double t = 1.0;
  double normal_x = 0.0;
  double normal_y = 0.0;
  double clamp_x = 0.0;
  double clamp_y = 0.0;
  bool clamp_x_valid = false;
  bool clamp_y_valid = false;
};

inline void ConsiderSweepHit(SweepHit &best, double t, double normal_x, double normal_y, double clamp_x,
                             bool clamp_x_valid, double clamp_y, bool clamp_y_valid) {
  if (!best.hit || t < best.t) {
    best.hit = true;
    best.t = t;
    best.normal_x = normal_x;
    best.normal_y = normal_y;
    best.clamp_x = clamp_x;
    best.clamp_y = clamp_y;
    best.clamp_x_valid = clamp_x_valid;
    best.clamp_y_valid = clamp_y_valid;
  }
}

inline void SweepArenaBounds(double prev_x, double prev_y, double delta_x, double delta_y, double min_bound,
                             double max_bound, SweepHit &best) {
  if (delta_x > 0.0 && prev_x + delta_x > max_bound) {
    const double t = (max_bound - prev_x) / delta_x;
    ConsiderSweepHit(best, t, -1.0, 0.0, max_bound, true, 0.0, false);
  } else if (delta_x < 0.0 && prev_x + delta_x < min_bound) {
    const double t = (min_bound - prev_x) / delta_x;
    ConsiderSweepHit(best, t, 1.0, 0.0, min_bound, true, 0.0, false);
  }

  if (delta_y > 0.0 && prev_y + delta_y > max_bound) {
    const double t = (max_bound - prev_y) / delta_y;
    ConsiderSweepHit(best, t, 0.0, -1.0, 0.0, false, max_bound, true);
  } else if (delta_y < 0.0 && prev_y + delta_y < min_bound) {
    const double t = (min_bound - prev_y) / delta_y;
    ConsiderSweepHit(best, t, 0.0, 1.0, 0.0, false, min_bound, true);
  }
}

inline void SweepObstacleAabb(double prev_x, double prev_y, double delta_x, double delta_y, double min_x, double max_x,
                              double min_y, double max_y, SweepHit &best) {
  double hit_t = 0.0;
  double normal_x = 0.0;
  double normal_y = 0.0;
  if (!SweepSegmentAabb(prev_x, prev_y, delta_x, delta_y, min_x, max_x, min_y, max_y, hit_t, normal_x, normal_y)) {
    return;
  }
  double clamp_x = 0.0;
  bool clamp_x_valid = false;
  if (normal_x < 0.0) {
    clamp_x = min_x;
    clamp_x_valid = true;
  } else if (normal_x > 0.0) {
    clamp_x = max_x;
    clamp_x_valid = true;
  }
  double clamp_y = 0.0;
  bool clamp_y_valid = false;
  if (normal_y < 0.0) {
    clamp_y = min_y;
    clamp_y_valid = true;
  } else if (normal_y > 0.0) {
    clamp_y = max_y;
    clamp_y_valid = true;
  }
  ConsiderSweepHit(best, hit_t, normal_x, normal_y, clamp_x, clamp_x_valid, clamp_y, clamp_y_valid);
}

inline void AdvanceWithCollisions(PlayerState &state, const SimConfig &config, double dt) {
  double arena_min = 0.0;
  double arena_max = 0.0;
  const bool has_arena = GetArenaBounds(config, arena_min, arena_max);

  double obs_min_x = 0.0;
  double obs_max_x = 0.0;
  double obs_min_y = 0.0;
  double obs_max_y = 0.0;
  const bool has_obstacle = GetExpandedObstacleAabb(config, obs_min_x, obs_max_x, obs_min_y, obs_max_y);

  double remaining = dt;
  for (int iteration = 0; iteration < 3 && remaining > 0.0; ++iteration) {
    if (has_arena) {
      if (state.x < arena_min || state.x > arena_max || state.y < arena_min || state.y > arena_max) {
        ResolveArenaPenetration(state, arena_min, arena_max);
      }
    }

    if (has_obstacle) {
      if (state.x >= obs_min_x && state.x <= obs_max_x && state.y >= obs_min_y && state.y <= obs_max_y) {
        ResolveObstaclePenetration(state, obs_min_x, obs_max_x, obs_min_y, obs_max_y);
      }
    }

    const double prev_x = state.x;
    const double prev_y = state.y;
    const double delta_x = state.vel_x * remaining;
    const double delta_y = state.vel_y * remaining;
    if (delta_x == 0.0 && delta_y == 0.0) {
      break;
    }

    SweepHit best;
    if (has_arena) {
      SweepArenaBounds(prev_x, prev_y, delta_x, delta_y, arena_min, arena_max, best);
    }
    if (has_obstacle) {
      const bool prev_inside =
          prev_x >= obs_min_x && prev_x <= obs_max_x && prev_y >= obs_min_y && prev_y <= obs_max_y;
      if (!prev_inside) {
        SweepObstacleAabb(prev_x, prev_y, delta_x, delta_y, obs_min_x, obs_max_x, obs_min_y, obs_max_y, best);
      }
    }

    if (!best.hit) {
      state.x = prev_x + delta_x;
      state.y = prev_y + delta_y;
      break;
    }

    state.x = prev_x + delta_x * best.t;
    state.y = prev_y + delta_y * best.t;
    if (best.clamp_x_valid) {
      state.x = best.clamp_x;
    }
    if (best.clamp_y_valid) {
      state.y = best.clamp_y;
    }

    if (best.normal_x != 0.0 && state.vel_x * best.normal_x < 0.0) {
      state.vel_x = 0.0;
    }
    if (best.normal_y != 0.0 && state.vel_y * best.normal_y < 0.0) {
      state.vel_y = 0.0;
    }

    remaining *= (1.0 - best.t);
  }

  if (has_obstacle) {
    if (state.x >= obs_min_x && state.x <= obs_max_x && state.y >= obs_min_y && state.y <= obs_max_y) {
      ResolveObstaclePenetration(state, obs_min_x, obs_max_x, obs_min_y, obs_max_y);
    }
  }
  if (has_arena) {
    ResolveArenaPenetration(state, arena_min, arena_max);
  }
}

inline void StepPlayer(PlayerState &state, const SimInput &input, const SimConfig &config, double dt) {
  if (!std::isfinite(dt) || dt <= 0.0) {
    return;
  }

  const double accel = std::max(0.0, config.accel);
  const double friction = std::max(0.0, config.friction);
  double max_speed = std::max(0.0, config.move_speed);
  const double sprint_multiplier =
      (std::isfinite(config.sprint_multiplier) && config.sprint_multiplier > 0.0)
          ? config.sprint_multiplier
          : 1.0;
  if (input.sprint) {
    max_speed *= sprint_multiplier;
  }

  double wish_x = input.move_x;
  double wish_y = input.move_y;
  double wish_mag = std::sqrt(wish_x * wish_x + wish_y * wish_y);
  if (wish_mag > 1.0) {
    wish_x /= wish_mag;
    wish_y /= wish_mag;
    wish_mag = 1.0;
  }

  if (wish_mag > 0.0 && max_speed > 0.0 && accel > 0.0) {
    const double dir_x = wish_x / wish_mag;
    const double dir_y = wish_y / wish_mag;
    state.vel_x += dir_x * accel * dt;
    state.vel_y += dir_y * accel * dt;
    const double speed = std::sqrt(state.vel_x * state.vel_x + state.vel_y * state.vel_y);
    if (speed > max_speed) {
      const double scale = max_speed / speed;
      state.vel_x *= scale;
      state.vel_y *= scale;
    }
  } else if (friction > 0.0) {
    const double speed = std::sqrt(state.vel_x * state.vel_x + state.vel_y * state.vel_y);
    if (speed > 0.0) {
      const double drop = friction * dt;
      const double new_speed = std::max(0.0, speed - drop);
      const double scale = new_speed / speed;
      state.vel_x *= scale;
      state.vel_y *= scale;
    }
  }

  const double dash_cooldown = std::max(0.0, config.dash_cooldown);
  if (!std::isfinite(state.dash_cooldown) || state.dash_cooldown < 0.0) {
    state.dash_cooldown = 0.0;
  } else if (state.dash_cooldown > 0.0) {
    state.dash_cooldown = std::max(0.0, state.dash_cooldown - dt);
  }

  const double dash_impulse = std::max(0.0, config.dash_impulse);
  if (input.dash && dash_impulse > 0.0 && state.dash_cooldown <= 0.0) {
    double dash_dir_x = 0.0;
    double dash_dir_y = 0.0;
    if (wish_mag > 0.0) {
      dash_dir_x = wish_x / wish_mag;
      dash_dir_y = wish_y / wish_mag;
    } else {
      const double speed = std::sqrt(state.vel_x * state.vel_x + state.vel_y * state.vel_y);
      if (speed > 0.0) {
        dash_dir_x = state.vel_x / speed;
        dash_dir_y = state.vel_y / speed;
      }
    }
    if (dash_dir_x != 0.0 || dash_dir_y != 0.0) {
      state.vel_x += dash_dir_x * dash_impulse;
      state.vel_y += dash_dir_y * dash_impulse;
      state.dash_cooldown = dash_cooldown;
    }
  }

  const double jump_velocity = std::max(0.0, config.jump_velocity);
  if (state.grounded) {
    if (input.jump && jump_velocity > 0.0) {
      state.vel_z = jump_velocity;
      state.grounded = false;
    } else if (state.vel_z < 0.0) {
      state.vel_z = 0.0;
    }
  }

  const double gravity = std::max(0.0, config.gravity);
  if (!state.grounded && gravity > 0.0) {
    state.vel_z -= gravity * dt;
  }

  AdvanceWithCollisions(state, config, dt);

  state.z += state.vel_z * dt;
  if (!std::isfinite(state.z)) {
    state.z = 0.0;
    state.vel_z = 0.0;
    state.grounded = true;
  } else if (state.z <= 0.0) {
    state.z = 0.0;
    if (state.vel_z < 0.0) {
      state.vel_z = 0.0;
    }
    state.grounded = true;
  } else {
    state.grounded = false;
  }
}

}  // namespace afps::sim
