#include "auth.h"

#include <string>

AuthResult ValidateBearerAuth(const std::string &header, const std::string &expected_token) {
  if (expected_token.empty()) {
    return {true, "", ""};
  }

  if (header.empty()) {
    return {false, "missing_auth", "Missing Authorization header"};
  }

  constexpr const char *kBearerPrefix = "Bearer ";
  if (header.rfind(kBearerPrefix, 0) != 0) {
    return {false, "invalid_auth_scheme", "Authorization must use Bearer scheme"};
  }

  const std::string token = header.substr(std::string(kBearerPrefix).size());
  if (token.empty()) {
    return {false, "missing_token", "Authorization header missing token"};
  }

  if (token != expected_token) {
    return {false, "invalid_token", "Authorization token mismatch"};
  }

  return {true, "", ""};
}
