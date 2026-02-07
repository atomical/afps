#include "map_world.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <iostream>
#include <limits>
#include <optional>
#include <string>
#include <unordered_set>
#include <vector>

#include <nlohmann/json.hpp>

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
constexpr double kHalfPi = 1.5707963267948966;
constexpr double kTwoPi = 6.283185307179586;

enum class DoorSide : uint8_t {
  North = 0,
  East = 1,
  South = 2,
  West = 3,
};

struct BuildingCell {
  int cell_x = 0;
  int cell_y = 0;
  DoorSide door_side = DoorSide::South;
  uint8_t type_index = 0;
};

struct BuildingWorld {
  double center_x = 0.0;
  double center_y = 0.0;
  DoorSide door_side = DoorSide::South;
  uint8_t type_index = 0;
  double scale = 1.0;
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

struct StaticPlacement {
  std::string file;
  double pos_x = 0.0;
  double pos_y = 0.0;
  double pos_z = 0.0;
  std::optional<double> rotation_y;
  bool random_yaw = false;
  double scale = 1.0;
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

ColliderPart ScalePart(const ColliderPart &part, double scale) {
  const double safe_scale = (std::isfinite(scale) && scale > 0.0) ? scale : 1.0;
  return {
      part.min_x * safe_scale,
      part.max_x * safe_scale,
      part.min_y * safe_scale,
      part.max_y * safe_scale,
      std::max(0.4, part.max_z * safe_scale),
  };
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

  double NextUnitInclusive() {
    return static_cast<double>(Next()) / 4294967295.0;
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

void AppendBuildingCollidersAt(afps::sim::CollisionWorld &world,
                               const BuildingWorld &building,
                               int &next_id) {
  const auto &profile = ResolveColliderProfile(building.type_index);
  for (const auto &raw_part : profile.parts) {
    const auto scaled = ScalePart(raw_part, building.scale);
    const auto part = RotatePartByDoorSide(scaled, building.door_side);
    AddCollider(
        world,
        next_id,
        building.center_x + part.min_x,
        building.center_x + part.max_x,
        building.center_y + part.min_y,
        building.center_y + part.max_y,
        0.0,
        std::max(0.4, part.max_z),
        1);
  }
}

afps::sim::Vec3 ResolvePickupPosition(const BuildingWorld &building) {
  const auto bounds = RotatePartByDoorSide(
      ScalePart(ResolveColliderProfile(building.type_index).bounds, building.scale),
      building.door_side);
  const double offset = kPickupRadius + 0.35;
  double x = building.center_x;
  double y = building.center_y;
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

double NormalizeYaw(double value) {
  if (!std::isfinite(value)) {
    return 0.0;
  }
  double wrapped = std::fmod(value, kTwoPi);
  if (wrapped < 0.0) {
    wrapped += kTwoPi;
  }
  if (wrapped >= kTwoPi) {
    wrapped -= kTwoPi;
  }
  return wrapped;
}

DoorSide ResolveDoorSideFromRotation(double yaw) {
  const double normalized = NormalizeYaw(yaw);
  const int quarter_turns = static_cast<int>(std::llround(normalized / kHalfPi)) & 3;
  switch (quarter_turns) {
    case 0:
      return DoorSide::South;
    case 1:
      return DoorSide::West;
    case 2:
      return DoorSide::North;
    case 3:
    default:
      return DoorSide::East;
  }
}

bool TryResolveBuildingTypeIndex(const std::string &file, uint8_t &out_type_index) {
  constexpr const char *kPrefix = "building-type-";
  constexpr const char *kSuffix = ".glb";
  if (file.rfind(kPrefix, 0) != 0) {
    return false;
  }
  if (file.size() <= 4 || file.size() < std::strlen(kPrefix) + std::strlen(kSuffix) + 1) {
    return false;
  }
  if (file.substr(file.size() - std::strlen(kSuffix)) != kSuffix) {
    return false;
  }
  const size_t letter_index = std::strlen(kPrefix);
  if (letter_index + 1 != file.size() - std::strlen(kSuffix)) {
    return false;
  }
  const char letter = static_cast<char>(std::tolower(static_cast<unsigned char>(file[letter_index])));
  if (letter < 'a' || letter > 'u') {
    return false;
  }
  out_type_index = static_cast<uint8_t>(letter - 'a');
  return true;
}

bool ParsePosition(const nlohmann::json &entry, double &x, double &y, double &z) {
  if (!entry.contains("position")) {
    return false;
  }
  const auto &position = entry.at("position");
  if (!position.is_array() || position.size() != 3) {
    return false;
  }
  if (!position[0].is_number() || !position[1].is_number() || !position[2].is_number()) {
    return false;
  }
  x = position[0].get<double>();
  y = position[1].get<double>();
  z = position[2].get<double>();
  return std::isfinite(x) && std::isfinite(y) && std::isfinite(z);
}

std::vector<double> ParseYawChoices(const nlohmann::json &root) {
  std::vector<double> yaw_choices;
  if (root.contains("yawChoices")) {
    const auto &raw = root.at("yawChoices");
    if (raw.is_array()) {
      for (const auto &value : raw) {
        if (!value.is_number()) {
          continue;
        }
        const double yaw = value.get<double>();
        if (std::isfinite(yaw)) {
          yaw_choices.push_back(yaw);
        }
      }
    }
  }
  if (yaw_choices.empty()) {
    yaw_choices = {0.0, kHalfPi, kHalfPi * 2.0, kHalfPi * 3.0};
  }
  return yaw_choices;
}

bool ParseStaticManifestBuildings(const std::string &manifest_path, std::vector<BuildingWorld> &buildings) {
  buildings.clear();

  std::ifstream input(manifest_path);
  if (!input.is_open()) {
    std::cerr << "[warn] static map manifest not found: " << manifest_path << "\n";
    return false;
  }

  nlohmann::json root;
  try {
    input >> root;
  } catch (const std::exception &ex) {
    std::cerr << "[warn] static map manifest parse error: " << ex.what() << "\n";
    return false;
  }

  if (!root.is_object()) {
    std::cerr << "[warn] static map manifest must be an object\n";
    return false;
  }
  if (!root.contains("placements") || !root["placements"].is_array()) {
    std::cerr << "[warn] static map manifest missing placements array\n";
    return false;
  }

  uint32_t random_seed = 0;
  if (root.contains("seed") && root["seed"].is_number_unsigned()) {
    random_seed = root["seed"].get<uint32_t>();
  }
  const std::vector<double> yaw_choices = ParseYawChoices(root);
  XorShift32 rng(random_seed);

  std::vector<StaticPlacement> placements;
  placements.reserve(root["placements"].size());
  for (const auto &raw : root["placements"]) {
    if (!raw.is_object()) {
      continue;
    }
    if (!raw.contains("file") || !raw["file"].is_string()) {
      continue;
    }
    StaticPlacement placement;
    placement.file = raw["file"].get<std::string>();
    if (placement.file.empty()) {
      continue;
    }
    if (!ParsePosition(raw, placement.pos_x, placement.pos_y, placement.pos_z)) {
      continue;
    }
    if (raw.contains("rotation") && raw["rotation"].is_array() && raw["rotation"].size() == 3 &&
        raw["rotation"][1].is_number()) {
      const double yaw = raw["rotation"][1].get<double>();
      if (std::isfinite(yaw)) {
        placement.rotation_y = yaw;
      }
    }
    if (raw.contains("randomYaw") && raw["randomYaw"].is_boolean()) {
      placement.random_yaw = raw["randomYaw"].get<bool>();
    }
    if (raw.contains("scale") && raw["scale"].is_number()) {
      const double scale = raw["scale"].get<double>();
      if (std::isfinite(scale) && scale > 0.0) {
        placement.scale = scale;
      }
    }
    placements.push_back(std::move(placement));
  }

  for (auto &placement : placements) {
    if (placement.random_yaw && !placement.rotation_y.has_value()) {
      const double sample = rng.NextUnitInclusive();
      size_t index = static_cast<size_t>(std::floor(sample * static_cast<double>(yaw_choices.size())));
      if (index >= yaw_choices.size()) {
        index = yaw_choices.size() - 1;
      }
      placement.rotation_y = yaw_choices[index];
    }
  }

  buildings.reserve(placements.size());
  for (const auto &placement : placements) {
    uint8_t type_index = 0;
    if (!TryResolveBuildingTypeIndex(placement.file, type_index)) {
      continue;
    }
    const double yaw = placement.rotation_y.value_or(0.0);
    BuildingWorld building;
    building.center_x = placement.pos_x * kMapScale;
    building.center_y = placement.pos_z * kMapScale;
    building.door_side = ResolveDoorSideFromRotation(yaw);
    building.type_index = type_index;
    building.scale = placement.scale;
    buildings.push_back(building);
  }
  return !buildings.empty();
}

void AppendFallbackPickups(GeneratedMapWorld &generated,
                           uint32_t &pickup_id,
                           size_t &health_count,
                           size_t &weapon_count,
                           int health_respawn,
                           int weapon_respawn) {
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
}

void BuildPickupsFromBuildings(const std::vector<BuildingWorld> &buildings,
                               int tick_rate,
                               GeneratedMapWorld &generated) {
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

  AppendFallbackPickups(generated, pickup_id, health_count, weapon_count, health_respawn, weapon_respawn);
}

GeneratedMapWorld GenerateLegacyMapWorld(const afps::sim::SimConfig &config, uint32_t seed, int tick_rate) {
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

  std::vector<BuildingCell> buildings;
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

  std::vector<BuildingWorld> world_buildings;
  world_buildings.reserve(buildings.size());
  for (const auto &building : buildings) {
    world_buildings.push_back(
        {static_cast<double>(building.cell_x) * kTileSize * kMapScale,
         static_cast<double>(building.cell_y) * kTileSize * kMapScale,
         building.door_side,
         building.type_index,
         1.0});
  }

  afps::sim::ClearColliders(generated.collision_world);
  int next_collider_id = 1;
  for (const auto &building : world_buildings) {
    AppendBuildingCollidersAt(generated.collision_world, building, next_collider_id);
  }

  BuildPickupsFromBuildings(world_buildings, tick_rate, generated);
  return generated;
}

GeneratedMapWorld GenerateStaticMapWorld(const afps::sim::SimConfig &config,
                                         uint32_t seed,
                                         int tick_rate,
                                         const MapWorldOptions &options) {
  std::vector<BuildingWorld> buildings;
  if (!ParseStaticManifestBuildings(options.static_manifest_path, buildings)) {
    std::cerr << "[warn] falling back to legacy map generation\n";
    return GenerateLegacyMapWorld(config, seed, tick_rate);
  }

  std::sort(buildings.begin(), buildings.end(), [](const BuildingWorld &a, const BuildingWorld &b) {
    const double da = a.center_x * a.center_x + a.center_y * a.center_y;
    const double db = b.center_x * b.center_x + b.center_y * b.center_y;
    if (da != db) {
      return da < db;
    }
    if (a.center_x != b.center_x) {
      return a.center_x < b.center_x;
    }
    if (a.center_y != b.center_y) {
      return a.center_y < b.center_y;
    }
    if (a.type_index != b.type_index) {
      return a.type_index < b.type_index;
    }
    if (a.door_side != b.door_side) {
      return static_cast<int>(a.door_side) < static_cast<int>(b.door_side);
    }
    return a.scale < b.scale;
  });

  GeneratedMapWorld generated;
  generated.seed = seed;
  afps::sim::ClearColliders(generated.collision_world);
  int next_collider_id = 1;
  for (const auto &building : buildings) {
    AppendBuildingCollidersAt(generated.collision_world, building, next_collider_id);
  }
  BuildPickupsFromBuildings(buildings, tick_rate, generated);
  return generated;
}

}  // namespace

GeneratedMapWorld GenerateMapWorld(const afps::sim::SimConfig &config,
                                   uint32_t seed,
                                   int tick_rate,
                                   const MapWorldOptions &options) {
  if (options.mode == MapWorldMode::Static) {
    return GenerateStaticMapWorld(config, seed, tick_rate, options);
  }
  return GenerateLegacyMapWorld(config, seed, tick_rate);
}

}  // namespace afps::world
