#include "map_world.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <limits>
#include <unordered_set>
#include <vector>

namespace afps::world {
namespace {
constexpr double kTileSize = 4.0;
constexpr double kMapScale = 2.5;
// Building GLB footprints are ~4.6m max at map scale; keep collision walls
// close to visual walls so impacts and movement contact feel grounded.
constexpr double kRoomHalf = 2.35;
constexpr double kWallHeight = 3.4;
constexpr double kPickupHeight = 0.2;
constexpr double kPickupRadius = 1.2;

enum class DoorSide : uint8_t {
  North = 0,
  East = 1,
  South = 2,
  West = 3,
};

struct Building {
  int cell_x = 0;
  int cell_y = 0;
  DoorSide door_side = DoorSide::South;
  uint8_t type_index = 0;
};

struct ColliderPart {
  double min_x = -kRoomHalf;
  double max_x = kRoomHalf;
  double min_y = -kRoomHalf;
  double max_y = kRoomHalf;
  double max_z = kWallHeight;
};

struct ColliderProfile {
  std::vector<ColliderPart> parts;
  ColliderPart bounds{};
};

ColliderProfile MakeProfile(const std::vector<ColliderPart> &parts) {
  ColliderProfile profile;
  profile.parts = parts;
  if (profile.parts.empty()) {
    profile.parts.push_back(ColliderPart{});
  }
  ColliderPart bounds = profile.parts.front();
  for (const auto &part : profile.parts) {
    bounds.min_x = std::min(bounds.min_x, part.min_x);
    bounds.max_x = std::max(bounds.max_x, part.max_x);
    bounds.min_y = std::min(bounds.min_y, part.min_y);
    bounds.max_y = std::max(bounds.max_y, part.max_y);
    bounds.max_z = std::max(bounds.max_z, part.max_z);
  }
  profile.bounds = bounds;
  return profile;
}

const std::vector<ColliderProfile> &BuildingColliderProfiles() {
  static const std::vector<ColliderProfile> kProfiles = {
      MakeProfile({ColliderPart{-1.625, 1.625, -1.2852, 1.2852, 2.0839}}),
      MakeProfile({
          ColliderPart{-2.285, 2.285, -1.205, 1.425, 2.8438},
          ColliderPart{1.08, 2.285, -1.425, -0.94, 2.007},
      }),
      MakeProfile({ColliderPart{-1.608, 1.608, -1.2852, 1.2852, 2.5839}}),
      MakeProfile({ColliderPart{-2.1955, 2.1955, -1.285, 1.285, 3.0938}}),
      MakeProfile({ColliderPart{-1.625, 1.625, -1.285, 1.285, 2.8438}}),
      MakeProfile({ColliderPart{-1.785, 1.785, -1.7574, 1.7574, 2.8438}}),
      MakeProfile({
          ColliderPart{-1.8125, 1.8125, -1.1461, 1.4725, 1.9205},
          ColliderPart{0.4722, 1.8125, -1.4725, -0.1322, 1.9205},
      }),
      MakeProfile({ColliderPart{-1.625, 1.625, -1.145, 1.145, 1.8437}}),
      MakeProfile({ColliderPart{-1.608, 1.608, -1.285, 1.285, 1.8437}}),
      MakeProfile({ColliderPart{-1.7125, 1.7125, -1.145, 1.145, 2.5938}}),
      MakeProfile({ColliderPart{-1.1512, 1.1512, -1.275, 1.275, 2.874}}),
      MakeProfile({ColliderPart{-1.292, 1.292, -1.275, 1.275, 2.623}}),
      MakeProfile({ColliderPart{-1.785, 1.785, -1.785, 1.785, 1.8437}}),
      MakeProfile({ColliderPart{-2.2303, 2.2303, -1.7224, 1.7224, 2.8438}}),
      MakeProfile({ColliderPart{-1.5875, 1.5875, -1.285, 1.285, 2.8438}}),
      MakeProfile({ColliderPart{-1.55, 1.55, -1.2375, 1.2375, 2.295}}),
      MakeProfile({ColliderPart{-1.55, 1.55, -1.055, 1.159, 2.295}}),
      MakeProfile({ColliderPart{-1.285, 1.285, -1.275, 1.275, 2.8529}}),
      MakeProfile({ColliderPart{-1.7575, 1.7575, -1.358, 1.358, 2.8438}}),
      MakeProfile({ColliderPart{-1.659, 1.625, -1.758, 1.758, 2.8908}}),
      MakeProfile({ColliderPart{-1.785, 1.785, -1.3587, 1.3587, 2.8438}}),
  };
  return kProfiles;
}

const ColliderProfile &ResolveColliderProfile(uint8_t type_index) {
  const auto &profiles = BuildingColliderProfiles();
  const size_t index = profiles.empty() ? 0 : static_cast<size_t>(type_index) % profiles.size();
  return profiles[index];
}

std::array<double, 2> RotatePointByDoorSide(double x, double y, DoorSide door_side) {
  switch (door_side) {
    case DoorSide::West:
      return {-y, x};
    case DoorSide::North:
      return {-x, -y};
    case DoorSide::East:
      return {y, -x};
    case DoorSide::South:
    default:
      return {x, y};
  }
}

ColliderPart RotatePartByDoorSide(const ColliderPart &part, DoorSide door_side) {
  if (door_side == DoorSide::South) {
    return part;
  }
  const std::array<std::array<double, 2>, 4> corners = {
      RotatePointByDoorSide(part.min_x, part.min_y, door_side),
      RotatePointByDoorSide(part.min_x, part.max_y, door_side),
      RotatePointByDoorSide(part.max_x, part.min_y, door_side),
      RotatePointByDoorSide(part.max_x, part.max_y, door_side),
  };
  ColliderPart rotated = part;
  rotated.min_x = std::numeric_limits<double>::infinity();
  rotated.max_x = -std::numeric_limits<double>::infinity();
  rotated.min_y = std::numeric_limits<double>::infinity();
  rotated.max_y = -std::numeric_limits<double>::infinity();
  for (const auto &corner : corners) {
    rotated.min_x = std::min(rotated.min_x, corner[0]);
    rotated.max_x = std::max(rotated.max_x, corner[0]);
    rotated.min_y = std::min(rotated.min_y, corner[1]);
    rotated.max_y = std::max(rotated.max_y, corner[1]);
  }
  return rotated;
}

class XorShift32 {
public:
  explicit XorShift32(uint32_t seed) : state_(seed == 0 ? 1u : seed) {}

  uint32_t Next() {
    uint32_t x = state_;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    state_ = x == 0 ? 1u : x;
    return state_;
  }

  int NextInt(int min_value, int max_value) {
    if (max_value <= min_value) {
      return min_value;
    }
    const uint32_t span = static_cast<uint32_t>(max_value - min_value + 1);
    return min_value + static_cast<int>(Next() % span);
  }

  template <typename T>
  void Shuffle(std::vector<T> &values) {
    if (values.size() < 2) {
      return;
    }
    for (size_t i = values.size() - 1; i > 0; --i) {
      const size_t j = static_cast<size_t>(Next() % static_cast<uint32_t>(i + 1));
      std::swap(values[i], values[j]);
    }
  }

private:
  uint32_t state_ = 1u;
};

int64_t CellKey(int x, int y) {
  return (static_cast<int64_t>(x) << 32) ^ static_cast<uint32_t>(y);
}

bool IsRoad(const std::unordered_set<int64_t> &roads, int x, int y) {
  return roads.find(CellKey(x, y)) != roads.end();
}

void MarkRoad(std::unordered_set<int64_t> &roads, int x, int y) {
  roads.insert(CellKey(x, y));
}

bool IsInside(int value, int radius) {
  return value >= -radius && value <= radius;
}

bool HasAdjacentRoad(const std::unordered_set<int64_t> &roads, int x, int y) {
  return IsRoad(roads, x + 1, y) || IsRoad(roads, x - 1, y) || IsRoad(roads, x, y + 1) ||
         IsRoad(roads, x, y - 1);
}

uint32_t HashCell(uint32_t seed, int cell_x, int cell_y) {
  const uint32_t x = static_cast<uint32_t>((cell_x + 97) * 73856093);
  const uint32_t y = static_cast<uint32_t>((cell_y + 193) * 19349663);
  return seed ^ x ^ y;
}

int DistanceToRoadAlongDir(const std::unordered_set<int64_t> &roads,
                           int grid_radius,
                           int cell_x,
                           int cell_y,
                           int dir_x,
                           int dir_y) {
  const int max_steps = std::max(1, grid_radius * 2);
  for (int step = 1; step <= max_steps; ++step) {
    const int x = cell_x + dir_x * step;
    const int y = cell_y + dir_y * step;
    if (!IsInside(x, grid_radius) || !IsInside(y, grid_radius)) {
      break;
    }
    if (IsRoad(roads, x, y)) {
      return step;
    }
  }
  return std::numeric_limits<int>::max();
}

DoorSide ResolveDoorSide(const std::unordered_set<int64_t> &roads,
                         int grid_radius,
                         int cell_x,
                         int cell_y,
                         uint32_t seed) {
  struct Candidate {
    DoorSide side;
    int dist;
  };
  const std::array<Candidate, 4> candidates = {
      Candidate{DoorSide::North, DistanceToRoadAlongDir(roads, grid_radius, cell_x, cell_y, 0, 1)},
      Candidate{DoorSide::East, DistanceToRoadAlongDir(roads, grid_radius, cell_x, cell_y, 1, 0)},
      Candidate{DoorSide::South, DistanceToRoadAlongDir(roads, grid_radius, cell_x, cell_y, 0, -1)},
      Candidate{DoorSide::West, DistanceToRoadAlongDir(roads, grid_radius, cell_x, cell_y, -1, 0)}};

  int best_dist = std::numeric_limits<int>::max();
  for (const auto &candidate : candidates) {
    best_dist = std::min(best_dist, candidate.dist);
  }
  if (best_dist == std::numeric_limits<int>::max()) {
    return DoorSide::South;
  }

  std::vector<DoorSide> best;
  best.reserve(4);
  for (const auto &candidate : candidates) {
    if (candidate.dist == best_dist) {
      best.push_back(candidate.side);
    }
  }
  if (best.empty()) {
    return DoorSide::South;
  }
  const uint32_t tie = HashCell(seed, cell_x, cell_y);
  const size_t index = static_cast<size_t>(tie % static_cast<uint32_t>(best.size()));
  return best[index];
}

void AddCollider(afps::sim::CollisionWorld &world,
                 int &next_id,
                 double min_x,
                 double max_x,
                 double min_y,
                 double max_y,
                 double min_z,
                 double max_z,
                 uint8_t surface_type) {
  afps::sim::AabbCollider collider;
  collider.id = next_id++;
  collider.min_x = min_x;
  collider.max_x = max_x;
  collider.min_y = min_y;
  collider.max_y = max_y;
  collider.min_z = min_z;
  collider.max_z = max_z;
  collider.surface_type = surface_type;
  afps::sim::AddAabbCollider(world, collider);
}

void AppendBuildingColliders(afps::sim::CollisionWorld &world, const Building &building, int &next_id) {
  const double cx = static_cast<double>(building.cell_x) * kTileSize * kMapScale;
  const double cy = static_cast<double>(building.cell_y) * kTileSize * kMapScale;
  const auto &profile = ResolveColliderProfile(building.type_index);
  for (const auto &raw_part : profile.parts) {
    const auto part = RotatePartByDoorSide(raw_part, building.door_side);
    AddCollider(
        world,
        next_id,
        cx + part.min_x,
        cx + part.max_x,
        cy + part.min_y,
        cy + part.max_y,
        0.0,
        std::max(0.4, part.max_z),
        1);
  }
}

afps::sim::Vec3 ResolvePickupPosition(const Building &building) {
  const double cx = static_cast<double>(building.cell_x) * kTileSize * kMapScale;
  const double cy = static_cast<double>(building.cell_y) * kTileSize * kMapScale;
  const auto bounds = RotatePartByDoorSide(ResolveColliderProfile(building.type_index).bounds, building.door_side);
  const double offset = kPickupRadius + 0.35;
  double x = cx;
  double y = cy;
  switch (building.door_side) {
    case DoorSide::North:
      y += bounds.max_y + offset;
      break;
    case DoorSide::East:
      x += bounds.max_x + offset;
      break;
    case DoorSide::South:
      y += bounds.min_y - offset;
      break;
    case DoorSide::West:
      x += bounds.min_x - offset;
      break;
  }
  return {x, y, kPickupHeight};
}

int ResolveRespawnTicks(int tick_rate, double seconds) {
  const int safe_tick_rate = std::max(1, tick_rate);
  return std::max(1, static_cast<int>(std::llround(seconds * static_cast<double>(safe_tick_rate))));
}

}  // namespace

GeneratedMapWorld GenerateMapWorld(const afps::sim::SimConfig &config, uint32_t seed, int tick_rate) {
  GeneratedMapWorld generated;
  generated.seed = seed;

  const double arena_half = (std::isfinite(config.arena_half_size) && config.arena_half_size > 0.0)
                                ? config.arena_half_size
                                : 30.0;
  int grid_radius = static_cast<int>(std::floor(arena_half / (kTileSize * kMapScale)));
  grid_radius = std::max(2, std::min(grid_radius, 12));

  std::unordered_set<int64_t> roads;
  roads.reserve(static_cast<size_t>((grid_radius * 2 + 1) * (grid_radius * 2 + 1)));

  for (int i = -grid_radius; i <= grid_radius; ++i) {
    MarkRoad(roads, i, 0);
    MarkRoad(roads, 0, i);
    MarkRoad(roads, i, -grid_radius);
    MarkRoad(roads, i, grid_radius);
    MarkRoad(roads, -grid_radius, i);
    MarkRoad(roads, grid_radius, i);
  }

  XorShift32 rng(seed);
  std::vector<int> candidates;
  for (int i = -grid_radius + 1; i <= grid_radius - 1; ++i) {
    if (i != 0) {
      candidates.push_back(i);
    }
  }
  const size_t extra_lines = std::min<size_t>(2, candidates.size());

  rng.Shuffle(candidates);
  for (size_t i = 0; i < extra_lines; ++i) {
    const int x = candidates[i];
    for (int y = -grid_radius; y <= grid_radius; ++y) {
      MarkRoad(roads, x, y);
    }
  }
  rng.Shuffle(candidates);
  for (size_t i = 0; i < extra_lines; ++i) {
    const int y = candidates[i];
    for (int x = -grid_radius; x <= grid_radius; ++x) {
      MarkRoad(roads, x, y);
    }
  }

  std::vector<Building> buildings;
  buildings.reserve(static_cast<size_t>((grid_radius * 2 + 1) * (grid_radius * 2 + 1)));
  for (int y = -grid_radius; y <= grid_radius; ++y) {
    for (int x = -grid_radius; x <= grid_radius; ++x) {
      if (IsRoad(roads, x, y)) {
        continue;
      }
      if (!HasAdjacentRoad(roads, x, y)) {
        continue;
      }
      const auto &profiles = BuildingColliderProfiles();
      const uint8_t type_index = profiles.empty() ? 0 : static_cast<uint8_t>(HashCell(seed, x, y) % profiles.size());
      buildings.push_back({x, y, ResolveDoorSide(roads, grid_radius, x, y, seed), type_index});
    }
  }

  afps::sim::ClearColliders(generated.collision_world);
  int next_collider_id = 1;
  for (const auto &building : buildings) {
    AppendBuildingColliders(generated.collision_world, building, next_collider_id);
  }

  const int health_respawn = ResolveRespawnTicks(tick_rate, 10.0);
  const int weapon_respawn = ResolveRespawnTicks(tick_rate, 15.0);

  uint32_t pickup_id = 1;
  size_t health_count = 0;
  for (size_t i = 0; i < buildings.size() && health_count < 4; ++i) {
    PickupSpawn pickup;
    pickup.id = pickup_id++;
    pickup.kind = PickupKind::Health;
    pickup.position = ResolvePickupPosition(buildings[i]);
    pickup.radius = kPickupRadius;
    pickup.amount = 25;
    pickup.respawn_ticks = health_respawn;
    generated.pickups.push_back(pickup);
    health_count += 1;
  }

  size_t weapon_count = 0;
  for (size_t i = 0; i < buildings.size() && weapon_count < 2; ++i) {
    const size_t index = buildings.size() - 1 - i;
    PickupSpawn pickup;
    pickup.id = pickup_id++;
    pickup.kind = PickupKind::Weapon;
    pickup.position = ResolvePickupPosition(buildings[index]);
    pickup.radius = kPickupRadius;
    pickup.weapon_slot = static_cast<int>(weapon_count % 2);
    pickup.amount = 0;
    pickup.respawn_ticks = weapon_respawn;
    generated.pickups.push_back(pickup);
    weapon_count += 1;
  }

  const std::array<afps::sim::Vec3, 6> fallback = {
      afps::sim::Vec3{-6.0, -6.0, kPickupHeight},
      afps::sim::Vec3{6.0, -6.0, kPickupHeight},
      afps::sim::Vec3{-6.0, 6.0, kPickupHeight},
      afps::sim::Vec3{6.0, 6.0, kPickupHeight},
      afps::sim::Vec3{0.0, -8.0, kPickupHeight},
      afps::sim::Vec3{0.0, 8.0, kPickupHeight}};

  for (size_t i = health_count; i < 4; ++i) {
    PickupSpawn pickup;
    pickup.id = pickup_id++;
    pickup.kind = PickupKind::Health;
    pickup.position = fallback[i % fallback.size()];
    pickup.radius = kPickupRadius;
    pickup.amount = 25;
    pickup.respawn_ticks = health_respawn;
    generated.pickups.push_back(pickup);
  }

  for (size_t i = weapon_count; i < 2; ++i) {
    PickupSpawn pickup;
    pickup.id = pickup_id++;
    pickup.kind = PickupKind::Weapon;
    pickup.position = fallback[(i + 4) % fallback.size()];
    pickup.radius = kPickupRadius;
    pickup.weapon_slot = static_cast<int>(i % 2);
    pickup.amount = 0;
    pickup.respawn_ticks = weapon_respawn;
    generated.pickups.push_back(pickup);
  }

  return generated;
}

}  // namespace afps::world
