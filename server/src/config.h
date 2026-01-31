#pragma once

#include <string>
#include <vector>

struct ServerConfig {
  std::string host = "0.0.0.0";
  int port = 8443;
  std::string cert_path;
  std::string key_path;
  std::string auth_token;
  std::vector<std::string> ice_servers;
  bool show_help = false;
};

struct ParseResult {
  ServerConfig config;
  std::vector<std::string> errors;
};

ParseResult ParseArgs(int argc, const char *const *argv);
std::vector<std::string> ValidateConfig(const ServerConfig &config);
