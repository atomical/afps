#pragma once

#include <mutex>
#include <string>
#include <unordered_map>

class RateLimiter {
public:
  RateLimiter(double max_tokens, double refill_per_second);
  bool Allow(const std::string &key, double now_seconds);
  bool AllowNow(const std::string &key);

private:
  struct Bucket {
    double tokens = 0.0;
    double last = 0.0;
    bool initialized = false;
  };

  double max_tokens_;
  double refill_per_second_;
  std::unordered_map<std::string, Bucket> buckets_;
  std::mutex mutex_;

  static double NowSeconds();
};
