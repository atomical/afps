#pragma once

#include <algorithm>
#include <cmath>

namespace afps::sim {

struct SimConfig {
  double move_speed;
  double sprint_multiplier;
};

struct SimInput {
  double move_x = 0.0;
  double move_y = 0.0;
  bool sprint = false;
};

struct PlayerState {
  double x = 0.0;
  double y = 0.0;
};

inline constexpr SimConfig kDefaultSimConfig{5.0, 1.5};
// Keep defaults in sync with shared/sim/config.json.

inline double ClampAxis(double value) {
  if (!std::isfinite(value)) {
    return 0.0;
  }
  return std::max(-1.0, std::min(1.0, value));
}

inline SimInput MakeInput(double move_x, double move_y, bool sprint) {
  return {ClampAxis(move_x), ClampAxis(move_y), sprint};
}

inline void StepPlayer(PlayerState &state, const SimInput &input, const SimConfig &config, double dt) {
  if (!std::isfinite(dt) || dt <= 0.0) {
    return;
  }
  double speed = config.move_speed;
  if (input.sprint) {
    speed *= config.sprint_multiplier;
  }
  state.x += input.move_x * speed * dt;
  state.y += input.move_y * speed * dt;
}

}  // namespace afps::sim
