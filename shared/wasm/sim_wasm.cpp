#include "sim/sim.h"

#include <cmath>

extern "C" {

struct WasmSimState {
  afps::sim::PlayerState player;
  afps::sim::SimConfig config;
};

WasmSimState *sim_create() {
  return new WasmSimState{afps::sim::PlayerState{0.0, 0.0}, afps::sim::kDefaultSimConfig};
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

void sim_set_config(WasmSimState *state, double move_speed, double sprint_multiplier) {
  if (!state) {
    return;
  }
  if (std::isfinite(move_speed) && move_speed > 0.0) {
    state->config.move_speed = move_speed;
  }
  if (std::isfinite(sprint_multiplier) && sprint_multiplier > 0.0) {
    state->config.sprint_multiplier = sprint_multiplier;
  }
}

void sim_set_state(WasmSimState *state, double x, double y) {
  if (!state) {
    return;
  }
  state->player.x = std::isfinite(x) ? x : 0.0;
  state->player.y = std::isfinite(y) ? y : 0.0;
}

void sim_step(WasmSimState *state, double dt, double move_x, double move_y, int sprint) {
  if (!state) {
    return;
  }
  const auto input = afps::sim::MakeInput(move_x, move_y, sprint != 0);
  afps::sim::StepPlayer(state->player, input, state->config, dt);
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

}  // extern "C"
