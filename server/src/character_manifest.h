#pragma once

#include <filesystem>
#include <string>
#include <vector>

std::vector<std::string> LoadCharacterManifestIds(const std::filesystem::path &path,
                                                  std::string &error);
