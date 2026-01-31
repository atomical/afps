#include "doctest.h"

#include "health.h"

TEST_CASE("BuildHealthJson formats payload") {
  HealthStatus status;
  status.status = "ok";
  status.build = "dev";
  status.utc_timestamp = "2026-01-31T00:00:00Z";
  status.https = true;

  const auto json = BuildHealthJson(status);

  CHECK(json == "{\"status\":\"ok\",\"build\":\"dev\",\"utc\":\"2026-01-31T00:00:00Z\",\"https\":true}");
}

TEST_CASE("BuildHealthJson escapes strings") {
  HealthStatus status;
  status.status = "ok\"";
  status.build = "dev";
  status.utc_timestamp = "2026-01-31T00:00:00Z";
  status.https = false;

  const auto json = BuildHealthJson(status);

  CHECK(json == "{\"status\":\"ok\\\"\",\"build\":\"dev\",\"utc\":\"2026-01-31T00:00:00Z\",\"https\":false}");
}
