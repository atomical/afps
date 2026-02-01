#include "tick.h"

#include <algorithm>
#include <cmath>
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

#include <chrono>
#include <iostream>

namespace {
constexpr double kPi = 3.14159265358979323846;
constexpr double kProjectileTtlSeconds = 3.0;
constexpr double kProjectileRadius = 0.15;

afps::sim::PlayerState MakeSpawnState(const std::string &connection_id, const afps::sim::SimConfig &config) {
  afps::sim::PlayerState state;
  const double half =
      (std::isfinite(config.arena_half_size) && config.arena_half_size > 0.0) ? config.arena_half_size : 10.0;
  const double radius = std::max(0.0, std::min(half * 0.5, half - config.player_radius));
  const size_t hash = std::hash<std::string>{}(connection_id);
  const double angle = static_cast<double>(hash % 360) * (kPi / 180.0);
  state.x = std::cos(angle) * radius;
  state.y = std::sin(angle) * radius;
  state.z = 0.0;
  state.vel_x = 0.0;
  state.vel_y = 0.0;
  state.vel_z = 0.0;
  state.grounded = true;
  state.dash_cooldown = 0.0;
  return state;
}
}  // namespace

TickLoop::TickLoop(SignalingStore &store, int tick_rate, int snapshot_keyframe_interval)
    : store_(store),
      accumulator_(tick_rate),
      snapshot_keyframe_interval_(snapshot_keyframe_interval) {
  pose_history_limit_ = std::max(1, accumulator_.tick_rate() * 2);
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
  prune(fire_cooldowns_);
  prune(pose_histories_);
  prune(combat_states_);

  struct FireEvent {
    std::string connection_id;
    int input_seq = -1;
    double view_yaw = 0.0;
    double view_pitch = 0.0;
    int weapon_slot = 0;
  };
  std::vector<FireEvent> fire_events;

  for (const auto &connection_id : active_ids) {
    if (combat_states_.find(connection_id) == combat_states_.end()) {
      combat_states_[connection_id] = afps::combat::CreateCombatState();
      players_[connection_id] = MakeSpawnState(connection_id, sim_config_);
    } else if (players_.find(connection_id) == players_.end()) {
      players_[connection_id] = MakeSpawnState(connection_id, sim_config_);
    }
  }

  auto batches = store_.DrainAllInputs();
  for (const auto &batch : batches) {
    ++batch_count_;
    input_count_ += batch.inputs.size();
    int max_seq = -1;
    const InputCmd *last_fire = nullptr;
    for (const auto &cmd : batch.inputs) {
      max_seq = std::max(max_seq, cmd.input_seq);
      if (cmd.fire) {
        last_fire = &cmd;
      }
    }
    if (max_seq >= 0) {
      last_input_seq_[batch.connection_id] = max_seq;
      last_input_server_tick_[batch.connection_id] = server_tick_;
      last_inputs_[batch.connection_id] = batch.inputs.back();
    }
    if (last_fire) {
      fire_events.push_back(
          {batch.connection_id, last_fire->input_seq, last_fire->view_yaw, last_fire->view_pitch,
           last_fire->weapon_slot});
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
      const auto sim_input = afps::sim::MakeInput(input.move_x, input.move_y, input.sprint, input.jump, input.dash);
      afps::sim::StepPlayer(state, sim_input, sim_config_, dt);
    } else {
      state.vel_x = 0.0;
      state.vel_y = 0.0;
      state.vel_z = 0.0;
      state.dash_cooldown = 0.0;
    }
    if (afps::combat::UpdateRespawn(combat_state, dt)) {
      state = MakeSpawnState(connection_id, sim_config_);
    }
  }

  for (auto &entry : fire_cooldowns_) {
    if (entry.second > 0.0) {
      entry.second = std::max(0.0, entry.second - dt);
    }
  }

  for (const auto &connection_id : active_ids) {
    auto &history = pose_histories_[connection_id];
    if (history.size() == 0) {
      history.SetMaxSamples(static_cast<size_t>(pose_history_limit_));
    }
    history.Push(server_tick_, players_[connection_id]);
  }

  auto resolve_weapon_slot = [](int slot) -> size_t {
    const size_t max_index = afps::weapons::kDefaultWeaponDefs.size() == 0
                                 ? 0
                                 : (afps::weapons::kDefaultWeaponDefs.size() - 1);
    if (slot < 0) {
      return 0;
    }
    const size_t index = static_cast<size_t>(slot);
    return std::min(index, max_index);
  };

  for (const auto &event : fire_events) {
    const auto &weapon = afps::weapons::kDefaultWeaponDefs[resolve_weapon_slot(event.weapon_slot)];
    const double weapon_cooldown =
        (weapon.fire_rate > 0.0 && std::isfinite(weapon.fire_rate)) ? (1.0 / weapon.fire_rate) : 0.0;
    if (weapon_cooldown <= 0.0) {
      continue;
    }
    auto shooter_iter = combat_states_.find(event.connection_id);
    if (shooter_iter == combat_states_.end() || !shooter_iter->second.alive) {
      continue;
    }
    auto &cooldown = fire_cooldowns_[event.connection_id];
    if (cooldown > 0.0) {
      continue;
    }
    int estimated_tick = server_tick_;
    auto seq_iter = last_input_seq_.find(event.connection_id);
    auto tick_iter = last_input_server_tick_.find(event.connection_id);
    if (seq_iter != last_input_seq_.end() && tick_iter != last_input_server_tick_.end()) {
      int delta = seq_iter->second - event.input_seq;
      if (delta < 0) {
        delta = 0;
      }
      estimated_tick = tick_iter->second - delta;
    }
    if (pose_history_limit_ > 0) {
      const int min_tick = server_tick_ - pose_history_limit_ + 1;
      estimated_tick = std::max(min_tick, std::min(server_tick_, estimated_tick));
    }

    if (weapon.kind == afps::weapons::WeaponKind::kHitscan) {
      const auto result = afps::combat::ResolveHitscan(
          event.connection_id, pose_histories_, estimated_tick, {event.view_yaw, event.view_pitch}, sim_config_,
          weapon.range);
      if (result.hit) {
        auto target_iter = combat_states_.find(result.target_id);
        bool killed = false;
        if (target_iter != combat_states_.end()) {
          killed = afps::combat::ApplyDamage(target_iter->second, &shooter_iter->second, weapon.damage);
          if (killed) {
            auto &target_state = players_[result.target_id];
            target_state.vel_x = 0.0;
            target_state.vel_y = 0.0;
            target_state.vel_z = 0.0;
            target_state.dash_cooldown = 0.0;
          }
        }
        GameEvent hit_event;
        hit_event.event = "HitConfirmed";
        hit_event.target_id = result.target_id;
        hit_event.damage = weapon.damage;
        hit_event.killed = killed;
        store_.SendUnreliable(event.connection_id, BuildGameEvent(hit_event));
        std::cout << "[shot] shooter=" << event.connection_id << " target=" << result.target_id
                  << " dist=" << result.distance << " tick=" << estimated_tick << "\n";
      }
    } else if (weapon.kind == afps::weapons::WeaponKind::kProjectile) {
      auto state_iter = players_.find(event.connection_id);
      if (state_iter != players_.end() && weapon.projectile_speed > 0.0 &&
          std::isfinite(weapon.projectile_speed)) {
        const auto view = afps::combat::SanitizeViewAngles(event.view_yaw, event.view_pitch);
        const auto dir = afps::combat::ViewDirection(view);
        if (std::isfinite(dir.x) && std::isfinite(dir.y) && std::isfinite(dir.z)) {
          afps::combat::ProjectileState projectile;
          projectile.id = next_projectile_id_++;
          projectile.owner_id = event.connection_id;
          projectile.position = {state_iter->second.x, state_iter->second.y,
                                 state_iter->second.z + afps::combat::kPlayerEyeHeight};
          projectile.velocity = {dir.x * weapon.projectile_speed, dir.y * weapon.projectile_speed,
                                 dir.z * weapon.projectile_speed};
          projectile.ttl = kProjectileTtlSeconds;
          projectile.radius = kProjectileRadius;
          projectile.damage = weapon.damage;
          projectile.explosion_radius =
              (weapon.explosion_radius > 0.0 && std::isfinite(weapon.explosion_radius))
                  ? weapon.explosion_radius
                  : 0.0;
          projectiles_.push_back(projectile);
          GameEvent spawn_event;
          spawn_event.event = "ProjectileSpawn";
          spawn_event.owner_id = event.connection_id;
          spawn_event.projectile_id = projectile.id;
          spawn_event.pos_x = projectile.position.x;
          spawn_event.pos_y = projectile.position.y;
          spawn_event.pos_z = projectile.position.z;
          spawn_event.vel_x = projectile.velocity.x;
          spawn_event.vel_y = projectile.velocity.y;
          spawn_event.vel_z = projectile.velocity.z;
          spawn_event.ttl = projectile.ttl;
          for (const auto &connection_id : active_ids) {
            store_.SendUnreliable(connection_id, BuildGameEvent(spawn_event));
          }
        }
      }
    }
    cooldown = weapon_cooldown;
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
        continue;
      }
      projectile.ttl = std::max(0.0, projectile.ttl - dt);
      if (projectile.ttl <= 0.0) {
        continue;
      }
      const afps::combat::Vec3 delta{projectile.velocity.x * dt, projectile.velocity.y * dt,
                                     projectile.velocity.z * dt};
      const auto impact = afps::combat::ResolveProjectileImpact(
          projectile, delta, sim_config_, alive_players, projectile.owner_id);
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
          const bool killed = afps::combat::ApplyDamage(target_iter->second, attacker, hit.damage);
          GameEvent hit_event;
          hit_event.event = "HitConfirmed";
          hit_event.target_id = hit.target_id;
          hit_event.damage = hit.damage;
          hit_event.killed = killed;
          store_.SendUnreliable(projectile.owner_id, BuildGameEvent(hit_event));
          if (killed) {
            auto &target_state = players_[hit.target_id];
            target_state.vel_x = 0.0;
            target_state.vel_y = 0.0;
            target_state.vel_z = 0.0;
            target_state.dash_cooldown = 0.0;
            alive_players.erase(hit.target_id);
          }
        }
        GameEvent remove_event;
        remove_event.event = "ProjectileRemove";
        remove_event.owner_id = projectile.owner_id;
        remove_event.projectile_id = projectile.id;
        for (const auto &connection_id : active_ids) {
          store_.SendUnreliable(connection_id, BuildGameEvent(remove_event));
        }
        std::cout << "[projectile] owner=" << projectile.owner_id << " hits=" << hits.size() << "\n";
        continue;
      }
      projectile.position.x += delta.x;
      projectile.position.y += delta.y;
      projectile.position.z += delta.z;
      next_projectiles.push_back(projectile);
    }
    projectiles_.swap(next_projectiles);
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
      auto combat_iter = combat_states_.find(connection_id);
      if (combat_iter != combat_states_.end()) {
        snapshot.health = combat_iter->second.health;
        snapshot.kills = combat_iter->second.kills;
        snapshot.deaths = combat_iter->second.deaths;
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

      if (store_.SendUnreliable(connection_id, BuildStateSnapshotDelta(delta))) {
        snapshot_count_ += 1;
        sequence += 1;
      }
    }
  }
}
#endif
