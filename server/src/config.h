#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "protocol.h"

struct ServerConfig {
  std::string host = "0.0.0.0";
  int port = 8443;
  std::string cert_path;
  std::string key_path;
  std::string auth_token;
  std::vector<std::string> ice_servers;
  std::string turn_secret;
  std::string turn_user = "afps";
  int turn_ttl_seconds = 3600;
  int snapshot_keyframe_interval = kSnapshotKeyframeInterval;
  uint32_t map_seed = 0;
  std::string character_manifest_path;
  bool use_https = true;
  bool show_help = false;
};

struct ParseResult {
  ServerConfig config;
  std::vector<std::string> errors;
};

ParseResult ParseArgs(int argc, const char *const *argv);
std::vector<std::string> ValidateConfig(const ServerConfig &config);
