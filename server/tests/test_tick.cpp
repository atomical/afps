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
