#include "doctest.h"

#include "rate_limiter.h"

TEST_CASE("RateLimiter enforces burst and refill") {
  RateLimiter limiter(2.0, 1.0);

  CHECK(limiter.Allow("ip", 0.0));
  CHECK(limiter.Allow("ip", 0.0));
  CHECK_FALSE(limiter.Allow("ip", 0.0));
  CHECK_FALSE(limiter.Allow("ip", 0.5));
  CHECK(limiter.Allow("ip", 1.0));
}

TEST_CASE("RateLimiter isolates buckets by key") {
  RateLimiter limiter(1.0, 0.0);

  CHECK(limiter.Allow("ip-a", 0.0));
  CHECK_FALSE(limiter.Allow("ip-a", 0.0));
  CHECK(limiter.Allow("ip-b", 0.0));
}
