#include "doctest.h"

#include "map_world.h"

#include <algorithm>
#include <filesystem>

TEST_CASE("GenerateMapWorld is deterministic for seed") {
  const auto config = afps::sim::kDefaultSimConfig;
  const auto a = afps::world::GenerateMapWorld(config, 1234u, 60);
  const auto b = afps::world::GenerateMapWorld(config, 1234u, 60);

  REQUIRE(a.collision_world.colliders.size() == b.collision_world.colliders.size());
  REQUIRE(a.pickups.size() == b.pickups.size());
  REQUIRE(a.building_prefab_ids == b.building_prefab_ids);
  REQUIRE(a.static_mesh_instances.size() == b.static_mesh_instances.size());

  for (size_t i = 0; i < a.collision_world.colliders.size(); ++i) {
    const auto &ca = a.collision_world.colliders[i];
    const auto &cb = b.collision_world.colliders[i];
    CHECK(ca.id == cb.id);
    CHECK(ca.min_x == doctest::Approx(cb.min_x));
    CHECK(ca.max_x == doctest::Approx(cb.max_x));
    CHECK(ca.min_y == doctest::Approx(cb.min_y));
    CHECK(ca.max_y == doctest::Approx(cb.max_y));
    CHECK(ca.min_z == doctest::Approx(cb.min_z));
    CHECK(ca.max_z == doctest::Approx(cb.max_z));
    CHECK(ca.surface_type == cb.surface_type);
  }

  for (size_t i = 0; i < a.pickups.size(); ++i) {
    const auto &pa = a.pickups[i];
    const auto &pb = b.pickups[i];
    CHECK(pa.id == pb.id);
    CHECK(pa.kind == pb.kind);
    CHECK(pa.position.x == doctest::Approx(pb.position.x));
    CHECK(pa.position.y == doctest::Approx(pb.position.y));
    CHECK(pa.position.z == doctest::Approx(pb.position.z));
    CHECK(pa.radius == doctest::Approx(pb.radius));
    CHECK(pa.respawn_ticks == pb.respawn_ticks);
  }

  for (size_t i = 0; i < a.static_mesh_instances.size(); ++i) {
    const auto &ia = a.static_mesh_instances[i];
    const auto &ib = b.static_mesh_instances[i];
    CHECK(ia.instance_id == ib.instance_id);
    CHECK(ia.prefab_id == ib.prefab_id);
    CHECK(ia.center_x == doctest::Approx(ib.center_x));
    CHECK(ia.center_y == doctest::Approx(ib.center_y));
    CHECK(ia.base_z == doctest::Approx(ib.base_z));
    CHECK(ia.yaw_quarter_turns == ib.yaw_quarter_turns);
    CHECK(ia.scale == doctest::Approx(ib.scale));
    CHECK(ia.first_collider_id == ib.first_collider_id);
    CHECK(ia.last_collider_id == ib.last_collider_id);
    CHECK(ia.first_collider_id > 0);
    CHECK(ia.last_collider_id >= ia.first_collider_id);
  }
}

TEST_CASE("GenerateMapWorld varies with seed and includes pickups") {
  const auto config = afps::sim::kDefaultSimConfig;
  const auto a = afps::world::GenerateMapWorld(config, 111u, 60);
  const auto b = afps::world::GenerateMapWorld(config, 222u, 60);

  CHECK(a.collision_world.colliders.size() > 0);
  CHECK(b.collision_world.colliders.size() > 0);
  CHECK(a.pickups.size() >= 6);
  CHECK(b.pickups.size() >= 6);
  CHECK_FALSE(a.building_prefab_ids.empty());
  CHECK_FALSE(b.building_prefab_ids.empty());
  CHECK_FALSE(a.static_mesh_instances.empty());
  CHECK_FALSE(b.static_mesh_instances.empty());

  const auto different = a.collision_world.colliders.size() != b.collision_world.colliders.size() ||
                         (!a.collision_world.colliders.empty() && !b.collision_world.colliders.empty() &&
                          (a.collision_world.colliders.front().min_x != b.collision_world.colliders.front().min_x ||
                           a.collision_world.colliders.front().min_y != b.collision_world.colliders.front().min_y));
  CHECK(different);

  const auto health_count = std::count_if(a.pickups.begin(), a.pickups.end(), [](const afps::world::PickupSpawn &pickup) {
    return pickup.kind == afps::world::PickupKind::Health;
  });
  const auto weapon_count = std::count_if(a.pickups.begin(), a.pickups.end(), [](const afps::world::PickupSpawn &pickup) {
    return pickup.kind == afps::world::PickupKind::Weapon;
  });
  CHECK(health_count >= 4);
  CHECK(weapon_count >= 2);
  for (const auto &pickup : a.pickups) {
    CHECK(pickup.respawn_ticks > 0);
  }

  for (const auto &collider : a.collision_world.colliders) {
    const double width = collider.max_x - collider.min_x;
    const double depth = collider.max_y - collider.min_y;
    CHECK(width <= 4.9);
    CHECK(depth <= 4.9);
  }
}

TEST_CASE("GenerateMapWorld keeps center road spawnable") {
  const auto config = afps::sim::kDefaultSimConfig;
  const auto map = afps::world::GenerateMapWorld(config, 0u, 60);
  const double radius = std::max(0.0, config.player_radius);
  const double player_min_z = 0.0;
  const double player_max_z = player_min_z + std::max(0.01, config.player_height);

  for (const auto &collider : map.collision_world.colliders) {
    if (!afps::sim::IsValidAabbCollider(collider)) {
      continue;
    }
    if (player_max_z <= collider.min_z || player_min_z >= collider.max_z) {
      continue;
    }
    const bool overlaps_x = 0.0 >= collider.min_x - radius && 0.0 <= collider.max_x + radius;
    const bool overlaps_y = 0.0 >= collider.min_y - radius && 0.0 <= collider.max_y + radius;
    const bool overlaps_spawn = overlaps_x && overlaps_y;
    CHECK_FALSE(overlaps_spawn);
  }
}

TEST_CASE("GenerateMapWorld static mode loads colliders from manifest") {
  const auto config = afps::sim::kDefaultSimConfig;
  const std::filesystem::path test_file = __FILE__;
  const std::filesystem::path root = test_file.parent_path().parent_path().parent_path();
  const std::filesystem::path manifest =
      root / "client/public/assets/environments/cc0/kenney_city_kit_suburban_20/map.json";
  afps::world::MapWorldOptions options;
  options.mode = afps::world::MapWorldMode::Static;
  options.static_manifest_path = manifest.string();

  const auto generated = afps::world::GenerateMapWorld(config, 0u, 60, options);
  CHECK(generated.collision_world.colliders.size() > 0);
  CHECK(generated.pickups.size() >= 6);
  CHECK_FALSE(generated.building_prefab_ids.empty());
  CHECK_FALSE(generated.static_mesh_instances.empty());
}
