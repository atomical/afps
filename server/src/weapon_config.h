#pragma once

#include <filesystem>
#include <string>

#include "weapons/weapon_defs.h"

namespace afps::weapons {

std::filesystem::path ResolveWeaponConfigPath();
WeaponConfig LoadWeaponConfig(const std::filesystem::path &path, std::string &error);
bool ValidateWeaponConfig(const WeaponConfig &config, std::string &error);

}  // namespace afps::weapons
