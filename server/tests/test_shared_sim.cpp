#include "doctest.h"

#include <fstream>

#include <nlohmann/json.hpp>

#include "sim/sim.h"

TEST_CASE("Shared sim step advances deterministically") {
  afps::sim::PlayerState state{0.0, 0.0};
  const auto input = afps::sim::MakeInput(1.0, 0.0, false);
  afps::sim::StepPlayer(state, input, afps::sim::kDefaultSimConfig, 1.0 / 60.0);

  CHECK(state.x == doctest::Approx(afps::sim::kDefaultSimConfig.move_speed / 60.0));
  CHECK(state.y == doctest::Approx(0.0));
}

TEST_CASE("Shared sim config JSON matches defaults") {
  std::ifstream file("../../shared/sim/config.json");
  REQUIRE(file.is_open());

  nlohmann::json payload;
  file >> payload;

  REQUIRE(payload.contains("moveSpeed"));
  REQUIRE(payload.contains("sprintMultiplier"));

  const double move_speed = payload.at("moveSpeed").get<double>();
  const double sprint_multiplier = payload.at("sprintMultiplier").get<double>();

  CHECK(move_speed == doctest::Approx(afps::sim::kDefaultSimConfig.move_speed));
  CHECK(sprint_multiplier == doctest::Approx(afps::sim::kDefaultSimConfig.sprint_multiplier));
}

TEST_CASE("Shared sim golden input script") {
  afps::sim::PlayerState state{0.0, 0.0};
  const double dt = 1.0 / 60.0;

  for (int i = 0; i < 10; ++i) {
    const auto input = afps::sim::MakeInput(1.0, 0.0, false);
    afps::sim::StepPlayer(state, input, afps::sim::kDefaultSimConfig, dt);
  }

  for (int i = 0; i < 5; ++i) {
    const auto input = afps::sim::MakeInput(1.0, 0.0, true);
    afps::sim::StepPlayer(state, input, afps::sim::kDefaultSimConfig, dt);
  }

  for (int i = 0; i < 10; ++i) {
    const auto input = afps::sim::MakeInput(0.0, -1.0, false);
    afps::sim::StepPlayer(state, input, afps::sim::kDefaultSimConfig, dt);
  }

  CHECK(state.x == doctest::Approx(35.0 / 24.0));
  CHECK(state.y == doctest::Approx(-5.0 / 6.0));
}
