#include "doctest.h"

#include "combat.h"
#include "sim/sim.h"

#include <cmath>
#include <limits>
#include <random>
#include <unordered_map>

using afps::combat::PoseHistory;
using afps::combat::ResolveHitscan;
using afps::combat::ResolveProjectileImpact;
using afps::combat::SanitizeViewAngles;
using afps::combat::ApplyDamage;
using afps::combat::ApplyDamageWithShield;
using afps::combat::ApplyShieldMultiplier;
using afps::combat::CreateCombatState;
using afps::combat::UpdateRespawn;
using afps::combat::ViewDirection;
using afps::combat::ViewAngles;
using afps::combat::ComputeExplosionDamage;
using afps::combat::ComputeShockwaveHits;
using afps::combat::ProjectileState;

TEST_CASE("PoseHistory returns latest sample at or before tick") {
  PoseHistory history(3);
  afps::sim::PlayerState state;
  state.x = 1.0;
  history.Push(1, state);
  state.x = 2.0;
  history.Push(3, state);
  state.x = 3.0;
  history.Push(5, state);

  afps::sim::PlayerState out;
  CHECK(history.SampleAtOrBefore(4, out));
  CHECK(out.x == doctest::Approx(2.0));
  CHECK(history.SampleAtOrBefore(5, out));
  CHECK(out.x == doctest::Approx(3.0));
}

TEST_CASE("ViewDirection aligns with yaw/pitch conventions") {
  const auto angles = SanitizeViewAngles(0.0, 0.0);
  const auto dir = ViewDirection(angles);
  CHECK(dir.x == doctest::Approx(0.0));
  CHECK(dir.y == doctest::Approx(-1.0));
  CHECK(dir.z == doctest::Approx(0.0));
}

TEST_CASE("ApplyDamage reduces health and increments scores on kill") {
  auto attacker = CreateCombatState();
  auto target = CreateCombatState();

  CHECK_FALSE(ApplyDamage(target, &attacker, 25.0));
  CHECK(target.health == doctest::Approx(75.0));
  CHECK(target.alive);
  CHECK(attacker.kills == 0);

  CHECK(ApplyDamage(target, &attacker, 100.0));
  CHECK_FALSE(target.alive);
  CHECK(target.health == doctest::Approx(0.0));
  CHECK(target.deaths == 1);
  CHECK(attacker.kills == 1);
}

TEST_CASE("ApplyDamage clamps health and prevents double-kill credit") {
  auto attacker = CreateCombatState();
  auto target = CreateCombatState();

  CHECK(ApplyDamage(target, &attacker, 250.0));
  CHECK(target.health == doctest::Approx(0.0));
  CHECK_FALSE(target.alive);
  CHECK(target.deaths == 1);
  CHECK(attacker.kills == 1);

  CHECK_FALSE(ApplyDamage(target, &attacker, 10.0));
  CHECK(target.health == doctest::Approx(0.0));
  CHECK(target.deaths == 1);
  CHECK(attacker.kills == 1);
}

TEST_CASE("ApplyDamage keeps health within bounds under random damage") {
  std::mt19937 rng(7);
  std::uniform_real_distribution<double> damage_dist(1.0, 75.0);

  for (int i = 0; i < 256; ++i) {
    auto target = CreateCombatState();
    double total_damage = 0.0;
    for (int hit = 0; hit < 8; ++hit) {
      const double damage = damage_dist(rng);
      total_damage += damage;
      ApplyDamage(target, nullptr, damage);
      CHECK(target.health >= 0.0);
      CHECK(target.health <= afps::combat::kMaxHealth);
      if (!target.alive) {
        break;
      }
    }
    if (total_damage >= afps::combat::kMaxHealth) {
      CHECK_FALSE(target.alive);
    }
  }
}

TEST_CASE("ApplyDamageWithShield reduces incoming damage") {
  auto attacker = CreateCombatState();
  auto target = CreateCombatState();

  CHECK_FALSE(ApplyDamageWithShield(target, &attacker, 50.0, true, 0.4));
  CHECK(target.health == doctest::Approx(80.0));
  CHECK(target.alive);
  CHECK(attacker.kills == 0);

  CHECK(ApplyDamageWithShield(target, &attacker, 80.0, false, 0.4));
  CHECK_FALSE(target.alive);
  CHECK(target.health == doctest::Approx(0.0));
  CHECK(attacker.kills == 1);
}

TEST_CASE("ApplyShieldMultiplier clamps to valid range") {
  CHECK(ApplyShieldMultiplier(10.0, true, 2.0) == doctest::Approx(10.0));
  CHECK(ApplyShieldMultiplier(10.0, true, -1.0) == doctest::Approx(0.0));
  CHECK(ApplyShieldMultiplier(10.0, false, 0.2) == doctest::Approx(10.0));
}

TEST_CASE("ComputeShockwaveHits applies falloff impulse inside radius") {
  std::unordered_map<std::string, afps::sim::PlayerState> players;
  afps::sim::PlayerState self{};
  self.x = 0.0;
  self.y = 0.0;
  self.z = 0.0;
  afps::sim::PlayerState near{};
  near.x = 3.0;
  near.y = 0.0;
  near.z = 0.0;
  afps::sim::PlayerState far{};
  far.x = 6.0;
  far.y = 0.0;
  far.z = 0.0;
  players.emplace("self", self);
  players.emplace("near", near);
  players.emplace("far", far);

  const afps::combat::Vec3 center{0.0, 0.0, afps::combat::kPlayerHeight * 0.5};
  const auto hits = ComputeShockwaveHits(center, 5.0, 10.0, 5.0, players, "self");
  REQUIRE(hits.size() == 1);
  CHECK(hits[0].target_id == "near");
  CHECK(hits[0].distance == doctest::Approx(3.0));
  CHECK(hits[0].impulse.x == doctest::Approx(4.0));
  CHECK(hits[0].impulse.y == doctest::Approx(0.0));
  CHECK(hits[0].impulse.z == doctest::Approx(0.0));
  CHECK(hits[0].damage == doctest::Approx(2.0));
}

TEST_CASE("UpdateRespawn restores health after timer") {
  auto state = CreateCombatState();
  CHECK(ApplyDamage(state, nullptr, 150.0));
  CHECK_FALSE(state.alive);

  CHECK_FALSE(UpdateRespawn(state, 0.5));
  CHECK_FALSE(state.alive);
  CHECK(UpdateRespawn(state, 5.0));
  CHECK(state.alive);
  CHECK(state.health == doctest::Approx(afps::combat::kMaxHealth));
}

TEST_CASE("ResolveHitscan rewinds target positions") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.arena_half_size = 100.0;
  config.obstacle_min_x = 0.0;
  config.obstacle_max_x = 0.0;
  config.obstacle_min_y = 0.0;
  config.obstacle_max_y = 0.0;

  PoseHistory shooter(10);
  PoseHistory target(10);
  afps::sim::PlayerState shooter_state;
  shooter_state.x = 0.0;
  shooter_state.y = 0.0;
  shooter_state.z = 0.0;
  shooter.Push(10, shooter_state);

  afps::sim::PlayerState target_state;
  target_state.x = 0.0;
  target_state.y = -5.0;
  target_state.z = 0.0;
  target.Push(10, target_state);
  target_state.y = 5.0;
  target.Push(11, target_state);

  std::unordered_map<std::string, PoseHistory> histories;
  histories.emplace("shooter", shooter);
  histories.emplace("target", target);

  const auto hit = ResolveHitscan("shooter", histories, 10, {0.0, 0.0}, config, 50.0);
  CHECK(hit.hit);
  CHECK(hit.target_id == "target");

  const auto miss = ResolveHitscan("shooter", histories, 11, {0.0, 0.0}, config, 50.0);
  CHECK_FALSE(miss.hit);
}

TEST_CASE("ResolveHitscan respects obstacle occlusion") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.arena_half_size = 100.0;
  config.obstacle_min_x = -1.0;
  config.obstacle_max_x = 1.0;
  config.obstacle_min_y = -3.0;
  config.obstacle_max_y = -2.0;

  PoseHistory shooter(10);
  PoseHistory target(10);
  afps::sim::PlayerState shooter_state;
  shooter_state.x = 0.0;
  shooter_state.y = 0.0;
  shooter.Push(10, shooter_state);

  afps::sim::PlayerState target_state;
  target_state.x = 0.0;
  target_state.y = -5.0;
  target.Push(10, target_state);

  std::unordered_map<std::string, PoseHistory> histories;
  histories.emplace("shooter", shooter);
  histories.emplace("target", target);

  const auto blocked = ResolveHitscan("shooter", histories, 10, {0.0, 0.0}, config, 50.0);
  CHECK_FALSE(blocked.hit);
}

TEST_CASE("ResolveHitscan ignores obstacles behind the target") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.arena_half_size = 100.0;
  config.obstacle_min_x = -1.0;
  config.obstacle_max_x = 1.0;
  config.obstacle_min_y = -8.0;
  config.obstacle_max_y = -7.0;

  PoseHistory shooter(10);
  PoseHistory target(10);
  afps::sim::PlayerState shooter_state;
  shooter_state.x = 0.0;
  shooter_state.y = 0.0;
  shooter.Push(10, shooter_state);

  afps::sim::PlayerState target_state;
  target_state.x = 0.0;
  target_state.y = -5.0;
  target.Push(10, target_state);

  std::unordered_map<std::string, PoseHistory> histories;
  histories.emplace("shooter", shooter);
  histories.emplace("target", target);

  const auto hit = ResolveHitscan("shooter", histories, 10, {0.0, 0.0}, config, 50.0);
  CHECK(hit.hit);
  CHECK(hit.target_id == "target");
}

TEST_CASE("ResolveHitscan misses when target history does not reach rewind tick") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.arena_half_size = 100.0;

  PoseHistory shooter(10);
  PoseHistory target(1);
  afps::sim::PlayerState shooter_state;
  shooter_state.x = 0.0;
  shooter_state.y = 0.0;
  shooter.Push(10, shooter_state);

  afps::sim::PlayerState target_state;
  target_state.x = 0.0;
  target_state.y = -5.0;
  target.Push(20, target_state);

  std::unordered_map<std::string, PoseHistory> histories;
  histories.emplace("shooter", shooter);
  histories.emplace("target", target);

  const auto miss = ResolveHitscan("shooter", histories, 10, {0.0, 0.0}, config, 50.0);
  CHECK_FALSE(miss.hit);
}

TEST_CASE("ResolveHitscan returns no hit when shooter is missing") {
  std::unordered_map<std::string, PoseHistory> histories;
  const auto miss = ResolveHitscan("missing", histories, 5, {0.0, 0.0}, afps::sim::kDefaultSimConfig, 50.0);
  CHECK_FALSE(miss.hit);
}

TEST_CASE("ResolveHitscan respects weapon range") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.arena_half_size = 100.0;
  config.obstacle_min_x = 0.0;
  config.obstacle_max_x = 0.0;
  config.obstacle_min_y = 0.0;
  config.obstacle_max_y = 0.0;

  PoseHistory shooter(10);
  PoseHistory target(10);
  afps::sim::PlayerState shooter_state;
  shooter_state.x = 0.0;
  shooter_state.y = 0.0;
  shooter_state.z = 0.0;
  shooter.Push(1, shooter_state);

  afps::sim::PlayerState target_state;
  target_state.x = 0.0;
  target_state.y = -10.0;
  target_state.z = 0.0;
  target.Push(1, target_state);

  std::unordered_map<std::string, PoseHistory> histories;
  histories.emplace("shooter", shooter);
  histories.emplace("target", target);

  const auto short_range = ResolveHitscan("shooter", histories, 1, {0.0, 0.0}, config, 5.0);
  CHECK_FALSE(short_range.hit);

  const auto long_range = ResolveHitscan("shooter", histories, 1, {0.0, 0.0}, config, 15.0);
  CHECK(long_range.hit);
  CHECK(long_range.target_id == "target");
}

TEST_CASE("ResolveHitscan selects the closest target") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.arena_half_size = 100.0;
  config.obstacle_min_x = 0.0;
  config.obstacle_max_x = 0.0;
  config.obstacle_min_y = 0.0;
  config.obstacle_max_y = 0.0;

  PoseHistory shooter(10);
  PoseHistory near_target(10);
  PoseHistory far_target(10);
  afps::sim::PlayerState shooter_state;
  shooter_state.x = 0.0;
  shooter_state.y = 0.0;
  shooter_state.z = 0.0;
  shooter.Push(2, shooter_state);

  afps::sim::PlayerState near_state;
  near_state.x = 0.0;
  near_state.y = -3.0;
  near_state.z = 0.0;
  near_target.Push(2, near_state);

  afps::sim::PlayerState far_state;
  far_state.x = 0.0;
  far_state.y = -6.0;
  far_state.z = 0.0;
  far_target.Push(2, far_state);

  std::unordered_map<std::string, PoseHistory> histories;
  histories.emplace("shooter", shooter);
  histories.emplace("near", near_target);
  histories.emplace("far", far_target);

  const auto hit = ResolveHitscan("shooter", histories, 2, {0.0, 0.0}, config, 50.0);
  CHECK(hit.hit);
  CHECK(hit.target_id == "near");
}

TEST_CASE("ResolveHitscan uses rewound target position for hit distance") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.arena_half_size = 100.0;
  config.obstacle_min_x = 0.0;
  config.obstacle_max_x = 0.0;
  config.obstacle_min_y = 0.0;
  config.obstacle_max_y = 0.0;
  config.player_radius = 0.5;

  PoseHistory shooter(5);
  PoseHistory target(5);
  afps::sim::PlayerState shooter_state;
  shooter_state.x = 0.0;
  shooter_state.y = 0.0;
  shooter_state.z = 0.0;
  shooter.Push(1, shooter_state);
  shooter.Push(2, shooter_state);

  afps::sim::PlayerState target_state;
  target_state.x = 0.0;
  target_state.y = -5.0;
  target_state.z = 0.0;
  target.Push(1, target_state);
  target_state.y = -9.0;
  target.Push(2, target_state);

  std::unordered_map<std::string, PoseHistory> histories;
  histories.emplace("shooter", shooter);
  histories.emplace("target", target);

  const auto near_hit = ResolveHitscan("shooter", histories, 1, {0.0, 0.0}, config, 50.0);
  CHECK(near_hit.hit);
  CHECK(near_hit.distance == doctest::Approx(4.5));
  CHECK(near_hit.position.y == doctest::Approx(-4.5));

  const auto far_hit = ResolveHitscan("shooter", histories, 2, {0.0, 0.0}, config, 50.0);
  CHECK(far_hit.hit);
  CHECK(far_hit.distance == doctest::Approx(8.5));
  CHECK(far_hit.position.y == doctest::Approx(-8.5));
}

TEST_CASE("ResolveHitscan selects target based on rewind tick") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.arena_half_size = 100.0;
  config.obstacle_min_x = 0.0;
  config.obstacle_max_x = 0.0;
  config.obstacle_min_y = 0.0;
  config.obstacle_max_y = 0.0;

  PoseHistory shooter(5);
  PoseHistory target_a(5);
  PoseHistory target_b(5);
  afps::sim::PlayerState shooter_state;
  shooter_state.x = 0.0;
  shooter_state.y = 0.0;
  shooter_state.z = 0.0;
  shooter.Push(1, shooter_state);
  shooter.Push(2, shooter_state);

  afps::sim::PlayerState a_state;
  a_state.x = 0.0;
  a_state.y = -5.0;
  a_state.z = 0.0;
  target_a.Push(1, a_state);
  a_state.x = 3.0;
  target_a.Push(2, a_state);

  afps::sim::PlayerState b_state;
  b_state.x = 3.0;
  b_state.y = -5.0;
  b_state.z = 0.0;
  target_b.Push(1, b_state);
  b_state.x = 0.0;
  target_b.Push(2, b_state);

  std::unordered_map<std::string, PoseHistory> histories;
  histories.emplace("shooter", shooter);
  histories.emplace("a", target_a);
  histories.emplace("b", target_b);

  const auto hit_tick1 = ResolveHitscan("shooter", histories, 1, {0.0, 0.0}, config, 50.0);
  CHECK(hit_tick1.hit);
  CHECK(hit_tick1.target_id == "a");

  const auto hit_tick2 = ResolveHitscan("shooter", histories, 2, {0.0, 0.0}, config, 50.0);
  CHECK(hit_tick2.hit);
  CHECK(hit_tick2.target_id == "b");
}

TEST_CASE("ResolveHitscan handles non-finite inputs safely") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.arena_half_size = 100.0;
  config.obstacle_min_x = 0.0;
  config.obstacle_max_x = 0.0;
  config.obstacle_min_y = 0.0;
  config.obstacle_max_y = 0.0;
  config.player_radius = 0.5;

  PoseHistory shooter(5);
  PoseHistory target(5);
  afps::sim::PlayerState shooter_state;
  shooter_state.x = 0.0;
  shooter_state.y = 0.0;
  shooter_state.z = 0.0;
  shooter.Push(1, shooter_state);

  afps::sim::PlayerState target_state;
  target_state.x = 0.0;
  target_state.y = -5.0;
  target_state.z = 0.0;
  target.Push(1, target_state);

  std::unordered_map<std::string, PoseHistory> histories;
  histories.emplace("shooter", shooter);
  histories.emplace("target", target);

  const double nan = std::numeric_limits<double>::quiet_NaN();
  const double inf = std::numeric_limits<double>::infinity();
  const std::vector<ViewAngles> angles = {
      {nan, 0.0},
      {inf, 0.0},
      {-inf, 0.0},
      {0.0, nan},
      {0.0, inf},
      {nan, inf},
  };
  const std::vector<double> ranges = {50.0, nan, -1.0};

  for (const auto &view : angles) {
    for (const auto range : ranges) {
      const auto hit = ResolveHitscan("shooter", histories, 1, view, config, range);
      CHECK(hit.hit);
      CHECK(hit.target_id == "target");
      CHECK(std::isfinite(hit.distance));
      CHECK(hit.distance == doctest::Approx(4.5));
      CHECK(std::isfinite(hit.position.x));
      CHECK(std::isfinite(hit.position.y));
      CHECK(std::isfinite(hit.position.z));
    }
  }
}

TEST_CASE("ResolveHitscan handles random view inputs safely") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.arena_half_size = 100.0;
  config.obstacle_min_x = 0.0;
  config.obstacle_max_x = 0.0;
  config.obstacle_min_y = 0.0;
  config.obstacle_max_y = 0.0;
  config.player_radius = 0.5;

  PoseHistory shooter(5);
  PoseHistory target(5);
  afps::sim::PlayerState shooter_state;
  shooter_state.x = 0.0;
  shooter_state.y = 0.0;
  shooter_state.z = 0.0;
  shooter.Push(1, shooter_state);

  afps::sim::PlayerState target_state;
  target_state.x = 0.0;
  target_state.y = -5.0;
  target_state.z = 0.0;
  target.Push(1, target_state);

  std::unordered_map<std::string, PoseHistory> histories;
  histories.emplace("shooter", shooter);
  histories.emplace("target", target);

  std::mt19937 rng(1337);
  std::uniform_real_distribution<double> yaw_dist(-3.1415926535, 3.1415926535);
  std::uniform_real_distribution<double> pitch_dist(-1.5, 1.5);
  std::uniform_real_distribution<double> range_dist(-10.0, 60.0);

  for (int i = 0; i < 512; ++i) {
    const ViewAngles view{yaw_dist(rng), pitch_dist(rng)};
    const double range = range_dist(rng);
    const auto hit = ResolveHitscan("shooter", histories, 1, view, config, range);
    if (hit.hit) {
      CHECK(std::isfinite(hit.distance));
      CHECK(hit.distance >= 0.0);
      if (std::isfinite(range) && range > 0.0) {
        CHECK(hit.distance <= range + 1e-6);
      }
      CHECK(std::isfinite(hit.position.x));
      CHECK(std::isfinite(hit.position.y));
      CHECK(std::isfinite(hit.position.z));
    }
  }
}

TEST_CASE("ResolveHitscan hits angled target with yaw") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.arena_half_size = 100.0;
  config.obstacle_min_x = 0.0;
  config.obstacle_max_x = 0.0;
  config.obstacle_min_y = 0.0;
  config.obstacle_max_y = 0.0;

  PoseHistory shooter(5);
  PoseHistory target(5);
  afps::sim::PlayerState shooter_state;
  shooter_state.x = 0.0;
  shooter_state.y = 0.0;
  shooter_state.z = 0.0;
  shooter.Push(1, shooter_state);

  afps::sim::PlayerState target_state;
  target_state.x = 5.0;
  target_state.y = -5.0;
  target_state.z = 0.0;
  target.Push(1, target_state);

  std::unordered_map<std::string, PoseHistory> histories;
  histories.emplace("shooter", shooter);
  histories.emplace("target", target);

  const double yaw = std::atan2(target_state.x - shooter_state.x, -(target_state.y - shooter_state.y));
  const auto hit = ResolveHitscan("shooter", histories, 1, {yaw, 0.0}, config, 50.0);
  CHECK(hit.hit);
  CHECK(hit.target_id == "target");
}

TEST_CASE("ResolveHitscan rewinds shooter position") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.arena_half_size = 100.0;
  config.obstacle_min_x = 0.0;
  config.obstacle_max_x = 0.0;
  config.obstacle_min_y = 0.0;
  config.obstacle_max_y = 0.0;

  PoseHistory shooter(10);
  PoseHistory target(10);
  afps::sim::PlayerState shooter_state;
  shooter_state.x = 0.0;
  shooter_state.y = 0.0;
  shooter_state.z = 0.0;
  shooter.Push(5, shooter_state);
  shooter_state.x = 4.0;
  shooter.Push(6, shooter_state);

  afps::sim::PlayerState target_state;
  target_state.x = 0.0;
  target_state.y = -5.0;
  target_state.z = 0.0;
  target.Push(5, target_state);
  target.Push(6, target_state);

  std::unordered_map<std::string, PoseHistory> histories;
  histories.emplace("shooter", shooter);
  histories.emplace("target", target);

  const auto rewind_hit = ResolveHitscan("shooter", histories, 5, {0.0, 0.0}, config, 50.0);
  CHECK(rewind_hit.hit);
  CHECK(rewind_hit.target_id == "target");

  const auto moved_miss = ResolveHitscan("shooter", histories, 6, {0.0, 0.0}, config, 50.0);
  CHECK_FALSE(moved_miss.hit);
}

TEST_CASE("ResolveProjectileImpact hits player before world") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.arena_half_size = 50.0;
  config.obstacle_min_x = 0.0;
  config.obstacle_max_x = 0.0;
  config.obstacle_min_y = 0.0;
  config.obstacle_max_y = 0.0;

  std::unordered_map<std::string, afps::sim::PlayerState> players;
  afps::sim::PlayerState target;
  target.x = 0.0;
  target.y = -3.0;
  target.z = 0.0;
  players.emplace("target", target);

  ProjectileState projectile;
  projectile.position = {0.0, 0.0, 1.0};
  projectile.velocity = {0.0, -10.0, 0.0};
  projectile.radius = 0.0;

  const afps::combat::Vec3 delta{projectile.velocity.x * 0.5, projectile.velocity.y * 0.5,
                                 projectile.velocity.z * 0.5};
  const auto impact = ResolveProjectileImpact(projectile, delta, config, players, "owner");
  CHECK(impact.hit);
  CHECK(impact.target_id == "target");
  CHECK_FALSE(impact.hit_world);
}

TEST_CASE("ResolveProjectileImpact hits arena boundary when no target") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.arena_half_size = 2.0;
  config.obstacle_min_x = 0.0;
  config.obstacle_max_x = 0.0;
  config.obstacle_min_y = 0.0;
  config.obstacle_max_y = 0.0;

  std::unordered_map<std::string, afps::sim::PlayerState> players;

  ProjectileState projectile;
  projectile.position = {0.0, 0.0, 1.0};
  projectile.velocity = {10.0, 0.0, 0.0};
  projectile.radius = 0.0;

  const afps::combat::Vec3 delta{projectile.velocity.x * 0.5, projectile.velocity.y * 0.5,
                                 projectile.velocity.z * 0.5};
  const auto impact = ResolveProjectileImpact(projectile, delta, config, players, "owner");
  CHECK(impact.hit);
  CHECK(impact.hit_world);
}

TEST_CASE("ResolveProjectileImpact rejects non-finite deltas") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.arena_half_size = 50.0;
  config.obstacle_min_x = 0.0;
  config.obstacle_max_x = 0.0;
  config.obstacle_min_y = 0.0;
  config.obstacle_max_y = 0.0;

  std::unordered_map<std::string, afps::sim::PlayerState> players;
  ProjectileState projectile;
  projectile.position = {0.0, 0.0, 1.0};
  projectile.velocity = {0.0, -10.0, 0.0};
  projectile.radius = 0.0;

  const afps::combat::Vec3 delta_nan{std::numeric_limits<double>::quiet_NaN(), 0.0, 0.0};
  const auto miss_nan = ResolveProjectileImpact(projectile, delta_nan, config, players, "owner");
  CHECK_FALSE(miss_nan.hit);

  const afps::combat::Vec3 delta_inf{std::numeric_limits<double>::infinity(), 0.0, 0.0};
  const auto miss_inf = ResolveProjectileImpact(projectile, delta_inf, config, players, "owner");
  CHECK_FALSE(miss_inf.hit);
}

TEST_CASE("ResolveProjectileImpact handles random deltas safely") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.arena_half_size = 50.0;
  config.obstacle_min_x = 0.0;
  config.obstacle_max_x = 0.0;
  config.obstacle_min_y = 0.0;
  config.obstacle_max_y = 0.0;

  std::unordered_map<std::string, afps::sim::PlayerState> players;
  afps::sim::PlayerState target;
  target.x = 0.0;
  target.y = -3.0;
  target.z = 0.0;
  players.emplace("target", target);

  ProjectileState projectile;
  projectile.position = {0.0, 0.0, 1.0};
  projectile.velocity = {0.0, -10.0, 0.0};
  projectile.radius = 0.0;

  std::mt19937 rng(2024);
  std::uniform_real_distribution<double> delta_dist(-5.0, 5.0);
  std::uniform_real_distribution<double> z_dist(-2.0, 2.0);

  for (int i = 0; i < 512; ++i) {
    const afps::combat::Vec3 delta{delta_dist(rng), delta_dist(rng), z_dist(rng)};
    const auto impact = ResolveProjectileImpact(projectile, delta, config, players, "owner");
    if (impact.hit) {
      CHECK(std::isfinite(impact.t));
      CHECK(impact.t >= 0.0);
      CHECK(impact.t <= 1.0);
      CHECK(std::isfinite(impact.position.x));
      CHECK(std::isfinite(impact.position.y));
      CHECK(std::isfinite(impact.position.z));
    }
  }
}

TEST_CASE("ComputeExplosionDamage applies falloff") {
  std::unordered_map<std::string, afps::sim::PlayerState> players;
  afps::sim::PlayerState a;
  a.x = 0.0;
  a.y = 0.0;
  a.z = 0.0;
  players.emplace("a", a);
  afps::sim::PlayerState b;
  b.x = 2.0;
  b.y = 0.0;
  b.z = 0.0;
  players.emplace("b", b);

  const double radius = 4.0;
  const double max_damage = 100.0;
  const afps::combat::Vec3 center{0.0, 0.0, afps::combat::kPlayerHeight * 0.5};
  const auto hits = ComputeExplosionDamage(center, radius, max_damage, players, "");
  CHECK(hits.size() == 2);

  double damage_a = 0.0;
  double damage_b = 0.0;
  for (const auto &hit : hits) {
    if (hit.target_id == "a") {
      damage_a = hit.damage;
    }
    if (hit.target_id == "b") {
      damage_b = hit.damage;
    }
  }
  CHECK(damage_a == doctest::Approx(max_damage));
  CHECK(damage_b == doctest::Approx(max_damage * 0.5));
}

TEST_CASE("ComputeExplosionDamage rejects invalid radius or damage") {
  std::unordered_map<std::string, afps::sim::PlayerState> players;
  afps::sim::PlayerState a;
  a.x = 0.0;
  a.y = 0.0;
  a.z = 0.0;
  players.emplace("a", a);

  const afps::combat::Vec3 center{0.0, 0.0, afps::combat::kPlayerHeight * 0.5};
  const auto empty_radius = ComputeExplosionDamage(center, -1.0, 100.0, players, "");
  CHECK(empty_radius.empty());

  const auto empty_damage = ComputeExplosionDamage(center, 4.0, -5.0, players, "");
  CHECK(empty_damage.empty());

  const auto empty_nan = ComputeExplosionDamage(center, std::numeric_limits<double>::quiet_NaN(), 100.0, players, "");
  CHECK(empty_nan.empty());
}

TEST_CASE("ComputeExplosionDamage handles random inputs safely") {
  std::unordered_map<std::string, afps::sim::PlayerState> players;
  afps::sim::PlayerState a;
  a.x = 0.0;
  a.y = 0.0;
  a.z = 0.0;
  players.emplace("a", a);
  afps::sim::PlayerState b;
  b.x = 3.0;
  b.y = -2.0;
  b.z = 0.0;
  players.emplace("b", b);

  std::mt19937 rng(99);
  std::uniform_real_distribution<double> center_dist(-2.0, 2.0);
  std::uniform_real_distribution<double> radius_dist(0.1, 10.0);
  std::uniform_real_distribution<double> damage_dist(1.0, 200.0);

  for (int i = 0; i < 512; ++i) {
    const afps::combat::Vec3 center{center_dist(rng), center_dist(rng), afps::combat::kPlayerHeight * 0.5};
    const double radius = radius_dist(rng);
    const double max_damage = damage_dist(rng);
    const auto hits = ComputeExplosionDamage(center, radius, max_damage, players, "");
    for (const auto &hit : hits) {
      CHECK(std::isfinite(hit.damage));
      CHECK(hit.damage > 0.0);
      CHECK(hit.damage <= max_damage + 1e-6);
      CHECK(std::isfinite(hit.distance));
      CHECK(hit.distance >= 0.0);
      CHECK(hit.distance <= radius + 1e-6);
    }
  }
}
