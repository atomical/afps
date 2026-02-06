#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include <vector>

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
  double grapple_max_distance;
  double grapple_pull_strength;
  double grapple_damping;
  double grapple_cooldown;
  double grapple_min_attach_normal_y;
  double grapple_rope_slack;
  double shield_duration;
  double shield_cooldown;
  double shield_damage_multiplier;
  double shockwave_radius;
  double shockwave_impulse;
  double shockwave_cooldown;
  double shockwave_damage;
  double arena_half_size;
  double player_radius;
  double player_height;
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
  bool grapple = false;
  bool shield = false;
  bool shockwave = false;
  double view_yaw = 0.0;
  double view_pitch = 0.0;
};

struct AabbCollider {
  int id = 0;
  double min_x = 0.0;
  double min_y = 0.0;
  double min_z = 0.0;
  double max_x = 0.0;
  double max_y = 0.0;
  double max_z = 0.0;
  uint8_t surface_type = 0;
  uint32_t tags = 0;
};

struct CollisionWorld {
  std::vector<AabbCollider> colliders;
};

inline bool IsValidAabbCollider(const AabbCollider &collider) {
  if (!std::isfinite(collider.min_x) || !std::isfinite(collider.min_y) || !std::isfinite(collider.min_z) ||
      !std::isfinite(collider.max_x) || !std::isfinite(collider.max_y) || !std::isfinite(collider.max_z)) {
    return false;
  }
  if (collider.min_x >= collider.max_x || collider.min_y >= collider.max_y || collider.min_z >= collider.max_z) {
    return false;
  }
  return true;
}

inline void ClearColliders(CollisionWorld &world) {
  world.colliders.clear();
}

inline void AddAabbCollider(CollisionWorld &world, const AabbCollider &collider) {
  if (!IsValidAabbCollider(collider)) {
    return;
  }
  world.colliders.push_back(collider);
}

inline void SetAabbColliders(CollisionWorld &world, const std::vector<AabbCollider> &colliders) {
  world.colliders.clear();
  world.colliders.reserve(colliders.size());
  for (const auto &collider : colliders) {
    AddAabbCollider(world, collider);
  }
}

struct PlayerState {
  double x = 0.0;
  double y = 0.0;
  double z = 0.0;
  double vel_x = 0.0;
  double vel_y = 0.0;
  double vel_z = 0.0;
  bool grounded = true;
  double dash_cooldown = 0.0;
  double grapple_cooldown = 0.0;
  bool grapple_active = false;
  bool grapple_input = false;
  double grapple_anchor_x = 0.0;
  double grapple_anchor_y = 0.0;
  double grapple_anchor_z = 0.0;
  double grapple_anchor_nx = 0.0;
  double grapple_anchor_ny = 0.0;
  double grapple_anchor_nz = 0.0;
  double grapple_length = 0.0;
  double shield_timer = 0.0;
  double shield_cooldown = 0.0;
  bool shield_active = false;
  bool shield_input = false;
  double shockwave_cooldown = 0.0;
  bool shockwave_input = false;
  bool shockwave_triggered = false;
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
    20.0,
    25.0,
    4.0,
    1.0,
    0.2,
    0.5,
    2.0,
    5.0,
    0.4,
    6.0,
    10.0,
    6.0,
    10.0,
    30.0,
    0.5,
    1.7,
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

inline double SafeAngle(double value) {
  return std::isfinite(value) ? value : 0.0;
}

inline SimInput MakeInput(double move_x,
                          double move_y,
                          bool sprint,
                          bool jump,
                          bool dash,
                          bool grapple,
                          bool shield,
                          bool shockwave,
                          double view_yaw = 0.0,
                          double view_pitch = 0.0) {
  return {ClampAxis(move_x), ClampAxis(move_y), sprint, jump, dash, grapple, shield, shockwave, SafeAngle(view_yaw),
          SafeAngle(view_pitch)};
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

struct Vec3 {
  double x = 0.0;
  double y = 0.0;
  double z = 0.0;
};

struct ViewAngles {
  double yaw = 0.0;
  double pitch = 0.0;
};

struct RaycastHit {
  bool hit = false;
  double t = std::numeric_limits<double>::infinity();
  double normal_x = 0.0;
  double normal_y = 0.0;
  double normal_z = 0.0;
  int collider_id = -1;
  uint8_t surface_type = 0;
};

inline double WrapAngle(double angle) {
  constexpr double kPi = 3.14159265358979323846;
  if (!std::isfinite(angle)) {
    return 0.0;
  }
  double wrapped = std::fmod(angle + kPi, 2.0 * kPi);
  if (wrapped < 0.0) {
    wrapped += 2.0 * kPi;
  }
  return wrapped - kPi;
}

inline ViewAngles SanitizeViewAngles(double yaw, double pitch) {
  constexpr double kPi = 3.14159265358979323846;
  constexpr double kMaxPitch = (kPi / 2.0) - 0.01;
  ViewAngles result;
  result.yaw = WrapAngle(yaw);
  const double safe_pitch = std::isfinite(pitch) ? pitch : 0.0;
  result.pitch = std::max(-kMaxPitch, std::min(kMaxPitch, safe_pitch));
  return result;
}

inline Vec3 ViewDirection(const ViewAngles &angles) {
  const double cos_pitch = std::cos(angles.pitch);
  Vec3 dir{std::sin(angles.yaw) * cos_pitch, -std::cos(angles.yaw) * cos_pitch, std::sin(angles.pitch)};
  const double len = std::sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
  if (len <= 0.0 || !std::isfinite(len)) {
    return {0.0, -1.0, 0.0};
  }
  dir.x /= len;
  dir.y /= len;
  dir.z /= len;
  return dir;
}

inline void RaycastAabb2D(double origin_x,
                          double origin_y,
                          double dir_x,
                          double dir_y,
                          double min_x,
                          double max_x,
                          double min_y,
                          double max_y,
                          RaycastHit &best) {
  const double epsilon = 1e-8;
  if (!std::isfinite(dir_x) || !std::isfinite(dir_y)) {
    return;
  }

  auto test_plane_x = [&](double plane_x, double normal_x) {
    if (std::abs(dir_x) < epsilon) {
      return;
    }
    const double t = (plane_x - origin_x) / dir_x;
    if (!std::isfinite(t) || t < 0.0 || t >= best.t) {
      return;
    }
    const double hit_y = origin_y + dir_y * t;
    if (hit_y < min_y || hit_y > max_y) {
      return;
    }
    best.hit = true;
    best.t = t;
    best.normal_x = normal_x;
    best.normal_y = 0.0;
    best.normal_z = 0.0;
  };

  auto test_plane_y = [&](double plane_y, double normal_y) {
    if (std::abs(dir_y) < epsilon) {
      return;
    }
    const double t = (plane_y - origin_y) / dir_y;
    if (!std::isfinite(t) || t < 0.0 || t >= best.t) {
      return;
    }
    const double hit_x = origin_x + dir_x * t;
    if (hit_x < min_x || hit_x > max_x) {
      return;
    }
    best.hit = true;
    best.t = t;
    best.normal_x = 0.0;
    best.normal_y = normal_y;
    best.normal_z = 0.0;
  };

  test_plane_x(min_x, -1.0);
  test_plane_x(max_x, 1.0);
  test_plane_y(min_y, -1.0);
  test_plane_y(max_y, 1.0);
}

inline bool RaycastAabb3D(double origin_x,
                          double origin_y,
                          double origin_z,
                          double dir_x,
                          double dir_y,
                          double dir_z,
                          double min_x,
                          double max_x,
                          double min_y,
                          double max_y,
                          double min_z,
                          double max_z,
                          double &hit_t,
                          double &normal_x,
                          double &normal_y,
                          double &normal_z) {
  const double epsilon = 1e-8;
  double t_min = -std::numeric_limits<double>::infinity();
  double t_max = std::numeric_limits<double>::infinity();
  double near_normal_x = 0.0;
  double near_normal_y = 0.0;
  double near_normal_z = 0.0;
  double far_normal_x = 0.0;
  double far_normal_y = 0.0;
  double far_normal_z = 0.0;
  normal_x = 0.0;
  normal_y = 0.0;
  normal_z = 0.0;

  auto update_axis = [&](double origin,
                         double dir,
                         double min_bound,
                         double max_bound,
                         double axis_normal_x,
                         double axis_normal_y,
                         double axis_normal_z) -> bool {
    if (std::abs(dir) < epsilon) {
      return origin >= min_bound && origin <= max_bound;
    }
    const double inv = 1.0 / dir;
    double t1 = (min_bound - origin) * inv;
    double t2 = (max_bound - origin) * inv;
    double near_nx = -axis_normal_x;
    double near_ny = -axis_normal_y;
    double near_nz = -axis_normal_z;
    double far_nx = axis_normal_x;
    double far_ny = axis_normal_y;
    double far_nz = axis_normal_z;
    if (t1 > t2) {
      std::swap(t1, t2);
      near_nx = axis_normal_x;
      near_ny = axis_normal_y;
      near_nz = axis_normal_z;
      far_nx = -axis_normal_x;
      far_ny = -axis_normal_y;
      far_nz = -axis_normal_z;
    }
    if (t1 > t_min) {
      t_min = t1;
      near_normal_x = near_nx;
      near_normal_y = near_ny;
      near_normal_z = near_nz;
    }
    if (t2 < t_max) {
      t_max = t2;
      far_normal_x = far_nx;
      far_normal_y = far_ny;
      far_normal_z = far_nz;
    }
    return t_min <= t_max;
  };

  if (!update_axis(origin_x, dir_x, min_x, max_x, 1.0, 0.0, 0.0)) {
    return false;
  }
  if (!update_axis(origin_y, dir_y, min_y, max_y, 0.0, 1.0, 0.0)) {
    return false;
  }
  if (!update_axis(origin_z, dir_z, min_z, max_z, 0.0, 0.0, 1.0)) {
    return false;
  }
  if (t_max < 0.0) {
    return false;
  }
  if (t_min >= 0.0) {
    hit_t = t_min;
    normal_x = near_normal_x;
    normal_y = near_normal_y;
    normal_z = near_normal_z;
  } else {
    hit_t = t_max;
    normal_x = far_normal_x;
    normal_y = far_normal_y;
    normal_z = far_normal_z;
  }
  return std::isfinite(hit_t) && hit_t >= 0.0;
}

inline bool GetArenaAabb(const SimConfig &config, double &min_bound, double &max_bound) {
  if (!std::isfinite(config.arena_half_size) || config.arena_half_size <= 0.0) {
    return false;
  }
  const double half_size = std::max(0.0, config.arena_half_size);
  min_bound = -half_size;
  max_bound = half_size;
  return true;
}

inline bool GetObstacleAabb(const SimConfig &config,
                            double &min_x,
                            double &max_x,
                            double &min_y,
                            double &max_y) {
  if (!std::isfinite(config.obstacle_min_x) || !std::isfinite(config.obstacle_max_x) ||
      !std::isfinite(config.obstacle_min_y) || !std::isfinite(config.obstacle_max_y)) {
    return false;
  }
  if (config.obstacle_min_x >= config.obstacle_max_x || config.obstacle_min_y >= config.obstacle_max_y) {
    return false;
  }
  min_x = config.obstacle_min_x;
  max_x = config.obstacle_max_x;
  min_y = config.obstacle_min_y;
  max_y = config.obstacle_max_y;
  return true;
}

inline RaycastHit RaycastWorld(const Vec3 &origin,
                               const Vec3 &dir,
                               const SimConfig &config,
                               const CollisionWorld *world = nullptr) {
  RaycastHit best;
  const double epsilon = 1e-8;
  if (std::abs(dir.x) < epsilon && std::abs(dir.y) < epsilon && std::abs(dir.z) < epsilon) {
    return best;
  }
  double arena_min = 0.0;
  double arena_max = 0.0;
  if (GetArenaAabb(config, arena_min, arena_max)) {
    const double before_t = best.t;
    RaycastAabb2D(origin.x, origin.y, dir.x, dir.y, arena_min, arena_max, arena_min, arena_max, best);
    if (best.hit && best.t < before_t) {
      best.collider_id = -1;
      best.surface_type = 0;
    }
    auto test_plane_z = [&](double plane_z, double normal_z) {
      if (std::abs(dir.z) < epsilon) {
        return;
      }
      const double t = (plane_z - origin.z) / dir.z;
      if (!std::isfinite(t) || t < 0.0 || t >= best.t) {
        return;
      }
      const double hit_x = origin.x + dir.x * t;
      const double hit_y = origin.y + dir.y * t;
      if (hit_x < arena_min || hit_x > arena_max || hit_y < arena_min || hit_y > arena_max) {
        return;
      }
      best.hit = true;
      best.t = t;
      best.normal_x = 0.0;
      best.normal_y = 0.0;
      best.normal_z = normal_z;
      best.collider_id = -1;
      best.surface_type = normal_z > 0.0 ? 2 : 0;
    };

    double ceiling_z = 0.0;
    if (std::isfinite(config.arena_half_size) && config.arena_half_size > 0.0) {
      const double half_size = std::max(0.0, config.arena_half_size);
      const double player_height =
          (std::isfinite(config.player_height) && config.player_height >= 0.0) ? config.player_height : 0.0;
      ceiling_z = std::max(0.0, half_size - player_height);
      test_plane_z(0.0, 1.0);
      test_plane_z(ceiling_z, -1.0);
    }
  }
  double obs_min_x = 0.0;
  double obs_max_x = 0.0;
  double obs_min_y = 0.0;
  double obs_max_y = 0.0;
  if (GetObstacleAabb(config, obs_min_x, obs_max_x, obs_min_y, obs_max_y)) {
    const double before_t = best.t;
    RaycastAabb2D(origin.x, origin.y, dir.x, dir.y, obs_min_x, obs_max_x, obs_min_y, obs_max_y, best);
    if (best.hit && best.t < before_t) {
      best.collider_id = -2;
      best.surface_type = 1;
    }
  }
  if (world) {
    for (const auto &collider : world->colliders) {
      if (!IsValidAabbCollider(collider)) {
        continue;
      }
      double t = 0.0;
      double normal_x = 0.0;
      double normal_y = 0.0;
      double normal_z = 0.0;
      if (!RaycastAabb3D(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, collider.min_x, collider.max_x,
                         collider.min_y, collider.max_y, collider.min_z, collider.max_z, t, normal_x, normal_y,
                         normal_z)) {
        continue;
      }
      if (!std::isfinite(t) || t < 0.0 || t >= best.t) {
        continue;
      }
      best.hit = true;
      best.t = t;
      best.normal_x = normal_x;
      best.normal_y = normal_y;
      best.normal_z = normal_z;
      best.collider_id = collider.id;
      best.surface_type = collider.surface_type;
    }
  }
  return best;
}

inline double ResolveEyeHeight(const SimConfig &config) {
  constexpr double kDefaultEyeHeight = 1.6;
  if (!std::isfinite(config.player_height) || config.player_height <= 0.0) {
    return kDefaultEyeHeight;
  }
  return std::min(config.player_height, kDefaultEyeHeight);
}

inline void ResolveAabbPenetration(PlayerState &state, double min_x, double max_x, double min_y, double max_y) {
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

inline void SweepAabb(double prev_x, double prev_y, double delta_x, double delta_y, double min_x, double max_x,
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

struct ExpandedAabb2D {
  double min_x = 0.0;
  double max_x = 0.0;
  double min_y = 0.0;
  double max_y = 0.0;
};

inline double ResolveCollisionPlayerHeight(const SimConfig &config) {
  return (std::isfinite(config.player_height) && config.player_height > 0.0) ? config.player_height : 1.7;
}

inline bool BuildExpandedAabbFromCollider(const AabbCollider &collider,
                                          const PlayerState &state,
                                          const SimConfig &config,
                                          ExpandedAabb2D &out) {
  if (!IsValidAabbCollider(collider)) {
    return false;
  }
  const double player_min_z = state.z;
  const double player_max_z = state.z + ResolveCollisionPlayerHeight(config);
  if (player_max_z <= collider.min_z || player_min_z >= collider.max_z) {
    return false;
  }
  const double radius = (std::isfinite(config.player_radius) && config.player_radius > 0.0) ? config.player_radius : 0.0;
  out.min_x = collider.min_x - radius;
  out.max_x = collider.max_x + radius;
  out.min_y = collider.min_y - radius;
  out.max_y = collider.max_y + radius;
  return true;
}

inline void ResolveOverlaps(PlayerState &state, const std::vector<ExpandedAabb2D> &expanded_aabbs) {
  constexpr int kMaxOverlapPasses = 4;
  for (int pass = 0; pass < kMaxOverlapPasses; ++pass) {
    bool any_overlap = false;
    for (const auto &aabb : expanded_aabbs) {
      if (state.x >= aabb.min_x && state.x <= aabb.max_x && state.y >= aabb.min_y && state.y <= aabb.max_y) {
        ResolveAabbPenetration(state, aabb.min_x, aabb.max_x, aabb.min_y, aabb.max_y);
        any_overlap = true;
      }
    }
    if (!any_overlap) {
      break;
    }
  }
}

inline void AdvanceWithCollisions(PlayerState &state,
                                  const SimConfig &config,
                                  double dt,
                                  const CollisionWorld *world = nullptr) {
  double arena_min = 0.0;
  double arena_max = 0.0;
  const bool has_arena = GetArenaBounds(config, arena_min, arena_max);

  double remaining = dt;
  for (int iteration = 0; iteration < 3 && remaining > 0.0; ++iteration) {
    std::vector<ExpandedAabb2D> expanded_aabbs;
    if (world && !world->colliders.empty()) {
      expanded_aabbs.reserve(world->colliders.size() + 1);
      for (const auto &collider : world->colliders) {
        ExpandedAabb2D expanded;
        if (BuildExpandedAabbFromCollider(collider, state, config, expanded)) {
          expanded_aabbs.push_back(expanded);
        }
      }
    }
    double obs_min_x = 0.0;
    double obs_max_x = 0.0;
    double obs_min_y = 0.0;
    double obs_max_y = 0.0;
    const bool has_obstacle = GetExpandedObstacleAabb(config, obs_min_x, obs_max_x, obs_min_y, obs_max_y);
    if (has_obstacle) {
      expanded_aabbs.push_back({obs_min_x, obs_max_x, obs_min_y, obs_max_y});
    }

    if (has_arena) {
      if (state.x < arena_min || state.x > arena_max || state.y < arena_min || state.y > arena_max) {
        ResolveArenaPenetration(state, arena_min, arena_max);
      }
    }

    ResolveOverlaps(state, expanded_aabbs);

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
    for (const auto &aabb : expanded_aabbs) {
      const bool prev_inside = prev_x >= aabb.min_x && prev_x <= aabb.max_x && prev_y >= aabb.min_y && prev_y <= aabb.max_y;
      if (!prev_inside) {
        SweepAabb(prev_x, prev_y, delta_x, delta_y, aabb.min_x, aabb.max_x, aabb.min_y, aabb.max_y, best);
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

  std::vector<ExpandedAabb2D> final_aabbs;
  if (world && !world->colliders.empty()) {
    final_aabbs.reserve(world->colliders.size() + 1);
    for (const auto &collider : world->colliders) {
      ExpandedAabb2D expanded;
      if (BuildExpandedAabbFromCollider(collider, state, config, expanded)) {
        final_aabbs.push_back(expanded);
      }
    }
  }
  double obs_min_x = 0.0;
  double obs_max_x = 0.0;
  double obs_min_y = 0.0;
  double obs_max_y = 0.0;
  if (GetExpandedObstacleAabb(config, obs_min_x, obs_max_x, obs_min_y, obs_max_y)) {
    final_aabbs.push_back({obs_min_x, obs_max_x, obs_min_y, obs_max_y});
  }
  if (!final_aabbs.empty()) {
    ResolveOverlaps(state, final_aabbs);
  }
  if (has_arena) {
    ResolveArenaPenetration(state, arena_min, arena_max);
  }
}

inline void StepPlayer(PlayerState &state,
                       const SimInput &input,
                       const SimConfig &config,
                       double dt,
                       const CollisionWorld *world = nullptr) {
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

  const double grapple_cooldown = std::max(0.0, config.grapple_cooldown);
  if (!std::isfinite(state.grapple_cooldown) || state.grapple_cooldown < 0.0) {
    state.grapple_cooldown = 0.0;
  } else if (state.grapple_cooldown > 0.0) {
    state.grapple_cooldown = std::max(0.0, state.grapple_cooldown - dt);
  }

  const bool grapple_pressed = input.grapple && !state.grapple_input;
  const bool grapple_released = !input.grapple && state.grapple_input;
  state.grapple_input = input.grapple;

  auto release_grapple = [&](bool apply_cooldown) {
    state.grapple_active = false;
    state.grapple_length = 0.0;
    state.grapple_anchor_x = 0.0;
    state.grapple_anchor_y = 0.0;
    state.grapple_anchor_z = 0.0;
    state.grapple_anchor_nx = 0.0;
    state.grapple_anchor_ny = 0.0;
    state.grapple_anchor_nz = 0.0;
    if (apply_cooldown) {
      state.grapple_cooldown = grapple_cooldown;
    }
  };

  if (grapple_pressed && state.grapple_cooldown <= 0.0) {
    const double max_distance = std::max(0.0, config.grapple_max_distance);
    if (max_distance > 0.0) {
      const ViewAngles view = SanitizeViewAngles(input.view_yaw, input.view_pitch);
      const Vec3 dir = ViewDirection(view);
      const double eye_height = ResolveEyeHeight(config);
      Vec3 origin{state.x, state.y, state.z + eye_height};
      const RaycastHit hit = RaycastWorld(origin, dir, config, world);
      if (hit.hit && hit.t >= 0.0 && hit.t <= max_distance) {
        double anchor_x = origin.x + dir.x * hit.t;
        double anchor_y = origin.y + dir.y * hit.t;
        double anchor_z = origin.z + dir.z * hit.t;
        double ceiling_z = std::numeric_limits<double>::infinity();
        if (std::isfinite(config.arena_half_size) && config.arena_half_size > 0.0) {
          const double half_size = std::max(0.0, config.arena_half_size);
          const double player_height =
              (std::isfinite(config.player_height) && config.player_height >= 0.0) ? config.player_height : 0.0;
          ceiling_z = std::max(0.0, half_size - player_height);
        }
        if (!std::isfinite(anchor_z)) {
          anchor_z = origin.z;
        }
        anchor_z = std::max(0.0, std::min(anchor_z, ceiling_z));
        const double dx = anchor_x - origin.x;
        const double dy = anchor_y - origin.y;
        const double dz = anchor_z - origin.z;
        const double anchor_dist = std::sqrt(dx * dx + dy * dy + dz * dz);
        const double min_attach_normal = std::max(0.0, config.grapple_min_attach_normal_y);
        const double normal_z = hit.normal_z;
        const bool allow_attach =
            (std::abs(normal_z) < 1e-6) || (min_attach_normal <= 0.0) || (std::abs(normal_z) >= min_attach_normal);
        if (allow_attach && std::isfinite(anchor_dist)) {
          state.grapple_active = true;
          state.grapple_anchor_x = anchor_x;
          state.grapple_anchor_y = anchor_y;
          state.grapple_anchor_z = anchor_z;
          state.grapple_anchor_nx = hit.normal_x;
          state.grapple_anchor_ny = hit.normal_y;
          state.grapple_anchor_nz = hit.normal_z;
          state.grapple_length = std::max(0.0, anchor_dist);
        }
      }
    }
  }

  const double shield_cooldown = std::max(0.0, config.shield_cooldown);
  if (!std::isfinite(state.shield_cooldown) || state.shield_cooldown < 0.0) {
    state.shield_cooldown = 0.0;
  } else if (state.shield_cooldown > 0.0) {
    state.shield_cooldown = std::max(0.0, state.shield_cooldown - dt);
  }

  const double shield_duration = std::max(0.0, config.shield_duration);
  if (!std::isfinite(state.shield_timer) || state.shield_timer < 0.0) {
    state.shield_timer = 0.0;
  }
  const bool shield_pressed = input.shield && !state.shield_input;
  const bool shield_released = !input.shield && state.shield_input;
  state.shield_input = input.shield;

  auto release_shield = [&]() {
    state.shield_active = false;
    state.shield_timer = 0.0;
    state.shield_cooldown = shield_cooldown;
  };

  if (shield_pressed && state.shield_cooldown <= 0.0 && shield_duration > 0.0) {
    state.shield_active = true;
    state.shield_timer = shield_duration;
  }

  if (state.shield_active) {
    if (shield_released) {
      release_shield();
    } else {
      state.shield_timer = std::max(0.0, state.shield_timer - dt);
      if (state.shield_timer <= 0.0) {
        release_shield();
      }
    }
  }

  const double shockwave_cooldown = std::max(0.0, config.shockwave_cooldown);
  if (!std::isfinite(state.shockwave_cooldown) || state.shockwave_cooldown < 0.0) {
    state.shockwave_cooldown = 0.0;
  } else if (state.shockwave_cooldown > 0.0) {
    state.shockwave_cooldown = std::max(0.0, state.shockwave_cooldown - dt);
  }

  state.shockwave_triggered = false;
  const bool shockwave_pressed = input.shockwave && !state.shockwave_input;
  state.shockwave_input = input.shockwave;
  const double shockwave_radius = std::max(0.0, config.shockwave_radius);
  const double shockwave_impulse = std::max(0.0, config.shockwave_impulse);
  const double shockwave_damage = std::max(0.0, config.shockwave_damage);
  const bool shockwave_ready =
      shockwave_radius > 0.0 && (shockwave_impulse > 0.0 || shockwave_damage > 0.0);
  if (shockwave_pressed && state.shockwave_cooldown <= 0.0 && shockwave_ready) {
    state.shockwave_triggered = true;
    state.shockwave_cooldown = shockwave_cooldown;
  }

  if (state.grapple_active) {
    if (grapple_released) {
      release_grapple(true);
    } else {
      const double eye_height = ResolveEyeHeight(config);
      Vec3 origin{state.x, state.y, state.z + eye_height};
      const double dx = state.grapple_anchor_x - origin.x;
      const double dy = state.grapple_anchor_y - origin.y;
      const double dz = state.grapple_anchor_z - origin.z;
      const double dist = std::sqrt(dx * dx + dy * dy + dz * dz);
      if (!std::isfinite(dist) || dist <= 0.0) {
        release_grapple(true);
      } else {
        const double max_distance = std::max(0.0, config.grapple_max_distance);
        const double rope_slack = std::max(0.0, config.grapple_rope_slack);
        if (max_distance > 0.0 && dist > max_distance + rope_slack) {
          release_grapple(true);
        } else {
          const Vec3 dir{dx / dist, dy / dist, dz / dist};
          const RaycastHit los_hit = RaycastWorld(origin, dir, config, world);
          if (!los_hit.hit || los_hit.t + 1e-4 < dist) {
            release_grapple(true);
          } else if (dist > state.grapple_length + rope_slack) {
            const double stretch = dist - state.grapple_length - rope_slack;
            const double pull_strength = std::max(0.0, config.grapple_pull_strength);
            const double damping = std::max(0.0, config.grapple_damping);
            const double vel_along = state.vel_x * dir.x + state.vel_y * dir.y + state.vel_z * dir.z;
            const double accel = pull_strength * stretch - damping * vel_along;
            if (std::isfinite(accel) && accel > 0.0) {
              state.vel_x += dir.x * accel * dt;
              state.vel_y += dir.y * accel * dt;
              state.vel_z += dir.z * accel * dt;
            }
          }
        }
      }
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

  AdvanceWithCollisions(state, config, dt, world);

  const double player_height =
      (std::isfinite(config.player_height) && config.player_height >= 0.0) ? config.player_height : 0.0;
  constexpr double kWalkableNormalZ = 0.7;
  double ceiling_z = std::numeric_limits<double>::infinity();
  if (std::isfinite(config.arena_half_size) && config.arena_half_size > 0.0) {
    const double half_size = std::max(0.0, config.arena_half_size);
    ceiling_z = std::max(0.0, half_size - player_height);
  }

  state.z += state.vel_z * dt;
  if (!std::isfinite(state.z)) {
    state.z = 0.0;
    state.vel_z = 0.0;
    state.grounded = true;
  } else if (state.z > ceiling_z) {
    state.z = ceiling_z;
    if (state.vel_z > 0.0) {
      state.vel_z = 0.0;
    }
  } else if (state.z <= 0.0) {
    state.z = 0.0;
    if (state.vel_z < 0.0) {
      state.vel_z = 0.0;
    }
    const double ground_normal_z = 1.0;
    state.grounded = ground_normal_z >= kWalkableNormalZ;
  } else {
    state.grounded = false;
  }
}

}  // namespace afps::sim
