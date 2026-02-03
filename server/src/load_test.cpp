#include <chrono>
#include <iostream>
#include <random>
#include <string>
#include <vector>

#include "sim/sim.h"

namespace {
int ParseInt(const char *value, int fallback) {
  if (!value) {
    return fallback;
  }
  try {
    return std::stoi(value);
  } catch (...) {
    return fallback;
  }
}
}

int main(int argc, char **argv) {
  int clients = 32;
  int ticks = 600;
  unsigned int seed = 1337;
  for (int i = 1; i < argc; ++i) {
    const std::string arg = argv[i];
    if (arg == "--clients" && i + 1 < argc) {
      clients = ParseInt(argv[++i], clients);
    } else if (arg == "--ticks" && i + 1 < argc) {
      ticks = ParseInt(argv[++i], ticks);
    } else if (arg == "--seed" && i + 1 < argc) {
      seed = static_cast<unsigned int>(ParseInt(argv[++i], seed));
    }
  }

  if (clients <= 0 || ticks <= 0) {
    std::cerr << "Invalid clients/ticks\n";
    return 1;
  }

  std::vector<afps::sim::PlayerState> players(static_cast<size_t>(clients));
  const auto config = afps::sim::kDefaultSimConfig;
  const double dt = 1.0 / 60.0;

  std::mt19937 rng(seed);
  std::uniform_real_distribution<double> axis(-1.0, 1.0);
  std::bernoulli_distribution toggle(0.05);

  auto start = std::chrono::steady_clock::now();
  for (int tick = 0; tick < ticks; ++tick) {
    for (auto &state : players) {
      const auto input = afps::sim::MakeInput(
          axis(rng), axis(rng),
          toggle(rng),
          toggle(rng),
          toggle(rng),
          toggle(rng),
          toggle(rng),
          toggle(rng),
          axis(rng) * 3.14159265358979323846,
          axis(rng) * 0.5);
      afps::sim::StepPlayer(state, input, config, dt);
    }
  }
  auto end = std::chrono::steady_clock::now();
  const auto elapsed = std::chrono::duration_cast<std::chrono::duration<double>>(end - start);
  const double total_steps = static_cast<double>(clients) * static_cast<double>(ticks);
  const double steps_per_sec = elapsed.count() > 0 ? total_steps / elapsed.count() : 0.0;

  std::cout << "load_test clients=" << clients << " ticks=" << ticks
            << " seconds=" << elapsed.count()
            << " steps_per_sec=" << steps_per_sec << "\n";
  return 0;
}
