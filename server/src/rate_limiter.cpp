#include "rate_limiter.h"

#include <algorithm>
#include <chrono>

RateLimiter::RateLimiter(double max_tokens, double refill_per_second)
    : max_tokens_(max_tokens), refill_per_second_(refill_per_second) {}

bool RateLimiter::Allow(const std::string &key, double now_seconds) {
  std::scoped_lock lock(mutex_);
  auto &bucket = buckets_[key];
  if (!bucket.initialized) {
    bucket.tokens = max_tokens_;
    bucket.last = now_seconds;
    bucket.initialized = true;
  }

  const double elapsed = now_seconds - bucket.last;
  if (elapsed > 0.0) {
    bucket.tokens = std::min(max_tokens_, bucket.tokens + elapsed * refill_per_second_);
    bucket.last = now_seconds;
  }

  if (bucket.tokens >= 1.0) {
    bucket.tokens -= 1.0;
    return true;
  }

  return false;
}

bool RateLimiter::AllowNow(const std::string &key) {
  return Allow(key, NowSeconds());
}

double RateLimiter::NowSeconds() {
  const auto now = std::chrono::steady_clock::now().time_since_epoch();
  return std::chrono::duration_cast<std::chrono::duration<double>>(now).count();
}
