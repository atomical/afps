#include "doctest.h"
#include "tick.h"

TEST_CASE("TickAccumulator advances deterministically") {
  using Clock = TickAccumulator::Clock;
  TickAccumulator accumulator(10);

  const auto t0 = Clock::time_point{};
  CHECK(accumulator.initialized() == false);
  CHECK(accumulator.Advance(t0) == 0);
  CHECK(accumulator.initialized() == true);
  CHECK(accumulator.next_tick_time() == t0 + accumulator.tick_duration());

  CHECK(accumulator.Advance(t0 + accumulator.tick_duration() / 2) == 0);
  CHECK(accumulator.Advance(t0 + accumulator.tick_duration()) == 1);
  CHECK(accumulator.Advance(t0 + accumulator.tick_duration() * 3) == 2);
  CHECK(accumulator.Advance(t0 + accumulator.tick_duration() * 6
                             + accumulator.tick_duration() / 2) == 3);
}

TEST_CASE("TickAccumulator clamps invalid tick rate") {
  TickAccumulator accumulator(0);
  CHECK(accumulator.tick_rate() == 1);
  CHECK(accumulator.tick_duration().count() > 0);
}

#ifdef AFPS_ENABLE_WEBRTC
TEST_CASE("mesh_only backend rejects building AABB fallback") {
  afps::server::WorldHitFallbackPolicyInput input;
  input.backend_mode = afps::server::WorldHitBackendMode::MeshOnly;
  input.aabb_hit = true;
  input.aabb_collider_id = 42;
  input.mesh_hit = false;
  CHECK_FALSE(afps::server::WorldHitAllowsAabbFallback(input));
}

TEST_CASE("mesh_only backend still permits non-building fallback") {
  afps::server::WorldHitFallbackPolicyInput input;
  input.backend_mode = afps::server::WorldHitBackendMode::MeshOnly;
  input.aabb_hit = true;
  input.aabb_collider_id = -1;
  input.mesh_hit = false;
  CHECK(afps::server::WorldHitAllowsAabbFallback(input));
}
#endif
