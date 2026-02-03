#pragma once

#include <deque>
#include <limits>
#include <string>
#include <unordered_map>
#include <vector>

#include "sim/sim.h"

namespace afps::combat {

struct Vec3 {
  double x = 0.0;
  double y = 0.0;
  double z = 0.0;
};

struct ViewAngles {
  double yaw = 0.0;
  double pitch = 0.0;
};

struct PoseSample {
  int server_tick = 0;
  afps::sim::PlayerState state{};
};

struct CombatState {
  double health = 100.0;
  int kills = 0;
  int deaths = 0;
  bool alive = true;
  double respawn_timer = 0.0;
};

class PoseHistory {
public:
  explicit PoseHistory(size_t max_samples = 0);

  void SetMaxSamples(size_t max_samples);
  void Push(int server_tick, const afps::sim::PlayerState &state);
  bool SampleAtOrBefore(int server_tick, afps::sim::PlayerState &out) const;
  int OldestTick() const;
  size_t size() const;

private:
  void Trim();

  size_t max_samples_ = 0;
  std::deque<PoseSample> samples_;
};

struct HitResult {
  bool hit = false;
  std::string target_id;
  double distance = 0.0;
  Vec3 position{};
};

struct ProjectileState {
  int id = 0;
  std::string owner_id;
  Vec3 position{};
  Vec3 velocity{};
  double ttl = 0.0;
  double radius = 0.0;
  double damage = 0.0;
  double explosion_radius = 0.0;
};

struct ProjectileImpact {
  bool hit = false;
  bool hit_world = false;
  std::string target_id;
  double t = 1.0;
  Vec3 position{};
};

struct ExplosionHit {
  std::string target_id;
  double damage = 0.0;
  double distance = 0.0;
};

struct ShockwaveHit {
  std::string target_id;
  Vec3 impulse{};
  double damage = 0.0;
  double distance = 0.0;
};

constexpr double kMaxHealth = 100.0;
constexpr double kRespawnDelaySeconds = 3.0;
constexpr double kPlayerHeight = 1.7;
constexpr double kPlayerEyeHeight = 1.6;
constexpr double kShieldBlockDot = 0.0;

CombatState CreateCombatState();
bool ApplyDamage(CombatState &target, CombatState *attacker, double damage);
double ApplyShieldMultiplier(double damage, bool shield_active, double shield_multiplier);
bool ApplyDamageWithShield(CombatState &target,
                           CombatState *attacker,
                           double damage,
                           bool shield_active,
                           double shield_multiplier);
bool UpdateRespawn(CombatState &state, double dt);

ViewAngles SanitizeViewAngles(double yaw, double pitch);
Vec3 ViewDirection(const ViewAngles &angles);
bool IsShieldFacing(const Vec3 &target_pos,
                    const ViewAngles &target_view,
                    const Vec3 &source_pos,
                    double min_dot = kShieldBlockDot);

HitResult ResolveHitscan(const std::string &shooter_id,
                         const std::unordered_map<std::string, PoseHistory> &histories,
                         int rewind_tick,
                         const ViewAngles &view,
                         const afps::sim::SimConfig &config,
                         double range);

ProjectileImpact ResolveProjectileImpact(const ProjectileState &projectile,
                                         const Vec3 &delta,
                                         const afps::sim::SimConfig &config,
                                         const std::unordered_map<std::string, afps::sim::PlayerState> &players,
                                         const std::string &ignore_id);

std::vector<ExplosionHit> ComputeExplosionDamage(
    const Vec3 &center,
    double radius,
    double max_damage,
    const std::unordered_map<std::string, afps::sim::PlayerState> &players,
    const std::string &ignore_id);

std::vector<ShockwaveHit> ComputeShockwaveHits(
    const Vec3 &center,
    double radius,
    double max_impulse,
    double max_damage,
    const afps::sim::SimConfig &config,
    const std::unordered_map<std::string, afps::sim::PlayerState> &players,
    const std::string &ignore_id);

}  // namespace afps::combat
