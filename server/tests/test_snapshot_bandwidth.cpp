#include "doctest.h"

#include <fstream>
#include <nlohmann/json.hpp>

#include "protocol.h"

TEST_CASE("Snapshot bandwidth stays within budget") {
  std::ifstream file("../../client/perf/budgets.json");
  REQUIRE(file.is_open());
  nlohmann::json payload;
  file >> payload;

  REQUIRE(payload.contains("snapshotBandwidth"));
  const double max_kbps = payload.at("snapshotBandwidth").at("maxKbps").get<double>();
  REQUIRE(max_kbps > 0.0);

  StateSnapshot snapshot;
  snapshot.server_tick = 120;
  snapshot.last_processed_input_seq = 118;
  snapshot.client_id = "player";
  snapshot.pos_x = 10.0;
  snapshot.pos_y = -2.5;
  snapshot.pos_z = 0.5;
  snapshot.vel_x = 2.0;
  snapshot.vel_y = 0.0;
  snapshot.vel_z = 0.0;
  snapshot.weapon_slot = 1;
  snapshot.dash_cooldown = 0.2;
  snapshot.health = 85.0;
  snapshot.kills = 2;
  snapshot.deaths = 1;

  StateSnapshotDelta delta;
  delta.server_tick = 121;
  delta.base_tick = 120;
  delta.last_processed_input_seq = 118;
  delta.mask = kSnapshotMaskAll;
  delta.client_id = "player";
  delta.pos_x = 10.1;
  delta.pos_y = -2.4;
  delta.pos_z = 0.6;
  delta.vel_x = 2.1;
  delta.vel_y = 0.1;
  delta.vel_z = 0.0;
  delta.weapon_slot = 1;
  delta.dash_cooldown = 0.1;
  delta.health = 85.0;
  delta.kills = 2;
  delta.deaths = 1;

  const size_t keyframe_bytes = BuildStateSnapshot(snapshot, 1, 0).size();
  const size_t delta_bytes = BuildStateSnapshotDelta(delta, 2, 0).size();
  const int interval = kSnapshotKeyframeInterval > 0 ? kSnapshotKeyframeInterval : 1;

  const double avg_bytes = (static_cast<double>(keyframe_bytes) +
                            static_cast<double>(interval - 1) * static_cast<double>(delta_bytes)) /
                           static_cast<double>(interval);
  const double kbps = (avg_bytes * static_cast<double>(kSnapshotRate) * 8.0) / 1000.0;

  CHECK(kbps <= max_kbps);
}
