#include "doctest.h"

#include "map_world.h"
#include "world_collision_mesh.h"

#include <filesystem>
#include <fstream>

TEST_CASE("LoadCollisionMeshRegistry parses and normalizes prefab ids") {
  const std::filesystem::path temp_path =
      std::filesystem::temp_directory_path() / "afps_collision_mesh_registry_test.json";
  std::ofstream out(temp_path);
  REQUIRE(out.is_open());
  out << R"json({
    "version": 1,
    "sourceAssetPack": "test-pack",
    "prefabs": [
      {
        "id": "Building-Type-B.GLB",
        "triangleCount": 44,
        "surfaceType": 1,
        "bounds": { "min": [-2, -1, 0], "max": [2, 1, 3] }
      },
      {
        "id": "building-type-a.glb",
        "triangleCount": 12,
        "surfaceType": 1,
        "bounds": { "min": [-1, -1, 0], "max": [1, 1, 2] },
        "triangles": [
          [[0, 0, 0], [1, 0, 0], [0, 1, 0]]
        ]
      }
    ]
  })json";
  out.close();

  afps::world::CollisionMeshRegistry registry;
  std::string error;
  REQUIRE(afps::world::LoadCollisionMeshRegistry(temp_path.string(), registry, error));
  CHECK(error.empty());
  REQUIRE(registry.prefabs.size() == 2);
  CHECK(registry.prefabs[0].id == "building-type-a.glb");
  CHECK(registry.prefabs[1].id == "building-type-b.glb");
  CHECK(registry.prefabs[0].triangle_count == 1);
  CHECK(registry.prefabs[1].triangle_count == 12);
  CHECK(registry.prefabs[0].has_explicit_triangles);
  CHECK_FALSE(registry.prefabs[1].has_explicit_triangles);
  CHECK_FALSE(registry.prefabs[0].bvh_nodes.empty());
  CHECK_FALSE(registry.prefabs[1].bvh_nodes.empty());

  const auto missing = afps::world::FindMissingCollisionMeshPrefabs(
      registry, {"building-type-a.glb", "building-type-c.glb", "Building-Type-B.GLB"});
  REQUIRE(missing.size() == 1);
  CHECK(missing[0] == "building-type-c.glb");

  const auto checksum_a = afps::world::ComputeCollisionMeshRegistryChecksum(registry);
  const auto checksum_b = afps::world::ComputeCollisionMeshRegistryChecksum(registry);
  CHECK(checksum_a == checksum_b);

  std::error_code ec;
  std::filesystem::remove(temp_path, ec);
}

TEST_CASE("Bundled collision mesh registry covers generated map prefabs") {
  afps::world::CollisionMeshRegistry registry;
  std::string error;
  REQUIRE(afps::world::LoadCollisionMeshRegistry(registry, error));
  CHECK(error.empty());
  CHECK(registry.prefabs.size() >= 21);
  uint64_t total_triangles = 0;
  for (const auto &prefab : registry.prefabs) {
    CHECK(prefab.triangle_count >= 64);
    CHECK(prefab.triangle_count == prefab.triangles.size());
    CHECK_FALSE(prefab.triangles.empty());
    CHECK(prefab.has_explicit_triangles);
    CHECK_FALSE(prefab.bvh_nodes.empty());
    total_triangles += prefab.triangle_count;
  }
  CHECK(total_triangles >= 50000);

  const auto config = afps::sim::kDefaultSimConfig;
  const auto legacy_world = afps::world::GenerateMapWorld(config, 1234u, 60);
  const auto legacy_missing = afps::world::FindMissingCollisionMeshPrefabs(
      registry, legacy_world.building_prefab_ids);
  CHECK(legacy_missing.empty());

  const std::filesystem::path test_file = __FILE__;
  const std::filesystem::path root = test_file.parent_path().parent_path().parent_path();
  const std::filesystem::path manifest =
      root / "client/public/assets/environments/cc0/kenney_city_kit_suburban_20/map.json";

  afps::world::MapWorldOptions options;
  options.mode = afps::world::MapWorldMode::Static;
  options.static_manifest_path = manifest.string();

  const auto static_world = afps::world::GenerateMapWorld(config, 0u, 60, options);
  const auto static_missing = afps::world::FindMissingCollisionMeshPrefabs(
      registry, static_world.building_prefab_ids);
  CHECK(static_missing.empty());
}
