#include "doctest.h"

#include "security_headers.h"

TEST_CASE("BuildSecurityHeaders includes HSTS") {
  const auto headers = BuildSecurityHeaders();
  auto it = headers.find("Strict-Transport-Security");
  CHECK(it != headers.end());
  CHECK(it->second == "max-age=31536000; includeSubDomains");
}
