#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace afps::world {

struct CollisionMeshBounds {
  double min_x = 0.0;
  double min_y = 0.0;
  double min_z = 0.0;
  double max_x = 0.0;
  double max_y = 0.0;
  double max_z = 0.0;
};

struct CollisionMeshPrefab {
  struct Triangle {
    double v0_x = 0.0;
    double v0_y = 0.0;
    double v0_z = 0.0;
    double v1_x = 0.0;
    double v1_y = 0.0;
    double v1_z = 0.0;
    double v2_x = 0.0;
    double v2_y = 0.0;
    double v2_z = 0.0;
  };

  struct BvhNode {
    CollisionMeshBounds bounds{};
    uint32_t left = 0;
    uint32_t right = 0;
    uint32_t begin = 0;
    uint32_t end = 0;
    bool leaf = true;
  };

  std::string id;
  uint32_t triangle_count = 0;
  uint8_t surface_type = 0;
  bool has_explicit_triangles = false;
  CollisionMeshBounds bounds{};
  std::vector<Triangle> triangles;
  std::vector<uint32_t> triangle_indices;
  std::vector<BvhNode> bvh_nodes;
};

struct CollisionMeshRegistry {
  uint32_t version = 0;
  std::string source_asset_pack;
  std::vector<CollisionMeshPrefab> prefabs;
};

std::string ResolveCollisionMeshRegistryPath();

bool LoadCollisionMeshRegistry(const std::string &path,
                               CollisionMeshRegistry &out,
                               std::string &error);

bool LoadCollisionMeshRegistry(CollisionMeshRegistry &out, std::string &error);

std::vector<std::string> FindMissingCollisionMeshPrefabs(
    const CollisionMeshRegistry &registry,
    const std::vector<std::string> &required_prefab_ids);

uint64_t ComputeCollisionMeshRegistryChecksum(const CollisionMeshRegistry &registry);

}  // namespace afps::world
