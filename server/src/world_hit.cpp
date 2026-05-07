#include "world_hit.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <string>
#include <utility>
#include <vector>

namespace afps::server {
namespace {
constexpr double kShotRetraceEpsilonMeters = 0.02;

double Dot(const afps::combat::Vec3 &a, const afps::combat::Vec3 &b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

afps::combat::Vec3 Sub(const afps::combat::Vec3 &a, const afps::combat::Vec3 &b) {
  return {a.x - b.x, a.y - b.y, a.z - b.z};
}

afps::combat::Vec3 Cross(const afps::combat::Vec3 &a, const afps::combat::Vec3 &b) {
  return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}

afps::combat::Vec3 Normalize(const afps::combat::Vec3 &v) {
  const double len = std::sqrt(Dot(v, v));
  if (!std::isfinite(len) || len <= 1e-9) {
    return {0.0, 0.0, 0.0};
  }
  return {v.x / len, v.y / len, v.z / len};
}

struct WorldAabbBounds {
  double min_x = 0.0;
  double max_x = 0.0;
  double min_y = 0.0;
  double max_y = 0.0;
  double min_z = 0.0;
  double max_z = 0.0;
};

std::array<double, 2> RotateQuarterTurns(double x, double y, uint8_t quarter_turns) {
  switch (quarter_turns % 4) {
  case 1:
    return {-y, x};
  case 2:
    return {-x, -y};
  case 3:
    return {y, -x};
  case 0:
  default:
    return {x, y};
  }
}

std::array<double, 2> InverseRotateQuarterTurns(double x, double y, uint8_t quarter_turns) {
  const uint8_t inverse = static_cast<uint8_t>((4 - (quarter_turns % 4)) % 4);
  return RotateQuarterTurns(x, y, inverse);
}

WorldAabbBounds BuildWorldBounds(const afps::world::StaticMeshInstance &instance,
                                 const afps::world::CollisionMeshBounds &local_bounds) {
  const double safe_scale =
      (std::isfinite(instance.scale) && instance.scale > 0.0) ? instance.scale : 1.0;
  const double local_min_x = local_bounds.min_x * safe_scale;
  const double local_max_x = local_bounds.max_x * safe_scale;
  const double local_min_y = local_bounds.min_y * safe_scale;
  const double local_max_y = local_bounds.max_y * safe_scale;
  const double local_min_z = local_bounds.min_z * safe_scale;
  const double local_max_z = local_bounds.max_z * safe_scale;

  const std::array<std::array<double, 2>, 4> corners = {
      RotateQuarterTurns(local_min_x, local_min_y, instance.yaw_quarter_turns),
      RotateQuarterTurns(local_min_x, local_max_y, instance.yaw_quarter_turns),
      RotateQuarterTurns(local_max_x, local_min_y, instance.yaw_quarter_turns),
      RotateQuarterTurns(local_max_x, local_max_y, instance.yaw_quarter_turns),
  };

  WorldAabbBounds world;
  world.min_x = std::numeric_limits<double>::infinity();
  world.max_x = -std::numeric_limits<double>::infinity();
  world.min_y = std::numeric_limits<double>::infinity();
  world.max_y = -std::numeric_limits<double>::infinity();
  for (const auto &corner : corners) {
    world.min_x = std::min(world.min_x, instance.center_x + corner[0]);
    world.max_x = std::max(world.max_x, instance.center_x + corner[0]);
    world.min_y = std::min(world.min_y, instance.center_y + corner[1]);
    world.max_y = std::max(world.max_y, instance.center_y + corner[1]);
  }
  world.min_z = instance.base_z + local_min_z;
  world.max_z = instance.base_z + local_max_z;
  return world;
}

double RaycastAabb3D(double origin_x, double origin_y, double origin_z, double dir_x, double dir_y,
                     double dir_z, const WorldAabbBounds &bounds) {
  const double inf = std::numeric_limits<double>::infinity();
  constexpr double epsilon = 1e-8;
  double t_min = -inf;
  double t_max = inf;
  auto update_axis = [&](double origin, double dir, double min_bound, double max_bound) -> bool {
    if (std::abs(dir) < epsilon) {
      return origin >= min_bound && origin <= max_bound;
    }
    double t1 = (min_bound - origin) / dir;
    double t2 = (max_bound - origin) / dir;
    if (t1 > t2) {
      std::swap(t1, t2);
    }
    t_min = std::max(t_min, t1);
    t_max = std::min(t_max, t2);
    return t_min <= t_max;
  };

  if (!update_axis(origin_x, dir_x, bounds.min_x, bounds.max_x)) {
    return inf;
  }
  if (!update_axis(origin_y, dir_y, bounds.min_y, bounds.max_y)) {
    return inf;
  }
  if (!update_axis(origin_z, dir_z, bounds.min_z, bounds.max_z)) {
    return inf;
  }
  if (t_max < 0.0) {
    return inf;
  }
  if (t_min >= 0.0) {
    return t_min;
  }
  return t_max;
}

afps::combat::Vec3 TransformWorldToLocalPoint(const afps::world::StaticMeshInstance &instance,
                                              const afps::combat::Vec3 &world_point) {
  const double safe_scale =
      (std::isfinite(instance.scale) && instance.scale > 0.0) ? instance.scale : 1.0;
  const double dx = world_point.x - instance.center_x;
  const double dy = world_point.y - instance.center_y;
  const auto rotated = InverseRotateQuarterTurns(dx, dy, instance.yaw_quarter_turns);
  return {rotated[0] / safe_scale, rotated[1] / safe_scale,
          (world_point.z - instance.base_z) / safe_scale};
}

afps::combat::Vec3 TransformWorldToLocalDirection(const afps::world::StaticMeshInstance &instance,
                                                  const afps::combat::Vec3 &world_dir) {
  const double safe_scale =
      (std::isfinite(instance.scale) && instance.scale > 0.0) ? instance.scale : 1.0;
  const auto rotated =
      InverseRotateQuarterTurns(world_dir.x, world_dir.y, instance.yaw_quarter_turns);
  return {rotated[0] / safe_scale, rotated[1] / safe_scale, world_dir.z / safe_scale};
}

afps::combat::Vec3 TransformLocalToWorldPoint(const afps::world::StaticMeshInstance &instance,
                                              const afps::combat::Vec3 &local_point) {
  const double safe_scale =
      (std::isfinite(instance.scale) && instance.scale > 0.0) ? instance.scale : 1.0;
  const auto rotated = RotateQuarterTurns(local_point.x * safe_scale, local_point.y * safe_scale,
                                          instance.yaw_quarter_turns);
  return {instance.center_x + rotated[0], instance.center_y + rotated[1],
          instance.base_z + local_point.z * safe_scale};
}

afps::combat::Vec3 TransformLocalToWorldNormal(const afps::world::StaticMeshInstance &instance,
                                               const afps::combat::Vec3 &local_normal) {
  const auto rotated =
      RotateQuarterTurns(local_normal.x, local_normal.y, instance.yaw_quarter_turns);
  return Normalize({rotated[0], rotated[1], local_normal.z});
}

bool IntersectTriangle(const afps::combat::Vec3 &origin, const afps::combat::Vec3 &dir,
                       const afps::world::CollisionMeshPrefab::Triangle &triangle,
                       double max_distance, double &out_t, afps::combat::Vec3 &out_normal) {
  const afps::combat::Vec3 v0{triangle.v0_x, triangle.v0_y, triangle.v0_z};
  const afps::combat::Vec3 v1{triangle.v1_x, triangle.v1_y, triangle.v1_z};
  const afps::combat::Vec3 v2{triangle.v2_x, triangle.v2_y, triangle.v2_z};
  const afps::combat::Vec3 edge1 = Sub(v1, v0);
  const afps::combat::Vec3 edge2 = Sub(v2, v0);
  const afps::combat::Vec3 pvec = Cross(dir, edge2);
  const double det = Dot(edge1, pvec);
  constexpr double kEps = 1e-8;
  if (std::abs(det) <= kEps) {
    return false;
  }
  const double inv_det = 1.0 / det;
  const afps::combat::Vec3 tvec = Sub(origin, v0);
  const double u = Dot(tvec, pvec) * inv_det;
  if (u < 0.0 || u > 1.0) {
    return false;
  }
  const afps::combat::Vec3 qvec = Cross(tvec, edge1);
  const double v = Dot(dir, qvec) * inv_det;
  if (v < 0.0 || (u + v) > 1.0) {
    return false;
  }
  const double t = Dot(edge2, qvec) * inv_det;
  if (!std::isfinite(t) || t < 0.0 || t > max_distance) {
    return false;
  }
  out_t = t;
  out_normal = Normalize(Cross(edge1, edge2));
  return std::isfinite(out_normal.x) && std::isfinite(out_normal.y) && std::isfinite(out_normal.z);
}

bool RaycastPrefabBvh(const afps::world::CollisionMeshPrefab &prefab,
                      const afps::combat::Vec3 &origin_local, const afps::combat::Vec3 &dir_local,
                      double max_distance, double &out_t, uint32_t &out_triangle_index,
                      afps::combat::Vec3 &out_normal_local) {
  if (prefab.bvh_nodes.empty() || prefab.triangle_indices.empty() || prefab.triangles.empty()) {
    return false;
  }
  double best_t = max_distance;
  uint32_t best_triangle = 0;
  afps::combat::Vec3 best_normal{};
  bool hit = false;

  std::vector<uint32_t> stack;
  stack.reserve(64);
  stack.push_back(0);

  while (!stack.empty()) {
    const uint32_t node_index = stack.back();
    stack.pop_back();
    if (node_index >= prefab.bvh_nodes.size()) {
      continue;
    }
    const auto &node = prefab.bvh_nodes[node_index];
    const WorldAabbBounds node_bounds{node.bounds.min_x, node.bounds.max_x, node.bounds.min_y,
                                      node.bounds.max_y, node.bounds.min_z, node.bounds.max_z};
    const double node_t = RaycastAabb3D(origin_local.x, origin_local.y, origin_local.z, dir_local.x,
                                        dir_local.y, dir_local.z, node_bounds);
    if (!std::isfinite(node_t) || node_t > best_t) {
      continue;
    }

    if (node.leaf) {
      const uint32_t end =
          std::min<uint32_t>(node.end, static_cast<uint32_t>(prefab.triangle_indices.size()));
      for (uint32_t i = node.begin; i < end; ++i) {
        const uint32_t triangle_index = prefab.triangle_indices[i];
        if (triangle_index >= prefab.triangles.size()) {
          continue;
        }
        double tri_t = 0.0;
        afps::combat::Vec3 tri_normal{};
        if (!IntersectTriangle(origin_local, dir_local, prefab.triangles[triangle_index], best_t,
                               tri_t, tri_normal)) {
          continue;
        }
        hit = true;
        best_t = tri_t;
        best_triangle = triangle_index;
        best_normal = tri_normal;
      }
    } else {
      if (node.left < prefab.bvh_nodes.size()) {
        stack.push_back(node.left);
      }
      if (node.right < prefab.bvh_nodes.size()) {
        stack.push_back(node.right);
      }
    }
  }

  if (!hit) {
    return false;
  }
  out_t = best_t;
  out_triangle_index = best_triangle;
  out_normal_local = best_normal;
  return true;
}

WorldHitResult ResolveWorldRaycastAabb(const afps::combat::Vec3 &origin,
                                       const afps::combat::Vec3 &dir,
                                       const afps::sim::SimConfig &config,
                                       const afps::sim::CollisionWorld *world, double max_range,
                                       const afps::sim::RaycastWorldOptions &options) {
  WorldHitResult best;
  best.distance = std::numeric_limits<double>::infinity();
  const double clamped_max_range = (std::isfinite(max_range) && max_range > 0.0)
                                       ? max_range
                                       : std::numeric_limits<double>::infinity();
  afps::sim::RaycastWorldOptions ray_options = options;
  if (!std::isfinite(ray_options.min_t) || ray_options.min_t < 0.0) {
    ray_options.min_t = 0.0;
  }
  if (!std::isfinite(ray_options.max_t) || ray_options.max_t > clamped_max_range) {
    ray_options.max_t = clamped_max_range;
  }
  if (ray_options.max_t < ray_options.min_t) {
    return best;
  }
  const afps::sim::RaycastHit hit = afps::sim::RaycastWorld(
      {origin.x, origin.y, origin.z}, {dir.x, dir.y, dir.z}, config, world, ray_options);
  if (!hit.hit || !std::isfinite(hit.t) || hit.t < 0.0 || hit.t > max_range) {
    return best;
  }
  best.hit = true;
  best.distance = hit.t;
  best.position = {origin.x + dir.x * hit.t, origin.y + dir.y * hit.t, origin.z + dir.z * hit.t};
  afps::combat::Vec3 normal{hit.normal_x, hit.normal_y, hit.normal_z};
  const double normal_len_sq = normal.x * normal.x + normal.y * normal.y + normal.z * normal.z;
  if (!std::isfinite(normal_len_sq) || normal_len_sq <= 1e-12) {
    normal = {-dir.x, -dir.y, -dir.z};
  }
  best.normal = normal;
  best.surface = ToSurfaceType(hit.surface_type);
  best.collider_id = hit.collider_id;
  best.backend = WorldHitResult::Backend::Aabb;
  best.instance_id = 0;
  best.face_id = -1;
  best.prefab_id.clear();
  return best;
}
} // namespace

bool WorldHitAllowsAabbFallback(const WorldHitFallbackPolicyInput &input) {
  if (!input.aabb_hit) {
    return false;
  }
  switch (input.backend_mode) {
  case WorldHitBackendMode::Aabb:
    return true;
  case WorldHitBackendMode::Hybrid:
    return !input.mesh_hit;
  case WorldHitBackendMode::MeshOnly:
  default:
    if (input.aabb_collider_id > 0) {
      return false;
    }
    return !input.mesh_hit;
  }
}

const char *WorldHitBackendModeName(WorldHitBackendMode mode) {
  switch (mode) {
  case WorldHitBackendMode::Aabb:
    return "aabb";
  case WorldHitBackendMode::Hybrid:
    return "hybrid";
  case WorldHitBackendMode::MeshOnly:
  default:
    return "mesh_only";
  }
}

const char *WorldHitBackendName(WorldHitResult::Backend backend) {
  switch (backend) {
  case WorldHitResult::Backend::MeshBvh:
    return "mesh_bvh";
  case WorldHitResult::Backend::Aabb:
    return "aabb";
  case WorldHitResult::Backend::None:
  default:
    return "none";
  }
}

WorldHitBackendMode ParseWorldHitBackendMode(const char *raw, bool &recognized) {
  recognized = true;
  if (!raw || raw[0] == '\0') {
    return WorldHitBackendMode::MeshOnly;
  }
  std::string value(raw);
  value.erase(std::remove_if(value.begin(), value.end(),
                             [](unsigned char ch) { return std::isspace(ch) != 0; }),
              value.end());
  std::transform(value.begin(), value.end(), value.begin(),
                 [](unsigned char ch) { return static_cast<char>(std::tolower(ch)); });
  if (value == "aabb") {
    return WorldHitBackendMode::Aabb;
  }
  if (value == "hybrid") {
    return WorldHitBackendMode::Hybrid;
  }
  if (value == "mesh_only" || value == "mesh-only" || value == "mesh") {
    return WorldHitBackendMode::MeshOnly;
  }
  recognized = false;
  return WorldHitBackendMode::MeshOnly;
}

WorldHitBackendMode ResolveWorldHitBackendMode() {
  static const WorldHitBackendMode mode = [] {
    bool recognized = false;
    const WorldHitBackendMode parsed =
        ParseWorldHitBackendMode(std::getenv("AFPS_WORLD_HIT_BACKEND"), recognized);
    if (!recognized) {
      std::cerr << "[warn] invalid AFPS_WORLD_HIT_BACKEND; using mesh_only\n";
    }
    return parsed;
  }();
  return mode;
}

SurfaceType ToSurfaceType(uint8_t surface_type) {
  switch (surface_type) {
  case 1:
    return SurfaceType::Metal;
  case 2:
    return SurfaceType::Dirt;
  case 3:
    return SurfaceType::Energy;
  case 0:
  default:
    return SurfaceType::Stone;
  }
}

WorldHitResult
ResolveDetailedWorldRaycast(const afps::combat::Vec3 &origin, const afps::combat::Vec3 &dir,
                            double max_range,
                            const std::vector<afps::world::StaticMeshInstance> &instances,
                            const afps::world::CollisionMeshRegistry &registry,
                            const std::unordered_map<std::string, size_t> &prefab_lookup,
                            const afps::sim::RaycastWorldOptions &options,
                            uint32_t ignore_instance_id, uint32_t only_instance_id) {
  WorldHitResult best;
  best.distance = std::numeric_limits<double>::infinity();
  const double clamped_max_range = (std::isfinite(max_range) && max_range > 0.0)
                                       ? max_range
                                       : std::numeric_limits<double>::infinity();
  double min_t = options.min_t;
  if (!std::isfinite(min_t) || min_t < 0.0) {
    min_t = 0.0;
  }
  double max_t = options.max_t;
  if (!std::isfinite(max_t) || max_t > clamped_max_range) {
    max_t = clamped_max_range;
  }
  if (!std::isfinite(max_t) || max_t < min_t || instances.empty() || registry.prefabs.empty()) {
    return best;
  }

  const afps::combat::Vec3 safe_dir = Normalize(dir);
  if (Dot(safe_dir, safe_dir) <= 1e-12) {
    return best;
  }

  for (const auto &instance : instances) {
    if (only_instance_id > 0 && instance.instance_id != only_instance_id) {
      continue;
    }
    if (ignore_instance_id > 0 && instance.instance_id == ignore_instance_id) {
      continue;
    }
    const auto lookup_iter = prefab_lookup.find(instance.prefab_id);
    if (lookup_iter == prefab_lookup.end()) {
      continue;
    }
    const size_t prefab_index = lookup_iter->second;
    if (prefab_index >= registry.prefabs.size()) {
      continue;
    }
    const auto &prefab = registry.prefabs[prefab_index];
    if (prefab.triangles.empty() || prefab.bvh_nodes.empty()) {
      continue;
    }

    const WorldAabbBounds bounds = BuildWorldBounds(instance, prefab.bounds);
    const double t_aabb =
        RaycastAabb3D(origin.x, origin.y, origin.z, safe_dir.x, safe_dir.y, safe_dir.z, bounds);
    if (!std::isfinite(t_aabb) || t_aabb > max_t || t_aabb >= best.distance) {
      continue;
    }

    const afps::combat::Vec3 origin_local = TransformWorldToLocalPoint(instance, origin);
    const afps::combat::Vec3 dir_local = TransformWorldToLocalDirection(instance, safe_dir);
    double tri_t = std::min(max_t, best.distance);
    uint32_t triangle_index = 0;
    afps::combat::Vec3 local_normal{};
    if (!RaycastPrefabBvh(prefab, origin_local, dir_local, tri_t, tri_t, triangle_index,
                          local_normal)) {
      continue;
    }
    if (!std::isfinite(tri_t) || tri_t < min_t || tri_t > max_t) {
      continue;
    }

    const afps::combat::Vec3 local_hit{origin_local.x + dir_local.x * tri_t,
                                       origin_local.y + dir_local.y * tri_t,
                                       origin_local.z + dir_local.z * tri_t};
    afps::combat::Vec3 normal = TransformLocalToWorldNormal(instance, local_normal);
    if (Dot(normal, safe_dir) > 0.0) {
      normal = {-normal.x, -normal.y, -normal.z};
    }

    best.hit = true;
    best.distance = tri_t;
    best.position = TransformLocalToWorldPoint(instance, local_hit);
    best.normal = normal;
    best.surface = ToSurfaceType(prefab.surface_type);
    best.collider_id = instance.first_collider_id > 0 ? instance.first_collider_id : 0;
    best.backend = WorldHitResult::Backend::MeshBvh;
    best.instance_id = instance.instance_id;
    best.face_id = static_cast<int>(triangle_index);
    best.prefab_id = prefab.id;
  }
  return best;
}

WorldHitResult
ResolveWorldRaycast(const afps::combat::Vec3 &origin, const afps::combat::Vec3 &dir,
                    const afps::sim::SimConfig &config, const afps::sim::CollisionWorld *world,
                    const std::vector<afps::world::StaticMeshInstance> &instances,
                    const afps::world::CollisionMeshRegistry &registry,
                    const std::unordered_map<std::string, size_t> &prefab_lookup,
                    bool collision_mesh_enabled, double max_range, WorldHitBackendMode backend_mode,
                    const std::unordered_map<int, uint32_t> *collider_instance_lookup,
                    const afps::sim::RaycastWorldOptions &options, uint32_t ignore_instance_id) {
  const WorldHitResult aabb_hit =
      ResolveWorldRaycastAabb(origin, dir, config, world, max_range, options);
  if (backend_mode == WorldHitBackendMode::Aabb || !collision_mesh_enabled) {
    return aabb_hit;
  }

  uint32_t resolved_ignore_instance_id = ignore_instance_id;
  if (resolved_ignore_instance_id == 0 && options.ignore_collider_id > 0) {
    if (collider_instance_lookup) {
      const auto lookup_iter = collider_instance_lookup->find(options.ignore_collider_id);
      if (lookup_iter != collider_instance_lookup->end()) {
        resolved_ignore_instance_id = lookup_iter->second;
      }
    }
    if (resolved_ignore_instance_id == 0) {
      for (const auto &instance : instances) {
        if (instance.first_collider_id <= 0 ||
            instance.last_collider_id < instance.first_collider_id) {
          continue;
        }
        if (options.ignore_collider_id >= instance.first_collider_id &&
            options.ignore_collider_id <= instance.last_collider_id) {
          resolved_ignore_instance_id = instance.instance_id;
          break;
        }
      }
    }
  }

  const WorldHitResult mesh_hit =
      ResolveDetailedWorldRaycast(origin, dir, max_range, instances, registry, prefab_lookup,
                                  options, resolved_ignore_instance_id);
  if (!mesh_hit.hit) {
    const WorldHitFallbackPolicyInput fallback_input{
        backend_mode,
        aabb_hit.hit,
        aabb_hit.collider_id,
        false,
    };
    if (WorldHitAllowsAabbFallback(fallback_input)) {
      return aabb_hit;
    }
    WorldHitResult no_hit;
    no_hit.distance = (std::isfinite(max_range) && max_range > 0.0) ? max_range : 0.0;
    return no_hit;
  }

  if (aabb_hit.hit && aabb_hit.collider_id <= 0 &&
      aabb_hit.distance + kShotRetraceEpsilonMeters < mesh_hit.distance) {
    return aabb_hit;
  }

  return mesh_hit;
}

} // namespace afps::server
