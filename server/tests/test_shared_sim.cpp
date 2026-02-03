#include "doctest.h"

#include <cmath>
#include <cstdint>
#include <fstream>
#include <limits>

#include <nlohmann/json.hpp>

#include "sim/sim.h"

TEST_CASE("Shared sim step advances deterministically") {
  afps::sim::PlayerState state{0.0, 0.0};
  const auto input = afps::sim::MakeInput(1.0, 0.0, false, false, false, false, false, false);
  const double dt = 1.0 / 60.0;
  afps::sim::StepPlayer(state, input, afps::sim::kDefaultSimConfig, dt);

  const double expected = afps::sim::kDefaultSimConfig.accel * dt * dt;
  CHECK(state.x == doctest::Approx(expected));
  CHECK(state.y == doctest::Approx(0.0));
}

TEST_CASE("Shared sim config JSON matches defaults") {
  std::ifstream file("../../shared/sim/config.json");
  REQUIRE(file.is_open());

  nlohmann::json payload;
  file >> payload;

  REQUIRE(payload.contains("moveSpeed"));
  REQUIRE(payload.contains("sprintMultiplier"));
  REQUIRE(payload.contains("accel"));
  REQUIRE(payload.contains("friction"));
  REQUIRE(payload.contains("gravity"));
  REQUIRE(payload.contains("jumpVelocity"));
  REQUIRE(payload.contains("dashImpulse"));
  REQUIRE(payload.contains("dashCooldown"));
  REQUIRE(payload.contains("grappleMaxDistance"));
  REQUIRE(payload.contains("grapplePullStrength"));
  REQUIRE(payload.contains("grappleDamping"));
  REQUIRE(payload.contains("grappleCooldown"));
  REQUIRE(payload.contains("grappleMinAttachNormalY"));
  REQUIRE(payload.contains("grappleRopeSlack"));
  REQUIRE(payload.contains("shieldDuration"));
  REQUIRE(payload.contains("shieldCooldown"));
  REQUIRE(payload.contains("shieldDamageMultiplier"));
  REQUIRE(payload.contains("shockwaveRadius"));
  REQUIRE(payload.contains("shockwaveImpulse"));
  REQUIRE(payload.contains("shockwaveCooldown"));
  REQUIRE(payload.contains("shockwaveDamage"));
  REQUIRE(payload.contains("arenaHalfSize"));
  REQUIRE(payload.contains("playerRadius"));
  REQUIRE(payload.contains("playerHeight"));
  REQUIRE(payload.contains("obstacleMinX"));
  REQUIRE(payload.contains("obstacleMaxX"));
  REQUIRE(payload.contains("obstacleMinY"));
  REQUIRE(payload.contains("obstacleMaxY"));

  const double move_speed = payload.at("moveSpeed").get<double>();
  const double sprint_multiplier = payload.at("sprintMultiplier").get<double>();
  const double accel = payload.at("accel").get<double>();
  const double friction = payload.at("friction").get<double>();
  const double gravity = payload.at("gravity").get<double>();
  const double jump_velocity = payload.at("jumpVelocity").get<double>();
  const double dash_impulse = payload.at("dashImpulse").get<double>();
  const double dash_cooldown = payload.at("dashCooldown").get<double>();
  const double grapple_max_distance = payload.at("grappleMaxDistance").get<double>();
  const double grapple_pull_strength = payload.at("grapplePullStrength").get<double>();
  const double grapple_damping = payload.at("grappleDamping").get<double>();
  const double grapple_cooldown = payload.at("grappleCooldown").get<double>();
  const double grapple_min_attach_normal_y = payload.at("grappleMinAttachNormalY").get<double>();
  const double grapple_rope_slack = payload.at("grappleRopeSlack").get<double>();
  const double shield_duration = payload.at("shieldDuration").get<double>();
  const double shield_cooldown = payload.at("shieldCooldown").get<double>();
  const double shield_damage_multiplier = payload.at("shieldDamageMultiplier").get<double>();
  const double shockwave_radius = payload.at("shockwaveRadius").get<double>();
  const double shockwave_impulse = payload.at("shockwaveImpulse").get<double>();
  const double shockwave_cooldown = payload.at("shockwaveCooldown").get<double>();
  const double shockwave_damage = payload.at("shockwaveDamage").get<double>();
  const double arena_half_size = payload.at("arenaHalfSize").get<double>();
  const double player_radius = payload.at("playerRadius").get<double>();
  const double player_height = payload.at("playerHeight").get<double>();
  const double obstacle_min_x = payload.at("obstacleMinX").get<double>();
  const double obstacle_max_x = payload.at("obstacleMaxX").get<double>();
  const double obstacle_min_y = payload.at("obstacleMinY").get<double>();
  const double obstacle_max_y = payload.at("obstacleMaxY").get<double>();

  CHECK(move_speed == doctest::Approx(afps::sim::kDefaultSimConfig.move_speed));
  CHECK(sprint_multiplier == doctest::Approx(afps::sim::kDefaultSimConfig.sprint_multiplier));
  CHECK(accel == doctest::Approx(afps::sim::kDefaultSimConfig.accel));
  CHECK(friction == doctest::Approx(afps::sim::kDefaultSimConfig.friction));
  CHECK(gravity == doctest::Approx(afps::sim::kDefaultSimConfig.gravity));
  CHECK(jump_velocity == doctest::Approx(afps::sim::kDefaultSimConfig.jump_velocity));
  CHECK(dash_impulse == doctest::Approx(afps::sim::kDefaultSimConfig.dash_impulse));
  CHECK(dash_cooldown == doctest::Approx(afps::sim::kDefaultSimConfig.dash_cooldown));
  CHECK(grapple_max_distance == doctest::Approx(afps::sim::kDefaultSimConfig.grapple_max_distance));
  CHECK(grapple_pull_strength == doctest::Approx(afps::sim::kDefaultSimConfig.grapple_pull_strength));
  CHECK(grapple_damping == doctest::Approx(afps::sim::kDefaultSimConfig.grapple_damping));
  CHECK(grapple_cooldown == doctest::Approx(afps::sim::kDefaultSimConfig.grapple_cooldown));
  CHECK(grapple_min_attach_normal_y == doctest::Approx(afps::sim::kDefaultSimConfig.grapple_min_attach_normal_y));
  CHECK(grapple_rope_slack == doctest::Approx(afps::sim::kDefaultSimConfig.grapple_rope_slack));
  CHECK(shield_duration == doctest::Approx(afps::sim::kDefaultSimConfig.shield_duration));
  CHECK(shield_cooldown == doctest::Approx(afps::sim::kDefaultSimConfig.shield_cooldown));
  CHECK(shield_damage_multiplier == doctest::Approx(afps::sim::kDefaultSimConfig.shield_damage_multiplier));
  CHECK(shockwave_radius == doctest::Approx(afps::sim::kDefaultSimConfig.shockwave_radius));
  CHECK(shockwave_impulse == doctest::Approx(afps::sim::kDefaultSimConfig.shockwave_impulse));
  CHECK(shockwave_cooldown == doctest::Approx(afps::sim::kDefaultSimConfig.shockwave_cooldown));
  CHECK(shockwave_damage == doctest::Approx(afps::sim::kDefaultSimConfig.shockwave_damage));
  CHECK(arena_half_size == doctest::Approx(afps::sim::kDefaultSimConfig.arena_half_size));
  CHECK(player_radius == doctest::Approx(afps::sim::kDefaultSimConfig.player_radius));
  CHECK(player_height == doctest::Approx(afps::sim::kDefaultSimConfig.player_height));
  CHECK(obstacle_min_x == doctest::Approx(afps::sim::kDefaultSimConfig.obstacle_min_x));
  CHECK(obstacle_max_x == doctest::Approx(afps::sim::kDefaultSimConfig.obstacle_max_x));
  CHECK(obstacle_min_y == doctest::Approx(afps::sim::kDefaultSimConfig.obstacle_min_y));
  CHECK(obstacle_max_y == doctest::Approx(afps::sim::kDefaultSimConfig.obstacle_max_y));
}

TEST_CASE("Shared sim golden input script") {
  afps::sim::PlayerState state{0.0, 0.0};
  const double dt = 1.0 / 60.0;

  for (int i = 0; i < 10; ++i) {
    const auto input = afps::sim::MakeInput(1.0, 0.0, false, false, false, false, false, false);
    afps::sim::StepPlayer(state, input, afps::sim::kDefaultSimConfig, dt);
  }

  for (int i = 0; i < 5; ++i) {
    const auto input = afps::sim::MakeInput(1.0, 0.0, true, false, false, false, false, false);
    afps::sim::StepPlayer(state, input, afps::sim::kDefaultSimConfig, dt);
  }

  for (int i = 0; i < 10; ++i) {
    const auto input = afps::sim::MakeInput(0.0, -1.0, false, i == 0, false, false, false, false);
    afps::sim::StepPlayer(state, input, afps::sim::kDefaultSimConfig, dt);
  }

  CHECK(state.x == doctest::Approx(1.808673303244431));
  CHECK(state.y == doctest::Approx(-0.5097455848670577));
  CHECK(state.z == doctest::Approx(0.7916666666666666));
  CHECK(state.vel_x == doctest::Approx(2.049335142362279));
  CHECK(state.vel_y == doctest::Approx(-4.560726419582628));
  CHECK(state.vel_z == doctest::Approx(2.5));
}

TEST_CASE("Shared sim replay remains deterministic") {
  std::ifstream file("../../shared/sim/replays/ability_replay.json");
  REQUIRE(file.is_open());

  nlohmann::json payload;
  file >> payload;

  const double dt = payload.value("dt", 1.0 / 60.0);
  const auto inputs = payload.at("inputs");
  const auto expected = payload.at("expected");

  afps::sim::PlayerState state{};
  for (const auto &input : inputs) {
    const auto sim_input = afps::sim::MakeInput(
        input.value("moveX", 0.0),
        input.value("moveY", 0.0),
        input.value("sprint", false),
        input.value("jump", false),
        input.value("dash", false),
        input.value("grapple", false),
        input.value("shield", false),
        input.value("shockwave", false),
        input.value("viewYaw", 0.0),
        input.value("viewPitch", 0.0));
    afps::sim::StepPlayer(state, sim_input, afps::sim::kDefaultSimConfig, dt);
  }

  CHECK(state.x == doctest::Approx(expected.at("x").get<double>()).epsilon(1e-5));
  CHECK(state.y == doctest::Approx(expected.at("y").get<double>()).epsilon(1e-5));
  CHECK(state.z == doctest::Approx(expected.at("z").get<double>()).epsilon(1e-5));
  CHECK(state.vel_x == doctest::Approx(expected.at("velX").get<double>()).epsilon(1e-5));
  CHECK(state.vel_y == doctest::Approx(expected.at("velY").get<double>()).epsilon(1e-5));
  CHECK(state.vel_z == doctest::Approx(expected.at("velZ").get<double>()).epsilon(1e-5));
  CHECK(state.dash_cooldown == doctest::Approx(expected.at("dashCooldown").get<double>()).epsilon(1e-5));
  CHECK(state.grapple_cooldown == doctest::Approx(expected.at("grappleCooldown").get<double>()).epsilon(1e-5));
  CHECK(state.grapple_active == expected.at("grappleActive").get<bool>());
}

TEST_CASE("Shared sim jump height within tolerance") {
  afps::sim::PlayerState state{};
  const double dt = 1.0 / 60.0;
  double max_z = 0.0;

  for (int i = 0; i < 120; ++i) {
    const auto input = afps::sim::MakeInput(0.0, 0.0, false, i == 0, false, false, false, false);
    afps::sim::StepPlayer(state, input, afps::sim::kDefaultSimConfig, dt);
    if (state.z > max_z) {
      max_z = state.z;
    }
    if (i > 0 && state.grounded) {
      break;
    }
  }

  CHECK(max_z == doctest::Approx(0.875));
  CHECK(state.z == doctest::Approx(0.0));
  CHECK(state.vel_z == doctest::Approx(0.0));
  CHECK(state.grounded);
}

TEST_CASE("Shared sim clamps movement to arena bounds") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.move_speed = 0.0;
  config.accel = 0.0;
  config.friction = 0.0;
  config.arena_half_size = 1.0;
  config.player_radius = 0.2;

  afps::sim::PlayerState state{0.6, 0.0, 0.0, 1.0, -2.0};
  const auto input = afps::sim::MakeInput(0.0, 0.0, false, false, false, false, false, false);
  afps::sim::StepPlayer(state, input, config, 1.0);

  CHECK(state.x == doctest::Approx(0.8));
  CHECK(state.y == doctest::Approx(-0.8));
  CHECK(state.vel_x == doctest::Approx(0.0));
  CHECK(state.vel_y == doctest::Approx(0.0));
}

TEST_CASE("Shared sim slides along arena wall and preserves tangential velocity") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.move_speed = 0.0;
  config.accel = 0.0;
  config.friction = 0.0;
  config.arena_half_size = 1.0;
  config.player_radius = 0.2;

  afps::sim::PlayerState state{0.7, 0.0, 0.0, 1.0, 0.5};
  const auto input = afps::sim::MakeInput(0.0, 0.0, false, false, false, false, false, false);
  afps::sim::StepPlayer(state, input, config, 1.0);

  CHECK(state.x == doctest::Approx(0.8));
  CHECK(state.y == doctest::Approx(0.5));
  CHECK(state.vel_x == doctest::Approx(0.0));
  CHECK(state.vel_y == doctest::Approx(0.5));
}

TEST_CASE("Shared sim slides along arena floor and preserves tangential velocity") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.move_speed = 0.0;
  config.accel = 0.0;
  config.friction = 0.0;
  config.arena_half_size = 1.0;
  config.player_radius = 0.2;

  afps::sim::PlayerState state{0.1, -0.7, 0.0, 0.4, -1.0};
  const auto input = afps::sim::MakeInput(0.0, 0.0, false, false, false, false, false, false);
  afps::sim::StepPlayer(state, input, config, 1.0);

  CHECK(state.y == doctest::Approx(-0.8));
  CHECK(state.x == doctest::Approx(0.5));
  CHECK(state.vel_y == doctest::Approx(0.0));
  CHECK(state.vel_x == doctest::Approx(0.4));
}

TEST_CASE("Shared sim dash enforces cooldown and travel distance") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.move_speed = 0.0;
  config.accel = 0.0;
  config.friction = 0.0;
  config.gravity = 0.0;
  config.arena_half_size = 100.0;
  config.player_radius = 0.2;
  config.dash_impulse = 10.0;
  config.dash_cooldown = 0.5;

  afps::sim::PlayerState state{};
  const double dt = 0.1;
  const auto dash = afps::sim::MakeInput(1.0, 0.0, false, false, true, false, false, false);

  afps::sim::StepPlayer(state, dash, config, dt);
  const double first_step = state.x;
  const double dash_velocity = state.vel_x;
  CHECK(first_step == doctest::Approx(config.dash_impulse * dt));
  CHECK(state.dash_cooldown == doctest::Approx(config.dash_cooldown));

  afps::sim::StepPlayer(state, dash, config, dt);
  const double second_step = state.x - first_step;
  CHECK(second_step == doctest::Approx(dash_velocity * dt));
  CHECK(state.vel_x == doctest::Approx(dash_velocity));
  CHECK(state.dash_cooldown < config.dash_cooldown);
}

TEST_CASE("Shared sim grapples to arena wall and releases with cooldown") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.move_speed = 0.0;
  config.accel = 0.0;
  config.friction = 0.0;
  config.gravity = 0.0;
  config.arena_half_size = 5.0;
  config.player_radius = 0.2;
  config.grapple_max_distance = 10.0;
  config.grapple_pull_strength = 20.0;
  config.grapple_damping = 0.0;
  config.grapple_cooldown = 1.0;
  config.grapple_rope_slack = 0.0;

  afps::sim::PlayerState state{};
  const double dt = 1.0 / 60.0;
  const double yaw = 0.5 * 3.14159265358979323846;

  auto attach = afps::sim::MakeInput(0.0, 0.0, false, false, false, true, false, false, yaw, 0.0);
  afps::sim::StepPlayer(state, attach, config, dt);

  CHECK(state.grapple_active);
  CHECK(state.grapple_anchor_x == doctest::Approx(config.arena_half_size));
  CHECK(state.grapple_anchor_y == doctest::Approx(0.0));

  auto release = afps::sim::MakeInput(0.0, 0.0, false, false, false, false, false, false, yaw, 0.0);
  afps::sim::StepPlayer(state, release, config, dt);

  CHECK(!state.grapple_active);
  CHECK(state.grapple_cooldown > 0.0);
}

TEST_CASE("Shared sim grapple pulls toward anchor when stretched") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.move_speed = 0.0;
  config.accel = 0.0;
  config.friction = 0.0;
  config.gravity = 0.0;
  config.arena_half_size = 5.0;
  config.player_radius = 0.2;
  config.grapple_max_distance = 10.0;
  config.grapple_pull_strength = 20.0;
  config.grapple_damping = 0.0;
  config.grapple_rope_slack = 0.0;

  afps::sim::PlayerState state{};
  const double dt = 1.0 / 60.0;
  const double yaw = 0.5 * 3.14159265358979323846;

  auto attach = afps::sim::MakeInput(0.0, 0.0, false, false, false, true, false, false, yaw, 0.0);
  afps::sim::StepPlayer(state, attach, config, dt);

  CHECK(state.grapple_active);

  state.x = -1.0;
  state.vel_x = 0.0;
  state.vel_y = 0.0;
  state.vel_z = 0.0;

  afps::sim::StepPlayer(state, attach, config, dt);

  CHECK(state.vel_x > 0.0);
}

TEST_CASE("Shared sim grapple respects min attach normal on floor hits") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.move_speed = 0.0;
  config.accel = 0.0;
  config.friction = 0.0;
  config.gravity = 0.0;
  config.arena_half_size = 5.0;
  config.player_radius = 0.2;
  config.grapple_max_distance = 10.0;
  config.grapple_pull_strength = 20.0;
  config.grapple_damping = 0.0;
  config.grapple_rope_slack = 0.0;

  const double dt = 1.0 / 60.0;
  const double pitch = -0.5 * 3.14159265358979323846;

  afps::sim::PlayerState allowed{};
  config.grapple_min_attach_normal_y = 0.5;
  auto attach = afps::sim::MakeInput(0.0, 0.0, false, false, false, true, false, false, 0.0, pitch);
  afps::sim::StepPlayer(allowed, attach, config, dt);
  allowed.z = 1.0;
  allowed.vel_z = 0.0;
  allowed.grounded = false;
  afps::sim::StepPlayer(allowed, attach, config, dt);
  CHECK(allowed.vel_z < 0.0);

  afps::sim::PlayerState blocked{};
  config.grapple_min_attach_normal_y = 1.1;
  afps::sim::StepPlayer(blocked, attach, config, dt);
  blocked.z = 1.0;
  blocked.vel_z = 0.0;
  blocked.grounded = false;
  afps::sim::StepPlayer(blocked, attach, config, dt);
  CHECK(blocked.vel_z == doctest::Approx(0.0));
}

TEST_CASE("Shared sim shield activates and triggers cooldown") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.move_speed = 0.0;
  config.accel = 0.0;
  config.friction = 0.0;
  config.gravity = 0.0;
  config.shield_duration = 0.2;
  config.shield_cooldown = 0.5;

  afps::sim::PlayerState state{};
  const double dt = 0.1;
  const auto press = afps::sim::MakeInput(0.0, 0.0, false, false, false, false, true, false);
  const auto release = afps::sim::MakeInput(0.0, 0.0, false, false, false, false, false, false);

  afps::sim::StepPlayer(state, press, config, dt);
  CHECK(state.shield_active);
  CHECK(state.shield_timer == doctest::Approx(0.1));
  CHECK(state.shield_cooldown == doctest::Approx(0.0));

  afps::sim::StepPlayer(state, release, config, dt);
  CHECK_FALSE(state.shield_active);
  CHECK(state.shield_timer == doctest::Approx(0.0));
  CHECK(state.shield_cooldown == doctest::Approx(0.5));

  afps::sim::StepPlayer(state, press, config, dt);
  CHECK_FALSE(state.shield_active);
  CHECK(state.shield_cooldown == doctest::Approx(0.4));
}

TEST_CASE("Shared sim shockwave triggers cooldown on press") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.move_speed = 0.0;
  config.accel = 0.0;
  config.friction = 0.0;
  config.gravity = 0.0;
  config.shockwave_radius = 5.0;
  config.shockwave_impulse = 12.0;
  config.shockwave_cooldown = 1.0;
  config.shockwave_damage = 0.0;

  afps::sim::PlayerState state{};
  const double dt = 0.1;
  const auto press = afps::sim::MakeInput(0.0, 0.0, false, false, false, false, false, true);

  afps::sim::StepPlayer(state, press, config, dt);
  CHECK(state.shockwave_triggered);
  CHECK(state.shockwave_cooldown == doctest::Approx(1.0));

  afps::sim::StepPlayer(state, press, config, dt);
  CHECK_FALSE(state.shockwave_triggered);
  CHECK(state.shockwave_cooldown == doctest::Approx(0.9));
}

TEST_CASE("Shared sim resolves obstacle collisions and preserves tangential velocity") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.move_speed = 0.0;
  config.accel = 0.0;
  config.friction = 0.0;
  config.obstacle_min_x = -0.5;
  config.obstacle_max_x = 0.5;
  config.obstacle_min_y = -0.25;
  config.obstacle_max_y = 0.25;
  config.player_radius = 0.1;

  afps::sim::PlayerState state{0.55, 0.0, 0.0, 0.02, 0.05};
  const auto input = afps::sim::MakeInput(0.0, 0.0, false, false, false, false, false, false);
  afps::sim::StepPlayer(state, input, config, 1.0);

  CHECK(state.x == doctest::Approx(0.6));
  CHECK(state.y == doctest::Approx(0.05));
  CHECK(state.vel_x == doctest::Approx(0.0));
  CHECK(state.vel_y == doctest::Approx(0.05));
}

TEST_CASE("Shared sim prevents tunneling through obstacle at high speed") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.move_speed = 0.0;
  config.accel = 0.0;
  config.friction = 0.0;
  config.obstacle_min_x = -0.5;
  config.obstacle_max_x = 0.5;
  config.obstacle_min_y = -0.25;
  config.obstacle_max_y = 0.25;
  config.player_radius = 0.1;

  const double expanded_min_x = config.obstacle_min_x - config.player_radius;

  afps::sim::PlayerState state{-2.0, 0.0, 0.0, 6.0, 0.2};
  const auto input = afps::sim::MakeInput(0.0, 0.0, false, false, false, false, false, false);
  afps::sim::StepPlayer(state, input, config, 1.0);

  CHECK(state.x <= expanded_min_x + 1e-6);
  CHECK(state.y > 0.0);
}

TEST_CASE("Shared sim prevents tunneling through obstacle under randomized traversal") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.move_speed = 0.0;
  config.accel = 0.0;
  config.friction = 0.0;
  config.obstacle_min_x = -0.5;
  config.obstacle_max_x = 0.5;
  config.obstacle_min_y = -0.25;
  config.obstacle_max_y = 0.25;
  config.player_radius = 0.1;

  const double expanded_min_x = config.obstacle_min_x - config.player_radius;
  const double min_y = config.obstacle_min_y - config.player_radius;
  const double max_y = config.obstacle_max_y + config.player_radius;

  uint32_t seed = 0x91e10da5u;
  const auto next_u32 = [&seed]() {
    seed = seed * 1664525u + 1013904223u;
    return seed;
  };
  const auto next_unit = [&]() { return (next_u32() & 0xffffu) / 65535.0; };

  for (int i = 0; i < 200; ++i) {
    const double start_y = min_y + (max_y - min_y) * next_unit();
    const double vel_x = 2.0 + 10.0 * next_unit();
    afps::sim::PlayerState state{-2.0, start_y, 0.0, vel_x, 0.0};
    const auto input = afps::sim::MakeInput(0.0, 0.0, false, false, false, false, false, false);
    afps::sim::StepPlayer(state, input, config, 1.0);

    CHECK(state.x <= expanded_min_x + 1e-6);
  }
}

TEST_CASE("Shared sim skips obstacle sweep when segment is too short to reach") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.move_speed = 0.0;
  config.accel = 0.0;
  config.friction = 0.0;
  config.obstacle_min_x = -0.5;
  config.obstacle_max_x = 0.5;
  config.obstacle_min_y = -0.25;
  config.obstacle_max_y = 0.25;
  config.player_radius = 0.1;

  afps::sim::PlayerState state{2.0, 0.0, 0.0, -0.1, 0.0};
  const auto input = afps::sim::MakeInput(0.0, 0.0, false, false, false, false, false, false);
  afps::sim::StepPlayer(state, input, config, 1.0);

  CHECK(state.x == doctest::Approx(1.9));
  CHECK(state.y == doctest::Approx(0.0));
  CHECK(state.vel_x == doctest::Approx(-0.1));
}

TEST_CASE("Shared sim remains finite and inside bounds under random inputs") {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.arena_half_size = 1.0;
  config.player_radius = 0.2;

  const double min_bound = -config.arena_half_size + config.player_radius;
  const double max_bound = config.arena_half_size - config.player_radius;
  afps::sim::PlayerState state{0.0, 0.0};
  const double dt = 1.0 / 60.0;

  uint32_t seed = 0x1234abcd;
  const auto next_u32 = [&seed]() {
    seed = seed * 1664525u + 1013904223u;
    return seed;
  };
  const auto next_axis = [&]() {
    const double value = static_cast<int32_t>(next_u32()) / static_cast<double>(std::numeric_limits<int32_t>::max());
    return std::max(-1.0, std::min(1.0, value));
  };

  for (int i = 0; i < 500; ++i) {
    const auto input =
        afps::sim::MakeInput(next_axis(), next_axis(), (next_u32() & 1u) == 1u, (next_u32() & 2u) == 2u,
                             (next_u32() & 4u) == 4u, (next_u32() & 8u) == 8u,
                             (next_u32() & 16u) == 16u, (next_u32() & 32u) == 32u);
    afps::sim::StepPlayer(state, input, config, dt);

    CHECK(std::isfinite(state.x));
    CHECK(std::isfinite(state.y));
    CHECK(std::isfinite(state.vel_x));
    CHECK(std::isfinite(state.vel_y));
    CHECK(state.x >= doctest::Approx(min_bound).epsilon(1e-6));
    CHECK(state.x <= doctest::Approx(max_bound).epsilon(1e-6));
    CHECK(state.y >= doctest::Approx(min_bound).epsilon(1e-6));
    CHECK(state.y <= doctest::Approx(max_bound).epsilon(1e-6));
  }
}
