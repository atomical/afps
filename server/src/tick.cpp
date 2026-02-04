#include "tick.h"

#include <algorithm>
#include <cmath>
#include <random>
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
#include "weapon_config.h"

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
  std::string weapon_error;
  weapon_config_ = afps::weapons::LoadWeaponConfig(afps::weapons::ResolveWeaponConfigPath(),
                                                   weapon_error);
  if (!weapon_error.empty()) {
    std::cerr << "[warn] " << weapon_error << "\n";
  }
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
  prune(weapon_states_);
  prune(pose_histories_);
  prune(combat_states_);

  struct FireEvent {
    std::string connection_id;
    FireWeaponRequest request;
  };
  std::vector<FireEvent> fire_events;
  struct ShockwaveEvent {
    std::string connection_id;
    afps::combat::Vec3 origin{};
  };
  std::vector<ShockwaveEvent> shockwave_events;

  auto resolve_view = [&](const std::string &connection_id) {
    auto input_iter = last_inputs_.find(connection_id);
    if (input_iter == last_inputs_.end()) {
      return afps::combat::SanitizeViewAngles(0.0, 0.0);
    }
    return afps::combat::SanitizeViewAngles(input_iter->second.view_yaw, input_iter->second.view_pitch);
  };

  auto resolve_shield_facing = [&](const std::string &target_id,
                                   const afps::combat::Vec3 &source_pos) {
    auto state_iter = players_.find(target_id);
    if (state_iter == players_.end()) {
      return false;
    }
    const auto view = resolve_view(target_id);
    const afps::combat::Vec3 target_pos{state_iter->second.x,
                                        state_iter->second.y,
                                        state_iter->second.z + (afps::combat::kPlayerHeight * 0.5)};
    return afps::combat::IsShieldFacing(target_pos, view, source_pos);
  };

  const size_t slot_count = weapon_config_.slots.empty() ? 1 : weapon_config_.slots.size();
  auto init_weapon_state = [&](PlayerWeaponState &state) {
    state.slots.clear();
    state.slots.resize(slot_count);
    for (size_t i = 0; i < slot_count; ++i) {
      const auto *weapon = afps::weapons::ResolveWeaponSlot(weapon_config_, static_cast<int>(i));
      if (weapon) {
        state.slots[i].ammo_in_mag = weapon->max_ammo_in_mag;
      } else {
        state.slots[i].ammo_in_mag = 0;
      }
      state.slots[i].cooldown = 0.0;
      state.slots[i].reload_timer = 0.0;
    }
    state.shot_seq = 0;
  };

  for (const auto &connection_id : active_ids) {
    if (combat_states_.find(connection_id) == combat_states_.end()) {
      combat_states_[connection_id] = afps::combat::CreateCombatState();
      players_[connection_id] = MakeSpawnState(connection_id, sim_config_);
    } else if (players_.find(connection_id) == players_.end()) {
      players_[connection_id] = MakeSpawnState(connection_id, sim_config_);
    }
    auto weapon_iter = weapon_states_.find(connection_id);
    if (weapon_iter == weapon_states_.end()) {
      PlayerWeaponState state;
      init_weapon_state(state);
      weapon_states_[connection_id] = std::move(state);
    } else if (weapon_iter->second.slots.size() != slot_count) {
      init_weapon_state(weapon_iter->second);
    }
  }

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
      last_input_server_tick_[batch.connection_id] = server_tick_;
      last_inputs_[batch.connection_id] = batch.inputs.back();
    }
  }

  auto fire_batches = store_.DrainAllFireRequests();
  for (const auto &batch : fire_batches) {
    for (const auto &request : batch.requests) {
      fire_events.push_back({batch.connection_id, request});
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
      const auto sim_input = afps::sim::MakeInput(input.move_x, input.move_y, input.sprint, input.jump, input.dash,
                                                  input.grapple, input.shield, input.shockwave, input.view_yaw,
                                                  input.view_pitch);
      afps::sim::StepPlayer(state, sim_input, sim_config_, dt);
      if (state.shockwave_triggered) {
        shockwave_events.push_back({connection_id,
                                    {state.x, state.y, state.z + (afps::combat::kPlayerHeight * 0.5)}});
      }
    } else {
      state.vel_x = 0.0;
      state.vel_y = 0.0;
      state.vel_z = 0.0;
      state.dash_cooldown = 0.0;
      state.grapple_cooldown = 0.0;
      state.grapple_active = false;
      state.grapple_input = false;
      state.grapple_length = 0.0;
      state.grapple_anchor_x = 0.0;
      state.grapple_anchor_y = 0.0;
      state.grapple_anchor_z = 0.0;
      state.grapple_anchor_nx = 0.0;
      state.grapple_anchor_ny = 0.0;
      state.grapple_anchor_nz = 0.0;
      state.shield_timer = 0.0;
      state.shield_cooldown = 0.0;
      state.shield_active = false;
      state.shield_input = false;
      state.shockwave_cooldown = 0.0;
      state.shockwave_input = false;
      state.shockwave_triggered = false;
    }
    if (afps::combat::UpdateRespawn(combat_state, dt)) {
      state = MakeSpawnState(connection_id, sim_config_);
      auto weapon_iter = weapon_states_.find(connection_id);
      if (weapon_iter != weapon_states_.end()) {
        init_weapon_state(weapon_iter->second);
      }
    }
  }

  for (auto &entry : weapon_states_) {
    auto &state = entry.second;
    for (size_t i = 0; i < state.slots.size(); ++i) {
      auto &slot_state = state.slots[i];
      if (slot_state.cooldown > 0.0) {
        slot_state.cooldown = std::max(0.0, slot_state.cooldown - dt);
      }
      if (slot_state.reload_timer > 0.0) {
        slot_state.reload_timer = std::max(0.0, slot_state.reload_timer - dt);
        if (slot_state.reload_timer <= 0.0) {
          const auto *weapon = afps::weapons::ResolveWeaponSlot(weapon_config_, static_cast<int>(i));
          slot_state.ammo_in_mag = weapon ? weapon->max_ammo_in_mag : 0;
        }
      }
    }
  }

  for (const auto &connection_id : active_ids) {
    auto &history = pose_histories_[connection_id];
    if (history.size() == 0) {
      history.SetMaxSamples(static_cast<size_t>(pose_history_limit_));
    }
    history.Push(server_tick_, players_[connection_id]);
  }

  if (!shockwave_events.empty()) {
    std::unordered_map<std::string, afps::sim::PlayerState> alive_players;
    alive_players.reserve(players_.size());
    for (const auto &entry : players_) {
      auto combat_iter = combat_states_.find(entry.first);
      if (combat_iter != combat_states_.end() && combat_iter->second.alive) {
        alive_players.emplace(entry.first, entry.second);
      }
    }
    for (const auto &event : shockwave_events) {
        const auto hits = afps::combat::ComputeShockwaveHits(
            event.origin, sim_config_.shockwave_radius, sim_config_.shockwave_impulse,
            sim_config_.shockwave_damage, sim_config_, alive_players, event.connection_id);
      auto attacker_iter = combat_states_.find(event.connection_id);
      afps::combat::CombatState *attacker =
          attacker_iter == combat_states_.end() ? nullptr : &attacker_iter->second;
      for (const auto &hit : hits) {
        auto target_state_iter = players_.find(hit.target_id);
        auto target_combat_iter = combat_states_.find(hit.target_id);
        if (target_state_iter == players_.end() || target_combat_iter == combat_states_.end()) {
          continue;
        }
        if (!target_combat_iter->second.alive) {
          continue;
        }
        if (std::isfinite(hit.impulse.x)) {
          target_state_iter->second.vel_x += hit.impulse.x;
        }
        if (std::isfinite(hit.impulse.y)) {
          target_state_iter->second.vel_y += hit.impulse.y;
        }
        if (std::isfinite(hit.impulse.z)) {
          target_state_iter->second.vel_z += hit.impulse.z;
        }
        bool killed = false;
        if (hit.damage > 0.0) {
          const bool shield_active = target_state_iter->second.shield_active;
          const bool shield_facing =
              shield_active ? resolve_shield_facing(hit.target_id, event.origin) : true;
          killed = afps::combat::ApplyDamageWithShield(target_combat_iter->second, attacker, hit.damage,
                                                       shield_active && shield_facing,
                                                       sim_config_.shield_damage_multiplier);
          GameEvent hit_event;
          hit_event.event = "HitConfirmed";
          hit_event.target_id = hit.target_id;
          hit_event.damage = hit.damage;
          hit_event.killed = killed;
          store_.SendUnreliable(
              event.connection_id,
              BuildGameEvent(hit_event,
                             store_.NextServerMessageSeq(event.connection_id),
                             store_.LastClientMessageSeq(event.connection_id)));
        }
        if (killed) {
          target_state_iter->second.vel_x = 0.0;
          target_state_iter->second.vel_y = 0.0;
          target_state_iter->second.vel_z = 0.0;
          target_state_iter->second.dash_cooldown = 0.0;
          alive_players.erase(hit.target_id);
        }
      }
    }
  }

  auto resolve_active_slot = [&](const std::string &connection_id, int requested_slot) -> int {
    int slot = requested_slot;
    auto input_iter = last_inputs_.find(connection_id);
    if (input_iter != last_inputs_.end()) {
      slot = input_iter->second.weapon_slot;
    }
    if (slot < 0) {
      slot = 0;
    }
    if (weapon_config_.slots.empty()) {
      return 0;
    }
    const int max_slot = static_cast<int>(weapon_config_.slots.size() - 1);
    return std::min(slot, max_slot);
  };

  auto normalize = [](const afps::combat::Vec3 &value) {
    const double len = std::sqrt(value.x * value.x + value.y * value.y + value.z * value.z);
    if (!std::isfinite(len) || len <= 1e-6) {
      return afps::combat::Vec3{0.0, -1.0, 0.0};
    }
    return afps::combat::Vec3{value.x / len, value.y / len, value.z / len};
  };

  auto cross = [](const afps::combat::Vec3 &a, const afps::combat::Vec3 &b) {
    return afps::combat::Vec3{a.y * b.z - a.z * b.y,
                              a.z * b.x - a.x * b.z,
                              a.x * b.y - a.y * b.x};
  };

  auto transform_local = [](const afps::combat::Vec3 &local,
                            const afps::combat::Vec3 &right,
                            const afps::combat::Vec3 &forward,
                            const afps::combat::Vec3 &up) {
    return afps::combat::Vec3{
        right.x * local.x + forward.x * local.y + up.x * local.z,
        right.y * local.x + forward.y * local.y + up.y * local.z,
        right.z * local.x + forward.z * local.y + up.z * local.z};
  };

  for (const auto &event : fire_events) {
    auto shooter_iter = combat_states_.find(event.connection_id);
    if (shooter_iter == combat_states_.end() || !shooter_iter->second.alive) {
      continue;
    }
    auto state_iter = players_.find(event.connection_id);
    if (state_iter == players_.end()) {
      continue;
    }
    auto weapon_state_iter = weapon_states_.find(event.connection_id);
    if (weapon_state_iter == weapon_states_.end()) {
      continue;
    }
    const int active_slot = resolve_active_slot(event.connection_id, event.request.weapon_slot);
    if (active_slot < 0 || weapon_config_.slots.empty() ||
        static_cast<size_t>(active_slot) >= weapon_state_iter->second.slots.size()) {
      continue;
    }
    const auto *weapon = afps::weapons::ResolveWeaponSlot(weapon_config_, active_slot);
    if (!weapon) {
      continue;
    }
    auto &slot_state = weapon_state_iter->second.slots[active_slot];
    if (slot_state.reload_timer > 0.0) {
      continue;
    }
    if (slot_state.cooldown > 0.0) {
      continue;
    }

    const auto view = resolve_view(event.connection_id);
    const auto dir = afps::combat::ViewDirection(view);
    afps::combat::Vec3 muzzle{state_iter->second.x,
                              state_iter->second.y,
                              state_iter->second.z + afps::combat::kPlayerEyeHeight};
    muzzle.x += dir.x * 0.2;
    muzzle.y += dir.y * 0.2;
    muzzle.z += dir.z * 0.2;

    weapon_state_iter->second.shot_seq += 1;
    const int shot_seq = weapon_state_iter->second.shot_seq;
    const double weapon_cooldown = weapon->cooldown_seconds;

    auto send_weapon_fired = [&](const WeaponFiredEvent &event_data) {
      for (const auto &connection_id : active_ids) {
        store_.SendUnreliable(
            connection_id,
            BuildWeaponFiredEvent(event_data,
                                  store_.NextServerMessageSeq(connection_id),
                                  store_.LastClientMessageSeq(connection_id)));
      }
    };

    if (slot_state.ammo_in_mag <= 0) {
      slot_state.cooldown = weapon_cooldown;
      WeaponFiredEvent fired;
      fired.shooter_id = event.connection_id;
      fired.weapon_id = weapon->id;
      fired.weapon_slot = active_slot;
      fired.server_tick = server_tick_;
      fired.shot_seq = shot_seq;
      fired.muzzle_pos_x = muzzle.x;
      fired.muzzle_pos_y = muzzle.y;
      fired.muzzle_pos_z = muzzle.z;
      fired.dir_x = dir.x;
      fired.dir_y = dir.y;
      fired.dir_z = dir.z;
      fired.dry_fire = true;
      fired.casing_enabled = false;
      send_weapon_fired(fired);

      if (weapon->reload_seconds > 0.0) {
        slot_state.reload_timer = weapon->reload_seconds;
        WeaponReloadEvent reload;
        reload.shooter_id = event.connection_id;
        reload.weapon_id = weapon->id;
        reload.weapon_slot = active_slot;
        reload.server_tick = server_tick_;
        reload.reload_seconds = weapon->reload_seconds;
        for (const auto &connection_id : active_ids) {
          store_.SendUnreliable(
              connection_id,
              BuildWeaponReloadEvent(reload,
                                     store_.NextServerMessageSeq(connection_id),
                                     store_.LastClientMessageSeq(connection_id)));
        }
      }
      continue;
    }

    slot_state.ammo_in_mag = std::max(0, slot_state.ammo_in_mag - 1);
    slot_state.cooldown = weapon_cooldown;

    int estimated_tick = server_tick_;
    auto tick_iter = last_input_server_tick_.find(event.connection_id);
    if (tick_iter != last_input_server_tick_.end()) {
      estimated_tick = tick_iter->second;
    }
    if (pose_history_limit_ > 0) {
      const int min_tick = server_tick_ - pose_history_limit_ + 1;
      estimated_tick = std::max(min_tick, std::min(server_tick_, estimated_tick));
    }

    if (weapon->kind == afps::weapons::WeaponKind::kHitscan) {
      const auto result = afps::combat::ResolveHitscan(
          event.connection_id, pose_histories_, estimated_tick, view, sim_config_, weapon->range);
      if (result.hit) {
        auto target_iter = combat_states_.find(result.target_id);
        bool killed = false;
        if (target_iter != combat_states_.end()) {
          bool shield_active = false;
          bool shield_facing = true;
          auto target_state_iter = players_.find(result.target_id);
          if (target_state_iter != players_.end()) {
            shield_active = target_state_iter->second.shield_active;
          }
          if (shield_active) {
            const afps::combat::Vec3 source{muzzle.x, muzzle.y, muzzle.z};
            shield_facing = resolve_shield_facing(result.target_id, source);
          }
          killed = afps::combat::ApplyDamageWithShield(target_iter->second, &shooter_iter->second, weapon->damage,
                                                       shield_active && shield_facing,
                                                       sim_config_.shield_damage_multiplier);
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
        hit_event.damage = weapon->damage;
        hit_event.killed = killed;
        store_.SendUnreliable(
            event.connection_id,
            BuildGameEvent(hit_event,
                           store_.NextServerMessageSeq(event.connection_id),
                           store_.LastClientMessageSeq(event.connection_id)));
        std::cout << "[shot] shooter=" << event.connection_id << " target=" << result.target_id
                  << " dist=" << result.distance << " tick=" << estimated_tick << "\n";
      }
    } else if (weapon->kind == afps::weapons::WeaponKind::kProjectile) {
      if (weapon->projectile_speed > 0.0 && std::isfinite(weapon->projectile_speed)) {
        afps::combat::ProjectileState projectile;
        projectile.id = next_projectile_id_++;
        projectile.owner_id = event.connection_id;
        projectile.position = {muzzle.x, muzzle.y, muzzle.z};
        projectile.velocity = {dir.x * weapon->projectile_speed, dir.y * weapon->projectile_speed,
                               dir.z * weapon->projectile_speed};
        projectile.ttl = kProjectileTtlSeconds;
        projectile.radius = kProjectileRadius;
        projectile.damage = weapon->damage;
        projectile.explosion_radius =
            (weapon->explosion_radius > 0.0 && std::isfinite(weapon->explosion_radius))
                ? weapon->explosion_radius
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
          store_.SendUnreliable(
              connection_id,
              BuildGameEvent(spawn_event,
                             store_.NextServerMessageSeq(connection_id),
                             store_.LastClientMessageSeq(connection_id)));
        }
      }
    }

    WeaponFiredEvent fired;
    fired.shooter_id = event.connection_id;
    fired.weapon_id = weapon->id;
    fired.weapon_slot = active_slot;
    fired.server_tick = server_tick_;
    fired.shot_seq = shot_seq;
    fired.muzzle_pos_x = muzzle.x;
    fired.muzzle_pos_y = muzzle.y;
    fired.muzzle_pos_z = muzzle.z;
    fired.dir_x = dir.x;
    fired.dir_y = dir.y;
    fired.dir_z = dir.z;
    fired.dry_fire = false;

    if (weapon->eject_shells_while_firing) {
      const uint32_t seed =
          static_cast<uint32_t>(server_tick_) ^
          static_cast<uint32_t>(shot_seq * 2654435761u) ^
          static_cast<uint32_t>(std::hash<std::string>{}(event.connection_id));
      std::mt19937 rng(seed);
      std::uniform_real_distribution<double> dist(0.0, 1.0);
      auto rand_range = [&](double min_value, double max_value) {
        return min_value + (max_value - min_value) * dist(rng);
      };
      const afps::combat::Vec3 forward = normalize(dir);
      afps::combat::Vec3 up{0.0, 0.0, 1.0};
      afps::combat::Vec3 right = cross(forward, up);
      right = normalize(right);
      up = cross(right, forward);
      const auto local_offset = weapon->casing.local_offset;
      const afps::combat::Vec3 world_offset =
          transform_local({local_offset.x, local_offset.y, local_offset.z}, right, forward, up);
      const afps::combat::Vec3 local_vel{
          rand_range(weapon->casing.velocity_min.x, weapon->casing.velocity_max.x),
          rand_range(weapon->casing.velocity_min.y, weapon->casing.velocity_max.y),
          rand_range(weapon->casing.velocity_min.z, weapon->casing.velocity_max.z)};
      const afps::combat::Vec3 local_ang{
          rand_range(weapon->casing.angular_velocity_min.x, weapon->casing.angular_velocity_max.x),
          rand_range(weapon->casing.angular_velocity_min.y, weapon->casing.angular_velocity_max.y),
          rand_range(weapon->casing.angular_velocity_min.z, weapon->casing.angular_velocity_max.z)};
      const afps::combat::Vec3 world_vel = transform_local(local_vel, right, forward, up);
      const afps::combat::Vec3 world_ang = transform_local(local_ang, right, forward, up);

      fired.casing_enabled = true;
      fired.casing_pos_x = muzzle.x + world_offset.x;
      fired.casing_pos_y = muzzle.y + world_offset.y;
      fired.casing_pos_z = muzzle.z + world_offset.z;
      fired.casing_rot_x = weapon->casing.local_rotation.x + view.pitch;
      fired.casing_rot_y = weapon->casing.local_rotation.y;
      fired.casing_rot_z = weapon->casing.local_rotation.z + view.yaw;
      fired.casing_vel_x = world_vel.x;
      fired.casing_vel_y = world_vel.y;
      fired.casing_vel_z = world_vel.z;
      fired.casing_ang_x = world_ang.x;
      fired.casing_ang_y = world_ang.y;
      fired.casing_ang_z = world_ang.z;
      fired.casing_seed = seed;
    } else {
      fired.casing_enabled = false;
    }

    for (const auto &connection_id : active_ids) {
      store_.SendUnreliable(
          connection_id,
          BuildWeaponFiredEvent(fired,
                                store_.NextServerMessageSeq(connection_id),
                                store_.LastClientMessageSeq(connection_id)));
    }

    if (slot_state.ammo_in_mag <= 0 && weapon->reload_seconds > 0.0) {
      slot_state.reload_timer = weapon->reload_seconds;
      WeaponReloadEvent reload;
      reload.shooter_id = event.connection_id;
      reload.weapon_id = weapon->id;
      reload.weapon_slot = active_slot;
      reload.server_tick = server_tick_;
      reload.reload_seconds = weapon->reload_seconds;
      for (const auto &connection_id : active_ids) {
        store_.SendUnreliable(
            connection_id,
            BuildWeaponReloadEvent(reload,
                                   store_.NextServerMessageSeq(connection_id),
                                   store_.LastClientMessageSeq(connection_id)));
      }
    }
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
          bool shield_active = false;
          bool shield_facing = true;
          auto state_iter = players_.find(hit.target_id);
          if (state_iter != players_.end()) {
            shield_active = state_iter->second.shield_active;
          }
          if (shield_active) {
            shield_facing = resolve_shield_facing(hit.target_id, impact.position);
          }
          const bool killed = afps::combat::ApplyDamageWithShield(target_iter->second, attacker, hit.damage,
                                                                  shield_active && shield_facing,
                                                                  sim_config_.shield_damage_multiplier);
          GameEvent hit_event;
          hit_event.event = "HitConfirmed";
          hit_event.target_id = hit.target_id;
          hit_event.damage = hit.damage;
          hit_event.killed = killed;
          store_.SendUnreliable(
              projectile.owner_id,
              BuildGameEvent(hit_event,
                             store_.NextServerMessageSeq(projectile.owner_id),
                             store_.LastClientMessageSeq(projectile.owner_id)));
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
          store_.SendUnreliable(
              connection_id,
              BuildGameEvent(remove_event,
                             store_.NextServerMessageSeq(connection_id),
                             store_.LastClientMessageSeq(connection_id)));
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
      auto input_iter = last_inputs_.find(connection_id);
      snapshot.weapon_slot = (input_iter == last_inputs_.end()) ? 0 : input_iter->second.weapon_slot;
      if (!weapon_config_.slots.empty()) {
        const int max_slot = static_cast<int>(weapon_config_.slots.size() - 1);
        snapshot.weapon_slot = std::min(snapshot.weapon_slot, max_slot);
      }
      auto weapon_state_iter = weapon_states_.find(connection_id);
      if (weapon_state_iter != weapon_states_.end() &&
          snapshot.weapon_slot >= 0 &&
          static_cast<size_t>(snapshot.weapon_slot) < weapon_state_iter->second.slots.size()) {
        snapshot.ammo_in_mag = weapon_state_iter->second.slots[snapshot.weapon_slot].ammo_in_mag;
      }
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
        for (const auto &recipient_id : active_ids) {
          const auto payload =
              BuildStateSnapshot(snapshot,
                                 store_.NextServerMessageSeq(recipient_id),
                                 store_.LastClientMessageSeq(recipient_id));
          if (store_.SendUnreliable(recipient_id, payload)) {
            snapshot_count_ += 1;
          }
        }
        last_full_snapshots_[connection_id] = snapshot;
        sequence += 1;
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
      if (snapshot.weapon_slot != baseline.weapon_slot) {
        delta.mask |= kSnapshotMaskWeaponSlot;
        delta.weapon_slot = snapshot.weapon_slot;
      }
      if (snapshot.ammo_in_mag != baseline.ammo_in_mag) {
        delta.mask |= kSnapshotMaskAmmoInMag;
        delta.ammo_in_mag = snapshot.ammo_in_mag;
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

      for (const auto &recipient_id : active_ids) {
        const auto payload =
            BuildStateSnapshotDelta(delta,
                                    store_.NextServerMessageSeq(recipient_id),
                                    store_.LastClientMessageSeq(recipient_id));
        if (store_.SendUnreliable(recipient_id, payload)) {
          snapshot_count_ += 1;
        }
      }
      sequence += 1;
    }
  }
}
#endif
