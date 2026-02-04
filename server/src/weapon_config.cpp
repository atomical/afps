#include "weapon_config.h"

#include <fstream>
#include <unordered_set>

#include <nlohmann/json.hpp>

namespace {
std::string ToError(const std::string &message) {
  return "weapon_config: " + message;
}

bool ReadString(const nlohmann::json &obj, const char *key, std::string &out) {
  auto iter = obj.find(key);
  if (iter == obj.end() || !iter->is_string()) {
    return false;
  }
  out = iter->get<std::string>();
  return !out.empty();
}

bool ReadNumber(const nlohmann::json &obj, const char *key, double &out) {
  auto iter = obj.find(key);
  if (iter == obj.end() || !iter->is_number()) {
    return false;
  }
  out = iter->get<double>();
  return std::isfinite(out);
}

bool ReadInt(const nlohmann::json &obj, const char *key, int &out) {
  auto iter = obj.find(key);
  if (iter == obj.end() || !iter->is_number_integer()) {
    return false;
  }
  out = iter->get<int>();
  return true;
}

bool ReadVec3(const nlohmann::json &obj, const char *key, afps::weapons::Vec3 &out) {
  auto iter = obj.find(key);
  if (iter == obj.end() || !iter->is_array() || iter->size() != 3) {
    return false;
  }
  const auto &arr = *iter;
  if (!arr[0].is_number() || !arr[1].is_number() || !arr[2].is_number()) {
    return false;
  }
  out.x = arr[0].get<double>();
  out.y = arr[1].get<double>();
  out.z = arr[2].get<double>();
  return std::isfinite(out.x) && std::isfinite(out.y) && std::isfinite(out.z);
}

bool ReadSound(const nlohmann::json &obj, const char *key, std::string &out, bool required) {
  if (!ReadString(obj, key, out)) {
    return !required;
  }
  return true;
}

bool ParseWeaponKind(const std::string &value, afps::weapons::WeaponKind &out) {
  if (value == "hitscan") {
    out = afps::weapons::WeaponKind::kHitscan;
    return true;
  }
  if (value == "projectile") {
    out = afps::weapons::WeaponKind::kProjectile;
    return true;
  }
  return false;
}

bool ParseFireMode(const std::string &value, afps::weapons::FireMode &out) {
  if (value == "SEMI") {
    out = afps::weapons::FireMode::kSemi;
    return true;
  }
  if (value == "FULL_AUTO") {
    out = afps::weapons::FireMode::kFullAuto;
    return true;
  }
  return false;
}
}  // namespace

namespace afps::weapons {

std::filesystem::path ResolveWeaponConfigPath() {
  auto path = std::filesystem::current_path();
  for (int i = 0; i < 5; ++i) {
    auto candidate = path / "shared/weapons/config.json";
    if (std::filesystem::exists(candidate)) {
      return candidate;
    }
    if (!path.has_parent_path()) {
      break;
    }
    path = path.parent_path();
  }
  return {};
}

static WeaponConfig BuildConfigFromWeapons(std::vector<WeaponDef> weapons,
                                           const std::vector<std::string> &slots) {
  WeaponConfig config;
  config.weapons = std::move(weapons);
  config.slots = slots;
  config.index_by_id.clear();
  for (size_t i = 0; i < config.weapons.size(); ++i) {
    config.index_by_id[config.weapons[i].id] = i;
  }
  return config;
}

WeaponConfig LoadWeaponConfig(const std::filesystem::path &path, std::string &error) {
  error.clear();
  if (path.empty()) {
    error = ToError("path_not_found");
    return BuildDefaultWeaponConfig();
  }
  std::ifstream stream(path);
  if (!stream.is_open()) {
    error = ToError("file_not_found");
    return BuildDefaultWeaponConfig();
  }

  nlohmann::json data;
  try {
    stream >> data;
  } catch (const std::exception &exc) {
    error = ToError(std::string("parse_failed: ") + exc.what());
    return BuildDefaultWeaponConfig();
  }

  if (!data.is_object()) {
    error = ToError("invalid_root");
    return BuildDefaultWeaponConfig();
  }

  auto weapons_json = data.find("weapons");
  if (weapons_json == data.end() || !weapons_json->is_array()) {
    error = ToError("weapons_missing");
    return BuildDefaultWeaponConfig();
  }

  std::vector<WeaponDef> weapons;
  std::unordered_set<std::string> seen_ids;
  for (const auto &entry : *weapons_json) {
    if (!entry.is_object()) {
      continue;
    }
    WeaponDef def;
    if (!ReadString(entry, "id", def.id)) {
      continue;
    }
    if (seen_ids.count(def.id) > 0) {
      continue;
    }
    seen_ids.insert(def.id);
    ReadString(entry, "displayName", def.display_name);
    if (def.display_name.empty()) {
      def.display_name = def.id;
    }
    std::string kind_value;
    if (!ReadString(entry, "kind", kind_value) || !ParseWeaponKind(kind_value, def.kind)) {
      continue;
    }
    if (!ReadNumber(entry, "damage", def.damage) || def.damage <= 0.0) {
      continue;
    }
    if (!ReadNumber(entry, "spreadDeg", def.spread_deg) || def.spread_deg < 0.0) {
      continue;
    }
    if (!ReadNumber(entry, "range", def.range) || def.range < 0.0) {
      continue;
    }
    if (!ReadNumber(entry, "projectileSpeed", def.projectile_speed) || def.projectile_speed < 0.0) {
      continue;
    }
    if (!ReadNumber(entry, "explosionRadius", def.explosion_radius) || def.explosion_radius < 0.0) {
      continue;
    }
    if (!ReadInt(entry, "maxAmmoInMag", def.max_ammo_in_mag) || def.max_ammo_in_mag <= 0) {
      continue;
    }
    if (!ReadNumber(entry, "cooldownSeconds", def.cooldown_seconds) || def.cooldown_seconds <= 0.0) {
      continue;
    }
    std::string fire_mode;
    if (!ReadString(entry, "fireMode", fire_mode) || !ParseFireMode(fire_mode, def.fire_mode)) {
      continue;
    }
    def.eject_shells_while_firing =
        entry.contains("ejectShellsWhileFiring") ? entry["ejectShellsWhileFiring"].get<bool>() : false;
    if (!ReadNumber(entry, "reloadSeconds", def.reload_seconds) || def.reload_seconds <= 0.0) {
      continue;
    }
    ReadString(entry, "sfxProfile", def.sfx_profile);
    if (def.sfx_profile.empty()) {
      continue;
    }
    auto casing_iter = entry.find("casingEject");
    if (casing_iter == entry.end() || !casing_iter->is_object()) {
      continue;
    }
    const auto &casing_json = *casing_iter;
    if (!ReadVec3(casing_json, "localOffset", def.casing.local_offset) ||
        !ReadVec3(casing_json, "localRotation", def.casing.local_rotation) ||
        !ReadVec3(casing_json, "velocityMin", def.casing.velocity_min) ||
        !ReadVec3(casing_json, "velocityMax", def.casing.velocity_max) ||
        !ReadVec3(casing_json, "angularVelocityMin", def.casing.angular_velocity_min) ||
        !ReadVec3(casing_json, "angularVelocityMax", def.casing.angular_velocity_max) ||
        !ReadNumber(casing_json, "lifetimeSeconds", def.casing.lifetime_seconds) ||
        def.casing.lifetime_seconds <= 0.0) {
      continue;
    }
    auto sounds_iter = entry.find("sounds");
    if (sounds_iter == entry.end() || !sounds_iter->is_object()) {
      continue;
    }
    const auto &sounds_json = *sounds_iter;
    if (!ReadSound(sounds_json, "fire", def.sounds.fire, true) ||
        !ReadSound(sounds_json, "dryFire", def.sounds.dry_fire, true) ||
        !ReadSound(sounds_json, "reload", def.sounds.reload, true)) {
      continue;
    }
    ReadSound(sounds_json, "fireVariant2", def.sounds.fire_variant2, false);
    ReadSound(sounds_json, "equip", def.sounds.equip, false);
    ReadSound(sounds_json, "casingImpact1", def.sounds.casing_impact1, false);
    ReadSound(sounds_json, "casingImpact2", def.sounds.casing_impact2, false);
    weapons.push_back(def);
  }

  if (weapons.empty()) {
    error = ToError("no_valid_weapons");
    return BuildDefaultWeaponConfig();
  }

  std::vector<std::string> slots;
  auto slots_json = data.find("slots");
  if (slots_json != data.end() && slots_json->is_array()) {
    for (const auto &slot : *slots_json) {
      if (!slot.is_string()) {
        continue;
      }
      const std::string value = slot.get<std::string>();
      if (!value.empty()) {
        slots.push_back(value);
      }
    }
  }
  if (slots.empty()) {
    for (const auto &weapon : weapons) {
      slots.push_back(weapon.id);
    }
  }

  WeaponConfig config = BuildConfigFromWeapons(std::move(weapons), slots);
  std::string validate_error;
  if (!ValidateWeaponConfig(config, validate_error)) {
    error = validate_error;
    return BuildDefaultWeaponConfig();
  }
  return config;
}

bool ValidateWeaponConfig(const WeaponConfig &config, std::string &error) {
  error.clear();
  if (config.weapons.empty()) {
    error = ToError("empty_weapons");
    return false;
  }
  if (config.slots.empty()) {
    error = ToError("empty_slots");
    return false;
  }
  for (const auto &slot : config.slots) {
    if (config.index_by_id.find(slot) == config.index_by_id.end()) {
      error = ToError("slot_missing_weapon");
      return false;
    }
  }
  for (const auto &weapon : config.weapons) {
    if (weapon.id.empty() || weapon.display_name.empty()) {
      error = ToError("missing_id");
      return false;
    }
    if (weapon.damage <= 0.0 || weapon.cooldown_seconds <= 0.0 || weapon.max_ammo_in_mag <= 0 ||
        weapon.reload_seconds <= 0.0) {
      error = ToError("invalid_numeric_fields");
      return false;
    }
    if (weapon.sounds.fire.empty() || weapon.sounds.dry_fire.empty() || weapon.sounds.reload.empty()) {
      error = ToError("missing_sound_keys");
      return false;
    }
    if (weapon.casing.lifetime_seconds <= 0.0) {
      error = ToError("invalid_casing_lifetime");
      return false;
    }
  }
  return true;
}

}  // namespace afps::weapons
