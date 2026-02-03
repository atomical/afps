#include "combat.h"

#include <algorithm>
#include <cmath>

namespace afps::combat {

namespace {
constexpr double kPi = 3.14159265358979323846;
constexpr double kMaxPitch = (kPi / 2.0) - 0.01;

double WrapAngle(double angle) {
  if (!std::isfinite(angle)) {
    return 0.0;
  }
  double wrapped = std::fmod(angle + kPi, 2.0 * kPi);
  if (wrapped < 0.0) {
    wrapped += 2.0 * kPi;
  }
  return wrapped - kPi;
}

double RaycastAabb2D(double origin_x, double origin_y, double dir_x, double dir_y, double min_x, double max_x,
                     double min_y, double max_y) {
  const double inf = std::numeric_limits<double>::infinity();
  const double epsilon = 1e-8;
  double t_min = -inf;
  double t_max = inf;

  auto update_axis = [&](double origin, double dir, double min_bound, double max_bound) -> bool {
    if (std::abs(dir) < epsilon) {
      return origin >= min_bound && origin <= max_bound;
    }
    double t1 = (min_bound - origin) / dir;
    double t2 = (max_bound - origin) / dir;
    if (t1 > t2) {
      std::swap(t1, t2);
    }
    t_min = std::max(t_min, t1);
    t_max = std::min(t_max, t2);
    return t_min <= t_max;
  };

  if (!update_axis(origin_x, dir_x, min_x, max_x)) {
    return inf;
  }
  if (!update_axis(origin_y, dir_y, min_y, max_y)) {
    return inf;
  }
  if (t_max < 0.0) {
    return inf;
  }
  if (t_min >= 0.0) {
    return t_min;
  }
  return t_max;
}

double RaycastArena(const Vec3 &origin, const Vec3 &dir, const afps::sim::SimConfig &config) {
  if (!std::isfinite(config.arena_half_size) || config.arena_half_size <= 0.0) {
    return std::numeric_limits<double>::infinity();
  }
  const double half = std::max(0.0, config.arena_half_size);
  return RaycastAabb2D(origin.x, origin.y, dir.x, dir.y, -half, half, -half, half);
}

double RaycastObstacle(const Vec3 &origin, const Vec3 &dir, const afps::sim::SimConfig &config) {
  if (!std::isfinite(config.obstacle_min_x) || !std::isfinite(config.obstacle_max_x) ||
      !std::isfinite(config.obstacle_min_y) || !std::isfinite(config.obstacle_max_y)) {
    return std::numeric_limits<double>::infinity();
  }
  if (config.obstacle_min_x >= config.obstacle_max_x || config.obstacle_min_y >= config.obstacle_max_y) {
    return std::numeric_limits<double>::infinity();
  }
  return RaycastAabb2D(origin.x, origin.y, dir.x, dir.y, config.obstacle_min_x, config.obstacle_max_x,
                       config.obstacle_min_y, config.obstacle_max_y);
}

bool RaycastCylinder(const Vec3 &origin, const Vec3 &dir, const Vec3 &base, double height, double radius, double &t) {
  const double epsilon = 1e-8;
  const double a = dir.x * dir.x + dir.y * dir.y;
  const double ox = origin.x - base.x;
  const double oy = origin.y - base.y;
  if (a <= epsilon) {
    return false;
  }
  const double b = 2.0 * (ox * dir.x + oy * dir.y);
  const double c = ox * ox + oy * oy - radius * radius;
  const double discriminant = b * b - 4.0 * a * c;
  if (discriminant < 0.0) {
    return false;
  }
  const double sqrt_disc = std::sqrt(discriminant);
  double t0 = (-b - sqrt_disc) / (2.0 * a);
  double t1 = (-b + sqrt_disc) / (2.0 * a);
  if (t1 < 0.0) {
    return false;
  }
  double candidate = t0 >= 0.0 ? t0 : t1;
  double hit_z = origin.z + dir.z * candidate;
  if (hit_z < base.z || hit_z > base.z + height) {
    if (candidate == t1) {
      return false;
    }
    candidate = t1;
    if (candidate < 0.0) {
      return false;
    }
    hit_z = origin.z + dir.z * candidate;
    if (hit_z < base.z || hit_z > base.z + height) {
      return false;
    }
  }
  t = candidate;
  return true;
}

bool SegmentCylinder(const Vec3 &origin,
                     const Vec3 &delta,
                     const Vec3 &base,
                     double height,
                     double radius,
                     double &t) {
  const double epsilon = 1e-8;
  const double a = delta.x * delta.x + delta.y * delta.y;
  const double ox = origin.x - base.x;
  const double oy = origin.y - base.y;

  if (a <= epsilon) {
    const double dist_sq = ox * ox + oy * oy;
    if (dist_sq > radius * radius) {
      return false;
    }
    if (std::abs(delta.z) <= epsilon) {
      return false;
    }
    double t0 = (base.z - origin.z) / delta.z;
    double t1 = (base.z + height - origin.z) / delta.z;
    if (t0 > t1) {
      std::swap(t0, t1);
    }
    if (t1 < 0.0 || t0 > 1.0) {
      return false;
    }
    t = std::max(0.0, t0);
    return true;
  }

  const double b = 2.0 * (ox * delta.x + oy * delta.y);
  const double c = ox * ox + oy * oy - radius * radius;
  const double discriminant = b * b - 4.0 * a * c;
  if (discriminant < 0.0) {
    return false;
  }
  const double sqrt_disc = std::sqrt(discriminant);
  double t0 = (-b - sqrt_disc) / (2.0 * a);
  double t1 = (-b + sqrt_disc) / (2.0 * a);
  if (t0 > t1) {
    std::swap(t0, t1);
  }
  if (t1 < 0.0 || t0 > 1.0) {
    return false;
  }
  double candidate = t0 >= 0.0 ? t0 : t1;
  double hit_z = origin.z + delta.z * candidate;
  if (hit_z < base.z || hit_z > base.z + height) {
    if (candidate == t1) {
      return false;
    }
    candidate = t1;
    if (candidate < 0.0 || candidate > 1.0) {
      return false;
    }
    hit_z = origin.z + delta.z * candidate;
    if (hit_z < base.z || hit_z > base.z + height) {
      return false;
    }
  }
  t = candidate;
  return true;
}

double ResolveRadius(const afps::sim::SimConfig &config) {
  if (std::isfinite(config.player_radius) && config.player_radius > 0.0) {
    return config.player_radius;
  }
  return 0.5;
}

double ResolveHeight(const afps::sim::SimConfig &config) {
  if (std::isfinite(config.player_height) && config.player_height > 0.0) {
    return config.player_height;
  }
  return kPlayerHeight;
}
}  // namespace

PoseHistory::PoseHistory(size_t max_samples) : max_samples_(max_samples) {}

void PoseHistory::SetMaxSamples(size_t max_samples) {
  max_samples_ = max_samples;
  Trim();
}

void PoseHistory::Push(int server_tick, const afps::sim::PlayerState &state) {
  if (max_samples_ == 0) {
    return;
  }
  samples_.push_back({server_tick, state});
  Trim();
}

bool PoseHistory::SampleAtOrBefore(int server_tick, afps::sim::PlayerState &out) const {
  if (samples_.empty()) {
    return false;
  }
  for (auto iter = samples_.rbegin(); iter != samples_.rend(); ++iter) {
    if (iter->server_tick <= server_tick) {
      out = iter->state;
      return true;
    }
  }
  return false;
}

int PoseHistory::OldestTick() const {
  if (samples_.empty()) {
    return 0;
  }
  return samples_.front().server_tick;
}

size_t PoseHistory::size() const {
  return samples_.size();
}

void PoseHistory::Trim() {
  while (samples_.size() > max_samples_) {
    samples_.pop_front();
  }
}

CombatState CreateCombatState() {
  CombatState state;
  state.health = kMaxHealth;
  state.kills = 0;
  state.deaths = 0;
  state.alive = true;
  state.respawn_timer = 0.0;
  return state;
}

bool ApplyDamage(CombatState &target, CombatState *attacker, double damage) {
  if (!target.alive) {
    return false;
  }
  if (!std::isfinite(damage) || damage <= 0.0) {
    return false;
  }
  target.health = std::max(0.0, target.health - damage);
  if (target.health > 0.0) {
    return false;
  }
  target.alive = false;
  target.respawn_timer = kRespawnDelaySeconds;
  target.deaths += 1;
  if (attacker && attacker != &target) {
    attacker->kills += 1;
  }
  return true;
}

double ApplyShieldMultiplier(double damage, bool shield_active, double shield_multiplier) {
  if (!std::isfinite(damage) || damage <= 0.0) {
    return damage;
  }
  if (!shield_active) {
    return damage;
  }
  const double multiplier = std::isfinite(shield_multiplier) ? std::max(0.0, std::min(1.0, shield_multiplier)) : 1.0;
  return damage * multiplier;
}

bool ApplyDamageWithShield(CombatState &target,
                           CombatState *attacker,
                           double damage,
                           bool shield_active,
                           double shield_multiplier) {
  const double adjusted = ApplyShieldMultiplier(damage, shield_active, shield_multiplier);
  return ApplyDamage(target, attacker, adjusted);
}

bool UpdateRespawn(CombatState &state, double dt) {
  if (state.alive) {
    return false;
  }
  if (!std::isfinite(dt) || dt <= 0.0) {
    return false;
  }
  state.respawn_timer = std::max(0.0, state.respawn_timer - dt);
  if (state.respawn_timer > 0.0) {
    return false;
  }
  state.alive = true;
  state.health = kMaxHealth;
  return true;
}

ViewAngles SanitizeViewAngles(double yaw, double pitch) {
  ViewAngles result;
  result.yaw = WrapAngle(yaw);
  const double safe_pitch = std::isfinite(pitch) ? pitch : 0.0;
  result.pitch = std::max(-kMaxPitch, std::min(kMaxPitch, safe_pitch));
  return result;
}

Vec3 ViewDirection(const ViewAngles &angles) {
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

bool IsShieldFacing(const Vec3 &target_pos,
                    const ViewAngles &target_view,
                    const Vec3 &source_pos,
                    double min_dot) {
  const Vec3 forward = ViewDirection(target_view);
  Vec3 to_source{source_pos.x - target_pos.x, source_pos.y - target_pos.y, source_pos.z - target_pos.z};
  const double len = std::sqrt(to_source.x * to_source.x + to_source.y * to_source.y + to_source.z * to_source.z);
  if (len <= 1e-6 || !std::isfinite(len)) {
    return true;
  }
  to_source.x /= len;
  to_source.y /= len;
  to_source.z /= len;
  const double dot = forward.x * to_source.x + forward.y * to_source.y + forward.z * to_source.z;
  if (!std::isfinite(dot)) {
    return false;
  }
  const double threshold = std::isfinite(min_dot) ? min_dot : kShieldBlockDot;
  return dot >= threshold;
}

HitResult ResolveHitscan(const std::string &shooter_id,
                         const std::unordered_map<std::string, PoseHistory> &histories,
                         int rewind_tick,
                         const ViewAngles &view,
                         const afps::sim::SimConfig &config,
                         double range) {
  HitResult result;
  const auto shooter_iter = histories.find(shooter_id);
  if (shooter_iter == histories.end()) {
    return result;
  }
  afps::sim::PlayerState shooter_state;
  if (!shooter_iter->second.SampleAtOrBefore(rewind_tick, shooter_state)) {
    return result;
  }

  const ViewAngles safe_view = SanitizeViewAngles(view.yaw, view.pitch);
  const Vec3 dir = ViewDirection(safe_view);
  if (!std::isfinite(dir.x) || !std::isfinite(dir.y) || !std::isfinite(dir.z)) {
    return result;
  }

  const Vec3 origin{shooter_state.x, shooter_state.y, shooter_state.z + kPlayerEyeHeight};
  const double max_range = (std::isfinite(range) && range > 0.0)
                               ? range
                               : std::numeric_limits<double>::infinity();
  double world_distance = std::min(RaycastArena(origin, dir, config), RaycastObstacle(origin, dir, config));

  const double radius = ResolveRadius(config);
  const double height = ResolveHeight(config);
  double best_t = std::numeric_limits<double>::infinity();
  std::string best_target;
  for (const auto &entry : histories) {
    if (entry.first == shooter_id) {
      continue;
    }
    afps::sim::PlayerState target_state;
    if (!entry.second.SampleAtOrBefore(rewind_tick, target_state)) {
      continue;
    }
    const Vec3 base{target_state.x, target_state.y, target_state.z};
    double t = 0.0;
    if (!RaycastCylinder(origin, dir, base, height, radius, t)) {
      continue;
    }
    if (t < 0.0 || t > max_range) {
      continue;
    }
    if (t < best_t) {
      best_t = t;
      best_target = entry.first;
    }
  }

  if (best_target.empty()) {
    return result;
  }
  if (std::isfinite(world_distance) && world_distance >= 0.0 && best_t > world_distance) {
    return result;
  }

  result.hit = true;
  result.target_id = best_target;
  result.distance = best_t;
  result.position = {origin.x + dir.x * best_t, origin.y + dir.y * best_t, origin.z + dir.z * best_t};
  return result;
}

ProjectileImpact ResolveProjectileImpact(
    const ProjectileState &projectile,
    const Vec3 &delta,
    const afps::sim::SimConfig &config,
    const std::unordered_map<std::string, afps::sim::PlayerState> &players,
    const std::string &ignore_id) {
  ProjectileImpact impact;
  if (!std::isfinite(delta.x) || !std::isfinite(delta.y) || !std::isfinite(delta.z)) {
    return impact;
  }

  const Vec3 origin = projectile.position;
  double best_t = std::numeric_limits<double>::infinity();
  std::string best_target;

  const double radius = std::max(0.0, projectile.radius);
  const double player_radius = ResolveRadius(config) + radius;
  const double height = ResolveHeight(config);

  for (const auto &entry : players) {
    if (entry.first == ignore_id) {
      continue;
    }
    const auto &state = entry.second;
    const Vec3 base{state.x, state.y, state.z};
    double t = 0.0;
    if (!SegmentCylinder(origin, delta, base, height, player_radius, t)) {
      continue;
    }
    if (t < 0.0 || t > 1.0) {
      continue;
    }
    if (t < best_t) {
      best_t = t;
      best_target = entry.first;
    }
  }

  double world_t = std::numeric_limits<double>::infinity();
  double arena_t = RaycastArena(origin, delta, config);
  if (std::isfinite(arena_t) && arena_t >= 0.0 && arena_t <= 1.0) {
    world_t = std::min(world_t, arena_t);
  }
  double obstacle_t = RaycastObstacle(origin, delta, config);
  if (std::isfinite(obstacle_t) && obstacle_t >= 0.0 && obstacle_t <= 1.0) {
    world_t = std::min(world_t, obstacle_t);
  }
  if (std::isfinite(delta.z) && delta.z < 0.0) {
    if (origin.z <= 0.0) {
      world_t = 0.0;
    } else {
      const double t_ground = (0.0 - origin.z) / delta.z;
      if (t_ground >= 0.0 && t_ground <= 1.0) {
        world_t = std::min(world_t, t_ground);
      }
    }
  }

  bool hit_world = false;
  if (!best_target.empty()) {
    if (std::isfinite(world_t) && world_t <= best_t) {
      hit_world = true;
      best_target.clear();
      best_t = world_t;
    }
  } else if (std::isfinite(world_t)) {
    hit_world = true;
    best_t = world_t;
  }

  if (!std::isfinite(best_t) || best_t < 0.0 || best_t > 1.0) {
    return impact;
  }

  impact.hit = true;
  impact.hit_world = hit_world;
  impact.target_id = best_target;
  impact.t = best_t;
  impact.position = {origin.x + delta.x * best_t, origin.y + delta.y * best_t, origin.z + delta.z * best_t};
  return impact;
}

std::vector<ExplosionHit> ComputeExplosionDamage(
    const Vec3 &center,
    double radius,
    double max_damage,
    const std::unordered_map<std::string, afps::sim::PlayerState> &players,
    const std::string &ignore_id) {
  std::vector<ExplosionHit> hits;
  if (!std::isfinite(max_damage) || max_damage <= 0.0) {
    return hits;
  }
  if (!std::isfinite(radius) || radius <= 0.0) {
    return hits;
  }
  const double radius_sq = radius * radius;
  for (const auto &entry : players) {
    if (!ignore_id.empty() && entry.first == ignore_id) {
      continue;
    }
    const auto &state = entry.second;
    const Vec3 target{state.x, state.y, state.z + (kPlayerHeight * 0.5)};
    const double dx = target.x - center.x;
    const double dy = target.y - center.y;
    const double dz = target.z - center.z;
    const double dist_sq = dx * dx + dy * dy + dz * dz;
    if (!std::isfinite(dist_sq) || dist_sq > radius_sq) {
      continue;
    }
    const double dist = std::sqrt(dist_sq);
    const double falloff = std::max(0.0, 1.0 - (dist / radius));
    const double damage = max_damage * falloff;
    if (!std::isfinite(damage) || damage <= 0.0) {
      continue;
    }
    hits.push_back({entry.first, damage, dist});
  }
  return hits;
}

std::vector<ShockwaveHit> ComputeShockwaveHits(
    const Vec3 &center,
    double radius,
    double max_impulse,
    double max_damage,
    const afps::sim::SimConfig &config,
    const std::unordered_map<std::string, afps::sim::PlayerState> &players,
    const std::string &ignore_id) {
  std::vector<ShockwaveHit> hits;
  if (!std::isfinite(radius) || radius <= 0.0) {
    return hits;
  }
  const double safe_impulse = std::isfinite(max_impulse) ? std::max(0.0, max_impulse) : 0.0;
  const double safe_damage = std::isfinite(max_damage) ? std::max(0.0, max_damage) : 0.0;
  if (safe_impulse <= 0.0 && safe_damage <= 0.0) {
    return hits;
  }
  const double radius_sq = radius * radius;
  for (const auto &entry : players) {
    if (!ignore_id.empty() && entry.first == ignore_id) {
      continue;
    }
    const auto &state = entry.second;
    const Vec3 target{state.x, state.y, state.z + (kPlayerHeight * 0.5)};
    const double dx = target.x - center.x;
    const double dy = target.y - center.y;
    const double dz = target.z - center.z;
    const double dist_sq = dx * dx + dy * dy + dz * dz;
    if (!std::isfinite(dist_sq) || dist_sq > radius_sq) {
      continue;
    }
    const double dist = std::sqrt(dist_sq);
    const double falloff = std::max(0.0, 1.0 - (dist / radius));
    if (falloff <= 0.0) {
      continue;
    }
    if (dist > 1e-6 && std::isfinite(dist)) {
      const afps::sim::Vec3 origin{center.x, center.y, center.z};
      const afps::sim::Vec3 dir{dx / dist, dy / dist, dz / dist};
      const afps::sim::RaycastHit los_hit = afps::sim::RaycastWorld(origin, dir, config);
      if (los_hit.hit && los_hit.t + 1e-4 < dist) {
        continue;
      }
    }
    const double impulse_mag = safe_impulse * falloff;
    const double damage = safe_damage * falloff;
    if (!std::isfinite(impulse_mag) && !std::isfinite(damage)) {
      continue;
    }
    Vec3 dir{0.0, 0.0, 1.0};
    if (dist > 1e-6 && std::isfinite(dist)) {
      dir = {dx / dist, dy / dist, dz / dist};
    }
    Vec3 impulse{dir.x * impulse_mag, dir.y * impulse_mag, dir.z * impulse_mag};
    if (!std::isfinite(impulse.x)) {
      impulse.x = 0.0;
    }
    if (!std::isfinite(impulse.y)) {
      impulse.y = 0.0;
    }
    if (!std::isfinite(impulse.z)) {
      impulse.z = 0.0;
    }
    hits.push_back({entry.first, impulse, std::max(0.0, damage), dist});
  }
  return hits;
}

}  // namespace afps::combat
