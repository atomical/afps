#include "doctest.h"

#include <rapidcheck.h>

#include "sim/sim.h"

TEST_CASE("ClampAxis clamps arbitrary inputs") {
  rc::check("ClampAxis stays within [-1,1] and finite", []() {
    const double value = *rc::gen::arbitrary<double>();
    const double result = afps::sim::ClampAxis(value);
    RC_ASSERT(result >= -1.0);
    RC_ASSERT(result <= 1.0);
    RC_ASSERT(std::isfinite(result));
  });
}
