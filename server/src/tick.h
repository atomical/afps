#pragma once

#include <chrono>

class TickAccumulator {
public:
  using Clock = std::chrono::steady_clock;

  explicit TickAccumulator(int tick_rate);

  int Advance(Clock::time_point now);
  int tick_rate() const;
  Clock::duration tick_duration() const;
  Clock::time_point next_tick_time() const;
  bool initialized() const;

private:
  int tick_rate_ = 1;
  Clock::duration tick_duration_{};
  Clock::time_point next_tick_time_{};
  bool initialized_ = false;
};

#ifdef AFPS_ENABLE_WEBRTC
#include <atomic>
#include <cstddef>
#include <string>
#include <thread>
#include <unordered_map>

#include "signaling.h"
#include "sim/sim.h"

class TickLoop {
public:
  TickLoop(SignalingStore &store, int tick_rate);
  ~TickLoop();

  void Start();
  void Stop();

private:
  void Run();
  void Step();

  SignalingStore &store_;
  TickAccumulator accumulator_;
  std::atomic<bool> running_{false};
  std::thread thread_;
  std::unordered_map<std::string, InputCmd> last_inputs_;
  std::unordered_map<std::string, afps::sim::PlayerState> players_;
  std::unordered_map<std::string, int> last_input_seq_;
  afps::sim::SimConfig sim_config_ = afps::sim::kDefaultSimConfig;
  int server_tick_ = 0;
  double snapshot_accumulator_ = 0.0;
  size_t batch_count_ = 0;
  size_t input_count_ = 0;
  size_t snapshot_count_ = 0;
  size_t tick_count_ = 0;
  TickAccumulator::Clock::time_point last_log_time_{};
};
#endif
