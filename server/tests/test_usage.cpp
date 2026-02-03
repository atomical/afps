#include "doctest.h"

#include "usage.h"

TEST_CASE("UsageText includes required flags") {
  const auto usage = UsageText("server");

  CHECK(usage.find("--cert") != std::string::npos);
  CHECK(usage.find("--key") != std::string::npos);
  CHECK(usage.find("--host") != std::string::npos);
  CHECK(usage.find("--port") != std::string::npos);
  CHECK(usage.find("--ice") != std::string::npos);
  CHECK(usage.find("--turn-secret") != std::string::npos);
  CHECK(usage.find("--turn-ttl") != std::string::npos);
  CHECK(usage.find("--auth-token") != std::string::npos);
}
