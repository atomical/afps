#include "doctest.h"

#include "protocol.h"

#include <flatbuffers/flatbuffers.h>

#include "afps_protocol_generated.h"

namespace {
std::vector<uint8_t> BuildClientHelloMessage(const std::string &session, const std::string &connection) {
  flatbuffers::FlatBufferBuilder builder(256);
  const auto session_token = builder.CreateString(session);
  const auto connection_id = builder.CreateString(connection);
  const auto build = builder.CreateString("dev");
  const auto nickname = builder.CreateString("Ada");
  const auto character_id = builder.CreateString("casual-a");
  const auto offset = afps::protocol::CreateClientHello(
      builder, kProtocolVersion, session_token, connection_id, build, nickname, character_id);
  builder.Finish(offset);
  return EncodeEnvelope(MessageType::ClientHello, builder.GetBufferPointer(), builder.GetSize(), 1, 0);
}
}  // namespace

TEST_CASE("ParseClientHelloPayload reads required fields") {
  const auto message = BuildClientHelloMessage("sess", "conn");
  DecodedEnvelope envelope;
  std::string error;
  REQUIRE(DecodeEnvelope(message, envelope, error));

  ClientHello hello;
  CHECK(ParseClientHelloPayload(envelope.payload, hello, error));
  CHECK(error.empty());
  CHECK(hello.protocol_version == kProtocolVersion);
  CHECK(hello.session_token == "sess");
  CHECK(hello.connection_id == "conn");
  CHECK(hello.build == "dev");
  CHECK(hello.nickname == "Ada");
  CHECK(hello.character_id == "casual-a");
}

TEST_CASE("DecodeEnvelope rejects invalid headers") {
  std::vector<uint8_t> message(kProtocolHeaderBytes, 0);
  DecodedEnvelope envelope;
  std::string error;
  CHECK_FALSE(DecodeEnvelope(message, envelope, error));
  CHECK(!error.empty());

  message = EncodeEnvelope(MessageType::ClientHello, nullptr, 0, 1, 0);
  message[0] = 0;
  error.clear();
  CHECK_FALSE(DecodeEnvelope(message, envelope, error));
  CHECK(error == "invalid_magic");
}

TEST_CASE("BuildServerHello emits expected fields") {
  ServerHello hello;
  hello.protocol_version = kProtocolVersion;
  hello.connection_id = "conn";
  hello.client_id = "client";
  hello.server_tick_rate = 60;
  hello.snapshot_rate = 20;
  hello.snapshot_keyframe_interval = 5;
  hello.motd = "hi";
  hello.connection_nonce = "nonce";

  const auto payload = BuildServerHello(hello, 7, 3);
  DecodedEnvelope envelope;
  std::string error;
  REQUIRE(DecodeEnvelope(payload, envelope, error));
  CHECK(envelope.header.msg_type == MessageType::ServerHello);
  CHECK(envelope.header.msg_seq == 7);
  CHECK(envelope.header.server_seq_ack == 3);

  flatbuffers::Verifier verifier(envelope.payload.data(), envelope.payload.size());
  const auto *parsed = flatbuffers::GetRoot<afps::protocol::ServerHello>(envelope.payload.data());
  CHECK(parsed->Verify(verifier));
  CHECK(parsed->protocol_version() == kProtocolVersion);
  CHECK(parsed->connection_id()->str() == "conn");
  CHECK(parsed->client_id()->str() == "client");
  CHECK(parsed->server_tick_rate() == 60);
  CHECK(parsed->snapshot_rate() == 20);
  CHECK(parsed->snapshot_keyframe_interval() == 5);
  CHECK(parsed->motd()->str() == "hi");
  CHECK(parsed->connection_nonce()->str() == "nonce");
}

TEST_CASE("BuildProtocolError emits code and message") {
  const auto payload = BuildProtocolError("protocol_mismatch", "bad version", 9, 2);
  DecodedEnvelope envelope;
  std::string error;
  REQUIRE(DecodeEnvelope(payload, envelope, error));
  CHECK(envelope.header.msg_type == MessageType::Error);
  CHECK(envelope.header.msg_seq == 9);

  flatbuffers::Verifier verifier(envelope.payload.data(), envelope.payload.size());
  const auto *parsed = flatbuffers::GetRoot<afps::protocol::Error>(envelope.payload.data());
  CHECK(parsed->Verify(verifier));
  CHECK(parsed->code()->str() == "protocol_mismatch");
  CHECK(parsed->message()->str() == "bad version");
}

TEST_CASE("ParsePingPayload reads client time") {
  flatbuffers::FlatBufferBuilder builder(32);
  const auto offset = afps::protocol::CreatePing(builder, 123.5);
  builder.Finish(offset);
  const std::vector<uint8_t> payload(builder.GetBufferPointer(),
                                     builder.GetBufferPointer() + builder.GetSize());
  Ping ping;
  std::string error;
  CHECK(ParsePingPayload(payload, ping, error));
  CHECK(ping.client_time_ms == doctest::Approx(123.5));
}

TEST_CASE("BuildPong echoes client time") {
  Pong pong;
  pong.client_time_ms = 55.25;

  const auto payload = BuildPong(pong, 4, 1);
  DecodedEnvelope envelope;
  std::string error;
  REQUIRE(DecodeEnvelope(payload, envelope, error));
  CHECK(envelope.header.msg_type == MessageType::Pong);

  flatbuffers::Verifier verifier(envelope.payload.data(), envelope.payload.size());
  const auto *parsed = flatbuffers::GetRoot<afps::protocol::Pong>(envelope.payload.data());
  CHECK(parsed->Verify(verifier));
  CHECK(parsed->client_time_ms() == doctest::Approx(55.25));
}

TEST_CASE("BuildGameEventBatch emits projectile spawn fields") {
  GameEventBatch batch;
  batch.server_tick = 77;
  ProjectileSpawnFx spawn;
  spawn.shooter_id = "owner-1";
  spawn.weapon_slot = 1;
  spawn.shot_seq = 7;
  spawn.projectile_id = 9;
  spawn.pos_x_q = 101;
  spawn.pos_y_q = -202;
  spawn.pos_z_q = 303;
  spawn.vel_x_q = 404;
  spawn.vel_y_q = -505;
  spawn.vel_z_q = 606;
  spawn.ttl_q = 707;
  batch.events.push_back(spawn);

  const auto payload = BuildGameEventBatch(batch, 3, 1);
  DecodedEnvelope envelope;
  std::string error;
  REQUIRE(DecodeEnvelope(payload, envelope, error));
  CHECK(envelope.header.msg_type == MessageType::GameEvent);

  flatbuffers::Verifier verifier(envelope.payload.data(), envelope.payload.size());
  const auto *parsed = flatbuffers::GetRoot<afps::protocol::GameEvent>(envelope.payload.data());
  CHECK(parsed->Verify(verifier));
  CHECK(parsed->server_tick() == 77);
  REQUIRE(parsed->events_type());
  REQUIRE(parsed->events());
  REQUIRE(parsed->events_type()->size() == 1);
  REQUIRE(parsed->events()->size() == 1);
  CHECK(parsed->events_type()->Get(0) == afps::protocol::FxEvent::ProjectileSpawnFx);
  const auto *payload_spawn = parsed->events()->GetAs<afps::protocol::ProjectileSpawnFx>(0);
  REQUIRE(payload_spawn);
  CHECK(payload_spawn->shooter_id()->str() == "owner-1");
  CHECK(payload_spawn->weapon_slot() == 1);
  CHECK(payload_spawn->shot_seq() == 7);
  CHECK(payload_spawn->projectile_id() == 9);
  CHECK(payload_spawn->pos_x_q() == 101);
  CHECK(payload_spawn->pos_y_q() == -202);
  CHECK(payload_spawn->pos_z_q() == 303);
  CHECK(payload_spawn->vel_x_q() == 404);
  CHECK(payload_spawn->vel_y_q() == -505);
  CHECK(payload_spawn->vel_z_q() == 606);
  CHECK(payload_spawn->ttl_q() == 707);
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
  snapshot.weapon_slot = 1;
  snapshot.ammo_in_mag = 24;
  snapshot.dash_cooldown = 0.4;
  snapshot.health = 75.0;
  snapshot.kills = 2;
  snapshot.deaths = 1;
  snapshot.view_yaw_q = 1234;
  snapshot.view_pitch_q = -2345;
  snapshot.player_flags = 0x2;
  snapshot.weapon_heat_q = 3456;
  snapshot.loadout_bits = 0xDEADBEEFu;

  const auto payload = BuildStateSnapshot(snapshot, 5, 2);
  DecodedEnvelope envelope;
  std::string error;
  REQUIRE(DecodeEnvelope(payload, envelope, error));
  CHECK(envelope.header.msg_type == MessageType::StateSnapshot);

  flatbuffers::Verifier verifier(envelope.payload.data(), envelope.payload.size());
  const auto *parsed = flatbuffers::GetRoot<afps::protocol::StateSnapshot>(envelope.payload.data());
  CHECK(parsed->Verify(verifier));
  CHECK(parsed->server_tick() == 42);
  CHECK(parsed->last_processed_input_seq() == 7);
  CHECK(parsed->client_id()->str() == "client-1");
  CHECK(parsed->pos_x() == doctest::Approx(1.5));
  CHECK(parsed->pos_y() == doctest::Approx(-2.0));
  CHECK(parsed->pos_z() == doctest::Approx(3.25));
  CHECK(parsed->vel_x() == doctest::Approx(0.75));
  CHECK(parsed->vel_y() == doctest::Approx(-1.25));
  CHECK(parsed->vel_z() == doctest::Approx(0.5));
  CHECK(parsed->ammo_in_mag() == 24);
  CHECK(parsed->dash_cooldown() == doctest::Approx(0.4));
  CHECK(parsed->health() == doctest::Approx(75.0));
  CHECK(parsed->kills() == 2);
  CHECK(parsed->deaths() == 1);
  CHECK(parsed->view_yaw_q() == 1234);
  CHECK(parsed->view_pitch_q() == -2345);
  CHECK(parsed->player_flags() == 0x2);
  CHECK(parsed->weapon_heat_q() == 3456);
  CHECK(parsed->loadout_bits() == 0xDEADBEEFu);
}

TEST_CASE("BuildStateSnapshotDelta emits expected fields") {
  StateSnapshotDelta delta;
  delta.server_tick = 45;
  delta.base_tick = 40;
  delta.last_processed_input_seq = 9;
  delta.client_id = "client-1";
  delta.mask = kSnapshotMaskPosX | kSnapshotMaskVelY | kSnapshotMaskAmmoInMag | kSnapshotMaskDashCooldown |
               kSnapshotMaskHealth | kSnapshotMaskKills | kSnapshotMaskDeaths;
  delta.pos_x = 1.75;
  delta.vel_y = -0.5;
  delta.ammo_in_mag = 15;
  delta.dash_cooldown = 0.25;
  delta.health = 50.0;
  delta.kills = 3;
  delta.deaths = 2;

  const auto payload = BuildStateSnapshotDelta(delta, 6, 3);
  DecodedEnvelope envelope;
  std::string error;
  REQUIRE(DecodeEnvelope(payload, envelope, error));
  CHECK(envelope.header.msg_type == MessageType::StateSnapshotDelta);

  flatbuffers::Verifier verifier(envelope.payload.data(), envelope.payload.size());
  const auto *parsed = flatbuffers::GetRoot<afps::protocol::StateSnapshotDelta>(envelope.payload.data());
  CHECK(parsed->Verify(verifier));
  CHECK(parsed->server_tick() == 45);
  CHECK(parsed->base_tick() == 40);
  CHECK(parsed->last_processed_input_seq() == 9);
  CHECK(parsed->mask() == delta.mask);
  CHECK(parsed->client_id()->str() == "client-1");
  CHECK(parsed->pos_x() == doctest::Approx(1.75));
  CHECK(parsed->vel_y() == doctest::Approx(-0.5));
  CHECK(parsed->ammo_in_mag() == 15);
  CHECK(parsed->dash_cooldown() == doctest::Approx(0.25));
  CHECK(parsed->health() == doctest::Approx(50.0));
  CHECK(parsed->kills() == 3);
  CHECK(parsed->deaths() == 2);
}

TEST_CASE("BuildPlayerProfile emits expected fields") {
  PlayerProfile profile;
  profile.client_id = "client-3";
  profile.nickname = "Ada";
  profile.character_id = "casual-a";

  const auto payload = BuildPlayerProfile(profile, 11, 5);
  DecodedEnvelope envelope;
  std::string error;
  REQUIRE(DecodeEnvelope(payload, envelope, error));
  CHECK(envelope.header.msg_type == MessageType::PlayerProfile);

  flatbuffers::Verifier verifier(envelope.payload.data(), envelope.payload.size());
  const auto *parsed = flatbuffers::GetRoot<afps::protocol::PlayerProfile>(envelope.payload.data());
  CHECK(parsed->Verify(verifier));
  CHECK(parsed->client_id()->str() == "client-3");
  CHECK(parsed->nickname()->str() == "Ada");
  CHECK(parsed->character_id()->str() == "casual-a");
}
