#include "doctest.h"

#include "protocol.h"

#include <nlohmann/json.hpp>

TEST_CASE("ParseClientHello reads required fields") {
  ClientHello hello;
  std::string error;
  const std::string payload =
      R"({"type":"ClientHello","protocolVersion":1,"sessionToken":"sess","connectionId":"conn","build":"dev"})";

  const bool ok = ParseClientHello(payload, hello, error);

  CHECK(ok);
  CHECK(error.empty());
  CHECK(hello.protocol_version == 1);
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
  hello.protocol_version = 1;
  hello.connection_id = "conn";
  hello.client_id = "client";
  hello.server_tick_rate = 60;
  hello.snapshot_rate = 20;
  hello.motd = "hi";
  hello.connection_nonce = "nonce";

  const auto payload = BuildServerHello(hello);
  const auto json = nlohmann::json::parse(payload);

  CHECK(json.at("type") == "ServerHello");
  CHECK(json.at("protocolVersion") == 1);
  CHECK(json.at("connectionId") == "conn");
  CHECK(json.at("clientId") == "client");
  CHECK(json.at("serverTickRate") == 60);
  CHECK(json.at("snapshotRate") == 20);
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

TEST_CASE("BuildStateSnapshot emits expected fields") {
  StateSnapshot snapshot;
  snapshot.server_tick = 42;
  snapshot.last_processed_input_seq = 7;
  snapshot.client_id = "client-1";
  snapshot.pos_x = 1.5;
  snapshot.pos_y = -2.0;

  const auto payload = BuildStateSnapshot(snapshot);
  const auto json = nlohmann::json::parse(payload);

  CHECK(json.at("type") == "StateSnapshot");
  CHECK(json.at("serverTick") == 42);
  CHECK(json.at("lastProcessedInputSeq") == 7);
  CHECK(json.at("clientId") == "client-1");
  CHECK(json.at("posX") == doctest::Approx(1.5));
  CHECK(json.at("posY") == doctest::Approx(-2.0));
}

TEST_CASE("ParseInputCmd reads input fields") {
  InputCmd cmd;
  std::string error;
  const std::string payload =
      R"({"type":"InputCmd","inputSeq":3,"moveX":1,"moveY":-1,"lookDeltaX":2.5,"lookDeltaY":-1.25,"jump":true,"fire":false,"sprint":true})";

  const bool ok = ParseInputCmd(payload, cmd, error);

  CHECK(ok);
  CHECK(error.empty());
  CHECK(cmd.input_seq == 3);
  CHECK(cmd.move_x == doctest::Approx(1.0));
  CHECK(cmd.move_y == doctest::Approx(-1.0));
  CHECK(cmd.look_delta_x == doctest::Approx(2.5));
  CHECK(cmd.look_delta_y == doctest::Approx(-1.25));
  CHECK(cmd.jump);
  CHECK_FALSE(cmd.fire);
  CHECK(cmd.sprint);
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
      R"({"type":"InputCmd","inputSeq":1,"moveX":2,"moveY":0,"lookDeltaX":0,"lookDeltaY":0,"jump":false,"fire":false,"sprint":false})",
      cmd, error));
  CHECK(error == "out_of_range: moveX");
}
