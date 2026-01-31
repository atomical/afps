#pragma once

#include <string>

struct AuthResult {
  bool ok = false;
  std::string code;
  std::string message;
};

AuthResult ValidateBearerAuth(const std::string &header, const std::string &expected_token);
