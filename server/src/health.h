#pragma once

#include <string>

struct HealthStatus {
  std::string status;
  std::string build;
  std::string utc_timestamp;
  bool https = true;
};

std::string BuildHealthJson(const HealthStatus &status);
std::string NowUtcTimestamp();
