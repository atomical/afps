#pragma once

#include <string>
#include <unordered_map>
#include <vector>

namespace afps::weapons {

enum class WeaponKind {
  kHitscan,
  kProjectile,
};

enum class FireMode {
  kSemi,
  kFullAuto,
};

struct Vec3 {
  double x = 0.0;
  double y = 0.0;
  double z = 0.0;
};

struct CasingEjectDef {
  Vec3 local_offset{};
  Vec3 local_rotation{};
  Vec3 velocity_min{};
  Vec3 velocity_max{};
  Vec3 angular_velocity_min{};
  Vec3 angular_velocity_max{};
  double lifetime_seconds = 0.0;
};

struct WeaponSounds {
  std::string fire;
  std::string fire_variant2;
  std::string dry_fire;
  std::string reload;
  std::string equip;
  std::string casing_impact1;
  std::string casing_impact2;
};

struct WeaponDef {
  std::string id;
  std::string display_name;
  WeaponKind kind;
  double damage;
  double spread_deg;
  double range;
  double projectile_speed;
  double explosion_radius;
  int max_ammo_in_mag;
  double cooldown_seconds;
  FireMode fire_mode;
  bool eject_shells_while_firing;
  double reload_seconds;
  std::string sfx_profile;
  CasingEjectDef casing;
  WeaponSounds sounds;
};

struct WeaponConfig {
  std::vector<WeaponDef> weapons;
  std::vector<std::string> slots;
  std::unordered_map<std::string, size_t> index_by_id;
};

inline WeaponConfig BuildDefaultWeaponConfig() {
  WeaponConfig config;
  config.slots = {"rifle", "launcher"};
  config.weapons = {
      WeaponDef{
          "rifle",
          "Rifle",
          WeaponKind::kHitscan,
          12.0,
          1.5,
          60.0,
          0.0,
          0.0,
          30,
          0.125,
          FireMode::kFullAuto,
          true,
          0.95,
          "AR_556",
          CasingEjectDef{
              Vec3{0.16, 0.05, 0.12},
              Vec3{0.0, 1.57, 0.0},
              Vec3{0.6, 1.1, -0.2},
              Vec3{1.3, 1.8, 0.25},
              Vec3{-8.0, -4.0, -6.0},
              Vec3{8.0, 4.0, 6.0},
              2.6},
          WeaponSounds{"weapon:rifle:fire:0",
                       "weapon:rifle:fire:1",
                       "weapon:rifle:dry",
                       "weapon:rifle:reload",
                       "weapon:rifle:equip",
                       "casing:impact:1",
                       "casing:impact:2"}},
      WeaponDef{
          "launcher",
          "Launcher",
          WeaponKind::kProjectile,
          80.0,
          0.0,
          0.0,
          22.0,
          4.5,
          6,
          1.0,
          FireMode::kSemi,
          false,
          1.1,
          "GRENADE_LAUNCHER",
          CasingEjectDef{
              Vec3{0.18, 0.06, 0.14},
              Vec3{0.0, 1.57, 0.0},
              Vec3{0.5, 0.9, -0.15},
              Vec3{1.1, 1.5, 0.2},
              Vec3{-7.0, -3.5, -5.0},
              Vec3{7.0, 3.5, 5.0},
              2.8},
          WeaponSounds{"weapon:launcher:fire:0",
                       "weapon:launcher:fire:1",
                       "weapon:launcher:dry",
                       "weapon:launcher:reload",
                       "weapon:launcher:equip",
                       "casing:impact:1",
                       "casing:impact:2"}},
  };
  for (size_t i = 0; i < config.weapons.size(); ++i) {
    config.index_by_id[config.weapons[i].id] = i;
  }
  return config;
}

inline const WeaponDef *ResolveWeaponSlot(const WeaponConfig &config, int slot) {
  if (config.slots.empty()) {
    return nullptr;
  }
  if (slot < 0) {
    slot = 0;
  }
  const size_t index = static_cast<size_t>(slot);
  const size_t clamped = std::min(index, config.slots.size() - 1);
  const auto &id = config.slots[clamped];
  auto iter = config.index_by_id.find(id);
  if (iter == config.index_by_id.end()) {
    return nullptr;
  }
  return &config.weapons[iter->second];
}

inline const WeaponDef *FindWeaponById(const WeaponConfig &config, const std::string &id) {
  auto iter = config.index_by_id.find(id);
  if (iter == config.index_by_id.end()) {
    return nullptr;
  }
  return &config.weapons[iter->second];
}

}  // namespace afps::weapons
