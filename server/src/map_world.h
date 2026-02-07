#pragma once

#include <cstdint>
#include <string>
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

enum class MapWorldMode : uint8_t {
  Legacy = 0,
  Static = 1,
};

struct MapWorldOptions {
  MapWorldMode mode = MapWorldMode::Legacy;
  std::string static_manifest_path;
};

GeneratedMapWorld GenerateMapWorld(const afps::sim::SimConfig &config,
                                   uint32_t seed,
                                   int tick_rate,
                                   const MapWorldOptions &options = {});

}  // namespace afps::world
