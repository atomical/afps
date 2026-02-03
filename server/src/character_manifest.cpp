#include "character_manifest.h"

#include <fstream>
#include <unordered_set>

#include <nlohmann/json.hpp>

namespace {
std::string ToError(const std::string &message) {
  return "character_manifest: " + message;
}
}

std::vector<std::string> LoadCharacterManifestIds(const std::filesystem::path &path,
                                                  std::string &error) {
  error.clear();
  std::ifstream stream(path);
  if (!stream.is_open()) {
    error = ToError("file_not_found");
    return {};
  }

  nlohmann::json data;
  try {
    stream >> data;
  } catch (const std::exception &exc) {
    error = ToError(std::string("parse_failed: ") + exc.what());
    return {};
  }

  if (!data.is_object()) {
    error = ToError("invalid_root");
    return {};
  }

  std::vector<std::string> ids;
  auto entries = data.find("entries");
  if (entries == data.end() || !entries->is_array()) {
    error = ToError("entries_missing");
    return {};
  }

  std::unordered_set<std::string> seen;
  for (const auto &entry : *entries) {
    if (!entry.is_object()) {
      continue;
    }
    auto id = entry.find("id");
    if (id == entry.end() || !id->is_string()) {
      continue;
    }
    const std::string value = id->get<std::string>();
    if (value.empty() || seen.count(value) > 0) {
      continue;
    }
    seen.insert(value);
    ids.push_back(value);
  }

  auto default_id = data.find("defaultId");
  if (default_id != data.end() && default_id->is_string()) {
    const std::string value = default_id->get<std::string>();
    if (!value.empty() && seen.count(value) == 0) {
      seen.insert(value);
      ids.push_back(value);
    }
  }

  if (ids.empty()) {
    error = ToError("no_ids");
  }

  return ids;
}
