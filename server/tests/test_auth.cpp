#include "doctest.h"

#include "auth.h"

TEST_CASE("ValidateBearerAuth accepts matching token") {
  const auto result = ValidateBearerAuth("Bearer secret", "secret");

  CHECK(result.ok);
  CHECK(result.code.empty());
}

TEST_CASE("ValidateBearerAuth rejects missing header") {
  const auto result = ValidateBearerAuth("", "secret");

  CHECK(result.ok == false);
  CHECK(result.code == "missing_auth");
}

TEST_CASE("ValidateBearerAuth rejects invalid scheme") {
  const auto result = ValidateBearerAuth("Token secret", "secret");

  CHECK(result.ok == false);
  CHECK(result.code == "invalid_auth_scheme");
}

TEST_CASE("ValidateBearerAuth rejects empty bearer token") {
  const auto result = ValidateBearerAuth("Bearer ", "secret");

  CHECK(result.ok == false);
  CHECK(result.code == "missing_token");
}

TEST_CASE("ValidateBearerAuth rejects mismatched token") {
  const auto result = ValidateBearerAuth("Bearer wrong", "secret");

  CHECK(result.ok == false);
  CHECK(result.code == "invalid_token");
}

TEST_CASE("ValidateBearerAuth allows when token not required") {
  const auto result = ValidateBearerAuth("", "");

  CHECK(result.ok);
}
