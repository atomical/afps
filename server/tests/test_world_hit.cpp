#include "doctest.h"

#include "world_hit.h"

#include <cmath>
#include <string>
#include <unordered_map>
#include <vector>

namespace {
constexpr const char *kPrefabId = "building-type-test.glb";

afps::world::CollisionMeshRegistry MakeCollisionMeshRegistry(bool with_triangle) {
  afps::world::CollisionMeshRegistry registry;
  registry.version = 1;

  afps::world::CollisionMeshPrefab prefab;
  prefab.id = kPrefabId;
  prefab.surface_type = static_cast<uint8_t>(SurfaceType::Metal);
  prefab.has_explicit_triangles = true;
  prefab.bounds.min_x = 0.0;
  prefab.bounds.min_y = -1.0;
  prefab.bounds.min_z = 0.0;
  prefab.bounds.max_x = 3.0;
  prefab.bounds.max_y = 1.0;
  prefab.bounds.max_z = 2.0;

  if (with_triangle) {
    prefab.triangle_count = 1;
    prefab.triangles.push_back({1.0, -1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 0.0, 2.0});
    prefab.triangle_indices.push_back(0);
    afps::world::CollisionMeshPrefab::BvhNode node;
    node.bounds = prefab.bounds;
    node.begin = 0;
    node.end = 1;
    node.leaf = true;
    prefab.bvh_nodes.push_back(node);
  }

  registry.prefabs.push_back(prefab);
  return registry;
}

std::vector<afps::world::StaticMeshInstance> MakeInstances() {
  afps::world::StaticMeshInstance instance;
  instance.instance_id = 77;
  instance.prefab_id = kPrefabId;
  instance.center_x = 0.0;
  instance.center_y = 0.0;
  instance.base_z = 0.0;
  instance.yaw_quarter_turns = 0;
  instance.scale = 1.0;
  instance.first_collider_id = 42;
  instance.last_collider_id = 42;
  return {instance};
}

std::unordered_map<std::string, size_t> MakePrefabLookup() {
  return {{kPrefabId, 0}};
}

afps::sim::CollisionWorld MakeCoarseWorldCollider() {
  afps::sim::CollisionWorld world;
  afps::sim::AddAabbCollider(world, {42, 0.0, -1.0, 0.0, 3.0, 1.0, 2.0, 1, 0});
  return world;
}

afps::sim::SimConfig MakeWorldHitConfig() {
  afps::sim::SimConfig config = afps::sim::kDefaultSimConfig;
  config.arena_half_size = 0.0;
  config.obstacle_min_x = 0.0;
  config.obstacle_max_x = 0.0;
  config.obstacle_min_y = 0.0;
  config.obstacle_max_y = 0.0;
  return config;
}
} // namespace

TEST_CASE("mesh_only world raycast rejects building AABB when mesh misses") {
  const auto registry = MakeCollisionMeshRegistry(false);
  const auto instances = MakeInstances();
  const auto prefab_lookup = MakePrefabLookup();
  const auto world = MakeCoarseWorldCollider();
  const auto config = MakeWorldHitConfig();

  const afps::combat::Vec3 origin{-1.0, 0.0, 1.0};
  const afps::combat::Vec3 dir{1.0, 0.0, 0.0};
  const auto hit = afps::server::ResolveWorldRaycast(origin, dir, config, &world, instances,
                                                     registry, prefab_lookup, true, 5.0,
                                                     afps::server::WorldHitBackendMode::MeshOnly);
  CHECK_FALSE(hit.hit);
}

TEST_CASE("mesh_only world raycast returns detailed mesh hit") {
  const auto registry = MakeCollisionMeshRegistry(true);
  const auto instances = MakeInstances();
  const auto prefab_lookup = MakePrefabLookup();
  const auto world = MakeCoarseWorldCollider();
  const auto config = MakeWorldHitConfig();

  const afps::combat::Vec3 origin{-1.0, 0.0, 1.0};
  const afps::combat::Vec3 dir{1.0, 0.0, 0.0};
  const auto hit = afps::server::ResolveWorldRaycast(origin, dir, config, &world, instances,
                                                     registry, prefab_lookup, true, 5.0,
                                                     afps::server::WorldHitBackendMode::MeshOnly);
  REQUIRE(hit.hit);
  CHECK(hit.backend == afps::server::WorldHitResult::Backend::MeshBvh);
  CHECK(hit.distance == doctest::Approx(2.0));
  CHECK(hit.position.x == doctest::Approx(1.0));
  CHECK(hit.position.y == doctest::Approx(0.0));
  CHECK(hit.position.z == doctest::Approx(1.0));
  CHECK(hit.normal.x == doctest::Approx(-1.0));
  CHECK(hit.surface == SurfaceType::Metal);
  CHECK(hit.collider_id == 42);
  CHECK(hit.instance_id == 77);
  CHECK(hit.face_id == 0);
  CHECK(hit.prefab_id == kPrefabId);
}
