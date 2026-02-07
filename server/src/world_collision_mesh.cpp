#include "world_collision_mesh.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <limits>
#include <string>
#include <unordered_set>

#include <nlohmann/json.hpp>

namespace afps::world {
namespace {
constexpr const char *kDefaultCollisionMeshPath = "shared/data/collision_meshes_v1.json";
constexpr uint64_t kFnvOffsetBasis = 1469598103934665603ull;
constexpr uint64_t kFnvPrime = 1099511628211ull;
constexpr uint32_t kBvhLeafTriangleCount = 8;

std::string NormalizePrefabId(std::string value) {
  std::transform(value.begin(), value.end(), value.begin(), [](unsigned char ch) {
    return static_cast<char>(std::tolower(ch));
  });
  return value;
}

bool ParseBoundTriplet(const nlohmann::json &value, double &x, double &y, double &z) {
  if (!value.is_array() || value.size() != 3) {
    return false;
  }
  if (!value[0].is_number() || !value[1].is_number() || !value[2].is_number()) {
    return false;
  }
  x = value[0].get<double>();
  y = value[1].get<double>();
  z = value[2].get<double>();
  return std::isfinite(x) && std::isfinite(y) && std::isfinite(z);
}

bool ParseBounds(const nlohmann::json &value, CollisionMeshBounds &out) {
  if (!value.is_object()) {
    return false;
  }
  if (!value.contains("min") || !value.contains("max")) {
    return false;
  }
  double min_x = 0.0;
  double min_y = 0.0;
  double min_z = 0.0;
  double max_x = 0.0;
  double max_y = 0.0;
  double max_z = 0.0;
  if (!ParseBoundTriplet(value.at("min"), min_x, min_y, min_z)) {
    return false;
  }
  if (!ParseBoundTriplet(value.at("max"), max_x, max_y, max_z)) {
    return false;
  }
  if (!(max_x > min_x && max_y > min_y && max_z > min_z)) {
    return false;
  }
  out.min_x = min_x;
  out.min_y = min_y;
  out.min_z = min_z;
  out.max_x = max_x;
  out.max_y = max_y;
  out.max_z = max_z;
  return true;
}

CollisionMeshBounds BoundsFromTriangle(const CollisionMeshPrefab::Triangle &triangle) {
  CollisionMeshBounds bounds;
  bounds.min_x = std::min({triangle.v0_x, triangle.v1_x, triangle.v2_x});
  bounds.max_x = std::max({triangle.v0_x, triangle.v1_x, triangle.v2_x});
  bounds.min_y = std::min({triangle.v0_y, triangle.v1_y, triangle.v2_y});
  bounds.max_y = std::max({triangle.v0_y, triangle.v1_y, triangle.v2_y});
  bounds.min_z = std::min({triangle.v0_z, triangle.v1_z, triangle.v2_z});
  bounds.max_z = std::max({triangle.v0_z, triangle.v1_z, triangle.v2_z});
  return bounds;
}

CollisionMeshBounds UnionBounds(const CollisionMeshBounds &a, const CollisionMeshBounds &b) {
  CollisionMeshBounds out;
  out.min_x = std::min(a.min_x, b.min_x);
  out.max_x = std::max(a.max_x, b.max_x);
  out.min_y = std::min(a.min_y, b.min_y);
  out.max_y = std::max(a.max_y, b.max_y);
  out.min_z = std::min(a.min_z, b.min_z);
  out.max_z = std::max(a.max_z, b.max_z);
  return out;
}

std::array<double, 3> TriangleCentroid(const CollisionMeshPrefab::Triangle &triangle) {
  return {(triangle.v0_x + triangle.v1_x + triangle.v2_x) / 3.0,
          (triangle.v0_y + triangle.v1_y + triangle.v2_y) / 3.0,
          (triangle.v0_z + triangle.v1_z + triangle.v2_z) / 3.0};
}

CollisionMeshBounds ComputeBoundsForRange(const CollisionMeshPrefab &prefab,
                                          uint32_t begin,
                                          uint32_t end) {
  CollisionMeshBounds bounds{};
  bool initialized = false;
  for (uint32_t i = begin; i < end; ++i) {
    if (i >= prefab.triangle_indices.size()) {
      break;
    }
    const uint32_t triangle_index = prefab.triangle_indices[i];
    if (triangle_index >= prefab.triangles.size()) {
      continue;
    }
    const CollisionMeshBounds tri_bounds = BoundsFromTriangle(prefab.triangles[triangle_index]);
    if (!initialized) {
      bounds = tri_bounds;
      initialized = true;
    } else {
      bounds = UnionBounds(bounds, tri_bounds);
    }
  }
  return bounds;
}

uint32_t BuildBvhRecursive(CollisionMeshPrefab &prefab, uint32_t begin, uint32_t end) {
  CollisionMeshPrefab::BvhNode node;
  node.begin = begin;
  node.end = end;
  node.leaf = true;
  node.bounds = ComputeBoundsForRange(prefab, begin, end);

  const uint32_t node_index = static_cast<uint32_t>(prefab.bvh_nodes.size());
  prefab.bvh_nodes.push_back(node);
  const uint32_t count = end > begin ? end - begin : 0;
  if (count <= kBvhLeafTriangleCount) {
    return node_index;
  }

  const double ext_x = node.bounds.max_x - node.bounds.min_x;
  const double ext_y = node.bounds.max_y - node.bounds.min_y;
  const double ext_z = node.bounds.max_z - node.bounds.min_z;
  int axis = 0;
  if (ext_y > ext_x && ext_y >= ext_z) {
    axis = 1;
  } else if (ext_z > ext_x && ext_z > ext_y) {
    axis = 2;
  }

  const uint32_t mid = begin + (count / 2);
  std::nth_element(
      prefab.triangle_indices.begin() + begin,
      prefab.triangle_indices.begin() + mid,
      prefab.triangle_indices.begin() + end,
      [&](uint32_t lhs_index, uint32_t rhs_index) {
        const auto lhs = TriangleCentroid(prefab.triangles[lhs_index]);
        const auto rhs = TriangleCentroid(prefab.triangles[rhs_index]);
        return lhs[axis] < rhs[axis];
      });

  if (mid == begin || mid == end) {
    return node_index;
  }

  const uint32_t left = BuildBvhRecursive(prefab, begin, mid);
  const uint32_t right = BuildBvhRecursive(prefab, mid, end);
  auto &stored = prefab.bvh_nodes[node_index];
  stored.left = left;
  stored.right = right;
  stored.leaf = false;
  return node_index;
}

void BuildPrefabBvh(CollisionMeshPrefab &prefab) {
  prefab.bvh_nodes.clear();
  prefab.triangle_indices.clear();
  prefab.triangle_indices.reserve(prefab.triangles.size());
  for (uint32_t i = 0; i < prefab.triangles.size(); ++i) {
    prefab.triangle_indices.push_back(i);
  }
  if (prefab.triangle_indices.empty()) {
    return;
  }
  BuildBvhRecursive(prefab, 0, static_cast<uint32_t>(prefab.triangle_indices.size()));
}

void AddBoxTriangles(std::vector<CollisionMeshPrefab::Triangle> &triangles,
                     double min_x,
                     double min_y,
                     double min_z,
                     double max_x,
                     double max_y,
                     double max_z) {
  auto push = [&](double ax,
                  double ay,
                  double az,
                  double bx,
                  double by,
                  double bz,
                  double cx,
                  double cy,
                  double cz) {
    CollisionMeshPrefab::Triangle tri;
    tri.v0_x = ax;
    tri.v0_y = ay;
    tri.v0_z = az;
    tri.v1_x = bx;
    tri.v1_y = by;
    tri.v1_z = bz;
    tri.v2_x = cx;
    tri.v2_y = cy;
    tri.v2_z = cz;
    triangles.push_back(tri);
  };
  // Bottom (z=min)
  push(min_x, min_y, min_z, max_x, min_y, min_z, max_x, max_y, min_z);
  push(min_x, min_y, min_z, max_x, max_y, min_z, min_x, max_y, min_z);
  // Top (z=max)
  push(min_x, min_y, max_z, max_x, max_y, max_z, max_x, min_y, max_z);
  push(min_x, min_y, max_z, min_x, max_y, max_z, max_x, max_y, max_z);
  // X min
  push(min_x, min_y, min_z, min_x, max_y, min_z, min_x, max_y, max_z);
  push(min_x, min_y, min_z, min_x, max_y, max_z, min_x, min_y, max_z);
  // X max
  push(max_x, min_y, min_z, max_x, max_y, max_z, max_x, max_y, min_z);
  push(max_x, min_y, min_z, max_x, min_y, max_z, max_x, max_y, max_z);
  // Y min
  push(min_x, min_y, min_z, max_x, min_y, max_z, max_x, min_y, min_z);
  push(min_x, min_y, min_z, min_x, min_y, max_z, max_x, min_y, max_z);
  // Y max
  push(min_x, max_y, min_z, max_x, max_y, min_z, max_x, max_y, max_z);
  push(min_x, max_y, min_z, max_x, max_y, max_z, min_x, max_y, max_z);
}

bool ParseTriangleVertex(const nlohmann::json &value, double &x, double &y, double &z) {
  return ParseBoundTriplet(value, x, y, z);
}

bool ParseTriangles(const nlohmann::json &value,
                    std::vector<CollisionMeshPrefab::Triangle> &out_triangles) {
  out_triangles.clear();
  if (!value.is_array()) {
    return false;
  }
  for (const auto &entry : value) {
    if (!entry.is_array() || entry.size() != 3) {
      continue;
    }
    double ax = 0.0;
    double ay = 0.0;
    double az = 0.0;
    double bx = 0.0;
    double by = 0.0;
    double bz = 0.0;
    double cx = 0.0;
    double cy = 0.0;
    double cz = 0.0;
    if (!ParseTriangleVertex(entry[0], ax, ay, az) ||
        !ParseTriangleVertex(entry[1], bx, by, bz) ||
        !ParseTriangleVertex(entry[2], cx, cy, cz)) {
      continue;
    }
    CollisionMeshPrefab::Triangle tri;
    tri.v0_x = ax;
    tri.v0_y = ay;
    tri.v0_z = az;
    tri.v1_x = bx;
    tri.v1_y = by;
    tri.v1_z = bz;
    tri.v2_x = cx;
    tri.v2_y = cy;
    tri.v2_z = cz;
    out_triangles.push_back(tri);
  }
  return !out_triangles.empty();
}

uint64_t HashByte(uint64_t hash, uint8_t value) {
  return (hash ^ static_cast<uint64_t>(value)) * kFnvPrime;
}

uint64_t HashInt64(uint64_t hash, int64_t value) {
  for (int shift = 0; shift < 64; shift += 8) {
    hash = HashByte(hash, static_cast<uint8_t>((value >> shift) & 0xff));
  }
  return hash;
}

uint64_t HashString(uint64_t hash, const std::string &value) {
  for (unsigned char ch : value) {
    hash = HashByte(hash, ch);
  }
  return hash;
}

int64_t QuantizeMilli(double value) {
  if (!std::isfinite(value)) {
    return 0;
  }
  return static_cast<int64_t>(std::llround(value * 1000.0));
}
}  // namespace

std::string ResolveCollisionMeshRegistryPath() {
  const char *raw_path = std::getenv("AFPS_COLLISION_MESH_PATH");
  if (raw_path && raw_path[0] != '\0') {
    return raw_path;
  }

  const std::vector<std::string> candidates = {
      kDefaultCollisionMeshPath,
      "../" + std::string(kDefaultCollisionMeshPath),
      "../../" + std::string(kDefaultCollisionMeshPath),
  };
  for (const auto &candidate : candidates) {
    if (std::filesystem::exists(candidate)) {
      return candidate;
    }
  }
  return kDefaultCollisionMeshPath;
}

bool LoadCollisionMeshRegistry(const std::string &path,
                               CollisionMeshRegistry &out,
                               std::string &error) {
  out = {};
  error.clear();

  std::ifstream input(path);
  if (!input.is_open()) {
    error = "collision mesh registry not found: " + path;
    return false;
  }

  nlohmann::json root;
  try {
    input >> root;
  } catch (const std::exception &ex) {
    error = std::string("collision mesh registry parse error: ") + ex.what();
    return false;
  }

  if (!root.is_object()) {
    error = "collision mesh registry must be a JSON object";
    return false;
  }

  if (!root.contains("version") || !root.at("version").is_number_unsigned()) {
    error = "collision mesh registry missing unsigned version";
    return false;
  }
  out.version = root.at("version").get<uint32_t>();

  if (root.contains("sourceAssetPack") && root.at("sourceAssetPack").is_string()) {
    out.source_asset_pack = root.at("sourceAssetPack").get<std::string>();
  }

  if (!root.contains("prefabs") || !root.at("prefabs").is_array()) {
    error = "collision mesh registry missing prefabs array";
    return false;
  }

  std::unordered_set<std::string> seen_ids;
  for (const auto &entry : root.at("prefabs")) {
    if (!entry.is_object()) {
      continue;
    }
    if (!entry.contains("id") || !entry.at("id").is_string()) {
      continue;
    }

    CollisionMeshPrefab prefab;
    prefab.id = NormalizePrefabId(entry.at("id").get<std::string>());
    if (prefab.id.empty()) {
      continue;
    }

    if (entry.contains("triangleCount") && entry.at("triangleCount").is_number_unsigned()) {
      prefab.triangle_count = entry.at("triangleCount").get<uint32_t>();
    }

    if (entry.contains("surfaceType") && entry.at("surfaceType").is_number_integer()) {
      const int64_t raw_surface = entry.at("surfaceType").get<int64_t>();
      if (raw_surface >= 0 && raw_surface <= std::numeric_limits<uint8_t>::max()) {
        prefab.surface_type = static_cast<uint8_t>(raw_surface);
      }
    }

    if (!entry.contains("bounds") || !ParseBounds(entry.at("bounds"), prefab.bounds)) {
      continue;
    }

    std::vector<CollisionMeshPrefab::Triangle> triangles;
    const bool parsed_triangles =
        entry.contains("triangles") && ParseTriangles(entry.at("triangles"), triangles);
    prefab.has_explicit_triangles = parsed_triangles;
    if (parsed_triangles) {
      prefab.triangles = std::move(triangles);
    } else {
      AddBoxTriangles(prefab.triangles,
                      prefab.bounds.min_x,
                      prefab.bounds.min_y,
                      prefab.bounds.min_z,
                      prefab.bounds.max_x,
                      prefab.bounds.max_y,
                      prefab.bounds.max_z);
    }
    prefab.triangle_count = static_cast<uint32_t>(prefab.triangles.size());
    BuildPrefabBvh(prefab);
    if (prefab.bvh_nodes.empty() || prefab.triangle_indices.empty()) {
      continue;
    }

    if (!seen_ids.insert(prefab.id).second) {
      continue;
    }
    out.prefabs.push_back(prefab);
  }

  if (out.prefabs.empty()) {
    error = "collision mesh registry has no valid prefab entries";
    return false;
  }

  std::sort(out.prefabs.begin(), out.prefabs.end(), [](const CollisionMeshPrefab &a, const CollisionMeshPrefab &b) {
    return a.id < b.id;
  });

  return true;
}

bool LoadCollisionMeshRegistry(CollisionMeshRegistry &out, std::string &error) {
  return LoadCollisionMeshRegistry(ResolveCollisionMeshRegistryPath(), out, error);
}

std::vector<std::string> FindMissingCollisionMeshPrefabs(
    const CollisionMeshRegistry &registry,
    const std::vector<std::string> &required_prefab_ids) {
  std::vector<std::string> missing;
  if (required_prefab_ids.empty()) {
    return missing;
  }

  std::unordered_set<std::string> available;
  available.reserve(registry.prefabs.size());
  for (const auto &prefab : registry.prefabs) {
    if (!prefab.id.empty()) {
      available.insert(NormalizePrefabId(prefab.id));
    }
  }

  std::unordered_set<std::string> missing_unique;
  for (const auto &required : required_prefab_ids) {
    if (required.empty()) {
      continue;
    }
    const std::string id = NormalizePrefabId(required);
    if (available.find(id) == available.end()) {
      missing_unique.insert(id);
    }
  }

  missing.assign(missing_unique.begin(), missing_unique.end());
  std::sort(missing.begin(), missing.end());
  return missing;
}

uint64_t ComputeCollisionMeshRegistryChecksum(const CollisionMeshRegistry &registry) {
  uint64_t hash = kFnvOffsetBasis;
  hash = HashInt64(hash, static_cast<int64_t>(registry.version));
  hash = HashString(hash, registry.source_asset_pack);

  std::vector<CollisionMeshPrefab> sorted = registry.prefabs;
  std::sort(sorted.begin(), sorted.end(), [](const CollisionMeshPrefab &a, const CollisionMeshPrefab &b) {
    return a.id < b.id;
  });

  for (const auto &prefab : sorted) {
    hash = HashString(hash, prefab.id);
    hash = HashInt64(hash, static_cast<int64_t>(prefab.triangle_count));
    hash = HashInt64(hash, static_cast<int64_t>(prefab.surface_type));
    hash = HashInt64(hash, QuantizeMilli(prefab.bounds.min_x));
    hash = HashInt64(hash, QuantizeMilli(prefab.bounds.min_y));
    hash = HashInt64(hash, QuantizeMilli(prefab.bounds.min_z));
    hash = HashInt64(hash, QuantizeMilli(prefab.bounds.max_x));
    hash = HashInt64(hash, QuantizeMilli(prefab.bounds.max_y));
    hash = HashInt64(hash, QuantizeMilli(prefab.bounds.max_z));
    hash = HashInt64(hash, static_cast<int64_t>(prefab.triangles.size()));
    for (const auto &triangle : prefab.triangles) {
      hash = HashInt64(hash, QuantizeMilli(triangle.v0_x));
      hash = HashInt64(hash, QuantizeMilli(triangle.v0_y));
      hash = HashInt64(hash, QuantizeMilli(triangle.v0_z));
      hash = HashInt64(hash, QuantizeMilli(triangle.v1_x));
      hash = HashInt64(hash, QuantizeMilli(triangle.v1_y));
      hash = HashInt64(hash, QuantizeMilli(triangle.v1_z));
      hash = HashInt64(hash, QuantizeMilli(triangle.v2_x));
      hash = HashInt64(hash, QuantizeMilli(triangle.v2_y));
      hash = HashInt64(hash, QuantizeMilli(triangle.v2_z));
    }
  }
  return hash;
}

}  // namespace afps::world
