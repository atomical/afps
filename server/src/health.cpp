#include "health.h"

#include <chrono>
#include <iomanip>
#include <sstream>

namespace {
std::string EscapeJson(const std::string &value) {
  std::ostringstream out;
  for (char c : value) {
    switch (c) {
      case '\\':
        out << "\\\\";
        break;
      case '"':
        out << "\\\"";
        break;
      case '\n':
        out << "\\n";
        break;
      case '\r':
        out << "\\r";
        break;
      case '\t':
        out << "\\t";
        break;
      default:
        out << c;
        break;
    }
  }
  return out.str();
}
}

std::string BuildHealthJson(const HealthStatus &status) {
  std::ostringstream out;
  out << "{";
  out << "\"status\":\"" << EscapeJson(status.status) << "\",";
  out << "\"build\":\"" << EscapeJson(status.build) << "\",";
  out << "\"utc\":\"" << EscapeJson(status.utc_timestamp) << "\",";
  out << "\"https\":" << (status.https ? "true" : "false");
  out << "}";
  return out.str();
}

std::string NowUtcTimestamp() {
  const auto now = std::chrono::system_clock::now();
  const auto time = std::chrono::system_clock::to_time_t(now);
  std::tm utc_tm{};
#if defined(_WIN32)
  gmtime_s(&utc_tm, &time);
#else
  gmtime_r(&time, &utc_tm);
#endif
  std::ostringstream out;
  out << std::put_time(&utc_tm, "%Y-%m-%dT%H:%M:%SZ");
  return out.str();
}
