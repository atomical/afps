#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

#include "combat.h"
#include "map_world.h"
#include "protocol.h"
#include "sim/sim.h"
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

struct WorldHitResult {
  enum class Backend : uint8_t {
    None = 0,
    Aabb = 1,
    MeshBvh = 2,
  };

  bool hit = false;
  double distance = 0.0;
  afps::combat::Vec3 position{};
  afps::combat::Vec3 normal{};
  SurfaceType surface = SurfaceType::Stone;
  int collider_id = -1;
  Backend backend = Backend::None;
  uint32_t instance_id = 0;
  int face_id = -1;
  std::string prefab_id;
};

bool WorldHitAllowsAabbFallback(const WorldHitFallbackPolicyInput &input);
const char *WorldHitBackendModeName(WorldHitBackendMode mode);
const char *WorldHitBackendName(WorldHitResult::Backend backend);
WorldHitBackendMode ParseWorldHitBackendMode(const char *raw, bool &recognized);
WorldHitBackendMode ResolveWorldHitBackendMode();
SurfaceType ToSurfaceType(uint8_t surface_type);

WorldHitResult
ResolveDetailedWorldRaycast(const afps::combat::Vec3 &origin, const afps::combat::Vec3 &dir,
                            double max_range,
                            const std::vector<afps::world::StaticMeshInstance> &instances,
                            const afps::world::CollisionMeshRegistry &registry,
                            const std::unordered_map<std::string, size_t> &prefab_lookup,
                            const afps::sim::RaycastWorldOptions &options = {},
                            uint32_t ignore_instance_id = 0, uint32_t only_instance_id = 0);

WorldHitResult
ResolveWorldRaycast(const afps::combat::Vec3 &origin, const afps::combat::Vec3 &dir,
                    const afps::sim::SimConfig &config, const afps::sim::CollisionWorld *world,
                    const std::vector<afps::world::StaticMeshInstance> &instances,
                    const afps::world::CollisionMeshRegistry &registry,
                    const std::unordered_map<std::string, size_t> &prefab_lookup,
                    bool collision_mesh_enabled, double max_range, WorldHitBackendMode backend_mode,
                    const std::unordered_map<int, uint32_t> *collider_instance_lookup = nullptr,
                    const afps::sim::RaycastWorldOptions &options = {},
                    uint32_t ignore_instance_id = 0);

} // namespace afps::server
