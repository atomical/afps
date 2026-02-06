#include "config.h"

#include <limits>
#include <sstream>
#include <string>

namespace {
int ParsePort(const std::string &value, std::vector<std::string> &errors) {
  try {
    size_t idx = 0;
    int port = std::stoi(value, &idx);
    if (idx != value.size()) {
      errors.push_back("Invalid port value: " + value);
      return -1;
    }
    if (port <= 0 || port > 65535) {
      errors.push_back("Port out of range: " + value);
      return -1;
    }
    return port;
  } catch (const std::exception &) {
    errors.push_back("Invalid port value: " + value);
    return -1;
  }
}

int ParseNonNegativeInt(const std::string &value, const std::string &label,
                        std::vector<std::string> &errors) {
  try {
    size_t idx = 0;
    int parsed = std::stoi(value, &idx);
    if (idx != value.size()) {
      errors.push_back("Invalid " + label + " value: " + value);
      return -1;
    }
    if (parsed < 0) {
      errors.push_back(label + " must be >= 0");
      return -1;
    }
    return parsed;
  } catch (const std::exception &) {
    errors.push_back("Invalid " + label + " value: " + value);
    return -1;
  }
}

uint32_t ParseUnsigned32(const std::string &value, const std::string &label,
                         std::vector<std::string> &errors, bool &ok) {
  ok = false;
  try {
    size_t idx = 0;
    const unsigned long long parsed = std::stoull(value, &idx);
    if (idx != value.size()) {
      errors.push_back("Invalid " + label + " value: " + value);
      return 0;
    }
    if (parsed > std::numeric_limits<uint32_t>::max()) {
      errors.push_back(label + " out of range: " + value);
      return 0;
    }
    ok = true;
    return static_cast<uint32_t>(parsed);
  } catch (const std::exception &) {
    errors.push_back("Invalid " + label + " value: " + value);
    return 0;
  }
}
}

ParseResult ParseArgs(int argc, const char *const *argv) {
  ParseResult result;

  for (int i = 1; i < argc; ++i) {
    std::string arg = argv[i];
    if (arg == "--help" || arg == "-h") {
      result.config.show_help = true;
      continue;
    }

    auto require_value = [&](const char *flag) -> std::string {
      if (i + 1 >= argc) {
        result.errors.push_back(std::string("Missing value for ") + flag);
        return {};
      }
      return std::string(argv[++i]);
    };

    if (arg == "--host") {
      auto value = require_value("--host");
      if (!value.empty()) {
        result.config.host = value;
      }
    } else if (arg == "--http") {
      result.config.use_https = false;
    } else if (arg == "--https") {
      result.config.use_https = true;
    } else if (arg == "--port") {
      auto value = require_value("--port");
      if (!value.empty()) {
        int port = ParsePort(value, result.errors);
        if (port > 0) {
          result.config.port = port;
        }
      }
    } else if (arg == "--cert") {
      auto value = require_value("--cert");
      if (!value.empty()) {
        result.config.cert_path = value;
      }
    } else if (arg == "--auth-token") {
      auto value = require_value("--auth-token");
      if (!value.empty()) {
        result.config.auth_token = value;
      }
    } else if (arg == "--key") {
      auto value = require_value("--key");
      if (!value.empty()) {
        result.config.key_path = value;
      }
    } else if (arg == "--ice") {
      auto value = require_value("--ice");
      if (!value.empty()) {
        result.config.ice_servers.push_back(value);
      }
    } else if (arg == "--turn-secret") {
      auto value = require_value("--turn-secret");
      result.config.turn_secret = value;
    } else if (arg == "--turn-user") {
      auto value = require_value("--turn-user");
      result.config.turn_user = value;
    } else if (arg == "--turn-ttl") {
      auto value = require_value("--turn-ttl");
      if (!value.empty()) {
        const int ttl = ParseNonNegativeInt(value, "turn ttl", result.errors);
        if (ttl >= 0) {
          result.config.turn_ttl_seconds = ttl;
        }
      }
    } else if (arg == "--snapshot-keyframe-interval") {
      auto value = require_value("--snapshot-keyframe-interval");
      if (!value.empty()) {
        const int interval = ParseNonNegativeInt(value, "snapshot keyframe interval",
                                                 result.errors);
        if (interval >= 0) {
          result.config.snapshot_keyframe_interval = interval;
        }
      }
    } else if (arg == "--map-seed") {
      auto value = require_value("--map-seed");
      if (!value.empty()) {
        bool ok = false;
        const uint32_t parsed = ParseUnsigned32(value, "map seed", result.errors, ok);
        if (ok) {
          result.config.map_seed = parsed;
        }
      }
    } else if (arg == "--character-manifest") {
      auto value = require_value("--character-manifest");
      if (!value.empty()) {
        result.config.character_manifest_path = value;
      }
    } else {
      result.errors.push_back("Unknown argument: " + arg);
    }
  }

  return result;
}

std::vector<std::string> ValidateConfig(const ServerConfig &config) {
  std::vector<std::string> errors;
  if (config.use_https) {
    if (config.cert_path.empty()) {
      errors.push_back("Missing --cert path");
    }
    if (config.key_path.empty()) {
      errors.push_back("Missing --key path");
    }
  }
  if (config.auth_token.empty()) {
    errors.push_back("Missing --auth-token value");
  }
  if (config.snapshot_keyframe_interval < 0) {
    errors.push_back("Snapshot keyframe interval must be >= 0");
  }
  if (!config.turn_secret.empty() && config.turn_ttl_seconds <= 0) {
    errors.push_back("TURN TTL must be > 0 when --turn-secret is set");
  }
  return errors;
}
