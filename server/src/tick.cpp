#include "tick.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <random>
#include <type_traits>
#include <unordered_set>
#include <vector>

TickAccumulator::TickAccumulator(int tick_rate) {
  tick_rate_ = tick_rate <= 0 ? 1 : tick_rate;
  const auto seconds_per_tick = std::chrono::duration<double>(1.0 / tick_rate_);
  tick_duration_ = std::chrono::duration_cast<Clock::duration>(seconds_per_tick);
  if (tick_duration_.count() <= 0) {
    tick_duration_ = Clock::duration{1};
  }
}

int TickAccumulator::Advance(Clock::time_point now) {
  if (!initialized_) {
    initialized_ = true;
    next_tick_time_ = now + tick_duration_;
    return 0;
  }
  if (now < next_tick_time_) {
    return 0;
  }
  const auto elapsed = now - next_tick_time_;
  const auto ticks = 1 + static_cast<int>(elapsed / tick_duration_);
  next_tick_time_ += tick_duration_ * ticks;
  return ticks;
}

int TickAccumulator::tick_rate() const {
  return tick_rate_;
}

TickAccumulator::Clock::duration TickAccumulator::tick_duration() const {
  return tick_duration_;
}

TickAccumulator::Clock::time_point TickAccumulator::next_tick_time() const {
  return next_tick_time_;
}

bool TickAccumulator::initialized() const {
  return initialized_;
}

#ifdef AFPS_ENABLE_WEBRTC
#include "protocol.h"
#include "weapon_config.h"

#include <chrono>
#include <iostream>

namespace {
constexpr double kPi = 3.14159265358979323846;
constexpr double kProjectileTtlSeconds = 3.0;
constexpr double kProjectileRadius = 0.15;
constexpr double kHitDistanceStepMeters = 0.01;
constexpr double kShotTracePositionStepMeters = 0.01;
constexpr double kProjectilePositionStepMeters = 0.01;
constexpr double kProjectileVelocityStepMetersPerSecond = 0.01;
constexpr double kProjectileTtlStepSeconds = 0.01;
constexpr double kNearMissExtraRadius = 0.75;
constexpr double kEnergyHeatPerShot = 0.06;
constexpr double kEnergyCoolPerSecond = 0.25;
constexpr double kEnergyVentCoolPerSecond = 0.6;
constexpr double kEnergyVentSeconds = 1.5;
constexpr double kTraceCullDistanceMeters = 85.0;
constexpr int kSpawnAngleSamples = 24;

constexpr uint8_t kPlayerFlagAds = 1 << 0;
constexpr uint8_t kPlayerFlagSprint = 1 << 1;
constexpr uint8_t kPlayerFlagReloading = 1 << 2;
constexpr uint8_t kPlayerFlagShieldActive = 1 << 3;
constexpr uint8_t kPlayerFlagOverheated = 1 << 4;
constexpr uint8_t kPlayerFlagCrouched = 1 << 5;

constexpr uint32_t kLoadoutSuppressor = 1u << 0;
constexpr uint32_t kLoadoutCompensator = 1u << 1;
constexpr uint32_t kLoadoutOptic = 1u << 2;
constexpr uint32_t kLoadoutExtendedMag = 1u << 3;
constexpr uint32_t kLoadoutGrip = 1u << 4;

bool IsEnergyWeapon(const afps::weapons::WeaponDef *weapon) {
  if (!weapon) {
    return false;
  }
  if (weapon->id.rfind("ENERGY", 0) == 0) {
    return true;
  }
  return weapon->sfx_profile.rfind("ENERGY", 0) == 0;
}

uint16_t QuantizeU16(double value, double step) {
  if (!std::isfinite(value) || !std::isfinite(step) || step <= 0.0) {
    return 0;
  }
  const double clamped = std::max(0.0, value);
  const uint64_t q = static_cast<uint64_t>(std::llround(clamped / step));
  return static_cast<uint16_t>(std::min<uint64_t>(q, std::numeric_limits<uint16_t>::max()));
}

int16_t QuantizeI16(double value, double step) {
  if (!std::isfinite(value) || !std::isfinite(step) || step <= 0.0) {
    return 0;
  }
  const int64_t q = static_cast<int64_t>(std::llround(value / step));
  const int64_t clamped = std::max<int64_t>(std::numeric_limits<int16_t>::min(),
                                            std::min<int64_t>(std::numeric_limits<int16_t>::max(), q));
  return static_cast<int16_t>(clamped);
}

int16_t QuantizeYaw(double yaw_rad) {
  if (!std::isfinite(yaw_rad)) {
    return 0;
  }
  const double wrapped = std::fmod(yaw_rad + kPi, 2.0 * kPi);
  const double normalized = (wrapped < 0.0 ? wrapped + 2.0 * kPi : wrapped) - kPi;
  const double q = normalized / kPi;
  return static_cast<int16_t>(std::llround(std::max(-1.0, std::min(1.0, q)) * 32767.0));
}

int16_t QuantizePitch(double pitch_rad) {
  if (!std::isfinite(pitch_rad)) {
    return 0;
  }
  const double max_pitch = (kPi / 2.0) - 0.01;
  const double clamped = std::max(-max_pitch, std::min(max_pitch, pitch_rad));
  const double q = clamped / max_pitch;
  return static_cast<int16_t>(std::llround(std::max(-1.0, std::min(1.0, q)) * 32767.0));
}

uint32_t HashString(const std::string &value) {
  uint32_t hash = 2166136261u;
  for (char ch : value) {
    hash ^= static_cast<uint8_t>(ch);
    hash *= 16777619u;
  }
  return hash;
}

uint32_t XorShift32(uint32_t &state) {
  state ^= state << 13;
  state ^= state >> 17;
  state ^= state << 5;
  return state;
}

double Random01(uint32_t &state) {
  const uint32_t next = XorShift32(state);
  return static_cast<double>(next) / 4294967296.0;
}

struct OctEncoded16 {
  int16_t x = 0;
  int16_t y = 0;
};

double SignNotZero(double value) {
  return value < 0.0 ? -1.0 : 1.0;
}

OctEncoded16 EncodeOct16(double x, double y, double z) {
  if (!std::isfinite(x) || !std::isfinite(y) || !std::isfinite(z)) {
    return {};
  }
  const double l1 = std::abs(x) + std::abs(y) + std::abs(z);
  if (l1 <= 1e-12) {
    return {};
  }
  x /= l1;
  y /= l1;
  z /= l1;
  if (z < 0.0) {
    const double ox = (1.0 - std::abs(y)) * SignNotZero(x);
    const double oy = (1.0 - std::abs(x)) * SignNotZero(y);
    x = ox;
    y = oy;
  }
  x = std::max(-1.0, std::min(1.0, x));
  y = std::max(-1.0, std::min(1.0, y));
  return {static_cast<int16_t>(std::llround(x * 32767.0)),
          static_cast<int16_t>(std::llround(y * 32767.0))};
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

struct WorldHitscanHit {
  bool hit = false;
  double distance = 0.0;
  afps::combat::Vec3 position{};
  afps::combat::Vec3 normal{};
  SurfaceType surface = SurfaceType::Stone;
};

double Clamp01(double value) {
  if (!std::isfinite(value)) {
    return 0.0;
  }
  return std::max(0.0, std::min(1.0, value));
}

afps::combat::Vec3 Add(const afps::combat::Vec3 &a, const afps::combat::Vec3 &b) {
  return {a.x + b.x, a.y + b.y, a.z + b.z};
}

afps::combat::Vec3 Sub(const afps::combat::Vec3 &a, const afps::combat::Vec3 &b) {
  return {a.x - b.x, a.y - b.y, a.z - b.z};
}

afps::combat::Vec3 Mul(const afps::combat::Vec3 &v, double s) {
  return {v.x * s, v.y * s, v.z * s};
}

double Dot(const afps::combat::Vec3 &a, const afps::combat::Vec3 &b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

afps::combat::Vec3 Cross(const afps::combat::Vec3 &a, const afps::combat::Vec3 &b) {
  return {a.y * b.z - a.z * b.y,
          a.z * b.x - a.x * b.z,
          a.x * b.y - a.y * b.x};
}

afps::combat::Vec3 Normalize(const afps::combat::Vec3 &v) {
  const double len = std::sqrt(Dot(v, v));
  if (!std::isfinite(len) || len <= 1e-8) {
    return {0.0, -1.0, 0.0};
  }
  return {v.x / len, v.y / len, v.z / len};
}

double Clamp(double value, double min_value, double max_value);

afps::combat::ViewAngles ViewFromDirection(const afps::combat::Vec3 &dir) {
  const afps::combat::Vec3 safe_dir = Normalize(dir);
  const double clamped_z = Clamp(safe_dir.z, -1.0, 1.0);
  const double pitch = std::asin(clamped_z);
  const double yaw = std::atan2(safe_dir.x, -safe_dir.y);
  return afps::combat::SanitizeViewAngles(yaw, pitch);
}

afps::combat::Vec3 ApplySpread(const afps::combat::Vec3 &dir, double spread_deg, uint32_t seed) {
  const afps::combat::Vec3 forward = Normalize(dir);
  if (!std::isfinite(spread_deg) || spread_deg <= 0.0) {
    return forward;
  }
  double spread_rad = spread_deg * (kPi / 180.0);
  spread_rad = std::max(0.0, std::min(spread_rad, kPi * 0.5));
  const double cos_max = std::cos(spread_rad);
  uint32_t state = seed == 0 ? 1u : seed;
  const double u = Random01(state);
  const double v = Random01(state);
  // Bias shots modestly toward the cone center so close-range fire does not
  // feel excessively wild while preserving the configured max spread angle.
  const double radial = std::pow(u, 1.85);
  const double cos_theta = 1.0 - radial * (1.0 - cos_max);
  const double sin_theta = std::sqrt(std::max(0.0, 1.0 - cos_theta * cos_theta));
  const double phi = 2.0 * kPi * v;
  afps::combat::Vec3 up{0.0, 0.0, 1.0};
  afps::combat::Vec3 right = Cross(up, forward);
  if (Dot(right, right) < 1e-6) {
    right = {1.0, 0.0, 0.0};
  }
  right = Normalize(right);
  const afps::combat::Vec3 true_up = Normalize(Cross(forward, right));
  const afps::combat::Vec3 spread_dir = Add(
      Add(Mul(forward, cos_theta),
          Mul(right, sin_theta * std::cos(phi))),
      Mul(true_up, sin_theta * std::sin(phi)));
  return Normalize(spread_dir);
}

double Clamp(double value, double min_value, double max_value) {
  if (!std::isfinite(value)) {
    return min_value;
  }
  return std::max(min_value, std::min(max_value, value));
}

double SegmentSegmentDistanceSquared(const afps::combat::Vec3 &p1,
                                     const afps::combat::Vec3 &q1,
                                     const afps::combat::Vec3 &p2,
                                     const afps::combat::Vec3 &q2) {
  const double kEps = 1e-12;
  const afps::combat::Vec3 d1 = Sub(q1, p1);
  const afps::combat::Vec3 d2 = Sub(q2, p2);
  const afps::combat::Vec3 r = Sub(p1, p2);
  const double a = Dot(d1, d1);
  const double e = Dot(d2, d2);
  const double f = Dot(d2, r);

  double s = 0.0;
  double t = 0.0;

  if (a <= kEps && e <= kEps) {
    return Dot(r, r);
  }
  if (a <= kEps) {
    s = 0.0;
    t = Clamp(f / e, 0.0, 1.0);
  } else {
    const double c = Dot(d1, r);
    if (e <= kEps) {
      t = 0.0;
      s = Clamp(-c / a, 0.0, 1.0);
    } else {
      const double b = Dot(d1, d2);
      const double denom = a * e - b * b;
      if (std::abs(denom) > kEps) {
        s = Clamp((b * f - c * e) / denom, 0.0, 1.0);
      } else {
        s = 0.0;
      }
      t = (b * s + f) / e;
      if (t < 0.0) {
        t = 0.0;
        s = Clamp(-c / a, 0.0, 1.0);
      } else if (t > 1.0) {
        t = 1.0;
        s = Clamp((b - c) / a, 0.0, 1.0);
      }
    }
  }

  const afps::combat::Vec3 c1 = Add(p1, Mul(d1, s));
  const afps::combat::Vec3 c2 = Add(p2, Mul(d2, t));
  const afps::combat::Vec3 diff = Sub(c1, c2);
  return Dot(diff, diff);
}

SurfaceType ToSurfaceType(uint8_t surface_type) {
  switch (surface_type) {
    case 1:
      return SurfaceType::Metal;
    case 2:
      return SurfaceType::Dirt;
    case 3:
      return SurfaceType::Energy;
    case 0:
    default:
      return SurfaceType::Stone;
  }
}

WorldHitscanHit ResolveWorldHitscan(const afps::combat::Vec3 &origin,
                                    const afps::combat::Vec3 &dir,
                                    const afps::sim::SimConfig &config,
                                    const afps::sim::CollisionWorld *world,
                                    double max_range) {
  WorldHitscanHit best;
  best.distance = std::numeric_limits<double>::infinity();
  const afps::sim::RaycastHit hit = afps::sim::RaycastWorld({origin.x, origin.y, origin.z},
                                                             {dir.x, dir.y, dir.z},
                                                             config,
                                                             world);
  if (!hit.hit || !std::isfinite(hit.t) || hit.t < 0.0 || hit.t > max_range) {
    return best;
  }
  best.hit = true;
  best.distance = hit.t;
  best.position = {origin.x + dir.x * hit.t, origin.y + dir.y * hit.t, origin.z + dir.z * hit.t};
  afps::combat::Vec3 normal{hit.normal_x, hit.normal_y, hit.normal_z};
  const double normal_len_sq = normal.x * normal.x + normal.y * normal.y + normal.z * normal.z;
  if (!std::isfinite(normal_len_sq) || normal_len_sq <= 1e-12) {
    normal = {-dir.x, -dir.y, -dir.z};
  }
  best.normal = normal;
  best.surface = ToSurfaceType(hit.surface_type);
  return best;
}

bool IsSpawnPointBlocked(const afps::sim::CollisionWorld &world,
                         const afps::sim::SimConfig &config,
                         double x,
                         double y,
                         double z) {
  const double radius = std::max(0.0, config.player_radius);
  const double player_min_z = z;
  const double player_max_z = z + std::max(0.01, config.player_height);
  for (const auto &collider : world.colliders) {
    if (!afps::sim::IsValidAabbCollider(collider)) {
      continue;
    }
    if (player_max_z <= collider.min_z || player_min_z >= collider.max_z) {
      continue;
    }
    if (x < collider.min_x - radius || x > collider.max_x + radius) {
      continue;
    }
    if (y < collider.min_y - radius || y > collider.max_y + radius) {
      continue;
    }
    return true;
  }
  return false;
}

bool ResolveSpawnPoint(const afps::sim::CollisionWorld &world,
                       const afps::sim::SimConfig &config,
                       double start_angle,
                       double &out_x,
                       double &out_y) {
  const double half =
      (std::isfinite(config.arena_half_size) && config.arena_half_size > 0.0) ? config.arena_half_size : 10.0;
  const double radius = std::max(0.0, std::min(half * 0.5, half - config.player_radius));
  const std::array<double, 4> ring_radii = {radius, radius * 0.66, radius * 0.33, 0.0};
  const double span = 2.0 * kPi;
  for (double ring : ring_radii) {
    for (int step = 0; step < kSpawnAngleSamples; ++step) {
      const double angle = start_angle + (span * static_cast<double>(step) / static_cast<double>(kSpawnAngleSamples));
      const double x = std::cos(angle) * ring;
      const double y = std::sin(angle) * ring;
      if (x < -half + config.player_radius || x > half - config.player_radius ||
          y < -half + config.player_radius || y > half - config.player_radius) {
        continue;
      }
      if (!IsSpawnPointBlocked(world, config, x, y, 0.0)) {
        out_x = x;
        out_y = y;
        return true;
      }
    }
  }
  return false;
}

bool ResolveRandomSpawnPoint(const afps::sim::CollisionWorld &world,
                             const afps::sim::SimConfig &config,
                             std::mt19937 &rng,
                             double &out_x,
                             double &out_y) {
  const double half =
      (std::isfinite(config.arena_half_size) && config.arena_half_size > 0.0) ? config.arena_half_size : 10.0;
  const double max_radius = std::max(0.0, std::min(half * 0.85, half - config.player_radius));
  if (!std::isfinite(max_radius) || max_radius <= 0.0) {
    return false;
  }
  const double min_bound = -half + config.player_radius;
  const double max_bound = half - config.player_radius;
  std::uniform_real_distribution<double> angle_dist(0.0, 2.0 * kPi);
  std::uniform_real_distribution<double> unit_dist(0.0, 1.0);
  constexpr int kRandomSpawnAttempts = 96;
  for (int attempt = 0; attempt < kRandomSpawnAttempts; ++attempt) {
    const double angle = angle_dist(rng);
    const double radius = std::sqrt(unit_dist(rng)) * max_radius;
    const double x = std::cos(angle) * radius;
    const double y = std::sin(angle) * radius;
    if (x < min_bound || x > max_bound || y < min_bound || y > max_bound) {
      continue;
    }
    if (!IsSpawnPointBlocked(world, config, x, y, 0.0)) {
      out_x = x;
      out_y = y;
      return true;
    }
  }
  return false;
}

afps::sim::PlayerState MakeSpawnState(const std::string &connection_id,
                                      const afps::sim::SimConfig &config,
                                      const afps::sim::CollisionWorld &world) {
  afps::sim::PlayerState state;
  const double half =
      (std::isfinite(config.arena_half_size) && config.arena_half_size > 0.0) ? config.arena_half_size : 10.0;
  const double radius = std::max(0.0, std::min(half * 0.5, half - config.player_radius));
  static thread_local std::mt19937 rng{std::random_device{}()};
  std::uniform_real_distribution<double> angle_dist(0.0, 2.0 * kPi);
  const double random_angle = angle_dist(rng);
  state.x = std::cos(random_angle) * radius;
  state.y = std::sin(random_angle) * radius;
  if (!ResolveRandomSpawnPoint(world, config, rng, state.x, state.y) &&
      !ResolveSpawnPoint(world, config, random_angle, state.x, state.y)) {
    const size_t hash = std::hash<std::string>{}(connection_id);
    const double fallback_angle = static_cast<double>(hash % 360) * (kPi / 180.0);
    state.x = std::cos(fallback_angle) * radius;
    state.y = std::sin(fallback_angle) * radius;
    ResolveSpawnPoint(world, config, fallback_angle, state.x, state.y);
  }
  state.z = 0.0;
  state.vel_x = 0.0;
  state.vel_y = 0.0;
  state.vel_z = 0.0;
  state.grounded = true;
  state.dash_cooldown = 0.0;
  return state;
}

void LogSpawnState(const std::string &connection_id,
                   const afps::sim::PlayerState &state,
                   const char *reason) {
  std::cout << "{\"event\":\"spawn\",\"connection_id\":\"" << connection_id << "\",\"reason\":\""
            << (reason ? reason : "unknown") << "\",\"x\":" << state.x << ",\"y\":" << state.y
            << ",\"z\":" << state.z << "}\n";
}
}  // namespace

TickLoop::TickLoop(SignalingStore &store, int tick_rate, int snapshot_keyframe_interval, uint32_t map_seed)
    : store_(store),
      accumulator_(tick_rate),
      snapshot_keyframe_interval_(snapshot_keyframe_interval),
      map_seed_(map_seed) {
  pose_history_limit_ = std::max(1, accumulator_.tick_rate() * 2);
  std::string weapon_error;
  weapon_config_ = afps::weapons::LoadWeaponConfig(afps::weapons::ResolveWeaponConfigPath(),
                                                   weapon_error);
  if (!weapon_error.empty()) {
    std::cerr << "[warn] " << weapon_error << "\n";
  }
  const auto generated = afps::world::GenerateMapWorld(sim_config_, map_seed_, accumulator_.tick_rate());
  collision_world_ = generated.collision_world;
  pickups_.clear();
  pickups_.reserve(generated.pickups.size());
  for (const auto &pickup : generated.pickups) {
    pickups_.push_back({pickup, true, -1});
  }
}

TickLoop::~TickLoop() {
  Stop();
}

void TickLoop::Start() {
  if (running_.exchange(true)) {
    return;
  }
  thread_ = std::thread(&TickLoop::Run, this);
}

void TickLoop::Stop() {
  if (!running_.exchange(false)) {
    return;
  }
  if (thread_.joinable()) {
    thread_.join();
  }
}

void TickLoop::Run() {
  last_log_time_ = TickAccumulator::Clock::now();
  while (running_.load()) {
    auto now = TickAccumulator::Clock::now();
    const int ticks = accumulator_.Advance(now);
    if (ticks == 0) {
      std::this_thread::sleep_until(accumulator_.next_tick_time());
      continue;
    }
    for (int i = 0; i < ticks; ++i) {
      Step();
      ++tick_count_;
    }
    now = TickAccumulator::Clock::now();
    if (now - last_log_time_ >= std::chrono::seconds(1)) {
      const auto connections = store_.ConnectionCount();
      std::cout << "[tick] rate=" << accumulator_.tick_rate() << " ticks=" << tick_count_
                << " conns=" << connections << " batches=" << batch_count_ << " inputs="
                << input_count_ << " snapshots=" << snapshot_count_ << "\n";
      tick_count_ = 0;
      batch_count_ = 0;
      input_count_ = 0;
      snapshot_count_ = 0;
      last_log_time_ = now;
    }
  }
}

void TickLoop::Step() {
  server_tick_ += 1;

  const auto active_ids = store_.ReadyConnectionIds();
  std::unordered_set<std::string> active_set(active_ids.begin(), active_ids.end());
  auto prune = [&active_set](auto &map) {
    for (auto iter = map.begin(); iter != map.end(); ) {
      if (active_set.find(iter->first) == active_set.end()) {
        iter = map.erase(iter);
      } else {
        ++iter;
      }
    }
  };
  prune(last_inputs_);
  prune(players_);
  prune(last_input_seq_);
  prune(last_input_server_tick_);
  prune(last_full_snapshots_);
  prune(snapshot_sequence_);
  prune(weapon_states_);
  prune(loadout_bits_);
  prune(pose_histories_);
  prune(combat_states_);
  for (auto iter = pickup_sync_sent_.begin(); iter != pickup_sync_sent_.end();) {
    if (active_set.find(*iter) == active_set.end()) {
      iter = pickup_sync_sent_.erase(iter);
    } else {
      ++iter;
    }
  }

  struct FireEvent {
    std::string connection_id;
    FireWeaponRequest request;
  };
  std::vector<FireEvent> fire_events;
  struct ShockwaveEvent {
    std::string connection_id;
    afps::combat::Vec3 origin{};
  };
  std::vector<ShockwaveEvent> shockwave_events;

  std::unordered_map<std::string, std::vector<FxEventData>> fx_events;
  fx_events.reserve(active_ids.size());
  for (const auto &connection_id : active_ids) {
    fx_events.emplace(connection_id, std::vector<FxEventData>{});
  }
  auto emit_fx_all = [&](const FxEventData &event) {
    for (auto &entry : fx_events) {
      entry.second.push_back(event);
    }
  };
  auto emit_fx_to = [&](const std::string &connection_id, const FxEventData &event) {
    auto iter = fx_events.find(connection_id);
    if (iter != fx_events.end()) {
      iter->second.push_back(event);
    }
  };
  auto to_spawn_fx = [](const TickLoop::PickupState &pickup) {
    PickupSpawnedFx fx;
    fx.pickup_id = pickup.definition.id;
    fx.kind = pickup.definition.kind == afps::world::PickupKind::Weapon ? PickupKind::Weapon : PickupKind::Health;
    fx.pos_x_q = QuantizeI16(pickup.definition.position.x, 1.0 / 16.0);
    fx.pos_y_q = QuantizeI16(pickup.definition.position.y, 1.0 / 16.0);
    fx.pos_z_q = QuantizeI16(pickup.definition.position.z, 1.0 / 16.0);
    fx.weapon_slot = static_cast<uint8_t>(std::max(0, pickup.definition.weapon_slot));
    fx.amount = static_cast<uint16_t>(std::max(0, pickup.definition.amount));
    return fx;
  };

  for (const auto &connection_id : active_ids) {
    if (pickup_sync_sent_.find(connection_id) != pickup_sync_sent_.end()) {
      continue;
    }
    std::vector<FxEventData> active_pickups;
    active_pickups.reserve(pickups_.size());
    for (const auto &pickup : pickups_) {
      if (!pickup.active) {
        continue;
      }
      active_pickups.push_back(to_spawn_fx(pickup));
    }
    if (!active_pickups.empty()) {
      constexpr size_t kMaxEventsPerMessage = 24;
      size_t index = 0;
      while (index < active_pickups.size()) {
        const size_t end = std::min(active_pickups.size(), index + kMaxEventsPerMessage);
        GameEventBatch batch;
        batch.server_tick = server_tick_;
        batch.events.insert(batch.events.end(), active_pickups.begin() + static_cast<long>(index),
                            active_pickups.begin() + static_cast<long>(end));
        const auto payload = BuildGameEventBatch(batch,
                                                 store_.NextServerMessageSeq(connection_id),
                                                 store_.LastClientMessageSeq(connection_id));
        store_.SendReliable(connection_id, payload);
        index = end;
      }
    }
    pickup_sync_sent_.insert(connection_id);
  }

	  auto resolve_view = [&](const std::string &connection_id) {
	    auto input_iter = last_inputs_.find(connection_id);
	    if (input_iter == last_inputs_.end()) {
	      return afps::combat::SanitizeViewAngles(0.0, 0.0);
	    }
	    return afps::combat::SanitizeViewAngles(input_iter->second.view_yaw, input_iter->second.view_pitch);
	  };
	  auto resolve_fire_view = [&](const std::string &connection_id, const FireWeaponRequest &request) {
	    const auto fallback_view = resolve_view(connection_id);
	    const afps::combat::Vec3 fallback_dir = afps::combat::ViewDirection(fallback_view);
	    const afps::combat::Vec3 request_dir{request.dir_x, request.dir_y, request.dir_z};
	    const double request_len_sq =
	        request_dir.x * request_dir.x + request_dir.y * request_dir.y + request_dir.z * request_dir.z;
	    if (!std::isfinite(request_len_sq) || request_len_sq <= 1e-12) {
	      return fallback_view;
	    }
	    const afps::combat::Vec3 safe_request_dir = Normalize(request_dir);
	    return ViewFromDirection(safe_request_dir);
	  };

  auto resolve_shield_facing = [&](const std::string &target_id,
                                   const afps::combat::Vec3 &source_pos) {
    auto state_iter = players_.find(target_id);
    if (state_iter == players_.end()) {
      return false;
    }
    const auto view = resolve_view(target_id);
    const afps::combat::Vec3 target_pos{state_iter->second.x,
                                        state_iter->second.y,
                                        state_iter->second.z + (afps::combat::kPlayerHeight * 0.5)};
    return afps::combat::IsShieldFacing(target_pos, view, source_pos);
  };

  auto resolve_loadout_bits = [&](const std::string &connection_id) -> uint32_t {
    auto iter = loadout_bits_.find(connection_id);
    return iter == loadout_bits_.end() ? 0u : iter->second;
  };

  auto resolve_max_ammo = [&](const afps::weapons::WeaponDef *weapon, uint32_t loadout_bits) -> int {
    if (!weapon) {
      return 0;
    }
    double max_ammo = static_cast<double>(weapon->max_ammo_in_mag);
    if (loadout_bits & kLoadoutExtendedMag) {
      max_ammo *= 1.25;
    }
    if (!std::isfinite(max_ammo) || max_ammo <= 0.0) {
      return 0;
    }
    return std::max(1, static_cast<int>(std::llround(max_ammo)));
  };

  auto resolve_reload_seconds = [&](const afps::weapons::WeaponDef *weapon, uint32_t loadout_bits) -> double {
    if (!weapon || !std::isfinite(weapon->reload_seconds) || weapon->reload_seconds <= 0.0) {
      return 0.0;
    }
    double multiplier = 1.0;
    if (loadout_bits & kLoadoutExtendedMag) {
      multiplier *= 1.12;
    }
    return weapon->reload_seconds * multiplier;
  };

  auto resolve_spread_deg = [&](const afps::weapons::WeaponDef *weapon,
                                const WeaponSlotState &slot_state,
                                const InputCmd &input,
                                const afps::sim::PlayerState &state,
                                uint32_t loadout_bits) -> double {
    if (!weapon || !std::isfinite(weapon->spread_deg) || weapon->spread_deg <= 0.0) {
      return 0.0;
    }
    double multiplier = 1.0;
    const double speed = std::hypot(state.vel_x, state.vel_y);
    if (input.sprint) {
      multiplier *= 1.5;
    } else if (speed > 0.4) {
      multiplier *= 1.2;
    }
    if (input.ads) {
      multiplier *= (loadout_bits & kLoadoutOptic) ? 0.45 : 0.6;
    }
    if (loadout_bits & kLoadoutSuppressor) {
      multiplier *= 1.12;
    }
    if (loadout_bits & kLoadoutCompensator) {
      multiplier *= 0.85;
    }
    if (loadout_bits & kLoadoutGrip) {
      multiplier *= 0.9;
    }
    if (IsEnergyWeapon(weapon)) {
      multiplier *= (1.0 + slot_state.heat * 0.6);
    }
    const double spread = weapon->spread_deg * multiplier;
    return std::max(0.0, spread);
  };

  const size_t slot_count = weapon_config_.slots.empty() ? 1 : weapon_config_.slots.size();
  auto init_weapon_state = [&](PlayerWeaponState &state, const std::string &connection_id) {
    state.slots.clear();
    state.slots.resize(slot_count);
    const uint32_t loadout_bits = resolve_loadout_bits(connection_id);
    for (size_t i = 0; i < slot_count; ++i) {
      const auto *weapon = afps::weapons::ResolveWeaponSlot(weapon_config_, static_cast<int>(i));
      if (weapon) {
        state.slots[i].ammo_in_mag = resolve_max_ammo(weapon, loadout_bits);
      } else {
        state.slots[i].ammo_in_mag = 0;
      }
      state.slots[i].cooldown = 0.0;
      state.slots[i].reload_timer = 0.0;
      state.slots[i].heat = 0.0;
      state.slots[i].overheat_timer = 0.0;
    }
    state.shot_seq = 0;
  };

  for (const auto &connection_id : active_ids) {
    if (combat_states_.find(connection_id) == combat_states_.end()) {
      combat_states_[connection_id] = afps::combat::CreateCombatState();
      players_[connection_id] = MakeSpawnState(connection_id, sim_config_, collision_world_);
      LogSpawnState(connection_id, players_[connection_id], "join");
    } else if (players_.find(connection_id) == players_.end()) {
      players_[connection_id] = MakeSpawnState(connection_id, sim_config_, collision_world_);
      LogSpawnState(connection_id, players_[connection_id], "restore");
    }
    auto weapon_iter = weapon_states_.find(connection_id);
    if (weapon_iter == weapon_states_.end()) {
      PlayerWeaponState state;
      init_weapon_state(state, connection_id);
      weapon_states_[connection_id] = std::move(state);
    } else if (weapon_iter->second.slots.size() != slot_count) {
      init_weapon_state(weapon_iter->second, connection_id);
    }
  }

  auto batches = store_.DrainAllInputs();
  for (const auto &batch : batches) {
    ++batch_count_;
    input_count_ += batch.inputs.size();
    int max_seq = -1;
    for (const auto &cmd : batch.inputs) {
      max_seq = std::max(max_seq, cmd.input_seq);
    }
    if (max_seq >= 0) {
      last_input_seq_[batch.connection_id] = max_seq;
      last_input_server_tick_[batch.connection_id] = server_tick_;
      last_inputs_[batch.connection_id] = batch.inputs.back();
    }
  }

  auto fire_batches = store_.DrainAllFireRequests();
  for (const auto &batch : fire_batches) {
    for (const auto &request : batch.requests) {
      fire_events.push_back({batch.connection_id, request});
    }
  }

  auto loadout_batches = store_.DrainAllLoadoutRequests();
  for (const auto &batch : loadout_batches) {
    if (batch.requests.empty()) {
      continue;
    }
    const uint32_t previous_bits = resolve_loadout_bits(batch.connection_id);
    const uint32_t next_bits = batch.requests.back().loadout_bits;
    loadout_bits_[batch.connection_id] = next_bits;
    if (previous_bits == next_bits) {
      continue;
    }
    auto weapon_iter = weapon_states_.find(batch.connection_id);
    if (weapon_iter == weapon_states_.end()) {
      continue;
    }
    auto &weapon_state = weapon_iter->second;
    for (size_t i = 0; i < weapon_state.slots.size(); ++i) {
      auto &slot_state = weapon_state.slots[i];
      const auto *weapon = afps::weapons::ResolveWeaponSlot(weapon_config_, static_cast<int>(i));
      if (!weapon) {
        slot_state.ammo_in_mag = 0;
        continue;
      }
      const int base_max = std::max(0, weapon->max_ammo_in_mag);
      const int next_max = resolve_max_ammo(weapon, next_bits);
      if (next_max <= 0) {
        slot_state.ammo_in_mag = 0;
        continue;
      }
      if (next_max > base_max && slot_state.ammo_in_mag >= base_max) {
        slot_state.ammo_in_mag = next_max;
      } else {
        slot_state.ammo_in_mag = std::min(slot_state.ammo_in_mag, next_max);
      }
    }
  }

  const double dt = std::chrono::duration<double>(accumulator_.tick_duration()).count();
  for (const auto &connection_id : active_ids) {
    const auto input_iter = last_inputs_.find(connection_id);
    InputCmd input;
    if (input_iter != last_inputs_.end()) {
      input = input_iter->second;
    }
    auto &state = players_[connection_id];
    auto &combat_state = combat_states_[connection_id];
    if (combat_state.alive) {
      const auto sim_input = afps::sim::MakeInput(input.move_x, input.move_y, input.sprint, input.jump, input.dash,
                                                  input.grapple, input.shield, input.shockwave, input.view_yaw,
                                                  input.view_pitch, input.crouch);
      afps::sim::StepPlayer(state, sim_input, sim_config_, dt, &collision_world_);
      if (state.shockwave_triggered) {
        shockwave_events.push_back({connection_id,
                                    {state.x, state.y, state.z + (afps::combat::kPlayerHeight * 0.5)}});
      }
    } else {
      state.vel_x = 0.0;
      state.vel_y = 0.0;
      state.vel_z = 0.0;
      state.dash_cooldown = 0.0;
      state.grapple_cooldown = 0.0;
      state.grapple_active = false;
      state.grapple_input = false;
      state.grapple_length = 0.0;
      state.grapple_anchor_x = 0.0;
      state.grapple_anchor_y = 0.0;
      state.grapple_anchor_z = 0.0;
      state.grapple_anchor_nx = 0.0;
      state.grapple_anchor_ny = 0.0;
      state.grapple_anchor_nz = 0.0;
      state.shield_timer = 0.0;
      state.shield_cooldown = 0.0;
      state.shield_active = false;
      state.shield_input = false;
      state.shockwave_cooldown = 0.0;
      state.shockwave_input = false;
      state.shockwave_triggered = false;
      state.crouched = false;
    }

    const int safe_tick_rate = std::max(1, accumulator_.tick_rate());
    if ((server_tick_ % safe_tick_rate) == 0) {
      std::cout << "{\"event\":\"player_tick\",\"connection_id\":\"" << connection_id
                << "\",\"x\":" << state.x << ",\"y\":" << state.y << ",\"z\":" << state.z
                << ",\"move_x\":" << input.move_x << ",\"move_y\":" << input.move_y
                << ",\"alive\":" << (combat_state.alive ? "true" : "false") << "}\n";
    }

    if (afps::combat::UpdateRespawn(combat_state, dt)) {
      state = MakeSpawnState(connection_id, sim_config_, collision_world_);
      LogSpawnState(connection_id, state, "respawn");
      auto weapon_iter = weapon_states_.find(connection_id);
      if (weapon_iter != weapon_states_.end()) {
        init_weapon_state(weapon_iter->second, connection_id);
      }
    }
  }

  const double player_height =
      (std::isfinite(sim_config_.player_height) && sim_config_.player_height > 0.0) ? sim_config_.player_height : 1.7;
  for (auto &pickup : pickups_) {
    if (!pickup.active) {
      if (pickup.respawn_tick >= 0 && server_tick_ >= pickup.respawn_tick) {
        pickup.active = true;
        pickup.respawn_tick = -1;
        emit_fx_all(to_spawn_fx(pickup));
      }
      continue;
    }

    std::string taker_id;
    for (const auto &connection_id : active_ids) {
      auto combat_iter = combat_states_.find(connection_id);
      auto state_iter = players_.find(connection_id);
      if (combat_iter == combat_states_.end() || state_iter == players_.end()) {
        continue;
      }
      if (!combat_iter->second.alive) {
        continue;
      }
      const double dx = state_iter->second.x - pickup.definition.position.x;
      const double dy = state_iter->second.y - pickup.definition.position.y;
      const double radius = std::max(0.0, pickup.definition.radius);
      if ((dx * dx + dy * dy) > (radius * radius)) {
        continue;
      }
      const double player_min_z = state_iter->second.z;
      const double player_max_z = state_iter->second.z + player_height;
      if (pickup.definition.position.z < player_min_z - 0.5 || pickup.definition.position.z > player_max_z + 0.5) {
        continue;
      }
      if (pickup.definition.kind == afps::world::PickupKind::Health &&
          combat_iter->second.health >= afps::combat::kMaxHealth - 1e-6) {
        continue;
      }
      taker_id = connection_id;
      break;
    }

    if (taker_id.empty()) {
      continue;
    }

    if (pickup.definition.kind == afps::world::PickupKind::Health) {
      auto combat_iter = combat_states_.find(taker_id);
      if (combat_iter != combat_states_.end()) {
        const double amount = pickup.definition.amount > 0 ? static_cast<double>(pickup.definition.amount) : 25.0;
        combat_iter->second.health = std::min(afps::combat::kMaxHealth, combat_iter->second.health + amount);
      }
    } else if (pickup.definition.kind == afps::world::PickupKind::Weapon) {
      auto weapon_iter = weapon_states_.find(taker_id);
      if (weapon_iter != weapon_states_.end() && !weapon_iter->second.slots.empty()) {
        const int max_slot = static_cast<int>(weapon_iter->second.slots.size() - 1);
        const int slot = std::max(0, std::min(max_slot, pickup.definition.weapon_slot));
        const auto *weapon = afps::weapons::ResolveWeaponSlot(weapon_config_, slot);
        const int max_ammo = resolve_max_ammo(weapon, resolve_loadout_bits(taker_id));
        if (max_ammo > 0) {
          auto &slot_state = weapon_iter->second.slots[static_cast<size_t>(slot)];
          if (pickup.definition.amount > 0) {
            slot_state.ammo_in_mag = std::min(max_ammo, slot_state.ammo_in_mag + pickup.definition.amount);
          } else {
            slot_state.ammo_in_mag = max_ammo;
          }
        }
        auto &last_input = last_inputs_[taker_id];
        last_input.weapon_slot = slot;
      }
    }

    pickup.active = false;
    pickup.respawn_tick = server_tick_ + std::max(1, pickup.definition.respawn_ticks);
    PickupTakenFx taken;
    taken.pickup_id = pickup.definition.id;
    taken.taker_id = taker_id;
    taken.server_tick = server_tick_;
    emit_fx_all(taken);
  }

  for (auto &entry : weapon_states_) {
    const uint32_t loadout_bits = resolve_loadout_bits(entry.first);
    auto &state = entry.second;
    for (size_t i = 0; i < state.slots.size(); ++i) {
      auto &slot_state = state.slots[i];
      if (slot_state.cooldown > 0.0) {
        slot_state.cooldown = std::max(0.0, slot_state.cooldown - dt);
      }
      if (slot_state.reload_timer > 0.0) {
        slot_state.reload_timer = std::max(0.0, slot_state.reload_timer - dt);
        if (slot_state.reload_timer <= 0.0) {
          const auto *weapon = afps::weapons::ResolveWeaponSlot(weapon_config_, static_cast<int>(i));
          slot_state.ammo_in_mag = resolve_max_ammo(weapon, loadout_bits);
        }
      }

      const auto *weapon = afps::weapons::ResolveWeaponSlot(weapon_config_, static_cast<int>(i));
      if (!IsEnergyWeapon(weapon)) {
        slot_state.heat = 0.0;
        slot_state.overheat_timer = 0.0;
        continue;
      }

      if (slot_state.overheat_timer > 0.0) {
        slot_state.overheat_timer = std::max(0.0, slot_state.overheat_timer - dt);
        slot_state.heat = std::max(0.0, slot_state.heat - (kEnergyVentCoolPerSecond * dt));
      } else {
        slot_state.heat = std::max(0.0, slot_state.heat - (kEnergyCoolPerSecond * dt));
      }
      slot_state.heat = std::min(1.0, slot_state.heat);
    }
  }

  for (const auto &connection_id : active_ids) {
    auto &history = pose_histories_[connection_id];
    if (history.size() == 0) {
      history.SetMaxSamples(static_cast<size_t>(pose_history_limit_));
    }
    history.Push(server_tick_, players_[connection_id]);
  }

  if (!shockwave_events.empty()) {
    std::unordered_map<std::string, afps::sim::PlayerState> alive_players;
    alive_players.reserve(players_.size());
    for (const auto &entry : players_) {
      auto combat_iter = combat_states_.find(entry.first);
      if (combat_iter != combat_states_.end() && combat_iter->second.alive) {
        alive_players.emplace(entry.first, entry.second);
      }
    }
    for (const auto &event : shockwave_events) {
        const auto hits = afps::combat::ComputeShockwaveHits(
            event.origin, sim_config_.shockwave_radius, sim_config_.shockwave_impulse,
            sim_config_.shockwave_damage, sim_config_, alive_players, event.connection_id, &collision_world_);
      auto attacker_iter = combat_states_.find(event.connection_id);
      afps::combat::CombatState *attacker =
          attacker_iter == combat_states_.end() ? nullptr : &attacker_iter->second;
      for (const auto &hit : hits) {
        auto target_state_iter = players_.find(hit.target_id);
        auto target_combat_iter = combat_states_.find(hit.target_id);
        if (target_state_iter == players_.end() || target_combat_iter == combat_states_.end()) {
          continue;
        }
        if (!target_combat_iter->second.alive) {
          continue;
        }
        if (std::isfinite(hit.impulse.x)) {
          target_state_iter->second.vel_x += hit.impulse.x;
        }
        if (std::isfinite(hit.impulse.y)) {
          target_state_iter->second.vel_y += hit.impulse.y;
        }
        if (std::isfinite(hit.impulse.z)) {
          target_state_iter->second.vel_z += hit.impulse.z;
        }
        bool killed = false;
        if (hit.damage > 0.0) {
          const bool shield_active = target_state_iter->second.shield_active;
          const bool shield_facing =
              shield_active ? resolve_shield_facing(hit.target_id, event.origin) : true;
          killed = afps::combat::ApplyDamageWithShield(target_combat_iter->second, attacker, hit.damage,
                                                       shield_active && shield_facing,
                                                       sim_config_.shield_damage_multiplier);
          HitConfirmedFx hit_event;
          hit_event.target_id = hit.target_id;
          hit_event.damage = hit.damage;
          hit_event.killed = killed;
          emit_fx_to(event.connection_id, hit_event);
        }
        if (killed) {
          target_state_iter->second.vel_x = 0.0;
          target_state_iter->second.vel_y = 0.0;
          target_state_iter->second.vel_z = 0.0;
          target_state_iter->second.dash_cooldown = 0.0;
          alive_players.erase(hit.target_id);
        }
      }
    }
  }

  auto resolve_active_slot = [&](const std::string &connection_id, int requested_slot) -> int {
	    int slot = requested_slot;
	    auto input_iter = last_inputs_.find(connection_id);
	    if (input_iter != last_inputs_.end()) {
	      slot = input_iter->second.weapon_slot;
    }
    if (slot < 0) {
      slot = 0;
    }
    if (weapon_config_.slots.empty()) {
      return 0;
    }
    const int max_slot = static_cast<int>(weapon_config_.slots.size() - 1);
    return std::min(slot, max_slot);
  };

  auto should_show_tracer = [&](const afps::weapons::WeaponDef *weapon,
                                int shot_seq,
                                uint32_t loadout_bits) {
    if (!weapon) {
      return false;
    }
    if (weapon->kind != afps::weapons::WeaponKind::kHitscan) {
      return false;
    }
    if (loadout_bits & kLoadoutSuppressor) {
      return (shot_seq % 5) == 0;
    }
    if (IsEnergyWeapon(weapon)) {
      return true;
    }
	    if (weapon->fire_mode == afps::weapons::FireMode::kSemi) {
	      return true;
	    }
	    return (shot_seq % 3) == 0;
	  };

	  auto quantize_unit_u16 = [&](double value) {
	    const double clamped = Clamp01(value);
	    return static_cast<uint16_t>(std::llround(clamped * 65535.0));
	  };

	  for (const auto &event : fire_events) {
	    auto shooter_iter = combat_states_.find(event.connection_id);
	    if (shooter_iter == combat_states_.end() || !shooter_iter->second.alive) {
	      continue;
    }
    auto state_iter = players_.find(event.connection_id);
    if (state_iter == players_.end()) {
      continue;
    }
    auto weapon_state_iter = weapon_states_.find(event.connection_id);
    if (weapon_state_iter == weapon_states_.end()) {
      continue;
    }
    const int active_slot = resolve_active_slot(event.connection_id, event.request.weapon_slot);
    if (active_slot < 0 || weapon_config_.slots.empty() ||
        static_cast<size_t>(active_slot) >= weapon_state_iter->second.slots.size()) {
      continue;
    }
    const auto *weapon = afps::weapons::ResolveWeaponSlot(weapon_config_, active_slot);
	    if (!weapon) {
	      continue;
	    }
	    auto &slot_state = weapon_state_iter->second.slots[active_slot];
	    if (slot_state.reload_timer > 0.0) {
	      continue;
	    }
	    if (slot_state.cooldown > 0.0) {
	      continue;
	    }
	    if (slot_state.overheat_timer > 0.0) {
	      continue;
	    }

	    weapon_state_iter->second.shot_seq += 1;
	    const int shot_seq = weapon_state_iter->second.shot_seq;
	    const uint32_t loadout_bits = resolve_loadout_bits(event.connection_id);
	    InputCmd input;
	    auto input_iter = last_inputs_.find(event.connection_id);
	    if (input_iter != last_inputs_.end()) {
	      input = input_iter->second;
	    }
	    const auto view = resolve_fire_view(event.connection_id, event.request);
	    const auto dir = afps::combat::ViewDirection(view);
	    const double spread_deg = resolve_spread_deg(weapon, slot_state, input, state_iter->second, loadout_bits);
	    const uint32_t spread_seed =
	        HashString(event.connection_id) ^
	        (static_cast<uint32_t>(shot_seq) * 0x9e3779b9u) ^
	        (static_cast<uint32_t>(active_slot + 1) * 0x85ebca6bu);
	    const auto shot_dir = ApplySpread(dir, spread_deg, spread_seed);
	    const auto shot_view = ViewFromDirection(shot_dir);
	    OctEncoded16 dir_oct = EncodeOct16(shot_dir.x, shot_dir.y, shot_dir.z);
	    const double weapon_cooldown = weapon->cooldown_seconds;

	    if (slot_state.ammo_in_mag <= 0) {
	      slot_state.cooldown = weapon_cooldown;
	      ShotFiredFx fired;
	      fired.shooter_id = event.connection_id;
	      fired.weapon_slot = static_cast<uint8_t>(active_slot);
	      fired.shot_seq = shot_seq;
	      fired.dry_fire = true;
	      emit_fx_all(fired);

	      const double reload_seconds = resolve_reload_seconds(weapon, loadout_bits);
	      if (reload_seconds > 0.0) {
	        slot_state.reload_timer = reload_seconds;
	        ReloadFx reload;
	        reload.shooter_id = event.connection_id;
	        reload.weapon_slot = static_cast<uint8_t>(active_slot);
	        emit_fx_all(reload);
	      }
	      continue;
	    }

	    slot_state.ammo_in_mag = std::max(0, slot_state.ammo_in_mag - 1);
	    slot_state.cooldown = weapon_cooldown;

	    ShotFiredFx fired;
	    fired.shooter_id = event.connection_id;
	    fired.weapon_slot = static_cast<uint8_t>(active_slot);
	    fired.shot_seq = shot_seq;
	    fired.dry_fire = false;
	    emit_fx_all(fired);

	    const bool energy_weapon = IsEnergyWeapon(weapon);
	    if (energy_weapon) {
	      const double prev_heat = slot_state.heat;
	      slot_state.heat = Clamp01(slot_state.heat + kEnergyHeatPerShot);
	      if (prev_heat < 1.0 && slot_state.heat >= 1.0) {
	        slot_state.overheat_timer = kEnergyVentSeconds;
	        OverheatFx overheat;
	        overheat.shooter_id = event.connection_id;
	        overheat.weapon_slot = static_cast<uint8_t>(active_slot);
	        overheat.heat_q = quantize_unit_u16(slot_state.heat);
	        emit_fx_all(overheat);
	        VentFx vent;
	        vent.shooter_id = event.connection_id;
	        vent.weapon_slot = static_cast<uint8_t>(active_slot);
	        emit_fx_all(vent);
	      }
	    }

	    int estimated_tick = server_tick_;
	    auto tick_iter = last_input_server_tick_.find(event.connection_id);
	    if (tick_iter != last_input_server_tick_.end()) {
	      estimated_tick = tick_iter->second;
    }
    if (pose_history_limit_ > 0) {
      const int min_tick = server_tick_ - pose_history_limit_ + 1;
	      estimated_tick = std::max(min_tick, std::min(server_tick_, estimated_tick));
	    }

	    if (weapon->kind == afps::weapons::WeaponKind::kHitscan) {
	      afps::sim::PlayerState shooter_pose;
	      auto history_iter = pose_histories_.find(event.connection_id);
	      if (history_iter != pose_histories_.end()) {
	        history_iter->second.SampleAtOrBefore(estimated_tick, shooter_pose);
	      } else {
	        shooter_pose = state_iter->second;
	      }
	      const afps::combat::Vec3 origin{shooter_pose.x,
	                                      shooter_pose.y,
	                                      shooter_pose.z + afps::combat::kPlayerEyeHeight};
	      const afps::combat::Vec3 muzzle = Add(origin, Mul(shot_dir, 0.2));
	      const double max_range = (std::isfinite(weapon->range) && weapon->range > 0.0)
	                                   ? weapon->range
	                                   : 0.0;
	      const auto result = afps::combat::ResolveHitscan(
	          event.connection_id, pose_histories_, estimated_tick, shot_view, sim_config_, weapon->range,
            &collision_world_);
	      const auto world_hit = ResolveWorldHitscan(origin, shot_dir, sim_config_, &collision_world_,
                                                   weapon->range);

	      HitKind hit_kind = HitKind::None;
	      SurfaceType surface_type = SurfaceType::Stone;
	      afps::combat::Vec3 hit_normal{-shot_dir.x, -shot_dir.y, -shot_dir.z};
	      double hit_distance = max_range;
	      std::string hit_target;

	      if (result.hit && (!world_hit.hit || result.distance <= world_hit.distance)) {
	        hit_kind = HitKind::Player;
	        hit_distance = result.distance;
	        hit_target = result.target_id;
	        surface_type = SurfaceType::Energy;
	      } else if (world_hit.hit) {
	        hit_kind = HitKind::World;
	        hit_distance = world_hit.distance;
	        surface_type = world_hit.surface;
	        hit_normal = world_hit.normal;
	      }
	      const afps::combat::Vec3 hit_position = Add(origin, Mul(shot_dir, hit_distance));

	      if (hit_kind == HitKind::Player) {
	        auto target_iter = combat_states_.find(hit_target);
	        bool killed = false;
	        bool shield_active = false;
	        bool shield_facing = true;
	        if (target_iter != combat_states_.end()) {
	          auto target_state_iter = players_.find(hit_target);
	          if (target_state_iter != players_.end()) {
	            shield_active = target_state_iter->second.shield_active;
	          }
	          if (shield_active) {
	            shield_facing = resolve_shield_facing(hit_target, muzzle);
	          }
	          killed = afps::combat::ApplyDamageWithShield(target_iter->second, &shooter_iter->second, weapon->damage,
	                                                       shield_active && shield_facing,
	                                                       sim_config_.shield_damage_multiplier);
	          if (killed) {
	            auto &target_state = players_[hit_target];
	            target_state.vel_x = 0.0;
	            target_state.vel_y = 0.0;
	            target_state.vel_z = 0.0;
	            target_state.dash_cooldown = 0.0;
	          }
	        }
	        if (shield_active && shield_facing) {
	          surface_type = SurfaceType::Energy;
	        }
	        HitConfirmedFx confirmed;
	        confirmed.target_id = hit_target;
	        confirmed.damage = weapon->damage;
	        confirmed.killed = killed;
	        emit_fx_to(event.connection_id, confirmed);
	      }

	      if (max_range > 0.0) {
	        const auto normal_oct = EncodeOct16(hit_normal.x, hit_normal.y, hit_normal.z);
	        ShotTraceFx trace;
	        trace.shooter_id = event.connection_id;
	        trace.weapon_slot = static_cast<uint8_t>(active_slot);
	        trace.shot_seq = shot_seq;
	        trace.dir_oct_x = dir_oct.x;
	        trace.dir_oct_y = dir_oct.y;
	        trace.hit_dist_q = QuantizeU16(hit_distance, kHitDistanceStepMeters);
	        trace.hit_kind = hit_kind;
	        trace.surface_type = surface_type;
	        trace.normal_oct_x = normal_oct.x;
	        trace.normal_oct_y = normal_oct.y;
	        trace.show_tracer = should_show_tracer(weapon, shot_seq, loadout_bits);
	        trace.hit_pos_x_q = QuantizeI16(hit_position.x, kShotTracePositionStepMeters);
	        trace.hit_pos_y_q = QuantizeI16(hit_position.y, kShotTracePositionStepMeters);
	        trace.hit_pos_z_q = QuantizeI16(hit_position.z, kShotTracePositionStepMeters);

	        const double cull_sq = kTraceCullDistanceMeters * kTraceCullDistanceMeters;
	        for (const auto &recipient_id : active_ids) {
	          auto recipient_state_iter = players_.find(recipient_id);
	          if (recipient_state_iter == players_.end()) {
	            continue;
	          }
	          const double dx = recipient_state_iter->second.x - shooter_pose.x;
	          const double dy = recipient_state_iter->second.y - shooter_pose.y;
	          const double dz = recipient_state_iter->second.z - shooter_pose.z;
	          const double dist_sq = dx * dx + dy * dy + dz * dz;
	          if (dist_sq > cull_sq && recipient_id != event.connection_id) {
	            continue;
	          }
	          ShotTraceFx recipient_trace = trace;
	          if (dist_sq > cull_sq) {
	            recipient_trace.show_tracer = false;
	          }
	          emit_fx_to(recipient_id, recipient_trace);
	        }
	      }

	      const afps::combat::Vec3 segment_start = origin;
	      const afps::combat::Vec3 segment_end = Add(origin, Mul(shot_dir, hit_distance));
	      const double capsule_radius = (std::isfinite(sim_config_.player_radius) && sim_config_.player_radius > 0.0)
	                                        ? sim_config_.player_radius
	                                        : 0.4;
	      const double threshold = capsule_radius + kNearMissExtraRadius;
	      const double threshold_sq = threshold * threshold;
	      for (const auto &entry : pose_histories_) {
	        const std::string &target_id = entry.first;
	        if (target_id == event.connection_id) {
	          continue;
	        }
	        if (!hit_target.empty() && target_id == hit_target) {
	          continue;
	        }
	        afps::sim::PlayerState pose;
	        if (!entry.second.SampleAtOrBefore(estimated_tick, pose)) {
	          continue;
	        }
	        const afps::combat::Vec3 axis_start{pose.x, pose.y, pose.z};
	        const afps::combat::Vec3 axis_end{pose.x, pose.y, pose.z + afps::combat::kPlayerHeight};
	        const double dist_sq = SegmentSegmentDistanceSquared(segment_start, segment_end, axis_start, axis_end);
	        if (dist_sq > threshold_sq) {
	          continue;
	        }
	        const double dist = std::sqrt(std::max(0.0, dist_sq));
	        const double closeness = Clamp01((threshold - dist) / threshold);
	        const uint8_t strength = static_cast<uint8_t>(std::llround(closeness * 255.0));
	        if (strength == 0) {
	          continue;
	        }
	        NearMissFx near_miss;
	        near_miss.shooter_id = event.connection_id;
	        near_miss.shot_seq = shot_seq;
	        near_miss.strength = strength;
	        emit_fx_to(target_id, near_miss);
	      }
	    } else if (weapon->kind == afps::weapons::WeaponKind::kProjectile) {
	      const afps::combat::Vec3 origin{state_iter->second.x,
	                                      state_iter->second.y,
	                                      state_iter->second.z + afps::combat::kPlayerEyeHeight};
	      const afps::combat::Vec3 muzzle = Add(origin, Mul(shot_dir, 0.2));
	      if (weapon->projectile_speed > 0.0 && std::isfinite(weapon->projectile_speed)) {
	        afps::combat::ProjectileState projectile;
	        projectile.id = next_projectile_id_++;
	        projectile.owner_id = event.connection_id;
	        projectile.position = muzzle;
	        projectile.velocity = {shot_dir.x * weapon->projectile_speed, shot_dir.y * weapon->projectile_speed,
	                               shot_dir.z * weapon->projectile_speed};
	        projectile.ttl = kProjectileTtlSeconds;
	        projectile.radius = kProjectileRadius;
	        projectile.damage = weapon->damage;
	        projectile.explosion_radius =
	            (weapon->explosion_radius > 0.0 && std::isfinite(weapon->explosion_radius))
	                ? weapon->explosion_radius
	                : 0.0;
	        projectiles_.push_back(projectile);

	        ProjectileSpawnFx spawn;
	        spawn.shooter_id = event.connection_id;
	        spawn.weapon_slot = static_cast<uint8_t>(active_slot);
	        spawn.shot_seq = shot_seq;
	        spawn.projectile_id = projectile.id;
	        spawn.pos_x_q = QuantizeI16(projectile.position.x, kProjectilePositionStepMeters);
	        spawn.pos_y_q = QuantizeI16(projectile.position.y, kProjectilePositionStepMeters);
	        spawn.pos_z_q = QuantizeI16(projectile.position.z, kProjectilePositionStepMeters);
	        spawn.vel_x_q = QuantizeI16(projectile.velocity.x, kProjectileVelocityStepMetersPerSecond);
	        spawn.vel_y_q = QuantizeI16(projectile.velocity.y, kProjectileVelocityStepMetersPerSecond);
	        spawn.vel_z_q = QuantizeI16(projectile.velocity.z, kProjectileVelocityStepMetersPerSecond);
	        spawn.ttl_q = QuantizeU16(projectile.ttl, kProjectileTtlStepSeconds);
	        emit_fx_all(spawn);
	      }
	    }

	    if (slot_state.ammo_in_mag <= 0) {
	      const double reload_seconds = resolve_reload_seconds(weapon, loadout_bits);
	      if (reload_seconds <= 0.0) {
	        continue;
	      }
	      slot_state.reload_timer = reload_seconds;
	      ReloadFx reload;
	      reload.shooter_id = event.connection_id;
	      reload.weapon_slot = static_cast<uint8_t>(active_slot);
	      emit_fx_all(reload);
	    }
	  }

	  if (!projectiles_.empty()) {
    std::unordered_map<std::string, afps::sim::PlayerState> alive_players;
    alive_players.reserve(players_.size());
    for (const auto &entry : players_) {
      auto combat_iter = combat_states_.find(entry.first);
      if (combat_iter != combat_states_.end() && combat_iter->second.alive) {
        alive_players.emplace(entry.first, entry.second);
      }
    }

	    std::vector<afps::combat::ProjectileState> next_projectiles;
	    next_projectiles.reserve(projectiles_.size());
	    for (auto &projectile : projectiles_) {
	      if (!std::isfinite(projectile.ttl) || projectile.ttl <= 0.0) {
	        ProjectileRemoveFx remove;
	        remove.projectile_id = projectile.id;
	        emit_fx_all(remove);
	        continue;
	      }
	      projectile.ttl = std::max(0.0, projectile.ttl - dt);
	      if (projectile.ttl <= 0.0) {
	        ProjectileRemoveFx remove;
	        remove.projectile_id = projectile.id;
	        emit_fx_all(remove);
	        continue;
	      }
	      const afps::combat::Vec3 delta{projectile.velocity.x * dt, projectile.velocity.y * dt,
	                                     projectile.velocity.z * dt};
	      const auto impact = afps::combat::ResolveProjectileImpact(
          projectile, delta, sim_config_, alive_players, projectile.owner_id, &collision_world_);
	      if (impact.hit) {
	        const auto hits = afps::combat::ComputeExplosionDamage(
	            impact.position, projectile.explosion_radius, projectile.damage, alive_players, "");
	        for (const auto &hit : hits) {
          auto target_iter = combat_states_.find(hit.target_id);
          if (target_iter == combat_states_.end() || !target_iter->second.alive) {
            continue;
          }
          auto attacker_iter = combat_states_.find(projectile.owner_id);
          afps::combat::CombatState *attacker =
              attacker_iter == combat_states_.end() ? nullptr : &attacker_iter->second;
          bool shield_active = false;
          bool shield_facing = true;
          auto state_iter = players_.find(hit.target_id);
          if (state_iter != players_.end()) {
            shield_active = state_iter->second.shield_active;
          }
	          if (shield_active) {
	            shield_facing = resolve_shield_facing(hit.target_id, impact.position);
	          }
	          const bool killed = afps::combat::ApplyDamageWithShield(target_iter->second, attacker, hit.damage,
	                                                                  shield_active && shield_facing,
	                                                                  sim_config_.shield_damage_multiplier);
	          HitConfirmedFx hit_event;
	          hit_event.target_id = hit.target_id;
	          hit_event.damage = hit.damage;
	          hit_event.killed = killed;
	          emit_fx_to(projectile.owner_id, hit_event);
	          if (killed) {
	            auto &target_state = players_[hit.target_id];
	            target_state.vel_x = 0.0;
	            target_state.vel_y = 0.0;
            target_state.vel_z = 0.0;
            target_state.dash_cooldown = 0.0;
	            alive_players.erase(hit.target_id);
	          }
	        }
	        afps::combat::Vec3 normal = impact.normal;
	        SurfaceType surface = impact.hit_world ? ToSurfaceType(impact.surface_type) : SurfaceType::Energy;
	        const auto normal_oct = EncodeOct16(normal.x, normal.y, normal.z);
	        ProjectileImpactFx impact_event;
	        impact_event.projectile_id = projectile.id;
	        impact_event.hit_world = impact.hit_world;
	        impact_event.target_id = impact.target_id;
	        impact_event.pos_x_q = QuantizeI16(impact.position.x, kProjectilePositionStepMeters);
	        impact_event.pos_y_q = QuantizeI16(impact.position.y, kProjectilePositionStepMeters);
	        impact_event.pos_z_q = QuantizeI16(impact.position.z, kProjectilePositionStepMeters);
	        impact_event.normal_oct_x = normal_oct.x;
	        impact_event.normal_oct_y = normal_oct.y;
	        impact_event.surface_type = surface;
	        emit_fx_all(impact_event);

	        ProjectileRemoveFx remove_event;
	        remove_event.projectile_id = projectile.id;
	        emit_fx_all(remove_event);
	        continue;
	      }
	      projectile.position.x += delta.x;
	      projectile.position.y += delta.y;
      projectile.position.z += delta.z;
      next_projectiles.push_back(projectile);
    }
	    projectiles_.swap(next_projectiles);
	  }

	  auto fx_priority = [](const FxEventData &event) {
	    return std::visit(
	        [](const auto &typed) {
	          using T = std::decay_t<decltype(typed)>;
	          if constexpr (std::is_same_v<T, NearMissFx>) return 0;
	          if constexpr (std::is_same_v<T, ShotTraceFx>) return 1;
	          if constexpr (std::is_same_v<T, ProjectileImpactFx>) return 2;
	          if constexpr (std::is_same_v<T, ProjectileSpawnFx>) return 3;
	          if constexpr (std::is_same_v<T, ProjectileRemoveFx>) return 4;
	          if constexpr (std::is_same_v<T, ReloadFx>) return 5;
	          if constexpr (std::is_same_v<T, OverheatFx>) return 6;
	          if constexpr (std::is_same_v<T, VentFx>) return 7;
	          if constexpr (std::is_same_v<T, ShotFiredFx>) return 8;
	          if constexpr (std::is_same_v<T, HitConfirmedFx>) return 9;
	          if constexpr (std::is_same_v<T, PickupTakenFx>) return 10;
	          if constexpr (std::is_same_v<T, PickupSpawnedFx>) return 11;
	          return 1;
	        },
	        event);
	  };

	  for (const auto &recipient_id : active_ids) {
	    auto iter = fx_events.find(recipient_id);
	    if (iter == fx_events.end() || iter->second.empty()) {
	      continue;
	    }
	    auto &events = iter->second;
	    const uint32_t server_seq_ack = store_.LastClientMessageSeq(recipient_id);

	    while (!events.empty()) {
	      GameEventBatch batch;
	      batch.server_tick = server_tick_;
	      batch.events = events;
	      const auto probe = BuildGameEventBatch(batch, 0, server_seq_ack);
	      if (probe.size() <= kMaxClientMessageBytes) {
	        const auto payload = BuildGameEventBatch(batch,
	                                                 store_.NextServerMessageSeq(recipient_id),
	                                                 server_seq_ack);
	        store_.SendUnreliable(recipient_id, payload);
	        break;
	      }
	      size_t drop_index = 0;
	      int lowest = fx_priority(events[0]);
	      for (size_t i = 1; i < events.size(); ++i) {
	        const int prio = fx_priority(events[i]);
	        if (prio < lowest) {
	          lowest = prio;
	          drop_index = i;
	        }
	      }
	      events.erase(events.begin() + static_cast<long>(drop_index));
	    }
	  }

	  if (accumulator_.tick_rate() > 0) {
	    snapshot_accumulator_ += static_cast<double>(kSnapshotRate) /
	                             static_cast<double>(accumulator_.tick_rate());
	  }
  if (snapshot_accumulator_ >= 1.0) {
    snapshot_accumulator_ -= 1.0;
    for (const auto &connection_id : active_ids) {
      StateSnapshot snapshot;
      snapshot.server_tick = server_tick_;
      snapshot.client_id = connection_id;
      auto seq_iter = last_input_seq_.find(connection_id);
      snapshot.last_processed_input_seq = (seq_iter == last_input_seq_.end()) ? -1 : seq_iter->second;
      auto input_iter = last_inputs_.find(connection_id);
      snapshot.weapon_slot = (input_iter == last_inputs_.end()) ? 0 : input_iter->second.weapon_slot;
      if (!weapon_config_.slots.empty()) {
        const int max_slot = static_cast<int>(weapon_config_.slots.size() - 1);
        snapshot.weapon_slot = std::min(snapshot.weapon_slot, max_slot);
      }
      auto weapon_state_iter = weapon_states_.find(connection_id);
      if (weapon_state_iter != weapon_states_.end() &&
          snapshot.weapon_slot >= 0 &&
          static_cast<size_t>(snapshot.weapon_slot) < weapon_state_iter->second.slots.size()) {
        snapshot.ammo_in_mag = weapon_state_iter->second.slots[snapshot.weapon_slot].ammo_in_mag;
      }
      auto state_iter = players_.find(connection_id);
      if (state_iter != players_.end()) {
        snapshot.pos_x = state_iter->second.x;
        snapshot.pos_y = state_iter->second.y;
        snapshot.pos_z = state_iter->second.z;
        snapshot.vel_x = state_iter->second.vel_x;
        snapshot.vel_y = state_iter->second.vel_y;
        snapshot.vel_z = state_iter->second.vel_z;
        snapshot.dash_cooldown = state_iter->second.dash_cooldown;
      }
	      auto combat_iter = combat_states_.find(connection_id);
	      if (combat_iter != combat_states_.end()) {
	        snapshot.health = combat_iter->second.health;
	        snapshot.kills = combat_iter->second.kills;
	        snapshot.deaths = combat_iter->second.deaths;
	      }
	      const auto view = resolve_view(connection_id);
	      snapshot.view_yaw_q = QuantizeYaw(view.yaw);
	      snapshot.view_pitch_q = QuantizePitch(view.pitch);

	      uint8_t flags = 0;
	      if (input_iter != last_inputs_.end()) {
	        if (input_iter->second.ads) {
	          flags |= kPlayerFlagAds;
	        }
	        if (input_iter->second.sprint) {
	          flags |= kPlayerFlagSprint;
	        }
	      }
	      bool reloading = false;
	      bool overheated = false;
	      if (weapon_state_iter != weapon_states_.end() &&
	          snapshot.weapon_slot >= 0 &&
	          static_cast<size_t>(snapshot.weapon_slot) < weapon_state_iter->second.slots.size()) {
	        const auto &slot = weapon_state_iter->second.slots[snapshot.weapon_slot];
	        reloading = slot.reload_timer > 0.0;
	        overheated = slot.overheat_timer > 0.0;
	        snapshot.weapon_heat_q = quantize_unit_u16(slot.heat);
	      } else {
	        snapshot.weapon_heat_q = 0;
	      }
	      if (reloading) {
	        flags |= kPlayerFlagReloading;
	      }
	      if (state_iter != players_.end() && state_iter->second.shield_active) {
	        flags |= kPlayerFlagShieldActive;
	      }
	      if (overheated) {
	        flags |= kPlayerFlagOverheated;
	      }
	      if (state_iter != players_.end() && state_iter->second.crouched) {
	        flags |= kPlayerFlagCrouched;
	      }
	      snapshot.player_flags = flags;
	      auto loadout_iter = loadout_bits_.find(connection_id);
	      snapshot.loadout_bits = (loadout_iter == loadout_bits_.end()) ? 0 : loadout_iter->second;
	      auto baseline_iter = last_full_snapshots_.find(connection_id);
	      int &sequence = snapshot_sequence_[connection_id];
	      const bool needs_full = (baseline_iter == last_full_snapshots_.end()) ||
	                              (snapshot_keyframe_interval_ <= 0) ||
	                              (sequence % snapshot_keyframe_interval_ == 0);

      if (needs_full) {
        for (const auto &recipient_id : active_ids) {
          const auto payload =
              BuildStateSnapshot(snapshot,
                                 store_.NextServerMessageSeq(recipient_id),
                                 store_.LastClientMessageSeq(recipient_id));
          if (store_.SendUnreliable(recipient_id, payload)) {
            snapshot_count_ += 1;
          }
        }
        last_full_snapshots_[connection_id] = snapshot;
        sequence += 1;
        continue;
      }

      const StateSnapshot &baseline = baseline_iter->second;
      StateSnapshotDelta delta;
      delta.server_tick = snapshot.server_tick;
      delta.base_tick = baseline.server_tick;
      delta.last_processed_input_seq = snapshot.last_processed_input_seq;
      delta.client_id = snapshot.client_id;
      delta.mask = 0;
      if (snapshot.pos_x != baseline.pos_x) {
        delta.mask |= kSnapshotMaskPosX;
        delta.pos_x = snapshot.pos_x;
      }
      if (snapshot.pos_y != baseline.pos_y) {
        delta.mask |= kSnapshotMaskPosY;
        delta.pos_y = snapshot.pos_y;
      }
      if (snapshot.pos_z != baseline.pos_z) {
        delta.mask |= kSnapshotMaskPosZ;
        delta.pos_z = snapshot.pos_z;
      }
      if (snapshot.vel_x != baseline.vel_x) {
        delta.mask |= kSnapshotMaskVelX;
        delta.vel_x = snapshot.vel_x;
      }
      if (snapshot.vel_y != baseline.vel_y) {
        delta.mask |= kSnapshotMaskVelY;
        delta.vel_y = snapshot.vel_y;
      }
      if (snapshot.vel_z != baseline.vel_z) {
        delta.mask |= kSnapshotMaskVelZ;
        delta.vel_z = snapshot.vel_z;
      }
      if (snapshot.weapon_slot != baseline.weapon_slot) {
        delta.mask |= kSnapshotMaskWeaponSlot;
        delta.weapon_slot = snapshot.weapon_slot;
      }
      if (snapshot.ammo_in_mag != baseline.ammo_in_mag) {
        delta.mask |= kSnapshotMaskAmmoInMag;
        delta.ammo_in_mag = snapshot.ammo_in_mag;
      }
      if (snapshot.dash_cooldown != baseline.dash_cooldown) {
        delta.mask |= kSnapshotMaskDashCooldown;
        delta.dash_cooldown = snapshot.dash_cooldown;
      }
      if (snapshot.health != baseline.health) {
        delta.mask |= kSnapshotMaskHealth;
        delta.health = snapshot.health;
      }
      if (snapshot.kills != baseline.kills) {
        delta.mask |= kSnapshotMaskKills;
        delta.kills = snapshot.kills;
      }
	      if (snapshot.deaths != baseline.deaths) {
	        delta.mask |= kSnapshotMaskDeaths;
	        delta.deaths = snapshot.deaths;
	      }
	      if (snapshot.view_yaw_q != baseline.view_yaw_q) {
	        delta.mask |= kSnapshotMaskViewYawQ;
	        delta.view_yaw_q = snapshot.view_yaw_q;
	      }
	      if (snapshot.view_pitch_q != baseline.view_pitch_q) {
	        delta.mask |= kSnapshotMaskViewPitchQ;
	        delta.view_pitch_q = snapshot.view_pitch_q;
	      }
	      if (snapshot.player_flags != baseline.player_flags) {
	        delta.mask |= kSnapshotMaskPlayerFlags;
	        delta.player_flags = snapshot.player_flags;
	      }
	      if (snapshot.weapon_heat_q != baseline.weapon_heat_q) {
	        delta.mask |= kSnapshotMaskWeaponHeatQ;
	        delta.weapon_heat_q = snapshot.weapon_heat_q;
	      }
	      if (snapshot.loadout_bits != baseline.loadout_bits) {
	        delta.mask |= kSnapshotMaskLoadoutBits;
	        delta.loadout_bits = snapshot.loadout_bits;
	      }

	      for (const auto &recipient_id : active_ids) {
	        const auto payload =
	            BuildStateSnapshotDelta(delta,
                                    store_.NextServerMessageSeq(recipient_id),
                                    store_.LastClientMessageSeq(recipient_id));
        if (store_.SendUnreliable(recipient_id, payload)) {
          snapshot_count_ += 1;
        }
      }
      sequence += 1;
    }
  }
}
#endif
