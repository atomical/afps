#include "tick.h"

#include <algorithm>
#include <unordered_set>

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

#include <chrono>
#include <iostream>

TickLoop::TickLoop(SignalingStore &store, int tick_rate, int snapshot_keyframe_interval)
    : store_(store),
      accumulator_(tick_rate),
      snapshot_keyframe_interval_(snapshot_keyframe_interval) {}

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
  prune(last_full_snapshots_);
  prune(snapshot_sequence_);

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
      last_inputs_[batch.connection_id] = batch.inputs.back();
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
    const auto sim_input = afps::sim::MakeInput(input.move_x, input.move_y, input.sprint, input.jump, input.dash);
    afps::sim::StepPlayer(state, sim_input, sim_config_, dt);
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
      auto baseline_iter = last_full_snapshots_.find(connection_id);
      int &sequence = snapshot_sequence_[connection_id];
      const bool needs_full = (baseline_iter == last_full_snapshots_.end()) ||
                              (snapshot_keyframe_interval_ <= 0) ||
                              (sequence % snapshot_keyframe_interval_ == 0);

      if (needs_full) {
        if (store_.SendUnreliable(connection_id, BuildStateSnapshot(snapshot))) {
          snapshot_count_ += 1;
          last_full_snapshots_[connection_id] = snapshot;
          sequence += 1;
        }
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
      if (snapshot.dash_cooldown != baseline.dash_cooldown) {
        delta.mask |= kSnapshotMaskDashCooldown;
        delta.dash_cooldown = snapshot.dash_cooldown;
      }

      if (store_.SendUnreliable(connection_id, BuildStateSnapshotDelta(delta))) {
        snapshot_count_ += 1;
        sequence += 1;
      }
    }
  }
}
#endif
