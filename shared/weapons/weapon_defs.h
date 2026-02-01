#pragma once

#include <array>
#include <string_view>

namespace afps::weapons {

enum class WeaponKind {
  kHitscan,
  kProjectile,
};

struct WeaponDef {
  std::string_view id;
  std::string_view name;
  WeaponKind kind;
  double damage;
  double fire_rate;
  double spread_deg;
  double range;
  double projectile_speed;
  double explosion_radius;
};

inline constexpr std::array<WeaponDef, 2> kDefaultWeaponDefs{{
    {"rifle", "Rifle", WeaponKind::kHitscan, 12.0, 8.0, 1.5, 60.0, 0.0, 0.0},
    {"launcher", "Launcher", WeaponKind::kProjectile, 80.0, 1.0, 0.0, 0.0, 22.0, 4.5},
}};

}  // namespace afps::weapons
