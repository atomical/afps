#pragma once

#include <cstdint>
#include <vector>

#include "sim/sim.h"

namespace afps::world {

enum class PickupKind : uint8_t {
  Health = 1,
  Weapon = 2,
};

struct PickupSpawn {
  uint32_t id = 0;
  PickupKind kind = PickupKind::Health;
  afps::sim::Vec3 position{};
  double radius = 1.1;
  int weapon_slot = 0;
  int amount = 0;
  int respawn_ticks = 0;
};

struct GeneratedMapWorld {
  uint32_t seed = 0;
  afps::sim::CollisionWorld collision_world;
  std::vector<PickupSpawn> pickups;
};

GeneratedMapWorld GenerateMapWorld(const afps::sim::SimConfig &config, uint32_t seed, int tick_rate);

}  // namespace afps::world
