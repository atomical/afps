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
#include <vector>

#include "combat.h"
#include "map_world.h"
#include "signaling.h"
#include "sim/sim.h"
#include "weapons/weapon_defs.h"
#include "world_collision_mesh.h"

namespace afps::server {

enum class WorldHitBackendMode : uint8_t {
  Aabb = 0,
  Hybrid = 1,
  MeshOnly = 2,
};

struct WorldHitFallbackPolicyInput {
  WorldHitBackendMode backend_mode = WorldHitBackendMode::MeshOnly;
  bool aabb_hit = false;
  int aabb_collider_id = -1;
  bool mesh_hit = false;
};

bool WorldHitAllowsAabbFallback(const WorldHitFallbackPolicyInput &input);

}  // namespace afps::server

class TickLoop {
public:
  TickLoop(SignalingStore &store,
           int tick_rate,
           int snapshot_keyframe_interval,
           uint32_t map_seed = 0,
           const afps::world::MapWorldOptions &map_options = {});
  ~TickLoop();

  void Start();
  void Stop();

private:
  struct WeaponSlotState {
    int ammo_in_mag = 0;
    double cooldown = 0.0;
    double reload_timer = 0.0;
    double heat = 0.0;
    double overheat_timer = 0.0;
  };

  struct PlayerWeaponState {
    std::vector<WeaponSlotState> slots;
    int shot_seq = 0;
  };

  struct PickupState {
    afps::world::PickupSpawn definition{};
    bool active = true;
    int respawn_tick = -1;
  };

  void Run();
  void Step();

  SignalingStore &store_;
  TickAccumulator accumulator_;
  std::atomic<bool> running_{false};
  std::thread thread_;
  std::unordered_map<std::string, InputCmd> last_inputs_;
  std::unordered_map<std::string, afps::sim::PlayerState> players_;
  std::unordered_map<std::string, int> last_input_seq_;
  std::unordered_map<std::string, int> last_input_server_tick_;
  std::unordered_map<std::string, StateSnapshot> last_full_snapshots_;
  std::unordered_map<std::string, int> snapshot_sequence_;
  std::unordered_map<std::string, PlayerWeaponState> weapon_states_;
  std::unordered_map<std::string, uint32_t> loadout_bits_;
  std::unordered_map<std::string, afps::combat::PoseHistory> pose_histories_;
  std::unordered_map<std::string, afps::combat::CombatState> combat_states_;
  std::vector<afps::combat::ProjectileState> projectiles_;
  std::vector<PickupState> pickups_;
  std::unordered_set<std::string> pickup_sync_sent_;
  int next_projectile_id_ = 1;
  uint32_t map_seed_ = 0;
  afps::world::MapWorldOptions map_options_{};
  afps::sim::CollisionWorld collision_world_;
  std::vector<afps::world::StaticMeshInstance> static_mesh_instances_;
  std::unordered_map<int, uint32_t> collider_instance_lookup_;
  afps::world::CollisionMeshRegistry collision_mesh_registry_{};
  std::unordered_map<std::string, size_t> collision_mesh_prefab_lookup_;
  bool collision_mesh_registry_loaded_ = false;
  afps::sim::SimConfig sim_config_ = afps::sim::kDefaultSimConfig;
  afps::weapons::WeaponConfig weapon_config_ = afps::weapons::BuildDefaultWeaponConfig();
  int server_tick_ = 0;
  int snapshot_keyframe_interval_ = kSnapshotKeyframeInterval;
  double snapshot_accumulator_ = 0.0;
  int pose_history_limit_ = 0;
  size_t batch_count_ = 0;
  size_t input_count_ = 0;
  size_t snapshot_count_ = 0;
  size_t tick_count_ = 0;
  TickAccumulator::Clock::time_point last_log_time_{};
};
#endif
