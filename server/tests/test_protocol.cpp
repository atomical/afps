#include "doctest.h"

#include "protocol.h"

#include <nlohmann/json.hpp>

TEST_CASE("ParseClientHello reads required fields") {
  ClientHello hello;
  std::string error;
  const std::string payload =
      R"({"type":"ClientHello","protocolVersion":2,"sessionToken":"sess","connectionId":"conn","build":"dev"})";

  const bool ok = ParseClientHello(payload, hello, error);

  CHECK(ok);
  CHECK(error.empty());
  CHECK(hello.protocol_version == 2);
  CHECK(hello.session_token == "sess");
  CHECK(hello.connection_id == "conn");
  CHECK(hello.build == "dev");
}

TEST_CASE("ParseClientHello rejects invalid payloads") {
  ClientHello hello;
  std::string error;

  CHECK_FALSE(ParseClientHello("[]", hello, error));
  CHECK(!error.empty());

  error.clear();
  CHECK_FALSE(ParseClientHello(R"({"type":"Other"})", hello, error));
  CHECK(error == "invalid_type");

  error.clear();
  CHECK_FALSE(ParseClientHello(R"({"protocolVersion":1,"sessionToken":"x"})", hello, error));
  CHECK(error == "missing_field: connectionId");
}

TEST_CASE("BuildServerHello emits expected fields") {
  ServerHello hello;
  hello.protocol_version = 2;
  hello.connection_id = "conn";
  hello.client_id = "client";
  hello.server_tick_rate = 60;
  hello.snapshot_rate = 20;
  hello.snapshot_keyframe_interval = 5;
  hello.motd = "hi";
  hello.connection_nonce = "nonce";

  const auto payload = BuildServerHello(hello);
  const auto json = nlohmann::json::parse(payload);

  CHECK(json.at("type") == "ServerHello");
  CHECK(json.at("protocolVersion") == 2);
  CHECK(json.at("connectionId") == "conn");
  CHECK(json.at("clientId") == "client");
  CHECK(json.at("serverTickRate") == 60);
  CHECK(json.at("snapshotRate") == 20);
  CHECK(json.at("snapshotKeyframeInterval") == 5);
  CHECK(json.at("motd") == "hi");
  CHECK(json.at("connectionNonce") == "nonce");
}

TEST_CASE("BuildProtocolError emits code and message") {
  const auto payload = BuildProtocolError("protocol_mismatch", "bad version");
  const auto json = nlohmann::json::parse(payload);

  CHECK(json.at("type") == "Error");
  CHECK(json.at("code") == "protocol_mismatch");
  CHECK(json.at("message") == "bad version");
}

TEST_CASE("ParsePing reads client time") {
  Ping ping;
  std::string error;
  const std::string payload = R"({"type":"Ping","clientTimeMs":123.5})";

  const bool ok = ParsePing(payload, ping, error);

  CHECK(ok);
  CHECK(error.empty());
  CHECK(ping.client_time_ms == doctest::Approx(123.5));
}

TEST_CASE("BuildPong echoes client time") {
  Pong pong;
  pong.client_time_ms = 55.25;

  const auto payload = BuildPong(pong);
  const auto json = nlohmann::json::parse(payload);

  CHECK(json.at("type") == "Pong");
  CHECK(json.at("clientTimeMs") == doctest::Approx(55.25));
}

TEST_CASE("BuildGameEvent emits expected fields") {
  GameEvent event;
  event.event = "HitConfirmed";
  event.target_id = "target-1";
  event.damage = 12.5;
  event.killed = true;

  const auto payload = BuildGameEvent(event);
  const auto json = nlohmann::json::parse(payload);

  CHECK(json.at("type") == "GameEvent");
  CHECK(json.at("event") == "HitConfirmed");
  CHECK(json.at("targetId") == "target-1");
  CHECK(json.at("damage") == doctest::Approx(12.5));
  CHECK(json.at("killed") == true);
}

TEST_CASE("BuildGameEvent emits projectile spawn fields") {
  GameEvent event;
  event.event = "ProjectileSpawn";
  event.owner_id = "owner-1";
  event.projectile_id = 9;
  event.pos_x = 1.0;
  event.pos_y = 2.0;
  event.pos_z = 3.0;
  event.vel_x = 4.0;
  event.vel_y = 5.0;
  event.vel_z = 6.0;
  event.ttl = 0.5;

  const auto payload = BuildGameEvent(event);
  const auto json = nlohmann::json::parse(payload);

  CHECK(json.at("type") == "GameEvent");
  CHECK(json.at("event") == "ProjectileSpawn");
  CHECK(json.at("ownerId") == "owner-1");
  CHECK(json.at("projectileId") == 9);
  CHECK(json.at("posX") == doctest::Approx(1.0));
  CHECK(json.at("posY") == doctest::Approx(2.0));
  CHECK(json.at("posZ") == doctest::Approx(3.0));
  CHECK(json.at("velX") == doctest::Approx(4.0));
  CHECK(json.at("velY") == doctest::Approx(5.0));
  CHECK(json.at("velZ") == doctest::Approx(6.0));
  CHECK(json.at("ttl") == doctest::Approx(0.5));
}

TEST_CASE("BuildGameEvent emits projectile remove fields") {
  GameEvent event;
  event.event = "ProjectileRemove";
  event.owner_id = "owner-2";
  event.projectile_id = 11;

  const auto payload = BuildGameEvent(event);
  const auto json = nlohmann::json::parse(payload);

  CHECK(json.at("type") == "GameEvent");
  CHECK(json.at("event") == "ProjectileRemove");
  CHECK(json.at("ownerId") == "owner-2");
  CHECK(json.at("projectileId") == 11);
}

TEST_CASE("BuildStateSnapshot emits expected fields") {
  StateSnapshot snapshot;
  snapshot.server_tick = 42;
  snapshot.last_processed_input_seq = 7;
  snapshot.client_id = "client-1";
  snapshot.pos_x = 1.5;
  snapshot.pos_y = -2.0;
  snapshot.pos_z = 3.25;
  snapshot.vel_x = 0.75;
  snapshot.vel_y = -1.25;
  snapshot.vel_z = 0.5;
  snapshot.dash_cooldown = 0.4;
  snapshot.health = 75.0;
  snapshot.kills = 2;
  snapshot.deaths = 1;

  const auto payload = BuildStateSnapshot(snapshot);
  const auto json = nlohmann::json::parse(payload);

  CHECK(json.at("type") == "StateSnapshot");
  CHECK(json.at("serverTick") == 42);
  CHECK(json.at("lastProcessedInputSeq") == 7);
  CHECK(json.at("clientId") == "client-1");
  CHECK(json.at("posX") == doctest::Approx(1.5));
  CHECK(json.at("posY") == doctest::Approx(-2.0));
  CHECK(json.at("posZ") == doctest::Approx(3.25));
  CHECK(json.at("velX") == doctest::Approx(0.75));
  CHECK(json.at("velY") == doctest::Approx(-1.25));
  CHECK(json.at("velZ") == doctest::Approx(0.5));
  CHECK(json.at("dashCooldown") == doctest::Approx(0.4));
  CHECK(json.at("health") == doctest::Approx(75.0));
  CHECK(json.at("kills") == 2);
  CHECK(json.at("deaths") == 1);
}

TEST_CASE("BuildStateSnapshotDelta emits expected fields") {
  StateSnapshotDelta delta;
  delta.server_tick = 45;
  delta.base_tick = 40;
  delta.last_processed_input_seq = 9;
  delta.client_id = "client-1";
  delta.mask = kSnapshotMaskPosX | kSnapshotMaskVelY | kSnapshotMaskDashCooldown |
               kSnapshotMaskHealth | kSnapshotMaskKills | kSnapshotMaskDeaths;
  delta.pos_x = 1.75;
  delta.vel_y = -0.5;
  delta.dash_cooldown = 0.25;
  delta.health = 50.0;
  delta.kills = 3;
  delta.deaths = 2;

  const auto payload = BuildStateSnapshotDelta(delta);
  const auto json = nlohmann::json::parse(payload);

  CHECK(json.at("type") == "StateSnapshotDelta");
  CHECK(json.at("serverTick") == 45);
  CHECK(json.at("baseTick") == 40);
  CHECK(json.at("lastProcessedInputSeq") == 9);
  CHECK(json.at("mask") == delta.mask);
  CHECK(json.at("clientId") == "client-1");
  CHECK(json.at("posX") == doctest::Approx(1.75));
  CHECK(json.at("velY") == doctest::Approx(-0.5));
  CHECK(json.at("dashCooldown") == doctest::Approx(0.25));
  CHECK(json.at("health") == doctest::Approx(50.0));
  CHECK(json.at("kills") == 3);
  CHECK(json.at("deaths") == 2);
  CHECK_FALSE(json.contains("posY"));
  CHECK_FALSE(json.contains("posZ"));
  CHECK_FALSE(json.contains("velX"));
  CHECK_FALSE(json.contains("velZ"));
}

TEST_CASE("ParseInputCmd reads input fields") {
  InputCmd cmd;
  std::string error;
  const std::string payload =
      R"({"type":"InputCmd","inputSeq":3,"moveX":1,"moveY":-1,"lookDeltaX":2.5,"lookDeltaY":-1.25,"viewYaw":0.75,"viewPitch":-0.5,"weaponSlot":1,"jump":true,"fire":false,"sprint":true,"dash":true})";

  const bool ok = ParseInputCmd(payload, cmd, error);

  CHECK(ok);
  CHECK(error.empty());
  CHECK(cmd.input_seq == 3);
  CHECK(cmd.move_x == doctest::Approx(1.0));
  CHECK(cmd.move_y == doctest::Approx(-1.0));
  CHECK(cmd.look_delta_x == doctest::Approx(2.5));
  CHECK(cmd.look_delta_y == doctest::Approx(-1.25));
  CHECK(cmd.view_yaw == doctest::Approx(0.75));
  CHECK(cmd.view_pitch == doctest::Approx(-0.5));
  CHECK(cmd.weapon_slot == 1);
  CHECK(cmd.jump);
  CHECK_FALSE(cmd.fire);
  CHECK(cmd.sprint);
  CHECK(cmd.dash);
}

TEST_CASE("ParseInputCmd rejects invalid payloads") {
  InputCmd cmd;
  std::string error;

  CHECK_FALSE(ParseInputCmd("{}", cmd, error));
  CHECK(error == "invalid_type");

  error.clear();
  CHECK_FALSE(ParseInputCmd(R"({"type":"InputCmd","inputSeq":-1})", cmd, error));
  CHECK(error == "invalid_field: inputSeq");

  error.clear();
  CHECK_FALSE(ParseInputCmd(
      R"({"type":"InputCmd","inputSeq":1,"moveX":0,"moveY":0,"lookDeltaX":0,"lookDeltaY":0,"viewYaw":0,"viewPitch":0,"weaponSlot":-2,"jump":false,"fire":false,"sprint":false,"dash":false})",
      cmd, error));
  CHECK(error == "invalid_field: weaponSlot");

  error.clear();
  CHECK_FALSE(ParseInputCmd(
      R"({"type":"InputCmd","inputSeq":1,"moveX":2,"moveY":0,"lookDeltaX":0,"lookDeltaY":0,"jump":false,"fire":false,"sprint":false})",
      cmd, error));
  CHECK(error == "out_of_range: moveX");
}
